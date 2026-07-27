/**
 * set_provisional_budgets — PROVISIONAL chapter budgets for CBSE class 10 (S170).
 *
 * ⚠️ THESE NUMBERS ARE PLACEHOLDERS, NOT THE AUTHORED SYLLABUS. ⚠️
 *
 * The founder's ruling was "for now let's do 192, deep dive later". The parent
 * dashboard's denominator was 127 — every sub_topic we have CARVED in the two
 * in-scope subjects — which describes our publishing progress rather than what
 * the child actually has to learn: 8 of the 19 chapters have nothing carved at
 * all and so counted as zero. 192 is the founder's working figure for the real
 * class-10 Maths + Physics syllabus.
 *
 * The difference between what is carved and the target is spread over the
 * chapters that have NOTHING carved, weighted by the mean carved size of their
 * own subject (see the TARGET_TOTAL note below). Nothing about the per-chapter
 * split is authored — only the TOTAL is a decision. Every row is written with a
 * `note` saying so, so nobody later reads these as curriculum. BL-11 in
 * `backlog.md` is the job of replacing them.
 *
 * Chapters that already carry carved sub-topics are left DERIVED on purpose: a
 * budget there would be a second unauthored guess, and the carved count is at
 * least true about something.
 *
 *   bun run budget:provisional                              # dry run, local
 *   bun run budget:provisional -- --execute
 *   bun run budget:provisional -- --target 192 --target-prod --execute
 *   bun run budget:provisional -- --clear --execute         # remove them again
 */
import { and, eq, inArray, sql } from "drizzle-orm";
import { appUser, board, chapter, chapterBudget, subject } from "@b2c/kernel/schema";
import { db, queryClient } from "../src/db/client";
import { withBoard } from "../src/db/with-board";
import { setChapterBudget } from "../src/services/chapter_budget";
import { assertTarget } from "./prod_guard";

const NOTE =
  "PROVISIONAL (S170) — placeholder so the denominator reaches the founder's syllabus " +
  "figure, NOT the authored CBSE count. Replace with the real per-chapter sub-topic " +
  "count (backlog BL-11).";

/**
 * The target is DERIVED, not tabulated (S170).
 *
 * The first version hardcoded a per-chapter map summing to 192 against LOCAL's
 * carve of 127. Prod carves a different number — 140 after the spine copy and
 * the Electricity merge — so the same table overshoots there, and the script
 * (correctly) refused. Two hardcoded tables for two databases is how they drift.
 *
 * So: give a TARGET, and the split is computed. Each chapter with nothing carved
 * is weighted by the mean carved size of chapters in ITS OWN subject — a Physics
 * chapter here averages ~22 sub-topics and a Maths one ~10, so a flat split would
 * misrepresent both — then scaled so the total lands exactly on the target.
 * Nothing about the per-chapter split is authored. Only the total is a decision.
 */
const targetArg = process.argv[process.argv.indexOf("--target") + 1];
const TARGET_TOTAL =
  process.argv.includes("--target") && targetArg ? Number(targetArg) : 192;

async function main() {
  const execute = process.argv.includes("--execute");
  const clear = process.argv.includes("--clear");

  await assertTarget({
    argv: process.argv.slice(2),
    what: clear
      ? "CLEAR every provisional chapter budget on the class-10 subjects"
      : `set PROVISIONAL chapter budgets so the parent denominator reads ${TARGET_TOTAL}`,
    affects: ["board 'cbse' — chapter_budget rows on Maths 10 + Physics 10"],
  });

  const [b] = await db.select().from(board).where(eq(board.slug, "cbse"));
  if (!b) throw new Error("no cbse board");
  // Attribution actor: any admin on this database. It was `admin@example.com`,
  // which exists locally and NOT on prod — a dev-seed identity is not a safe
  // default for a script that is meant to run in both places (S170).
  const actorArg = process.argv[process.argv.indexOf("--actor") + 1];
  const [actor] = process.argv.includes("--actor") && actorArg
    ? await db.select({ id: appUser.id, email: appUser.email }).from(appUser)
        .where(and(eq(appUser.email, actorArg), eq(appUser.userType, "admin")))
    : await db.select({ id: appUser.id, email: appUser.email }).from(appUser)
        .where(eq(appUser.userType, "admin")).limit(1);
  if (!actor) throw new Error("no admin profile on this database to attribute the write to");
  console.log(`  attributing to admin ${actor.email}\n`);

  await withBoard(b.id, async (tx) => {
    const rows = await tx
      .select({
        id: chapter.id,
        name: chapter.name,
        subjectName: subject.name,
        carved: sql<number>`(select count(*)::int from sub_topic st
                             join topic t on t.id = st.topic_id
                             where t.chapter_id = ${chapter.id})`,
      })
      .from(chapter)
      .innerJoin(subject, eq(subject.id, chapter.subjectId))
      .where(and(eq(subject.grade, "10"), inArray(subject.name, ["Maths", "Physics"])))
      .orderBy(subject.name, chapter.ordinal);

    if (clear) {
      const ids = rows.map((r) => r.id);
      console.log(`clearing every budget on ${ids.length} class-10 chapters`);
      if (execute) await tx.delete(chapterBudget).where(inArray(chapterBudget.chapterId, ids));
      return;
    }

    const carvedSum = rows.reduce((n, r) => n + Number(r.carved), 0);
    const empties = rows.filter((r) => Number(r.carved) === 0);
    const need = TARGET_TOTAL - carvedSum;

    console.log(`  carved today ${carvedSum} across ${rows.length - empties.length} chapters`);
    console.log(`  target ${TARGET_TOTAL} ⇒ ${need} sub-topics to spread over ${empties.length} empty chapters\n`);
    if (need < 0) {
      throw new Error(
        `refusing: ${carvedSum} sub-topics are already carved, which is MORE than the target ` +
          `${TARGET_TOTAL}. A budget cannot be below the carved count — the chapters would render ` +
          `as more than fully covered. Raise the target or re-check the spine.`,
      );
    }
    if (empties.length === 0) throw new Error("no empty chapters to budget — nothing to do");
    if (need < empties.length) {
      throw new Error(
        `refusing: ${need} sub-topics cannot be spread over ${empties.length} chapters without ` +
          `giving some of them 0, which means "deliberately out of scope" — a different claim.`,
      );
    }

    // Weight each empty chapter by the mean carved size of its OWN subject.
    const meanBySubject = new Map<string, number>();
    for (const s of new Set(rows.map((r) => r.subjectName))) {
      const carvedIn = rows.filter((r) => r.subjectName === s && Number(r.carved) > 0);
      const mean = carvedIn.length
        ? carvedIn.reduce((n, r) => n + Number(r.carved), 0) / carvedIn.length
        : 1;
      meanBySubject.set(s, mean);
    }
    const weights = empties.map((r) => meanBySubject.get(r.subjectName) ?? 1);
    const weightSum = weights.reduce((a, w) => a + w, 0);

    const plan: { id: string; name: string; budget: number }[] = [];
    let allocated = 0;
    empties.forEach((r, i) => {
      const raw = Math.max(1, Math.round((weights[i]! / weightSum) * need));
      plan.push({ id: r.id, name: `${r.subjectName} · ${r.name}`, budget: raw });
      allocated += raw;
    });
    // Rounding never lands exactly. Settle the difference on the largest entry,
    // where a ±1 or ±2 is proportionally smallest — and re-check it stays ≥ 1.
    let drift = need - allocated;
    if (drift !== 0) {
      const biggest = plan.reduce((a, p) => (p.budget > a.budget ? p : a), plan[0]!);
      if (biggest.budget + drift < 1) throw new Error(`cannot settle a drift of ${drift}`);
      biggest.budget += drift;
      drift = 0;
    }

    for (const p of plan) console.log(`  ${p.name.padEnd(48)} → ${p.budget}`);
    const budgetSum = carvedSum + plan.reduce((n, p) => n + p.budget, 0);
    console.log(`\n  carved ${carvedSum} + provisional ${budgetSum - carvedSum} = ${budgetSum}   target ${TARGET_TOTAL}`);
    if (budgetSum !== TARGET_TOTAL) {
      throw new Error(`refusing to write: the plan totals ${budgetSum}, not ${TARGET_TOTAL}.`);
    }

    if (!execute) {
      console.log("\n  DRY RUN — pass --execute to write.");
      return;
    }
    for (const p of plan) {
      await setChapterBudget(tx as any, {
        boardId: b.id,
        chapterId: p.id,
        budget: p.budget,
        note: NOTE,
        actorId: actor.id,
      });
    }
    console.log(`\n  wrote ${plan.length} provisional budgets.`);
  });
}

main()
  .then(() => queryClient.end())
  .catch(async (e) => {
    console.error(e instanceof Error ? e.message : e);
    await queryClient.end();
    process.exit(1);
  });
