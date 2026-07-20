/**
 * probe_assignment — Slice ASG exit gate (the compose→assign loop; D-SCH-2's
 * deferred half). Proves the assignment service + the startSession link against
 * the real DB + real RLS, using a THROWAWAY fixture (unique boards P/Q per run)
 * so the canonical seeds stay pristine (M22). Cleans up after itself.
 *
 * Fixture (board P): subject S1 (Physics) with chapters C1 [P1, P2] + C2 [P3];
 * subject S2 (Bio) with chapter C3 [P4]. Questions seeded on P1/P2/P3 so the
 * student can execute. Tutor TU linked to student ST; ST2 a second student
 * (unlinked) for ownership/foreign-assignment checks.
 *
 *  1. DB connectivity.
 *  2. real flow: tutor role='tutor' (M11 SET side), tutor_student link made.
 *  3. createAssignment OWNERSHIP: unlinked student → StudentNotFoundError.
 *  4. interleaved VALID (cross-chapter, one subject): [P1,P3] → mode/subject/2 STs.
 *  5. interleaved INVALID (spans subjects): [P1,P4] → InvalidAssignmentError.
 *  6. blocked VALID (one chapter): chapter C1 [P1,P2] → mode/chapter/2 STs.
 *  7. blocked INVALID (spans chapters): [P1,P3] → InvalidAssignmentError.
 *  8. empty composition → InvalidAssignmentError.
 *  9. tutor listAssignments → the 2 valid ones, all not_started, progress 0/n.
 * 10. student listAssignments → the same 2 are visible to ST.
 * 11. EXECUTION: startSession({assignmentId}) → origin 'tutor_assigned' + link
 *     set; resume returns the SAME session (idempotent).
 * 12. guard: startSession assignmentId + sub_topic NOT in it → InvalidAssignmentError.
 * 13. guard: startSession a foreign student's assignment → AssignmentNotFoundError.
 * 14. self-serve DISTINCT: startSession(no assignmentId) on the same sub_topic →
 *     origin 'self_serve', assignmentId null, a DIFFERENT session id.
 * 15. progress (D-ASG-3): mark the assigned sessions completed → tutor/student
 *     listAssignments reflect completedCount + completed=true derived.
 * 16. RLS cross-board: createAssignment under board Q → StudentNotFoundError;
 *     student listAssignments under Q → empty.
 * 17. HTTP: tutor.listAssignments no session → 401 (soft).
 */
import { and, eq, sql } from "drizzle-orm";
import type { PgTransaction } from "drizzle-orm/pg-core";
import {
  appUser,
  assignment,
  attempt,
  board,
  chapter,
  membership,
  practiceSession,
  question,
  subTopic,
  subject,
  topic,
  tutorStudent,
} from "@b2c/kernel/schema";
import { db, queryClient } from "../src/db/client";
import { withBoard } from "../src/db/with-board";
import { grantRole } from "../src/services/membership";
import {
  AssignmentNotFoundError,
  createAssignment,
  InvalidAssignmentError,
  listAssignmentsForStudent,
  listAssignmentsForTutor,
} from "../src/services/assignment";
import { startSession } from "../src/services/practice";
import { StudentNotFoundError } from "../src/services/tutor";
import { env } from "../src/config/env";

type Tx = PgTransaction<any, any, any>;

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

async function expectThrow<T>(fn: () => Promise<unknown>, ctor: new (...a: any[]) => T): Promise<boolean> {
  try {
    await fn();
    return false;
  } catch (e) {
    return e instanceof ctor;
  }
}

async function main() {
  const tag = `${Date.now()}`;

  // 1. connectivity
  await db.execute(sql`select 1`);
  check("DB connectivity (select 1) as app role", true);

  const [P] = await db.insert(board).values({ slug: `pasg-p-${tag}`, name: "Probe P" }).returning();
  const [Q] = await db.insert(board).values({ slug: `pasg-q-${tag}`, name: "Probe Q" }).returning();
  if (!P || !Q) throw new Error("board seed failed");

  // Spine + seeded questions under P.
  const fx = await withBoard(P.id, async (tx: Tx) => {
    const [s1] = await tx.insert(subject).values({ boardId: P.id, slug: "phys", name: "Physics", grade: "IGCSE" }).returning();
    const [s2] = await tx.insert(subject).values({ boardId: P.id, slug: "bio", name: "Biology", grade: "IGCSE" }).returning();
    const [c1] = await tx.insert(chapter).values({ boardId: P.id, subjectId: s1!.id, slug: "c1", name: "Ch1", ordinal: 1 }).returning();
    const [c2] = await tx.insert(chapter).values({ boardId: P.id, subjectId: s1!.id, slug: "c2", name: "Ch2", ordinal: 2 }).returning();
    const [c3] = await tx.insert(chapter).values({ boardId: P.id, subjectId: s2!.id, slug: "c3", name: "Ch3", ordinal: 1 }).returning();
    const [t1] = await tx.insert(topic).values({ boardId: P.id, chapterId: c1!.id, slug: "t1", name: "T1", ordinal: 1 }).returning();
    const [t2] = await tx.insert(topic).values({ boardId: P.id, chapterId: c2!.id, slug: "t2", name: "T2", ordinal: 1 }).returning();
    const [t3] = await tx.insert(topic).values({ boardId: P.id, chapterId: c3!.id, slug: "t3", name: "T3", ordinal: 1 }).returning();
    const st = async (topicId: string, slug: string, name: string, ordinal: number) =>
      (await tx.insert(subTopic).values({ boardId: P.id, topicId, slug, name, ordinal }).returning())[0]!.id;
    const P1 = await st(t1!.id, "p1", "ST P1", 1);
    const P2 = await st(t1!.id, "p2", "ST P2", 2);
    const P3 = await st(t2!.id, "p3", "ST P3", 1);
    const P4 = await st(t3!.id, "p4", "ST P4", 1);
    // 2 questions each on P1/P2/P3 (so the student can execute).
    for (const stId of [P1, P2, P3]) {
      for (const ord of [1, 2]) {
        await tx.insert(question).values({
          boardId: P.id, subTopicId: stId, axis: "conceptual", kind: "subjective",
          stem: `Q${ord} on ${stId}`, referenceAnswer: "ref", explanation: null,
          ordinal: ord, source: "b2c_authoring",
        });
      }
    }
    return { s1: s1!.id, s2: s2!.id, c1: c1!.id, P1, P2, P3, P4 };
  });

  // tutor TU + students ST/ST2 via the REAL flow; TU↔ST linked.
  const emailTU = `pasg-tu-${tag}@example.com`;
  const emailST = `pasg-st-${tag}@example.com`;
  const emailST2 = `pasg-st2-${tag}@example.com`;
  const TU = await withBoard(P.id, (tx) => grantRole(tx, { email: emailTU, name: "Tutor", board: P, role: "tutor" }));
  const ST = await withBoard(P.id, (tx) => grantRole(tx, { email: emailST, name: "Student", board: P, role: "student" }));
  const ST2 = await withBoard(P.id, (tx) => grantRole(tx, { email: emailST2, name: "Student2", board: P, role: "student" }));
  const tutorUserId = TU.user.id;
  const studentId = ST.user.id;
  const student2Id = ST2.user.id;
  check("real flow: tutor role = 'tutor' (M11 SET side)", TU.role === "tutor");
  await withBoard(P.id, (tx) => tx.insert(tutorStudent).values({ boardId: P.id, tutorId: tutorUserId, studentId }));
  check("tutor_student link made (ST linked, ST2 not)", true);

  // 3. ownership: unlinked student → StudentNotFoundError
  check(
    "createAssignment(unlinked student) → StudentNotFoundError",
    await expectThrow(
      () => withBoard(P.id, (tx) => createAssignment(tx, {
        boardId: P.id, tutorUserId, studentId: student2Id,
        mode: "interleaved", subjectId: fx.s1, subTopicIds: [fx.P1, fx.P3],
      })),
      StudentNotFoundError,
    ),
  );

  // 4. interleaved VALID (cross-chapter, one subject)
  const inter = await withBoard(P.id, (tx) => createAssignment(tx, {
    boardId: P.id, tutorUserId, studentId,
    mode: "interleaved", subjectId: fx.s1, subTopicIds: [fx.P1, fx.P3],
  }));
  check("interleaved VALID: mode='interleaved', subjectName set, total 2",
    inter.mode === "interleaved" && inter.subjectName === "Physics" && inter.total === 2);
  check("interleaved VALID: chapterName null, all not_started, completed false",
    inter.chapterName === null &&
    inter.subTopics.every((s) => s.sessionStatus === "not_started") &&
    inter.completed === false && inter.completedCount === 0);
  check("interleaved VALID: composition order preserved [P1,P3]",
    inter.subTopics[0]?.subTopicId === fx.P1 && inter.subTopics[1]?.subTopicId === fx.P3);

  // 5. interleaved INVALID (spans subjects)
  check(
    "interleaved INVALID (spans subjects [P1,P4]) → InvalidAssignmentError",
    await expectThrow(
      () => withBoard(P.id, (tx) => createAssignment(tx, {
        boardId: P.id, tutorUserId, studentId,
        mode: "interleaved", subjectId: fx.s1, subTopicIds: [fx.P1, fx.P4],
      })),
      InvalidAssignmentError,
    ),
  );

  // 6. blocked VALID (one chapter)
  const blocked = await withBoard(P.id, (tx) => createAssignment(tx, {
    boardId: P.id, tutorUserId, studentId,
    mode: "blocked", chapterId: fx.c1, subTopicIds: [fx.P1, fx.P2],
  }));
  check("blocked VALID: mode='blocked', chapterName set, subjectName null, total 2",
    blocked.mode === "blocked" && blocked.chapterName === "Ch1" &&
    blocked.subjectName === null && blocked.total === 2);

  // 7. blocked INVALID (spans chapters)
  check(
    "blocked INVALID (spans chapters [P1,P3]) → InvalidAssignmentError",
    await expectThrow(
      () => withBoard(P.id, (tx) => createAssignment(tx, {
        boardId: P.id, tutorUserId, studentId,
        mode: "blocked", chapterId: fx.c1, subTopicIds: [fx.P1, fx.P3],
      })),
      InvalidAssignmentError,
    ),
  );

  // 8. empty composition
  check(
    "empty composition → InvalidAssignmentError",
    await expectThrow(
      () => withBoard(P.id, (tx) => createAssignment(tx, {
        boardId: P.id, tutorUserId, studentId, mode: "blocked", chapterId: fx.c1, subTopicIds: [],
      })),
      InvalidAssignmentError,
    ),
  );

  // 9. tutor listAssignments
  const tutorList = await withBoard(P.id, (tx) => listAssignmentsForTutor(tx, { tutorUserId, studentId }));
  check("tutor listAssignments → 2 (the valid interleaved + blocked)", tutorList.length === 2);
  check("tutor listAssignments: all not_started, completedCount 0",
    tutorList.every((a) => a.completedCount === 0 && !a.completed));

  // 10. student listAssignments
  const studentList = await withBoard(P.id, (tx) => listAssignmentsForStudent(tx, { appUserId: studentId }));
  check("student listAssignments → 2 visible to ST", studentList.length === 2);

  // 11. EXECUTION: start an assigned session → origin + link
  const sess = await withBoard(P.id, (tx) => startSession(tx, {
    boardId: P.id, appUserId: studentId, subTopicId: fx.P1, assignmentId: inter.id,
  }));
  const [sessRow] = await withBoard(P.id, (tx) =>
    tx.select().from(practiceSession).where(eq(practiceSession.id, sess.sessionId)).limit(1));
  check("startSession(assignmentId) → origin 'tutor_assigned' + assignmentId set",
    sessRow?.origin === "tutor_assigned" && sessRow?.assignmentId === inter.id);
  const sessResume = await withBoard(P.id, (tx) => startSession(tx, {
    boardId: P.id, appUserId: studentId, subTopicId: fx.P1, assignmentId: inter.id,
  }));
  check("startSession(assignmentId) resume → same session (idempotent)",
    sessResume.sessionId === sess.sessionId);

  // 12. guard: sub_topic not in the assignment
  check(
    "startSession assignmentId + sub_topic NOT in it → InvalidAssignmentError",
    await expectThrow(
      () => withBoard(P.id, (tx) => startSession(tx, {
        boardId: P.id, appUserId: studentId, subTopicId: fx.P4, assignmentId: inter.id,
      })),
      InvalidAssignmentError,
    ),
  );

  // 13. guard: foreign student's assignment
  check(
    "startSession a foreign student's assignment → AssignmentNotFoundError",
    await expectThrow(
      () => withBoard(P.id, (tx) => startSession(tx, {
        boardId: P.id, appUserId: student2Id, subTopicId: fx.P1, assignmentId: inter.id,
      })),
      AssignmentNotFoundError,
    ),
  );

  // 14. self-serve DISTINCT (no assignmentId) on the same sub_topic
  const selfSess = await withBoard(P.id, (tx) => startSession(tx, {
    boardId: P.id, appUserId: studentId, subTopicId: fx.P1,
  }));
  const [selfRow] = await withBoard(P.id, (tx) =>
    tx.select().from(practiceSession).where(eq(practiceSession.id, selfSess.sessionId)).limit(1));
  check("self-serve startSession → origin 'self_serve', assignmentId null, DISTINCT session",
    selfRow?.origin === "self_serve" && selfRow?.assignmentId === null &&
    selfSess.sessionId !== sess.sessionId);

  // 15. progress (D-ASG-3): complete the assigned sessions, derived completion.
  // Start P3's assigned session, then mark both P1+P3 sessions completed.
  await withBoard(P.id, (tx) => startSession(tx, {
    boardId: P.id, appUserId: studentId, subTopicId: fx.P3, assignmentId: inter.id,
  }));
  await withBoard(P.id, (tx) =>
    tx.update(practiceSession).set({ status: "completed" })
      .where(and(eq(practiceSession.assignmentId, inter.id), eq(practiceSession.appUserId, studentId))));
  const afterP1 = await withBoard(P.id, (tx) => listAssignmentsForTutor(tx, { tutorUserId, studentId }));
  const interAfter = afterP1.find((a) => a.id === inter.id);
  check("progress: interleaved completedCount 2/2, completed=true (D-ASG-3)",
    interAfter?.completedCount === 2 && interAfter?.total === 2 && interAfter?.completed === true);
  check("progress: per-sub_topic sessionStatus 'completed'",
    interAfter?.subTopics.every((s) => s.sessionStatus === "completed") === true);

  // 16. RLS cross-board
  check(
    "RLS: createAssignment under board Q → StudentNotFoundError",
    await expectThrow(
      () => withBoard(Q.id, (tx) => createAssignment(tx, {
        boardId: Q.id, tutorUserId, studentId, mode: "interleaved", subjectId: fx.s1, subTopicIds: [fx.P1, fx.P3],
      })),
      StudentNotFoundError,
    ),
  );
  const crossList = await withBoard(Q.id, (tx) => listAssignmentsForStudent(tx, { appUserId: studentId }));
  check("RLS: student listAssignments under board Q → empty", crossList.length === 0);

  // 17. HTTP no-session → 401 (soft)
  try {
    const res = await fetch(
      `http://localhost:${env.PORT}/trpc/tutor.listAssignments?input=${encodeURIComponent(JSON.stringify({ json: { studentId } }))}`,
      { headers: { "x-board": P.slug } },
    );
    check(`HTTP tutor.listAssignments (no session) → 401 (got ${res.status})`, res.status === 401);
  } catch {
    console.log("  ~ HTTP tutor.listAssignments skipped (server not running)");
  }

  // ── cleanup (FK-safe order) ──
  await withBoard(P.id, async (tx: Tx) => {
    await tx.delete(attempt).where(eq(attempt.boardId, P.id));
    await tx.delete(practiceSession).where(eq(practiceSession.boardId, P.id));
    await tx.delete(assignment).where(eq(assignment.boardId, P.id));
    await tx.delete(question).where(eq(question.boardId, P.id));
    await tx.delete(tutorStudent).where(eq(tutorStudent.boardId, P.id));
    await tx.delete(subTopic).where(eq(subTopic.boardId, P.id));
    await tx.delete(topic).where(eq(topic.boardId, P.id));
    await tx.delete(chapter).where(eq(chapter.boardId, P.id));
    await tx.delete(subject).where(eq(subject.boardId, P.id));
    await tx.delete(membership).where(eq(membership.boardId, P.id));
  });
  await db.delete(appUser).where(eq(appUser.email, emailTU));
  await db.delete(appUser).where(eq(appUser.email, emailST));
  await db.delete(appUser).where(eq(appUser.email, emailST2));
  await db.delete(board).where(eq(board.id, P.id));
  await db.delete(board).where(eq(board.id, Q.id));

  console.log(`\nprobe_assignment: ${passed} passed, ${failed} failed`);
  await queryClient.end();
  process.exit(failed === 0 ? 0 : 1);
}

main().catch(async (err) => {
  console.error("probe_assignment FAILED:", err);
  await queryClient.end();
  process.exit(1);
});
