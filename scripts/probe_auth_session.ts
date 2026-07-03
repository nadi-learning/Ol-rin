/**
 * probe_auth_session — proves the authed HTTP path end-to-end using the DEV
 * bypass (Better Auth email/password, enabled when NODE_ENV != production).
 * This is the leg probe_auth_whitelist can't reach: a REAL Better Auth session
 * cookie → tRPC context → withBoard → me.
 *
 *   1. Sign up a whitelisted dev email via auth.api → session cookie.
 *   2. GET /trpc/me with that cookie + x-board → 200 + correct {user,board,role}.
 *   3. Sign up a NON-whitelisted dev email → GET /trpc/me → 403 (NOT_WHITELISTED).
 *
 * REQUIRES the dev server running (bun run dev) in development. Unique per-run
 * emails (M22) + full cleanup (users cascade to sessions/accounts).
 */
import { eq, inArray } from "drizzle-orm";
import { appUser, board, membership, users, whitelist } from "@b2c/kernel/schema";
import { auth } from "../src/auth/auth";
import { db, queryClient } from "../src/db/client";
import { withBoard } from "../src/db/with-board";
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

async function signUpCookie(email: string): Promise<string> {
  const res = await auth.api.signUpEmail({
    body: { email, password: "dev-password-123", name: email.split("@")[0]! },
    asResponse: true,
  });
  const setCookies = res.headers.getSetCookie();
  return setCookies.map((c) => c.split(";")[0]).join("; ");
}

async function getMe(cookie: string, slug: string): Promise<{ status: number; body: string }> {
  const res = await fetch(`http://localhost:${env.PORT}/trpc/me?input=%7B%7D`, {
    headers: { cookie, "x-board": slug },
  });
  return { status: res.status, body: await res.text() };
}

async function main() {
  // server must be up
  try {
    const h = await fetch(`http://localhost:${env.PORT}/health`);
    if (h.status !== 200) throw new Error();
  } catch {
    console.error(
      `\nprobe_auth_session: server not running on :${env.PORT}. Start it (bun run dev) and retry.`,
    );
    await queryClient.end();
    process.exit(1);
  }

  const tag = `${Date.now()}`;
  const emailW = `sess-w-${tag}@example.com`; // whitelisted
  const emailX = `sess-x-${tag}@example.com`; // not whitelisted

  const [b] = await db
    .insert(board)
    .values({ slug: `sess-${tag}`, name: "Sess Probe" })
    .returning();
  if (!b) throw new Error("board seed failed");
  await withBoard(b.id, (tx) =>
    tx.insert(whitelist).values({ boardId: b.id, email: emailW, role: "student" }),
  );

  // 1+2 whitelisted: real session → me 200 with the right shape
  const cookieW = await signUpCookie(emailW);
  check("dev sign-up returned a session cookie", cookieW.length > 0);
  const meW = await getMe(cookieW, b.slug);
  check(`whitelisted me → 200 (got ${meW.status})`, meW.status === 200);
  check("me body carries the email", meW.body.includes(emailW));
  check("me body carries role 'student'", meW.body.includes("student"));

  // 3 non-whitelisted: real session → me 403
  const cookieX = await signUpCookie(emailX);
  const meX = await getMe(cookieX, b.slug);
  check(`non-whitelisted me → 403 (got ${meX.status})`, meX.status === 403);
  check("me body carries NOT_WHITELISTED", meX.body.includes("NOT_WHITELISTED"));

  // cleanup
  await withBoard(b.id, (tx) => tx.delete(membership).where(eq(membership.boardId, b.id)));
  await withBoard(b.id, (tx) => tx.delete(whitelist).where(eq(whitelist.boardId, b.id)));
  await db.delete(appUser).where(inArray(appUser.email, [emailW, emailX]));
  await db.delete(users).where(inArray(users.email, [emailW, emailX])); // cascades sessions/accounts
  await db.delete(board).where(eq(board.id, b.id));

  console.log(`\nprobe_auth_session: ${passed} passed, ${failed} failed`);
  await queryClient.end();
  process.exit(failed === 0 ? 0 : 1);
}

main().catch(async (err) => {
  console.error("probe_auth_session FAILED:", err);
  await queryClient.end();
  process.exit(1);
});
