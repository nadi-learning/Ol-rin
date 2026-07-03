/**
 * seed_practice (Slice L) — the #13 authoring-agent STAND-IN (like D-WS2 was for
 * content): hand-seed a few subjective practice questions onto a real, already-
 * seeded sub_topic so the Practice capture loop has something to run.
 *
 * Target: the FIRST sub_topic (by topic/sub_topic ordinal) of the ch5_mixtures
 * chapter on board `cbse` (seeded by seed_ch5_mixtures). Resolved by
 * content_module_key, so it's robust to the generated slug/uuid. Idempotent: if
 * the sub_topic already has questions, it does nothing.
 *
 * Usage: bun scripts/seed_practice.ts
 */
import { and, asc, eq } from "drizzle-orm";
import type { PgTransaction } from "drizzle-orm/pg-core";
import { chapter, question, subTopic, topic } from "@b2c/kernel/schema";
import { db, queryClient } from "../src/db/client";
import { withBoard } from "../src/db/with-board";
import { board } from "@b2c/kernel/schema";

type Tx = PgTransaction<any, any, any>;

const BOARD_SLUG = "cbse";
const MODULE_KEY = "ch5_mixtures";

// 4 subjective questions, 2 conceptual / 2 procedural. reference_answer +
// explanation stay server-side (never shipped pre-submit, D-L-3).
const QUESTIONS = [
  {
    axis: "conceptual",
    stem: "Explain why a mixture can be separated into its parts by physical methods, but a compound cannot.",
    referenceAnswer:
      "In a mixture the substances are physically combined and keep their own properties, so differences in those properties (boiling point, solubility, magnetism, particle size) can be exploited to separate them physically. In a compound the elements are chemically bonded in fixed ratios and have lost their individual properties; only a chemical reaction (not a physical method) can break those bonds.",
    explanation:
      "The key idea is physical vs chemical combination: physical methods work on a mixture because no bonds were formed; a compound needs a chemical change.",
    pedagogicalNote:
      "Look for the contrast 'physical mixing vs chemical bonding' and at least one separable property. Common gap: students say 'mixtures are easier' without naming the bonding distinction.",
  },
  {
    axis: "procedural",
    stem: "Describe, step by step, how you would separate a mixture of sand and salt to recover both solids.",
    referenceAnswer:
      "1) Add water and stir so the salt dissolves while the sand does not. 2) Filter the mixture: the sand stays on the filter paper as residue; the salt solution passes through as filtrate. 3) Rinse and dry the sand. 4) Evaporate the filtrate (heat gently) so the water boils off and salt crystals are left behind.",
    explanation:
      "Order matters: dissolve → filter → evaporate. Filtration separates the insoluble sand; evaporation recovers the dissolved salt.",
    pedagogicalNote:
      "Award the full sequence only if the steps are in a workable order and both solids are actually recovered. A frequent miss is forgetting the evaporation step (recovering sand but not salt).",
  },
  {
    axis: "conceptual",
    stem: "A student claims: 'All solutions are mixtures, but not all mixtures are solutions.' Is the student correct? Justify your answer with an example of each.",
    referenceAnswer:
      "The student is correct. A solution is a homogeneous mixture in which one substance is dissolved in another (e.g. salt dissolved in water), so every solution is a mixture. But a mixture need not be a solution: it can be heterogeneous, like sand in water or a sand-and-iron-filings mixture, where the parts are not dissolved and remain visibly distinct.",
    explanation:
      "Solution ⊂ mixture. The justification needs the 'dissolved/homogeneous' property of a solution plus a heterogeneous mixture as the counterexample.",
    pedagogicalNote:
      "Strong answers give one example each and name homogeneous vs heterogeneous. Weak answers just restate the claim without an example.",
  },
  {
    axis: "procedural",
    stem: "Outline how you would use evaporation to recover pure salt from salt water, and state one safety precaution you would take.",
    referenceAnswer:
      "Pour the salt water into an evaporating dish and heat it gently (a water bath or low flame). The water evaporates, leaving salt crystals in the dish. Stop heating just before all the liquid is gone and let the rest evaporate slowly to avoid spitting. Safety precaution: wear eye protection / do not heat to complete dryness too fast, as hot crystals can spit out of the dish.",
    explanation:
      "Evaporation separates a dissolved solute from its solvent. The procedure plus a relevant, specific safety point are both required.",
    pedagogicalNote:
      "The safety precaution must be relevant to evaporation (spitting, hot apparatus, eye protection) — a generic 'be careful' is not enough.",
  },
] as const;

async function main() {
  const [b] = await db.select().from(board).where(eq(board.slug, BOARD_SLUG)).limit(1);
  if (!b) {
    console.error(
      `[seed:practice] board '${BOARD_SLUG}' not found. Run \`bun run seed:ch5\` first.`,
    );
    await queryClient.end();
    process.exit(1);
  }

  await withBoard(b.id, async (tx: Tx) => {
    // first sub_topic of the ch5 chapter (topic ordinal, then sub_topic ordinal)
    const [target] = await tx
      .select({ subTopicId: subTopic.id, subName: subTopic.name })
      .from(subTopic)
      .innerJoin(topic, eq(subTopic.topicId, topic.id))
      .innerJoin(chapter, eq(topic.chapterId, chapter.id))
      .where(eq(chapter.contentModuleKey, MODULE_KEY))
      .orderBy(asc(topic.ordinal), asc(subTopic.ordinal))
      .limit(1);
    if (!target) {
      throw new Error(
        `no sub_topic found for chapter content_module_key='${MODULE_KEY}'. Run \`bun run seed:ch5\` first.`,
      );
    }

    const existing = await tx
      .select({ id: question.id })
      .from(question)
      .where(eq(question.subTopicId, target.subTopicId));
    if (existing.length > 0) {
      console.log(
        `[seed:practice] sub_topic "${target.subName}" already has ${existing.length} question(s) — skipping (idempotent).`,
      );
      return;
    }

    let ordinal = 1;
    for (const q of QUESTIONS) {
      await tx.insert(question).values({
        boardId: b.id,
        subTopicId: target.subTopicId,
        axis: q.axis,
        kind: "subjective",
        stem: q.stem,
        referenceAnswer: q.referenceAnswer,
        explanation: q.explanation,
        pedagogicalNote: q.pedagogicalNote,
        ordinal: ordinal++,
        source: "b2c_authoring",
      });
    }
    console.log(
      `[seed:practice] cbse / "${target.subName}" ← ${QUESTIONS.length} subjective questions (2 conceptual / 2 procedural). sub_topic_id=${target.subTopicId}`,
    );
  });

  await queryClient.end();
}

main().catch(async (err) => {
  console.error("[seed:practice] FAILED:", err);
  await queryClient.end();
  process.exit(1);
});
