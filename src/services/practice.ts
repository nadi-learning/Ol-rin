/**
 * Practice capture (Slice L) — the first leaf-pass path. NO AI, NO mastery, NO
 * tutor. A student starts an assigned set of SUBJECTIVE questions on a sub_topic,
 * answers each (text + confidence + timing), and every attempt PERSISTS. This is
 * exactly what unblocks attempt persistence (D-A-1) and feeds Stage-1 next slice
 * (which reads `attempt` blind → writes `observation`).
 *
 * The load-bearing rule (M11, the MCQ-key discipline applied to subjective):
 * a question's reference_answer / explanation / pedagogical_note are SERVER-SIDE.
 *  - on READ (start/get) the question is ALLOWLIST-projected (id/axis/kind/stem/
 *    ordinal) + zod-guarded → no key can ride along.
 *  - the reference answer + explanation are revealed ONLY in the submit/skip
 *    response (D-L-3: post-submit self-study reveal, no grade, no mastery).
 *
 * Runs inside the board-scoped tx (protectedProcedure → withBoard): every read is
 * RLS-gated to the board. RLS does NOT scope by user, so each call also asserts
 * the session belongs to the caller (two students share a board) — a foreign
 * session is reported as NOT_FOUND (no existence leak).
 *
 * Forks (decisions.md D-L-1..4): D-L-1 fork-on-start v0 = freeze canonical
 * question ids (pin-not-copy, G6) · D-L-2 self-serve start (no tutor) · D-L-3
 * post-submit reveal · D-L-4 table named practice_session (Better Auth owns
 * `sessions`).
 */
import { and, asc, desc, eq, inArray, isNull, or } from "drizzle-orm";
import type { PgTransaction } from "drizzle-orm/pg-core";
import { z } from "zod";
import { attempt, attemptImage, practiceSession, question } from "@b2c/kernel/schema";
import { enqueueStage1Scoring } from "../worker/queue";
import { assertAssignedSubTopic } from "./assignment";
import { currentImageFor } from "./image_read";
import { consumeUploadToken, type ConsumedPhotos } from "./upload";

type Tx = PgTransaction<any, any, any>;

export class PracticeSessionNotFoundError extends Error {
  readonly code = "PRACTICE_SESSION_NOT_FOUND";
  constructor(sessionId: string) {
    super(`no practice session ${sessionId} for this user`);
    this.name = "PracticeSessionNotFoundError";
  }
}
export class NoQuestionsError extends Error {
  readonly code = "NO_QUESTIONS";
  constructor(subTopicId: string) {
    super(`no practice questions seeded for sub_topic ${subTopicId}`);
    this.name = "NoQuestionsError";
  }
}
export class SessionCompletedError extends Error {
  readonly code = "SESSION_COMPLETED";
  constructor(sessionId: string) {
    super(`practice session ${sessionId} is already completed`);
    this.name = "SessionCompletedError";
  }
}
export class QuestionMismatchError extends Error {
  readonly code = "QUESTION_MISMATCH";
  constructor(questionId: string) {
    super(`question ${questionId} is not the current question in this session`);
    this.name = "QuestionMismatchError";
  }
}

/** Public, key-free question shape sent to the client. */
export const publicQuestionSchema = z.object({
  id: z.string().uuid(),
  axis: z.string(),
  kind: z.string(),
  stem: z.string(),
  ordinal: z.number(),
  // The current rendered figure's image id, for `/content/image/:id?board=` —
  // or null. STUDENT-GATED (D-IMG-13): only a PASS-verified image is exposed to
  // the student; a PENDING/FAIL/ERROR render is withheld (the stem is answerable
  // from text alone, D-IMG-4) so a wrong diagram never misleads. The tutor
  // Saved-questions view (listAuthoredQuestions) shows every render + its badge.
  imageId: z.string().uuid().nullable(),
});
export type PublicQuestion = z.infer<typeof publicQuestionSchema>;

/** The post-submit self-study reveal (D-L-3) — never returned on read. */
export type Reveal = {
  referenceAnswer: string;
  explanation: string | null;
};

export type SessionView = {
  sessionId: string;
  subTopicId: string;
  total: number;
  currentIndex: number;
  status: "active" | "completed";
  question: PublicQuestion | null; // null when completed
};

export type AttemptResult = {
  attemptId: string; // Slice T1 — the FE requests immediate feedback for this id
  reveal: Reveal;
  // Slice UPLOAD-UX — attempt_image ids for a photo answer, in ordinal order.
  // Empty for a typed answer or a skip. The reveal thumbnail loads each via the
  // owner-scoped /practice/answer-photo/:id route.
  photoImageIds: string[];
  currentIndex: number;
  total: number;
  completed: boolean;
  next: PublicQuestion | null;
};

/** Load a question row (RLS-scoped), projected to the public key-free shape. */
async function loadPublicQuestion(
  tx: Tx,
  questionId: string,
): Promise<PublicQuestion | null> {
  const [q] = await tx
    .select({
      id: question.id,
      axis: question.axis,
      kind: question.kind,
      stem: question.stem,
      ordinal: question.ordinal,
    })
    .from(question)
    .where(eq(question.id, questionId))
    .limit(1);
  if (!q) return null;
  // Current figure, STUDENT-GATED to a PASS verdict (D-IMG-13): a PENDING/FAIL/
  // ERROR render is not shown to the student.
  const img = await currentImageFor(tx, questionId);
  const imageId = img && img.verifierLabel === "PASS" ? img.imageId : null;
  // ALLOWLIST + zod guard: reference_answer/explanation/pedagogical_note are
  // never selected, then parse is a second wall so no key can leak.
  return publicQuestionSchema.parse({ ...q, imageId });
}

/** Load the server-side reveal for a question (post-submit only). */
async function loadReveal(tx: Tx, questionId: string): Promise<Reveal> {
  const [q] = await tx
    .select({
      referenceAnswer: question.referenceAnswer,
      explanation: question.explanation,
    })
    .from(question)
    .where(eq(question.id, questionId))
    .limit(1);
  return {
    referenceAnswer: q?.referenceAnswer ?? "",
    explanation: q?.explanation ?? null,
  };
}

/** Fetch a session owned by the caller, or throw NOT_FOUND (no existence leak). */
async function ownedSession(tx: Tx, sessionId: string, appUserId: string) {
  const [s] = await tx
    .select()
    .from(practiceSession)
    .where(eq(practiceSession.id, sessionId))
    .limit(1);
  // RLS already scopes to the board; the user check stops cross-student access.
  if (!s || s.appUserId !== appUserId) {
    throw new PracticeSessionNotFoundError(sessionId);
  }
  return s;
}

function viewOf(s: typeof practiceSession.$inferSelect, q: PublicQuestion | null): SessionView {
  return {
    sessionId: s.id,
    subTopicId: s.subTopicId,
    total: s.questionIds.length,
    currentIndex: s.currentIndex,
    status: s.status as "active" | "completed",
    question: s.status === "completed" ? null : q,
  };
}

/**
 * Start (or resume) a practice session on a sub_topic. Freezes the sub_topic's
 * seeded questions (ordinal order) into question_ids[] (D-L-1). Idempotent-ish:
 * if the caller already has an ACTIVE session for this (sub_topic, assignment),
 * returns it rather than spawning a parallel one.
 *
 * Two origins (Slice ASG): self-serve (assignmentId null, D-L-2) and
 * tutor-assigned (assignmentId set, origin='tutor_assigned', D-ASG-1). When an
 * assignment is supplied it must be the caller's and contain the sub_topic
 * (assertAssignedSubTopic) — else ASSIGNMENT_NOT_FOUND. A self-serve and an
 * assigned session for the same sub_topic stay DISTINCT (resume matches on the
 * assignment link), so they never cross-link.
 */
export async function startSession(
  tx: Tx,
  args: {
    boardId: string;
    appUserId: string;
    subTopicId: string;
    assignmentId?: string | null;
  },
): Promise<SessionView> {
  const assignmentId = args.assignmentId ?? null;
  if (assignmentId) {
    await assertAssignedSubTopic(tx, {
      assignmentId,
      appUserId: args.appUserId,
      subTopicId: args.subTopicId,
    });
  }

  // resume an existing active session for this (user, sub_topic, assignment)
  const [existing] = await tx
    .select()
    .from(practiceSession)
    .where(
      and(
        eq(practiceSession.appUserId, args.appUserId),
        eq(practiceSession.subTopicId, args.subTopicId),
        eq(practiceSession.status, "active"),
        assignmentId
          ? eq(practiceSession.assignmentId, assignmentId)
          : isNull(practiceSession.assignmentId),
      ),
    )
    .limit(1);
  if (existing) {
    const q = await loadPublicQuestion(
      tx,
      existing.questionIds[existing.currentIndex]!,
    );
    return viewOf(existing, q);
  }

  // Private-aware delivery (Slice AUTH-v2): serve the canonical bank
  // (target_student_id NULL) PLUS this caller's own targeted questions. A
  // question authored privately for another student is invisible here. Canonical
  // rows are unaffected → the shared bank stays fault-isolated.
  const qs = await tx
    .select({ id: question.id })
    .from(question)
    .where(
      and(
        eq(question.subTopicId, args.subTopicId),
        eq(question.status, "approved"), // FIG-AUTH (M11 CHECK side): drafts never served
        or(
          isNull(question.targetStudentId),
          eq(question.targetStudentId, args.appUserId),
        ),
      ),
    )
    .orderBy(asc(question.ordinal), asc(question.createdAt));
  if (qs.length === 0) throw new NoQuestionsError(args.subTopicId);

  const [created] = await tx
    .insert(practiceSession)
    .values({
      boardId: args.boardId,
      appUserId: args.appUserId,
      subTopicId: args.subTopicId,
      questionIds: qs.map((q) => q.id),
      currentIndex: 0,
      status: "active",
      origin: assignmentId ? "tutor_assigned" : "self_serve",
      assignmentId,
    })
    .returning();
  const first = await loadPublicQuestion(tx, created!.questionIds[0]!);
  return viewOf(created!, first);
}

/** Read the current state of an owned session (projected question, no key). */
export async function getSession(
  tx: Tx,
  args: { sessionId: string; appUserId: string },
): Promise<SessionView> {
  const s = await ownedSession(tx, args.sessionId, args.appUserId);
  const q =
    s.status === "completed"
      ? null
      : await loadPublicQuestion(tx, s.questionIds[s.currentIndex]!);
  return viewOf(s, q);
}

/** One question in a read-only review of a completed session: the projected
 *  question, the student's own answer (text / photo / skip), and the reveal. */
export type ReviewItem = {
  question: PublicQuestion;
  answerText: string | null;
  confidence: number | null;
  skipped: boolean;
  wasPhoto: boolean;
  // Slice UPLOAD-UX — attempt_image ids (ordinal order) for a photo answer, so
  // the review persists the same thumbnail the reveal showed. Empty otherwise.
  photoImageIds: string[];
  reveal: Reveal;
};

export type ReviewView = {
  sessionId: string;
  subTopicId: string;
  total: number;
  items: ReviewItem[]; // in the frozen question_ids order
};

export class NoCompletedSessionError extends Error {
  readonly code = "NO_COMPLETED_SESSION";
  constructor(subTopicId: string) {
    super(`no completed practice session for sub_topic ${subTopicId}`);
    this.name = "NoCompletedSessionError";
  }
}

/**
 * Read-only review of a COMPLETED session (the "✓ done" tile). Returns every
 * question in composition order with the student's own answer + the reveal —
 * NO writes, and crucially NEVER creates a fresh session (unlike startSession,
 * whose resume branch only matches `active`, so a click on a done sub_topic
 * would otherwise spawn a new attempt at index 0). Ownership is enforced by the
 * appUserId filter on top of RLS; a self-serve vs assigned copy stays distinct
 * (assignmentId match), same as startSession's resume.
 */
export async function reviewSession(
  tx: Tx,
  args: { appUserId: string; subTopicId: string; assignmentId?: string | null },
): Promise<ReviewView> {
  const assignmentId = args.assignmentId ?? null;
  const [s] = await tx
    .select()
    .from(practiceSession)
    .where(
      and(
        eq(practiceSession.appUserId, args.appUserId),
        eq(practiceSession.subTopicId, args.subTopicId),
        eq(practiceSession.status, "completed"),
        assignmentId
          ? eq(practiceSession.assignmentId, assignmentId)
          : isNull(practiceSession.assignmentId),
      ),
    )
    .orderBy(desc(practiceSession.createdAt))
    .limit(1);
  if (!s) throw new NoCompletedSessionError(args.subTopicId);

  // One attempt per question per session; if a question somehow has more than
  // one, the latest submit wins (asc order → last overwrite).
  const rows = await tx
    .select({
      attemptId: attempt.id,
      questionId: attempt.questionId,
      answerText: attempt.answerText,
      confidence: attempt.confidence,
      skipReason: attempt.skipReason,
    })
    .from(attempt)
    .where(eq(attempt.practiceSessionId, s.id))
    .orderBy(asc(attempt.submittedAt));
  const byQ = new Map<string, (typeof rows)[number]>();
  for (const r of rows) byQ.set(r.questionId, r);

  // Slice UPLOAD-UX — the attempt_image ids for every attempt in this session,
  // grouped by attempt (ordinal order) so a photo item can render its thumbnail.
  const attemptIds = rows.map((r) => r.attemptId);
  const photosByAttempt = new Map<string, string[]>();
  if (attemptIds.length > 0) {
    const imgs = await tx
      .select({
        id: attemptImage.id,
        attemptId: attemptImage.attemptId,
        ordinal: attemptImage.ordinal,
      })
      .from(attemptImage)
      .where(inArray(attemptImage.attemptId, attemptIds))
      .orderBy(asc(attemptImage.ordinal));
    for (const im of imgs) {
      const arr = photosByAttempt.get(im.attemptId) ?? [];
      arr.push(im.id);
      photosByAttempt.set(im.attemptId, arr);
    }
  }

  const items: ReviewItem[] = [];
  for (const qid of s.questionIds) {
    const q = await loadPublicQuestion(tx, qid);
    if (!q) continue; // a deleted question drops out of the review, not crashes it
    const reveal = await loadReveal(tx, qid);
    const a = byQ.get(qid);
    items.push({
      question: q,
      answerText: a?.answerText ?? null,
      confidence: a?.confidence ?? null,
      skipped: !!a?.skipReason,
      // photo answer (Q3): answer_text null AND not a skip → the answer was photos.
      wasPhoto: !!a && a.answerText == null && a.skipReason == null,
      photoImageIds: a ? (photosByAttempt.get(a.attemptId) ?? []) : [],
      reveal,
    });
  }
  return {
    sessionId: s.id,
    subTopicId: s.subTopicId,
    total: s.questionIds.length,
    items,
  };
}

/** Shared advance: persist the attempt row (+ any answer photos), bump index,
 *  flip to completed, and return the reveal + the next projected question. */
async function recordAndAdvance(
  tx: Tx,
  s: typeof practiceSession.$inferSelect,
  row: typeof attempt.$inferInsert,
  photos: ConsumedPhotos[] = [],
): Promise<AttemptResult> {
  const [inserted] = await tx
    .insert(attempt)
    .values(row)
    .returning({ id: attempt.id });

  // A photo answer (Slice Q3): persist one attempt_image row per uploaded photo,
  // linked to the attempt. Bytes already live in object storage; these rows are
  // the durable evidence link Stage-1 vision reads (Q3-2).
  const photoImageIds: string[] = [];
  if (inserted && photos.length > 0) {
    const rows = await tx
      .insert(attemptImage)
      .values(
        photos.map((p, i) => ({
          boardId: row.boardId,
          attemptId: inserted.id,
          storageKey: p.storageKey,
          mime: p.mime,
          ordinal: i,
        })),
      )
      .returning({ id: attemptImage.id, ordinal: attemptImage.ordinal });
    for (const r of rows.sort((a, b) => a.ordinal - b.ordinal)) photoImageIds.push(r.id);
  }

  // Stage-1 scoring trigger (Slice AI-1, widened by Q3-2). A TEXT answer OR a
  // PHOTO answer (answer_text null but attempt_image rows present) both get
  // scored — Stage-1 vision reads the photos exactly as it reads text (Q3-2). A
  // skip carries neither and is never scored. Best-effort + fault-isolated
  // (enqueueStage1Scoring swallows its own errors): a queue/Redis failure here
  // must never break the submit.
  if (inserted && (row.answerText || photos.length > 0) && !row.skipReason) {
    await enqueueStage1Scoring({ attemptId: inserted.id, boardId: row.boardId });
  }

  const total = s.questionIds.length;
  const nextIndex = s.currentIndex + 1;
  const completed = nextIndex >= total;
  await tx
    .update(practiceSession)
    .set({
      currentIndex: completed ? total : nextIndex,
      status: completed ? "completed" : "active",
    })
    .where(eq(practiceSession.id, s.id));

  const reveal = await loadReveal(tx, row.questionId);
  const next = completed
    ? null
    : await loadPublicQuestion(tx, s.questionIds[nextIndex]!);
  return {
    attemptId: inserted!.id,
    reveal,
    photoImageIds,
    currentIndex: completed ? total : nextIndex,
    total,
    completed,
    next,
  };
}

/** The current question id, with active-session + matching-question guards. */
function assertCurrent(
  s: typeof practiceSession.$inferSelect,
  questionId: string,
): string {
  if (s.status === "completed") throw new SessionCompletedError(s.id);
  const currentId = s.questionIds[s.currentIndex];
  if (!currentId || currentId !== questionId) {
    throw new QuestionMismatchError(questionId);
  }
  return currentId;
}

/**
 * Persist an answer to the current question, advance, and reveal the reference
 * answer for self-study (D-L-3, no grade). The attempt row is the captured
 * evidence Stage-1 will read next slice.
 */
export async function submitAttempt(
  tx: Tx,
  args: {
    boardId: string;
    appUserId: string;
    sessionId: string;
    questionId: string;
    answerText: string;
    confidence: number;
    timeMs: number;
  },
): Promise<AttemptResult> {
  const s = await ownedSession(tx, args.sessionId, args.appUserId);
  const questionId = assertCurrent(s, args.questionId);
  return recordAndAdvance(tx, s, {
    boardId: args.boardId,
    practiceSessionId: s.id,
    questionId,
    appUserId: args.appUserId,
    answerText: args.answerText,
    confidence: args.confidence,
    timeMs: args.timeMs,
    skipReason: null,
  });
}

/**
 * Submit a PHOTO answer to the current question (Slice Q3 — Cross-Device Upload).
 * The student answered on paper and uploaded photos from their phone via an
 * upload token; here (on the authed desktop) we consume that token single-use,
 * persist the attempt with its photos, advance, and reveal the reference answer
 * (D-L-3, no grade). answer_text is null — the answer IS the photos; Stage-1
 * vision reads attempt_image (Q3-2). confidence + timing still ride along (they
 * live on the desktop where the student taps them).
 */
export async function submitPhotoAttempt(
  tx: Tx,
  args: {
    boardId: string;
    appUserId: string;
    sessionId: string;
    questionId: string;
    uploadToken: string;
    confidence: number;
    timeMs: number;
  },
): Promise<AttemptResult> {
  const s = await ownedSession(tx, args.sessionId, args.appUserId);
  const questionId = assertCurrent(s, args.questionId);
  // Consume the token BEFORE writing the attempt: it validates the token matches
  // this (user, session, question) slot + flips it consumed single-use. A stale/
  // foreign/already-used token throws → no attempt is written.
  const photos = await consumeUploadToken(tx, {
    token: args.uploadToken,
    sessionId: args.sessionId,
    questionId,
    appUserId: args.appUserId,
  });
  return recordAndAdvance(
    tx,
    s,
    {
      boardId: args.boardId,
      practiceSessionId: s.id,
      questionId,
      appUserId: args.appUserId,
      answerText: null, // the answer is the photos
      confidence: args.confidence,
      timeMs: args.timeMs,
      skipReason: null,
    },
    photos,
  );
}

/** Skip the current question (captured as an attempt with skip_reason), advance,
 *  and still reveal the reference answer for self-study. */
export async function skip(
  tx: Tx,
  args: {
    boardId: string;
    appUserId: string;
    sessionId: string;
    questionId: string;
    reason: string | null;
  },
): Promise<AttemptResult> {
  const s = await ownedSession(tx, args.sessionId, args.appUserId);
  const questionId = assertCurrent(s, args.questionId);
  return recordAndAdvance(tx, s, {
    boardId: args.boardId,
    practiceSessionId: s.id,
    questionId,
    appUserId: args.appUserId,
    answerText: null,
    confidence: null,
    timeMs: null,
    skipReason: args.reason ?? "skipped",
  });
}
