/**
 * seed_ch5_mixtures — a REAL CBSE chapter pulled LIVE from the Starkhorn prod
 * server (nadi-app EC2 → nadi-db RDS), 2026-06-30. Companion to seed_ch4_motion.
 *
 * Provenance: the module ch5_mixtures is status='draft' on prod (all 31 slides
 * draft), so the normal publish→assemble pipeline (published-only) would emit an
 * empty manifest. The fixture's manifest is assembled READ-ONLY from the live DB
 * including drafts (mirroring manifest_builder.assembleForModule, meta read from
 * slides.meta_json); the bundle is the real prod preview build (workspace
 * b7953a8a). Both live in fixtures/starkhorn/ch5_mixtures/.
 *
 * The fixture is now REPRODUCIBLE via `bun run pull ch5_mixtures` (C2 — see
 * scripts/pull_module.ts), which regenerates these exact bytes from prod. The
 * original hand-copy (S8) is retired; re-pull to refresh.
 *
 * Spine is DERIVED FROM THE MANIFEST: each section → topic, each slide → sub_topic
 * carrying content_slide_key = its Starkhorn slideId. Board = cbse (correct board
 * for this content). Idempotent. Usage: bun scripts/seed_ch5_mixtures.ts
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { and, eq } from "drizzle-orm";
import type { PgTransaction } from "drizzle-orm/pg-core";
import {
  board,
  chapter,
  learningObjective,
  subTopic,
  subject,
  topic,
} from "@b2c/kernel/schema";
import { db, queryClient } from "../src/db/client";
import { withBoard } from "../src/db/with-board";
import { ingestModule } from "../src/services/ingest";

type Tx = PgTransaction<any, any, any>;

const BOARD_SLUG = "cbse";
const MODULE_KEY = "ch5_mixtures";
const ARTIFACT_DIR = join(import.meta.dir, "..", "fixtures", "starkhorn", "ch5_mixtures");

const manifest = JSON.parse(readFileSync(join(ARTIFACT_DIR, "manifest.json"), "utf8")) as {
  module_id: string;
  sections: { id: string; title: string; topics: { id: string; title: string }[] }[];
};

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
  await upsertBoard("cambridge", "Cambridge");
  const targetBoard = await upsertBoard(BOARD_SLUG, "CBSE");

  await withBoard(targetBoard.id, async (tx: Tx) => {
    const boardId = targetBoard.id;

    const subj = await getOrCreate(
      tx,
      subject,
      and(eq(subject.boardId, boardId), eq(subject.slug, "science"), eq(subject.grade, "9")),
      { boardId, slug: "science", name: "Science", grade: "9" },
    );

    const chap = await getOrCreate(
      tx,
      chapter,
      and(eq(chapter.subjectId, subj.id), eq(chapter.slug, "mixtures-and-separation")),
      { boardId, subjectId: subj.id, slug: "mixtures-and-separation", name: "Exploring Mixtures and their Separation", ordinal: 5, contentModuleKey: MODULE_KEY },
    );
    if ((chap as any).contentModuleKey !== MODULE_KEY) {
      await tx.update(chapter).set({ contentModuleKey: MODULE_KEY }).where(eq(chapter.id, chap.id));
    }

    let totalSub = 0;
    for (let si = 0; si < manifest.sections.length; si++) {
      const sec = manifest.sections[si]!;
      const top = await getOrCreate(
        tx,
        topic,
        and(eq(topic.chapterId, chap.id), eq(topic.slug, slugify(sec.id))),
        { boardId, chapterId: chap.id, slug: slugify(sec.id), name: sec.title, ordinal: si + 1 },
      );

      for (let i = 0; i < sec.topics.length; i++) {
        const sl = sec.topics[i]!;
        const stSlug = slugify(sl.id);
        const st = await getOrCreate(
          tx,
          subTopic,
          and(eq(subTopic.topicId, top.id), eq(subTopic.slug, stSlug)),
          { boardId, topicId: top.id, slug: stSlug, name: sl.title, ordinal: i + 1, contentSlideKey: sl.id },
        );
        if ((st as any).contentSlideKey !== sl.id) {
          await tx.update(subTopic).set({ contentSlideKey: sl.id }).where(eq(subTopic.id, st.id));
        }
        await seedLO(tx, boardId, st.id, "conceptual", `${sl.id}-C1`, `Reason about: ${sl.title}`);
        totalSub++;
      }
    }

    const res = await ingestModule(tx, { artifactDir: ARTIFACT_DIR });
    console.log(`[seed:ch5] cbse / Science 9 / "${chap.name}" (content_module_key=${MODULE_KEY})`);
    console.log(`[seed:ch5]   ${manifest.sections.length} sections → topics, ${totalSub} slides → sub_topics`);
    console.log(`[seed:ch5]   ingested ${res.moduleKey} → v${res.versionNo}${res.unchanged ? " (unchanged)" : ""} unit ${res.contentUnitId}`);
  });

  await queryClient.end();
}

async function getOrCreate(tx: Tx, table: any, where: any, values: any) {
  const existing = (await tx.select().from(table).where(where))[0];
  if (existing) return existing;
  return (await tx.insert(table).values(values).returning())[0];
}

async function seedLO(tx: Tx, boardId: string, subTopicId: string, axis: string, code: string, description: string) {
  const existing = (
    await tx
      .select()
      .from(learningObjective)
      .where(and(eq(learningObjective.subTopicId, subTopicId), eq(learningObjective.code, code)))
  )[0];
  if (existing) return existing;
  return (await tx.insert(learningObjective).values({ boardId, subTopicId, axis, code, description }).returning())[0];
}

main().catch(async (err) => {
  console.error("[seed:ch5] FAILED:", err);
  await queryClient.end();
  process.exit(1);
});
