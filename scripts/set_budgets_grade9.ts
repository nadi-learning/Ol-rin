/**
 * set_budgets_grade9 — chapter budgets for CBSE grade 9 Physics + Chemistry,
 * so Avani Kulkarni's growth bar has an honest denominator (S174).
 *
 * ⚠️ SAME CAVEAT AS `set_provisional_budgets.ts`: these are a SYLLABUS BUDGET
 * MODEL, not an authored carve. They come from the hand-off's own `ASK.md`
 * (CBSE weightings × teaching hours), supplied by Pranav alongside her data.
 * Every row is written with a `note` saying so. `backlog.md` BL-11 owns the job
 * of replacing budget guesses with real per-chapter figures.
 *
 * ── Why a budget and not a carve (ASK.md §3, and it is the right call) ───────
 * The growth bar scales off the spine. Counting only what is CARVED makes the
 * bar read nearly full the moment a student finishes the one chapter we happen
 * to have published — the parent cannot see how much of the year is left. The
 * obvious fix, carving every grade-9 chapter, is worse: we have no real carve
 * for chapters nobody has taught, so we would be inventing sub-topic NAMES to
 * make a bar the right length, on a page a parent reads. A budget states a
 * chapter's SIZE without inventing its contents, and the real carve replaces it
 * later without the bar ever being wrong.
 *
 * 🔑 THE ONE SUBTLETY (ASK.md): *Describing Motion Around Us* is published with
 * NINE sub-topics but budgeted at SEVENTEEN, on purpose. The chapter was only
 * ever partially built — its full carve is 17 and two of its five topics were
 * never built out. Budgeting it at 9 would render Motion as FINISHED when she
 * has done roughly half of it. `setChapterBudget` refuses a budget below the
 * carved count, so this direction is always safe.
 *
 *   bun scripts/set_budgets_grade9.ts [--target-prod] [--execute]
 *
 * Dry-run by default.
 */
import { and, eq, sql } from "drizzle-orm";
import { board, chapter, subject } from "@b2c/kernel/schema";
import { db, queryClient } from "../src/db/client";
import { withBoard } from "../src/db/with-board";
import { setChapterBudget } from "../src/services/chapter_budget";
import { assertTarget } from "./prod_guard";

const argv = process.argv.slice(2);
const EXECUTE = argv.includes("--execute");
const BOARD_SLUG = "cbse";
const NOTE = "provisional — syllabus budget model (CBSE weightings x teaching hours), not an authored carve; see BL-11";

/** From ASK.md §3. Physics scale 66, Chemistry scale 55 — combined 121. */
const BUDGETS: Array<{ subjectSlug: string; grade: string; chapter: string; budget: number }> = [
  { subjectSlug: "physics", grade: "9", chapter: "Describing Motion Around Us", budget: 17 },
  { subjectSlug: "physics", grade: "9", chapter: "How Forces Affect Motion", budget: 17 },
  { subjectSlug: "physics", grade: "9", chapter: "Work, Energy, and Simple Machines", budget: 17 },
  { subjectSlug: "physics", grade: "9", chapter: "Sound Waves: Characteristics and Applications", budget: 15 },
  { subjectSlug: "chemistry", grade: "9", chapter: "Exploring Mixtures and their Separation", budget: 19 },
  { subjectSlug: "chemistry", grade: "9", chapter: "Journey Inside the Atom", budget: 18 },
];

function norm(s: string): string {
  return s.normalize("NFC").trim().toLowerCase().replace(/[—–]/g, "-").replace(/\s+/g, " ");
}

async function main() {
  await assertTarget({
    argv,
    what: "write PROVISIONAL chapter budgets for CBSE grade-9 Physics + Chemistry (overrides, not carves)",
    affects: BUDGETS.map((b) => `${b.subjectSlug} g${b.grade} / ${b.chapter} → ${b.budget}`),
  });

  const [b] = await db.select().from(board).where(eq(board.slug, BOARD_SLUG));
  if (!b) throw new Error(`board '${BOARD_SLUG}' not found`);

  // The actor must be a real profile on THIS database — S171 found this script's
  // class-10 sibling hardcoding `admin@example.com`, a dev-seed identity that
  // does not exist on prod. Attribute to the oldest real admin instead.
  // Post-S138 the profile IS `app_user`; `membership` was absorbed into
  // `user_type`, so there is no role join to make.
  const [actor] = await db.execute(sql`
    select id, email from app_user
    where user_type = 'admin'
    order by created_at limit 1`);
  if (!actor) {
    console.error("✗ no admin profile on this board to attribute the budget to — refusing.");
    process.exit(1);
  }
  const actorId = actor.id as string;

  let total = 0;
  let written = 0;

  for (const want of BUDGETS) {
    const rows = await withBoard(b.id, (tx) =>
      tx
        .select({ id: chapter.id, name: chapter.name })
        .from(chapter)
        .innerJoin(subject, eq(subject.id, chapter.subjectId))
        .where(and(eq(subject.slug, want.subjectSlug), eq(subject.grade, want.grade))),
    );
    const hit = rows.find((r) => norm(r.name) === norm(want.chapter));
    if (!hit) {
      console.error(
        `✗ chapter not found: ${want.subjectSlug} g${want.grade} / "${want.chapter}"\n` +
          `  present: ${rows.map((r) => r.name).join(" | ") || "(none)"}`,
      );
      process.exit(1);
    }

    total += want.budget;
    if (!EXECUTE) {
      console.log(`  would set ${want.subjectSlug} g${want.grade} / ${want.chapter} → ${want.budget}`);
      continue;
    }
    const res = await withBoard(b.id, (tx) =>
      setChapterBudget(tx, { boardId: b.id, chapterId: hit.id, budget: want.budget, note: NOTE, actorId }),
    );
    written++;
    console.log(`  set ${want.subjectSlug} g${want.grade} / ${want.chapter} → ${res.budget} (carved ${res.carved})`);
  }

  console.log(`\n${EXECUTE ? "written" : "would write"}: ${EXECUTE ? written : BUDGETS.length} budget(s) · scale ${total}`);
  if (!EXECUTE) console.log("DRY RUN — nothing written. Re-run with --execute to apply.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => queryClient.end());
