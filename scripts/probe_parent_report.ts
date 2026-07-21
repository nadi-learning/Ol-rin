/**
 * probe_parent_report — Slice P exit gate (Parent read surface, NO mastery move).
 *
 * Proves the parent.* read service against the real DB + real RLS, using a
 * THROWAWAY fixture (unique per-run boards P/Q) so the canonical seeds stay
 * pristine (M22). Cleans up after itself.
 *
 *   1. DB connectivity as the app role.
 *   2. ROLE gate both sides (M11): assertParent('student') throws ParentOnlyError;
 *      assertParent('parent') passes. Memberships created via the REAL grantRole
 *      flow (the SET side), not a direct insert.
 *   3. listChildren → only the parent's LINKED children (CH1 linked, CH2 not).
 *   4. OWNERSHIP: getChildReport for an UNLINKED child (CH2) → ChildNotFoundError.
 *   5. REPORT mastery: 4 cards (A,B,C,D), ordinal-ordered, with the user-visible
 *      description + the certified pair.
 *   6. TREND (D-P-3, prior = most-recent mastery_history snapshot):
 *      - A: current 4/3, history [(1,1) older, (2,1) newer] → "up",  prior 2/1
 *      - B: current 2/2, no history                         → "new", prior null
 *      - C: current 3/3, history (4,3)                      → "down", prior 4/3
 *      - D: current 3/3, history (3,3)                      → "flat", prior 3/3
 *   7. NO LOG LEAK (M11 projection boundary): mastery_state.log holds a sentinel;
 *      the report payload must NOT contain it (description is exposed, log is not).
 *   8. METRICS: 2 answered + 1 skipped attempt → answered 2, skipped 1, time sum.
 *   9. RLS cross-board: listChildren under board Q → empty (links invisible);
 *      getChildReport under Q → ChildNotFoundError.
 *  10. HTTP: parent.listChildren no session → 401 (soft).
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
  practiceSession,
  question,
  student,
  subTopic,
  subject,
  topic,
} from "@b2c/kernel/schema";
import { db, queryClient } from "../src/db/client";
import { withBoard } from "../src/db/with-board";
import { grantRole } from "../src/services/membership";
import {
  assertParent,
  ChildNotFoundError,
  getChildReport,
  listChildren,
  ParentOnlyError,
} from "../src/services/parent";
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

const LOG_SENTINEL = "INTERNAL_LOG_DO_NOT_LEAK_xyz789";

async function main() {
  const tag = `${Date.now()}`;
  const base = Date.now();
  const at = (offsetMs: number) => new Date(base + offsetMs);

  // 1. connectivity
  await db.execute(sql`select 1`);
  check("DB connectivity (select 1) as app role", true);

  const [P] = await db.insert(board).values({ slug: `prp-p-${tag}`, name: "Probe P" }).returning();
  const [Q] = await db.insert(board).values({ slug: `prp-q-${tag}`, name: "Probe Q" }).returning();
  if (!P || !Q) throw new Error("board seed failed");

  // 2. ROLE gate both sides (the CHECK side, M11)
  let parentOnlyThrew = false;
  try {
    assertParent("student");
  } catch (e) {
    parentOnlyThrew = e instanceof ParentOnlyError;
  }
  check("assertParent('student') → ParentOnlyError (non-parent blocked)", parentOnlyThrew);
  let parentPasses = true;
  try {
    assertParent("parent");
  } catch {
    parentPasses = false;
  }
  check("assertParent('parent') → passes", parentPasses);

  // Fixture under P: spine (4 sub_topics A/B/C/D, ordinal 1..4).
  const fx = await withBoard(P.id, async (tx: Tx) => {
    const [subj] = await tx.insert(subject).values({ boardId: P.id, slug: "phys", name: "Physics", grade: "IGCSE" }).returning();
    const [chap] = await tx.insert(chapter).values({ boardId: P.id, subjectId: subj!.id, slug: "ch", name: "Ch", ordinal: 1 }).returning();
    const [tp] = await tx.insert(topic).values({ boardId: P.id, chapterId: chap!.id, slug: "tp", name: "Tp", ordinal: 1 }).returning();
    const [stA] = await tx.insert(subTopic).values({ boardId: P.id, topicId: tp!.id, slug: "sta", name: "ST A", ordinal: 1 }).returning();
    const [stB] = await tx.insert(subTopic).values({ boardId: P.id, topicId: tp!.id, slug: "stb", name: "ST B", ordinal: 2 }).returning();
    const [stC] = await tx.insert(subTopic).values({ boardId: P.id, topicId: tp!.id, slug: "stc", name: "ST C", ordinal: 3 }).returning();
    const [stD] = await tx.insert(subTopic).values({ boardId: P.id, topicId: tp!.id, slug: "std", name: "ST D", ordinal: 4 }).returning();
    return { A: stA!.id, B: stB!.id, C: stC!.id, D: stD!.id };
  });

  // parent PA + children CH1, CH2 via the REAL flow (grantRole)
  const emailPA = `prp-pa-${tag}@example.com`;
  const emailCH1 = `prp-ch1-${tag}@example.com`;
  const emailCH2 = `prp-ch2-${tag}@example.com`;
  const PA = await withBoard(P.id, (tx) => grantRole(tx, { email: emailPA, name: "Parent", board: P, role: "parent" }));
  const CH1 = await withBoard(P.id, (tx) => grantRole(tx, { email: emailCH1, name: "Child One", board: P, role: "student" }));
  const CH2 = await withBoard(P.id, (tx) => grantRole(tx, { email: emailCH2, name: "Child Two", board: P, role: "student" }));
  const userPA = PA.user.id;
  const userCH1 = CH1.user.id;
  const userCH2 = CH2.user.id;
  check("real flow: parent membership role = 'parent' (M11 SET side)", PA.role === "parent");
  check("real flow: child membership role = 'student'", CH1.role === "student");

  // Operational `student` rows (ID-4: grantRole mints only the profile shell; the
  // student row is onboarding's job — here it's a fixture). The parent↔child link
  // is the single pointer `student.parent_id`: CH1 → PA, CH2 UNLINKED (null).
  await withBoard(P.id, async (tx: Tx) => {
    await tx.insert(student).values({ userId: userCH1, boardId: P.id, class: "9", parentId: userPA });
    await tx.insert(student).values({ userId: userCH2, boardId: P.id, class: "9" });
  });

  // mastery_state (current) + mastery_history (prior) + attempts for CH1.
  await withBoard(P.id, async (tx: Tx) => {
    const cur = (subTopicId: string, c: number, p: number) =>
      tx.insert(masteryState).values({
        boardId: P.id, studentId: userCH1, subTopicId,
        conceptualLevel: c, proceduralLevel: p,
        description: "where the student is + what to improve",
        log: LOG_SENTINEL, updatedAt: at(10000),
      });
    const hist = (subTopicId: string, c: number, p: number, snapshotAt: Date) =>
      tx.insert(masteryHistory).values({
        boardId: P.id, studentId: userCH1, subTopicId,
        conceptualLevel: c, proceduralLevel: p,
        description: "older snapshot", log: "older log",
        snapshotAt,
      });
    // A: current 4/3; history (1,1) older then (2,1) newer → prior 2/1, trend up
    await cur(fx.A, 4, 3);
    await hist(fx.A, 1, 1, at(1000));
    await hist(fx.A, 2, 1, at(2000));
    // B: current 2/2; no history → new
    await cur(fx.B, 2, 2);
    // C: current 3/3; history (4,3) → down
    await cur(fx.C, 3, 3);
    await hist(fx.C, 4, 3, at(1000));
    // D: current 3/3; history (3,3) → flat
    await cur(fx.D, 3, 3);
    await hist(fx.D, 3, 3, at(1000));

    // attempts: need a question + a practice_session (FK). 2 answered + 1 skip.
    const [q] = await tx.insert(question).values({
      boardId: P.id, subTopicId: fx.A, axis: "conceptual", kind: "subjective",
      stem: "Q stem", referenceAnswer: "REF", ordinal: 1, source: "b2c_authoring",
    }).returning();
    const [ps] = await tx.insert(practiceSession).values({
      boardId: P.id, appUserId: userCH1, subTopicId: fx.A, questionIds: [q!.id],
    }).returning();
    await tx.insert(attempt).values({
      boardId: P.id, practiceSessionId: ps!.id, questionId: q!.id, appUserId: userCH1,
      answerText: "ans 1", confidence: 4, timeMs: 60000,
    });
    await tx.insert(attempt).values({
      boardId: P.id, practiceSessionId: ps!.id, questionId: q!.id, appUserId: userCH1,
      answerText: "ans 2", confidence: 3, timeMs: 120000,
    });
    await tx.insert(attempt).values({
      boardId: P.id, practiceSessionId: ps!.id, questionId: q!.id, appUserId: userCH1,
      skipReason: "too hard",
    });
  });

  // 3. listChildren → only CH1 (linked); CH2 absent
  const kids = await withBoard(P.id, (tx) => listChildren(tx, userPA));
  check("listChildren → exactly 1 (the linked child)", kids.length === 1 && kids[0]!.studentId === userCH1);
  check("listChildren → carries email + name", kids[0]!.email === emailCH1 && kids[0]!.name === "Child One");

  // 4. OWNERSHIP: unlinked child CH2 → ChildNotFoundError
  let ownerThrew = false;
  try {
    await withBoard(P.id, (tx) => getChildReport(tx, { parentUserId: userPA, childId: userCH2 }));
  } catch (e) {
    ownerThrew = e instanceof ChildNotFoundError;
  }
  check("ownership: getChildReport(unlinked CH2) → ChildNotFoundError", ownerThrew);

  // 5–8. the report
  const report = await withBoard(P.id, (tx) => getChildReport(tx, { parentUserId: userPA, childId: userCH1 }));
  check("report.child → the linked child", report.child.studentId === userCH1 && report.child.email === emailCH1);
  check("report.mastery → 4 cards", report.mastery.length === 4);
  check("report.mastery → ordinal-ordered (A,B,C,D)",
    report.mastery[0]!.subTopicId === fx.A &&
    report.mastery[1]!.subTopicId === fx.B &&
    report.mastery[2]!.subTopicId === fx.C &&
    report.mastery[3]!.subTopicId === fx.D);
  check("report.mastery → certified pair + user-visible description",
    report.mastery[0]!.conceptualLevel === 4 && report.mastery[0]!.proceduralLevel === 3 && report.mastery[0]!.description.length > 0);

  const byId = new Map(report.mastery.map((m) => [m.subTopicId, m]));
  check("trend A → 'up', prior 2/1 (latest history snapshot)",
    byId.get(fx.A)?.trend === "up" && byId.get(fx.A)?.priorConceptualLevel === 2 && byId.get(fx.A)?.priorProceduralLevel === 1);
  check("trend B → 'new', prior null (no history)",
    byId.get(fx.B)?.trend === "new" && byId.get(fx.B)?.priorConceptualLevel === null);
  check("trend C → 'down', prior 4/3",
    byId.get(fx.C)?.trend === "down" && byId.get(fx.C)?.priorConceptualLevel === 4 && byId.get(fx.C)?.priorProceduralLevel === 3);
  check("trend D → 'flat', prior 3/3", byId.get(fx.D)?.trend === "flat");

  // 7. NO LOG LEAK — the internal log sentinel must not appear in the payload
  check("report payload has NO internal log (M11 projection boundary)",
    !JSON.stringify(report).includes(LOG_SENTINEL));

  // 8. METRICS
  check("metrics → 2 answered", report.metrics.questionsAnswered === 2);
  check("metrics → 1 skipped", report.metrics.questionsSkipped === 1);
  check("metrics → totalTimeMs = 180000", report.metrics.totalTimeMs === 180000);

  // 9. RLS cross-board: under Q the parent_child link is invisible
  const crossKids = await withBoard(Q.id, (tx) => listChildren(tx, userPA));
  check("RLS: listChildren under another board → empty", crossKids.length === 0);
  let crossThrew = false;
  try {
    await withBoard(Q.id, (tx) => getChildReport(tx, { parentUserId: userPA, childId: userCH1 }));
  } catch (e) {
    crossThrew = e instanceof ChildNotFoundError;
  }
  check("RLS: getChildReport under another board → ChildNotFoundError", crossThrew);

  // 10. HTTP no-session → 401 (soft)
  try {
    const res = await fetch(`http://localhost:${env.PORT}/trpc/parent.listChildren`, { headers: { "x-board": P.slug } });
    check(`HTTP parent.listChildren (no session) → 401 (got ${res.status})`, res.status === 401);
  } catch {
    console.log("  ~ HTTP parent.listChildren skipped (server not running)");
  }

  // ── cleanup (FK-safe order) ──
  await withBoard(P.id, async (tx: Tx) => {
    await tx.delete(attempt).where(eq(attempt.boardId, P.id));
    await tx.delete(practiceSession).where(eq(practiceSession.boardId, P.id));
    await tx.delete(question).where(eq(question.boardId, P.id));
    await tx.delete(masteryHistory).where(eq(masteryHistory.boardId, P.id));
    await tx.delete(masteryState).where(eq(masteryState.boardId, P.id));
    // student rows FK to app_user (user_id / parent_id) — drop before appUser below.
    await tx.delete(student).where(eq(student.boardId, P.id));
    await tx.delete(subTopic).where(eq(subTopic.boardId, P.id));
    await tx.delete(topic).where(eq(topic.boardId, P.id));
    await tx.delete(chapter).where(eq(chapter.boardId, P.id));
    await tx.delete(subject).where(eq(subject.boardId, P.id));
  });
  await db.delete(appUser).where(eq(appUser.email, emailPA));
  await db.delete(appUser).where(eq(appUser.email, emailCH1));
  await db.delete(appUser).where(eq(appUser.email, emailCH2));
  await db.delete(board).where(eq(board.id, P.id));
  await db.delete(board).where(eq(board.id, Q.id));

  console.log(`\nprobe_parent_report: ${passed} passed, ${failed} failed`);
  await queryClient.end();
  process.exit(failed === 0 ? 0 : 1);
}

main().catch(async (err) => {
  console.error("probe_parent_report FAILED:", err);
  await queryClient.end();
  process.exit(1);
});
