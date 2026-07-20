/**
 * Removes the throwaway identity a walk created (S112). Deletes across BOTH
 * user tables — `users` (Better Auth, cascades sessions/accounts) and
 * `app_user` (the spine) — because they are separate and deleting one leaves
 * the other behind (b2c-two-user-tables).
 *
 * Memberships are RLS'd, so they are deleted per board under withBoard: a
 * board-less delete matches ZERO rows and reports success.
 *
 *   WALK_EMAIL=bpwalk-123@example.com bun scratchpad/walk_teardown.ts
 */
import { and, eq } from "drizzle-orm";
import { appUser, board, eventLog, membership, onboarding, users } from "@b2c/kernel/schema";
import { db, queryClient } from "../src/db/client";
import { withBoard } from "../src/db/with-board";

const email = process.env.WALK_EMAIL;
if (!email) {
  console.error("WALK_EMAIL is required");
  process.exit(1);
}

const [u] = await db.select({ id: appUser.id }).from(appUser).where(eq(appUser.email, email));
if (u) {
  for (const b of await db.select({ id: board.id, slug: board.slug }).from(board)) {
    const n = await withBoard(b.id, async (tx) => {
      // Slice H (S115): the tour walk is the first to OPEN a lesson, which writes
      // a `revision_visit` into event_log — and `app_user` is FK-referenced from
      // there, so the delete below fails with 23503 unless these go first. Also
      // RLS'd, hence per-board inside withBoard like the rest.
      await tx
        .delete(eventLog)
        .where(and(eq(eventLog.studentId, u.id), eq(eventLog.boardId, b.id)));
      await tx
        .delete(onboarding)
        .where(and(eq(onboarding.userId, u.id), eq(onboarding.boardId, b.id)));
      const r = await tx
        .delete(membership)
        .where(and(eq(membership.userId, u.id), eq(membership.boardId, b.id)))
        .returning();
      return r.length;
    });
    if (n) console.log(`  – removed membership on ${b.slug}`);
  }
  await db.delete(appUser).where(eq(appUser.id, u.id));
  console.log("  – removed app_user");
}
const gone = await db.delete(users).where(eq(users.email, email)).returning();
if (gone.length) console.log("  – removed Better Auth user (cascades sessions/accounts)");

console.log(`teardown done for ${email}`);
await queryClient.end();
