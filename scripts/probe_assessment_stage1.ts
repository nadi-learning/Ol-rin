/**
 * probe_assessment_stage1 — Slice AI-1 exit gate (#14 Stage-1 blind scoring).
 *
 * Runs the REAL scorer against the REAL Gemini vendor + real DB + real RLS, on a
 * THROWAWAY fixture (boards P/Q per run, M22) with full cleanup. Needs
 * GEMINI_API_KEY (copied from b2c prod). Two-tier assertions, on purpose
 * (build-discipline: don't over-read a single AI response):
 *   FIRM — plumbing + clear behaviours we control: which axis gets an
 *     observation, the §2 "bound" (explain-why → no procedural), blind (no
 *     mastery written), idempotency, RLS, not-found, skip-not-scored.
 *   SOFT — the model's nuanced SECONDARY judgments (calibration over/under,
 *     cross-concept note): we assert the field is structurally valid + LOG what
 *     the model said, never fail on the LLM's discretion.
 *
 *   1. DB connectivity.
 *   2. conceptual question + reasoned answer → a CONCEPTUAL observation (1–5),
 *      and NO procedural observation (axis tag = conceptual).
 *   3. procedural question + clean working → a PROCEDURAL observation, no conceptual.
 *   4. BOUND: axis='both' pure explain-why answer → conceptual obs, procedural ABSTAINS.
 *   5. BLIND: no mastery_state row is ever written by the scorer.
 *   6. observation fields: attempt_id, source, signals(confidence/timeMs/model),
 *      pedagogical_comment carried.
 *   7. SOFT calibration: confident + weak answer → log the flag ('over' hoped).
 *   8. SOFT cross-concept: target procedure ok + adjacent-skill slip → log the note.
 *   9. IDEMPOTENT: re-score the same attempt → observation count unchanged.
 *  10. skip attempt (no answer) → scored:false, 0 observations.
 *  11. RLS: scoring a P attempt under board Q → ATTEMPT_NOT_FOUND.
 *  12. unknown attempt id → ATTEMPT_NOT_FOUND.
 *  13. SOFT E2E: enqueue → inline Worker drains it → observation appears.
 */
import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import type { PgTransaction } from "drizzle-orm/pg-core";
import { Worker } from "bullmq";
import {
  appUser,
  attempt,
  board,
  chapter,
  learningObjective,
  masteryState,
  observation,
  practiceSession,
  question,
  subTopic,
  subject,
  topic,
} from "@b2c/kernel/schema";
import { db, queryClient } from "../src/db/client";
import { withBoard } from "../src/db/with-board";
import { redisConnection } from "../src/redis/connection";
import {
  AttemptNotFoundError,
  detectBareChoice,
  extractCorrectOption,
  scoreAttempt,
} from "../src/services/assessment";
import { __aiConfigured } from "../src/services/ai/gemini";
import {
  ASSESSMENT_QUEUE,
  assessmentQueue,
  enqueueStage1Scoring,
  type Stage1JobData,
} from "../src/worker/queue";

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
function soft(name: string, value: unknown) {
  console.log(`  ~ [soft] ${name}: ${JSON.stringify(value)}`);
}

async function obsFor(boardId: string, attemptId: string) {
  return withBoard(boardId, (tx: Tx) =>
    tx.select().from(observation).where(eq(observation.attemptId, attemptId)),
  );
}

async function main() {
  if (!__aiConfigured()) {
    console.error("GEMINI_API_KEY not set — Slice AI-1 probe needs the real vendor.");
    await queryClient.end();
    process.exit(1);
  }

  const tag = `${Date.now()}`;
  await db.execute(sql`select 1`);
  check("DB connectivity (select 1) as app role", true);

  const [P] = await db.insert(board).values({ slug: `ai1-p-${tag}`, name: "Probe P" }).returning();
  const [Q] = await db.insert(board).values({ slug: `ai1-q-${tag}`, name: "Probe Q" }).returning();
  if (!P || !Q) throw new Error("board seed failed");

  // student app_user (GLOBAL table — board-agnostic identity), created before the
  // session so the FK holds.
  const email = `ai1-stu-${tag}@example.com`;
  const [stu] = await db.insert(appUser).values({ email, name: "Stu", userType: "student" }).returning();
  if (!stu) throw new Error("app_user seed failed");

  // Fixture under P: spine + LOs (both axes) + a question per behaviour, + one
  // practice_session + crafted attempts.
  const fx = await withBoard(P.id, async (tx: Tx) => {
    const [subj] = await tx.insert(subject).values({ boardId: P.id, slug: "phys", name: "Physics", grade: "IGCSE" }).returning();
    const [chap] = await tx.insert(chapter).values({ boardId: P.id, subjectId: subj!.id, slug: "thermal", name: "Thermal", ordinal: 1 }).returning();
    const [tp] = await tx.insert(topic).values({ boardId: P.id, chapterId: chap!.id, slug: "heat", name: "Heat", ordinal: 1 }).returning();
    const [st] = await tx.insert(subTopic).values({ boardId: P.id, topicId: tp!.id, slug: "conduction", name: "Conduction & density", ordinal: 1 }).returning();
    await tx.insert(learningObjective).values({ boardId: P.id, subTopicId: st!.id, axis: "conceptual", code: "C1", description: "Explains thermal conduction in terms of energy transfer by free electrons / particle vibration." });
    await tx.insert(learningObjective).values({ boardId: P.id, subTopicId: st!.id, axis: "procedural", code: "P1", description: "Computes density = mass / volume with correct units, and performs simple unit conversions." });

    const mk = (axis: string, stem: string, ref: string, ord: number, note: string) =>
      tx.insert(question).values({ boardId: P.id, subTopicId: st!.id, axis, kind: "subjective", stem, referenceAnswer: ref, explanation: null, pedagogicalNote: note, ordinal: ord, source: "b2c_authoring" }).returning();

    const [qConcept] = await mk("conceptual", "Explain why a metal spoon feels colder to the touch than a wooden spoon, even when both are at room temperature.", "Metal conducts thermal energy away from the hand far faster (free electrons), so energy leaves the skin quickly and it feels cold; wood is an insulator so little energy flows. Both are actually at the same temperature.", 1, "Probes the conceptual principle behind conduction, not a definition.");
    const [qProc] = await mk("procedural", "A metal block has mass 240 g and volume 30 cm³. Calculate its density. Show your working.", "density = mass / volume = 240 / 30 = 8 g/cm³.", 2, "Routine execution of density = m/V.");
    const [qBoth] = await mk("both", "Explain why increasing the temperature increases the rate of most chemical reactions.", "Higher temperature → particles move faster → more frequent and more energetic collisions exceeding the activation energy → faster rate.", 3, "Pure explain-why — exposes conceptual structure, demands no execution (procedural should abstain).");
    const [qCalib] = await mk("conceptual", "Explain why a metal spoon feels colder than a wooden spoon at the same temperature.", "Metal conducts energy away from the hand quickly; wood does not. Same temperature.", 4, "Used to test calibration: a confident but weak answer.");
    const [qCross] = await mk("procedural", "A car travels 150 m in 5 s. Calculate its speed in m/s, then convert it to km/h.", "speed = 150 / 5 = 30 m/s; ×3.6 = 108 km/h.", 5, "Target procedure = speed = distance/time; the km/h conversion is an adjacent skill.");

    const [sess] = await tx.insert(practiceSession).values({ boardId: P.id, appUserId: stu.id, subTopicId: st!.id, questionIds: [qConcept!.id], currentIndex: 0, status: "active", origin: "self_serve" }).returning();
    return { st: st!.id, qConcept: qConcept!.id, qProc: qProc!.id, qBoth: qBoth!.id, qCalib: qCalib!.id, qCross: qCross!.id, sess: sess!.id };
  });

  const mkAttempt = (questionId: string, answerText: string | null, confidence: number | null, timeMs: number | null, skipReason: string | null) =>
    withBoard(P.id, async (tx: Tx) => {
      const [a] = await tx.insert(attempt).values({ boardId: P.id, practiceSessionId: fx.sess, questionId, appUserId: stu!.id, answerText, confidence, timeMs, skipReason }).returning({ id: attempt.id });
      return a!.id;
    });

  // 2. conceptual question + reasoned answer
  const aConcept = await mkAttempt(fx.qConcept, "It's not actually colder — both are at room temperature. Metal feels colder because it conducts thermal energy away from your hand much faster (it has free electrons), so energy leaves your skin quickly. Wood is an insulator, so energy flows out slowly and it feels warmer.", 4, 55000, null);
  const rConcept = await scoreAttempt(P.id, aConcept);
  const oConcept = await obsFor(P.id, aConcept);
  const concAxis = oConcept.filter((o: any) => o.axis === "conceptual");
  const procAxisOnConcept = oConcept.filter((o: any) => o.axis === "procedural");
  check("conceptual Q reasoned answer → a conceptual observation (1–5)", concAxis.length === 1 && concAxis[0]!.observationLevel >= 1 && concAxis[0]!.observationLevel <= 5);
  check("conceptual Q (axis tag conceptual) → NO procedural observation", procAxisOnConcept.length === 0);
  check("scoreAttempt reports scored + axesRun=[conceptual]", rConcept.scored && rConcept.axesRun.join() === "conceptual");
  soft("conceptual level", concAxis[0]?.observationLevel);

  // 3. procedural question + clean working
  const aProc = await mkAttempt(fx.qProc, "density = mass / volume = 240 g / 30 cm³ = 8 g/cm³.", 5, 40000, null);
  await scoreAttempt(P.id, aProc);
  const oProc = await obsFor(P.id, aProc);
  check("procedural Q clean working → a procedural observation (1–5)", oProc.filter((o: any) => o.axis === "procedural").length === 1);
  check("procedural Q (axis tag procedural) → NO conceptual observation", oProc.filter((o: any) => o.axis === "conceptual").length === 0);
  soft("procedural level", oProc.find((o: any) => o.axis === "procedural")?.observationLevel);

  // 4. BOUND — axis='both' pure explain-why → conceptual obs, procedural abstains
  const aBoth = await mkAttempt(fx.qBoth, "Increasing temperature gives the particles more kinetic energy, so they move faster and collide more often and more energetically. More collisions exceed the activation energy, so the reaction rate goes up.", 4, 50000, null);
  const rBoth = await scoreAttempt(P.id, aBoth);
  const oBoth = await obsFor(P.id, aBoth);
  check("axis='both' → both axes attempted (axesRun length 2)", rBoth.axesRun.length === 2);
  check("BOUND: explain-why answer → a conceptual observation", oBoth.filter((o: any) => o.axis === "conceptual").length === 1);
  check("BOUND: explain-why answer → NO procedural observation (axis not exposed)", oBoth.filter((o: any) => o.axis === "procedural").length === 0);

  // 5. BLIND — the scorer never wrote a mastery_state row for this student
  const mastery = await withBoard(P.id, (tx: Tx) => tx.select().from(masteryState).where(eq(masteryState.studentId, stu!.id)));
  check("BLIND: no mastery_state row written by Stage-1 (Stage-2 is the only mover)", mastery.length === 0);

  // 6. observation fields
  const o0: any = concAxis[0];
  check("observation: attempt_id set, source 'stage1_scorer'", o0.attemptId === aConcept && o0.source === "stage1_scorer");
  check("observation: signals carry confidence + timeMs + model", o0.signals?.confidence === 4 && o0.signals?.timeMs === 55000 && typeof o0.signals?.model === "string");
  check("observation: pedagogical_comment carried", typeof o0.pedagogicalComment === "string" && o0.pedagogicalComment.length > 0);
  check("observation: reasoning is non-empty", typeof o0.reasoning === "string" && o0.reasoning.length > 0);

  // ── 6b. MCQ-CORRECTNESS (Slice) — a bare option letter exposes no method, so
  // the method scorer abstains; we grade the CHOICE against the reference key and
  // write a CAPPED CONCEPTUAL read so it shows in assess and counts (never
  // procedural). FIRM deterministic core first — the helpers, no AI:
  check("mcq helper: detectBareChoice — 'A'/'(b)'/'C.' → letter",
    detectBareChoice("A") === "A" && detectBareChoice(" (b) ") === "B" && detectBareChoice("C.") === "C");
  check("mcq helper: detectBareChoice — non-bare / null → null",
    detectBareChoice("C\n\n4 holes because folded twice") === null && detectBareChoice(null) === null && detectBareChoice("A because it is upright") === null);
  check("mcq helper: extractCorrectOption('(a) B. [2 marks]') → 'B' (real prod ref)",
    extractCorrectOption("(a) B. [2 marks]") === "B");
  check("mcq helper: extractCorrectOption abstains when ambiguous / absent",
    extractCorrectOption("Either A or C could be argued") === null && extractCorrectOption("no clean option letter here") === null);

  // E2E — a procedural bare-choice question; wrong pick 'A', correct is 'B'. The
  // method axis abstains on a lone letter (prod-verified), which is what lets the
  // correctness fallback fire. Assertions are GUARDED on that abstention so the
  // real vendor's discretion can't flake the gate.
  const qMcq = await withBoard(P.id, async (tx: Tx) => {
    const [q] = await tx.insert(question).values({
      boardId: P.id, subTopicId: fx.st, axis: "procedural", kind: "subjective",
      stem: "Rotate the F a quarter-turn clockwise, then mirror it. Choose the option A–D that shows the result.",
      referenceAnswer: "(a) B. [2 marks]", explanation: null,
      pedagogicalNote: "Spatial transform; a bare letter shows no method.", ordinal: 6, source: "b2c_authoring",
    }).returning();
    return q!.id;
  });

  const aWrong = await mkAttempt(qMcq, "A", 5, 4000, null);
  const rWrong = await scoreAttempt(P.id, aWrong);
  const oWrong = await obsFor(P.id, aWrong);
  const wrongMethod = oWrong.filter((o: any) => o.signals?.kind !== "mcq_correctness");
  if (wrongMethod.length > 0) {
    soft("mcq E2E: method axis unexpectedly scored a bare letter — fallback not exercised (rare)", wrongMethod.length);
  } else {
    const w = oWrong.find((o: any) => o.signals?.kind === "mcq_correctness") as any;
    check("mcq E2E: wrong bare choice → 1 conceptual correctness observation", oWrong.length === 1 && w?.axis === "conceptual");
    check("mcq E2E: wrong → level 2, correct=false, guessable, selected 'A' / correct 'B'",
      w?.observationLevel === 2 && w?.signals?.correct === false && w?.signals?.guessable === true && w?.signals?.selected === "A" && w?.signals?.correctOption === "B");
    check("mcq E2E: wrong choice → NO procedural observation (no method shown)", oWrong.filter((o: any) => o.axis === "procedural").length === 0);
    check("mcq E2E: confident (5) + wrong → calibration flag 'over'", w?.calibrationFlag === "over");
    check("mcq E2E: scoreAttempt reports observationsWritten = 1", rWrong.observationsWritten === 1);
  }

  const aRight = await mkAttempt(qMcq, "B", 3, 5000, null);
  await scoreAttempt(P.id, aRight);
  const oRight = await obsFor(P.id, aRight);
  const rightMethod = oRight.filter((o: any) => o.signals?.kind !== "mcq_correctness");
  if (rightMethod.length > 0) {
    soft("mcq E2E: method axis unexpectedly scored the correct bare letter (rare)", rightMethod.length);
  } else {
    const r = oRight.find((o: any) => o.signals?.kind === "mcq_correctness") as any;
    check("mcq E2E: correct bare choice → level 3 conceptual, correct=true", r?.observationLevel === 3 && r?.axis === "conceptual" && r?.signals?.correct === true);
    check("mcq E2E: correct choice → no over-flag", r?.calibrationFlag !== "over");
  }

  // 7. SOFT calibration — confident but weak
  const aCalib = await mkAttempt(fx.qCalib, "idk, maybe because metal is heavier and heavy things are colder.", 5, 8000, null);
  await scoreAttempt(P.id, aCalib);
  const oCalib = await obsFor(P.id, aCalib);
  const calibObs: any = oCalib.find((o: any) => o.axis === "conceptual");
  check("calibration case scored (conceptual obs present)", !!calibObs);
  check("calibration flag is a valid value (null|over|under)", calibObs == null || [null, "over", "under"].includes(calibObs.calibrationFlag));
  soft("calibration flag (hoped 'over' for confident+weak)", calibObs?.calibrationFlag);
  soft("calibration case level", calibObs?.observationLevel);

  // 8. SOFT non-subtopic (S2R-1; was cross-concept) — speed correct, km/h
  // conversion (adjacent) wrong. Whether the model writes a procedural obs
  // (capping the rung + emitting a non-subtopic note) vs ABSTAINS (judging the
  // adjacent slip as the only notable feature) is the model's discretion — all
  // SOFT (log, never fail). FIRM only on plumbing: when a note exists it lives
  // in the non_subtopic_note COLUMN, and signals no longer carries it.
  const aCross = await mkAttempt(fx.qCross, "speed = 150 / 5 = 30 m/s. To get km/h I multiply by 60: 30 × 60 = 1800 km/h.", 3, 60000, null);
  await scoreAttempt(P.id, aCross);
  const oCross = await obsFor(P.id, aCross);
  const crossObs: any = oCross.find((o: any) => o.axis === "procedural");
  soft("non-subtopic: procedural obs produced?", !!crossObs);
  soft("non-subtopic note (column)", crossObs?.nonSubtopicNote);
  soft("non-subtopic procedural level (should not be tanked to 1 for the adjacent slip)", crossObs?.observationLevel);
  // 8b. S2R-1 WIRING — the vendor→column seam, proven with a REAL call.
  // Sound conduction reasoning (so the conceptual axis is definitely exposed and
  // scored) carrying an unmistakable gap from ANOTHER chapter (temperature
  // scales: "20 K at room temperature"). Per §2 that must NOT dent the
  // conduction rung; it must leave as a nonSubtopicNote.
  //
  // Why this claim is FIRM on the column but SOFT on the content: if Gemini ever
  // renamed/dropped the field, zod would default it to null, the column would be
  // silently always-null, and every other check here would still pass green
  // (M40). Asserting a real call populates it at least once is the only thing
  // that can fail in that case. WHAT the model writes stays its discretion.
  const aNonSub = await mkAttempt(
    fx.qConcept,
    "Metal feels colder because it conducts thermal energy away from my hand much faster — the free electrons carry energy quickly, so energy leaves my skin fast. Wood is an insulator, so energy flows out slowly and it feels warmer. Both are actually at the same temperature, which is about 20 degrees Kelvin in this room.",
    4,
    50000,
    null,
  );
  await scoreAttempt(P.id, aNonSub);
  const oNonSub = await obsFor(P.id, aNonSub);
  const nonSubObs: any = oNonSub.find((o: any) => o.axis === "conceptual");
  check("S2R-1 wiring: off-subtopic aside still scored on the conceptual axis (no abstain)", !!nonSubObs);
  check(
    "S2R-1 wiring: a REAL Gemini call populated the non_subtopic_note COLUMN (vendor→zod→DB seam)",
    typeof nonSubObs?.nonSubtopicNote === "string" && nonSubObs.nonSubtopicNote.length > 0,
  );
  soft("non-subtopic note the model wrote", nonSubObs?.nonSubtopicNote);
  soft("conduction rung (must NOT be dented by the off-chapter aside)", nonSubObs?.observationLevel);

  const allNew = [...oConcept, ...oProc, ...oCalib, ...oCross, ...oNonSub] as any[];
  check(
    "S2R-1: no new observation writes the note into signals (column is the only home)",
    allNew.every((o: any) => o.signals?.crossConceptNote === undefined),
  );

  // 9. IDEMPOTENT re-run
  const beforeCount = (await obsFor(P.id, aConcept)).length;
  await scoreAttempt(P.id, aConcept);
  const afterCount = (await obsFor(P.id, aConcept)).length;
  check(`IDEMPOTENT: re-score same attempt → obs count unchanged (${beforeCount}→${afterCount})`, beforeCount === afterCount && afterCount >= 1);

  // 10. skip attempt → not scored
  const aSkip = await mkAttempt(fx.qProc, null, null, null, "too hard");
  const rSkip = await scoreAttempt(P.id, aSkip);
  const oSkip = await obsFor(P.id, aSkip);
  check("skip attempt → scored:false, 0 observations", rSkip.scored === false && oSkip.length === 0);

  // 11. RLS cross-board
  let rls = false;
  try {
    await scoreAttempt(Q.id, aConcept);
  } catch (e) {
    rls = e instanceof AttemptNotFoundError;
  }
  check("RLS: scoring a P attempt under board Q → ATTEMPT_NOT_FOUND", rls);

  // 12. unknown attempt
  let unknown = false;
  try {
    await scoreAttempt(P.id, randomUUID());
  } catch (e) {
    unknown = e instanceof AttemptNotFoundError;
  }
  check("unknown attempt id → ATTEMPT_NOT_FOUND", unknown);

  // 13. SOFT E2E — enqueue → inline Worker → observation appears
  try {
    const aE2E = await mkAttempt(fx.qProc, "density = 240/30 = 8 g/cm³, units g per cm cubed.", 4, 30000, null);
    const worker = new Worker<Stage1JobData>(
      ASSESSMENT_QUEUE,
      async (job) => scoreAttempt(job.data.boardId, job.data.attemptId),
      { connection: redisConnection, concurrency: 1 },
    );
    const done = new Promise<boolean>((resolve) => {
      const t = setTimeout(() => resolve(false), 45_000);
      worker.on("completed", (job) => {
        if (job.data.attemptId === aE2E) {
          clearTimeout(t);
          resolve(true);
        }
      });
    });
    await enqueueStage1Scoring({ attemptId: aE2E, boardId: P.id });
    const ok = await done;
    const oE2E = await obsFor(P.id, aE2E);
    check(`E2E queue→worker→scorer drained the job (${ok})`, ok && oE2E.length >= 1);
    await worker.close();
  } catch (e) {
    console.log(`  ~ E2E queue round-trip skipped: ${e instanceof Error ? e.message : e}`);
  }

  // ── cleanup (FK-safe) ──
  await withBoard(P.id, async (tx: Tx) => {
    await tx.delete(observation).where(eq(observation.boardId, P.id));
    await tx.delete(attempt).where(eq(attempt.boardId, P.id));
    await tx.delete(practiceSession).where(eq(practiceSession.boardId, P.id));
    await tx.delete(question).where(eq(question.boardId, P.id));
    await tx.delete(learningObjective).where(eq(learningObjective.boardId, P.id));
    await tx.delete(subTopic).where(eq(subTopic.boardId, P.id));
    await tx.delete(topic).where(eq(topic.boardId, P.id));
    await tx.delete(chapter).where(eq(chapter.boardId, P.id));
    await tx.delete(subject).where(eq(subject.boardId, P.id));
  });
  await db.delete(appUser).where(eq(appUser.email, email));
  await db.delete(board).where(eq(board.id, P.id));
  await db.delete(board).where(eq(board.id, Q.id));
  // drain leftover delayed jobs from this run (idempotent jobIds scoped by attempt)
  await assessmentQueue.obliterate({ force: true }).catch(() => {});

  console.log(`\nprobe_assessment_stage1: ${passed} passed, ${failed} failed`);
  await assessmentQueue.close().catch(() => {});
  await redisConnection.quit().catch(() => {});
  await queryClient.end();
  process.exit(failed === 0 ? 0 : 1);
}

main().catch(async (err) => {
  console.error("probe_assessment_stage1 FAILED:", err);
  await queryClient.end();
  process.exit(1);
});
