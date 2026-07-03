/**
 * seed_pace (Slice PACE-1, Option A) — seed the REAL CBSE Science-9 chapter LIST
 * so the Pace Plan timeline has a genuine multi-chapter subject to plan, not a
 * fabricated one.
 *
 * Provenance: the 13 chapters below are the CBSE Science-9 curriculum from the
 * prod topic registry (shared/CBSE/config/topic_registry/cbse_science_9.json,
 * read 2026-07-03). Only chapter 5 (ch5_mixtures) has authored slide content —
 * seeded separately by `bun run seed:ch5` (5 topics/31 slides). The other 12 are
 * curriculum entries with NO slides (authoring is still early in Starkhorn), so
 * they carry no topics: PACE-1's topic-count week proxy (D-PACE-2) falls back to
 * the flat default for them. This is HONEST — it mirrors how pace behaves in prod
 * (a mix of authored + not-yet-authored chapters).
 *
 * Idempotent. Mixtures is matched by contentModuleKey ('ch5_mixtures') and left
 * UNTOUCHED (its ingested content/topics are preserved) — no duplicate chapter
 * (avoids the S18 "demo chapter" mistake). Usage: bun scripts/seed_pace.ts
 */
import { and, eq } from "drizzle-orm";
import type { PgTransaction } from "drizzle-orm/pg-core";
import { board, chapter, subject } from "@b2c/kernel/schema";
import { db, queryClient } from "../src/db/client";
import { withBoard } from "../src/db/with-board";

type Tx = PgTransaction<any, any, any>;

const BOARD_SLUG = "cbse";

// CBSE Science-9 curriculum (id = Starkhorn content_module_key; sequence = order).
const CHAPTERS: { id: string; name: string; sequence: number }[] = [
  { id: "ch1_exploration", name: "Exploration: Entering the World of Secondary Science", sequence: 1 },
  { id: "ch2_cell", name: "Cell: The Building Block of Life", sequence: 2 },
  { id: "ch3_tissues", name: "Tissues in Action", sequence: 3 },
  { id: "ch4_motion", name: "Describing Motion Around Us", sequence: 4 },
  { id: "ch5_mixtures", name: "Exploring Mixtures and their Separation", sequence: 5 },
  { id: "ch6_forces", name: "How Forces Affect Motion", sequence: 6 },
  { id: "ch7_work_energy", name: "Work, Energy, and Simple Machines", sequence: 7 },
  { id: "ch8_atom", name: "Journey Inside the Atom", sequence: 8 },
  { id: "ch9_atomic_foundations", name: "Atomic Foundations of Matter", sequence: 9 },
  { id: "ch10_sound", name: "Sound Waves: Characteristics and Applications", sequence: 10 },
  { id: "ch11_reproduction", name: "Reproduction: How Life Continues", sequence: 11 },
  { id: "ch12_diversity", name: "Patterns in Life: Diversity and Classification", sequence: 12 },
  { id: "ch13_earth_systems", name: "Earth as a System: Energy, Matter, and Life", sequence: 13 },
];

function slugify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
}

async function upsertBoard(slug: string, name: string) {
  const [row] = await db
    .insert(board)
    .values({ slug, name })
    .onConflictDoUpdate({ target: board.slug, set: { name } })
    .returning();
  return row!;
}

async function main() {
  const targetBoard = await upsertBoard(BOARD_SLUG, "CBSE");

  let created = 0;
  let kept = 0;

  await withBoard(targetBoard.id, async (tx: Tx) => {
    const boardId = targetBoard.id;

    // Science / grade 9 (same subject seed:ch5 uses).
    const [existingSubj] = await tx
      .select()
      .from(subject)
      .where(and(eq(subject.boardId, boardId), eq(subject.slug, "science"), eq(subject.grade, "9")))
      .limit(1);
    const subj =
      existingSubj ??
      (
        await tx
          .insert(subject)
          .values({ boardId, slug: "science", name: "Science", grade: "9" })
          .returning()
      )[0]!;

    for (const c of CHAPTERS) {
      // Match by contentModuleKey first (Mixtures is already seeded with content).
      const [byKey] = await tx
        .select()
        .from(chapter)
        .where(and(eq(chapter.subjectId, subj.id), eq(chapter.contentModuleKey, c.id)))
        .limit(1);
      if (byKey) {
        kept++;
        continue;
      }
      const slug = slugify(c.id);
      const [bySlug] = await tx
        .select()
        .from(chapter)
        .where(and(eq(chapter.subjectId, subj.id), eq(chapter.slug, slug)))
        .limit(1);
      if (bySlug) {
        // Backfill the content key on a pre-existing slug match, then keep it.
        if (!(bySlug as any).contentModuleKey) {
          await tx.update(chapter).set({ contentModuleKey: c.id }).where(eq(chapter.id, bySlug.id));
        }
        kept++;
        continue;
      }
      await tx.insert(chapter).values({
        boardId,
        subjectId: subj.id,
        slug,
        name: c.name,
        ordinal: c.sequence,
        contentModuleKey: c.id,
      });
      created++;
    }
  });

  console.log(
    `seed_pace: cbse Science-9 → ${CHAPTERS.length} chapters ensured (${created} created, ${kept} already present).`,
  );
  await queryClient.end();
}

main().catch(async (err) => {
  console.error("seed_pace FAILED:", err);
  await queryClient.end();
  process.exit(1);
});
