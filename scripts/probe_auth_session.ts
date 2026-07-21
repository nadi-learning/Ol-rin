/**
 * probe_auth_session — the authed HTTP path end-to-end via the DEV bypass (Better
 * Auth email/password, on when NODE_ENV != production). The leg the in-process
 * probe can't reach: a REAL session cookie → tRPC context → withBoard → the
 * resolvers, over the wire where a reintroduced gate would actually sit.
 *
 * ID-1 replaced the boot handshake. `session.enter` (a mutation) mints the
 * board-less profile SHELL and returns whoami; `me` stays a board-scoped
 * protectedProcedure that resolves the profile named by `x-profile`.
 *
 *   1. dev sign-up → session cookie.
 *   2. 🔴 me BEFORE any profile → 403 NO_MEMBERSHIP, and it ENROLLED NOBODY. The
 *      inversion at the wire: `me` used to create a membership from whatever
 *      x-board it was handed; now no profile ⇒ refused, and nothing is written.
 *   3. whoami BEFORE enter → 200 with an EMPTY list — no profile exists yet.
 *   4. session.enter (x-profile:student) → 200; whoami now carries the student
 *      SHELL, and it is DISABLED + board-less. A shell is on record but is not an
 *      enrolment — the FE renders onboarding from exactly this state.
 *   5. 🔴 enter STILL ENROLLED NOBODY — the shell mint created no `student` row,
 *      so `me` continues to 403 until an operational row exists.
 *   6. once operational (a fixture `student` row, since ID-3 onboarding is the
 *      product path), me with x-board → 200 + {email, board, role:student}. The
 *      full cookie→context→withBoard→requireMembership→me chain.
 *   7. OPEN SIGNUP at the wire: a second, unrelated stranger walks signup→enter
 *      and lands as a disabled student shell — no gate, no NOT_WHITELISTED.
 *
 * Every refusal leg is a NEGATIVE CONTROL (M79). REQUIRES the dev server (bun run
 * dev). Unique per-run emails (M22); users cascade to sessions/accounts on delete.
 */
import { eq, inArray } from "drizzle-orm";
import { appUser, board, student, users } from "@b2c/kernel/schema";
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

const base = `http://localhost:${env.PORT}`;

async function signUpCookie(email: string): Promise<string> {
  const res = await auth.api.signUpEmail({
    body: { email, password: "dev-password-123", name: email.split("@")[0]! },
    asResponse: true,
  });
  const setCookies = res.headers.getSetCookie();
  return setCookies.map((c) => c.split(";")[0]).join("; ");
}

async function getMe(cookie: string, slug: string): Promise<{ status: number; body: string }> {
  const res = await fetch(`${base}/trpc/me?input=%7B%7D`, {
    headers: { cookie, "x-board": slug, "x-profile": "student" },
    signal: AbortSignal.timeout(15_000),
  });
  return { status: res.status, body: await res.text() };
}

/**
 * The pre-board reads, sent with NO x-board header. Omitting it is part of the
 * assertion, not a convenience: `sessionProcedure` must not need one, and a
 * header slipped in here would hide it needing one.
 */
async function whoami(cookie: string): Promise<{ status: number; body: string }> {
  const res = await fetch(`${base}/trpc/session.whoami?input=%7B%7D`, {
    headers: { cookie },
    signal: AbortSignal.timeout(15_000),
  });
  return { status: res.status, body: await res.text() };
}

/** The ID-1 boot handshake: mint the shell for x-profile, get whoami back. */
async function enter(cookie: string, profile: string): Promise<{ status: number; body: string }> {
  const res = await fetch(`${base}/trpc/session.enter`, {
    method: "POST",
    headers: { cookie, "content-type": "application/json", "x-profile": profile },
    body: JSON.stringify({}),
    signal: AbortSignal.timeout(15_000),
  });
  return { status: res.status, body: await res.text() };
}

/** `student` rows for an email on a board, read under the RLS claim. */
async function studentRows(email: string, boardId: string) {
  return await withBoard(boardId, (tx) =>
    tx
      .select({ userId: student.userId })
      .from(student)
      .innerJoin(appUser, eq(appUser.id, student.userId))
      .where(eq(appUser.email, email)),
  );
}

async function main() {
  // server must be up
  try {
    const h = await fetch(`${base}/health`);
    if (h.status !== 200) throw new Error();
  } catch {
    console.error(`\nprobe_auth_session: server not running on :${env.PORT}. Start it (bun run dev) and retry.`);
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

  // ── 2. 🔴 me BEFORE any profile → refused, and it wrote nothing. ──
  const meBefore = await getMe(cookieW, b.slug);
  check(`me BEFORE any profile → 403 (got ${meBefore.status})`, meBefore.status === 403);
  check("…and says NO_MEMBERSHIP, not some generic refusal", meBefore.body.includes("NO_MEMBERSHIP"));
  check("🔴 the refused `me` ENROLLED NOBODY (0 student rows)", (await studentRows(emailW, b.id)).length === 0);

  // ── 3. the pre-board surface, with NO x-board header, BEFORE any profile. ──
  const whoBefore = await whoami(cookieW);
  check(`session.whoami without x-board → 200 (got ${whoBefore.status})`, whoBefore.status === 200);
  check("whoami reports no profiles yet", whoBefore.body.includes('"memberships":[]'));

  // ── 4. session.enter mints the SHELL; whoami now shows it, DISABLED. ──
  const entered = await enter(cookieW, "student");
  check(`session.enter → 200 (got ${entered.status})`, entered.status === 200);
  const whoAfter = await whoami(cookieW);
  check("whoami now carries a student profile", whoAfter.body.includes('"role":"student"'));
  check(
    "…and it is a DISABLED, board-less shell (not an enrolment)",
    whoAfter.body.includes('"enabled":false') && whoAfter.body.includes('"slug":null'),
  );

  // ── 5. 🔴 the shell mint STILL enrolled nobody — no student row, me still 403.
  check("🔴 enter created NO student row", (await studentRows(emailW, b.id)).length === 0);
  const meAfterEnter = await getMe(cookieW, b.slug);
  check(`me after enter (still no student row) → 403 (got ${meAfterEnter.status})`, meAfterEnter.status === 403);

  // ── 6. become operational, then me works over the wire. The `student` row is
  // seeded directly (a fixture with a class) because the product path that writes
  // it — ID-3 onboarding — is not built yet; the SET side a real user drives is
  // onboarding, not this insert (M11 note).
  const [wStudent] = await db
    .select({ id: appUser.id })
    .from(appUser)
    .where(eq(appUser.email, emailW)); // exactly one profile (student) at this point
  await withBoard(b.id, (tx) =>
    tx.insert(student).values({ userId: wStudent!.id, boardId: b.id, class: "9" }),
  );
  const meW = await getMe(cookieW, b.slug);
  check(`me AFTER becoming operational → 200 (got ${meW.status})`, meW.status === 200);
  check("me body carries the email", meW.body.includes(emailW));
  check("me body carries role 'student'", meW.body.includes("student"));

  // ── 7. OPEN SIGNUP at the wire: a second stranger walks signup→enter and lands
  // as a disabled student shell. 200 alone is not enough — assert the shell shape
  // AND the absence of any gate payload.
  const cookieX = await signUpCookie(emailX);
  const enteredX = await enter(cookieX, "student");
  check(`open signup: uninvited email may enter → 200 (got ${enteredX.status})`, enteredX.status === 200);
  const whoX = await whoami(cookieX);
  check("open signup: whoami shows a student shell", whoX.body.includes('"role":"student"'));
  check(
    "open signup: no NOT_WHITELISTED anywhere in the response",
    !whoX.body.includes("NOT_WHITELISTED") && !enteredX.body.includes("NOT_WHITELISTED"),
  );

  // cleanup. student is RLS-scoped → delete under the board claim; then globals.
  await withBoard(b.id, (tx) => tx.delete(student).where(eq(student.boardId, b.id)));
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
