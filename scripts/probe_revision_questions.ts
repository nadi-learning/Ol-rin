/**
 * probe_revision_questions — Slice A exit gate (in-slide MCQs, server-checked).
 *
 * Proves getQuestions + checkAnswer against the real DB + real RLS, using a
 * THROWAWAY fixture (unique per-run boards P/Q) with a controlled real-shape
 * manifest — so we KNOW the answer keys and can assert grading deterministically,
 * and the canonical seeds stay pristine (M22). Cleans up after itself.
 *
 *   1. DB connectivity as the app role.
 *   2. getQuestions → one question per slot (slot_1 pool of 2 + slot_2 pool of 1
 *      → exactly 2 questions), each chosen id ∈ its slot's pool.
 *   3. SECURITY BOUNDARY (the point of this slice): no `evaluation` /
 *      `correct_answer` / explanation text ever appears in the getQuestions
 *      payload — checked both per-object and on the serialized JSON.
 *   4. RANDOM each load (param): over many draws, slot_1 yields BOTH pool
 *      questions (probabilistic; ~1 - 2·0.5^N false-negative).
 *   5. checkAnswer: correct → isCorrect + full marks; wrong → 0 marks but the
 *      key+explanation are revealed in the verdict; marks honored (slot_2 = 2).
 *   6. checkAnswer unknown questionId → QuestionNotFoundError.
 *   7. Cross-board RLS: getQuestions/checkAnswer for P's sub_topic under a Q
 *      claim → SLIDE_NOT_FOUND.
 *   8. Membership gate, both sides (M11).
 *   9. HTTP: GET /trpc/revision.getQuestions no session → 401 (soft).
 */
import { eq, sql } from "drizzle-orm";
import type { PgTransaction } from "drizzle-orm/pg-core";
import {
  board,
  chapter,
  contentUnit,
  contentVersion,
  appUser,
  eventLog,
  membership,
  subTopic,
  subject,
  topic,
} from "@b2c/kernel/schema";
import { db, queryClient } from "../src/db/client";
import { withBoard } from "../src/db/with-board";
import {
  checkAnswer,
  getQuestions,
  QuestionNotFoundError,
  SlideNotFoundError,
} from "../src/services/revision";
import {
  NoMembershipError,
  grantRole,
  requireMembership,
} from "../src/services/membership";
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

// A controlled real-shape manifest: `sections[].topics[].id` (so the content_-
// slide_key validation passes) + `question_pools[slideId]` = a list of slots,
// each slot a pool. slot_1 has 2 questions (random pick), slot_2 has 1.
function manifest() {
  const q = (
    id: string,
    correct: string,
    marks: number,
    explanation: string,
  ) => ({
    id,
    type: "mcq",
    marks,
    question: `Question ${id}?`,
    options: [
      { label: "A", text: "option a" },
      { label: "B", text: "option b" },
    ],
    evaluation: { correct_answer: correct, explanation },
    topic_keys: [],
  });
  return {
    contractVersion: "1",
    sections: [{ id: "sec1", title: "Sec 1", topics: [{ id: SLIDE_ID }] }],
    question_pools: {
      [SLIDE_ID]: [
        { slot_id: "slot_1", questions: [q("qa", "A", 1, "EXPLAIN_QA"), q("qb", "B", 1, "EXPLAIN_QB")] },
        { slot_id: "slot_2", questions: [q("qc", "A", 2, "EXPLAIN_QC")] },
      ],
    },
  };
}

async function main() {
  const tag = `${Date.now()}`;

  // 1. connectivity
  await db.execute(sql`select 1`);
  check("DB connectivity (select 1) as app role", true);

  const [P] = await db.insert(board).values({ slug: `prq-p-${tag}`, name: "Probe P" }).returning();
  const [Q] = await db.insert(board).values({ slug: `prq-q-${tag}`, name: "Probe Q" }).returning();
  if (!P || !Q) throw new Error("board seed failed");

  // a student to attribute the recorded checks to (event_log.studentId FK).
  const [student] = await db
    .insert(appUser)
    .values({ email: `prq-s-${tag}@example.com`, name: "Probe S" })
    .returning();
  if (!student) throw new Error("student seed failed");

  // build the fixture under P: spine (sub_topic carries content_slide_key) +
  // slide_module + v1 whose body.manifest carries the question_pools.
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

  // 2. getQuestions → one per slot
  const r = await withBoard(P.id, (tx) => getQuestions(tx, { subTopicId: fixture.subTopicId }));
  check("getQuestions → 2 questions (one per slot)", r.questions.length === 2);
  check("getQuestions → slideId is the resolved slide", r.slideId === SLIDE_ID);
  check("slot_1 question ∈ {qa,qb}", ["qa", "qb"].includes(r.questions[0]?.id ?? ""));
  check("slot_2 question is qc (pool of 1)", r.questions[1]?.id === "qc");
  check("question carries options [{label,text}]", r.questions[0]?.options?.[0]?.label === "A" && typeof r.questions[0]?.options?.[0]?.text === "string");

  // 3. SECURITY BOUNDARY — no answer key leaks
  const serialized = JSON.stringify(r);
  const perObjectClean = r.questions.every(
    (q) => !("evaluation" in (q as any)) && !("correct_answer" in (q as any)) && !("topic_keys" in (q as any)),
  );
  check("no `evaluation` key on any question object", perObjectClean);
  check("serialized payload has no 'evaluation'", !serialized.includes("evaluation"));
  check("serialized payload has no 'correct_answer'", !serialized.includes("correct_answer"));
  check("serialized payload has no explanation text (EXPLAIN_*)", !serialized.includes("EXPLAIN_"));

  // 4. RANDOM each load — slot_1 yields both qa and qb across draws
  const seen = new Set<string>();
  for (let i = 0; i < 40; i++) {
    const draw = await withBoard(P.id, (tx) => getQuestions(tx, { subTopicId: fixture.subTopicId }));
    if (draw.questions[0]?.id) seen.add(draw.questions[0].id);
  }
  check("random: slot_1 yields BOTH qa and qb over 40 draws", seen.has("qa") && seen.has("qb"));

  // 5. checkAnswer grading
  const correct = await withBoard(P.id, (tx) => checkAnswer(tx, { subTopicId: fixture.subTopicId, questionId: "qa", answer: "A", boardId: P.id, appUserId: student.id }));
  check("checkAnswer(qa,'A') → isCorrect", correct.isCorrect === true);
  check("checkAnswer(qa,'A') → marksAwarded 1 / marksMax 1", correct.marksAwarded === 1 && correct.marksMax === 1);
  check("checkAnswer(qa,'A') → correctAnswer 'A' + explanation revealed", correct.correctAnswer === "A" && correct.explanation === "EXPLAIN_QA");

  const wrong = await withBoard(P.id, (tx) => checkAnswer(tx, { subTopicId: fixture.subTopicId, questionId: "qa", answer: "B", boardId: P.id, appUserId: student.id }));
  check("checkAnswer(qa,'B') → not correct, 0 marks", wrong.isCorrect === false && wrong.marksAwarded === 0);
  check("checkAnswer(qa,'B') → still reveals correctAnswer 'A' + explanation", wrong.correctAnswer === "A" && wrong.explanation === "EXPLAIN_QA");

  const c2 = await withBoard(P.id, (tx) => checkAnswer(tx, { subTopicId: fixture.subTopicId, questionId: "qc", answer: "A", boardId: P.id, appUserId: student.id }));
  check("checkAnswer(qc,'A') → marks honored (marksMax 2, awarded 2)", c2.marksMax === 2 && c2.marksAwarded === 2);

  // 6. unknown questionId → QuestionNotFoundError
  let unknownBlocked = false;
  try {
    await withBoard(P.id, (tx) => checkAnswer(tx, { subTopicId: fixture.subTopicId, questionId: "nope", answer: "A", boardId: P.id, appUserId: student.id }));
  } catch (e) {
    unknownBlocked = e instanceof QuestionNotFoundError;
  }
  check("checkAnswer unknown questionId → QuestionNotFoundError", unknownBlocked);

  // 7. cross-board RLS → SLIDE_NOT_FOUND for both endpoints
  let qBlocked = false;
  try {
    await withBoard(Q.id, (tx) => getQuestions(tx, { subTopicId: fixture.subTopicId }));
  } catch (e) {
    qBlocked = e instanceof SlideNotFoundError;
  }
  check("RLS: getQuestions across boards → SLIDE_NOT_FOUND", qBlocked);

  let cBlocked = false;
  try {
    await withBoard(Q.id, (tx) => checkAnswer(tx, { subTopicId: fixture.subTopicId, questionId: "qa", answer: "A", boardId: Q.id, appUserId: student.id }));
  } catch (e) {
    cBlocked = e instanceof SlideNotFoundError;
  }
  check("RLS: checkAnswer across boards → SLIDE_NOT_FOUND", cBlocked);

  // 8. membership gate, both sides (M11)
  const emailW = `prq-w-${tag}@example.com`;
  const emailX = `prq-x-${tag}@example.com`;
  let noMembership = false;
  try {
    await withBoard(P.id, (tx) => requireMembership(tx, { email: emailX, board: P }));
  } catch (e) {
    noMembership = e instanceof NoMembershipError;
  }
  check("gate: non-member → NoMembershipError", noMembership);

  await withBoard(P.id, (tx) => grantRole(tx, { email: emailW, name: "Probe W", board: P, role: "student" }));
  const gateRole = await withBoard(P.id, (tx) => requireMembership(tx, { email: emailW, board: P }));
  check("gate: member (created by real flow) → role 'student'", gateRole.role === "student");

  // 9. HTTP no-session → 401 (soft)
  try {
    const input = encodeURIComponent(JSON.stringify({ subTopicId: fixture.subTopicId }));
    const res = await fetch(`http://localhost:${env.PORT}/trpc/revision.getQuestions?input=${input}`, {
      headers: { "x-board": P.slug },
    });
    check(`HTTP getQuestions (no session) → 401 (got ${res.status})`, res.status === 401);
  } catch {
    console.log("  ~ HTTP getQuestions skipped (server not running)");
  }

  // ── cleanup (FK-safe order); RLS rows withBoard, globals direct ──
  await db.delete(contentVersion).where(eq(contentVersion.contentUnitId, fixture.unitId));
  await withBoard(P.id, async (tx: Tx) => {
    await tx.delete(eventLog).where(eq(eventLog.boardId, P.id));
    await tx.delete(contentUnit).where(eq(contentUnit.boardId, P.id));
    await tx.delete(subTopic).where(eq(subTopic.boardId, P.id));
    await tx.delete(topic).where(eq(topic.boardId, P.id));
    await tx.delete(chapter).where(eq(chapter.boardId, P.id));
    await tx.delete(subject).where(eq(subject.boardId, P.id));
    await tx.delete(membership).where(eq(membership.boardId, P.id));
  });
  await db.delete(appUser).where(eq(appUser.email, emailW));
  await db.delete(appUser).where(eq(appUser.id, student.id));
  await db.delete(board).where(eq(board.id, P.id));
  await db.delete(board).where(eq(board.id, Q.id));

  console.log(`\nprobe_revision_questions: ${passed} passed, ${failed} failed`);
  await queryClient.end();
  process.exit(failed === 0 ? 0 : 1);
}

main().catch(async (err) => {
  console.error("probe_revision_questions FAILED:", err);
  await queryClient.end();
  process.exit(1);
});
