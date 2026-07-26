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
 * How the 65-sub-topic difference is spread (and why you should not trust it):
 *   · the 7 uncarved MATHS chapters get 7 each (49) — the carved Maths chapters
 *     average 8.9, so 7 is a deliberately conservative round number
 *   · Magnetic Effects of Electric Current gets 16 — the carved Physics chapters
 *     average 18.7, and this is a full chapter
 *   · 127 + 49 + 16 = 192
 * Nothing about the per-chapter split is authored. Only the TOTAL is a decision.
 * Every row is written with a `note` saying so, so nobody later reads these as
 * curriculum. BL-11 in `backlog.md` is the job of replacing them.
 *
 * Chapters that already carry carved sub-topics are left DERIVED on purpose: a
 * budget there would be a second unauthored guess, and the carved count is at
 * least true about something. Two of them are known to be short of prod's carve
 * (Quadratic Equations 4 local vs 8 prod, Electricity 9 vs 18) — also BL-11.
 *
 *   bun run budget:provisional            # dry run, prints the plan
 *   bun run budget:provisional -- --execute
 *   bun run budget:provisional -- --clear --execute    # remove them all again
 */
import { and, eq, inArray, sql } from "drizzle-orm";
import { appUser, board, chapter, chapterBudget, subject } from "@b2c/kernel/schema";
import { db, queryClient } from "../src/db/client";
import { withBoard } from "../src/db/with-board";
import { setChapterBudget } from "../src/services/chapter_budget";

const NOTE =
  "PROVISIONAL (S170) — placeholder so the denominator reads 192, NOT the authored " +
  "CBSE figure. Replace with the real per-chapter sub-topic count (backlog BL-11).";

/** chapter name → provisional budget. Only chapters with NOTHING carved. */
const PROVISIONAL: Record<string, number> = {
  // Maths 10 — 7 chapters × 7 = 49
  "Real Numbers": 7,
  "Arithmetic Progressions": 7,
  Triangles: 7,
  Circles: 7,
  "Areas Related to Circles": 7,
  "Surface Areas and Volumes": 7,
  Probability: 7,
  // Physics 10 — 16
  "Magnetic Effects of Electric Current": 16,
};

const TARGET_TOTAL = 192;

async function main() {
  const execute = process.argv.includes("--execute");
  const clear = process.argv.includes("--clear");

  const [b] = await db.select().from(board).where(eq(board.slug, "cbse"));
  if (!b) throw new Error("no cbse board");
  // Any admin profile will do as the attribution actor; these are ops rows.
  const [actor] = await db
    .select({ id: appUser.id })
    .from(appUser)
    .where(and(eq(appUser.email, "admin@example.com"), eq(appUser.userType, "admin")));
  if (!actor) throw new Error("no admin@example.com profile to attribute the write to");

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

    let carvedSum = 0;
    let budgetSum = 0;
    const plan: { id: string; name: string; budget: number }[] = [];
    for (const r of rows) {
      const carved = Number(r.carved);
      carvedSum += carved;
      const want = PROVISIONAL[r.name];
      if (want === undefined) {
        budgetSum += carved; // stays derived
        continue;
      }
      // A guard against silently over-writing a chapter someone has since carved:
      // the provisional numbers are only meaningful while the chapter is empty.
      if (carved > 0) {
        console.log(`  ⚠️ SKIP ${r.name} — now carries ${carved} carved sub-topics, no longer empty`);
        budgetSum += carved;
        continue;
      }
      budgetSum += want;
      plan.push({ id: r.id, name: `${r.subjectName} · ${r.name}`, budget: want });
    }

    for (const p of plan) console.log(`  ${p.name.padEnd(48)} → ${p.budget}`);
    console.log(`\n  carved today ${carvedSum}   with provisional budgets ${budgetSum}   target ${TARGET_TOTAL}`);
    if (budgetSum !== TARGET_TOTAL) {
      throw new Error(
        `refusing to write: the plan totals ${budgetSum}, not ${TARGET_TOTAL}. The spine has ` +
          `changed under these placeholders — re-derive them rather than letting the number drift.`,
      );
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
