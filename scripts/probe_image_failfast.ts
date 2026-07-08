/**
 * probe_image_failfast — locks the render fail-fast + job-status surface added
 * for N4 (tutor image generation failing when nadi-pyrender is down on prod).
 *
 * NO AI, NO pyrender. Two deterministic checks:
 *  1. isPyrenderDownError classifies ONLY an unreachable-sidecar failure
 *     (ImageRenderError httpStatus 0) as "down" — a pyrender 5xx / bad-script
 *     (httpStatus 500) and a generic error are NOT "down" (they keep retrying).
 *     This is the predicate the worker uses to throw UnrecoverableError (no
 *     retry → no repeated paid Gemini script-gen) vs fall through to retries.
 *  2. getImageJobState returns 'unknown' for an id with no job in the queue —
 *     the safe default the tutor poll treats as "keep waiting", never a crash.
 *     Redis-only.
 */
import { ImageRenderError, isPyrenderDownError } from "../src/services/image_gen";
import { getImageJobState } from "../src/worker/queue";
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
  // 1. down-detection classifier (pure)
  check(
    "isPyrenderDownError: ImageRenderError(status 0) → DOWN (no retry)",
    isPyrenderDownError(new ImageRenderError("unable to connect", 0)) === true,
  );
  check(
    "isPyrenderDownError: ImageRenderError(status 500) → NOT down (retry)",
    isPyrenderDownError(new ImageRenderError("bad script traceback", 500)) === false,
  );
  check(
    "isPyrenderDownError: a generic Error → NOT down",
    isPyrenderDownError(new Error("something else")) === false,
  );
  check(
    "isPyrenderDownError: non-error value → NOT down",
    isPyrenderDownError("nope") === false,
  );

  // 2. job-state read (redis)
  const state = await getImageJobState(`no-such-job-${Date.now()}`);
  check("getImageJobState: unknown job → 'unknown'", state === "unknown");

  console.log(`\nprobe_image_failfast: ${passed} passed, ${failed} failed`);
  await redisConnection.quit();
  process.exit(failed === 0 ? 0 : 1);
}

main().catch(async (err) => {
  console.error("probe_image_failfast FAILED:", err);
  try {
    await redisConnection.quit();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
