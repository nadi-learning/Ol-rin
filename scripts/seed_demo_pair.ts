/**
 * seed_demo_pair — a clean tutor↔student pair for LOCAL dev testing.
 *
 * Creates (idempotently) a tutor and a student on the cbse board, linked
 * (student.tutor_id → tutor), with the student's onboarding marked complete so
 * they land on the dashboard rather than the onboarding flow. Goes through the
 * real service fns (grantRole / ensureProfile) so the rows match the product's
 * shape exactly — the tutor gets a `tutor` row (enabled, boards=[cbse]).
 *
 * Dev login signs up the Better Auth user on first use, so NO auth rows are
 * pre-seeded here — these are the DOMAIN profiles, linked by email. Flow to use:
 * open the landing picker → click the lane → dev-login with the email below.
 *
 *   TUTOR:   tutor@example.com   → click "Tutor",   dev-login  → tutor surface
 *   STUDENT: student@example.com → click "Student", dev-login  → dashboard
 *
 * LOCAL ONLY — reads DATABASE_URL from .env (localhost:5435/b2c). Never point
 * this at prod. Re-runnable: updates the same rows.
 *
 *   bun scripts/seed_demo_pair.ts
 */
import { eq } from "drizzle-orm";
import { board, onboarding, student } from "@b2c/kernel/schema";
import { db, queryClient } from "../src/db/client";
import { withBoard } from "../src/db/with-board";
import { ensureProfile, grantRole } from "../src/services/membership";

const TUTOR_EMAIL = "tutor@example.com";
const STUDENT_EMAIL = "student@example.com";
const CLASS = "9"; // one of SUPPORTED_GRADES (8|9|10|11)

async function main() {
  const [b] = await db
    .select({ id: board.id, slug: board.slug })
    .from(board)
    .where(eq(board.slug, "cbse"));
  if (!b) throw new Error("cbse board not found locally — seed boards first");

  await withBoard(b.id, async (tx) => {
    // Tutor — grantRole mints the app_user profile + an enabled `tutor` row
    // (boards=[cbse]), exactly as /admin does. Without this the tutor lands in
    // the waiting room.
    const tutor = await grantRole(tx, {
      email: TUTOR_EMAIL,
      name: "Demo Tutor",
      board: b,
      role: "tutor",
    });

    // Student profile shell, then the operational student row linked to the tutor.
    const stu = await ensureProfile(tx, {
      email: STUDENT_EMAIL,
      name: "Demo Student",
      userType: "student",
    });
    await tx
      .insert(student)
      .values({
        userId: stu.id,
        boardId: b.id,
        class: CLASS,
        pronoun: "they",
        tutorId: tutor.user.id,
        status: "active",
        onboardingAt: new Date(),
      })
      .onConflictDoUpdate({
        target: student.userId,
        set: { boardId: b.id, class: CLASS, pronoun: "they", tutorId: tutor.user.id },
      });

    // Mark onboarding complete so the student lands on the dashboard (a student
    // row with no onboarding header reads "needs it" — see onboarding.getState).
    const [head] = await tx
      .select({ userId: onboarding.userId })
      .from(onboarding)
      .where(eq(onboarding.userId, stu.id))
      .limit(1);
    if (head) {
      await tx
        .update(onboarding)
        .set({ status: "completed", state: "done" })
        .where(eq(onboarding.userId, stu.id));
    } else {
      await tx.insert(onboarding).values({
        userId: stu.id,
        status: "completed",
        state: "done",
      });
    }

    console.log(`✓ tutor   ${TUTOR_EMAIL}   (id ${tutor.user.id}) — tutor row on cbse`);
    console.log(`✓ student ${STUDENT_EMAIL} (id ${stu.id}) — class ${CLASS}, tutor_id → tutor, onboarding completed`);
  });

  console.log("\nseed_demo_pair: done (cbse).");
  console.log("  Landing → click the lane → dev-login:");
  console.log(`    Tutor   → ${TUTOR_EMAIL}`);
  console.log(`    Student → ${STUDENT_EMAIL}`);
  await queryClient.end();
}

main().catch(async (e) => {
  console.error("seed_demo_pair FAILED:", e);
  await queryClient.end();
  process.exit(1);
});
