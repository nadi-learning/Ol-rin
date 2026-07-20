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
import { and, eq, sql } from "drizzle-orm";
import type { PgTransaction } from "drizzle-orm/pg-core";
import { attempt, eventLog, practiceSession } from "@b2c/kernel/schema";
import { REVISION_VISIT_EVENT } from "./revision";

type Tx = PgTransaction<any, any, any>;

export type StudentSummary = {
  completedSessions: number;
  activeSessions: number;
  totalTimeMs: number;
  answeredAttempts: number;
  /**
   * Slice DASH-FR — has this student ever begun ANY practice? The dashboard's
   * first-run landing (Olórin's welcome, "start here", "Start" instead of
   * "Continue") hangs off this one flag, and the founder's rule is that the
   * first-run state lasts "until they start their first lesson".
   *
   * Derived HERE rather than in the component so the definition of "started"
   * lives with the data it is derived from — a client-side
   * `completed === 0 && active === 0` would silently stop being true the day a
   * fourth counter is added.
   */
  hasStarted: boolean;
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

  const answeredAttempts = agg?.answeredAttempts ?? 0;

  // 🔑 OPENING a lesson writes NO practice row — a practice_session is only
  // created once the student begins the question pass. So the practice tables
  // alone answer "has PRACTISED", not "has started a lesson", and a student who
  // had read three chapters would still have been told "Start here". The
  // revision-visit event is the signal that actually fires on open; verified by
  // clicking through the real flow, not assumed.
  const [visits] = await tx
    .select({ n: sql<number>`count(*)::int` })
    .from(eventLog)
    .where(and(eq(eventLog.studentId, args.appUserId), eq(eventLog.eventType, REVISION_VISIT_EVENT)));

  return {
    completedSessions,
    activeSessions,
    totalTimeMs: agg?.totalTimeMs ?? 0,
    answeredAttempts,
    // Deliberately generous — leaving the welcome up for someone who has
    // already begun is a worse failure than retiring it one visit early.
    hasStarted:
      completedSessions > 0 ||
      activeSessions > 0 ||
      answeredAttempts > 0 ||
      (visits?.n ?? 0) > 0,
  };
}
