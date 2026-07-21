/**
 * seed_tutor (Slice T) — establish a tutor and link them to the existing smoke
 * student so the Tutor read surface has something to show.
 *
 * Creates (under board `cbse`, idempotent):
 *  1. membership(cbse, tutor@example.com, role='tutor') via `grantRole` — the SET
 *     side of the role gate (M11). Made the REAL way, by driving the same helper
 *     `admin.setRole` drives (app_user → membership), never a direct insert.
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
import { appUser, board, student } from "@b2c/kernel/schema";
import { db, queryClient } from "../src/db/client";
import { withBoard } from "../src/db/with-board";
import { grantRole } from "../src/services/membership";

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
    // 1. grant the tutor role (idempotent, force-set) via the REAL flow (M11 SET
    // side) — the same helper `admin.setRole` drives.
    const tutor = await grantRole(tx, {
      email: TUTOR_EMAIL,
      name: TUTOR_NAME,
      board: { id: b.id, slug: b.slug },
      role: "tutor",
    });

    // 2. resolve the student PROFILE (email + user_type='student' — one email may
    // hold several profiles now). Must already exist — created on first login /
    // by onboarding. The operational `student` row is minted by onboarding (ID-3),
    // so a student who has picked a board is the one we can link.
    const [studentProfile] = await tx
      .select({ id: appUser.id })
      .from(appUser)
      .where(and(eq(appUser.email, STUDENT_EMAIL), eq(appUser.userType, "student")))
      .limit(1);
    if (!studentProfile) {
      console.warn(
        `[seed:tutor] student '${STUDENT_EMAIL}' has no student profile yet — log in as the student once (dev login) first, then re-run. The tutor role is granted; the link is skipped.`,
      );
      console.log(
        `[seed:tutor] cbse / tutor=${TUTOR_EMAIL} (role=tutor, user=${tutor.user.id}). Link to ${STUDENT_EMAIL}: SKIPPED (student not found).`,
      );
      return;
    }

    // 3. link tutor → student via the single pointer `student.tutor_id` (ID-4 —
    // tutor_student is dropped). RLS-scoped to cbse; a no-op if the student has no
    // operational row on this board yet (they haven't onboarded).
    const linked = await tx
      .update(student)
      .set({ tutorId: tutor.user.id })
      .where(eq(student.userId, studentProfile.id))
      .returning({ userId: student.userId });
    if (linked.length === 0) {
      console.warn(
        `[seed:tutor] student '${STUDENT_EMAIL}' has no operational \`student\` row on cbse yet (not onboarded). Tutor role granted; link SKIPPED.`,
      );
      return;
    }

    console.log(
      `[seed:tutor] cbse / tutor=${TUTOR_EMAIL} (role=tutor) → student=${STUDENT_EMAIL}. tutor_id=${tutor.user.id} student_id=${studentProfile.id}`,
    );
  });

  await queryClient.end();
}

main().catch(async (err) => {
  console.error("[seed:tutor] FAILED:", err);
  await queryClient.end();
  process.exit(1);
});
