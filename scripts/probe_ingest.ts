/**
 * probe_ingest (C1) — the real pull-and-cache + the real-shape read, end to end
 * against the REAL Starkhorn ch4_motion artifact (fixtures/starkhorn/ch4_motion).
 *
 * Proves:
 *   1. ingestModule reads the real manifest+bundle → content_unit + version v1.
 *   2. the cached version carries the REAL manifest (module_id, sections) + the
 *      real bundle source (has the component key "t1-1").
 *   3. getSlide resolves via sub_topic.content_slide_key (D-C1-1), validated
 *      against the real manifest's sections[].topics[].id → the real slideId.
 *   4. idempotency: re-ingest the unchanged artifact → NO new version (unchanged).
 *   5. live reflection: ingest a byte-changed artifact → v2; getSlide flips to v2.
 *   6. RLS: getSlide for A's sub_topic under board B → SLIDE_NOT_FOUND.
 *   7. ingest under a board with no matching content_module_key → CHAPTER_NOT_FOUND.
 *
 * Throwaway boards A/B + a temp artifact dir; full cleanup. No server needed
 * (service-layer). Does NOT touch the canonical seed (M22).
 */
import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { and, eq, inArray } from "drizzle-orm";
import {
  board,
  chapter,
  contentUnit,
  contentVersion,
  learningObjective,
  subTopic,
  subject,
  topic,
} from "@b2c/kernel/schema";
import { db, queryClient } from "../src/db/client";
import { withBoard } from "../src/db/with-board";
import { ingestModule, IngestError } from "../src/services/ingest";
import { getSlide, SlideNotFoundError } from "../src/services/revision";

const FIXTURE = join(import.meta.dir, "..", "fixtures", "starkhorn", "ch4_motion");

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

/** Seed a real-shaped spine on `boardId` and return the two sub_topic ids. */
async function seedSpine(tx: any, boardId: string) {
  const [subj] = await tx.insert(subject).values({ boardId, slug: "physics", name: "Physics", grade: "Grade8" }).returning();
  const [chap] = await tx
    .insert(chapter)
    .values({ boardId, subjectId: subj.id, slug: "motion", name: "Motion", ordinal: 4, contentModuleKey: "ch4_motion" })
    .returning();
  const [top] = await tx
    .insert(topic)
    .values({ boardId, chapterId: chap.id, slug: "pdd", name: "Position, Distance, Displacement", ordinal: 1 })
    .returning();
  const [s1] = await tx
    .insert(subTopic)
    .values({ boardId, topicId: top.id, slug: "position", name: "Position", ordinal: 1, contentSlideKey: "t1-1" })
    .returning();
  const [s2] = await tx
    .insert(subTopic)
    .values({ boardId, topicId: top.id, slug: "gap", name: "The gap", ordinal: 2, contentSlideKey: "t1-1_invariant" })
    .returning();
  return { chapId: chap.id, s1: s1.id, s2: s2.id };
}

async function main() {
  const tag = `${Date.now()}`;
  const [bA] = await db.insert(board).values({ slug: `ing-a-${tag}`, name: "Ing A" }).returning();
  const [bB] = await db.insert(board).values({ slug: `ing-b-${tag}`, name: "Ing B" }).returning();
  if (!bA || !bB) throw new Error("board seed failed");

  let A: { chapId: string; s1: string; s2: string };
  await withBoard(bA.id, async (tx) => (A = await seedSpine(tx, bA.id)));
  // board B has a DIFFERENT chapter key (no ch4_motion) → ingest must reject
  await withBoard(bB.id, async (tx) => {
    const [subj] = await tx.insert(subject).values({ boardId: bB.id, slug: "physics", name: "Physics", grade: "Grade8" }).returning();
    await tx.insert(chapter).values({ boardId: bB.id, subjectId: subj!.id, slug: "other", name: "Other", ordinal: 1, contentModuleKey: "ch_other" });
  });

  // 1+2. ingest the real fixture under A
  const r1 = await withBoard(bA.id, (tx) => ingestModule(tx, { artifactDir: FIXTURE }));
  check(`ingest → v1 (got v${r1.versionNo})`, r1.versionNo === 1 && r1.unchanged === false);
  check("ingest → module_id ch4_motion", r1.moduleKey === "ch4_motion");
  const v1 = await withBoard(bA.id, async (tx) => {
    const [ver] = await tx.select({ body: contentVersion.body }).from(contentVersion).where(eq(contentVersion.id, r1.versionId)).limit(1);
    return ver!.body as any;
  });
  check("cached manifest is the REAL shape (module_id + sections)", v1?.manifest?.module_id === "ch4_motion" && Array.isArray(v1?.manifest?.sections));
  check("cached bundle has the real component key 't1-1'", typeof v1?.bundle === "string" && v1.bundle.includes("t1-1") && v1.bundle.includes("export"));
  check("cached shas present", typeof v1?.manifestSha === "string" && typeof v1?.bundleSha === "string");

  // 3. getSlide resolves via content_slide_key, validated against the manifest
  const g1 = await withBoard(bA.id, (tx) => getSlide(tx, { subTopicId: A.s1 }));
  check(`getSlide(position) → slideId 't1-1' (got '${g1.slideId}')`, g1.slideId === "t1-1" && g1.versionNo === 1);
  const g2 = await withBoard(bA.id, (tx) => getSlide(tx, { subTopicId: A.s2 }));
  check(`getSlide(gap) → slideId 't1-1_invariant' (got '${g2.slideId}')`, g2.slideId === "t1-1_invariant");
  check("getSlide bundleUrl points at v1", g1.bundleUrl === `/content/bundle/${r1.versionId}`);

  // 4. idempotency — re-ingest unchanged → no new version
  const r1b = await withBoard(bA.id, (tx) => ingestModule(tx, { artifactDir: FIXTURE }));
  check("re-ingest unchanged → unchanged=true, same version", r1b.unchanged === true && r1b.versionId === r1.versionId && r1b.versionNo === 1);

  // 5. live reflection — ingest a byte-changed artifact → v2
  const tmp = await mkdtemp(join(tmpdir(), "ing-"));
  await mkdir(tmp, { recursive: true });
  const manifestRaw = await readFile(join(FIXTURE, "manifest.json"), "utf8");
  const bundleRaw = await readFile(join(FIXTURE, "bundle.js"), "utf8");
  await writeFile(join(tmp, "manifest.json"), manifestRaw); // manifest unchanged
  await writeFile(join(tmp, "bundle.js"), bundleRaw + "\n//bump\n"); // bundle sha changes
  const r2 = await withBoard(bA.id, (tx) => ingestModule(tx, { artifactDir: tmp }));
  check(`live reflection: changed artifact → v2 (got v${r2.versionNo})`, r2.versionNo === 2 && r2.unchanged === false && r2.versionId !== r1.versionId);
  const g1v2 = await withBoard(bA.id, (tx) => getSlide(tx, { subTopicId: A.s1 }));
  check("getSlide now points at v2", g1v2.versionNo === 2 && g1v2.bundleUrl === `/content/bundle/${r2.versionId}`);
  await rm(tmp, { recursive: true, force: true });

  // 6. RLS — A's sub_topic under board B → not found
  let crossBlocked = false;
  try {
    await withBoard(bB.id, (tx) => getSlide(tx, { subTopicId: A.s1 }));
  } catch (e) {
    crossBlocked = e instanceof SlideNotFoundError;
  }
  check("RLS: getSlide across boards → SLIDE_NOT_FOUND", crossBlocked);

  // 7. ingest under B (no ch4_motion chapter) → CHAPTER_NOT_FOUND
  let rejected = "";
  try {
    await withBoard(bB.id, (tx) => ingestModule(tx, { artifactDir: FIXTURE }));
  } catch (e) {
    rejected = e instanceof IngestError ? e.code : "OTHER";
  }
  check(`ingest with no matching chapter → CHAPTER_NOT_FOUND (got ${rejected})`, rejected === "CHAPTER_NOT_FOUND");

  // cleanup (children → parents; content_version before content_unit)
  for (const b of [bA, bB]) {
    await withBoard(b.id, async (tx) => {
      const units = await tx.select({ id: contentUnit.id }).from(contentUnit).where(eq(contentUnit.boardId, b.id));
      for (const u of units) await tx.delete(contentVersion).where(eq(contentVersion.contentUnitId, u.id));
      await tx.delete(contentUnit).where(eq(contentUnit.boardId, b.id));
      await tx.delete(learningObjective).where(eq(learningObjective.boardId, b.id));
      await tx.delete(subTopic).where(eq(subTopic.boardId, b.id));
      await tx.delete(topic).where(eq(topic.boardId, b.id));
      await tx.delete(chapter).where(eq(chapter.boardId, b.id));
      await tx.delete(subject).where(eq(subject.boardId, b.id));
    });
  }
  await db.delete(board).where(inArray(board.id, [bA.id, bB.id]));

  console.log(`\nprobe_ingest: ${passed} passed, ${failed} failed`);
  await queryClient.end();
  process.exit(failed === 0 ? 0 : 1);
}

main().catch(async (err) => {
  console.error("probe_ingest FAILED:", err);
  await queryClient.end();
  process.exit(1);
});
