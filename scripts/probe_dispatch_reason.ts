/**
 * probe_dispatch_reason — Slice CLOCK-1 exit gate (the dispatch-reason stamp).
 *
 * Proves resolveDispatchReason against the real DB + real RLS on a THROWAWAY
 * fixture (unique board P per run, M22), and proves the stamp actually PERSISTS
 * on practice_session via the real startSession insert path. Cleans up after
 * itself. Reasons are absolute (governing clock, no due/not-due gate) so every
 * outcome is deterministic from the seeded anchor/climb dates — no wall-clock.
 *
 *  1. DB connectivity as the app role.
 *  2. first_teach — NO scheduling row (never entered the spiral). The queue
 *     structurally cannot supply this (it filters taughtAt IS NOT NULL).
 *  3. first_teach — scheduling row with taughtAt NULL (climb set → proven ignored).
 *  4. climb governs — climbDue earlier than retentionDue.
 *  5. retention governs — retentionDue earlier than climbDue.
 *  6. TIE (climbDue === retentionDue) → retention (S156 ruling).
 *  7. null — taught but neither clock (procedural below retention floor, no climb).
 *  8. climb-only (retention null: proc below floor) → climb.
 *  9. retention-only (climb null) → retention.
 * 10. ANCHOR — retention counts from the LAST PRACTICE (latest observation), not
 *     mastery.updatedAt: observation(-20) vs updatedAt(-2) flips the min → retention
 *     (updatedAt-anchored it would be climb). Mirrors computeDueQueue's anchor rule.
 * 11. E2E — startSession on an untaught sub-topic STAMPS 'first_teach' on the row.
 * 12. E2E — startSession on a retention-due sub-topic STAMPS 'retention' on the row.
 * 13. RLS cross-board: resolveDispatchReason under board Q sees no state → first_teach.
 */
import { and, eq, sql } from "drizzle-orm";
import type { PgTransaction } from "drizzle-orm/pg-core";
import {
  appUser,
  observation,
  board,
  chapter,
  masteryState,
  practiceSession,
  question,
  schedulingState,
  student,
  subTopic,
  subject,
  topic,
} from "@b2c/kernel/schema";
import { db, queryClient } from "../src/db/client";
import { withBoard } from "../src/db/with-board";
import { grantRole } from "../src/services/membership";
import { resolveDispatchReason } from "../src/services/scheduler";
import { startSession } from "../src/services/practice";

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

// Fixed reference so every seeded date is deterministic.
const asOf = new Date("2026-06-15T12:00:00Z");
const DAY = 86_400_000;
const anchorBack = (days: number) => new Date(asOf.getTime() - days * DAY);
const dayStr = (offsetDays: number) =>
  new Date(asOf.getTime() + offsetDays * DAY).toISOString().slice(0, 10);

const reason = (tx: Tx, studentId: string, subTopicId: string) =>
  resolveDispatchReason(tx, { studentId, subTopicId });

async function main() {
  const tag = `${Date.now()}`;

  // 1. connectivity
  await db.execute(sql`select 1`);
  check("DB connectivity (select 1) as app role", true);

  const [P] = await db
    .insert(board)
    .values({ slug: `pdr-p-${tag}`, name: "Probe P" })
    .returning();
  const [Q] = await db
    .insert(board)
    .values({ slug: `pdr-q-${tag}`, name: "Probe Q" })
    .returning();
  if (!P || !Q) throw new Error("board seed failed");

  // Spine under P.
  const fx = await withBoard(P.id, async (tx: Tx) => {
    const [s1] = await tx
      .insert(subject)
      .values({ boardId: P.id, slug: "phys", name: "Physics", grade: "IGCSE" })
      .returning();
    const [c1] = await tx
      .insert(chapter)
      .values({ boardId: P.id, subjectId: s1!.id, slug: "c1", name: "Ch1", ordinal: 1 })
      .returning();
    const [t1] = await tx
      .insert(topic)
      .values({ boardId: P.id, chapterId: c1!.id, slug: "t1", name: "T1", ordinal: 1 })
      .returning();
    const st = async (slug: string, ordinal: number) =>
      (
        await tx
          .insert(subTopic)
          .values({ boardId: P.id, topicId: t1!.id, slug, name: slug.toUpperCase(), ordinal })
          .returning()
      )[0]!.id;
    return {
      A: await st("a", 1), // no sched row
      B: await st("b", 2), // taughtAt null
      C: await st("c", 3), // climb governs
      D: await st("d", 4), // retention governs (also E2E)
      E: await st("e", 5), // tie → retention
      F: await st("f", 6), // null
      G: await st("g", 7), // climb-only
      H: await st("h", 8), // retention-only
      I: await st("i", 9), // anchor = observation
    };
  });

  // Student ST via the real flow (grantRole makes the app_user).
  const emailST = `pdr-st-${tag}@example.com`;
  const ST = await withBoard(P.id, (tx) =>
    grantRole(tx, { email: emailST, name: "Student", board: P, role: "student" }),
  );
  const studentId = ST.user.id;
  await withBoard(P.id, (tx) =>
    tx.insert(student).values({ userId: studentId, boardId: P.id, class: "9" }),
  );

  // mastery_state + scheduling_state fixtures.
  await withBoard(P.id, async (tx: Tx) => {
    const mastery = (subTopicId: string, p: number, updatedAt: Date) =>
      tx.insert(masteryState).values({
        boardId: P.id,
        studentId,
        subTopicId,
        conceptualLevel: 3,
        proceduralLevel: p,
        description: "desc",
        log: "log",
        updatedAt,
      });
    const sched = (subTopicId: string, taughtAt: Date | null, climb: string | null) =>
      tx.insert(schedulingState).values({
        boardId: P.id,
        studentId,
        subTopicId,
        taughtAt,
        climbNextDue: climb,
      });

    // A: NO scheduling row at all → first_teach.
    // B: taughtAt null (climb overdue → proven ignored) → first_teach.
    await mastery(fx.B, 3, anchorBack(2));
    await sched(fx.B, null, dayStr(-1));
    // C: proc3 → retentionDue = updatedAt(-2)+7 = dayStr(5); climb dayStr(-1) earlier → climb.
    await mastery(fx.C, 3, anchorBack(2));
    await sched(fx.C, anchorBack(2), dayStr(-1));
    // D: proc4 → retentionDue = updatedAt(-20)+14 = dayStr(-6); climb dayStr(-2) → retention earlier.
    await mastery(fx.D, 4, anchorBack(20));
    await sched(fx.D, anchorBack(20), dayStr(-2));
    // E: proc3 → retentionDue = updatedAt(0)+7 = dayStr(7); climb dayStr(7) → TIE → retention.
    await mastery(fx.E, 3, anchorBack(0));
    await sched(fx.E, anchorBack(0), dayStr(7));
    // F: proc1 (below retention floor → null) + climb null → null.
    await mastery(fx.F, 1, anchorBack(2));
    await sched(fx.F, anchorBack(2), null);
    // G: proc1 (retention null) + climb dayStr(3) → climb.
    await mastery(fx.G, 1, anchorBack(2));
    await sched(fx.G, anchorBack(2), dayStr(3));
    // H: proc3 → retentionDue dayStr(5); climb null → retention.
    await mastery(fx.H, 3, anchorBack(2));
    await sched(fx.H, anchorBack(2), null);
    // I (ANCHOR): updatedAt(-2) would give retentionDue dayStr(5) → min w/ climb(-2) = climb.
    //   But last observation is at -20 → retentionDue dayStr(-13) → min = retention.
    //   Asserting 'retention' proves the anchor is the observation, not updatedAt.
    await mastery(fx.I, 3, anchorBack(2));
    await sched(fx.I, anchorBack(2), dayStr(-2));
    await tx.insert(observation).values({
      boardId: P.id,
      studentId,
      subTopicId: fx.I,
      axis: "procedural",
      observationLevel: 3,
      reasoning: "last actual practice, 20 days ago",
      source: "stage1_scorer",
      createdAt: anchorBack(20),
    });

    // Questions for the two E2E sub-topics (A untaught, D retention-due).
    for (const stId of [fx.A, fx.D]) {
      await tx.insert(question).values({
        boardId: P.id,
        subTopicId: stId,
        axis: "procedural",
        kind: "subjective",
        stem: "Q stem",
        referenceAnswer: "REF",
        explanation: "EXPL",
        pedagogicalNote: "NOTE",
        ordinal: 1,
        source: "b2c_authoring",
      });
    }
  });

  // 2–10. resolveDispatchReason across the matrix (all in one board-scoped tx).
  const r = await withBoard(P.id, async (tx: Tx) => ({
    A: await reason(tx, studentId, fx.A),
    B: await reason(tx, studentId, fx.B),
    C: await reason(tx, studentId, fx.C),
    D: await reason(tx, studentId, fx.D),
    E: await reason(tx, studentId, fx.E),
    F: await reason(tx, studentId, fx.F),
    G: await reason(tx, studentId, fx.G),
    H: await reason(tx, studentId, fx.H),
    I: await reason(tx, studentId, fx.I),
  }));

  check("2. no scheduling row → first_teach", r.A === "first_teach");
  check("3. taughtAt null (climb ignored) → first_teach", r.B === "first_teach");
  check("4. climb earlier than retention → climb", r.C === "climb");
  check("5. retention earlier than climb → retention", r.D === "retention");
  check("6. tie (climbDue === retentionDue) → retention (ruling)", r.E === "retention");
  check("7. neither clock (proc below floor, no climb) → null", r.F === null);
  check("8. climb-only (retention null) → climb", r.G === "climb");
  check("9. retention-only (climb null) → retention", r.H === "retention");
  check("10. ANCHOR = last observation, not mastery.updatedAt → retention", r.I === "retention");

  // 11–12. E2E: the stamp actually lands on practice_session via startSession.
  await withBoard(P.id, (tx) =>
    startSession(tx, { boardId: P.id, appUserId: studentId, subTopicId: fx.A }),
  );
  await withBoard(P.id, (tx) =>
    startSession(tx, { boardId: P.id, appUserId: studentId, subTopicId: fx.D }),
  );
  const stamped = await withBoard(P.id, (tx: Tx) =>
    tx
      .select({
        subTopicId: practiceSession.subTopicId,
        dispatchReason: practiceSession.dispatchReason,
        origin: practiceSession.origin,
      })
      .from(practiceSession)
      .where(eq(practiceSession.appUserId, studentId)),
  );
  const bySt = new Map(stamped.map((s) => [s.subTopicId, s]));
  check(
    "11. startSession(untaught) → row.dispatch_reason = 'first_teach'",
    bySt.get(fx.A)?.dispatchReason === "first_teach",
  );
  check(
    "12. startSession(retention-due) → row.dispatch_reason = 'retention'",
    bySt.get(fx.D)?.dispatchReason === "retention",
  );
  check(
    "12b. origin still self_serve (orthogonal dimension untouched)",
    bySt.get(fx.A)?.origin === "self_serve" && bySt.get(fx.D)?.origin === "self_serve",
  );

  // 13. RLS cross-board: under board Q the student's state is invisible → first_teach.
  const crossQ = await withBoard(Q.id, (tx) => reason(tx, studentId, fx.D));
  check("13. RLS: resolveDispatchReason under another board → first_teach (state invisible)", crossQ === "first_teach");

  // ── cleanup (FK-safe order) ──
  await withBoard(P.id, async (tx: Tx) => {
    await tx.delete(practiceSession).where(eq(practiceSession.boardId, P.id));
    await tx.delete(question).where(eq(question.boardId, P.id));
    await tx.delete(observation).where(eq(observation.boardId, P.id));
    await tx.delete(schedulingState).where(eq(schedulingState.boardId, P.id));
    await tx.delete(masteryState).where(eq(masteryState.boardId, P.id));
    await tx.delete(subTopic).where(eq(subTopic.boardId, P.id));
    await tx.delete(topic).where(eq(topic.boardId, P.id));
    await tx.delete(chapter).where(eq(chapter.boardId, P.id));
    await tx.delete(subject).where(eq(subject.boardId, P.id));
    await tx.delete(student).where(eq(student.boardId, P.id));
  });
  await db.delete(appUser).where(eq(appUser.email, emailST));
  await db.delete(board).where(eq(board.id, P.id));
  await db.delete(board).where(eq(board.id, Q.id));

  console.log(`\nprobe_dispatch_reason: ${passed} passed, ${failed} failed`);
  await queryClient.end();
  process.exit(failed === 0 ? 0 : 1);
}

main().catch(async (err) => {
  console.error("probe_dispatch_reason FAILED:", err);
  await queryClient.end();
  process.exit(1);
});
