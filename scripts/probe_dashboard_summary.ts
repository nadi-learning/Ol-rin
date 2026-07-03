/**
 * probe_dashboard_summary — Slice DASH exit gate (student home stat cards).
 *
 * Proves dashboard.getStudentSummary against the real DB + real RLS with a
 * THROWAWAY fixture (boards P/Q per run) so the canonical seeds stay pristine
 * (M22). Cleans up after itself.
 *
 * The point of this probe is the OWNERSHIP boundary (D-L-5): practice_session +
 * attempt are board-scoped by RLS but NOT user-scoped, so the summary must count
 * ONLY the caller's rows. A bystander on the same board with louder numbers must
 * never bleed in.
 *
 *   1. DB connectivity as the app role.
 *   2. caller W's summary: completed=1, active=1, time=15000ms, answered=2
 *      (1 completed session [submit q1 10s, skip q2] + 1 active session
 *       [submit q1 5s]; the skip carries null time → excluded from the sum).
 *   3. bystander X's summary is X's own (completed=1, active=0, time=100000ms) —
 *      proves each caller sees only their rows.
 *   4. OWNERSHIP: W's numbers are NOT inflated by X (W.completed=1 not 2;
 *      W.time=15000 not 115000).
 *   5. empty member Z (whitelisted, never practised) → all zeros.
 *   6. cross-board RLS: W's summary under a Q claim → all zeros (P rows invisible).
 *   7. HTTP: dashboard.getStudentSummary no session → 401 (soft).
 */
import { eq, sql } from "drizzle-orm";
import type { PgTransaction } from "drizzle-orm/pg-core";
import {
  appUser,
  attempt,
  board,
  chapter,
  membership,
  practiceSession,
  question,
  subTopic,
  subject,
  topic,
  whitelist,
} from "@b2c/kernel/schema";
import { db, queryClient } from "../src/db/client";
import { withBoard } from "../src/db/with-board";
import { skip, startSession, submitAttempt } from "../src/services/practice";
import { resolveMembership } from "../src/services/membership";
import { getStudentSummary } from "../src/services/dashboard";
import { env } from "../src/config/env";

type Tx = PgTransaction<any, any, any>;

let passed = 0;
let failed = 0;
function check(name: string, ok: boolean) {
  if (ok) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.error(`  ✗ ${name}`);
  }
}

async function main() {
  const tag = `${Date.now()}`;

  // 1. connectivity
  await db.execute(sql`select 1`);
  check("DB connectivity (select 1) as app role", true);

  const [P] = await db.insert(board).values({ slug: `dsh-p-${tag}`, name: "Probe P" }).returning();
  const [Q] = await db.insert(board).values({ slug: `dsh-q-${tag}`, name: "Probe Q" }).returning();
  if (!P || !Q) throw new Error("board seed failed");

  // Fixture under P: spine + 2 subjective questions (ordinal order) on subTopicA.
  const fx = await withBoard(P.id, async (tx: Tx) => {
    const [subj] = await tx.insert(subject).values({ boardId: P.id, slug: "phys", name: "Physics", grade: "IGCSE" }).returning();
    const [chap] = await tx.insert(chapter).values({ boardId: P.id, subjectId: subj!.id, slug: "ch", name: "Ch", ordinal: 1 }).returning();
    const [tp] = await tx.insert(topic).values({ boardId: P.id, chapterId: chap!.id, slug: "tp", name: "Tp", ordinal: 1 }).returning();
    const [stA] = await tx.insert(subTopic).values({ boardId: P.id, topicId: tp!.id, slug: "sta", name: "ST A", ordinal: 1 }).returning();
    const [q1] = await tx.insert(question).values({ boardId: P.id, subTopicId: stA!.id, axis: "conceptual", kind: "subjective", stem: "Q1", referenceAnswer: "R1", ordinal: 1, source: "b2c_authoring" }).returning();
    const [q2] = await tx.insert(question).values({ boardId: P.id, subTopicId: stA!.id, axis: "procedural", kind: "subjective", stem: "Q2", referenceAnswer: "R2", ordinal: 2, source: "b2c_authoring" }).returning();
    return { subTopicA: stA!.id, q1: q1!.id, q2: q2!.id };
  });

  // three members on P: W (caller), X (bystander with louder numbers), Z (empty).
  const emailW = `dsh-w-${tag}@example.com`;
  const emailX = `dsh-x-${tag}@example.com`;
  const emailZ = `dsh-z-${tag}@example.com`;
  await withBoard(P.id, async (tx: Tx) => {
    for (const email of [emailW, emailX, emailZ]) {
      await tx.insert(whitelist).values({ boardId: P.id, email, role: "student" });
    }
  });
  const W = await withBoard(P.id, (tx) => resolveMembership(tx, { email: emailW, name: "W", board: P }));
  const X = await withBoard(P.id, (tx) => resolveMembership(tx, { email: emailX, name: "X", board: P }));
  const Z = await withBoard(P.id, (tx) => resolveMembership(tx, { email: emailZ, name: "Z", board: P }));
  const userW = W.user.id;
  const userX = X.user.id;
  const userZ = Z.user.id;

  // ── W's practice: one COMPLETED session (submit q1 10s, skip q2) ──
  const w1 = await withBoard(P.id, (tx) => startSession(tx, { boardId: P.id, appUserId: userW, subTopicId: fx.subTopicA }));
  await withBoard(P.id, (tx) => submitAttempt(tx, { boardId: P.id, appUserId: userW, sessionId: w1.sessionId, questionId: fx.q1, answerText: "a", confidence: 4, timeMs: 10000 }));
  await withBoard(P.id, (tx) => skip(tx, { boardId: P.id, appUserId: userW, sessionId: w1.sessionId, questionId: fx.q2, reason: "skip" }));
  // ── W's second session: ACTIVE (submit q1 5s, leave q2) ──
  const w2 = await withBoard(P.id, (tx) => startSession(tx, { boardId: P.id, appUserId: userW, subTopicId: fx.subTopicA }));
  await withBoard(P.id, (tx) => submitAttempt(tx, { boardId: P.id, appUserId: userW, sessionId: w2.sessionId, questionId: fx.q1, answerText: "a", confidence: 3, timeMs: 5000 }));

  // ── X's practice: one COMPLETED session with louder numbers (submit q1 99s, q2 1s) ──
  const x1 = await withBoard(P.id, (tx) => startSession(tx, { boardId: P.id, appUserId: userX, subTopicId: fx.subTopicA }));
  await withBoard(P.id, (tx) => submitAttempt(tx, { boardId: P.id, appUserId: userX, sessionId: x1.sessionId, questionId: fx.q1, answerText: "a", confidence: 5, timeMs: 99000 }));
  await withBoard(P.id, (tx) => submitAttempt(tx, { boardId: P.id, appUserId: userX, sessionId: x1.sessionId, questionId: fx.q2, answerText: "a", confidence: 5, timeMs: 1000 }));

  // 2. W's summary
  const sumW = await withBoard(P.id, (tx) => getStudentSummary(tx, { appUserId: userW }));
  check("W: completedSessions === 1", sumW.completedSessions === 1);
  check("W: activeSessions === 1", sumW.activeSessions === 1);
  check("W: totalTimeMs === 15000 (skip's null time excluded)", sumW.totalTimeMs === 15000);
  check("W: answeredAttempts === 2 (skip excluded)", sumW.answeredAttempts === 2);

  // 3. X's summary is X's own
  const sumX = await withBoard(P.id, (tx) => getStudentSummary(tx, { appUserId: userX }));
  check("X: completedSessions === 1, activeSessions === 0", sumX.completedSessions === 1 && sumX.activeSessions === 0);
  check("X: totalTimeMs === 100000", sumX.totalTimeMs === 100000);

  // 4. OWNERSHIP — W not inflated by X (the whole point)
  check("OWNERSHIP: W.completed not inflated by X (=1, not 2)", sumW.completedSessions === 1);
  check("OWNERSHIP: W.time not inflated by X (=15000, not 115000)", sumW.totalTimeMs === 15000);

  // 5. empty member → all zeros
  const sumZ = await withBoard(P.id, (tx) => getStudentSummary(tx, { appUserId: userZ }));
  check("Z (never practised): all zeros", sumZ.completedSessions === 0 && sumZ.activeSessions === 0 && sumZ.totalTimeMs === 0 && sumZ.answeredAttempts === 0);

  // 6. cross-board RLS — W's summary under a Q claim → all zeros (P rows invisible)
  const sumWunderQ = await withBoard(Q.id, (tx) => getStudentSummary(tx, { appUserId: userW }));
  check("RLS: W's summary under board Q → all zeros", sumWunderQ.completedSessions === 0 && sumWunderQ.activeSessions === 0 && sumWunderQ.totalTimeMs === 0 && sumWunderQ.answeredAttempts === 0);

  // 7. HTTP no-session → 401 (soft)
  try {
    const res = await fetch(`http://localhost:${env.PORT}/trpc/dashboard.getStudentSummary`, { headers: { "x-board": P.slug } });
    check(`HTTP dashboard.getStudentSummary (no session) → 401 (got ${res.status})`, res.status === 401);
  } catch {
    console.log("  ~ HTTP dashboard.getStudentSummary skipped (server not running)");
  }

  // ── cleanup (FK-safe order) ──
  await withBoard(P.id, async (tx: Tx) => {
    await tx.delete(attempt).where(eq(attempt.boardId, P.id));
    await tx.delete(practiceSession).where(eq(practiceSession.boardId, P.id));
    await tx.delete(question).where(eq(question.boardId, P.id));
    await tx.delete(subTopic).where(eq(subTopic.boardId, P.id));
    await tx.delete(topic).where(eq(topic.boardId, P.id));
    await tx.delete(chapter).where(eq(chapter.boardId, P.id));
    await tx.delete(subject).where(eq(subject.boardId, P.id));
    await tx.delete(membership).where(eq(membership.boardId, P.id));
    await tx.delete(whitelist).where(eq(whitelist.boardId, P.id));
  });
  for (const email of [emailW, emailX, emailZ]) {
    await db.delete(appUser).where(eq(appUser.email, email));
  }
  await db.delete(board).where(eq(board.id, P.id));
  await db.delete(board).where(eq(board.id, Q.id));

  console.log(`\nprobe_dashboard_summary: ${passed} passed, ${failed} failed`);
  await queryClient.end();
  process.exit(failed === 0 ? 0 : 1);
}

main().catch(async (err) => {
  console.error("probe_dashboard_summary FAILED:", err);
  await queryClient.end();
  process.exit(1);
});
