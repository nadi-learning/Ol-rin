/**
 * seed_tutor (Slice T) — establish a tutor and link them to the existing smoke
 * student so the Tutor read surface has something to show.
 *
 * Creates (under board `cbse`, idempotent):
 *  1. whitelist(cbse, tutor@example.com, role='tutor') — the SET side of the role
 *     gate (M11). The tutor membership itself is created the REAL way, by driving
 *     resolveMembership (whitelist → app_user → membership), never a direct insert.
 *  2. a tutor_student link from that tutor to smoke@example.com (the student the
 *     practice/Stage-1 seeds already exercise).
 *
 * NB the tutor surface only shows PENDING observations once the student has
 * actually practised AND the Stage-1 worker has scored those attempts. So for a
 * live eyeball: `seed:ch5 && seed:practice`, log in as the student, answer a few
 * (worker running → observations written), THEN log in as tutor@example.com.
 *
 * Emails are lowercase to match what Better Auth stores at signup (M27).
 *
 * Usage: bun scripts/seed_tutor.ts
 */
import { and, eq } from "drizzle-orm";
import type { PgTransaction } from "drizzle-orm/pg-core";
import { appUser, board, tutorStudent, whitelist } from "@b2c/kernel/schema";
import { db, queryClient } from "../src/db/client";
import { withBoard } from "../src/db/with-board";
import { resolveMembership } from "../src/services/membership";

type Tx = PgTransaction<any, any, any>;

const BOARD_SLUG = "cbse";
const TUTOR_EMAIL = "tutor@example.com";
const TUTOR_NAME = "Tutor One";
const STUDENT_EMAIL = "smoke@example.com";

async function main() {
  const [b] = await db
    .select()
    .from(board)
    .where(eq(board.slug, BOARD_SLUG))
    .limit(1);
  if (!b) {
    console.error(
      `[seed:tutor] board '${BOARD_SLUG}' not found. Run \`bun run seed:ch5\` first.`,
    );
    await queryClient.end();
    process.exit(1);
  }

  await withBoard(b.id, async (tx: Tx) => {
    // 1. whitelist the tutor (idempotent), then create the membership via the
    // REAL flow (M11 SET side) so role='tutor' is enabled exactly how login does.
    await tx
      .insert(whitelist)
      .values({ boardId: b.id, email: TUTOR_EMAIL, role: "tutor" })
      .onConflictDoNothing({ target: [whitelist.boardId, whitelist.email] });
    const tutor = await resolveMembership(tx, {
      email: TUTOR_EMAIL,
      name: TUTOR_NAME,
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
        `[seed:tutor] student '${STUDENT_EMAIL}' has no app_user yet — log in as the student once (dev login) first, then re-run. Tutor + whitelist are seeded; the link is skipped.`,
      );
      console.log(
        `[seed:tutor] cbse / tutor=${TUTOR_EMAIL} (role=tutor, user=${tutor.user.id}). Link to ${STUDENT_EMAIL}: SKIPPED (student not found).`,
      );
      return;
    }

    // 3. link tutor → student (idempotent on the unique (board,tutor,student)).
    await tx
      .insert(tutorStudent)
      .values({
        boardId: b.id,
        tutorId: tutor.user.id,
        studentId: student.id,
      })
      .onConflictDoNothing({
        target: [tutorStudent.boardId, tutorStudent.tutorId, tutorStudent.studentId],
      });

    console.log(
      `[seed:tutor] cbse / tutor=${TUTOR_EMAIL} (role=tutor) → student=${STUDENT_EMAIL}. tutor_id=${tutor.user.id} student_id=${student.id}`,
    );
  });

  await queryClient.end();
}

main().catch(async (err) => {
  console.error("[seed:tutor] FAILED:", err);
  await queryClient.end();
  process.exit(1);
});
