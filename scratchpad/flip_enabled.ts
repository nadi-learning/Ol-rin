/**
 * S123 local-only — flip one@example.com's TUTOR and PARENT profiles to
 * enabled=false so the contact signboard renders for them.
 *
 * 🔴 RLS-aware (withBoard). `membership` is tenant-scoped, so an unscoped
 * UPDATE would match ZERO rows and report a confident success having changed
 * nothing — the same trap that made the pronoun sweep return an empty set.
 *
 * 🔴 STUDENT IS DELIBERATELY EXCLUDED. A student is never gated, and flipping
 * theirs would be a state the product cannot otherwise produce.
 */
import { and, eq, inArray } from "drizzle-orm";
import { appUser, board as boardTable, membership } from "@b2c/kernel/schema";
import { db, queryClient } from "../src/db/client";
import { withBoard } from "../src/db/with-board";

const EMAIL = "one@example.com";
const boards = await db.select({ id: boardTable.id, slug: boardTable.slug }).from(boardTable);

for (const b of boards) {
  await withBoard(b.id, async (tx) => {
    const [u] = await tx.select({ id: appUser.id }).from(appUser).where(eq(appUser.email, EMAIL)).limit(1);
    if (!u) return;
    const before = await tx
      .select({ role: membership.role, enabled: membership.enabled })
      .from(membership)
      .where(and(eq(membership.userId, u.id), eq(membership.boardId, b.id)));
    if (!before.length) return;

    const updated = await tx
      .update(membership)
      .set({ enabled: false })
      .where(
        and(
          eq(membership.userId, u.id),
          eq(membership.boardId, b.id),
          inArray(membership.role, ["tutor", "parent"]),
        ),
      )
      .returning({ role: membership.role, enabled: membership.enabled });

    const after = await tx
      .select({ role: membership.role, enabled: membership.enabled })
      .from(membership)
      .where(and(eq(membership.userId, u.id), eq(membership.boardId, b.id)));
    console.log(`[${b.slug}] before:`, before, "\n         updated:", updated, "\n         after:", after);
  });
}
await queryClient.end();
