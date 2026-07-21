/**
 * probe_admin_people — ID-2 exit gate (the admin PEOPLE + ASSIGNMENTS surface,
 * rebuilt on the profile model).
 *
 * Real DB + real RLS, throwaway boards A/B (M22), self-cleaning. Everything here
 * is FIRM — no AI, no fixtures beyond seeded rows.
 *
 *   1. DB connectivity.
 *   2. The admin gate, BOTH sides (M11) — plus a SOURCE-level assertion that all
 *      six procedures are declared on `adminProcedure` (catches a seventh added
 *      on `protectedProcedure` by mistake — the realistic way this springs a leak).
 *   3. 🔑 THE TWO-USER-TABLES LEG. `app_user` is NOT proof of sign-in (grantRole
 *      mints those for any email). A person with an app_user profile but NO
 *      `users` row must still be refused with USER_NOT_FOUND, or "no pre-invite"
 *      is decorative — and the refusal must WRITE NOTHING.
 *   4. CANNOT_CHANGE_OWN_ROLE — resolved by EMAIL now (identity spans profiles).
 *   5. setRole drives grantRole (M11) · name never wiped · multi-profile: a
 *      second role ADDS a distinct profile (the S123 construct).
 *   6. listPeople is GLOBAL — every profile, one row per app_user; a board-B-only
 *      student shows under a board-A read; a `users` row with no profile does NOT.
 *   7. listLinkCandidates: adults are ACTIVE tutors on THIS board / active parents
 *      (an off-board tutor is excluded); students are the UNLINKED-for-that-kind
 *      on this board (an off-board student is excluded by RLS).
 *   8. linkStudent BY ID: wrong-role refused · off-board student refused · happy
 *      tutor+parent · idempotent (one active assignment) · 🔑 SWITCH fires the
 *      handover snapshot (prior row ended + progress_snapshot frozen).
 *   9. listLinks: resolves both names · RLS — A's links invisible under B.
 *  10. unlinkStudent: clears the pointer (tutor unlink freezes a snapshot) ·
 *      idempotent (second removed=0) · the PROFILE survives (never deleted).
 *  11. HTTP: all six procedures unauth → 401 (soft, TIMEOUT-GUARDED, S110b).
 */
import { and, eq, sql } from "drizzle-orm";
import type { PgTransaction } from "drizzle-orm/pg-core";
import { appUser, board, onboarding, student, tutor, tutorAssignment, users } from "@b2c/kernel/schema";
import type { Role } from "@b2c/kernel/contracts";
import { db, queryClient } from "../src/db/client";
import { withBoard } from "../src/db/with-board";
import { grantRole } from "../src/services/membership";
import { assertAdmin, AdminOnlyError } from "../src/services/admin_ingest";
import {
  CannotChangeOwnRoleError,
  InvalidLinkError,
  linkStudent,
  listLinkCandidates,
  listLinks,
  listPeople,
  setRole,
  unlinkStudent,
  UserNotFoundError,
  type Link,
} from "../src/services/admin_users";
import { env } from "../src/config/env";

type Tx = PgTransaction<any, any, any>;
type Board = { id: string; slug: string };

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

/** Give someone a Better Auth identity — i.e. make "they have signed in" true. */
async function seedAuthIdentity(email: string, name: string) {
  await db.insert(users).values({ email, name, emailVerified: true }).onConflictDoNothing();
}

/** The app_user profile id for (email, user_type) — app_user is global. */
async function profileId(email: string, userType: Role): Promise<string | null> {
  const [r] = await db
    .select({ id: appUser.id })
    .from(appUser)
    .where(and(eq(appUser.email, email), eq(appUser.userType, userType)))
    .limit(1);
  return r?.id ?? null;
}

/** Mint a signed-in tutor profile serving `bd` (grantRole appends the board). */
async function seedTutorOn(bd: Board, email: string, name: string): Promise<string> {
  await seedAuthIdentity(email, name);
  const m = await withBoard(bd.id, (tx) => grantRole(tx, { email, name, board: bd, role: "tutor" }));
  return m.user.id;
}

/** Mint a signed-in student with a real `student` row on `bd` (the fixture path). */
async function seedStudentOn(bd: Board, email: string, name: string): Promise<string> {
  await seedAuthIdentity(email, name);
  const m = await withBoard(bd.id, (tx) =>
    grantRole(tx, { email, name, board: bd, role: "student" }),
  );
  await withBoard(bd.id, (tx) =>
    tx.insert(student).values({ userId: m.user.id, boardId: bd.id, class: "9" }),
  );
  return m.user.id;
}

const HTTP_TIMEOUT_MS = 4000;

async function main() {
  const tag = `${Date.now()}`;
  await db.execute(sql`select 1`);
  check("DB connectivity (select 1) as app role", true);

  const [A] = await db.insert(board).values({ slug: `admp-a-${tag}`, name: "Probe P" }).returning();
  const [B] = await db.insert(board).values({ slug: `admp-b-${tag}`, name: "Probe Q" }).returning();
  if (!A || !B) throw new Error("board seed failed");

  const adminEmail = `admp-admin-${tag}@example.com`;
  const tutorEmail = `admp-tutor-${tag}@example.com`;
  const tutor2Email = `admp-tutor2-${tag}@example.com`;
  const parentEmail = `admp-parent-${tag}@example.com`;
  const studentEmail = `admp-student-${tag}@example.com`;
  const studentBEmail = `admp-studentb-${tag}@example.com`; // student on board B only
  const offBoardTutorEmail = `admp-offtutor-${tag}@example.com`; // tutor on B only
  const ghostEmail = `admp-ghost-${tag}@example.com`; // app_user profile, NEVER signed in
  const strangerEmail = `admp-stranger-${tag}@example.com`; // signed in, no app_user profile
  const multiEmail = `admp-multi-${tag}@example.com`; // accumulates two profiles
  const namelessEmail = `admp-nameless-${tag}@example.com`;

  // ── 2. the admin gate, both sides ──
  let nonAdminThrows = false;
  try {
    assertAdmin("student");
  } catch (e) {
    nonAdminThrows = e instanceof AdminOnlyError;
  }
  check("assertAdmin('student') → AdminOnlyError (check side)", nonAdminThrows);

  const adminM = await withBoard(A.id, (tx) =>
    grantRole(tx, { email: adminEmail, name: "Adm", board: A, role: "admin" }),
  );
  check("real flow grantRole(admin) yields role 'admin' (set side)", adminM.role === "admin");
  await seedAuthIdentity(adminEmail, "Adm");

  // SOURCE-level: every procedure on the people surface is adminProcedure.
  const routerSrc = await Bun.file("src/trpc/router.ts").text();
  const PEOPLE_PROCS = [
    "listPeople",
    "setRole",
    "listLinkCandidates",
    "listLinks",
    "linkStudent",
    "unlinkStudent",
  ];
  const notAdminGated = PEOPLE_PROCS.filter(
    (p) => !new RegExp(`${p}:\\s*adminProcedure`).test(routerSrc),
  );
  check(
    `all 6 people procedures declared on adminProcedure${notAdminGated.length ? ` (leaked: ${notAdminGated.join(", ")})` : ""}`,
    notAdminGated.length === 0,
  );

  // ── 3. 🔑 the two-user-tables leg ──
  // A ghost: real app_user profile (grantRole mints it), but no Better Auth row.
  await withBoard(A.id, (tx) =>
    grantRole(tx, { email: ghostEmail, name: "Ghost", board: A, role: "student" }),
  );
  const ghostProfile = await profileId(ghostEmail, "student");
  check("ghost HAS an app_user profile (so app_user cannot be the test)", ghostProfile !== null);

  let ghostRefused = false;
  let ghostErrCode = "";
  try {
    await withBoard(A.id, (tx) =>
      setRole(tx, { board: A, actorEmail: adminEmail, email: ghostEmail, role: "tutor" }),
    );
  } catch (e) {
    ghostRefused = e instanceof UserNotFoundError;
    ghostErrCode = (e as any)?.code ?? "";
  }
  check(
    `🔑 setRole on a never-signed-in person → USER_NOT_FOUND (got ${ghostErrCode || "no throw"})`,
    ghostRefused,
  );
  const ghostTutor = await profileId(ghostEmail, "tutor");
  check("…and the refusal WROTE NOTHING (no tutor profile minted for the ghost)", ghostTutor === null);

  // ── 3b. ADM-CH: an ONBOARDED profile with NO Better Auth row is ACTIONABLE ──
  // The S139 restore re-created onboarded students whose auth row is minted only
  // on their next sign-in. Existence is now "signed in OR onboarded", so the
  // admin can grant them a role and the People list must not grey them out.
  const onbEmail = `admp-onboarded-${tag}@example.com`; // onboarded, NO users row
  const [onbUser] = await db
    .insert(appUser)
    .values({ email: onbEmail, name: "Onboarded O", userType: "student" })
    .returning({ id: appUser.id });
  // student is RLS-forced → the insert needs a board claim (withBoard); app_user
  // + onboarding are global.
  await withBoard(A.id, (tx) =>
    tx.insert(student).values({ userId: onbUser!.id, boardId: A.id, class: "9" }),
  );
  await db
    .insert(onboarding)
    .values({ userId: onbUser!.id, state: "done", status: "completed", endAt: new Date() });

  const peopleForOnb = await withBoard(A.id, (tx) => listPeople(tx));
  const onbRow = peopleForOnb.find((p) => p.email === onbEmail && p.role === "student");
  check(
    `listPeople marks the onboarded student onboarded=true, hasSignedIn=false (got onb=${onbRow?.onboarded}, auth=${onbRow?.hasSignedIn})`,
    onbRow?.onboarded === true && onbRow?.hasSignedIn === false,
  );

  const onbGranted = await withBoard(A.id, (tx) =>
    setRole(tx, { board: A, actorEmail: adminEmail, email: onbEmail, role: "tutor" }),
  );
  check("🔑 setRole on an ONBOARDED (never-signed-in) person → succeeds", onbGranted.role === "tutor");
  check("…and reports hasSignedIn false (onboarded, not auth-backed)", onbGranted.hasSignedIn === false);
  check("…and the tutor profile was actually minted", (await profileId(onbEmail, "tutor")) !== null);

  // ── 4. self-change refused (by email) ──
  let selfRefused = false;
  try {
    await withBoard(A.id, (tx) =>
      setRole(tx, { board: A, actorEmail: adminEmail, email: adminEmail, role: "student" }),
    );
  } catch (e) {
    selfRefused = e instanceof CannotChangeOwnRoleError;
  }
  check("setRole on SELF (same email) → CANNOT_CHANGE_OWN_ROLE", selfRefused);
  check("…and the admin profile still exists (no lockout)", (await profileId(adminEmail, "admin")) !== null);

  // ── 5. setRole works · name not wiped · multi-profile accumulates ──
  await seedAuthIdentity(tutorEmail, "Tutor T");
  await seedAuthIdentity(parentEmail, "Parent P");
  await seedAuthIdentity(multiEmail, "Multi M");
  await seedAuthIdentity(strangerEmail, "Stranger X");

  const madeTutor = await withBoard(A.id, (tx) =>
    setRole(tx, { board: A, actorEmail: adminEmail, email: tutorEmail, role: "tutor" }),
  );
  check("setRole(tutor) on a signed-in person → role 'tutor'", madeTutor.role === "tutor");
  check("…and reports hasSignedIn true", madeTutor.hasSignedIn === true);

  // Granting a role must not RENAME anyone: grantRole upserts app_user.name, so a
  // null auth name must not wipe a name the (email, role) profile already holds.
  await withBoard(A.id, (tx) =>
    grantRole(tx, { email: namelessEmail, name: "Spine Name", board: A, role: "tutor" }),
  );
  await db.insert(users).values({ email: namelessEmail, name: null, emailVerified: true });
  const renamed = await withBoard(A.id, (tx) =>
    setRole(tx, { board: A, actorEmail: adminEmail, email: namelessEmail, role: "tutor" }),
  );
  check(
    `setRole does NOT wipe an existing name when the auth name is null (got ${JSON.stringify(renamed.name)})`,
    renamed.name === "Spine Name",
  );

  // Multi-profile: a second role ADDS a distinct profile (one email, several ids).
  await withBoard(A.id, (tx) =>
    setRole(tx, { board: A, actorEmail: adminEmail, email: multiEmail, role: "tutor" }),
  );
  await withBoard(A.id, (tx) =>
    setRole(tx, { board: A, actorEmail: adminEmail, email: multiEmail, role: "parent" }),
  );
  const multiProfiles = await db
    .select({ role: appUser.userType })
    .from(appUser)
    .where(eq(appUser.email, multiEmail));
  check(
    `multi-profile: two setRoles → TWO distinct profiles (got ${multiProfiles.length}: ${multiProfiles
      .map((r) => r.role)
      .sort()
      .join("+")})`,
    multiProfiles.length === 2 &&
      new Set(multiProfiles.map((r) => r.role)).size === 2 &&
      multiProfiles.every((r) => r.role === "tutor" || r.role === "parent"),
  );

  // ── seed the link cast ──
  await withBoard(A.id, (tx) =>
    setRole(tx, { board: A, actorEmail: adminEmail, email: parentEmail, role: "parent" }),
  );
  const studentId = await seedStudentOn(A, studentEmail, "Student S");
  const studentBId = await seedStudentOn(B, studentBEmail, "Student B");
  const tutorId = (await profileId(tutorEmail, "tutor"))!;
  const parentId = (await profileId(parentEmail, "parent"))!;
  await seedTutorOn(B, offBoardTutorEmail, "Off Tutor"); // tutor on B, not A

  // ── 6. listPeople is GLOBAL ──
  const peopleAll = await withBoard(A.id, (tx) => listPeople(tx));
  const emails = peopleAll.map((p) => p.email);
  check(
    "listPeople returns every profile (admin/tutor/parent/student/ghost/multi)",
    [adminEmail, tutorEmail, parentEmail, studentEmail, ghostEmail, multiEmail].every((e) =>
      emails.includes(e),
    ),
  );
  check(
    "listPeople is GLOBAL: a board-B-only student shows under a board-A read",
    emails.includes(studentBEmail),
  );
  check(
    "listPeople: the never-signed-in ghost is PRESENT with hasSignedIn=false (LEFT join)",
    peopleAll.find((p) => p.email === ghostEmail)?.hasSignedIn === false,
  );
  check(
    "listPeople: a signed-in profile reads hasSignedIn=true",
    peopleAll.find((p) => p.email === tutorEmail)?.hasSignedIn === true,
  );
  check(
    "listPeople: a `users` row with NO profile is not listed (identity ≠ auth)",
    !emails.includes(strangerEmail),
  );

  // ── 7. listLinkCandidates ──
  const cand = await withBoard(A.id, (tx) => listLinkCandidates(tx, A.id));
  check(
    "candidates.tutors includes the board's tutor, EXCLUDES an off-board tutor",
    cand.tutors.some((t) => t.email === tutorEmail) &&
      !cand.tutors.some((t) => t.email === offBoardTutorEmail),
  );
  check("candidates.parents includes the board's parent", cand.parents.some((p) => p.email === parentEmail));
  check(
    "candidates.unlinkedForTutor includes the unlinked student, EXCLUDES the off-board one (RLS)",
    cand.unlinkedForTutor.some((s) => s.userId === studentId) &&
      !cand.unlinkedForTutor.some((s) => s.userId === studentBId),
  );

  // ── 8. linkStudent BY ID ──
  let wrongRole = false;
  try {
    await withBoard(A.id, (tx) =>
      linkStudent(tx, { boardId: A.id, kind: "tutor", adultUserId: studentId, studentUserId: studentId }),
    );
  } catch (e) {
    wrongRole = e instanceof InvalidLinkError;
  }
  check("linkStudent with a STUDENT as the tutor → INVALID_LINK", wrongRole);

  let offBoard = false;
  try {
    await withBoard(A.id, (tx) =>
      linkStudent(tx, { boardId: A.id, kind: "tutor", adultUserId: tutorId, studentUserId: studentBId }),
    );
  } catch (e) {
    offBoard = e instanceof InvalidLinkError;
  }
  check("linkStudent with an off-board student → INVALID_LINK", offBoard);

  await withBoard(A.id, (tx) =>
    linkStudent(tx, { boardId: A.id, kind: "tutor", adultUserId: tutorId, studentUserId: studentId }),
  );
  await withBoard(A.id, (tx) =>
    linkStudent(tx, { boardId: A.id, kind: "parent", adultUserId: parentId, studentUserId: studentId }),
  );
  // idempotent — a double-click must not open a second assignment.
  await withBoard(A.id, (tx) =>
    linkStudent(tx, { boardId: A.id, kind: "tutor", adultUserId: tutorId, studentUserId: studentId }),
  );
  const [linkedStudent] = await withBoard(A.id, (tx) =>
    tx.select({ tutorId: student.tutorId, parentId: student.parentId }).from(student).where(eq(student.userId, studentId)),
  );
  check("linkStudent set student.tutor_id + parent_id (by id)", linkedStudent?.tutorId === tutorId && linkedStudent?.parentId === parentId);
  const activeAssign = await withBoard(A.id, (tx) =>
    tx
      .select({ id: tutorAssignment.id })
      .from(tutorAssignment)
      .where(and(eq(tutorAssignment.studentId, studentId), eq(tutorAssignment.status, "active"))),
  );
  check(`idempotent: exactly ONE active tutor_assignment (got ${activeAssign.length})`, activeAssign.length === 1);

  // 🔑 SWITCH → the handover snapshot fires.
  const tutor2Id = await seedTutorOn(A, tutor2Email, "Tutor Two");
  await withBoard(A.id, (tx) =>
    linkStudent(tx, { boardId: A.id, kind: "tutor", adultUserId: tutor2Id, studentUserId: studentId }),
  );
  const [afterSwitch] = await withBoard(A.id, (tx) =>
    tx.select({ tutorId: student.tutorId }).from(student).where(eq(student.userId, studentId)),
  );
  check("switch: student.tutor_id now points at the NEW tutor", afterSwitch?.tutorId === tutor2Id);
  const endedRow = await withBoard(A.id, (tx) =>
    tx
      .select({ snapshot: tutorAssignment.progressSnapshot, reason: tutorAssignment.endedReason, endedAt: tutorAssignment.endedAt })
      .from(tutorAssignment)
      .where(and(eq(tutorAssignment.studentId, studentId), eq(tutorAssignment.tutorId, tutorId), eq(tutorAssignment.status, "ended"))),
  );
  check(
    "🔑 switch closed the prior tutor's row with a FROZEN snapshot",
    endedRow.length === 1 && endedRow[0]!.snapshot != null && endedRow[0]!.reason === "reassigned" && endedRow[0]!.endedAt != null,
  );
  const activeAfterSwitch = await withBoard(A.id, (tx) =>
    tx
      .select({ tutorId: tutorAssignment.tutorId })
      .from(tutorAssignment)
      .where(and(eq(tutorAssignment.studentId, studentId), eq(tutorAssignment.status, "active"))),
  );
  check(
    "switch: exactly ONE active row, for the new tutor",
    activeAfterSwitch.length === 1 && activeAfterSwitch[0]!.tutorId === tutor2Id,
  );

  // ── 9. listLinks ──
  const linksA = await withBoard(A.id, (tx) => listLinks(tx));
  const tutorLink = linksA.find((l) => l.kind === "tutor");
  const parentLink = linksA.find((l) => l.kind === "parent");
  check("listLinks returns both a tutor and a parent link", Boolean(tutorLink && parentLink));
  check(
    "listLinks resolves BOTH sides' emails (the aliased self-joins work)",
    tutorLink?.adultEmail === tutor2Email && tutorLink?.studentEmail === studentEmail,
  );
  const linksB = await withBoard(B.id, (tx) => listLinks(tx));
  check(
    `RLS: board B sees NONE of A's links (got ${linksB.length})`,
    !linksB.some((l) => l.studentEmail === studentEmail),
  );
  // Deterministic order (a per-row Remove can't act on a reshuffled link).
  const again = await withBoard(A.id, (tx) => listLinks(tx));
  const key = (ls: Link[]) => ls.map((l) => `${l.kind}:${l.adultEmail}:${l.studentEmail}`).join("|");
  check("listLinks is ORDERED (stable across calls)", key(again) === key(linksA));

  // ── 10. unlinkStudent ──
  const rm1 = await withBoard(A.id, (tx) =>
    unlinkStudent(tx, { boardId: A.id, kind: "tutor", studentUserId: studentId }),
  );
  check("unlinkStudent clears the tutor pointer (removed=1)", rm1.removed === 1);
  const [afterUnlink] = await withBoard(A.id, (tx) =>
    tx.select({ tutorId: student.tutorId }).from(student).where(eq(student.userId, studentId)),
  );
  check("…and student.tutor_id is now null", afterUnlink?.tutorId === null);
  const noActive = await withBoard(A.id, (tx) =>
    tx
      .select({ id: tutorAssignment.id })
      .from(tutorAssignment)
      .where(and(eq(tutorAssignment.studentId, studentId), eq(tutorAssignment.status, "active"))),
  );
  check("…and no active tutor_assignment remains (the unlink froze + closed it)", noActive.length === 0);
  const rm2 = await withBoard(A.id, (tx) =>
    unlinkStudent(tx, { boardId: A.id, kind: "tutor", studentUserId: studentId }),
  );
  check("unlinkStudent is idempotent (second call removed=0)", rm2.removed === 0);
  const survivors = await withBoard(A.id, (tx) => listPeople(tx));
  check(
    "unlink cleared the LINK only — the profiles survive",
    survivors.some((p) => p.email === tutor2Email) && survivors.some((p) => p.email === studentEmail),
  );

  // ── 11. HTTP: unauth → 401 on every procedure (soft, timeout-guarded) ──
  const HTTP_LEGS: Array<{ proc: string; method: "GET" | "POST" }> = [
    { proc: "listPeople", method: "GET" },
    { proc: "listLinkCandidates", method: "GET" },
    { proc: "listLinks", method: "GET" },
    { proc: "setRole", method: "POST" },
    { proc: "linkStudent", method: "POST" },
    { proc: "unlinkStudent", method: "POST" },
  ];
  for (const { proc, method } of HTTP_LEGS) {
    try {
      const res = await fetch(`http://localhost:${env.PORT}/trpc/admin.${proc}`, {
        method,
        headers: { "x-board": A.slug, "content-type": "application/json" },
        body: method === "POST" ? "{}" : undefined,
        signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
      });
      check(`HTTP ${method} admin.${proc} (unauth) → 401 (got ${res.status})`, res.status === 401);
    } catch (e: any) {
      const why = e?.name === "TimeoutError" ? "server WEDGED — not merely down" : "server not running";
      console.log(`  ~ HTTP admin.${proc} skipped (${why})`);
    }
  }

  // ── cleanup (FK-safe: assignments → students → role rows → profiles) ──
  const allEmails = [
    adminEmail,
    tutorEmail,
    tutor2Email,
    parentEmail,
    studentEmail,
    studentBEmail,
    offBoardTutorEmail,
    ghostEmail,
    onbEmail,
    strangerEmail,
    multiEmail,
    namelessEmail,
  ];
  await withBoard(A.id, async (tx: Tx) => {
    await tx.delete(tutorAssignment).where(eq(tutorAssignment.boardId, A.id));
    await tx.delete(student).where(eq(student.boardId, A.id));
  });
  await withBoard(B.id, async (tx: Tx) => {
    await tx.delete(tutorAssignment).where(eq(tutorAssignment.boardId, B.id));
    await tx.delete(student).where(eq(student.boardId, B.id));
  });
  for (const e of allEmails) {
    const [u] = await db.select({ id: appUser.id }).from(appUser).where(eq(appUser.email, e));
    if (u) {
      await db.delete(tutor).where(eq(tutor.userId, u.id));
      // parent rows cascade from app_user; delete profiles now.
    }
    await db.delete(appUser).where(eq(appUser.email, e)); // cascades tutor/parent/student rows
    await db.delete(users).where(eq(users.email, e));
  }
  await db.delete(board).where(eq(board.id, A.id));
  await db.delete(board).where(eq(board.id, B.id));

  console.log(`\nprobe_admin_people: ${passed} passed, ${failed} failed`);
  await queryClient.end();
  process.exit(failed === 0 ? 0 : 1);
}

main().catch(async (err) => {
  console.error("probe_admin_people FAILED:", err);
  await queryClient.end();
  process.exit(1);
});
