/**
 * probe_practice_availability — Slice AVAIL exit gate. Proves `listAvailability`
 * (the browse list's Coming-soon signal) against the real DB + real RLS with a
 * THROWAWAY fixture (unique board per run, M22). Cleans up after itself.
 *
 * Fixture (board P): subject S1 → chapter C1 → topic T1 with five sub_topics:
 *   A1 — one CANONICAL approved question   → available to everyone
 *   A2 — no questions at all               → Coming soon
 *   A3 — only a DRAFT question             → Coming soon (drafts never served)
 *   A4 — one question PRIVATE to ST2       → Coming soon for ST, available to ST2
 *   A5 — one question PRIVATE to ST        → available to ST, Coming soon for ST2
 *
 * The point of the fixture is leg 7. Legs 2-6 assert the cases I thought of;
 * leg 7 asserts the INVARIANT that actually matters — for EVERY sub_topic, the
 * availability signal and what startSession really does must agree. A chip that
 * says "Coming soon" over a servable sub_topic (or promises questions that
 * startSession then refuses with NO_QUESTIONS) is a lying UI, which is worse than
 * the dead-end it replaced. Both callers share `availableQuestionWhere`, so this
 * leg is what proves the sharing actually holds end-to-end.
 *
 *  1. DB connectivity.
 *  2. CANONICAL question → A1 available (count 1).
 *  3. NO questions → A2 absent from availability.
 *  4. DRAFT only → A3 absent (M11 CHECK side: drafts never served).
 *  5. PRIVATE to another student → A4 absent for ST.
 *  6. PRIVATE to caller → A5 available for ST; and per-caller split (A4/A5 swap
 *     for ST2) — the read is caller-scoped, not global.
 *  7. INVARIANT: for every fixture sub_topic, available ⟺ startSession succeeds.
 *  8. COUNT accuracy: 3 canonical questions on A1 → count 3 (not a bare boolean).
 *  9. RLS cross-board: listAvailability under board Q → [] (no leak).
 *
 * Slice NEWONLY (legs 10-17) — the founder's Mon→Wed scenario on A6/A7:
 *  10-11. Monday: 2 questions authored, both ANSWERED through the real path.
 *  12-13. Between: A6 reports count 0 / total 2 and stays PRESENT — "finished"
 *         and "never authored" must not collapse into one signal, or the browse
 *         list files completed work under Coming-soon.
 *     14. A fully-answered sub_topic refuses to start (NO_QUESTIONS).
 *  15-16. Wednesday: 2 MORE authored → the new session is EXACTLY [q3,q4], at
 *         index 0, with no replay of the answered pair. This is the leg that
 *         would have caught the bug; it asserts the SET, because [q1..q4] and
 *         [q3,q4] are both "non-empty" and only one is correct.
 *     17. ST's answers do not retire the bank for ST2 (per-caller, not global).
 *     18. A SKIPPED question stays available — skip and answer are the SAME
 *         write (recordAndAdvance), so a predicate keyed on the attempt row
 *         alone would retire the question the student said "not now" to.
 */
import { eq, sql } from "drizzle-orm";
import type { PgTransaction } from "drizzle-orm/pg-core";
import {
  appUser,
  attempt,
  board,
  chapter,
  student,
  practiceSession,
  question,
  subTopic,
  subject,
  topic,
} from "@b2c/kernel/schema";
import { db, queryClient } from "../src/db/client";
import { withBoard } from "../src/db/with-board";
import { grantRole } from "../src/services/membership";
import {
  listAvailability,
  NoQuestionsError,
  skip,
  startSession,
  submitAttempt,
} from "../src/services/practice";

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

async function main() {
  const tag = `${Date.now()}`;

  await db.execute(sql`select 1`);
  check("DB connectivity (select 1) as app role", true);

  const [P] = await db.insert(board).values({ slug: `avail-p-${tag}`, name: "Probe P" }).returning();
  const [Q] = await db.insert(board).values({ slug: `avail-q-${tag}`, name: "Probe Q" }).returning();
  if (!P || !Q) throw new Error("board seed failed");

  const fx = await withBoard(P.id, async (tx: Tx) => {
    const [s1] = await tx.insert(subject).values({ boardId: P.id, slug: "phys", name: "Physics", grade: "IGCSE" }).returning();
    const [c1] = await tx.insert(chapter).values({ boardId: P.id, subjectId: s1!.id, slug: "c1", name: "Ch1", ordinal: 1 }).returning();
    const [t1] = await tx.insert(topic).values({ boardId: P.id, chapterId: c1!.id, slug: "t1", name: "T1", ordinal: 1 }).returning();
    const st = async (slug: string, name: string, ordinal: number) =>
      (await tx.insert(subTopic).values({ boardId: P.id, topicId: t1!.id, slug, name, ordinal }).returning())[0]!.id;
    return {
      A1: await st("a1", "ST A1", 1),
      A2: await st("a2", "ST A2", 2),
      A3: await st("a3", "ST A3", 3),
      A4: await st("a4", "ST A4", 4),
      A5: await st("a5", "ST A5", 5),
      // Slice NEWONLY — A6 carries the Mon→Wed re-authoring scenario, A7 the
      // skip case. Kept OFF the five above so the AVAIL legs keep asserting the
      // fixture they were written against.
      A6: await st("a6", "ST A6", 6),
      A7: await st("a7", "ST A7", 7),
    };
  });

  const emailST = `avail-st-${tag}@example.com`;
  const emailST2 = `avail-st2-${tag}@example.com`;
  const ST = await withBoard(P.id, (tx) => grantRole(tx, { email: emailST, name: "Student", board: P, role: "student" }));
  const ST2 = await withBoard(P.id, (tx) => grantRole(tx, { email: emailST2, name: "Student2", board: P, role: "student" }));
  const studentId = ST.user.id;
  const student2Id = ST2.user.id;

  let ord = 0;
  const seedQ = (subTopicId: string, target: string | null, status: "approved" | "draft" = "approved") =>
    withBoard(P.id, async (tx: Tx) =>
      (
        await tx
          .insert(question)
          .values({
            boardId: P.id, subTopicId, axis: "conceptual", kind: "subjective",
            stem: `Q on ${subTopicId} #${++ord}`, referenceAnswer: "ref", explanation: null,
            ordinal: ord, source: "b2c_authoring", status, targetStudentId: target,
          })
          .returning()
      )[0]!.id,
    );

  // Slice NEWONLY — carries BOTH numbers now. `count` is what Practice will
  // serve; `total` is everything visible. The pair is the whole point: absent
  // (never authored) and count=0/total>0 (finished) must stay distinguishable.
  const availFor = async (appUserId: string, boardId = P.id) =>
    new Map(
      (await withBoard(boardId, (tx) => listAvailability(tx, { appUserId }))).map((r) => [
        r.subTopicId,
        { count: r.count, total: r.total },
      ]),
    );
  const servable = (
    m: Map<string, { count: number; total: number }>,
    id: string,
  ) => (m.get(id)?.count ?? 0) > 0;

  await seedQ(fx.A1, null); // canonical
  await seedQ(fx.A3, null, "draft"); // draft only
  await seedQ(fx.A4, student2Id); // private to ST2
  await seedQ(fx.A5, studentId); // private to ST

  const a = await availFor(studentId);

  // 2-5.
  check("CANONICAL → A1 available (count 1)", a.get(fx.A1)?.count === 1);
  check("NO questions → A2 absent (Coming soon)", !a.has(fx.A2));
  check("DRAFT only → A3 absent (drafts never served)", !a.has(fx.A3));
  check("PRIVATE to another student → A4 absent for ST", !a.has(fx.A4));

  // 6. caller-scoped: the private pair swaps for ST2.
  check("PRIVATE to caller → A5 available for ST", servable(a, fx.A5));
  const a2 = await availFor(student2Id);
  check("CALLER-SCOPED: for ST2 the private pair swaps (A4 available, A5 absent)",
    servable(a2, fx.A4) && !a2.has(fx.A5));
  check("CALLER-SCOPED: canonical A1 available to BOTH students", a2.get(fx.A1)?.count === 1);

  // 7. THE INVARIANT — availability ⟺ startSession, for every sub_topic.
  const ALL: [string, string][] = [
    ["A1", fx.A1], ["A2", fx.A2], ["A3", fx.A3], ["A4", fx.A4], ["A5", fx.A5],
  ];
  let agree = true;
  const disagreements: string[] = [];
  for (const [name, subTopicId] of ALL) {
    // Slice NEWONLY — "available" is count>0, NOT mere presence. A finished
    // sub_topic is still PRESENT (total>0) and must not be read as servable.
    const claimsAvailable = servable(a, subTopicId);
    let actuallyServes = false;
    try {
      await withBoard(P.id, (tx) =>
        startSession(tx, { boardId: P.id, appUserId: studentId, subTopicId }),
      );
      actuallyServes = true;
    } catch (e) {
      if (!(e instanceof NoQuestionsError)) throw e;
      actuallyServes = false;
    }
    if (claimsAvailable !== actuallyServes) {
      agree = false;
      disagreements.push(`${name}: chip=${claimsAvailable} startSession=${actuallyServes}`);
    }
  }
  check(
    `INVARIANT: available ⟺ startSession serves, for all ${ALL.length} sub_topics` +
      (agree ? "" : ` — DISAGREE: ${disagreements.join("; ")}`),
    agree,
  );

  // 8. count is a real count, not a boolean.
  await seedQ(fx.A1, null);
  await seedQ(fx.A1, null);
  const a3 = await availFor(studentId);
  check("COUNT: 3 canonical questions on A1 → count 3", a3.get(fx.A1)?.count === 3);

  // 9. RLS cross-board.
  const aQ = await availFor(studentId, Q.id);
  check("RLS: listAvailability under board Q → [] (no leak)", aQ.size === 0);

  // ────────────────────────────────────────────────────────────────────────
  // Slice NEWONLY — the founder's Mon→Wed scenario, end to end (legs 10-17).
  //
  // The bug being closed: `startSession` re-froze the ENTIRE approved set every
  // time a new session opened, so questions authored on Wednesday arrived with
  // Monday's already-answered two in front of them, at currentIndex 0.
  //
  // Leg 11 is the one that would have caught it, and it asserts the SET, not the
  // count — [q1,q2,q3,q4] and [q3,q4] both have "more than zero" and only one of
  // them is right.
  // ────────────────────────────────────────────────────────────────────────
  const answerAll = async (subTopicId: string) => {
    // Drive the REAL path (startSession → submitAttempt), not a hand-inserted
    // attempt row: a fixture that writes its own rows asserts my assumption
    // about the write, not the write. (ai-build-miss: probe the path the
    // product runs.)
    let view = await withBoard(P.id, (tx) =>
      startSession(tx, { boardId: P.id, appUserId: studentId, subTopicId }),
    );
    const served: string[] = [];
    while (view.question) {
      const qid = view.question.id;
      served.push(qid);
      const r: any = await withBoard(P.id, (tx) =>
        submitAttempt(tx, {
          boardId: P.id, appUserId: studentId, sessionId: view.sessionId,
          questionId: qid, answerText: "an answer", confidence: 3, timeMs: 1000,
        }),
      );
      if (r.completed || !r.next) break;
      view = { ...view, question: r.next };
    }
    return served;
  };

  // Monday — two questions authored, both answered.
  const q1 = await seedQ(fx.A6, null);
  const q2 = await seedQ(fx.A6, null);
  const mon = await availFor(studentId);
  check("NEWONLY Mon: A6 offers the 2 fresh questions", mon.get(fx.A6)?.count === 2);
  const servedMon = await answerAll(fx.A6);
  check("NEWONLY Mon: the student answered exactly q1+q2",
    servedMon.length === 2 && servedMon.includes(q1) && servedMon.includes(q2));

  // Between the two days the sub_topic is FINISHED — the state that used to be
  // indistinguishable from "never authored".
  const between = await availFor(studentId);
  check("NEWONLY: finished A6 reports count 0 but total 2 (done ≠ coming-soon)",
    between.get(fx.A6)?.count === 0 && between.get(fx.A6)?.total === 2);
  check("NEWONLY: finished A6 is STILL PRESENT in the payload (sparseness on total)",
    between.has(fx.A6));
  let refused = false;
  try {
    await withBoard(P.id, (tx) =>
      startSession(tx, { boardId: P.id, appUserId: studentId, subTopicId: fx.A6 }),
    );
  } catch (e) {
    refused = e instanceof NoQuestionsError;
  }
  check("NEWONLY: a fully-answered sub_topic refuses to start (NO_QUESTIONS)", refused);

  // Wednesday — two MORE questions authored into the same sub_topic.
  const q3 = await seedQ(fx.A6, null);
  const q4 = await seedQ(fx.A6, null);
  const wed = await availFor(studentId);
  check("NEWONLY Wed: A6 offers 2 (the new ones) of 4 total",
    wed.get(fx.A6)?.count === 2 && wed.get(fx.A6)?.total === 4);

  const wedView = await withBoard(P.id, (tx) =>
    startSession(tx, { boardId: P.id, appUserId: studentId, subTopicId: fx.A6 }),
  );
  const wedIds = await withBoard(P.id, async (tx: Tx) =>
    (
      await tx.select({ ids: practiceSession.questionIds })
        .from(practiceSession).where(eq(practiceSession.id, wedView.sessionId))
    )[0]!.ids,
  );
  check(
    `NEWONLY ⭐ Wed session is EXACTLY [q3,q4] — no replay of the answered two` +
      ` (got ${wedIds.length}: ${wedIds.map((i) => (i === q1 ? "q1" : i === q2 ? "q2" : i === q3 ? "q3" : i === q4 ? "q4" : "?")).join(",")})`,
    wedIds.length === 2 && wedIds.includes(q3) && wedIds.includes(q4)
      && !wedIds.includes(q1) && !wedIds.includes(q2),
  );
  check("NEWONLY: the Wed session opens at index 0 on a NEW question",
    wedView.currentIndex === 0 && wedView.question?.id === q3);

  // Caller isolation — ST's answers must not retire the bank for ST2.
  const a2After = await availFor(student2Id);
  check("NEWONLY: ST's answers do NOT retire A6 for ST2 (count 4)",
    a2After.get(fx.A6)?.count === 4);

  // A SKIP is not an answer. Same write, different meaning — keying the
  // predicate on the attempt row alone would silently retire it.
  const q5 = await seedQ(fx.A7, null);
  const skipView = await withBoard(P.id, (tx) =>
    startSession(tx, { boardId: P.id, appUserId: studentId, subTopicId: fx.A7 }),
  );
  await withBoard(P.id, (tx) =>
    skip(tx, {
      boardId: P.id, appUserId: studentId, sessionId: skipView.sessionId,
      questionId: q5, reason: "not now",
    }),
  );
  const afterSkip = await availFor(studentId);
  check("NEWONLY: a SKIPPED question stays available (skip ≠ answered)",
    afterSkip.get(fx.A7)?.count === 1);

  // 19. THE INVARIANT AGAIN — now over the FINAL state, all seven sub_topics.
  // Leg 7 ran when nothing had been answered, so it could not see the new way
  // these two can diverge: NEWONLY made `listAvailability` express the rule a
  // SECOND time (as a FILTER) alongside `availableQuestionWhere`. Two spellings
  // of one rule is precisely the drift leg 7 exists to forbid, so it has to be
  // re-asserted after answers, skips and re-authoring have moved the state.
  const fin = await availFor(studentId);
  const ALL2: [string, string][] = [
    ["A1", fx.A1], ["A2", fx.A2], ["A3", fx.A3], ["A4", fx.A4],
    ["A5", fx.A5], ["A6", fx.A6], ["A7", fx.A7],
  ];
  let agree2 = true;
  const dis2: string[] = [];
  for (const [name, subTopicId] of ALL2) {
    const claims = servable(fin, subTopicId);
    let serves = false;
    try {
      await withBoard(P.id, (tx) =>
        startSession(tx, { boardId: P.id, appUserId: studentId, subTopicId }),
      );
      serves = true;
    } catch (e) {
      if (!(e instanceof NoQuestionsError)) throw e;
      serves = false;
    }
    if (claims !== serves) {
      agree2 = false;
      dis2.push(`${name}: count>0=${claims} startSession=${serves}`);
    }
  }
  check(
    `INVARIANT (post-answer): count>0 ⟺ startSession serves, all ${ALL2.length} sub_topics` +
      (agree2 ? "" : ` — DISAGREE: ${dis2.join("; ")}`),
    agree2,
  );

  // ── cleanup (FK-safe order) ──
  await withBoard(P.id, async (tx: Tx) => {
    await tx.delete(attempt).where(eq(attempt.boardId, P.id));
    await tx.delete(practiceSession).where(eq(practiceSession.boardId, P.id));
    await tx.delete(question).where(eq(question.boardId, P.id));
    await tx.delete(subTopic).where(eq(subTopic.boardId, P.id));
    await tx.delete(topic).where(eq(topic.boardId, P.id));
    await tx.delete(chapter).where(eq(chapter.boardId, P.id));
    await tx.delete(subject).where(eq(subject.boardId, P.id));
    await tx.delete(student).where(eq(student.boardId, P.id));
  });
  await db.delete(appUser).where(eq(appUser.email, emailST));
  await db.delete(appUser).where(eq(appUser.email, emailST2));
  await db.delete(board).where(eq(board.id, P.id));
  await db.delete(board).where(eq(board.id, Q.id));

  console.log(`\nprobe_practice_availability: ${passed} passed, ${failed} failed`);
  await queryClient.end();
  process.exit(failed === 0 ? 0 : 1);
}

main().catch(async (err) => {
  console.error("probe_practice_availability FAILED:", err);
  await queryClient.end();
  process.exit(1);
});
