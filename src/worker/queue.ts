import { Queue } from "bullmq";
import { redisConnection } from "../redis/connection";
// Type-only (erased at compile → no runtime import cycle): the job's result shape
// IS the value the poll hands back.
import type { extractTopicsMd } from "../services/admin_ingest";
import type { authorFromChat, reviseDraft } from "../services/authoring_chat";

type ExtractResult = Awaited<ReturnType<typeof extractTopicsMd>>;
type ReviseResult = Awaited<ReturnType<typeof reviseDraft>>;
type AuthoringResult = Awaited<ReturnType<typeof authorFromChat>>;

/**
 * Shared helper: find the id of an in-flight job (active/queued) whose data
 * matches this (board, question). Used by the tutor UI to RESUME a progress
 * loader across a page refresh / close-reopen — the client keeps no durable
 * handle to the job (the jobId embeds a timestamp / is BullMQ-assigned), so on
 * mount it asks "is work still running for this question?" and re-attaches its
 * poll. Scans only the not-yet-terminal states; completed/failed jobs are read
 * by their own status pollers. Returns null on any Redis error (loader stays off).
 */
async function activeJobIdForQuestion<D extends { boardId: string; questionId: string }>(
  queue: Queue<D>,
  boardId: string,
  questionId: string,
): Promise<string | null> {
  try {
    // Not-yet-terminal states only. At our scale (a handful of concurrent AI
    // jobs) this list is tiny; there is no per-data index in BullMQ to do better.
    const jobs = await queue.getJobs(["active", "waiting", "delayed", "prioritized", "paused"]);
    const match = jobs.find(
      (j) => j?.data?.questionId === questionId && j?.data?.boardId === boardId,
    );
    return match?.id ?? null;
  } catch {
    return null;
  }
}

/**
 * Sibling of activeJobIdForQuestion, keyed by (board, chat) instead of
 * (board, question). Used by the async AUTHORING loader: unlike a revise (which
 * targets an existing draft row), an in-flight author has NO draft yet — the
 * drafts are the job's OUTPUT — so the resume handle is the chat, not a question.
 * Returns null on any Redis error (loader stays off).
 */
async function activeJobIdForChat<D extends { boardId: string; chatId: string }>(
  queue: Queue<D>,
  boardId: string,
  chatId: string,
): Promise<string | null> {
  try {
    const jobs = await queue.getJobs(["active", "waiting", "delayed", "prioritized", "paused"]);
    const match = jobs.find(
      (j) => j?.data?.chatId === chatId && j?.data?.boardId === boardId,
    );
    return match?.id ?? null;
  } catch {
    return null;
  }
}

/**
 * BullMQ wiring.
 *
 * `b2c.assessment` — Stage-1 blind scoring (Slice AI-1). A practice submit
 * enqueues one job per attempt; the worker (src/worker/index.ts) reads the
 * attempt blind and writes observations. The enqueue is BEST-EFFORT and
 * FAULT-ISOLATED: a Redis/queue failure must never break practice submission
 * (the v1 path) — see enqueueStage1Scoring.
 *
 * `b2c.generate_image` — Slice IMG. saveQuestions (v1 + the v2 chat path) enqueues
 * one job per saved question that carries a figure spec (question.image != null);
 * the worker renders it (Gemini script → nadi-pyrender → PNG → question_image).
 * Also BEST-EFFORT / FAULT-ISOLATED — a render is never load-bearing for the save
 * or for the student's practice (see enqueueImageGeneration).
 *
 * `b2c.content` — AIJOB-1: async topics.md extraction. `admin.extractTopicsMd`
 * enqueues one job and returns its id; the worker runs the (150–260s) Gemini
 * extraction OFF the request path and stores the result as the job's return
 * value; `admin.getExtractJob` polls it. This moves the slow call off nginx's
 * 700s wall entirely — the request that enqueues returns in ms.
 */
export const CONTENT_QUEUE = "b2c.content";

export interface ExtractTopicsJobData {
  boardId: string;
  rawMd: string;
}

export const contentQueue = new Queue<ExtractTopicsJobData>(CONTENT_QUEUE, {
  connection: redisConnection,
  defaultJobOptions: {
    // ONE attempt — a full extraction is a paid ~150–260s call; a BullMQ retry
    // would silently re-run it. Surface a failure, don't loop it.
    attempts: 1,
    // Keep results in Redis long enough for the FE to poll them out (age-based,
    // not count — one admin extracting occasionally, not a firehose).
    removeOnComplete: { age: 3_600 },
    removeOnFail: { age: 3_600 },
  },
});

/**
 * Enqueue one topics.md extraction; returns the BullMQ job id the FE polls.
 * NOT best-effort (unlike the fire-and-forget enqueues below): if Redis is down
 * the admin must SEE the failure — there is no job id to poll otherwise — so
 * errors propagate to the caller. BullMQ assigns the id (unique per click; each
 * Extract is a fresh run, never deduped).
 */
export async function enqueueExtractTopics(data: ExtractTopicsJobData): Promise<string> {
  const job = await contentQueue.add("extract-topics-md", data);
  if (!job.id) throw new Error("BullMQ did not assign a job id");
  return job.id;
}

/**
 * Poll state for one extraction job. Mirrors getImageJobState, but carries the
 * RESULT: the extraction's whole point is a value to hand back, stored as the
 * job's return value. `boardId` is checked against the caller's board so one
 * admin can't poll another board's job by id. 'unknown' when the job has aged
 * out of Redis or Redis is unreachable.
 */
export type ExtractJobStatus =
  | { state: "waiting" | "active" | "unknown" }
  | { state: "completed"; result: ExtractResult }
  | { state: "failed"; error: string };

export async function getExtractJobStatus(
  jobId: string,
  boardId: string,
): Promise<ExtractJobStatus> {
  try {
    const job = await contentQueue.getJob(jobId);
    if (!job) return { state: "unknown" };
    // Board isolation: the job carries the board it was enqueued under.
    if (job.data?.boardId && job.data.boardId !== boardId) return { state: "unknown" };
    const state = await job.getState();
    if (state === "completed") {
      return { state: "completed", result: job.returnvalue as ExtractResult };
    }
    if (state === "failed") {
      return { state: "failed", error: job.failedReason ?? "extraction failed" };
    }
    if (state === "active") return { state: "active" };
    // waiting / delayed / prioritized / waiting-children → still queued
    return { state: "waiting" };
  } catch {
    return { state: "unknown" };
  }
}

export const ASSESSMENT_QUEUE = "b2c.assessment";

export interface Stage1JobData {
  attemptId: string;
  boardId: string;
}

export const assessmentQueue = new Queue<Stage1JobData>(ASSESSMENT_QUEUE, {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 5_000 },
    removeOnComplete: 100,
    removeOnFail: 200,
  },
});

/**
 * Fire-and-forget Stage-1 scoring for one attempt. BEST-EFFORT: swallows its own
 * errors (logs them) so a queue/Redis outage can never break the practice submit
 * that called it. The `jobId` makes enqueue idempotent (one job per attempt);
 * the `delay` lets the submit transaction commit before the worker reads the row.
 */
export async function enqueueStage1Scoring(data: Stage1JobData): Promise<void> {
  try {
    await assessmentQueue.add("score", data, {
      // BullMQ custom job ids must not contain ':' — use '-' as the separator.
      jobId: `stage1-${data.attemptId}`,
      delay: 1_500,
    });
  } catch (err) {
    console.error(
      `[assessment] enqueue failed for attempt ${data.attemptId} (non-fatal):`,
      err instanceof Error ? err.message : err,
    );
  }
}

// ───────────────────────── Slice IMG: image render ─────────────────────────

export const GENERATE_IMAGE_QUEUE = "b2c.generate_image";

export interface GenerateImageJobData {
  questionId: string;
  boardId: string;
  // Slice FIG-AUTH: the tutor's regenerate instruction (Starkhorn refinementNote),
  // threaded into the matplotlib script prompt. Absent on the v1 auto-render.
  refinementNote?: string | null;
}

export const generateImageQueue = new Queue<GenerateImageJobData>(
  GENERATE_IMAGE_QUEUE,
  {
    connection: redisConnection,
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: "exponential", delay: 5_000 },
      removeOnComplete: 100,
      removeOnFail: 200,
    },
  },
);

/**
 * Fire-and-forget figure render for one question. BEST-EFFORT: swallows its own
 * errors so a queue/Redis outage can never break the question SAVE that called
 * it. The `jobId` makes enqueue idempotent per question; the `delay` lets the
 * save transaction commit before the worker reads the row.
 */
export async function enqueueImageGeneration(
  data: GenerateImageJobData,
  opts?: { jobId?: string; delayMs?: number },
): Promise<void> {
  try {
    await generateImageQueue.add("render", data, {
      // Default jobId dedupes the v1 auto-render (one per question). On-demand
      // (re)generation from the review form passes a UNIQUE jobId so each click
      // actually renders a NEW version (FIG-AUTH D-FIG-2) instead of being deduped.
      jobId: opts?.jobId ?? `image-${data.questionId}`,
      delay: opts?.delayMs ?? 1_500,
    });
  } catch (err) {
    console.error(
      `[image] enqueue failed for question ${data.questionId} (non-fatal):`,
      err instanceof Error ? err.message : err,
    );
  }
}

/**
 * Coarse state of a render job, so the tutor's poll can distinguish "still
 * working" from "failed" instead of waiting out the full poll cap on a job that
 * will never produce a row. Collapsed to what the UI needs; 'unknown' when the
 * job has aged out of Redis (removeOnFail cap) or Redis is unreachable.
 */
export type ImageJobState = "waiting" | "active" | "completed" | "failed" | "unknown";

export async function getImageJobState(jobId: string): Promise<ImageJobState> {
  try {
    const job = await generateImageQueue.getJob(jobId);
    if (!job) return "unknown";
    const state = await job.getState();
    switch (state) {
      case "active":
      case "completed":
      case "failed":
        return state;
      case "waiting":
      case "waiting-children":
      case "delayed":
      case "prioritized":
        return "waiting";
      default:
        return "unknown";
    }
  } catch {
    return "unknown";
  }
}

/**
 * Id of an in-flight render job for this draft, or null — the resume handle for
 * the tutor's "Regenerating…" loader after a page refresh (D-FIG-2 loaders are
 * durable now). See activeJobIdForQuestion.
 */
export function getActiveImageJobId(boardId: string, questionId: string): Promise<string | null> {
  return activeJobIdForQuestion(generateImageQueue, boardId, questionId);
}

// ───────────────────────── Slice REVISE-ASYNC: per-question revise ─────────────
// The per-question mini-chat revise was a SYNCHRONOUS mutation (a ~10–30s Gemini
// call blocking the request), so its "Revising…" loader lived only in the open
// tab and a refresh lost it — and a slow revise risked the nginx wall. Now it is
// a background job (mirrors AIJOB-1 extraction): the route enqueues + returns a
// jobId; the worker runs reviseDraft OFF the request path and PERSISTS the draft
// in place; the FE polls the job for the revised draft (the job's return value)
// and resumes its loader across refresh via getActiveReviseJobId.

export const REVISE_QUEUE = "b2c.revise";

export interface ReviseJobData {
  boardId: string;
  tutorUserId: string;
  chatId: string;
  questionId: string;
  refinementNote: string;
}

export const reviseQueue = new Queue<ReviseJobData>(REVISE_QUEUE, {
  connection: redisConnection,
  defaultJobOptions: {
    // ONE attempt — a revise is a paid Gemini call that also PERSISTS in place; a
    // silent BullMQ retry would re-author + re-persist. Surface a failure instead.
    attempts: 1,
    // Age-based retention so the FE can poll the revised draft out (occasional
    // tutor action, not a firehose).
    removeOnComplete: { age: 3_600 },
    removeOnFail: { age: 3_600 },
  },
});

/**
 * Enqueue one draft revision; returns the BullMQ job id the FE polls. NOT
 * best-effort (like extraction, unlike the fire-and-forget render/score enqueues):
 * if Redis is down the tutor must SEE the failure — there is no job id to poll
 * otherwise — so errors propagate. BullMQ assigns the id (unique per click; each
 * revise is a fresh run, never deduped).
 */
export async function enqueueRevise(data: ReviseJobData): Promise<string> {
  const job = await reviseQueue.add("revise", data);
  if (!job.id) throw new Error("BullMQ did not assign a job id");
  return job.id;
}

/**
 * Poll state for one revise job. Mirrors getExtractJobStatus: carries the RESULT
 * — the revised, already-persisted draft, stored as the job's return value so the
 * FE can patch its card without a second read. `boardId` is checked against the
 * caller's board so one tutor can't poll another board's job by id. 'unknown'
 * when the job has aged out of Redis or Redis is unreachable.
 */
export type ReviseJobStatus =
  | { state: "waiting" | "active" | "unknown" }
  | { state: "completed"; result: ReviseResult }
  | { state: "failed"; error: string };

export async function getReviseJobStatus(
  jobId: string,
  boardId: string,
): Promise<ReviseJobStatus> {
  try {
    const job = await reviseQueue.getJob(jobId);
    if (!job) return { state: "unknown" };
    if (job.data?.boardId && job.data.boardId !== boardId) return { state: "unknown" };
    const state = await job.getState();
    if (state === "completed") {
      return { state: "completed", result: job.returnvalue as ReviseResult };
    }
    if (state === "failed") {
      return { state: "failed", error: job.failedReason ?? "revision failed" };
    }
    if (state === "active") return { state: "active" };
    return { state: "waiting" };
  } catch {
    return { state: "unknown" };
  }
}

/**
 * Id of an in-flight revise job for this draft, or null — the resume handle for
 * the tutor's "Revising…" loader after a page refresh. See activeJobIdForQuestion.
 */
export function getActiveReviseJobId(boardId: string, questionId: string): Promise<string | null> {
  return activeJobIdForQuestion(reviseQueue, boardId, questionId);
}

// ───────────────────────── Slice AUTHOR-ASYNC: draft the questions ─────────────
// The authoring WORKER (spawnAuthoringWorker → geminiJson) is a paid, HIGH-VARIANCE
// call (measured 60–265s; on heavy content it returned truncated JSON at 265s then
// TIMED OUT the retry at ~247s). It used to run INLINE inside sendAuthoringChatTurn
// / authorFromChat → the tutor sat on "Thinking…" for up to 524s → 500 (the
// 2026-07-22 "waiting forever" freeze). Now it is a background job (the AIJOB-1 /
// revise pattern): the request path resolves the target (fast) + enqueues; the
// worker runs authorFromChat OFF the request path (no nginx wall, retries
// non-blocking) and PERSISTS the drafts; the FE polls for the AuthorFromChatResult
// (the job's return value) and its "Drafting…" loader survives a refresh via
// getActiveAuthoringJobId(chatId).

export const AUTHORING_QUEUE = "b2c.authoring";

export interface AuthoringJobData {
  boardId: string;
  tutorUserId: string;
  chatId: string;
  subTopicId: string;
  count: number;
}

export const authoringQueue = new Queue<AuthoringJobData>(AUTHORING_QUEUE, {
  connection: redisConnection,
  defaultJobOptions: {
    // ONE attempt — a full author is a paid, per-question sequence that PERSISTS
    // draft rows; a silent BullMQ retry would re-author + re-persist. Surface a
    // failure instead (the FE shows "drafting failed, try again").
    attempts: 1,
    // Age-based retention so the FE can poll the drafts out (occasional tutor
    // action, not a firehose).
    removeOnComplete: { age: 3_600 },
    removeOnFail: { age: 3_600 },
  },
});

/**
 * Enqueue one authoring draft; returns the BullMQ job id the FE polls. NOT
 * best-effort (like extraction/revise, unlike the fire-and-forget render/score
 * enqueues): if Redis is down the tutor must SEE the failure — there is no job id
 * to poll otherwise — so errors propagate. A `delay` lets the request tx (which
 * just appended the tutor's go-ahead turn to the chat) COMMIT before the worker's
 * authorFromChat reads the chat history for its brief. BullMQ assigns the id.
 */
export async function enqueueAuthoring(data: AuthoringJobData): Promise<string> {
  const job = await authoringQueue.add("author-draft", data, { delay: 2_000 });
  if (!job.id) throw new Error("BullMQ did not assign a job id");
  return job.id;
}

/**
 * Poll state for one authoring job. Mirrors getReviseJobStatus: on completed it
 * carries the AuthorFromChatResult (chosen sub-topic + the persisted drafts, the
 * job's return value) so the FE opens the review form without a second read.
 * `boardId` is checked against the caller's board so one tutor can't poll another
 * board's job by id. 'unknown' when the job has aged out of Redis or Redis is
 * unreachable.
 */
export type AuthoringJobStatus =
  | { state: "waiting" | "active" | "unknown" }
  | { state: "completed"; result: AuthoringResult }
  | { state: "failed"; error: string };

export async function getAuthoringJobStatus(
  jobId: string,
  boardId: string,
): Promise<AuthoringJobStatus> {
  try {
    const job = await authoringQueue.getJob(jobId);
    if (!job) return { state: "unknown" };
    if (job.data?.boardId && job.data.boardId !== boardId) return { state: "unknown" };
    const state = await job.getState();
    if (state === "completed") {
      return { state: "completed", result: job.returnvalue as AuthoringResult };
    }
    if (state === "failed") {
      return { state: "failed", error: job.failedReason ?? "authoring failed" };
    }
    if (state === "active") return { state: "active" };
    return { state: "waiting" };
  } catch {
    return { state: "unknown" };
  }
}

/**
 * Id of an in-flight authoring job for this chat, or null — the resume handle for
 * the tutor's "Drafting…" loader after a page refresh / close-reopen. Keyed by
 * chat (not question — the drafts don't exist yet). See activeJobIdForChat.
 */
export function getActiveAuthoringJobId(boardId: string, chatId: string): Promise<string | null> {
  return activeJobIdForChat(authoringQueue, boardId, chatId);
}
