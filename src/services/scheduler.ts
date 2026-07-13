/**
 * Spiral scheduler (#3) — the tutor due-queue. PURE CODE: no AI, no mastery
 * move, no persistent state of its own. It READS what Slice S2 already produces
 * (scheduling_state: taughtAt + climbNextDue; mastery_state: the two levels +
 * updatedAt) and composes the tutor's day: which already-taught sub-topics are
 * due to re-practise, and how they bundle.
 *
 * Source of truth: b2c/docs/plans/spiral-scheduling/intent.md. The two-box model
 * (§2): mastery owns WHEN a sub-topic is due + WHAT-KIND; this engine owns the
 * day's ASSEMBLY. It holds nothing persistent — every call is a fresh read.
 *
 * The two next-due dates per taught sub-topic (§6), reconciled by min():
 *  - CLIMB (assessment-owned): the requalify-after-a-gap date so a ready student
 *    can certify a higher level. A real judgment → produced by Stage-2, READ here
 *    from scheduling_state.climbNextDue. Null when topped out / nothing to climb.
 *  - RETENTION (this engine owns it — D-SCH-1, intent §8): anti-fade re-check =
 *    a deterministic ladder off the PROCEDURAL level. Pure arithmetic, not an AI
 *    guess, so the scheduler DERIVES it on read. Floor L2 (L1 is pure-acquiring —
 *    nothing yet to retain). The tunable ladder (intent §11) lives in code here,
 *    not in a prompt. ASSESS-FIX-3 finished the cleanup D-SCH-1 deferred: Stage-2
 *    no longer emits a retention date and `scheduling_state.retention_next_due` is
 *    GONE (migration 0021). One owner, one home — a stored copy could only go stale.
 *
 *    THE ANCHOR = the student's LAST PRACTICE on that sub-topic (the most recent
 *    Stage-1 observation), NOT the Stage-2 finalize. Fade is measured from when the
 *    student last *did* the thing; anchoring on the tutor's admin action means a
 *    tutor who certifies five days late silently pushes the anti-fade check five
 *    days out. Falls back to mastery_state.updatedAt when a taught sub-topic somehow
 *    has no observations (defensive — it always should).
 *
 * Two independent questions, never conflated (§6):
 *  1. IS it due?      → effectiveDue = min(climb, retention) ≤ asOf.
 *  2. HOW is it served when due? → the ≥3 gate below. A due item BELOW the gate
 *     is still served, just BLOCKED / alone; never mixed.
 *
 * Interleave-eligibility (§6, a SERVING gate, not a due gate): a due sub-topic
 * joins the mixed set once BOTH axes ≥ 3 (procedural ≥3 binds — reliable
 * execution makes mixing productive; conceptual ≥3 makes the discrimination
 * principled). Composition is emergent: serving several due sub-topics together
 * IS interleaving. Scope = SUBJECT (cross-chapter, within one subject), so the
 * bundle is computed per-subject and never crosses subjects.
 *
 * Boundaries (§8): NOT acquisition (taughtAt IS NOT NULL only — pace plan owns
 * new material), NOT authoring, NOT assessment, NOT delivery. v0 is the READ
 * surface (D-SCH-2); the compose→assign action waits on an assignment system
 * the rewrite doesn't have yet (mirrors Slice T being read-only before S2).
 *
 * Access: reuses the tutor surface's role gate + assertTutorsStudent ownership
 * wall (RLS scopes by board, not user). Runs inside the board-scoped tx.
 */
import { and, asc, eq, isNotNull, max } from "drizzle-orm";
import type { PgTransaction } from "drizzle-orm/pg-core";
import {
  chapter,
  masteryState,
  observation,
  schedulingState,
  subTopic,
  subject,
  topic,
} from "@b2c/kernel/schema";
import { assertTutorsStudent } from "./tutor";

type Tx = PgTransaction<any, any, any>;

/**
 * Retention (anti-fade) ladder by PROCEDURAL level (intent §6). Floor L2 — L1 is
 * pure-acquiring, nothing yet to retain. v0 default, tunable (intent §11).
 */
export const RETENTION_LADDER_DAYS: Record<number, number> = {
  2: 3,
  3: 7,
  4: 14,
  5: 21,
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Format a Date as a YYYY-MM-DD calendar day (UTC), matching the `date` column. */
function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Whole-day delta (a - b) between two YYYY-MM-DD strings; positive = a is later. */
function dayDelta(a: string, b: string): number {
  return Math.round((Date.parse(a) - Date.parse(b)) / MS_PER_DAY);
}

/**
 * Recompute the retention re-check date deterministically (D-SCH-1):
 * anchor (last finalize) + ladder[procedural]. Null below the L2 floor.
 */
export function computeRetentionDue(
  anchor: Date,
  proceduralLevel: number | null,
): string | null {
  if (proceduralLevel == null) return null; // never observed → nothing to retain yet
  const gap = RETENTION_LADDER_DAYS[proceduralLevel];
  if (gap === undefined) return null; // L1 (or out of range) → not yet retainable
  return toDateStr(new Date(anchor.getTime() + gap * MS_PER_DAY));
}

export type DueItem = {
  subTopicId: string;
  subTopicName: string;
  topicName: string;
  chapterName: string;
  conceptualLevel: number | null; // null = not yet observed on that axis
  proceduralLevel: number | null;
  climbDue: string | null; // assessment-owned (read from scheduling_state)
  retentionDue: string | null; // recomputed here
  effectiveDue: string; // min(climb, retention) — the reason it's in the queue
  overdueDays: number; // asOf - effectiveDue (≥0; 0 = due today)
  interleaveEligible: boolean; // both axes ≥ 3 → may be mixed; else served blocked
};

export type SubjectDueGroup = {
  subjectId: string;
  subjectName: string;
  items: DueItem[]; // most-overdue-first
  interleaved: string[]; // sub_topic ids of the eligible mixed set (≥3 both)
  blocked: string[]; // sub_topic ids served alone (below the gate)
};

/**
 * The tutor due-queue for one student: every TAUGHT sub-topic that is due/overdue
 * to re-practise (effectiveDue ≤ asOf), grouped by subject, each group sorted
 * most-overdue-first (§7 — overdue must be impossible to ignore) with its own
 * interleaved / blocked composition. Items not yet due, never taught
 * (taughtAt null), or with no due date at all are excluded.
 */
export async function getDueQueue(
  tx: Tx,
  args: { tutorUserId: string; studentId: string; asOf?: Date },
): Promise<SubjectDueGroup[]> {
  await assertTutorsStudent(tx, args.tutorUserId, args.studentId);
  const asOfStr = toDateStr(args.asOf ?? new Date());

  // The retention anchor: when the student LAST PRACTISED each sub-topic (the most
  // recent Stage-1 observation). One grouped read, joined in memory — cheaper than
  // a correlated subquery per row, and it keeps the main query flat.
  const lastPractice = new Map<string, Date>();
  const practiceRows = await tx
    .select({
      subTopicId: observation.subTopicId,
      lastAt: max(observation.createdAt),
    })
    .from(observation)
    .where(eq(observation.studentId, args.studentId))
    .groupBy(observation.subTopicId);
  for (const r of practiceRows) {
    if (r.lastAt) lastPractice.set(r.subTopicId, new Date(r.lastAt));
  }

  // Taught, in-the-spiral sub-topics for this student (taughtAt IS NOT NULL),
  // joined to their mastery levels + the curriculum chain up to subject. RLS
  // scopes the board automatically (tutorProcedure → withBoard).
  const rows = await tx
    .select({
      subjectId: subject.id,
      subjectName: subject.name,
      chapterOrdinal: chapter.ordinal,
      topicOrdinal: topic.ordinal,
      subTopicOrdinal: subTopic.ordinal,
      subTopicId: subTopic.id,
      subTopicName: subTopic.name,
      topicName: topic.name,
      chapterName: chapter.name,
      conceptualLevel: masteryState.conceptualLevel,
      proceduralLevel: masteryState.proceduralLevel,
      masteryUpdatedAt: masteryState.updatedAt,
      climbDue: schedulingState.climbNextDue,
    })
    .from(schedulingState)
    .innerJoin(
      masteryState,
      and(
        eq(masteryState.studentId, schedulingState.studentId),
        eq(masteryState.subTopicId, schedulingState.subTopicId),
      ),
    )
    .innerJoin(subTopic, eq(subTopic.id, schedulingState.subTopicId))
    .innerJoin(topic, eq(topic.id, subTopic.topicId))
    .innerJoin(chapter, eq(chapter.id, topic.chapterId))
    .innerJoin(subject, eq(subject.id, chapter.subjectId))
    .where(
      and(
        eq(schedulingState.studentId, args.studentId),
        isNotNull(schedulingState.taughtAt),
      ),
    )
    .orderBy(
      asc(subject.name),
      asc(chapter.ordinal),
      asc(topic.ordinal),
      asc(subTopic.ordinal),
    );

  const groups = new Map<string, SubjectDueGroup>();

  for (const r of rows) {
    // Anchor on the last practice; fall back to the finalize time only if this
    // taught sub-topic somehow has no observations at all.
    const anchor = lastPractice.get(r.subTopicId) ?? r.masteryUpdatedAt;
    const retentionDue = computeRetentionDue(anchor, r.proceduralLevel);
    const climbDue = r.climbDue; // `date` column → string | null

    // Reconcile: the earliest of the two (intent §6). Skip if neither fires.
    const candidates = [climbDue, retentionDue].filter(
      (d): d is string => d != null,
    );
    if (candidates.length === 0) continue;
    const effectiveDue = candidates.reduce((a, b) => (a <= b ? a : b));

    const overdueDays = dayDelta(asOfStr, effectiveDue);
    if (overdueDays < 0) continue; // not due yet

    // ≥3 on BOTH axes → eligible to be mixed. An unobserved axis (null) cannot
    // clear the gate — we have no evidence it is at 3.
    const interleaveEligible =
      (r.conceptualLevel ?? 0) >= 3 && (r.proceduralLevel ?? 0) >= 3;

    let group = groups.get(r.subjectId);
    if (!group) {
      group = {
        subjectId: r.subjectId,
        subjectName: r.subjectName,
        items: [],
        interleaved: [],
        blocked: [],
      };
      groups.set(r.subjectId, group);
    }
    group.items.push({
      subTopicId: r.subTopicId,
      subTopicName: r.subTopicName,
      topicName: r.topicName,
      chapterName: r.chapterName,
      conceptualLevel: r.conceptualLevel,
      proceduralLevel: r.proceduralLevel,
      climbDue,
      retentionDue,
      effectiveDue,
      overdueDays,
      interleaveEligible,
    });
  }

  // Sort each subject's items most-overdue-first; derive the suggested
  // composition (the eligible bundle is the interleaved set; the rest blocked).
  const out: SubjectDueGroup[] = [];
  for (const group of groups.values()) {
    group.items.sort((a, b) => b.overdueDays - a.overdueDays);
    for (const it of group.items) {
      if (it.interleaveEligible) group.interleaved.push(it.subTopicId);
      else group.blocked.push(it.subTopicId);
    }
    out.push(group);
  }
  return out;
}
