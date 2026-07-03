/**
 * probe_pull (C2) — the repeatable direct-source pull, end to end.
 *
 * Runs the REAL `pull` CLI against prod Starkhorn for ch5_mixtures (our draft
 * canonical module — exercises the DB-assembly path, the coupling-heavy leg),
 * then proves:
 *   1. the pulled manifest has the expected shape (module_id, 5 sections,
 *      31 slides, 31 question pools — the S8-verified counts).
 *   2. FAITHFULNESS: the pulled manifest structurally reproduces the canonical
 *      hand-copied fixture (same section ids+order, same slide ids+order, same
 *      question-pool keys) — i.e. the assembler mirrors S8's manual result.
 *      Byte-identity is reported informationally (formatting is brittle).
 *   3. the pulled bytes SERVE end to end: ingest the temp pull into a throwaway
 *      board → getSlide resolves v1 + the real slideId + a bundleUrl.
 *   4. RLS: that sub_topic is invisible under another board → SLIDE_NOT_FOUND.
 *
 * Crosses prod, so it SKIPS gracefully (exit 0) if the box is unreachable.
 * Throwaway boards + temp dir + full cleanup (M22). Date.now() is fine here
 * (probe script, not a Workflow script).
 */
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq, inArray } from "drizzle-orm";
import {
  board,
  chapter,
  contentUnit,
  contentVersion,
  subTopic,
  subject,
  topic,
} from "@b2c/kernel/schema";
import { db, queryClient } from "../src/db/client";
import { withBoard } from "../src/db/with-board";
import { ingestModule } from "../src/services/ingest";
import { getSlide, SlideNotFoundError } from "../src/services/revision";

const MODULE_KEY = "ch5_mixtures";
const CANONICAL = join(import.meta.dir, "..", "fixtures", "starkhorn", MODULE_KEY);
const PULL_SCRIPT = join(import.meta.dir, "pull_module.ts");

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

function slugify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
}

type Manifest = {
  module_id: string;
  sections: { id: string; title: string; topics: { id: string; title: string }[] }[];
  question_pools?: Record<string, unknown>;
};

function slideIds(m: Manifest): string[] {
  return m.sections.flatMap((s) => s.topics.map((t) => t.id));
}

async function main() {
  // ── 1. run the real pull CLI into a temp dir ──────────────────────────────
  const outDir = await mkdtemp(join(tmpdir(), "pull-probe-"));
  console.log(`probe_pull: pulling ${MODULE_KEY} → ${outDir}`);
  const r = spawnSync("bun", [PULL_SCRIPT, MODULE_KEY, "--out", outDir], {
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
  });
  if (r.status !== 0) {
    const err = `${r.stderr ?? ""}${r.stdout ?? ""}`;
    // The pull CLI tags genuine connectivity/auth failures with SSH_UNREACHABLE
    // (see ssh() in pull_module.ts). A remote command's non-zero exit is a REAL
    // bug → FAIL, not SKIP.
    const unreachable = err.includes("SSH_UNREACHABLE");
    if (unreachable) {
      console.log("  ⊘ SKIP — prod box unreachable (no creds / offline); pull not exercised");
      console.log(err.split("\n").slice(0, 4).join("\n"));
      await rm(outDir, { recursive: true, force: true });
      await queryClient.end();
      process.exit(0);
    }
    console.error("  ✗ pull CLI failed (not a connectivity issue):\n", err.slice(0, 1500));
    await rm(outDir, { recursive: true, force: true });
    await queryClient.end();
    process.exit(1);
  }

  const pulled = JSON.parse(await readFile(join(outDir, "manifest.json"), "utf8")) as Manifest;
  const bundle = await readFile(join(outDir, "bundle.js"), "utf8");

  // ── 2. shape (S8-verified counts) ─────────────────────────────────────────
  check(`module_id = ${MODULE_KEY}`, pulled.module_id === MODULE_KEY);
  check(`5 sections (got ${pulled.sections.length})`, pulled.sections.length === 5);
  const nSlides = slideIds(pulled).length;
  check(`31 slides (got ${nSlides})`, nSlides === 31);
  const nPools = Object.keys(pulled.question_pools ?? {}).length;
  check(`31 question pools (got ${nPools})`, nPools === 31);
  check(`bundle non-trivial + has export (${(bundle.length / 1024).toFixed(0)} KB)`, bundle.length > 1000 && bundle.includes("export"));

  // ── 3. faithfulness vs the canonical hand-copied fixture ──────────────────
  const canonical = JSON.parse(await readFile(join(CANONICAL, "manifest.json"), "utf8")) as Manifest;
  const secEq =
    JSON.stringify(pulled.sections.map((s) => s.id)) ===
    JSON.stringify(canonical.sections.map((s) => s.id));
  check("section ids + order match the canonical fixture", secEq);
  const slidesEq = JSON.stringify(slideIds(pulled)) === JSON.stringify(slideIds(canonical));
  check("slide ids + order match the canonical fixture", slidesEq);
  const poolsEq =
    JSON.stringify(Object.keys(pulled.question_pools ?? {}).sort()) ===
    JSON.stringify(Object.keys(canonical.question_pools ?? {}).sort());
  check("question-pool keys match the canonical fixture", poolsEq);
  // byte-identity is informational only (formatting/key-order is brittle).
  const canonicalRaw = await readFile(join(CANONICAL, "manifest.json"), "utf8");
  const pulledRaw = await readFile(join(outDir, "manifest.json"), "utf8");
  console.log(
    `  · byte-identical to canonical manifest: ${pulledRaw === canonicalRaw ? "yes" : "no (structural match is what counts)"}`,
  );

  // ── 4. the pulled bytes SERVE: ingest under a throwaway board → getSlide ──
  const tag = `${Date.now()}`;
  const [bP] = await db.insert(board).values({ slug: `pull-p-${tag}`, name: "Pull P" }).returning();
  const [bQ] = await db.insert(board).values({ slug: `pull-q-${tag}`, name: "Pull Q" }).returning();
  let firstSubId = "";
  await withBoard(bP!.id, async (tx) => {
    const boardId = bP!.id;
    const [subj] = await tx.insert(subject).values({ boardId, slug: "science", name: "Science", grade: "9" }).returning();
    const [chap] = await tx
      .insert(chapter)
      .values({ boardId, subjectId: subj!.id, slug: "mixtures", name: "Mixtures", ordinal: 5, contentModuleKey: MODULE_KEY })
      .returning();
    for (let si = 0; si < pulled.sections.length; si++) {
      const sec = pulled.sections[si]!;
      const [top] = await tx
        .insert(topic)
        .values({ boardId, chapterId: chap!.id, slug: slugify(sec.id), name: sec.title, ordinal: si + 1 })
        .returning();
      for (let i = 0; i < sec.topics.length; i++) {
        const sl = sec.topics[i]!;
        const [st] = await tx
          .insert(subTopic)
          .values({ boardId, topicId: top!.id, slug: slugify(sl.id), name: sl.title, ordinal: i + 1, contentSlideKey: sl.id })
          .returning();
        if (!firstSubId) firstSubId = st!.id;
      }
    }
    const res = await ingestModule(tx, { artifactDir: outDir });
    check(`ingest pulled bytes → v${res.versionNo}`, res.versionNo === 1 && !res.unchanged);
    const slide = await getSlide(tx, { subTopicId: firstSubId });
    check(
      `getSlide(first sub_topic) → v1 + slideId ${slide.slideId} + bundleUrl`,
      slide.versionNo === 1 && slide.slideId === pulled.sections[0]!.topics[0]!.id && /bundle/.test(slide.bundleUrl),
    );
  });

  // ── 5. RLS: invisible under another board ─────────────────────────────────
  let crossBlocked = false;
  await withBoard(bQ!.id, async (tx) => {
    try {
      await getSlide(tx, { subTopicId: firstSubId });
    } catch (e) {
      crossBlocked = e instanceof SlideNotFoundError;
    }
  });
  check("RLS: pulled sub_topic invisible under another board → SLIDE_NOT_FOUND", crossBlocked);

  // ── cleanup (children → parents; M22) ─────────────────────────────────────
  for (const b of [bP!, bQ!]) {
    await withBoard(b.id, async (tx) => {
      const units = await tx.select({ id: contentUnit.id }).from(contentUnit).where(eq(contentUnit.boardId, b.id));
      for (const u of units) await tx.delete(contentVersion).where(eq(contentVersion.contentUnitId, u.id));
      await tx.delete(contentUnit).where(eq(contentUnit.boardId, b.id));
      await tx.delete(subTopic).where(eq(subTopic.boardId, b.id));
      await tx.delete(topic).where(eq(topic.boardId, b.id));
      await tx.delete(chapter).where(eq(chapter.boardId, b.id));
      await tx.delete(subject).where(eq(subject.boardId, b.id));
    });
  }
  await db.delete(board).where(inArray(board.id, [bP!.id, bQ!.id]));
  await rm(outDir, { recursive: true, force: true });

  console.log(`\nprobe_pull: ${passed} passed, ${failed} failed`);
  await queryClient.end();
  process.exit(failed === 0 ? 0 : 1);
}

main().catch(async (err) => {
  console.error("probe_pull FAILED:", err);
  try {
    await queryClient.end();
  } catch {}
  process.exit(1);
});
