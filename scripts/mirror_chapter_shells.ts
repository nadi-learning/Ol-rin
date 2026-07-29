/**
 * mirror_chapter_shells — create empty CHAPTER SHELLS on the local cbse board so
 * a rehearsal mirrors prod's chapter set. LOCAL ONLY, idempotent, additive.
 *
 * ── Why (S174) ───────────────────────────────────────────────────────────────
 * S171's hardest lesson was that "four defects in a row lived exactly where local
 * had nothing" — the rehearsal pulled prod's *evidence* down but never prod's
 * *shape*, so every defect that depended on prod's emptiness survived it.
 * **Rehearse the target's absences, not just its rows.**
 *
 * For Avani Kulkarni's backfill, local and prod disagree about where two grade-9
 * chapters live and which exist at all:
 *   · prod files "Exploring Mixtures and their Separation" under `chemistry` g9;
 *     local files it under `science` g9 (with a different, larger carve).
 *   · prod's `physics` g9 carries four chapters; local carries one.
 * Publishing a carve or deriving a budget against local's shape would therefore
 * prove nothing about prod. This script makes local's chapter set match prod's
 * so the rehearsal is worth running.
 *
 * Shells only — no topics, no sub-topics. A chapter with no sub_topics is
 * invisible to the progress map (`computeChildDashboard` reaches chapters by
 * INNER JOIN through sub_topic), so a shell costs a parent nothing until either
 * a carve or a `chapter_budget` gives it a size.
 *
 * ⚠️ Chapter SLUGS are not asserted to match prod — prod says
 * `describing-motion-around-us` where local says `ch4-motion` for the same
 * chapter. That is fine and deliberate: every join that matters here resolves on
 * normalised NAME (see `publish_spine_carve.ts` and `backfill_dashboard.ts`),
 * never on slug. Matching on slug is precisely how S171 got a duplicate chapter.
 *
 *   bun scripts/mirror_chapter_shells.ts [--execute]
 *
 * Dry-run by default.
 */
import { and, eq } from "drizzle-orm";
import { board, chapter, subject } from "@b2c/kernel/schema";
import { db, queryClient } from "../src/db/client";
import { withBoard } from "../src/db/with-board";
import { assertTarget } from "./prod_guard";

const argv = process.argv.slice(2);
const EXECUTE = argv.includes("--execute");
const BOARD_SLUG = "cbse";

/** Prod's grade-9 chapter set, read live from prod on 2026-07-29 (S174). */
const SHELLS: Array<{ subjectSlug: string; grade: string; slug: string; name: string; ordinal: number }> = [
  {
    subjectSlug: "chemistry",
    grade: "9",
    slug: "exploring-mixtures-and-their-separation",
    name: "Exploring Mixtures and their Separation",
    ordinal: 1,
  },
  { subjectSlug: "physics", grade: "9", slug: "how-forces-affect-motion", name: "How Forces Affect Motion", ordinal: 1 },
  {
    subjectSlug: "physics",
    grade: "9",
    slug: "work-energy-and-simple-machines",
    name: "Work, Energy, and Simple Machines",
    ordinal: 2,
  },
  {
    subjectSlug: "physics",
    grade: "9",
    slug: "sound-waves-characteristics-and-applications",
    name: "Sound Waves: Characteristics and Applications",
    ordinal: 3,
  },
];

function norm(s: string): string {
  return s.normalize("NFC").trim().toLowerCase().replace(/[—–]/g, "-").replace(/\s+/g, " ");
}

async function main() {
  // No `--target-prod` branch on purpose: prod already HAS these chapters, and a
  // shell-creator pointed at production is a way to mint duplicates, not to fix
  // anything. assertTarget refuses any non-localhost url without the flag.
  await assertTarget({
    argv,
    what: "create empty chapter shells on the LOCAL cbse board so a rehearsal mirrors prod",
    affects: SHELLS.map((s) => `${s.subjectSlug} g${s.grade} / ${s.name}`),
  });

  const [b] = await db.select().from(board).where(eq(board.slug, BOARD_SLUG));
  if (!b) throw new Error(`board '${BOARD_SLUG}' not found`);

  let created = 0;
  let present = 0;

  for (const sh of SHELLS) {
    const [subj] = await withBoard(b.id, (tx) =>
      tx
        .select({ id: subject.id })
        .from(subject)
        .where(and(eq(subject.slug, sh.subjectSlug), eq(subject.grade, sh.grade))),
    );
    if (!subj) {
      console.error(`✗ subject ${sh.subjectSlug} g${sh.grade} not found — cannot place "${sh.name}"`);
      process.exit(1);
    }

    // Match on NAME, not slug — local and prod use different slugs for the same
    // chapter, and creating a second row here is the failure this guards against.
    const existing = await withBoard(b.id, (tx) =>
      tx.select({ id: chapter.id, name: chapter.name }).from(chapter).where(eq(chapter.subjectId, subj.id)),
    );
    if (existing.some((c) => norm(c.name) === norm(sh.name))) {
      present++;
      console.log(`= ${sh.subjectSlug} g${sh.grade} / ${sh.name}`);
      continue;
    }

    created++;
    console.log(`+ ${sh.subjectSlug} g${sh.grade} / ${sh.name}  (ord ${sh.ordinal}, slug ${sh.slug})`);
    if (EXECUTE) {
      await withBoard(b.id, (tx) =>
        tx.insert(chapter).values({
          boardId: b.id,
          subjectId: subj.id,
          slug: sh.slug,
          name: sh.name,
          ordinal: sh.ordinal,
        }),
      );
    }
  }

  console.log(`\n${EXECUTE ? "created" : "would create"}: ${created} shell(s) · ${present} already present`);
  if (!EXECUTE) console.log("DRY RUN — nothing written. Re-run with --execute to apply.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => queryClient.end());
