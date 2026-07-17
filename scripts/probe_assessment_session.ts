/**
 * probe_assessment_session — Slice S2R-2 exit gate (the Stage-2 sitting).
 *
 * Real DB + real RLS + real Gemini, throwaway boards P/Q (M22) with full cleanup.
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
  learningObjective,
  masteryHistory,
  masteryState,
  observation,
  practiceSession,
  question,
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
  AssessmentSessionNotFoundError,
  finalizeAssessmentSession,
  getAssessmentSession,
  listPendingAssessments,
  openAssessmentSession,
  SessionAlreadyFinalizedError,
} from "../src/services/assessment_session";
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
  const [tut] = await db.insert(appUser).values({ email: tutorEmail, name: "Tutor" }).returning();
  const [stu] = await db.insert(appUser).values({ email: stuEmail, name: "Stu" }).returning();
  const [tut2] = await db.insert(appUser).values({ email: otherTutEmail, name: "Tutor2" }).returning();
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

    await tx.insert(tutorStudent).values({ boardId: P.id, tutorId: tut.id, studentId: stu.id });

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

    const mkObs = (stId: string, axis: string, level: number, reasoning: string, ageDays: number, ped: string, attemptId?: string) =>
      tx.insert(observation).values({
        boardId: P.id, studentId: stu.id, subTopicId: stId, questionId: null,
        attemptId: attemptId ?? null, axis, observationLevel: level, reasoning,
        signals: {}, calibrationFlag: null, pedagogicalComment: ped, source: "stage1_scorer",
        createdAt: new Date(baseMs + ageDays * 24 * 3600 * 1000),
      });

    // assignment evidence
    await mkObs(stA!.id, "conceptual", 4, "Linked Δv/Δt to the principle, reasoned from it on a variant.", 0, "transfer/variant probe");
    await mkObs(stA!.id, "conceptual", 3, "Several correct points but listed, not connected.", 8, "routine explain-why");
    await mkObs(stA!.id, "procedural", 3, "Right and clean, every step walked.", 11, "routine execution");
    await mkObs(stB!.id, "conceptual", 3, "Describes velocity with direction, adequately.", 2, "routine explain-why");
    await mkObs(stB!.id, "procedural", 3, "Computed velocity correctly with units.", 9, "routine execution");

    // SELF-SERVE evidence on stLoose — carried by a real attempt whose
    // practice_session has NO assignment. This is the row the hard cut would strand.
    await mkObs(stLoose!.id, "conceptual", 3, "Correctly reads the gradient as speed; explains constancy from straightness.", 3, "routine explain-why", att!.id);
    await mkObs(stLoose!.id, "procedural", 3, "Derived the speed from the graph cleanly.", 10, "routine execution", att!.id);

    // TEACH-BACK evidence (no attempt at all) on the incomplete assignment's sub_topic.
    await mkObs(stOpen!.id, "conceptual", 3, "Explained frame-relative motion in their own words.", 4, "teach-back");

    return {
      stA: stA!.id, stB: stB!.id, stLoose: stLoose!.id, stOpen: stOpen!.id,
      asg: asg!.id, asgOpen: asgOpen!.id, attemptId: att!.id, questionId: q!.id,
      ssSessionId: ssSession!.id,
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

  // ── 8. ATOMICITY (D-S2R-1) — the claim of the slice ──
  // Sabotage: drop stB's draft from the row. finalize commits stA's mastery move,
  // then throws on stB. If the sitting were not ONE tx, stA would stick.
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
  const afterSabotage = await rows(P.id, (tx) =>
    tx.select().from(masteryState).where(eq(masteryState.studentId, stu.id)),
  );
  check(
    "ATOMICITY (D-S2R-1): the throw rolled back the sub_topic that had ALREADY committed — zero mastery rows",
    afterSabotage.length === 0,
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
    await tx.delete(assessmentSession).where(eq(assessmentSession.boardId, P.id));
    await tx.delete(crossConceptFlag).where(eq(crossConceptFlag.boardId, P.id));
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
    await tx.delete(tutorStudent).where(eq(tutorStudent.boardId, P.id));
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
