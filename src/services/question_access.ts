/**
 * The question-availability predicates — "what can THIS caller practise?"
 *
 * Extracted from practice.ts in Slice MIXED (item 7). They were already shared
 * between `startSession` and `listAvailability` on purpose; `assignment.ts` is now
 * a third caller (a mixed assignment card has to say how many questions it holds
 * BEFORE the student starts, i.e. before any session has frozen anything). Moving
 * them here rather than importing practice.ts from assignment.ts avoids a cycle —
 * practice.ts already imports assertAssignedSubTopic from assignment.ts.
 *
 * practice.ts re-exports all three, so existing importers (probe_standin_marking,
 * probe_backfill_dashboard) keep working unchanged.
 *
 * Board scoping is NOT here — every caller runs inside the board-scoped tx (RLS).
 */
import { and, eq, isNull, or, sql } from "drizzle-orm";
import { attempt, question } from "@b2c/kernel/schema";

/**
 * Slice AVAIL — the ONE availability predicate: "which questions can THIS caller
 * practise?" Private-aware delivery (AUTH-v2): the canonical bank
 * (target_student_id NULL) PLUS the caller's own targeted questions; drafts never
 * served (FIG-AUTH / M11 CHECK side).
 *
 * This exists as a shared function on purpose. `startSession` SELECTs with it and
 * `listAvailability` COUNTs with it, so the browse list's "Coming soon" chip and
 * what Practice will actually serve CANNOT drift. Two copies of this predicate
 * would be a lying UI the moment one changed: a chip promising questions that
 * startSession then refuses (or worse, "Coming soon" over a student's own
 * privately-authored set). One function, three callers — drift is structural, so
 * make it impossible rather than test for it.
 */
export function visibleQuestionWhere(appUserId: string, subTopicId?: string) {
  return and(
    subTopicId ? eq(question.subTopicId, subTopicId) : undefined,
    eq(question.status, "approved"),
    or(isNull(question.targetStudentId), eq(question.targetStudentId, appUserId)),
  );
}

/**
 * Slice NEWONLY — "this caller has not already answered it."
 *
 * ANSWERED, NOT TOUCHED. The clause keys on `skip_reason IS NULL`, because a
 * skip and an answer are the SAME write: `skip()` and `submitAttempt()` both go
 * through recordAndAdvance and both insert an `attempt` row. Keying on the row's
 * existence alone would retire a question the student explicitly said "not now"
 * to — they would never see it again, which is the opposite of a skip's meaning.
 * (ai-build-miss, the "define the predicate from the WRITE the real action
 * performs" trap: the table name says `attempt`, the domain word is `answered`,
 * and they are not the same set.)
 *
 * A photo answer carries answer_text NULL with attempt_image rows, so it is NOT
 * detectable via answer_text — skip_reason is the only field that separates the
 * three cases in one predicate.
 *
 * RLS: `attempt` is tenant-scoped + FORCE RLS and this runs inside the caller's
 * board-scoped tx, so the subquery sees only this board's rows. That is wanted —
 * an attempt in another board must not retire a question here.
 */
export function unansweredExpr(appUserId: string) {
  return sql`NOT EXISTS (
    SELECT 1 FROM ${attempt} a
     WHERE a.question_id = ${question.id}
       AND a.app_user_id = ${appUserId}
       AND a.skip_reason IS NULL
  )`;
}

/**
 * Slice NEWONLY — what Practice will actually SERVE: visible AND not yet
 * answered. Founder ruling 2026-08-05: re-authoring into a sub_topic the student
 * has already worked must surface only the NEW questions, never replay the
 * finished ones. Before this, `startSession` re-froze the whole approved set on
 * every new session, so Monday's two answered questions came back on Wednesday
 * at currentIndex 0.
 */
export function availableQuestionWhere(appUserId: string, subTopicId?: string) {
  return and(visibleQuestionWhere(appUserId, subTopicId), unansweredExpr(appUserId));
}
