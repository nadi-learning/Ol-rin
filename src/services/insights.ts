/**
 * Slice INS — the STUDENT'S OWN insights/progress surface. The student-facing
 * sibling of the parent/tutor report. Reuses computeChildReport (parent.ts) for
 * the CALLER-AS-SELF, then applies the D-INS-1 exposure boundary: certified
 * levels are mapped to SOFT BUCKET LABELS and the raw 1–5 numbers are DROPPED —
 * they never cross the wire to a student. Only the user-visible `description`,
 * the bucket, and the movement trend are exposed (the internal `log` is already
 * excluded by computeChildReport).
 *
 * Why reuse computeChildReport (D-INS-2): it is the single source for the mastery
 * read AND the description-only/never-log projection boundary. Reusing it means
 * zero new leak surface and free trend + effort metrics — this service only
 * RE-PROJECTS into the student-safe shape.
 *
 * Exposure decision (D-INS-1): students see soft buckets, not raw levels.
 * Reversible — flip the projection to also expose numbers later if the product
 * calls for it. The mapping is enforced SERVER-SIDE so a raw level never reaches
 * a student client (the same M11-style boundary that keeps answer keys / `log`
 * server-side; the probe asserts no raw level over the wire).
 *
 * Self-scoping (D-L-5): mastery_state / attempt are board-scoped by RLS but NOT
 * user-scoped — two students share a board. The caller's app_user id
 * (ctx.membership.userId) is the inner filter; computeChildReport applies it via
 * the self ChildSummary. The probe proves a bystander's rows never leak in.
 */
import type { PgTransaction } from "drizzle-orm/pg-core";
import { type ChildSummary, computeChildReport, type Trend } from "./parent";

type Tx = PgTransaction<any, any, any>;

export type MasteryBucket =
  | "getting-started"
  | "practising"
  | "strong"
  | "mastered";

/**
 * Soft bucket for a certified 1–5 axis level (D-INS-1). Four buckets: the bottom
 * two levels merge into "getting started" so the scale reads warm, not grade-like.
 * Tunable — the single place the level→label policy lives.
 *
 * A null level = NOT YET OBSERVED on that axis → null bucket, rendered as
 * "not yet assessed". It must never fall through to "getting-started": no item
 * exposed the axis, which is a coverage gap, not a weak student (assessment.md §5).
 */
export function bucketForLevel(level: number | null): MasteryBucket | null {
  if (level == null) return null;
  if (level >= 5) return "mastered";
  if (level >= 4) return "strong";
  if (level >= 3) return "practising";
  return "getting-started"; // 1–2 merged
}

export type InsightTopic = {
  subTopicId: string;
  subTopicName: string;
  topicName: string;
  chapterName: string;
  conceptual: MasteryBucket | null; // null = not yet assessed on that axis
  procedural: MasteryBucket | null;
  description: string;
  trend: Trend;
};

export type InsightsSummary = {
  metrics: {
    questionsAnswered: number;
    questionsSkipped: number;
    totalTimeMs: number;
  };
  topics: InsightTopic[];
};

/**
 * The caller's own insights: effort metrics (always present) + certified-mastery
 * topics projected to soft buckets (empty until a tutor finalizes Stage-2, which
 * is the only thing that writes mastery_state). Raw levels are intentionally NOT
 * in the return type — D-INS-1.
 */
export async function getMyInsights(
  tx: Tx,
  self: ChildSummary,
): Promise<InsightsSummary> {
  const report = await computeChildReport(tx, self);
  return {
    metrics: report.metrics,
    topics: report.mastery.map((c) => ({
      subTopicId: c.subTopicId,
      subTopicName: c.subTopicName,
      topicName: c.topicName,
      chapterName: c.chapterName,
      conceptual: bucketForLevel(c.conceptualLevel),
      procedural: bucketForLevel(c.proceduralLevel),
      description: c.description,
      trend: c.trend,
    })),
  };
}
