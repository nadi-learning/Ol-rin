/**
 * probe_auth_membership — the identity-resolution exit gate (ID-1, S127+ redesign).
 *
 * The `membership` table is GONE. A person is a set of `app_user` PROFILES, one
 * per user_type (email × user_type is unique by construction); a profile is
 * OPERATIONAL only when its role-DETAIL row exists (student.board_id / tutor.
 * boards[] / parent), which login never writes. This probe drives the b2c side
 * of login end-to-end against the real DB + real RLS, everything downstream of
 * "we have an authenticated email + a persona":
 *
 *   1. connectivity as the app role.
 *   2. SHELL MINT: `enterProfile` (login) creates the board-less app_user shell.
 *   3. 🔴 SHELL ≠ ENROLMENT — the cbse bug, killed by construction. The login
 *      shell does NOT make the student operational on any board: requireMembership
 *      MISSES until a role-detail row exists. This is the leg that inverts the old
 *      "reading who-you-are enrolled you on cbse".
 *   4. RE-LOGIN IS READ-FIRST — a second login (phone still NULL) does NOT mint a
 *      second student profile (the dup-profile hazard ensureProfile's header warns
 *      of).
 *   5. MULTI-PROFILE BY CONSTRUCTION — the SAME email as a tutor is a DISTINCT
 *      app_user row, its own id + user_type. The founder's "same email, all
 *      profiles" win, and the structural reason the coin-flip below cannot return.
 *   6. grantRole(tutor) is BOARD-SCOPED — operational on the granted board, a MISS
 *      on another (the old "a tutor off their board is 403'd", now boards[]).
 *   7. A TUTOR SPANS BOARDS — a second grant APPENDS; the board that missed in (6)
 *      now passes.
 *   8. 🔴 NO-DOWNGRADE / NO SELF-PROMOTE — a re-login as student leaves the tutor
 *      profile untouched (they are SEPARATE rows, so a blind student write can no
 *      longer demote a tutor — M54's fear, now impossible rather than merely
 *      guarded).
 *   9. THE PROFILE IS NAMED, NOT GUESSED — requireMembership(profile:tutor) returns
 *      the tutor; profile:student (no student row) MISSES rather than substituting
 *      the tutor. Both directions (a filter that ignored its arg passes one-way).
 *  10. STUDENT BOARD-BELONGING IS RLS — a student row on board A is invisible (a
 *      MISS) under board B (b2c-two-user-tables / M29/M80: the spurious clean 0).
 *  11. PARENT IS BOARD-AGNOSTIC — operational on any board, the deliberate
 *      contrast with the tutor of (6).
 *  12. ADMIN RESOLVES ON SHELL ALONE — the whitelist (adminProcedure) is the real
 *      gate; an email with no admin shell MISSES.
 *  13. whoami REPORTS THE TRUTH — per-profile enabled + board(s), the shape the FE
 *      boot routes on.
 *  14. the `whitelist` RELATION is still gone (Slice F) — the gate cannot be
 *      rebuilt by writing a row.
 *  15. HTTP: GET /trpc/me with no session → 401 (soft; skipped if server is down).
 *
 * Every leg that asserts a refusal is a NEGATIVE CONTROL (M79): it proves the
 * boundary by crossing it and being stopped, not by staying inside it. Unique
 * per-run emails/slugs (M22); cleans up after itself.
 */
import { and, eq, sql } from "drizzle-orm";
import { appUser, board, parent, student, tutor } from "@b2c/kernel/schema";
import { db, queryClient } from "../src/db/client";
import { withBoard } from "../src/db/with-board";
import { grantRole, requireMembership, NoMembershipError } from "../src/services/membership";
import { enterProfile, whoami } from "../src/services/session_boards";
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

type Bd = { id: string; slug: string };

/** app_user profiles for an email (global table). */
function profiles(email: string) {
  return db
    .select({ id: appUser.id, userType: appUser.userType })
    .from(appUser)
    .where(eq(appUser.email, email));
}

/**
 * The CHECK side as the app runs it: is `profile` operational on this board?
 * true = requireMembership resolved; false = it raised NoMembershipError (the
 * only "not operational" signal). Any OTHER error is a real fault and rethrows —
 * a bare `catch → false` would launder a broken query into a green "not a member".
 */
async function operational(email: string, b: Bd, profile: string): Promise<boolean> {
  try {
    await withBoard(b.id, (tx) =>
      requireMembership(tx, { email, board: b, profile: profile as any }),
    );
    return true;
  } catch (e) {
    if (e instanceof NoMembershipError) return false;
    throw e;
  }
}

async function main() {
  const tag = `${Date.now()}`;
  const emailS = `probe-s-${tag}@example.com`; // the student who onboards (fixture row)
  const emailM = `probe-m-${tag}@example.com`; // the multi-board tutor
  const emailD = `probe-d-${tag}@example.com`; // the no-downgrade actor
  const emailP = `probe-p-${tag}@example.com`; // the parent
  const emailA = `probe-a-${tag}@example.com`; // the admin
  const emails = [emailS, emailM, emailD, emailP, emailA];

  // 1. connectivity
  await db.execute(sql`select 1`);
  check("DB connectivity (select 1) as app role", true);

  // Two throwaway boards. NOTHING is pre-authorised on either — that is the point.
  const [boardA] = await db
    .insert(board)
    .values({ slug: `probe-a-${tag}`, name: "Probe A" })
    .returning();
  const [boardB] = await db
    .insert(board)
    .values({ slug: `probe-b-${tag}`, name: "Probe B" })
    .returning();
  if (!boardA || !boardB) throw new Error("board seed failed");

  // ── 2. SHELL MINT. Nothing before; login mints exactly one student shell. ──
  check("M11: no profile before enterProfile", (await profiles(emailS)).length === 0);
  await enterProfile({ email: emailS, name: "Probe S", persona: "student" });
  const sAfter = await profiles(emailS);
  check(
    "enterProfile: uninvited email → one 'student' profile shell",
    sAfter.length === 1 && sAfter[0]?.userType === "student",
  );

  // ── 3. 🔴 SHELL ≠ ENROLMENT. The shell is board-less; the student is NOT
  // operational on any board until a `student` row exists. This is the cbse-
  // enrolment bug made impossible: reading/creating the identity enrols nobody.
  check(
    "🔴 the login shell ENROLLED NOBODY (student not operational on A)",
    (await operational(emailS, boardA, "student")) === false,
  );

  // ── 4. RE-LOGIN IS READ-FIRST. A second login (phone still NULL) must NOT
  // insert a second student profile — the (email, phone-NULL, type) dup hazard.
  await enterProfile({ email: emailS, name: "Probe S", persona: "student" });
  check("re-login idempotent: still exactly one student profile", (await profiles(emailS)).length === 1);

  // ── 5. MULTI-PROFILE BY CONSTRUCTION. The same email as a tutor is a SEPARATE
  // app_user row. Distinct ids + distinct user_types — the founder's model, and
  // the structural reason no login can ever collide two roles into one pick.
  await enterProfile({ email: emailS, name: "Probe S", persona: "tutor" });
  const twoProfiles = await profiles(emailS);
  check(
    "multi-profile: same email → 2 distinct profiles (student + tutor)",
    twoProfiles.length === 2 &&
      new Set(twoProfiles.map((p) => p.id)).size === 2 &&
      new Set(twoProfiles.map((p) => p.userType)).size === 2,
  );

  // ── 6. grantRole(tutor) IS BOARD-SCOPED. Operational on A, a MISS on B. ──
  await withBoard(boardA.id, (tx) =>
    grantRole(tx, { email: emailM, name: "Probe M", board: boardA, role: "tutor" }),
  );
  check("grantRole(tutor,A): operational on A", (await operational(emailM, boardA, "tutor")) === true);
  check(
    "🔴 off-board: the tutor is a MISS on board B (not yet granted there)",
    (await operational(emailM, boardB, "tutor")) === false,
  );

  // ── 7. A TUTOR SPANS BOARDS. A second grant APPENDS (does not replace); the
  // board that missed above now passes, and boards[] carries both.
  await withBoard(boardB.id, (tx) =>
    grantRole(tx, { email: emailM, name: "Probe M", board: boardB, role: "tutor" }),
  );
  check("grantRole(tutor,B) APPENDS: now operational on B too", (await operational(emailM, boardB, "tutor")) === true);
  const [mTutor] = await db
    .select({ boards: tutor.boards })
    .from(tutor)
    .innerJoin(appUser, eq(appUser.id, tutor.userId))
    .where(eq(appUser.email, emailM));
  const mBoards = new Set((mTutor?.boards as string[]) ?? []);
  check("…and boards[] contains BOTH board ids", mBoards.has(boardA.id) && mBoards.has(boardB.id));

  // ── 8. 🔴 NO-DOWNGRADE / NO SELF-PROMOTE. D is a student shell + a granted
  // tutor. A re-login as student runs the shell mint again; because student and
  // tutor are SEPARATE rows it cannot touch the tutor's detail row. M54's fear —
  // "every login blind-writes student and demotes the tutor" — is now impossible,
  // not merely guarded: there is no shared row to overwrite.
  await enterProfile({ email: emailD, name: "Probe D", persona: "student" });
  await withBoard(boardA.id, (tx) =>
    grantRole(tx, { email: emailD, name: "Probe D", board: boardA, role: "tutor" }),
  );
  await enterProfile({ email: emailD, name: "Probe D", persona: "student" }); // the re-login
  check("NO-DOWNGRADE: after a student re-login the tutor is STILL operational", (await operational(emailD, boardA, "tutor")) === true);
  check(
    "NO-DOWNGRADE: the re-login did NOT make the student operational either",
    (await operational(emailD, boardA, "student")) === false,
  );

  // ── 9. THE PROFILE IS NAMED, NOT GUESSED. Both directions, because a filter
  // that ignored its argument would pass a one-way test. D holds an operational
  // tutor and a non-operational student; asking for each returns exactly it (or
  // a MISS), never a substitution — the founder's Tutor-card bug in probe form.
  const dTutor = await withBoard(boardA.id, (tx) =>
    requireMembership(tx, { email: emailD, board: boardA, profile: "tutor" }),
  );
  check("x-profile=tutor resolves the TUTOR", dTutor.role === "tutor");
  check(
    "🔴 x-profile=student (no student row) is a MISS, not a fallback to tutor",
    (await operational(emailD, boardA, "student")) === false,
  );

  // ── 10. STUDENT BOARD-BELONGING IS RLS. A `student` row (the fixture path
  // seeds it directly with a class; the product path is ID-3 onboarding) lives on
  // board A. It is operational under A and INVISIBLE under B — the RLS-scoped
  // read returns absent, which correctly reads as "not their board", NOT as a
  // clean 0 (b2c-two-user-tables). S is already a student shell from leg 2.
  const [sProfile] = await profiles(emailS).then((rows) => rows.filter((r) => r.userType === "student"));
  await withBoard(boardA.id, (tx) =>
    tx.insert(student).values({ userId: sProfile!.id, boardId: boardA.id, class: "9" }),
  );
  check("student row on A: operational under A", (await operational(emailS, boardA, "student")) === true);
  check(
    "🔴 RLS: the SAME student row is a MISS under board B",
    (await operational(emailS, boardB, "student")) === false,
  );

  // ── 11. PARENT IS BOARD-AGNOSTIC — the deliberate contrast with the tutor of
  // leg 6. A parent's board is transitively their child's, so requireMembership
  // does not gate a parent by board: operational on A AND on B.
  await withBoard(boardA.id, (tx) =>
    grantRole(tx, { email: emailP, name: "Probe P", board: boardA, role: "parent" }),
  );
  check("parent operational on A", (await operational(emailP, boardA, "parent")) === true);
  check("parent is board-agnostic: operational on B too (unlike the tutor)", (await operational(emailP, boardB, "parent")) === true);

  // ── 12. ADMIN RESOLVES ON THE SHELL ALONE. grantRole(admin) writes no detail
  // row (admin has none); the shell existing is enough for identity here, and the
  // email whitelist (adminProcedure) is the real second lock. An email with NO
  // admin shell is a MISS — the negative control that keeps this honest.
  await withBoard(boardA.id, (tx) =>
    grantRole(tx, { email: emailA, name: "Probe A2", board: boardA, role: "admin" }),
  );
  check("admin resolves on the shell (board-agnostic)", (await operational(emailA, boardA, "admin")) === true);
  check(
    "🔴 an email with no admin shell is a MISS as admin",
    (await operational(emailS, boardA, "admin")) === false,
  );

  // ── 13. whoami REPORTS THE TRUTH the FE boot routes on. M holds a tutor
  // operational on A and B (2 entries, each with its slug); no student/parent.
  const whoM = await whoami(emailM);
  const mTutorEntries = whoM.memberships.filter((e) => e.role === "tutor");
  check(
    "whoami: the multi-board tutor yields one enabled entry per board",
    mTutorEntries.length === 2 &&
      mTutorEntries.every((e) => e.enabled) &&
      new Set(mTutorEntries.map((e) => e.slug)).size === 2 &&
      mTutorEntries.every((e) => e.slug === boardA.slug || e.slug === boardB.slug),
  );
  // S holds an operational student (board A) + a bare tutor shell (never granted).
  const whoS = await whoami(emailS);
  const sStudent = whoS.memberships.find((e) => e.role === "student");
  const sTutor = whoS.memberships.find((e) => e.role === "tutor");
  check(
    "whoami: an operational student is enabled with its board slug",
    sStudent?.enabled === true && sStudent?.slug === boardA.slug,
  );
  check(
    "whoami: a bare tutor shell (no detail row) is disabled + board-less",
    sTutor?.enabled === false && sTutor?.slug === null,
  );
  check("whoami: preferred is the operational board", whoS.preferred === boardA.slug);

  // ── 14. Slice F: the whitelist RELATION is still gone. A catalog read (not RLS-
  // filtered): to_regclass is NULL for a truly-absent relation (M29), never a
  // hidden row.
  const relRows = (await db.execute(
    sql`select to_regclass('public.whitelist') is null as dropped`,
  )) as unknown as Array<{ dropped: boolean }>;
  check("Slice F: the whitelist table does not exist", relRows[0]?.dropped === true);

  // ── 15. HTTP me with no session → 401 (soft). Authentication is still required.
  try {
    const res = await fetch(`http://localhost:${env.PORT}/trpc/me?input=%7B%7D`, {
      headers: { "x-board": boardA.slug },
    });
    check(`HTTP me (no session) → 401 (got ${res.status})`, res.status === 401);
  } catch {
    console.log("  ~ HTTP me skipped (server not running)");
  }

  // cleanup. Detail rows first: `student` is RLS-scoped so delete it under its
  // board's claim (a global delete cannot see it); tutor/parent are global.
  await withBoard(boardA.id, (tx) => tx.delete(student).where(eq(student.boardId, boardA.id)));
  await withBoard(boardB.id, (tx) => tx.delete(student).where(eq(student.boardId, boardB.id)));
  for (const email of emails) {
    const rows = await profiles(email);
    for (const r of rows) {
      await db.delete(tutor).where(eq(tutor.userId, r.id));
      await db.delete(parent).where(eq(parent.userId, r.id));
    }
    await db.delete(appUser).where(eq(appUser.email, email));
  }
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
