/**
 * probe_mixed_delivery — Slice MIXED exit gate (items 7 + 13, D-QAUTH-9).
 *
 * Two claims, and the FIRST one is the whole slice:
 *
 *   item 7  an assignment holding several sub_topics is served as ONE mixed
 *           practice — consecutive questions come from DIFFERENT sub_topics
 *           (round-robin across the per-sub_topic sessions), and the counters
 *           are assignment-wide, not session-wide.
 *   item 13 at approve time the tutor chooses one mixed assignment or one per
 *           sub_topic. THE CHOICE IS THE COMPOSITION — no column stores it, so
 *           this proves the composition is what actually comes out.
 *
 * Runs against the real DB + real RLS on a THROWAWAY board (unique per run, M22)
 * and cleans up after itself.
 *
 * Fixture (board P): subject S1 "Physics" → chapter C1 "Ch1" with sub_topics
 * A (3 questions) and B (2), chapter C2 "Ch2" with D (2). Subject S2 for the
 * cross-subject case. Tutor TU ↔ student ST linked; ST2 unlinked, for ownership.
 *
 *   0. SELF-TEST — the order checker rejects a BLOCKED sequence. Without this
 *      the round-robin assertion could be vacuously true and nobody would know
 *      (S195: a probe that cannot fail is not evidence).
 *   1. DB connectivity.
 *   2. view: blocked [A,B] → mixed, label "Mixed questions (Physics - Ch1)",
 *      questionTotal 5 BEFORE any session exists (the un-started preview).
 *   3. view: single sub_topic → mixed false, mixedLabel null.
 *   4. view: interleaved → label "Mixed questions (all chapters)".
 *   5. startAssignment creates ONE session per sub_topic; step is assignment-wide.
 *   6. 🔑 THE ORDER: walking the run serves A,B,A,B,A — not A,A,A,B,B.
 *   7. counters advance 1..5 assignment-wide and land on completed.
 *   8. every attempt is filed under its OWN sub_topic (mastery is unaffected).
 *   9. assignmentStep is READ-ONLY — no session is created by asking.
 *  10. a finished run reports `completed`, it does NOT throw NO_QUESTIONS.
 *  11. NEWONLY: a fully-answered sub_topic contributes nothing to a fresh run.
 *  12. ownership: a foreign assignment → AssignmentNotFoundError, both entries.
 *  13. item 13 separate=false (default) → ONE assignment, 2 sub_topics, mixed.
 *  14. item 13 separate=true → TWO assignments, 1 sub_topic each, not mixed.
 *  15. item 13 separate=true is IGNORED for interleaved (always mixed).
 *  16. item 13 re-approve with separate=true does NOT merge back into a mixed
 *      assignment (the find-and-extend target rule).
 */
import { eq, inArray, sql } from "drizzle-orm";
import type { PgTransaction } from "drizzle-orm/pg-core";
import {
  appUser,
  assignment,
  attempt,
  board,
  chapter,
  observation,
  practiceSession,
  question,
  student,
  subTopic,
  subject,
  topic,
} from "@b2c/kernel/schema";
import { db, queryClient } from "../src/db/client";
import { withBoard } from "../src/db/with-board";
import { grantRole } from "../src/services/membership";
import {
  assignApprovedQuestions,
  AssignmentNotFoundError,
  createAssignment,
  listAssignmentsForStudent,
} from "../src/services/assignment";
import {
  getAssignmentStep,
  startAssignmentSession,
  submitAttempt,
} from "../src/services/practice";

type Tx = PgTransaction<any, any, any>;

let passed = 0;
let failed = 0;
function check(name: string, ok: boolean, detail?: string) {
  if (ok) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

async function expectThrow<T>(
  fn: () => Promise<unknown>,
  ctor: new (...a: any[]) => T,
): Promise<boolean> {
  try {
    await fn();
    return false;
  } catch (e) {
    return e instanceof ctor;
  }
}

/**
 * The claim under test, as a function so it can be self-tested.
 *
 * "Interleaved" here means: no question comes from the same sub_topic as the one
 * before it, for as long as a different sub_topic still has work left. The tail
 * is allowed to repeat — once B is exhausted, the remaining A's have nothing to
 * alternate with, and demanding otherwise would be demanding a shuffle (which
 * Shape B deliberately does not do; that needs a stored order).
 */
function isInterleaved(seq: string[]): boolean {
  const remaining = new Map<string, number>();
  for (const s of seq) remaining.set(s, (remaining.get(s) ?? 0) + 1);
  for (let i = 0; i < seq.length; i++) {
    const cur = seq[i]!;
    remaining.set(cur, remaining.get(cur)! - 1);
    const nxt = seq[i + 1];
    if (nxt === undefined) break;
    if (nxt !== cur) continue;
    // Repeat: only legal if NOTHING else still has questions left.
    for (const [k, n] of remaining) if (k !== cur && n > 0) return false;
  }
  return true;
}

async function main() {
  const tag = `${Date.now()}`;

  // ── 0. SELF-TEST: the checker must be able to say NO ────────────────────
  check(
    "0a. SELF-TEST: a BLOCKED sequence [A,A,A,B,B] is REJECTED",
    isInterleaved(["A", "A", "A", "B", "B"]) === false,
  );
  check(
    "0b. SELF-TEST: the true round-robin [A,B,A,B,A] is ACCEPTED",
    isInterleaved(["A", "B", "A", "B", "A"]) === true,
  );
  check(
    "0c. SELF-TEST: a legal TAIL repeat [A,B,A,B,A,A] is ACCEPTED (B exhausted)",
    isInterleaved(["A", "B", "A", "B", "A", "A"]) === true,
  );
  check(
    "0d. SELF-TEST: an EARLY repeat [A,A,B,B,A] is REJECTED",
    isInterleaved(["A", "A", "B", "B", "A"]) === false,
  );

  // 1. connectivity
  await db.execute(sql`select 1`);
  check("1. DB connectivity (select 1) as app role", true);

  const [P] = await db
    .insert(board)
    .values({ slug: `pmix-${tag}`, name: "Probe MIX" })
    .returning();
  if (!P) throw new Error("board seed failed");

  // Spine: S1 → C1 [A(3q), B(2q)] + C2 [D(2q)]; S2 → C3 [E(1q)].
  const fx = await withBoard(P.id, async (tx: Tx) => {
    const [s1] = await tx
      .insert(subject)
      .values({ boardId: P.id, slug: "phys", name: "Physics", grade: "IGCSE" })
      .returning();
    const [s2] = await tx
      .insert(subject)
      .values({ boardId: P.id, slug: "bio", name: "Biology", grade: "IGCSE" })
      .returning();
    const mkCh = async (subjectId: string, slug: string, name: string, ordinal: number) =>
      (
        await tx
          .insert(chapter)
          .values({ boardId: P.id, subjectId, slug, name, ordinal })
          .returning()
      )[0]!.id;
    const c1 = await mkCh(s1!.id, "c1", "Ch1", 1);
    const c2 = await mkCh(s1!.id, "c2", "Ch2", 2);
    const c3 = await mkCh(s2!.id, "c3", "Ch3", 1);
    const mkTopic = async (chapterId: string, slug: string) =>
      (
        await tx
          .insert(topic)
          .values({ boardId: P.id, chapterId, slug, name: slug.toUpperCase(), ordinal: 1 })
          .returning()
      )[0]!.id;
    const t1 = await mkTopic(c1, "t1");
    const t2 = await mkTopic(c2, "t2");
    const t3 = await mkTopic(c3, "t3");
    const mkSt = async (topicId: string, slug: string, name: string, ordinal: number) =>
      (
        await tx
          .insert(subTopic)
          .values({ boardId: P.id, topicId, slug, name, ordinal })
          .returning()
      )[0]!.id;
    const A = await mkSt(t1, "a", "ST A", 1);
    const B = await mkSt(t1, "b", "ST B", 2);
    const D = await mkSt(t2, "d", "ST D", 1);
    const E = await mkSt(t3, "e", "ST E", 1);
    // Deliberately UNEVEN: A has 3, B has 2. An even split would pass under a
    // naive alternator that can't handle exhaustion.
    const counts: [string, number][] = [
      [A, 3],
      [B, 2],
      [D, 2],
      [E, 1],
    ];
    for (const [stId, n] of counts) {
      for (let ord = 1; ord <= n; ord++) {
        await tx.insert(question).values({
          boardId: P.id,
          subTopicId: stId,
          axis: "conceptual",
          kind: "subjective",
          stem: `Q${ord} on ${stId}`,
          referenceAnswer: "ref",
          explanation: null,
          ordinal: ord,
          status: "approved",
          source: "b2c_authoring",
        });
      }
    }
    return { s1: s1!.id, s2: s2!.id, c1, c2, c3, A, B, D, E };
  });

  const emailTU = `pmix-tu-${tag}@example.com`;
  const emailST = `pmix-st-${tag}@example.com`;
  const emailST2 = `pmix-st2-${tag}@example.com`;
  const TU = await withBoard(P.id, (tx) =>
    grantRole(tx, { email: emailTU, name: "Tutor", board: P, role: "tutor" }),
  );
  const ST = await withBoard(P.id, (tx) =>
    grantRole(tx, { email: emailST, name: "Student", board: P, role: "student" }),
  );
  const ST2 = await withBoard(P.id, (tx) =>
    grantRole(tx, { email: emailST2, name: "Student2", board: P, role: "student" }),
  );
  const tutorUserId = TU.user.id;
  const studentId = ST.user.id;
  const student2Id = ST2.user.id;
  await withBoard(P.id, (tx) =>
    tx.insert(student).values({ userId: studentId, boardId: P.id, class: "9", tutorId: tutorUserId }),
  );
  await withBoard(P.id, (tx) =>
    tx.insert(student).values({ userId: student2Id, boardId: P.id, class: "9", tutorId: tutorUserId }),
  );

  // questionId → sub_topic, so a served question can be traced to its origin.
  const stOfQuestion = await withBoard(P.id, async (tx: Tx) => {
    const rows = await tx
      .select({ id: question.id, subTopicId: question.subTopicId })
      .from(question);
    return new Map(rows.map((r) => [r.id, r.subTopicId]));
  });
  const nameOf = (stId: string | undefined) =>
    stId === fx.A ? "A" : stId === fx.B ? "B" : stId === fx.D ? "D" : stId === fx.E ? "E" : "?";

  // ── 2-4. the VIEW: what the card says before anything is started ────────
  const mix = await withBoard(P.id, (tx) =>
    createAssignment(tx, {
      boardId: P.id,
      tutorUserId,
      studentId,
      mode: "blocked",
      chapterId: fx.c1,
      subTopicIds: [fx.A, fx.B],
    }),
  );
  check("2a. blocked [A,B] → mixed = true", mix.mixed === true);
  check(
    "2b. label names the SCOPE, never the sub_topics",
    mix.mixedLabel === "Mixed questions (Physics - Ch1)",
    `got ${JSON.stringify(mix.mixedLabel)}`,
  );
  check(
    "2c. questionTotal = 5 with NO session yet (un-started preview), done 0",
    mix.questionTotal === 5 && mix.questionDone === 0,
    `got ${mix.questionDone}/${mix.questionTotal}`,
  );

  const single = await withBoard(P.id, (tx) =>
    createAssignment(tx, {
      boardId: P.id,
      tutorUserId,
      studentId,
      mode: "blocked",
      chapterId: fx.c2,
      subTopicIds: [fx.D],
    }),
  );
  check(
    "3. single sub_topic → mixed false, mixedLabel null (nothing to mix)",
    single.mixed === false && single.mixedLabel === null,
  );

  const inter = await withBoard(P.id, (tx) =>
    createAssignment(tx, {
      boardId: P.id,
      tutorUserId,
      studentId: student2Id,
      mode: "interleaved",
      subjectId: fx.s1,
      subTopicIds: [fx.A, fx.D],
    }),
  );
  check(
    "4. interleaved → 'Mixed questions (all chapters)'",
    inter.mixedLabel === "Mixed questions (all chapters)",
    `got ${JSON.stringify(inter.mixedLabel)}`,
  );

  // ── 5. start: one session per sub_topic, assignment-wide counters ───────
  const step0 = await withBoard(P.id, (tx) =>
    startAssignmentSession(tx, { boardId: P.id, appUserId: studentId, assignmentId: mix.id }),
  );
  const sessCount = await withBoard(P.id, async (tx: Tx) => {
    const rows = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(practiceSession)
      .where(eq(practiceSession.assignmentId, mix.id));
    return rows[0]?.n ?? 0;
  });
  check("5a. startAssignment created ONE session per sub_topic (2)", sessCount === 2);
  check(
    "5b. step is ASSIGNMENT-wide: total 5 (not the 3 or 2 of one session)",
    step0.total === 5 && step0.currentIndex === 0 && step0.status === "active",
    `got ${step0.currentIndex}/${step0.total} ${step0.status}`,
  );
  check("5c. step carries the session that owns the question", !!step0.sessionId && !!step0.question);

  // ── 6/7/8. THE ORDER — walk the whole run ───────────────────────────────
  const served: string[] = [];
  const counters: string[] = [];
  const sessionsUsed = new Set<string>();
  let step = step0;
  let guard = 0;
  while (step.status === "active" && step.question && guard++ < 20) {
    served.push(nameOf(stOfQuestion.get(step.question.id)));
    counters.push(`${step.currentIndex}/${step.total}`);
    sessionsUsed.add(step.sessionId!);
    const sid = step.sessionId!;
    const qid = step.question.id;
    await withBoard(P.id, (tx) =>
      submitAttempt(tx, {
        boardId: P.id,
        appUserId: studentId,
        sessionId: sid,
        questionId: qid,
        answerText: "an answer",
        confidence: 3,
        timeMs: 1000,
      }),
    );
    step = await withBoard(P.id, (tx) =>
      getAssignmentStep(tx, { appUserId: studentId, assignmentId: mix.id }),
    );
  }

  console.log(`     served order: ${served.join(" → ")}`);
  check("6a. the run served all 5 questions", served.length === 5, served.join(","));
  check(
    "6b. 🔑 consecutive questions come from DIFFERENT sub_topics",
    isInterleaved(served),
    served.join(","),
  );
  check(
    "6c. it is NOT blocked practice (would have been A,A,A,B,B)",
    served.join(",") !== "A,A,A,B,B",
  );
  check("6d. both sessions were actually used", sessionsUsed.size === 2);
  check(
    "7a. counters advanced assignment-wide 0/5 → 4/5",
    counters.join(" ") === "0/5 1/5 2/5 3/5 4/5",
    counters.join(" "),
  );
  check(
    "7b. the run ends 'completed' with 5/5 and no question",
    step.status === "completed" && step.currentIndex === 5 && step.question === null,
    `${step.currentIndex}/${step.total} ${step.status}`,
  );

  // 8. evidence is still filed per sub_topic — mastery keys on question.sub_topic,
  //    so mixing the DELIVERY must not mix the EVIDENCE.
  const perSt = await withBoard(P.id, async (tx: Tx) => {
    const rows = await tx
      .select({ subTopicId: question.subTopicId, n: sql<number>`count(*)::int` })
      .from(attempt)
      .innerJoin(question, eq(question.id, attempt.questionId))
      .where(eq(attempt.appUserId, studentId))
      .groupBy(question.subTopicId);
    return new Map(rows.map((r) => [r.subTopicId, r.n]));
  });
  check(
    "8. evidence stays per sub_topic: A=3, B=2 (delivery mixed, mastery not)",
    perSt.get(fx.A) === 3 && perSt.get(fx.B) === 2,
    `A=${perSt.get(fx.A)} B=${perSt.get(fx.B)}`,
  );

  // ── 9. assignmentStep is READ-ONLY ──────────────────────────────────────
  const before = await withBoard(P.id, async (tx: Tx) =>
    (
      await tx.select({ n: sql<number>`count(*)::int` }).from(practiceSession)
        .where(eq(practiceSession.boardId, P.id))
    )[0]!.n,
  );
  await withBoard(P.id, (tx) => getAssignmentStep(tx, { appUserId: studentId, assignmentId: mix.id }));
  await withBoard(P.id, (tx) => getAssignmentStep(tx, { appUserId: studentId, assignmentId: single.id }));
  const after = await withBoard(P.id, async (tx: Tx) =>
    (
      await tx.select({ n: sql<number>`count(*)::int` }).from(practiceSession)
        .where(eq(practiceSession.boardId, P.id))
    )[0]!.n,
  );
  check(
    "9. assignmentStep spawned NO session (polling it after each answer is safe)",
    before === after,
    `${before} → ${after}`,
  );

  // ── 10/11. a finished run, and NEWONLY ──────────────────────────────────
  const reStart = await withBoard(P.id, (tx) =>
    startAssignmentSession(tx, { boardId: P.id, appUserId: studentId, assignmentId: mix.id }),
  );
  check(
    "10. re-opening a FINISHED run reports completed — it does not 404",
    reStart.status === "completed" && reStart.question === null,
  );
  check(
    "11a. NEWONLY: nothing was re-frozen for the finished sub_topics",
    reStart.total === 5,
    `total ${reStart.total}`,
  );
  const doneView = (await withBoard(P.id, (tx) =>
    listAssignmentsForStudent(tx, { appUserId: studentId }),
  )).find((a) => a.id === mix.id)!;
  check(
    "11b. the finished mixed card reads 5 / 5 questions and completed",
    doneView.questionDone === 5 && doneView.questionTotal === 5 && doneView.completed === true,
    `${doneView.questionDone}/${doneView.questionTotal} completed=${doneView.completed}`,
  );

  // ── 11c-e. 🔴 THE REGRESSION THE PROBE MISSED AND THE RENDER CAUGHT ─────
  //
  // A composition of 2 sub_topics where only ONE can serve this student. The
  // first build called that `mixed` (it counted the COMPOSITION), so the card
  // said "4 questions, mixed order" over four questions from a single sub_topic
  // — blocked practice wearing the exact label item 7 exists to remove. Reached
  // on prod two ways: a sub_topic privately targeted at another student (below),
  // and NEWONLY retiring one side of a real mix once the student finishes it.
  const fx4 = await withBoard(P.id, async (tx: Tx) => {
    const [c6] = await tx
      .insert(chapter)
      .values({ boardId: P.id, subjectId: fx.s1, slug: "c6", name: "Ch6", ordinal: 6 })
      .returning();
    const [t6] = await tx
      .insert(topic)
      .values({ boardId: P.id, chapterId: c6!.id, slug: "t6", name: "T6", ordinal: 1 })
      .returning();
    const mkSt = async (slug: string, ordinal: number) =>
      (
        await tx
          .insert(subTopic)
          .values({ boardId: P.id, topicId: t6!.id, slug, name: `ST ${slug}`, ordinal })
          .returning()
      )[0]!.id;
    const J = await mkSt("j", 1); // 2 canonical → serves ST
    const K = await mkSt("k", 2); // 2 questions, targeted at ST2 → serves ST nothing
    for (const ord of [1, 2]) {
      await tx.insert(question).values({
        boardId: P.id, subTopicId: J, axis: "conceptual", kind: "subjective",
        stem: `Q${ord} on J`, referenceAnswer: "ref", explanation: null,
        ordinal: ord, status: "approved", source: "b2c_authoring",
      });
      await tx.insert(question).values({
        boardId: P.id, subTopicId: K, targetStudentId: student2Id,
        axis: "conceptual", kind: "subjective",
        stem: `Q${ord} on K`, referenceAnswer: "ref", explanation: null,
        ordinal: ord, status: "approved", source: "b2c_authoring",
      });
    }
    return { c6: c6!.id, J, K };
  });

  const lopsided = await withBoard(P.id, (tx) =>
    createAssignment(tx, {
      boardId: P.id, tutorUserId, studentId,
      mode: "blocked", chapterId: fx4.c6, subTopicIds: [fx4.J, fx4.K],
    }),
  );
  check(
    "11c. 🔴 2 sub_topics but only ONE serves this student → mixed = FALSE",
    lopsided.mixed === false && lopsided.mixedLabel === null,
    `mixed=${lopsided.mixed} label=${JSON.stringify(lopsided.mixedLabel)}`,
  );
  check(
    "11d. the empty sub_topic is flagged hasWork=false (the FE hides the dead-end)",
    lopsided.subTopics.find((s) => s.subTopicId === fx4.J)?.hasWork === true &&
      lopsided.subTopics.find((s) => s.subTopicId === fx4.K)?.hasWork === false,
  );
  // ...and once the student finishes the contributing side, NEWONLY retires it
  // too, so nothing is left and the card must not still advertise a mix.
  let lop = await withBoard(P.id, (tx) =>
    startAssignmentSession(tx, { boardId: P.id, appUserId: studentId, assignmentId: lopsided.id }),
  );
  let lopGuard = 0;
  while (lop.status === "active" && lop.question && lopGuard++ < 10) {
    const sid = lop.sessionId!;
    const qid = lop.question.id;
    await withBoard(P.id, (tx) =>
      submitAttempt(tx, {
        boardId: P.id, appUserId: studentId, sessionId: sid, questionId: qid,
        answerText: "an answer", confidence: 3, timeMs: 1000,
      }),
    );
    lop = await withBoard(P.id, (tx) =>
      getAssignmentStep(tx, { appUserId: studentId, assignmentId: lopsided.id }),
    );
  }
  check(
    "11e. the lopsided run served only the contributing sub_topic (2 questions)",
    lop.total === 2 && lop.currentIndex === 2 && lop.status === "completed",
    `${lop.currentIndex}/${lop.total} ${lop.status}`,
  );

  // ── 12. ownership ───────────────────────────────────────────────────────
  check(
    "12a. startAssignment on a FOREIGN assignment → AssignmentNotFoundError",
    await expectThrow(
      () =>
        withBoard(P.id, (tx) =>
          startAssignmentSession(tx, {
            boardId: P.id,
            appUserId: studentId,
            assignmentId: inter.id, // belongs to ST2
          }),
        ),
      AssignmentNotFoundError,
    ),
  );
  check(
    "12b. assignmentStep on a FOREIGN assignment → AssignmentNotFoundError",
    await expectThrow(
      () =>
        withBoard(P.id, (tx) =>
          getAssignmentStep(tx, { appUserId: studentId, assignmentId: inter.id }),
        ),
      AssignmentNotFoundError,
    ),
  );

  // ── 13-16. ITEM 13 — the choice IS the composition ──────────────────────
  // Fresh sub_topics under a fresh chapter so find-and-extend can't reach the
  // assignments above.
  const fx2 = await withBoard(P.id, async (tx: Tx) => {
    const [c4] = await tx
      .insert(chapter)
      .values({ boardId: P.id, subjectId: fx.s1, slug: "c4", name: "Ch4", ordinal: 4 })
      .returning();
    const [t4] = await tx
      .insert(topic)
      .values({ boardId: P.id, chapterId: c4!.id, slug: "t4", name: "T4", ordinal: 1 })
      .returning();
    const mkSt = async (slug: string, ordinal: number) =>
      (
        await tx
          .insert(subTopic)
          .values({ boardId: P.id, topicId: t4!.id, slug, name: `ST ${slug}`, ordinal })
          .returning()
      )[0]!.id;
    const F = await mkSt("f", 1);
    const G = await mkSt("g", 2);
    const qs: Record<string, string[]> = { F: [], G: [] };
    for (const [key, stId] of [["F", F], ["G", G]] as const) {
      for (const ord of [1, 2]) {
        const [q] = await tx
          .insert(question)
          .values({
            boardId: P.id,
            subTopicId: stId,
            targetStudentId: studentId, // authored drafts are student-private
            axis: "conceptual",
            kind: "subjective",
            stem: `Q${ord} on ${key}`,
            referenceAnswer: "ref",
            explanation: null,
            ordinal: ord,
            status: "approved",
            source: "b2c_authoring",
          })
          .returning();
        qs[key]!.push(q!.id);
      }
    }
    return { c4: c4!.id, F, G, qF: qs.F!, qG: qs.G! };
  });

  const together = await withBoard(P.id, (tx) =>
    assignApprovedQuestions(tx, {
      boardId: P.id,
      tutorUserId,
      mode: "blocked",
      questionIds: [fx2.qF[0]!, fx2.qG[0]!],
      separate: false,
    }),
  );
  check(
    "13. separate=false (default) → ONE assignment, 2 sub_topics, mixed=true",
    together.length === 1 &&
      together[0]!.total === 2 &&
      together[0]!.mixed === true &&
      together[0]!.mixedLabel === "Mixed questions (Physics - Ch4)",
    `n=${together.length} total=${together[0]?.total} mixed=${together[0]?.mixed}`,
  );

  // A fresh chapter for the separate case (the merged one above is still open,
  // and find-and-extend would legitimately reach it).
  const fx3 = await withBoard(P.id, async (tx: Tx) => {
    const [c5] = await tx
      .insert(chapter)
      .values({ boardId: P.id, subjectId: fx.s1, slug: "c5", name: "Ch5", ordinal: 5 })
      .returning();
    const [t5] = await tx
      .insert(topic)
      .values({ boardId: P.id, chapterId: c5!.id, slug: "t5", name: "T5", ordinal: 1 })
      .returning();
    const mkSt = async (slug: string, ordinal: number) =>
      (
        await tx
          .insert(subTopic)
          .values({ boardId: P.id, topicId: t5!.id, slug, name: `ST ${slug}`, ordinal })
          .returning()
      )[0]!.id;
    const H = await mkSt("h", 1);
    const I = await mkSt("i", 2);
    const out: Record<string, string[]> = { H: [], I: [] };
    for (const [key, stId] of [["H", H], ["I", I]] as const) {
      for (const ord of [1, 2]) {
        const [q] = await tx
          .insert(question)
          .values({
            boardId: P.id,
            subTopicId: stId,
            targetStudentId: studentId,
            axis: "conceptual",
            kind: "subjective",
            stem: `Q${ord} on ${key}`,
            referenceAnswer: "ref",
            explanation: null,
            ordinal: ord,
            status: "approved",
            source: "b2c_authoring",
          })
          .returning();
        out[key]!.push(q!.id);
      }
    }
    return { c5: c5!.id, H, I, qH: out.H!, qI: out.I! };
  });

  const apart = await withBoard(P.id, (tx) =>
    assignApprovedQuestions(tx, {
      boardId: P.id,
      tutorUserId,
      mode: "blocked",
      questionIds: [fx3.qH[0]!, fx3.qI[0]!],
      separate: true,
    }),
  );
  check(
    "14. separate=true → TWO assignments, 1 sub_topic each, mixed=false",
    apart.length === 2 &&
      apart.every((a) => a.total === 1 && a.mixed === false && a.mixedLabel === null),
    `n=${apart.length} totals=${apart.map((a) => a.total).join(",")}`,
  );

  const interSplit = await withBoard(P.id, (tx) =>
    assignApprovedQuestions(tx, {
      boardId: P.id,
      tutorUserId,
      mode: "interleaved",
      questionIds: [fx2.qF[1]!, fx3.qH[1]!], // one subject, two chapters
      separate: true, // must be IGNORED
    }),
  );
  check(
    "15. separate=true is IGNORED for interleaved → ONE mixed assignment",
    interSplit.length === 1 && interSplit[0]!.total === 2 && interSplit[0]!.mixed === true,
    `n=${interSplit.length} total=${interSplit[0]?.total}`,
  );

  // 16. Re-approving into the SAME split sub_topics must not let find-and-extend
  //     hand them to each other (which would merge the split back into a mix).
  await withBoard(P.id, (tx) =>
    assignApprovedQuestions(tx, {
      boardId: P.id,
      tutorUserId,
      mode: "blocked",
      questionIds: [fx3.qI[1]!],
      separate: true,
    }),
  );
  const ch5Assignments = await withBoard(P.id, async (tx: Tx) =>
    tx.select().from(assignment).where(eq(assignment.chapterId, fx3.c5)),
  );
  check(
    "16. re-approving with separate=true did NOT merge the split back",
    ch5Assignments.length === 2 &&
      ch5Assignments.every((a) => a.subTopicIds.length === 1),
    `n=${ch5Assignments.length} sizes=${ch5Assignments.map((a) => a.subTopicIds.length).join(",")}`,
  );

  // ── cleanup (FK-safe order) ──
  await withBoard(P.id, async (tx: Tx) => {
    await tx.delete(observation).where(eq(observation.boardId, P.id));
    await tx.delete(attempt).where(eq(attempt.boardId, P.id));
    await tx.delete(practiceSession).where(eq(practiceSession.boardId, P.id));
    await tx.delete(assignment).where(eq(assignment.boardId, P.id));
    await tx.delete(question).where(eq(question.boardId, P.id));
    await tx.delete(subTopic).where(eq(subTopic.boardId, P.id));
    await tx.delete(topic).where(eq(topic.boardId, P.id));
    await tx.delete(chapter).where(eq(chapter.boardId, P.id));
    await tx.delete(subject).where(eq(subject.boardId, P.id));
    await tx.delete(student).where(eq(student.boardId, P.id));
  });
  await db.delete(appUser).where(inArray(appUser.email, [emailTU, emailST, emailST2]));
  await db.delete(board).where(eq(board.id, P.id));

  console.log(`\nprobe_mixed_delivery: ${passed} passed, ${failed} failed`);
  await queryClient.end();
  process.exit(failed === 0 ? 0 : 1);
}

main().catch(async (err) => {
  console.error("probe_mixed_delivery FAILED:", err);
  await queryClient.end();
  process.exit(1);
});
