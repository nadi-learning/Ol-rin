/**
 * seed_parent (Slice P) — establish a parent and link them to the existing smoke
 * student so the Parent read surface has something to show.
 *
 * Creates (under board `cbse`, idempotent):
 *  1. whitelist(cbse, parent@example.com, role='parent') — the SET side of the
 *     role gate (M11). The parent membership itself is created the REAL way, by
 *     driving resolveMembership (whitelist → app_user → membership), never a
 *     direct insert.
 *  2. a parent_child link from that parent to smoke@example.com (the student the
 *     practice/Stage-1/Stage-2 seeds already exercise — so the report shows real
 *     certified mastery + a trend + practice metrics).
 *
 * For a live eyeball with real data: run the Stage-2 path first (student
 * practises → worker scores → tutor finalizes mastery), THEN log in as
 * parent@example.com to see the certified mastery + movement.
 *
 * Emails are lowercase to match what Better Auth stores at signup (M27).
 *
 * Usage: bun scripts/seed_parent.ts
 */
import { eq } from "drizzle-orm";
import type { PgTransaction } from "drizzle-orm/pg-core";
import { appUser, board, parentChild, whitelist } from "@b2c/kernel/schema";
import { db, queryClient } from "../src/db/client";
import { withBoard } from "../src/db/with-board";
import { resolveMembership } from "../src/services/membership";

type Tx = PgTransaction<any, any, any>;

const BOARD_SLUG = "cbse";
const PARENT_EMAIL = "parent@example.com";
const PARENT_NAME = "Parent One";
const STUDENT_EMAIL = "smoke@example.com";

async function main() {
  const [b] = await db
    .select()
    .from(board)
    .where(eq(board.slug, BOARD_SLUG))
    .limit(1);
  if (!b) {
    console.error(
      `[seed:parent] board '${BOARD_SLUG}' not found. Run \`bun run seed:ch5\` first.`,
    );
    await queryClient.end();
    process.exit(1);
  }

  await withBoard(b.id, async (tx: Tx) => {
    // 1. whitelist the parent (idempotent), then create the membership via the
    // REAL flow (M11 SET side) so role='parent' is enabled exactly how login does.
    await tx
      .insert(whitelist)
      .values({ boardId: b.id, email: PARENT_EMAIL, role: "parent" })
      .onConflictDoNothing({ target: [whitelist.boardId, whitelist.email] });
    const parent = await resolveMembership(tx, {
      email: PARENT_EMAIL,
      name: PARENT_NAME,
      board: { id: b.id, slug: b.slug },
    });

    // 2. resolve the student's app_user (global). Must already exist — they're
    // created on first login / by the practice seed flow.
    const [student] = await tx
      .select({ id: appUser.id })
      .from(appUser)
      .where(eq(appUser.email, STUDENT_EMAIL))
      .limit(1);
    if (!student) {
      console.warn(
        `[seed:parent] student '${STUDENT_EMAIL}' has no app_user yet — log in as the student once (dev login) first, then re-run. Parent + whitelist are seeded; the link is skipped.`,
      );
      console.log(
        `[seed:parent] cbse / parent=${PARENT_EMAIL} (role=parent, user=${parent.user.id}). Link to ${STUDENT_EMAIL}: SKIPPED (student not found).`,
      );
      return;
    }

    // 3. link parent → child (idempotent on the unique (parent,student)).
    await tx
      .insert(parentChild)
      .values({
        boardId: b.id,
        parentId: parent.user.id,
        studentId: student.id,
      })
      .onConflictDoNothing({
        target: [parentChild.parentId, parentChild.studentId],
      });

    console.log(
      `[seed:parent] cbse / parent=${PARENT_EMAIL} (role=parent) → child=${STUDENT_EMAIL}. parent_id=${parent.user.id} child_id=${student.id}`,
    );
  });

  await queryClient.end();
}

main().catch(async (err) => {
  console.error("[seed:parent] FAILED:", err);
  await queryClient.end();
  process.exit(1);
});
