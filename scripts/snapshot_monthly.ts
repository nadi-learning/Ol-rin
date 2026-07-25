/**
 * snapshot_monthly — run the CLOCK-2 monthly mastery snapshot ONCE, by hand.
 *
 * The recurring capture is a BullMQ repeatable registered at worker boot
 * (queue.ts / worker/index.ts). This script is for: an ops re-run, a backfill of
 * a specific month, or seeding a demo student's "last month" baseline. It calls
 * the SAME service the worker does, synchronously across every board. Idempotent
 * (ON CONFLICT DO NOTHING per student) — safe to run twice.
 *
 *   bun scripts/snapshot_monthly.ts            # capture the current month
 *   bun scripts/snapshot_monthly.ts 2026-06-01 # backfill a specific month boundary
 */
import { board } from "@b2c/kernel/schema";
import { db, queryClient } from "../src/db/client";
import { withBoard } from "../src/db/with-board";
import { monthPeriod, runMonthlySnapshot } from "../src/services/snapshot";

async function main() {
  const arg = process.argv[2];
  if (arg && !/^\d{4}-\d{2}-01$/.test(arg)) {
    throw new Error(`period must be a first-of-month YYYY-MM-01 (got "${arg}")`);
  }
  const period = arg ?? monthPeriod(new Date());

  const boards = await db.select({ id: board.id, slug: board.slug }).from(board);
  let written = 0;
  let skipped = 0;
  for (const b of boards) {
    const r = await withBoard(b.id, (tx) =>
      runMonthlySnapshot(tx, { boardId: b.id, period }),
    );
    written += r.written;
    skipped += r.skipped;
    console.log(`  ${b.slug}: ${r.written} written, ${r.skipped} already-captured`);
  }
  console.log(
    `\nsnapshot_monthly ${period}: ${written} written, ${skipped} already-captured across ${boards.length} board(s)`,
  );
  await queryClient.end();
}

main().catch(async (err) => {
  console.error("snapshot_monthly FAILED:", err);
  await queryClient.end();
  process.exit(1);
});
