/**
 * probe_auth_session — proves the authed HTTP path end-to-end using the DEV
 * bypass (Better Auth email/password, enabled when NODE_ENV != production).
 * This is the leg probe_auth_membership can't reach: a REAL Better Auth session
 * cookie → tRPC context → withBoard → me.
 *
 *   1. Sign up a dev email via auth.api → session cookie.
 *   2. 🔴 SLICE E AT THE WIRE — `me` BEFORE any board pick → 403 NO_MEMBERSHIP,
 *      and it ENROLLED NOBODY. This is the inversion proven over real HTTP:
 *      `me` used to be an authedProcedure that created a membership from
 *      whatever `x-board` the caller sent, so merely asking who you were put
 *      you on CBSE.
 *   3. session.whoami with a cookie and NO x-board header at all → 200 with an
 *      empty membership list. The pre-board surface really is pre-board.
 *   4. session.chooseBoard → then `me` → 200 + correct {user,board,role}.
 *   5. OPEN SIGNUP AT THE WIRE: a SECOND, entirely unrelated email — nobody
 *      invited it, no row anywhere names it — walks the same three calls and
 *      lands as a 'student'.
 *
 * Slice C (S110) inverted the open-signup leg: it used to assert 403
 * NOT_WHITELISTED, and the whitelist is gone, so its opposite is what is worth
 * holding. Slice E (S112) changed the ROUTE that claim travels — signup alone no
 * longer enrols, a board pick does — but not the claim itself: nobody is gated.
 *
 * This is the ONLY place open signup is proven over real HTTP —
 * `probe_auth_membership` and `probe_board_pick` drive the services in-process
 * and so cannot see the cookie/x-board/tRPC-context path, which is exactly
 * where a reintroduced gate would sit (a `me` catch, an init.ts guard, a
 * middleware). A service-level probe would stay green through all of those.
 *
 * REQUIRES the dev server running (bun run dev) in development. Unique per-run
 * emails (M22) + full cleanup (users cascade to sessions/accounts).
 */
import { and, eq, inArray } from "drizzle-orm";
import { appUser, board, membership, users } from "@b2c/kernel/schema";
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
    signal: AbortSignal.timeout(15_000),
  });
  return { status: res.status, body: await res.text() };
}

/**
 * Slice E — the pre-board calls, sent with NO x-board header. Omitting it is
 * part of the assertion, not a convenience: `sessionProcedure` must not need
 * one, and a header slipped in here would hide it needing one.
 */
async function whoami(cookie: string): Promise<{ status: number; body: string }> {
  const res = await fetch(`http://localhost:${env.PORT}/trpc/session.whoami?input=%7B%7D`, {
    headers: { cookie },
    signal: AbortSignal.timeout(15_000),
  });
  return { status: res.status, body: await res.text() };
}

async function chooseBoard(cookie: string, slug: string): Promise<{ status: number; body: string }> {
  const res = await fetch(`http://localhost:${env.PORT}/trpc/session.chooseBoard`, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ json: { board: slug } }),
    signal: AbortSignal.timeout(15_000),
  });
  return { status: res.status, body: await res.text() };
}

/** Membership rows for an email on a board, read under the RLS claim. */
async function membershipRows(email: string, boardId: string) {
  return await withBoard(boardId, (tx) =>
    tx
      .select({ role: membership.role })
      .from(membership)
      .innerJoin(appUser, eq(appUser.id, membership.userId))
      .where(and(eq(appUser.email, email), eq(membership.boardId, boardId))),
  );
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
  const emailW = `sess-w-${tag}@example.com`;
  const emailX = `sess-x-${tag}@example.com`; // a second, unrelated stranger

  const [b] = await db
    .insert(board)
    .values({ slug: `sess-${tag}`, name: "Sess Probe" })
    .returning();
  if (!b) throw new Error("board seed failed");
  // NOTHING is pre-authorised on this board — that is the point of the probe.

  // 1. real session
  const cookieW = await signUpCookie(emailW);
  check("dev sign-up returned a session cookie", cookieW.length > 0);

  // ── 2. 🔴 SLICE E AT THE WIRE. Signed in, board header present, membership
  // absent → refused. Under the old `me` this same request returned 200 and
  // created the membership as a side effect.
  const meBefore = await getMe(cookieW, b.slug);
  check(`me BEFORE choosing a board → 403 (got ${meBefore.status})`, meBefore.status === 403);
  check("…and says NO_MEMBERSHIP, not some generic refusal", meBefore.body.includes("NO_MEMBERSHIP"));

  // The DB is the real assertion. A 403 could coexist with a write (the refusal
  // landing after the enrol), and the whole point of the slice is that reading
  // "who am I" creates nothing.
  check("🔴 the refused `me` ENROLLED NOBODY (0 rows)", (await membershipRows(emailW, b.id)).length === 0);

  // ── 3. the pre-board surface, with NO x-board header at all.
  const whoBefore = await whoami(cookieW);
  check(`session.whoami without x-board → 200 (got ${whoBefore.status})`, whoBefore.status === 200);
  check("whoami reports no memberships yet", whoBefore.body.includes('"memberships":[]'));

  // ── 4. pick a board, THEN me works.
  const chose = await chooseBoard(cookieW, b.slug);
  check(`session.chooseBoard → 200 (got ${chose.status})`, chose.status === 200);
  const meW = await getMe(cookieW, b.slug);
  check(`me AFTER the pick → 200 (got ${meW.status})`, meW.status === 200);
  check("me body carries the email", meW.body.includes(emailW));
  check("me body carries role 'student'", meW.body.includes("student"));
  check("exactly one membership was created", (await membershipRows(emailW, b.id)).length === 1);

  // ── 5. OPEN SIGNUP at the wire: a second stranger walks the same route.
  // Asserting 200 alone is not enough — a gate that 200s with an error payload,
  // or one that admits people at some role other than 'student', would slip
  // through. Assert the email AND the role actually came back.
  const cookieX = await signUpCookie(emailX);
  const choseX = await chooseBoard(cookieX, b.slug);
  check(`open signup: uninvited email may choose a board → 200 (got ${choseX.status})`, choseX.status === 200);
  const meX = await getMe(cookieX, b.slug);
  check(`open signup: uninvited email → 200 (got ${meX.status})`, meX.status === 200);
  check("open signup: me body carries that email", meX.body.includes(emailX));
  check("open signup: and lands as a 'student'", meX.body.includes("student"));
  check(
    "open signup: no NOT_WHITELISTED anywhere in the response",
    !meX.body.includes("NOT_WHITELISTED") && !choseX.body.includes("NOT_WHITELISTED"),
  );

  // cleanup
  await withBoard(b.id, (tx) => tx.delete(membership).where(eq(membership.boardId, b.id)));
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
