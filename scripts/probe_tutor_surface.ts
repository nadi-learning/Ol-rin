/**
 * probe_tutor_surface — Slice T exit gate (Tutor read surface, NO mastery move).
 *
 * Proves the tutor.* read service against the real DB + real RLS, using a
 * THROWAWAY fixture (unique per-run boards P/Q) so the canonical seeds stay
 * pristine (M22). Cleans up after itself.
 *
 *   1. DB connectivity as the app role.
 *   2. ROLE gate both sides (M11): assertTutor('student') throws TutorOnlyError;
 *      assertTutor('tutor') passes. Memberships created via the REAL grantRole
 *      flow (the SET side), not a direct insert.
 *   3. listStudents → only the tutor's LINKED students (S1 linked, S2 not).
 *   4. OWNERSHIP: tutor reads for an UNLINKED student (S2) → StudentNotFoundError
 *      across getStudentMastery / listPendingStage2 / getObservations.
 *   5. PENDING worklist (the core query, D-T-2 "since last finalize"):
 *      - subTopicA: 3 obs, NO mastery        → pendingCount 3
 *      - subTopicB: 2 obs, mastery AFTER both → excluded (0 pending)
 *      - subTopicC: 3 obs, mastery BETWEEN    → pendingCount 2 (only the newer)
 *      worklist = [A(3), C(2)] ordinal-ordered, B absent.
 *   6. getObservations(A) → 3 projected rows, createdAt-ordered, with reasoning/
 *      level/axis (and NO answer-key fields — observations never carry them).
 *   7. getStudentMastery → the certified pair + description for B and C.
 *   8. RLS cross-board: listStudents under board Q → empty (links invisible);
 *      a per-student read under Q → StudentNotFoundError.
 *   9. HTTP: tutor.listStudents no session → 401 (soft).
 */
import { and, eq, sql } from "drizzle-orm";
import type { PgTransaction } from "drizzle-orm/pg-core";
import {
  appUser,
  attempt,
  attemptImage,
  board,
  chapter,
  eventLog,
  masteryState,
  membership,
  observation,
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
  assertTutor,
  getObservations,
  getSubTopicQuestions,
  getStudentMastery,
  listPendingStage2,
  listStudents,
  ObservationNotFoundError,
  OBSERVATION_OVERRIDE_EVENT,
  overrideObservation,
  StudentNotFoundError,
  TutorOnlyError,
} from "../src/services/tutor";
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

const STAGE1 = "stage1_scorer";

async function main() {
  const tag = `${Date.now()}`;
  const base = Date.now();
  const at = (offsetMs: number) => new Date(base + offsetMs);

  // 1. connectivity
  await db.execute(sql`select 1`);
  check("DB connectivity (select 1) as app role", true);

  const [P] = await db.insert(board).values({ slug: `prt-p-${tag}`, name: "Probe P" }).returning();
  const [Q] = await db.insert(board).values({ slug: `prt-q-${tag}`, name: "Probe Q" }).returning();
  if (!P || !Q) throw new Error("board seed failed");

  // 2. ROLE gate both sides (the CHECK side, M11)
  let tutorOnlyThrew = false;
  try {
    assertTutor("student");
  } catch (e) {
    tutorOnlyThrew = e instanceof TutorOnlyError;
  }
  check("assertTutor('student') → TutorOnlyError (non-tutor blocked)", tutorOnlyThrew);
  let tutorPasses = true;
  try {
    assertTutor("tutor");
  } catch {
    tutorPasses = false;
  }
  check("assertTutor('tutor') → passes", tutorPasses);

  // Fixture under P: spine (3 sub_topics A/B/C) + tutor + 2 students.
  const fx = await withBoard(P.id, async (tx: Tx) => {
    const [subj] = await tx.insert(subject).values({ boardId: P.id, slug: "phys", name: "Physics", grade: "IGCSE" }).returning();
    const [chap] = await tx.insert(chapter).values({ boardId: P.id, subjectId: subj!.id, slug: "ch", name: "Ch", ordinal: 1 }).returning();
    const [tp] = await tx.insert(topic).values({ boardId: P.id, chapterId: chap!.id, slug: "tp", name: "Tp", ordinal: 1 }).returning();
    const [stA] = await tx.insert(subTopic).values({ boardId: P.id, topicId: tp!.id, slug: "sta", name: "ST A", ordinal: 1 }).returning();
    const [stB] = await tx.insert(subTopic).values({ boardId: P.id, topicId: tp!.id, slug: "stb", name: "ST B", ordinal: 2 }).returning();
    const [stC] = await tx.insert(subTopic).values({ boardId: P.id, topicId: tp!.id, slug: "stc", name: "ST C", ordinal: 3 }).returning();
    return { A: stA!.id, B: stB!.id, C: stC!.id };
  });

  // tutor T + students S1, S2 via the REAL grantRole flow
  const emailT = `prt-t-${tag}@example.com`;
  const emailS1 = `prt-s1-${tag}@example.com`;
  const emailS2 = `prt-s2-${tag}@example.com`;
  const T = await withBoard(P.id, (tx) => grantRole(tx, { email: emailT, name: "Tutor", board: P, role: "tutor" }));
  const S1 = await withBoard(P.id, (tx) => grantRole(tx, { email: emailS1, name: "Stu One", board: P, role: "student" }));
  const S2 = await withBoard(P.id, (tx) => grantRole(tx, { email: emailS2, name: "Stu Two", board: P, role: "student" }));
  const userT = T.user.id;
  const userS1 = S1.user.id;
  const userS2 = S2.user.id;
  check("real flow: tutor membership role = 'tutor' (M11 SET side)", T.role === "tutor");
  check("real flow: student membership role = 'student'", S1.role === "student");

  // link T → S1 only (S2 deliberately UNLINKED)
  await withBoard(P.id, (tx) =>
    tx.insert(tutorStudent).values({ boardId: P.id, tutorId: userT, studentId: userS1 }),
  );

  // Stage-1 observations + mastery to drive the worklist cutoff (D-T-2).
  await withBoard(P.id, async (tx: Tx) => {
    const obs = (subTopicId: string, axis: string, level: number, createdAt: Date) =>
      tx.insert(observation).values({
        boardId: P.id, studentId: userS1, subTopicId, axis,
        observationLevel: level, reasoning: `read ${axis} L${level}`,
        source: STAGE1, createdAt,
      });
    const mastery = (subTopicId: string, updatedAt: Date) =>
      tx.insert(masteryState).values({
        boardId: P.id, studentId: userS1, subTopicId,
        conceptualLevel: 3, proceduralLevel: 2,
        description: "where the student is + what to improve", log: "internal notes", updatedAt,
      });
    // A: 3 obs, no mastery → pending 3
    await obs(fx.A, "conceptual", 4, at(1000));
    await obs(fx.A, "procedural", 3, at(2000));
    await obs(fx.A, "conceptual", 4, at(3000));
    // B: 2 obs, mastery AFTER both → pending 0
    await obs(fx.B, "conceptual", 2, at(1000));
    await obs(fx.B, "procedural", 2, at(2000));
    await mastery(fx.B, at(5000));
    // C: 3 obs, mastery BETWEEN obs1 and obs2 → pending 2
    await obs(fx.C, "conceptual", 3, at(1000));
    await mastery(fx.C, at(1500));
    await obs(fx.C, "procedural", 4, at(2000));
    await obs(fx.C, "conceptual", 5, at(3000));
  });

  // 3. listStudents → only S1 (linked); S2 absent
  const students = await withBoard(P.id, (tx) => listStudents(tx, userT));
  check("listStudents → exactly 1 (the linked student)", students.length === 1 && students[0]!.studentId === userS1);
  check("listStudents → carries email + name", students[0]!.email === emailS1 && students[0]!.name === "Stu One");

  // 4. OWNERSHIP: unlinked student S2 → StudentNotFoundError (all reads)
  const ownerFail = async (fn: () => Promise<unknown>) => {
    try { await fn(); return false; } catch (e) { return e instanceof StudentNotFoundError; }
  };
  check("ownership: getStudentMastery(unlinked S2) → StudentNotFoundError",
    await ownerFail(() => withBoard(P.id, (tx) => getStudentMastery(tx, { tutorUserId: userT, studentId: userS2 }))));
  check("ownership: listPendingStage2(unlinked S2) → StudentNotFoundError",
    await ownerFail(() => withBoard(P.id, (tx) => listPendingStage2(tx, { tutorUserId: userT, studentId: userS2 }))));
  check("ownership: getObservations(unlinked S2) → StudentNotFoundError",
    await ownerFail(() => withBoard(P.id, (tx) => getObservations(tx, { tutorUserId: userT, studentId: userS2, subTopicId: fx.A }))));

  // 5. PENDING worklist (the core query)
  const pending = await withBoard(P.id, (tx) => listPendingStage2(tx, { tutorUserId: userT, studentId: userS1 }));
  const byId = new Map(pending.map((p) => [p.subTopicId, p]));
  check("pending: worklist has 2 sub_topics (A, C); B excluded", pending.length === 2 && !byId.has(fx.B));
  check("pending: A → count 3 (no mastery, all pending), hasMastery false", byId.get(fx.A)?.pendingCount === 3 && byId.get(fx.A)?.hasMastery === false);
  check("pending: C → count 2 (only obs newer than finalize), hasMastery true", byId.get(fx.C)?.pendingCount === 2 && byId.get(fx.C)?.hasMastery === true);
  check("pending: ordinal-ordered (A before C)", pending[0]!.subTopicId === fx.A && pending[1]!.subTopicId === fx.C);
  check("pending: carries names", byId.get(fx.A)?.subTopicName === "ST A" && byId.get(fx.A)?.topicName === "Tp" && byId.get(fx.A)?.chapterName === "Ch");

  // 6. getObservations(A) → 3 rows, createdAt-ordered, with reasoning + level
  const obsA = await withBoard(P.id, (tx) => getObservations(tx, { tutorUserId: userT, studentId: userS1, subTopicId: fx.A }));
  check("getObservations(A) → 3 rows", obsA.length === 3);
  check("getObservations(A) → createdAt ascending", obsA[0]!.createdAt <= obsA[1]!.createdAt && obsA[1]!.createdAt <= obsA[2]!.createdAt);
  check("getObservations(A) → carries axis + level + reasoning", obsA[0]!.axis === "conceptual" && obsA[0]!.observationLevel === 4 && obsA[0]!.reasoning.length > 0);
  check("getObservations payload has no answer-key fields (REF_/reference)", !/referenceAnswer|REF_|EXPL_/.test(JSON.stringify(obsA)));
  // Recall fields are null/empty when the observation has no question/attempt link
  // (these seeds don't) — the LEFT joins must not drop the row.
  check("getObservations(A) → recall fields null/empty when unlinked", obsA[0]!.questionStem === null && obsA[0]!.answerText === null && obsA[0]!.answerPhotoIds.length === 0);

  // 6b. RECALL CONTEXT (Slice UPLOAD-UX) — an observation linked to a real
  // question + the student's own attempt surfaces the stem + answer for tutor
  // recall. Seed one typed attempt and one photo attempt under sub_topic B.
  const recall = await withBoard(P.id, async (tx: Tx) => {
    const [q] = await tx.insert(question).values({
      boardId: P.id, subTopicId: fx.B, axis: "conceptual", kind: "subjective",
      stem: "What is a mixture? RECALL_STEM", referenceAnswer: "REF_SECRET_recall",
      pedagogicalNote: "WHY_NOTE: establish the mixture baseline", ordinal: 1, source: "b2c_authoring",
    }).returning();
    // a DRAFT and a PRIVATE question that getSubTopicQuestions must EXCLUDE
    await tx.insert(question).values({
      boardId: P.id, subTopicId: fx.B, axis: "conceptual", kind: "subjective",
      stem: "DRAFT_Q — not approved", referenceAnswer: "x", ordinal: 2, source: "b2c_authoring", status: "draft",
    });
    await tx.insert(question).values({
      boardId: P.id, subTopicId: fx.B, axis: "conceptual", kind: "subjective",
      stem: "PRIVATE_Q — targeted", referenceAnswer: "x", ordinal: 3, source: "b2c_authoring", targetStudentId: userS2,
    });
    const [ps] = await tx.insert(practiceSession).values({
      boardId: P.id, appUserId: userS1, subTopicId: fx.B, questionIds: [q!.id],
    }).returning();
    // typed attempt
    const [aTyped] = await tx.insert(attempt).values({
      boardId: P.id, practiceSessionId: ps!.id, questionId: q!.id, appUserId: userS1,
      answerText: "A mixture keeps each part RECALL_ANSWER", confidence: 4, timeMs: 30000,
    }).returning();
    // photo attempt (+ 2 images)
    const [aPhoto] = await tx.insert(attempt).values({
      boardId: P.id, practiceSessionId: ps!.id, questionId: q!.id, appUserId: userS1,
      answerText: null, confidence: 3, timeMs: 45000,
    }).returning();
    const [im0] = await tx.insert(attemptImage).values({ boardId: P.id, attemptId: aPhoto!.id, storageKey: `recall/${tag}/0.jpg`, mime: "image/jpeg", ordinal: 0 }).returning();
    const [im1] = await tx.insert(attemptImage).values({ boardId: P.id, attemptId: aPhoto!.id, storageKey: `recall/${tag}/1.jpg`, mime: "image/jpeg", ordinal: 1 }).returning();
    // two observations: one on the typed attempt, one on the photo attempt
    await tx.insert(observation).values({ boardId: P.id, studentId: userS1, subTopicId: fx.B, axis: "conceptual", observationLevel: 4, reasoning: "typed read", source: STAGE1, questionId: q!.id, attemptId: aTyped!.id, createdAt: at(9000) });
    await tx.insert(observation).values({ boardId: P.id, studentId: userS1, subTopicId: fx.B, axis: "procedural", observationLevel: 3, reasoning: "photo read", source: STAGE1, questionId: q!.id, attemptId: aPhoto!.id, createdAt: at(9001) });
    return { qId: q!.id, im0: im0!.id, im1: im1!.id };
  });
  const obsB = await withBoard(P.id, (tx) => getObservations(tx, { tutorUserId: userT, studentId: userS1, subTopicId: fx.B }));
  const typedObs = obsB.find((o) => o.reasoning === "typed read");
  const photoObs = obsB.find((o) => o.reasoning === "photo read");
  check("recall: typed obs carries the question stem", typedObs?.questionStem === "What is a mixture? RECALL_STEM");
  check("recall: typed obs carries the student's answer + confidence", typedObs?.answerText === "A mixture keeps each part RECALL_ANSWER" && typedObs?.answerConfidence === 4);
  check("recall: typed obs has NO photo ids", typedObs?.answerPhotoIds.length === 0);
  check("recall: photo obs carries ordered image ids, null answerText", photoObs?.answerText === null && photoObs?.answerPhotoIds.length === 2 && photoObs?.answerPhotoIds[0] === recall.im0 && photoObs?.answerPhotoIds[1] === recall.im1);
  check("recall: reference answer NEVER surfaces in the recall payload", !/REF_SECRET/.test(JSON.stringify(obsB)));

  // 6c. getSubTopicQuestions (Assign-tab preview) — approved canonical only, with
  // the authoring "why" (pedagogical_note); draft + private questions excluded.
  const asgQs = await withBoard(P.id, (tx) => getSubTopicQuestions(tx, { subTopicId: fx.B }));
  check("assign-preview: exactly 1 question (draft + private excluded)", asgQs.length === 1 && asgQs[0]!.stem === "What is a mixture? RECALL_STEM");
  check("assign-preview: carries the pedagogical 'why' + axis", asgQs[0]!.pedagogicalNote === "WHY_NOTE: establish the mixture baseline" && asgQs[0]!.axis === "conceptual");
  check("assign-preview: no reference-answer leak", !/REF_SECRET|reference/i.test(JSON.stringify(asgQs)));

  // An observation belonging to the UNLINKED student S2 — the ownership guard on
  // overrideObservation must reject it (RLS scopes by board, not by user).
  const [obsS2] = await withBoard(P.id, (tx) =>
    tx.insert(observation).values({
      boardId: P.id, studentId: userS2, subTopicId: fx.A, axis: "conceptual",
      observationLevel: 3, reasoning: "S2's read — the caller does not tutor S2",
      source: STAGE1,
    }).returning({ id: observation.id }),
  );
  const obsS2Id = obsS2!.id;

  // ── 6b. ASSESS-FIX-2: the tutor can CORRECT a Stage-1 read (assessment.md §6).
  // The machine's read must survive intact (it's half the training pair); the
  // EFFECTIVE level is what counts; the correction is logged as its own event.
  const target = obsA[0]!; // conceptual, machine read L4
  check("override (pre): not yet corrected", target.tutorLevel === null && target.effectiveLevel === 4);

  const corrected = await withBoard(P.id, (tx) =>
    overrideObservation(tx, {
      boardId: P.id,
      tutorUserId: userT,
      observationId: target.id,
      level: 2,
      reason: "The scorer rewarded fluent prose — the two ideas are never actually linked.",
    }),
  );
  check("override: machine read PRESERVED (still L4)", corrected.observationLevel === 4);
  check("override: tutorLevel = 2, effectiveLevel = 2 (the tutor wins)", corrected.tutorLevel === 2 && corrected.effectiveLevel === 2);
  check("override: reason + overriddenAt stored", (corrected.overrideReason ?? "").length > 0 && corrected.overriddenAt !== null);

  const obsAfter = await withBoard(P.id, (tx) => getObservations(tx, { tutorUserId: userT, studentId: userS1, subTopicId: fx.A }));
  const t2 = obsAfter.find((o) => o.id === target.id)!;
  check("override: re-read shows BOTH numbers (AI 4 / tutor 2)", t2.observationLevel === 4 && t2.tutorLevel === 2 && t2.effectiveLevel === 2);

  const ovrEvents = await withBoard(P.id, (tx) =>
    tx.select().from(eventLog).where(and(eq(eventLog.boardId, P.id), eq(eventLog.eventType, OBSERVATION_OVERRIDE_EVENT))),
  );
  check("override: ONE observation_override event, logged separately", ovrEvents.length === 1);
  check("override: event carries before/after effective + the machine's reasoning (the labeled pair)",
    (ovrEvents[0]!.before as any)?.effectiveLevel === 4 &&
    (ovrEvents[0]!.after as any)?.effectiveLevel === 2 &&
    (ovrEvents[0]!.after as any)?.machineLevel === 4 &&
    typeof (ovrEvents[0]!.payload as any)?.machineReasoning === "string");

  // clearing reverts to the machine read (and drops the reason)
  const cleared = await withBoard(P.id, (tx) =>
    overrideObservation(tx, { boardId: P.id, tutorUserId: userT, observationId: target.id, level: null, reason: null }),
  );
  check("override cleared: reverts to the machine read (L4), reason dropped",
    cleared.tutorLevel === null && cleared.effectiveLevel === 4 && cleared.overrideReason === null && cleared.overriddenAt === null);

  // ownership + not-found
  check("override: unlinked student's observation → StudentNotFoundError",
    await ownerFail(() => withBoard(P.id, (tx) => overrideObservation(tx, { boardId: P.id, tutorUserId: userT, observationId: obsS2Id, level: 3, reason: "nope" }))));
  let missing = false;
  try {
    await withBoard(P.id, (tx) => overrideObservation(tx, { boardId: P.id, tutorUserId: userT, observationId: "00000000-0000-0000-0000-000000000000", level: 3, reason: "x" }));
  } catch (e) { missing = e instanceof ObservationNotFoundError; }
  check("override: unknown observation → OBSERVATION_NOT_FOUND", missing);

  // restore the pre-6b state for the assertions below (nothing should see the override)
  await withBoard(P.id, (tx) => overrideObservation(tx, { boardId: P.id, tutorUserId: userT, observationId: target.id, level: null, reason: null }));

  // 7. getStudentMastery → certified pair + description for B and C (ordinal)
  const cards = await withBoard(P.id, (tx) => getStudentMastery(tx, { tutorUserId: userT, studentId: userS1 }));
  check("getStudentMastery → 2 cards (B, C)", cards.length === 2);
  check("getStudentMastery → ordinal-ordered (B before C)", cards[0]!.subTopicId === fx.B && cards[1]!.subTopicId === fx.C);
  check("getStudentMastery → certified pair + description", cards[0]!.conceptualLevel === 3 && cards[0]!.proceduralLevel === 2 && cards[0]!.description.length > 0);

  // 8. RLS cross-board: under Q claim the tutor_student link is invisible
  const crossStudents = await withBoard(Q.id, (tx) => listStudents(tx, userT));
  check("RLS: listStudents under another board → empty", crossStudents.length === 0);
  check("RLS: getObservations under another board → StudentNotFoundError",
    await ownerFail(() => withBoard(Q.id, (tx) => getObservations(tx, { tutorUserId: userT, studentId: userS1, subTopicId: fx.A }))));

  // 9. HTTP no-session → 401 (soft)
  try {
    const res = await fetch(`http://localhost:${env.PORT}/trpc/tutor.listStudents`, { headers: { "x-board": P.slug } });
    check(`HTTP tutor.listStudents (no session) → 401 (got ${res.status})`, res.status === 401);
  } catch {
    console.log("  ~ HTTP tutor.listStudents skipped (server not running)");
  }

  // ── cleanup (FK-safe order) ──
  await withBoard(P.id, async (tx: Tx) => {
    // event_log first: the override legs write observation_override rows that FK
    // to app_user / sub_topic / board.
    await tx.delete(eventLog).where(eq(eventLog.boardId, P.id));
    // Recall fixtures (6b): images → attempts → sessions → questions, all FK
    // to sub_topic/attempt, so they must go before observation/subTopic below.
    await tx.delete(attemptImage).where(eq(attemptImage.boardId, P.id));
    await tx.delete(observation).where(eq(observation.boardId, P.id));
    await tx.delete(attempt).where(eq(attempt.boardId, P.id));
    await tx.delete(practiceSession).where(eq(practiceSession.boardId, P.id));
    await tx.delete(question).where(eq(question.boardId, P.id));
    await tx.delete(masteryState).where(eq(masteryState.boardId, P.id));
    await tx.delete(tutorStudent).where(eq(tutorStudent.boardId, P.id));
    await tx.delete(subTopic).where(eq(subTopic.boardId, P.id));
    await tx.delete(topic).where(eq(topic.boardId, P.id));
    await tx.delete(chapter).where(eq(chapter.boardId, P.id));
    await tx.delete(subject).where(eq(subject.boardId, P.id));
    await tx.delete(membership).where(eq(membership.boardId, P.id));
  });
  await db.delete(appUser).where(eq(appUser.email, emailT));
  await db.delete(appUser).where(eq(appUser.email, emailS1));
  await db.delete(appUser).where(eq(appUser.email, emailS2));
  await db.delete(board).where(eq(board.id, P.id));
  await db.delete(board).where(eq(board.id, Q.id));

  console.log(`\nprobe_tutor_surface: ${passed} passed, ${failed} failed`);
  await queryClient.end();
  process.exit(failed === 0 ? 0 : 1);
}

main().catch(async (err) => {
  console.error("probe_tutor_surface FAILED:", err);
  await queryClient.end();
  process.exit(1);
});
