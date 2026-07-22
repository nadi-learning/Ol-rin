/**
 * backfill_stage1 — general Stage-1 re-score for answered-but-unassessed attempts.
 *
 * Re-runs the FULL scoreAttempt pipeline (per-axis reasoning reads → deterministic
 * MCQ bare-choice fallback → AI correctness-judge fallback) on every attempt that
 * has an answer (typed OR photo) but carries NO Stage-1 observation. This is the
 * general form of backfill_mcq_correctness (which only re-scored bare-choice MCQ
 * attempts). Use it after deploying a new scoring path so historical attempts that
 * predate it get assessed — nothing re-scores old attempts automatically.
 *
 * Why the MCQ-only backfill isn't enough: an answer like "C rain" isn't a bare
 * choice, and a bare "b" whose reference lists (A)(B)(C)(D) has no single clean key
 * — both abstain in the MCQ path and only the correctness-judge assesses them.
 *
 * Idempotent: scoreAttempt clears this attempt's prior stage1 reads first. Skips and
 * no-answer/no-photo attempts are no-ops (scoreAttempt returns scored:false).
 *
 * DRY-RUN by default: lists candidates, writes nothing. Pass --execute to score
 * (needs GEMINI_API_KEY — the reasoning reads + judge are Gemini calls). Board-scoped
 * via RLS (loops every board); an explicit board_id match keeps a table-OWNER role
 * that bypasses RLS from double-counting an attempt across the loop.
 *
 *   bun scripts/backfill_stage1.ts            # dry-run
 *   bun scripts/backfill_stage1.ts --execute  # write
 */
import { and, eq, isNull, notExists } from "drizzle-orm";
import { attempt, attemptImage, board, observation } from "@b2c/kernel/schema";
import { db, queryClient } from "../src/db/client";
import { withBoard } from "../src/db/with-board";
import { scoreAttempt } from "../src/services/assessment";

const EXECUTE = process.argv.includes("--execute");

async function main() {
  const boards = await db.select({ id: board.id, slug: board.slug }).from(board);
  let candidates = 0;
  let wrote = 0;
  let abstained = 0;
  let noop = 0;

  for (const b of boards) {
    // Not-skipped attempts in this board with NO stage1 read. We DON'T filter on
    // answer_text here — a photo answer has answer_text null but is scorable — and
    // let scoreAttempt decide (it no-ops a genuinely empty attempt).
    const rows = await withBoard(b.id, (tx) =>
      tx
        .select({
          attemptId: attempt.id,
          answerText: attempt.answerText,
        })
        .from(attempt)
        .where(
          and(
            eq(attempt.boardId, b.id),
            isNull(attempt.skipReason),
            notExists(
              tx
                .select({ n: observation.id })
                .from(observation)
                .where(
                  and(
                    eq(observation.attemptId, attempt.id),
                    eq(observation.source, "stage1_scorer"),
                  ),
                ),
            ),
          ),
        ),
    );

    for (const r of rows) {
      // A photo answer (answer_text null) is still scorable — count it as a
      // candidate only if it has an answer of some kind (text or image).
      const hasText = !!r.answerText && r.answerText.trim().length > 0;
      const [img] = hasText
        ? []
        : await withBoard(b.id, (tx) =>
            tx
              .select({ n: attemptImage.id })
              .from(attemptImage)
              .where(eq(attemptImage.attemptId, r.attemptId))
              .limit(1),
          );
      if (!hasText && !img) continue; // truly empty → not scorable, skip silently

      candidates++;
      const label = hasText ? `"${r.answerText!.trim().replace(/\s+/g, " ").slice(0, 24)}"` : "[photo]";
      console.log(
        `  [${b.slug}] attempt ${r.attemptId}: ${label}${EXECUTE ? " · scoring…" : ""}`,
      );
      if (EXECUTE) {
        const res = await scoreAttempt(b.id, r.attemptId);
        if (res.observationsWritten > 0) wrote++;
        else if (res.scored) abstained++;
        else noop++;
        console.log(
          `      → scored=${res.scored} axes=[${res.axesRun.join(",")}] observations=${res.observationsWritten}`,
        );
      }
    }
  }

  console.log(
    `\nbackfill_stage1: ${candidates} answered attempt(s) with no Stage-1 read`,
  );
  if (EXECUTE) {
    console.log(
      `  scored → ${wrote} wrote observation(s), ${abstained} scored-but-abstained (no axis/fallback applied), ${noop} not scorable`,
    );
  } else {
    console.log("  DRY-RUN — pass --execute to write. Nothing changed.");
  }
  await queryClient.end();
}

main().catch(async (e) => {
  console.error("backfill_stage1 FAILED:", e);
  await queryClient.end();
  process.exit(1);
});
