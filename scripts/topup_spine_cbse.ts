/**
 * topup_spine_cbse — make the local cbse spine able to RECEIVE the parent-dashboard
 * backfill file. LOCAL ONLY, idempotent, additive (it never deletes).
 *
 * Context: `scripts/backfill-parent-dashboard.md` §0 makes it a hard prerequisite
 * that every `subTopicRef` in the hand-off already exists on the target board.
 * 80 of the 85 refs in Pranav's `dashboard.json` already resolve against local
 * cbse exactly — same topic names, same numbers, same sub-topic names. This
 * script closes the remaining gap in two places:
 *
 *   1. SUB-TOPICS the hand-off carries evidence for that our spine is missing.
 *      Our Intro-Trig carve has 5 leaves where theirs has 7; Some-Applications
 *      has 3 where theirs has 6 — and in both chapters every topic name, number
 *      and sub-topic name we DO share is byte-identical. That is one carve
 *      lineage with our copy truncated, not two different pedagogical choices
 *      (Some Applications holds exactly `1.1`, `2.1`, `3.1` — the first leaf of
 *      each topic and nothing after it). So this is a REPAIR.
 *
 *   2. CHAPTER SHELLS for chapters the students' pace plans schedule but our
 *      spine has never carved (Real Numbers, Quadratic Equations, …). A chapter
 *      with no sub_topics is invisible to the progress map and to the growth
 *      chart's budget — `computeChildDashboard` reaches chapters by INNER JOIN
 *      through sub_topic — so a shell costs the parent nothing and keeps the
 *      pace plan whole instead of silently shrinking 14 chapters to 6.
 *
 * FOUNDER RULING (2026-07-26): the spine is the UNION of the two carves, and
 * where both sides carve the same chapter the LARGER carve wins. That is why
 * Light stays at our 38 sub-topics rather than being pruned to their 18 — the
 * extra 20 render honestly as "not started".
 *
 * 🔑 Names are read from the hand-off file itself, never retyped here. The file's
 * own cover note warns that sub-topic names carry unicode (`x̄`, `xᵢ`, em dashes)
 * and that its chapter names use a plain hyphen where ours uses an em dash —
 * "compare the raw strings rather than retyping them". A typo in a name here
 * would produce a sub_topic that looks right and never matches.
 *
 *   bun scripts/topup_spine_cbse.ts --file ~/Downloads/dashboard.json [--execute]
 *
 * Dry-run by default: prints exactly what it would create and exits.
 */
import { and, eq } from "drizzle-orm";
import {
  board,
  chapter,
  subTopic,
  subject,
  topic,
} from "@b2c/kernel/schema";
import { db, queryClient } from "../src/db/client";
import { withBoard } from "../src/db/with-board";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";

// ───────────────────────────── args + guard ─────────────────────────────

const argv = process.argv.slice(2);
const EXECUTE = argv.includes("--execute");
const fileArg = argv[argv.indexOf("--file") + 1];
const FILE = (argv.includes("--file") && fileArg ? fileArg : "~/Downloads/dashboard.json")
  .replace(/^~/, homedir());

/**
 * The hand-off contract was WRITTEN for prod, and this script is the half of it
 * that mutates the content spine. A spine write on the wrong database is not
 * something a dry-run flag protects you from, so the connection string is
 * checked rather than trusted.
 */
function assertLocal() {
  const url = process.env.DATABASE_URL ?? "";
  const local = /@(localhost|127\.0\.0\.1)[:/]/.test(url);
  if (!local) {
    console.error(
      `REFUSING: DATABASE_URL does not point at localhost.\n` +
        `  This script writes to the content spine. Run it against local only.\n` +
        `  (got host: ${url.replace(/\/\/[^@]*@/, "//***@") || "<unset>"})`,
    );
    process.exit(1);
  }
}

// ───────────────────────────── the file ─────────────────────────────

type IndexEntry = { subject: string; chapter: string; number: string; name: string };
type HandOff = {
  subTopicIndex: Record<string, IndexEntry>;
  students: Array<{
    name: string;
    pace: Array<{ subjectRef: string; chapters: Array<{ chapterRef: string }> }>;
  }>;
};

/**
 * Subject refs in the hand-off are the OLD system's names ("Maths 10"); ours are
 * (slug, grade) pairs. Mapped explicitly and exhaustively — an unmapped ref
 * throws rather than silently skipping a whole subject's worth of rows.
 */
const SUBJECT_MAP: Record<string, { slug: string; grade: string }> = {
  "Maths 10": { slug: "mathematics", grade: "10" },
  "Physics 10": { slug: "physics", grade: "10" },
};

/**
 * Ordinals for the chapter shells, from the NCERT Class-10 sequence — the same
 * one our existing rows already follow (Polynomials 2, Pair of Linear Eqns 3,
 * Coordinate Geometry 7, Intro Trig 8, Some Applications 9, Statistics 13 are
 * all already in the DB at those numbers, so the gaps below are load-bearing,
 * not invented). A pace chapter that is missing AND not listed here aborts the
 * run: guessing an ordinal would silently mis-order a parent's plan.
 */
const CHAPTER_ORDINAL: Record<string, number> = {
  // Mathematics 10
  "Real Numbers": 1,
  "Quadratic Equations": 4,
  "Arithmetic Progressions": 5,
  Triangles: 6,
  Circles: 10,
  "Areas Related to Circles": 11,
  "Surface Areas and Volumes": 12,
  Probability: 14,
  // Physics 10 (NCERT Science ch12)
  "Magnetic Effects of Electric Current": 12,
};

// ───────────────────────────── helpers ─────────────────────────────

/**
 * Compare names the way the hand-off asks: NFC-normalised, dash-folded, case- and
 * whitespace-insensitive. Their file writes "Light - Reflection and Refraction"
 * with a plain hyphen where our DB holds an em dash, and that single character is
 * the difference between 18 mastery rows landing and 18 being dropped.
 */
function norm(s: string): string {
  return s
    .normalize("NFC")
    .trim()
    .toLowerCase()
    .replace(/[—–]/g, "-")
    .replace(/\s+/g, " ");
}

/** Same rule the admin ingest uses (admin_ingest.ts) — unique within a topic. */
function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

type SpineRow = {
  subjectSlug: string;
  grade: string;
  chapterId: string;
  chapterName: string;
  topicId: string;
  topicOrdinal: number;
  subOrdinal: number;
  subName: string;
};

async function readSpine(boardId: string): Promise<SpineRow[]> {
  return withBoard(boardId, (tx) =>
    tx
      .select({
        subjectSlug: subject.slug,
        grade: subject.grade,
        chapterId: chapter.id,
        chapterName: chapter.name,
        topicId: topic.id,
        topicOrdinal: topic.ordinal,
        subOrdinal: subTopic.ordinal,
        subName: subTopic.name,
      })
      .from(subTopic)
      .innerJoin(topic, eq(topic.id, subTopic.topicId))
      .innerJoin(chapter, eq(chapter.id, topic.chapterId))
      .innerJoin(subject, eq(subject.id, chapter.subjectId)),
  );
}

// ───────────────────────────── main ─────────────────────────────

async function main() {
  assertLocal();
  const raw = JSON.parse(readFileSync(FILE, "utf8")) as HandOff;
  console.log(`hand-off: ${FILE}`);
  console.log(
    `  ${Object.keys(raw.subTopicIndex).length} indexed sub-topics · ${raw.students.length} students\n`,
  );

  const [cbse] = await db.select().from(board).where(eq(board.slug, "cbse"));
  if (!cbse) throw new Error("board 'cbse' not found");

  const spine = await readSpine(cbse.id);
  const byKey = new Map<string, SpineRow>();
  for (const r of spine) {
    byKey.set(`${norm(r.chapterName)}::${r.topicOrdinal}.${r.subOrdinal}::${norm(r.subName)}`, r);
  }

  // ── 1. missing sub-topics ────────────────────────────────────────────
  const missingSubs: Array<{ entry: IndexEntry; ref: string }> = [];
  for (const [ref, e] of Object.entries(raw.subTopicIndex)) {
    const key = `${norm(e.chapter)}::${e.number}::${norm(e.name)}`;
    if (!byKey.has(key)) missingSubs.push({ entry: e, ref });
  }

  // Each one needs an EXISTING topic to hang from: the chapter's topic at the
  // ordinal encoded in the ref's "N.M". A missing topic is a bigger hole than
  // this script is licensed to fill, so it aborts instead.
  const topicByChapterOrdinal = new Map<string, { topicId: string; chapterId: string }>();
  for (const r of spine) {
    topicByChapterOrdinal.set(`${norm(r.chapterName)}::${r.topicOrdinal}`, {
      topicId: r.topicId,
      chapterId: r.chapterId,
    });
  }

  const subPlan: Array<{ topicId: string; slug: string; name: string; ordinal: number; ref: string }> = [];
  const unplaceable: string[] = [];
  for (const m of missingSubs) {
    const [tOrd, sOrd] = m.entry.number.split(".");
    const anchor = topicByChapterOrdinal.get(`${norm(m.entry.chapter)}::${tOrd}`);
    if (!anchor) {
      unplaceable.push(`${m.ref}  (no topic ${tOrd} under chapter "${m.entry.chapter}")`);
      continue;
    }
    subPlan.push({
      topicId: anchor.topicId,
      slug: slugify(m.entry.name),
      name: m.entry.name,
      ordinal: Number(sOrd),
      ref: m.ref,
    });
  }

  console.log(`── sub-topics: ${missingSubs.length} of ${Object.keys(raw.subTopicIndex).length} refs do not resolve`);
  for (const p of subPlan) console.log(`   + ${p.ref}`);
  if (unplaceable.length) {
    console.log(`\n   ⚠️ UNPLACEABLE (aborting):`);
    for (const u of unplaceable) console.log(`   ! ${u}`);
  }

  // ── 2. chapter shells for the pace plans ─────────────────────────────
  const chapters = await withBoard(cbse.id, (tx) =>
    tx
      .select({
        subjectId: subject.id,
        subjectSlug: subject.slug,
        grade: subject.grade,
        name: chapter.name,
      })
      .from(chapter)
      .innerJoin(subject, eq(subject.id, chapter.subjectId)),
  );
  const haveChapter = new Set(chapters.map((c) => `${c.subjectSlug}|${c.grade}|${norm(c.name)}`));
  const subjectIdOf = new Map(chapters.map((c) => [`${c.subjectSlug}|${c.grade}`, c.subjectId]));

  const chapPlan = new Map<string, { subjectId: string; slug: string; name: string; ordinal: number }>();
  const unknownOrdinal: string[] = [];
  for (const s of raw.students) {
    for (const p of s.pace) {
      const m = SUBJECT_MAP[p.subjectRef];
      if (!m) throw new Error(`unmapped subjectRef "${p.subjectRef}" — extend SUBJECT_MAP`);
      const subjectId = subjectIdOf.get(`${m.slug}|${m.grade}`);
      if (!subjectId) throw new Error(`subject ${m.slug} grade ${m.grade} not on cbse`);
      for (const c of p.chapters) {
        if (haveChapter.has(`${m.slug}|${m.grade}|${norm(c.chapterRef)}`)) continue;
        const ordinal = CHAPTER_ORDINAL[c.chapterRef];
        if (ordinal == null) {
          unknownOrdinal.push(`${p.subjectRef} / ${c.chapterRef}`);
          continue;
        }
        chapPlan.set(`${m.slug}|${m.grade}|${norm(c.chapterRef)}`, {
          subjectId,
          slug: `ch${ordinal}-${slugify(c.chapterRef)}`,
          name: c.chapterRef,
          ordinal,
        });
      }
    }
  }

  console.log(`\n── chapter shells: ${chapPlan.size} to create (no sub_topics — invisible to map + budget)`);
  for (const c of chapPlan.values()) console.log(`   + [${c.ordinal}] ${c.name}  (${c.slug})`);
  if (unknownOrdinal.length) {
    console.log(`\n   ⚠️ NO ORDINAL KNOWN (aborting):`);
    for (const u of [...new Set(unknownOrdinal)]) console.log(`   ! ${u}`);
  }

  if (unplaceable.length || unknownOrdinal.length) {
    console.error(`\nABORTED — resolve the ⚠️ items above first. Nothing was written.`);
    process.exit(1);
  }

  if (!EXECUTE) {
    console.log(`\nDRY RUN — nothing written. Re-run with --execute.`);
    return;
  }

  // ── write ────────────────────────────────────────────────────────────
  let subsMade = 0;
  let chapsMade = 0;
  await withBoard(cbse.id, async (tx) => {
    for (const c of chapPlan.values()) {
      const existing = await tx
        .select()
        .from(chapter)
        .where(and(eq(chapter.subjectId, c.subjectId), eq(chapter.slug, c.slug)));
      if (existing.length) continue;
      await tx.insert(chapter).values({
        boardId: cbse.id,
        subjectId: c.subjectId,
        slug: c.slug,
        name: c.name,
        ordinal: c.ordinal,
      });
      chapsMade++;
    }
    for (const p of subPlan) {
      const existing = await tx
        .select()
        .from(subTopic)
        .where(and(eq(subTopic.topicId, p.topicId), eq(subTopic.slug, p.slug)));
      if (existing.length) continue;
      await tx.insert(subTopic).values({
        boardId: cbse.id,
        topicId: p.topicId,
        slug: p.slug,
        name: p.name,
        ordinal: p.ordinal,
      });
      subsMade++;
    }
  });

  // Re-read and re-check, rather than trusting the insert count — the whole
  // point of this script is that every ref resolves afterwards.
  const after = await readSpine(cbse.id);
  const afterKeys = new Set(
    after.map((r) => `${norm(r.chapterName)}::${r.topicOrdinal}.${r.subOrdinal}::${norm(r.subName)}`),
  );
  const stillMissing = Object.entries(raw.subTopicIndex).filter(
    ([, e]) => !afterKeys.has(`${norm(e.chapter)}::${e.number}::${norm(e.name)}`),
  );

  console.log(`\nWROTE ${subsMade} sub_topics, ${chapsMade} chapter shells.`);
  console.log(
    stillMissing.length === 0
      ? `VERIFIED: all ${Object.keys(raw.subTopicIndex).length} hand-off refs now resolve on cbse.`
      : `⚠️ ${stillMissing.length} refs STILL do not resolve: ${stillMissing.map(([r]) => r).join(", ")}`,
  );
  if (stillMissing.length) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => queryClient.end());
