/**
 * probe_revise_async — REVISE-ASYNC plumbing + resume-handle exit gate.
 *
 * The per-question revise was a SYNCHRONOUS mutation; it is now a background job
 * (mirrors AIJOB-1) so its "Revising…" loader is durable across a page refresh.
 * This probe locks the queue plumbing DETERMINISTICALLY:
 *   1. enqueueRevise returns a jobId.
 *   2. getReviseJobStatus reads it as still-queued, board-ISOLATED (another board
 *      by id → 'unknown'), and 'unknown' for a bogus id (the poll's safe default).
 *   3. getActiveReviseJobId (the FE's resume handle) finds the live job by
 *      (board, question), and is null for a different question / different board.
 *
 * NO worker, NO AI, NO DB — jobs stay queued and the helpers match on job DATA.
 * 🔴 STOP `bun run worker` first: a running worker would STEAL the queued job and
 * run reviseDraft on the synthetic ids (→ fail), breaking the "still queued"
 * assertions (same gotcha as probe:assessment / probe:image — see ai-build-miss).
 */
import { randomUUID } from "node:crypto";
import {
  enqueueRevise,
  getActiveReviseJobId,
  getReviseJobStatus,
  reviseQueue,
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
  await reviseQueue.obliterate({ force: true }).catch(() => {});

  const boardA = randomUUID();
  const boardB = randomUUID();
  const qA = randomUUID();
  const qOther = randomUUID();

  // 1. enqueue → jobId
  const jobId = await enqueueRevise({
    boardId: boardA,
    tutorUserId: randomUUID(),
    chatId: randomUUID(),
    questionId: qA,
    refinementNote: "make it harder",
  });
  check("enqueueRevise returns a jobId", typeof jobId === "string" && jobId.length > 0);

  // 2. status: still queued (no worker), board-isolated, safe on a bogus id
  const st = await getReviseJobStatus(jobId, boardA);
  check(
    "getReviseJobStatus → waiting/active while queued (no worker)",
    st.state === "waiting" || st.state === "active",
  );
  const stWrongBoard = await getReviseJobStatus(jobId, boardB);
  check("getReviseJobStatus under a different board → unknown (isolation)", stWrongBoard.state === "unknown");
  const stBogus = await getReviseJobStatus(`revise-nope-${randomUUID()}`, boardA);
  check("getReviseJobStatus for an unknown jobId → unknown (poll's safe default)", stBogus.state === "unknown");

  // 3. resume handle — find the live job by (board, question)
  const active = await getActiveReviseJobId(boardA, qA);
  check("getActiveReviseJobId finds the live revise job for the question", active === jobId);
  const activeWrongQ = await getActiveReviseJobId(boardA, qOther);
  check("getActiveReviseJobId → null for a question with no live job", activeWrongQ === null);
  const activeWrongBoard = await getActiveReviseJobId(boardB, qA);
  check("getActiveReviseJobId → null under a different board (isolation)", activeWrongBoard === null);

  // cleanup
  await reviseQueue.obliterate({ force: true }).catch(() => {});

  console.log(`\nprobe_revise_async: ${passed} passed, ${failed} failed`);
  await reviseQueue.close().catch(() => {});
  await redisConnection.quit().catch(() => {});
  process.exit(failed === 0 ? 0 : 1);
}

main().catch(async (err) => {
  console.error("probe_revise_async FAILED:", err);
  await redisConnection.quit().catch(() => {});
  process.exit(1);
});
