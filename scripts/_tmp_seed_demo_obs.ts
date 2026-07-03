import { eq, asc, and } from "drizzle-orm";
import { appUser, board, chapter, subTopic, topic, attempt } from "@b2c/kernel/schema";
import { db, queryClient } from "../src/db/client";
import { withBoard } from "../src/db/with-board";
import { startSession, submitAttempt } from "../src/services/practice";
import { scoreAttempt } from "../src/services/assessment";

const [b] = await db.select().from(board).where(eq(board.slug, "cbse")).limit(1);
const [u] = await db.select().from(appUser).where(eq(appUser.email, "smoke@example.com")).limit(1);
if (!b || !u) { console.error("missing board/user"); process.exit(1); }

// real answers per axis — strong conceptual, solid procedural
const goodAnswer = (axis: string) =>
  axis === "procedural"
    ? "First add water and stir so the salt dissolves but the sand does not. Then filter the mixture: the sand stays as residue on the filter paper and the salt solution passes through as filtrate. Dry the sand. Finally evaporate the filtrate by gentle heating so the water boils off and salt crystals are left behind."
    : "A mixture's substances are only physically combined and keep their own properties, so differences such as solubility or boiling point can be used to separate them by physical methods. In a compound the elements are chemically bonded in fixed ratios and have lost their individual properties, so only a chemical reaction — not a physical method — can break those bonds.";

const stId = await withBoard(b.id, async (tx) => {
  const [t] = await tx
    .select({ id: subTopic.id })
    .from(subTopic)
    .innerJoin(topic, eq(subTopic.topicId, topic.id))
    .innerJoin(chapter, eq(topic.chapterId, chapter.id))
    .where(eq(chapter.contentModuleKey, "ch5_mixtures"))
    .orderBy(asc(topic.ordinal), asc(subTopic.ordinal))
    .limit(1);
  return t?.id;
});
if (!stId) { console.error("no ch5 sub_topic — run seed:ch5 && seed:practice"); process.exit(1); }

let view = await withBoard(b.id, (tx) => startSession(tx, { boardId: b.id, appUserId: u.id, subTopicId: stId }));
console.log(`session on "${view.subTopicId}", ${view.total} questions`);
let scored = 0;
while (view.status === "active" && view.question && scored < 2) {
  const q = view.question;
  const res = await withBoard(b.id, (tx) => submitAttempt(tx, {
    boardId: b.id, appUserId: u.id, sessionId: view.sessionId,
    questionId: q.id, answerText: goodAnswer(q.axis), confidence: q.axis === "procedural" ? 5 : 4, timeMs: 60000,
  }));
  // find the attempt we just wrote and score it via the real Stage-1 scorer
  const [att] = await withBoard(b.id, (tx) => tx.select().from(attempt)
    .where(and(eq(attempt.appUserId, u.id), eq(attempt.questionId, q.id))));
  if (att) { const r = await scoreAttempt(b.id, att.id); console.log(`  ✓ scored ${q.axis} attempt → ${JSON.stringify(r)}`); scored++; }
  // refresh view
  view = await withBoard(b.id, (tx) => import("../src/services/practice").then(m => m.getSession(tx, { sessionId: view.sessionId, appUserId: u.id })));
}
await queryClient.end();
