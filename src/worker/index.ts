import { UnrecoverableError, Worker } from "bullmq";
import { redisConnection } from "../redis/connection";
import { withBoard } from "../db/with-board";
import { __aiConfigured } from "../services/ai/gemini";
import { extractTopicsMd } from "../services/admin_ingest";
import { authorFromChat, planFromChat, reviseDraft } from "../services/authoring_chat";
import { scoreAttempt } from "../services/assessment";
import { generateImageForQuestion, isPyrenderDownError } from "../services/image_gen";
import { verifyImage } from "../services/image_verify";
import {
  ASSESSMENT_QUEUE,
  AUTHORING_QUEUE,
  type AuthoringJobData,
  type AuthoringJobResult,
  CONTENT_QUEUE,
  type ExtractTopicsJobData,
  GENERATE_IMAGE_QUEUE,
  type GenerateImageJobData,
  REVISE_QUEUE,
  type ReviseJobData,
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

// Slice REVISE-ASYNC — per-question draft revision moved OFF the request path (was
// a synchronous ~10–30s Gemini mutation; now a background job so its loader is
// durable across a refresh and a slow revise never hits the nginx wall). One
// Gemini call per job (single attempt — reviseDraft PERSISTS in place, so a retry
// would re-author + re-persist). Runs under the job's board claim (RLS); the
// PERSISTED draft is BOTH written in place AND returned as the job value so the
// FE's poll can patch its card. concurrency 2 — another AI rate surface.
const reviseWorker = new Worker<ReviseJobData>(
  REVISE_QUEUE,
  async (job) =>
    withBoard(job.data.boardId, (tx) =>
      reviseDraft(tx, {
        tutorUserId: job.data.tutorUserId,
        chatId: job.data.chatId,
        questionId: job.data.questionId,
        refinementNote: job.data.refinementNote,
      }),
    ),
  { connection: redisConnection, concurrency: 2 },
);

reviseWorker.on("completed", (job) =>
  console.log(`[b2c-worker] revised draft ${job.data.questionId} (chat ${job.data.chatId})`),
);
reviseWorker.on("failed", (job, err) =>
  console.error(
    `[b2c-worker] revise FAILED question ${job?.data.questionId}: ${err.message}`,
  ),
);

// Slice AUTHOR-ASYNC — draft the questions OFF the request path (was inline in
// sendAuthoringChatTurn / authorFromChat → the tutor sat on "Thinking…" for up to
// 524s → 500 on a slow/truncated Gemini author). One authorFromChat per job (single
// attempt — it PERSISTS draft rows, so a retry would re-author + re-persist);
// authorFromChat internally spawns the scoped worker (Gemini now drafts
// per-question so a heavy batch can't truncate) and PERSISTS the drafts under the
// job's board claim (RLS). The AuthorFromChatResult (chosen sub-topic + persisted
// drafts) is both persisted AND returned as the job value so the FE opens the
// review form from the poll. concurrency 1 — a heavy multi-question AI sequence.
//
// Slice TWOWAY-1 — TWO PHASES on this one queue. 'plan' runs the worker's
// plan turn (appending it to the worker conversation + relaying it into the master
// chat) and stops, leaving the episode awaiting the tutor's gate; 'draft' runs the
// approved plan. Separate jobs, never one job that waits on a human — at
// concurrency 1 a parked job would pin the only authoring slot behind one unread
// plan card. An ABSENT phase reads as 'draft' so a job enqueued by pre-slice code
// and still sitting in Redis at deploy time does what it was queued to do.
const authoringWorker = new Worker<AuthoringJobData>(
  AUTHORING_QUEUE,
  async (job): Promise<AuthoringJobResult> =>
    withBoard(job.data.boardId, (tx): Promise<AuthoringJobResult> => {
      if ((job.data.phase ?? "draft") === "plan") {
        return planFromChat(tx, {
          tutorUserId: job.data.tutorUserId,
          chatId: job.data.chatId,
          subTopicId: job.data.subTopicId,
          count: job.data.count,
          ...(job.data.workerId ? { workerId: job.data.workerId } : {}),
        });
      }
      return authorFromChat(tx, {
        tutorUserId: job.data.tutorUserId,
        chatId: job.data.chatId,
        subTopicId: job.data.subTopicId,
        count: job.data.count,
        ...(job.data.workerId ? { workerId: job.data.workerId } : {}),
      }).then((r) => ({ ...r, phase: "draft" as const }));
    }),
  { connection: redisConnection, concurrency: 1 },
);

authoringWorker.on("completed", (job, res) => {
  if (res?.phase === "plan") {
    console.log(
      `[b2c-worker] PLANNED ${res.plan?.items?.length ?? 0} item(s) for ` +
        `${res.subTopicName ?? job.data.subTopicId} (chat ${job.data.chatId}, ` +
        `episode ${res.workerId}) — awaiting the tutor's gate`,
    );
    return;
  }
  console.log(
    `[b2c-worker] authored ${res?.drafts?.length ?? 0} draft(s) for ` +
      `${res?.subTopicName ?? job.data.subTopicId} (chat ${job.data.chatId})`,
  );
});
authoringWorker.on("failed", (job, err) =>
  console.error(
    `[b2c-worker] authoring ${job?.data.phase ?? "draft"} FAILED sub-topic ` +
      `${job?.data.subTopicId} (chat ${job?.data.chatId}): ${err.message}`,
  ),
);

console.log(
  `[b2c-worker] up — assessment + image-render + content-extract + revise + authoring processors registered ` +
    `(AI ${__aiConfigured() ? "configured" : "DISABLED: no GEMINI_API_KEY — jobs will fail loudly"})`,
);

redisConnection.on("error", (e) => console.error("[b2c-worker] redis error", e));
