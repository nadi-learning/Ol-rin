/**
 * rescore_one_attempt — re-run Stage-1 scoreAttempt for a single attempt.
 * Idempotent (scoreAttempt clears its prior stage1 reads first). Used to apply a
 * new scoring path (e.g. CORRECTNESS-JUDGE) to a specific historical attempt.
 *
 *   bun scripts/rescore_one_attempt.ts <boardId> <attemptId>
 */
import { scoreAttempt } from "../src/services/assessment";
import { queryClient } from "../src/db/client";

async function main() {
  const [, , boardId, attemptId] = process.argv;
  if (!boardId || !attemptId) {
    console.error("usage: bun scripts/rescore_one_attempt.ts <boardId> <attemptId>");
    process.exit(2);
  }
  const res = await scoreAttempt(boardId, attemptId);
  console.log("scoreAttempt →", JSON.stringify(res));
  await queryClient.end();
}

main().catch(async (e) => {
  console.error("rescore FAILED:", e);
  await queryClient.end();
  process.exit(1);
});
