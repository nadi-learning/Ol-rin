/**
 * Slice I — the HONEST negative control.
 *
 * Reproduces the PRE-Slice-I dashboard rule exactly, using the old chapter-level
 * definition of hasContent (a published slide_module row exists for the chapter)
 * rather than the new derived one:
 *
 *   firstChapter = nav.find(c => oldHasContent(c) && c.topics[0]?.subTopics[0])
 *   firstStart   = firstChapter.topics[0].subTopics[0].id
 *
 * ...then calls the real getSlide on it. If this 404s and the new rule renders,
 * the slice demonstrably fixed the thing S115 reported, on this database.
 */
import { and, eq, isNotNull, isNull } from "drizzle-orm";
import { board as boardTable, contentUnit } from "@b2c/kernel/schema";
import { db, queryClient } from "../src/db/client";
import { withBoard } from "../src/db/with-board";
import { getChapterNav, getSlide } from "../src/services/revision";

async function main() {
  const boards = await db
    .select({ id: boardTable.id, slug: boardTable.slug })
    .from(boardTable);

  for (const b of boards) {
    const nav = await withBoard(b.id, (tx) => getChapterNav(tx));
    if (nav.length === 0) continue;

    // The OLD signal, queried the OLD way.
    const mods = await withBoard(b.id, (tx) =>
      tx
        .select({ chapterId: contentUnit.chapterId })
        .from(contentUnit)
        .where(
          and(
            eq(contentUnit.type, "slide_module"),
            isNull(contentUnit.subTopicId),
            isNotNull(contentUnit.currentVersionId),
          ),
        ),
    );
    const oldHas = new Set(mods.map((m) => m.chapterId).filter(Boolean) as string[]);
    if (oldHas.size === 0) continue;

    const oldChapter = nav.find(
      (c) => oldHas.has(c.id) && c.topics[0]?.subTopics[0],
    );
    const oldStart = oldChapter?.topics[0]?.subTopics[0];

    let oldOk = false;
    if (oldStart) {
      try {
        await withBoard(b.id, (tx) => getSlide(tx, { subTopicId: oldStart.id }));
        oldOk = true;
      } catch {
        oldOk = false;
      }
    }

    console.log(
      `[${b.slug}] OLD rule → chapter "${oldChapter?.name}" / sub_topic "${oldStart?.name}" → opens=${oldOk}`,
    );
    console.log(
      `           chapters with a module (old signal): ${oldHas.size}  ·  chapters openable (new): ${nav.filter((c) => c.hasContent).length}`,
    );
  }

  await queryClient.end();
}

main();
