/**
 * backfill_mcq_correctness — Slice MCQ-CORRECTNESS one-time backfill.
 *
 * Re-scores historical BARE-CHOICE attempts that produced no Stage-1 observation
 * (e.g. a student who answered "A" and showed no working), so the selected option
 * gets a capped CONCEPTUAL correctness read retroactively — visible in assess and
 * counted. Goes through the real scoreAttempt path, so behaviour is identical to
 * new attempts and it's idempotent (scoreAttempt clears prior stage1 reads first).
 *
 * DRY-RUN by default: lists candidates + the deterministic verdict, writes nothing.
 * Pass --execute to actually score. Board-scoped via RLS (loops every board).
 *
 *   bun scripts/backfill_mcq_correctness.ts            # dry-run
 *   bun scripts/backfill_mcq_correctness.ts --execute  # write (needs GEMINI_API_KEY)
 */
import { and, eq, isNotNull, isNull, notExists } from "drizzle-orm";
import { attempt, board, observation, question } from "@b2c/kernel/schema";
import { db, queryClient } from "../src/db/client";
import { withBoard } from "../src/db/with-board";
import {
  detectBareChoice,
  extractCorrectOption,
  scoreAttempt,
} from "../src/services/assessment";

const EXECUTE = process.argv.includes("--execute");

async function main() {
  const boards = await db.select({ id: board.id, slug: board.slug }).from(board);
  let candidates = 0;
  let wrote = 0;
  let abstained = 0;

  for (const b of boards) {
    // Answered (typed), not-skipped attempts in this board with NO stage1 read.
    const rows = await withBoard(b.id, (tx) =>
      tx
        .select({
          attemptId: attempt.id,
          answerText: attempt.answerText,
          referenceAnswer: question.referenceAnswer,
        })
        .from(attempt)
        .innerJoin(question, eq(question.id, attempt.questionId))
        .where(
          and(
            // Explicit board match: correct even for a table-OWNER role that
            // bypasses RLS (so withBoard doesn't scope) — an attempt is counted
            // only under its real board, never duplicated across the loop.
            eq(attempt.boardId, b.id),
            isNull(attempt.skipReason),
            isNotNull(attempt.answerText),
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
      const picked = detectBareChoice(r.answerText);
      const correct = picked ? extractCorrectOption(r.referenceAnswer) : null;
      if (!picked || !correct) continue; // not a gradeable bare choice → skip
      candidates++;
      const verdict = picked === correct ? "correct" : "wrong";
      console.log(
        `  [${b.slug}] attempt ${r.attemptId}: picked ${picked} · key ${correct} → ${verdict}${EXECUTE ? " · scoring…" : ""}`,
      );
      if (EXECUTE) {
        const res = await scoreAttempt(b.id, r.attemptId);
        if (res.observationsWritten > 0) wrote++;
        else abstained++;
      }
    }
  }

  console.log(
    `\nbackfill_mcq_correctness: ${candidates} gradeable bare-choice attempt(s) with no read`,
  );
  if (EXECUTE) {
    console.log(
      `  scored → ${wrote} wrote a correctness observation, ${abstained} abstained (method axis scored, or no clean key)`,
    );
  } else {
    console.log("  DRY-RUN — pass --execute to write. Nothing changed.");
  }
  await queryClient.end();
}

main().catch(async (e) => {
  console.error("backfill_mcq_correctness FAILED:", e);
  await queryClient.end();
  process.exit(1);
});
