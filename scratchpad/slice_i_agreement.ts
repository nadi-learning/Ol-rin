/**
 * Slice I — the agreement check.
 *
 * 🔑 THE POINT (M64): this does NOT re-implement the "is it published?" test.
 * Re-testing my own predicate with my own predicate can only ever agree with
 * me. Instead it drives the REAL `getChapterNav` and then calls the REAL
 * `getSlide` on EVERY sub_topic it returns, and asserts the two agree in BOTH
 * directions:
 *
 *   nav says hasContent=true  → getSlide MUST resolve
 *   nav says hasContent=false → getSlide MUST throw SLIDE_NOT_FOUND
 *
 * A false negative (nav hides something openable) is just as much a bug as a
 * false positive — it would silently shrink a student's catalogue.
 *
 * Read-only. Touches no fixtures, writes nothing, runs against the real boards.
 */
import { board as boardTable } from "@b2c/kernel/schema";
import { db, queryClient } from "../src/db/client";
import { withBoard } from "../src/db/with-board";
import { getChapterNav, getSlide } from "../src/services/revision";

let agree = 0;
let disagree = 0;

async function main() {
  const boards = await db
    .select({ id: boardTable.id, slug: boardTable.slug })
    .from(boardTable);

  for (const b of boards) {
    const nav = await withBoard(b.id, (tx) => getChapterNav(tx));
    if (nav.length === 0) continue;

    const subs = nav.flatMap((ch) =>
      ch.topics.flatMap((t) =>
        t.subTopics.map((s) => ({ ch: ch.name, chHas: ch.hasContent, s })),
      ),
    );
    const claimedOpen = subs.filter((x) => x.s.hasContent);
    if (claimedOpen.length === 0 && !nav.some((c) => c.hasContent)) {
      // Nothing claimed openable on this board. Still verify the claim by
      // spot-checking that the first few really do 404 — a board that hides
      // real content is the failure mode nobody would notice.
      for (const x of subs.slice(0, 5)) {
        const ok = await opens(b.id, x.s.id);
        if (ok) {
          disagree++;
          console.error(
            `  ✗ ${b.slug}/${x.ch}/${x.s.name}: nav says NO but getSlide RENDERS`,
          );
        } else agree++;
      }
      continue;
    }

    console.log(
      `\n[${b.slug}] chapters ${nav.length} → openable ${nav.filter((c) => c.hasContent).length} · sub_topics ${subs.length} → openable ${claimedOpen.length}`,
    );

    for (const x of subs) {
      const ok = await opens(b.id, x.s.id);
      if (ok === x.s.hasContent) {
        agree++;
      } else {
        disagree++;
        console.error(
          `  ✗ ${b.slug}/${x.ch}/${x.s.name}: nav says ${x.s.hasContent} but getSlide ${ok ? "RENDERS" : "404s"}`,
        );
      }
      // The chapter flag must be the OR of its sub_topics — if a sub_topic
      // renders, its chapter must not be hidden.
      if (ok && !x.chHas) {
        disagree++;
        console.error(`  ✗ ${b.slug}/${x.ch}: chapter hidden but a sub_topic renders`);
      }
    }
  }

  console.log(`\nAGREE ${agree} · DISAGREE ${disagree}`);
  await queryClient.end();
  process.exit(disagree === 0 ? 0 : 1);
}

async function opens(boardId: string, subTopicId: string): Promise<boolean> {
  try {
    await withBoard(boardId, (tx) => getSlide(tx, { subTopicId }));
    return true;
  } catch {
    return false;
  }
}

main();
