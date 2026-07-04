/**
 * seed_topic_registry — bulk-seed the curriculum SPINE from Starkhorn-era topic
 * registries, WITHOUT any slides/content (the "author-ahead-of-content" path).
 *
 * Motive (testing): make real authored chapters authorable in the b2c tutor
 * surface end-to-end, decoupled from the Starkhorn slide pipeline. Authoring
 * visibility is a pure-spine gate — getChapterNav (revision.ts) joins only
 * sub_topic⋈topic⋈chapter and never touches content_unit; proposeTarget only
 * needs a chapter with >=1 sub_topic. So a chapter is authorable the moment its
 * spine exists — no manifest, no bundle, no content_version. Revision rendering
 * for these chapters stays empty (SLIDE_NOT_FOUND) until slides are pulled +
 * ingested later (`bun run pull <moduleKey> --board <slug> --ingest`).
 *
 * Source: the topic_registry JSONs copied read-only from the legacy prod box
 * (fixtures/topic-registry/{cbse,cambridge}/*.json). Each registry is a 3-level
 * tree: chapters[] → topics[] → sub_topics[]. Mapping (1:1):
 *   registry chapter  → chapter (ordinal = sequence, content_module_key = id)
 *   registry topic    → topic   (ordinal = sequence)
 *   registry sub_topic→ sub_topic (content_slide_key = NULL — no slide yet)
 *   sub_topic.type/lo → one learning_objective (axis from type)
 *
 * Empty chapters/topics (no sub_topics) are skipped — they'd be invisible in the
 * nav anyway (inner join drops childless nodes). ch5_mixtures is skipped: it's
 * already seeded WITH slides on cbse by seed:ch5 (this would duplicate it).
 *
 * Idempotent (getOrCreate by natural key). Usage: bun scripts/seed_topic_registry.ts
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

type Tx = PgTransaction<any, any, any>;

const REG_DIR = join(import.meta.dir, "..", "fixtures", "topic-registry");

// Explicit per-file placement — the registry subject names are inconsistent
// ("Physics Class 10" / "Physics" / "Physics IGCSE") and grade lives in the
// filename, so a hardcoded map is safer than parsing. Grade conventions match
// the existing dedicated seeds (cbse numeric "9"/"10"; cambridge "GradeN"/"IGCSE").
const FILES: Record<
  string,
  { boardSlug: string; subjectSlug: string; subjectName: string; grade: string }
> = {
  "cbse/Physics_CBSE_9.json": { boardSlug: "cbse", subjectSlug: "physics", subjectName: "Physics", grade: "9" },
  "cbse/Chemistry_CBSE_9.json": { boardSlug: "cbse", subjectSlug: "chemistry", subjectName: "Chemistry", grade: "9" },
  "cbse/cbse_math_10.json": { boardSlug: "cbse", subjectSlug: "mathematics", subjectName: "Mathematics", grade: "10" },
  "cbse/cbse_physics_10.json": { boardSlug: "cbse", subjectSlug: "physics", subjectName: "Physics", grade: "10" },
  "cambridge/Physics_Grade7.json": { boardSlug: "cambridge", subjectSlug: "physics", subjectName: "Physics", grade: "Grade7" },
  "cambridge/Physics_Grade8.json": { boardSlug: "cambridge", subjectSlug: "physics", subjectName: "Physics", grade: "Grade8" },
  "cambridge/Physics_IGCSE.json": { boardSlug: "cambridge", subjectSlug: "physics", subjectName: "Physics", grade: "IGCSE" },
};

// Owned (with slides) by dedicated seeds → skip to avoid a duplicate spine.
const SKIP_MODULE_KEYS = new Set(["ch5_mixtures"]);

type RegSubTopic = { id: string; name: string; type?: string; lo_codes?: string[]; lo_description?: string };
type RegTopic = { id: string; name: string; sequence?: number; sub_topics?: RegSubTopic[] };
type RegChapter = { id: string; name: string; sequence?: number; topics?: RegTopic[] };
type Registry = { subject: string; board: string; chapters: RegChapter[] };

function slugify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
}

function axisFor(type?: string): "conceptual" | "procedural" {
  return type === "procedural" ? "procedural" : "conceptual";
}

async function upsertBoard(slug: string, name: string) {
  const [row] = await db
    .insert(board)
    .values({ slug, name })
    .onConflictDoUpdate({ target: board.slug, set: { name } })
    .returning();
  return row!;
}

async function getOrCreate(tx: Tx, table: any, where: any, values: any) {
  const existing = (await tx.select().from(table).where(where))[0];
  if (existing) return existing;
  return (await tx.insert(table).values(values).returning())[0];
}

async function seedLO(
  tx: Tx,
  boardId: string,
  subTopicId: string,
  axis: string,
  code: string,
  description: string,
) {
  const existing = (
    await tx
      .select()
      .from(learningObjective)
      .where(and(eq(learningObjective.subTopicId, subTopicId), eq(learningObjective.code, code)))
  )[0];
  if (existing) return existing;
  return (
    await tx.insert(learningObjective).values({ boardId, subTopicId, axis, code, description }).returning()
  )[0];
}

async function main() {
  // Boards (tenant roots — not RLS'd). Ensure both exist.
  const boards: Record<string, { id: string }> = {
    cbse: await upsertBoard("cbse", "CBSE"),
    cambridge: await upsertBoard("cambridge", "Cambridge"),
  };

  const totals = { chapters: 0, topics: 0, subTopics: 0, los: 0, skippedEmpty: 0, skippedOwned: 0 };

  for (const [rel, cfg] of Object.entries(FILES)) {
    const reg = JSON.parse(readFileSync(join(REG_DIR, rel), "utf8")) as Registry;
    const boardRow = boards[cfg.boardSlug]!;

    await withBoard(boardRow.id, async (tx: Tx) => {
      const boardId = boardRow.id;

      const subj = await getOrCreate(
        tx,
        subject,
        and(
          eq(subject.boardId, boardId),
          eq(subject.slug, cfg.subjectSlug),
          eq(subject.grade, cfg.grade),
        ),
        { boardId, slug: cfg.subjectSlug, name: cfg.subjectName, grade: cfg.grade },
      );

      let fileCh = 0, fileTop = 0, fileSub = 0;

      for (const rc of reg.chapters ?? []) {
        // authorable only if some topic has >=1 sub_topic
        const hasSub = (rc.topics ?? []).some((t) => (t.sub_topics ?? []).length > 0);
        if (!hasSub) { totals.skippedEmpty++; continue; }
        if (SKIP_MODULE_KEYS.has(rc.id)) { totals.skippedOwned++; continue; }

        const chSlug = slugify(rc.id);
        const chap = await getOrCreate(
          tx,
          chapter,
          and(eq(chapter.subjectId, subj.id), eq(chapter.slug, chSlug)),
          {
            boardId,
            subjectId: subj.id,
            slug: chSlug,
            name: rc.name,
            ordinal: rc.sequence ?? 0,
            contentModuleKey: rc.id,
          },
        );
        if ((chap as any).contentModuleKey !== rc.id) {
          await tx.update(chapter).set({ contentModuleKey: rc.id }).where(eq(chapter.id, chap.id));
        }
        fileCh++; totals.chapters++;

        let topOrd = 0;
        for (const rt of rc.topics ?? []) {
          const subs = rt.sub_topics ?? [];
          if (subs.length === 0) continue; // childless topic → invisible in nav
          topOrd++;
          const top = await getOrCreate(
            tx,
            topic,
            and(eq(topic.chapterId, chap.id), eq(topic.slug, slugify(rt.id))),
            { boardId, chapterId: chap.id, slug: slugify(rt.id), name: rt.name, ordinal: rt.sequence ?? topOrd },
          );
          fileTop++; totals.topics++;

          for (let i = 0; i < subs.length; i++) {
            const rs = subs[i]!;
            const stSlug = slugify(rs.id);
            const st = await getOrCreate(
              tx,
              subTopic,
              and(eq(subTopic.topicId, top.id), eq(subTopic.slug, stSlug)),
              { boardId, topicId: top.id, slug: stSlug, name: rs.name, ordinal: i + 1, contentSlideKey: null },
            );
            fileSub++; totals.subTopics++;

            const code = rs.lo_codes?.[0] ?? `${rs.id}-C1`;
            const desc = rs.lo_description ?? `Reason about: ${rs.name}`;
            await seedLO(tx, boardId, st.id, axisFor(rs.type), code, desc);
            totals.los++;
          }
        }
      }
      console.log(
        `[seed:registry] ${rel} → ${cfg.boardSlug}/${cfg.subjectName} ${cfg.grade}: ` +
          `${fileCh} chapters, ${fileTop} topics, ${fileSub} sub_topics`,
      );
    });
  }

  console.log(
    `[seed:registry] DONE — ${totals.chapters} chapters, ${totals.topics} topics, ` +
      `${totals.subTopics} sub_topics, ${totals.los} LOs ` +
      `(skipped ${totals.skippedEmpty} empty chapters, ${totals.skippedOwned} slide-owned)`,
  );

  await queryClient.end();
}

main().catch(async (err) => {
  console.error("[seed:registry] FAILED:", err);
  await queryClient.end();
  process.exit(1);
});
