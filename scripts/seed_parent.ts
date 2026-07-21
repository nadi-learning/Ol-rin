/**
 * seed_parent (Slice P) — establish a parent and link them to the existing smoke
 * student so the Parent read surface has something to show.
 *
 * Creates (under board `cbse`, idempotent):
 *  1. membership(cbse, parent@example.com, role='parent') via `grantRole` — the
 *     SET side of the role gate (M11). Made the REAL way, by driving the same
 *     helper `admin.setRole` drives (app_user → membership), never a direct
 *     insert.
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
import { and, eq } from "drizzle-orm";
import type { PgTransaction } from "drizzle-orm/pg-core";
import { appUser, board, student } from "@b2c/kernel/schema";
import { db, queryClient } from "../src/db/client";
import { withBoard } from "../src/db/with-board";
import { grantRole } from "../src/services/membership";

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
    // 1. grant the parent role (idempotent, force-set) via the REAL flow (M11 SET
    // side) — the same helper `admin.setRole` drives.
    const parent = await grantRole(tx, {
      email: PARENT_EMAIL,
      name: PARENT_NAME,
      board: { id: b.id, slug: b.slug },
      role: "parent",
    });

    // 2. resolve the student PROFILE (email + user_type='student' — one email may
    // hold several profiles now). Must already exist — created on first login /
    // by onboarding, which mints the operational `student` row (ID-3).
    const [studentProfile] = await tx
      .select({ id: appUser.id })
      .from(appUser)
      .where(and(eq(appUser.email, STUDENT_EMAIL), eq(appUser.userType, "student")))
      .limit(1);
    if (!studentProfile) {
      console.warn(
        `[seed:parent] student '${STUDENT_EMAIL}' has no student profile yet — log in as the student once (dev login) first, then re-run. The parent role is granted; the link is skipped.`,
      );
      console.log(
        `[seed:parent] cbse / parent=${PARENT_EMAIL} (role=parent, user=${parent.user.id}). Link to ${STUDENT_EMAIL}: SKIPPED (student not found).`,
      );
      return;
    }

    // 3. link parent → child via the single pointer `student.parent_id` (ID-4 —
    // parent_child is dropped). RLS-scoped to cbse; a no-op if the student has no
    // operational row on this board yet (they haven't onboarded).
    const linked = await tx
      .update(student)
      .set({ parentId: parent.user.id })
      .where(eq(student.userId, studentProfile.id))
      .returning({ userId: student.userId });
    if (linked.length === 0) {
      console.warn(
        `[seed:parent] student '${STUDENT_EMAIL}' has no operational \`student\` row on cbse yet (not onboarded). Parent role granted; link SKIPPED.`,
      );
      return;
    }

    console.log(
      `[seed:parent] cbse / parent=${PARENT_EMAIL} (role=parent) → child=${STUDENT_EMAIL}. parent_id=${parent.user.id} child_id=${studentProfile.id}`,
    );
  });

  await queryClient.end();
}

main().catch(async (err) => {
  console.error("[seed:parent] FAILED:", err);
  await queryClient.end();
  process.exit(1);
});
