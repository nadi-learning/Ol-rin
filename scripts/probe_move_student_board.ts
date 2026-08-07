/**
 * probe_move_student_board — exit gate for move_student_board.
 *
 * Builds a THROWAWAY fixture (two boards, unique slugs per run — M22) that
 * mirrors the real shape being migrated: a student on board SRC whose content
 * lives in a private subject tree, with mastery, a practice session, an attempt,
 * an assignment and a Stage-2 sitting hanging off it.
 *
 * It then runs the REAL CLI as a subprocess rather than importing the move
 * function. That is deliberate: a probe that calls an internal helper asserts my
 * assumption about the entry point, not the entry point (ai-build-miss — "if the
 * probe's setup and the product's code path are different functions, the probe
 * is asserting your assumption"). Argument parsing, the RLS-role gate and the
 * commit/rollback logic are all part of what ships, so all of it is exercised.
 *
 * The legs that matter:
 *   4  DRY RUN CHANGES NOTHING — the whole design rests on the preview being the
 *      real statements rolled back, so "it previewed and then also wrote" is the
 *      failure worth hunting.
 *   7  THE FROZEN ARRAYS SURVIVE — assignment.sub_topic_ids and
 *      assessment_session.sub_topic_ids hold uuids no FK protects. This is the
 *      leg that would catch a re-keying implementation silently orphaning them.
 *   8  NO SPLIT-BRAIN ROW — a student row whose board_id disagrees with its
 *      sub_topic's board_id is invisible to BOTH boards under RLS, so it can
 *      never be found by a normal read afterwards.
 *   9  RLS actually follows the move: the app role sees the data under the
 *      target board claim and nothing under the source.
 *  10  the exclusivity guard REFUSES when a second student shares the content.
 */
import { eq, sql } from "drizzle-orm";
import type { PgTransaction } from "drizzle-orm/pg-core";
import {
  appUser, assessmentSession, assignment, attempt, board, chapter, masteryState,
  practiceSession, question, schedulingState, student, subTopic, subject, topic,
} from "@b2c/kernel/schema";
import postgres from "postgres";
import { db, queryClient } from "../src/db/client";
import { env } from "../src/config/env";
import { withBoard } from "../src/db/with-board";
import { grantRole } from "../src/services/membership";

type Tx = PgTransaction<any, any, any>;

/* CROSS-BOARD ASSERTIONS MUST NOT USE `db`. It connects as the app role, and on
   a FORCE-RLS table with no `app.board` claim every read returns 0 rows — which
   makes "nothing moved" and "everything moved" produce the SAME answer, and
   makes a mismatch count of 0 mean nothing at all. The first run of this probe
   failed four legs and PASSED leg 8 for exactly that reason. These checks span
   two boards by design, so they get the same master handle the migration uses. */
const master = postgres(env.MIGRATE_DATABASE_URL ?? env.DATABASE_URL, { max: 1 });
let passed = 0, failed = 0;
const check = (name: string, ok: boolean, detail = "") => {
  if (ok) { passed++; console.log(`  ✓ ${name}${detail ? ` — ${detail}` : ""}`); }
  else { failed++; console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`); }
};

const run = async (args: string[]) => {
  const p = Bun.spawn(["bun", "scripts/move_student_board.ts", ...args], {
    stdout: "pipe", stderr: "pipe",
  });
  const [out, err] = await Promise.all([
    new Response(p.stdout).text(), new Response(p.stderr).text(),
  ]);
  return { code: await p.exited, out, err };
};

async function main() {
  const tag = `${Date.now()}`;
  const [SRC] = await db.insert(board).values({ slug: `mv-src-${tag}`, name: "Src" }).returning();
  const [DST] = await db.insert(board).values({ slug: `mv-dst-${tag}`, name: "Dst" }).returning();
  if (!SRC || !DST) throw new Error("board seed failed");

  const email = `mv-st-${tag}@example.com`;
  const email2 = `mv-st2-${tag}@example.com`;
  const ST = await withBoard(SRC.id, (tx) => grantRole(tx, { email, name: `MoveProbe${tag}`, board: SRC, role: "student" }));
  const ST2 = await withBoard(SRC.id, (tx) => grantRole(tx, { email: email2, name: `Other${tag}`, board: SRC, role: "student" }));
  const S = ST.user.id;
  /* grantRole creates the app_user PROFILE only — for a student it is
     "shell only" and writes no `student` row. move_student_board resolves the
     student through that row (it is where board_id lives), so without this the
     whole probe silently tests nothing: every leg fails on "matched 0 students"
     rather than on anything about the move. */
  await withBoard(SRC.id, async (tx: Tx) => {
    await tx.insert(student).values({ userId: S, boardId: SRC.id, class: "8" });
    await tx.insert(student).values({ userId: ST2.user.id, boardId: SRC.id, class: "8" });
  });
  const SUBJECT = `Probe Custom ${tag}`;

  const fx = await withBoard(SRC.id, async (tx: Tx) => {
    const [s1] = await tx.insert(subject).values({ boardId: SRC.id, slug: `sub-${tag}`, name: SUBJECT, grade: "8" }).returning();
    const [c1] = await tx.insert(chapter).values({ boardId: SRC.id, subjectId: s1!.id, slug: `ch-${tag}`, name: "Ch", ordinal: 1 }).returning();
    const [t1] = await tx.insert(topic).values({ boardId: SRC.id, chapterId: c1!.id, slug: `tp-${tag}`, name: "Tp", ordinal: 1 }).returning();
    const mk = async (n: number) =>
      (await tx.insert(subTopic).values({ boardId: SRC.id, topicId: t1!.id, slug: `st${n}-${tag}`, name: `ST${n}`, ordinal: n }).returning())[0]!.id;
    const st1 = await mk(1), st2 = await mk(2);
    const q = async (stId: string, n: number) =>
      (await tx.insert(question).values({
        boardId: SRC.id, subTopicId: stId, axis: "conceptual", kind: "subjective",
        stem: `Q${n}`, referenceAnswer: "ref", explanation: null, ordinal: n,
        source: "b2c_authoring", status: "approved",
      }).returning())[0]!.id;
    const q1 = await q(st1, 1), q2 = await q(st2, 2);

    await tx.insert(masteryState).values({
      boardId: SRC.id, studentId: S, subTopicId: st1,
      conceptualLevel: 3, proceduralLevel: 2, description: "desc", log: "log",
    });
    await tx.insert(schedulingState).values({ boardId: SRC.id, studentId: S, subTopicId: st1 });
    const [ps] = await tx.insert(practiceSession).values({
      boardId: SRC.id, appUserId: S, subTopicId: st1, questionIds: [q1, q2],
      currentIndex: 0, status: "active",
    }).returning();
    await tx.insert(attempt).values({
      boardId: SRC.id, practiceSessionId: ps!.id, questionId: q1, appUserId: S,
      answerText: "an answer", confidence: 3, timeMs: 1000,
    });
    const [asg] = await tx.insert(assignment).values({
      boardId: SRC.id, tutorId: S, studentId: S, mode: "blocked", subTopicIds: [st1, st2],
    }).returning();
    await tx.insert(assessmentSession).values({
      boardId: SRC.id, studentId: S, tutorId: S, assignmentId: asg!.id, subTopicIds: [st1, st2],
    });
    return { st1, st2, q1, q2, asgId: asg!.id, psId: ps!.id };
  });

  await db.execute(sql`select 1`);
  check("fixture built on SRC", true, `2 sub_topics, 2 questions`);

  // 1-3. dry run
  const dry = await run(["--student", email, "--to", DST.slug, "--subject", SUBJECT]);
  check("1. dry run exits 0", dry.code === 0, dry.code === 0 ? "" : dry.err.slice(0, 200));
  check("2. dry run reports the exclusivity guard passing", /exclusivity guard/.test(dry.out));
  check("3. dry run says it rolled back", /DRY RUN — rolled back/.test(dry.out));

  // 4. THE LEG: dry run must not have written.
  const [stillSrc] = await master`
    SELECT count(*)::int AS n FROM mastery_state WHERE student_id = ${S} AND board_id = ${SRC.id}`;
  check("4. ⭐ DRY RUN CHANGED NOTHING — mastery still on SRC", Number(stillSrc!.n) === 1);

  // 5-6. apply
  const app = await run(["--student", email, "--to", DST.slug, "--subject", SUBJECT, "--apply"]);
  check("5. apply exits 0", app.code === 0, app.code === 0 ? "" : (app.err + app.out).slice(-400));
  check("6. apply reports committed", /✅ committed/.test(app.out));

  const [a] = await master`
    SELECT (SELECT count(*)::int FROM mastery_state WHERE student_id=${S} AND board_id=${DST.id}) AS mastery_dst,
           (SELECT count(*)::int FROM mastery_state WHERE student_id=${S} AND board_id=${SRC.id}) AS mastery_src,
           (SELECT count(*)::int FROM sub_topic WHERE id=${fx.st1} AND board_id=${DST.id})        AS st_dst,
           (SELECT count(*)::int FROM question  WHERE id=${fx.q1}  AND board_id=${DST.id})        AS q_dst,
           (SELECT count(*)::int FROM attempt   WHERE app_user_id=${S} AND board_id=${DST.id})    AS att_dst,
           (SELECT board_id FROM student WHERE user_id=${S})                                       AS student_board,
           (SELECT conceptual_level FROM mastery_state WHERE student_id=${S})                      AS cl,
           (SELECT procedural_level FROM mastery_state WHERE student_id=${S})                      AS pl`;
  check("6b. everything landed on DST, nothing left on SRC",
    a!.mastery_dst === 1 && a!.mastery_src === 0 && a!.st_dst === 1 && a!.q_dst === 1 && a!.att_dst === 1);
  check("6c. student row moved", a!.student_board === DST.id);
  check("6d. mastery LEVELS unchanged by the move", a!.cl === 3 && a!.pl === 2);

  // 7. the frozen arrays
  const [r] = await master`
    SELECT (SELECT sub_topic_ids FROM assignment WHERE id=${fx.asgId})          AS asg,
           (SELECT sub_topic_ids FROM assessment_session WHERE assignment_id=${fx.asgId}) AS sit,
           (SELECT question_ids  FROM practice_session WHERE id=${fx.psId})     AS ps`;
  const same = (got: any, want: string[]) =>
    Array.isArray(got) && got.length === want.length && want.every((w) => got.includes(w));
  check("7. ⭐ FROZEN ARRAYS INTACT — assignment / sitting / session question ids",
    same(r!.asg, [fx.st1, fx.st2]) && same(r!.sit, [fx.st1, fx.st2]) && same(r!.ps, [fx.q1, fx.q2]));

  // 8. no split-brain
  const [split] = await master`
    SELECT count(*)::int AS n FROM mastery_state m JOIN sub_topic st ON st.id=m.sub_topic_id
     WHERE m.student_id=${S} AND m.board_id <> st.board_id`;
  /* Guarded: 0 rows visible would also read as "0 mismatched". Assert the row
     set is non-empty first, so this leg can only pass by being true. */
  const [seen] = await master`SELECT count(*)::int AS n FROM mastery_state WHERE student_id=${S}`;
  check("8. ⭐ NO SPLIT-BRAIN ROW (board_id disagreeing with its sub_topic)",
    Number(seen!.n) > 0 && Number(split!.n) === 0, `${seen!.n} mastery rows examined`);

  // 9. RLS follows the move — the app role's view is what the student gets
  const seenDst = await withBoard(DST.id, (tx: Tx) =>
    tx.select().from(masteryState).where(eq(masteryState.studentId, S)));
  const seenSrc = await withBoard(SRC.id, (tx: Tx) =>
    tx.select().from(masteryState).where(eq(masteryState.studentId, S)));
  check("9. RLS follows: visible under DST, invisible under SRC",
    seenDst.length === 1 && seenSrc.length === 0, `dst=${seenDst.length} src=${seenSrc.length}`);

  // 10. the guard refuses when the content is shared
  await withBoard(DST.id, (tx: Tx) =>
    tx.insert(masteryState).values({
      boardId: DST.id, studentId: ST2.user.id, subTopicId: fx.st1,
      conceptualLevel: 1, proceduralLevel: 1, description: "d", log: "l",
    }));
  const refused = await run(["--student", email, "--to", SRC.slug, "--subject", SUBJECT]);
  check("10. ⭐ exclusivity guard REFUSES shared content",
    refused.code !== 0 && /NOT exclusive/.test(refused.err + refused.out),
    refused.code === 0 ? "it allowed the move" : "");

  /* ── cleanup, in TWO passes across BOTH boards ────────────────────────────
     Not one pass per board. After the move (or after a failed one) a student
     row can sit on a different board from the sub_topic it references, so
     draining a board's content while the other board still holds rows pointing
     into it hits the FK. Clear every student row on both boards first, then the
     content on both. */
  for (const b of [SRC.id, DST.id])
    await withBoard(b, async (tx: Tx) => {
      await tx.delete(assessmentSession).where(eq(assessmentSession.boardId, b));
      await tx.delete(assignment).where(eq(assignment.boardId, b));
      await tx.delete(attempt).where(eq(attempt.boardId, b));
      await tx.delete(practiceSession).where(eq(practiceSession.boardId, b));
      await tx.delete(schedulingState).where(eq(schedulingState.boardId, b));
      await tx.delete(masteryState).where(eq(masteryState.boardId, b));
    });
  for (const b of [SRC.id, DST.id])
    await withBoard(b, async (tx: Tx) => {
      await tx.delete(question).where(eq(question.boardId, b));
      await tx.delete(subTopic).where(eq(subTopic.boardId, b));
      await tx.delete(topic).where(eq(topic.boardId, b));
      await tx.delete(chapter).where(eq(chapter.boardId, b));
      await tx.delete(subject).where(eq(subject.boardId, b));
      await tx.delete(student).where(eq(student.boardId, b));
    });
  await db.delete(appUser).where(eq(appUser.email, email));
  await db.delete(appUser).where(eq(appUser.email, email2));
  await db.delete(board).where(eq(board.id, SRC.id));
  await db.delete(board).where(eq(board.id, DST.id));

  console.log(`\nprobe_move_student_board: ${passed} passed, ${failed} failed`);
  await master.end();
  await queryClient.end();
  process.exit(failed === 0 ? 0 : 1);
}

main().catch(async (err) => {
  console.error("probe_move_student_board FAILED:", err);
  await queryClient.end();
  process.exit(1);
});
