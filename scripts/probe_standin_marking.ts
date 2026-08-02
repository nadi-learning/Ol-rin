/**
 * probe_standin_marking — S191. Proves the backfill stand-in MARKING is what keeps
 * it out of Practice, by running the real `availableQuestionWhere` predicate over
 * two rows that differ in NOTHING but their marking.
 *
 * Why this exists as its own probe: `probe_backfill_dashboard` now asserts "zero
 * stand-ins are servable", but that assertion passes trivially once the data is
 * fixed — it cannot tell a working guard from a guard pointed at nothing. A green
 * check that has never been seen red is not evidence. So this builds a throwaway
 * board (M22 — never the real students' rows) and shows the predicate flipping:
 *
 *   OLD marking (status defaulted to 'approved', source 'b2c_authoring')
 *      → availableQuestionWhere RETURNS it   ← the shipped defect, reproduced
 *   NEW marking (status 'draft', source 'backfill_standin')
 *      → availableQuestionWhere EXCLUDES it  ← the fix
 *
 * One variable: the marking. Same board, same student, same sub_topic, same stem.
 * If BOTH read "excluded", the probe is broken, not the feature — hence leg 1.
 *
 * Also asserts the second surface: the tutor's authored tabs match on
 * source='b2c_authoring', so the OLD marking put the stand-in there too.
 *
 *   bun scripts/probe_standin_marking.ts
 */
import { and, eq, like } from "drizzle-orm";
import type { PgTransaction } from "drizzle-orm/pg-core";
import {
  appUser,
  board,
  chapter,
  question,
  subTopic,
  subject,
  topic,
} from "@b2c/kernel/schema";
import { db, queryClient } from "../src/db/client";
import { withBoard } from "../src/db/with-board";
import { grantRole } from "../src/services/membership";
import { availableQuestionWhere } from "../src/services/practice";

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

const STEM = "Backfilled practice item — Probe Sub-Topic";
const NOTE = "backfill stand-in: satisfies attempt.question_id, never rendered";

async function main() {
  const tag = `${Date.now()}`;
  const [B] = await db
    .insert(board)
    .values({ slug: `sim-${tag}`, name: "Stand-in Marking Probe" })
    .returning();
  if (!B) throw new Error("board seed failed");

  const email = `sim-s-${tag}@example.com`;
  const S = await withBoard(B.id, (tx) =>
    grantRole(tx, { email, name: "SIM", board: B, role: "student" }),
  );
  const studentId = S.user.id;

  const fx = await withBoard(B.id, async (tx: Tx) => {
    const [subj] = await tx
      .insert(subject)
      .values({ boardId: B.id, slug: "phys", name: "Physics", grade: "10" })
      .returning();
    const [chap] = await tx
      .insert(chapter)
      .values({ boardId: B.id, subjectId: subj!.id, slug: "ch", name: "Ch", ordinal: 1 })
      .returning();
    const [tp] = await tx
      .insert(topic)
      .values({ boardId: B.id, chapterId: chap!.id, slug: "tp", name: "Tp", ordinal: 1 })
      .returning();
    const [st] = await tx
      .insert(subTopic)
      .values({ boardId: B.id, topicId: tp!.id, slug: "st", name: "Probe Sub-Topic", ordinal: 1 })
      .returning();
    return { subTopicId: st!.id };
  });

  // The two rows differ ONLY in status + source.
  const base = {
    boardId: B.id,
    subTopicId: fx.subTopicId,
    axis: "both" as const,
    kind: "subjective" as const,
    stem: STEM,
    referenceAnswer: "(not carried by the old-b2c extraction)",
    pedagogicalNote: NOTE,
    ordinal: 1,
    targetStudentId: studentId,
  };

  const oldId = await withBoard(B.id, async (tx: Tx) => {
    const [q] = await tx
      .insert(question)
      // The shipped defect: `status` omitted → column default 'approved'.
      .values({ ...base, source: "b2c_authoring" })
      .returning({ id: question.id });
    return q!.id;
  });

  const newId = await withBoard(B.id, async (tx: Tx) => {
    const [q] = await tx
      .insert(question)
      .values({ ...base, source: "backfill_standin", status: "draft" })
      .returning({ id: question.id });
    return q!.id;
  });

  const servable = await withBoard(B.id, (tx: Tx) =>
    tx
      .select({ id: question.id, source: question.source, status: question.status })
      .from(question)
      .where(and(availableQuestionWhere(studentId), like(question.stem, "Backfilled practice item —%"))),
  );
  const servableIds = new Set(servable.map((r) => r.id));

  // ── leg 1: the defect reproduces (without this, leg 2 proves nothing) ──
  check(
    "1 OLD marking (approved + b2c_authoring) IS servable to its own student — the defect",
    servableIds.has(oldId),
  );
  // ── leg 2: the fix excludes it ──
  check("2 NEW marking (draft + backfill_standin) is NOT servable — the fix", !servableIds.has(newId));
  // ── leg 3: the two legs actually disagree (guards against a broken predicate) ──
  check(
    `3 the marking is the ONLY difference and it FLIPS the outcome (servable: ${servable.length} of 2)`,
    servable.length === 1 && servableIds.has(oldId) && !servableIds.has(newId),
  );

  // ── leg 4/5: the tutor's authored tabs, which match on source='b2c_authoring' ──
  const inTutorTabs = await withBoard(B.id, (tx: Tx) =>
    tx
      .select({ id: question.id })
      .from(question)
      .where(
        and(
          eq(question.targetStudentId, studentId),
          eq(question.source, "b2c_authoring"),
          like(question.stem, "Backfilled practice item —%"),
        ),
      ),
  );
  const tutorIds = new Set(inTutorTabs.map((r) => r.id));
  check("4 OLD marking also lands in the tutor's authored tabs — the second surface", tutorIds.has(oldId));
  check("5 NEW marking stays out of the tutor's authored tabs", !tutorIds.has(newId));

  // ── teardown (FK-safe) ──
  await withBoard(B.id, async (tx: Tx) => {
    await tx.delete(question).where(eq(question.boardId, B.id));
    await tx.delete(subTopic).where(eq(subTopic.boardId, B.id));
    await tx.delete(topic).where(eq(topic.boardId, B.id));
    await tx.delete(chapter).where(eq(chapter.boardId, B.id));
    await tx.delete(subject).where(eq(subject.boardId, B.id));
  });
  await db.delete(appUser).where(eq(appUser.email, email));
  await db.delete(board).where(eq(board.id, B.id));

  console.log(`\nprobe_standin_marking: ${passed} passed, ${failed} failed`);
  await queryClient.end();
  process.exit(failed === 0 ? 0 : 1);
}

main().catch(async (err) => {
  console.error("probe_standin_marking FAILED:", err);
  await queryClient.end();
  process.exit(1);
});
