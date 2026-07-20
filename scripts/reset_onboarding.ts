/**
 * reset_onboarding (Slice ONB-1 Stage 2) — stand up the welcome's test student
 * and replay the flow from beat 1.
 *
 * Onboarding is a FIRST-LOGIN surface: once you've walked it, it's gone. That
 * makes it the one flow you cannot iterate on without a reset — hence this.
 *
 * Does two things, both idempotent:
 *  1. membership(cbse, demo@example.com, role='student'), made the REAL way by
 *     driving `grantRole` (app_user → membership) — the same helper
 *     `admin.setRole` drives, never a direct insert (M11 — a seeded precondition
 *     that bypasses the real path proves nothing).
 *  2. DELETEs the student's `onboarding` row, so the next login starts at
 *     `greet` with a clean slate.
 *
 * Emails are lowercase to match what Better Auth stores at signup (M27).
 *
 * Usage:
 *   bun run reset:onboarding          # ensure the student + wipe the row
 *   bun run reset:onboarding --keep   # ensure the student only, leave progress intact
 *   bun run reset:onboarding --fresh  # ALSO wipe practice history (see below)
 *
 * Then: log in at :5174 as demo@example.com / dev-password-123 (dev login).
 *
 * ── --fresh (Slice DASH-FR) ────────────────────────────────────────────────
 * Clearing the onboarding row alone does NOT make a first-time student: the
 * dashboard's first-run landing (Olórin's welcome, "Start here", "Start" not
 * "Continue") hangs off `summary.hasStarted`, which reads practice history —
 * so a demo account that has ever opened a lesson keeps showing the returning
 * -student dashboard no matter how often onboarding is reset. `--fresh` also
 * deletes this student's practice rows so the first-run surface is reachable.
 *
 * ⚠️ DESTRUCTIVE and dev-only by intent. Every FK here is NO ACTION (nothing
 * cascades), so the delete order below is load-bearing:
 *     attempt_image + observation → attempt → upload_token → practice_session
 * Observations are mastery EVIDENCE, not just telemetry — they have to go
 * because they reference attempts, which is precisely why this is opt-in and
 * never the default.
 */
import { and, eq, inArray } from "drizzle-orm";
import type { PgTransaction } from "drizzle-orm/pg-core";
import {
  attempt,
  attemptImage,
  board,
  eventLog,
  observation,
  onboarding,
  practiceSession,
  uploadToken,
} from "@b2c/kernel/schema";
import { db, queryClient } from "../src/db/client";
import { withBoard } from "../src/db/with-board";
import { grantRole } from "../src/services/membership";

type Tx = PgTransaction<any, any, any>;

const BOARD_SLUG = "cbse";
const DEMO_EMAIL = "demo@example.com";
const DEMO_NAME = "Demo Student";
const keep = process.argv.includes("--keep");
const fresh = process.argv.includes("--fresh");

async function main() {
  const [b] = await db.select().from(board).where(eq(board.slug, BOARD_SLUG)).limit(1);
  if (!b) {
    console.error(`[reset:onboarding] board '${BOARD_SLUG}' not found. Run \`bun run seed:ch5\` first.`);
    await queryClient.end();
    process.exit(1);
  }

  await withBoard(b.id, async (tx: Tx) => {
    const m = await grantRole(tx, {
      email: DEMO_EMAIL,
      name: DEMO_NAME,
      board: { id: b.id, slug: b.slug },
      role: "student",
    });

    if (keep) {
      console.log(`[reset:onboarding] student membership ok, progress KEPT (user=${m.user.id})`);
      return;
    }

    if (fresh) {
      // Children first — every FK here is NO ACTION, so a parent-first delete
      // fails loudly rather than cascading. Scoped to THIS student: practice
      // rows are board-scoped by RLS but shared across students (D-L-5), so
      // app_user_id is the inner wall, exactly as the services do it.
      const sessions = await tx
        .select({ id: practiceSession.id })
        .from(practiceSession)
        .where(eq(practiceSession.appUserId, m.user.id));
      const attempts = await tx
        .select({ id: attempt.id })
        .from(attempt)
        .where(eq(attempt.appUserId, m.user.id));
      const sessionIds = sessions.map((r) => r.id);
      const attemptIds = attempts.map((r) => r.id);

      if (attemptIds.length) {
        await tx.delete(attemptImage).where(inArray(attemptImage.attemptId, attemptIds));
        await tx.delete(observation).where(inArray(observation.attemptId, attemptIds));
      }
      // Teach-back observations carry no attempt_id, so the line above cannot
      // reach them — clear the student's remaining evidence explicitly or the
      // "fresh" student still has mastery from a previous life.
      // NB: observation names this column `studentId`, not `appUserId` like the
      // practice tables — same person, different column name.
      await tx.delete(observation).where(eq(observation.studentId, m.user.id));
      if (sessionIds.length) {
        await tx.delete(uploadToken).where(inArray(uploadToken.practiceSessionId, sessionIds));
      }
      await tx.delete(attempt).where(eq(attempt.appUserId, m.user.id));
      await tx.delete(practiceSession).where(eq(practiceSession.appUserId, m.user.id));

      // Load-bearing: OPENING a lesson writes only an event_log row, no practice
      // row at all, and `hasStarted` counts those visits. Skip this and the
      // student still reads as "already started" no matter what else is wiped.
      const events = await tx
        .delete(eventLog)
        .where(eq(eventLog.studentId, m.user.id))
        .returning({ id: eventLog.id });

      console.log(
        `[reset:onboarding] --fresh: deleted ${sessionIds.length} session(s), ` +
          `${attemptIds.length} attempt(s) + their images/observations, ` +
          `${events.length} event(s) → hasStarted is now false`,
      );
    }

    const gone = await tx
      .delete(onboarding)
      .where(and(eq(onboarding.userId, m.user.id), eq(onboarding.boardId, b.id)))
      .returning({ id: onboarding.id });

    console.log(
      `[reset:onboarding] ${BOARD_SLUG} / ${DEMO_EMAIL} (role=${m.role}, user=${m.user.id}) — ` +
        `${gone.length ? "onboarding row DELETED" : "no onboarding row (already clean)"} → next login starts at 'greet'`,
    );
  });

  await queryClient.end();
}

main().catch(async (err) => {
  console.error("[reset:onboarding] FAILED:", err);
  await queryClient.end();
  process.exit(1);
});
