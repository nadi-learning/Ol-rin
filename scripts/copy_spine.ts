/**
 * copy_spine — move a CONTENT SPINE (subject → chapter → topic → sub_topic)
 * from one database to another, matching what is already there.
 *
 * ── Why (S170) ───────────────────────────────────────────────────────────────
 * The parent-dashboard backfill requires every `subTopicRef` in the hand-off to
 * already exist on the target board. On prod, **none of the 85 do**: Maths 10 has
 * 3 topics and 8 sub-topics (all in Quadratic Equations), Physics 10 has 7 and 18
 * (all in Electricity). `spine:topup` cannot close that gap — it creates chapter
 * shells and sub-topics *under existing topics*, and the hand-off file carries no
 * topic names at all (its index is `{subject, chapter, number, name}`). Local has
 * the full carve, so the spine moves database-to-database.
 *
 * The parent dashboard needs ONLY the spine. No slides, no questions, no
 * learning objectives — those stay a content-pipeline job.
 *
 * ── The one rule: MATCH, never duplicate, never overwrite ────────────────────
 * At every level a row is matched on its NORMALISED NAME within its parent, and
 * a match means "use the target's row" — its id, its slug, its name, untouched.
 * Only genuinely absent rows are inserted. Nothing is ever updated or deleted.
 *
 * Names, not slugs, because the two databases never agreed on slugs: prod calls a
 * chapter `quadratic-equations` and the hand-off lineage calls it
 * `ch4-quadratic-equations`. Matching on slug is exactly how you get a second
 * Quadratic Equations sitting beside the real one with the evidence split across
 * both — the S169 duplicate-spine defect, one level down.
 *
 *   bun run spine:export                                   # from local → JSON
 *   bun run spine:import -- --target-prod                  # dry run, prints the plan
 *   bun run spine:import -- --target-prod --execute
 *
 * The JSON is written to the scratch path you pass with --file; read it before
 * importing. Export and import are separate invocations on purpose — they need
 * different DATABASE_URLs, and the file in between is the reviewable artefact.
 */
import { and, eq, inArray } from "drizzle-orm";
import { board, chapter, subTopic, subject, topic } from "@b2c/kernel/schema";
import { db, queryClient } from "../src/db/client";
import { withBoard } from "../src/db/with-board";
import { assertTarget, describeTarget } from "./prod_guard";
import { readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";

const argv = process.argv.slice(2);
const MODE = argv.includes("--export") ? "export" : argv.includes("--import") ? "import" : null;
const EXECUTE = argv.includes("--execute");
const fileArg = argv[argv.indexOf("--file") + 1];
const FILE = (argv.includes("--file") && fileArg ? fileArg : "~/Downloads/spine_export.json").replace(
  /^~/,
  homedir(),
);
const BOARD = "cbse";

/** (name, grade) of every subject to copy. Names, because slugs disagree. */
const SUBJECTS: Array<{ name: string; grade: string }> = [
  { name: "Maths", grade: "10" },
  { name: "Physics", grade: "10" },
];

/** Subject names that mean the same subject across the two databases. */
const NAME_ALIASES: string[][] = [["maths", "mathematics"]];

/** NFC, dash-folded, case- and whitespace-insensitive — the hand-off's own rule. */
function norm(s: string): string {
  return s.normalize("NFC").trim().toLowerCase().replace(/[—–]/g, "-").replace(/\s+/g, " ");
}
/** Fold a subject name onto its alias group's first member. */
function normSubject(s: string): string {
  const n = norm(s);
  const group = NAME_ALIASES.find((g) => g.includes(n));
  return group ? group[0]! : n;
}

type SubTopicOut = { name: string; slug: string; ordinal: number };
type TopicOut = { name: string; slug: string; ordinal: number; subTopics: SubTopicOut[] };
type ChapterOut = { name: string; slug: string; ordinal: number; topics: TopicOut[] };
type SubjectOut = { name: string; grade: string; slug: string; chapters: ChapterOut[] };
type Export = { board: string; exportedFrom: string; subjects: SubjectOut[] };

// ───────────────────────────── export ─────────────────────────────

async function doExport() {
  const [b] = await db.select().from(board).where(eq(board.slug, BOARD));
  if (!b) throw new Error(`no board '${BOARD}'`);

  const rows = await withBoard(b.id, (tx) =>
    tx
      .select({
        subjName: subject.name,
        subjGrade: subject.grade,
        subjSlug: subject.slug,
        chName: chapter.name,
        chSlug: chapter.slug,
        chOrd: chapter.ordinal,
        tName: topic.name,
        tSlug: topic.slug,
        tOrd: topic.ordinal,
        stName: subTopic.name,
        stSlug: subTopic.slug,
        stOrd: subTopic.ordinal,
      })
      .from(subTopic)
      .innerJoin(topic, eq(topic.id, subTopic.topicId))
      .innerJoin(chapter, eq(chapter.id, topic.chapterId))
      .innerJoin(subject, eq(subject.id, chapter.subjectId))
      .where(
        and(
          inArray(subject.name, SUBJECTS.map((s) => s.name)),
          inArray(subject.grade, SUBJECTS.map((s) => s.grade)),
        ),
      )
      .orderBy(subject.name, chapter.ordinal, topic.ordinal, subTopic.ordinal),
  );

  const out: Export = { board: BOARD, exportedFrom: describeTarget().host, subjects: [] };
  for (const r of rows) {
    if (!SUBJECTS.some((s) => s.name === r.subjName && s.grade === r.subjGrade)) continue;
    let subj = out.subjects.find((s) => s.name === r.subjName && s.grade === r.subjGrade);
    if (!subj) {
      subj = { name: r.subjName, grade: r.subjGrade, slug: r.subjSlug, chapters: [] };
      out.subjects.push(subj);
    }
    let ch = subj.chapters.find((c) => norm(c.name) === norm(r.chName));
    if (!ch) {
      ch = { name: r.chName, slug: r.chSlug, ordinal: Number(r.chOrd), topics: [] };
      subj.chapters.push(ch);
    }
    let tp = ch.topics.find((t) => norm(t.name) === norm(r.tName));
    if (!tp) {
      tp = { name: r.tName, slug: r.tSlug, ordinal: Number(r.tOrd), subTopics: [] };
      ch.topics.push(tp);
    }
    if (!tp.subTopics.some((s) => norm(s.name) === norm(r.stName))) {
      tp.subTopics.push({ name: r.stName, slug: r.stSlug, ordinal: Number(r.stOrd) });
    }
  }

  writeFileSync(FILE, JSON.stringify(out, null, 1));
  for (const s of out.subjects) {
    const t = s.chapters.reduce((n, c) => n + c.topics.length, 0);
    const st = s.chapters.reduce((n, c) => n + c.topics.reduce((m, x) => m + x.subTopics.length, 0), 0);
    console.log(`  ${s.name} ${s.grade}: ${s.chapters.length} chapters · ${t} topics · ${st} sub-topics`);
    for (const c of s.chapters) {
      const n = c.topics.reduce((m, x) => m + x.subTopics.length, 0);
      console.log(`     [${String(c.ordinal).padStart(2)}] ${c.name.padEnd(44)} ${c.topics.length} topics, ${n} sub-topics`);
    }
  }
  console.log(`\n  wrote ${FILE}`);
}

// ───────────────────────────── import ─────────────────────────────

/** A slug free under `parent`, starting from `want`. Slugs are unique per parent. */
function freeSlug(want: string, taken: Set<string>): string {
  if (!taken.has(want)) return want;
  for (let i = 2; i < 50; i++) if (!taken.has(`${want}-${i}`)) return `${want}-${i}`;
  throw new Error(`cannot find a free slug for '${want}'`);
}

async function doImport() {
  const data = JSON.parse(readFileSync(FILE, "utf8")) as Export;
  const totals = data.subjects.reduce(
    (a, s) => {
      a.ch += s.chapters.length;
      for (const c of s.chapters) {
        a.tp += c.topics.length;
        for (const t of c.topics) a.st += t.subTopics.length;
      }
      return a;
    },
    { ch: 0, tp: 0, st: 0 },
  );
  await assertTarget({
    argv,
    what: `copy a content spine INTO this database — additive only, existing rows matched by name and left untouched`,
    affects: [
      `from ${data.exportedFrom}: ${data.subjects.map((s) => `${s.name} ${s.grade}`).join(", ")}`,
      `${totals.ch} chapters · ${totals.tp} topics · ${totals.st} sub-topics considered`,
    ],
  });

  const [b] = await db.select().from(board).where(eq(board.slug, data.board));
  if (!b) throw new Error(`no board '${data.board}'`);

  const stat = { chMatched: 0, chNew: 0, tpMatched: 0, tpNew: 0, stMatched: 0, stNew: 0 };
  const missingSubjects: string[] = [];

  await withBoard(b.id, async (tx) => {
    const targetSubjects = await tx
      .select({ id: subject.id, name: subject.name, grade: subject.grade, slug: subject.slug })
      .from(subject);

    for (const s of data.subjects) {
      const match = targetSubjects.find(
        (t) => normSubject(t.name) === normSubject(s.name) && t.grade === s.grade,
      );
      if (!match) {
        // Creating a SUBJECT is a curriculum act, not a copy. Report and skip.
        missingSubjects.push(`${s.name} ${s.grade}`);
        continue;
      }
      console.log(`\n▸ ${s.name} ${s.grade} → target subject "${match.name}" (${match.slug})`);

      const tChapters = await tx
        .select({ id: chapter.id, name: chapter.name, slug: chapter.slug })
        .from(chapter)
        .where(eq(chapter.subjectId, match.id));
      const chSlugs = new Set(tChapters.map((c) => c.slug));

      for (const c of s.chapters) {
        let chId = tChapters.find((t) => norm(t.name) === norm(c.name))?.id;
        if (chId) {
          stat.chMatched++;
          console.log(`   = ${c.name}`);
        } else {
          const slug = freeSlug(c.slug, chSlugs);
          chSlugs.add(slug);
          stat.chNew++;
          console.log(`   + ${c.name}   (new chapter, slug ${slug})`);
          if (EXECUTE) {
            const [row] = await tx
              .insert(chapter)
              .values({ boardId: b.id, subjectId: match.id, slug, name: c.name, ordinal: c.ordinal })
              .returning({ id: chapter.id });
            chId = row!.id;
          }
        }
        if (!chId) {
          // Dry run on a chapter that does not exist yet: there is nothing to
          // resolve its children against, but they are all new by definition.
          // Counting them is the difference between an honest plan and one that
          // silently under-reports whatever sits under a new chapter.
          stat.tpNew += c.topics.length;
          for (const t of c.topics) {
            stat.stNew += t.subTopics.length;
            console.log(`      + topic  ${t.name}`);
          }
          continue;
        }

        const tTopics = await tx
          .select({ id: topic.id, name: topic.name, slug: topic.slug })
          .from(topic)
          .where(eq(topic.chapterId, chId));
        const tpSlugs = new Set(tTopics.map((t) => t.slug));

        for (const t of c.topics) {
          let tpId = tTopics.find((x) => norm(x.name) === norm(t.name))?.id;
          if (tpId) {
            stat.tpMatched++;
          } else {
            const slug = freeSlug(t.slug, tpSlugs);
            tpSlugs.add(slug);
            stat.tpNew++;
            console.log(`      + topic  ${t.name}`);
            if (EXECUTE) {
              const [row] = await tx
                .insert(topic)
                .values({ boardId: b.id, chapterId: chId, slug, name: t.name, ordinal: t.ordinal })
                .returning({ id: topic.id });
              tpId = row!.id;
            }
          }
          if (!tpId) {
            stat.stNew += t.subTopics.length; // dry run: all of them would be new
            continue;
          }

          const tSubs = await tx
            .select({ id: subTopic.id, name: subTopic.name, slug: subTopic.slug })
            .from(subTopic)
            .where(eq(subTopic.topicId, tpId));
          const stSlugs = new Set(tSubs.map((x) => x.slug));

          for (const st of t.subTopics) {
            if (tSubs.some((x) => norm(x.name) === norm(st.name))) {
              stat.stMatched++;
              continue;
            }
            const slug = freeSlug(st.slug, stSlugs);
            stSlugs.add(slug);
            stat.stNew++;
            if (EXECUTE) {
              await tx
                .insert(subTopic)
                .values({ boardId: b.id, topicId: tpId, slug, name: st.name, ordinal: st.ordinal });
            }
          }
        }
      }
    }
  });

  console.log(
    `\n${"─".repeat(64)}\n` +
      `  chapters   ${String(stat.chMatched).padStart(4)} matched   ${String(stat.chNew).padStart(4)} ${EXECUTE ? "created" : "to create"}\n` +
      `  topics     ${String(stat.tpMatched).padStart(4)} matched   ${String(stat.tpNew).padStart(4)} ${EXECUTE ? "created" : "to create"}\n` +
      `  sub-topics ${String(stat.stMatched).padStart(4)} matched   ${String(stat.stNew).padStart(4)} ${EXECUTE ? "created" : "to create"}\n` +
      `${"─".repeat(64)}`,
  );
  if (missingSubjects.length) {
    console.log(
      `\n  ⚠️ SKIPPED — no such subject on the target: ${missingSubjects.join(", ")}\n` +
        `     Creating a subject is a curriculum decision, not a copy. Create it first.`,
    );
  }
  if (!EXECUTE) console.log(`\n  DRY RUN — nothing written. Re-run with --execute.\n`);
}

async function main() {
  if (!MODE) {
    console.error("usage: copy_spine.ts (--export | --import) [--file <path>] [--target-prod] [--execute]");
    process.exit(1);
  }
  if (MODE === "export") await doExport();
  else await doImport();
}

main()
  .then(() => queryClient.end())
  .catch(async (e) => {
    console.error(e instanceof Error ? e.message : e);
    await queryClient.end();
    process.exit(1);
  });
