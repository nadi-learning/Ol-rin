/**
 * probe_mcq_evidence — Slice MCQ-EV exit gate (D-A-1 closure / D-MCQ-1).
 *
 * Proves that revision.checkAnswer RECORDS each Quick Check to event_log as
 * record-only evidence — NO LLM, NO observation, NO mastery move (G4: MCQ is
 * special-purpose). Real DB + real RLS, THROWAWAY boards P/Q + a controlled
 * real-shape manifest (so we know the keys) + a throwaway student. Cleans up.
 *
 *   1. DB connectivity.
 *   2. correct check → ONE event_log row (eventType 'mcq_check') with the right
 *      payload (slideId, slideQuestionId, chosen, correctAnswer, isCorrect=true,
 *      marks, timeMs) attributed to the student + sub_topic.
 *   3. wrong check → logged with isCorrect=false, marksAwarded=0, chosen kept.
 *   4. NO DEDUPE (firehose, G1): re-checking the same question writes a SECOND
 *      event (count grows).
 *   5. RECORD-ONLY GUARANTEE: after several checks, ZERO observation rows and
 *      ZERO mastery_state rows exist for the student/sub_topic.
 *   6. timeMs is persisted as given.
 *   7. unknown questionId → QuestionNotFoundError AND no event written.
 *   8. cross-board RLS: checkAnswer for P's sub_topic under a Q claim →
 *      SLIDE_NOT_FOUND and NO event under Q.
 *   9. HTTP: POST /trpc/revision.checkAnswer no session → 401 (soft).
 */
import { and, eq, sql } from "drizzle-orm";
import type { PgTransaction } from "drizzle-orm/pg-core";
import {
  appUser,
  board,
  chapter,
  contentUnit,
  contentVersion,
  eventLog,
  masteryState,
  observation,
  subTopic,
  subject,
  topic,
} from "@b2c/kernel/schema";
import { db, queryClient } from "../src/db/client";
import { withBoard } from "../src/db/with-board";
import {
  checkAnswer,
  MCQ_CHECK_EVENT,
  QuestionNotFoundError,
  SlideNotFoundError,
} from "../src/services/revision";
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

const SLIDE_ID = "slide-q1";

function manifest() {
  const q = (id: string, correct: string, marks: number) => ({
    id,
    type: "mcq",
    marks,
    question: `Question ${id}?`,
    options: [
      { label: "A", text: "option a" },
      { label: "B", text: "option b" },
    ],
    evaluation: { correct_answer: correct, explanation: `EXPLAIN_${id}` },
  });
  return {
    contractVersion: "1",
    sections: [{ id: "sec1", title: "Sec 1", topics: [{ id: SLIDE_ID }] }],
    question_pools: {
      [SLIDE_ID]: [
        { slot_id: "slot_1", questions: [q("qa", "A", 1)] },
        { slot_id: "slot_2", questions: [q("qc", "A", 2)] },
      ],
    },
  };
}

/** event_log rows for this student's MCQ checks under board b. */
async function mcqEvents(boardId: string, studentId: string) {
  return withBoard(boardId, (tx) =>
    tx
      .select()
      .from(eventLog)
      .where(
        and(
          eq(eventLog.eventType, MCQ_CHECK_EVENT),
          eq(eventLog.studentId, studentId),
        ),
      ),
  );
}

async function main() {
  const tag = `${Date.now()}`;

  await db.execute(sql`select 1`);
  check("DB connectivity (select 1) as app role", true);

  const [P] = await db.insert(board).values({ slug: `pmcq-p-${tag}`, name: "MCQ P" }).returning();
  const [Q] = await db.insert(board).values({ slug: `pmcq-q-${tag}`, name: "MCQ Q" }).returning();
  if (!P || !Q) throw new Error("board seed failed");

  const [student] = await db
    .insert(appUser)
    .values({ email: `pmcq-s-${tag}@example.com`, name: "MCQ S", userType: "student" })
    .returning();
  if (!student) throw new Error("student seed failed");

  const fixture = await withBoard(P.id, async (tx: Tx) => {
    const [subj] = await tx
      .insert(subject)
      .values({ boardId: P.id, slug: "phys", name: "Physics", grade: "IGCSE" })
      .returning();
    const [chap] = await tx
      .insert(chapter)
      .values({ boardId: P.id, subjectId: subj!.id, slug: "ch", name: "Ch", ordinal: 1, contentModuleKey: "mod" })
      .returning();
    const [tp] = await tx
      .insert(topic)
      .values({ boardId: P.id, chapterId: chap!.id, slug: "tp", name: "Tp", ordinal: 1 })
      .returning();
    const [st] = await tx
      .insert(subTopic)
      .values({ boardId: P.id, topicId: tp!.id, slug: "qst", name: "Qst", ordinal: 1, contentSlideKey: SLIDE_ID })
      .returning();
    const [unit] = await tx
      .insert(contentUnit)
      .values({ boardId: P.id, type: "slide_module", chapterId: chap!.id, subTopicId: null, source: "starkhorn" })
      .returning();
    const [v1] = await tx
      .insert(contentVersion)
      .values({
        contentUnitId: unit!.id,
        versionNo: 1,
        body: { contractVersion: "1", manifest: manifest(), bundle: "/* probe */" },
        publishedAt: new Date(),
      })
      .returning();
    await tx.update(contentUnit).set({ currentVersionId: v1!.id }).where(eq(contentUnit.id, unit!.id));
    return { subTopicId: st!.id, unitId: unit!.id };
  });

  // 2. correct check → one event with the right payload
  const correct = await withBoard(P.id, (tx) =>
    checkAnswer(tx, { subTopicId: fixture.subTopicId, questionId: "qa", answer: "A", boardId: P.id, appUserId: student.id, timeMs: 4200 }),
  );
  check("checkAnswer(qa,'A') verdict isCorrect", correct.isCorrect === true);

  let events = await mcqEvents(P.id, student.id);
  check("correct check → exactly ONE event_log row", events.length === 1);
  const e0: any = events[0];
  check("event eventType = 'mcq_check'", e0?.eventType === MCQ_CHECK_EVENT);
  check("event scoped to student + sub_topic", e0?.studentId === student.id && e0?.subTopicId === fixture.subTopicId && e0?.boardId === P.id);
  check("payload.slideId resolved server-side", e0?.payload?.slideId === SLIDE_ID);
  check("payload records the question + chosen", e0?.payload?.slideQuestionId === "qa" && e0?.payload?.chosen === "A");
  check("payload records verdict + marks", e0?.payload?.isCorrect === true && e0?.payload?.marksAwarded === 1 && e0?.payload?.marksMax === 1);
  check("payload records correctAnswer (server-side only)", e0?.payload?.correctAnswer === "A");
  check("payload records timeMs as given (4200)", e0?.payload?.timeMs === 4200);

  // 3. wrong check → logged, isCorrect false, chosen kept
  await withBoard(P.id, (tx) =>
    checkAnswer(tx, { subTopicId: fixture.subTopicId, questionId: "qa", answer: "B", boardId: P.id, appUserId: student.id, timeMs: 1000 }),
  );
  events = await mcqEvents(P.id, student.id);
  check("wrong check → a second event (now 2)", events.length === 2);
  const wrongEv: any = events.find((e: any) => e.payload?.chosen === "B");
  check("wrong event: isCorrect=false, 0 marks, chosen 'B'", wrongEv?.payload?.isCorrect === false && wrongEv?.payload?.marksAwarded === 0 && wrongEv?.payload?.chosen === "B");

  // 4. NO DEDUPE — re-check the same question writes another event
  await withBoard(P.id, (tx) =>
    checkAnswer(tx, { subTopicId: fixture.subTopicId, questionId: "qa", answer: "A", boardId: P.id, appUserId: student.id }),
  );
  events = await mcqEvents(P.id, student.id);
  check("no dedupe: re-check writes a 3rd event (firehose, G1)", events.length === 3);
  check("timeMs null when not supplied", events.some((e: any) => e.payload?.timeMs === null));

  // 5. RECORD-ONLY GUARANTEE — no observation, no mastery_state
  const obs = await withBoard(P.id, (tx) =>
    tx.select().from(observation).where(eq(observation.subTopicId, fixture.subTopicId)),
  );
  check("RECORD-ONLY: NO observation written by an MCQ check", obs.length === 0);
  const ms = await withBoard(P.id, (tx) =>
    tx.select().from(masteryState).where(eq(masteryState.subTopicId, fixture.subTopicId)),
  );
  check("RECORD-ONLY: NO mastery_state written by an MCQ check", ms.length === 0);

  // 7. unknown questionId → error AND no event
  let unknownBlocked = false;
  try {
    await withBoard(P.id, (tx) =>
      checkAnswer(tx, { subTopicId: fixture.subTopicId, questionId: "nope", answer: "A", boardId: P.id, appUserId: student.id }),
    );
  } catch (e) {
    unknownBlocked = e instanceof QuestionNotFoundError;
  }
  check("unknown questionId → QuestionNotFoundError", unknownBlocked);
  events = await mcqEvents(P.id, student.id);
  check("unknown questionId wrote NO event (still 3)", events.length === 3);

  // 8. cross-board RLS → SLIDE_NOT_FOUND + no event under Q
  let cBlocked = false;
  try {
    await withBoard(Q.id, (tx) =>
      checkAnswer(tx, { subTopicId: fixture.subTopicId, questionId: "qa", answer: "A", boardId: Q.id, appUserId: student.id }),
    );
  } catch (e) {
    cBlocked = e instanceof SlideNotFoundError;
  }
  check("RLS: checkAnswer across boards → SLIDE_NOT_FOUND", cBlocked);
  const qEvents = await mcqEvents(Q.id, student.id);
  check("RLS: no event written under board Q", qEvents.length === 0);

  // 9. HTTP no-session → 401 (soft)
  try {
    const res = await fetch(`http://localhost:${env.PORT}/trpc/revision.checkAnswer`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-board": P.slug },
      body: JSON.stringify({ subTopicId: fixture.subTopicId, questionId: "qa", answer: "A" }),
    });
    check(`HTTP checkAnswer (no session) → 401 (got ${res.status})`, res.status === 401);
  } catch {
    console.log("  ~ HTTP checkAnswer skipped (server not running)");
  }

  // ── cleanup (FK-safe; event_log before the student appUser) ──
  await db.delete(contentVersion).where(eq(contentVersion.contentUnitId, fixture.unitId));
  await withBoard(P.id, async (tx: Tx) => {
    await tx.delete(eventLog).where(eq(eventLog.boardId, P.id));
    await tx.delete(contentUnit).where(eq(contentUnit.boardId, P.id));
    await tx.delete(subTopic).where(eq(subTopic.boardId, P.id));
    await tx.delete(topic).where(eq(topic.boardId, P.id));
    await tx.delete(chapter).where(eq(chapter.boardId, P.id));
    await tx.delete(subject).where(eq(subject.boardId, P.id));
  });
  await db.delete(appUser).where(eq(appUser.id, student.id));
  await db.delete(board).where(eq(board.id, P.id));
  await db.delete(board).where(eq(board.id, Q.id));

  console.log(`\nprobe_mcq_evidence: ${passed} passed, ${failed} failed`);
  await queryClient.end();
  process.exit(failed === 0 ? 0 : 1);
}

main().catch(async (err) => {
  console.error("probe_mcq_evidence FAILED:", err);
  await queryClient.end();
  process.exit(1);
});
