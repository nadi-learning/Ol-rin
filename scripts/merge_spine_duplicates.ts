/**
 * merge_spine_duplicates — collapse subjects/chapters that are the SAME thing
 * under two different slugs (S169, founder ruling: merge by name, prod's row
 * wins).
 *
 * ── how the duplicates happen ───────────────────────────────────────────────
 * Prod's spine was carved by Starkhorn authoring: `maths` / `electricity`.
 * The hand-off seeder writes its own slugs for the same curriculum:
 * `mathematics` / `ch11-electricity`. Neither is wrong; they simply never agreed
 * on a slug, and slug is what the loaders match on. So seeding prod produces a
 * SECOND Maths beside the real one — five months of history filed away from the
 * live attempts, and a parent looking at two Maths subjects on one page.
 *
 * ── which row survives ──────────────────────────────────────────────────────
 * The one that already has student evidence pointing at it — in practice prod's.
 * Repointing evidence is the risky direction: `attempt`, `observation` and
 * `mastery_state` all reach content by id, and a missed row is silently orphaned
 * work. Moving the CONTENT is safe by comparison, so the survivor keeps its id
 * and the loser's children are re-parented onto it.
 *
 * Matching is by NAME, normalised — case, whitespace, and the dash family
 * (`Light — Reflection` vs `Light – Reflection` differ by one codepoint and are
 * obviously the same chapter to a human).
 *
 *   bun run merge:spine                    # dry run — prints every merge
 *   bun run merge:spine -- --execute
 *
 * ⚠️ LOCAL ONLY. Reshaping a live spine is a migration, not a script run.
 */
import { and, eq, inArray, ne, sql } from "drizzle-orm";
import { board, chapter, masterySnapshot, subTopic, subject, topic } from "@b2c/kernel/schema";
import { db, queryClient } from "../src/db/client";
import { withBoard } from "../src/db/with-board";
import { assertTarget } from "./prod_guard";

const argv = process.argv.slice(2);
const EXECUTE = argv.includes("--execute");
const MERGE_TOPICS = argv.includes("--topics");
const boardArg = argv[argv.indexOf("--board") + 1];
const BOARD = argv.includes("--board") && boardArg ? boardArg : "cbse";

// Targeting prod is opt-in and must be typed out — see `prod_guard.ts`.

/**
 * Subject names that mean the SAME subject. Normalising punctuation is not
 * enough here: prod calls it "Maths" and the hand-off calls it "Mathematics" —
 * different words for one subject, which no string distance should be trusted to
 * decide. An explicit list is the honest mechanism, and it stays short.
 */
const SUBJECT_ALIASES: string[][] = [["maths", "mathematics"]];

/**
 * Every table pointing at a subject / chapter, EXCLUDING the child rows the
 * merge re-parents itself (chapter → subject, topic → chapter).
 *
 * Derived from pg_constraint, not from reading the schema file — two separate
 * hand-written attempts in this session each missed a column and failed on the
 * foreign key. Re-derive the same way if this ever fails again:
 *
 *   SELECT c.conrelid::regclass, a.attname FROM pg_constraint c
 *   JOIN unnest(c.conkey) k(attnum) ON true
 *   JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.attnum
 *   WHERE c.contype='f' AND c.confrelid='chapter'::regclass;
 */
const SUBJECT_REFS = [
  "assignment",
  "horizontal_skill",
  "horizontal_skill_state",
  "pace_plan",
  "student_subject_insight",
] as const;
const CHAPTER_REFS = [
  "assignment",
  "authoring_chat",
  "chapter_budget",
  "content_unit",
  "horizontal_skill",
  "student_chapter_insight",
] as const;

/** Canonical key for a subject name, after alias folding. */
function subjectKey(name: string): string {
  const n = norm(name);
  for (const group of SUBJECT_ALIASES) if (group.includes(n)) return group[0]!;
  return n;
}

/** Same chapter to a human ⇒ same key. Dashes are the usual culprit. */
function norm(name: string): string {
  return name
    .toLowerCase()
    .replace(/[‐-―−]/g, "-") // ‐ ‑ ‒ – — ― and the minus sign
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** How much student evidence hangs off a subject — the survivor is the one with more. */
async function evidenceWeight(tx: any, subjectId: string): Promise<number> {
  const [row] = await tx.execute(sql`
    select (
      select count(*) from mastery_state m
      join sub_topic st on st.id = m.sub_topic_id
      join topic t on t.id = st.topic_id
      join chapter c on c.id = t.chapter_id
      where c.subject_id = ${subjectId}
    ) + (
      select count(*) from practice_session ps
      join sub_topic st on st.id = ps.sub_topic_id
      join topic t on t.id = st.topic_id
      join chapter c on c.id = t.chapter_id
      where c.subject_id = ${subjectId}
    ) as n`);
  return Number((row as any)?.n ?? 0);
}

async function main() {
  await assertTarget({
    argv,
    what: `merge duplicate subjects/chapters on board '${BOARD}' (survivor keeps its id; jsonb snapshot ids repaired)`,
    affects: [`every subject, chapter${MERGE_TOPICS ? " and topic" : ""} on board '${BOARD}'`],
  });
  console.log(`merge_spine_duplicates ${EXECUTE ? "(EXECUTE)" : "(dry run)"} — board ${BOARD}\n`);

  const [b] = await db.select().from(board).where(eq(board.slug, BOARD));
  if (!b) throw new Error(`no board '${BOARD}'`);

  let merges = 0;

  await withBoard(b.id, async (tx) => {
    // ── subjects: group by (normalised name, grade) ──────────────────────────
    const subjects = await tx
      .select({ id: subject.id, slug: subject.slug, name: subject.name, grade: subject.grade })
      .from(subject);

    const bySubjectKey = new Map<string, typeof subjects>();
    for (const s of subjects) {
      const k = `${subjectKey(s.name)}|${s.grade}`;
      bySubjectKey.set(k, [...(bySubjectKey.get(k) ?? []), s]);
    }

    for (const [key, group] of bySubjectKey) {
      if (group.length < 2) continue;
      // 🔑 Evidence does NOT move in this merge. Attempts and mastery reach
      // content through sub_topic → topic → chapter, so re-parenting a chapter
      // carries its evidence with it untouched. The survivor choice is therefore
      // about which NAME and id the curriculum keeps, not about data safety.
      //
      // Survivor = the SHORTER slug, which is reliably the authored/prod one
      // (`maths` over `mathematics`, `electricity` over `ch11-electricity`) —
      // that is the founder's "prod wins the row". Evidence counts are printed
      // for audit, and break a tie.
      const weighted = await Promise.all(
        group.map(async (s) => ({ ...s, weight: await evidenceWeight(tx, s.id) })),
      );
      weighted.sort((a, z) => a.slug.length - z.slug.length || z.weight - a.weight);
      const keep = weighted[0]!;
      const losers = weighted.slice(1);
      console.log(
        `SUBJECT "${key}" — keep ${keep.slug} (${keep.weight} evidence rows), ` +
          `merge ${losers.map((l) => `${l.slug}(${l.weight})`).join(", ")}`,
      );
      merges++;
      if (EXECUTE) {
        await tx
          .update(chapter)
          .set({ subjectId: keep.id })
          .where(inArray(chapter.subjectId, losers.map((l) => l.id)));
        // Everything else that points at a subject gets repointed before the
        // drop. ⚠️ This list is NOT hand-written: it came from pg_constraint (see
        // SUBJECT_REFS). Guessing it by reading the schema missed
        // `horizontal_skill.chapter_id` and the delete failed on the FK — twice
        // in one session, which is why both lists are now derived.
        for (const t of SUBJECT_REFS) {
          await tx.execute(
            sql.raw(
              `UPDATE ${t} SET subject_id = '${keep.id}' WHERE subject_id = ANY('{${losers
                .map((l) => l.id)
                .join(",")}}'::uuid[])`,
            ),
          );
        }
        await tx.delete(subject).where(inArray(subject.id, losers.map((l) => l.id)));
      }
    }

    // ── chapters: within ONE subject, group by normalised name ───────────────
    // Run after the subject merge so the previously-split chapters are now
    // siblings and therefore comparable at all.
    //
    // ⚠️ The DRY RUN therefore UNDER-REPORTS: with no subject merge applied, two
    // chapters still sitting under `maths` and `mathematics` are not yet
    // siblings and will not be paired here. The execute run sees the updated
    // parent ids inside the same transaction and catches them.
    if (!EXECUTE) {
      console.log(
        "  (dry run: chapters under subjects that would MERGE are not paired yet — expect more on --execute)",
      );
    }
    const chapters = await tx
      .select({ id: chapter.id, slug: chapter.slug, name: chapter.name, subjectId: chapter.subjectId })
      .from(chapter);

    const byChapterKey = new Map<string, typeof chapters>();
    for (const c of chapters) {
      const k = `${c.subjectId}|${norm(c.name)}`;
      byChapterKey.set(k, [...(byChapterKey.get(k) ?? []), c]);
    }

    for (const [, group] of byChapterKey) {
      if (group.length < 2) continue;
      const weighted = await Promise.all(
        group.map(async (c) => {
          const [row] = await tx.execute(sql`
            select (
              select count(*) from practice_session ps
              join sub_topic st on st.id = ps.sub_topic_id
              join topic t on t.id = st.topic_id
              where t.chapter_id = ${c.id}
            ) as n`);
          return { ...c, weight: Number((row as any)?.n ?? 0) };
        }),
      );
      weighted.sort((a, z) => a.slug.length - z.slug.length || z.weight - a.weight);
      const keep = weighted[0]!;
      const losers = weighted.slice(1);
      console.log(
        `  CHAPTER "${keep.name}" — keep ${keep.slug} (${keep.weight} sessions), ` +
          `merge ${losers.map((l) => `${l.slug}(${l.weight})`).join(", ")}`,
      );
      merges++;
      if (EXECUTE) {
        await tx
          .update(topic)
          .set({ chapterId: keep.id })
          .where(inArray(topic.chapterId, losers.map((l) => l.id)));
        for (const t of CHAPTER_REFS) {
          await tx.execute(
            sql.raw(
              `UPDATE ${t} SET chapter_id = '${keep.id}' WHERE chapter_id = ANY('{${losers
                .map((l) => l.id)
                .join(",")}}'::uuid[])`,
            ),
          );
        }
        await tx.delete(chapter).where(inArray(chapter.id, losers.map((l) => l.id)));
      }
    }

    // ── topics: OFF by default (--topics to enable) ──────────────────────────
    // Two topics with the same name under one chapter are usually NOT the same
    // topic. The first dry run wanted to merge two demo-spine topics that merely
    // shared a title, which would have rewritten the demo child's page for no
    // reason. Chapters holding several same-named topics is harmless — the map
    // groups by chapter — so this level is opt-in and stays off.
    if (!MERGE_TOPICS) {
      console.log("\n(topic-level merge skipped — pass --topics to enable)");
    }
    const topics = MERGE_TOPICS ? await tx
      .select({ id: topic.id, slug: topic.slug, name: topic.name, chapterId: topic.chapterId })
      .from(topic) : [];
    const byTopicKey = new Map<string, typeof topics>();
    for (const t of topics) {
      const k = `${t.chapterId}|${norm(t.name)}`;
      byTopicKey.set(k, [...(byTopicKey.get(k) ?? []), t]);
    }
    for (const [, group] of byTopicKey) {
      if (group.length < 2) continue;
      const keep = [...group].sort((a, z) => a.slug.length - z.slug.length)[0]!;
      const losers = group.filter((t) => t.id !== keep.id);
      console.log(`    TOPIC "${keep.name}" — keep ${keep.slug}, merge ${losers.map((l) => l.slug).join(", ")}`);
      merges++;
      if (EXECUTE) {
        await tx
          .update(subTopic)
          .set({ topicId: keep.id })
          .where(inArray(subTopic.topicId, losers.map((l) => l.id)));
        await tx.delete(topic).where(inArray(topic.id, losers.map((l) => l.id)));
      }
    }

    // ── repair FROZEN snapshots (S169) ───────────────────────────────────────
    // `mastery_snapshot.metrics` is jsonb holding `perSubject[].subjectId`. It is
    // NOT a foreign key, so dropping a merged-away subject leaves those ids
    // dangling and NOTHING complains — the growth chart's per-subject filter then
    // reads 0 for every historical month while the live month looks fine. Caught
    // only because the numbers were eyeballed after the merge.
    //
    // Runs on every invocation, including when no merge fired: it is a no-op when
    // every id still resolves, and it is the repair path for a merge that already
    // happened.
    const liveSubjects = await tx
      .select({ id: subject.id, name: subject.name, grade: subject.grade })
      .from(subject);
    const byKey = new Map(liveSubjects.map((s) => [`${subjectKey(s.name)}|${s.grade}`, s]));
    const liveIds = new Set(liveSubjects.map((s) => s.id));

    const snaps = await tx
      .select({ id: masterySnapshot.id, metrics: masterySnapshot.metrics })
      .from(masterySnapshot);
    let repaired = 0;
    for (const snap of snaps) {
      const per = (snap.metrics as any)?.perSubject;
      if (!Array.isArray(per)) continue;
      let touched = false;
      const next = per.map((p: any) => {
        if (!p?.subjectId || liveIds.has(p.subjectId)) return p;
        // Resolve by the SAME alias-folded key the merge used, so "Mathematics"
        // in a frozen April row finds the surviving "Maths".
        const grade = liveSubjects.find((s) => s.id === p.subjectId)?.grade;
        const hit =
          byKey.get(`${subjectKey(p.subjectName ?? "")}|${grade ?? "10"}`) ??
          liveSubjects.find((s) => subjectKey(s.name) === subjectKey(p.subjectName ?? ""));
        if (!hit) return p;
        touched = true;
        return { ...p, subjectId: hit.id, subjectName: hit.name };
      });
      if (!touched) continue;
      repaired++;
      console.log(`    snapshot ${snap.id.slice(0, 8)} — repointed a dangling subject id in metrics`);
      if (EXECUTE) {
        await tx
          .update(masterySnapshot)
          .set({ metrics: { ...(snap.metrics as any), perSubject: next } })
          .where(eq(masterySnapshot.id, snap.id));
      }
    }
    if (repaired) {
      console.log(`  ${repaired} frozen snapshot(s) ${EXECUTE ? "repaired" : "would be repaired"}`);
      merges += repaired;
    }

    // ⚠️ sub_topics are deliberately NOT merged. Two sub-topics with the same
    // name under one topic are the level where "same thing" stops being obvious
    // — they carry their own mastery rows, and collapsing two would silently
    // discard one child's certified level. Report them and stop.
    const dupeSubTopics = await tx
      .select({ topicId: subTopic.topicId, name: subTopic.name, n: sql<number>`count(*)::int` })
      .from(subTopic)
      .groupBy(subTopic.topicId, subTopic.name)
      .having(sql`count(*) > 1`);
    for (const d of dupeSubTopics) {
      console.log(
        `    ⚠️  SUB-TOPIC "${d.name}" appears ${d.n}× under one topic — NOT merged ` +
          `(each may carry its own certified mastery; merge by hand or re-carve)`,
      );
    }
  });

  console.log(`\n${merges} merge(s) ${EXECUTE ? "applied" : "would be applied"}`);
  if (!EXECUTE && merges) console.log("DRY RUN — nothing written. Re-run with --execute.");
  await queryClient.end();
}

main().catch(async (err) => {
  console.error("merge_spine_duplicates FAILED:", err);
  await queryClient.end();
  process.exit(1);
});
