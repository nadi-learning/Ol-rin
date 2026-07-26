/**
 * probe_chapter_budget — the per-chapter sub-topic BUDGET (S169).
 *
 * Drives the real service against a throwaway board (M22), then tears it down.
 * What must hold, in order of how badly it would hurt to get wrong:
 *
 *   · NO row ⇒ the dashboard denominator is UNCHANGED. This is the whole reason
 *     it is an override table: shipping it must move nothing until a number is
 *     set. If this leg ever fails, the feature has silently rewritten every
 *     parent's page.
 *   · a set budget REPLACES the carved count in `totals.totalNow`
 *   · clearing it restores the carved count
 *   · a budget BELOW the carved count is refused (the chapter would render as
 *     more than fully covered)
 *   · budgets are BOARD-SCOPED — board B cannot see or be changed by board A
 *   · the map still draws the CARVED cells; only the denominator grows
 *
 *   bun scripts/probe_chapter_budget.ts
 */
import { eq } from "drizzle-orm";
import { board, chapter, chapterBudget, masteryState, subTopic, subject, topic } from "@b2c/kernel/schema";
import { db, queryClient } from "../src/db/client";
import { withBoard } from "../src/db/with-board";
import {
  BudgetBelowCarvedError,
  listChapterBudgets,
  readChapterBudgets,
  setChapterBudget,
} from "../src/services/chapter_budget";
import { ensureProfile } from "../src/services/membership";
import { computeChildDashboard, type ChildSummary } from "../src/services/parent";

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
  console.log("probe_chapter_budget\n");
  const tag = Date.now().toString(36);
  const [P] = await db.insert(board).values({ slug: `bud-p-${tag}`, name: "P" }).returning();
  const [Q] = await db.insert(board).values({ slug: `bud-q-${tag}`, name: "Q" }).returning();
  const actor = await db.transaction((tx) =>
    ensureProfile(tx as any, { email: `bud-${tag}@example.com`, name: "Ed", userType: "admin" }),
  );

  try {
    // A minimal spine on P: one chapter carrying 3 sub-topics.
    const built = await withBoard(P!.id, async (tx) => {
      const [sub] = await tx
        .insert(subject)
        .values({ boardId: P!.id, slug: "phys", name: "Physics", grade: "10" })
        .returning();
      const [ch] = await tx
        .insert(chapter)
        .values({ boardId: P!.id, subjectId: sub!.id, slug: "ch1", name: "Electricity", ordinal: 1 })
        .returning();
      const [tp] = await tx
        .insert(topic)
        .values({ boardId: P!.id, chapterId: ch!.id, slug: "t1", name: "Current", ordinal: 1 })
        .returning();
      for (let i = 1; i <= 3; i++) {
        await tx
          .insert(subTopic)
          .values({ boardId: P!.id, topicId: tp!.id, slug: `st${i}`, name: `Sub ${i}`, ordinal: i });
      }
      return { chapterId: ch!.id };
    });

    // §1 no override → derive.
    const none = await withBoard(P!.id, (tx) => readChapterBudgets(tx, [built.chapterId]));
    check("§1 no row ⇒ NO override is returned (the denominator stays derived)", none.size === 0);
    const list0 = await withBoard(P!.id, (tx) => listChapterBudgets(tx));
    const row0 = list0.find((r) => r.chapterId === built.chapterId);
    check("§1b the editor sees the carved count", row0?.carved === 3);
    check("§1c budget is null and `effective` falls back to carved", row0?.budget === null && row0?.effective === 3);

    // §2 set → wins.
    await withBoard(P!.id, (tx) =>
      setChapterBudget(tx, { boardId: P!.id, chapterId: built.chapterId, budget: 12, actorId: actor.id }),
    );
    const set = await withBoard(P!.id, (tx) => readChapterBudgets(tx, [built.chapterId]));
    check("§2 a set budget is returned as the override", set.get(built.chapterId) === 12);
    const list1 = await withBoard(P!.id, (tx) => listChapterBudgets(tx));
    const row1 = list1.find((r) => r.chapterId === built.chapterId);
    check("§2b `effective` is now the authored number, carved is unchanged", row1?.effective === 12 && row1?.carved === 3);
    check("§2c provenance: the carved count at write time is stored", true);
    const stored = await withBoard(P!.id, (tx) =>
      tx.select().from(chapterBudget).where(eq(chapterBudget.chapterId, built.chapterId)),
    );
    check("§2d sub_topic_count recorded what was carved when it was set", stored[0]?.subTopicCount === 3);

    // §3 THE GUARD — below the carved count would read as >100% covered.
    let refused: BudgetBelowCarvedError | null = null;
    try {
      await withBoard(P!.id, (tx) =>
        setChapterBudget(tx, { boardId: P!.id, chapterId: built.chapterId, budget: 2, actorId: actor.id }),
      );
    } catch (e) {
      if (e instanceof BudgetBelowCarvedError) refused = e;
    }
    check("§3 a budget BELOW the carved count is REFUSED", refused !== null);
    check("§3b the error names both numbers", refused?.budget === 2 && refused?.carved === 3);
    check(
      "§3c the refusal did NOT overwrite the good value",
      (await withBoard(P!.id, (tx) => readChapterBudgets(tx, [built.chapterId]))).get(built.chapterId) === 12,
    );
    // Exactly equal to carved is legal — a fully-carved chapter.
    await withBoard(P!.id, (tx) =>
      setChapterBudget(tx, { boardId: P!.id, chapterId: built.chapterId, budget: 3, actorId: actor.id }),
    );
    check(
      "§3d a budget EQUAL to the carved count is allowed",
      (await withBoard(P!.id, (tx) => readChapterBudgets(tx, [built.chapterId]))).get(built.chapterId) === 3,
    );

    // §4 clear → back to derived.
    await withBoard(P!.id, (tx) =>
      setChapterBudget(tx, { boardId: P!.id, chapterId: built.chapterId, budget: null, actorId: actor.id }),
    );
    check(
      "§4 clearing removes the override (denominator derives again)",
      (await withBoard(P!.id, (tx) => readChapterBudgets(tx, [built.chapterId]))).size === 0,
    );
    check(
      "§4b the row is DELETED, not stored as 0 — absent means 'derive', which 0 does not",
      (
        await withBoard(P!.id, (tx) =>
          tx.select().from(chapterBudget).where(eq(chapterBudget.chapterId, built.chapterId)),
        )
      ).length === 0,
    );
    // 0 is NOT a free pass: it is below the carved count here, so the same guard
    // applies. Zero is only reachable for a chapter with nothing carved yet —
    // which is exactly what "deliberately out of scope" means in practice.
    let zeroRefused = false;
    try {
      await withBoard(P!.id, (tx) =>
        setChapterBudget(tx, { boardId: P!.id, chapterId: built.chapterId, budget: 0, actorId: actor.id }),
      );
    } catch (e) {
      zeroRefused = e instanceof BudgetBelowCarvedError;
    }
    check("§4c a budget of 0 on a CARVED chapter is refused like any other under-count", zeroRefused);
    // An empty chapter shell can legitimately be zeroed.
    const emptyChapterId = await withBoard(P!.id, async (tx) => {
      const [sub] = await tx.select({ id: subject.id }).from(subject).limit(1);
      const [ch] = await tx
        .insert(chapter)
        .values({ boardId: P!.id, subjectId: sub!.id, slug: "ch2", name: "Shell", ordinal: 2 })
        .returning();
      return ch!.id;
    });
    await withBoard(P!.id, (tx) =>
      setChapterBudget(tx, { boardId: P!.id, chapterId: emptyChapterId, budget: 0, actorId: actor.id }),
    );
    check(
      "§4d 0 IS storable on a chapter with nothing carved (deliberately out of scope)",
      (await withBoard(P!.id, (tx) => readChapterBudgets(tx, [emptyChapterId]))).get(emptyChapterId) === 0,
    );

    // §6 THE DASHBOARD LEG (S170) — a budget is worth nothing if the page never
    // reads it. The original bug: `chapterRows` is built off a spine query that
    // INNER JOINs `sub_topic`, so a chapter with NOTHING carved never entered
    // the map and its budget was silently discarded from `totals.totalNow`. The
    // admin editor reported `effective 10`; the parent page kept its old number
    // and nothing errored. That is precisely the chapter a budget exists for.
    const student = await db.transaction((tx) =>
      ensureProfile(tx as any, { email: `budkid-${tag}@example.com`, name: "Kid", userType: "student" }),
    );
    const kid: ChildSummary = { studentId: student.id, name: "Kid", email: student.email };
    await withBoard(P!.id, async (tx) => {
      // One certified mastery row puts Physics in scope (that is what "in scope"
      // means for this page) without making the chapter fully covered.
      const [st] = await tx.select({ id: subTopic.id }).from(subTopic).limit(1);
      await tx.insert(masteryState).values({
        boardId: P!.id,
        studentId: student.id,
        subTopicId: st!.id,
        conceptualLevel: 4,
        proceduralLevel: 4,
        description: "certified",
        log: "probe", // M11: internal-only column, never leaves the read path
      });
    });

    const base = await withBoard(P!.id, (tx) => computeChildDashboard(tx, kid));
    check("§6 with no budgets the denominator is the carved count (3 carved + 0 shell)", base.totals.totalNow === 3);
    // The shell is sitting at budget 0 from §4d — "deliberately out of scope".
    // It must NOT be drawn as a chapter she has yet to start, and must not add
    // to the denominator either.
    check(
      "§6b a chapter budgeted at ZERO stays out of the map and out of the total",
      base.subjects[0]?.chapters.length === 1,
    );

    // Budget the CARVED chapter — the S169 behaviour, still must hold.
    await withBoard(P!.id, (tx) =>
      setChapterBudget(tx, { boardId: P!.id, chapterId: built.chapterId, budget: 8, actorId: actor.id }),
    );
    const carvedOnly = await withBoard(P!.id, (tx) => computeChildDashboard(tx, kid));
    check("§6c a budget on a CARVED chapter replaces its carved count", carvedOnly.totals.totalNow === 8);

    // Budget the EMPTY shell — the S170 regression. `emptyChapterId` is already
    // sitting at 0 from §4d; move it to a real number.
    await withBoard(P!.id, (tx) =>
      setChapterBudget(tx, { boardId: P!.id, chapterId: emptyChapterId, budget: 10, actorId: actor.id }),
    );
    const withShell = await withBoard(P!.id, (tx) => computeChildDashboard(tx, kid));
    check(
      "§6d 🔴 a budget on a chapter with ZERO carved sub-topics REACHES the denominator",
      withShell.totals.totalNow === 18,
    );
    const chapters = withShell.subjects[0]?.chapters ?? [];
    check("§6e that chapter now appears in the map as a budget-only row", chapters.length === 2);
    const shellRow = chapters.find((c) => c.chapterId === emptyChapterId);
    check(
      "§6f it carries its budget but draws no cells (nothing is carved to draw)",
      shellRow?.budget === 10 && shellRow?.total === 0 && shellRow?.cells.length === 0,
    );
    check(
      "§6g chapters stay in SYLLABUS order — the appended row is not left at the end",
      chapters[0]?.chapterId === built.chapterId && chapters[1]?.chapterId === emptyChapterId,
    );
    check(
      "§6h the editor and the page agree — sum of `effective` == totalNow",
      (await withBoard(P!.id, (tx) => listChapterBudgets(tx))).reduce((n, r) => n + r.effective, 0) ===
        withShell.totals.totalNow,
    );

    // Clearing both must land back exactly where §6 started.
    for (const id of [built.chapterId, emptyChapterId]) {
      await withBoard(P!.id, (tx) =>
        setChapterBudget(tx, { boardId: P!.id, chapterId: id, budget: null, actorId: actor.id }),
      );
    }
    const cleared = await withBoard(P!.id, (tx) => computeChildDashboard(tx, kid));
    check(
      "§6i clearing every budget restores the derived denominator AND drops the empty row",
      cleared.totals.totalNow === 3 && cleared.subjects[0]?.chapters.length === 1,
    );

    // §5 board scoping.
    const qView = await withBoard(Q!.id, (tx) => readChapterBudgets(tx, [built.chapterId]));
    check("§5 board Q cannot see board P's budget (RLS)", qView.size === 0);
    check(
      "§5b board Q's editor lists none of P's chapters",
      (await withBoard(Q!.id, (tx) => listChapterBudgets(tx))).length === 0,
    );
  } finally {
    // RLS'd + FORCEd: a board-less delete matches nothing and then the board
    // delete fails on the FK (M80's family). Claim each board to tear it down.
    for (const b of [P!, Q!]) {
      await withBoard(b.id, async (tx) => {
        await tx.delete(chapterBudget);
        await tx.delete(masteryState); // references sub_topic — must go first (M94)
        await tx.delete(subTopic);
        await tx.delete(topic);
        await tx.delete(chapter);
        await tx.delete(subject);
      });
      await db.delete(board).where(eq(board.id, b.id));
    }
  }

  console.log(`\nprobe_chapter_budget: ${passed} passed, ${failed} failed`);
  await queryClient.end();
  process.exit(failed === 0 ? 0 : 1);
}

main().catch(async (err) => {
  console.error("probe_chapter_budget FAILED:", err);
  await queryClient.end();
  process.exit(1);
});
