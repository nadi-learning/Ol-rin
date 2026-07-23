/**
 * probe_authoring_worker — Slice QA3-e exit gate (the master→worker refactor).
 *
 * Real DB + real RLS + REAL vendors, throwaway boards P/Q (M22) with full cleanup.
 * Two-tier (don't over-read a single AI response — M13/M28):
 *   FIRM — the plumbing we control: the method pack loads with its frontmatter
 *     stripped and carries O1 (palette) + O2 (spiral); the resume fingerprint is
 *     deterministic and CHANGES when the pack changes (the D-QA3-8 resume guard);
 *     the authoring_worker row is RLS-isolated; authorFromChat persists drafts +
 *     logs a worker row; the worker BRIEF is SCOPED (raw topics.md + LOs + bank,
 *     NOT the master's broad grounding) and carries NO answer key; cross-board
 *     RLS; HTTP 401.
 *   SOFT — real Gemini authors ≥1 valid draft; real Claude captures a session id
 *     and a second same-scope spawn RESUMES it (logged).
 */
import { and, asc, eq, sql } from "drizzle-orm";
import type { PgTransaction } from "drizzle-orm/pg-core";
import {
  appUser,
  authoringChat,
  authoringWorker,
  board,
  chapter,
  learningObjective,
  question,
  student,
  subject,
  subTopic,
  topic,
} from "@b2c/kernel/schema";
import { db, queryClient } from "../src/db/client";
import { withBoard } from "../src/db/with-board";
import { env } from "../src/config/env";
import { computeSessionFingerprint } from "../src/services/ai_client";
import {
  claudeSystemFor,
  dialDocKeyFor,
  loadMethodPack,
  spawnAuthoringWorker,
} from "../src/services/authoring_worker";
import { authorFromChat, startChat } from "../src/services/authoring_chat";

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
function soft(name: string, value: unknown) {
  console.log(`  ~ [soft] ${name}: ${JSON.stringify(value)}`);
}
const rows = <T>(boardId: string, fn: (tx: Tx) => Promise<T>) => withBoard(boardId, fn);

// Distinctive markers seeded into the fixture so the probe can prove they reach
// the worker's scoped brief (topics.md + bank) — and that the key does NOT.
const TOPICSMD_MARKER = "ZZTOPICSMDZZ raw human-authored prose for this chapter.";
const BANK_STEM_MARKER = "ZZBANKSTEMZZ a canonical existing question stem.";
const BANK_KEY_MARKER = "ZZANSWERKEYZZ the secret reference answer.";

async function main() {
  const tag = `${Date.now()}`;
  await db.execute(sql`select 1`);
  check("DB connectivity (select 1) as app role", true);

  // ── FIRM 1: the method pack loads, frontmatter stripped, O1 + O2 present ──
  const pack = await loadMethodPack();
  check("pack: loads (non-empty)", pack.trim().length > 200);
  check("pack: YAML frontmatter stripped (no leading ---)", !pack.startsWith("---"));
  check(
    "pack: O1 palette present (Contrasting Cases + Misconception Confrontation MCQ)",
    pack.includes("Contrasting Cases") && pack.includes("Misconception Confrontation MCQ"),
  );
  check("pack: POE stays LOCKED (not authorable)", /POE[\s\S]*LOCKED/i.test(pack));
  check("pack: O2 spiral default present (conceptual leads slightly)", /spiral/i.test(pack) && /lead/i.test(pack));

  // ── FIRM 2: resume fingerprint is deterministic + pack-sensitive (D-QA3-8 guard) ──
  const fpArgs = (sys: string) => ({
    systemPrompt: sys,
    userMessage: "same brief",
    endpoint: "authoring.worker",
    slotId: "authoring.worker",
    model: "",
  });
  const fp1 = computeSessionFingerprint(fpArgs(claudeSystemFor(pack)));
  const fp2 = computeSessionFingerprint(fpArgs(claudeSystemFor(pack)));
  const fpChanged = computeSessionFingerprint(fpArgs(claudeSystemFor(pack + "\nEDIT")));
  check("fingerprint: deterministic for the same pack", fp1 === fp2);
  check("fingerprint: CHANGES when the pack changes (resume won't cross a pack edit)", fp1 !== fpChanged);

  // ── FIRM 1b: pack COMPOSITION (2026-07-23) — full palette doc + (board,subject)-selected dials ──
  check("pack: full palette doc appended (PALETTE section)", pack.includes("THE CONCEPTUAL-QUESTION-KINDS PALETTE"));
  check("pack: NO dial catalog without context", !pack.includes("===== THE DIFFICULTY-DIALS CATALOG"));
  check("dialDocKeyFor: cbse+maths → math-g10", dialDocKeyFor("cbse", "maths") === "math-g10");
  check("dialDocKeyFor: cbse+physics → science-g10", dialDocKeyFor("cbse", "physics") === "science-g10");
  check("dialDocKeyFor: cbse+chemistry → science-g10", dialDocKeyFor("cbse", "chemistry") === "science-g10");
  check("dialDocKeyFor: cambridge+physics → cambridge-physics", dialDocKeyFor("cambridge", "physics") === "cambridge-physics");
  check("dialDocKeyFor: custom-assessment → none", dialDocKeyFor("cbse", "custom-assessment") === null);
  check("dialDocKeyFor: null subject → none", dialDocKeyFor("cbse", null) === null);
  const mathsPack = await loadMethodPack({ boardSlug: "cbse", subjectSlug: "maths" });
  check(
    "pack(cbse,maths): maths dial catalog appended",
    mathsPack.includes("===== THE DIFFICULTY-DIALS CATALOG") && mathsPack.includes("How Maths Difficulty Works"),
  );
  const camPack = await loadMethodPack({ boardSlug: "cambridge", subjectSlug: "physics" });
  check(
    "pack(cambridge,physics): Cambridge dial catalog appended",
    camPack.includes("Cambridge IGCSE Physics — Difficulty Dials Catalog"),
  );
  check(
    "pack(cbse,physics): science (not Cambridge) catalog",
    (await loadMethodPack({ boardSlug: "cbse", subjectSlug: "physics" })).includes("How Science Difficulty Works"),
  );

  // ── seed ──
  const [P] = await db.insert(board).values({ slug: `awrk-p-${tag}`, name: "Probe P" }).returning();
  const [Q] = await db.insert(board).values({ slug: `awrk-q-${tag}`, name: "Probe Q" }).returning();
  if (!P || !Q) throw new Error("board seed failed");
  const [tut] = await db.insert(appUser).values({ email: `awrk-tut-${tag}@example.com`, name: "Tutor", userType: "tutor" }).returning();
  const [stu] = await db.insert(appUser).values({ email: `awrk-stu-${tag}@example.com`, name: "Student", userType: "student" }).returning();
  if (!tut || !stu) throw new Error("app_user seed failed");

  const fx = await withBoard(P.id, async (tx: Tx) => {
    const [subj] = await tx.insert(subject).values({ boardId: P.id, slug: "phys", name: "Physics", grade: "IGCSE" }).returning();
    // chapter.metadata.topicsMd = the raw blob the worker must read (D-QA3-5).
    const [chap] = await tx
      .insert(chapter)
      .values({ boardId: P.id, subjectId: subj!.id, slug: "motion", name: "Motion", ordinal: 1, metadata: { topicsMd: TOPICSMD_MARKER } })
      .returning();
    const [tp] = await tx.insert(topic).values({ boardId: P.id, chapterId: chap!.id, slug: "speed", name: "Speed", ordinal: 1 }).returning();
    const [st] = await tx.insert(subTopic).values({ boardId: P.id, topicId: tp!.id, slug: "accel", name: "Acceleration", ordinal: 1 }).returning();
    await tx.insert(learningObjective).values({ boardId: P.id, subTopicId: st!.id, axis: "conceptual", code: "C1", description: "Explains acceleration as the rate of change of velocity." });
    await tx.insert(learningObjective).values({ boardId: P.id, subTopicId: st!.id, axis: "procedural", code: "P1", description: "Computes acceleration = Δv / Δt with correct units." });
    // A canonical bank question — its STEM must reach the worker (D-QA3-9), its
    // reference answer must NOT (bank context feeds stems/tags only).
    await tx.insert(question).values({ boardId: P.id, subTopicId: st!.id, axis: "conceptual", kind: "subjective", stem: BANK_STEM_MARKER, referenceAnswer: BANK_KEY_MARKER, ordinal: 0, source: "seed" });
    await tx.insert(student).values({ userId: stu.id, boardId: P.id, class: "9", tutorId: tut.id });
    return { chapterId: chap!.id, subTopicId: st!.id };
  });

  // ── FIRM 3: authoring_worker RLS isolation (deterministic, no AI) ──
  const [rlsChat] = await withBoard(P.id, (tx) =>
    tx.insert(authoringChat).values({ boardId: P.id, tutorId: tut.id, studentId: stu.id, vendor: "gemini_api", chapterId: fx.chapterId, messages: [] }).returning({ id: authoringChat.id }),
  );
  const [rlsWorker] = await withBoard(P.id, (tx) =>
    tx.insert(authoringWorker).values({ boardId: P.id, chatId: rlsChat!.id, subTopicId: fx.subTopicId, vendor: "gemini_api", brief: "rls-probe" }).returning({ id: authoringWorker.id }),
  );
  const rlsUnderQ = await rows(Q.id, (tx) => tx.select().from(authoringWorker).where(eq(authoringWorker.id, rlsWorker!.id)));
  const rlsUnderP = await rows(P.id, (tx) => tx.select().from(authoringWorker).where(eq(authoringWorker.id, rlsWorker!.id)));
  check("RLS: authoring_worker invisible under a foreign board (Q)", rlsUnderQ.length === 0);
  check("RLS: authoring_worker visible under its own board (P)", rlsUnderP.length === 1);

  const geminiConfigured = !!env.GEMINI_API_KEY;
  if (!geminiConfigured) {
    console.log("  ~ real-Gemini legs SKIPPED (GEMINI_API_KEY unset)");
  }

  // ── SOFT (real Gemini): full path authorFromChat → worker spawn → persist ──
  if (geminiConfigured) {
    const chat = await rows(P.id, (tx) => startChat(tx, { boardId: P.id, tutorUserId: tut.id, studentId: stu.id, vendor: "gemini_api", chapterId: fx.chapterId }));
    const res = await rows(P.id, (tx) => authorFromChat(tx, { tutorUserId: tut.id, chatId: chat.chatId, subTopicId: fx.subTopicId, count: 2 }));
    check("gemini authorFromChat: ≥1 draft returned + valid", res.drafts.length >= 1 && res.drafts.every((d) => !!d.id && d.stem.trim().length > 0 && d.referenceAnswer.trim().length > 0));
    soft("gemini drafted", { n: res.drafts.length, axes: res.drafts.map((d) => d.axis) });

    // drafts persisted as status='draft', private to the student.
    const drafts = await rows(P.id, (tx) =>
      tx.select().from(question).where(and(eq(question.subTopicId, fx.subTopicId), eq(question.source, "b2c_authoring"), eq(question.status, "draft"))),
    );
    check("gemini: drafts persisted as status='draft'", drafts.length === res.drafts.length);
    check("gemini: drafts private to the student (target_student_id set)", drafts.every((d) => d.targetStudentId === stu.id));
    check("gemini: NONE approved (no question reaches a student)", drafts.every((d) => d.status === "draft"));

    // a worker row was logged (D-QA3-8).
    const [wrow] = await rows(P.id, (tx) =>
      tx.select().from(authoringWorker).where(and(eq(authoringWorker.chatId, chat.chatId), eq(authoringWorker.subTopicId, fx.subTopicId))).orderBy(authoringWorker.createdAt),
    );
    check("D-QA3-8: an authoring_worker row was logged", !!wrow);
    if (wrow) {
      check("worker row: vendor=gemini_api, aiSessionId null (stateless)", wrow.vendor === "gemini_api" && wrow.aiSessionId === null);
      check("worker row: output.count == drafts authored", (wrow.output as { count?: number } | null)?.count === res.drafts.length);
      const brief = wrow.brief;
      // SCOPED slice: raw topics.md + LOs + bank stem — NOT the master's broad grounding.
      check("brief SCOPED: carries the raw topics.md blob (D-QA3-5)", brief.includes(TOPICSMD_MARKER));
      check("brief SCOPED: carries the sub_topic + LEARNING OBJECTIVES", brief.includes("Acceleration") && brief.includes("LEARNING OBJECTIVES"));
      check("brief SCOPED: carries the existing bank stem (D-QA3-9)", brief.includes(BANK_STEM_MARKER));
      check("brief SCOPED: NOT the master's broad grounding (no STUDENT GROUNDING block)", !brief.includes("STUDENT GROUNDING"));
      check("brief: NO answer key leak (bank reference answer absent)", !brief.includes(BANK_KEY_MARKER));
    }
  }

  // ── SOFT (real Claude): session capture + D-QA3-8 resume ──
  try {
    // A bare chat row to hang worker rows on (spawnAuthoringWorker doesn't read it).
    const [cchat] = await withBoard(P.id, (tx) =>
      tx.insert(authoringChat).values({ boardId: P.id, tutorId: tut.id, studentId: stu.id, vendor: "claude_cli", chapterId: fx.chapterId, messages: [] }).returning({ id: authoringChat.id }),
    );
    const w1 = await rows(P.id, (tx) => spawnAuthoringWorker(tx, { boardId: P.id, chatId: cchat!.id, subTopicId: fx.subTopicId, vendor: "claude_cli", count: 1, brief: "Author one conceptual question on acceleration." }));
    check("claude: worker captured a session id (D-QA3-8)", !!w1.aiSessionId);
    check("claude: first spawn did NOT resume", w1.resumed === false);
    const [w1row] = await rows(P.id, (tx) =>
      tx.select().from(authoringWorker).where(eq(authoringWorker.id, w1.workerId)),
    );
    check("claude: worker row stored the session id + fingerprint", !!w1row?.aiSessionId && !!w1row?.sessionFingerprint);

    const w2 = await rows(P.id, (tx) => spawnAuthoringWorker(tx, { boardId: P.id, chatId: cchat!.id, subTopicId: fx.subTopicId, vendor: "claude_cli", count: 1, brief: "Author one more, harder." }));
    check("claude: second same-scope spawn RESUMED the prior session (D-QA3-8)", w2.resumed === true);
    soft("claude session ids", { first: w1.aiSessionId?.slice(0, 8), second: w2.aiSessionId?.slice(0, 8) });
  } catch (e) {
    console.log(`  ~ real-Claude leg skipped/failed: ${(e as Error).message.slice(0, 160)}`);
  }

  // ── HTTP: authorFromChat with no session → 401 ──
  try {
    const res = await fetch(`http://localhost:${env.PORT}/trpc/tutor.authorFromChat?batch=1`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-board": P.slug },
      body: JSON.stringify({ 0: { json: { chatId: "00000000-0000-0000-0000-000000000000", subTopicId: fx.subTopicId, count: 1 } } }),
    });
    check(`HTTP authorFromChat (no session) → 401 (got ${res.status})`, res.status === 401);
  } catch {
    console.log("  ~ HTTP check skipped (server not running)");
  }

  // ── cleanup (FK-safe: worker → chat → question → spine) ──
  await withBoard(P.id, async (tx: Tx) => {
    await tx.delete(authoringWorker).where(eq(authoringWorker.boardId, P.id));
    await tx.delete(authoringChat).where(eq(authoringChat.boardId, P.id));
    await tx.delete(question).where(eq(question.boardId, P.id));
    await tx.delete(student).where(eq(student.boardId, P.id));
    await tx.delete(learningObjective).where(eq(learningObjective.boardId, P.id));
    await tx.delete(subTopic).where(eq(subTopic.boardId, P.id));
    await tx.delete(topic).where(eq(topic.boardId, P.id));
    await tx.delete(chapter).where(eq(chapter.boardId, P.id));
    await tx.delete(subject).where(eq(subject.boardId, P.id));
  });
  for (const u of [tut, stu]) await db.delete(appUser).where(eq(appUser.id, u.id));
  await db.delete(board).where(eq(board.id, P.id));
  await db.delete(board).where(eq(board.id, Q.id));

  console.log(`\nprobe_authoring_worker: ${passed} passed, ${failed} failed`);
  await queryClient.end();
  process.exit(failed === 0 ? 0 : 1);
}

main().catch(async (err) => {
  console.error("probe_authoring_worker FAILED:", err);
  await queryClient.end();
  process.exit(1);
});
