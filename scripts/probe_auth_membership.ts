/**
 * probe_auth_membership — the auth exit gate (was probe_auth_whitelist, S1).
 *
 * Slice C (S110) DELETED the whitelist gate: the platform no longer gates
 * anyone. This probe's job inverted with it — it used to prove that strangers
 * are kept OUT; it now proves they are let in as students, and, far more
 * importantly, that letting them in did not cost anyone their role.
 *
 * Exercises the b2c side of login (resolveMembership) end-to-end against the
 * real DB + real RLS. The Google OAuth round-trip itself can't run headlessly
 * (needs a browser + a real Google account) — that's a MANUAL browser smoke
 * (see build-state). This probe covers everything downstream of "we have an
 * authenticated email + a board":
 *   1. DB connectivity as the app role.
 *   2. OPEN SIGNUP: a brand-new email nobody invited → app_user + membership
 *      at role 'student'.
 *   3. M11: membership did NOT exist before the call and DOES after — the real
 *      enablement path wrote it (no seeded shortcut).
 *   4. Re-login is idempotent (still exactly one membership).
 *   5. 🔴 NO-DOWNGRADE — the leg this whole probe exists for. See below.
 *   6. RLS: the membership created under board A is invisible under board B.
 *   7. grantRole: mints exactly one row at the asked role; a re-grant REPLACES
 *      rather than adding (the S109 single-role invariant); and requireMembership
 *      — the CHECK side — reads back what grantRole set.
 *   8. A CREDENTIAL (email/password) identity is now a student too: the old
 *      "Google is the only self-serve door" rule died with the gate. This leg
 *      is what would catch that rule being quietly reintroduced.
 *   9. Slice F (S113): the `whitelist` RELATION is gone from the database —
 *      the gate can no longer be rebuilt by writing a row.
 *  10. HTTP: GET /trpc/me with no session → UNAUTHORIZED (soft — skipped if the
 *      server isn't running). Authentication is still required; it is only
 *      AUTHORIZATION that opened up.
 *
 * 🔴 WHY LEG 5 IS THE POINT (M54's lesson, applied before the fact):
 * `resolveMembership` runs on EVERY login. If it ever upserts 'student' blindly
 * instead of reading the existing row first, every tutor, parent and admin is
 * silently demoted the next time they sign in. Nothing else in the suite would
 * notice — they would simply get the student surface, which looks like a
 * routing bug, not a data loss. The leg asserts the ROLE SURVIVES, not merely
 * that a row survives: asserting row-count alone would go green through exactly
 * this regression.
 *
 * Uses unique per-run emails/slugs so it never touches real data (M22), and
 * cleans up after itself.
 */
import { and, eq } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { accounts, appUser, board, membership, users } from "@b2c/kernel/schema";
import { db, queryClient } from "../src/db/client";
import { withBoard } from "../src/db/with-board";
import {
  resolveMembership,
  requireMembership,
  grantRole,
} from "../src/services/membership";
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
  const emailW = `probe-w-${tag}@example.com`; // a brand-new student, nobody invited
  const emailD = `probe-d-${tag}@example.com`; // the no-downgrade actor

  // 1. connectivity
  await db.execute(sql`select 1`);
  check("DB connectivity (select 1) as app role", true);

  // seed two boards (global). NOTHING is pre-authorised — that is the point.
  const [boardA] = await db
    .insert(board)
    .values({ slug: `probe-a-${tag}`, name: "Probe A" })
    .returning();
  const [boardB] = await db
    .insert(board)
    .values({ slug: `probe-b-${tag}`, name: "Probe B" })
    .returning();
  if (!boardA || !boardB) throw new Error("board seed failed");

  // 3 (pre): membership must NOT exist yet for emailW (M11 — no seeded shortcut)
  const before = await withBoard(boardA.id, (tx) =>
    tx
      .select()
      .from(membership)
      .innerJoin(appUser, eq(membership.userId, appUser.id))
      .where(and(eq(appUser.email, emailW), eq(membership.boardId, boardA.id))),
  );
  check("M11: no membership before resolveMembership", before.length === 0);

  // 2. OPEN SIGNUP: an uninvited email simply becomes a student.
  const resolved = await withBoard(boardA.id, (tx) =>
    resolveMembership(tx, { email: emailW, name: "Probe W", board: boardA }),
  );
  check("open signup: uninvited email → role 'student'", resolved.role === "student");
  check("open signup: app_user has the right email", resolved.user.email === emailW);

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

  // ── 5. 🔴 NO-DOWNGRADE. The regression this probe exists to prevent. ──
  // A tutor is promoted, then logs in again. `resolveMembership` runs on every
  // login; if it ever writes 'student' without reading first, this person is
  // silently demoted and NOTHING else in the suite would catch it.
  //
  // M54: assert the ROLE, not the row. `rows.length === 1` alone stays green
  // through exactly the regression being guarded against — the demotion
  // OVERWRITES the row, it does not add or remove one.
  await withBoard(boardA.id, (tx) =>
    grantRole(tx, { email: emailD, name: "Probe D", board: boardA, role: "tutor" }),
  );
  const afterLogin = await withBoard(boardA.id, (tx) =>
    resolveMembership(tx, { email: emailD, name: "Probe D", board: boardA }),
  );
  check("NO-DOWNGRADE: a tutor logging in is STILL a tutor", afterLogin.role === "tutor");

  // and the same as the CHECK side sees it — the demotion could equally land in
  // the DB while the return value looks right.
  const dSeen = await withBoard(boardA.id, (tx) =>
    requireMembership(tx, { email: emailD, board: boardA }),
  );
  check("NO-DOWNGRADE: the DB row still says tutor, not just the return value", dSeen.role === "tutor");

  const dRows = await withBoard(boardA.id, (tx) =>
    tx
      .select({ role: membership.role })
      .from(membership)
      .innerJoin(appUser, eq(membership.userId, appUser.id))
      .where(and(eq(appUser.email, emailD), eq(membership.boardId, boardA.id))),
  );
  check("NO-DOWNGRADE: login did not add a second row either", dRows.length === 1);

  // 6. RLS: emailW's board-A membership is invisible under board B
  const underB = await withBoard(boardB.id, (tx) =>
    tx
      .select()
      .from(membership)
      .innerJoin(appUser, eq(membership.userId, appUser.id))
      .where(eq(appUser.email, emailW)),
  );
  check("RLS: board A membership invisible under board B claim", underB.length === 0);

  // ── S109 Slice A: grantRole + the single-role invariant ──
  // grantRole is the replacement SET side for roles (it supersedes
  // `insert(whitelist) → resolveMembership`, the only way to mint a tutor or
  // parent until now). These legs pin the two properties the rest of the auth
  // rewrite leans on.
  const emailR = `probe-r-${tag}@example.com`;
  const rolesOf = (email: string, boardId: string) =>
    withBoard(boardId, (tx) =>
      tx
        .select({ role: membership.role })
        .from(membership)
        .innerJoin(appUser, eq(membership.userId, appUser.id))
        .where(and(eq(appUser.email, email), eq(membership.boardId, boardId))),
    );

  // M11 again: nothing exists before the real path runs.
  check("grantRole: no membership before the call", (await rolesOf(emailR, boardA.id)).length === 0);

  await withBoard(boardA.id, (tx) =>
    grantRole(tx, { email: emailR, name: "Probe R", board: boardA, role: "tutor" }),
  );
  const asTutor = await rolesOf(emailR, boardA.id);
  check(
    "grantRole: mints exactly 1 membership with the asked role",
    asTutor.length === 1 && asTutor[0]?.role === "tutor",
  );

  // THE invariant this slice exists for. The old unique was
  // (user, board, ROLE), so this second call would have ADDED a row and left
  // requireMembership picking between them with no ORDER BY — a coin-flip
  // between tutor and parent on every request.
  await withBoard(boardA.id, (tx) =>
    grantRole(tx, { email: emailR, name: "Probe R", board: boardA, role: "parent" }),
  );
  const asParent = await rolesOf(emailR, boardA.id);
  check(
    "single-role invariant: re-grant REPLACES, still exactly 1 row",
    asParent.length === 1 && asParent[0]?.role === "parent",
  );

  // The role a promotion resolves to must be the one the CHECK side reads —
  // otherwise a tutor could be promoted and still be authorized as a parent.
  const seen = await withBoard(boardA.id, (tx) =>
    requireMembership(tx, { email: emailR, board: boardA }),
  );
  check("requireMembership reads back the granted role", seen.role === "parent");

  // ── 8. The SELF-SIGNUP rules are GONE, and this leg is what keeps them gone.
  // Slice SELF-SIGNUP (S108) opened one narrow door: cbse + a GOOGLE identity.
  // Slice C removed the door and the wall. A CREDENTIAL (email/password)
  // identity — the case the old rule explicitly refused — must now become a
  // student like anyone else, and on ANY board, not just cbse.
  //
  // Kept as a real Better Auth identity rather than a bare email because that
  // is what the deleted rule inspected: if someone reintroduces a
  // provider-based check, a bare email would sail past it and this leg would
  // go green while the door was quietly back.
  const emailC = `probe-c-${tag}@example.com`;
  const [cUser] = await db.insert(users).values({ email: emailC, name: "Probe C" }).returning();
  await db.insert(accounts).values({ userId: cUser!.id, accountId: cUser!.id, providerId: "credential", password: "x" });

  const cred = await withBoard(boardA.id, (tx) =>
    resolveMembership(tx, { email: emailC, name: "Probe C", board: boardA }),
  );
  check("no provider rule: a credential identity is a student too", cred.role === "student");
  const cRows = await withBoard(boardA.id, (tx) =>
    tx.select().from(membership).innerJoin(appUser, eq(membership.userId, appUser.id))
      .where(and(eq(appUser.email, emailC), eq(membership.boardId, boardA.id))),
  );
  check("no provider rule: membership written by the real flow (1 row)", cRows.length === 1);

  // and no board rule either — the old door was cbse-only. A throwaway board
  // must behave identically.
  const credB = await withBoard(boardB.id, (tx) =>
    resolveMembership(tx, { email: emailC, name: "Probe C", board: boardB }),
  );
  check("no board rule: the same identity is a student on another board", credB.role === "student");

  // ── 9. Slice F (S113): the whitelist RELATION is gone, not merely unused. ──
  // Slices A–E removed every reader and writer; F dropped the table (0034).
  // This leg is the one that would notice it being recreated — a reintroduced
  // `whitelist` table is how the gate the founder deleted comes back, and it
  // would come back looking like a harmless schema addition.
  //
  // Catalog read, so it is not RLS-filtered: `to_regclass` returns NULL for
  // "no such relation", which is a real absence, not an invisible row (M29).
  const relRows = (await db.execute(
    sql`select to_regclass('public.whitelist') is null as dropped`,
  )) as unknown as Array<{ dropped: boolean }>;
  check("Slice F: the whitelist table does not exist", relRows[0]?.dropped === true);

  // 7. HTTP me with no session → UNAUTHORIZED (soft)
  try {
    const res = await fetch(`http://localhost:${env.PORT}/trpc/me?input=%7B%7D`, {
      headers: { "x-board": boardA.slug },
    });
    check(`HTTP me (no session) → 401 (got ${res.status})`, res.status === 401);
  } catch {
    console.log("  ~ HTTP me skipped (server not running)");
  }

  // cleanup (RLS-scoped rows withBoard; app_user + boards + auth tables global).
  // Nothing touches the real cbse board any more — the self-signup legs that
  // needed it are gone, so every row this probe writes lives on its own
  // throwaway boards (M22).
  await withBoard(boardA.id, (tx) => tx.delete(membership).where(eq(membership.boardId, boardA.id)));
  await withBoard(boardB.id, (tx) => tx.delete(membership).where(eq(membership.boardId, boardB.id)));
  await db.delete(users).where(eq(users.email, emailC)); // accounts cascade
  await db.delete(appUser).where(eq(appUser.email, emailW));
  await db.delete(appUser).where(eq(appUser.email, emailD));
  await db.delete(appUser).where(eq(appUser.email, emailC));
  await db.delete(appUser).where(eq(appUser.email, emailR));
  await db.delete(board).where(eq(board.id, boardA.id));
  await db.delete(board).where(eq(board.id, boardB.id));

  console.log(`\nprobe_auth_membership: ${passed} passed, ${failed} failed`);
  await queryClient.end();
  process.exit(failed === 0 ? 0 : 1);
}

main().catch(async (err) => {
  console.error("probe_auth_membership FAILED:", err);
  await queryClient.end();
  process.exit(1);
});
