/**
 * probe_parent_dashboard — Slice DASH-1 exit gate (the parent DASHBOARD read path).
 *
 * Proves getChildDashboard against the real DB + real RLS on a THROWAWAY fixture
 * (unique per-run board) so the canonical/demo seeds stay pristine (M22). It
 * exercises every branch of the assembler and re-asserts the M11 projection
 * boundary the new reads must not breach.
 *
 * Fixture (one parent PA, one linked child CH1, board P):
 *   SubjA / ChapA:  st_a c5/p5 (green) · st_b c3/p4 (green — D-PDASH-7, an axis
 *                   at 3 is enough) · st_c cNULL/p3 (yellow: one-axis-null,
 *                   D-PDASH-1 AND D-PDASH-7's both-assessed clause — a 3 cannot
 *                   carry a row nobody rated the other half of) · st_d c4/p4
 *                   (green) · st_e NO row (gray)
 *   SubjB / ChapB:  st_f c5/p5 (green) · st_g c2/p2 (yellow — both assessed,
 *                   neither reaches 3) · st_h c4/p4 (green)
 *   snapshot (prior month): covered 5, solid 2  → "was 2 / was 5"
 *   sessions: st_a retention/self · st_b first_teach/self · st_f climb/tutor · st_g retention/tutor
 *   attempts: 12 answered (clears the calibration floor) + 2 skipped
 *   calibration obs: over on st_a, over on st_b, under on st_f  → over 2, under 1
 *   flags: one WITH a CLOCK-3 plan (st_b) + one synthesis item WITHOUT (generated default)
 *   horizontals: causal_reasoning L2 (mapped) + made_up_slug L4 (prettified) on SubjA;
 *                algebraic_fluency L5 on SubjB
 *
 * Asserts: 3-colour map + per-chapter n/total, count-aggregated meters (D-PDASH-2),
 * headline totals vs snapshot, story slots, pooled calibration + floor, weakness +
 * generated-plan default, horizontal labels, ownership + RLS, and NO log/reasoning leak.
 */
import { eq, sql } from "drizzle-orm";
import type { PgTransaction } from "drizzle-orm/pg-core";
import {
  appUser,
  assessmentSession,
  attempt,
  board,
  chapter,
  crossConceptFlag,
  horizontalSkillState,
  masteryHistory,
  masterySnapshot,
  masteryState,
  observation,
  practiceSession,
  question,
  student,
  subTopic,
  subject,
  topic,
} from "@b2c/kernel/schema";
import { resolveParentCopy } from "@b2c/kernel/parent-copy";
import { db, queryClient } from "../src/db/client";
import { withBoard } from "../src/db/with-board";
import { grantRole } from "../src/services/membership";
import {
  CALIBRATION_MIN_ANSWERS,
  ChildNotFoundError,
  getChildDashboard,
} from "../src/services/parent";
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

const LOG_SENTINEL = "INTERNAL_LOG_DO_NOT_LEAK_dash1";
const OBS_SENTINEL = "INTERNAL_OBS_REASONING_DO_NOT_LEAK_dash1";

async function main() {
  const tag = `${Date.now()}`;
  const base = Date.now();
  const DAY = 86_400_000;
  const daysAgo = (d: number) => new Date(base - d * DAY);
  // First-of-previous-month, the snapshot's period.
  const nd = new Date();
  const priorPeriod = new Date(Date.UTC(nd.getUTCFullYear(), nd.getUTCMonth() - 1, 1))
    .toISOString()
    .slice(0, 10);

  await db.execute(sql`select 1`);
  check("DB connectivity (select 1) as app role", true);

  const [P] = await db.insert(board).values({ slug: `pdash-p-${tag}`, name: "Probe P" }).returning();
  const [Q] = await db.insert(board).values({ slug: `pdash-q-${tag}`, name: "Probe Q" }).returning();
  if (!P || !Q) throw new Error("board seed failed");

  // Spine under P.
  const fx = await withBoard(P.id, async (tx: Tx) => {
    const [sA] = await tx.insert(subject).values({ boardId: P.id, slug: "sa", name: "Science", grade: "IGCSE" }).returning();
    const [sB] = await tx.insert(subject).values({ boardId: P.id, slug: "sb", name: "Maths", grade: "IGCSE" }).returning();
    const [cA] = await tx.insert(chapter).values({ boardId: P.id, subjectId: sA!.id, slug: "ca", name: "Chapter A", ordinal: 1 }).returning();
    const [cB] = await tx.insert(chapter).values({ boardId: P.id, subjectId: sB!.id, slug: "cb", name: "Chapter B", ordinal: 2 }).returning();
    const [tA1] = await tx.insert(topic).values({ boardId: P.id, chapterId: cA!.id, slug: "ta1", name: "Topic A1", ordinal: 1 }).returning();
    const [tA2] = await tx.insert(topic).values({ boardId: P.id, chapterId: cA!.id, slug: "ta2", name: "Topic A2", ordinal: 2 }).returning();
    const [tB1] = await tx.insert(topic).values({ boardId: P.id, chapterId: cB!.id, slug: "tb1", name: "Topic B1", ordinal: 1 }).returning();
    const mk = (topicId: string, slug: string, name: string, ord: number) =>
      tx.insert(subTopic).values({ boardId: P.id, topicId, slug, name, ordinal: ord }).returning();
    const [a] = await mk(tA1!.id, "sta", "ST A", 1);
    const [b] = await mk(tA1!.id, "stb", "ST B", 2);
    const [c] = await mk(tA1!.id, "stc", "ST C", 3);
    const [d] = await mk(tA2!.id, "std", "ST D", 1);
    const [e] = await mk(tA2!.id, "ste", "ST E", 2);
    const [f] = await mk(tB1!.id, "stf", "ST F", 1);
    const [g] = await mk(tB1!.id, "stg", "ST G", 2);
    const [h] = await mk(tB1!.id, "sth", "ST H", 3);
    return {
      sA: sA!.id, sB: sB!.id,
      a: a!.id, b: b!.id, c: c!.id, d: d!.id, e: e!.id, f: f!.id, g: g!.id, h: h!.id,
    };
  });

  const emailPA = `pdash-pa-${tag}@example.com`;
  const emailCH1 = `pdash-ch1-${tag}@example.com`;
  const emailCH2 = `pdash-ch2-${tag}@example.com`;
  const PA = await withBoard(P.id, (tx) => grantRole(tx, { email: emailPA, name: "Parent", board: P, role: "parent" }));
  const CH1 = await withBoard(P.id, (tx) => grantRole(tx, { email: emailCH1, name: "Child One", board: P, role: "student" }));
  const CH2 = await withBoard(P.id, (tx) => grantRole(tx, { email: emailCH2, name: "Child Two", board: P, role: "student" }));
  const userPA = PA.user.id;
  const userCH1 = CH1.user.id;
  const userCH2 = CH2.user.id;

  await withBoard(P.id, async (tx: Tx) => {
    await tx.insert(student).values({ userId: userCH1, boardId: P.id, class: "9", parentId: userPA });
    await tx.insert(student).values({ userId: userCH2, boardId: P.id, class: "9" });
  });

  // Mastery (log carries a sentinel — must NOT leak). st_e left with no row (gray).
  await withBoard(P.id, async (tx: Tx) => {
    const cur = (subTopicId: string, c: number | null, p: number | null) =>
      tx.insert(masteryState).values({
        boardId: P.id, studentId: userCH1, subTopicId,
        conceptualLevel: c, proceduralLevel: p,
        description: "user-visible description", log: LOG_SENTINEL, updatedAt: daysAgo(4),
      });
    await cur(fx.a, 5, 5); // green
    await cur(fx.b, 3, 4); // yellow
    await cur(fx.c, null, 3); // yellow (one axis null)
    await cur(fx.d, 4, 4); // green
    await cur(fx.f, 5, 5); // green
    await cur(fx.g, 2, 2); // yellow
    await cur(fx.h, 4, 4); // green
    // A prior snapshot for st_a so the trend moves (up).
    await tx.insert(masteryHistory).values({
      boardId: P.id, studentId: userCH1, subTopicId: fx.a,
      conceptualLevel: 3, proceduralLevel: 3, description: "older", log: "older", snapshotAt: daysAgo(40),
    });
  });

  // Prior-month mastery_snapshot: covered 5, solid 2.
  await withBoard(P.id, async (tx: Tx) => {
    await tx.insert(masterySnapshot).values({
      boardId: P.id, studentId: userCH1, period: priorPeriod,
      coveredCount: 5, solidCount: 2,
      metrics: { perSubject: [
        { subjectId: fx.sA, subjectName: "Science", covered: 3, solid: 1 },
        { subjectId: fx.sB, subjectName: "Maths", covered: 2, solid: 1 },
      ] },
      capturedAt: new Date(`${priorPeriod}T03:00:00Z`),
    });
  });

  // Sessions (dispatch reasons) + 12 answered + 2 skipped attempts + calibration obs.
  const sessSpec = [
    { st: fx.a, name: "ST A", reason: "retention", origin: "self_serve", age: 5, flag: "over" },
    { st: fx.b, name: "ST B", reason: "first_teach", origin: "self_serve", age: 10, flag: "over" },
    { st: fx.f, name: "ST F", reason: "climb", origin: "tutor_assigned", age: 3, flag: "under" },
    { st: fx.g, name: "ST G", reason: "retention", origin: "tutor_assigned", age: 2, flag: null },
  ];
  await withBoard(P.id, async (tx: Tx) => {
    let idx = 0;
    for (const s of sessSpec) {
      const [q] = await tx.insert(question).values({
        boardId: P.id, subTopicId: s.st, axis: "both", kind: "subjective",
        stem: `stem ${s.name}`, referenceAnswer: "REF", ordinal: 1, source: "b2c_authoring",
      }).returning();
      const [ps] = await tx.insert(practiceSession).values({
        boardId: P.id, appUserId: userCH1, subTopicId: s.st, questionIds: [q!.id],
        origin: s.origin, dispatchReason: s.reason, createdAt: daysAgo(s.age),
      }).returning();
      // 3 answered attempts per session = 12 total.
      let firstAtt = "";
      for (let i = 0; i < 3; i++) {
        const [att] = await tx.insert(attempt).values({
          boardId: P.id, practiceSessionId: ps!.id, questionId: q!.id, appUserId: userCH1,
          answerText: "answer", confidence: 3, timeMs: 10_000, submittedAt: daysAgo(s.age),
        }).returning();
        if (i === 0) firstAtt = att!.id;
      }
      // 2 skips on the first two sessions.
      if (idx < 2) {
        await tx.insert(attempt).values({
          boardId: P.id, practiceSessionId: ps!.id, questionId: q!.id, appUserId: userCH1,
          skipReason: "not_sure", submittedAt: daysAgo(s.age),
        });
      }
      // A calibration observation (reasoning carries a sentinel — must NOT leak).
      if (s.flag) {
        await tx.insert(observation).values({
          boardId: P.id, studentId: userCH1, subTopicId: s.st, questionId: q!.id, attemptId: firstAtt,
          axis: "conceptual", observationLevel: 3, reasoning: OBS_SENTINEL,
          calibrationFlag: s.flag, source: "stage1_scorer", createdAt: daysAgo(s.age),
        });
      }
      idx++;
    }
  });

  // Cross-concept flags: one authored (with a CLOCK-3 plan), one synthesis (no plan).
  // A stage1 flag needs provenance (source observation + from_sub_topic); a synthesis
  // item needs a source session — the origin_provenance check constraint.
  await withBoard(P.id, async (tx: Tx) => {
    const [srcObs] = await tx.insert(observation).values({
      boardId: P.id, studentId: userCH1, subTopicId: fx.b,
      axis: "procedural", observationLevel: 4, reasoning: OBS_SENTINEL, source: "stage1_scorer", createdAt: daysAgo(3),
    }).returning();
    await tx.insert(crossConceptFlag).values({
      boardId: P.id, studentId: userCH1, origin: "stage1_cross_concept",
      fromSubTopicId: fx.b, sourceObservationId: srcObs!.id, note: "prerequisite slip in fractions",
      plan: "tutor plan text", planUpdatedAt: daysAgo(2), createdAt: daysAgo(3),
    });
    const [sess] = await tx.insert(assessmentSession).values({
      boardId: P.id, studentId: userCH1, tutorId: userCH2, subTopicIds: [fx.a],
    }).returning();
    await tx.insert(crossConceptFlag).values({
      boardId: P.id, studentId: userCH1, origin: "stage2_synthesis",
      fromSubTopicId: null, sourceSessionId: sess!.id, note: "recurring unit-conversion pattern", plan: null, createdAt: daysAgo(1),
    });
  });

  // Horizontals: mapped, unmapped (prettified), and a second subject.
  await withBoard(P.id, async (tx: Tx) => {
    await tx.insert(horizontalSkillState).values({ boardId: P.id, studentId: userCH1, subjectId: fx.sA, slug: "causal_reasoning", level: 2, prose: "why is weak", updatedAt: daysAgo(5) });
    await tx.insert(horizontalSkillState).values({ boardId: P.id, studentId: userCH1, subjectId: fx.sA, slug: "made_up_slug", level: 4, prose: "unmapped", updatedAt: daysAgo(5) });
    await tx.insert(horizontalSkillState).values({ boardId: P.id, studentId: userCH1, subjectId: fx.sB, slug: "algebraic_fluency", level: 5, prose: "fluent", updatedAt: daysAgo(5) });
  });

  // ── Assemble ──
  const dash = await withBoard(P.id, (tx) => getChildDashboard(tx, { parentUserId: userPA, childId: userCH1 }));

  // Structure + subject order.
  check("dashboard → 2 subjects, Science then Maths", dash.subjects.length === 2 && dash.subjects[0]!.subjectName === "Science" && dash.subjects[1]!.subjectName === "Maths");
  const sciA = dash.subjects[0]!;
  const matB = dash.subjects[1]!;

  // §3 map — 3-colour states, one-axis-null → yellow (D-PDASH-1).
  const chA = sciA.chapters[0]!;
  const stateOf = (id: string) => chA.cells.find((x) => x.subTopicId === id)?.state;
  check("map: st_a green (both ≥4)", stateOf(fx.a) === "green");
  check("map: st_b green (c3 — ONE axis at 3 is enough, D-PDASH-7)", stateOf(fx.b) === "green");
  check("map: st_g yellow (c2/p2 — both assessed, neither reaches 3)", matB.chapters[0]!.cells.find((x) => x.subTopicId === fx.g)?.state === "yellow");
  check("map: st_c yellow (one axis null → in-progress, D-PDASH-1; and D-PDASH-7 will not let p3 carry it)", stateOf(fx.c) === "yellow");
  check("map: st_e gray (no mastery row)", stateOf(fx.e) === "gray");
  check("map: ChapA cells in ordinal order (a,b,c,d,e)", chA.cells.map((x) => x.subTopicId).join(",") === [fx.a, fx.b, fx.c, fx.d, fx.e].join(","));
  check("map: ChapA n/total = 3 of 5", chA.solid === 3 && chA.total === 5);
  check("map: ChapB n/total = 2 of 3", matB.chapters[0]!.solid === 2 && matB.chapters[0]!.total === 3);

  // §4 meters — count-aggregated over COVERED topics (D-PDASH-2), per-axis via
  // isAxisGreen: a SINGLE-axis claim, so st_c's null conceptual does not stop
  // its p3 from counting on the procedural meter (unlike the map, which is the
  // joint claim). That asymmetry is deliberate — see mastery.ts.
  check("meters SubjA conceptual 3/4", sciA.meters.conceptual.green === 3 && sciA.meters.conceptual.covered === 4);
  check("meters SubjA procedural 4/4", sciA.meters.procedural.green === 4 && sciA.meters.procedural.covered === 4);
  check("meters SubjB conceptual 2/3", matB.meters.conceptual.green === 2 && matB.meters.conceptual.covered === 3);
  check("meters SubjB procedural 2/3", matB.meters.procedural.green === 2 && matB.meters.procedural.covered === 3);

  // §3 headline totals vs the CLOCK-2 snapshot.
  check("totals: solidNow 5, coveredNow 7, totalNow 8", dash.totals.solidNow === 5 && dash.totals.coveredNow === 7 && dash.totals.totalNow === 8);
  check("totals: snapshot delta — solidPrior 2, coveredPrior 5", dash.totals.solidPrior === 2 && dash.totals.coveredPrior === 5);
  check("totals: priorPeriod = last month", dash.totals.priorPeriod === priorPeriod);
  check("totals: per-chapter solids sum to solidNow", sciA.chapters.reduce((n, r) => n + r.solid, 0) + matB.chapters.reduce((n, r) => n + r.solid, 0) === dash.totals.solidNow);

  // per-subject certified detail cards (covered only; st_e excluded).
  check("SubjA detail cards = 4 (covered, st_e excluded)", sciA.mastery.length === 4);
  check("detail card st_a trend 'up' (history 3/3 → 5/5)", sciA.mastery.find((m) => m.subTopicId === fx.a)?.trend === "up");

  // §2 story slots (CLOCK-1).
  check("story: topicsPracticed 4", dash.story.topicsPracticed === 4);
  check("story: retentionTopics recent-first [ST G, ST A]", dash.story.retentionTopics.join(",") === "ST G,ST A");
  check("story: selfDirectedCount 2", dash.story.selfDirectedCount === 2);

  // §5 calibration (pooled, floor).
  check(`calibration: answered 12 (≥ floor ${CALIBRATION_MIN_ANSWERS}) → shown`, dash.calibration.answered === 12 && dash.calibration.shown === true);
  check("calibration: over 2, under 1", dash.calibration.over === 2 && dash.calibration.under === 1);
  check("calibration: located at 3 sub_topics (ST A/B/F)", dash.calibration.locations.length === 3 && dash.calibration.locations.includes("ST A") && dash.calibration.locations.includes("ST F"));

  // §6 weakness + plan (CLOCK-3, generated default).
  check("weaknesses → 2", dash.weaknesses.length === 2);
  const authored = dash.weaknesses.find((w) => w.planAuthored);
  const generated = dash.weaknesses.find((w) => !w.planAuthored);
  check("weakness authored: plan text + date + fromSubTopic 'ST B'", !!authored && authored.planText === "tutor plan text" && authored.planUpdatedAt != null && authored.fromSubTopicName === "ST B");
  check("weakness unauthored: generated default, undated, no sub_topic", !!generated && generated.planText === resolveParentCopy("plan.generated_default") && generated.planUpdatedAt === null && generated.fromSubTopicName === null);

  // §7 horizontals — parent-facing labels (D-PDASH-5 placeholder copy).
  const cr = sciA.horizontals.find((x) => x.slug === "causal_reasoning");
  const mu = sciA.horizontals.find((x) => x.slug === "made_up_slug");
  check("horizontal mapped: causal_reasoning → 'Explains why', level 2", cr?.label === "Explains why" && cr?.level === 2);
  check("horizontal unmapped: made_up_slug → prettified 'Made up slug'", mu?.label === "Made up slug");
  check("horizontal on SubjB: algebraic_fluency → 'Handles the algebra', level 5", matB.horizontals.find((x) => x.slug === "algebraic_fluency")?.label === "Handles the algebra" && matB.horizontals.find((x) => x.slug === "algebraic_fluency")?.level === 5);

  // metrics.
  check("metrics: 12 answered, 2 skipped, 120000ms", dash.metrics.questionsAnswered === 12 && dash.metrics.questionsSkipped === 2 && dash.metrics.totalTimeMs === 120000);

  // M11 projection boundary — no internal log, no observation reasoning.
  const payload = JSON.stringify(dash);
  check("M11: NO mastery_state.log leak", !payload.includes(LOG_SENTINEL));
  check("M11: NO observation.reasoning leak", !payload.includes(OBS_SENTINEL));

  // ownership + RLS.
  let ownerThrew = false;
  try {
    await withBoard(P.id, (tx) => getChildDashboard(tx, { parentUserId: userPA, childId: userCH2 }));
  } catch (e) {
    ownerThrew = e instanceof ChildNotFoundError;
  }
  check("ownership: getChildDashboard(unlinked CH2) → ChildNotFoundError", ownerThrew);

  let crossThrew = false;
  try {
    await withBoard(Q.id, (tx) => getChildDashboard(tx, { parentUserId: userPA, childId: userCH1 }));
  } catch (e) {
    crossThrew = e instanceof ChildNotFoundError;
  }
  check("RLS: getChildDashboard under another board → ChildNotFoundError", crossThrew);

  // HTTP no-session → 401 (soft).
  try {
    const res = await fetch(`http://localhost:${env.PORT}/trpc/parent.getChildDashboard?input=${encodeURIComponent(JSON.stringify({ childId: userCH1 }))}`, { headers: { "x-board": P.slug } });
    check(`HTTP parent.getChildDashboard (no session) → 401 (got ${res.status})`, res.status === 401);
  } catch {
    console.log("  ~ HTTP parent.getChildDashboard skipped (server not running)");
  }

  // ── cleanup (FK-safe) ──
  await withBoard(P.id, async (tx: Tx) => {
    await tx.delete(crossConceptFlag).where(eq(crossConceptFlag.boardId, P.id));
    await tx.delete(assessmentSession).where(eq(assessmentSession.boardId, P.id));
    await tx.delete(observation).where(eq(observation.boardId, P.id));
    await tx.delete(attempt).where(eq(attempt.boardId, P.id));
    await tx.delete(practiceSession).where(eq(practiceSession.boardId, P.id));
    await tx.delete(question).where(eq(question.boardId, P.id));
    await tx.delete(horizontalSkillState).where(eq(horizontalSkillState.boardId, P.id));
    await tx.delete(masterySnapshot).where(eq(masterySnapshot.boardId, P.id));
    await tx.delete(masteryHistory).where(eq(masteryHistory.boardId, P.id));
    await tx.delete(masteryState).where(eq(masteryState.boardId, P.id));
    await tx.delete(student).where(eq(student.boardId, P.id));
    await tx.delete(subTopic).where(eq(subTopic.boardId, P.id));
    await tx.delete(topic).where(eq(topic.boardId, P.id));
    await tx.delete(chapter).where(eq(chapter.boardId, P.id));
    await tx.delete(subject).where(eq(subject.boardId, P.id));
  });
  await db.delete(appUser).where(eq(appUser.email, emailPA));
  await db.delete(appUser).where(eq(appUser.email, emailCH1));
  await db.delete(appUser).where(eq(appUser.email, emailCH2));
  await db.delete(board).where(eq(board.id, P.id));
  await db.delete(board).where(eq(board.id, Q.id));

  console.log(`\nprobe_parent_dashboard: ${passed} passed, ${failed} failed`);
  await queryClient.end();
  process.exit(failed === 0 ? 0 : 1);
}

main().catch(async (err) => {
  console.error("probe_parent_dashboard FAILED:", err);
  await queryClient.end();
  process.exit(1);
});
