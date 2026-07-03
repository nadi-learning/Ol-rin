/**
 * Content ingestion (C1) — the pull-and-cache CORE.
 *
 * Reads a real Starkhorn module artifact (`manifest.json` + `bundle.js`) from a
 * directory and caches it into b2c's own DB as a `content_unit` (slide_module,
 * chapter-grained) + an appended `content_version`. This is the same write the
 * S2 manual seed faked — but now against the REAL Starkhorn manifest shape
 * (`module_id` / `sections[].topics[].id` / `question_pools`), not the
 * simplified `{ slides: {slug: slideId} }` stand-in.
 *
 * WHERE the directory comes from is the TRANSPORT (C2) — rsync drop-dir vs an
 * HTTP pull. C1 stubs it with an on-disk fixture, exactly as D-WS2 stubbed the
 * pull for S2. Only the SOURCE of `artifactDir` changes when transport lands;
 * this write stays put.
 *
 * Key reconciliation (D-C1-1, mapping columns): the manifest is keyed by
 * Starkhorn's stable text ids (`module_id` = chapter_key). We resolve the target
 * chapter by `chapter.content_module_key = manifest.module_id` (RLS-scoped), so
 * the rewrite's human slugs never have to match Starkhorn's tree-ids.
 *
 * Idempotent on content sha: re-ingesting an unchanged artifact appends NO new
 * version; a changed artifact appends the next version + advances the live
 * pointer (= live reflection on re-publish, D-WS3).
 */
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { and, desc, eq, isNull } from "drizzle-orm";
import type { PgTransaction } from "drizzle-orm/pg-core";
import { chapter, contentUnit, contentVersion } from "@b2c/kernel/schema";

export class IngestError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = "IngestError";
  }
}

/** The B2C-shaped manifest Starkhorn emits (manifest_builder.ts). */
type StarkhornManifest = {
  module_id: string;
  sections: Array<{
    id: string;
    title: string;
    topics: Array<{ id: string; title: string; voice_context?: unknown }>;
  }>;
  question_pools?: Record<string, unknown>;
};

export type IngestResult = {
  contentUnitId: string;
  versionId: string;
  versionNo: number;
  moduleKey: string;
  /** true when the artifact sha matched the current version → no new version. */
  unchanged: boolean;
};

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

/**
 * Ingest one module artifact dir into the board-scoped tx. Resolves the chapter
 * by content_module_key; appends a version only when the content changed.
 */
export async function ingestModule(
  tx: PgTransaction<any, any, any>,
  args: { artifactDir: string },
): Promise<IngestResult> {
  const { artifactDir } = args;

  // 1. read the real artifact (transport stubbed = on-disk fixture, C1)
  const manifestRaw = await readFile(join(artifactDir, "manifest.json"), "utf8");
  const bundle = await readFile(join(artifactDir, "bundle.js"), "utf8");
  let manifest: StarkhornManifest;
  try {
    manifest = JSON.parse(manifestRaw);
  } catch (e) {
    throw new IngestError("MANIFEST_PARSE", `bad manifest.json: ${String(e)}`);
  }
  if (!manifest.module_id || !Array.isArray(manifest.sections)) {
    throw new IngestError("MANIFEST_SHAPE", "manifest missing module_id/sections");
  }
  const manifestSha = sha256(manifestRaw);
  const bundleSha = sha256(bundle);

  // 2. resolve the target chapter by the cross-system key (RLS-scoped → a
  // chapter on another board is invisible → CHAPTER_NOT_FOUND)
  const [ch] = await tx
    .select({ id: chapter.id, boardId: chapter.boardId })
    .from(chapter)
    .where(eq(chapter.contentModuleKey, manifest.module_id))
    .limit(1);
  if (!ch) {
    throw new IngestError(
      "CHAPTER_NOT_FOUND",
      `no chapter with content_module_key='${manifest.module_id}' on this board`,
    );
  }

  // 3. find-or-create the chapter-grained slide_module content_unit
  let [unit] = await tx
    .select({ id: contentUnit.id, currentVersionId: contentUnit.currentVersionId })
    .from(contentUnit)
    .where(
      and(
        eq(contentUnit.boardId, ch.boardId),
        eq(contentUnit.type, "slide_module"),
        eq(contentUnit.chapterId, ch.id),
        isNull(contentUnit.subTopicId),
      ),
    )
    .limit(1);
  if (!unit) {
    [unit] = await tx
      .insert(contentUnit)
      .values({
        boardId: ch.boardId,
        type: "slide_module",
        chapterId: ch.id,
        subTopicId: null,
        source: "starkhorn",
      })
      .returning({ id: contentUnit.id, currentVersionId: contentUnit.currentVersionId });
  }
  const unitRow = unit!;

  // 4. idempotency — if the current version's shas match, skip the append
  if (unitRow.currentVersionId) {
    const [cur] = await tx
      .select({ id: contentVersion.id, versionNo: contentVersion.versionNo, body: contentVersion.body })
      .from(contentVersion)
      .where(eq(contentVersion.id, unitRow.currentVersionId))
      .limit(1);
    const body = cur?.body as any;
    if (cur && body?.manifestSha === manifestSha && body?.bundleSha === bundleSha) {
      return {
        contentUnitId: unitRow.id,
        versionId: cur.id,
        versionNo: cur.versionNo,
        moduleKey: manifest.module_id,
        unchanged: true,
      };
    }
  }

  // 5. append the next version + advance the live pointer
  const [latest] = await tx
    .select({ versionNo: contentVersion.versionNo })
    .from(contentVersion)
    .where(eq(contentVersion.contentUnitId, unitRow.id))
    .orderBy(desc(contentVersion.versionNo))
    .limit(1);
  const nextNo = (latest?.versionNo ?? 0) + 1;

  const [ver] = await tx
    .insert(contentVersion)
    .values({
      contentUnitId: unitRow.id,
      versionNo: nextNo,
      // body carries the bytes the read path serves + the shas idempotency keys
      // off. `manifest` is the real Starkhorn shape; `bundle` is the JS source.
      body: { manifest, bundle, manifestSha, bundleSha },
      publishedAt: new Date(),
    })
    .returning({ id: contentVersion.id, versionNo: contentVersion.versionNo });

  await tx.update(contentUnit).set({ currentVersionId: ver!.id }).where(eq(contentUnit.id, unitRow.id));

  return {
    contentUnitId: unitRow.id,
    versionId: ver!.id,
    versionNo: ver!.versionNo,
    moduleKey: manifest.module_id,
    unchanged: false,
  };
}
