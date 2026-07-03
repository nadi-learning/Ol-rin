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
 *    the real whitelist(role='parent') → resolveMembership flow (seed_parent /
 *    the probe drive it, never insert a parent membership directly).
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
import { and, asc, desc, eq, sql } from "drizzle-orm";
import type { PgTransaction } from "drizzle-orm/pg-core";
import {
  appUser,
  attempt,
  chapter,
  masteryHistory,
  masteryState,
  parentChild,
  subTopic,
  topic,
} from "@b2c/kernel/schema";

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
  conceptualLevel: number;
  proceduralLevel: number;
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
  const [child] = await tx
    .select({
      studentId: appUser.id,
      name: appUser.name,
      email: appUser.email,
    })
    .from(parentChild)
    .innerJoin(appUser, eq(appUser.id, parentChild.studentId))
    .where(
      and(
        eq(parentChild.parentId, parentUserId),
        eq(parentChild.studentId, childId),
      ),
    )
    .limit(1);
  if (!child) throw new ChildNotFoundError(childId);
  return child;
}

/** The caller's children (RLS-scoped to the board via parent_child). */
export async function listChildren(
  tx: Tx,
  parentUserId: string,
): Promise<ChildSummary[]> {
  return tx
    .select({
      studentId: appUser.id,
      name: appUser.name,
      email: appUser.email,
    })
    .from(parentChild)
    .innerJoin(appUser, eq(appUser.id, parentChild.studentId))
    .where(eq(parentChild.parentId, parentUserId))
    .orderBy(asc(appUser.email));
}

function trendOf(
  curC: number,
  curP: number,
  prior: { conceptualLevel: number; proceduralLevel: number } | undefined,
): Trend {
  if (!prior) return "new";
  const delta =
    curC + curP - (prior.conceptualLevel + prior.proceduralLevel);
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
    { conceptualLevel: number; proceduralLevel: number }
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
