/**
 * chapter_budget — how many sub-topics a chapter is WORTH (S169).
 *
 * The denominator behind every "N of M" a parent reads. M used to be derived:
 * `count(sub_topic)` under the chapter. That is only right when the spine is
 * fully carved, and on prod it is not — 4 of 24 CBSE chapters carry sub-topics —
 * so a derived M describes what we happen to have PUBLISHED rather than what the
 * child has to learn, and a growth bar drawn against it reads "nearly finished"
 * when they are nowhere near.
 *
 * ── OVERRIDE, not source of truth (founder ruling, S169) ────────────────────
 * No row ⇒ keep counting sub_topics. So nothing on any page moves until someone
 * sets a number, and prod is correctable chapter by chapter rather than in one
 * cutover. That property is the whole reason this is an override table; do not
 * "simplify" it later into a NOT NULL column on `chapter` without re-reading it.
 *
 * Board-scoped + RLS'd, so every call runs inside `withBoard` and cannot see or
 * write another board's curriculum.
 */
import { eq, inArray } from "drizzle-orm";
import type { PgTransaction } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { chapter, chapterBudget, subTopic, topic } from "@b2c/kernel/schema";

type Tx = PgTransaction<any, any, any>;

/** A budget below the sub-topics that already exist would read as >100% done. */
export class BudgetBelowCarvedError extends Error {
  code = "BUDGET_BELOW_CARVED" as const;
  constructor(
    public readonly chapterId: string,
    public readonly budget: number,
    public readonly carved: number,
  ) {
    super(
      `budget ${budget} is below the ${carved} sub-topics already carved in this chapter — ` +
        `the chapter would render as more than fully covered`,
    );
  }
}

export type ChapterBudgetRow = {
  chapterId: string;
  chapterName: string;
  subjectName: string;
  /** Sub-topics actually carved right now — the derived figure. */
  carved: number;
  /** The authored override, null when this chapter has none. */
  budget: number | null;
  /** What the dashboard will actually use: `budget ?? carved`. */
  effective: number;
  note: string | null;
  updatedAt: string | null;
};

/**
 * chapterId → authored budget, for the given chapters. Absent key = no override.
 * The ONE read the dashboard needs; it resolves `budget ?? carvedCount` itself
 * because it has already counted the cells.
 */
export async function readChapterBudgets(
  tx: Tx,
  chapterIds: string[],
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (chapterIds.length === 0) return out;
  // RLS keeps this to the claimed board; an EMPTY result is the normal
  // "nothing overridden yet" case, not a lost read (M80).
  const rows = await tx
    .select({ chapterId: chapterBudget.chapterId, budget: chapterBudget.budget })
    .from(chapterBudget)
    .where(inArray(chapterBudget.chapterId, chapterIds));
  for (const r of rows) out.set(r.chapterId, r.budget);
  return out;
}

/** An authored budget together with the metadata needed to place its chapter. */
export type BudgetedChapter = {
  chapterId: string;
  chapterName: string;
  subjectId: string;
  ordinal: number;
  budget: number;
};

/**
 * Every authored budget under the given SUBJECTS — keyed on subject, NOT on the
 * chapters the caller already knows about.
 *
 * The distinction is the whole point (S170). `readChapterBudgets` can only be
 * asked about chapters the dashboard already has cells for, and a chapter with
 * ZERO carved sub-topics never gets that far: the map is built off a query that
 * INNER JOINs `sub_topic`. So the eight CBSE chapters nobody has carved yet —
 * Real Numbers, Triangles, Circles, Probability, … — were silently dropped from
 * the denominator no matter what an editor typed into the Budgets tab, which
 * made the admin screen and the parent page disagree with no error anywhere.
 * Those chapters are exactly the ones a budget EXISTS to describe.
 */
export async function readSubjectChapterBudgets(
  tx: Tx,
  subjectIds: string[],
): Promise<BudgetedChapter[]> {
  if (subjectIds.length === 0) return [];
  const rows = await tx
    .select({
      chapterId: chapter.id,
      chapterName: chapter.name,
      subjectId: chapter.subjectId,
      ordinal: chapter.ordinal,
      budget: chapterBudget.budget,
    })
    .from(chapterBudget)
    .innerJoin(chapter, eq(chapter.id, chapterBudget.chapterId))
    .where(inArray(chapter.subjectId, subjectIds));
  return rows.map((r) => ({ ...r, ordinal: Number(r.ordinal), budget: Number(r.budget) }));
}

/** The admin editor's view: every chapter on this board, carved vs authored. */
export async function listChapterBudgets(tx: Tx): Promise<ChapterBudgetRow[]> {
  const rows = await tx
    .select({
      chapterId: chapter.id,
      chapterName: chapter.name,
      subjectName: sql<string>`(select s.name from subject s where s.id = ${chapter.subjectId})`,
      ordinal: chapter.ordinal,
      carved: sql<number>`(
        select count(*)::int from sub_topic st
        join topic t on t.id = st.topic_id
        where t.chapter_id = ${chapter.id}
      )`,
      budget: chapterBudget.budget,
      note: chapterBudget.note,
      updatedAt: chapterBudget.updatedAt,
    })
    .from(chapter)
    .leftJoin(chapterBudget, eq(chapterBudget.chapterId, chapter.id))
    .orderBy(chapter.ordinal);

  return rows.map((r) => ({
    chapterId: r.chapterId,
    chapterName: r.chapterName,
    subjectName: r.subjectName,
    carved: Number(r.carved),
    budget: r.budget ?? null,
    effective: r.budget ?? Number(r.carved),
    note: r.note ?? null,
    updatedAt: r.updatedAt ? new Date(r.updatedAt).toISOString() : null,
  }));
}

/**
 * Set or CLEAR one chapter's budget.
 *
 * `null` DELETES the override — reverting to the derived count is the operation
 * an editor wants, and it keeps "no row means derive" true (a stored 0 would
 * instead mean "this chapter is worth nothing", which is a different claim and a
 * legal one).
 */
export async function setChapterBudget(
  tx: Tx,
  args: {
    boardId: string;
    chapterId: string;
    budget: number | null;
    note?: string | null;
    actorId: string;
  },
): Promise<{ chapterId: string; budget: number | null; carved: number }> {
  const { boardId, chapterId, actorId } = args;

  // Counted under the same claim, so a chapter on another board reads 0 rows and
  // the FK insert below fails rather than writing across a tenant boundary.
  const [carvedRow] = await tx
    .select({ n: sql<number>`count(*)::int` })
    .from(subTopic)
    .innerJoin(topic, eq(topic.id, subTopic.topicId))
    .where(eq(topic.chapterId, chapterId));
  const carved = Number(carvedRow?.n ?? 0);

  if (args.budget === null || args.budget === undefined) {
    await tx.delete(chapterBudget).where(eq(chapterBudget.chapterId, chapterId));
    return { chapterId, budget: null, carved };
  }

  if (args.budget < carved) throw new BudgetBelowCarvedError(chapterId, args.budget, carved);

  await tx
    .insert(chapterBudget)
    .values({
      boardId,
      chapterId,
      budget: args.budget,
      subTopicCount: carved,
      note: args.note ?? null,
      updatedBy: actorId,
    })
    .onConflictDoUpdate({
      target: chapterBudget.chapterId,
      set: {
        budget: args.budget,
        subTopicCount: carved,
        note: args.note ?? null,
        updatedBy: actorId,
        updatedAt: new Date(),
      },
    });
  return { chapterId, budget: args.budget, carved };
}
