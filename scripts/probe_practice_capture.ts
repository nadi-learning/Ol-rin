/**
 * probe_practice_capture — Slice L exit gate (Practice capture, NO AI).
 *
 * Proves the practice.* service against the real DB + real RLS, using a
 * THROWAWAY fixture (unique per-run boards P/Q) so the canonical seeds stay
 * pristine (M22). Cleans up after itself.
 *
 *   1. DB connectivity as the app role.
 *   2. startSession → session created, question_ids frozen in ordinal order,
 *      currentIndex 0, first question PROJECTED.
 *   3. SECURITY BOUNDARY (the point of M11 here): no reference_answer /
 *      explanation / pedagogical_note ever appears in the start/get payloads —
 *      checked per-object AND on the serialized JSON.
 *   4. submitAttempt → attempt row PERSISTS with all signals (answer/confidence/
 *      time_ms), index advances, reveal returns the reference answer (D-L-3).
 *   5. skip → attempt row persists with skip_reason (no answer), advances.
 *   6. completion → status 'completed', next null; resume returns the SAME
 *      active session mid-way (D-L-1 fork-on-start, no parallel session).
 *   7. guards: QUESTION_MISMATCH (wrong id) · SESSION_COMPLETED (after done).
 *   8. NO_QUESTIONS when the sub_topic has no seeded questions.
 *   9. ownership: another user on the SAME board → PRACTICE_SESSION_NOT_FOUND.
 *  10. cross-board RLS: P's session under a Q claim → PRACTICE_SESSION_NOT_FOUND.
 *  11. membership gate, both sides (M11).
 *  12. HTTP: practice.getSession no session → 401 (soft).
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
} from "@b2c/kernel/schema";
import { db, queryClient } from "../src/db/client";
import { withBoard } from "../src/db/with-board";
import {
  getSession,
  NoQuestionsError,
  PracticeSessionNotFoundError,
  QuestionMismatchError,
  SessionCompletedError,
  skip,
  startSession,
  submitAttempt,
} from "../src/services/practice";
import {
  grantRole,
  NoMembershipError,
  requireMembership,
} from "../src/services/membership";
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

  const [P] = await db.insert(board).values({ slug: `prl-p-${tag}`, name: "Probe P" }).returning();
  const [Q] = await db.insert(board).values({ slug: `prl-q-${tag}`, name: "Probe Q" }).returning();
  if (!P || !Q) throw new Error("board seed failed");

  // Fixture under P: spine + 2 questions (known keys) on subTopicA, 0 on subTopicB.
  const fx = await withBoard(P.id, async (tx: Tx) => {
    const [subj] = await tx.insert(subject).values({ boardId: P.id, slug: "phys", name: "Physics", grade: "IGCSE" }).returning();
    const [chap] = await tx.insert(chapter).values({ boardId: P.id, subjectId: subj!.id, slug: "ch", name: "Ch", ordinal: 1 }).returning();
    const [tp] = await tx.insert(topic).values({ boardId: P.id, chapterId: chap!.id, slug: "tp", name: "Tp", ordinal: 1 }).returning();
    const [stA] = await tx.insert(subTopic).values({ boardId: P.id, topicId: tp!.id, slug: "sta", name: "ST A", ordinal: 1 }).returning();
    const [stB] = await tx.insert(subTopic).values({ boardId: P.id, topicId: tp!.id, slug: "stb", name: "ST B", ordinal: 2 }).returning();
    // insert q2 before q1 to prove ordinal ordering (not insertion order)
    const [q2] = await tx.insert(question).values({ boardId: P.id, subTopicId: stA!.id, axis: "procedural", kind: "subjective", stem: "Q2 stem", referenceAnswer: "REF_A2", explanation: "EXPL_A2", pedagogicalNote: "NOTE_A2", ordinal: 2, source: "b2c_authoring" }).returning();
    const [q1] = await tx.insert(question).values({ boardId: P.id, subTopicId: stA!.id, axis: "conceptual", kind: "subjective", stem: "Q1 stem", referenceAnswer: "REF_A1", explanation: "EXPL_A1", pedagogicalNote: "NOTE_A1", ordinal: 1, source: "b2c_authoring" }).returning();
    return { subTopicA: stA!.id, subTopicB: stB!.id, q1: q1!.id, q2: q2!.id };
  });

  // two members on board P (owner W + bystander X) via the REAL flow (M11)
  const emailW = `prl-w-${tag}@example.com`;
  const emailX = `prl-x-${tag}@example.com`;
  const W = await withBoard(P.id, (tx) => grantRole(tx, { email: emailW, name: "W", board: P, role: "student" }));
  const X = await withBoard(P.id, (tx) => grantRole(tx, { email: emailX, name: "X", board: P, role: "student" }));
  const userW = W.user.id;
  const userX = X.user.id;

  // 2. startSession
  const s1 = await withBoard(P.id, (tx) => startSession(tx, { boardId: P.id, appUserId: userW, subTopicId: fx.subTopicA }));
  check("startSession → 2 questions total", s1.total === 2);
  check("startSession → currentIndex 0, status active", s1.currentIndex === 0 && s1.status === "active");
  check("startSession → first question is Q1 (ordinal order, not insert order)", s1.question?.stem === "Q1 stem");
  check("startSession → question carries axis/kind/ordinal", s1.question?.axis === "conceptual" && s1.question?.kind === "subjective" && s1.question?.ordinal === 1);
  const sessionId = s1.sessionId;

  // 3. SECURITY — no answer key on read
  const startSerialized = JSON.stringify(s1);
  const startClean =
    !("referenceAnswer" in (s1.question as any)) &&
    !("explanation" in (s1.question as any)) &&
    !("pedagogicalNote" in (s1.question as any));
  check("startSession question object has no key fields", startClean);
  check("startSession payload has no reference text (REF_/EXPL_/NOTE_)", !/REF_|EXPL_|NOTE_/.test(startSerialized));

  const got = await withBoard(P.id, (tx) => getSession(tx, { sessionId, appUserId: userW }));
  check("getSession → same current question (Q1)", got.question?.stem === "Q1 stem" && got.currentIndex === 0);
  check("getSession payload has no reference text", !/REF_|EXPL_|NOTE_/.test(JSON.stringify(got)));

  // 4. submitAttempt → persists + advances + reveals
  const r1 = await withBoard(P.id, (tx) => submitAttempt(tx, { boardId: P.id, appUserId: userW, sessionId, questionId: fx.q1, answerText: "my answer", confidence: 4, timeMs: 12000 }));
  check("submitAttempt → reveal returns reference answer (REF_A1)", r1.reveal.referenceAnswer === "REF_A1" && r1.reveal.explanation === "EXPL_A1");
  check("submitAttempt → advances to index 1, not completed", r1.currentIndex === 1 && r1.completed === false);
  check("submitAttempt → next question is Q2", r1.next?.stem === "Q2 stem");

  const att1 = await withBoard(P.id, (tx) =>
    tx.select().from(attempt).where(eq(attempt.practiceSessionId, sessionId)),
  );
  const a1 = att1.find((a: any) => a.questionId === fx.q1);
  check("attempt PERSISTED with answer_text + confidence + time_ms", a1?.answerText === "my answer" && a1?.confidence === 4 && a1?.timeMs === 12000 && a1?.skipReason === null);
  check("attempt carries board + session + user", a1?.boardId === P.id && a1?.appUserId === userW);

  // 5. resume returns the SAME active session (no parallel session)
  const resumed = await withBoard(P.id, (tx) => startSession(tx, { boardId: P.id, appUserId: userW, subTopicId: fx.subTopicA }));
  check("resume → same session id, mid-way (index 1, Q2)", resumed.sessionId === sessionId && resumed.currentIndex === 1 && resumed.question?.stem === "Q2 stem");

  // 6. skip the last question → completes
  const r2 = await withBoard(P.id, (tx) => skip(tx, { boardId: P.id, appUserId: userW, sessionId, questionId: fx.q2, reason: "too hard" }));
  check("skip → completed, next null", r2.completed === true && r2.next === null && r2.currentIndex === 2);
  check("skip → still reveals reference answer (REF_A2)", r2.reveal.referenceAnswer === "REF_A2");

  const att2 = await withBoard(P.id, (tx) => tx.select().from(attempt).where(eq(attempt.practiceSessionId, sessionId)));
  const a2 = att2.find((a: any) => a.questionId === fx.q2);
  check("skip attempt PERSISTED with skip_reason, null answer", a2?.skipReason === "too hard" && a2?.answerText === null && a2?.confidence === null);
  check("two attempts captured for the session", att2.length === 2);

  const doneView = await withBoard(P.id, (tx) => getSession(tx, { sessionId, appUserId: userW }));
  check("getSession after completion → status completed, question null", doneView.status === "completed" && doneView.question === null);

  // 7. guards
  let mismatch = false;
  // fresh session to test mismatch on an active session
  const s2 = await withBoard(P.id, (tx) => startSession(tx, { boardId: P.id, appUserId: userX, subTopicId: fx.subTopicA }));
  try {
    await withBoard(P.id, (tx) => submitAttempt(tx, { boardId: P.id, appUserId: userX, sessionId: s2.sessionId, questionId: fx.q2, answerText: "x", confidence: 3, timeMs: 100 }));
  } catch (e) {
    mismatch = e instanceof QuestionMismatchError;
  }
  check("submit wrong questionId (not current) → QuestionMismatchError", mismatch);

  let completedGuard = false;
  try {
    await withBoard(P.id, (tx) => submitAttempt(tx, { boardId: P.id, appUserId: userW, sessionId, questionId: fx.q1, answerText: "again", confidence: 3, timeMs: 100 }));
  } catch (e) {
    completedGuard = e instanceof SessionCompletedError;
  }
  check("submit on a completed session → SessionCompletedError", completedGuard);

  // 8. NO_QUESTIONS
  let noQ = false;
  try {
    await withBoard(P.id, (tx) => startSession(tx, { boardId: P.id, appUserId: userW, subTopicId: fx.subTopicB }));
  } catch (e) {
    noQ = e instanceof NoQuestionsError;
  }
  check("startSession on a sub_topic with no questions → NoQuestionsError", noQ);

  // 9. ownership: bystander X cannot read W's session
  let notOwned = false;
  try {
    await withBoard(P.id, (tx) => getSession(tx, { sessionId, appUserId: userX }));
  } catch (e) {
    notOwned = e instanceof PracticeSessionNotFoundError;
  }
  check("another user (same board) → PracticeSessionNotFoundError", notOwned);

  // 10. cross-board RLS: W's session invisible under a Q claim
  let crossBoard = false;
  try {
    await withBoard(Q.id, (tx) => getSession(tx, { sessionId, appUserId: userW }));
  } catch (e) {
    crossBoard = e instanceof PracticeSessionNotFoundError;
  }
  check("RLS: session under another board claim → PracticeSessionNotFoundError", crossBoard);

  // 11. membership gate, both sides (M11)
  const emailZ = `prl-z-${tag}@example.com`;
  let noMembership = false;
  try {
    await withBoard(P.id, (tx) => requireMembership(tx, { email: emailZ, board: P }));
  } catch (e) {
    noMembership = e instanceof NoMembershipError;
  }
  check("gate: non-member → NoMembershipError", noMembership);
  const gateRole = await withBoard(P.id, (tx) => requireMembership(tx, { email: emailW, board: P }));
  check("gate: member (real flow) → role 'student'", gateRole.role === "student");

  // 12. HTTP no-session → 401 (soft)
  try {
    const input = encodeURIComponent(JSON.stringify({ sessionId }));
    const res = await fetch(`http://localhost:${env.PORT}/trpc/practice.getSession?input=${input}`, { headers: { "x-board": P.slug } });
    check(`HTTP practice.getSession (no session) → 401 (got ${res.status})`, res.status === 401);
  } catch {
    console.log("  ~ HTTP practice.getSession skipped (server not running)");
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
  });
  await db.delete(appUser).where(eq(appUser.email, emailW));
  await db.delete(appUser).where(eq(appUser.email, emailX));
  await db.delete(board).where(eq(board.id, P.id));
  await db.delete(board).where(eq(board.id, Q.id));

  console.log(`\nprobe_practice_capture: ${passed} passed, ${failed} failed`);
  await queryClient.end();
  process.exit(failed === 0 ? 0 : 1);
}

main().catch(async (err) => {
  console.error("probe_practice_capture FAILED:", err);
  await queryClient.end();
  process.exit(1);
});
