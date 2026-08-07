/**
 * dump_qauth_prompt — READ-ONLY pre-flight for the Slice QAUTH-A render.
 *
 * Builds the REAL `buildScopedWorld` prompt for a real (student, sub_topic) on
 * the live local `cbse` board and writes it to disk so it can be read end to
 * end. This is the check that found S198 §2 (Stage-1 reads duplicated per
 * question) — a 71-leg string gate could not see it; reading one real prompt
 * could.
 *
 * Creates NOTHING except a transient authoring_chat row, which it rolls back.
 */
import { eq } from "drizzle-orm";
import { appUser, authoringChat, board, subTopic } from "@b2c/kernel/schema";
import { db, queryClient } from "../src/db/client";
import { withBoard } from "../src/db/with-board";
import { buildScopedWorld } from "../src/services/authoring_worker";

const BOARD_SLUG = "cbse";
const STUDENT = "57af5124-17d4-4d00-92f0-8cc5c7eb693e"; // Avani Purwar
const TUTOR_EMAIL = "tutor@example.com";
const SUB_TOPIC = process.argv[2] ?? "764614e0-74a5-424b-959a-c2a2833be4fc"; // Section Formula
const OUT = process.argv[3] ?? "/tmp/qauth-prompt.txt";

async function main() {
  const [b] = await db.select({ id: board.id }).from(board).where(eq(board.slug, BOARD_SLUG));
  if (!b) throw new Error(`no board ${BOARD_SLUG}`);
  const [t] = await db.select({ id: appUser.id }).from(appUser).where(eq(appUser.email, TUTOR_EMAIL));
  if (!t) throw new Error(`no tutor ${TUTOR_EMAIL}`);

  await withBoard(b.id, async (tx) => {
    const [st] = await tx
      .select({ id: subTopic.id, name: subTopic.name, boardId: subTopic.boardId })
      .from(subTopic)
      .where(eq(subTopic.id, SUB_TOPIC));
    if (!st) throw new Error(`no sub_topic ${SUB_TOPIC} on board ${BOARD_SLUG}`);
    const tutorId = t.id;

    // A transient chat — buildScopedWorld resolves the student FROM it (D-QAUTH-2).
    const [chat] = await tx
      .insert(authoringChat)
      .values({
        boardId: st.boardId,
        tutorId,
        studentId: STUDENT,
        subTopicId: st.id,
        vendor: "gemini",
        messages: [],
        mode: "blocked",
      })
      .returning({ id: authoringChat.id });
    if (!chat) throw new Error("chat insert returned nothing");

    const world = await buildScopedWorld(tx, {
      chatId: chat.id,
      subTopicId: st.id,
      brief: "Two questions on this sub-topic for the next sitting.",
    });

    const text = (world as any).basePrompt ?? JSON.stringify(world, null, 2);
    await Bun.write(OUT, text);
    console.log(`sub_topic : ${st.name}`);
    console.log(`written   : ${OUT}`);
    console.log(`bytes     : ${text.length}`);

    // roll the transient chat back
    await tx.delete(authoringChat).where(eq(authoringChat.id, chat.id));
  });
  await queryClient.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
