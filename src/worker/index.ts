import { UnrecoverableError, Worker } from "bullmq";
import { redisConnection } from "../redis/connection";
import { __aiConfigured } from "../services/ai/gemini";
import { extractTopicsMd } from "../services/admin_ingest";
import { scoreAttempt } from "../services/assessment";
import { generateImageForQuestion, isPyrenderDownError } from "../services/image_gen";
import { verifyImage } from "../services/image_verify";
import {
  ASSESSMENT_QUEUE,
  CONTENT_QUEUE,
  type ExtractTopicsJobData,
  GENERATE_IMAGE_QUEUE,
  type GenerateImageJobData,
  type Stage1JobData,
} from "./queue";

/**
 * Worker entry — Slice AI-1 registers the first processor: Stage-1 blind scoring.
 * Reads each enqueued attempt blind and writes observations (never mastery).
 * Concurrency kept low (2) — each job is two Gemini calls; this is the AI rate
 * surface. BullMQ retries (attempts:3, exp backoff) absorb the submit→commit
 * race and transient vendor errors.
 */
const worker = new Worker<Stage1JobData>(
  ASSESSMENT_QUEUE,
  async (job) => scoreAttempt(job.data.boardId, job.data.attemptId),
  { connection: redisConnection, concurrency: 2 },
);

worker.on("completed", (job, res) =>
  console.log(
    `[b2c-worker] scored attempt ${job.data.attemptId}: ` +
      `${res?.observationsWritten ?? 0} observation(s) (axes ${res?.axesRun?.join("+") || "none"})`,
  ),
);
worker.on("failed", (job, err) =>
  console.error(
    `[b2c-worker] scoring FAILED attempt ${job?.data.attemptId}: ${err.message}`,
  ),
);

// Slice IMG — figure render. Each job is one Gemini call + one pyrender render;
// concurrency kept low (2) as another AI rate surface. A render failure fails
// only this job (BullMQ retries absorb the save→commit race + transient vendor /
// sidecar errors); it never touches the save or the student's practice.
const imageWorker = new Worker<GenerateImageJobData>(
  GENERATE_IMAGE_QUEUE,
  async (job) => {
    let res;
    try {
      res = await generateImageForQuestion(
        job.data.boardId,
        job.data.questionId,
        job.data.refinementNote,
      );
    } catch (err) {
      // The render sidecar (nadi-pyrender) being DOWN won't recover in a 5s
      // backoff, and every retry re-runs the (paid, ~20s) Gemini script-gen
      // first — pure waste. Fail the job PERMANENTLY so BullMQ does not retry.
      // Transient failures (pyrender 5xx / a bad script / a Gemini blip) fall
      // through to the normal exponential-backoff retry.
      if (isPyrenderDownError(err)) {
        throw new UnrecoverableError(
          err instanceof Error ? err.message : String(err),
        );
      }
      throw err;
    }
    // Stage-2 vision verify — FAULT-ISOLATED. verifyImage stamps ERROR rather
    // than throwing on a call/file failure; the extra guard covers the not-found
    // case so a verify problem can never fail the (successful) render job.
    try {
      const v = await verifyImage(job.data.boardId, res.imageId);
      console.log(`[b2c-worker] verified image ${res.imageId}: ${v.label} — ${v.reason}`);
    } catch (err) {
      console.error(
        `[b2c-worker] verify FAILED (non-fatal) image ${res.imageId}: ` +
          (err instanceof Error ? err.message : String(err)),
      );
    }
    return res;
  },
  { connection: redisConnection, concurrency: 2 },
);

imageWorker.on("completed", (job, res) =>
  console.log(
    `[b2c-worker] rendered image for question ${job.data.questionId}: ` +
      `v${res?.version ?? "?"} (${res?.bytes?.length ?? 0} bytes)`,
  ),
);
imageWorker.on("failed", (job, err) =>
  console.error(
    `[b2c-worker] image render FAILED question ${job?.data.questionId}: ${err.message}`,
  ),
);

// AIJOB-1 — async topics.md extraction. One Gemini call per job (600s single
// attempt, set inside extractTopicsMd), OFF the request path so it has no nginx
// wall. concurrency 1: admin ingest is occasional + this is a heavy AI leg. The
// return value (the extracted skeleton + validation) is stored by BullMQ and
// read back by admin.getExtractJob.
const contentWorker = new Worker<ExtractTopicsJobData>(
  CONTENT_QUEUE,
  async (job) => extractTopicsMd(job.data.rawMd),
  { connection: redisConnection, concurrency: 1 },
);

contentWorker.on("completed", (job, res) =>
  console.log(
    `[b2c-worker] extracted topics.md (${job.data.rawMd.length} chars): ` +
      `${res?.extracted?.topics?.length ?? 0} topics, valid=${res?.validation?.ok ?? "?"}`,
  ),
);
contentWorker.on("failed", (job, err) =>
  console.error(
    `[b2c-worker] topics.md extraction FAILED (${job?.data.rawMd.length ?? "?"} chars): ${err.message}`,
  ),
);

console.log(
  `[b2c-worker] up — assessment + image-render + content-extract processors registered ` +
    `(AI ${__aiConfigured() ? "configured" : "DISABLED: no GEMINI_API_KEY — jobs will fail loudly"})`,
);

redisConnection.on("error", (e) => console.error("[b2c-worker] redis error", e));
