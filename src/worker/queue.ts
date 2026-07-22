import { Queue } from "bullmq";
import { redisConnection } from "../redis/connection";
// Type-only (erased at compile → no runtime import cycle): the extraction's
// result shape IS the job return value the poll hands back.
import type { extractTopicsMd } from "../services/admin_ingest";

type ExtractResult = Awaited<ReturnType<typeof extractTopicsMd>>;

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
