/**
 * Tutor read surface (Slice T) — the FIRST tutor-facing path. NO mastery move,
 * NO AI: a tutor logs in and inspects a linked student's certified mastery + the
 * Stage-1 observations that are waiting to be certified. This de-risks the role
 * gate + tutor_student wiring + the "pending Stage-2" worklist query before
 * Slice S2 puts the AI draft + finalize writes on top.
 *
 * Two access boundaries, both load-bearing:
 *  - ROLE gate (M11): only a membership with role='tutor' may reach these reads.
 *    The CHECK side is `assertTutor` (used by tutorProcedure); the SET side is the
 *    real whitelist(role='tutor') → resolveMembership flow (seed_tutor / the
 *    probe drive it, never insert a tutor membership directly).
 *  - OWNERSHIP guard (D-L-5 pattern): RLS scopes by board, NOT by user, so a
 *    tutor sharing a board with another tutor's students could otherwise read
 *    them. Every per-student read asserts a tutor_student link first; a student
 *    the caller doesn't tutor is reported as STUDENT_NOT_FOUND (no existence leak).
 *
 * Runs inside the board-scoped tx (tutorProcedure → withBoard): tutor_student,
 * mastery_state and observation reads are all RLS-gated to the active board.
 *
 * "Pending Stage-2" (the worklist) = per sub_topic, the count of this student's
 * Stage-1 observations newer than that sub_topic's last mastery_state finalize
 * (mastery_state.updated_at), or ALL of them when the sub_topic has no mastery
 * yet. No new column: mastery_state.updated_at IS the last-finalize marker (D-T-2).
 */
import { and, asc, eq, inArray } from "drizzle-orm";
import type { PgTransaction } from "drizzle-orm/pg-core";
import {
  appUser,
  chapter,
  masteryState,
  observation,
  subTopic,
  topic,
  tutorStudent,
} from "@b2c/kernel/schema";

type Tx = PgTransaction<any, any, any>;

// Matches the source tag Stage-1 writes (assessment.ts STAGE1_SOURCE).
const STAGE1_SOURCE = "stage1_scorer";
const EPOCH = new Date(0);

export class TutorOnlyError extends Error {
  readonly code = "NOT_A_TUTOR";
  constructor(role: string) {
    super(`role '${role}' is not a tutor`);
    this.name = "TutorOnlyError";
  }
}

export class StudentNotFoundError extends Error {
  readonly code = "STUDENT_NOT_FOUND";
  constructor(studentId: string) {
    super(`student ${studentId} is not assigned to this tutor`);
    this.name = "StudentNotFoundError";
  }
}

export type StudentSummary = {
  studentId: string;
  name: string | null;
  email: string;
};

export type MasteryCard = {
  subTopicId: string;
  subTopicName: string;
  topicName: string;
  chapterName: string;
  conceptualLevel: number;
  proceduralLevel: number;
  description: string; // user-visible blob (NOT the internal log field)
  updatedAt: Date;
};

export type PendingItem = {
  subTopicId: string;
  subTopicName: string;
  topicName: string;
  chapterName: string;
  pendingCount: number;
  lastObservationAt: Date;
  hasMastery: boolean;
};

export type ObservationView = {
  id: string;
  axis: string;
  observationLevel: number;
  reasoning: string;
  calibrationFlag: string | null;
  pedagogicalComment: string | null;
  questionId: string | null;
  createdAt: Date;
};

/** ROLE gate — the CHECK side (M11). tutorProcedure calls this. */
export function assertTutor(role: string): void {
  if (role !== "tutor") throw new TutorOnlyError(role);
}

/**
 * OWNERSHIP guard — assert the caller tutors this student, else NOT_FOUND.
 * Exported so the Stage-2 engine (assessment.ts) reuses the same per-user wall
 * (RLS scopes by board, not user — two tutors can share a board).
 */
export async function assertTutorsStudent(
  tx: Tx,
  tutorUserId: string,
  studentId: string,
): Promise<void> {
  const [link] = await tx
    .select({ id: tutorStudent.id })
    .from(tutorStudent)
    .where(
      and(
        eq(tutorStudent.tutorId, tutorUserId),
        eq(tutorStudent.studentId, studentId),
      ),
    )
    .limit(1);
  if (!link) throw new StudentNotFoundError(studentId);
}

/** The caller's students (RLS-scoped to the board via tutor_student). */
export async function listStudents(
  tx: Tx,
  tutorUserId: string,
): Promise<StudentSummary[]> {
  return tx
    .select({
      studentId: appUser.id,
      name: appUser.name,
      email: appUser.email,
    })
    .from(tutorStudent)
    .innerJoin(appUser, eq(appUser.id, tutorStudent.studentId))
    .where(eq(tutorStudent.tutorId, tutorUserId))
    .orderBy(asc(appUser.email));
}

/** A linked student's certified mastery (the pair + the user-visible blob). */
export async function getStudentMastery(
  tx: Tx,
  args: { tutorUserId: string; studentId: string },
): Promise<MasteryCard[]> {
  await assertTutorsStudent(tx, args.tutorUserId, args.studentId);
  return tx
    .select({
      subTopicId: subTopic.id,
      subTopicName: subTopic.name,
      topicName: topic.name,
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
    .where(eq(masteryState.studentId, args.studentId))
    .orderBy(asc(chapter.ordinal), asc(topic.ordinal), asc(subTopic.ordinal));
}

// ── Slice QA3-c: progress-first two-axis tree (D-QA3-1/2) ──────────────────
// The authoring entry surface: a navigable chapter → topic → sub_topic tree of
// the student's certified mastery, both axes at every level. Derived nodes
// (chapter, topic) show the WEAKEST-LINK (min of descendant sub_topic levels)
// as the headline + a spread histogram; leaves show their raw levels. Read-time
// aggregation only — nothing new is stored (D-QA3-2).

export type AxisRollup = {
  /** Weakest-link = min of descendant sub_topic levels for this axis. An
   *  UNTAUGHT sub_topic counts as 0 (D-QA3-c-1: the honest "author this next"
   *  signal), so any hole drags the headline down. 0 for an empty node too. */
  level: number;
  /** Histogram: index 0–5 = count of descendant sub_topics at that level (the
   *  bar behind the headline — shows WHERE the hole is). */
  spread: [number, number, number, number, number, number];
};

export type ProgressSubTopic = {
  subTopicId: string;
  name: string;
  conceptualLevel: number; // raw; 0 when untaught
  proceduralLevel: number; // raw; 0 when untaught
  hasMastery: boolean; // false = no mastery_state yet (untaught leaf)
  description: string | null; // user-visible blob (never the internal log)
};

export type ProgressTopic = {
  topicId: string;
  name: string;
  conceptual: AxisRollup;
  procedural: AxisRollup;
  subTopics: ProgressSubTopic[];
};

export type ProgressChapter = {
  chapterId: string;
  name: string;
  conceptual: AxisRollup;
  procedural: AxisRollup;
  topics: ProgressTopic[];
};

/** Weakest-link + spread over a flat set of descendant leaf levels (D-QA3-2).
 *  Untaught leaves arrive as 0 (D-QA3-c-1). Clamps to 0–5 defensively. */
function rollupAxis(levels: number[]): AxisRollup {
  const spread: [number, number, number, number, number, number] = [0, 0, 0, 0, 0, 0];
  for (const l of levels) {
    const b = Math.max(0, Math.min(5, l));
    spread[b] = (spread[b] ?? 0) + 1;
  }
  return { level: levels.length ? Math.min(...levels) : 0, spread };
}

/**
 * A linked student's full two-axis progress tree (QA3-c). LEFT-joins the spine
 * tree with mastery_state so UNTAUGHT sub_topics still appear (they're the
 * gaps that drive authoring); the studentId lives in the join condition (not a
 * WHERE) so the outer join keeps those rows. Chapter/topic rollups are computed
 * over their descendant LEAF sub_topics (min-of-leaves == min-of-topic-mins).
 */
export async function getProgressTree(
  tx: Tx,
  args: { tutorUserId: string; studentId: string },
): Promise<ProgressChapter[]> {
  await assertTutorsStudent(tx, args.tutorUserId, args.studentId);
  const rows = await tx
    .select({
      chapterId: chapter.id,
      chapterName: chapter.name,
      topicId: topic.id,
      topicName: topic.name,
      subTopicId: subTopic.id,
      subTopicName: subTopic.name,
      conceptualLevel: masteryState.conceptualLevel,
      proceduralLevel: masteryState.proceduralLevel,
      description: masteryState.description,
    })
    .from(subTopic)
    .innerJoin(topic, eq(topic.id, subTopic.topicId))
    .innerJoin(chapter, eq(chapter.id, topic.chapterId))
    .leftJoin(
      masteryState,
      and(
        eq(masteryState.subTopicId, subTopic.id),
        eq(masteryState.studentId, args.studentId),
      ),
    )
    .orderBy(asc(chapter.ordinal), asc(topic.ordinal), asc(subTopic.ordinal));

  // Fold ordinal-ordered rows → chapter → topic → sub_topic (getChapterNav
  // style), collecting leaf levels per node to roll up after the fold.
  const chapters: ProgressChapter[] = [];
  const chById = new Map<string, ProgressChapter>();
  const tpById = new Map<string, ProgressTopic>();
  // Per node: accumulate leaf levels for the rollup.
  const leaves = new Map<string, { c: number[]; p: number[] }>();
  const bucket = (id: string) => {
    let b = leaves.get(id);
    if (!b) leaves.set(id, (b = { c: [], p: [] }));
    return b;
  };

  for (const r of rows) {
    let ch = chById.get(r.chapterId);
    if (!ch) {
      ch = {
        chapterId: r.chapterId,
        name: r.chapterName,
        conceptual: rollupAxis([]),
        procedural: rollupAxis([]),
        topics: [],
      };
      chById.set(r.chapterId, ch);
      chapters.push(ch);
    }
    let tp = tpById.get(r.topicId);
    if (!tp) {
      tp = {
        topicId: r.topicId,
        name: r.topicName,
        conceptual: rollupAxis([]),
        procedural: rollupAxis([]),
        subTopics: [],
      };
      tpById.set(r.topicId, tp);
      ch.topics.push(tp);
    }
    const cl = r.conceptualLevel ?? 0;
    const pl = r.proceduralLevel ?? 0;
    tp.subTopics.push({
      subTopicId: r.subTopicId,
      name: r.subTopicName,
      conceptualLevel: cl,
      proceduralLevel: pl,
      hasMastery: r.conceptualLevel !== null,
      description: r.description,
    });
    bucket(r.topicId).c.push(cl);
    bucket(r.topicId).p.push(pl);
    bucket(r.chapterId).c.push(cl);
    bucket(r.chapterId).p.push(pl);
  }

  for (const ch of chapters) {
    const cb = bucket(ch.chapterId);
    ch.conceptual = rollupAxis(cb.c);
    ch.procedural = rollupAxis(cb.p);
    for (const tp of ch.topics) {
      const tb = bucket(tp.topicId);
      tp.conceptual = rollupAxis(tb.c);
      tp.procedural = rollupAxis(tb.p);
    }
  }
  return chapters;
}

/**
 * The worklist: per sub_topic, this student's Stage-1 observations not yet
 * certified (newer than the last finalize). Folded in JS (rows already small;
 * mirrors getChapterNav's read-then-group style) so the "since last finalize"
 * rule is explicit and testable.
 */
export async function listPendingStage2(
  tx: Tx,
  args: { tutorUserId: string; studentId: string },
): Promise<PendingItem[]> {
  await assertTutorsStudent(tx, args.tutorUserId, args.studentId);

  const obs = await tx
    .select({
      subTopicId: observation.subTopicId,
      createdAt: observation.createdAt,
    })
    .from(observation)
    .where(
      and(
        eq(observation.studentId, args.studentId),
        eq(observation.source, STAGE1_SOURCE),
      ),
    );
  if (obs.length === 0) return [];

  const finalized = await tx
    .select({
      subTopicId: masteryState.subTopicId,
      updatedAt: masteryState.updatedAt,
    })
    .from(masteryState)
    .where(eq(masteryState.studentId, args.studentId));
  const lastFinalize = new Map<string, Date>(
    finalized.map((m) => [m.subTopicId, m.updatedAt]),
  );

  // fold: per sub_topic, count obs strictly newer than the last finalize.
  type Agg = { pendingCount: number; lastObservationAt: Date; hasMastery: boolean };
  const agg = new Map<string, Agg>();
  for (const o of obs) {
    const cutoff = lastFinalize.get(o.subTopicId) ?? EPOCH;
    if (o.createdAt <= cutoff) continue; // already certified
    const cur = agg.get(o.subTopicId);
    if (!cur) {
      agg.set(o.subTopicId, {
        pendingCount: 1,
        lastObservationAt: o.createdAt,
        hasMastery: lastFinalize.has(o.subTopicId),
      });
    } else {
      cur.pendingCount += 1;
      if (o.createdAt > cur.lastObservationAt) cur.lastObservationAt = o.createdAt;
    }
  }
  if (agg.size === 0) return [];

  // names for the pending sub_topics, ordinal-ordered.
  const ids = [...agg.keys()];
  const rows = await tx
    .select({
      subTopicId: subTopic.id,
      subTopicName: subTopic.name,
      topicName: topic.name,
      chapterName: chapter.name,
    })
    .from(subTopic)
    .innerJoin(topic, eq(topic.id, subTopic.topicId))
    .innerJoin(chapter, eq(chapter.id, topic.chapterId))
    .where(inArray(subTopic.id, ids))
    .orderBy(asc(chapter.ordinal), asc(topic.ordinal), asc(subTopic.ordinal));

  return rows.map((r) => {
    const a = agg.get(r.subTopicId)!;
    return {
      subTopicId: r.subTopicId,
      subTopicName: r.subTopicName,
      topicName: r.topicName,
      chapterName: r.chapterName,
      pendingCount: a.pendingCount,
      lastObservationAt: a.lastObservationAt,
      hasMastery: a.hasMastery,
    };
  });
}

/**
 * A linked student's Stage-1 observation records for one sub_topic — the read
 * the tutor inspects before certifying (Slice S2 wires the "certify" action).
 * Observations carry the AI's reasoning + level, never any answer key.
 */
export async function getObservations(
  tx: Tx,
  args: { tutorUserId: string; studentId: string; subTopicId: string },
): Promise<ObservationView[]> {
  await assertTutorsStudent(tx, args.tutorUserId, args.studentId);
  return tx
    .select({
      id: observation.id,
      axis: observation.axis,
      observationLevel: observation.observationLevel,
      reasoning: observation.reasoning,
      calibrationFlag: observation.calibrationFlag,
      pedagogicalComment: observation.pedagogicalComment,
      questionId: observation.questionId,
      createdAt: observation.createdAt,
    })
    .from(observation)
    .where(
      and(
        eq(observation.studentId, args.studentId),
        eq(observation.subTopicId, args.subTopicId),
        eq(observation.source, STAGE1_SOURCE),
      ),
    )
    .orderBy(asc(observation.createdAt));
}
