/**
 * probe_snapshot — Slice CLOCK-2 exit gate (the durable monthly mastery snapshot).
 *
 * Proves snapshot.ts against the real DB + real RLS on a THROWAWAY fixture
 * (unique board P per run, M22 — runMonthlySnapshot is scoped to seeded students,
 * never run global against the shared dev DB). Cleans up after itself.
 *
 *  1. DB connectivity as the app role.
 *  2. monthPeriod — a mid-month instant → first-of-month YYYY-MM-01 (UTC).
 *  3. snapshotStudent — covered/solid counts + per-subject metrics for a student
 *     with mixed mastery across two subjects.
 *  4. DURABILITY (the whole point) — mutate mastery to add a solid topic, re-run
 *     the SAME period → row unchanged (first-capture-wins), returns skipped.
 *  5. NEXT month — run period+1 → a new row that DOES reflect the mutation.
 *  6. runMonthlySnapshot SCOPING (M22) — studentIds filter snapshots only those;
 *     a second unlisted student on the board is untouched.
 *  7. runMonthlySnapshot unscoped (board-wide) — captures every student once,
 *     idempotent on a second call (all skipped).
 *  8. RLS cross-board — snapshots written under P are invisible under board Q.
 */
import { eq, sql } from "drizzle-orm";
import type { PgTransaction } from "drizzle-orm/pg-core";
import {
  appUser,
  board,
  chapter,
  masterySnapshot,
  masteryState,
  student,
  subTopic,
  subject,
  topic,
} from "@b2c/kernel/schema";
import { db, queryClient } from "../src/db/client";
import { withBoard } from "../src/db/with-board";
import { grantRole } from "../src/services/membership";
import {
  monthPeriod,
  runMonthlySnapshot,
  snapshotStudent,
} from "../src/services/snapshot";

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

const P1 = "2026-06-01";
const P2 = "2026-07-01";

async function main() {
  const tag = `${Date.now()}`;

  // 1. connectivity
  await db.execute(sql`select 1`);
  check("DB connectivity (select 1) as app role", true);

  // 2. monthPeriod unit
  check(
    "monthPeriod(2026-06-15T12:00Z) → 2026-06-01",
    monthPeriod(new Date("2026-06-15T12:00:00Z")) === "2026-06-01",
  );
  check(
    "monthPeriod(2026-12-31T23:00Z) → 2026-12-01",
    monthPeriod(new Date("2026-12-31T23:00:00Z")) === "2026-12-01",
  );

  const [P] = await db
    .insert(board)
    .values({ slug: `psn-p-${tag}`, name: "Probe P" })
    .returning();
  const [Q] = await db
    .insert(board)
    .values({ slug: `psn-q-${tag}`, name: "Probe Q" })
    .returning();
  if (!P || !Q) throw new Error("board seed failed");

  // Spine under P: subject Phys (chapter/topic) + subject Bio (chapter/topic).
  const fx = await withBoard(P.id, async (tx: Tx) => {
    const [sPhys] = await tx
      .insert(subject)
      .values({ boardId: P.id, slug: "phys", name: "Physics", grade: "IGCSE" })
      .returning();
    const [sBio] = await tx
      .insert(subject)
      .values({ boardId: P.id, slug: "bio", name: "Biology", grade: "IGCSE" })
      .returning();
    const [cP] = await tx
      .insert(chapter)
      .values({ boardId: P.id, subjectId: sPhys!.id, slug: "cp", name: "ChP", ordinal: 1 })
      .returning();
    const [cB] = await tx
      .insert(chapter)
      .values({ boardId: P.id, subjectId: sBio!.id, slug: "cb", name: "ChB", ordinal: 1 })
      .returning();
    const [tP] = await tx
      .insert(topic)
      .values({ boardId: P.id, chapterId: cP!.id, slug: "tp", name: "TP", ordinal: 1 })
      .returning();
    const [tB] = await tx
      .insert(topic)
      .values({ boardId: P.id, chapterId: cB!.id, slug: "tb", name: "TB", ordinal: 1 })
      .returning();
    const st = async (topicId: string, slug: string, ordinal: number) =>
      (
        await tx
          .insert(subTopic)
          .values({ boardId: P.id, topicId, slug, name: slug.toUpperCase(), ordinal })
          .returning()
      )[0]!.id;
    return {
      sPhys: sPhys!.id,
      sBio: sBio!.id,
      // D-PDASH-7 fixtures — the two clauses of `isSolid`, one per row:
      // Physics: p1 solid (5/4), p2 solid (3/2 — ONE axis reaches 3, the new
      // rule's whole point), p3 NOT (null/4 — an axis at 4 cannot carry a row
      // whose other axis was never assessed).
      p1: await st(tP!.id, "p1", 1),
      p2: await st(tP!.id, "p2", 2),
      p3: await st(tP!.id, "p3", 3),
      // Biology: b1 NOT solid (2/2 — both assessed, neither reaches 3)
      b1: await st(tB!.id, "b1", 1),
    };
  });

  const emailA = `psn-a-${tag}@example.com`;
  const emailB = `psn-b-${tag}@example.com`;
  const A = await withBoard(P.id, (tx) =>
    grantRole(tx, { email: emailA, name: "Stu A", board: P, role: "student" }),
  );
  const B = await withBoard(P.id, (tx) =>
    grantRole(tx, { email: emailB, name: "Stu B", board: P, role: "student" }),
  );
  const studentA = A.user.id;
  const studentB = B.user.id;
  await withBoard(P.id, async (tx) => {
    await tx.insert(student).values({ userId: studentA, boardId: P.id, class: "9" });
    await tx.insert(student).values({ userId: studentB, boardId: P.id, class: "9" });
  });

  const mastery = (
    tx: Tx,
    studentId: string,
    subTopicId: string,
    c: number | null,
    p: number | null,
  ) =>
    tx.insert(masteryState).values({
      boardId: P.id,
      studentId,
      subTopicId,
      conceptualLevel: c,
      proceduralLevel: p,
      description: "desc",
      log: "log",
    });

  // Student A: 4 covered, 2 solid (p1 5/4, p2 3/2). p3 null/4 blocked by the
  // unassessed axis; b1 2/2 assessed but below the bar.
  await withBoard(P.id, async (tx) => {
    await mastery(tx, studentA, fx.p1, 5, 4);
    await mastery(tx, studentA, fx.p2, 3, 2);
    await mastery(tx, studentA, fx.p3, null, 4);
    await mastery(tx, studentA, fx.b1, 2, 2);
    // Student B: 1 covered, 1 solid (p1 3/3) — for the scoping test.
    await mastery(tx, studentB, fx.p1, 3, 3);
  });

  // 3. snapshotStudent — A's period-1 rollup.
  const wroteA1 = await withBoard(P.id, (tx) =>
    snapshotStudent(tx, { boardId: P.id, studentId: studentA, period: P1 }),
  );
  check("3a. snapshotStudent wrote a new row", wroteA1 === true);
  const rowA1 = await withBoard(P.id, (tx: Tx) =>
    tx
      .select()
      .from(masterySnapshot)
      .where(eq(masterySnapshot.studentId, studentA))
      .then((r) => r[0]),
  );
  check("3b. covered = 4 (all mastery rows)", rowA1?.coveredCount === 4);
  check("3c. solid = 2 (D-PDASH-7: p1 5/4, p2 3/2)", rowA1?.solidCount === 2);
  // The both-assessed clause, asserted on its own: p3 carries a 4 and is still
  // not solid. Negative control — setting p3's conceptual to any 1–5 makes this
  // count 3 and reddens the leg.
  check(
    "3c-ii. an axis at 4 does NOT carry a row whose other axis is null (p3)",
    rowA1?.solidCount === 2,
  );
  const perSub = (rowA1?.metrics as any)?.perSubject as Array<any>;
  const phys = perSub?.find((s) => s.subjectId === fx.sPhys);
  const bio = perSub?.find((s) => s.subjectId === fx.sBio);
  check(
    "3d. per-subject: Physics covered 3 / solid 2",
    phys?.covered === 3 && phys?.solid === 2,
  );
  check(
    "3e. per-subject: Biology covered 1 / solid 0",
    bio?.covered === 1 && bio?.solid === 0,
  );

  // 4. DURABILITY — bump b1 to solid (2→4 conceptual), re-run SAME period.
  await withBoard(P.id, (tx) =>
    tx
      .update(masteryState)
      .set({ conceptualLevel: 4 })
      .where(
        sql`${masteryState.studentId} = ${studentA} and ${masteryState.subTopicId} = ${fx.b1}`,
      ),
  );
  const wroteA1again = await withBoard(P.id, (tx) =>
    snapshotStudent(tx, { boardId: P.id, studentId: studentA, period: P1 }),
  );
  check("4a. re-run same period → no new row (first-capture-wins)", wroteA1again === false);
  const rowA1after = await withBoard(P.id, (tx: Tx) =>
    tx
      .select()
      .from(masterySnapshot)
      .where(eq(masterySnapshot.studentId, studentA))
      .then((r) => r[0]),
  );
  check(
    "4b. frozen: solid STILL 2 despite b1 now solid (the drift the snapshot prevents)",
    rowA1after?.solidCount === 2,
  );

  // 5. NEXT month reflects the mutation.
  await withBoard(P.id, (tx) =>
    snapshotStudent(tx, { boardId: P.id, studentId: studentA, period: P2 }),
  );
  const rowA2 = await withBoard(P.id, (tx: Tx) =>
    tx
      .select()
      .from(masterySnapshot)
      .where(
        sql`${masterySnapshot.studentId} = ${studentA} and ${masterySnapshot.period} = ${P2}`,
      )
      .then((r) => r[0]),
  );
  check("5. next-month snapshot → solid 3 (b1 moved up); 'was 2 last month' holds", rowA2?.solidCount === 3);

  // 6. runMonthlySnapshot SCOPING (M22) — only studentA, for a fresh period.
  const P3 = "2026-08-01";
  const scoped = await withBoard(P.id, (tx) =>
    runMonthlySnapshot(tx, { boardId: P.id, period: P3, studentIds: [studentA] }),
  );
  check("6a. scoped run → written 1, skipped 0", scoped.written === 1 && scoped.skipped === 0);
  const bHasP3 = await withBoard(P.id, (tx: Tx) =>
    tx
      .select()
      .from(masterySnapshot)
      .where(
        sql`${masterySnapshot.studentId} = ${studentB} and ${masterySnapshot.period} = ${P3}`,
      )
      .then((r) => r.length),
  );
  check("6b. unlisted student B NOT snapshotted for that period", bHasP3 === 0);

  // 7. board-wide run (a NEW period) captures BOTH; idempotent on a second call.
  const P4 = "2026-09-01";
  const wide = await withBoard(P.id, (tx) =>
    runMonthlySnapshot(tx, { boardId: P.id, period: P4 }),
  );
  check("7a. board-wide run → written 2 (both students)", wide.written === 2 && wide.skipped === 0);
  const wideAgain = await withBoard(P.id, (tx) =>
    runMonthlySnapshot(tx, { boardId: P.id, period: P4 }),
  );
  check("7b. re-run same period → written 0, skipped 2 (idempotent)", wideAgain.written === 0 && wideAgain.skipped === 2);

  // 8. RLS cross-board — P's snapshots invisible under Q.
  const underQ = await withBoard(Q.id, (tx: Tx) =>
    tx.select().from(masterySnapshot).then((r) => r.length),
  );
  check("8. RLS: mastery_snapshot rows written under P are invisible under board Q", underQ === 0);

  // ── cleanup (FK-safe order) ──
  await withBoard(P.id, async (tx: Tx) => {
    await tx.delete(masterySnapshot).where(eq(masterySnapshot.boardId, P.id));
    await tx.delete(masteryState).where(eq(masteryState.boardId, P.id));
    await tx.delete(subTopic).where(eq(subTopic.boardId, P.id));
    await tx.delete(topic).where(eq(topic.boardId, P.id));
    await tx.delete(chapter).where(eq(chapter.boardId, P.id));
    await tx.delete(subject).where(eq(subject.boardId, P.id));
    await tx.delete(student).where(eq(student.boardId, P.id));
  });
  await db.delete(appUser).where(eq(appUser.email, emailA));
  await db.delete(appUser).where(eq(appUser.email, emailB));
  await db.delete(board).where(eq(board.id, P.id));
  await db.delete(board).where(eq(board.id, Q.id));

  console.log(`\nprobe_snapshot: ${passed} passed, ${failed} failed`);
  await queryClient.end();
  process.exit(failed === 0 ? 0 : 1);
}

main().catch(async (err) => {
  console.error("probe_snapshot FAILED:", err);
  await queryClient.end();
  process.exit(1);
});
