/**
 * Slice CLOCK-2 — the durable monthly mastery snapshot (a parent-dashboard clock).
 *
 * mastery_state is a whiteboard, not a diary: it holds the current certified
 * levels and is overwritten on every Stage-2 finalize. The parent dashboard's
 * headline number — "31 of 47 solid, was 19 last month" — is computable from
 * mastery_history, but a COMPUTED number DRIFTS under re-certifications and
 * overrides, and a parent screenshots "19" into the family WhatsApp. So a monthly
 * job FREEZES the counts into mastery_snapshot, one row per (student, month),
 * first-capture-wins. The number stays true after the fact.
 *
 * This module owns the compute + write. The recurring TRIGGER is a BullMQ
 * repeatable job registered at worker boot (queue.ts / worker/index.ts); a manual
 * run / backfill goes through scripts/snapshot_monthly.ts. Both call in here.
 *
 * Definitions (must agree with the chapter map + insights, insights.ts):
 *   covered = the student has a mastery_state row for the sub_topic (certified at
 *             least once — the only thing that writes mastery_state).
 *   solid   = BOTH axes >= 4 (bucketForLevel "strong"+ = the chapter-map green).
 */
import { and, eq, inArray } from "drizzle-orm";
import type { PgTransaction } from "drizzle-orm/pg-core";
import {
  chapter,
  masterySnapshot,
  masteryState,
  student,
  subTopic,
  subject,
  topic,
} from "@b2c/kernel/schema";

type Tx = PgTransaction<any, any, any>;

/** Both axes at or above this = "solid" (the chapter-map green). One place. */
const SOLID_LEVEL = 4;

export type SubjectRollup = {
  subjectId: string;
  subjectName: string;
  covered: number;
  solid: number;
};
export type SnapshotMetrics = { perSubject: SubjectRollup[] };

/**
 * First-of-month UTC boundary for an instant, as a YYYY-MM-DD date string — the
 * `period` a snapshot is labelled with. The monthly job runs on the 1st, so this
 * of `new Date()` names the month just beginning; "last month" is the prior row.
 */
export function monthPeriod(at: Date): string {
  const y = at.getUTCFullYear();
  const m = String(at.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}-01`;
}

/**
 * Compute + FREEZE one student's mastery rollup for `period`. Idempotent by
 * construction: ON CONFLICT (student_id, period) DO NOTHING — the first capture
 * of a month wins, so a re-run (or a mid-month manual run) never disturbs a
 * number a parent may already have. Returns true iff a NEW row was written.
 * Runs inside the caller's board-scoped tx (RLS).
 */
export async function snapshotStudent(
  tx: Tx,
  args: { boardId: string; studentId: string; period: string },
): Promise<boolean> {
  // One row per certified sub_topic, carrying the axis levels + its subject.
  const rows = await tx
    .select({
      subjectId: subject.id,
      subjectName: subject.name,
      conceptualLevel: masteryState.conceptualLevel,
      proceduralLevel: masteryState.proceduralLevel,
    })
    .from(masteryState)
    .innerJoin(subTopic, eq(subTopic.id, masteryState.subTopicId))
    .innerJoin(topic, eq(topic.id, subTopic.topicId))
    .innerJoin(chapter, eq(chapter.id, topic.chapterId))
    .innerJoin(subject, eq(subject.id, chapter.subjectId))
    .where(eq(masteryState.studentId, args.studentId));

  const bySubject = new Map<string, SubjectRollup>();
  let covered = 0;
  let solid = 0;
  for (const r of rows) {
    covered++;
    // A null axis is "not yet observed" — it cannot be solid (?? 0 < 4).
    const isSolid =
      (r.conceptualLevel ?? 0) >= SOLID_LEVEL &&
      (r.proceduralLevel ?? 0) >= SOLID_LEVEL;
    if (isSolid) solid++;
    let s = bySubject.get(r.subjectId);
    if (!s) {
      s = { subjectId: r.subjectId, subjectName: r.subjectName, covered: 0, solid: 0 };
      bySubject.set(r.subjectId, s);
    }
    s.covered++;
    if (isSolid) s.solid++;
  }
  const metrics: SnapshotMetrics = { perSubject: [...bySubject.values()] };

  const written = await tx
    .insert(masterySnapshot)
    .values({
      boardId: args.boardId,
      studentId: args.studentId,
      period: args.period,
      coveredCount: covered,
      solidCount: solid,
      metrics,
    })
    .onConflictDoNothing({
      target: [masterySnapshot.studentId, masterySnapshot.period],
    })
    .returning({ id: masterySnapshot.id });
  return written.length > 0;
}

/**
 * Run the monthly snapshot for every student on the CURRENT board (the tx's board
 * claim), or just `studentIds` when given — probe scoping (M22: never run an
 * all-rows job against the shared dev DB unscoped), and a legit targeted-recapture
 * ops capability. Returns { written, skipped } (skipped = already had that month).
 */
export async function runMonthlySnapshot(
  tx: Tx,
  args: { boardId: string; period: string; studentIds?: string[] },
): Promise<{ written: number; skipped: number }> {
  const base = tx.select({ userId: student.userId }).from(student);
  const studentRows =
    args.studentIds && args.studentIds.length > 0
      ? await base.where(
          and(
            eq(student.boardId, args.boardId),
            inArray(student.userId, args.studentIds),
          ),
        )
      : await base.where(eq(student.boardId, args.boardId));

  let written = 0;
  let skipped = 0;
  for (const s of studentRows) {
    const did = await snapshotStudent(tx, {
      boardId: args.boardId,
      studentId: s.userId,
      period: args.period,
    });
    if (did) written++;
    else skipped++;
  }
  return { written, skipped };
}
