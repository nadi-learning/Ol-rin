/**
 * Assignment (Slice ASG) — the compose→assign action that gives the spiral
 * due-queue (Slice SCH) a consumer (D-SCH-2's deferred half). ONE flow, two
 * configs (intent §5):
 *   - 'blocked'     — tutor picks sub_topics within ONE chapter.
 *   - 'interleaved' — system pre-fills from the due-queue's eligible set across a
 *                     SUBJECT (cross-chapter); the tutor edits before assigning.
 * Everything downstream is identical: the student executes the frozen
 * composition through the existing practice stepper, attempts persist, Stage-1
 * scores them — one evidence→mastery loop, two ways to feed it (intent §4).
 *
 * Option A (the chosen fork): `assignment` is the tutor's compose-unit holding a
 * FROZEN sub_topic_ids[] (pin-not-copy, D-L-1 discipline); EXECUTION is per
 * sub_topic — each sub_topic the student works becomes a practice_session
 * carrying assignment_id (see practice.startSession). So attempt→question→
 * sub_topic keeps per-sub_topic evidence clean for Stage-1/mastery.
 *
 * Access: tutor side reuses the tutor surface's role gate + assertTutorsStudent
 * ownership wall (RLS scopes by board, not user). Student side asserts the
 * assignment is the caller's. Runs inside the board-scoped tx.
 *
 * This REVERSES D-L-2 (practice was self-serve only): a tutor-assigned path now
 * exists (D-ASG-1). Self-serve is unchanged and still works.
 */
import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";
import type { PgTransaction } from "drizzle-orm/pg-core";
import {
  appUser,
  assignment,
  chapter,
  practiceSession,
  question,
  subTopic,
  subject,
  topic,
} from "@b2c/kernel/schema";
import { assertTutorsStudent } from "./tutor";

type Tx = PgTransaction<any, any, any>;

export class InvalidAssignmentError extends Error {
  readonly code = "INVALID_ASSIGNMENT";
  constructor(reason: string) {
    super(`invalid assignment: ${reason}`);
    this.name = "InvalidAssignmentError";
  }
}

export class AssignmentNotFoundError extends Error {
  readonly code = "ASSIGNMENT_NOT_FOUND";
  constructor(assignmentId: string) {
    super(`no assignment ${assignmentId} for this user`);
    this.name = "AssignmentNotFoundError";
  }
}

export type AssignmentMode = "blocked" | "interleaved";

export type SubTopicProgress = {
  subTopicId: string;
  subTopicName: string;
  chapterName: string;
  /** 'not_started' until the student opens it; then the practice_session status. */
  sessionStatus: "not_started" | "active" | "completed";
  /** How far into the frozen set the student has actually got (answered/skipped
   *  count). 0 = opened but nothing done yet — the FE reads this to show 'start →'
   *  instead of a misleading 'continue →' for an untouched active session. */
  currentIndex: number;
};

export type AssignmentView = {
  id: string;
  mode: AssignmentMode;
  status: string; // stored ('assigned'); display truth is `completed` below
  subjectName: string | null;
  chapterName: string | null;
  createdAt: Date;
  subTopics: SubTopicProgress[]; // in the frozen composition order
  total: number;
  completedCount: number;
  completed: boolean; // derived: every sub_topic has a completed session (D-ASG-3)
};

/** sub_topic rows for a set of ids, with their chapter + subject (RLS-scoped). */
async function resolveSubTopics(tx: Tx, ids: string[]) {
  return tx
    .select({
      subTopicId: subTopic.id,
      subTopicName: subTopic.name,
      chapterId: chapter.id,
      chapterName: chapter.name,
      subjectId: subject.id,
      subjectName: subject.name,
    })
    .from(subTopic)
    .innerJoin(topic, eq(topic.id, subTopic.topicId))
    .innerJoin(chapter, eq(chapter.id, topic.chapterId))
    .innerJoin(subject, eq(subject.id, chapter.subjectId))
    .where(inArray(subTopic.id, ids));
}

/**
 * Compose + persist an assignment (one flow, two configs). Validates: ownership,
 * mode, a non-empty composition, every sub_topic visible under the board, and
 * the scope rule — blocked = all in one chapter; interleaved = all in one
 * subject. The sub_topic_ids[] is frozen in the order given (the tutor's edited
 * composition). Returns the created assignment view.
 */
export async function createAssignment(
  tx: Tx,
  args: {
    boardId: string;
    tutorUserId: string;
    studentId: string;
    mode: AssignmentMode;
    subTopicIds: string[];
    subjectId?: string | null;
    chapterId?: string | null;
  },
): Promise<AssignmentView> {
  await assertTutorsStudent(tx, args.tutorUserId, args.studentId);

  // dedupe while preserving order (the composition order is meaningful).
  const seen = new Set<string>();
  const ids = args.subTopicIds.filter((x) => !seen.has(x) && seen.add(x));
  if (ids.length === 0) {
    throw new InvalidAssignmentError("no sub_topics in the composition");
  }

  const rows = await resolveSubTopics(tx, ids);
  if (rows.length !== ids.length) {
    // some id didn't resolve under the board → invalid / cross-board.
    throw new InvalidAssignmentError("a sub_topic is not visible under the board");
  }
  const byId = new Map(rows.map((r) => [r.subTopicId, r]));

  let subjectId: string | null = null;
  let chapterId: string | null = null;
  if (args.mode === "blocked") {
    // all sub_topics must share one chapter (intent §5 — blocked is in-chapter).
    const chapters = new Set(rows.map((r) => r.chapterId));
    if (chapters.size !== 1) {
      throw new InvalidAssignmentError("blocked: sub_topics span multiple chapters");
    }
    chapterId = rows[0]!.chapterId;
    if (args.chapterId && args.chapterId !== chapterId) {
      throw new InvalidAssignmentError("blocked: chapterId does not match the sub_topics");
    }
  } else if (args.mode === "interleaved") {
    // all sub_topics must share one subject (intent §5/§6 — interleaved scope = subject).
    const subjects = new Set(rows.map((r) => r.subjectId));
    if (subjects.size !== 1) {
      throw new InvalidAssignmentError("interleaved: sub_topics span multiple subjects");
    }
    subjectId = rows[0]!.subjectId;
    if (args.subjectId && args.subjectId !== subjectId) {
      throw new InvalidAssignmentError("interleaved: subjectId does not match the sub_topics");
    }
  } else {
    throw new InvalidAssignmentError(`unknown mode '${args.mode}'`);
  }

  const [created] = await tx
    .insert(assignment)
    .values({
      boardId: args.boardId,
      tutorId: args.tutorUserId,
      studentId: args.studentId,
      mode: args.mode,
      subjectId,
      chapterId,
      subTopicIds: ids,
      status: "assigned",
    })
    .returning();

  return buildView(tx, created!, ids, byId);
}

/**
 * Auto-assign on approve (Slice ASG-AUTO) — when the tutor approves authored
 * drafts with the "assign" toggle on, push those questions' sub_topics to the
 * student as an assignment. Two founder-locked rules:
 *
 *  - FIND-AND-EXTEND (not duplicate): if an OPEN assignment (one that isn't yet
 *    fully completed — completion is derived, the stored status is always
 *    'assigned') for the same student + mode + scope anchor already exists,
 *    extend its frozen composition with any NEW sub_topics instead of creating a
 *    second card. A fully-completed assignment is left finished — a fresh one is
 *    created so old work isn't resurrected. When the approved questions all fall
 *    under a sub_topic already in the assignment, there's nothing to write: the
 *    new questions just join that sub_topic's live pool (practice reads current
 *    approved questions, not a frozen question list).
 *
 *  - SPLIT PER SCOPE: a batch spanning multiple chapters (blocked) or subjects
 *    (interleaved) fans into ONE assignment per chapter / subject — never an
 *    invalid cross-scope composition (createAssignment would reject it).
 *
 * studentId is derived from the questions' target_student_id (authored drafts are
 * student-private), so a mixed-student batch is not auto-assigned (returns []).
 * Runs in the caller's board-scoped tx — atomic with the approve. Returns the
 * affected assignment views (created or extended).
 */
export async function assignApprovedQuestions(
  tx: Tx,
  args: {
    boardId: string;
    tutorUserId: string;
    mode: AssignmentMode;
    questionIds: string[];
  },
): Promise<AssignmentView[]> {
  if (args.questionIds.length === 0) return [];

  const qrows = await tx
    .select({ subTopicId: question.subTopicId, targetStudentId: question.targetStudentId })
    .from(question)
    .where(inArray(question.id, args.questionIds));

  // Auto-assign is a single-student push (authored drafts are private). A batch
  // that somehow targets 0 or >1 students is not auto-assigned.
  const studentIds = [...new Set(qrows.map((r) => r.targetStudentId).filter((x): x is string => !!x))];
  if (studentIds.length !== 1) return [];
  const studentId = studentIds[0]!;
  await assertTutorsStudent(tx, args.tutorUserId, studentId);

  const subTopicIds = [...new Set(qrows.map((r) => r.subTopicId))];
  const resolved = await resolveSubTopics(tx, subTopicIds);
  const byId = new Map(resolved.map((r) => [r.subTopicId, r]));

  // Group sub_topics by the mode's scope anchor (chapter=blocked, subject=interleaved).
  const groups = new Map<string, string[]>(); // anchorId → ordered sub_topic ids
  for (const stId of subTopicIds) {
    const r = byId.get(stId);
    if (!r) continue; // unresolved (deleted/cross-board) — skip
    const anchor = args.mode === "blocked" ? r.chapterId : r.subjectId;
    const list = groups.get(anchor) ?? [];
    list.push(stId);
    groups.set(anchor, list);
  }

  const anchorCol = args.mode === "blocked" ? assignment.chapterId : assignment.subjectId;
  const views: AssignmentView[] = [];
  for (const [anchorId, groupSubTopics] of groups) {
    // Existing assignments for this exact scope, newest first.
    const candidates = await tx
      .select()
      .from(assignment)
      .where(
        and(
          eq(assignment.tutorId, args.tutorUserId),
          eq(assignment.studentId, studentId),
          eq(assignment.mode, args.mode),
          eq(anchorCol, anchorId),
        ),
      )
      .orderBy(desc(assignment.createdAt));

    // Reuse the newest OPEN (not-derived-completed) one; skip finished assignments.
    let target: typeof assignment.$inferSelect | null = null;
    for (const row of candidates) {
      const [view] = await buildViews(tx, [row]);
      if (view && !view.completed) {
        target = row;
        break;
      }
    }

    if (target) {
      const existing = new Set(target.subTopicIds);
      const additions = groupSubTopics.filter((id) => !existing.has(id));
      const row =
        additions.length === 0
          ? target // nothing new — the questions join the live pool; no write
          : (
              await tx
                .update(assignment)
                .set({ subTopicIds: [...target.subTopicIds, ...additions] })
                .where(eq(assignment.id, target.id))
                .returning()
            )[0]!;
      const [v] = await buildViews(tx, [row]);
      if (v) views.push(v);
    } else {
      // No open assignment for this scope → create one (createAssignment validates
      // the scope rule, which holds by construction — we grouped by anchor).
      const view = await createAssignment(tx, {
        boardId: args.boardId,
        tutorUserId: args.tutorUserId,
        studentId,
        mode: args.mode,
        subTopicIds: groupSubTopics,
        chapterId: args.mode === "blocked" ? anchorId : null,
        subjectId: args.mode === "interleaved" ? anchorId : null,
      });
      views.push(view);
    }
  }
  return views;
}

type SessionProgress = { status: "active" | "completed"; currentIndex: number };

/** Per-sub_topic session status + progress for one assignment + one student. */
async function sessionStatusFor(
  tx: Tx,
  assignmentId: string,
  studentId: string,
): Promise<Map<string, SessionProgress>> {
  const sessions = await tx
    .select({
      subTopicId: practiceSession.subTopicId,
      status: practiceSession.status,
      currentIndex: practiceSession.currentIndex,
    })
    .from(practiceSession)
    .where(
      and(
        eq(practiceSession.assignmentId, assignmentId),
        eq(practiceSession.appUserId, studentId),
      ),
    );
  const m = new Map<string, SessionProgress>();
  for (const s of sessions) {
    const st = s.status as "active" | "completed";
    const prev = m.get(s.subTopicId);
    // a completed session wins over an active one for the same sub_topic.
    if (prev?.status === "completed") continue;
    if (st === "completed") {
      m.set(s.subTopicId, { status: "completed", currentIndex: s.currentIndex });
      continue;
    }
    // among active sessions, keep the one with the most progress (that's what
    // 'continue' would resume) so the label reflects real work, not a stray idx=0.
    if (!prev || s.currentIndex > prev.currentIndex) {
      m.set(s.subTopicId, { status: "active", currentIndex: s.currentIndex });
    }
  }
  return m;
}

/** Assemble an AssignmentView from a row + its resolved sub_topics + sessions. */
async function buildView(
  tx: Tx,
  row: typeof assignment.$inferSelect,
  ids: string[],
  byId: Map<string, Awaited<ReturnType<typeof resolveSubTopics>>[number]>,
): Promise<AssignmentView> {
  const sessions = await sessionStatusFor(tx, row.id, row.studentId);
  const subTopics: SubTopicProgress[] = ids.map((id) => {
    const r = byId.get(id)!;
    const s = sessions.get(id);
    return {
      subTopicId: id,
      subTopicName: r.subTopicName,
      chapterName: r.chapterName,
      sessionStatus: s?.status ?? "not_started",
      currentIndex: s?.currentIndex ?? 0,
    };
  });
  const completedCount = subTopics.filter((s) => s.sessionStatus === "completed").length;
  const first = byId.get(ids[0]!)!;
  return {
    id: row.id,
    mode: row.mode as AssignmentMode,
    status: row.status,
    subjectName: row.subjectId ? first.subjectName : null,
    chapterName: row.chapterId ? first.chapterName : null,
    createdAt: row.createdAt,
    subTopics,
    total: ids.length,
    completedCount,
    completed: completedCount === ids.length,
  };
}

/** Shared: build views for a set of assignment rows (resolves names + progress). */
async function buildViews(
  tx: Tx,
  rows: (typeof assignment.$inferSelect)[],
): Promise<AssignmentView[]> {
  if (rows.length === 0) return [];
  const allIds = [...new Set(rows.flatMap((r) => r.subTopicIds))];
  const resolved = await resolveSubTopics(tx, allIds);
  const byId = new Map(resolved.map((r) => [r.subTopicId, r]));
  const views: AssignmentView[] = [];
  for (const row of rows) {
    // a row may reference a sub_topic that didn't resolve (deleted); skip those ids.
    const ids = row.subTopicIds.filter((id) => byId.has(id));
    if (ids.length === 0) continue;
    views.push(await buildView(tx, row, ids, byId));
  }
  return views;
}

/** Tutor read-back: assignments this tutor created for this student (newest UI
 *  sort done by the caller-order; here newest-first by createdAt). */
export async function listAssignmentsForTutor(
  tx: Tx,
  args: { tutorUserId: string; studentId: string },
): Promise<AssignmentView[]> {
  await assertTutorsStudent(tx, args.tutorUserId, args.studentId);
  const rows = await tx
    .select()
    .from(assignment)
    .where(
      and(
        eq(assignment.tutorId, args.tutorUserId),
        eq(assignment.studentId, args.studentId),
      ),
    )
    .orderBy(asc(assignment.createdAt));
  return buildViews(tx, rows);
}

/** Student side: the work assigned to me (D-ASG-1 — reverses D-L-2 self-serve-
 *  only). Returns each assignment with per-sub_topic start/complete status so the
 *  FE can open each via the existing stepper. */
export async function listAssignmentsForStudent(
  tx: Tx,
  args: { appUserId: string },
): Promise<AssignmentView[]> {
  const rows = await tx
    .select()
    .from(assignment)
    .where(eq(assignment.studentId, args.appUserId))
    .orderBy(asc(assignment.createdAt));
  return buildViews(tx, rows);
}

/**
 * Ownership + membership guard for the student starting an assigned sub_topic:
 * the assignment must be the caller's AND the sub_topic must be in its frozen
 * composition. A foreign / unknown assignment is ASSIGNMENT_NOT_FOUND (no leak).
 * Reused by practice.startSession when an assignmentId is supplied.
 */
export async function assertAssignedSubTopic(
  tx: Tx,
  args: { assignmentId: string; appUserId: string; subTopicId: string },
): Promise<void> {
  const [row] = await tx
    .select({ studentId: assignment.studentId, subTopicIds: assignment.subTopicIds })
    .from(assignment)
    .where(eq(assignment.id, args.assignmentId))
    .limit(1);
  // RLS scopes the board; the student check stops cross-student access.
  if (!row || row.studentId !== args.appUserId) {
    throw new AssignmentNotFoundError(args.assignmentId);
  }
  if (!row.subTopicIds.includes(args.subTopicId)) {
    throw new InvalidAssignmentError("sub_topic is not part of this assignment");
  }
}
