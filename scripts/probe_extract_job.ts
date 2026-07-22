/**
 * probe_extract_job — AIJOB-1 async-extraction plumbing (queue + status).
 *
 * Proves the BullMQ round-trip the FE poll rides on, deterministically (no live
 * Gemini call — the extraction itself is proven separately; the runaway/latency
 * was measured by replay). The Gemini leg is intentionally NOT here so this probe
 * can't flake on vendor variance — the whole reason the async path exists.
 *
 *   1. enqueueExtractTopics → returns a non-empty job id.
 *   2. getExtractJobStatus(id, board) → the job is FOUND (state ≠ unknown).
 *   3. board isolation: getExtractJobStatus(id, OTHER board) → unknown.
 *   4. bogus id → unknown.
 *
 * Cleans up the test job so no running worker processes it later.
 *
 * ⚠️ Needs Redis up (redisConnection). A running `bun run worker` is fine — the
 * assertions are timing-robust (they check found-vs-hidden, not a live state).
 */
import { contentQueue, enqueueExtractTopics, getExtractJobStatus } from "../src/worker/queue";
import { redisConnection } from "../src/redis/connection";

let passed = 0;
let failed = 0;
function check(name: string, ok: boolean) {
  if (ok) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.error(`  ✗ ${name}`);
  }
}

const BOARD_A = "11111111-1111-1111-1111-111111111111";
const BOARD_B = "22222222-2222-2222-2222-222222222222";

async function main() {
  // 1. enqueue
  const jobId = await enqueueExtractTopics({
    boardId: BOARD_A,
    rawMd: "# Probe Chapter\n## Topic 1\n### Sub 1\n- (C) understand the thing",
  });
  check("enqueueExtractTopics → non-empty job id", typeof jobId === "string" && jobId.length > 0);

  // 2. found under its own board (state ≠ unknown; waiting|active|completed all fine)
  const s1 = await getExtractJobStatus(jobId, BOARD_A);
  check(`status under correct board → found (state=${s1.state} ≠ unknown)`, s1.state !== "unknown");

  // 3. board isolation — another board must NOT see this job
  const s2 = await getExtractJobStatus(jobId, BOARD_B);
  check("status under WRONG board → unknown (board isolation)", s2.state === "unknown");

  // 4. bogus id → unknown
  const s3 = await getExtractJobStatus("not-a-real-job-id", BOARD_A);
  check("bogus job id → unknown", s3.state === "unknown");

  // cleanup: drop the test job (best-effort — an active job may refuse removal)
  try {
    const job = await contentQueue.getJob(jobId);
    await job?.remove();
  } catch {
    /* a worker grabbed it mid-probe; harmless (removeOnComplete ages it out) */
  }

  console.log(`\nprobe_extract_job: ${passed} passed, ${failed} failed`);
  await contentQueue.close();
  await redisConnection.quit();
  process.exit(failed === 0 ? 0 : 1);
}

main().catch(async (err) => {
  console.error("probe_extract_job FAILED:", err);
  try {
    await contentQueue.close();
    await redisConnection.quit();
  } catch {
    /* noop */
  }
  process.exit(1);
});
