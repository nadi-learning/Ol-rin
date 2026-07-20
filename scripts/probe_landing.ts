/**
 * probe_landing — Slice REV-LAND exit gate (the Revision landing aggregate).
 *
 * Proves getLandingState + recordVisit against the real DB + real RLS, using a
 * THROWAWAY fixture (unique per-run boards P/Q) so the canonical seeds stay
 * pristine (M22). Cleans up after itself. asOf pinned for determinism.
 *
 *  1. DB connectivity as the app role.
 *  2. COLD START: fresh student → firstTime true, lastVisited null, byChapter
 *     empty, dueTop null, plan null (every template input fail-closed).
 *  3. recordVisit(unknown sub_topic) → SlideNotFoundError (the FK-bypasses-RLS
 *     wall: visibility is checked under the RLS tx, not left to the FK).
 *  4. recordVisit(ST1) via the real service → firstTime flips false; lastVisited
 *     = ST1 with topic/chapter names; byChapter = {C1: ST1}.
 *  5/6. Visit ordering: newer visit in C2 moves the GLOBAL resume; a newer
 *     visit in C1 moves that chapter's entry — one DISTINCT ON read powers both.
 *  7. SELF-SCOPING (D-L-5): student B's visit never appears in A's landing;
 *     B gets their own (firstTime false, lastVisited = own).
 *  8. dueTop: two due sub-topics (overdue 7 vs 3) → the MOST overdue wins;
 *     D-REV-2: NO conceptualLevel/proceduralLevel key anywhere in the payload
 *     (raw 1–5 levels must never reach a student surface — D-INS-1).
 *  9. plan: after setupPlan, plan.currentChapter = the chapter whose projected
 *     window contains asOf (C1); strongestChapter = highest preparedness (C2,
 *     3/3 beats C1's 2/2) — currentChapter and strongest are independent.
 * 10. RLS cross-board: the same student's landing under board Q is COLD (visits,
 *     due, plan all invisible) → firstTime true.
 * 11. HTTP (M30 — restart the BE first if it predates this slice):
 *     GET revision.getLandingState (no session) → 401 (registered);
 *     GET revision.recordVisit (a mutation) → 405 (registered, wrong verb —
 *     S75: 401/405 both mean registered, only 404 means missing);
 *     GET revision.notARoute → 404 (the control).
 */
import { eq, sql } from "drizzle-orm";
import type { PgTransaction } from "drizzle-orm/pg-core";
import {
  appUser,
  board,
  chapter,
  eventLog,
  masteryState,
  membership,
  pacePlan,
  schedulingState,
  subTopic,
  subject,
  topic,
} from "@b2c/kernel/schema";
import { db, queryClient } from "../src/db/client";
import { withBoard } from "../src/db/with-board";
import { grantRole } from "../src/services/membership";
import {
  getLandingState,
  recordVisit,
  REVISION_VISIT_EVENT,
  SlideNotFoundError,
} from "../src/services/revision";
import { setupPlan } from "../src/services/pace";
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

// Fixed clock so due dates + plan windows are deterministic.
const asOf = new Date("2026-06-15T12:00:00Z");
const DAY = 86_400_000;
const anchorBack = (days: number) => new Date(asOf.getTime() - days * DAY);
// Visit-ordering timestamps pin against the REAL clock, not asOf: leg 4's
// recordVisit stamps createdAt = now(), so later fixture visits must be later
// than THAT to be "newest" (visit recency is real-time; only due/plan math
// uses the pinned asOf).
const afterNow = (seconds: number) => new Date(Date.now() + seconds * 1000);

async function main() {
  const tag = `${Date.now()}`;

  await db.execute(sql`select 1`);
  check("DB connectivity (select 1) as app role", true);

  const [P] = await db.insert(board).values({ slug: `pland-p-${tag}`, name: "Probe P" }).returning();
  const [Q] = await db.insert(board).values({ slug: `pland-q-${tag}`, name: "Probe Q" }).returning();
  if (!P || !Q) throw new Error("board seed failed");

  // Spine under P: one subject, chapters C1 (T1 → ST1, ST2) + C2 (T2 → ST3).
  const fx = await withBoard(P.id, async (tx: Tx) => {
    const [s1] = await tx.insert(subject).values({ boardId: P.id, slug: "phys", name: "Physics", grade: "IGCSE" }).returning();
    const [c1] = await tx.insert(chapter).values({ boardId: P.id, subjectId: s1!.id, slug: "c1", name: "Ch One", ordinal: 1 }).returning();
    const [c2] = await tx.insert(chapter).values({ boardId: P.id, subjectId: s1!.id, slug: "c2", name: "Ch Two", ordinal: 2 }).returning();
    const [t1] = await tx.insert(topic).values({ boardId: P.id, chapterId: c1!.id, slug: "t1", name: "T1", ordinal: 1 }).returning();
    const [t2] = await tx.insert(topic).values({ boardId: P.id, chapterId: c2!.id, slug: "t2", name: "T2", ordinal: 1 }).returning();
    const st = async (topicId: string, slug: string, name: string, ordinal: number) =>
      (await tx.insert(subTopic).values({ boardId: P.id, topicId, slug, name, ordinal }).returning())[0]!.id;
    return {
      s1: s1!.id, c1: c1!.id, c2: c2!.id,
      ST1: await st(t1!.id, "st1", "ST One", 1),
      ST2: await st(t1!.id, "st2", "ST Two", 2),
      ST3: await st(t2!.id, "st3", "ST Three", 1),
    };
  });

  // Students A (the caller) + B (the leak control) via the real flow.
  const emailA = `pland-a-${tag}@example.com`;
  const emailB = `pland-b-${tag}@example.com`;
  const A = await withBoard(P.id, (tx) => grantRole(tx, { email: emailA, name: "Stu A", board: P, role: "student" }));
  const B = await withBoard(P.id, (tx) => grantRole(tx, { email: emailB, name: "Stu B", board: P, role: "student" }));
  const selfA = { studentId: A.user.id, name: "Stu A", email: emailA };
  const selfB = { studentId: B.user.id, name: "Stu B", email: emailB };

  // 2. cold start — everything fail-closed
  const cold = await withBoard(P.id, (tx) => getLandingState(tx, { self: selfA, asOf }));
  check("cold start: firstTime true", cold.firstTime === true);
  check("cold start: lastVisited null + byChapter empty",
    cold.lastVisited === null && Object.keys(cold.lastVisitedByChapter).length === 0);
  check("cold start: dueTop null, plan null", cold.dueTop === null && cold.plan === null);

  // 3. recordVisit on an unknown sub_topic → SlideNotFoundError
  let unknownThrew = false;
  try {
    await withBoard(P.id, (tx) =>
      recordVisit(tx, { boardId: P.id, appUserId: selfA.studentId, subTopicId: "00000000-0000-4000-8000-000000000000" }));
  } catch (e) {
    unknownThrew = e instanceof SlideNotFoundError;
  }
  check("recordVisit(unknown sub_topic) → SlideNotFoundError", unknownThrew);

  // 4. first real visit (the real service path)
  await withBoard(P.id, (tx) =>
    recordVisit(tx, { boardId: P.id, appUserId: selfA.studentId, subTopicId: fx.ST1 }));
  const afterFirst = await withBoard(P.id, (tx) => getLandingState(tx, { self: selfA, asOf }));
  check("after visit: firstTime false", afterFirst.firstTime === false);
  check("after visit: lastVisited = ST1 with topic/chapter names",
    afterFirst.lastVisited?.subTopicId === fx.ST1 &&
    afterFirst.lastVisited?.subTopicName === "ST One" &&
    afterFirst.lastVisited?.topicName === "T1" &&
    afterFirst.lastVisited?.chapterName === "Ch One");
  check("after visit: byChapter = {C1: ST1}",
    afterFirst.lastVisitedByChapter[fx.c1] === fx.ST1 &&
    Object.keys(afterFirst.lastVisitedByChapter).length === 1);

  // 5/6. visit ordering — direct event inserts with pinned createdAt so the
  // DISTINCT ON ordering is deterministic (the service path is already proven).
  await withBoard(P.id, async (tx: Tx) => {
    // newer visit in C2 → global resume moves there
    await tx.insert(eventLog).values({
      boardId: P.id, eventType: REVISION_VISIT_EVENT,
      studentId: selfA.studentId, subTopicId: fx.ST3, payload: {}, createdAt: afterNow(60),
    });
    // even newer visit back in C1, on a DIFFERENT sub_topic → C1's entry moves
    await tx.insert(eventLog).values({
      boardId: P.id, eventType: REVISION_VISIT_EVENT,
      studentId: selfA.studentId, subTopicId: fx.ST2, payload: {}, createdAt: afterNow(120),
    });
  });
  const ordered = await withBoard(P.id, (tx) => getLandingState(tx, { self: selfA, asOf }));
  check("ordering: global lastVisited = the newest visit (ST2)",
    ordered.lastVisited?.subTopicId === fx.ST2);
  check("ordering: byChapter tracks each chapter's own newest (C1→ST2, C2→ST3)",
    ordered.lastVisitedByChapter[fx.c1] === fx.ST2 &&
    ordered.lastVisitedByChapter[fx.c2] === fx.ST3);

  // 7. self-scoping — B's visit is invisible to A, and vice versa
  await withBoard(P.id, (tx) =>
    recordVisit(tx, { boardId: P.id, appUserId: selfB.studentId, subTopicId: fx.ST3 }));
  const aAfterB = await withBoard(P.id, (tx) => getLandingState(tx, { self: selfA, asOf }));
  const bOwn = await withBoard(P.id, (tx) => getLandingState(tx, { self: selfB, asOf }));
  check("self-scope: B's visit does not move A's lastVisited",
    aAfterB.lastVisited?.subTopicId === fx.ST2);
  check("self-scope: B sees their own (firstTime false, lastVisited ST3)",
    bOwn.firstTime === false && bOwn.lastVisited?.subTopicId === fx.ST3);

  // 8. dueTop — ST1 overdue 7 (proc2: -10+3), ST3 overdue 3 (proc3: -10+7).
  await withBoard(P.id, async (tx: Tx) => {
    await tx.insert(masteryState).values({
      boardId: P.id, studentId: selfA.studentId, subTopicId: fx.ST1,
      conceptualLevel: 2, proceduralLevel: 2, description: "d", log: "l", updatedAt: anchorBack(10),
    });
    await tx.insert(schedulingState).values({
      boardId: P.id, studentId: selfA.studentId, subTopicId: fx.ST1,
      taughtAt: anchorBack(10), climbNextDue: null,
    });
    await tx.insert(masteryState).values({
      boardId: P.id, studentId: selfA.studentId, subTopicId: fx.ST3,
      conceptualLevel: 3, proceduralLevel: 3, description: "d", log: "l", updatedAt: anchorBack(10),
    });
    await tx.insert(schedulingState).values({
      boardId: P.id, studentId: selfA.studentId, subTopicId: fx.ST3,
      taughtAt: anchorBack(10), climbNextDue: null,
    });
  });
  const withDue = await withBoard(P.id, (tx) => getLandingState(tx, { self: selfA, asOf }));
  check("dueTop: the most overdue wins (ST1, 7 days)",
    withDue.dueTop?.subTopicId === fx.ST1 && withDue.dueTop?.overdueDays === 7 &&
    withDue.dueTop?.chapterName === "Ch One");
  check("D-REV-2: no raw mastery level key anywhere in the landing payload",
    !/conceptualLevel|proceduralLevel/.test(JSON.stringify(withDue)));

  // 9. plan — start 5 days back so C1's 1-week window contains asOf.
  await withBoard(P.id, (tx) =>
    setupPlan(tx, {
      boardId: P.id, appUserId: selfA.studentId, subjectId: fx.s1,
      startDate: "2026-06-10", endDate: "2026-12-01",
      chapterOrder: [fx.c1, fx.c2],
    }));
  const withPlan = await withBoard(P.id, (tx) => getLandingState(tx, { self: selfA, asOf }));
  check("plan: present after setup, subject = Physics",
    withPlan.plan?.subjectId === fx.s1 && withPlan.plan?.subjectName === "Physics");
  check("plan: currentChapter = C1 (asOf inside its projected window)",
    withPlan.plan?.currentChapter?.chapterId === fx.c1);
  check("plan: strongestChapter = C2 (3/3 beats C1's 2/2), independent of current",
    withPlan.plan?.strongestChapter?.chapterId === fx.c2);
  check("D-REV-2 still holds with plan present (no level keys)",
    !/conceptualLevel|proceduralLevel/.test(JSON.stringify(withPlan)));

  // 10. RLS cross-board — the same student under board Q sees a cold landing
  const underQ = await withBoard(Q.id, (tx) => getLandingState(tx, { self: selfA, asOf }));
  check("RLS: under board Q the landing is cold (firstTime, all null)",
    underQ.firstTime === true && underQ.lastVisited === null &&
    underQ.dueTop === null && underQ.plan === null);

  // 11. HTTP registration (M30: needs a BE started AFTER this slice)
  try {
    const base = `http://localhost:${env.PORT}/trpc`;
    const h = { headers: { "x-board": P.slug } };
    const q = await fetch(`${base}/revision.getLandingState`, h);
    check(`HTTP revision.getLandingState (no session) → 401 (got ${q.status})`, q.status === 401);
    const m = await fetch(`${base}/revision.recordVisit`, h);
    check(`HTTP revision.recordVisit (GET on a mutation) → 405 (got ${m.status})`, m.status === 405);
    const bogus = await fetch(`${base}/revision.notARoute`, h);
    check(`HTTP control: bogus route → 404 (got ${bogus.status})`, bogus.status === 404);
  } catch {
    console.log("  ~ HTTP checks skipped (server not running)");
  }

  // ── cleanup (FK-safe order) ──
  await withBoard(P.id, async (tx: Tx) => {
    await tx.delete(eventLog).where(eq(eventLog.boardId, P.id));
    await tx.delete(pacePlan).where(eq(pacePlan.boardId, P.id));
    await tx.delete(schedulingState).where(eq(schedulingState.boardId, P.id));
    await tx.delete(masteryState).where(eq(masteryState.boardId, P.id));
    await tx.delete(subTopic).where(eq(subTopic.boardId, P.id));
    await tx.delete(topic).where(eq(topic.boardId, P.id));
    await tx.delete(chapter).where(eq(chapter.boardId, P.id));
    await tx.delete(subject).where(eq(subject.boardId, P.id));
    await tx.delete(membership).where(eq(membership.boardId, P.id));
  });
  await db.delete(appUser).where(eq(appUser.email, emailA));
  await db.delete(appUser).where(eq(appUser.email, emailB));
  await db.delete(board).where(eq(board.id, P.id));
  await db.delete(board).where(eq(board.id, Q.id));

  console.log(`\nprobe_landing: ${passed} passed, ${failed} failed`);
  await queryClient.end();
  process.exit(failed === 0 ? 0 : 1);
}

main().catch(async (err) => {
  console.error("probe_landing FAILED:", err);
  await queryClient.end();
  process.exit(1);
});
