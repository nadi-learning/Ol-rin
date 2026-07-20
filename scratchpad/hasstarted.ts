/**
 * Slice H walk helper (S115) — prints a student's `hasStarted` inputs.
 *
 * The tour's whole lifecycle hangs on this one flag, and M64 is in the log
 * because it was once defined from an ASSUMED data model and shipped green while
 * it never flipped. So the walk does not infer "the tour retired ⇒ an event was
 * written" from the DOM — it asks the database at each checkpoint.
 *
 *   bun scratchpad/hasstarted.ts <email>   →  hasStarted=false visits=0 attempts=0 …
 */
import { eq, and, sql } from "drizzle-orm";
import { appUser, board, membership } from "@b2c/kernel/schema";
import { db, queryClient } from "../src/db/client";
import { withBoard } from "../src/db/with-board";
import { getStudentSummary } from "../src/services/dashboard";

const email = process.argv[2];
if (!email) {
  console.error("usage: bun scratchpad/hasstarted.ts <email>");
  process.exit(1);
}

const [u] = await db.select().from(appUser).where(eq(appUser.email, email));
if (!u) throw new Error(`no app_user for ${email}`);

const boards = await db.select().from(board);
let found: { boardId: string } | null = null;
for (const b of boards) {
  const rows = await withBoard(b.id, (tx) =>
    tx.select().from(membership).where(and(eq(membership.userId, u.id), eq(membership.boardId, b.id))),
  );
  if (rows.length) {
    found = { boardId: b.id };
    break;
  }
}
if (!found) throw new Error(`${email} belongs to no board`);

// Read through the SAME service the dashboard reads, not a hand-rolled query —
// a second implementation of the flag could agree with my assumption and
// disagree with the product (M64's exact failure).
const s = await withBoard(found.boardId, (tx) =>
  getStudentSummary(tx as any, { boardId: found!.boardId, appUserId: u.id }),
);

const events = await withBoard(found.boardId, (tx) =>
  tx.execute(sql`select event_type, count(*)::int n from event_log where student_id = ${u.id} group by 1`),
);

console.log(
  `hasStarted=${s.hasStarted} completed=${s.completedSessions} active=${s.activeSessions} attempts=${s.answeredAttempts} events=[${(events as any[]).map((r: any) => `${r.event_type}:${r.n}`).join(",") || "none"}]`,
);
await queryClient.end();
