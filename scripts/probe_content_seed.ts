/**
 * probe_content_seed — S2 exit gate.
 *
 * Asserts the seeded slide MODULE is resolvable the way S3 will resolve it
 * (not merely "rows exist") — so S3 inherits a proven read path. Read-only
 * against the persistent seed (run `bun run seed:s2` first; the seed is the
 * S3/S4 fixture, M22 — we never mutate or clean it).
 *
 *   1. DB connectivity as the app role.
 *   2. The chapter-grained slide_module content_unit exists (source starkhorn,
 *      sub_topic_id null, chapter_id set) with a non-null current_version_id.
 *   3. current_version_id resolves to content_version v1 (app-enforced pointer).
 *   4. body is RENDERABLE: contractVersion + a non-empty bundle string +
 *      manifest.slides.
 *   5. The manifest covers every seeded sub_topic (slug → non-empty slideId).
 *   6. End-to-end S3 resolution: sub_topic 'acceleration' → its chapter → the
 *      module → current version → manifest[slug] → slideId === expected.
 *   7. RLS: the Cambridge module + chapter are invisible under a `cbse` claim
 *      (content_version is reached only via the RLS'd content_unit, so it's
 *      protected transitively — there's no board-less path to its id).
 */
import { and, eq, isNull } from "drizzle-orm";
import { sql } from "drizzle-orm";
import type { PgTransaction } from "drizzle-orm/pg-core";
import {
  board,
  chapter,
  contentUnit,
  contentVersion,
  subTopic,
  topic,
} from "@b2c/kernel/schema";
import { db, queryClient } from "../src/db/client";
import { withBoard } from "../src/db/with-board";

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

/**
 * The S3 read, prefigured. Given a sub_topic, resolve the current published
 * slide for it: sub_topic → topic → chapter → slide_module → current version
 * → manifest[sub_topic.slug] → slideId. Returns null at the first broken link.
 */
async function resolveSlide(tx: Tx, subTopicId: string) {
  const st = (await tx.select().from(subTopic).where(eq(subTopic.id, subTopicId)))[0];
  if (!st) return null;
  const tp = (await tx.select().from(topic).where(eq(topic.id, st.topicId)))[0];
  if (!tp) return null;
  const unit = (
    await tx
      .select()
      .from(contentUnit)
      .where(
        and(
          eq(contentUnit.type, "slide_module"),
          eq(contentUnit.chapterId, tp.chapterId),
        ),
      )
  )[0];
  if (!unit?.currentVersionId) return null;
  const ver = (
    await tx
      .select()
      .from(contentVersion)
      .where(eq(contentVersion.id, unit.currentVersionId))
  )[0];
  if (!ver) return null;
  const slides = (ver.body as any)?.manifest?.slides ?? {};
  const slideId = slides[st.slug];
  if (!slideId) return null;
  return { versionNo: ver.versionNo, slideId, bundle: (ver.body as any)?.bundle };
}

async function main() {
  // 1. connectivity
  await db.execute(sql`select 1`);
  check("DB connectivity (select 1) as app role", true);

  const cambridge = (await db.select().from(board).where(eq(board.slug, "cambridge")))[0];
  const cbse = (await db.select().from(board).where(eq(board.slug, "cbse")))[0];
  if (!cambridge || !cbse) {
    console.error("  ✗ boards cambridge/cbse missing — run `bun run seed:s2` first");
    await queryClient.end();
    process.exit(1);
  }

  await withBoard(cambridge.id, async (tx: Tx) => {
    // locate the seeded chapter + its module
    const chap = (
      await tx
        .select()
        .from(chapter)
        .where(and(eq(chapter.boardId, cambridge.id), eq(chapter.slug, "forces-and-motion")))
    )[0];
    check("seeded chapter 'forces-and-motion' present", !!chap);
    if (!chap) return;

    const unit = (
      await tx
        .select()
        .from(contentUnit)
        .where(
          and(
            eq(contentUnit.boardId, cambridge.id),
            eq(contentUnit.type, "slide_module"),
            eq(contentUnit.chapterId, chap.id),
            isNull(contentUnit.subTopicId),
          ),
        )
    )[0];

    // 2. the chapter-grained module exists with a live pointer
    check("slide_module content_unit exists (chapter-grained, sub_topic_id null)", !!unit);
    check("content_unit.source = 'starkhorn'", unit?.source === "starkhorn");
    check("content_unit.current_version_id is set", !!unit?.currentVersionId);
    if (!unit?.currentVersionId) return;

    // 3. pointer resolves to v1
    const ver = (
      await tx.select().from(contentVersion).where(eq(contentVersion.id, unit.currentVersionId))
    )[0];
    check("current_version_id resolves to a content_version", !!ver);
    check("resolved version is v1", ver?.versionNo === 1);
    check("content_version belongs to this unit", ver?.contentUnitId === unit.id);
    if (!ver) return;

    // 4. body is renderable
    const body = ver.body as any;
    check("body.contractVersion present", body?.contractVersion === "1");
    check("body.bundle is a non-empty string", typeof body?.bundle === "string" && body.bundle.length > 0);
    check("body.bundle default-exports a components map", typeof body?.bundle === "string" && body.bundle.includes("components"));
    check("body.manifest.slides present", !!body?.manifest?.slides);

    // 5. manifest covers every seeded sub_topic (slug → non-empty slideId)
    const subs = await tx
      .select()
      .from(subTopic)
      .innerJoin(topic, eq(subTopic.topicId, topic.id))
      .where(eq(topic.chapterId, chap.id));
    const slides = body?.manifest?.slides ?? {};
    const allMapped =
      subs.length > 0 &&
      subs.every((r) => typeof slides[r.sub_topic.slug] === "string" && slides[r.sub_topic.slug].length > 0);
    check(`manifest maps all ${subs.length} seeded sub_topics → slideId`, allMapped);

    // 6. end-to-end S3 resolution for 'acceleration'
    const accel = subs.find((r) => r.sub_topic.slug === "acceleration")?.sub_topic;
    const resolved = accel ? await resolveSlide(tx, accel.id) : null;
    check("S3 resolve(acceleration) → slideId 'slide-acceleration'", resolved?.slideId === "slide-acceleration");
    check("S3 resolve → version 1 + a bundle", resolved?.versionNo === 1 && typeof resolved?.bundle === "string");
  });

  // 7. RLS: Cambridge module + chapter invisible under a cbse claim
  const camChap = (
    await withBoard(cambridge.id, (tx) =>
      tx.select().from(chapter).where(eq(chapter.slug, "forces-and-motion")),
    )
  )[0];
  if (camChap) {
    const unitUnderCbse = await withBoard(cbse.id, (tx) =>
      tx.select().from(contentUnit).where(eq(contentUnit.chapterId, camChap.id)),
    );
    check("RLS: Cambridge slide_module invisible under cbse claim", unitUnderCbse.length === 0);
    const chapUnderCbse = await withBoard(cbse.id, (tx) =>
      tx.select().from(chapter).where(eq(chapter.id, camChap.id)),
    );
    check("RLS: Cambridge chapter invisible under cbse claim", chapUnderCbse.length === 0);
  }

  console.log(`\nprobe_content_seed: ${passed} passed, ${failed} failed`);
  await queryClient.end();
  process.exit(failed === 0 ? 0 : 1);
}

main().catch(async (err) => {
  console.error("probe_content_seed FAILED:", err);
  await queryClient.end();
  process.exit(1);
});
