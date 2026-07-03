/**
 * probe_insights — Slice INS exit gate (the student's OWN progress surface).
 *
 * Proves insights.getMySummary against the real DB + real RLS with a THROWAWAY
 * fixture (boards P/Q per run) so the canonical seeds stay pristine (M22). Cleans
 * up after itself.
 *
 * The INS-specific value this guards:
 *   - the D-INS-1 exposure boundary: certified levels are projected to SOFT
 *     BUCKETS and the raw 1–5 numbers are DROPPED (never on the returned object);
 *   - the description-only/never-`log` boundary (M11) carries through;
 *   - self-scoping (D-L-5): a bystander's certified mastery + effort never bleed
 *     into the caller's insights.
 *
 *   1. DB connectivity as the app role.
 *   2. W has exactly 3 certified topics, in spine order (A, B, C).
 *   3. bucket mapping: A = mastered/practising (5/3), B = getting-started/strong
 *      (2/4), C = strong/strong (4/4).
 *   4. NO raw level keys on any topic object (conceptualLevel/proceduralLevel).
 *   5. the internal `log` sentinel never appears anywhere in the payload.
 *   6. the user-visible description IS present.
 *   7. trend: A=up (prior 3/3), B=down (prior 4/4), C=new (no history).
 *   8. OWNERSHIP: W's A card shows W's levels, not bystander X's louder ones.
 *   9. X's own insights show X's A levels (each caller sees only their own).
 *  10. metrics: W answered=1, skipped=1, time=8000ms — NOT inflated by X.
 *  11. empty member Z → no topics, zero metrics.
 *  12. cross-board RLS: W's insights under a Q claim → empty topics + zero metrics.
 *  13. HTTP: insights.getMySummary no session → 401 (soft).
 */
import { eq, sql } from "drizzle-orm";
import type { PgTransaction } from "drizzle-orm/pg-core";
import {
  appUser,
  attempt,
  board,
  chapter,
  masteryHistory,
  masteryState,
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
import { getMyInsights } from "../src/services/insights";
import { env } from "../src/config/env";

type Tx = PgTransaction<any, any, any>;

const LOG_SENTINEL = "INTERNAL_LOG_SENTINEL_must_never_surface";

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

  const [P] = await db.insert(board).values({ slug: `ins-p-${tag}`, name: "Probe P" }).returning();
  const [Q] = await db.insert(board).values({ slug: `ins-q-${tag}`, name: "Probe Q" }).returning();
  if (!P || !Q) throw new Error("board seed failed");

  // Fixture under P: spine + 3 sub_topics (ordinal order) + 2 questions on stA.
  const fx = await withBoard(P.id, async (tx: Tx) => {
    const [subj] = await tx.insert(subject).values({ boardId: P.id, slug: "phys", name: "Physics", grade: "IGCSE" }).returning();
    const [chap] = await tx.insert(chapter).values({ boardId: P.id, subjectId: subj!.id, slug: "ch", name: "Forces", ordinal: 1 }).returning();
    const [tp] = await tx.insert(topic).values({ boardId: P.id, chapterId: chap!.id, slug: "tp", name: "Motion", ordinal: 1 }).returning();
    const [stA] = await tx.insert(subTopic).values({ boardId: P.id, topicId: tp!.id, slug: "sta", name: "ST A", ordinal: 1 }).returning();
    const [stB] = await tx.insert(subTopic).values({ boardId: P.id, topicId: tp!.id, slug: "stb", name: "ST B", ordinal: 2 }).returning();
    const [stC] = await tx.insert(subTopic).values({ boardId: P.id, topicId: tp!.id, slug: "stc", name: "ST C", ordinal: 3 }).returning();
    const [q1] = await tx.insert(question).values({ boardId: P.id, subTopicId: stA!.id, axis: "conceptual", kind: "subjective", stem: "Q1", referenceAnswer: "R1", ordinal: 1, source: "b2c_authoring" }).returning();
    const [q2] = await tx.insert(question).values({ boardId: P.id, subTopicId: stA!.id, axis: "procedural", kind: "subjective", stem: "Q2", referenceAnswer: "R2", ordinal: 2, source: "b2c_authoring" }).returning();
    return { stA: stA!.id, stB: stB!.id, stC: stC!.id, q1: q1!.id, q2: q2!.id };
  });

  const emailW = `ins-w-${tag}@example.com`;
  const emailX = `ins-x-${tag}@example.com`;
  const emailZ = `ins-z-${tag}@example.com`;
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

  // ── W's certified mastery: A (5/3), B (2/4), C (4/4); `log` carries the sentinel ──
  const now = new Date();
  const earlier = new Date(now.getTime() - 60_000);
  await withBoard(P.id, async (tx: Tx) => {
    await tx.insert(masteryState).values([
      { boardId: P.id, studentId: userW, subTopicId: fx.stA, conceptualLevel: 5, proceduralLevel: 3, description: "You explain forces clearly.", log: LOG_SENTINEL, updatedAt: now },
      { boardId: P.id, studentId: userW, subTopicId: fx.stB, conceptualLevel: 2, proceduralLevel: 4, description: "Solid method, shaky on the why.", log: LOG_SENTINEL, updatedAt: now },
      { boardId: P.id, studentId: userW, subTopicId: fx.stC, conceptualLevel: 4, proceduralLevel: 4, description: "Strong all round.", log: LOG_SENTINEL, updatedAt: now },
    ]);
    // prior snapshots → trend: A up (3/3 < 5/3), B down (4/4 > 2/4); C none → new.
    await tx.insert(masteryHistory).values([
      { boardId: P.id, studentId: userW, subTopicId: fx.stA, conceptualLevel: 3, proceduralLevel: 3, description: "earlier", log: LOG_SENTINEL, snapshotAt: earlier },
      { boardId: P.id, studentId: userW, subTopicId: fx.stB, conceptualLevel: 4, proceduralLevel: 4, description: "earlier", log: LOG_SENTINEL, snapshotAt: earlier },
    ]);
  });

  // ── bystander X: LOUDER certified mastery on the SAME stA (5/5) + an attempt ──
  await withBoard(P.id, async (tx: Tx) => {
    await tx.insert(masteryState).values({ boardId: P.id, studentId: userX, subTopicId: fx.stA, conceptualLevel: 5, proceduralLevel: 5, description: "X's card.", log: LOG_SENTINEL, updatedAt: now });
  });

  // ── effort: W answers q1 (8s) + skips q2; X answers q1 (50s) — to prove ownership ──
  const w1 = await withBoard(P.id, (tx) => startSession(tx, { boardId: P.id, appUserId: userW, subTopicId: fx.stA }));
  await withBoard(P.id, (tx) => submitAttempt(tx, { boardId: P.id, appUserId: userW, sessionId: w1.sessionId, questionId: fx.q1, answerText: "a", confidence: 4, timeMs: 8000 }));
  await withBoard(P.id, (tx) => skip(tx, { boardId: P.id, appUserId: userW, sessionId: w1.sessionId, questionId: fx.q2, reason: "skip" }));
  const x1 = await withBoard(P.id, (tx) => startSession(tx, { boardId: P.id, appUserId: userX, subTopicId: fx.stA }));
  await withBoard(P.id, (tx) => submitAttempt(tx, { boardId: P.id, appUserId: userX, sessionId: x1.sessionId, questionId: fx.q1, answerText: "a", confidence: 5, timeMs: 50000 }));

  // 2. W's insights — 3 topics, spine order
  const insW = await withBoard(P.id, (tx) => getMyInsights(tx, { studentId: userW, name: "W", email: emailW }));
  check("W: 3 certified topics", insW.topics.length === 3);
  check("W: topics in spine order (A, B, C)", insW.topics.map((t) => t.subTopicName).join(",") === "ST A,ST B,ST C");

  const [a, b, c] = insW.topics;

  // 3. bucket mapping
  check("A: conceptual 5 → mastered", a!.conceptual === "mastered");
  check("A: procedural 3 → practising", a!.procedural === "practising");
  check("B: conceptual 2 → getting-started", b!.conceptual === "getting-started");
  check("B: procedural 4 → strong", b!.procedural === "strong");
  check("C: conceptual 4 → strong", c!.conceptual === "strong");
  check("C: procedural 4 → strong", c!.procedural === "strong");

  // 4. NO raw level keys on the projected objects (D-INS-1)
  const keys = Object.keys(a!);
  check("D-INS-1: no conceptualLevel key on topic", !keys.includes("conceptualLevel"));
  check("D-INS-1: no proceduralLevel key on topic", !keys.includes("proceduralLevel"));

  // 5. the internal `log` sentinel never surfaces (M11)
  check("M11: `log` sentinel absent from the whole payload", !JSON.stringify(insW).includes(LOG_SENTINEL));

  // 6. user-visible description present
  check("description present (user-visible blob)", a!.description === "You explain forces clearly.");

  // 7. trend
  check("A: trend up (prior 3/3 < 5/3)", a!.trend === "up");
  check("B: trend down (prior 4/4 > 2/4)", b!.trend === "down");
  check("C: trend new (no history)", c!.trend === "new");

  // 8. OWNERSHIP — W's A card is W's levels, not X's louder 5/5
  check("OWNERSHIP: W's A = mastered/practising, NOT X's 5/5 (mastered/mastered)", a!.procedural === "practising");

  // 9. X sees their own A card (5/5)
  const insX = await withBoard(P.id, (tx) => getMyInsights(tx, { studentId: userX, name: "X", email: emailX }));
  const xA = insX.topics.find((t) => t.subTopicName === "ST A");
  check("X: own A card is 5/5 (mastered/mastered)", xA?.conceptual === "mastered" && xA?.procedural === "mastered");
  check("X: exactly 1 certified topic (no bleed from W's B/C)", insX.topics.length === 1);

  // 10. metrics — W's own, not inflated by X
  check("W metrics: answered=1", insW.metrics.questionsAnswered === 1);
  check("W metrics: skipped=1", insW.metrics.questionsSkipped === 1);
  check("W metrics: time=8000 (not inflated by X's 50000)", insW.metrics.totalTimeMs === 8000);

  // 11. empty member → no topics, zero metrics
  const insZ = await withBoard(P.id, (tx) => getMyInsights(tx, { studentId: userZ, name: "Z", email: emailZ }));
  check("Z (no certification, no practice): empty topics + zero metrics", insZ.topics.length === 0 && insZ.metrics.questionsAnswered === 0 && insZ.metrics.totalTimeMs === 0);

  // 12. cross-board RLS — W's insights under a Q claim → empty
  const insWunderQ = await withBoard(Q.id, (tx) => getMyInsights(tx, { studentId: userW, name: "W", email: emailW }));
  check("RLS: W's insights under board Q → empty topics + zero metrics", insWunderQ.topics.length === 0 && insWunderQ.metrics.totalTimeMs === 0);

  // 13. HTTP no-session → 401 (soft)
  try {
    const res = await fetch(`http://localhost:${env.PORT}/trpc/insights.getMySummary`, { headers: { "x-board": P.slug } });
    check(`HTTP insights.getMySummary (no session) → 401 (got ${res.status})`, res.status === 401);
  } catch {
    console.log("  ~ HTTP insights.getMySummary skipped (server not running)");
  }

  // ── cleanup (FK-safe order) ──
  await withBoard(P.id, async (tx: Tx) => {
    await tx.delete(attempt).where(eq(attempt.boardId, P.id));
    await tx.delete(practiceSession).where(eq(practiceSession.boardId, P.id));
    await tx.delete(masteryHistory).where(eq(masteryHistory.boardId, P.id));
    await tx.delete(masteryState).where(eq(masteryState.boardId, P.id));
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

  console.log(`\nprobe_insights: ${passed} passed, ${failed} failed`);
  await queryClient.end();
  process.exit(failed === 0 ? 0 : 1);
}

main().catch(async (err) => {
  console.error("probe_insights FAILED:", err);
  await queryClient.end();
  process.exit(1);
});
