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
 *   3. getActiveAuthoringJobId (the FE's resume handle for the durable "Drafting…"
 *      loader) finds the live job by (board, CHAT) — keyed by chat, not question,
 *      because the drafts don't exist yet — and is null for a different chat /
 *      different board.
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
  getActiveAuthoringJobId,
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

  // 1. enqueue → jobId
  const jobId = await enqueueAuthoring({
    boardId: boardA,
    tutorUserId: randomUUID(),
    chatId: chatA,
    subTopicId: randomUUID(),
    count: 3,
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
  const active = await getActiveAuthoringJobId(boardA, chatA);
  check("getActiveAuthoringJobId finds the live authoring job for the chat", active === jobId);
  const activeWrongChat = await getActiveAuthoringJobId(boardA, chatOther);
  check("getActiveAuthoringJobId → null for a chat with no live job", activeWrongChat === null);
  const activeWrongBoard = await getActiveAuthoringJobId(boardB, chatA);
  check("getActiveAuthoringJobId → null under a different board (isolation)", activeWrongBoard === null);

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
