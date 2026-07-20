/**
 * Slice I — does the first-run CTA actually OPEN now? (S115's blocker.)
 *
 * Reproduces the dashboard's own target selection EXACTLY as DashboardPage
 * computes it post-Slice-I — lessons = nav.filter(hasContent); firstChapter =
 * lessons[0]; firstStart = first renderable sub_topic across sections — and
 * then calls the real getSlide on that id. Also reports what the PRE-Slice-I
 * rule would have picked, so the fix is shown to change the outcome rather
 * than asserted to.
 *
 * Plus site 7: what listBoards' pickability would be under the new predicate.
 */
import { board as boardTable } from "@b2c/kernel/schema";
import { db, queryClient } from "../src/db/client";
import { withBoard } from "../src/db/with-board";
import { getChapterNav, getSlide } from "../src/services/revision";

async function opens(boardId: string, subTopicId: string) {
  try {
    await withBoard(boardId, (tx) => getSlide(tx, { subTopicId }));
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const boards = await db
    .select({ id: boardTable.id, slug: boardTable.slug })
    .from(boardTable);

  const pickableNew: string[] = [];

  for (const b of boards) {
    const nav = await withBoard(b.id, (tx) => getChapterNav(tx));
    if (nav.length === 0) continue;
    if (nav.some((c) => c.hasContent)) pickableNew.push(b.slug);
    else continue;

    // POST-Slice-I: exactly DashboardPage's rule.
    const lessons = nav.filter((c) => c.hasContent);
    const firstChapter = lessons[0]!;
    const firstStart =
      firstChapter.topics.flatMap((t) => t.subTopics).find((s) => s.hasContent)?.id ?? null;

    // PRE-Slice-I: first chapter with a published module (which, before this
    // slice, is what hasContent meant), then topics[0].subTopics[0].
    const oldChapter = nav[0]!;
    const oldStart = oldChapter.topics[0]?.subTopics[0]?.id ?? null;

    const newOk = firstStart ? await opens(b.id, firstStart) : false;
    const oldOk = oldStart ? await opens(b.id, oldStart) : false;

    console.log(
      `[${b.slug}] CTA → "${firstChapter.name}" opens=${newOk}   (ordinal-first "${oldChapter.name}" opens=${oldOk})`,
    );
  }

  console.log(`\nSite 7 — boards pickable under sub_topic truth: ${pickableNew.join(", ")}`);
  await queryClient.end();
}

main();
