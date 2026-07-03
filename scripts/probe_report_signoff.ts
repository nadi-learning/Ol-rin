/**
 * probe_report_signoff — Slice Report-Signoff exit gate (Parent sign-off, the
 * deferred half of Polaris #4 / D-P-1).
 *
 * Proves the report.* sign-off service against the real DB + real RLS with a
 * THROWAWAY fixture (unique per-run boards P/Q) so the canonical seeds stay
 * pristine (M22). Cleans up after itself.
 *
 *   1. DB connectivity as the app role.
 *   2. ASSEMBLE: tutor TU assembles a draft for linked student ST → status
 *      'draft', snapshot carries mastery (the certified pair + description) +
 *      metrics. publishedAt null.
 *   3. NO LOG LEAK (M11 projection boundary): mastery_state.log holds a sentinel;
 *      the frozen snapshot must NOT contain it.
 *   4. THE published GATE — CHECK side: a parent CANNOT see the draft
 *      (listReportsForParent → empty; getReportForParent(draft) → NOT_FOUND).
 *   5. tutor sees their own draft (listReportsForTutor + getReportForTutor).
 *   6. OWNERSHIP (tutor): an unlinked tutor TU2 → assemble + list → StudentNotFound.
 *   7. PUBLISH (the SET side): publishReport(TU, draft, note) → 'published',
 *      publishedAt set, tutorNote stored, + a report_published event_log row.
 *   8. now the parent SEES it (list → 1 published; getReport → detail, no log).
 *   9. OWNERSHIP (parent): an unlinked parent PA2 → list + getReport → NOT_FOUND.
 *  10. re-publish rejected (ReportAlreadyPublishedError); author-only publish
 *      (TU2 cannot publish TU's draft → ReportNotFound).
 *  11. FROZEN: bump the LIVE mastery after publish → the published snapshot is
 *      unchanged (the whole point of sign-off).
 *  12. RLS cross-board: under board Q the report + the link are invisible.
 *  13. HTTP: tutor.assembleReport / parent.listReports no session → 401 (soft).
 */
import { and, eq, sql } from "drizzle-orm";
import type { PgTransaction } from "drizzle-orm/pg-core";
import {
  appUser,
  attempt,
  board,
  chapter,
  eventLog,
  masteryState,
  membership,
  parentChild,
  practiceSession,
  question,
  report,
  subTopic,
  subject,
  topic,
  tutorStudent,
  whitelist,
} from "@b2c/kernel/schema";
import { db, queryClient } from "../src/db/client";
import { withBoard } from "../src/db/with-board";
import { resolveMembership } from "../src/services/membership";
import { StudentNotFoundError } from "../src/services/tutor";
import { ChildNotFoundError } from "../src/services/parent";
import {
  assembleReport,
  getReportForParent,
  getReportForTutor,
  listReportsForParent,
  listReportsForTutor,
  publishReport,
  REPORT_PUBLISHED_EVENT,
  ReportAlreadyPublishedError,
  ReportNotFoundError,
} from "../src/services/report";
import { env } from "../src/config/env";

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

const LOG_SENTINEL = "INTERNAL_LOG_DO_NOT_LEAK_rpt456";

async function main() {
  const tag = `${Date.now()}`;

  // 1. connectivity
  await db.execute(sql`select 1`);
  check("DB connectivity (select 1) as app role", true);

  const [P] = await db.insert(board).values({ slug: `rps-p-${tag}`, name: "Probe P" }).returning();
  const [Q] = await db.insert(board).values({ slug: `rps-q-${tag}`, name: "Probe Q" }).returning();
  if (!P || !Q) throw new Error("board seed failed");

  // spine under P: one sub_topic ST, plus mastery + an attempt for the snapshot.
  const fx = await withBoard(P.id, async (tx: Tx) => {
    const [subj] = await tx.insert(subject).values({ boardId: P.id, slug: "phys", name: "Physics", grade: "IGCSE" }).returning();
    const [chap] = await tx.insert(chapter).values({ boardId: P.id, subjectId: subj!.id, slug: "ch", name: "Forces", ordinal: 1 }).returning();
    const [tp] = await tx.insert(topic).values({ boardId: P.id, chapterId: chap!.id, slug: "tp", name: "Motion", ordinal: 1 }).returning();
    const [st] = await tx.insert(subTopic).values({ boardId: P.id, topicId: tp!.id, slug: "st", name: "Acceleration", ordinal: 1 }).returning();
    return { ST: st!.id };
  });

  // identities (REAL flow): tutor TU (linked), parent PA (linked), student ST;
  // plus an UNLINKED tutor TU2 and an UNLINKED parent PA2.
  const emailTU = `rps-tu-${tag}@example.com`;
  const emailTU2 = `rps-tu2-${tag}@example.com`;
  const emailPA = `rps-pa-${tag}@example.com`;
  const emailPA2 = `rps-pa2-${tag}@example.com`;
  const emailST = `rps-st-${tag}@example.com`;
  await withBoard(P.id, async (tx: Tx) => {
    await tx.insert(whitelist).values({ boardId: P.id, email: emailTU, role: "tutor" });
    await tx.insert(whitelist).values({ boardId: P.id, email: emailTU2, role: "tutor" });
    await tx.insert(whitelist).values({ boardId: P.id, email: emailPA, role: "parent" });
    await tx.insert(whitelist).values({ boardId: P.id, email: emailPA2, role: "parent" });
    await tx.insert(whitelist).values({ boardId: P.id, email: emailST, role: "student" });
  });
  const TU = await withBoard(P.id, (tx) => resolveMembership(tx, { email: emailTU, name: "Tutor", board: P }));
  const TU2 = await withBoard(P.id, (tx) => resolveMembership(tx, { email: emailTU2, name: "Tutor Two", board: P }));
  const PA = await withBoard(P.id, (tx) => resolveMembership(tx, { email: emailPA, name: "Parent", board: P }));
  const PA2 = await withBoard(P.id, (tx) => resolveMembership(tx, { email: emailPA2, name: "Parent Two", board: P }));
  const ST = await withBoard(P.id, (tx) => resolveMembership(tx, { email: emailST, name: "Stu Dent", board: P }));
  const userTU = TU.user.id, userTU2 = TU2.user.id, userPA = PA.user.id, userPA2 = PA2.user.id, userST = ST.user.id;

  // link TU→ST and PA→ST (TU2 + PA2 deliberately UNLINKED).
  await withBoard(P.id, async (tx: Tx) => {
    await tx.insert(tutorStudent).values({ boardId: P.id, tutorId: userTU, studentId: userST });
    await tx.insert(parentChild).values({ boardId: P.id, parentId: userPA, studentId: userST });
  });

  // live mastery (with the log sentinel) + 1 answered attempt for metrics.
  await withBoard(P.id, async (tx: Tx) => {
    await tx.insert(masteryState).values({
      boardId: P.id, studentId: userST, subTopicId: fx.ST,
      conceptualLevel: 4, proceduralLevel: 3,
      description: "good grasp; tighten the units", log: LOG_SENTINEL,
    });
    const [q] = await tx.insert(question).values({
      boardId: P.id, subTopicId: fx.ST, axis: "conceptual", kind: "subjective",
      stem: "Q", referenceAnswer: "REF", ordinal: 1, source: "b2c_authoring",
    }).returning();
    const [ps] = await tx.insert(practiceSession).values({
      boardId: P.id, appUserId: userST, subTopicId: fx.ST, questionIds: [q!.id],
    }).returning();
    await tx.insert(attempt).values({
      boardId: P.id, practiceSessionId: ps!.id, questionId: q!.id, appUserId: userST,
      answerText: "an answer", confidence: 4, timeMs: 90000,
    });
  });

  // 2. ASSEMBLE → draft
  const draft = await withBoard(P.id, (tx) => assembleReport(tx, { boardId: P.id, tutorUserId: userTU, studentId: userST }));
  check("assemble → status 'draft'", draft.status === "draft");
  check("assemble → publishedAt null", draft.publishedAt === null);
  check("assemble → snapshot mastery card (4/3 + description)",
    draft.snapshot.mastery.length === 1 &&
    draft.snapshot.mastery[0]!.conceptualLevel === 4 &&
    draft.snapshot.mastery[0]!.proceduralLevel === 3 &&
    draft.snapshot.mastery[0]!.description.length > 0);
  check("assemble → snapshot metrics (1 answered)", draft.snapshot.metrics.questionsAnswered === 1);
  check("assemble → snapshot child identity frozen", draft.snapshot.child.studentId === userST);

  // 3. NO LOG LEAK
  check("snapshot has NO internal log (M11 projection boundary)",
    !JSON.stringify(draft.snapshot).includes(LOG_SENTINEL));

  // 4. published gate — parent CANNOT see the draft
  const paListBefore = await withBoard(P.id, (tx) => listReportsForParent(tx, { parentUserId: userPA, childId: userST }));
  check("published gate: parent list excludes the draft (empty)", paListBefore.length === 0);
  let draftHiddenFromParent = false;
  try {
    await withBoard(P.id, (tx) => getReportForParent(tx, { parentUserId: userPA, childId: userST, reportId: draft.id }));
  } catch (e) {
    draftHiddenFromParent = e instanceof ReportNotFoundError;
  }
  check("published gate: parent getReport(draft) → ReportNotFoundError", draftHiddenFromParent);

  // 5. tutor sees their own draft
  const tuList = await withBoard(P.id, (tx) => listReportsForTutor(tx, { tutorUserId: userTU, studentId: userST }));
  check("tutor list → 1 draft", tuList.length === 1 && tuList[0]!.id === draft.id && tuList[0]!.status === "draft");
  const tuGet = await withBoard(P.id, (tx) => getReportForTutor(tx, { tutorUserId: userTU, reportId: draft.id }));
  check("tutor getReport(draft) → detail w/ snapshot", tuGet.id === draft.id && tuGet.snapshot.mastery.length === 1);

  // 6. OWNERSHIP (tutor) — unlinked TU2 blocked
  let tu2Assemble = false;
  try {
    await withBoard(P.id, (tx) => assembleReport(tx, { boardId: P.id, tutorUserId: userTU2, studentId: userST }));
  } catch (e) {
    tu2Assemble = e instanceof StudentNotFoundError;
  }
  check("ownership(tutor): unlinked TU2 assemble → StudentNotFoundError", tu2Assemble);
  let tu2List = false;
  try {
    await withBoard(P.id, (tx) => listReportsForTutor(tx, { tutorUserId: userTU2, studentId: userST }));
  } catch (e) {
    tu2List = e instanceof StudentNotFoundError;
  }
  check("ownership(tutor): unlinked TU2 list → StudentNotFoundError", tu2List);

  // 10a. author-only publish — TU2 cannot publish TU's draft (NOT_FOUND, no leak)
  let tu2Publish = false;
  try {
    await withBoard(P.id, (tx) => publishReport(tx, { boardId: P.id, tutorUserId: userTU2, reportId: draft.id }));
  } catch (e) {
    tu2Publish = e instanceof ReportNotFoundError;
  }
  check("author-only: TU2 publish TU's draft → ReportNotFoundError", tu2Publish);

  // 7. PUBLISH (the SET side)
  const published = await withBoard(P.id, (tx) => publishReport(tx, {
    boardId: P.id, tutorUserId: userTU, reportId: draft.id, tutorNote: "Strong term — keep practising units.",
  }));
  check("publish → status 'published'", published.status === "published");
  check("publish → publishedAt set", published.publishedAt !== null);
  check("publish → tutorNote stored", published.tutorNote === "Strong term — keep practising units.");
  const [ev] = await withBoard(P.id, (tx) => tx
    .select({ id: eventLog.id, payload: eventLog.payload })
    .from(eventLog)
    .where(and(eq(eventLog.eventType, REPORT_PUBLISHED_EVENT), eq(eventLog.studentId, userST)))
    .limit(1));
  check("publish → report_published event_log row (payload.reportId)",
    !!ev && (ev.payload as any)?.reportId === draft.id);

  // 8. parent SEES it now
  const paList = await withBoard(P.id, (tx) => listReportsForParent(tx, { parentUserId: userPA, childId: userST }));
  check("parent list → 1 published report", paList.length === 1 && paList[0]!.id === draft.id);
  const paGet = await withBoard(P.id, (tx) => getReportForParent(tx, { parentUserId: userPA, childId: userST, reportId: draft.id }));
  check("parent getReport → detail w/ snapshot + tutorNote", paGet.snapshot.mastery.length === 1 && paGet.tutorNote !== null);
  check("parent getReport → NO log leak", !JSON.stringify(paGet).includes(LOG_SENTINEL));

  // 9. OWNERSHIP (parent) — unlinked PA2 blocked
  let pa2List = false;
  try {
    await withBoard(P.id, (tx) => listReportsForParent(tx, { parentUserId: userPA2, childId: userST }));
  } catch (e) {
    pa2List = e instanceof ChildNotFoundError;
  }
  check("ownership(parent): unlinked PA2 list → ChildNotFoundError", pa2List);
  let pa2Get = false;
  try {
    await withBoard(P.id, (tx) => getReportForParent(tx, { parentUserId: userPA2, childId: userST, reportId: draft.id }));
  } catch (e) {
    pa2Get = e instanceof ChildNotFoundError;
  }
  check("ownership(parent): unlinked PA2 getReport → ChildNotFoundError", pa2Get);

  // 10b. re-publish rejected
  let rePublish = false;
  try {
    await withBoard(P.id, (tx) => publishReport(tx, { boardId: P.id, tutorUserId: userTU, reportId: draft.id }));
  } catch (e) {
    rePublish = e instanceof ReportAlreadyPublishedError;
  }
  check("re-publish a published report → ReportAlreadyPublishedError", rePublish);

  // 11. FROZEN — bump the LIVE mastery; the published snapshot is unchanged
  await withBoard(P.id, (tx) => tx
    .update(masteryState)
    .set({ conceptualLevel: 1, proceduralLevel: 1, description: "CHANGED AFTER SIGN-OFF" })
    .where(and(eq(masteryState.studentId, userST), eq(masteryState.subTopicId, fx.ST))));
  const frozen = await withBoard(P.id, (tx) => getReportForParent(tx, { parentUserId: userPA, childId: userST, reportId: draft.id }));
  check("FROZEN: published snapshot still 4/3 after the live mastery changed to 1/1",
    frozen.snapshot.mastery[0]!.conceptualLevel === 4 && frozen.snapshot.mastery[0]!.proceduralLevel === 3);
  // and the LIVE surface would now show 1/1 (sanity — the change took)
  const [live] = await withBoard(P.id, (tx) => tx
    .select({ c: masteryState.conceptualLevel })
    .from(masteryState)
    .where(and(eq(masteryState.studentId, userST), eq(masteryState.subTopicId, fx.ST))).limit(1));
  check("FROZEN: the live mastery DID change (1/1) — proves the snapshot is a copy", live?.c === 1);

  // 12. RLS cross-board — under Q nothing is visible
  let crossTutorList = false;
  try {
    await withBoard(Q.id, (tx) => listReportsForTutor(tx, { tutorUserId: userTU, studentId: userST }));
  } catch (e) {
    crossTutorList = e instanceof StudentNotFoundError; // link invisible under Q
  }
  check("RLS: listReportsForTutor under board Q → StudentNotFoundError (link invisible)", crossTutorList);
  const crossCount = await withBoard(Q.id, (tx) => tx
    .select({ id: report.id }).from(report).where(eq(report.studentId, userST)));
  check("RLS: report rows invisible under board Q (count 0)", crossCount.length === 0);

  // 13. HTTP no-session → 401 (soft)
  try {
    const res = await fetch(`http://localhost:${env.PORT}/trpc/tutor.assembleReport?batch=1`, {
      method: "POST", headers: { "x-board": P.slug, "content-type": "application/json" },
      body: JSON.stringify({ 0: { studentId: userST } }),
    });
    check(`HTTP tutor.assembleReport (no session) → 401 (got ${res.status})`, res.status === 401);
  } catch {
    console.log("  ~ HTTP tutor.assembleReport skipped (server not running)");
  }
  try {
    const res = await fetch(`http://localhost:${env.PORT}/trpc/parent.listReports?input=${encodeURIComponent(JSON.stringify({ childId: userST }))}`, {
      headers: { "x-board": P.slug },
    });
    check(`HTTP parent.listReports (no session) → 401 (got ${res.status})`, res.status === 401);
  } catch {
    console.log("  ~ HTTP parent.listReports skipped (server not running)");
  }

  // ── cleanup (FK-safe order) ──
  await withBoard(P.id, async (tx: Tx) => {
    await tx.delete(eventLog).where(eq(eventLog.boardId, P.id));
    await tx.delete(report).where(eq(report.boardId, P.id));
    await tx.delete(attempt).where(eq(attempt.boardId, P.id));
    await tx.delete(practiceSession).where(eq(practiceSession.boardId, P.id));
    await tx.delete(question).where(eq(question.boardId, P.id));
    await tx.delete(masteryState).where(eq(masteryState.boardId, P.id));
    await tx.delete(parentChild).where(eq(parentChild.boardId, P.id));
    await tx.delete(tutorStudent).where(eq(tutorStudent.boardId, P.id));
    await tx.delete(subTopic).where(eq(subTopic.boardId, P.id));
    await tx.delete(topic).where(eq(topic.boardId, P.id));
    await tx.delete(chapter).where(eq(chapter.boardId, P.id));
    await tx.delete(subject).where(eq(subject.boardId, P.id));
    await tx.delete(membership).where(eq(membership.boardId, P.id));
    await tx.delete(whitelist).where(eq(whitelist.boardId, P.id));
  });
  for (const email of [emailTU, emailTU2, emailPA, emailPA2, emailST]) {
    await db.delete(appUser).where(eq(appUser.email, email));
  }
  await db.delete(board).where(eq(board.id, P.id));
  await db.delete(board).where(eq(board.id, Q.id));

  console.log(`\nprobe_report_signoff: ${passed} passed, ${failed} failed`);
  await queryClient.end();
  process.exit(failed === 0 ? 0 : 1);
}

main().catch(async (err) => {
  console.error("probe_report_signoff FAILED:", err);
  await queryClient.end();
  process.exit(1);
});
