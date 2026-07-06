/**
 * probe_qa3_schema — Slice QA3-a exit gate (Question-Authoring v3 schema).
 *
 * Migration 0014 is additive-only: two nullable columns, no new table, no RLS
 * list change (both land on already-tenant-scoped tables). This probe proves
 * that against the real DB + real RLS, with a THROWAWAY fixture (boards P/Q,
 * unique per run — M22) that cleans up after itself.
 *
 *   1. DB connectivity as the app role.
 *   2. The columns EXIST with the right type + nullability (information_schema):
 *      chapter.metadata jsonb NULLABLE · question.difficulty text NULLABLE.
 *   3. D-QA3-5 verbatim round-trip: a raw topics.md blob (markdown, newlines,
 *      quotes, unicode) stored in chapter.metadata.topicsMd reads back
 *      BYTE-IDENTICAL — the load-bearing property (the LLM reads this blob).
 *   4. Additive/fault-isolated: a chapter inserted WITHOUT metadata → null;
 *      a question inserted WITHOUT difficulty → null (M8 — existing/seeded rows
 *      stay valid; snapshot-restore safe).
 *   5. D-QA3-9 difficulty round-trip: a question with difficulty='hard' reads
 *      back 'hard'.
 *   6. RLS still isolates the NEW columns: the seeded chapter/question (incl.
 *      metadata + difficulty) are INVISIBLE under a wrong board claim (Q), and
 *      a no-claim read returns 0 rows (fail-closed — M24/M29).
 */
import { and, eq, sql } from "drizzle-orm";
import type { PgTransaction } from "drizzle-orm/pg-core";
import {
  board,
  chapter,
  question,
  subTopic,
  subject,
  topic,
} from "@b2c/kernel/schema";
import { db, queryClient } from "../src/db/client";
import { withBoard } from "../src/db/with-board";

type Tx = PgTransaction<any, any, any>;

let passed = 0;
let failed = 0;
function check(name: string, ok: boolean) {
  if (ok) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.error(`  ✗ ${name}`);
  }
}

// A raw topics.md blob with the characters that break naive storage: markdown
// structure, CRLF + LF newlines, double/single quotes, backslashes, and unicode.
const RAW_TOPICS_MD = `# Chapter 5 — Exploring Mixtures

## Topic 1: What is a mixture?
- **LO (conceptual):** distinguish a mixture from a "pure substance".
- LO (procedural): separate a sand + salt mixture, step-by-step.

> Threshold: student can explain *why* filtration works — not just recite it.

Note: 90% pure ≠ 100% pure. Δ matters. Backslash test: C:\\Users\\x.
Tab→here. Line with trailing spaces below:

Second paragraph after a CRLF.\r\nEnd.`;

async function main() {
  const tag = `${Date.now()}`;

  // 1. connectivity
  await db.execute(sql`select 1`);
  check("DB connectivity (select 1) as app role", true);

  // 2. columns exist, right type + nullability
  const cols = await db.execute(sql`
    select table_name, column_name, data_type, is_nullable
    from information_schema.columns
    where (table_name = 'chapter' and column_name = 'metadata')
       or (table_name = 'question' and column_name = 'difficulty')
    order by table_name, column_name
  `);
  const rows = cols as unknown as Array<{
    table_name: string;
    column_name: string;
    data_type: string;
    is_nullable: string;
  }>;
  const meta = rows.find((r) => r.table_name === "chapter" && r.column_name === "metadata");
  const diff = rows.find((r) => r.table_name === "question" && r.column_name === "difficulty");
  check("chapter.metadata exists, jsonb, NULLABLE", meta?.data_type === "jsonb" && meta?.is_nullable === "YES");
  check("question.difficulty exists, text, NULLABLE", diff?.data_type === "text" && diff?.is_nullable === "YES");

  // throwaway boards P (owner) + Q (foreign, for the RLS check)
  const [P] = await db.insert(board).values({ slug: `qa3-p-${tag}`, name: "Probe P" }).returning();
  const [Q] = await db.insert(board).values({ slug: `qa3-q-${tag}`, name: "Probe Q" }).returning();
  if (!P || !Q) throw new Error("board seed failed");

  // Fixture under P: subject → chapterA (WITH metadata) + chapterB (WITHOUT) →
  // topic → sub_topic → questionA (difficulty='hard') + questionB (no difficulty).
  const fx = await withBoard(P.id, async (tx: Tx) => {
    const [subj] = await tx.insert(subject).values({ boardId: P.id, slug: "chem", name: "Chemistry", grade: "CBSE_9" }).returning();
    const [chA] = await tx.insert(chapter).values({
      boardId: P.id, subjectId: subj!.id, slug: "ch-a", name: "Ch A", ordinal: 1,
      metadata: { topicsMd: RAW_TOPICS_MD, source: "admin-upload" },
    }).returning();
    const [chB] = await tx.insert(chapter).values({
      boardId: P.id, subjectId: subj!.id, slug: "ch-b", name: "Ch B", ordinal: 2,
    }).returning();
    const [tp] = await tx.insert(topic).values({ boardId: P.id, chapterId: chA!.id, slug: "tp", name: "Tp", ordinal: 1 }).returning();
    const [st] = await tx.insert(subTopic).values({ boardId: P.id, topicId: tp!.id, slug: "st", name: "ST", ordinal: 1 }).returning();
    const [qA] = await tx.insert(question).values({
      boardId: P.id, subTopicId: st!.id, axis: "conceptual", kind: "subjective",
      stem: "Q with difficulty", referenceAnswer: "REF", ordinal: 1, source: "b2c_authoring",
      difficulty: "hard",
    }).returning();
    const [qB] = await tx.insert(question).values({
      boardId: P.id, subTopicId: st!.id, axis: "procedural", kind: "subjective",
      stem: "Q without difficulty", referenceAnswer: "REF", ordinal: 2, source: "b2c_authoring",
    }).returning();
    return { chA: chA!.id, chB: chB!.id, qA: qA!.id, qB: qB!.id };
  });

  // 3. D-QA3-5 verbatim round-trip
  const rtChapter = await withBoard(P.id, (tx) => tx.select().from(chapter).where(eq(chapter.id, fx.chA)));
  const storedMd = (rtChapter[0]?.metadata as any)?.topicsMd;
  check("chapter.metadata.topicsMd round-trips BYTE-IDENTICAL (verbatim, D-QA3-5)", storedMd === RAW_TOPICS_MD);
  check("chapter.metadata is a structured object (holds topicsMd + source)", (rtChapter[0]?.metadata as any)?.source === "admin-upload");

  // 4. additive/fault-isolated: absent = null (M8)
  const rtChapterB = await withBoard(P.id, (tx) => tx.select().from(chapter).where(eq(chapter.id, fx.chB)));
  check("chapter inserted WITHOUT metadata → null (additive, M8)", rtChapterB[0]?.metadata === null);
  const rtQB = await withBoard(P.id, (tx) => tx.select().from(question).where(eq(question.id, fx.qB)));
  check("question inserted WITHOUT difficulty → null (existing rows stay valid, M8)", rtQB[0]?.difficulty === null);

  // 5. D-QA3-9 difficulty round-trip
  const rtQA = await withBoard(P.id, (tx) => tx.select().from(question).where(eq(question.id, fx.qA)));
  check("question.difficulty round-trips ('hard', D-QA3-9)", rtQA[0]?.difficulty === "hard");

  // 6. RLS still isolates the new columns
  const underQ = await withBoard(Q.id, (tx) => tx.select().from(chapter).where(eq(chapter.id, fx.chA)));
  check("RLS: chapter (with metadata) invisible under a foreign board claim", underQ.length === 0);
  const qUnderQ = await withBoard(Q.id, (tx) => tx.select().from(question).where(eq(question.id, fx.qA)));
  check("RLS: question (with difficulty) invisible under a foreign board claim", qUnderQ.length === 0);
  // no-claim read (fail-closed): app role, no app.board set → 0 rows, not a throw (M24 NULLIF guard)
  const noClaim = await db.select().from(chapter).where(eq(chapter.id, fx.chA));
  check("RLS: no-claim read returns 0 rows (fail-closed, M24)", noClaim.length === 0);

  // ── cleanup (FK-safe order) ──
  await withBoard(P.id, async (tx: Tx) => {
    await tx.delete(question).where(eq(question.boardId, P.id));
    await tx.delete(subTopic).where(eq(subTopic.boardId, P.id));
    await tx.delete(topic).where(eq(topic.boardId, P.id));
    await tx.delete(chapter).where(eq(chapter.boardId, P.id));
    await tx.delete(subject).where(eq(subject.boardId, P.id));
  });
  await db.delete(board).where(eq(board.id, P.id));
  await db.delete(board).where(eq(board.id, Q.id));

  console.log(`\nprobe_qa3_schema: ${passed} passed, ${failed} failed`);
  await queryClient.end();
  process.exit(failed === 0 ? 0 : 1);
}

main().catch(async (err) => {
  console.error("probe_qa3_schema FAILED:", err);
  await queryClient.end();
  process.exit(1);
});
