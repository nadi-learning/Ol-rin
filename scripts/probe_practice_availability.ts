/**
 * probe_practice_availability — Slice AVAIL exit gate. Proves `listAvailability`
 * (the browse list's Coming-soon signal) against the real DB + real RLS with a
 * THROWAWAY fixture (unique board per run, M22). Cleans up after itself.
 *
 * Fixture (board P): subject S1 → chapter C1 → topic T1 with five sub_topics:
 *   A1 — one CANONICAL approved question   → available to everyone
 *   A2 — no questions at all               → Coming soon
 *   A3 — only a DRAFT question             → Coming soon (drafts never served)
 *   A4 — one question PRIVATE to ST2       → Coming soon for ST, available to ST2
 *   A5 — one question PRIVATE to ST        → available to ST, Coming soon for ST2
 *
 * The point of the fixture is leg 7. Legs 2-6 assert the cases I thought of;
 * leg 7 asserts the INVARIANT that actually matters — for EVERY sub_topic, the
 * availability signal and what startSession really does must agree. A chip that
 * says "Coming soon" over a servable sub_topic (or promises questions that
 * startSession then refuses with NO_QUESTIONS) is a lying UI, which is worse than
 * the dead-end it replaced. Both callers share `availableQuestionWhere`, so this
 * leg is what proves the sharing actually holds end-to-end.
 *
 *  1. DB connectivity.
 *  2. CANONICAL question → A1 available (count 1).
 *  3. NO questions → A2 absent from availability.
 *  4. DRAFT only → A3 absent (M11 CHECK side: drafts never served).
 *  5. PRIVATE to another student → A4 absent for ST.
 *  6. PRIVATE to caller → A5 available for ST; and per-caller split (A4/A5 swap
 *     for ST2) — the read is caller-scoped, not global.
 *  7. INVARIANT: for every fixture sub_topic, available ⟺ startSession succeeds.
 *  8. COUNT accuracy: 3 canonical questions on A1 → count 3 (not a bare boolean).
 *  9. RLS cross-board: listAvailability under board Q → [] (no leak).
 */
import { eq, sql } from "drizzle-orm";
import type { PgTransaction } from "drizzle-orm/pg-core";
import {
  appUser,
  attempt,
  board,
  chapter,
  student,
  practiceSession,
  question,
  subTopic,
  subject,
  topic,
} from "@b2c/kernel/schema";
import { db, queryClient } from "../src/db/client";
import { withBoard } from "../src/db/with-board";
import { grantRole } from "../src/services/membership";
import { listAvailability, NoQuestionsError, startSession } from "../src/services/practice";

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

  await db.execute(sql`select 1`);
  check("DB connectivity (select 1) as app role", true);

  const [P] = await db.insert(board).values({ slug: `avail-p-${tag}`, name: "Probe P" }).returning();
  const [Q] = await db.insert(board).values({ slug: `avail-q-${tag}`, name: "Probe Q" }).returning();
  if (!P || !Q) throw new Error("board seed failed");

  const fx = await withBoard(P.id, async (tx: Tx) => {
    const [s1] = await tx.insert(subject).values({ boardId: P.id, slug: "phys", name: "Physics", grade: "IGCSE" }).returning();
    const [c1] = await tx.insert(chapter).values({ boardId: P.id, subjectId: s1!.id, slug: "c1", name: "Ch1", ordinal: 1 }).returning();
    const [t1] = await tx.insert(topic).values({ boardId: P.id, chapterId: c1!.id, slug: "t1", name: "T1", ordinal: 1 }).returning();
    const st = async (slug: string, name: string, ordinal: number) =>
      (await tx.insert(subTopic).values({ boardId: P.id, topicId: t1!.id, slug, name, ordinal }).returning())[0]!.id;
    return {
      A1: await st("a1", "ST A1", 1),
      A2: await st("a2", "ST A2", 2),
      A3: await st("a3", "ST A3", 3),
      A4: await st("a4", "ST A4", 4),
      A5: await st("a5", "ST A5", 5),
    };
  });

  const emailST = `avail-st-${tag}@example.com`;
  const emailST2 = `avail-st2-${tag}@example.com`;
  const ST = await withBoard(P.id, (tx) => grantRole(tx, { email: emailST, name: "Student", board: P, role: "student" }));
  const ST2 = await withBoard(P.id, (tx) => grantRole(tx, { email: emailST2, name: "Student2", board: P, role: "student" }));
  const studentId = ST.user.id;
  const student2Id = ST2.user.id;

  let ord = 0;
  const seedQ = (subTopicId: string, target: string | null, status: "approved" | "draft" = "approved") =>
    withBoard(P.id, async (tx: Tx) =>
      (
        await tx
          .insert(question)
          .values({
            boardId: P.id, subTopicId, axis: "conceptual", kind: "subjective",
            stem: `Q on ${subTopicId} #${++ord}`, referenceAnswer: "ref", explanation: null,
            ordinal: ord, source: "b2c_authoring", status, targetStudentId: target,
          })
          .returning()
      )[0]!.id,
    );

  const availFor = async (appUserId: string, boardId = P.id) =>
    new Map(
      (await withBoard(boardId, (tx) => listAvailability(tx, { appUserId }))).map((r) => [
        r.subTopicId,
        r.count,
      ]),
    );

  await seedQ(fx.A1, null); // canonical
  await seedQ(fx.A3, null, "draft"); // draft only
  await seedQ(fx.A4, student2Id); // private to ST2
  await seedQ(fx.A5, studentId); // private to ST

  const a = await availFor(studentId);

  // 2-5.
  check("CANONICAL → A1 available (count 1)", a.get(fx.A1) === 1);
  check("NO questions → A2 absent (Coming soon)", !a.has(fx.A2));
  check("DRAFT only → A3 absent (drafts never served)", !a.has(fx.A3));
  check("PRIVATE to another student → A4 absent for ST", !a.has(fx.A4));

  // 6. caller-scoped: the private pair swaps for ST2.
  check("PRIVATE to caller → A5 available for ST", a.has(fx.A5));
  const a2 = await availFor(student2Id);
  check("CALLER-SCOPED: for ST2 the private pair swaps (A4 available, A5 absent)",
    a2.has(fx.A4) && !a2.has(fx.A5));
  check("CALLER-SCOPED: canonical A1 available to BOTH students", a2.get(fx.A1) === 1);

  // 7. THE INVARIANT — availability ⟺ startSession, for every sub_topic.
  const ALL: [string, string][] = [
    ["A1", fx.A1], ["A2", fx.A2], ["A3", fx.A3], ["A4", fx.A4], ["A5", fx.A5],
  ];
  let agree = true;
  const disagreements: string[] = [];
  for (const [name, subTopicId] of ALL) {
    const claimsAvailable = a.has(subTopicId);
    let actuallyServes = false;
    try {
      await withBoard(P.id, (tx) =>
        startSession(tx, { boardId: P.id, appUserId: studentId, subTopicId }),
      );
      actuallyServes = true;
    } catch (e) {
      if (!(e instanceof NoQuestionsError)) throw e;
      actuallyServes = false;
    }
    if (claimsAvailable !== actuallyServes) {
      agree = false;
      disagreements.push(`${name}: chip=${claimsAvailable} startSession=${actuallyServes}`);
    }
  }
  check(
    `INVARIANT: available ⟺ startSession serves, for all ${ALL.length} sub_topics` +
      (agree ? "" : ` — DISAGREE: ${disagreements.join("; ")}`),
    agree,
  );

  // 8. count is a real count, not a boolean.
  await seedQ(fx.A1, null);
  await seedQ(fx.A1, null);
  const a3 = await availFor(studentId);
  check("COUNT: 3 canonical questions on A1 → count 3", a3.get(fx.A1) === 3);

  // 9. RLS cross-board.
  const aQ = await availFor(studentId, Q.id);
  check("RLS: listAvailability under board Q → [] (no leak)", aQ.size === 0);

  // ── cleanup (FK-safe order) ──
  await withBoard(P.id, async (tx: Tx) => {
    await tx.delete(attempt).where(eq(attempt.boardId, P.id));
    await tx.delete(practiceSession).where(eq(practiceSession.boardId, P.id));
    await tx.delete(question).where(eq(question.boardId, P.id));
    await tx.delete(subTopic).where(eq(subTopic.boardId, P.id));
    await tx.delete(topic).where(eq(topic.boardId, P.id));
    await tx.delete(chapter).where(eq(chapter.boardId, P.id));
    await tx.delete(subject).where(eq(subject.boardId, P.id));
    await tx.delete(student).where(eq(student.boardId, P.id));
  });
  await db.delete(appUser).where(eq(appUser.email, emailST));
  await db.delete(appUser).where(eq(appUser.email, emailST2));
  await db.delete(board).where(eq(board.id, P.id));
  await db.delete(board).where(eq(board.id, Q.id));

  console.log(`\nprobe_practice_availability: ${passed} passed, ${failed} failed`);
  await queryClient.end();
  process.exit(failed === 0 ? 0 : 1);
}

main().catch(async (err) => {
  console.error("probe_practice_availability FAILED:", err);
  await queryClient.end();
  process.exit(1);
});
