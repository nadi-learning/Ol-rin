/**
 * probe_auth_whitelist — S1 exit gate.
 *
 * Exercises the b2c side of login (resolveMembership) end-to-end against the
 * real DB + real RLS. The Google OAuth round-trip itself can't run headlessly
 * (needs a browser + a real Google account) — that's a MANUAL browser smoke
 * (see build-state). This probe covers everything downstream of "we have an
 * authenticated email + a board":
 *   1. DB connectivity as the app role.
 *   2. Whitelisted email → app_user + membership created, correct role.
 *   3. M11: membership did NOT exist before the call and DOES after — the real
 *      enablement path wrote it (no seeded shortcut).
 *   4. Re-login is idempotent (still exactly one membership).
 *   5. Non-whitelisted email → NotWhitelistedError, NO membership written.
 *   6. RLS: the membership created under board A is invisible under board B.
 *   7. HTTP: GET /trpc/me with no session → UNAUTHORIZED (soft — skipped if the
 *      server isn't running).
 *
 * Uses unique per-run emails/slugs so it never touches real data (M22), and
 * cleans up after itself.
 */
import { and, eq } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { appUser, board, membership, whitelist } from "@b2c/kernel/schema";
import { db, queryClient } from "../src/db/client";
import { withBoard } from "../src/db/with-board";
import { resolveMembership, NotWhitelistedError } from "../src/services/membership";
import { env } from "../src/config/env";

let passed = 0;
let failed = 0;
function check(name: string, ok: boolean) {
  if (ok) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.error(`  ✗ ${name}`);
  }
}

async function main() {
  const tag = `${Date.now()}`;
  const emailW = `probe-w-${tag}@example.com`; // whitelisted
  const emailX = `probe-x-${tag}@example.com`; // NOT whitelisted

  // 1. connectivity
  await db.execute(sql`select 1`);
  check("DB connectivity (select 1) as app role", true);

  // seed two boards (global) + whitelist emailW on board A only
  const [boardA] = await db
    .insert(board)
    .values({ slug: `probe-a-${tag}`, name: "Probe A" })
    .returning();
  const [boardB] = await db
    .insert(board)
    .values({ slug: `probe-b-${tag}`, name: "Probe B" })
    .returning();
  if (!boardA || !boardB) throw new Error("board seed failed");
  await withBoard(boardA.id, (tx) =>
    tx.insert(whitelist).values({ boardId: boardA.id, email: emailW, role: "student" }),
  );

  // 3 (pre): membership must NOT exist yet for emailW (M11 — no seeded shortcut)
  const before = await withBoard(boardA.id, (tx) =>
    tx
      .select()
      .from(membership)
      .innerJoin(appUser, eq(membership.userId, appUser.id))
      .where(and(eq(appUser.email, emailW), eq(membership.boardId, boardA.id))),
  );
  check("M11: no membership before resolveMembership", before.length === 0);

  // 2. whitelisted → app_user + membership created, correct role
  const resolved = await withBoard(boardA.id, (tx) =>
    resolveMembership(tx, { email: emailW, name: "Probe W", board: boardA }),
  );
  check("whitelisted: resolveMembership returns role 'student'", resolved.role === "student");
  check("whitelisted: app_user has the right email", resolved.user.email === emailW);

  // 3 (post): membership now exists, written by the real path
  const after = await withBoard(boardA.id, (tx) =>
    tx
      .select()
      .from(membership)
      .innerJoin(appUser, eq(membership.userId, appUser.id))
      .where(and(eq(appUser.email, emailW), eq(membership.boardId, boardA.id))),
  );
  check("M11: membership created by the real flow (1 row)", after.length === 1);

  // 4. re-login is idempotent → still exactly one membership
  await withBoard(boardA.id, (tx) =>
    resolveMembership(tx, { email: emailW, name: "Probe W", board: boardA }),
  );
  const afterReentry = await withBoard(boardA.id, (tx) =>
    tx
      .select()
      .from(membership)
      .innerJoin(appUser, eq(membership.userId, appUser.id))
      .where(and(eq(appUser.email, emailW), eq(membership.boardId, boardA.id))),
  );
  check("re-login idempotent: still exactly 1 membership", afterReentry.length === 1);

  // 5. non-whitelisted → NotWhitelistedError, no membership
  let notWhitelisted = false;
  try {
    await withBoard(boardA.id, (tx) =>
      resolveMembership(tx, { email: emailX, name: "Probe X", board: boardA }),
    );
  } catch (e) {
    notWhitelisted = e instanceof NotWhitelistedError;
  }
  check("non-whitelisted: NotWhitelistedError thrown", notWhitelisted);
  const xMembership = await withBoard(boardA.id, (tx) =>
    tx
      .select()
      .from(membership)
      .innerJoin(appUser, eq(membership.userId, appUser.id))
      .where(and(eq(appUser.email, emailX), eq(membership.boardId, boardA.id))),
  );
  check("non-whitelisted: no membership written", xMembership.length === 0);

  // 6. RLS: emailW's board-A membership is invisible under board B
  const underB = await withBoard(boardB.id, (tx) =>
    tx
      .select()
      .from(membership)
      .innerJoin(appUser, eq(membership.userId, appUser.id))
      .where(eq(appUser.email, emailW)),
  );
  check("RLS: board A membership invisible under board B claim", underB.length === 0);

  // 7. HTTP me with no session → UNAUTHORIZED (soft)
  try {
    const res = await fetch(`http://localhost:${env.PORT}/trpc/me?input=%7B%7D`, {
      headers: { "x-board": boardA.slug },
    });
    check(`HTTP me (no session) → 401 (got ${res.status})`, res.status === 401);
  } catch {
    console.log("  ~ HTTP me skipped (server not running)");
  }

  // cleanup (RLS-scoped rows withBoard; app_user + boards global)
  await withBoard(boardA.id, (tx) => tx.delete(membership).where(eq(membership.boardId, boardA.id)));
  await withBoard(boardA.id, (tx) => tx.delete(whitelist).where(eq(whitelist.boardId, boardA.id)));
  await db.delete(appUser).where(eq(appUser.email, emailW));
  await db.delete(appUser).where(eq(appUser.email, emailX));
  await db.delete(board).where(eq(board.id, boardA.id));
  await db.delete(board).where(eq(board.id, boardB.id));

  console.log(`\nprobe_auth_whitelist: ${passed} passed, ${failed} failed`);
  await queryClient.end();
  process.exit(failed === 0 ? 0 : 1);
}

main().catch(async (err) => {
  console.error("probe_auth_whitelist FAILED:", err);
  await queryClient.end();
  process.exit(1);
});
