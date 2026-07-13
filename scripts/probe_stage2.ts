/**
 * probe_stage2 — Slice S2 exit gate (#14 Stage-2, the FIRST mastery move).
 *
 * Real DB + real RLS + real Gemini, throwaway boards P/Q (M22) with full cleanup.
 * Two-tier (build-discipline: don't over-read a single AI response):
 *   FIRM — plumbing + the deterministic writes we control. Because the tutor's
 *     FINAL levels are supplied by the caller (not the AI), every mastery-move
 *     assertion (cold-start vs history snapshot, the taught/G2 ≥L2 gate, the
 *     override-logged-separately rule, scheduling writes, ownership, RLS) is
 *     fully deterministic — driven with a hand-built draft, no AI discretion.
 *   SOFT — the ONE real Gemini draft leg: assert the proposal is STRUCTURALLY
 *     valid (pair 1–5, non-empty prose) + LOG the model's actual levels/dates.
 *
 *   1. DB connectivity.
 *   2. draft: a student the caller doesn't tutor → STUDENT_NOT_FOUND (ownership).
 *   3. draft: a sub-topic with no observations → NO_OBSERVATIONS.
 *   4. draft (REAL Gemini): valid pair + non-empty description/log/reasoning;
 *      observationCount correct; current=null on cold start. SOFT: log levels/dates.
 *   4b. draft (REAL Gemini) on a sub-topic where only the CONCEPTUAL axis was ever
 *      exposed → procedural comes back NULL ("not yet observed"), never a 1. An
 *      unexposed axis is a coverage gap, not weakness (assessment.md §2 bound, §5).
 *   7b. finalize with a NULL axis: mastery_state stores NULL (not 0/1); taught(G2)
 *      still fires off the other axis; retention null (retention = f(procedural)).
 *   5. finalize COLD START (final 3/3): mastery_state created; NO history snapshot;
 *      stage2_finalize event (before=null); transcript(stage2); taught(G2) emitted +
 *      scheduling taughtAt set + climb/retention persisted; result {taught, !overridden}.
 *   6. finalize OVERRIDE (final 4/3, edited desc): state overwritten (still ONE row);
 *      history NOW has the prior snapshot; assessment_override logged SEPARATELY
 *      (before=draft, after=tutor); taught NOT re-emitted; result {overridden,!taught}.
 *   7. taught GATE OFF (fresh sub-topic, final 1/1): NO taught event; taughtAt null.
 *   8. RLS: draft a P student under board Q → STUDENT_NOT_FOUND (link invisible).
 *   9. finalize ownership: unlinked student → STUDENT_NOT_FOUND.
 */
import { and, eq, sql } from "drizzle-orm";
import type { PgTransaction } from "drizzle-orm/pg-core";
import {
  appUser,
  board,
  chapter,
  crossConceptFlag,
  eventLog,
  learningObjective,
  masteryHistory,
  masteryState,
  observation,
  schedulingState,
  subTopic,
  subject,
  topic,
  transcript,
  tutorStudent,
} from "@b2c/kernel/schema";
import { db, queryClient } from "../src/db/client";
import { withBoard } from "../src/db/with-board";
import {
  draftStage2,
  finalizeStage2,
  NoObservationsError,
  type Stage2Draft,
} from "../src/services/assessment";
import {
  getCrossConceptFlags,
  overrideObservation,
  setCrossConceptFlagAddressed,
  StudentNotFoundError,
} from "../src/services/tutor";
import { computeRetentionDue } from "../src/services/scheduler";
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

// rows in a board, scoped reads for assertions
const rows = <T>(boardId: string, fn: (tx: Tx) => Promise<T>) => withBoard(boardId, fn);

async function main() {
  if (!__aiConfigured()) {
    console.error("GEMINI_API_KEY not set — Slice S2 probe needs the real vendor.");
    await queryClient.end();
    process.exit(1);
  }

  const tag = `${Date.now()}`;
  await db.execute(sql`select 1`);
  check("DB connectivity (select 1) as app role", true);

  const [P] = await db.insert(board).values({ slug: `s2-p-${tag}`, name: "Probe P" }).returning();
  const [Q] = await db.insert(board).values({ slug: `s2-q-${tag}`, name: "Probe Q" }).returning();
  if (!P || !Q) throw new Error("board seed failed");

  // global identities
  const tutorEmail = `s2-tut-${tag}@example.com`;
  const stuEmail = `s2-stu-${tag}@example.com`;
  const otherEmail = `s2-other-${tag}@example.com`;
  const [tut] = await db.insert(appUser).values({ email: tutorEmail, name: "Tutor" }).returning();
  const [stu] = await db.insert(appUser).values({ email: stuEmail, name: "Stu" }).returning();
  const [other] = await db.insert(appUser).values({ email: otherEmail, name: "Other" }).returning();
  if (!tut || !stu || !other) throw new Error("app_user seed failed");

  // fixture under P: spine + LOs + tutor_student link + observations on stCold.
  const fx = await withBoard(P.id, async (tx: Tx) => {
    const [subj] = await tx.insert(subject).values({ boardId: P.id, slug: "phys", name: "Physics", grade: "IGCSE" }).returning();
    const [chap] = await tx.insert(chapter).values({ boardId: P.id, subjectId: subj!.id, slug: "motion", name: "Motion", ordinal: 1 }).returning();
    const [tp] = await tx.insert(topic).values({ boardId: P.id, chapterId: chap!.id, slug: "speed", name: "Speed", ordinal: 1 }).returning();
    const [stCold] = await tx.insert(subTopic).values({ boardId: P.id, topicId: tp!.id, slug: "accel", name: "Acceleration", ordinal: 1 }).returning();
    const [stLow] = await tx.insert(subTopic).values({ boardId: P.id, topicId: tp!.id, slug: "velocity", name: "Velocity", ordinal: 2 }).returning();
    // Only the CONCEPTUAL axis is ever exposed here — the unobserved-axis case.
    const [stOneAxis] = await tx.insert(subTopic).values({ boardId: P.id, topicId: tp!.id, slug: "graphs", name: "Motion graphs", ordinal: 3 }).returning();
    await tx.insert(learningObjective).values({ boardId: P.id, subTopicId: stCold!.id, axis: "conceptual", code: "C1", description: "Explains acceleration as the rate of change of velocity, distinguishing it from velocity itself." });
    await tx.insert(learningObjective).values({ boardId: P.id, subTopicId: stCold!.id, axis: "procedural", code: "P1", description: "Computes acceleration = Δv / Δt with correct units." });
    await tx.insert(learningObjective).values({ boardId: P.id, subTopicId: stOneAxis!.id, axis: "conceptual", code: "C1", description: "Reads the gradient of a distance–time graph as a rate." });
    await tx.insert(learningObjective).values({ boardId: P.id, subTopicId: stOneAxis!.id, axis: "procedural", code: "P1", description: "Derives velocity from a distance–time graph." });

    // link the tutor to the student (NOT to `other`).
    await tx.insert(tutorStudent).values({ boardId: P.id, tutorId: tut.id, studentId: stu.id });

    // a small spread of Stage-1 observations on stCold (what draft reads).
    const baseMs = Date.now() - 14 * 24 * 3600 * 1000; // ~2 weeks ago
    const mkObs = (axis: string, level: number, reasoning: string, ageDays: number, ped: string) =>
      tx.insert(observation).values({
        boardId: P.id,
        studentId: stu.id,
        subTopicId: stCold!.id,
        questionId: null,
        attemptId: null,
        axis,
        observationLevel: level,
        reasoning,
        signals: {},
        calibrationFlag: null,
        pedagogicalComment: ped,
        source: "stage1_scorer",
        createdAt: new Date(baseMs + ageDays * 24 * 3600 * 1000),
      });
    await mkObs("conceptual", 4, "Linked Δv/Δt to the principle, reasoned from it on a variant.", 0, "transfer/variant probe");
    await mkObs("conceptual", 3, "Several correct points but listed, not connected.", 7, "routine explain-why");
    await mkObs("procedural", 3, "Right and clean, every step walked, no compression.", 10, "routine execution");
    // ASSESS-FIX-4: a slip in a DIFFERENT skill. Per §2 procedural Step 4 this must
    // NOT lower Acceleration's rung — so it has to leave as its own flag or it dies.
    await tx.insert(observation).values({
      boardId: P.id, studentId: stu.id, subTopicId: stCold!.id, axis: "procedural",
      observationLevel: 4, reasoning: "Ran the acceleration procedure cleanly and fast.",
      signals: { crossConceptNote: "procedural issue in rationalising the denominator — left the surd in the answer" },
      pedagogicalComment: "routine execution", source: "stage1_scorer",
      createdAt: new Date(baseMs + 11 * 24 * 3600 * 1000),
    });

    // stOneAxis: CONCEPTUAL observations only — every item served was an
    // explain-why, so the procedural axis was never exposed. Nothing here is
    // evidence about execution, and the assessor must not invent a level for it.
    const mkObsOn = (stId: string, axis: string, level: number, reasoning: string, ageDays: number, ped: string) =>
      tx.insert(observation).values({
        boardId: P.id, studentId: stu.id, subTopicId: stId, questionId: null, attemptId: null,
        axis, observationLevel: level, reasoning, signals: {}, calibrationFlag: null,
        pedagogicalComment: ped, source: "stage1_scorer",
        createdAt: new Date(baseMs + ageDays * 24 * 3600 * 1000),
      });
    await mkObsOn(stOneAxis!.id, "conceptual", 3, "Correct points about the gradient, listed rather than connected.", 0, "routine explain-why (no execution demanded)");
    await mkObsOn(stOneAxis!.id, "conceptual", 3, "Explains what the slope shows, not why it is the rate.", 6, "routine explain-why (no execution demanded)");

    // stCorrect: two HIGH conceptual reads the tutor will later correct DOWN to 1.
    // Proves a tutor correction actually changes what Stage-2 COUNTS (ASSESS-FIX-2)
    // — not just what the tutor sees on screen.
    const [stCorrect] = await tx.insert(subTopic).values({ boardId: P.id, topicId: tp!.id, slug: "reltime", name: "Relative motion", ordinal: 4 }).returning();
    await tx.insert(learningObjective).values({ boardId: P.id, subTopicId: stCorrect!.id, axis: "conceptual", code: "C1", description: "Explains why motion is described relative to a chosen frame." });
    await mkObsOn(stCorrect!.id, "conceptual", 4, "Fluent paragraph connecting frames to the principle.", 0, "explain-why");
    await mkObsOn(stCorrect!.id, "conceptual", 4, "Again reasons from the principle on a variant.", 8, "transfer/variant probe");

    return { stCold: stCold!.id, stLow: stLow!.id, stOneAxis: stOneAxis!.id, stCorrect: stCorrect!.id };
  });

  // 2. ownership — draft a student the tutor doesn't tutor
  let own = false;
  try {
    await rows(P.id, (tx) => draftStage2(tx, { tutorUserId: tut.id, studentId: other.id, subTopicId: fx.stCold }));
  } catch (e) {
    own = e instanceof StudentNotFoundError;
  }
  check("draft: unlinked student → STUDENT_NOT_FOUND (ownership)", own);

  // 3. no observations — stLow has none
  let noobs = false;
  try {
    await rows(P.id, (tx) => draftStage2(tx, { tutorUserId: tut.id, studentId: stu.id, subTopicId: fx.stLow }));
  } catch (e) {
    noobs = e instanceof NoObservationsError;
  }
  check("draft: sub-topic with no observations → NO_OBSERVATIONS", noobs);

  // 4. REAL Gemini draft on stCold (cold start)
  const dres = await rows(P.id, (tx) => draftStage2(tx, { tutorUserId: tut.id, studentId: stu.id, subTopicId: fx.stCold }));
  const d = dres.draft;
  const validLevel = (l: number | null) => l === null || (l >= 1 && l <= 5);
  check("draft: conceptual is 1–5 or null", validLevel(d.conceptualLevel));
  check("draft: procedural is 1–5 or null", validLevel(d.proceduralLevel));
  check("draft: both axes observed here → neither is null", d.conceptualLevel !== null && d.proceduralLevel !== null);
  check("draft: non-empty description/log/reasoning", d.description.length > 0 && d.log.length > 0 && d.reasoning.length > 0);
  check("draft: observationCount = 4, current=null (cold start)", dres.observationCount === 4 && dres.current === null);
  check("draft: climb date is null or YYYY-MM-DD", d.climbNextDue === null || /^\d{4}-\d{2}-\d{2}$/.test(d.climbNextDue));
  check("draft: no retention date emitted (ASSESS-FIX-3 — the scheduler derives it)", !("retentionNextDue" in (d as object)));
  soft("draft proposed levels (conceptual,procedural)", [d.conceptualLevel, d.proceduralLevel]);
  soft("draft climb date", d.climbNextDue);
  soft("draft flags", d.flags);

  // 4b. THE UNOBSERVED-AXIS CONTRACT (REAL Gemini) — stOneAxis has conceptual
  // observations only. The procedural axis was never exposed, so it must come back
  // NULL ("not yet observed"), never a 1. A fabricated 1 here is what would tell a
  // parent their child "can't execute" a procedure we never asked them to run.
  const dOne = (await rows(P.id, (tx) => draftStage2(tx, { tutorUserId: tut.id, studentId: stu.id, subTopicId: fx.stOneAxis }))).draft;
  check("draft (one-axis): procedural NULL — never invented from zero evidence", dOne.proceduralLevel === null);
  check("draft (one-axis): conceptual still certified 1–5", dOne.conceptualLevel !== null && validLevel(dOne.conceptualLevel));
  check("draft (one-axis): retention DERIVES to null (no procedural level → nothing to retain)", computeRetentionDue(new Date(), dOne.proceduralLevel) === null);
  soft("one-axis draft levels (conceptual,procedural)", [dOne.conceptualLevel, dOne.proceduralLevel]);
  soft("one-axis draft flags (expect a procedural coverage gap)", dOne.flags);

  // 4c. ASSESS-FIX-2 — a tutor correction changes what Stage-2 COUNTS (REAL Gemini).
  // stCorrect carries two flattering L4 conceptual reads. Uncorrected, that is a
  // certifiable L3+ (2 qualifying obs). The tutor overrules BOTH down to L1 ("the
  // scorer rewarded eloquence — nothing is actually connected"). Stage-2 must now
  // count 1s, not 4s: with zero observations at ≥2, no level above 1 is reachable.
  // If the override were cosmetic (screen-only), this would still come back ≥3.
  const preObs = await rows(P.id, (tx) =>
    tx.select().from(observation).where(and(eq(observation.subTopicId, fx.stCorrect), eq(observation.studentId, stu.id))),
  );
  check("correction: stCorrect starts with 2 machine reads at L4", preObs.length === 2 && preObs.every((o) => o.observationLevel === 4));
  for (const o of preObs) {
    await rows(P.id, (tx) =>
      overrideObservation(tx, {
        boardId: P.id,
        tutorUserId: tut.id,
        observationId: o.id,
        level: 1,
        reason: "The scorer rewarded eloquence. Nothing is actually connected — no 'because' anywhere.",
      }),
    );
  }
  const postObs = await rows(P.id, (tx) =>
    tx.select().from(observation).where(and(eq(observation.subTopicId, fx.stCorrect), eq(observation.studentId, stu.id))),
  );
  check("correction: machine reads PRESERVED at L4 (immutable), tutorLevel=1", postObs.every((o) => o.observationLevel === 4 && o.tutorLevel === 1));

  const dCorr = (await rows(P.id, (tx) => draftStage2(tx, { tutorUserId: tut.id, studentId: stu.id, subTopicId: fx.stCorrect }))).draft;
  check("correction: Stage-2 COUNTS the tutor's 1s, not the AI's 4s → conceptual = 1", dCorr.conceptualLevel === 1);
  soft("corrected draft levels (conceptual,procedural)", [dCorr.conceptualLevel, dCorr.proceduralLevel]);
  soft("corrected draft reasoning", dCorr.reasoning.slice(0, 180));

  // hand-built draft for the DETERMINISTIC finalize plumbing tests
  const draftA: Stage2Draft = {
    conceptualLevel: 3,
    proceduralLevel: 3,
    description: "Solid grasp of acceleration; procedure reliable but not yet automatic.",
    log: "conceptual: 2 qualifying obs (one variant); procedural: 1 obs. spacing met for L3 conceptual.",
    climbNextDue: "2026-07-21",
    reasoning: "Conceptual L3→ holds; procedural L3 reliable-clean.",
    flags: ["procedural: only 1 obs, need more for a spacing claim"],
  };

  // 5. COLD-START finalize (final 3/3 = draft, so NOT an override)
  const r1 = await rows(P.id, (tx) =>
    finalizeStage2(tx, {
      boardId: P.id,
      tutorUserId: tut.id,
      studentId: stu.id,
      subTopicId: fx.stCold,
      final: { conceptualLevel: 3, proceduralLevel: 3, description: draftA.description },
      draft: draftA,
    }),
  );
  const afterCold = await rows(P.id, async (tx) => ({
    ms: await tx.select().from(masteryState).where(and(eq(masteryState.studentId, stu.id), eq(masteryState.subTopicId, fx.stCold))),
    hist: await tx.select().from(masteryHistory).where(and(eq(masteryHistory.studentId, stu.id), eq(masteryHistory.subTopicId, fx.stCold))),
    fin: await tx.select().from(eventLog).where(and(eq(eventLog.subTopicId, fx.stCold), eq(eventLog.eventType, "stage2_finalize"))),
    taught: await tx.select().from(eventLog).where(and(eq(eventLog.subTopicId, fx.stCold), eq(eventLog.eventType, "taught"))),
    ovr: await tx.select().from(eventLog).where(and(eq(eventLog.subTopicId, fx.stCold), eq(eventLog.eventType, "assessment_override"))),
    tr: await tx.select().from(transcript).where(and(eq(transcript.subTopicId, fx.stCold), eq(transcript.kind, "stage2"))),
    sch: await tx.select().from(schedulingState).where(and(eq(schedulingState.studentId, stu.id), eq(schedulingState.subTopicId, fx.stCold))),
  }));
  check("cold finalize: mastery_state created 3/3", afterCold.ms.length === 1 && afterCold.ms[0]!.conceptualLevel === 3 && afterCold.ms[0]!.proceduralLevel === 3);
  check("cold finalize: mastery_state.log = draft.log", afterCold.ms[0]!.log === draftA.log);
  check("cold finalize: NO history snapshot (cold start)", afterCold.hist.length === 0);
  check("cold finalize: ONE stage2_finalize event, before=null", afterCold.fin.length === 1 && afterCold.fin[0]!.before === null);
  check("cold finalize: NO override event (final == draft)", afterCold.ovr.length === 0);
  check("cold finalize: transcript(stage2) appended", afterCold.tr.length === 1);
  check("cold finalize: taught(G2) emitted (≥L2)", afterCold.taught.length === 1);
  check("cold finalize: scheduling taughtAt set + CLIMB persisted (retention is not stored)", afterCold.sch.length === 1 && afterCold.sch[0]!.taughtAt != null && afterCold.sch[0]!.climbNextDue === "2026-07-21");
  check("cold finalize: retention_next_due column is GONE from scheduling_state", !("retentionNextDue" in (afterCold.sch[0]! as object)));
  check("cold finalize: result {taught:true, overridden:false}", r1.taught === true && r1.overridden === false);

  // ── ASSESS-FIX-4: the cross-concept note SURVIVES finalize as its own flag.
  // Before this fix it lived in observation.signals, was shown once in the draft,
  // and was never seen again — attached to the WRONG sub-topic.
  const ccf = await rows(P.id, (tx) => getCrossConceptFlags(tx, { tutorUserId: tut.id, studentId: stu.id }));
  check("cross-concept: 1 OPEN flag persisted on finalize", ccf.length === 1);
  check("cross-concept: carries the note + where it was seen", (ccf[0]?.note ?? "").includes("rationalising the denominator") && ccf[0]?.fromSubTopicName === "Acceleration");
  check("cross-concept: it is NOT a scored observation (no level on the flag)", !("observationLevel" in (ccf[0]! as object)) && !("level" in (ccf[0]! as object)));


  // 6. OVERRIDE finalize (final 4/3, edited description ≠ draft)
  const r2 = await rows(P.id, (tx) =>
    finalizeStage2(tx, {
      boardId: P.id,
      tutorUserId: tut.id,
      studentId: stu.id,
      subTopicId: fx.stCold,
      final: { conceptualLevel: 4, proceduralLevel: 3, description: "Tutor edit: clearly understands the principle." },
      draft: draftA,
    }),
  );
  const afterOvr = await rows(P.id, async (tx) => ({
    ms: await tx.select().from(masteryState).where(and(eq(masteryState.studentId, stu.id), eq(masteryState.subTopicId, fx.stCold))),
    hist: await tx.select().from(masteryHistory).where(and(eq(masteryHistory.studentId, stu.id), eq(masteryHistory.subTopicId, fx.stCold))),
    fin: await tx.select().from(eventLog).where(and(eq(eventLog.subTopicId, fx.stCold), eq(eventLog.eventType, "stage2_finalize"))),
    taught: await tx.select().from(eventLog).where(and(eq(eventLog.subTopicId, fx.stCold), eq(eventLog.eventType, "taught"))),
    ovr: await tx.select().from(eventLog).where(and(eq(eventLog.subTopicId, fx.stCold), eq(eventLog.eventType, "assessment_override"))),
  }));
  check("override finalize: still ONE mastery_state row, now 4/3", afterOvr.ms.length === 1 && afterOvr.ms[0]!.conceptualLevel === 4 && afterOvr.ms[0]!.proceduralLevel === 3);
  check("override finalize: prior snapshot now in history (3/3)", afterOvr.hist.length === 1 && afterOvr.hist[0]!.conceptualLevel === 3 && afterOvr.hist[0]!.proceduralLevel === 3);
  check("override finalize: assessment_override logged SEPARATELY (before=draft 3, after=tutor 4)", afterOvr.ovr.length === 1 && (afterOvr.ovr[0]!.before as any)?.conceptual === 3 && (afterOvr.ovr[0]!.after as any)?.conceptual === 4);
  check("override finalize: taught NOT re-emitted (still 1)", afterOvr.taught.length === 1);
  check("override finalize: stage2_finalize now 2", afterOvr.fin.length === 2);
  check("override finalize: result {overridden:true, taught:false}", r2.overridden === true && r2.taught === false);

  // 7. taught GATE OFF — fresh sub-topic, final 1/1 (no observations needed for finalize)
  const lowDraft: Stage2Draft = { ...draftA, conceptualLevel: 1, proceduralLevel: 1, climbNextDue: null };
  const r3 = await rows(P.id, (tx) =>
    finalizeStage2(tx, {
      boardId: P.id,
      tutorUserId: tut.id,
      studentId: stu.id,
      subTopicId: fx.stLow,
      final: { conceptualLevel: 1, proceduralLevel: 1, description: "Acquiring." },
      draft: lowDraft,
    }),
  );
  const afterLow = await rows(P.id, async (tx) => ({
    taught: await tx.select().from(eventLog).where(and(eq(eventLog.subTopicId, fx.stLow), eq(eventLog.eventType, "taught"))),
    sch: await tx.select().from(schedulingState).where(and(eq(schedulingState.studentId, stu.id), eq(schedulingState.subTopicId, fx.stLow))),
  }));
  check("taught gate: final 1/1 → NO taught event, scheduling taughtAt null", afterLow.taught.length === 0 && afterLow.sch[0]!.taughtAt === null && r3.taught === false);

  // 7b. NULL AXIS PERSISTS (deterministic) — finalize stOneAxis with procedural=null.
  // The row must store NULL (not 0, not 1), `taught` must still fire off the
  // conceptual 3, and retention must be null (retention = f(procedural level)).
  const oneDraft: Stage2Draft = {
    conceptualLevel: 3,
    proceduralLevel: null,
    description: "Reads a gradient correctly but hasn't been asked to derive velocity yet.",
    log: "conceptual: 2 qualifying obs at L3. procedural: NO observations — never exposed.",
    climbNextDue: "2026-07-25",
    reasoning: "Conceptual L3 on two qualifying obs. Procedural: no evidence — held null.",
    flags: ["procedural coverage gap: serve a routine execution item"],
  };
  const r4 = await rows(P.id, (tx) =>
    finalizeStage2(tx, {
      boardId: P.id,
      tutorUserId: tut.id,
      studentId: stu.id,
      subTopicId: fx.stOneAxis,
      final: { conceptualLevel: 3, proceduralLevel: null, description: oneDraft.description },
      draft: oneDraft,
    }),
  );
  const afterOne = await rows(P.id, async (tx) => ({
    ms: await tx.select().from(masteryState).where(and(eq(masteryState.studentId, stu.id), eq(masteryState.subTopicId, fx.stOneAxis))),
    taught: await tx.select().from(eventLog).where(and(eq(eventLog.subTopicId, fx.stOneAxis), eq(eventLog.eventType, "taught"))),
    sch: await tx.select().from(schedulingState).where(and(eq(schedulingState.studentId, stu.id), eq(schedulingState.subTopicId, fx.stOneAxis))),
  }));
  check("null axis: mastery_state stores conceptual=3, procedural=NULL", afterOne.ms.length === 1 && afterOne.ms[0]!.conceptualLevel === 3 && afterOne.ms[0]!.proceduralLevel === null);
  check("null axis: taught(G2) still fires off the conceptual ≥L2", afterOne.taught.length === 1 && afterOne.sch[0]!.taughtAt != null && r4.taught === true);
  check("null axis: retention DERIVES to null (retention = f(procedural level))", computeRetentionDue(new Date(), afterOne.ms[0]!.proceduralLevel) === null);
  check("null axis: finalize result carries the null through", r4.proceduralLevel === null && r4.conceptualLevel === 3);

  // ASSESS-FIX-4 (cont.) — run LAST: these re-finalize stCold, which adds a history
  // row + a stage2_finalize event, so they must come after every count assertion above.
  await rows(P.id, (tx) =>
    finalizeStage2(tx, {
      boardId: P.id, tutorUserId: tut.id, studentId: stu.id, subTopicId: fx.stCold,
      final: { conceptualLevel: 3, proceduralLevel: 3, description: draftA.description },
      draft: draftA,
    }),
  );
  const ccf2 = await rows(P.id, (tx) => tx.select().from(crossConceptFlag).where(eq(crossConceptFlag.studentId, stu.id)));
  check("cross-concept: re-finalize does NOT duplicate (unique on source observation)", ccf2.length === 1);

  const closed = await rows(P.id, (tx) => setCrossConceptFlagAddressed(tx, { tutorUserId: tut.id, flagId: ccf[0]!.id, addressed: true }));
  check("cross-concept: tutor can mark it handled", closed.addressedAt !== null);
  const openAfter = await rows(P.id, (tx) => getCrossConceptFlags(tx, { tutorUserId: tut.id, studentId: stu.id }));
  check("cross-concept: handled flag drops out of the OPEN list", openAfter.length === 0);

  // 8. RLS — draft a P student under board Q → ownership link invisible → NOT_FOUND
  let rls = false;
  try {
    await rows(Q.id, (tx) => draftStage2(tx, { tutorUserId: tut.id, studentId: stu.id, subTopicId: fx.stCold }));
  } catch (e) {
    rls = e instanceof StudentNotFoundError;
  }
  check("RLS: draft a P student under board Q → STUDENT_NOT_FOUND", rls);

  // 9. finalize ownership — unlinked student
  let finOwn = false;
  try {
    await rows(P.id, (tx) =>
      finalizeStage2(tx, {
        boardId: P.id,
        tutorUserId: tut.id,
        studentId: other.id,
        subTopicId: fx.stCold,
        final: { conceptualLevel: 2, proceduralLevel: 2, description: "x" },
        draft: draftA,
      }),
    );
  } catch (e) {
    finOwn = e instanceof StudentNotFoundError;
  }
  check("finalize: unlinked student → STUDENT_NOT_FOUND (ownership)", finOwn);

  // ── cleanup (FK-safe) ──
  await withBoard(P.id, async (tx: Tx) => {
    await tx.delete(crossConceptFlag).where(eq(crossConceptFlag.boardId, P.id));
    await tx.delete(masteryHistory).where(eq(masteryHistory.boardId, P.id));
    await tx.delete(masteryState).where(eq(masteryState.boardId, P.id));
    await tx.delete(schedulingState).where(eq(schedulingState.boardId, P.id));
    await tx.delete(transcript).where(eq(transcript.boardId, P.id));
    await tx.delete(eventLog).where(eq(eventLog.boardId, P.id));
    await tx.delete(observation).where(eq(observation.boardId, P.id));
    await tx.delete(tutorStudent).where(eq(tutorStudent.boardId, P.id));
    await tx.delete(learningObjective).where(eq(learningObjective.boardId, P.id));
    await tx.delete(subTopic).where(eq(subTopic.boardId, P.id));
    await tx.delete(topic).where(eq(topic.boardId, P.id));
    await tx.delete(chapter).where(eq(chapter.boardId, P.id));
    await tx.delete(subject).where(eq(subject.boardId, P.id));
  });
  for (const e of [tutorEmail, stuEmail, otherEmail]) {
    await db.delete(appUser).where(eq(appUser.email, e));
  }
  await db.delete(board).where(eq(board.id, P.id));
  await db.delete(board).where(eq(board.id, Q.id));

  console.log(`\nprobe_stage2: ${passed} passed, ${failed} failed`);
  await queryClient.end();
  process.exit(failed === 0 ? 0 : 1);
}

main().catch(async (err) => {
  console.error("probe_stage2 FAILED:", err);
  await queryClient.end();
  process.exit(1);
});
