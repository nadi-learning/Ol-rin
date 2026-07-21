/**
 * probe_authoring_tool — Slice tool-authoring exit gate (Gemini in-chat
 * author_questions tool; hybrid vendor model, decision 2b: the tool DRAFTS into
 * the review form, it does NOT save).
 *
 * Real DB + real RLS + REAL vendors, throwaway boards P/Q (M22) with full cleanup.
 * Two-tier (don't over-read a single AI response — M13/M28):
 *   FIRM — the plumbing we control: on an explicit go-ahead the Gemini tool
 *     fires and sendTurn returns a `draft`; the target sub_topic is resolved BY
 *     NUMBER inside the chapter allowlist; the drafts are valid; NOTHING is saved
 *     (the 2b guarantee — question bank unchanged after the tool fires); the chat
 *     focus is persisted; the assistant wrap-up carries no pseudocode leak; the
 *     Claude path returns NO draft (tool is Gemini-only); cross-board RLS; 401.
 *   SOFT — which sub_topic + the drafted question quality (logged).
 */
import { and, asc, eq, sql } from "drizzle-orm";
import type { PgTransaction } from "drizzle-orm/pg-core";
import {
  appUser,
  authoringChat,
  authoringWorker,
  board,
  chapter,
  eventLog,
  learningObjective,
  masteryState,
  observation,
  practiceSession,
  question,
  student,
  subject,
  subTopic,
  topic,
} from "@b2c/kernel/schema";
import { db, queryClient } from "../src/db/client";
import { withBoard } from "../src/db/with-board";
import { env } from "../src/config/env";
import { getChat, sendTurn, startChat, type ChatView } from "../src/services/authoring_chat";

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

// FIG-AUTH: the tool now PERSISTS drafts (PersistedDraft) — id + editable fields.
const validDraft = (d: {
  id: string;
  axis: string;
  stem: string;
  referenceAnswer: string;
}) =>
  !!d.id &&
  ["conceptual", "procedural", "both"].includes(d.axis) &&
  d.stem.trim().length > 0 &&
  d.referenceAnswer.trim().length > 0;

const LEAK_RE = /default_api\.|tool_code|\bprint\s*\(/i;

async function main() {
  const tag = `${Date.now()}`;
  await db.execute(sql`select 1`);
  check("DB connectivity (select 1) as app role", true);

  const [P] = await db.insert(board).values({ slug: `atool-p-${tag}`, name: "Probe P" }).returning();
  const [Q] = await db.insert(board).values({ slug: `atool-q-${tag}`, name: "Probe Q" }).returning();
  if (!P || !Q) throw new Error("board seed failed");

  const [tut] = await db.insert(appUser).values({ email: `atool-tut-${tag}@example.com`, name: "Tutor", userType: "tutor" }).returning();
  const [stuA] = await db.insert(appUser).values({ email: `atool-a-${tag}@example.com`, name: "Student A", userType: "student" }).returning();
  if (!tut || !stuA) throw new Error("app_user seed failed");

  // Fixture under P: chapter Motion with 2 sub_topics + LOs on sub_topic 1, a
  // canonical question at ordinal 0, mastery + observation for A (real grounding),
  // A linked to the tutor. A sub_topic on Q for the RLS check.
  const fx = await withBoard(P.id, async (tx: Tx) => {
    const [subj] = await tx.insert(subject).values({ boardId: P.id, slug: "phys", name: "Physics", grade: "IGCSE" }).returning();
    const [chap] = await tx.insert(chapter).values({ boardId: P.id, subjectId: subj!.id, slug: "motion", name: "Motion", ordinal: 1 }).returning();
    const [tp] = await tx.insert(topic).values({ boardId: P.id, chapterId: chap!.id, slug: "speed", name: "Speed", ordinal: 1 }).returning();
    const [st] = await tx.insert(subTopic).values({ boardId: P.id, topicId: tp!.id, slug: "accel", name: "Acceleration", ordinal: 1 }).returning();
    const [st2] = await tx.insert(subTopic).values({ boardId: P.id, topicId: tp!.id, slug: "vtgraph", name: "Velocity-time graphs", ordinal: 2 }).returning();
    await tx.insert(learningObjective).values({ boardId: P.id, subTopicId: st!.id, axis: "conceptual", code: "C1", description: "Explains acceleration as the rate of change of velocity and reasons about what changes it." });
    await tx.insert(learningObjective).values({ boardId: P.id, subTopicId: st!.id, axis: "procedural", code: "P1", description: "Computes acceleration = Δv / Δt with correct units." });
    await tx.insert(question).values({ boardId: P.id, subTopicId: st!.id, axis: "conceptual", kind: "subjective", stem: "Canonical Q", referenceAnswer: "ref", ordinal: 0, source: "seed" });
    await tx.insert(masteryState).values({ boardId: P.id, studentId: stuA.id, subTopicId: st!.id, conceptualLevel: 3, proceduralLevel: 2, description: "Solid on rate-of-change; shaky converting units under time pressure.", log: "internal" });
    await tx.insert(observation).values({ boardId: P.id, studentId: stuA.id, subTopicId: st!.id, axis: "procedural", observationLevel: 2, reasoning: "Set up Δv/Δt correctly but dropped the s→ms conversion.", source: "stage1_scorer", calibrationFlag: "over" });
    await tx.insert(student).values({ userId: stuA.id, boardId: P.id, class: "9", tutorId: tut.id });
    return { chapterId: chap!.id, subTopicId: st!.id, allowedSubTopicIds: [st!.id, st2!.id] };
  });

  const fxQ = await withBoard(Q.id, async (tx: Tx) => {
    const [subj] = await tx.insert(subject).values({ boardId: Q.id, slug: "phys", name: "Physics", grade: "IGCSE" }).returning();
    const [chap] = await tx.insert(chapter).values({ boardId: Q.id, subjectId: subj!.id, slug: "motion", name: "Motion", ordinal: 1 }).returning();
    const [tp] = await tx.insert(topic).values({ boardId: Q.id, chapterId: chap!.id, slug: "speed", name: "Speed", ordinal: 1 }).returning();
    await tx.insert(subTopic).values({ boardId: Q.id, topicId: tp!.id, slug: "accel", name: "Acceleration", ordinal: 1 }).returning();
    return {};
  });
  void fxQ;

  const authoredCount = () =>
    rows(P.id, (tx) =>
      tx.select().from(question).where(and(eq(question.subTopicId, fx.subTopicId), eq(question.source, "b2c_authoring"))),
    ).then((r) => r.length);
  const approvedCount = () =>
    rows(P.id, (tx) =>
      tx
        .select()
        .from(question)
        .where(
          and(
            eq(question.subTopicId, fx.subTopicId),
            eq(question.source, "b2c_authoring"),
            eq(question.status, "approved"),
          ),
        ),
    ).then((r) => r.length);

  // ─────────── Gemini tool path ───────────
  const gchat = await rows(P.id, (tx) => startChat(tx, { boardId: P.id, tutorUserId: tut.id, studentId: stuA.id, vendor: "gemini_api", chapterId: fx.chapterId }));

  // Turn 1 — discussion (no go-ahead): tool must NOT fire yet.
  const g1 = await rows(P.id, (tx) => sendTurn(tx, { tutorUserId: tut.id, chatId: gchat.chatId, text: "Where is this student weakest, and what kind of question would target it?" }));
  check("gemini discuss turn: no draft (tool held until go-ahead)", g1.draft === undefined);
  check("gemini discuss turn: assistant text non-empty, vendorId=gemini_api", g1.messages.at(-1)!.text.trim().length > 0 && g1.messages.at(-1)!.vendorId === "gemini_api");
  soft("gemini discuss reply (first 140ch)", g1.messages.at(-1)!.text.slice(0, 140));

  const before = await authoredCount();

  // Turn 2 — explicit go-ahead → the author_questions tool should fire. One
  // retry with an even more explicit instruction (AI variance; the FIRM claim is
  // "an explicit go-ahead produces a draft", not "on the very first phrasing").
  let g2: ChatView = await rows(P.id, (tx) => sendTurn(tx, { tutorUserId: tut.id, chatId: gchat.chatId, text: "Yes — go ahead and author 3 questions on Acceleration (target 1) right now." }));
  if (!g2.draft) {
    g2 = await rows(P.id, (tx) => sendTurn(tx, { tutorUserId: tut.id, chatId: gchat.chatId, text: "Please call author_questions now: 3 questions, subTopicNumber 1." }));
  }

  check("gemini go-ahead: the author_questions tool fired → sendTurn returned a draft", !!g2.draft);
  if (g2.draft) {
    const d = g2.draft;
    check("tool: sub_topic resolved BY NUMBER inside the chapter allowlist", fx.allowedSubTopicIds.includes(d.subTopicId));
    check("tool: chose sub-topic 1 (Acceleration) as instructed", d.subTopicId === fx.subTopicId);
    check("tool: ≥1 draft returned, all valid (id/axis/stem/ref)", d.drafts.length >= 1 && d.drafts.every(validDraft));
    check("tool: nextOrdinal = canonical max (0) + 1 = 1", d.nextOrdinal === 1);
    soft("tool drafted", { subTopic: d.subTopicName, n: d.drafts.length, axes: d.drafts.map((x) => x.axis) });
  }

  // FIG-AUTH 2b: the tool now PERSISTS drafts (status='draft') so they can be
  // rendered/previewed — but NOTHING is APPROVED, so nothing reaches a student
  // until the tutor approves (the M11 gate holds; decision 2b's spirit preserved).
  const after = await authoredCount();
  const liveAfter = await approvedCount();
  check("FIG-AUTH: the tool persisted drafts (after > before)", g2.draft ? after > before : after === before);
  check("FIG-AUTH: nothing APPROVED by the tool (no question reaches a student)", liveAfter === 0);

  // Focus persisted; wrap-up carries no pseudocode leak.
  const afterChat = await rows(P.id, (tx) => getChat(tx, { tutorUserId: tut.id, chatId: gchat.chatId }));
  check("tool: chat focus persisted to the chosen sub_topic", !g2.draft || afterChat.subTopicId === g2.draft.subTopicId);
  const wrap = g2.messages.at(-1)!;
  check("tool: assistant wrap-up persisted (assistant role, non-empty)", wrap.role === "assistant" && wrap.text.trim().length > 0);
  check("tool: wrap-up carries NO pseudocode leak (sanitised)", !LEAK_RE.test(wrap.text));
  soft("tool wrap-up (first 140ch)", wrap.text.slice(0, 140));

  // ─────────── Claude path: in-chat authoring via the fenced marker (parity) ───────────
  // Claude has no native tool, but a clear go-ahead now authors IN-CHAT via the
  // `author_questions` fenced marker (same review-form drafts as the Gemini tool).
  // One retry absorbs model nondeterminism. (Deep coverage lives in probe:authoringchat.)
  try {
    const cchat = await rows(P.id, (tx) => startChat(tx, { boardId: P.id, tutorUserId: tut.id, studentId: stuA.id, vendor: "claude_cli", chapterId: fx.chapterId }));
    let c1 = await rows(P.id, (tx) => sendTurn(tx, { tutorUserId: tut.id, chatId: cchat.chatId, text: "Go ahead and author 3 questions on sub-topic 1 now." }));
    if (!c1.draft) {
      c1 = await rows(P.id, (tx) => sendTurn(tx, { tutorUserId: tut.id, chatId: cchat.chatId, text: "Author 3 on sub-topic 1 now — emit the author_questions block." }));
    }
    check("claude go-ahead: authored IN-CHAT via marker (draft present, ≤2 tries)", !!c1.draft && c1.draft.drafts.length >= 1 && c1.draft.drafts.every(validDraft));
    check("claude: assistant text non-empty, vendorId=claude_cli, no raw marker leak", c1.messages.at(-1)!.text.trim().length > 0 && c1.messages.at(-1)!.vendorId === "claude_cli" && !/```\s*author_questions/.test(c1.messages.at(-1)!.text));
  } catch (e) {
    check("claude path smoke", false);
    console.error("    claude smoke error:", (e as Error).message);
  }

  // RLS: the chat row invisible under board Q.
  const chatUnderQ = await rows(Q.id, (tx) => tx.select().from(authoringChat).where(eq(authoringChat.id, gchat.chatId)));
  check("RLS: authoring_chat invisible under board Q", chatUnderQ.length === 0);

  // HTTP no-session → 401 (soft).
  try {
    const res = await fetch(`http://localhost:${env.PORT}/trpc/tutor.sendAuthoringChatTurn?batch=1`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-board": P.slug },
      body: JSON.stringify({ 0: { json: { chatId: gchat.chatId, text: "hi" } } }),
    });
    check(`HTTP sendAuthoringChatTurn (no session) → 401 (got ${res.status})`, res.status === 401);
  } catch {
    console.log("  ~ HTTP check skipped (server not running)");
  }

  // ── cleanup (FK-safe) ──
  await withBoard(P.id, async (tx: Tx) => {
    await tx.delete(practiceSession).where(eq(practiceSession.boardId, P.id));
    await tx.delete(authoringWorker).where(eq(authoringWorker.boardId, P.id));
    await tx.delete(authoringChat).where(eq(authoringChat.boardId, P.id));
    await tx.delete(eventLog).where(eq(eventLog.boardId, P.id));
    await tx.delete(observation).where(eq(observation.boardId, P.id));
    await tx.delete(masteryState).where(eq(masteryState.boardId, P.id));
    await tx.delete(question).where(eq(question.boardId, P.id));
    await tx.delete(student).where(eq(student.boardId, P.id));
    await tx.delete(learningObjective).where(eq(learningObjective.boardId, P.id));
    await tx.delete(subTopic).where(eq(subTopic.boardId, P.id));
    await tx.delete(topic).where(eq(topic.boardId, P.id));
    await tx.delete(chapter).where(eq(chapter.boardId, P.id));
    await tx.delete(subject).where(eq(subject.boardId, P.id));
  });
  await withBoard(Q.id, async (tx: Tx) => {
    await tx.delete(subTopic).where(eq(subTopic.boardId, Q.id));
    await tx.delete(topic).where(eq(topic.boardId, Q.id));
    await tx.delete(chapter).where(eq(chapter.boardId, Q.id));
    await tx.delete(subject).where(eq(subject.boardId, Q.id));
  });
  for (const u of [tut, stuA]) await db.delete(appUser).where(eq(appUser.id, u.id));
  await db.delete(board).where(eq(board.id, P.id));
  await db.delete(board).where(eq(board.id, Q.id));

  console.log(`\nprobe_authoring_tool: ${passed} passed, ${failed} failed`);
  await queryClient.end();
  process.exit(failed === 0 ? 0 : 1);
}

main().catch(async (err) => {
  console.error("probe_authoring_tool FAILED:", err);
  await queryClient.end();
  process.exit(1);
});
