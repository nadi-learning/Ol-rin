/**
 * seed_ch4_motion — the REAL canonical Revision fixture (C1). Replaces the S2
 * synthetic stand-in (forces-and-motion) with a real Starkhorn-authored module.
 *
 * Two halves, mirroring the real architecture:
 *   1. CURRICULUM SPINE (authored in b2c) — Cambridge/Grade8/Physics → chapter
 *      "Motion" → topic t1 → 2 sub_topics, carrying the cross-system mapping
 *      keys (D-C1-1): chapter.content_module_key='ch4_motion', each sub_topic's
 *      content_slide_key = its Starkhorn slideId.
 *   2. CONTENT (pulled from Starkhorn) — ingestModule() reads the real artifact
 *      (fixtures/starkhorn/ch4_motion/{manifest.json,bundle.js}) and caches it as
 *      content_unit + content_version. The fixture stands in for the transport
 *      (C2); the ingest write is the real pull-and-cache.
 *
 * Idempotent + re-runnable. Usage: bun scripts/seed_ch4_motion.ts
 */
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

const BOARD_SLUG = "cambridge";
const MODULE_KEY = "ch4_motion";
const ARTIFACT_DIR = join(import.meta.dir, "..", "fixtures", "starkhorn", "ch4_motion");

// sub_topic slug → { name, content_slide_key (Starkhorn slideId in the manifest) }
const SUB_TOPICS = [
  { slug: "position-and-reference-frame", name: "Position and the reference frame", slideKey: "t1-1" },
  { slug: "the-invariant-gap", name: "The gap that won't budge", slideKey: "t1-1_invariant" },
] as const;

async function upsertBoard(slug: string, name: string) {
  const [row] = await db
    .insert(board)
    .values({ slug, name })
    .onConflictDoUpdate({ target: board.slug, set: { name } })
    .returning();
  return row!;
}

async function main() {
  const targetBoard = await upsertBoard(BOARD_SLUG, "Cambridge");
  await upsertBoard("cbse", "CBSE"); // other tenant for RLS checks

  await withBoard(targetBoard.id, async (tx: Tx) => {
    const boardId = targetBoard.id;

    const subj = await getOrCreate(
      tx,
      subject,
      and(eq(subject.boardId, boardId), eq(subject.slug, "physics"), eq(subject.grade, "Grade8")),
      { boardId, slug: "physics", name: "Physics", grade: "Grade8" },
    );

    // chapter carries the cross-system content key → ingestion resolves by it
    const chap = await getOrCreate(
      tx,
      chapter,
      and(eq(chapter.subjectId, subj.id), eq(chapter.slug, "motion")),
      { boardId, subjectId: subj.id, slug: "motion", name: "Motion", ordinal: 4, contentModuleKey: MODULE_KEY },
    );
    // backfill the key if the chapter pre-existed without it
    if ((chap as any).contentModuleKey !== MODULE_KEY) {
      await tx.update(chapter).set({ contentModuleKey: MODULE_KEY }).where(eq(chapter.id, chap.id));
    }

    const top = await getOrCreate(
      tx,
      topic,
      and(eq(topic.chapterId, chap.id), eq(topic.slug, "position-distance-displacement")),
      { boardId, chapterId: chap.id, slug: "position-distance-displacement", name: "Position, Distance, Displacement", ordinal: 1 },
    );

    for (let i = 0; i < SUB_TOPICS.length; i++) {
      const s = SUB_TOPICS[i]!;
      const st = await getOrCreate(
        tx,
        subTopic,
        and(eq(subTopic.topicId, top.id), eq(subTopic.slug, s.slug)),
        { boardId, topicId: top.id, slug: s.slug, name: s.name, ordinal: i + 1, contentSlideKey: s.slideKey },
      );
      if ((st as any).contentSlideKey !== s.slideKey) {
        await tx.update(subTopic).set({ contentSlideKey: s.slideKey }).where(eq(subTopic.id, st.id));
      }
      await seedLO(tx, boardId, st.id, "conceptual", `${s.slideKey}-C1`, `Reason about ${s.name.toLowerCase()}.`);
    }

    // ── pull-and-cache the REAL artifact (transport stubbed = on-disk fixture) ──
    const res = await ingestModule(tx, { artifactDir: ARTIFACT_DIR });
    console.log(`[seed:ch4] cambridge / Physics Grade8 / Motion (content_module_key=${MODULE_KEY})`);
    console.log(`[seed:ch4]   sub_topics: ${SUB_TOPICS.map((s) => `${s.slug}→${s.slideKey}`).join(", ")}`);
    console.log(`[seed:ch4]   ingested ${res.moduleKey} → v${res.versionNo}${res.unchanged ? " (unchanged)" : ""} unit ${res.contentUnitId}`);
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
  console.error("[seed:ch4] FAILED:", err);
  await queryClient.end();
  process.exit(1);
});
