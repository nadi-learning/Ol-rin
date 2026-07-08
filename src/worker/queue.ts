import { Queue } from "bullmq";
import { redisConnection } from "../redis/connection";

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
 * `b2c.content` — kept idle for the later content-pull slice (no processor yet).
 */
export const contentQueue = new Queue("b2c.content", {
  connection: redisConnection,
});

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
