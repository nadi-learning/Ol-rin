/**
 * publish_spine_carve — publish an explicit sub-topic CARVE under chapter shells
 * that already exist on the target board. Idempotent, additive, never deletes.
 *
 * ── Why this exists, and why `spine:topup` could not do it (S171, again) ─────
 * `backfill-parent-dashboard.md` §0 makes it a hard prerequisite that every
 * `subTopicRef` in a hand-off already exists on the target board. The ref join
 * key is literally `chapter::topicOrdinal.subOrdinal::subTopicName`, so a
 * hand-off cannot load until the spine underneath it is published.
 *
 * S171 hit exactly this against prod (0 of 85 refs resolved) and found that
 * `topup_spine_cbse.ts` **cannot** fix it: it creates sub-topics under EXISTING
 * topics, and a hand-off's `subTopicIndex` is `{subject, chapter, number, name}`
 * — it carries no topic names at all. That was solved by `copy_spine.ts`, which
 * moves a spine database-to-database. But a DB-to-DB copy only works when some
 * database already holds the carve, and it drags the SOURCE's shape along with
 * it (local files Exploring Mixtures under `science` g9 with 31 leaves; prod
 * wants 19 under `chemistry` g9 — copying would import the wrong lineage).
 *
 * This script takes the third route: a CARVE FILE that states the topics
 * explicitly. Pranav's `spine_carve_avani_k.json` supplies exactly that —
 * chapter → topics[] → subTopics[] with numbers and an `oldId` per leaf — so
 * neither the topic gap nor the source-shape problem applies.
 *
 * ── Slugs are DERIVED from `oldId`, never invented ───────────────────────────
 * Verified against local, which already holds the identical Physics 9 carve:
 * `oldId.replace(/_+/g, "-").slice(0, 60)` reproduces all 9 local sub-topic
 * slugs byte-for-byte, including the two that truncate mid-word
 * (`…distance-vs-displa`, `…average-vs-instantane`). The topic slug is the
 * oldId's prefix before `__`, same transform. Inventing a slug here would
 * produce a row that looks right and never matches the other database.
 *
 * ── Ordinals ARE the join key ────────────────────────────────────────────────
 * `topic.ordinal` and `subTopic.ordinal` come from the carve's own numbers
 * (`"5.7"` → topic 5, sub 7) because the backfill resolves refs on
 * `${chapterName}::${topicOrdinal}.${subOrdinal}::${subTopicName}`. Renumbering
 * anything here silently breaks every join — the hand-off's own README says so.
 *
 *   bun scripts/publish_spine_carve.ts --file <carve.json> [--target-prod] [--execute]
 *
 * Dry-run by default: prints exactly what it would create and exits.
 */
import { and, eq } from "drizzle-orm";
import { board, chapter, subTopic, subject, topic } from "@b2c/kernel/schema";
import { db, queryClient } from "../src/db/client";
import { withBoard } from "../src/db/with-board";
import { assertTarget } from "./prod_guard";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";

const argv = process.argv.slice(2);
const EXECUTE = argv.includes("--execute");
const fileArg = argv[argv.indexOf("--file") + 1];
const FILE = (argv.includes("--file") && fileArg ? fileArg : "").replace(/^~/, homedir());
const BOARD_SLUG = "cbse";

type CarveSubTopic = { number: string; name: string; oldId: string };
type CarveTopic = { number: number; name: string; subTopics: CarveSubTopic[] };
type CarveChapter = {
  subject: string;
  chapter: string;
  subTopicCount: number;
  filled: number;
  topics: CarveTopic[];
};

/** Same normalisation the backfill uses — the hand-off's dashes are not ours. */
function norm(s: string): string {
  return s.normalize("NFC").trim().toLowerCase().replace(/[—–]/g, "-").replace(/\s+/g, " ");
}

/** `oldId` → slug. Verified to reproduce local's carve exactly; see header. */
const slugOf = (oldId: string) => oldId.replace(/_+/g, "-").slice(0, 60);
/** The topic's slug is the leaf oldId's prefix before the `__` separator. */
const topicSlugOf = (leafOldId: string) => slugOf(leafOldId.split("__")[0]!);

/** `"Physics 9"` → `{ slug: "physics", grade: "9" }`. Grade is the last token. */
function parseSubjectRef(ref: string): { slug: string; grade: string } {
  const i = ref.lastIndexOf(" ");
  if (i < 0) throw new Error(`unparseable subject ref: ${ref}`);
  return { slug: ref.slice(0, i).trim().toLowerCase(), grade: ref.slice(i + 1).trim() };
}

async function main() {
  if (!FILE) {
    console.error("REFUSING: --file <carve.json> is required.");
    process.exit(1);
  }
  const carve = JSON.parse(readFileSync(FILE, "utf8")) as Record<string, CarveChapter>;
  const chapters = Object.values(carve);

  await assertTarget({
    argv,
    what: "publish sub-topic carves under existing chapter shells (additive; never updates or deletes)",
    affects: chapters.map((c) => `${c.subject} / ${c.chapter} — ${c.subTopicCount} sub-topics`),
  });

  console.log(`carve: ${FILE}\n`);

  const [b] = await db.select().from(board).where(eq(board.slug, BOARD_SLUG));
  if (!b) throw new Error(`board '${BOARD_SLUG}' not found`);

  let topicsToCreate = 0;
  let subTopicsToCreate = 0;
  let subTopicsPresent = 0;

  for (const ch of chapters) {
    const { slug: subjSlug, grade } = parseSubjectRef(ch.subject);

    // ── resolve the chapter shell; it must already exist (never created here) ──
    const found = await withBoard(b.id, (tx) =>
      tx
        .select({ chapterId: chapter.id, chapterName: chapter.name })
        .from(chapter)
        .innerJoin(subject, eq(subject.id, chapter.subjectId))
        .where(and(eq(subject.slug, subjSlug), eq(subject.grade, grade))),
    );
    const shell = found.find((r) => norm(r.chapterName) === norm(ch.chapter));
    if (!shell) {
      console.error(
        `✗ chapter shell missing: ${subjSlug} g${grade} / "${ch.chapter}"\n` +
          `  This script never creates chapters — the carve says both shells already exist.\n` +
          `  Chapters found under that subject: ${found.map((r) => r.chapterName).join(" | ") || "(none)"}`,
      );
      process.exit(1);
    }

    console.log(`${ch.subject} / ${ch.chapter}  (${ch.subTopicCount} sub-topics)`);

    for (const t of ch.topics) {
      const tSlug = topicSlugOf(t.subTopics[0]!.oldId);

      const [existingTopic] = await withBoard(b.id, (tx) =>
        tx
          .select({ id: topic.id, ordinal: topic.ordinal })
          .from(topic)
          .where(and(eq(topic.chapterId, shell.chapterId), eq(topic.slug, tSlug))),
      );

      let topicId = existingTopic?.id;
      if (!topicId) {
        topicsToCreate++;
        console.log(`  + topic ${t.number}  ${tSlug}  "${t.name}"`);
        if (EXECUTE) {
          const [row] = await withBoard(b.id, (tx) =>
            tx
              .insert(topic)
              .values({
                boardId: b.id,
                chapterId: shell.chapterId,
                slug: tSlug,
                name: t.name,
                ordinal: t.number,
              })
              .returning({ id: topic.id }),
          );
          topicId = row!.id;
        }
      } else if (existingTopic) {
        console.log(`  = topic ${t.number}  ${tSlug}  (exists)`);
        if (existingTopic.ordinal !== t.number) {
          // The ordinal is half the ref join key — a mismatch here means every
          // ref under this topic resolves to nothing, silently.
          console.error(
            `    ✗ ORDINAL MISMATCH: carve says ${t.number}, database says ${existingTopic.ordinal}.` +
              ` Every ref under this topic would fail to join. Resolve by hand.`,
          );
          process.exit(1);
        }
      }

      for (const st of t.subTopics) {
        const sSlug = slugOf(st.oldId);
        const sOrdinal = Number(st.number.split(".")[1]);
        if (!Number.isFinite(sOrdinal)) throw new Error(`unparseable sub-topic number: ${st.number}`);

        const existingSub = topicId
          ? await withBoard(b.id, (tx) =>
              tx
                .select({ id: subTopic.id, ordinal: subTopic.ordinal })
                .from(subTopic)
                .where(and(eq(subTopic.topicId, topicId!), eq(subTopic.slug, sSlug))),
            )
          : [];

        if (existingSub.length) {
          subTopicsPresent++;
          if (existingSub[0]!.ordinal !== sOrdinal) {
            console.error(
              `    ✗ ORDINAL MISMATCH on ${sSlug}: carve ${sOrdinal}, database ${existingSub[0]!.ordinal}.`,
            );
            process.exit(1);
          }
          continue;
        }

        subTopicsToCreate++;
        console.log(`    + ${st.number}  ${sSlug}  "${st.name}"`);
        if (EXECUTE) {
          await withBoard(b.id, (tx) =>
            tx.insert(subTopic).values({
              boardId: b.id,
              topicId: topicId!,
              slug: sSlug,
              name: st.name,
              ordinal: sOrdinal,
            }),
          );
        }
      }
    }
    console.log("");
  }

  const verb = EXECUTE ? "created" : "would create";
  console.log(
    `${verb}: ${topicsToCreate} topic(s), ${subTopicsToCreate} sub-topic(s)` +
      ` · ${subTopicsPresent} already present`,
  );
  if (!EXECUTE) console.log("\nDRY RUN — nothing written. Re-run with --execute to apply.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => queryClient.end());
