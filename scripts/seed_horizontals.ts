/**
 * seed_horizontals — ingest the horizontal-skill TAXONOMY from the topic
 * registries into `horizontal_skill` (Slice S2R-3, D-S2R-4).
 *
 * The taxonomy is PREDEFINED, not invented: every registry chapter may carry
 * `horizontal: [{slug, description}]`, and that is the whole source of truth.
 * 9 of the 30 registry chapters define horizontals today.
 *
 * ⚠️ WHY THIS IS A SEPARATE SCRIPT AND NOT A FEW LINES INSIDE
 * seed_topic_registry.ts — two reasons, both found by auditing the real DB
 * rather than reading the registry alone:
 *
 *   1. seed_topic_registry SKIPS ch5_mixtures (SKIP_MODULE_KEYS — seed:ch5 owns
 *      it, with slides). But ch5_mixtures DEFINES horizontals, and it is the one
 *      chapter in the local DB carrying a real observation with a
 *      non_subtopic_note (demo@'s mixtures row — S2R-1's entire showcase). An
 *      ingest that inherited that skip would have no taxonomy exactly where the
 *      only real evidence lives.
 *   2. seed_topic_registry places chapters via its hardcoded FILES map, which
 *      says Chemistry_CBSE_9 → subject `chemistry`. The DB disagrees:
 *      ch5_mixtures actually lives under subject `science` grade 9, because a
 *      different seed put it there. The FILES map is a placement plan for rows
 *      that script creates; it is NOT a description of where chapters ARE.
 *
 * So this resolves the chapter by `content_module_key` (the cross-system content
 * key, D-C1-1) and takes `subject_id` FROM THE RESOLVED ROW. The DB is the truth
 * about where a chapter lives; the registry is the truth about what it teaches.
 *
 * ⚠️ ONE REGISTRY CHAPTER CAN RESOLVE TO SEVERAL DB CHAPTERS. Measured: cbse has
 * `ch4_motion` twice — under subject `physics 9` AND `science 9` (two seeds, two
 * placements) — and it defines horizontals. Both copies get the definitions, each
 * against its own subject. That is deliberate: the two rows teach the same
 * content, and since state pools per SUBJECT (D-S2R-8), a student practising the
 * `science` copy must accrue on `science`. Picking one placement would silently
 * blind the other. The duplication is a pre-existing data condition and this
 * script does not adjudicate it.
 *
 * Idempotent: upsert on (chapter_id, slug) — re-running updates descriptions in
 * place, so editing a registry and re-seeding is the intended edit path.
 *
 * Usage: bun run seed:horizontals
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { and, eq } from "drizzle-orm";
import type { PgTransaction } from "drizzle-orm/pg-core";
import { board, chapter, horizontalSkill } from "@b2c/kernel/schema";
import { db, queryClient } from "../src/db/client";
import { withBoard } from "../src/db/with-board";

type Tx = PgTransaction<any, any, any>;

const REG_DIR = join(import.meta.dir, "..", "fixtures", "topic-registry");

// Board slug comes from the directory, not the registry's `board` field — the
// field is display-cased ("CBSE" / "Cambridge") and the directory is what the
// existing seeds already trust.
const FILES: Array<{ rel: string; boardSlug: string }> = [
  { rel: "cbse/Physics_CBSE_9.json", boardSlug: "cbse" },
  { rel: "cbse/Chemistry_CBSE_9.json", boardSlug: "cbse" },
  { rel: "cbse/cbse_math_10.json", boardSlug: "cbse" },
  { rel: "cbse/cbse_physics_10.json", boardSlug: "cbse" },
  { rel: "cambridge/Physics_Grade7.json", boardSlug: "cambridge" },
  { rel: "cambridge/Physics_Grade8.json", boardSlug: "cambridge" },
  { rel: "cambridge/Physics_IGCSE.json", boardSlug: "cambridge" },
];

type RegHorizontal = { slug: string; description: string };
type RegChapter = { id: string; name: string; horizontal?: RegHorizontal[] };
type Registry = { subject: string; board: string; chapters: RegChapter[] };

async function main() {
  const boards = await db.select().from(board);
  const boardBySlug = new Map(boards.map((b) => [b.slug, b]));

  let defined = 0; // (chapter, slug) definitions read from the registries
  let written = 0; // horizontal_skill rows upserted
  const unresolved: string[] = []; // registry chapters with horizontals + no DB chapter

  for (const { rel, boardSlug } of FILES) {
    const reg = JSON.parse(readFileSync(join(REG_DIR, rel), "utf8")) as Registry;
    const boardRow = boardBySlug.get(boardSlug);
    if (!boardRow) {
      console.warn(`[seed:horizontals] board '${boardSlug}' missing — skipping ${rel}`);
      continue;
    }

    await withBoard(boardRow.id, async (tx: Tx) => {
      for (const rc of reg.chapters ?? []) {
        const horizontals = rc.horizontal ?? [];
        if (horizontals.length === 0) continue;

        // EVERY placement of this chapter in this board (see the header note).
        const targets = await tx
          .select({ id: chapter.id, subjectId: chapter.subjectId, slug: chapter.slug })
          .from(chapter)
          .where(
            and(eq(chapter.boardId, boardRow.id), eq(chapter.contentModuleKey, rc.id)),
          );

        if (targets.length === 0) {
          // Loud on purpose: a chapter that defines horizontals but has no spine
          // row means the taxonomy silently has no home. Reporting it as a number
          // at the end is how "the ingest ran, 0 rows" stops looking like success.
          unresolved.push(`${boardSlug}/${rc.id} (${horizontals.length} skill(s))`);
          continue;
        }

        for (const h of horizontals) {
          defined++;
          for (const t of targets) {
            await tx
              .insert(horizontalSkill)
              .values({
                boardId: boardRow.id,
                subjectId: t.subjectId,
                chapterId: t.id,
                slug: h.slug,
                description: h.description,
              })
              .onConflictDoUpdate({
                target: [horizontalSkill.chapterId, horizontalSkill.slug],
                set: { description: h.description },
              });
            written++;
          }
        }
      }
    });
  }

  console.log(
    `[seed:horizontals] DONE — ${defined} definition(s) across the registries → ` +
      `${written} horizontal_skill row(s) (a chapter placed under >1 subject gets one row each)`,
  );
  if (unresolved.length) {
    console.warn(
      `[seed:horizontals] ⚠️ ${unresolved.length} registry chapter(s) define horizontals ` +
        `but have NO chapter row — their taxonomy was NOT ingested:\n  ` +
        unresolved.join("\n  "),
    );
  }

  await queryClient.end();
}

main().catch(async (err) => {
  console.error("[seed:horizontals] FAILED:", err);
  await queryClient.end();
  process.exit(1);
});
