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
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import type { PgTransaction } from "drizzle-orm/pg-core";
import {
  appUser,
  attempt,
  attemptImage,
  chapter,
  crossConceptFlag,
  eventLog,
  masteryState,
  observation,
  question,
  subTopic,
  topic,
  tutorStudent,
} from "@b2c/kernel/schema";
import { getPlan } from "./pace";
import type { PacePlanView } from "./pace";
import type { ChildSummary } from "./parent";

type Tx = PgTransaction<any, any, any>;

// Matches the source tag Stage-1 writes (assessment.ts STAGE1_SOURCE).
const STAGE1_SOURCE = "stage1_scorer";
const EPOCH = new Date(0);

// A tutor correcting a Stage-1 read. Its own event type — the rule-vs-human gap
// is the labeled judgment (Polaris frame 4), never folded into another record.
export const OBSERVATION_OVERRIDE_EVENT = "observation_override";

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
  conceptualLevel: number | null; // null = not yet observed on that axis
  proceduralLevel: number | null;
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
  observationLevel: number; // the MACHINE's read — never overwritten
  tutorLevel: number | null; // the tutor's correction, if any
  effectiveLevel: number; // tutorLevel ?? observationLevel — what Stage-2 counts
  overrideReason: string | null;
  overriddenAt: Date | null;
  reasoning: string;
  calibrationFlag: string | null;
  pedagogicalComment: string | null;
  questionId: string | null;
  createdAt: Date;
  // Recall context (collapsed in the UI): the question the student answered and
  // their own answer, so the tutor can judge the read against the raw work. All
  // nullable — teach-back observations have no attempt/question; a photo answer
  // has no answerText (answerPhotoIds instead); a skip has neither.
  questionStem: string | null;
  answerText: string | null;
  answerConfidence: number | null;
  answerPhotoIds: string[];
};

// What a correction returns: the read fields only. The recall context (question +
// student answer) is invariant to a correction, so overrideObservation doesn't
// re-fetch it — the client merges the returned fields onto the existing row.
export type ObservationCorrection = Omit<
  ObservationView,
  "questionStem" | "answerText" | "answerConfidence" | "answerPhotoIds"
>;

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
  // Raw level, with 0 meaning NO EVIDENCE — either no mastery_state row at all
  // (untaught leaf) or a certified row whose axis was never observed (null).
  // Both are gaps that drive authoring, so the weakest-link rollup treats them alike.
  conceptualLevel: number;
  proceduralLevel: number;
  hasMastery: boolean; // false = no mastery_state row yet (untaught leaf)
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
      masteryStateId: masteryState.id, // row presence — levels themselves are nullable
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
      hasMastery: r.masteryStateId !== null,
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

// ── Slice T6: the tutor Pace-Plan view (read-only) ─────────────────────────
// A tutor inspects a linked student's Pace Plan for one subject — the SAME
// derive-at-read view the student sees (pace.getPlan), gated by the tutor↔student
// wall. NO writes: the tutor cannot set up / reorder / mark-complete a plan (v0
// read surface, the D-T-1 read-before-write discipline). `getPlan` is keyed only
// by the target student's ChildSummary, so this is purely the ownership guard +
// a delegate; every derived number (projected dates, pace, preparedness) is still
// recomputed on read from the student's own plan + certified mastery.

/**
 * A linked student's Pace Plan for one subject. Ownership-guarded (foreign
 * student → StudentNotFoundError, the D-L-5 wall) then delegated to pace.getPlan
 * with a ChildSummary built for the target student. `today` is injectable so the
 * probe can pin the clock (mirrors pace.getPlan). Read-only — never writes.
 */
export async function getStudentPacePlan(
  tx: Tx,
  args: { tutorUserId: string; studentId: string; subjectId: string; today?: string },
): Promise<PacePlanView> {
  await assertTutorsStudent(tx, args.tutorUserId, args.studentId);
  const [student] = await tx
    .select({ id: appUser.id, name: appUser.name, email: appUser.email })
    .from(appUser)
    .where(eq(appUser.id, args.studentId))
    .limit(1);
  // The ownership guard already proved the link exists; this is the display name.
  const self: ChildSummary = {
    studentId: args.studentId,
    name: student?.name ?? null,
    email: student?.email ?? "",
  };
  return getPlan(tx, { self, subjectId: args.subjectId, today: args.today });
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
  const rows = await tx
    .select({
      id: observation.id,
      axis: observation.axis,
      observationLevel: observation.observationLevel,
      tutorLevel: observation.tutorLevel,
      overrideReason: observation.overrideReason,
      overriddenAt: observation.overriddenAt,
      reasoning: observation.reasoning,
      calibrationFlag: observation.calibrationFlag,
      pedagogicalComment: observation.pedagogicalComment,
      questionId: observation.questionId,
      createdAt: observation.createdAt,
      // Recall context. LEFT joins — question/attempt are nullable on the row.
      questionStem: question.stem,
      attemptId: observation.attemptId,
      answerText: attempt.answerText,
      answerConfidence: attempt.confidence,
    })
    .from(observation)
    .leftJoin(question, eq(question.id, observation.questionId))
    .leftJoin(attempt, eq(attempt.id, observation.attemptId))
    .where(
      and(
        eq(observation.studentId, args.studentId),
        eq(observation.subTopicId, args.subTopicId),
        eq(observation.source, STAGE1_SOURCE),
      ),
    )
    .orderBy(asc(observation.createdAt));

  // Photo answers: the attempt's images (ordered), fetched in one pass for the
  // attempts that have one. Served to the tutor via the tutor-scoped byte route.
  const attemptIds = rows.map((r) => r.attemptId).filter((x): x is string => !!x);
  const imgRows = attemptIds.length
    ? await tx
        .select({ id: attemptImage.id, attemptId: attemptImage.attemptId })
        .from(attemptImage)
        .where(inArray(attemptImage.attemptId, attemptIds))
        .orderBy(asc(attemptImage.ordinal))
    : [];
  const photosByAttempt = new Map<string, string[]>();
  for (const im of imgRows) {
    const list = photosByAttempt.get(im.attemptId) ?? [];
    list.push(im.id);
    photosByAttempt.set(im.attemptId, list);
  }

  // Surface BOTH numbers + the one that counts, so the tutor always sees what the
  // machine said next to what they changed it to (never a silently-replaced value).
  return rows.map(({ attemptId, ...r }) => ({
    ...r,
    effectiveLevel: r.tutorLevel ?? r.observationLevel,
    answerPhotoIds: attemptId ? photosByAttempt.get(attemptId) ?? [] : [],
  }));
}

export type AssignQuestionView = {
  id: string;
  stem: string;
  axis: string;
  pedagogicalNote: string | null; // the authoring "why" — tutor-facing, never shipped to students
};

/**
 * The approved canonical questions for a sub_topic, for the tutor's Assign
 * preview: what the student would get, plus each question's authoring intent
 * (`pedagogical_note`). Canonical bank only (target_student_id NULL — private
 * per-student questions aren't part of the shared assignment) + approved, in the
 * same ordinal order startSession freezes. Board content, so no per-student
 * ownership check — tutorProcedure already gates authed + board + role; RLS scopes
 * the board. `pedagogical_note` is internal-to-students but tutor-facing here.
 */
export async function getSubTopicQuestions(
  tx: Tx,
  args: { subTopicId: string },
): Promise<AssignQuestionView[]> {
  return tx
    .select({
      id: question.id,
      stem: question.stem,
      axis: question.axis,
      pedagogicalNote: question.pedagogicalNote,
    })
    .from(question)
    .where(
      and(
        eq(question.subTopicId, args.subTopicId),
        eq(question.status, "approved"),
        isNull(question.targetStudentId),
      ),
    )
    .orderBy(asc(question.ordinal), asc(question.createdAt));
}

export type CrossConceptFlagView = {
  id: string;
  note: string;
  fromSubTopicId: string;
  fromSubTopicName: string; // where the student was working when the OTHER skill broke
  addressedAt: Date | null;
  createdAt: Date;
};

/**
 * ASSESS-FIX-4 — the student's OPEN cross-concept flags.
 *
 * "Ran the trigonometry correctly but couldn't rationalise the denominator." Per
 * assessment.md §2 (procedural Step 4) that slip must NOT lower the rung of the
 * sub-topic being assessed — so it leaves as its own signal, or it is lost. These
 * are NOT scored observations (they carry no rung and count toward no level); they
 * are a worklist for the human: a weak prerequisite showing up in someone else's work.
 */
export async function getCrossConceptFlags(
  tx: Tx,
  args: { tutorUserId: string; studentId: string; includeAddressed?: boolean },
): Promise<CrossConceptFlagView[]> {
  await assertTutorsStudent(tx, args.tutorUserId, args.studentId);
  const where = [eq(crossConceptFlag.studentId, args.studentId)];
  if (!args.includeAddressed) where.push(isNull(crossConceptFlag.addressedAt));
  return tx
    .select({
      id: crossConceptFlag.id,
      note: crossConceptFlag.note,
      fromSubTopicId: crossConceptFlag.fromSubTopicId,
      fromSubTopicName: subTopic.name,
      addressedAt: crossConceptFlag.addressedAt,
      createdAt: crossConceptFlag.createdAt,
    })
    .from(crossConceptFlag)
    .innerJoin(subTopic, eq(subTopic.id, crossConceptFlag.fromSubTopicId))
    .where(and(...where))
    .orderBy(asc(crossConceptFlag.createdAt));
}

/** Raised when the flag isn't this student's / this board's. */
export class FlagNotFoundError extends Error {
  code = "FLAG_NOT_FOUND";
  constructor(id: string) {
    super(`cross-concept flag ${id} not found`);
    this.name = "FlagNotFoundError";
  }
}

/** Close (or re-open) a cross-concept flag once the tutor has acted on it. */
export async function setCrossConceptFlagAddressed(
  tx: Tx,
  args: { tutorUserId: string; flagId: string; addressed: boolean },
): Promise<CrossConceptFlagView> {
  const [flag] = await tx
    .select()
    .from(crossConceptFlag)
    .where(eq(crossConceptFlag.id, args.flagId));
  if (!flag) throw new FlagNotFoundError(args.flagId);
  await assertTutorsStudent(tx, args.tutorUserId, flag.studentId);

  await tx
    .update(crossConceptFlag)
    .set({
      addressedAt: args.addressed ? new Date() : null,
      addressedBy: args.addressed ? args.tutorUserId : null,
    })
    .where(eq(crossConceptFlag.id, args.flagId));

  const [view] = await getCrossConceptFlags(tx, {
    tutorUserId: args.tutorUserId,
    studentId: flag.studentId,
    includeAddressed: true,
  }).then((all) => all.filter((f) => f.id === args.flagId));
  return view!;
}

/** Raised when the observation isn't this student's / this board's. */
export class ObservationNotFoundError extends Error {
  code = "OBSERVATION_NOT_FOUND";
  constructor(id: string) {
    super(`observation ${id} not found`);
    this.name = "ObservationNotFoundError";
  }
}

/**
 * Correct a Stage-1 observation (assessment.md §6 — "adjust an observation level
 * … with a reason"). Observations are the DURABLE evidence: every future Stage-2
 * recounts qualifying observations from them, so an uncorrectable Stage-1 misread
 * keeps corrupting counts long after the tutor spotted it.
 *
 * LAYERED, never destructive: `observation_level` (the machine's read) is left
 * exactly as Stage-1 wrote it and `tutor_level` carries the correction. The pair —
 * what the AI said, what the human said, and why — is the labeled judgment the
 * data engine collects (Polaris frame 4). Passing level=null CLEARS the override
 * and reverts to the machine's read.
 *
 * Ownership-guarded like every tutor write; the correction is also logged to
 * event_log as its own `observation_override` event (never folded into anything).
 */
export async function overrideObservation(
  tx: Tx,
  args: {
    boardId: string;
    tutorUserId: string;
    observationId: string;
    level: number | null; // null = clear the override, revert to the machine read
    reason: string | null;
  },
): Promise<ObservationCorrection> {
  const [obs] = await tx
    .select()
    .from(observation)
    .where(eq(observation.id, args.observationId));
  if (!obs) throw new ObservationNotFoundError(args.observationId);
  // The observation names its student — assert the caller tutors them (a tutor
  // sharing a board with another tutor's students must not reach this).
  await assertTutorsStudent(tx, args.tutorUserId, obs.studentId);

  const now = new Date();
  const clearing = args.level == null;
  const [updated] = await tx
    .update(observation)
    .set({
      tutorLevel: args.level,
      overrideReason: clearing ? null : args.reason,
      overriddenBy: clearing ? null : args.tutorUserId,
      overriddenAt: clearing ? null : now,
    })
    .where(eq(observation.id, args.observationId))
    .returning();

  await tx.insert(eventLog).values({
    boardId: args.boardId,
    eventType: OBSERVATION_OVERRIDE_EVENT,
    studentId: obs.studentId,
    tutorId: args.tutorUserId,
    subTopicId: obs.subTopicId,
    // `before` is the level that WAS counting; `after` is what will count now.
    before: {
      machineLevel: obs.observationLevel,
      effectiveLevel: obs.tutorLevel ?? obs.observationLevel,
    },
    after: {
      machineLevel: obs.observationLevel, // unchanged — the machine's read is immutable
      effectiveLevel: args.level ?? obs.observationLevel,
    },
    reason: clearing ? "tutor cleared the observation override" : args.reason,
    payload: {
      observationId: args.observationId,
      axis: obs.axis,
      cleared: clearing,
      machineReasoning: obs.reasoning, // the read the tutor disagreed with
    },
  });

  const u = updated!;
  return {
    id: u.id,
    axis: u.axis,
    observationLevel: u.observationLevel,
    tutorLevel: u.tutorLevel,
    effectiveLevel: u.tutorLevel ?? u.observationLevel,
    overrideReason: u.overrideReason,
    overriddenAt: u.overriddenAt,
    reasoning: u.reasoning,
    calibrationFlag: u.calibrationFlag,
    pedagogicalComment: u.pedagogicalComment,
    questionId: u.questionId,
    createdAt: u.createdAt,
  };
}
