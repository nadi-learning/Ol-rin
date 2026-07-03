/**
 * Student dashboard summary (Slice DASH) — the read behind the home surface's
 * three stat cards. NO AI, NO mastery, NO writes. Aggregates the CALLER'S OWN
 * practice history into headline numbers:
 *   - completedSessions  → practice_session WHERE status='completed'
 *   - activeSessions     → practice_session WHERE status='active'  ("in progress")
 *   - totalTimeMs        → SUM(attempt.time_ms)   (skips carry null → ignored)
 *   - answeredAttempts   → COUNT(attempt WHERE answer_text IS NOT NULL)
 *
 * Ownership boundary (D-L-5, the same rule practice.ts enforces): practice_session
 * and attempt are board-scoped by RLS but NOT user-scoped — two students share a
 * board. So every aggregate filters by app_user_id = the caller. RLS (the
 * board-scoped tx from protectedProcedure) is the outer wall; the app_user_id
 * filter is the inner one. The probe proves a second student's rows never leak in.
 *
 * The lesson LIST on the dashboard is served separately by revision.getChapterNav
 * (already RLS-scoped) — this service is only the numeric summary.
 */
import { eq, sql } from "drizzle-orm";
import type { PgTransaction } from "drizzle-orm/pg-core";
import { attempt, practiceSession } from "@b2c/kernel/schema";

type Tx = PgTransaction<any, any, any>;

export type StudentSummary = {
  completedSessions: number;
  activeSessions: number;
  totalTimeMs: number;
  answeredAttempts: number;
};

export async function getStudentSummary(
  tx: Tx,
  args: { appUserId: string },
): Promise<StudentSummary> {
  // Session counts by status in one grouped query (the caller's only).
  const sessionRows = await tx
    .select({
      status: practiceSession.status,
      n: sql<number>`count(*)::int`,
    })
    .from(practiceSession)
    .where(eq(practiceSession.appUserId, args.appUserId))
    .groupBy(practiceSession.status);

  let completedSessions = 0;
  let activeSessions = 0;
  for (const r of sessionRows) {
    if (r.status === "completed") completedSessions = r.n;
    else if (r.status === "active") activeSessions = r.n;
  }

  // Time + answered-attempt count in one query. ::int (not bigint) → postgres-js
  // returns a JS number; a single student's total practice ms can't approach the
  // int4 ceiling (~24.8 days of continuous practice), so the cast is safe here.
  const [agg] = await tx
    .select({
      totalTimeMs: sql<number>`coalesce(sum(${attempt.timeMs}), 0)::int`,
      answeredAttempts: sql<number>`count(*) filter (where ${attempt.answerText} is not null)::int`,
    })
    .from(attempt)
    .where(eq(attempt.appUserId, args.appUserId));

  return {
    completedSessions,
    activeSessions,
    totalTimeMs: agg?.totalTimeMs ?? 0,
    answeredAttempts: agg?.answeredAttempts ?? 0,
  };
}
