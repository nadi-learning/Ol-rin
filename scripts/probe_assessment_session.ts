/**
 * probe_assessment_session — Slice S2R-2 + S2R-3 exit gate (the Stage-2 sitting
 * and the synthesis that runs when it finalizes).
 *
 * Real DB + real RLS + real Gemini, throwaway boards P/Q (M22) with full cleanup.
 *
 * S2R-3 adds a third claim of the same kind — SYNTHESIS ON THE FAST PATH
 * (D-S2R-3). The chat is optional; the synthesis is not. The probe finalizes with
 * no chat and no items — the common path — and asserts a real call filled the
 * chapter/subject insights and the horizontals. If synthesis ever slipped to the
 * chat-only path, every store above the sub-topic would sit empty while mastery
 * kept moving, and nothing would error.
 *
 * The two claims this gate exists for — both would fail SILENTLY without it:
 *
 *   ATOMICITY (D-S2R-1). A sitting commits all N sub-topics or none. The probe
 *     sabotages a sitting so finalize throws on the SECOND sub-topic, then asserts
 *     the FIRST one's mastery move was rolled back with it. Without the single tx
 *     that first move would stick, leaving a half-certified assignment — a state
 *     no tutor chose and no screen shows. Nothing would error.
 *
 *   THE CATCH-ALL (D-S2R-7). Self-serve + teach-back evidence has no assignment
 *     (observation reaches one only via attempt → practice_session → assignment_id,
 *     null for self-serve). The hard cut removes the only path that certified it,
 *     so the probe drives a genuinely self-serve sub_topic all the way to a moved
 *     mastery_state. If the partition ever drops that evidence, mastery just
 *     quietly stops moving for self-serve practice (the M51 failure shape).
 *
 * Two-tier (don't over-read one AI response): FIRM on plumbing + every write we
 * control (the tutor's FINAL levels are ours, so the mastery moves are
 * deterministic); SOFT on what the model actually proposed.
 *
 *   1. DB connectivity.
 *   2. RLS is ON + FORCED on assessment_session (M34 — asserted in pg_class, never
 *      inferred from the migrate log).
 *   3. list: a completed assignment's pending sub_topics form ONE assignment entry.
 *   4. list: the self-serve-only sub_topic lands in the CATCH-ALL, not the assignment.
 *   5. list: an INCOMPLETE assignment's sub_topic is not stranded — it falls to the catch-all.
 *   6. open (REAL Gemini ×N, in parallel): a draft persisted per sub_topic, each structurally valid.
 *   7. open is IDEMPOTENT — re-opening returns the SAME sitting (must not re-bill N calls).
 *   8. ATOMICITY: a sabotaged sitting throws mid-loop → NO sub_topic moved + sitting still open.
 *   9. accept-all fast path (D-S2R-2): finalize with NO items → every sub_topic certified at the drafted pair.
 *  10. the sitting survives finalize + its reasoning is still readable (spec §6).
 *  11. re-finalize → SESSION_ALREADY_FINALIZED.
 *  12. CATCH-ALL certifies for real: the self-serve sub_topic's mastery_state now exists.
 *  13. ownership: another tutor's sitting → NOT_FOUND (no existence leak).
 *  14. RLS: read a P sitting under board Q → NOT_FOUND.
 *
 * S2R-4 (the 2b ADVISORY chat + the insights read) — on the CATCH-ALL sitting,
 * DELIBERATELY: the assignment sitting stays chat-less so claim 10b ("synthesis
 * ran with NO chat") keeps the premise its name states (M55 — an edit that
 * changes what an existing gate proves is a defused gate).
 *
 *  15. a REAL advisory turn persists the user+assistant pair on the row; a second
 *      turn sees the first (history reaches the model — codeword recall, engineered
 *      unrefusable per M52).
 *  16. the transcript survives finalize, and rides into synthesis's INPUT — FIRM at
 *      the gather seam (role mapping, deterministic); what the model DOES with it is
 *      SOFT (its discretion).
 *  17. chat on a FINALIZED sitting → SESSION_ALREADY_FINALIZED; a foreign tutor's
 *      chat → NOT_FOUND (no existence leak).
 *  18. getStudentInsights: the S2R-3 stores come back named (subject/chapter joins);
 *      a foreign tutor → NOT_FOUND.
 */
import { and, eq, sql } from "drizzle-orm";
import type { PgTransaction } from "drizzle-orm/pg-core";
import {
  appUser,
  assessmentSession,
  assignment,
  attempt,
  board,
  chapter,
  crossConceptFlag,
  eventLog,
  horizontalSkill,
  horizontalSkillState,
  learningObjective,
  masteryHistory,
  masteryState,
  observation,
  practiceSession,
  question,
  schedulingState,
  student,
  studentChapterInsight,
  studentSubjectInsight,
  subTopic,
  subject,
  topic,
  transcript,
} from "@b2c/kernel/schema";
import { db, queryClient } from "../src/db/client";
import { withBoard } from "../src/db/with-board";
import {
  AssessmentSessionNotFoundError,
  finalizeAssessmentSession,
  getAssessmentSession,
  listPendingAssessments,
  openAssessmentSession,
  SessionAlreadyFinalizedError,
} from "../src/services/assessment_session";
import { sendAssessmentChatTurn } from "../src/services/assessment_chat";
import { gatherSynthesisInput, writeSynthesis } from "../src/services/synthesis";
import {
  getCrossConceptFlags,
  getStudentInsights,
  setCrossConceptFlagAddressed,
  StudentNotFoundError,
} from "../src/services/tutor";
import { __aiConfigured } from "../src/services/ai/gemini";

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

const rows = <T>(boardId: string, fn: (tx: Tx) => Promise<T>) => withBoard(boardId, fn);

async function main() {
  if (!__aiConfigured()) {
    console.error("GEMINI_API_KEY not set — the S2R-2 probe needs the real vendor.");
    await queryClient.end();
    process.exit(1);
  }

  const tag = `${Date.now()}`;
  await db.execute(sql`select 1`);
  check("DB connectivity (select 1) as app role", true);

  // 2. RLS on the NEW table — read the DATABASE, not the migrate log (M34).
  const rls = await db.execute(sql`
    select relrowsecurity, relforcerowsecurity
    from pg_class where relname = 'assessment_session'`);
  const rlsRow = (rls as unknown as Array<{ relrowsecurity: boolean; relforcerowsecurity: boolean }>)[0];
  check(
    "RLS enabled + FORCED on assessment_session (pg_class, not the migrate log)",
    rlsRow?.relrowsecurity === true && rlsRow?.relforcerowsecurity === true,
  );

  const [P] = await db.insert(board).values({ slug: `s2r-p-${tag}`, name: "Probe P" }).returning();
  const [Q] = await db.insert(board).values({ slug: `s2r-q-${tag}`, name: "Probe Q" }).returning();
  if (!P || !Q) throw new Error("board seed failed");

  const tutorEmail = `s2r-tut-${tag}@example.com`;
  const stuEmail = `s2r-stu-${tag}@example.com`;
  const otherTutEmail = `s2r-tut2-${tag}@example.com`;
  const [tut] = await db.insert(appUser).values({ email: tutorEmail, name: "Tutor", userType: "tutor" }).returning();
  const [stu] = await db.insert(appUser).values({ email: stuEmail, name: "Stu", userType: "student" }).returning();
  const [tut2] = await db.insert(appUser).values({ email: otherTutEmail, name: "Tutor2", userType: "tutor" }).returning();
  if (!tut || !stu || !tut2) throw new Error("app_user seed failed");

  const baseMs = Date.now() - 21 * 24 * 3600 * 1000;

  const fx = await withBoard(P.id, async (tx: Tx) => {
    const [subj] = await tx.insert(subject).values({ boardId: P.id, slug: "phys", name: "Physics", grade: "IGCSE" }).returning();
    const [chap] = await tx.insert(chapter).values({ boardId: P.id, subjectId: subj!.id, slug: "motion", name: "Motion", ordinal: 1 }).returning();
    const [tp] = await tx.insert(topic).values({ boardId: P.id, chapterId: chap!.id, slug: "speed", name: "Speed", ordinal: 1 }).returning();

    // Two sub_topics inside the ASSIGNMENT's frozen composition.
    const [stA] = await tx.insert(subTopic).values({ boardId: P.id, topicId: tp!.id, slug: "accel", name: "Acceleration", ordinal: 1 }).returning();
    const [stB] = await tx.insert(subTopic).values({ boardId: P.id, topicId: tp!.id, slug: "velocity", name: "Velocity", ordinal: 2 }).returning();
    // A sub_topic the student only ever practised SELF-SERVE — the D-S2R-7 case.
    const [stLoose] = await tx.insert(subTopic).values({ boardId: P.id, topicId: tp!.id, slug: "graphs", name: "Motion graphs", ordinal: 3 }).returning();
    // A sub_topic inside an INCOMPLETE assignment — must not be stranded.
    const [stOpen] = await tx.insert(subTopic).values({ boardId: P.id, topicId: tp!.id, slug: "reltime", name: "Relative motion", ordinal: 4 }).returning();

    for (const [st, c, p] of [
      [stA!, "Explains acceleration as the rate of change of velocity.", "Computes a = Δv/Δt with correct units."],
      [stB!, "Explains velocity as displacement over time, with direction.", "Computes velocity from displacement and time."],
      [stLoose!, "Reads the gradient of a distance–time graph as a rate.", "Derives velocity from a distance–time graph."],
      [stOpen!, "Explains why motion is described relative to a frame.", "Converts a velocity between two frames."],
    ] as const) {
      await tx.insert(learningObjective).values({ boardId: P.id, subTopicId: st.id, axis: "conceptual", code: "C1", description: c });
      await tx.insert(learningObjective).values({ boardId: P.id, subTopicId: st.id, axis: "procedural", code: "P1", description: p });
    }

    await tx.insert(student).values({ userId: stu.id, boardId: P.id, class: "9", tutorId: tut.id });

    // ── the COMPLETED assignment over [stA, stB] ──
    const [asg] = await tx
      .insert(assignment)
      .values({
        boardId: P.id, tutorId: tut.id, studentId: stu.id, mode: "blocked",
        chapterId: chap!.id, subTopicIds: [stA!.id, stB!.id],
      })
      .returning();
    // Completion is DERIVED (D-ASG-3): every sub_topic needs a COMPLETED
    // practice_session. assignment.status is never updated and must not be read.
    for (const st of [stA!, stB!]) {
      await tx.insert(practiceSession).values({
        boardId: P.id, appUserId: stu.id, subTopicId: st.id, questionIds: [],
        status: "completed", origin: "tutor_assigned", assignmentId: asg!.id,
      });
    }

    // ── an INCOMPLETE assignment over [stOpen] (session left 'active') ──
    const [asgOpen] = await tx
      .insert(assignment)
      .values({
        boardId: P.id, tutorId: tut.id, studentId: stu.id, mode: "blocked",
        chapterId: chap!.id, subTopicIds: [stOpen!.id],
      })
      .returning();
    await tx.insert(practiceSession).values({
      boardId: P.id, appUserId: stu.id, subTopicId: stOpen!.id, questionIds: [],
      status: "active", origin: "tutor_assigned", assignmentId: asgOpen!.id,
    });

    // ── a genuinely SELF-SERVE session on stLoose: no assignment_id ──
    const [ssSession] = await tx
      .insert(practiceSession)
      .values({
        boardId: P.id, appUserId: stu.id, subTopicId: stLoose!.id, questionIds: [],
        status: "completed", origin: "self_serve", assignmentId: null,
      })
      .returning();
    const [q] = await tx
      .insert(question)
      .values({
        boardId: P.id, subTopicId: stLoose!.id, axis: "both", kind: "subjective",
        stem: "A car's distance–time graph is a straight line. What does its gradient tell you?",
        referenceAnswer: "The gradient is the speed — constant, since the line is straight.",
        ordinal: 1, source: "b2c_authoring", status: "approved",
      })
      .returning();
    const [att] = await tx
      .insert(attempt)
      .values({
        boardId: P.id, practiceSessionId: ssSession!.id, questionId: q!.id, appUserId: stu.id,
        answerText: "The gradient is the speed. It's a straight line so the speed doesn't change.",
        confidence: 4, timeMs: 30000,
      })
      .returning();

    // ── S2R-3: the HORIZONTAL TAXONOMY for this chapter ──
    // Predefined content (D-S2R-4). Seeded here because these are throwaway boards
    // — `seed:horizontals` ingests the real registry, which knows nothing of board
    // P. Without these rows synthesis is handed an EMPTY taxonomy and correctly
    // returns no horizontals, which would make every horizontal claim below pass
    // for the wrong reason.
    await tx.insert(horizontalSkill).values({
      boardId: P.id, subjectId: subj!.id, chapterId: chap!.id, slug: "language_precision",
      description:
        "Hold the chapter's near-synonym distinctions apart in your own wording — speed vs velocity, distance vs displacement — and use the quantity the question actually established.",
    });
    await tx.insert(horizontalSkill).values({
      boardId: P.id, subjectId: subj!.id, chapterId: chap!.id, slug: "quantitative_thinking",
      description:
        "Sense whether a magnitude is physically plausible and whether its units match the axes or data it came from.",
    });

    const mkObs = (stId: string, axis: string, level: number, reasoning: string, ageDays: number, ped: string, attemptId?: string, note?: string) =>
      tx.insert(observation).values({
        boardId: P.id, studentId: stu.id, subTopicId: stId, questionId: null,
        attemptId: attemptId ?? null, axis, observationLevel: level, reasoning,
        signals: {}, calibrationFlag: null, pedagogicalComment: ped, source: "stage1_scorer",
        nonSubtopicNote: note ?? null,
        createdAt: new Date(baseMs + ageDays * 24 * 3600 * 1000),
      });

    // assignment evidence.
    //
    // ⚠️ The two `language_precision` notes below are load-bearing, and engineered
    // to be UNREFUSABLE (M52): a nullable field parsed out of a vendor response is
    // unproven until a real call has filled it once, and synthesis writes nothing
    // when the pool is empty — so a fixture with no notes would go green with every
    // new store still empty. They sit on DIFFERENT sub_topics on purpose: one note
    // is an anecdote the prompt is told to treat as such, the SAME slip twice is a
    // pattern, and a pattern across sub_topics is the one claim Stage 2a's silo
    // structurally cannot make. That is the whole thesis of this slice.
    await mkObs(stA!.id, "conceptual", 4, "Linked Δv/Δt to the principle, reasoned from it on a variant.", 0, "transfer/variant probe", undefined,
      "Wrote 'speed' throughout where the question had explicitly established 'velocity', and dropped the direction each time. The physics reasoning is sound — the quantity they NAME is not the quantity they USE. This is terminology precision, and it belongs to no single sub-topic.");
    await mkObs(stA!.id, "conceptual", 3, "Several correct points but listed, not connected.", 8, "routine explain-why");
    await mkObs(stA!.id, "procedural", 3, "Right and clean, every step walked.", 11, "routine execution");
    await mkObs(stB!.id, "conceptual", 3, "Describes velocity with direction, adequately.", 2, "routine explain-why", undefined,
      "Used 'speed' and 'velocity' interchangeably within a single sentence, again. The distinction this chapter rests on is not being held in their wording — the same slip as elsewhere in this assignment, not a one-off.");
    await mkObs(stB!.id, "procedural", 3, "Computed velocity correctly with units.", 9, "routine execution");

    // SELF-SERVE evidence on stLoose — carried by a real attempt whose
    // practice_session has NO assignment. This is the row the hard cut would strand.
    await mkObs(stLoose!.id, "conceptual", 3, "Correctly reads the gradient as speed; explains constancy from straightness.", 3, "routine explain-why", att!.id,
      "Stated the car travels '60 kilometres per second' from a graph whose axis is in km/h — off by a factor of 3600, and the implausibility went unnoticed. That is a quantitative-sense gap, not a graph-reading one.");
    await mkObs(stLoose!.id, "procedural", 3, "Derived the speed from the graph cleanly.", 10, "routine execution", att!.id);

    // TEACH-BACK evidence (no attempt at all) on the incomplete assignment's sub_topic.
    await mkObs(stOpen!.id, "conceptual", 3, "Explained frame-relative motion in their own words.", 4, "teach-back");

    return {
      stA: stA!.id, stB: stB!.id, stLoose: stLoose!.id, stOpen: stOpen!.id,
      asg: asg!.id, asgOpen: asgOpen!.id, attemptId: att!.id, questionId: q!.id,
      ssSessionId: ssSession!.id, subjId: subj!.id, chapId: chap!.id,
    };
  });

  // ── 3–5. the partition ──
  const listed = await rows(P.id, (tx) => listPendingAssessments(tx, { tutorUserId: tut.id, studentId: stu.id }));
  soft("listed sittings", listed.map((l) => ({ kind: l.kind, label: l.label, subs: l.subTopicNames, pending: l.pendingCount })));

  const asgEntry = listed.find((l) => l.assignmentId === fx.asg);
  check(
    "list: the COMPLETED assignment forms one sitting over its 2 pending sub_topics",
    !!asgEntry && asgEntry.kind === "assignment" &&
      asgEntry.subTopicIds.length === 2 &&
      asgEntry.subTopicIds.includes(fx.stA) && asgEntry.subTopicIds.includes(fx.stB),
  );

  const catchAll = listed.find((l) => l.kind === "catch_all");
  check(
    "list: the SELF-SERVE-only sub_topic lands in the CATCH-ALL (D-S2R-7)",
    !!catchAll && catchAll.subTopicIds.includes(fx.stLoose),
  );
  check(
    "list: the catch-all does NOT swallow the assignment's sub_topics (no double-certification)",
    !!catchAll && !catchAll.subTopicIds.includes(fx.stA) && !catchAll.subTopicIds.includes(fx.stB),
  );
  check(
    "list: an INCOMPLETE assignment's evidence is not stranded — it falls to the catch-all",
    !!catchAll && catchAll.subTopicIds.includes(fx.stOpen),
  );

  // ── 6. open the assignment sitting: N REAL Gemini drafts, in parallel ──
  const t0 = Date.now();
  const opened = await rows(P.id, (tx) =>
    openAssessmentSession(tx, { boardId: P.id, tutorUserId: tut.id, studentId: stu.id, assignmentId: fx.asg }),
  );
  soft("open wall-clock ms (2 drafts, parallel)", Date.now() - t0);
  soft("drafted pairs", Object.values(opened.drafts).map((d) => ({
    sub: d.subTopicName, c: d.draft.conceptualLevel, p: d.draft.proceduralLevel,
  })));

  check("open: sitting covers both of the assignment's sub_topics", opened.subTopicIds.length === 2);
  check(
    "open: a REAL draft persisted for EVERY sub_topic (a sitting cannot open half-drafted)",
    !!opened.drafts[fx.stA] && !!opened.drafts[fx.stB],
  );
  const dA = opened.drafts[fx.stA]!;
  check(
    "open: the draft is structurally valid (pair in 1–5 or null, prose non-empty)",
    (dA.draft.conceptualLevel === null || (dA.draft.conceptualLevel >= 1 && dA.draft.conceptualLevel <= 5)) &&
      dA.draft.description.trim().length > 0 &&
      dA.draft.reasoning.trim().length > 0 &&
      dA.draft.log.trim().length > 0,
  );
  check("open: cold start — no prior mastery, so current is null", dA.current === null);

  // ── 7. idempotent re-open (must NOT re-bill N Gemini calls) ──
  const t1 = Date.now();
  const reopened = await rows(P.id, (tx) =>
    openAssessmentSession(tx, { boardId: P.id, tutorUserId: tut.id, studentId: stu.id, assignmentId: fx.asg }),
  );
  const reopenMs = Date.now() - t1;
  soft("re-open wall-clock ms (should be a read, not N calls)", reopenMs);
  check("open: IDEMPOTENT — re-opening returns the SAME sitting", reopened.id === opened.id);
  check("open: re-open did not re-draft (returned in <2s, i.e. no vendor call)", reopenMs < 2000);
  const sessCount = await rows(P.id, (tx) =>
    tx.select().from(assessmentSession).where(eq(assessmentSession.assignmentId, fx.asg)),
  );
  check("open: re-opening did not create a second sitting row", sessCount.length === 1);

  // ── 8a. a sitting missing a draft REFUSES to finalize ──
  // S2R-3 moved this throw EARLIER: finalize now resolves all N drafts up front so
  // synthesis can be handed the finals before anything is written, which means a
  // missing draft is caught before a single vendor call is billed. Still the same
  // guarantee — never silently skip a sub_topic the tutor believes they certified.
  const goodDrafts = opened.drafts;
  await rows(P.id, (tx) =>
    tx.update(assessmentSession)
      .set({ drafts: { [fx.stA]: goodDrafts[fx.stA] } })
      .where(eq(assessmentSession.id, opened.id)),
  );
  let threw = false;
  try {
    await rows(P.id, (tx) =>
      finalizeAssessmentSession(tx, { boardId: P.id, tutorUserId: tut.id, sessionId: opened.id }),
    );
  } catch {
    threw = true;
  }
  check("atomicity: a sitting missing a draft REFUSES to finalize (never silently skips)", threw);

  // ── 8b. ATOMICITY (D-S2R-1) — the claim of the slice ──
  // ⚠️ THIS SABOTAGE IS NOT THE OBVIOUS ONE, AND THE OBVIOUS ONE IS NOW VACUOUS.
  // 8a's missing draft throws during the up-front resolve, i.e. BEFORE any write —
  // so "zero mastery rows afterwards" would pass with nothing ever having been
  // committed, and this gate would prove nothing while looking green (M48: an
  // assertion that cannot fail). To actually test the rollback, the throw must land
  // MID-WRITE-LOOP: stB's draft carries an out-of-range level, so stA's mastery
  // move COMMITS and stB then violates mastery_state_levels_range. If the sitting
  // were not one tx, stA would stick.
  await rows(P.id, (tx) =>
    tx.update(assessmentSession)
      .set({
        drafts: {
          [fx.stA]: goodDrafts[fx.stA],
          [fx.stB]: {
            ...goodDrafts[fx.stB]!,
            draft: { ...goodDrafts[fx.stB]!.draft, conceptualLevel: 99 },
          },
        },
      })
      .where(eq(assessmentSession.id, opened.id)),
  );
  let threwMidLoop = false;
  try {
    await rows(P.id, (tx) =>
      finalizeAssessmentSession(tx, { boardId: P.id, tutorUserId: tut.id, sessionId: opened.id }),
    );
  } catch {
    threwMidLoop = true;
  }
  check("atomicity: an unwritable level throws mid-loop (the CHECK constraint holds)", threwMidLoop);
  const afterSabotage = await rows(P.id, (tx) =>
    tx.select().from(masteryState).where(eq(masteryState.studentId, stu.id)),
  );
  check(
    "ATOMICITY (D-S2R-1): the throw rolled back the sub_topic that had ALREADY committed — zero mastery rows",
    afterSabotage.length === 0,
  );
  // Synthesis writes last, so a mid-loop throw must take it down too — otherwise a
  // failed sitting would leave insight text about certifications that never landed.
  const insightsAfterSabotage = await rows(P.id, (tx) =>
    tx.select().from(studentChapterInsight).where(eq(studentChapterInsight.studentId, stu.id)),
  );
  check(
    "ATOMICITY: the rollback took the SYNTHESIS writes with it — zero chapter insights",
    insightsAfterSabotage.length === 0,
  );
  const stillOpen = await rows(P.id, (tx) =>
    tx.select().from(assessmentSession).where(eq(assessmentSession.id, opened.id)),
  );
  check("atomicity: the failed sitting is still OPEN (finalize did not half-land)", stillOpen[0]!.status === "open");

  // restore the real drafts
  await rows(P.id, (tx) =>
    tx.update(assessmentSession).set({ drafts: goodDrafts }).where(eq(assessmentSession.id, opened.id)),
  );

  // ── 9. accept-all fast path (D-S2R-2): no items → commit as drafted ──
  const fin = await rows(P.id, (tx) =>
    finalizeAssessmentSession(tx, { boardId: P.id, tutorUserId: tut.id, sessionId: opened.id }),
  );
  check("accept-all: ONE call with NO items certified every sub_topic in the sitting", fin.committed.length === 2);
  check("accept-all: nothing was flagged as a tutor override (the draft was accepted as-is)", fin.committed.every((c) => !c.overridden));

  const ms = await rows(P.id, (tx) =>
    tx.select().from(masteryState).where(eq(masteryState.studentId, stu.id)),
  );
  const msById = new Map(ms.map((m) => [m.subTopicId, m]));
  check("accept-all: BOTH sub_topics now have a certified mastery_state", msById.has(fx.stA) && msById.has(fx.stB));
  check(
    "accept-all: the committed levels are exactly what the model drafted",
    msById.get(fx.stA)!.conceptualLevel === dA.draft.conceptualLevel &&
      msById.get(fx.stA)!.proceduralLevel === dA.draft.proceduralLevel,
  );
  check(
    "accept-all: the AI-authored log was committed from the SITTING, not from the client",
    msById.get(fx.stA)!.log === dA.draft.log,
  );

  // ── 10. the sitting survives finalize; reasoning still readable (spec §6) ──
  const after = await rows(P.id, (tx) => getAssessmentSession(tx, { tutorUserId: tut.id, sessionId: opened.id }));
  check("post-finalize: the sitting is marked finalized + stamped", after.status === "finalized" && after.finalizedAt !== null);
  check(
    "post-finalize: the Stage-2 REASONING is still readable by the tutor (spec §6)",
    (after.drafts[fx.stA]?.draft.reasoning ?? "").trim().length > 0,
  );

  // ── 10b. S2R-3: SYNTHESIS ran on the ACCEPT-ALL fast path (D-S2R-3) ──
  // The whole point of D-S2R-3: the tutor above skipped the chat entirely and
  // clicked accept-all. If synthesis only ran on the chat path, every store below
  // would be empty right now and NOTHING would error — mastery would move and the
  // above-sub-topic view would just silently never update.
  //
  // FIRM that a REAL call filled each store; SOFT on what it actually said. That
  // split is the M40/M52 lesson: asserting the writer writes proves nothing about
  // whether the real path calls it, and a store that is always-empty passes every
  // check that only looks at plumbing.
  soft("synthesis writes (accept-all path)", fin.synthesis);
  check("SYNTHESIS ran at finalize with NO chat + NO items — the accept-all fast path (D-S2R-3)", fin.synthesis !== undefined);
  check("synthesis: nothing was dropped as unresolvable", fin.synthesis.dropped.length === 0);

  const chIns = await rows(P.id, (tx) =>
    tx.select().from(studentChapterInsight).where(eq(studentChapterInsight.studentId, stu.id)),
  );
  check("synthesis: a REAL call wrote the student_chapter_insight (not the probe)", chIns.length === 1 && chIns[0]!.insight.trim().length > 0);
  soft("chapter insight", chIns[0]?.insight);

  const sjIns = await rows(P.id, (tx) =>
    tx.select().from(studentSubjectInsight).where(eq(studentSubjectInsight.studentId, stu.id)),
  );
  check("synthesis: a REAL call wrote the student_subject_insight", sjIns.length === 1 && sjIns[0]!.insight.trim().length > 0);
  soft("subject insight", sjIns[0]?.insight);

  // THE claim of the slice's thesis: a pattern NO sub-topic call could see.
  // language_precision was slipped on stA AND stB — two different sub-topics, each
  // certified in its own silo, neither able to notice the other.
  const hz = await rows(P.id, (tx) =>
    tx.select().from(horizontalSkillState).where(eq(horizontalSkillState.studentId, stu.id)),
  );
  soft("horizontal_skill_state rows", hz.map((h) => ({ slug: h.slug, level: h.level, prose: h.prose })));
  const lp = hz.find((h) => h.slug === "language_precision");
  check(
    "SYNTHESIS: levelled `language_precision` from a pattern spanning TWO sub-topics — the cross-silo claim 2a structurally cannot make",
    !!lp,
  );
  check("synthesis: the horizontal carries a real level (1–5), not a null placeholder", lp?.level != null);
  check("synthesis: the horizontal carries its EVIDENCE prose (a level without evidence is unauditable)", (lp?.prose ?? "").trim().length > 0);
  check("synthesis: it is scoped to the SUBJECT, not the chapter (D-S2R-8)", lp?.subjectId === fx.subjId);
  check(
    "synthesis: every slug written came from the seeded taxonomy — none invented (D-S2R-4)",
    hz.every((h) => ["language_precision", "quantitative_thinking"].includes(h.slug)),
  );

  // The reader half. The writer widened; an inner join on from_sub_topic_id would
  // drop every synthesis item SILENTLY (a green writer + an invisible worklist).
  const wl = await rows(P.id, (tx) =>
    getCrossConceptFlags(tx, { tutorUserId: tut.id, studentId: stu.id }),
  );
  soft("worklist as the TUTOR sees it", wl.map((f) => ({ origin: f.origin, from: f.fromSubTopicName, note: f.note })));
  const synthItems = wl.filter((f) => f.origin === "stage2_synthesis");
  check(
    "worklist: synthesis ACTIONS are VISIBLE to the tutor (the read left-joins — an inner join drops every null-sub_topic item)",
    synthItems.length === fin.synthesis.worklistItems,
  );
  check("worklist: a synthesis item names its origin rather than leaving a blank sub_topic", synthItems.every((f) => f.fromSubTopicId === null));
  // Spec §5 keeps this table because a CLEARABLE queue is the one thing about it
  // that worked. A synthesis item a tutor cannot clear would clog that queue
  // forever — and it takes a different code path (setCrossConceptFlagAddressed
  // re-reads through the same join that used to drop these rows).
  if (synthItems[0]) {
    const cleared = await rows(P.id, (tx) =>
      setCrossConceptFlagAddressed(tx, { tutorUserId: tut.id, flagId: synthItems[0]!.id, addressed: true }),
    );
    check("worklist: a synthesis item can be MARKED HANDLED like any other (the queue stays clearable)", cleared.addressedAt !== null);
    const openAfter = await rows(P.id, (tx) =>
      getCrossConceptFlags(tx, { tutorUserId: tut.id, studentId: stu.id }),
    );
    check("worklist: once handled it leaves the OPEN queue", !openAfter.some((f) => f.id === synthItems[0]!.id));
    // put it back so the counts below aren't perturbed
    await rows(P.id, (tx) =>
      setCrossConceptFlagAddressed(tx, { tutorUserId: tut.id, flagId: synthItems[0]!.id, addressed: false }),
    );
  }

  // Spec §6 — 2b's reasoning survives finalize, like 2a's.
  check(
    "post-finalize: SYNTHESIS reasoning is persisted + readable by the tutor (spec §6)",
    (after.synthesis?.reasoning ?? "").trim().length > 0,
  );
  soft("synthesis reasoning", after.synthesis?.reasoning);

  // ── 10c. the TAXONOMY GATE (D-S2R-4) — deterministic, no vendor call ──
  // The prompt forbids inventing a slug, but a prompt is not an enforcement
  // mechanism. This drives writeSynthesis directly with a hallucinated slug and a
  // bogus chapter key — the ONE place a unit-style claim is right, because the
  // behaviour under test is pure code and must never depend on the model behaving.
  const gate = await rows(P.id, async (tx) => {
    const scope = await gatherSynthesisInput(tx, {
      studentId: stu.id, subTopicIds: [fx.stA, fx.stB],
      certified: [{ subTopicId: fx.stA, conceptualLevel: 3, proceduralLevel: 3, description: "d" }],
    });
    return writeSynthesis(tx, {
      boardId: P.id, studentId: stu.id, sessionId: opened.id, scope: scope.scope,
      result: {
        chapterInsights: [{ chapterKey: "C99", insight: "from a chapter that isn't in scope" }],
        subjectInsights: [],
        horizontals: [{ subjectKey: "S1", slug: "vibe_check", level: 5, prose: "invented skill" }],
        worklistItems: [],
        reasoning: "gate probe",
      },
    });
  });
  soft("taxonomy gate drops", gate.dropped);
  check("gate: an INVENTED horizontal slug is DROPPED, not written (D-S2R-4 — the taxonomy is predefined)", gate.horizontals === 0);
  check("gate: an out-of-scope chapterKey is DROPPED, not guessed at", gate.chapterInsights === 0);
  check("gate: both drops were REPORTED, not swallowed", gate.dropped.length === 2);
  const hzAfterGate = await rows(P.id, (tx) =>
    tx.select().from(horizontalSkillState).where(eq(horizontalSkillState.studentId, stu.id)),
  );
  check("gate: the invented slug reached no table", hzAfterGate.every((h) => h.slug !== "vibe_check"));

  // ── 10d. THE NULL BOUND (D-S2R-9) — deterministic, no vendor call ──
  // ⚠️ THIS CLAIM MUST BE DRIVEN DIRECTLY, and the reason is the whole lesson.
  // The prompt now tells the model to OMIT a horizontal it has no read on, so a
  // null level should never arrive from a real call — which means the "a later
  // sitting didn't erase the earlier level" claim below now passes because the
  // model OMITTED, not because the guard works. That is a claim passing for the
  // right result and the wrong reason (M52/M54). The guard is what stands between
  // ONE disobedient response and a wiped standing, so it needs a claim that
  // depends on nothing but the code.
  const lvlBefore = (await rows(P.id, (tx) =>
    tx.select().from(horizontalSkillState).where(
      and(eq(horizontalSkillState.studentId, stu.id), eq(horizontalSkillState.slug, "language_precision")),
    ),
  ))[0]?.level;
  await rows(P.id, async (tx) => {
    const s = await gatherSynthesisInput(tx, {
      studentId: stu.id, subTopicIds: [fx.stA, fx.stB],
      certified: [{ subTopicId: fx.stA, conceptualLevel: 3, proceduralLevel: 3, description: "d" }],
    });
    return writeSynthesis(tx, {
      boardId: P.id, studentId: stu.id, sessionId: opened.id, scope: s.scope,
      result: {
        chapterInsights: [], subjectInsights: [],
        // exactly the disobedient response the prompt now forbids
        horizontals: [{ subjectKey: "S1", slug: "language_precision", level: null, prose: "no read this sitting" }],
        worklistItems: [], reasoning: "null-bound probe",
      },
    });
  });
  const lvlAfter = (await rows(P.id, (tx) =>
    tx.select().from(horizontalSkillState).where(
      and(eq(horizontalSkillState.studentId, stu.id), eq(horizontalSkillState.slug, "language_precision")),
    ),
  ))[0]?.level;
  check(
    "D-S2R-9: a null level CANNOT overwrite an existing one — the standing survives a disobedient response (null → number, never back)",
    lvlAfter != null && lvlAfter === lvlBefore,
  );

  // ── 11. re-finalize is refused ──
  let refin = false;
  try {
    await rows(P.id, (tx) =>
      finalizeAssessmentSession(tx, { boardId: P.id, tutorUserId: tut.id, sessionId: opened.id }),
    );
  } catch (e) {
    refin = e instanceof SessionAlreadyFinalizedError;
  }
  check("post-finalize: re-finalizing → SESSION_ALREADY_FINALIZED", refin);

  // ── 12. THE CATCH-ALL CERTIFIES FOR REAL (D-S2R-7) ──
  // Drive the self-serve-only sub_topic all the way to a moved mastery_state.
  const ca = await rows(P.id, (tx) =>
    openAssessmentSession(tx, { boardId: P.id, tutorUserId: tut.id, studentId: stu.id, assignmentId: null }),
  );
  check("catch-all: the sitting opened over the unassigned evidence", ca.subTopicIds.includes(fx.stLoose));
  check("catch-all: it drafted the self-serve sub_topic", !!ca.drafts[fx.stLoose]);
  check("S2R-4: a fresh sitting opens with an EMPTY transcript on its view", Array.isArray(ca.messages) && ca.messages.length === 0);

  // ── 15. S2R-4: the ADVISORY chat, on the OPEN catch-all (real Gemini) ──
  // Turn 1 plants two things: a codeword (the turn-2 recall check — engineered
  // unrefusable, M52: echoing a string from visible history is not a judgment
  // call) and a tutor-only fact (the dengue context) that only the chat knows —
  // the synthesis SOFT check below looks for its influence.
  const tChat = Date.now();
  const chat1 = await rows(P.id, (tx) =>
    sendAssessmentChatTurn(tx, {
      tutorUserId: tut.id,
      sessionId: ca.id,
      text:
        "Before we go further, two notes for the record. One: the student did this graphs practice while recovering from dengue, so weigh gaps gently. Two: our session codeword is BLUEWHALE7 — remember it, I'll ask for it later.",
    }),
  );
  soft("chat turn 1 wall-clock ms", Date.now() - tChat);
  soft("chat turn 1 reply", chat1.messages[1]?.text?.slice(0, 200));
  check(
    "CHAT: one turn persisted the user+assistant PAIR on the sitting",
    chat1.messages.length === 2 &&
      chat1.messages[0]?.role === "user" &&
      chat1.messages[1]?.role === "assistant" &&
      (chat1.messages[1]?.text ?? "").trim().length > 0,
  );

  const chat2 = await rows(P.id, (tx) =>
    sendAssessmentChatTurn(tx, {
      tutorUserId: tut.id,
      sessionId: ca.id,
      text: "Quick check: repeat the session codeword I gave you earlier, exactly.",
    }),
  );
  soft("chat turn 2 reply", chat2.messages[3]?.text?.slice(0, 200));
  check("CHAT: the second turn appended (4 messages, alternating roles)", chat2.messages.length === 4 && chat2.messages[2]?.role === "user" && chat2.messages[3]?.role === "assistant");
  check(
    "CHAT: HISTORY reaches the model — turn 2 recalled turn 1's codeword",
    (chat2.messages[3]?.text ?? "").toUpperCase().includes("BLUEWHALE7"),
  );

  // The thread is on the ROW, not in component state: a fresh read carries it.
  const caReread = await rows(P.id, (tx) => getAssessmentSession(tx, { tutorUserId: tut.id, sessionId: ca.id }));
  check("CHAT: the transcript persists on the row (a fresh read returns all 4 turns)", caReread.messages.length === 4);

  // Ownership: the chat is a WRITE on a per-student row — same wall as every read.
  let chatOwn = false;
  try {
    await rows(P.id, (tx) =>
      sendAssessmentChatTurn(tx, { tutorUserId: tut2.id, sessionId: ca.id, text: "hi" }),
    );
  } catch (e) {
    chatOwn = e instanceof AssessmentSessionNotFoundError;
  }
  check("CHAT ownership: a tutor who doesn't tutor this student → NOT_FOUND (no existence leak)", chatOwn);

  // ── 16a. the gather seam, FIRM + deterministic: the transcript maps into
  // synthesis's input with roles translated (user → tutor). This is the half we
  // control; finalize's one-line wiring (session.messages → this arg) is exercised
  // for real by the finalize below, and what the model DOES with it stays SOFT.
  const chatSeam = await rows(P.id, (tx) =>
    gatherSynthesisInput(tx, {
      studentId: stu.id,
      subTopicIds: ca.subTopicIds,
      certified: [{ subTopicId: fx.stLoose, conceptualLevel: 3, proceduralLevel: 3, description: "d" }],
      chatMessages: caReread.messages,
    }),
  );
  check(
    "SYNTH INPUT: the chat maps in with roles translated (4 turns, user→tutor)",
    chatSeam.chat.length === 4 && chatSeam.chat[0]?.role === "tutor" && chatSeam.chat[1]?.role === "assistant",
  );

  await rows(P.id, (tx) =>
    finalizeAssessmentSession(tx, { boardId: P.id, tutorUserId: tut.id, sessionId: ca.id }),
  );
  const looseMs = await rows(P.id, (tx) =>
    tx.select().from(masteryState).where(
      and(eq(masteryState.studentId, stu.id), eq(masteryState.subTopicId, fx.stLoose)),
    ),
  );
  check(
    "D-S2R-7: SELF-SERVE evidence (no assignment) reached a certified mastery_state — not stranded by the hard cut",
    looseMs.length === 1,
  );
  soft("catch-all certified pair for the self-serve sub_topic", {
    c: looseMs[0]?.conceptualLevel, p: looseMs[0]?.proceduralLevel,
  });

  // ── 12b. S2R-3: synthesis is INCREMENTAL across sittings (spec §4) ──
  // The catch-all just finalized over stLoose, which lives in the SAME chapter as
  // the assignment sitting. So this is the second synthesis to touch that chapter's
  // insight: it must EDIT the row, not add a second one and not start from blank.
  // "One assignment never completes a chapter view" is the whole contract.
  const chIns2 = await rows(P.id, (tx) =>
    tx.select().from(studentChapterInsight).where(eq(studentChapterInsight.studentId, stu.id)),
  );
  check(
    "INCREMENTAL: a second sitting UPDATED the chapter insight in place — still one row per (student, chapter)",
    chIns2.length === 1,
  );
  check("incremental: the updated insight is non-empty", (chIns2[0]?.insight ?? "").trim().length > 0);
  soft("chapter insight AFTER the second sitting", chIns2[0]?.insight);
  const hz2 = await rows(P.id, (tx) =>
    tx.select().from(horizontalSkillState).where(eq(horizontalSkillState.studentId, stu.id)),
  );
  soft("horizontals after the catch-all", hz2.map((h) => ({ slug: h.slug, level: h.level })));
  // ⚠️ ASSERT THE LEVEL, NOT THE ROW. The first version of this claim checked only
  // that a language_precision row still existed — and it went GREEN while the
  // catch-all silently reset that student's level from 2 to null (M52: the
  // assertion that would fail is the one you didn't write).
  //
  // What this proves NOW is the model OBEYING the omit rule end-to-end on a real
  // call — it saw a sitting with no language evidence and said nothing about
  // language. That is worth gating, but it is NOT the guard: 10d drives the guard
  // directly, because a claim that depends on the model complying cannot prove the
  // code that exists for when it doesn't.
  const lp2 = hz2.find((h) => h.slug === "language_precision");
  check(
    "OMIT RULE (real call): a sitting with NO language evidence left the earlier level untouched",
    lp2?.level === lp?.level && lp2?.level != null,
  );
  // ...and prove it was SILENCE and not a null the guard absorbed — otherwise the
  // claim above is true for a reason its own name gets wrong. The sitting persists
  // exactly what the model emitted, so this is checkable rather than assumable.
  const caView = await rows(P.id, (tx) => getAssessmentSession(tx, { tutorUserId: tut.id, sessionId: ca.id }));
  const caEmitted = caView.synthesis?.horizontals ?? [];
  soft("what the model EMITTED on the catch-all", caEmitted.map((h) => ({ slug: h.slug, level: h.level })));
  check(
    "OMIT RULE: the model OMITTED language_precision entirely — it did not emit a null for the guard to catch",
    !caEmitted.some((h) => h.slug === "language_precision"),
  );
  check(
    "incremental: the new sitting's OWN evidence still landed (quantitative_thinking levelled from the graph slip)",
    hz2.some((h) => h.slug === "quantitative_thinking" && h.level != null),
  );

  // ── 16b/17. S2R-4 post-finalize: the transcript is history, not gone ──
  check("CHAT: the transcript SURVIVES finalize (spec §6 — readable after the fact)", caView.messages.length === 4);
  // What the model did with the tutor's chat context is its discretion — SOFT.
  // The dengue fact existed NOWHERE but the chat; if it shows up here, the
  // transcript demonstrably crossed the finalize wiring into the real call.
  soft(
    "did the tutor's chat-only fact (dengue) reach synthesis? (reasoning + worklist)",
    {
      reasoning: caView.synthesis?.reasoning,
      worklist: caView.synthesis?.worklistItems,
    },
  );
  let chatClosed = false;
  try {
    await rows(P.id, (tx) =>
      sendAssessmentChatTurn(tx, { tutorUserId: tut.id, sessionId: ca.id, text: "one more thing…" }),
    );
  } catch (e) {
    chatClosed = e instanceof SessionAlreadyFinalizedError;
  }
  check("CHAT: a FINALIZED sitting refuses new turns → SESSION_ALREADY_FINALIZED", chatClosed);

  // ── 18. S2R-4: the insights READ — S2R-3's stores, finally surfaced ──
  const insights = await rows(P.id, (tx) =>
    getStudentInsights(tx, { tutorUserId: tut.id, studentId: stu.id }),
  );
  soft("getStudentInsights", {
    subjects: insights.subjects.map((s) => s.subjectName),
    chapters: insights.chapters.map((c) => `${c.chapterName} (${c.subjectName})`),
    horizontals: insights.horizontals.map((h) => `${h.slug}=L${h.level}`),
  });
  check(
    "INSIGHTS READ: the subject insight comes back NAMED (join holds)",
    insights.subjects.length === 1 && insights.subjects[0]?.subjectName === "Physics" && insights.subjects[0]!.insight.trim().length > 0,
  );
  check(
    "INSIGHTS READ: the chapter insight comes back named, with its subject",
    insights.chapters.length === 1 && insights.chapters[0]?.chapterName === "Motion" && insights.chapters[0]?.subjectName === "Physics",
  );
  check(
    "INSIGHTS READ: the horizontals carry level + evidence prose (what the FE renders)",
    insights.horizontals.some((h) => h.slug === "language_precision" && h.level != null && h.prose.trim().length > 0),
  );
  let insOwn = false;
  try {
    await rows(P.id, (tx) => getStudentInsights(tx, { tutorUserId: tut2.id, studentId: stu.id }));
  } catch (e) {
    insOwn = e instanceof StudentNotFoundError;
  }
  check("INSIGHTS READ ownership: a foreign tutor → NOT_FOUND", insOwn);

  // once certified, the sub_topic drops out of the pending partition
  const listed2 = await rows(P.id, (tx) => listPendingAssessments(tx, { tutorUserId: tut.id, studentId: stu.id }));
  const ca2 = listed2.find((l) => l.kind === "catch_all");
  check(
    "list: a certified sub_topic drops out of the next sitting (the 'since last finalize' rule holds)",
    !ca2 || !ca2.subTopicIds.includes(fx.stLoose),
  );

  // ── 13. ownership — another tutor's sitting. tut2 is never linked to stu.
  let own = false;
  try {
    await rows(P.id, (tx) => getAssessmentSession(tx, { tutorUserId: tut2.id, sessionId: opened.id }));
  } catch (e) {
    own = e instanceof AssessmentSessionNotFoundError;
  }
  check("ownership: a tutor who doesn't tutor this student → NOT_FOUND (no existence leak)", own);

  // ── 14. RLS — read a P sitting under board Q ──
  let rlsRead = false;
  try {
    await rows(Q.id, (tx) => getAssessmentSession(tx, { tutorUserId: tut.id, sessionId: opened.id }));
  } catch (e) {
    rlsRead = e instanceof AssessmentSessionNotFoundError;
  }
  check("RLS: a P sitting read under board Q → NOT_FOUND (row invisible)", rlsRead);

  // ── cleanup (FK-safe) ──
  await withBoard(P.id, async (tx: Tx) => {
    // ⚠️ ORDER: cross_concept_flag now FKs assessment_session (S2R-3's synthesis
    // items carry source_session_id), so the flags MUST go before the sittings.
    // The reverse order raises a foreign-key violation, not a silent skip.
    await tx.delete(crossConceptFlag).where(eq(crossConceptFlag.boardId, P.id));
    await tx.delete(assessmentSession).where(eq(assessmentSession.boardId, P.id));
    await tx.delete(horizontalSkillState).where(eq(horizontalSkillState.boardId, P.id));
    await tx.delete(horizontalSkill).where(eq(horizontalSkill.boardId, P.id));
    await tx.delete(studentChapterInsight).where(eq(studentChapterInsight.boardId, P.id));
    await tx.delete(studentSubjectInsight).where(eq(studentSubjectInsight.boardId, P.id));
    await tx.delete(masteryHistory).where(eq(masteryHistory.boardId, P.id));
    await tx.delete(masteryState).where(eq(masteryState.boardId, P.id));
    await tx.delete(schedulingState).where(eq(schedulingState.boardId, P.id));
    await tx.delete(transcript).where(eq(transcript.boardId, P.id));
    await tx.delete(eventLog).where(eq(eventLog.boardId, P.id));
    await tx.delete(observation).where(eq(observation.boardId, P.id));
    await tx.delete(attempt).where(eq(attempt.boardId, P.id));
    await tx.delete(question).where(eq(question.boardId, P.id));
    await tx.delete(practiceSession).where(eq(practiceSession.boardId, P.id));
    await tx.delete(assignment).where(eq(assignment.boardId, P.id));
    await tx.delete(student).where(eq(student.boardId, P.id));
    await tx.delete(learningObjective).where(eq(learningObjective.boardId, P.id));
    await tx.delete(subTopic).where(eq(subTopic.boardId, P.id));
    await tx.delete(topic).where(eq(topic.boardId, P.id));
    await tx.delete(chapter).where(eq(chapter.boardId, P.id));
    await tx.delete(subject).where(eq(subject.boardId, P.id));
  });
  for (const e of [tutorEmail, stuEmail, otherTutEmail]) {
    await db.delete(appUser).where(eq(appUser.email, e));
  }
  await db.delete(board).where(eq(board.id, P.id));
  await db.delete(board).where(eq(board.id, Q.id));

  console.log(`\nprobe_assessment_session: ${passed} passed, ${failed} failed`);
  await queryClient.end();
  process.exit(failed === 0 ? 0 : 1);
}

main().catch(async (err) => {
  console.error("probe_assessment_session FAILED:", err);
  await queryClient.end();
  process.exit(1);
});
