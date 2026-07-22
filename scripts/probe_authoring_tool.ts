/**
 * probe_authoring_tool — Slice AUTH-fix B+A exit gate (Gemini in-chat authoring
 * via the [[AUTHOR_NOW]] sentinel + a responseSchema author-intent resolver,
 * REPLACING the native author_questions function-call that 400'd on malformed
 * function-call JSON; hybrid vendor model, decision 2b: authoring DRAFTS into the
 * review form, it does NOT save).
 *
 * Real DB + real RLS + REAL vendors, throwaway boards P/Q (M22) with full cleanup.
 * Two-tier (don't over-read a single AI response — M13/M28):
 *   FIRM — the plumbing we control: on an explicit go-ahead the model emits the
 *     [[AUTHOR_NOW]] sentinel, the resolver picks the target, and sendTurn ENQUEUES
 *     a draft JOB (Slice AUTHOR-ASYNC — the worker drafts off the request path),
 *     returning its id as `draftJobId`; the resume handle finds that job; the
 *     target sub_topic is pinned BY NUMBER inside the chapter allowlist; the WORKER
 *     draft path (authorFromChat, driven directly here) produces valid drafts and
 *     APPROVES nothing (the 2b guarantee); the chat focus is persisted; the
 *     assistant wrap-up leaks neither pseudocode NOR the raw sentinel; the Claude
 *     path enqueues via its own fenced marker; cross-board RLS; 401.
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
import {
  authorFromChat,
  getChat,
  sendTurn,
  startChat,
  type ChatView,
} from "../src/services/authoring_chat";
import { authoringQueue, getActiveAuthoringJobId } from "../src/worker/queue";
import { redisConnection } from "../src/redis/connection";

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

  // ─────────── Gemini sentinel + resolver path (Slice AUTH-fix B) ───────────
  const gchat = await rows(P.id, (tx) => startChat(tx, { boardId: P.id, tutorUserId: tut.id, studentId: stuA.id, vendor: "gemini_api", chapterId: fx.chapterId }));

  // Turn 1 — discussion (no go-ahead): must NOT author yet (no sentinel → no job).
  const g1 = await rows(P.id, (tx) => sendTurn(tx, { tutorUserId: tut.id, chatId: gchat.chatId, text: "Where is this student weakest, and what kind of question would target it?" }));
  check("gemini discuss turn: no draft job (author held until go-ahead)", g1.draftJobId === undefined);
  check("gemini discuss turn: assistant text non-empty, vendorId=gemini_api", g1.messages.at(-1)!.text.trim().length > 0 && g1.messages.at(-1)!.vendorId === "gemini_api");
  check("gemini discuss turn: no raw [[AUTHOR_NOW]] sentinel leak in shown text", !/\[\[\s*AUTHOR_NOW/i.test(g1.messages.at(-1)!.text));
  soft("gemini discuss reply (first 140ch)", g1.messages.at(-1)!.text.slice(0, 140));

  const before = await authoredCount();

  // Turn 2 — explicit go-ahead → the model emits [[AUTHOR_NOW]] → the resolver
  // picks the target → sendTurn ENQUEUES a draft JOB (Slice AUTHOR-ASYNC — the
  // worker runs off the request path) and returns its id as `draftJobId`. One
  // retry with a more explicit instruction (AI variance; the FIRM claim is "an
  // explicit go-ahead enqueues a draft", not "on the very first phrasing").
  let g2: ChatView = await rows(P.id, (tx) => sendTurn(tx, { tutorUserId: tut.id, chatId: gchat.chatId, text: "Yes — go ahead and author 3 questions on Acceleration (target 1) right now." }));
  if (!g2.draftJobId) {
    g2 = await rows(P.id, (tx) => sendTurn(tx, { tutorUserId: tut.id, chatId: gchat.chatId, text: "Go ahead now — author 3 questions on Acceleration (target 1). This is the go-ahead." }));
  }

  check("gemini go-ahead: sentinel fired + resolver → sendTurn ENQUEUED a draft job (async)", !!g2.draftJobId);
  // The resume handle finds the just-enqueued job for this chat (the FE's durable
  // "Drafting…" loader restore path). Keyed by (board, chat).
  const activeJob = await getActiveAuthoringJobId(P.id, gchat.chatId);
  check("author: getActiveAuthoringJobId finds the enqueued job for this chat", !!g2.draftJobId && activeJob === g2.draftJobId);

  // Focus pinned on the request path (resolveTargetAndEnqueue) → the chat now
  // points at the resolved target, resolved BY NUMBER inside the chapter allowlist.
  const afterChat = await rows(P.id, (tx) => getChat(tx, { tutorUserId: tut.id, chatId: gchat.chatId }));
  check("author: chat focus pinned to a sub_topic inside the chapter allowlist", !!afterChat.subTopicId && fx.allowedSubTopicIds.includes(afterChat.subTopicId));
  check("author: chose sub-topic 1 (Acceleration) as instructed", afterChat.subTopicId === fx.subTopicId);

  // Wrap-up carries no pseudocode leak AND no raw sentinel leak (persisted turn).
  const wrap = g2.messages.at(-1)!;
  check("author: assistant wrap-up persisted (assistant role, non-empty)", wrap.role === "assistant" && wrap.text.trim().length > 0);
  check("author: wrap-up carries NO pseudocode leak (sanitised)", !LEAK_RE.test(wrap.text));
  check("author: wrap-up carries NO raw [[AUTHOR_NOW]] sentinel (stripped)", !/\[\[\s*AUTHOR_NOW/i.test(wrap.text));
  soft("gemini wrap-up (first 140ch)", wrap.text.slice(0, 140));

  // ── The WORKER draft path (what the authoring processor runs off the queue) ──
  // No worker runs in this probe, so drive authorFromChat directly (same call the
  // processor makes) on the pinned target to prove the per-question Gemini draft
  // still produces valid drafts, PERSISTS them (status='draft'), and APPROVES
  // nothing — the M11 gate holds (decision 2b). This is the real-Gemini draft E2E.
  if (afterChat.subTopicId) {
    const worked = await rows(P.id, (tx) => authorFromChat(tx, { tutorUserId: tut.id, chatId: gchat.chatId, subTopicId: afterChat.subTopicId!, count: 3 }));
    check("worker draft: ≥1 draft returned, all valid (id/axis/stem/ref)", worked.drafts.length >= 1 && worked.drafts.every(validDraft));
    check("worker draft: nextOrdinal = canonical max (0) + 1 = 1", worked.nextOrdinal === 1);
    soft("gemini drafted (per-question)", { subTopic: worked.subTopicName, n: worked.drafts.length, axes: worked.drafts.map((x) => x.axis) });
  }

  // FIG-AUTH 2b: authoring PERSISTS drafts (status='draft') so they can be
  // rendered/previewed — but NOTHING is APPROVED, so nothing reaches a student
  // until the tutor approves (the M11 gate holds; decision 2b's spirit preserved).
  const after = await authoredCount();
  const liveAfter = await approvedCount();
  check("FIG-AUTH: authoring persisted drafts (after > before)", afterChat.subTopicId ? after > before : after === before);
  check("FIG-AUTH: nothing APPROVED (no question reaches a student)", liveAfter === 0);

  // ─────────── Claude path: in-chat authoring via the fenced marker (parity) ───────────
  // Claude has no native tool, but a clear go-ahead authors via the
  // `author_questions` fenced marker → sendTurn ENQUEUES the same draft job (Slice
  // AUTHOR-ASYNC). One retry absorbs model nondeterminism. (The real Claude draft
  // path is covered by probe:authoringchat's direct authorFromChat call.)
  try {
    const cchat = await rows(P.id, (tx) => startChat(tx, { boardId: P.id, tutorUserId: tut.id, studentId: stuA.id, vendor: "claude_cli", chapterId: fx.chapterId }));
    let c1 = await rows(P.id, (tx) => sendTurn(tx, { tutorUserId: tut.id, chatId: cchat.chatId, text: "Go ahead and author 3 questions on sub-topic 1 now." }));
    if (!c1.draftJobId) {
      c1 = await rows(P.id, (tx) => sendTurn(tx, { tutorUserId: tut.id, chatId: cchat.chatId, text: "Author 3 on sub-topic 1 now — emit the author_questions block." }));
    }
    check("claude go-ahead: marker parsed → ENQUEUED a draft job (≤2 tries)", !!c1.draftJobId);
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
  // Drain the draft jobs this probe enqueued (no worker ran them — they'd age out
  // anyway, but leave the queue clean for probe:authoringasync).
  await authoringQueue.obliterate({ force: true }).catch(() => {});
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
  await authoringQueue.close().catch(() => {});
  await redisConnection.quit().catch(() => {});
  await queryClient.end();
  process.exit(failed === 0 ? 0 : 1);
}

main().catch(async (err) => {
  console.error("probe_authoring_tool FAILED:", err);
  await redisConnection.quit().catch(() => {});
  await queryClient.end();
  process.exit(1);
});
