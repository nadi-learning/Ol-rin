/**
 * probe_assign_on_approve — Slice ASG-AUTO exit gate. Proves assignApprovedQuestions
 * (auto-assign on approve) against the real DB + real RLS with a THROWAWAY fixture
 * (unique board per run, M22). Cleans up after itself.
 *
 * Fixture (board P): subject S1 (Physics) chapters C1 [P1, P2, P5] + C2 [P3];
 * subject S2 (Bio) chapter C3 [P4]. Tutor TU linked to student ST; ST2 unlinked.
 * Draft questions are seeded PRIVATE (target_student_id = ST) — assign derives the
 * student from the questions.
 *
 *  1. DB connectivity.
 *  2. CREATE on first approve (blocked): approve a P1 question → 1 assignment,
 *     chapter C1, composition [P1].
 *  3. NO-OP find-and-extend: approve another P1 question → SAME assignment, still
 *     [P1], still exactly 1 assignment (the question just joins the live pool).
 *  4. EXTEND same chapter: approve a P2 question → the SAME assignment grows to
 *     [P1, P2]; still 1 assignment total.
 *  5. SPLIT per chapter: approve a batch [P1 (C1), P3 (C2)] → C1 no-ops (P1 already
 *     in it), a NEW C2 assignment [P3] is created → 2 assignments total.
 *  6. COMPLETED → fresh: complete the C1 assignment (both sessions), then approve a
 *     NEW C1 sub_topic P5 → a SECOND C1 assignment [P5] is created (finished work
 *     is not resurrected) → 2 C1 assignments.
 *  7. INTERLEAVED anchor = subject: approve a batch [P1 (C1), P3 (C2)] in
 *     interleaved mode → ONE assignment, subjectName set, chapterName null,
 *     composition [P1, P3] (separate from the blocked ones — mode-scoped).
 *  8. MIXED-student batch → [] (not auto-assigned; authored drafts are private).
 *  9. OWNERSHIP: a batch targeting the UNLINKED student → StudentNotFoundError.
 * 10. RLS cross-board: assign under board Q → [] (questions invisible, no leak).
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
  assignApprovedQuestions,
  listAssignmentsForTutor,
} from "../src/services/assignment";
import { startSession } from "../src/services/practice";
import { StudentNotFoundError } from "../src/services/tutor";

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

  await db.execute(sql`select 1`);
  check("DB connectivity (select 1) as app role", true);

  const [P] = await db.insert(board).values({ slug: `paoa-p-${tag}`, name: "Probe P" }).returning();
  const [Q] = await db.insert(board).values({ slug: `paoa-q-${tag}`, name: "Probe Q" }).returning();
  if (!P || !Q) throw new Error("board seed failed");

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
    const P5 = await st(t1!.id, "p5", "ST P5", 3);
    const P3 = await st(t2!.id, "p3", "ST P3", 1);
    const P4 = await st(t3!.id, "p4", "ST P4", 1);
    return { s1: s1!.id, s2: s2!.id, c1: c1!.id, c2: c2!.id, P1, P2, P3, P4, P5 };
  });

  const emailTU = `paoa-tu-${tag}@example.com`;
  const emailST = `paoa-st-${tag}@example.com`;
  const emailST2 = `paoa-st2-${tag}@example.com`;
  const TU = await withBoard(P.id, (tx) => grantRole(tx, { email: emailTU, name: "Tutor", board: P, role: "tutor" }));
  const ST = await withBoard(P.id, (tx) => grantRole(tx, { email: emailST, name: "Student", board: P, role: "student" }));
  const ST2 = await withBoard(P.id, (tx) => grantRole(tx, { email: emailST2, name: "Student2", board: P, role: "student" }));
  const tutorUserId = TU.user.id;
  const studentId = ST.user.id;
  const student2Id = ST2.user.id;
  await withBoard(P.id, (tx) => tx.insert(tutorStudent).values({ boardId: P.id, tutorId: tutorUserId, studentId }));

  // Seed a PRIVATE approved question on a sub_topic for a given student; returns id.
  let ord = 0;
  const seedQ = (subTopicId: string, target: string) =>
    withBoard(P.id, async (tx: Tx) =>
      (
        await tx
          .insert(question)
          .values({
            boardId: P.id, subTopicId, axis: "conceptual", kind: "subjective",
            stem: `Q on ${subTopicId} #${++ord}`, referenceAnswer: "ref", explanation: null,
            ordinal: ord, source: "b2c_authoring", status: "approved", targetStudentId: target,
          })
          .returning()
      )[0]!.id,
    );
  const assign = (mode: "blocked" | "interleaved", questionIds: string[], boardId = P.id) =>
    withBoard(boardId, (tx) => assignApprovedQuestions(tx, { boardId, tutorUserId, mode, questionIds }));
  const tutorAssignments = () =>
    withBoard(P.id, (tx) => listAssignmentsForTutor(tx, { tutorUserId, studentId }));

  // 2. CREATE on first approve (blocked)
  const q1 = await seedQ(fx.P1, studentId);
  const r2 = await assign("blocked", [q1]);
  check("CREATE: first approve → 1 assignment, chapter C1, composition [P1]",
    r2.length === 1 && r2[0]!.chapterName === "Ch1" && r2[0]!.subjectName === null &&
    r2[0]!.subTopics.length === 1 && r2[0]!.subTopics[0]!.subTopicId === fx.P1);
  const asgId = r2[0]!.id;
  check("CREATE: exactly 1 assignment for the student", (await tutorAssignments()).length === 1);

  // 3. NO-OP find-and-extend (same sub_topic)
  const q2 = await seedQ(fx.P1, studentId);
  const r3 = await assign("blocked", [q2]);
  check("NO-OP: re-approve same sub_topic → SAME assignment id, still [P1]",
    r3.length === 1 && r3[0]!.id === asgId && r3[0]!.subTopics.length === 1);
  check("NO-OP: still exactly 1 assignment", (await tutorAssignments()).length === 1);

  // 4. EXTEND same chapter (new sub_topic)
  const q3 = await seedQ(fx.P2, studentId);
  const r4 = await assign("blocked", [q3]);
  check("EXTEND: new sub_topic same chapter → SAME assignment grows to [P1, P2]",
    r4.length === 1 && r4[0]!.id === asgId &&
    r4[0]!.subTopics.map((s) => s.subTopicId).join(",") === `${fx.P1},${fx.P2}`);
  check("EXTEND: still exactly 1 assignment", (await tutorAssignments()).length === 1);

  // 5. SPLIT per chapter (multi-chapter batch)
  const q4 = await seedQ(fx.P1, studentId); // C1 (already in the assignment)
  const q5 = await seedQ(fx.P3, studentId); // C2 (new)
  const r5 = await assign("blocked", [q4, q5]);
  const c2asg = r5.find((a) => a.chapterName === "Ch2");
  check("SPLIT: multi-chapter batch → a NEW C2 assignment [P3]",
    !!c2asg && c2asg.subTopics.length === 1 && c2asg.subTopics[0]!.subTopicId === fx.P3);
  check("SPLIT: 2 assignments total (C1 extended-or-noop + new C2)",
    (await tutorAssignments()).length === 2);

  // 6. COMPLETED → fresh assignment
  for (const stId of [fx.P1, fx.P2]) {
    await withBoard(P.id, (tx) => startSession(tx, { boardId: P.id, appUserId: studentId, subTopicId: stId, assignmentId: asgId }));
  }
  await withBoard(P.id, (tx) =>
    tx.update(practiceSession).set({ status: "completed" })
      .where(and(eq(practiceSession.assignmentId, asgId), eq(practiceSession.appUserId, studentId))));
  const c1done = (await tutorAssignments()).find((a) => a.id === asgId);
  check("COMPLETED: C1 assignment derived completed=true (precondition)", c1done?.completed === true);
  const q6 = await seedQ(fx.P5, studentId); // new C1 sub_topic
  const r6 = await assign("blocked", [q6]);
  check("COMPLETED: approving a new C1 sub_topic → a DIFFERENT (fresh) C1 assignment",
    r6.length === 1 && r6[0]!.id !== asgId && r6[0]!.chapterName === "Ch1" &&
    r6[0]!.subTopics[0]!.subTopicId === fx.P5);
  const c1count = (await tutorAssignments()).filter((a) => a.chapterName === "Ch1").length;
  check("COMPLETED: now 2 C1 assignments (finished one untouched)", c1count === 2);

  // 7. INTERLEAVED anchor = subject
  const q7 = await seedQ(fx.P1, studentId);
  const q8 = await seedQ(fx.P3, studentId);
  const r7 = await assign("interleaved", [q7, q8]);
  check("INTERLEAVED: cross-chapter same-subject batch → ONE assignment",
    r7.length === 1 && r7[0]!.mode === "interleaved" && r7[0]!.subjectName === "Physics" &&
    r7[0]!.chapterName === null &&
    r7[0]!.subTopics.map((s) => s.subTopicId).join(",") === `${fx.P1},${fx.P3}`);

  // 8. MIXED-student batch → []
  const qA = await seedQ(fx.P1, studentId);
  const qB = await seedQ(fx.P1, student2Id);
  const r8 = await assign("blocked", [qA, qB]);
  check("MIXED-student batch → not auto-assigned ([])", r8.length === 0);

  // 9. OWNERSHIP: batch targeting the unlinked student
  const qC = await seedQ(fx.P1, student2Id);
  check("OWNERSHIP: batch → unlinked student → StudentNotFoundError",
    await expectThrow(() => assign("blocked", [qC]), StudentNotFoundError));

  // 10. RLS cross-board: questions invisible under Q → []
  const r10 = await assign("blocked", [q1], Q.id);
  check("RLS: assign under board Q → [] (questions invisible, no leak)", r10.length === 0);

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

  console.log(`\nprobe_assign_on_approve: ${passed} passed, ${failed} failed`);
  await queryClient.end();
  process.exit(failed === 0 ? 0 : 1);
}

main().catch(async (err) => {
  console.error("probe_assign_on_approve FAILED:", err);
  await queryClient.end();
  process.exit(1);
});
