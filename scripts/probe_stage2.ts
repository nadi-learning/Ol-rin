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
import { StudentNotFoundError } from "../src/services/tutor";
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
    await tx.insert(learningObjective).values({ boardId: P.id, subTopicId: stCold!.id, axis: "conceptual", code: "C1", description: "Explains acceleration as the rate of change of velocity, distinguishing it from velocity itself." });
    await tx.insert(learningObjective).values({ boardId: P.id, subTopicId: stCold!.id, axis: "procedural", code: "P1", description: "Computes acceleration = Δv / Δt with correct units." });

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

    return { stCold: stCold!.id, stLow: stLow!.id };
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
  check("draft: valid conceptual pair (1–5)", d.conceptualLevel >= 1 && d.conceptualLevel <= 5);
  check("draft: valid procedural pair (1–5)", d.proceduralLevel >= 1 && d.proceduralLevel <= 5);
  check("draft: non-empty description/log/reasoning", d.description.length > 0 && d.log.length > 0 && d.reasoning.length > 0);
  check("draft: observationCount = 3, current=null (cold start)", dres.observationCount === 3 && dres.current === null);
  check("draft: dates are null or YYYY-MM-DD", [d.climbNextDue, d.retentionNextDue].every((x) => x === null || /^\d{4}-\d{2}-\d{2}$/.test(x)));
  soft("draft proposed levels (conceptual,procedural)", [d.conceptualLevel, d.proceduralLevel]);
  soft("draft dates (climb,retention)", [d.climbNextDue, d.retentionNextDue]);
  soft("draft flags", d.flags);

  // hand-built draft for the DETERMINISTIC finalize plumbing tests
  const draftA: Stage2Draft = {
    conceptualLevel: 3,
    proceduralLevel: 3,
    description: "Solid grasp of acceleration; procedure reliable but not yet automatic.",
    log: "conceptual: 2 qualifying obs (one variant); procedural: 1 obs. spacing met for L3 conceptual.",
    climbNextDue: "2026-07-21",
    retentionNextDue: "2026-07-07",
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
  check("cold finalize: scheduling taughtAt set + climb/retention persisted", afterCold.sch.length === 1 && afterCold.sch[0]!.taughtAt != null && afterCold.sch[0]!.climbNextDue === "2026-07-21" && afterCold.sch[0]!.retentionNextDue === "2026-07-07");
  check("cold finalize: result {taught:true, overridden:false}", r1.taught === true && r1.overridden === false);

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
  const lowDraft: Stage2Draft = { ...draftA, conceptualLevel: 1, proceduralLevel: 1, climbNextDue: null, retentionNextDue: null };
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
