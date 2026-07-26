/**
 * Parent read surface (Slice P) — the FIRST parent-facing path, and the read
 * side of Polaris #4. NO mastery move, NO AI, NO sign-off workflow (v0, D-P-1):
 * a parent logs in and sees a linked child's certified two-axis mastery
 * (levels + the user-visible description Stage-2 writes), a per-sub_topic trend
 * derived from mastery_history, and practice effort metrics. It mirrors the
 * Tutor read surface (Slice T) almost exactly — different target user, same two
 * access boundaries.
 *
 * Two access boundaries, both load-bearing:
 *  - ROLE gate (M11): only a membership with role='parent' may reach these reads.
 *    The CHECK side is `assertParent` (used by parentProcedure); the SET side is
 *    the real `grantRole(…, role: 'parent')` flow (seed_parent / the probe /
 *    admin.setRole drive it, never insert a parent membership directly). Nobody
 *    is pre-invited: a parent signs in as a student and is promoted afterwards.
 *  - OWNERSHIP guard (D-L-5 pattern): RLS scopes by board, NOT by user, so a
 *    parent sharing a board with other families could otherwise read their
 *    children. Every per-child read asserts a parent_child link first; a child
 *    the caller isn't a parent of is reported as CHILD_NOT_FOUND (no leak).
 *
 * THE PROJECTION BOUNDARY (M11, the answer-key discipline applied here):
 * mastery_state has two text blobs — `description` (USER-VISIBLE, written for the
 * student/parent) and `log` (INTERNAL agent working notes). The parent surface
 * exposes `description` and NEVER selects `log`. Same allowlist-projection rule
 * that keeps answer keys server-side; the probe asserts no `log` over the wire.
 *
 * Runs inside the board-scoped tx (parentProcedure → withBoard): parent_child,
 * mastery_state, mastery_history and attempt reads are all RLS-gated to the board.
 */
import { and, asc, desc, eq, gte, inArray, sql } from "drizzle-orm";
import type { PgTransaction } from "drizzle-orm/pg-core";
import {
  appUser,
  attempt,
  chapter,
  crossConceptFlag,
  horizontalSkillState,
  masteryHistory,
  masterySnapshot,
  masteryState,
  observation,
  practiceSession,
  student,
  subTopic,
  subject,
  topic,
} from "@b2c/kernel/schema";
import { horizontalLabel, resolveParentCopy } from "@b2c/kernel/parent-copy";
import { isAxisGreen, isSolid } from "@b2c/kernel/mastery";
import { readParentCopyOverrides } from "./parent_copy";
import { readSubjectChapterBudgets } from "./chapter_budget";
import { getPlan } from "./pace";

type Tx = PgTransaction<any, any, any>;

export class ParentOnlyError extends Error {
  readonly code = "NOT_A_PARENT";
  constructor(role: string) {
    super(`role '${role}' is not a parent`);
    this.name = "ParentOnlyError";
  }
}

export class ChildNotFoundError extends Error {
  readonly code = "CHILD_NOT_FOUND";
  constructor(childId: string) {
    super(`child ${childId} is not linked to this parent`);
    this.name = "ChildNotFoundError";
  }
}

export type ChildSummary = {
  studentId: string;
  name: string | null;
  email: string;
};

export type Trend = "up" | "down" | "flat" | "new";

export type ReportMasteryCard = {
  subTopicId: string;
  subTopicName: string;
  topicName: string;
  chapterId: string;
  chapterName: string;
  conceptualLevel: number | null; // null = not yet observed on that axis
  proceduralLevel: number | null;
  description: string; // user-visible blob (NEVER the internal `log` field)
  updatedAt: Date;
  trend: Trend;
  priorConceptualLevel: number | null;
  priorProceduralLevel: number | null;
};

export type ReportMetrics = {
  questionsAnswered: number;
  questionsSkipped: number;
  totalTimeMs: number;
};

export type ChildReport = {
  child: ChildSummary;
  metrics: ReportMetrics;
  mastery: ReportMasteryCard[];
};

/** ROLE gate — the CHECK side (M11). parentProcedure calls this. */
export function assertParent(role: string): void {
  if (role !== "parent") throw new ParentOnlyError(role);
}

/**
 * OWNERSHIP guard — assert the caller is a parent of this child, else NOT_FOUND.
 * RLS scopes by board, not user — families can share a board, so the link must
 * be checked explicitly (the D-L-5 / assertTutorsStudent pattern).
 */
export async function assertParentsChild(
  tx: Tx,
  parentUserId: string,
  childId: string,
): Promise<ChildSummary> {
  // ID-4: the parent→child link is the single pointer `student.parent_id` (one
  // parent per student by construction — the dropped `parent_child` join is gone).
  // The `student` row is RLS-scoped to the active board, so a child on ANOTHER
  // board reads absent here and correctly resolves to NOT_FOUND (the cross-board
  // wall the parent probe asserts). A child the caller does not parent is reported
  // as NOT_FOUND (no existence leak). Returns the ChildSummary the report needs.
  const [row] = await tx
    .select({ studentId: student.userId, name: appUser.name, email: appUser.email })
    .from(student)
    .innerJoin(appUser, eq(appUser.id, student.userId))
    .where(and(eq(student.userId, childId), eq(student.parentId, parentUserId)))
    .limit(1);
  if (!row) throw new ChildNotFoundError(childId);
  return { studentId: row.studentId, name: row.name, email: row.email };
}

/**
 * The caller's children — every student whose `parent_id` points at this parent
 * (ID-4). RLS scopes `student` to the active board, so the same query under a
 * board the parent's children aren't on returns empty. Joined to app_user for the
 * display name/email (those live only on the profile).
 */
export async function listChildren(
  tx: Tx,
  parentUserId: string,
): Promise<ChildSummary[]> {
  return tx
    .select({
      studentId: student.userId,
      name: appUser.name,
      email: appUser.email,
    })
    .from(student)
    .innerJoin(appUser, eq(appUser.id, student.userId))
    .where(eq(student.parentId, parentUserId))
    .orderBy(asc(appUser.email));
}

/**
 * Movement across BOTH axes, current vs the prior snapshot. An unobserved axis
 * (null) scores 0 — safe because a level only ever goes null → number (Stage-2
 * holds or raises, it never un-observes), so a first observation reads as "up".
 */
function trendOf(
  curC: number | null,
  curP: number | null,
  prior:
    | { conceptualLevel: number | null; proceduralLevel: number | null }
    | undefined,
): Trend {
  if (!prior) return "new";
  const delta =
    (curC ?? 0) +
    (curP ?? 0) -
    ((prior.conceptualLevel ?? 0) + (prior.proceduralLevel ?? 0));
  if (delta > 0) return "up";
  if (delta < 0) return "down";
  return "flat";
}

/**
 * A linked child's full report: certified mastery (pair + user-visible
 * description) with a movement trend per sub_topic, plus practice effort metrics.
 *
 * Trend = current mastery_state vs the most-recent mastery_history snapshot for
 * the same sub_topic. finalizeStage2 snapshots the PRIOR state into
 * mastery_history before overwriting (cold starts write no snapshot), so the
 * latest history row is exactly "where they were before this certification". No
 * history → "new" (first certification). No new column (D-P-3).
 */
export async function getChildReport(
  tx: Tx,
  args: { parentUserId: string; childId: string },
): Promise<ChildReport> {
  const child = await assertParentsChild(tx, args.parentUserId, args.childId);
  return computeChildReport(tx, child);
}

/**
 * The guard-free core: build a child's full report (mastery + trend + metrics)
 * for an ALREADY-resolved child. The ownership/role check is the caller's job
 * (parent.getChildReport asserts a parent_child link; report.assembleReport
 * asserts a tutor_student link) — this only reads, RLS-scoped to the board.
 *
 * Exported so the Parent sign-off slice (report.ts) snapshots the EXACT same
 * payload the live parent surface shows — one source for the data AND for the
 * M11 projection boundary (selects `description`, never the internal `log`).
 */
export async function computeChildReport(
  tx: Tx,
  child: ChildSummary,
): Promise<ChildReport> {
  const childId = child.studentId;

  // Certified mastery (description only — NEVER log; the M11 projection boundary).
  const cards = await tx
    .select({
      subTopicId: subTopic.id,
      subTopicName: subTopic.name,
      topicName: topic.name,
      chapterId: chapter.id,
      chapterName: chapter.name,
      conceptualLevel: masteryState.conceptualLevel,
      proceduralLevel: masteryState.proceduralLevel,
      description: masteryState.description,
      updatedAt: masteryState.updatedAt,
    })
    .from(masteryState)
    .innerJoin(subTopic, eq(subTopic.id, masteryState.subTopicId))
    .innerJoin(topic, eq(topic.id, subTopic.topicId))
    .innerJoin(chapter, eq(chapter.id, topic.chapterId))
    .where(eq(masteryState.studentId, childId))
    .orderBy(asc(chapter.ordinal), asc(topic.ordinal), asc(subTopic.ordinal));

  // Most-recent prior snapshot per sub_topic (for the trend). History rows are
  // ordered newest-first; the first one per sub_topic is the prior state.
  const history = await tx
    .select({
      subTopicId: masteryHistory.subTopicId,
      conceptualLevel: masteryHistory.conceptualLevel,
      proceduralLevel: masteryHistory.proceduralLevel,
      snapshotAt: masteryHistory.snapshotAt,
    })
    .from(masteryHistory)
    .where(eq(masteryHistory.studentId, childId))
    .orderBy(desc(masteryHistory.snapshotAt));
  const priorBySubTopic = new Map<
    string,
    { conceptualLevel: number | null; proceduralLevel: number | null }
  >();
  for (const h of history) {
    if (!priorBySubTopic.has(h.subTopicId)) {
      priorBySubTopic.set(h.subTopicId, {
        conceptualLevel: h.conceptualLevel,
        proceduralLevel: h.proceduralLevel,
      });
    }
  }

  const mastery: ReportMasteryCard[] = cards.map((c) => {
    const prior = priorBySubTopic.get(c.subTopicId);
    return {
      ...c,
      trend: trendOf(c.conceptualLevel, c.proceduralLevel, prior),
      priorConceptualLevel: prior?.conceptualLevel ?? null,
      priorProceduralLevel: prior?.proceduralLevel ?? null,
    };
  });

  // Practice effort metrics (attempt is RLS-scoped to the board; appUserId
  // scopes to the child). Answered vs skipped, and total engaged time.
  const [m] = await tx
    .select({
      answered: sql<string>`count(*) filter (where ${attempt.answerText} is not null)`,
      skipped: sql<string>`count(*) filter (where ${attempt.skipReason} is not null)`,
      totalTimeMs: sql<string>`coalesce(sum(${attempt.timeMs}), 0)`,
    })
    .from(attempt)
    .where(eq(attempt.appUserId, childId));

  return {
    child,
    metrics: {
      questionsAnswered: Number(m?.answered ?? 0),
      questionsSkipped: Number(m?.skipped ?? 0),
      totalTimeMs: Number(m?.totalTimeMs ?? 0),
    },
    mastery,
  };
}

/* ════════════════════════════════════════════════════════════════════════
 * Slice DASH-1 — the PARENT DASHBOARD read path.
 *
 * The Slice-P report (above) surfaces only mastery cards + effort metrics. The
 * locked portfolio (brainstorm-parent-dashboard.md) narrates far more, and the
 * three CLOCKS (S156/S157) wrote the data but no read path yet exposes it. This
 * assembler builds, in ONE board-scoped pass, everything the 8 portfolio sections
 * need — applying the six rulings (D-PDASH-1..6):
 *   §3 chapter map  — 3-colour per topic, one-axis-null → YELLOW (D-PDASH-1)
 *   §3 headline     — solid-now vs the CLOCK-2 monthly snapshot ("7 of 13 — was 4")
 *   §4 axis meters  — count-aggregated: proportion of COVERED topics green (D-PDASH-2)
 *   §2 story        — CLOCK-1 dispatch_reason + origin rollup
 *   §5 calibration  — confidence × calibration_flag, POOLED, hidden below a floor
 *   §6 weakness     — cross_concept_flag + CLOCK-3 plan (generated default when null)
 *   §7 horizontals  — subject-grain, parent-facing labels (D-PDASH-5, placeholder copy)
 *
 * The M11 projection boundary holds exactly as in computeChildReport: it selects
 * `description` and NEVER `log`, never `observation.tutor_level`, never a raw 1–5
 * level over the wire (levels become colour states / green-counts before leaving).
 * ════════════════════════════════════════════════════════════════════════ */

// Element 8 hides below this many answered questions — a small denominator makes
// an over/under count noise (brainstorm §sitting-3). Answers, never questions.
export const CALIBRATION_MIN_ANSWERS = 10;

// Story window: sessions this recent feed the §2 "this period" narrative.
const STORY_WINDOW_DAYS = 35;

export type MapCellState = "gray" | "yellow" | "green";

export type MapCell = {
  subTopicId: string;
  subTopicName: string;
  state: MapCellState;
};

export type ChapterRow = {
  chapterId: string;
  chapterName: string;
  cells: MapCell[];
  solid: number; // green cells
  total: number; // all cells (incl. gray) — what is CARVED
  /**
   * What this chapter is WORTH (S169): the authored `chapter_budget` when one is
   * set, else `total`. `budget > total` means the syllabus has more in it than
   * the spine has carved, so the difference is real work with no cell to render
   * yet — the map still draws `total` cells, but the headline counts `budget`.
   */
  budget: number;
};

export type AxisMeter = {
  green: number; // covered topics green on this axis (isAxisGreen, D-PDASH-7)
  covered: number; // denominator — topics with a mastery row (D-PDASH-2)
};

export type SubjectPanel = {
  subjectId: string;
  subjectName: string;
  chapters: ChapterRow[];
  meters: { conceptual: AxisMeter; procedural: AxisMeter };
  horizontals: DashboardHorizontal[];
  mastery: ReportMasteryCard[]; // certified detail, per-topic on expand
};

export type DashboardHorizontal = {
  slug: string;
  label: string; // parent-facing (D-PDASH-5 placeholder copy)
  gloss: string;
  subjectId: string;
  subjectName: string;
  level: number | null; // null = not yet observed (never "level 1")
  prose: string;
};

export type DashboardTotals = {
  solidNow: number;
  coveredNow: number;
  totalNow: number; // all mapped sub_topics (incl. gray)
  solidPrior: number | null; // CLOCK-2 snapshot ("was N last month"); null = no snapshot
  coveredPrior: number | null;
  priorPeriod: string | null; // the snapshot's period (YYYY-MM-DD)
};

export type StorySlots = {
  topicsPracticed: number; // distinct sub_topics practised in the window
  retentionTopics: string[]; // names a retention check brought back, recent-first
  selfDirectedCount: number; // sessions the student started on her own
};

export type Calibration = {
  shown: boolean; // false when answered < CALIBRATION_MIN_ANSWERS (noise floor)
  answered: number; // denominator — answers she rated confidence on
  over: number; // confident-and-wrong
  under: number; // unsure-and-right
  locations: string[]; // sub_topics where the misses clustered
};

export type DashboardWeakness = {
  fromSubTopicName: string | null; // where it surfaced (null for a synthesis item)
  note: string;
  planAuthored: boolean; // true → a tutor wrote it; false → generated default
  planText: string; // never blank (generated default when unauthored)
  planUpdatedAt: Date | null; // only authored plans carry a date
};

// A monthly progress point — the mastery_snapshot rollup, plus per-subject. The
// LIVE "now" point is appended by the read path (it isn't a stored snapshot).
export type TrendPoint = {
  period: string; // YYYY-MM-DD, first-of-month
  label: string; // short month, e.g. "Mar"
  covered: number;
  solid: number;
  perSubject: { subjectId: string; subjectName: string; covered: number; solid: number }[];
  live: boolean; // true for the appended current-month point
};

// Daily practice for the contribution heatmap; monthly rollup for the effort bars.
export type ActivityDay = { date: string; count: number }; // count = answered attempts
export type ActivityMonth = {
  month: string; // YYYY-MM-01
  label: string; // "Mar"
  answered: number;
  minutes: number;
};
export type DashboardActivity = {
  days: number; // window length the daily grid spans
  daily: ActivityDay[]; // answered attempts per day, sparse (active days only)
  monthly: ActivityMonth[]; // last few months, oldest-first
};

// Pace — intended time per chapter vs the actual picture (Slice PACE-1/2, surfaced
// parent-side). Reuses pace.getPlan; the payload is the parent-safe projection.
export type ParentPaceStatus =
  | "completed"
  | "on_time"
  | "delay_risk"
  | "amber"
  | "red";
export type ParentPrepLabel =
  | "strong"
  | "on_track"
  | "needs_work"
  | "not_started";
export type DashboardPaceChapter = {
  name: string;
  recommendedWeeks: number; // intended time
  completed: boolean;
  projectedEndDate: string | null; // null until a plan is set up
  status: ParentPaceStatus | null;
  daysOver: number | null; // days past the projected end (behind), else null/0
  preparedness: ParentPrepLabel | null;
};
export type DashboardPaceSubject = {
  subjectId: string;
  subjectName: string;
  needsSetup: boolean; // no deadline chosen yet → no projection
  endDate: string | null; // the student-set deadline (set-up plans)
  subjectStatus: ParentPaceStatus | null;
  chapters: DashboardPaceChapter[];
};

export type ChildDashboard = {
  child: ChildSummary;
  totals: DashboardTotals;
  story: StorySlots;
  subjects: SubjectPanel[];
  calibration: Calibration;
  weaknesses: DashboardWeakness[];
  metrics: ReportMetrics;
  trend: TrendPoint[]; // monthly progress, oldest-first, live point last
  activity: DashboardActivity; // effort — daily heatmap + monthly bars
  pace: DashboardPaceSubject[]; // intended-vs-actual, per subject with a plan
  /**
   * S168 — this board's parent-copy OVERRIDES (D-PDASH-3's DB half), key→string.
   * Only keys the board has actually overridden appear; everything else falls
   * back to the code default. It ships in the PAYLOAD because the portfolio
   * resolves most of its copy CLIENT-side (`copy()` in ParentPage.tsx reads the
   * kernel map directly), so the browser needs the same overrides the server
   * used — otherwise the two halves of one page would speak in two voices.
   */
  copyOverrides: Record<string, string>;
};

// D-PDASH-1 (colours) + D-PDASH-7 (the green rule, S168) — a topic's map colour
// from its two axes. GREEN per `isSolid` (either axis ≥3, both assessed); GRAY
// when no axis is observed (no row, OR a row with both axes null); YELLOW
// everything else observed (incl. one-axis-null-one-observed — "in progress",
// never a gap; note such a row can no longer be green, by D-PDASH-7's design).
//
// The threshold lives in @b2c/kernel/mastery so the LIVE total row and the
// FROZEN month rows (snapshot.ts) cannot drift apart. Do not re-inline it.
function cellState(c: number | null, p: number | null): MapCellState {
  if (c == null && p == null) return "gray";
  if (isSolid(c, p)) return "green";
  return "yellow";
}

/**
 * Pace, per in-scope subject — the parent-safe projection of pace.getPlan
 * (intended weeks per chapter + projected end + on-time/behind + preparedness).
 * getPlan self-loads everything (subject, chapters, plan row, certified mastery),
 * so this is a per-subject delegate + a flatten to the never-raw parent shape.
 */
async function readPace(
  tx: Tx,
  child: ChildSummary,
  subjectIds: string[],
): Promise<DashboardPaceSubject[]> {
  const now = new Date();
  const todayMs = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
  );
  const out: DashboardPaceSubject[] = [];
  for (const subjectId of subjectIds) {
    const view = await getPlan(tx, { self: child, subjectId });
    if (view.needsSetup) {
      out.push({
        subjectId,
        subjectName: view.subject.name,
        needsSetup: true,
        endDate: null,
        subjectStatus: null,
        chapters: view.chapters.map((c) => ({
          name: c.name,
          recommendedWeeks: c.recommendedWeeks,
          completed: c.completed,
          projectedEndDate: null,
          status: null,
          daysOver: null,
          preparedness: null,
        })),
      });
      continue;
    }
    out.push({
      subjectId,
      subjectName: view.subject.name,
      needsSetup: false,
      endDate: view.summary.endDate,
      subjectStatus: view.summary.subjectStatus,
      chapters: view.chapters.map((c) => {
        const end = c.projectedEndDate ?? null;
        const daysOver =
          end && !c.completed
            ? Math.max(
                0,
                Math.round(
                  (todayMs - Date.parse(`${end}T00:00:00Z`)) / 86_400_000,
                ),
              )
            : null;
        return {
          name: c.name,
          recommendedWeeks: c.recommendedWeeks,
          completed: c.completed,
          projectedEndDate: end,
          status: c.paceStatus ?? null,
          daysOver,
          preparedness: c.preparedness?.label ?? null,
        };
      }),
    });
  }
  return out;
}

/** Guarded entry — assert the parent→child link, then assemble. */
export async function getChildDashboard(
  tx: Tx,
  args: { parentUserId: string; childId: string },
): Promise<ChildDashboard> {
  const child = await assertParentsChild(tx, args.parentUserId, args.childId);
  return computeChildDashboard(tx, child);
}

/**
 * The guard-free core: assemble the full parent dashboard for an ALREADY-resolved
 * child (ownership is the caller's job). RLS scopes every read to the board.
 */
export async function computeChildDashboard(
  tx: Tx,
  child: ChildSummary,
): Promise<ChildDashboard> {
  const childId = child.studentId;

  // In-scope subjects = those the child has ANY certified mastery in. The map
  // then shows every topic of those subjects (incl. never-taught gray), so the
  // per-chapter counts honestly encode the job ahead.
  const scopeRows = await tx
    .selectDistinct({ subjectId: subject.id })
    .from(masteryState)
    .innerJoin(subTopic, eq(subTopic.id, masteryState.subTopicId))
    .innerJoin(topic, eq(topic.id, subTopic.topicId))
    .innerJoin(chapter, eq(chapter.id, topic.chapterId))
    .innerJoin(subject, eq(subject.id, chapter.subjectId))
    .where(eq(masteryState.studentId, childId));
  const subjectIds = scopeRows.map((r) => r.subjectId);

  // Prior snapshot (CLOCK-2) — most recent month captured. Read regardless of
  // scope so the "was N" survives even a between-snapshot subject change.
  const [snap] = await tx
    .select({
      period: masterySnapshot.period,
      coveredCount: masterySnapshot.coveredCount,
      solidCount: masterySnapshot.solidCount,
    })
    .from(masterySnapshot)
    .where(eq(masterySnapshot.studentId, childId))
    .orderBy(desc(masterySnapshot.period))
    .limit(1);

  // Effort metrics + calibration + story + weakness reads don't depend on scope.
  // D-PDASH-3 (S168): the copy overrides, shipped to the FE so the
  // client-resolved half of the page speaks in the same voice as the server one.
  // Read FIRST because readWeaknesses embeds a resolved string in its payload.
  // D-PDASH-8 (S169): resolved for THIS CHILD — board rows, then the child's own
  // layered on top. A parent with three children reads three different voices,
  // so this must key on `childId` and never on the parent.
  const copyOverrides = await readParentCopyOverrides(tx, childId);
  const metrics = await readMetrics(tx, childId);
  const calibration = await readCalibration(tx, childId);
  const story = await readStory(tx, childId);
  const weaknesses = await readWeaknesses(tx, childId, copyOverrides);
  const activity = await readActivity(tx, childId);
  const snapshotRows = await readSnapshots(tx, childId); // ASC, all months

  // No certified mastery yet → an empty-but-valid dashboard (the honest thin state).
  if (subjectIds.length === 0) {
    return {
      child,
      totals: {
        solidNow: 0,
        coveredNow: 0,
        totalNow: 0,
        solidPrior: snap?.solidCount ?? null,
        coveredPrior: snap?.coveredCount ?? null,
        priorPeriod: snap ? String(snap.period) : null,
      },
      story,
      subjects: [],
      calibration,
      weaknesses,
      metrics,
      trend: buildTrend(snapshotRows, { covered: 0, solid: 0, perSubject: [] }),
      activity,
      pace: [],
      copyOverrides,
    };
  }

  // The spine + mastery, one LEFT JOIN — EVERY sub_topic of the in-scope subjects,
  // carrying its levels/description or nulls (gray) when the child has no row.
  const spine = await tx
    .select({
      subjectId: subject.id,
      subjectName: subject.name,
      chapterId: chapter.id,
      chapterName: chapter.name,
      chapterOrdinal: chapter.ordinal,
      topicName: topic.name,
      subTopicId: subTopic.id,
      subTopicName: subTopic.name,
      conceptualLevel: masteryState.conceptualLevel,
      proceduralLevel: masteryState.proceduralLevel,
      description: masteryState.description, // M11: user-visible blob, never `log`
      updatedAt: masteryState.updatedAt, // non-null ⇔ a mastery row exists (= covered)
    })
    .from(subTopic)
    .innerJoin(topic, eq(topic.id, subTopic.topicId))
    .innerJoin(chapter, eq(chapter.id, topic.chapterId))
    .innerJoin(subject, eq(subject.id, chapter.subjectId))
    .leftJoin(
      masteryState,
      and(
        eq(masteryState.subTopicId, subTopic.id),
        eq(masteryState.studentId, childId),
      ),
    )
    .where(inArray(subject.id, subjectIds))
    .orderBy(asc(chapter.ordinal), asc(topic.ordinal), asc(subTopic.ordinal));

  // Prior snapshots per sub_topic → the movement trend on the detail cards.
  const priorBySubTopic = await readPriorMastery(tx, childId);

  // Build subject panels. One pass groups by subject → chapter, computes the map
  // cells + per-chapter/per-subject/global counts + the count-aggregated meters.
  const bySubject = new Map<string, SubjectPanel>();
  const chapterRows = new Map<string, ChapterRow>(); // chapterId → row
  const chapterOrdinal = new Map<string, number>(); // chapterId → syllabus order
  let solidNow = 0;
  let coveredNow = 0;

  for (const r of spine) {
    let panel = bySubject.get(r.subjectId);
    if (!panel) {
      panel = {
        subjectId: r.subjectId,
        subjectName: r.subjectName,
        chapters: [],
        meters: { conceptual: { green: 0, covered: 0 }, procedural: { green: 0, covered: 0 } },
        horizontals: [],
        mastery: [],
      };
      bySubject.set(r.subjectId, panel);
    }

    let row = chapterRows.get(r.chapterId);
    if (!row) {
      // `budget` is filled after the loop, once the overrides are read in one go.
      row = { chapterId: r.chapterId, chapterName: r.chapterName, cells: [], solid: 0, total: 0, budget: 0 };
      chapterRows.set(r.chapterId, row);
      chapterOrdinal.set(r.chapterId, Number(r.chapterOrdinal));
      panel.chapters.push(row);
    }

    const state = cellState(r.conceptualLevel, r.proceduralLevel);
    row.cells.push({ subTopicId: r.subTopicId, subTopicName: r.subTopicName, state });
    row.total += 1;
    if (state === "green") {
      row.solid += 1;
      solidNow += 1;
    }

    const covered = r.updatedAt != null; // a mastery row exists (D-PDASH-2 denominator)
    if (covered) {
      coveredNow += 1;
      panel.meters.conceptual.covered += 1;
      panel.meters.procedural.covered += 1;
      if (isAxisGreen(r.conceptualLevel)) panel.meters.conceptual.green += 1;
      if (isAxisGreen(r.proceduralLevel)) panel.meters.procedural.green += 1;

      // Certified detail card (the per-topic expand). Only covered topics get one.
      const prior = priorBySubTopic.get(r.subTopicId);
      panel.mastery.push({
        subTopicId: r.subTopicId,
        subTopicName: r.subTopicName,
        topicName: r.topicName,
        chapterId: r.chapterId,
        chapterName: r.chapterName,
        conceptualLevel: r.conceptualLevel,
        proceduralLevel: r.proceduralLevel,
        description: r.description ?? "",
        updatedAt: r.updatedAt!,
        trend: trendOf(r.conceptualLevel, r.proceduralLevel, prior),
        priorConceptualLevel: prior?.conceptualLevel ?? null,
        priorProceduralLevel: prior?.proceduralLevel ?? null,
      });
    }
  }

  // Horizontals (subject-grain) → attach to their subject panel with parent copy.
  const hRows = await tx
    .select({
      slug: horizontalSkillState.slug,
      subjectId: horizontalSkillState.subjectId,
      subjectName: subject.name,
      level: horizontalSkillState.level,
      prose: horizontalSkillState.prose,
    })
    .from(horizontalSkillState)
    .innerJoin(subject, eq(subject.id, horizontalSkillState.subjectId))
    .where(eq(horizontalSkillState.studentId, childId))
    .orderBy(asc(horizontalSkillState.slug));
  for (const h of hRows) {
    const panel = bySubject.get(h.subjectId);
    if (!panel) continue; // a horizontal on a subject with no mastery — skip silently
    const { label, gloss } = horizontalLabel(h.slug);
    panel.horizontals.push({
      slug: h.slug,
      label,
      gloss,
      subjectId: h.subjectId,
      subjectName: h.subjectName,
      level: h.level,
      prose: h.prose,
    });
  }

  // S169 — the headline denominator honours the authored per-chapter budget
  // where one exists, and otherwise stays exactly what it was (the carved
  // count). With no overrides set anywhere, `totalNow === spine.length` still,
  // which is why shipping this changes nothing until someone sets a number.
  //
  // S170 — read the budgets off the SUBJECTS, not off `chapterRows`. A chapter
  // with zero carved sub-topics never enters the loop above (the spine query
  // INNER JOINs `sub_topic`), so asking only about chapters already in the map
  // discarded every budget set on an uncarved chapter — the 8 of 19 CBSE
  // chapters that make the difference between a 127 denominator and the real
  // 194. Those chapters now join the map as budget-only rows: no cells to draw,
  // but their weight counted and their name visible as not-yet-started.
  const budgeted = await readSubjectChapterBudgets(tx, subjectIds);
  const budgetById = new Map(budgeted.map((b) => [b.chapterId, b.budget]));
  for (const row of chapterRows.values()) {
    row.budget = budgetById.get(row.chapterId) ?? row.total;
  }
  for (const b of budgeted) {
    if (chapterRows.has(b.chapterId)) continue;
    // A budget of 0 is only storable on a chapter with nothing carved, and it
    // means "deliberately out of scope" (probe §4d). Drawing it as a chapter
    // the child has yet to start would claim the opposite.
    if (b.budget === 0) continue;
    const panel = bySubject.get(b.subjectId);
    if (!panel) continue; // a budget on a subject this child isn't studying
    const row: ChapterRow = {
      chapterId: b.chapterId,
      chapterName: b.chapterName,
      cells: [],
      solid: 0,
      total: 0,
      budget: b.budget,
    };
    chapterRows.set(b.chapterId, row);
    chapterOrdinal.set(b.chapterId, b.ordinal);
    panel.chapters.push(row);
  }
  // The spine arrived ordinal-sorted; the budget-only rows were appended after
  // it, so restore syllabus order or Real Numbers lands behind Statistics.
  for (const panel of bySubject.values()) {
    panel.chapters.sort(
      (a, b) => (chapterOrdinal.get(a.chapterId) ?? 0) - (chapterOrdinal.get(b.chapterId) ?? 0),
    );
  }
  const totalNow = [...chapterRows.values()].reduce((n, row) => n + row.budget, 0);

  const pace = await readPace(tx, child, subjectIds);

  // Live per-subject covered/solid (topic counts) → the trend's "now" point.
  const livePerSubject = [...bySubject.values()].map((p) => ({
    subjectId: p.subjectId,
    subjectName: p.subjectName,
    covered: p.meters.conceptual.covered,
    solid: p.chapters.reduce((a, c) => a + c.solid, 0),
  }));

  return {
    child,
    totals: {
      solidNow,
      coveredNow,
      totalNow,
      solidPrior: snap?.solidCount ?? null,
      coveredPrior: snap?.coveredCount ?? null,
      priorPeriod: snap ? String(snap.period) : null,
    },
    story,
    subjects: [...bySubject.values()],
    calibration,
    weaknesses,
    metrics,
    trend: buildTrend(snapshotRows, {
      covered: coveredNow,
      solid: solidNow,
      perSubject: livePerSubject,
    }),
    activity,
    pace,
    copyOverrides,
  };
}

// ── Trend + activity read helpers ───────────────────────────────────────────

const MONTH_LABELS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];
const monthLabel = (period: string) => {
  const m = Number(period.slice(5, 7)); // 'YYYY-MM-DD' → MM
  return MONTH_LABELS[(m - 1 + 12) % 12] ?? period;
};
const firstOfThisMonth = () => {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`;
};

type SnapshotRow = {
  period: string;
  coveredCount: number;
  solidCount: number;
  metrics: { perSubject?: TrendPoint["perSubject"] } | null;
};

/** All monthly snapshots for the child, oldest-first (the trend basis). */
async function readSnapshots(tx: Tx, childId: string): Promise<SnapshotRow[]> {
  const rows = await tx
    .select({
      period: masterySnapshot.period,
      coveredCount: masterySnapshot.coveredCount,
      solidCount: masterySnapshot.solidCount,
      metrics: masterySnapshot.metrics,
    })
    .from(masterySnapshot)
    .where(eq(masterySnapshot.studentId, childId))
    .orderBy(asc(masterySnapshot.period));
  return rows.map((r) => ({
    period: String(r.period),
    coveredCount: r.coveredCount,
    solidCount: r.solidCount,
    metrics: r.metrics as SnapshotRow["metrics"],
  }));
}

/** Snapshots → trend points, with the live current-month point appended last. */
function buildTrend(
  rows: SnapshotRow[],
  live: { covered: number; solid: number; perSubject: TrendPoint["perSubject"] },
): TrendPoint[] {
  const points: TrendPoint[] = rows.map((r) => ({
    period: r.period,
    label: monthLabel(r.period),
    covered: r.coveredCount,
    solid: r.solidCount,
    perSubject: r.metrics?.perSubject ?? [],
    live: false,
  }));
  const nowPeriod = firstOfThisMonth();
  // If a snapshot already exists for the current month, replace it with live.
  const dropLast = points.length > 0 && points[points.length - 1]!.period === nowPeriod;
  if (dropLast) points.pop();
  points.push({
    period: nowPeriod,
    label: monthLabel(nowPeriod),
    covered: live.covered,
    solid: live.solid,
    perSubject: live.perSubject,
    live: true,
  });
  return points;
}

/** Practice activity — daily answered-attempt counts (heatmap) + monthly rollup. */
async function readActivity(tx: Tx, childId: string): Promise<DashboardActivity> {
  // Year-to-date window — the heatmap runs from Jan 1 of the current year to
  // today, so the deck shows the whole year so far (zoomed out).
  const now = new Date();
  const jan1 = Date.UTC(now.getUTCFullYear(), 0, 1);
  const todayUtc = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
  );
  const days = Math.floor((todayUtc - jan1) / 86_400_000) + 1;
  const daily = await tx
    .select({
      date: sql<string>`to_char(${attempt.submittedAt}, 'YYYY-MM-DD')`,
      count: sql<string>`count(*)`,
    })
    .from(attempt)
    .where(
      and(
        eq(attempt.appUserId, childId),
        sql`${attempt.answerText} is not null`,
        gte(attempt.submittedAt, sql`date_trunc('year', now())`),
      ),
    )
    .groupBy(sql`to_char(${attempt.submittedAt}, 'YYYY-MM-DD')`)
    .orderBy(sql`to_char(${attempt.submittedAt}, 'YYYY-MM-DD')`);

  const monthly = await tx
    .select({
      month: sql<string>`to_char(date_trunc('month', ${attempt.submittedAt}), 'YYYY-MM-DD')`,
      answered: sql<string>`count(*)`,
      timeMs: sql<string>`coalesce(sum(${attempt.timeMs}), 0)`,
    })
    .from(attempt)
    .where(
      and(
        eq(attempt.appUserId, childId),
        sql`${attempt.answerText} is not null`,
        gte(attempt.submittedAt, sql`date_trunc('month', now()) - interval '5 months'`),
      ),
    )
    .groupBy(sql`date_trunc('month', ${attempt.submittedAt})`)
    .orderBy(sql`date_trunc('month', ${attempt.submittedAt})`);

  return {
    days,
    daily: daily.map((r) => ({ date: r.date, count: Number(r.count) })),
    monthly: monthly.map((r) => ({
      month: r.month,
      label: monthLabel(r.month),
      answered: Number(r.answered),
      minutes: Math.round(Number(r.timeMs) / 60000),
    })),
  };
}

/** Effort metrics — answered vs skipped + total engaged time (RLS/board-scoped). */
async function readMetrics(tx: Tx, childId: string): Promise<ReportMetrics> {
  const [m] = await tx
    .select({
      answered: sql<string>`count(*) filter (where ${attempt.answerText} is not null)`,
      skipped: sql<string>`count(*) filter (where ${attempt.skipReason} is not null)`,
      totalTimeMs: sql<string>`coalesce(sum(${attempt.timeMs}), 0)`,
    })
    .from(attempt)
    .where(eq(attempt.appUserId, childId));
  return {
    questionsAnswered: Number(m?.answered ?? 0),
    questionsSkipped: Number(m?.skipped ?? 0),
    totalTimeMs: Number(m?.totalTimeMs ?? 0),
  };
}

/**
 * Calibration (element 8) — confidence × calibration_flag, POOLED cross-subject
 * (D §pool-and-locate). Denominator = answers she rated confidence on (skips carry
 * none). Hidden below the floor; the value is the LOCATION as much as the count.
 */
async function readCalibration(tx: Tx, childId: string): Promise<Calibration> {
  const [ans] = await tx
    .select({ n: sql<string>`count(*)` })
    .from(attempt)
    .where(and(eq(attempt.appUserId, childId), sql`${attempt.confidence} is not null`));
  const answered = Number(ans?.n ?? 0);

  // over/under from observations tied to an answered attempt (a flag with no
  // confidence-bearing answer isn't a calibration signal).
  const flags = await tx
    .select({ flag: observation.calibrationFlag, subTopicName: subTopic.name })
    .from(observation)
    .innerJoin(attempt, eq(attempt.id, observation.attemptId))
    .innerJoin(subTopic, eq(subTopic.id, observation.subTopicId))
    .where(
      and(
        eq(observation.studentId, childId),
        sql`${attempt.confidence} is not null`,
        sql`${observation.calibrationFlag} in ('over','under')`,
      ),
    );
  let over = 0;
  let under = 0;
  const locations = new Set<string>();
  for (const f of flags) {
    if (f.flag === "over") over += 1;
    else if (f.flag === "under") under += 1;
    locations.add(f.subTopicName);
  }
  return {
    shown: answered >= CALIBRATION_MIN_ANSWERS,
    answered,
    over,
    under,
    locations: [...locations],
  };
}

/** §2 story slots — CLOCK-1 dispatch reasons over the recent window. */
async function readStory(tx: Tx, childId: string): Promise<StorySlots> {
  const since = new Date(Date.now() - STORY_WINDOW_DAYS * 86_400_000);
  const rows = await tx
    .select({
      subTopicId: practiceSession.subTopicId,
      subTopicName: subTopic.name,
      dispatchReason: practiceSession.dispatchReason,
      origin: practiceSession.origin,
      createdAt: practiceSession.createdAt,
    })
    .from(practiceSession)
    .innerJoin(subTopic, eq(subTopic.id, practiceSession.subTopicId))
    .where(and(eq(practiceSession.appUserId, childId), gte(practiceSession.createdAt, since)))
    .orderBy(desc(practiceSession.createdAt));

  const topics = new Set<string>();
  const retention: string[] = [];
  let selfDirected = 0;
  for (const s of rows) {
    topics.add(s.subTopicId);
    if (s.dispatchReason === "retention" && !retention.includes(s.subTopicName)) {
      retention.push(s.subTopicName);
    }
    if (s.origin === "self_serve") selfDirected += 1;
  }
  return { topicsPracticed: topics.size, retentionTopics: retention, selfDirectedCount: selfDirected };
}

/** §6 weaknesses — cross_concept_flags + CLOCK-3 plan (generated default when null). */
async function readWeaknesses(
  tx: Tx,
  childId: string,
  copyOverrides: Record<string, string> = {},
): Promise<DashboardWeakness[]> {
  const rows = await tx
    .select({
      note: crossConceptFlag.note,
      plan: crossConceptFlag.plan,
      planUpdatedAt: crossConceptFlag.planUpdatedAt,
      fromSubTopicName: subTopic.name,
    })
    .from(crossConceptFlag)
    .leftJoin(subTopic, eq(subTopic.id, crossConceptFlag.fromSubTopicId))
    .where(eq(crossConceptFlag.studentId, childId))
    .orderBy(desc(crossConceptFlag.createdAt));
  return rows.map((r) => ({
    fromSubTopicName: r.fromSubTopicName ?? null,
    note: r.note,
    planAuthored: r.plan != null,
    // The ONE string the server resolves into the payload rather than leaving to
    // the client — so it takes the board's override too, or a retuned worklist
    // line would appear everywhere on the page EXCEPT here.
    planText:
      r.plan ??
      (copyOverrides["plan.generated_default"] ?? resolveParentCopy("plan.generated_default")),
    planUpdatedAt: r.planUpdatedAt ?? null,
  }));
}

/** Most-recent prior mastery snapshot per sub_topic (the trend basis). */
async function readPriorMastery(
  tx: Tx,
  childId: string,
): Promise<Map<string, { conceptualLevel: number | null; proceduralLevel: number | null }>> {
  const history = await tx
    .select({
      subTopicId: masteryHistory.subTopicId,
      conceptualLevel: masteryHistory.conceptualLevel,
      proceduralLevel: masteryHistory.proceduralLevel,
    })
    .from(masteryHistory)
    .where(eq(masteryHistory.studentId, childId))
    .orderBy(desc(masteryHistory.snapshotAt));
  const map = new Map<string, { conceptualLevel: number | null; proceduralLevel: number | null }>();
  for (const h of history) {
    if (!map.has(h.subTopicId)) {
      map.set(h.subTopicId, {
        conceptualLevel: h.conceptualLevel,
        proceduralLevel: h.proceduralLevel,
      });
    }
  }
  return map;
}
