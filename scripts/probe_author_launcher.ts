/**
 * probe_author_launcher — Slice QA3-d exit gate (the mode + multi-chapter author
 * LAUNCHER). Real DB + real RLS, throwaway boards P/Q (M22) with full cleanup.
 *
 * DETERMINISTIC — no vendor call. QA3-d's load-bearing surface is pure DB:
 *   - startChat persists mode + chapter_ids (blocked = 1, interleaved = N; blocked
 *     mirrors the one into chapter_ids AND keeps chapter_id set; interleaved has
 *     chapter_id null).
 *   - board-visibility validation: a cross-board / bogus chapter id → rejected.
 *   - interleaved with zero chapters → rejected.
 *   - assembleGrounding coverage spans ALL of the chat's chapters, chapter-ordinal
 *     ordered, with a chapter-name prefix only when >1 chapter (the same generalized
 *     query the Gemini targets-block + proposeTarget allowlist use).
 *   - getChat reads mode + chapterIds back; legacy (mode/chapter_ids null) rows read
 *     as single-chapter blocked (back-compat).
 *   - HTTP 401 (soft).
 *
 * The vendor round-trip (chat → propose → author across the interleaved set) stays
 * covered by probe:authoringchat / probe:authoringtool — v0 interleaved is
 * grounding-only (confirmed flag), so there's no new AI behaviour to prove here.
 */
import { eq, sql } from "drizzle-orm";
import type { PgTransaction } from "drizzle-orm/pg-core";
import {
  appUser,
  authoringChat,
  board,
  chapter,
  learningObjective,
  masteryState,
  observation,
  question,
  subject,
  subTopic,
  topic,
  tutorStudent,
} from "@b2c/kernel/schema";
import { db, queryClient } from "../src/db/client";
import { withBoard } from "../src/db/with-board";
import { env } from "../src/config/env";
import {
  assembleGrounding,
  ChapterNotInBoardError,
  getChat,
  startChat,
} from "../src/services/authoring_chat";
import { StudentNotFoundError } from "../src/services/tutor";

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
const rows = <T>(boardId: string, fn: (tx: Tx) => Promise<T>) => withBoard(boardId, fn);

async function main() {
  const tag = `${Date.now()}`;
  await db.execute(sql`select 1`);
  check("DB connectivity (select 1) as app role", true);

  const [P] = await db.insert(board).values({ slug: `alaunch-p-${tag}`, name: "Probe P" }).returning();
  const [Q] = await db.insert(board).values({ slug: `alaunch-q-${tag}`, name: "Probe Q" }).returning();
  if (!P || !Q) throw new Error("board seed failed");

  const [tut] = await db.insert(appUser).values({ email: `alaunch-tut-${tag}@example.com`, name: "Tutor" }).returning();
  const [stuA] = await db.insert(appUser).values({ email: `alaunch-a-${tag}@example.com`, name: "Student A" }).returning();
  const [stuU] = await db.insert(appUser).values({ email: `alaunch-u-${tag}@example.com`, name: "Student U (unlinked)" }).returning();
  if (!tut || !stuA || !stuU) throw new Error("app_user seed failed");

  // Fixture under P: TWO chapters (Motion ord 1, Energy ord 2), each with a
  // sub-topic + a canonical question, so interleaved grounding has content from
  // both. Tutor linked to A only. mastery/observation on A for real grounding.
  const fx = await withBoard(P.id, async (tx: Tx) => {
    const [subj] = await tx.insert(subject).values({ boardId: P.id, slug: "phys", name: "Physics", grade: "IGCSE" }).returning();
    // chapter A — Motion (ordinal 1), two sub-topics
    const [chA] = await tx.insert(chapter).values({ boardId: P.id, subjectId: subj!.id, slug: "motion", name: "Motion", ordinal: 1 }).returning();
    const [tpA] = await tx.insert(topic).values({ boardId: P.id, chapterId: chA!.id, slug: "speed", name: "Speed", ordinal: 1 }).returning();
    const [subA1] = await tx.insert(subTopic).values({ boardId: P.id, topicId: tpA!.id, slug: "accel", name: "Acceleration", ordinal: 1 }).returning();
    const [subA2] = await tx.insert(subTopic).values({ boardId: P.id, topicId: tpA!.id, slug: "vtgraph", name: "Velocity-time graphs", ordinal: 2 }).returning();
    // chapter B — Energy (ordinal 2), one sub-topic
    const [chB] = await tx.insert(chapter).values({ boardId: P.id, subjectId: subj!.id, slug: "energy", name: "Energy", ordinal: 2 }).returning();
    const [tpB] = await tx.insert(topic).values({ boardId: P.id, chapterId: chB!.id, slug: "ke", name: "Kinetic energy", ordinal: 1 }).returning();
    const [subB1] = await tx.insert(subTopic).values({ boardId: P.id, topicId: tpB!.id, slug: "ke-calc", name: "Computing KE", ordinal: 1 }).returning();
    await tx.insert(learningObjective).values({ boardId: P.id, subTopicId: subA1!.id, axis: "conceptual", code: "C1", description: "Explains acceleration as rate of change of velocity." });
    await tx.insert(tutorStudent).values({ boardId: P.id, tutorId: tut.id, studentId: stuA.id });
    await tx.insert(question).values({ boardId: P.id, subTopicId: subA1!.id, axis: "conceptual", kind: "subjective", stem: "Canonical A", referenceAnswer: "ref", ordinal: 0, source: "seed" });
    await tx.insert(question).values({ boardId: P.id, subTopicId: subB1!.id, axis: "procedural", kind: "subjective", stem: "Canonical B", referenceAnswer: "ref", ordinal: 0, source: "seed" });
    await tx.insert(masteryState).values({ boardId: P.id, studentId: stuA.id, subTopicId: subA1!.id, conceptualLevel: 3, proceduralLevel: 2, description: "Solid on the idea; shaky on units.", log: "internal" });
    await tx.insert(observation).values({ boardId: P.id, studentId: stuA.id, subTopicId: subA1!.id, axis: "procedural", observationLevel: 2, reasoning: "Dropped a unit conversion.", source: "stage1_scorer" });
    return { chAId: chA!.id, chBId: chB!.id, subA1: subA1!.id, subA2: subA2!.id, subB1: subB1!.id };
  });

  // Cross-board chapter under Q (invisible to P's RLS → the reject target).
  const fxQ = await withBoard(Q.id, async (tx: Tx) => {
    const [subj] = await tx.insert(subject).values({ boardId: Q.id, slug: "phys", name: "Physics", grade: "IGCSE" }).returning();
    const [ch] = await tx.insert(chapter).values({ boardId: Q.id, subjectId: subj!.id, slug: "waves", name: "Waves", ordinal: 1 }).returning();
    return { chQId: ch!.id };
  });

  // 1. ownership — unlinked student → STUDENT_NOT_FOUND.
  let ownNf = false;
  try {
    await rows(P.id, (tx) => startChat(tx, { boardId: P.id, tutorUserId: tut.id, studentId: stuU.id, vendor: "gemini_api", mode: "blocked", chapterIds: [fx.chAId] }));
  } catch (e) {
    ownNf = e instanceof StudentNotFoundError;
  }
  check("startChat: unlinked student → STUDENT_NOT_FOUND (ownership)", ownNf);

  // 2. BLOCKED via explicit mode + chapterIds:[one].
  const blocked = await rows(P.id, (tx) => startChat(tx, { boardId: P.id, tutorUserId: tut.id, studentId: stuA.id, vendor: "gemini_api", mode: "blocked", chapterIds: [fx.chAId] }));
  check("blocked: mode='blocked'", blocked.mode === "blocked");
  check("blocked: chapterId set to the one chapter", blocked.chapterId === fx.chAId);
  check("blocked: chapterIds = [that one]", blocked.chapterIds.length === 1 && blocked.chapterIds[0] === fx.chAId);

  // 2b. BLOCKED via the FAST path (chapterId only, mode omitted → defaults blocked).
  const fast = await rows(P.id, (tx) => startChat(tx, { boardId: P.id, tutorUserId: tut.id, studentId: stuA.id, vendor: "claude_cli", chapterId: fx.chAId }));
  check("fast path (chapterId only): mode defaults 'blocked', chapterIds mirrors", fast.mode === "blocked" && fast.chapterId === fx.chAId && fast.chapterIds.length === 1 && fast.chapterIds[0] === fx.chAId);

  // 3. INTERLEAVED — [chA, chB], order preserved, chapter_id null.
  const inter = await rows(P.id, (tx) => startChat(tx, { boardId: P.id, tutorUserId: tut.id, studentId: stuA.id, vendor: "gemini_api", mode: "interleaved", chapterIds: [fx.chAId, fx.chBId] }));
  check("interleaved: mode='interleaved'", inter.mode === "interleaved");
  check("interleaved: chapterId null (no single anchor)", inter.chapterId === null);
  check("interleaved: chapterIds = [chA, chB] in order", inter.chapterIds.length === 2 && inter.chapterIds[0] === fx.chAId && inter.chapterIds[1] === fx.chBId);

  // 3b. persisted DB shape (assert the columns actually landed, not just the return).
  const stored = await rows(P.id, async (tx) => {
    const [r] = await tx.select().from(authoringChat).where(eq(authoringChat.id, inter.chatId)).limit(1);
    return r;
  });
  const storedIds = Array.isArray(stored?.chapterIds) ? (stored!.chapterIds as string[]) : [];
  check("interleaved persisted: mode + chapter_ids jsonb in the DB row", stored?.mode === "interleaved" && stored?.chapterId === null && storedIds.length === 2 && storedIds[0] === fx.chAId);

  // 4. interleaved with ZERO chapters → rejected.
  let emptyRej = false;
  try {
    await rows(P.id, (tx) => startChat(tx, { boardId: P.id, tutorUserId: tut.id, studentId: stuA.id, vendor: "gemini_api", mode: "interleaved", chapterIds: [] }));
  } catch {
    emptyRej = true;
  }
  check("interleaved with 0 chapters → rejected", emptyRej);

  // 5. cross-board chapter (from Q) → ChapterNotInBoardError (both modes).
  let crossInter = false;
  try {
    await rows(P.id, (tx) => startChat(tx, { boardId: P.id, tutorUserId: tut.id, studentId: stuA.id, vendor: "gemini_api", mode: "interleaved", chapterIds: [fx.chAId, fxQ.chQId] }));
  } catch (e) {
    crossInter = e instanceof ChapterNotInBoardError;
  }
  check("interleaved with a cross-board chapter → CHAPTER_NOT_IN_BOARD", crossInter);

  let crossBlocked = false;
  try {
    await rows(P.id, (tx) => startChat(tx, { boardId: P.id, tutorUserId: tut.id, studentId: stuA.id, vendor: "gemini_api", mode: "blocked", chapterIds: [fxQ.chQId] }));
  } catch (e) {
    crossBlocked = e instanceof ChapterNotInBoardError;
  }
  check("blocked with a cross-board chapter → CHAPTER_NOT_IN_BOARD", crossBlocked);

  // 6. grounding — SINGLE chapter (blocked): covers chA's sub-topics only, no prefix.
  const gBlocked = await rows(P.id, (tx) => assembleGrounding(tx, { tutorUserId: tut.id, studentId: stuA.id, chapterIds: [fx.chAId] }));
  check("grounding blocked: contains chA sub-topics", gBlocked.includes("Acceleration") && gBlocked.includes("Velocity-time graphs"));
  check("grounding blocked: excludes chB sub-topic", !gBlocked.includes("Computing KE"));
  // "Velocity-time graphs" appears ONLY in the coverage section (no mastery/obs for
  // it) → a clean probe of the coverage-line prefix: topic-first, no chapter name.
  check("grounding blocked: coverage line has no chapter prefix (single chapter)", gBlocked.includes("Speed › Velocity-time graphs") && !gBlocked.includes("Motion › Speed › Velocity-time graphs"));

  // 7. grounding — INTERLEAVED [chA, chB]: covers BOTH chapters, chapter-name prefix,
  //    chapter-ordinal ordered (Motion before Energy).
  const gInter = await rows(P.id, (tx) => assembleGrounding(tx, { tutorUserId: tut.id, studentId: stuA.id, chapterIds: [fx.chAId, fx.chBId] }));
  check("grounding interleaved: spans BOTH chapters' sub-topics", gInter.includes("Acceleration") && gInter.includes("Computing KE"));
  check("grounding interleaved: chapter-name prefix present", gInter.includes("Motion › Speed › Acceleration") && gInter.includes("Energy › Kinetic energy › Computing KE"));
  check("grounding interleaved: chapter-ordinal ordered (Motion before Energy)", gInter.indexOf("Motion › Speed") < gInter.indexOf("Energy › Kinetic energy"));

  // 8. getChat reads mode + chapterIds back.
  const readInter = await rows(P.id, (tx) => getChat(tx, { tutorUserId: tut.id, chatId: inter.chatId }));
  check("getChat: interleaved reads back mode + chapterIds", readInter.mode === "interleaved" && readInter.chapterIds.length === 2);

  // 9. legacy back-compat — a raw row with mode/chapter_ids NULL reads as blocked
  //    with chapterIds=[chapter_id].
  const legacyId = await rows(P.id, async (tx) => {
    const [r] = await tx
      .insert(authoringChat)
      .values({ boardId: P.id, tutorId: tut.id, studentId: stuA.id, chapterId: fx.chAId, vendor: "claude_cli", messages: [] })
      .returning();
    return r!.id;
  });
  const readLegacy = await rows(P.id, (tx) => getChat(tx, { tutorUserId: tut.id, chatId: legacyId }));
  check("legacy row (mode/chapter_ids null): reads as blocked, chapterIds=[chapter_id]", readLegacy.mode === "blocked" && readLegacy.chapterIds.length === 1 && readLegacy.chapterIds[0] === fx.chAId);

  // 10. HTTP no-session → 401 (soft).
  try {
    const res = await fetch(`http://localhost:${env.PORT}/trpc/tutor.startAuthoringChat?batch=1`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-board": P.slug },
      body: JSON.stringify({ 0: { json: { studentId: stuA.id, vendor: "gemini_api", mode: "interleaved", chapterIds: [fx.chAId, fx.chBId] } } }),
    });
    check(`HTTP startAuthoringChat (no session) → 401 (got ${res.status})`, res.status === 401);
  } catch {
    console.log("  ~ HTTP startAuthoringChat skipped (server not running)");
  }

  // ── cleanup (FK-safe) ──
  await withBoard(P.id, async (tx: Tx) => {
    await tx.delete(authoringChat).where(eq(authoringChat.boardId, P.id));
    await tx.delete(observation).where(eq(observation.boardId, P.id));
    await tx.delete(masteryState).where(eq(masteryState.boardId, P.id));
    await tx.delete(question).where(eq(question.boardId, P.id));
    await tx.delete(tutorStudent).where(eq(tutorStudent.boardId, P.id));
    await tx.delete(learningObjective).where(eq(learningObjective.boardId, P.id));
    await tx.delete(subTopic).where(eq(subTopic.boardId, P.id));
    await tx.delete(topic).where(eq(topic.boardId, P.id));
    await tx.delete(chapter).where(eq(chapter.boardId, P.id));
    await tx.delete(subject).where(eq(subject.boardId, P.id));
  });
  await withBoard(Q.id, async (tx: Tx) => {
    await tx.delete(chapter).where(eq(chapter.boardId, Q.id));
    await tx.delete(subject).where(eq(subject.boardId, Q.id));
  });
  for (const u of [tut, stuA, stuU]) await db.delete(appUser).where(eq(appUser.id, u.id));
  await db.delete(board).where(eq(board.id, P.id));
  await db.delete(board).where(eq(board.id, Q.id));

  console.log(`\nprobe_author_launcher: ${passed} passed, ${failed} failed`);
  await queryClient.end();
  process.exit(failed === 0 ? 0 : 1);
}

main().catch(async (err) => {
  console.error("probe_author_launcher FAILED:", err);
  await queryClient.end();
  process.exit(1);
});
