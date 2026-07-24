/**
 * probe_authoring_async — AUTHOR-ASYNC plumbing + resume-handle exit gate.
 *
 * The authoring WORKER (spawnAuthoringWorker → geminiJson) used to run INLINE in
 * sendAuthoringChatTurn / authorFromChat → the tutor sat on "Thinking…" up to 524s
 * → 500 on a slow/truncated Gemini author. It is now a background job (mirrors
 * REVISE-ASYNC / AIJOB-1): the request path resolves the target + enqueues; the
 * worker runs authorFromChat off the request path and the FE polls. This probe
 * locks the queue plumbing DETERMINISTICALLY:
 *   1. enqueueAuthoring returns a jobId.
 *   2. getAuthoringJobStatus reads it as still-queued, board-ISOLATED (another
 *      board by id → 'unknown'), and 'unknown' for a bogus id (the poll's safe
 *      default).
 *   3. getActiveAuthoringJob (the FE's resume handle for the durable loader) finds
 *      the live job by (board, CHAT) — keyed by chat, not question, because the
 *      output doesn't exist yet — and is null for a different chat / different board.
 *   4. Slice TWOWAY-1 — the PHASE survives the round trip through Redis. Both phases
 *      are keyed to the same chat, so if the resume handle lost the phase a plan in
 *      flight would restore as "Drafting…" and then hand the poll a plan the review
 *      form cannot open. Also locks the backward-compatible default: a job enqueued
 *      with NO phase (pre-slice code, or one already in Redis at deploy time) reads
 *      as 'draft'.
 *
 * NO worker, NO AI, NO DB — jobs stay queued and the helpers match on job DATA.
 * 🔴 STOP `bun run worker` first: a running worker would STEAL the queued job and
 * run authorFromChat on the synthetic ids (→ fail), breaking the "still queued"
 * assertions (same gotcha as probe:assessment / probe:reviseasync — see
 * ai-build-miss / [[b2c-worker-breaks-probes]]).
 */
import { randomUUID } from "node:crypto";
import {
  authoringQueue,
  enqueueAuthoring,
  getActiveAuthoringJob,
  getAuthoringJobStatus,
} from "../src/worker/queue";
import { redisConnection } from "../src/redis/connection";

let passed = 0;
let failed = 0;
function check(name: string, ok: boolean) {
  if (ok) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.log(`  ✗ ${name}`);
  }
}

async function main() {
  // Clean slate (a prior aborted run may have left jobs).
  await authoringQueue.obliterate({ force: true }).catch(() => {});

  const boardA = randomUUID();
  const boardB = randomUUID();
  const chatA = randomUUID();
  const chatOther = randomUUID();
  const chatPlan = randomUUID();
  const chatLegacy = randomUUID();

  // 1. enqueue → jobId
  const jobId = await enqueueAuthoring({
    boardId: boardA,
    tutorUserId: randomUUID(),
    chatId: chatA,
    subTopicId: randomUUID(),
    count: 3,
    phase: "draft",
  });
  check("enqueueAuthoring returns a jobId", typeof jobId === "string" && jobId.length > 0);

  // 2. status: still queued (no worker), board-isolated, safe on a bogus id.
  //    The enqueue carries a 2s delay (commit window) → the job is 'delayed',
  //    which getAuthoringJobStatus collapses to 'waiting' (still queued).
  const st = await getAuthoringJobStatus(jobId, boardA);
  check(
    "getAuthoringJobStatus → waiting/active while queued (no worker)",
    st.state === "waiting" || st.state === "active",
  );
  const stWrongBoard = await getAuthoringJobStatus(jobId, boardB);
  check(
    "getAuthoringJobStatus under a different board → unknown (isolation)",
    stWrongBoard.state === "unknown",
  );
  const stBogus = await getAuthoringJobStatus(`author-nope-${randomUUID()}`, boardA);
  check(
    "getAuthoringJobStatus for an unknown jobId → unknown (poll's safe default)",
    stBogus.state === "unknown",
  );

  // 3. resume handle — find the live job by (board, CHAT)
  const active = await getActiveAuthoringJob(boardA, chatA);
  check("getActiveAuthoringJob finds the live authoring job for the chat", active?.jobId === jobId);
  const activeWrongChat = await getActiveAuthoringJob(boardA, chatOther);
  check("getActiveAuthoringJob → null for a chat with no live job", activeWrongChat === null);
  const activeWrongBoard = await getActiveAuthoringJob(boardB, chatA);
  check("getActiveAuthoringJob → null under a different board (isolation)", activeWrongBoard === null);

  // 4. TWOWAY-1 — the phase survives the round trip, and an ABSENT phase reads as
  //    'draft'. Without the first, a resumed loader mislabels the work AND the poll
  //    expects the wrong result shape; without the second, a job already sitting in
  //    Redis at deploy time would be re-interpreted as a plan and never draft.
  check("draft job's resume handle reports phase='draft'", active?.phase === "draft");

  const planJobId = await enqueueAuthoring({
    boardId: boardA,
    tutorUserId: randomUUID(),
    chatId: chatPlan,
    subTopicId: randomUUID(),
    count: 3,
    phase: "plan",
  });
  const activePlan = await getActiveAuthoringJob(boardA, chatPlan);
  check(
    "plan job's resume handle reports phase='plan' (not mislabelled as drafting)",
    activePlan?.jobId === planJobId && activePlan?.phase === "plan",
  );

  // A pre-slice enqueue: no `phase` key at all.
  const legacyJobId = await enqueueAuthoring({
    boardId: boardA,
    tutorUserId: randomUUID(),
    chatId: chatLegacy,
    subTopicId: randomUUID(),
    count: 2,
  });
  const activeLegacy = await getActiveAuthoringJob(boardA, chatLegacy);
  check(
    "a phase-less (pre-slice) job reads as phase='draft'",
    activeLegacy?.jobId === legacyJobId && activeLegacy?.phase === "draft",
  );

  // cleanup
  await authoringQueue.obliterate({ force: true }).catch(() => {});

  console.log(`\nprobe_authoring_async: ${passed} passed, ${failed} failed`);
  await authoringQueue.close().catch(() => {});
  await redisConnection.quit().catch(() => {});
  process.exit(failed === 0 ? 0 : 1);
}

main().catch(async (err) => {
  console.error("probe_authoring_async FAILED:", err);
  await redisConnection.quit().catch(() => {});
  process.exit(1);
});
