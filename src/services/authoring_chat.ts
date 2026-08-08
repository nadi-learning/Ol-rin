/**
 * Conversational question authoring (Slice AUTH-v2) — Polaris #1 reborn as a
 * STUDENT-GROUNDED CHAT. A tutor picks a student, opens a chat where the AI
 * arrives grounded in that student's two-axis mastery + Stage-1 observations +
 * practice activity, converses to shape intent, then authors questions to the
 * student's WEAKNESS (a SEPARATE structured call — fork 4) which are saved
 * PRIVATE to that student (question.target_student_id).
 *
 * The chat plumbing is PORTED from Starkhorn's unit_chat (the user's directive:
 * exact nadi-backend, nothing reinvented), trimmed of all teacher-app machinery
 * (commit tools, interactive mode, slide authoring): load history → per-thread
 * vendor lock → resume-or-stitch → complete() → persist assistant turn carrying
 * the vendor continuation handle.
 *
 * Decisions (D-AUTH2-*, supersede parts of v1's D-AUTH-1..6):
 *  - Student-first + weakness-targeted (supersedes D-AUTH-4 role-gate-only): the
 *    ownership guard is BACK (assertTutorsStudent) — authoring is now per-student.
 *  - Multi-turn conversation (supersedes D-AUTH-2 one-shot).
 *  - Two vendors, tutor-picked per chat (claude_cli | gemini_api): the AiVendor
 *    abstraction + the conversational complete() orchestrator (ported).
 *  - Fork 4: the conversation shapes intent; a SEPARATE structured authoring call
 *    (REUSING v1's QUESTION_AUTHOR_SYSTEM + draft contract + save mechanics) emits
 *    the questions. Gemini → responseSchema (geminiJson); Claude CLI → prompted
 *    JSON + extractJsonObject (CLI has no schema-constrained output; micro-dec #2).
 *  - Private save: reuse v1 saveQuestions with targetStudentId = the chat student.
 */
import { and, asc, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import type { PgTransaction } from "drizzle-orm/pg-core";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { Type } from "@google/genai";
import {
  authoringChat,
  authoringWorker,
  chapter,
  horizontalSkillState,
  learningObjective,
  observation,
  question,
  studentAuthoringPreference,
  studentChapterInsight,
  studentSubjectInsight,
  subject,
  subTopic,
  topic,
} from "@b2c/kernel/schema";
import {
  ChatMessage,
  WorkerPlanItem as WorkerPlanItemSchema,
  WorkerTurn,
  type VendorChoice,
  type WorkerPlan,
  type WorkerPlanItem,
} from "@b2c/kernel/contracts";
import { complete, extractJsonObject } from "./ai_client";
import type { VendorId } from "./ai/types";
import { geminiJson } from "./ai/gemini";
import {
  applyDraftRevision,
  assertOwnedDraft,
  draftBatchSchema,
  geminiQuestionSchema,
  listDrafts,
  persistDrafts,
  type PersistedDraft,
} from "./authoring";
import {
  claudeSystemFor,
  loadMethodPack,
  methodPackContextFor,
  planAuthoringWork,
  renderPlanText,
  spawnAuthoringWorker,
} from "./authoring_worker";
import { SubTopicNotFoundError } from "./assessment";
import {
  normalizePlannedKind,
  PALETTE_INDEX,
  renderInsightBlocks,
  renderServedSummary,
} from "./authoring_grounding";
import { assertTutorsStudent, getStudentMastery } from "./tutor";
// Slice QAUTH-B (item 9/11) — the chat reads the spiral scheduler. No cycle:
// scheduler.ts imports only drizzle + ./tutor.
import { computeDueQueue } from "./scheduler";
import { jsonlExists } from "./cli_session";
import { withBoard } from "../db/with-board";
import { enqueueAuthoring, type AuthoringPhase } from "../worker/queue";

type Tx = PgTransaction<any, any, any>;

const STAGE1_SOURCE = "stage1_scorer";
const AUTHORING_CHAT_ENDPOINT = "authoring.chat";
const AUTHORING_CALL_ENDPOINT = "authoring.fromChat";
const PROPOSE_ENDPOINT = "authoring.proposeTarget";
const REVISE_ENDPOINT = "authoring.reviseDraft";
const CHAT_TIMEOUT_SEC = 600;

export { SubTopicNotFoundError };

export class AuthoringChatNotFoundError extends Error {
  readonly code = "AUTHORING_CHAT_NOT_FOUND";
  constructor(chatId: string) {
    super(`authoring chat ${chatId} not found for this tutor`);
    this.name = "AuthoringChatNotFoundError";
  }
}

// Slice TWOWAY-1 — the gate's guard failure. Covers all of: no such episode, an
// episode on someone else's chat, and an episode that is not awaiting a gate
// (already drafted / dismissed / a re-plan in flight). Collapsed to ONE code on
// purpose: the FE's only sane response to any of them is "this plan is no longer
// live, reload the chat", and distinguishing them would leak episode existence.
export class AuthoringPlanNotFoundError extends Error {
  readonly code = "AUTHORING_PLAN_NOT_FOUND";
  constructor(workerId: string) {
    super(`authoring plan ${workerId} is not awaiting a gate for this tutor`);
    this.name = "AuthoringPlanNotFoundError";
  }
}

// Slice TWOWAY-FIX — a new authoring trigger arrived while this chat already has a
// plan awaiting its gate. Distinct from AUTHORING_PLAN_NOT_FOUND (which means the
// opposite: the gate you targeted is gone). Raised only on the authorFromChat
// BUTTON route; the conversational path answers in-band instead (see sendTurn).
export class AuthoringGateOpenError extends Error {
  readonly code = "AUTHORING_GATE_OPEN";
  constructor(chatId: string) {
    super(`authoring chat ${chatId} already has a plan awaiting the tutor's gate`);
    this.name = "AuthoringGateOpenError";
  }
}

// The in-band reply when a turn arrives under an open gate. Carries the REFRESH
// instruction on purpose: the single most likely reason a tutor is typing under an
// open gate is that their bundle is too old to draw the card, and this sentence is
// the only channel that reaches them (a stale FE renders messages fine — it just
// doesn't know what a plan card is).
const GATE_OPEN_REPLY =
  "There's already a plan waiting for your go-ahead on this chat — approve or amend it and I'll write those questions. " +
  "If you can't see the plan card, this page is running an older version: refresh it (Cmd+Shift+R, or Ctrl+Shift+R on Windows) and the card will be there.";

// Approving a plan that has NO items would draft questions nobody planned — the
// gate would be theatre. It happens when the worker replied with questions for the
// tutor instead of a plan, in which case the only real move is to amend.
export class PlanHasNoItemsError extends Error {
  readonly code = "PLAN_HAS_NO_ITEMS";
  constructor() {
    super("this plan has no items to draft — answer the worker's question instead");
    this.name = "PlanHasNoItemsError";
  }
}

// proposeTarget preconditions (a chat with a chapter + sub-topics). The FE surfaces
// these as "pick a chapter first" rather than an error toast.
export class ProposeTargetError extends Error {
  constructor(
    readonly code: "NO_CHAPTER" | "NO_SUBTOPICS",
    message: string,
  ) {
    super(message);
    this.name = "ProposeTargetError";
  }
}

// A chapter passed to startChat (blocked or interleaved) that isn't visible in the
// caller's board — RLS filters cross-board chapters to invisible, so a requested id
// that doesn't resolve is either cross-board or bogus. Router → BAD_REQUEST.
export class ChapterNotInBoardError extends Error {
  readonly code = "CHAPTER_NOT_IN_BOARD";
  constructor(chapterId: string) {
    super(`chapter ${chapterId} is not visible in this board`);
    this.name = "ChapterNotInBoardError";
  }
}

/**
 * The effective chapter scope of a chat (Slice QA3-d). Interleaved chats carry the
 * selected set in `chapter_ids`; blocked chats carry the single `chapter_id` (and
 * also mirror it into `chapter_ids`). Legacy (pre-QA3-d) rows have only `chapter_id`.
 * All chapter-scoped reads (grounding coverage, the Gemini target allowlist,
 * proposeTarget, the authorFromChat guard) go through this so one code path serves
 * one-or-many chapters.
 */
function chatChapterIds(row: {
  chapterId: string | null;
  chapterIds: unknown;
}): string[] {
  const many = Array.isArray(row.chapterIds)
    ? row.chapterIds.filter((x): x is string => typeof x === "string")
    : [];
  if (many.length > 0) return many;
  return row.chapterId ? [row.chapterId] : [];
}

/**
 * Slice QAUTH-B (item 11) — the sub-topic SCOPE the tutor picked at launch.
 *
 * Empty is a real and common answer, and it means "no picker was used": legacy
 * rows, blocked chats, and any chat started before this slice. Every reader
 * treats empty as "the whole of `chatChapterIds`", so the fallback is today's
 * behaviour rather than an empty scope — a chat that accidentally read as
 * scope-of-nothing would ground the model on no sub-topics at all and quietly
 * stop being able to author.
 */
function chatSubTopicIds(row: { subTopicIds: unknown }): string[] {
  return Array.isArray(row.subTopicIds)
    ? row.subTopicIds.filter((x): x is string => typeof x === "string")
    : [];
}

// The conversational agent's role. STATIC (no per-student data) so the resume
// fingerprint (sha256 of systemPrompt+slot) is stable across the thread — the
// Claude --resume requirement. The student grounding rides in the FIRST user
// message (stitched), mirroring unit_chat's assembled-prompt-in-userMessage shape.
// The conversational role — shared byte-for-byte across vendors. Only the
// "HOW AUTHORING HAPPENS" tail differs, because the two vendors author
// DIFFERENTLY (Slice tool-authoring): Gemini has the author_questions tool and
// authors in-chat; Claude CLI has no tool and authors via the button flow. Each
// vendor's system prompt is stable across its own (vendor-locked) thread, so the
// resume fingerprint is stable per thread.
const CHAT_SYSTEM_BASE = `You are a question-authoring partner for a tutor in an exam-prep system. You are grounded in ONE student's accumulated data (their two-axis mastery — conceptual vs procedural — plus the AI's Stage-1 observations of their recent answers, and their practice activity), which the tutor shares at the start of the conversation.

Your job in this chat is to help the tutor decide WHAT questions to author for this student, aimed at their genuine weaknesses. Surface your data-driven read of where the student is strong and weak (cite the mastery levels / observations), listen to the tutor's human perspective, and converge on a concrete authoring brief (which sub-topic, which misconception or skill, what kind of probe). Be concise and specific — this is a working conversation, not an essay.`;

// Claude path — no native tool (the claude_cli vendor drops req.tools), so Claude
// authors IN-CHAT by emitting a fenced `author_questions` JSON marker on a clear
// go-ahead; sendTurn parses it and runs the SAME spawn→persist path as the Gemini
// tool. Parity with Gemini, via text instead of a structured function call.
//
// ⚠️ Slice TWOWAY-1 edited both vendors' HOW-AUTHORING-HAPPENS tails (a go-ahead now
// hands off to a worker that PLANS first, so the model must stop promising finished
// questions). Editing a system prompt CHANGES the resume fingerprint, so the first
// turn of every pre-existing Claude thread falls back to stitched history instead of
// resuming. That is the correct behaviour, not a regression — resuming a session
// built under a different system prompt is the context-corruption hazard — and it
// self-heals from the next turn.
const CHAT_SYSTEM_CLAUDE = `${CHAT_SYSTEM_BASE}

HOW AUTHORING HAPPENS (so you author correctly): when you and the tutor have converged and the tutor gives a clear go-ahead ("author 3", "go ahead", "let's do it", "make those"), author by emitting EXACTLY ONE fenced code block whose info string is \`author_questions\` and whose body is a JSON object with two integer fields — \`subTopicNumber\` (the 1-based number of the chosen sub-topic from the AUTHORING TARGETS list in the message) and \`count\` (how many questions, 1–8). Exactly like this, the JSON alone inside the fence:
\`\`\`author_questions
{"subTopicNumber": 2, "count": 3}
\`\`\`
You do NOT write the questions yourself — emitting that block hands off to a specialist authoring worker that works to the full craft bar. By default that worker first comes back with a PLAN (its read of the student + one line per question it intends to write) which the tutor approves or amends before anything is written; if the tutor has turned that off, it drafts immediately. Either way the finished drafts appear in a review form where the tutor edits and saves them. Emit the block ONLY after a clear go-ahead — until then, keep discussing and do NOT emit it. You may write one short natural sentence before the block, and keep it NEUTRAL about what happens next (e.g. "On it — handing this to the author now." / "On it — let me work out how I'd approach these."). Do NOT promise finished questions ("drafting 3 now") — a plan may be what comes back. (A "Suggest what to work on" button also exists as an alternative, but you don't need it.)`;

// Gemini path — signals an author intent with the [[AUTHOR_NOW]] sentinel (Slice
// AUTH-fix B; replaces the native author_questions function-call that 400'd on
// malformed function-call JSON). The drafts still land in the review form
// (decision 2b: the tutor edits + saves; nothing goes live to a student without
// that). The "Suggest what to work on" button also remains available.
const CHAT_SYSTEM_GEMINI = `${CHAT_SYSTEM_BASE}

HOW AUTHORING HAPPENS (so you guide it correctly): you do NOT write the questions yourself, and you have NO tool or function to call. When you and the tutor have converged and the tutor gives a clear go-ahead ("author 3", "go ahead", "let's do it", "make those"), reply with ONE short natural sentence handing off (e.g. "On it — handing this to the author now." / "On it — let me work out how I'd approach these.") and put the exact token [[AUTHOR_NOW]] on its OWN line at the END of that reply. That token hands off to a specialist authoring worker that works to the full craft bar. By default that worker first comes back with a PLAN (its read of the student + one line per question it intends to write) which the tutor approves or amends before anything is written; if the tutor has turned that off, it drafts immediately. Either way the finished drafts appear in a review form where the tutor edits and saves them (nothing goes live to a student without that). Keep your handoff sentence NEUTRAL about what comes next — do NOT promise finished questions ("drafting 3 now"), because a plan may be what comes back. Emit [[AUTHOR_NOW]] ONLY after a clear go-ahead — until then, keep discussing and NEVER emit it. Do not explain the token, quote it, wrap it in backticks, or emit any pseudocode / tool_code / print(...) — just place [[AUTHOR_NOW]] on its own line when it's time to author.`;

// ───────────────────────── SEVERAL-THREAD ─────────────────────────
//
// THE BUG THIS EXISTS FOR. The conversational prompt above describes exactly one
// `subTopicNumber`, and nothing ever told the model the One/Several toggle exists
// — `chatSystemFor` took only the vendor. So a tutor with "Several" selected who
// ASKED "can we author two sub-topics now?" was told the system is "strictly
// hardwired to handle only one sub-topic per batch", and that sending two "breaks
// the authoring workflow and degrades question quality". Both sentences are the
// model's own invention; neither appears anywhere in this codebase. Meanwhile
// CHAT-SET-ROUTE (below, ~line 1440) would have fanned the go-ahead out correctly.
// The model talked the tutor out of a feature that was ready to run — and only
// when the tutor ASKED rather than instructed, which is why the routing probe
// never caught it: the routing was never wrong.
//
// WHY THIS IS THREAD-LOCKED RATHER THAN PER-TURN. The resume fingerprint is
// sha256(systemPrompt + slot), so a system prompt that varies with a per-turn
// toggle would refuse `--resume` on every flip and re-stitch the whole thread.
// The grain therefore joins `vendor` and the chapter scope as a property chosen
// when the thread is BORN (schema.ts `author_grain`), which is the pattern the
// start gate already uses — "New chat = the ONLY way to switch model/chapter".
//
// APPENDED ONLY WHEN SEVERAL. The 'one' prompt stays byte-identical to what
// shipped, so no existing thread's fingerprint moves and no resume regresses.
const CHAT_SYSTEM_SEVERAL_TAIL = `

AUTHORING GRAIN FOR THIS THREAD — SEVERAL. This thread is set to author SEVERAL sub-topics at once, and you should plan with the tutor on that basis. Do NOT tell the tutor the system can only handle one sub-topic at a time, or that authoring several at once harms question quality — in this thread neither is true. When the tutor gives a go-ahead, what comes back is a BLUEPRINT covering several sub-topics — one line per question per sub-topic — which the tutor approves or amends, and only THEN are all of them drafted in parallel. So do not promise finished questions, and do not ask the tutor to pick just one sub-topic to start with: proposing a set spanning several is the point of this thread.`;

/**
 * The conversational role for a thread. `several` appends the grain block; false
 * returns the exact string that shipped before SEVERAL-THREAD.
 *
 * Exported so the rule is assertable with NO AI in the loop (M101): a leg that can
 * only observe what the model happened to say proves nothing about the prompt.
 */
export function chatSystemFor(vendor: VendorChoice, several = false): string {
  const base = vendor === "gemini_api" ? CHAT_SYSTEM_GEMINI : CHAT_SYSTEM_CLAUDE;
  return several ? `${base}${CHAT_SYSTEM_SEVERAL_TAIL}` : base;
}

/** The stored grain, normalised. Null/unknown → "one" — the safe polarity (a
 *  missing value must never silently mean "spend N sub-topics of AI"). */
export function grainOf(row: { authorGrain?: string | null }): "one" | "several" {
  return row.authorGrain === "several" ? "several" : "one";
}

// Iter-3.5 layer C — sanitise persisted assistant text: cut at the first leak
// marker so clean prose before the leak is kept; empty if the leak is at index 0.
const LEAK_MARKER_RES: RegExp[] = [
  /(^|\n)\s*tool_code(\s|\n|$)/i,
  /(^|\n)\s*thought(\s|\n|$)/i,
  /\bprint\s*\(\s*default_api\./i,
  /default_api\.author_questions\s*\(/i,
];
function sanitiseAssistantText(text: string | null | undefined): string {
  if (!text) return "";
  let cutAt = text.length;
  for (const re of LEAK_MARKER_RES) {
    const m = text.match(re);
    if (m && m.index !== undefined && m.index < cutAt) cutAt = m.index;
  }
  return text.slice(0, cutAt).trim();
}

// ── Gemini in-chat authoring signal (Slice AUTH-fix B+A) ──────────────────────
// Replaces Gemini's native `author_questions` FUNCTION-CALL, which 400'd
// ("Model generated invalid JSON syntax") when a thinking model emitted malformed
// function-call JSON on a long resumed thread. Instead the conversational model
// emits the [[AUTHOR_NOW]] sentinel in PROSE on a clear go-ahead — a robust
// boolean trigger (emitting a fixed token is far more reliable than
// schema-constrained function-call JSON) — and a SEPARATE responseSchema call
// (resolveAuthorIntent) extracts {choice,count}. A missing/garbled sentinel just
// means "no author this turn" (graceful), never a 500. The Claude path keeps its
// fenced ```author_questions``` marker (text-based, already robust).
export const AUTHOR_SENTINEL = "[[AUTHOR_NOW]]";
const AUTHOR_SENTINEL_RE = /\[\[\s*AUTHOR_NOW\s*\]\]/i;
export function hasAuthorSentinel(text: string | null | undefined): boolean {
  return !!text && AUTHOR_SENTINEL_RE.test(text);
}
/** Remove the [[AUTHOR_NOW]] sentinel from text shown/persisted to the tutor
 *  (it's a machine directive); collapse the gap it leaves. Exported for the probe. */
export function stripAuthorSentinel(text: string | null | undefined): string {
  if (!text) return "";
  return text.replace(AUTHOR_SENTINEL_RE, "").replace(/\n{3,}/g, "\n\n").trim();
}

// Validates the author args {subTopicNumber, count}. Used by the Claude in-chat
// marker path (parseAuthorMarker) — the resolver→worker split authors from them.
const authorToolArgsSchema = z.object({
  subTopicNumber: z.number().int(),
  count: z.number().int(),
});

// ── Claude in-chat authoring marker (parity with the Gemini author_questions
//    tool, without native function-calling). The claude_cli vendor drops req.tools
//    (claude_cli_vendor.ts), so Claude signals an author intent by emitting a
//    fenced ```author_questions {json}``` block on a clear tutor go-ahead. sendTurn
//    parses it and runs the SAME resolve→spawn→persist path the tool uses. Absent
//    or malformed → parseAuthorMarker returns null → nothing is authored (inert). ──
type SubRef = {
  subTopicId: string;
  subTopicName: string;
  topicName: string;
  chapterName: string;
};

// Tolerant match: the info string is `author_questions` (matched on the tag, not a
// \b boundary — ai-integration-gotchas); the JSON body may be on the next line or
// the same line. The object is extracted with the shared extractJsonObject and
// validated with the same schema as the tool.
const CLAUDE_AUTHOR_FENCE_RE = /```[ \t]*author_questions\b[ \t]*\r?\n?([\s\S]*?)```/i;

/** Parse the Claude `author_questions` fenced marker → {subTopicNumber, count},
 *  or null if absent/malformed. Exported for the probe's deterministic checks. */
export function parseAuthorMarker(
  text: string | null | undefined,
): { subTopicNumber: number; count: number } | null {
  if (!text) return null;
  const m = text.match(CLAUDE_AUTHOR_FENCE_RE);
  if (!m || !m[1]) return null;
  const obj = extractJsonObject<unknown>(m[1]);
  if (!obj) return null;
  const parsed = authorToolArgsSchema.safeParse(obj);
  return parsed.success ? parsed.data : null;
}

/** Remove the `author_questions` fenced block from the assistant text shown to the
 *  tutor (it's a machine directive, not prose); collapse the gap it leaves.
 *  Exported for the probe. */
export function stripAuthorMarker(text: string | null | undefined): string {
  if (!text) return "";
  return text.replace(CLAUDE_AUTHOR_FENCE_RE, "").replace(/\n{3,}/g, "\n\n").trim();
}

// ───────────────────────── resume helpers (ported from unit_chat) ─────────────────────────

function lastResumableSessionId(history: ChatMessage[]): string | null {
  for (let i = history.length - 1; i >= 0; i--) {
    const m = history[i];
    if (m?.role !== "assistant") continue;
    return m.aiSessionId ?? null;
  }
  return null;
}

function lastAssistantVendor(history: ChatMessage[]): string | null {
  for (let i = history.length - 1; i >= 0; i--) {
    const m = history[i];
    if (m?.role !== "assistant") continue;
    return (m.vendorId ?? "claude_cli") as string;
  }
  return null;
}

const STALE_INTERACTION_RE =
  /interaction.*(not found|invalid|expired|does not exist)/i;
function isStaleInteractionError(err: unknown): boolean {
  const msg = (err as { message?: string })?.message ?? "";
  if (STALE_INTERACTION_RE.test(msg)) return true;
  const status = (err as { status?: number })?.status;
  if (status === 404 && /interaction/i.test(msg)) return true;
  return false;
}

// ───────────────────────── grounding assembler ─────────────────────────

// Slice INSIGHT-GROUND (assess-walkthrough item 11) — THE INSIGHT LAYER.
//
// MOVED to ./authoring_grounding in Slice QAUTH-A. The scoped WORKER now renders
// the same four blocks (items 1+10), and this file already imports the worker —
// so a worker→chat import to reach the renderer would close a cycle. Re-exported
// here so existing importers (probe_authoring_chat) keep working unchanged; the
// same move question_access.ts made in Slice MIXED.
export { renderInsightBlocks };
export type { InsightGroundingRows } from "./authoring_grounding";

/**
 * Build the student-grounding block for the chat's first (stitched) user turn.
 * Reuses the tutor read surface (getStudentMastery + the ownership guard) and a
 * recent-observations read. NEVER includes any answer key — observations carry
 * the AI's reasoning + levels only (the M11 boundary, same as the tutor surface).
 *
 * 🔑 Slice QAUTH-B (item 9) — THE CHAT NO LONGER CARRIES `topics.md`.
 *
 * It used to append every in-scope chapter's VERBATIM topics.md. Measured on the
 * live cbse board that is 15k–35k tokens PER CHAPTER (Journey Inside the Atom
 * 35,324; Quadratic Equations 32,981), so a two-chapter interleaved chat shipped
 * ~68k tokens of breakdown — re-sent on EVERY turn, because Gemini never resumes
 * (lastResumableSessionId below). In its place: the LOs of the in-scope
 * sub-topics (~2k tokens for the same chapters, a ~90% cut) plus what the
 * SCHEDULER says is due now.
 *
 * The trade is deliberate and is D-QAUTH-5's ruling: TRIM THE CHAT, NEVER THE
 * WORKER. The chat's job is to CHOOSE which sub-topics to author; the worker's
 * job is to WRITE, and it still receives its chapter's topics.md IN FULL
 * (`authoring_worker.ts` basePrompt) precisely because craft §8 says the
 * bounding contrast breaks the moment you hand an author a slice. Nothing here
 * may be reused to trim the worker.
 */
export async function assembleGrounding(
  tx: Tx,
  args: {
    tutorUserId: string;
    studentId: string;
    chapterIds?: string[];
    /** Slice QAUTH-B (item 11): the tutor's picked scope. Empty = whole chapters. */
    subTopicIds?: string[];
  },
): Promise<string> {
  const mastery = await getStudentMastery(tx, args); // asserts ownership

  const obs = await tx
    .select({
      axis: observation.axis,
      observationLevel: observation.observationLevel,
      tutorLevel: observation.tutorLevel,
      reasoning: observation.reasoning,
      calibrationFlag: observation.calibrationFlag,
      subTopicName: subTopic.name,
      createdAt: observation.createdAt,
    })
    .from(observation)
    .innerJoin(subTopic, eq(subTopic.id, observation.subTopicId))
    .where(
      and(
        eq(observation.studentId, args.studentId),
        eq(observation.source, STAGE1_SOURCE),
      ),
    )
    .orderBy(desc(observation.createdAt))
    .limit(20);

  const masteryLines =
    mastery.length > 0
      ? mastery
          .map(
            (m) =>
              `  - ${m.chapterName} › ${m.topicName} › ${m.subTopicName}: ` +
              `conceptual ${m.conceptualLevel == null ? "not yet assessed" : `L${m.conceptualLevel}`}, ` +
                `procedural ${m.proceduralLevel == null ? "not yet assessed" : `L${m.proceduralLevel}`}. ${m.description}`,
          )
          .join("\n")
      : "  (no certified mastery yet — the student has not been through Stage-2 certification)";

  // Slice ASSESS-SEE (item 12) — the EFFECTIVE level, never the raw machine read.
  // A tutor who corrects an observation has overruled the scorer on the evidence;
  // Stage-2 counts `tutorLevel ?? observationLevel` and so does every other
  // grounding surface (synthesis.ts, assignment.ts, assessment_chat.ts). This one
  // read stayed raw, so the surface generating the student's NEXT questions was
  // the only place in the system that never heard the correction.
  //
  // The "(tutor-corrected)" marker matches assessment_chat.ts — a human overruling
  // the machine is stronger evidence than the machine agreeing with itself, and
  // the author should weigh it that way.
  const obsLines =
    obs.length > 0
      ? obs
          .map(
            (o) =>
              `  - [${o.subTopicName}] ${o.axis} L${o.tutorLevel ?? o.observationLevel}` +
              (o.tutorLevel != null ? " (tutor-corrected)" : "") +
              (o.calibrationFlag ? ` (calibration: ${o.calibrationFlag})` : "") +
              `: ${o.reasoning}`,
          )
          .join("\n")
      : "  (no Stage-1 observations yet — the student has not submitted scored practice)";

  // Slice INSIGHT-GROUND (item 11) — read the insight layer. Ownership is already
  // asserted by getStudentMastery above; these are three more reads on the same
  // student under the same board scope. Omitted whole for legacy chapter-less
  // chats, exactly like the two blocks below it.
  const insightSections =
    (args.chapterIds ?? []).length > 0
      ? await (async () => {
          const chapters = await tx
            .select({
              chapterId: chapter.id,
              chapterName: chapter.name,
              chapterOrdinal: chapter.ordinal,
              subjectId: chapter.subjectId,
            })
            .from(chapter)
            .where(inArray(chapter.id, args.chapterIds!))
            .orderBy(asc(chapter.ordinal));
          if (chapters.length === 0) return [];
          const subjectIds = [...new Set(chapters.map((c) => c.subjectId))];

          const [chapterRows, subjectRows, hzRows, prefRows] = await Promise.all([
            tx
              .select({
                chapterId: studentChapterInsight.chapterId,
                insight: studentChapterInsight.insight,
              })
              .from(studentChapterInsight)
              .where(
                and(
                  eq(studentChapterInsight.studentId, args.studentId),
                  inArray(
                    studentChapterInsight.chapterId,
                    chapters.map((c) => c.chapterId),
                  ),
                ),
              ),
            tx
              .select({
                subjectName: subject.name,
                insight: studentSubjectInsight.insight,
              })
              .from(studentSubjectInsight)
              .innerJoin(subject, eq(subject.id, studentSubjectInsight.subjectId))
              .where(
                and(
                  eq(studentSubjectInsight.studentId, args.studentId),
                  inArray(studentSubjectInsight.subjectId, subjectIds),
                ),
              )
              .orderBy(asc(subject.name)),
            tx
              .select({
                subjectName: subject.name,
                slug: horizontalSkillState.slug,
                level: horizontalSkillState.level,
                prose: horizontalSkillState.prose,
              })
              .from(horizontalSkillState)
              .innerJoin(subject, eq(subject.id, horizontalSkillState.subjectId))
              .where(
                and(
                  eq(horizontalSkillState.studentId, args.studentId),
                  inArray(horizontalSkillState.subjectId, subjectIds),
                ),
              )
              .orderBy(asc(subject.name), asc(horizontalSkillState.slug)),
            // Item 10 — the tutor's teaching note. CHAPTER grain since
            // D-CHAPTER-PREF (S185), and this read is the half of that ruling
            // that makes chapter grain affordable: it filters on the note's
            // chapter's SUBJECT, not on this chat's chapters. So a note the
            // tutor wrote on any chapter of the subject reaches the authoring of
            // every other chapter in it.
            //
            // Deliberately UNLIKE the CHAPTER INSIGHT block above, which is
            // scoped to this chat's chapters exactly. That block is synthesis
            // output with a subject-grain sibling carrying the wider claims; this
            // one has no sibling — a per-chapter-only read would leave the author
            // with nothing for the ~73 of 74 chapters nobody annotated.
            //
            // The chapter name comes back with every row because the render MUST
            // print it (see renderInsightBlocks): a note from a chapter the chat
            // is not about is otherwise indistinguishable from one about it.
            tx
              .select({
                subjectName: subject.name,
                chapterName: chapter.name,
                preference: studentAuthoringPreference.preference,
              })
              .from(studentAuthoringPreference)
              .innerJoin(chapter, eq(chapter.id, studentAuthoringPreference.chapterId))
              .innerJoin(subject, eq(subject.id, chapter.subjectId))
              .where(
                and(
                  eq(studentAuthoringPreference.studentId, args.studentId),
                  inArray(chapter.subjectId, subjectIds),
                ),
              )
              .orderBy(asc(subject.name), asc(chapter.ordinal)),
          ]);

          // Chapter order, not insert order — the grounding reads as the syllabus runs.
          const insightByChapter = new Map(chapterRows.map((r) => [r.chapterId, r.insight]));
          return renderInsightBlocks({
            chapters: chapters
              .filter((c) => insightByChapter.has(c.chapterId))
              .map((c) => ({
                chapterName: c.chapterName,
                insight: insightByChapter.get(c.chapterId)!,
              })),
            subjects: subjectRows,
            horizontals: hzRows,
            preferences: prefRows,
            multiSubject: subjectIds.length > 1,
          });
        })()
      : [];

  // Chapter coverage: the chapter's full sub-topic list (topic-ordered) with a
  // per-sub-topic count of questions that ALREADY EXIST for this student
  // (canonical/shared OR private to them). Lets the AI answer "what's left to
  // author?" — without it the AI can only see the student's mastery, not the
  // curriculum map (Eyeball feedback #1). Skipped for legacy chapter-less chats.
  // Coverage spans ALL of the chat's chapters (one for blocked, N for interleaved
  // — Slice QA3-d). When more than one chapter is in scope, each line is prefixed
  // with its chapter name so cross-chapter targets are unambiguous.
  const groundChapterIds = args.chapterIds ?? [];

  // Slice QAUTH-B (item 11) — the tutor's picked sub-topic scope. Hoisted out of
  // the coverage block below because THREE sections now read the same scope
  // (coverage, the LOs that replace topics.md, and the due queue), and computing
  // it three times is how they drift apart.
  //
  // Empty = no picker was used (blocked chats, legacy rows, pre-slice chats) and
  // the scope is every sub-topic of the chosen chapters — today's behaviour.
  const pickedSubTopicIds = new Set((args.subTopicIds ?? []).filter(Boolean));
  const allScopeRows =
    groundChapterIds.length > 0
      ? await tx
          .select({
            chapterName: chapter.name,
            chapterOrdinal: chapter.ordinal,
            topicName: topic.name,
            topicOrdinal: topic.ordinal,
            subTopicId: subTopic.id,
            subTopicName: subTopic.name,
            subTopicOrdinal: subTopic.ordinal,
          })
          .from(subTopic)
          .innerJoin(topic, eq(topic.id, subTopic.topicId))
          .innerJoin(chapter, eq(chapter.id, topic.chapterId))
          .where(inArray(topic.chapterId, groundChapterIds))
          .orderBy(asc(chapter.ordinal), asc(topic.ordinal), asc(subTopic.ordinal))
      : [];

  // The picked set NARROWS what the chat is shown, so it proposes inside the
  // tutor's choice instead of anywhere in the chapter.
  //
  // ⚠️ Deliberately NOT narrowed: proposeTarget's sub_topic allowlist, which
  // stays on the whole chapter (chatChapterIds). The two disagree only in the
  // benign direction — the allowlist is a SUPERSET of what the model can see, so
  // every proposal it can make still validates. Narrowing both would make a
  // picker bug a hard authoring failure instead of a wider-than-ideal allowlist.
  const scopeRows =
    pickedSubTopicIds.size > 0
      ? allScopeRows.filter((r) => pickedSubTopicIds.has(r.subTopicId))
      : allScopeRows;
  const scopeNarrowed = pickedSubTopicIds.size > 0 && scopeRows.length < allScopeRows.length;

  const coverageLines =
    groundChapterIds.length > 0
      ? await (async () => {
          const rows = scopeRows;

          if (rows.length === 0) return null;

          // Slice QAUTH-A / D-QAUTH-4 — the counts split three ways instead of
          // one. Previously this was a single `count(*)` over everything visible
          // to the student INCLUDING unapproved drafts, so the chat said "3
          // authored" where the worker (which drops drafts, item 3) sees 1 — the
          // exact disagreement D-QAUTH-3 is written to prevent.
          //
          // `answered`/`skipped` are the CHAT's compact copy of the worker's
          // served history: counts, not the annotated list. The chat re-sends its
          // whole grounding on EVERY turn (Gemini never resumes,
          // lastResumableSessionId below), so it pays this per turn while the
          // worker pays once. Three states, because "authored" and "the student
          // has met it" are different facts and collapsing them is what made the
          // author treat never-served questions as covered ground.
          const stIds = rows.map((r) => r.subTopicId);
          const visible = or(
            isNull(question.targetStudentId),
            eq(question.targetStudentId, args.studentId),
          );
          const counts = await tx
            .select({
              subTopicId: question.subTopicId,
              approved: sql<number>`count(*) filter (where ${question.status} = 'approved')::int`,
              drafts: sql<number>`count(*) filter (where ${question.status} <> 'approved')::int`,
              answered: sql<number>`count(*) filter (where ${question.status} = 'approved' and exists (
                select 1 from attempt a
                 where a.question_id = ${question.id}
                   and a.app_user_id = ${args.studentId}
                   and a.skip_reason is null))::int`,
              skipped: sql<number>`count(*) filter (where ${question.status} = 'approved' and not exists (
                select 1 from attempt a
                 where a.question_id = ${question.id}
                   and a.app_user_id = ${args.studentId}
                   and a.skip_reason is null) and exists (
                select 1 from attempt a
                 where a.question_id = ${question.id}
                   and a.app_user_id = ${args.studentId}))::int`,
            })
            .from(question)
            .where(and(inArray(question.subTopicId, stIds), visible))
            .groupBy(question.subTopicId);
          const byId = new Map(counts.map((c) => [c.subTopicId, c]));

          const multi = groundChapterIds.length > 1;
          return rows
            .map((r) => {
              const c = byId.get(r.subTopicId);
              const approved = c?.approved ?? 0;
              const drafts = c?.drafts ?? 0;
              const answered = c?.answered ?? 0;
              const skipped = c?.skipped ?? 0;
              const summary = renderServedSummary({
                answered,
                skipped,
                unserved: approved - answered - skipped,
              });
              const tag =
                approved === 0
                  ? "NONE authored yet"
                  : `${approved} approved (${summary})`;
              const pending = drafts > 0 ? `, ${drafts} awaiting your review` : "";
              const path = multi
                ? `${r.chapterName} › ${r.topicName} › ${r.subTopicName}`
                : `${r.topicName} › ${r.subTopicName}`;
              return `  - ${path}: ${tag}${pending}`;
            })
            .join("\n");
        })()
      : null;

  // Slice QAUTH-B (item 9) — WHAT REPLACED topics.md.
  //
  // The LEARNING OBJECTIVES of the in-scope sub-topics. This is the part of the
  // breakdown the chat actually needs to choose between sub-topics: what each one
  // covers, per axis. Measured on cbse it is ~2k tokens where the same chapters'
  // topics.md was 15k–35k EACH. The prose map (misconceptions, teaching notes,
  // worked examples, the bounding contrast) goes on reaching the WORKER in full —
  // D-QAUTH-5, and craft §8 is explicit that authoring off a slice is what breaks.
  const loLines =
    scopeRows.length > 0
      ? await (async () => {
          const stIds = scopeRows.map((r) => r.subTopicId);
          const los = await tx
            .select({
              subTopicId: learningObjective.subTopicId,
              axis: learningObjective.axis,
              code: learningObjective.code,
              description: learningObjective.description,
            })
            .from(learningObjective)
            .where(inArray(learningObjective.subTopicId, stIds))
            .orderBy(asc(learningObjective.axis), asc(learningObjective.code));
          if (los.length === 0) return null;

          const bySt = new Map<string, { axis: string; code: string | null; description: string }[]>();
          for (const lo of los) {
            const list = bySt.get(lo.subTopicId) ?? [];
            list.push({ axis: lo.axis, code: lo.code, description: lo.description });
            bySt.set(lo.subTopicId, list);
          }

          const multi = groundChapterIds.length > 1;
          const blocks: string[] = [];
          for (const r of scopeRows) {
            const list = bySt.get(r.subTopicId);
            if (!list || list.length === 0) continue; // silent = no LOs on record
            const path = multi
              ? `${r.chapterName} › ${r.topicName} › ${r.subTopicName}`
              : `${r.topicName} › ${r.subTopicName}`;
            const body = list
              .map((lo) => `      - [${lo.axis}]${lo.code ? ` ${lo.code}:` : ""} ${lo.description}`)
              .join("\n");
            blocks.push(`  ${path}\n${body}`);
          }
          return blocks.length > 0 ? blocks.join("\n") : null;
        })()
      : null;

  // Slice QAUTH-B (item 9) — WHAT IS DUE NOW, straight from the scheduler.
  //
  // The chat has never read the scheduler: the tutor did the spacing arithmetic
  // from memory while the system already knew the answer. `computeDueQueue` is
  // the same computation the tutor's due-queue surface and the student's revision
  // landing both run, so the chat cannot disagree with what the rest of the app
  // says is owed.
  //
  // ⚠️ `computeDueQueue`, not `getDueQueue`: ownership is already asserted by
  // getStudentMastery at the top of this function, and getDueQueue would re-run
  // assertTutorsStudent on every turn for nothing.
  const dueLines = await (async () => {
    if (scopeRows.length === 0) return null;
    const inScope = new Set(scopeRows.map((r) => r.subTopicId));
    const groups = await computeDueQueue(tx, { studentId: args.studentId });
    const items = groups
      .flatMap((g) => g.items)
      .filter((it) => inScope.has(it.subTopicId));
    if (items.length === 0) return null;
    return items
      .map((it) => {
        const why =
          it.climbDue && it.climbDue <= it.effectiveDue ? "climb" : "retention";
        const when =
          it.overdueDays === 0 ? "due today" : `${it.overdueDays} day(s) overdue`;
        // interleaveEligible = both axes ≥3, the SAME gate the assignment
        // composer uses to decide what may be mixed. Surfaced so the chat can
        // tell a genuine mixed candidate from one that must be served alone.
        const mix = it.interleaveEligible
          ? "safe to mix"
          : "NOT safe to mix yet (needs ≥L3 on both axes)";
        return `  - ${it.chapterName} › ${it.subTopicName}: ${when} (${why}) — ${mix}`;
      })
      .join("\n");
  })();

  return [
    "===== STUDENT GROUNDING (read this before responding) =====",
    "",
    "CERTIFIED TWO-AXIS MASTERY (conceptual = reasoning/why; procedural = execution; 1–5):",
    masteryLines,
    "",
    "RECENT STAGE-1 OBSERVATIONS (the AI's blind read of the student's recent answers — reasoning + level per axis, no answer keys):",
    obsLines,
    // The insight layer sits with the rest of the STUDENT picture, ahead of the
    // curriculum map (coverage + breakdown) — it describes who you are authoring
    // for, not what there is to author.
    ...insightSections,
    ...(dueLines
      ? [
          "",
          "DUE NOW (what the SPIRAL SCHEDULER says is owed today for the sub-topics in scope — the same computation the tutor's due-queue and the student's revision landing read. Most-overdue first. Prefer these when choosing what to author; \"safe to mix\" is the ≥L3-on-both-axes gate that decides whether a sub-topic may go into an interleaved set at all):",
          dueLines,
        ]
      : []),
    ...(coverageLines
      ? [
          "",
          (scopeNarrowed
            ? "CHAPTER COVERAGE — NARROWED TO THE SUB-TOPICS THE TUTOR PICKED for this chat (they chose this scope in the launcher; author within it and say so if you think something outside it is needed). For each: "
            : "CHAPTER COVERAGE (every sub-topic in this chat's chapter(s) + ") +
            "how many APPROVED questions already exist for THIS student — canonical + private — and how many of those the student has actually MET. \"authored\" is not \"covered\": a question marked not-yet-served has taught this student nothing, and a skipped one was read but not answered. Use this to answer what's left to author):",
          coverageLines,
        ]
      : []),
    ...(loLines
      ? [
          "",
          "LEARNING OBJECTIVES for the sub-topics above, per axis — what each one actually covers. This is your map for CHOOSING what to author. You are NOT being given the chapter's full prose breakdown (topics.md): the WORKER that writes each question receives it in full, which is where the misconceptions, teaching notes and worked examples are needed. Choose the sub-topic and say what you want probed; do not try to write the question's content from these lines alone:",
          loLines,
        ]
      : []),
    "",
    "===== END STUDENT GROUNDING =====",
  ].join("\n");
}

// ───────────────────────── chat lifecycle ─────────────────────────

export type AuthoringMode = "blocked" | "interleaved";

export type ChatView = {
  chatId: string;
  studentId: string;
  chapterId: string | null; // the blocked-mode single chapter (Slice AUTH-v2.1)
  chapterIds: string[]; // effective chapter scope (Slice QA3-d): [one] blocked, N interleaved
  mode: AuthoringMode; // 'blocked' | 'interleaved' (legacy rows read as 'blocked')
  // SEVERAL-THREAD: how many sub-topics a go-ahead in this thread authors. Thread-
  // locked (it picks the system prompt), so the FE renders it read-only in the
  // context strip and flipping it starts a new chat.
  //
  // ⚠️ REQUIRED, and that is the whole point. It was optional first — "so the many
  // builders need not each be touched" — and the render walk caught what that
  // bought: the FE does `setChat(response)` after EVERY turn, so the moment a
  // builder omitted the grain the UI silently reverted to One. The chip vanished,
  // the composer flipped, and the confirm then fired against the wrong grain — on
  // a thread whose system prompt still said SEVERAL. That is precisely the
  // state/prompt disagreement this slice exists to remove, reintroduced by the
  // type. Required means the compiler enumerates every builder; a builder that
  // forgets cannot compile.
  authorGrain: "one" | "several";
  // Slice QAUTH-B (item 11): the sub-topic scope the tutor picked at launch.
  // REQUIRED for the same reason `authorGrain` above is — the FE does
  // `setChat(response)` after every turn, so an optional field that one builder
  // forgets silently empties the scope mid-thread and the chat starts grounding
  // on the whole chapter again. `[]` is the honest "no picker was used" value
  // and every reader falls back to chapterIds for it; it must be written, not
  // defaulted by omission.
  subTopicIds: string[];
  subTopicId: string | null; // resolved authoring focus (set by proposeTarget)
  vendor: VendorChoice;
  messages: ChatMessage[];
  // Set ONLY on a sendTurn where an in-chat author fired — the Gemini
  // author_questions tool OR the Claude `author_questions` marker: the drafted
  // questions the FE routes into the review form (same shape as authorFromChat;
  // persisted as status='draft'/private, the tutor edits + approves). Absent on
  // every ordinary discussion turn.
  //
  // Slice AUTHOR-ASYNC: in-chat authoring no longer drafts inline (it hung the
  // request up to 524s). `draft` is therefore NEVER populated by sendTurn now;
  // instead a background job is enqueued and its id returned as `draftJobId`. The
  // FE shows a durable "Drafting…" loader and polls getAuthoringJobStatus for the
  // AuthorFromChatResult. (`draft` is kept on the type — the review form still
  // consumes that shape from the poll result.)
  draft?: AuthorFromChatResult;
  // Slice AUTHOR-ASYNC: set on a sendTurn where an in-chat author fired — the
  // BullMQ job id drafting the questions off the request path. Mutually exclusive
  // with `draft`. The FE polls getAuthoringJobStatus(draftJobId) and opens the
  // review form when it completes; the loader survives a refresh via
  // getActiveAuthoringJob(chatId).
  draftJobId?: string;
  // The student's still-unapproved (status='draft') authored questions, flat
  // across sub-topics (interleaved may span several). Populated ONLY by getChat so
  // that RESUMING a chat mid-review (from either the landing history picker or a
  // remount) re-hydrates the review form — no resume path can silently skip the
  // restore. Absent on start/turn responses (no review in progress there).
  pendingDrafts?: Awaited<ReturnType<typeof listDrafts>>;
  // Slice TWOWAY-1: the worker's plan awaiting this tutor's gate, if any. Same
  // discipline as pendingDrafts — carried on getChat so EVERY resume path restores
  // the gate card identically, and the card renders from THIS rather than from the
  // relay turn in the transcript (an already-answered gate must not re-open).
  pendingPlan?: PendingPlanView | null;
  // Slice TWOWAY-1: set on a sendTurn whose go-ahead started a PLAN (plan-first is
  // the default). Mutually exclusive with draftJobId — the FE shows "Planning…"
  // rather than "Drafting…" and opens the gate card when the job completes.
  planJobId?: string;
  // Slice CHAT-SET-ROUTE: set on a sendTurn whose go-ahead fired while the tutor had
  // "Several" selected. The turn resolves a SET of sub-topics (carrying SET-PLAN-GATE's
  // item blueprint) and hands it back as a PROPOSAL — nothing is enqueued. The fan-out
  // fires only when the tutor approves the card, through the SAME authorSetConfirmed →
  // authorSetFromChat path the menu button uses.
  //
  // Mutually exclusive with draftJobId/planJobId: there is no job to poll on this path.
  // The gate is deliberate (founder, 2026-07-31) — a chat go-ahead must not silently
  // spend N sub-topics' worth of AI without the tutor seeing the blueprint, which is
  // the same reason single-mode's planFirst defaults TRUE.
  proposedSet?: ProposeSetResult;
  // PROPOSAL-PERSIST: the single-target twin of `proposedSet`, carried on getChat
  // only. sendTurn never produces one (an in-chat go-ahead resolves its target and
  // enqueues directly), so unlike proposedSet this field is a RESUME-only channel —
  // it restores a proposal made earlier by the proposeAuthoringTarget button.
  proposedTarget?: ProposeTargetResult;
  // PROPOSAL-PERSIST: when the pending proposal above was made (ISO). Present only
  // alongside one of the two proposal fields on a getChat, so the card can show its
  // age. Absent on the mutation responses — a proposal handed back by the call that
  // just made it is zero seconds old and has nothing to disclose.
  proposedAt?: string;
};

/** Load a chat the caller owns, or throw NOT_FOUND (no existence leak). RLS
 *  scopes by board; this is the per-user (tutor) wall (D-L-5 pattern). */
async function ownedChat(tx: Tx, tutorUserId: string, chatId: string) {
  const [row] = await tx
    .select()
    .from(authoringChat)
    .where(eq(authoringChat.id, chatId))
    .limit(1);
  if (!row || row.tutorId !== tutorUserId) {
    throw new AuthoringChatNotFoundError(chatId);
  }
  return row;
}

function parseMessages(raw: unknown): ChatMessage[] {
  const arr = Array.isArray(raw) ? raw : [];
  return arr.map((m) => ChatMessage.parse(m));
}

// ───────────────────────── PROPOSAL-PERSIST (the pending proposal) ─────────────────────────
//
// A proposal is the thing the tutor APPROVES: either one target (proposeTarget) or
// a set blueprint (proposeTargetSet). Until this slice both existed ONLY as the
// return value of the mutation that made them — so `getChat` could not restore
// either, and a remount, a student switch or a backend restart threw the proposal
// away. See the `pending_proposal` comment in schema.ts for the prod incident.
//
// Stored as a discriminated union so ONE column serves both. Both payloads already
// carry resolved sub_topic UUIDs (never the model's 1-based index), so what is
// stored stays valid on its own terms.

const pendingTargetSchema = z.object({
  kind: z.literal("target"),
  createdAt: z.string(),
  target: z.object({
    chatId: z.string(),
    studentId: z.string(),
    subTopicId: z.string(),
    subTopicName: z.string(),
    topicName: z.string(),
    chapterName: z.string(),
    count: z.number(),
    rationale: z.string(),
  }),
});

const pendingSetSchema = z.object({
  kind: z.literal("set"),
  createdAt: z.string(),
  set: z.object({
    chatId: z.string(),
    studentId: z.string(),
    rationale: z.string(),
    picks: z.array(
      z.object({
        subTopicId: z.string(),
        subTopicName: z.string(),
        topicName: z.string(),
        chapterName: z.string(),
        count: z.number(),
        items: z.array(WorkerPlanItemSchema),
      }),
    ),
  }),
});

const pendingProposalSchema = z.discriminatedUnion("kind", [
  pendingTargetSchema,
  pendingSetSchema,
]);

export type PendingProposal = z.infer<typeof pendingProposalSchema>;

/** Drop-don't-throw, the same tolerance parseWorkerTurns applies: a malformed
 *  payload must never make a chat permanently unopenable. A chat that cannot be
 *  opened is strictly worse than one that lost a proposal it can re-run. */
function parsePendingProposal(raw: unknown): PendingProposal | null {
  if (raw === null || raw === undefined) return null;
  const parsed = pendingProposalSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

/** Persist the proposal awaiting approval. Called from INSIDE proposeTarget /
 *  proposeTargetSet rather than from their callers, so every entry point — the
 *  menu button AND the in-chat go-ahead — gets the persistence for free and no
 *  future caller can forget it. `createdAt` is stamped here: it is the age the
 *  card shows, and it must be the moment the AI produced the proposal. */
async function persistPendingProposal(
  tx: Tx,
  chatId: string,
  proposal: PendingProposal,
): Promise<void> {
  await tx
    .update(authoringChat)
    .set({ pendingProposal: proposal, updatedAt: new Date() })
    .where(eq(authoringChat.id, chatId));
}

/**
 * Clear the pending proposal. Called on APPROVE (the proposal became work) and on
 * an explicit DISMISS — never on elapsed time (founder, 2026-08-08: never expires).
 *
 * 🔴 The dismiss path is LOAD-BEARING, not polish. The FE disables the compose box
 * while a proposal is open (`disabled={… || !!proposalSet}`). Before this slice a
 * reload was the escape hatch; now that the proposal survives one, a proposal with
 * no clear path would brick the chat permanently.
 */
export async function clearPendingProposal(
  tx: Tx,
  args: { tutorUserId: string; chatId: string },
): Promise<void> {
  const row = await ownedChat(tx, args.tutorUserId, args.chatId);
  await tx
    .update(authoringChat)
    .set({ pendingProposal: null, updatedAt: new Date() })
    .where(eq(authoringChat.id, row.id));
}

/**
 * Start a new authoring chat for one student with a chosen vendor + mode (Slice
 * QA3-d). `blocked` scopes to ONE chapter (chapter_id set, chapter_ids mirrors it);
 * `interleaved` grounds across the selected set (chapter_id null, chapter_ids = N).
 * Every requested chapter is validated board-visible (RLS filters cross-board rows
 * to invisible → a missing id throws ChapterNotInBoardError).
 */
export async function startChat(
  tx: Tx,
  args: {
    boardId: string;
    tutorUserId: string;
    studentId: string;
    vendor: VendorChoice;
    // The mode (defaults to blocked for the fast path + legacy callers).
    mode?: AuthoringMode;
    // Blocked's single chapter (Slice AUTH-v2.1 fast path). Optional; folded into
    // the chapter set below.
    chapterId?: string | null;
    // The selected chapter set (Slice QA3-d launcher). Blocked = 1, interleaved = N.
    chapterIds?: string[];
    /** SEVERAL-THREAD: how many sub-topics a go-ahead authors. Thread-locked —
     *  it selects the system prompt, so it cannot change without a new thread. */
    authorGrain?: "one" | "several";
    /** SEVERAL-THREAD: the transcript to seed this thread with, when it was
     *  created by flipping the grain on an existing chat. */
    carryMessages?: ChatMessage[];
    /** Slice QAUTH-B (item 11): the sub-topic scope the tutor ticked in the
     *  launcher, pre-filled from the scheduler's due queue. Omitted / empty =
     *  no picker was used, and the scope falls back to every sub-topic of the
     *  chosen chapters (today's behaviour). */
    subTopicIds?: string[];
  },
): Promise<ChatView> {
  await assertTutorsStudent(tx, args.tutorUserId, args.studentId);

  const mode: AuthoringMode = args.mode ?? "blocked";
  // Normalize the requested chapters into the stored shape.
  let storedChapterId: string | null;
  let storedChapterIds: string[];
  if (mode === "interleaved") {
    storedChapterIds = (args.chapterIds ?? []).filter(Boolean);
    if (storedChapterIds.length === 0) {
      throw new Error("interleaved mode requires at least one chapter");
    }
    storedChapterId = null; // interleaved has no single-chapter anchor
  } else {
    const single = args.chapterId ?? args.chapterIds?.[0] ?? null;
    storedChapterId = single;
    storedChapterIds = single ? [single] : [];
  }

  // Board-visibility check: every requested chapter must resolve under RLS.
  if (storedChapterIds.length > 0) {
    const visible = await tx
      .select({ id: chapter.id })
      .from(chapter)
      .where(inArray(chapter.id, storedChapterIds));
    const visibleIds = new Set(visible.map((c) => c.id));
    for (const cid of storedChapterIds) {
      if (!visibleIds.has(cid)) throw new ChapterNotInBoardError(cid);
    }
  }

  // Slice QAUTH-B (item 11) — the picked sub-topics must live INSIDE the chosen
  // chapters. RLS already bounds them to the board, but not to this chat: without
  // this a launcher bug (or a hand-made request) could scope a Maths chat to a
  // Physics sub-topic, and the grounding would then hand the model a scope its
  // own CHAPTER COVERAGE block never mentions. Dropped rather than thrown —
  // the picker is pre-filled from the scheduler, which reads the whole spiral,
  // so a due sub-topic outside the chosen chapters is an ordinary race (the
  // tutor narrowed the chapters after ticking), not a caller error.
  let storedSubTopicIds: string[] = [];
  const requestedSubTopicIds = [...new Set((args.subTopicIds ?? []).filter(Boolean))];
  if (requestedSubTopicIds.length > 0 && storedChapterIds.length > 0) {
    const inScope = await tx
      .select({ id: subTopic.id })
      .from(subTopic)
      .innerJoin(topic, eq(topic.id, subTopic.topicId))
      .where(
        and(
          inArray(subTopic.id, requestedSubTopicIds),
          inArray(topic.chapterId, storedChapterIds),
        ),
      );
    const ok = new Set(inScope.map((s) => s.id));
    storedSubTopicIds = requestedSubTopicIds.filter((s) => ok.has(s));
  }

  // 🔑 SEVERAL-THREAD — STRIP THE VENDOR SESSION IDENTITY FROM CARRIED MESSAGES.
  //
  // A ChatMessage carries `aiSessionId` and `sessionFingerprint`, and sendTurn
  // resumes on exactly those. Copying a transcript verbatim would hand the NEW
  // thread the OLD thread's session id, whose fingerprint was computed from the
  // OLD system prompt — so the first turn would try to `--resume` a session built
  // under the other grain. That is the precise prompt/session mismatch this whole
  // slice exists to prevent, re-introduced by the carry-over meant to be free of
  // it. Stripped here rather than at the call site: a second caller must not be
  // able to reintroduce it, and the invariant belongs beside the insert it guards.
  //
  // Consequence, and it is the correct one: the new thread has no resumable
  // session, so its first turn stitches the carried history as text — under the
  // new grain's prompt. Exactly what a fresh thread does.
  const seeded: ChatMessage[] = (args.carryMessages ?? []).map((m) => ({
    id: m.id,
    role: m.role,
    text: m.text,
    createdAt: m.createdAt,
    // aiSessionId / sessionFingerprint / vendorId deliberately NOT copied.
  }));

  const [created] = await tx
    .insert(authoringChat)
    .values({
      boardId: args.boardId,
      tutorId: args.tutorUserId,
      studentId: args.studentId,
      mode,
      authorGrain: args.authorGrain ?? "one",
      chapterId: storedChapterId,
      chapterIds: storedChapterIds,
      subTopicIds: storedSubTopicIds,
      vendor: args.vendor,
      messages: seeded,
    })
    .returning();
  return {
    chatId: created!.id,
    studentId: created!.studentId,
    chapterId: created!.chapterId ?? null,
    chapterIds: chatChapterIds(created!),
    subTopicIds: chatSubTopicIds(created!),
    mode: (created!.mode as AuthoringMode) ?? "blocked",
    authorGrain: grainOf(created!),
    subTopicId: created!.subTopicId ?? null,
    vendor: created!.vendor as VendorChoice,
    messages: seeded,
  };
}

export async function getChat(
  tx: Tx,
  args: { tutorUserId: string; chatId: string },
): Promise<ChatView> {
  const row = await ownedChat(tx, args.tutorUserId, args.chatId);
  // Re-hydrate the review form on resume: this chat's still-unapproved drafts.
  // Scoped by student (tutor-owned; listDrafts asserts the tutor↔student link)
  // AND by the chat's chapter(s) — a draft is student-private, not chat-scoped,
  // so without the chapter filter a Maths chat's form hydrated with the student's
  // leftover Physics drafts.
  const pendingDrafts = await listDrafts(tx, {
    tutorUserId: args.tutorUserId,
    studentId: row.studentId,
    // Slice DRAFT-SCOPE: only THIS chat's chapter(s), so a Quadratics chat's
    // review form no longer hydrates with the student's leftover Electricity
    // drafts (a draft is student-private, not chat-scoped). Legacy chats with no
    // chapter scope read unscoped (chatChapterIds → []).
    chapterIds: chatChapterIds(row),
  });
  // Slice TWOWAY-1: the gate, if one is open. Read on the same call as the drafts so
  // a single getChat restores the whole in-progress state of the chat.
  const pendingPlan = await pendingPlanFor(tx, row.id);
  // PROPOSAL-PERSIST: the third piece of in-progress state, and the one this
  // function used to miss. The comment above says "a single getChat restores the
  // whole in-progress state of the chat" — it restored drafts and the plan gate and
  // silently did not restore the proposal, which is exactly how prod lost one.
  const pendingProposal = parsePendingProposal(row.pendingProposal);
  return {
    chatId: row.id,
    studentId: row.studentId,
    chapterId: row.chapterId ?? null,
    chapterIds: chatChapterIds(row),
    subTopicIds: chatSubTopicIds(row),
    mode: (row.mode as AuthoringMode) ?? "blocked",
    authorGrain: grainOf(row),
    subTopicId: row.subTopicId ?? null,
    vendor: row.vendor as VendorChoice,
    messages: parseMessages(row.messages),
    pendingDrafts,
    pendingPlan,
    // Surfaced under the SAME field names the FE already fills from the mutation
    // responses, so the rehydrate path needs no new branch: `proposedSet` was
    // already read on getChat at TutorPage.tsx:4486 and had simply never been set.
    ...(pendingProposal?.kind === "set"
      ? { proposedSet: pendingProposal.set, proposedAt: pendingProposal.createdAt }
      : {}),
    ...(pendingProposal?.kind === "target"
      ? { proposedTarget: pendingProposal.target, proposedAt: pendingProposal.createdAt }
      : {}),
  };
}

// One row in the chat history list (Eyeball-#2 item #3).
export type ChatSummary = {
  chatId: string;
  vendor: VendorChoice;
  chapterId: string | null;
  chapterName: string | null;
  messageCount: number;
  lastPreview: string | null; // first ~80 chars of the latest turn
  updatedAt: Date;
};

/**
 * The tutor's authoring chats for ONE of their students, newest-first — the
 * history behind the "Past chats" picker. Ownership-guarded (assertTutorsStudent
 * → foreign student = StudentNotFoundError; RLS scopes board, not user).
 * messageCount + lastPreview are derived from the messages jsonb.
 */
export async function listAuthoringChats(
  tx: Tx,
  args: { tutorUserId: string; studentId: string },
): Promise<ChatSummary[]> {
  await assertTutorsStudent(tx, args.tutorUserId, args.studentId);
  const rows = await tx
    .select({
      id: authoringChat.id,
      vendor: authoringChat.vendor,
      chapterId: authoringChat.chapterId,
      chapterName: chapter.name,
      messages: authoringChat.messages,
      updatedAt: authoringChat.updatedAt,
    })
    .from(authoringChat)
    .leftJoin(chapter, eq(authoringChat.chapterId, chapter.id))
    .where(
      and(
        eq(authoringChat.studentId, args.studentId),
        eq(authoringChat.tutorId, args.tutorUserId),
      ),
    )
    .orderBy(desc(authoringChat.updatedAt));
  return rows.map((r) => {
    const msgs = parseMessages(r.messages);
    const last = msgs.length > 0 ? msgs[msgs.length - 1]!.text : null;
    return {
      chatId: r.id,
      vendor: r.vendor as VendorChoice,
      chapterId: r.chapterId ?? null,
      chapterName: r.chapterName ?? null,
      messageCount: msgs.length,
      lastPreview: last ? last.replace(/\s+/g, " ").slice(0, 80) : null,
      updatedAt: r.updatedAt,
    };
  });
}

/**
 * Shared in-chat authoring core (both the Gemini sentinel branch and the Claude
 * marker branch call this). Resolve the numbered target — clamped INTO the chapter
 * allowlist so it can never escape to a raw id (M15) — pin it on the chat, and
 * ENQUEUE a background authoring job (Slice AUTHOR-ASYNC). The slow, high-variance
 * worker draft (spawnAuthoringWorker → geminiJson) used to run INLINE here → the
 * request hung up to 524s → 500. Now the worker runs authorFromChat OFF the request
 * path and persists the drafts; this call returns the job id + the chosen target so
 * sendTurn can return a "Drafting…" view the FE polls. Both in-chat paths therefore
 * enqueue the SAME job the authorFromChat button enqueues (one worker, one craft bar).
 */
async function resolveTargetAndEnqueue(
  tx: Tx,
  a: {
    row: Awaited<ReturnType<typeof ownedChat>>;
    tutorUserId: string;
    subs: SubRef[];
    subTopicNumber: number;
    count: number;
    /** Slice TWOWAY-1: plan first (the default) or draft straight through (the skip). */
    planFirst: boolean;
  },
): Promise<{ chosen: SubRef; count: number; jobId: string; phase: AuthoringPhase }> {
  const idx = Math.min(Math.max(a.subTopicNumber, 1), a.subs.length) - 1;
  const chosen = a.subs[idx]!;
  const count = Math.min(Math.max(a.count, 1), 8);

  // Pin the resolved focus now (mirrors proposeTarget/authorFromChat) so the
  // returned ChatView reflects the target while the job drafts. authorFromChat sets
  // it again in the worker — idempotent.
  await tx
    .update(authoringChat)
    .set({ subTopicId: chosen.subTopicId, updatedAt: new Date() })
    .where(eq(authoringChat.id, a.row.id));

  // Enqueue OFF the request path. The delay in enqueueAuthoring lets THIS tx (which
  // persists the go-ahead turn back in sendTurn) COMMIT before the worker reads the
  // chat history for its brief. The worker resolves the brief from the chat itself —
  // nothing else to thread through the job.
  //
  // Slice TWOWAY-1: a go-ahead now starts the PLAN phase by default. `planFirst:
  // false` is the tutor's explicit skip and keeps the pre-slice behaviour exactly —
  // straight to drafting, no episode, no gate.
  const phase: AuthoringPhase = a.planFirst ? "plan" : "draft";
  const jobId = await enqueueAuthoring({
    boardId: a.row.boardId,
    tutorUserId: a.tutorUserId,
    chatId: a.row.id,
    subTopicId: chosen.subTopicId,
    count,
    phase,
  });
  return { chosen, count, jobId, phase };
}

/** The canned wrap-up used only when stripping the machine directive left the
 *  model's own prose empty. Phase-accurate on purpose: telling a tutor "drafting 3
 *  questions" when a PLAN is what is coming back would make the gate card look like
 *  a failure to draft. */
function fallbackWrapText(
  phase: AuthoringPhase,
  count: number,
  subTopicName: string,
): string {
  const n = `${count} question${count === 1 ? "" : "s"}`;
  return phase === "plan"
    ? `On it — working out how I'd approach ${n} for ${subTopicName}. I'll show you the plan here before I write anything.`
    : `On it — drafting ${n} for ${subTopicName} now. They'll appear in the review form below when they're ready.`;
}

/** Build the ChatView returned when an in-chat author fired: the work runs ASYNC
 *  (jobId), so no `draft` payload yet — the FE polls for it. Slice TWOWAY-1: the
 *  job id lands on `planJobId` or `draftJobId` per phase, so the FE shows the right
 *  loader and knows whether to expect a gate card or a review form. */
function buildDraftingView(
  row: Awaited<ReturnType<typeof ownedChat>>,
  vendor: VendorChoice,
  chosen: SubRef,
  messages: ChatMessage[],
  jobId: string,
  phase: AuthoringPhase,
): ChatView {
  return {
    chatId: row.id,
    studentId: row.studentId,
    chapterId: row.chapterId ?? null,
    chapterIds: chatChapterIds(row),
    subTopicIds: chatSubTopicIds(row),
    mode: (row.mode as AuthoringMode) ?? "blocked",
    authorGrain: grainOf(row),
    subTopicId: chosen.subTopicId,
    vendor,
    messages,
    ...(phase === "plan" ? { planJobId: jobId } : { draftJobId: jobId }),
  };
}

// ───────────────────────── CHAT-SET-ROUTE (Slice B, §7 of S179) ─────────────────────────
//
// The chat go-ahead was MODE-BLIND: both vendor branches routed through
// resolveTargetAndEnqueue with a single subTopicNumber, so with "Several" selected a
// tutor's approval still authored ONE sub-topic and the toggle was silently ignored.
// The parallel fan-out was reachable only from the UI menu.
//
// The fix routes a go-ahead to the SAME set proposer the menu uses, and stops there:
// the tutor gets the blueprint card and the fan-out fires on THEIR approval. Nothing
// is enqueued by this path, so it changes neither the job system nor the fan-out's
// (pre-existing, synchronous) shape — it only decides which resolver a go-ahead reaches.

/**
 * Which set INTENT a chat's go-ahead resolves under. Pure, and exported so the rule
 * is assertable with no AI in the loop (M101 — a leg that can only observe what the
 * model happened to propose passes vacuously). Mirrors the FE's own choice at
 * TutorPage `proposeSet()`; the two arms are asserted TOGETHER in one probe leg so
 * widening one cannot silently widen the other.
 *
 * interleaved → "discriminate" (a confusable MIX across the chat's chapters)
 * blocked/legacy → "cover"     (several sub-topics of the one chapter)
 */
export function setIntentForMode(mode: string | null | undefined): ProposeSetIntent {
  return mode === "interleaved" ? "discriminate" : "cover";
}

/** The canned wrap-up when stripping the machine directive left nothing, on the SET
 *  path. Speaks to a proposal awaiting approval — never "drafting", because on this
 *  path nothing is being drafted yet. */
const SET_PROPOSAL_WRAP =
  "On it — here's the set I'd write across those sub-topics. Have a look and approve it and I'll draft them all in parallel.";

/**
 * Persist the turn, then resolve a SET proposal from the transcript.
 *
 * The persist MUST come first: proposeTargetSet resolves the picks from the chat's
 * stored messages via its own ownedChat read, and the message naming the sub-topics
 * is the very turn being handled — proposing before the update would resolve against
 * a transcript missing the go-ahead. (The existing single-target path sidesteps this
 * by hand-assembling `convoForIntent`; reusing proposeTargetSet unchanged is worth
 * the reordering.)
 */
async function runSetGoAhead(
  tx: Tx,
  a: {
    row: Awaited<ReturnType<typeof ownedChat>>;
    tutorUserId: string;
    messages: ChatMessage[];
  },
): Promise<ProposeSetResult> {
  await tx
    .update(authoringChat)
    .set({ messages: a.messages, updatedAt: new Date() })
    .where(eq(authoringChat.id, a.row.id));
  return proposeTargetSet(tx, {
    tutorUserId: a.tutorUserId,
    chatId: a.row.id,
    intent: setIntentForMode(a.row.mode),
  });
}

/** The ChatView returned when a go-ahead resolved a SET: the proposal rides back on
 *  the turn and NOTHING was enqueued, so no job id is set and `subTopicId` keeps the
 *  chat's existing focus (the set spans several — pinning one would be a lie). */
function buildProposedSetView(
  row: Awaited<ReturnType<typeof ownedChat>>,
  vendor: VendorChoice,
  messages: ChatMessage[],
  proposedSet: ProposeSetResult,
): ChatView {
  return {
    chatId: row.id,
    studentId: row.studentId,
    chapterId: row.chapterId ?? null,
    chapterIds: chatChapterIds(row),
    subTopicIds: chatSubTopicIds(row),
    mode: (row.mode as AuthoringMode) ?? "blocked",
    authorGrain: grainOf(row),
    subTopicId: row.subTopicId ?? null,
    vendor,
    messages,
    proposedSet,
  };
}

/**
 * One conversational turn. Appends the tutor's message, resolves resume-vs-
 * stitch (per-thread vendor lock + Claude JSONL preflight), calls the vendor via
 * the orchestrator, persists the assistant turn with its continuation handle.
 * Ported from unit_chat.sendUnitChatTurnInner, trimmed of tools/interactive.
 */
export async function sendTurn(
  tx: Tx,
  args: {
    tutorUserId: string;
    chatId: string;
    text: string;
    streamKey?: string;
    /** Slice TWOWAY-1: when a go-ahead fires, plan first (default) or draft straight
     *  through. Defaults to TRUE so the gate is the behaviour you get unless the
     *  tutor explicitly skipped it — a missing flag must never silently mean "skip
     *  the review the founder asked for". */
    planFirst?: boolean;
    /** Slice CHAT-SET-ROUTE sent the One/Several toggle per-turn. SEVERAL-THREAD
     *  moved it onto the chat row (`author_grain`), so this is now ACCEPTED AND
     *  IGNORED: the thread's own grain wins.
     *
     *  Deliberately not removed. The grain decides which system prompt the thread
     *  was BORN under, and a client that still sends the old field — a stale tab,
     *  an in-flight request across a deploy — must not be able to contradict that.
     *  Honouring it would fan out a thread whose prompt says "one", which is the
     *  precise mismatch this slice exists to remove. Drop the field only once no
     *  deployed bundle sends it. */
    setMode?: boolean;
  },
): Promise<ChatView> {
  const row = await ownedChat(tx, args.tutorUserId, args.chatId);
  const text = args.text.trim();
  if (!text) throw new Error("message is empty");

  const vendor = row.vendor as VendorChoice;
  const history = parseMessages(row.messages);
  // TWOWAY-1: default TRUE — the gate is what you get unless the tutor skipped it.
  const planFirst = args.planFirst !== false;
  // SEVERAL-THREAD: the GRAIN, off the row — never args.setMode (see above). This
  // is the single source for both the system prompt and the go-ahead routing, so
  // the two cannot disagree: a thread that was told "several" fans out, and a
  // thread that was told "one" never does.
  const grain = grainOf(row);
  const setMode = grain === "several";

  const userMsg: ChatMessage = {
    id: randomUUID(),
    role: "user",
    text,
    createdAt: new Date().toISOString(),
  };

  // ── Slice TWOWAY-FIX: the SERVER-SIDE gate guard. ──
  // The FE disables the composer while a plan awaits its gate (TutorPage), but that
  // is client-side only — and a tab running a PRE-TWOWAY-1 bundle has no gate card,
  // no plan poll, and omits `planFirst` (which defaults TRUE here). Its go-ahead
  // therefore enqueued ANOTHER plan, whose text relayed into the transcript, which
  // the tutor answered with another go-ahead: an unbounded plan loop that can never
  // reach drafting. Observed on prod 2026-07-24 — two chats, two planned episodes
  // each, ZERO drafts.
  //
  // So: refuse to start new authoring work while this chat has an episode awaiting a
  // gate, and say so IN-BAND. The reply is the self-heal — a stale tab cannot render
  // the card, but it CAN render this sentence, which tells the tutor to refresh.
  // No AI call and no enqueue: a stuck tab costs nothing and creates nothing.
  //
  // Safe against the gate procedures by construction: approve → 'drafting', amend →
  // 'planning', dismiss → 'abandoned'. All three leave 'planned', so none can be
  // blocked by this. It also (deliberately) blocks the planFirst=false skip — a
  // parallel draft raised while a plan is pending is the same confusion; dismiss the
  // plan first.
  const openGate = await pendingPlanFor(tx, row.id);
  if (openGate) {
    const gateMsg: ChatMessage = {
      id: randomUUID(),
      role: "assistant",
      text: GATE_OPEN_REPLY,
      createdAt: new Date().toISOString(),
    };
    const messages = [...history, userMsg, gateMsg];
    await tx
      .update(authoringChat)
      .set({ messages, updatedAt: new Date() })
      .where(eq(authoringChat.id, row.id));
    return {
      chatId: row.id,
      studentId: row.studentId,
      chapterId: row.chapterId ?? null,
      chapterIds: chatChapterIds(row),
      subTopicIds: chatSubTopicIds(row),
      mode: (row.mode as AuthoringMode) ?? "blocked",
      authorGrain: grainOf(row),
      subTopicId: row.subTopicId ?? null,
      vendor,
      messages,
      pendingPlan: openGate,
    };
  }

  // Grounding is assembled once and woven into the FIRST (stitched) user turn;
  // on resumed turns it already lives in the vendor session.
  const grounding = await assembleGrounding(tx, {
    tutorUserId: args.tutorUserId,
    studentId: row.studentId,
    chapterIds: chatChapterIds(row),
    subTopicIds: chatSubTopicIds(row),
  });

  const buildStitched = (): string => {
    const convo = history
      .map((m) => `${m.role === "user" ? "TUTOR" : "YOU"}: ${m.text}`)
      .join("\n\n");
    return [
      grounding,
      "",
      convo ? `===== CONVERSATION SO FAR =====\n${convo}\n===== END CONVERSATION =====\n` : "",
      `TUTOR: ${text}`,
      "",
      "Reply as the authoring partner.",
    ].join("\n");
  };

  // Resume path: prior assistant turn has a continuation handle from the SAME
  // vendor (Claude also requires the JSONL still on disk). Else stitched.
  const prevSessionId = lastResumableSessionId(history);
  const prevVendor = lastAssistantVendor(history);
  const sameVendor = prevVendor === vendor;
  const needsJsonlPreflight = vendor === "claude_cli";
  const isGemini = vendor === "gemini_api";

  // A (Slice AUTH-fix): Gemini NEVER resumes. The malformed-function-call 400 +
  // fake-tool-call leaks were faults on a poisoned RESUMED interaction; the
  // stitched prompt already carries the full conversation, so re-stitching every
  // turn loses nothing (Gemini bills full context on resume anyway) and removes
  // the poisoned-interaction class entirely. Claude still resumes (it needs
  // --resume + is not the fragile vendor).
  const canResume =
    prevSessionId !== null &&
    sameVendor &&
    !isGemini &&
    (!needsJsonlPreflight || (await jsonlExists(prevSessionId)));

  // Both vendors author in-chat by picking the target BY NUMBER (Gemini via the
  // [[AUTHOR_NOW]] sentinel + resolveAuthorIntent; Claude via the fenced marker) —
  // so give EVERY turn the chapter's numbered sub-topic list (the same allowlist
  // proposeTarget uses). Small + always current, so the numbering both paths
  // reference is stable regardless of resume.
  let subs: SubRef[] = [];
  let targetsBlock = "";
  const turnChapterIds = chatChapterIds(row);
  if (turnChapterIds.length > 0) {
    subs = await tx
      .select({
        subTopicId: subTopic.id,
        subTopicName: subTopic.name,
        topicName: topic.name,
        chapterName: chapter.name,
      })
      .from(subTopic)
      .innerJoin(topic, eq(topic.id, subTopic.topicId))
      .innerJoin(chapter, eq(chapter.id, topic.chapterId))
      .where(inArray(topic.chapterId, turnChapterIds))
      .orderBy(asc(chapter.ordinal), asc(topic.ordinal), asc(subTopic.ordinal));
    if (subs.length > 0) {
      // Multi-chapter (interleaved) → prefix the chapter so the number the tool
      // references maps to an unambiguous target across chapters.
      const multi = turnChapterIds.length > 1;
      const list = subs
        .map(
          (s, i) =>
            `  ${i + 1}. ${multi ? `${s.chapterName} › ` : ""}${s.topicName} › ${s.subTopicName}`,
        )
        .join("\n");
      targetsBlock = `\n\n===== AUTHORING TARGETS (pick ONE by its number when authoring) =====\n${list}\n===== END AUTHORING TARGETS =====`;
    }
  }

  let userMessage: string;
  let resumeSessionId: string | undefined;
  if (canResume && prevSessionId) {
    userMessage = `TUTOR: ${text}\n\nReply as the authoring partner.`;
    resumeSessionId = prevSessionId;
  } else {
    userMessage = buildStitched();
  }
  userMessage += targetsBlock;

  const call = (resumeId: string | undefined, msg: string) =>
    complete({
      systemPrompt: chatSystemFor(vendor, grain === "several"),
      userMessage: msg,
      endpoint: AUTHORING_CHAT_ENDPOINT,
      userId: args.tutorUserId,
      model: "", // vendor default (claude opus / gemini pro)
      timeoutSec: CHAT_TIMEOUT_SEC,
      streamKey: args.streamKey,
      resumeSessionId: resumeId,
      vendorId: vendor as VendorId,
      slotId: AUTHORING_CHAT_ENDPOINT,
    });

  let ai: Awaited<ReturnType<typeof complete>>;
  try {
    ai = await call(resumeSessionId, userMessage);
  } catch (err) {
    // Stale interaction id → drop resume + retry stitched (unit_chat iter-3.5).
    // Gemini never resumes (A), so this only ever fires for Claude. Others bubble.
    if (resumeSessionId !== undefined && isStaleInteractionError(err)) {
      ai = await call(undefined, buildStitched() + targetsBlock);
    } else {
      throw err;
    }
  }

  // ── Gemini in-chat authoring (Slice AUTH-fix B): the conversational model
  //    signalled a go-ahead with the [[AUTHOR_NOW]] sentinel (no native
  //    function-call — that path 400'd on malformed JSON). A SEPARATE
  //    responseSchema call (resolveAuthorIntent) resolves the target {choice,count}
  //    from the conversation, then the SAME resolve→spawn→persist path the button
  //    uses drafts into the review form (decision 2b — NOT saved here). Any
  //    resolve/author failure is CAUGHT and degrades to a normal reply — never a
  //    500 (the exact failure the old native tool produced). ──
  if (isGemini && subs.length > 0 && hasAuthorSentinel(ai.text)) {
    try {
      // CHAT-SET-ROUTE: the tutor has "Several" selected → this go-ahead resolves a
      // SET, not one target. Checked BEFORE resolveAuthorIntent so the single-target
      // resolver's AI call is never spent on a turn that isn't going to use it.
      if (setMode) {
        const wrapText = stripAuthorSentinel(sanitiseAssistantText(ai.text)) || SET_PROPOSAL_WRAP;
        const assistantMsg: ChatMessage = {
          id: randomUUID(),
          role: "assistant",
          text: wrapText,
          createdAt: new Date().toISOString(),
          aiSessionId: ai.sessionId ?? undefined,
          vendorId: vendor,
          sessionFingerprint: ai.sessionFingerprint,
        };
        const messages = [...history, userMsg, assistantMsg];
        const proposedSet = await runSetGoAhead(tx, {
          row,
          tutorUserId: args.tutorUserId,
          messages,
        });
        return buildProposedSetView(row, vendor, messages, proposedSet);
      }

      const convoForIntent = [
        ...history.map((m) => `${m.role === "user" ? "TUTOR" : "AI"}: ${m.text}`),
        `TUTOR: ${text}`,
        `AI: ${stripAuthorSentinel(ai.text)}`,
      ].join("\n\n");
      const intent = await resolveAuthorIntent({
        vendor,
        grounding,
        convo: convoForIntent,
        subs,
        multiChapter: turnChapterIds.length > 1,
        label: row.id,
      });
      // Slice AUTHOR-ASYNC: resolve the target + ENQUEUE the draft off the request
      // path (the worker was the 524s inline hang). The FE polls the job.
      const { chosen, count, jobId, phase } = await resolveTargetAndEnqueue(tx, {
        row,
        tutorUserId: args.tutorUserId,
        subs,
        subTopicNumber: intent.choice,
        count: intent.count,
        planFirst,
      });

      // Wrap-up = the model's own confirming prose with the sentinel stripped (no
      // follow-up call needed — the reply already announced the drafting); fall
      // back to a canned line if stripping left nothing. The work runs ASYNC, so the
      // fallback speaks to that — and to the PHASE, so the tutor isn't told "drafting"
      // when what is coming back is a plan to approve.
      const wrapText =
        stripAuthorSentinel(sanitiseAssistantText(ai.text)) ||
        fallbackWrapText(phase, count, chosen.subTopicName);

      const assistantMsg: ChatMessage = {
        id: randomUUID(),
        role: "assistant",
        text: wrapText,
        createdAt: new Date().toISOString(),
        aiSessionId: ai.sessionId ?? undefined,
        vendorId: vendor,
        sessionFingerprint: ai.sessionFingerprint,
      };
      const messages = [...history, userMsg, assistantMsg];
      await tx
        .update(authoringChat)
        .set({ messages, updatedAt: new Date() })
        .where(eq(authoringChat.id, row.id));

      return buildDraftingView(row, vendor, chosen, messages, jobId, phase);
    } catch (err) {
      // Resolve/author failed (resolver bad JSON, worker error, …) → degrade to a
      // normal reply. The tutor sees the confirming text and can re-ask or use the
      // "Suggest what to work on" button; nothing 500s.
      console.error(
        `[authoring-chat] gemini author-intent resolve failed, degrading to reply: ${(err as Error).message.slice(0, 200)}`,
      );
    }
  }

  // ── Claude in-chat authoring (parity with the Gemini tool, via a text marker):
  //    Claude CLI can't emit a structured function_call, so on a clear go-ahead it
  //    emits a fenced ```author_questions {json}``` block. Parse it, run the SAME
  //    resolve→spawn→persist path, and strip the marker from the shown text. An
  //    absent or malformed marker → parseAuthorMarker returns null → fall through
  //    to the normal reply (nothing authored). ──
  if (!isGemini && subs.length > 0) {
    const marker = parseAuthorMarker(ai.text);
    if (marker) {
      // CHAT-SET-ROUTE: "Several" is on → resolve a SET and stop at the proposal.
      // Wrapped in its own try/catch because this branch (unlike Gemini's) has none:
      // proposeTargetSet throws on NO_CHAPTER / a bad model payload, and that must
      // degrade to an ordinary reply rather than 500 a conversational endpoint.
      if (setMode) {
        try {
          const wrapText = stripAuthorMarker(ai.text) || SET_PROPOSAL_WRAP;
          const assistantMsg: ChatMessage = {
            id: randomUUID(),
            role: "assistant",
            text: wrapText,
            createdAt: new Date().toISOString(),
            aiSessionId: ai.sessionId ?? undefined,
            vendorId: vendor,
            sessionFingerprint: ai.sessionFingerprint,
          };
          const messages = [...history, userMsg, assistantMsg];
          const proposedSet = await runSetGoAhead(tx, {
            row,
            tutorUserId: args.tutorUserId,
            messages,
          });
          return buildProposedSetView(row, vendor, messages, proposedSet);
        } catch (err) {
          console.error(
            `[authoring-chat] claude set-route resolve failed, degrading to reply: ${(err as Error).message.slice(0, 200)}`,
          );
        }
      }

      // Slice AUTHOR-ASYNC: same as the Gemini path — resolve + ENQUEUE off the
      // request path (the worker draft was the inline hang), the FE polls the job.
      const { chosen, count, jobId, phase } = await resolveTargetAndEnqueue(tx, {
        row,
        tutorUserId: args.tutorUserId,
        subs,
        subTopicNumber: marker.subTopicNumber,
        count: marker.count,
        planFirst,
      });

      // Wrap-up = Claude's own prose with the directive block removed (no follow-up
      // call — Claude has no tool schema to hand a result back to); fall back to a
      // phase-accurate canned line if stripping left nothing.
      const wrapText =
        stripAuthorMarker(ai.text) || fallbackWrapText(phase, count, chosen.subTopicName);

      const assistantMsg: ChatMessage = {
        id: randomUUID(),
        role: "assistant",
        text: wrapText,
        createdAt: new Date().toISOString(),
        aiSessionId: ai.sessionId ?? undefined,
        vendorId: vendor,
        sessionFingerprint: ai.sessionFingerprint,
      };
      const messages = [...history, userMsg, assistantMsg];
      await tx
        .update(authoringChat)
        .set({ messages, updatedAt: new Date() })
        .where(eq(authoringChat.id, row.id));

      return buildDraftingView(row, vendor, chosen, messages, jobId, phase);
    }
  }

  // ── Normal path: persist the assistant turn as-is. On Gemini, sanitise a stray
  //    "thought"/"tool_code" leak AND strip any [[AUTHOR_NOW]] sentinel (present
  //    but not authored — e.g. the resolve above degraded, or the model emitted it
  //    spuriously); Claude text is passed through. ──
  const assistantMsg: ChatMessage = {
    id: randomUUID(),
    role: "assistant",
    text: isGemini
      ? stripAuthorSentinel(sanitiseAssistantText(ai.text) || ai.text)
      : ai.text,
    createdAt: new Date().toISOString(),
    aiSessionId: ai.sessionId ?? undefined,
    vendorId: vendor,
    sessionFingerprint: ai.sessionFingerprint,
  };

  const messages = [...history, userMsg, assistantMsg];
  await tx
    .update(authoringChat)
    .set({ messages, updatedAt: new Date() })
    .where(eq(authoringChat.id, row.id));

  return {
    chatId: row.id,
    studentId: row.studentId,
    chapterId: row.chapterId ?? null,
    chapterIds: chatChapterIds(row),
    subTopicIds: chatSubTopicIds(row),
    mode: (row.mode as AuthoringMode) ?? "blocked",
    authorGrain: grainOf(row),
    subTopicId: row.subTopicId ?? null,
    vendor,
    messages,
  };
}

// ───────────────────────── author (structured call, fork 4) ─────────────────────────

export type AuthorFromChatResult = {
  chatId: string;
  studentId: string;
  subTopicId: string;
  subTopicName: string;
  topicName: string;
  chapterName: string;
  nextOrdinal: number;
  drafts: PersistedDraft[]; // FIG-AUTH: persisted (status='draft') with ids for render/preview
};

/**
 * Fast-fail guard for the authorFromChat BUTTON route (Slice AUTHOR-ASYNC). The
 * route enqueues the draft and returns a jobId at once, so it validates the target
 * on the request path FIRST — a bogus/cross-scope sub_topic or a non-owned chat
 * must 404 the click, not fail silently in a queued job the tutor then polls. The
 * worker's authorFromChat re-runs the same guard (cheap). Mirrors reviseDraftQuestion
 * asserting ownership before enqueue.
 */
/**
 * Slice TWOWAY-FIX: the BUTTON route's half of the gate guard. sendTurn answers an
 * under-gate turn in-band (it has a transcript to answer into); an explicit author
 * click has no such channel, so it fails loudly instead. Deliberately NOT folded
 * into assertAuthorTarget: the worker re-runs that guard for its own draft, and a
 * draft raised BY an approval must never be blocked by the episode it came from.
 */
export async function assertNoOpenGate(tx: Tx, chatId: string): Promise<void> {
  if (await pendingPlanFor(tx, chatId)) throw new AuthoringGateOpenError(chatId);
}

export async function assertAuthorTarget(
  tx: Tx,
  args: { tutorUserId: string; chatId: string; subTopicId: string },
): Promise<void> {
  const row = await ownedChat(tx, args.tutorUserId, args.chatId); // → AuthoringChatNotFoundError
  const [st] = await tx
    .select({ chapterId: chapter.id })
    .from(subTopic)
    .innerJoin(topic, eq(topic.id, subTopic.topicId))
    .innerJoin(chapter, eq(chapter.id, topic.chapterId))
    .where(eq(subTopic.id, args.subTopicId));
  if (!st) throw new SubTopicNotFoundError(args.subTopicId);
  const scopeChapterIds = chatChapterIds(row);
  if (scopeChapterIds.length > 0 && !scopeChapterIds.includes(st.chapterId)) {
    throw new SubTopicNotFoundError(args.subTopicId);
  }
}

/**
 * Author N subjective questions to the student's weakness, using the chat as
 * intent. ONE structured call, reads-only/re-runnable. Honors the chat's vendor:
 * Gemini → geminiJson (responseSchema); Claude CLI → prompted JSON + extractJson.
 *
 * Slice AUTHOR-ASYNC: this now runs IN THE WORKER (off the request path). Both the
 * authorFromChat button route and the in-chat sentinel/marker paths enqueue a job
 * that lands here; the request path only resolves the target + enqueues.
 */
export async function authorFromChat(
  tx: Tx,
  args: {
    tutorUserId: string;
    chatId: string;
    subTopicId: string;
    count: number;
    /** Slice TWOWAY-1: the planned episode the tutor approved. Absent on the
     *  plan-skip path and the interleaved fan-out, which stay one-shot. */
    workerId?: string;
  },
): Promise<AuthorFromChatResult> {
  const row = await ownedChat(tx, args.tutorUserId, args.chatId);
  const history = parseMessages(row.messages);

  const [st] = await tx
    .select({
      id: subTopic.id,
      name: subTopic.name,
      topicName: topic.name,
      chapterId: chapter.id,
      chapterName: chapter.name,
    })
    .from(subTopic)
    .innerJoin(topic, eq(topic.id, subTopic.topicId))
    .innerJoin(chapter, eq(chapter.id, topic.chapterId))
    .where(eq(subTopic.id, args.subTopicId));
  if (!st) throw new SubTopicNotFoundError(args.subTopicId);
  // Chapter-scope guard (Slice AUTH-v2.1 / QA3-d): the confirmed sub_topic MUST live
  // in ONE of the chat's chosen chapters (one for blocked, N for interleaved) — the
  // anchor can't escape the hierarchy the tutor picked.
  const scopeChapterIds = chatChapterIds(row);
  if (scopeChapterIds.length > 0 && !scopeChapterIds.includes(st.chapterId)) {
    throw new SubTopicNotFoundError(args.subTopicId);
  }
  // Persist the authoring focus (also set by proposeTarget; kept in sync when
  // authorFromChat is called directly).
  await tx
    .update(authoringChat)
    .set({ subTopicId: args.subTopicId, updatedAt: new Date() })
    .where(eq(authoringChat.id, row.id));

  const nextOrdinal = await nextOrdinalFor(tx, args.subTopicId);

  // The tutor's intent, distilled from the conversation → the worker's brief.
  const brief = history
    .map((m) => `${m.role === "user" ? "TUTOR" : "AI"}: ${m.text}`)
    .join("\n\n");

  // QA3-e: spawn a FRESH scoped worker for this ONE sub_topic — it assembles its
  // own narrow slice (method pack + raw topics.md + LOs + bank) from the brief.
  // Replaces the in-line broad-grounding structured call (runVendoredAuthorCall).
  const { drafts } = await spawnAuthoringWorker(tx, {
    boardId: row.boardId,
    chatId: row.id,
    subTopicId: args.subTopicId,
    vendor: row.vendor as VendorChoice,
    count: args.count,
    brief,
    // TWOWAY-1: when the tutor approved a plan, the draft appends to that episode
    // and is told to write the approved items (rather than re-deciding them).
    ...(args.workerId ? { workerRowId: args.workerId } : {}),
  });

  // FIG-AUTH (D-FIG-5): persist as draft rows (ids for render/preview); not live.
  const persisted = await persistDrafts(tx, {
    boardId: row.boardId,
    subTopicId: args.subTopicId,
    targetStudentId: row.studentId,
    drafts,
  });

  return {
    chatId: row.id,
    studentId: row.studentId,
    subTopicId: args.subTopicId,
    subTopicName: st.name,
    topicName: st.topicName,
    chapterName: st.chapterName,
    nextOrdinal,
    drafts: persisted,
  };
}

// ───────────────────── Slice TWOWAY-1: the plan phase + the gate ─────────────────────

export type AuthoringPlanResult = {
  phase: "plan";
  chatId: string;
  studentId: string;
  workerId: string;
  subTopicId: string;
  subTopicName: string;
  topicName: string;
  chapterName: string;
  plan: WorkerPlan;
};

/** Resolve + scope-guard a sub_topic against a chat, and pin it as the chat's
 *  focus. Shared by the plan phase and authorFromChat so the two can never
 *  disagree about what is in scope. */
async function resolveScopedSubTopic(
  tx: Tx,
  row: Awaited<ReturnType<typeof ownedChat>>,
  subTopicId: string,
) {
  const [st] = await tx
    .select({
      id: subTopic.id,
      name: subTopic.name,
      topicName: topic.name,
      chapterId: chapter.id,
      chapterName: chapter.name,
    })
    .from(subTopic)
    .innerJoin(topic, eq(topic.id, subTopic.topicId))
    .innerJoin(chapter, eq(chapter.id, topic.chapterId))
    .where(eq(subTopic.id, subTopicId));
  if (!st) throw new SubTopicNotFoundError(subTopicId);
  const scopeChapterIds = chatChapterIds(row);
  if (scopeChapterIds.length > 0 && !scopeChapterIds.includes(st.chapterId)) {
    throw new SubTopicNotFoundError(subTopicId);
  }
  await tx
    .update(authoringChat)
    .set({ subTopicId, updatedAt: new Date() })
    .where(eq(authoringChat.id, row.id));
  return st;
}

/**
 * The PLAN job's body (Slice TWOWAY-1). Runs IN THE WORKER, off the request path —
 * a plan is a real AI call and belongs behind the same queue the draft does.
 *
 * Two writes, both in this tx, both append-only:
 *  1. the worker EPISODE gets the plan turn (planAuthoringWork), status 'planned';
 *  2. the MASTER transcript gets a condensed RELAY of the plan as an assistant turn.
 *
 * (2) is a one-way DERIVED write, not a synced copy — nothing ever reads the worker
 * conversation back out of the master transcript. It exists because the master model
 * has to be able to talk about the plan on the next turn ("make them harder" is
 * meaningless if the master can't see what "them" is).
 *
 * The relay turn deliberately carries NO aiSessionId. lastResumableSessionId stops
 * at the newest assistant turn, so a relay with a borrowed session id would resume a
 * vendor session whose own context never contained the plan — the exact
 * resume-across-a-context-change corruption we avoid elsewhere. With no handle the
 * next master turn falls back to STITCHED, which carries the plan text in the
 * transcript. Cost: one stitched turn. It self-heals — the next real assistant turn
 * captures a fresh handle.
 */
export async function planFromChat(
  tx: Tx,
  args: {
    tutorUserId: string;
    chatId: string;
    subTopicId: string;
    count: number;
    /** An existing episode to re-plan (an amendment); absent = a first plan. */
    workerId?: string;
  },
): Promise<AuthoringPlanResult> {
  const row = await ownedChat(tx, args.tutorUserId, args.chatId);
  const st = await resolveScopedSubTopic(tx, row, args.subTopicId);
  const history = parseMessages(row.messages);

  // Same brief the draft phase uses — the master conversation flattened.
  const brief = history
    .map((m) => `${m.role === "user" ? "TUTOR" : "AI"}: ${m.text}`)
    .join("\n\n");

  const { workerId, plan } = await planAuthoringWork(tx, {
    boardId: row.boardId,
    chatId: row.id,
    subTopicId: args.subTopicId,
    vendor: row.vendor as VendorChoice,
    count: args.count,
    brief,
    ...(args.workerId ? { workerRowId: args.workerId } : {}),
  });

  // The relay. Re-read the chat inside this tx: the plan call took minutes, and the
  // tutor may have sent further turns in the meantime — appending to the stale
  // `history` snapshot would silently delete them.
  const [fresh] = await tx
    .select({ messages: authoringChat.messages })
    .from(authoringChat)
    .where(eq(authoringChat.id, row.id));
  const relay: ChatMessage = {
    id: randomUUID(),
    role: "assistant",
    text: `Here's my plan for **${st.name}** before I write anything:\n\n${renderPlanText(plan)}`,
    createdAt: new Date().toISOString(),
    vendorId: row.vendor,
  };
  await tx
    .update(authoringChat)
    .set({
      messages: [...parseMessages(fresh?.messages ?? row.messages), relay],
      updatedAt: new Date(),
    })
    .where(eq(authoringChat.id, row.id));

  return {
    phase: "plan",
    chatId: row.id,
    studentId: row.studentId,
    workerId,
    subTopicId: st.id,
    subTopicName: st.name,
    topicName: st.topicName,
    chapterName: st.chapterName,
    plan,
  };
}

/** The plan awaiting a gate on this chat, or null. Mirrors `pendingDrafts`: the
 *  gate card is rendered from THIS, never from the relay turn in the transcript, so
 *  every resume path (refresh, history picker, remount) restores it identically and
 *  a relay whose gate was already answered can't re-open as a live card. */
export type PendingPlanView = {
  workerId: string;
  subTopicId: string;
  subTopicName: string;
  topicName: string;
  chapterName: string;
  plan: WorkerPlan;
  createdAt: string;
};

async function pendingPlanFor(
  tx: Tx,
  chatId: string,
): Promise<PendingPlanView | null> {
  const [row] = await tx
    .select({
      id: authoringWorker.id,
      subTopicId: authoringWorker.subTopicId,
      messages: authoringWorker.messages,
      subTopicName: subTopic.name,
      topicName: topic.name,
      chapterName: chapter.name,
    })
    .from(authoringWorker)
    .innerJoin(subTopic, eq(subTopic.id, authoringWorker.subTopicId))
    .innerJoin(topic, eq(topic.id, subTopic.topicId))
    .innerJoin(chapter, eq(chapter.id, topic.chapterId))
    .where(
      and(
        eq(authoringWorker.chatId, chatId),
        eq(authoringWorker.status, "planned"),
      ),
    )
    .orderBy(desc(authoringWorker.createdAt))
    .limit(1);
  if (!row) return null;
  const turns = parseWorkerTurns(row.messages);
  const latest = [...turns].reverse().find((t) => t.kind === "plan");
  if (!latest?.plan) return null;
  return {
    workerId: row.id,
    subTopicId: row.subTopicId,
    subTopicName: row.subTopicName,
    topicName: row.topicName,
    chapterName: row.chapterName,
    plan: latest.plan,
    createdAt: latest.createdAt,
  };
}

/** Same drop-don't-throw tolerance as the worker-side parse: a malformed turn must
 *  not make an episode permanently unopenable. */
function parseWorkerTurns(raw: unknown): WorkerTurn[] {
  const arr = Array.isArray(raw) ? raw : [];
  const out: WorkerTurn[] = [];
  for (const t of arr) {
    const parsed = WorkerTurn.safeParse(t);
    if (parsed.success) out.push(parsed.data);
  }
  return out;
}

/** Load an episode that is genuinely awaiting this tutor's gate, or throw. The
 *  status check is the load-bearing half: without it an Approve could be replayed
 *  (double-draft) or fire against an episode a re-plan is already rewriting. */
async function gatedEpisode(
  tx: Tx,
  args: { tutorUserId: string; chatId: string; workerId: string },
) {
  const row = await ownedChat(tx, args.tutorUserId, args.chatId);
  const [ep] = await tx
    .select()
    .from(authoringWorker)
    .where(
      and(
        eq(authoringWorker.id, args.workerId),
        eq(authoringWorker.chatId, args.chatId),
        eq(authoringWorker.status, "planned"),
      ),
    )
    .limit(1);
  if (!ep) throw new AuthoringPlanNotFoundError(args.workerId);
  const turns = parseWorkerTurns(ep.messages);
  const plan = [...turns].reverse().find((t) => t.kind === "plan")?.plan ?? null;
  return { chat: row, ep, turns, plan };
}

/**
 * The tutor APPROVED the plan → move the episode to 'drafting' and hand back what
 * the draft job needs. The count is the PLAN's item count, not a tutor-editable
 * number: the tutor approved N specific items, so drafting a different N would mean
 * drafting something that was never approved. Wanting a different number is an
 * amendment ("make it 5"), which re-plans.
 */
export async function approveAuthoringPlan(
  tx: Tx,
  args: { tutorUserId: string; chatId: string; workerId: string },
): Promise<{ subTopicId: string; count: number; boardId: string }> {
  const { ep, plan } = await gatedEpisode(tx, args);
  if (!plan || plan.items.length === 0) throw new PlanHasNoItemsError();
  await tx
    .update(authoringWorker)
    .set({ status: "drafting" })
    .where(eq(authoringWorker.id, ep.id));
  return {
    subTopicId: ep.subTopicId,
    count: Math.min(Math.max(plan.items.length, 1), 8),
    boardId: ep.boardId,
  };
}

/**
 * The tutor AMENDED the plan → append their words to the worker's own history and
 * re-plan. Two appends, one action, both append-only: the worker gets a `tutor`
 * turn (so its next plan is a revision of its own prior thinking, not a fresh
 * guess) and the master transcript gets the same words as a user turn (so the
 * master model stays coherent about what was asked).
 */
export async function amendAuthoringPlan(
  tx: Tx,
  args: {
    tutorUserId: string;
    chatId: string;
    workerId: string;
    note: string;
  },
): Promise<{ subTopicId: string; count: number; boardId: string }> {
  const note = args.note.trim();
  if (!note) throw new Error("amendment is empty");
  const { chat, ep, turns, plan } = await gatedEpisode(tx, args);

  const amendment: WorkerTurn = {
    id: randomUUID(),
    role: "tutor",
    kind: "amendment",
    text: note,
    createdAt: new Date().toISOString(),
  };
  await tx
    .update(authoringWorker)
    .set({ messages: [...turns, amendment], status: "planning" })
    .where(eq(authoringWorker.id, ep.id));

  const userTurn: ChatMessage = {
    id: randomUUID(),
    role: "user",
    text: note,
    createdAt: new Date().toISOString(),
  };
  await tx
    .update(authoringChat)
    .set({
      messages: [...parseMessages(chat.messages), userTurn],
      updatedAt: new Date(),
    })
    .where(eq(authoringChat.id, chat.id));

  // Re-plan at the size the worker last proposed (an amendment that changes the
  // count says so in its own words, and the re-plan is free to plan a different N).
  const count = Math.min(Math.max(plan?.items.length ?? 3, 1), 8);
  return { subTopicId: ep.subTopicId, count, boardId: ep.boardId };
}

/** The tutor dismissed the plan without drafting. Terminal — the episode is closed
 *  so it can't come back as a live gate, and a fresh author opens a new episode. */
export async function dismissAuthoringPlan(
  tx: Tx,
  args: { tutorUserId: string; chatId: string; workerId: string },
): Promise<void> {
  const { ep } = await gatedEpisode(tx, args);
  await tx
    .update(authoringWorker)
    .set({ status: "abandoned" })
    .where(eq(authoringWorker.id, ep.id));
}

/**
 * The vendor-aware structured-JSON call — the one place the two vendors diverge
 * (fork 4 + CLI-Claude reality). Gemini = schema-constrained generation; Claude
 * CLI = prompted JSON + extractJsonObject with a retry (no schema-constrained
 * output, micro-decision #2). BOTH run UNCAPPED (model default) — every structured
 * call here (author N questions / revise one / propose a target) is on a gemini-3
 * thinking model where maxOutputTokens bounds thinking + answer together, so a cap
 * near the answer size would starve the thinking (ai-build-miss M28). Shared by
 * authorFromChat, reviseDraft, and proposeTarget.
 */
async function runVendoredJson<T>(opts: {
  vendor: VendorChoice;
  geminiSystem: string;
  geminiResponseSchema: unknown;
  claudeSystem: string; // includes the strict-JSON-shape instruction
  prompt: string;
  parse: (raw: unknown) => T;
  label: string;
  endpoint: string;
}): Promise<T> {
  if (opts.vendor === "gemini_api") {
    const raw = await geminiJson<unknown>({
      label: opts.label,
      systemInstruction: opts.geminiSystem,
      prompt: opts.prompt,
      responseSchema: opts.geminiResponseSchema as never,
      maxOutputTokens: null,
    });
    return opts.parse(raw);
  }

  // Claude CLI: prompt for JSON, extractJsonObject + parse, retry ONCE on a
  // missing/unparseable object (transient — usually clean on a fresh frame).
  let lastErr: unknown;
  for (let attempt = 1; attempt <= 2; attempt++) {
    const ai = await complete({
      systemPrompt: opts.claudeSystem,
      userMessage: opts.prompt,
      endpoint: opts.endpoint,
      model: "", // vendor default (opus)
      timeoutSec: CHAT_TIMEOUT_SEC,
      vendorId: "claude_cli",
      slotId: opts.endpoint,
    });
    try {
      const parsed = extractJsonObject<unknown>(ai.text);
      if (parsed === null) {
        throw new Error(`claude ${opts.label} returned no parseable JSON: ${ai.text.slice(0, 200)}`);
      }
      return opts.parse(parsed);
    } catch (err) {
      lastErr = err;
      console.error(
        `[authoring-chat] ${opts.label} claude attempt=${attempt} parse FAILED: ${(err as Error).message.slice(0, 200)}`,
      );
    }
  }
  throw lastErr;
}

// ───────────────────────── proposeTarget (consent-in-chat, allowlist-bound) ─────────────────────────

const PROPOSE_SYSTEM = `You help a tutor decide which ONE sub-topic to author practice questions for — for a specific student — and how many. You are given the student's grounding (two-axis mastery + Stage-1 observations), the conversation so far, and a NUMBERED list of the chapter's sub-topics. Pick the single sub-topic that best targets the student's genuine weakness and the tutor's stated intent. Choose a count between 1 and 8 (default 3 unless the conversation asked for a specific number). You MUST pick by the list's number — never invent a sub-topic. Return ONLY {choice, count, rationale}.`;

const proposeResultSchema = z.object({
  choice: z.number().int(),
  count: z.number().int(),
  rationale: z.string().default(""),
});

const geminiProposeSchema = {
  type: Type.OBJECT,
  properties: {
    choice: {
      type: Type.INTEGER,
      description: "the 1-based number of the sub-topic to author for, from the list",
    },
    count: {
      type: Type.INTEGER,
      description: "how many questions to author (1–8); 3 is a sensible default",
    },
    rationale: {
      type: Type.STRING,
      description:
        "one sentence: why this sub-topic + count, grounded in the student's weakness and the conversation",
    },
  },
  required: ["choice", "count", "rationale"],
} as const;

const CLAUDE_PROPOSE_FORMAT = `${PROPOSE_SYSTEM}

OUTPUT FORMAT (STRICT): respond with ONLY a JSON object {"choice":<1-based number>,"count":<1-8>,"rationale":"..."}. No prose, no fences.`;

// ── Author-intent resolver (Slice AUTH-fix B) ────────────────────────────────
// The structured, responseSchema-constrained replacement for Gemini's native
// author_questions function-call. sendTurn calls this ONLY after the conversational
// model emits the [[AUTHOR_NOW]] sentinel; it reads the same grounding +
// conversation + numbered targets and returns {choice,count} via the robust
// runVendoredJson plumbing (Gemini → responseSchema; a parse failure throws →
// sendTurn catches it and degrades to a normal reply). choice/count are clamped
// into the allowlist + 1–8 downstream by resolveTargetAndEnqueue. Reuses proposeTarget's
// schema (choice==subTopicNumber) — this is a SEPARATE call from the conversation
// (fork 4 preserved).
const AUTHOR_INTENT_SYSTEM = `The tutor has just given a clear go-ahead to author practice questions, in a conversation with an authoring partner. From the conversation and a NUMBERED list of the chapter's sub-topics, identify the ONE sub-topic the tutor wants authored RIGHT NOW and how many questions (1–8; use 3 if no number was stated). If several sub-topics were discussed, pick the one the tutor's most recent go-ahead refers to. Choose BY the list's number — never invent a sub-topic. Return ONLY {choice, count, rationale}.`;

async function resolveAuthorIntent(a: {
  vendor: VendorChoice;
  grounding: string;
  convo: string;
  subs: SubRef[];
  multiChapter: boolean;
  label: string;
}): Promise<{ choice: number; count: number }> {
  const list = a.subs
    .map(
      (s, i) =>
        `  ${i + 1}. ${a.multiChapter ? `${s.chapterName} › ` : ""}${s.topicName} › ${s.subTopicName}`,
    )
    .join("\n");
  const prompt = `${a.grounding}

===== CONVERSATION SO FAR =====
${a.convo}
===== END CONVERSATION =====

AUTHORING TARGETS (choose ONE by its number):
${list}

The tutor just gave the go-ahead. Return {choice, count, rationale}.`;
  const parsed = await runVendoredJson<z.infer<typeof proposeResultSchema>>({
    vendor: a.vendor,
    geminiSystem: AUTHOR_INTENT_SYSTEM,
    geminiResponseSchema: geminiProposeSchema,
    claudeSystem: `${AUTHOR_INTENT_SYSTEM}

OUTPUT FORMAT (STRICT): respond with ONLY a JSON object {"choice":<1-based number>,"count":<1-8>,"rationale":"..."}. No prose, no fences.`,
    prompt,
    parse: (raw) => proposeResultSchema.parse(raw),
    label: `author-intent:${a.label}`,
    endpoint: AUTHORING_CALL_ENDPOINT,
  });
  return { choice: parsed.choice, count: parsed.count };
}

export type ProposeTargetResult = {
  chatId: string;
  studentId: string;
  subTopicId: string;
  subTopicName: string;
  topicName: string;
  chapterName: string;
  count: number;
  rationale: string;
};

/**
 * Resolve the authoring target FROM the conversation (consent-in-chat, replaces
 * the v1 picker). The model picks ONE sub_topic BY NUMBER from the chat's chapter
 * allowlist — an index, never a raw UUID (models mangle UUIDs, ai-build-miss M15)
 * — so the anchor is always valid + inside the chosen chapter (fork 4 preserved:
 * this is a SEPARATE structured call from the conversation). Persists the resolved
 * focus on the chat; the tutor confirms it, then authorFromChat runs.
 */
export async function proposeTarget(
  tx: Tx,
  args: { tutorUserId: string; chatId: string },
): Promise<ProposeTargetResult> {
  const row = await ownedChat(tx, args.tutorUserId, args.chatId);
  const scopeChapterIds = chatChapterIds(row);
  if (scopeChapterIds.length === 0) {
    throw new ProposeTargetError("NO_CHAPTER", "this chat has no chapter scope");
  }

  // The allowlist: every chosen chapter's sub_topics, in hierarchy order (one
  // chapter for blocked, N for interleaved — Slice QA3-d).
  const subs = await tx
    .select({
      subTopicId: subTopic.id,
      subTopicName: subTopic.name,
      topicName: topic.name,
      chapterName: chapter.name,
    })
    .from(subTopic)
    .innerJoin(topic, eq(topic.id, subTopic.topicId))
    .innerJoin(chapter, eq(chapter.id, topic.chapterId))
    .where(inArray(topic.chapterId, scopeChapterIds))
    .orderBy(asc(chapter.ordinal), asc(topic.ordinal), asc(subTopic.ordinal));
  if (subs.length === 0) {
    throw new ProposeTargetError("NO_SUBTOPICS", "this chapter has no sub-topics");
  }
  const multiChapter = scopeChapterIds.length > 1;

  const grounding = await assembleGrounding(tx, {
    tutorUserId: args.tutorUserId,
    studentId: row.studentId,
    chapterIds: chatChapterIds(row),
    subTopicIds: chatSubTopicIds(row),
  });
  const history = parseMessages(row.messages);
  const convo = history
    .map((m) => `${m.role === "user" ? "TUTOR" : "AI"}: ${m.text}`)
    .join("\n\n");
  const list = subs
    .map(
      (s, i) =>
        `  ${i + 1}. ${multiChapter ? `${s.chapterName} › ` : ""}${s.topicName} › ${s.subTopicName}`,
    )
    .join("\n");

  const prompt = `${grounding}

===== CONVERSATION SO FAR =====
${convo || "(no conversation yet — use the grounding to pick the student's weakest area)"}
===== END CONVERSATION =====

${multiChapter ? "SUB-TOPICS ACROSS THESE CHAPTERS" : "SUB-TOPICS IN THIS CHAPTER"} (choose ONE by its number):
${list}

Pick the ONE sub-topic to author questions for now and how many (1–8, default 3). Return {choice, count, rationale}.`;

  const parsed = await runVendoredJson<z.infer<typeof proposeResultSchema>>({
    vendor: row.vendor as VendorChoice,
    geminiSystem: PROPOSE_SYSTEM,
    geminiResponseSchema: geminiProposeSchema,
    claudeSystem: CLAUDE_PROPOSE_FORMAT,
    prompt,
    parse: (raw) => proposeResultSchema.parse(raw),
    label: `propose-target:${args.chatId}`,
    endpoint: PROPOSE_ENDPOINT,
  });

  // Clamp both into range — the index MUST land on a real allowlist entry.
  const idx = Math.min(Math.max(parsed.choice, 1), subs.length) - 1;
  const chosen = subs[idx]!;
  const count = Math.min(Math.max(parsed.count, 1), 8);

  await tx
    .update(authoringChat)
    .set({ subTopicId: chosen.subTopicId, updatedAt: new Date() })
    .where(eq(authoringChat.id, row.id));

  const result: ProposeTargetResult = {
    chatId: row.id,
    studentId: row.studentId,
    subTopicId: chosen.subTopicId,
    subTopicName: chosen.subTopicName,
    topicName: chosen.topicName,
    chapterName: chosen.chapterName,
    count,
    rationale: parsed.rationale,
  };
  // PROPOSAL-PERSIST: store what the tutor is being asked to approve, so a remount
  // restores the card instead of discarding a resolved target.
  await persistPendingProposal(tx, row.id, {
    kind: "target",
    createdAt: new Date().toISOString(),
    target: result,
  });
  return result;
}

// ───────────────────────── proposeTargetSet (interleaved fan-out, QA3-e-2) ─────────────────────────

// The set proposer (interleaved authoring). Where proposeTarget picks ONE
// sub_topic, this picks a SET (2–5) that together make a good interleaved
// practice mix across the chat's chosen chapters — the master-side selection that
// feeds the parallel fan-out (authorSetFromChat). Interleaved is a policy of the
// FE (it only offers this in interleaved mode); the service stays general.
const PROPOSE_SET_MAX = 5;
const PROPOSE_SET_ENDPOINT = "authoring.proposeTargetSet";

// ───────────────────────── SET-PLAN-GATE: the item BLUEPRINT ─────────────────────────
//
// Each pick now carries an item blueprint — one entry per question the worker will
// write, mirroring WorkerPlanItem MINUS `n` (the server renumbers 1..N so `n` is
// sequential regardless of what the model emitted). The per-sub-topic COUNT is
// DERIVED from items.length — there is no separate count for the two to drift apart
// (the whole reason single-mode plan-first makes the count non-editable at approve:
// the tutor approved N specific items). authorSetFromChat threads each pick's plan
// into spawnAuthoringWorker, whose drafter ALREADY consumes an approved plan (both
// vendors) — so approving the enriched proposal IS the plan gate, with no second
// AI phase. The shape is defined here (not imported from authoring_worker) because
// the model output omits `n`; WorkerPlanItem (with `n`) is assembled in the resolver.
const proposedItemSchema = z.object({
  axis: z.enum(["conceptual", "procedural", "both"]),
  kind: z.string(),
  intent: z.string(),
  difficulty: z.string(),
});
// Mirrors authoring_worker.ts geminiPlanSchema's item object, minus `n`. Kept in
// sync by hand; the SOFT probe leg (a real call must fill it) is what proves it.
const geminiProposedItems = {
  type: Type.ARRAY,
  description: "one entry per question you will write for this sub-topic, in the order you'd write them",
  items: {
    type: Type.OBJECT,
    properties: {
      axis: {
        type: Type.STRING,
        enum: ["conceptual", "procedural", "both"],
        description: "which mastery axis this question probes",
      },
      kind: {
        type: Type.STRING,
        description: "the conceptual-question kind from the palette",
      },
      intent: {
        type: Type.STRING,
        description: "the specific misconception or skill this question probes",
      },
      difficulty: {
        type: Type.STRING,
        description: "the difficulty setting in words, per the dial catalog",
      },
    },
    required: ["axis", "kind", "intent", "difficulty"],
  },
} as const;

const PROPOSE_SET_SYSTEM = `You help a tutor assemble an INTERLEAVED practice set for a specific student — a MIX of sub-topics (from possibly different chapters) that are worth practising together so the student must DISCRIMINATE between them, not just drill one skill. You are given the student's grounding (two-axis mastery + Stage-1 observations), the conversation so far, and a NUMBERED list of candidate sub-topics across the chosen chapters. Pick 2–${PROPOSE_SET_MAX} sub-topics that (a) target genuine weaknesses and (b) are close enough to be confusable / benefit from being mixed. For EACH pick, list the exact ITEMS you will write — one entry per question, in the order you'd write them, each with its axis, the conceptual-question KIND (from the palette below), the specific INTENT (which misconception or skill it probes), and the DIFFICULTY in words. The NUMBER of items IS the count, so keep sets short (1–4 per sub-topic — a mix is for contrast, not volume; 2 is a sensible default). You MUST pick by the list's number — never invent a sub-topic; never repeat a number. Return ONLY {picks:[{choice,items:[{axis,kind,intent,difficulty}]}], rationale} where rationale is one sentence on why this MIX.

${PALETTE_INDEX}`;

// CHAT-SET-ROUTE (S179 §8 finding): `items` was `.min(1)` PER PICK, so a single
// malformed pick threw at .parse() and — since proposeAuthoringSet maps only
// AuthoringChatNotFoundError/ProposeTargetError — the zod error bubbled as a 500 and
// the tutor got NO proposal at all. Every other step of this resolver is deliberately
// tolerant (clamp, dedup, out-of-range fallback), so one bad pick killing the whole
// set was the outlier. Now: parse permissively (`.default([])`) and DROP empty-item
// picks below. Fixed here rather than left on the backlog because this slice adds a
// SECOND caller — the chat go-ahead — to this exact resolver.
// Exported ONLY so the permissiveness above is assertable with no AI in the loop —
// the same reason clampSetCount/clampProposedItems are exported (M101: a leg that can
// only observe what the model happened to return passes vacuously). Not a call site.
export const proposeSetResultSchema = z.object({
  picks: z
    .array(z.object({ choice: z.number().int(), items: z.array(proposedItemSchema).default([]) }))
    .min(1),
  rationale: z.string().default(""),
});

const geminiProposeSetSchema = {
  type: Type.OBJECT,
  properties: {
    picks: {
      type: Type.ARRAY,
      description: "2–5 sub-topics to author as an interleaved set",
      items: {
        type: Type.OBJECT,
        properties: {
          choice: {
            type: Type.INTEGER,
            description: "the 1-based number of the sub-topic, from the list",
          },
          items: geminiProposedItems,
        },
        required: ["choice", "items"],
      },
    },
    rationale: {
      type: Type.STRING,
      description: "one sentence: why this MIX of sub-topics is worth interleaving",
    },
  },
  required: ["picks", "rationale"],
} as const;

const CLAUDE_PROPOSE_SET_FORMAT = `${PROPOSE_SET_SYSTEM}

OUTPUT FORMAT (STRICT): respond with ONLY a JSON object {"picks":[{"choice":<1-based number>,"items":[{"axis":"conceptual|procedural|both","kind":"...","intent":"...","difficulty":"..."}]}],"rationale":"..."}. No prose, no fences.`;

// ───────────────────────── COVERAGE-1: the second set intent ─────────────────────────
//
// Where the proposer above picks a CONFUSABLE MIX to DISCRIMINATE between
// (possibly spanning chapters), this picks several sub-topics of ONE chapter to
// build practice ACROSS it in parallel — the founder's ask: "author multiple
// sub-topics in parallel for a chapter in the same thread".
//
// Deliberately a SECOND prompt, never an edit of PROPOSE_SET_SYSTEM in place:
// re-pointing that one would silently change what interleaved authoring selects
// for. The MECHANICS are identical (numbered list, pick-by-index so a sub-topic
// can never be invented — M15, returns {picks,rationale}), so the resolver below,
// the consent card and authorSetFromChat consume this with zero other changes.
// Only the selection INTENT and the per-sub-topic count range differ.
export type ProposeSetIntent = "discriminate" | "cover";

// Per-sub-topic counts. Interleaved sets are deliberately SHORT (a mix is for
// contrast, not volume). A COVERAGE set takes blocked mode's own existing range
// — PROPOSE_SYSTEM offers 1–8 default 3 — because coverage authoring IS blocked
// authoring with several sub-topics at once: the same tutor, on the same chapter,
// must not get a narrower range for asking for more of them in one go.
const PROPOSE_SET_COUNT_MAX = 4;
const PROPOSE_COVERAGE_COUNT_MAX = 8;
// Logged distinctly so ai_call_log can tell the two intents apart (free-text col).
const PROPOSE_COVERAGE_ENDPOINT = "authoring.proposeCoverageSet";

/**
 * The per-sub-topic count rule, as a pure function so it can be asserted WITHOUT
 * an AI call. Both intents live here together on purpose: they are a pair, and a
 * probe that can only observe whatever the model happened to propose passes
 * vacuously whenever that number is small (it was 3 the first time this ran).
 */
export function clampSetCount(count: number, intent: ProposeSetIntent = "discriminate"): number {
  const max = intent === "cover" ? PROPOSE_COVERAGE_COUNT_MAX : PROPOSE_SET_COUNT_MAX;
  return Math.min(Math.max(count, 1), max);
}

/**
 * SET-PLAN-GATE: cap a proposed item blueprint to the intent's per-sub-topic range
 * and renumber 1..N. Pure — so the "count is DERIVED from items.length, capped, and
 * n is sequential" rule is assertable WITHOUT an AI call (same reason clampSetCount
 * is pure; a probe that only sees whatever the model proposed passes vacuously).
 *
 * Slice QAUTH-A / D-QAUTH-8: this IS the parse boundary, so the `kind` allowlist
 * lands here. Every path from a planner proposal to a worker instruction runs
 * through this function, and it runs BEFORE the tutor's consent card is rendered —
 * so the card shows the corrected kind rather than one the drafter will silently
 * be told something else about. A LOCKED (POE) or unrecognised kind is
 * NEUTRALISED to KIND_UNPINNED, never rejected: throwing would 500 an entire
 * proposal over one bad pick, which is the outlier this resolver was already
 * fixed away from once (S179 §8).
 *
 * ⚠️ `lo` is deliberately NOT filled here and cannot be — the master holds no LOs
 * at sub-topic grain, which is precisely the planning asymmetry D-QAUTH-10 exists
 * to close. A fan-out item reaches the worker with no LO named; a single-mode item
 * (planned BY the worker) carries one.
 */
export function clampProposedItems(
  rawItems: z.infer<typeof proposedItemSchema>[],
  intent: ProposeSetIntent = "discriminate",
): WorkerPlanItem[] {
  return rawItems
    .slice(0, clampSetCount(rawItems.length, intent))
    .map((it, i) => ({ ...it, n: i + 1, kind: normalizePlannedKind(it.kind) }));
}

// NOTE: the set-size cap is PROPOSE_SET_MAX (5) for BOTH intents — founder ruled
// it unchanged (2026-07-29: "keep it 5 only then don't change it").
const PROPOSE_COVERAGE_SYSTEM = `You help a tutor author questions for SEVERAL sub-topics of ONE chapter at once — a COVERAGE set, so the tutor can build practice across the chapter in parallel instead of one sub-topic at a time. This is NOT an interleaved/discrimination mix: the sub-topics do NOT need to be confusable, and you are working within a single chapter.

You are given the student's grounding (two-axis mastery + Stage-1 observations), the conversation so far, and a NUMBERED list of candidate sub-topics in the chosen chapter.

Pick the sub-topics to author, in this order of preference:
1. Any the tutor has NAMED or clearly pointed at in the conversation — honour those first.
2. Where the tutor has not been specific, fill toward the genuine weaknesses and the least-covered sub-topics (thin or no observations, lower mastery).

Pick 2–${PROPOSE_SET_MAX} sub-topics (never more than ${PROPOSE_SET_MAX}). For EACH, list the exact ITEMS you will write — one entry per question, in order, each with its axis, the conceptual-question KIND (from the palette below), the specific INTENT (which misconception or skill it probes), and the DIFFICULTY in words. The NUMBER of items IS the count (1–${PROPOSE_COVERAGE_COUNT_MAX}; ~3 is a sensible default). You MUST pick by the list's number — never invent a sub-topic; never repeat a number. Return ONLY {picks:[{choice,items:[{axis,kind,intent,difficulty}]}], rationale} where rationale is one sentence on why THESE sub-topics.

${PALETTE_INDEX}`;

const geminiProposeCoverageSchema = {
  type: Type.OBJECT,
  properties: {
    picks: {
      type: Type.ARRAY,
      description: `2–${PROPOSE_SET_MAX} sub-topics of this chapter to author in parallel`,
      items: {
        type: Type.OBJECT,
        properties: {
          choice: {
            type: Type.INTEGER,
            description: "the 1-based number of the sub-topic, from the list",
          },
          items: geminiProposedItems,
        },
        required: ["choice", "items"],
      },
    },
    rationale: {
      type: Type.STRING,
      description: "one sentence: why THESE sub-topics of the chapter",
    },
  },
  required: ["picks", "rationale"],
} as const;

const CLAUDE_PROPOSE_COVERAGE_FORMAT = `${PROPOSE_COVERAGE_SYSTEM}

OUTPUT FORMAT (STRICT): respond with ONLY a JSON object {"picks":[{"choice":<1-based number>,"items":[{"axis":"conceptual|procedural|both","kind":"...","intent":"...","difficulty":"..."}]}],"rationale":"..."}. No prose, no fences.`;

export type ProposeSetPick = {
  subTopicId: string;
  subTopicName: string;
  topicName: string;
  chapterName: string;
  // DERIVED = items.length. Kept as a field so the FE/fan-out don't recompute it.
  count: number;
  // SET-PLAN-GATE: the approved blueprint. Empty only on the degenerate fallback
  // pick (model returned nothing usable) → the fan-out self-derives for that pick.
  items: WorkerPlanItem[];
};
export type ProposeSetResult = {
  chatId: string;
  studentId: string;
  rationale: string;
  picks: ProposeSetPick[];
};

/**
 * Propose a SET of sub-topics + per-sub-topic counts from the conversation +
 * grounding (QA3-e-2). Like proposeTarget, the model picks BY NUMBER from the
 * chat's chapter allowlist (index, never a raw UUID — M15), so every pick is a
 * valid in-scope anchor. Dedups, clamps counts and the set size (≤PROPOSE_SET_MAX,
 * 5 for both intents). Reads-only/re-runnable (fork 4 preserved). The tutor
 * confirms; authorSetFromChat then fans out.
 *
 * TWO INTENTS (COVERAGE-1), differing ONLY in selection goal + count range:
 *   "discriminate" (default) — the interleaved MIX, counts 1–4. Unchanged.
 *   "cover"                  — several sub-topics of ONE chapter, counts 1–8.
 * The default keeps every existing caller on the original behaviour.
 */
export async function proposeTargetSet(
  tx: Tx,
  args: { tutorUserId: string; chatId: string; intent?: ProposeSetIntent },
): Promise<ProposeSetResult> {
  const intent: ProposeSetIntent = args.intent ?? "discriminate";
  const cover = intent === "cover";
  const row = await ownedChat(tx, args.tutorUserId, args.chatId);
  const scopeChapterIds = chatChapterIds(row);
  if (scopeChapterIds.length === 0) {
    throw new ProposeTargetError("NO_CHAPTER", "this chat has no chapter scope");
  }

  // The allowlist: every chosen chapter's sub_topics, in hierarchy order.
  const subs = await tx
    .select({
      subTopicId: subTopic.id,
      subTopicName: subTopic.name,
      topicName: topic.name,
      chapterName: chapter.name,
    })
    .from(subTopic)
    .innerJoin(topic, eq(topic.id, subTopic.topicId))
    .innerJoin(chapter, eq(chapter.id, topic.chapterId))
    .where(inArray(topic.chapterId, scopeChapterIds))
    .orderBy(asc(chapter.ordinal), asc(topic.ordinal), asc(subTopic.ordinal));
  if (subs.length === 0) {
    throw new ProposeTargetError("NO_SUBTOPICS", "these chapters have no sub-topics");
  }
  const multiChapter = scopeChapterIds.length > 1;

  const grounding = await assembleGrounding(tx, {
    tutorUserId: args.tutorUserId,
    studentId: row.studentId,
    chapterIds: scopeChapterIds,
    subTopicIds: chatSubTopicIds(row),
  });
  const history = parseMessages(row.messages);
  const convo = history
    .map((m) => `${m.role === "user" ? "TUTOR" : "AI"}: ${m.text}`)
    .join("\n\n");
  const list = subs
    .map(
      (s, i) =>
        `  ${i + 1}. ${multiChapter ? `${s.chapterName} › ` : ""}${s.topicName} › ${s.subTopicName}`,
    )
    .join("\n");

  // The prompt BODY carries the intent too — swapping only the system prompt
  // would leave the model reading "author a coverage set" over "as an interleaved
  // mix", i.e. two contradictory instructions in one call.
  const prompt = `${grounding}

===== CONVERSATION SO FAR =====
${
  convo ||
  (cover
    ? "(no conversation yet — use the grounding to pick the chapter's least-covered sub-topics and the student's weakest areas within it)"
    : "(no conversation yet — use the grounding to pick a confusable mix of the student's weakest areas)")
}
===== END CONVERSATION =====

${
  cover
    ? `SUB-TOPICS IN THIS CHAPTER (choose 2–${PROPOSE_SET_MAX} by their numbers, to author in parallel):`
    : `SUB-TOPICS ACROSS THESE CHAPTERS (choose 2–${PROPOSE_SET_MAX} by their numbers, as an interleaved mix):`
}
${list}

Assemble the ${cover ? "coverage" : "interleaved"} set now. Return {picks:[{choice,count}], rationale}.`;

  const parsed = await runVendoredJson<z.infer<typeof proposeSetResultSchema>>({
    vendor: row.vendor as VendorChoice,
    geminiSystem: cover ? PROPOSE_COVERAGE_SYSTEM : PROPOSE_SET_SYSTEM,
    geminiResponseSchema: cover ? geminiProposeCoverageSchema : geminiProposeSetSchema,
    claudeSystem: cover ? CLAUDE_PROPOSE_COVERAGE_FORMAT : CLAUDE_PROPOSE_SET_FORMAT,
    prompt,
    parse: (raw) => proposeSetResultSchema.parse(raw),
    label: `${cover ? "propose-coverage" : "propose-set"}:${args.chatId}`,
    endpoint: cover ? PROPOSE_COVERAGE_ENDPOINT : PROPOSE_SET_ENDPOINT,
  });

  // Clamp each choice onto a real allowlist entry, clamp counts (intent-aware:
  // 1–4 interleaved, 1–8 coverage), DEDUP by sub_topic (a repeated number
  // collapses), and cap the set size.
  const seen = new Set<string>();
  const picks: ProposeSetPick[] = [];
  for (const p of parsed.picks) {
    const idx = Math.min(Math.max(p.choice, 1), subs.length) - 1;
    const chosen = subs[idx]!;
    if (seen.has(chosen.subTopicId)) continue;
    // CHAT-SET-ROUTE (S179 §8): a pick the model returned with NO items carries no
    // blueprint, so there is nothing for the tutor to approve and nothing to hand the
    // drafter — DROP it rather than let it 500 the whole proposal at parse (above) or
    // ride through as a count-0 pick. Dropped BEFORE `seen` is marked so the number
    // stays available to a later, well-formed pick for the same sub-topic. If every
    // pick is empty the `picks.length === 0` fallback below still yields one
    // actionable target, which is the same degenerate path an all-out-of-range
    // response already takes.
    if (p.items.length === 0) continue;
    seen.add(chosen.subTopicId);
    // The blueprint is the source of truth: cap it to the intent's range and
    // renumber 1..N. The count is DERIVED (items.length) — there is no separate
    // number for it to drift from. Pure helper so the rule is probe-assertable.
    const items = clampProposedItems(p.items, intent);
    picks.push({
      subTopicId: chosen.subTopicId,
      subTopicName: chosen.subTopicName,
      topicName: chosen.topicName,
      chapterName: chosen.chapterName,
      count: items.length,
      items,
    });
    if (picks.length >= PROPOSE_SET_MAX) break;
  }
  if (picks.length === 0) {
    // The model returned only out-of-range/dup picks — fall back to the first
    // allowlist entry so the tutor still gets an actionable proposal. No usable
    // blueprint here, so items stays EMPTY: the fan-out threads no plan for this
    // pick and the worker self-derives (the pre-slice behaviour), rather than
    // manufacturing an item the model never proposed.
    const first = subs[0]!;
    picks.push({
      subTopicId: first.subTopicId,
      subTopicName: first.subTopicName,
      topicName: first.topicName,
      chapterName: first.chapterName,
      count: cover ? 3 : 2,
      items: [],
    });
  }

  const result: ProposeSetResult = {
    chatId: row.id,
    studentId: row.studentId,
    rationale: parsed.rationale,
    picks,
  };
  // PROPOSAL-PERSIST: the blueprint is the expensive artifact on this path — S200
  // measured one at 8,672 chars / 50s of Claude — and it was the one prod threw
  // away. Persisted here so BOTH callers (the menu button and runSetGoAhead's
  // in-chat go-ahead) are covered by one write.
  await persistPendingProposal(tx, row.id, {
    kind: "set",
    createdAt: new Date().toISOString(),
    set: result,
  });
  return result;
}

// ───────────────────────── authorSetFromChat (parallel fan-out, QA3-e-2) ─────────────────────────

export type AuthorSetGroup = {
  subTopicId: string;
  subTopicName: string;
  topicName: string;
  chapterName: string;
  nextOrdinal: number;
  drafts: PersistedDraft[];
};
export type AuthorSetFailure = {
  subTopicId: string;
  subTopicName: string;
  error: string;
};
export type AuthorSetResult = {
  chatId: string;
  studentId: string;
  groups: AuthorSetGroup[];
  failures: AuthorSetFailure[];
};
/**
 * One member of a fan-out. Named + exported (rather than inlined in the signature)
 * because Slice SET-ASYNC puts it on the QUEUE's job data too: `queue.ts` imports
 * this type directly, so the enqueued shape and the shape the job body accepts are
 * one declaration. Deriving it with `Parameters<typeof authorSetFromChat>` instead
 * resolved to `any` — queue.ts and this module already form a type cycle
 * (authoring_chat imports AuthoringPhase from queue), and a `typeof <fn>` lookup in
 * a job-DATA position closes it.
 */
export type AuthorSetTarget = {
  subTopicId: string;
  count: number;
  // SET-PLAN-GATE: the tutor-approved blueprint. Absent/null = self-derive.
  plan?: WorkerPlan | null;
};

/**
 * Author an interleaved SET: fan out one scoped worker PER sub_topic, in PARALLEL,
 * each in its OWN board-scoped transaction (QA3-e-2, D-QA3-e2-1). A single Postgres
 * tx can't run concurrent statements, so each worker opens a fresh withBoard(tx) —
 * its own pooled connection + RLS claim — and the fan-out is Promise.allSettled so
 * ONE sub_topic's worker failing returns the rest (fault isolation) with the
 * failure surfaced, never silently dropped. Reuses spawnAuthoringWorker +
 * persistDrafts VERBATIM (the worker is unchanged; only the master-side fan-out is
 * new). The ownership + scope guards run first on the caller's tx (fail fast on a
 * bogus/cross-scope id BEFORE spending any AI).
 */
export async function authorSetFromChat(
  tx: Tx,
  args: {
    boardId: string;
    tutorUserId: string;
    chatId: string;
    // SET-PLAN-GATE: `plan` is the tutor-approved blueprint for this sub-topic. When
    // present the drafter writes exactly it (the gate); absent = self-derive (the
    // pre-slice behaviour, still the path for the degenerate fallback pick).
    targets: AuthorSetTarget[];
  },
): Promise<AuthorSetResult> {
  const row = await ownedChat(tx, args.tutorUserId, args.chatId);
  const history = parseMessages(row.messages);
  const brief = history
    .map((m) => `${m.role === "user" ? "TUTOR" : "AI"}: ${m.text}`)
    .join("\n\n");
  const scopeChapterIds = chatChapterIds(row);

  // Resolve + scope-guard EVERY target up front (fail fast). Dedup by sub_topic and
  // cap the set — the fan-out concurrency must stay under the pool (D-QA3-e2-1).
  const seen = new Set<string>();
  const resolved: {
    id: string;
    name: string;
    topicName: string;
    chapterName: string;
    count: number;
    plan: WorkerPlan | null;
  }[] = [];
  for (const t of args.targets) {
    if (seen.has(t.subTopicId)) continue;
    const [st] = await tx
      .select({
        id: subTopic.id,
        name: subTopic.name,
        topicName: topic.name,
        chapterId: chapter.id,
        chapterName: chapter.name,
      })
      .from(subTopic)
      .innerJoin(topic, eq(topic.id, subTopic.topicId))
      .innerJoin(chapter, eq(chapter.id, topic.chapterId))
      .where(eq(subTopic.id, t.subTopicId));
    if (!st) throw new SubTopicNotFoundError(t.subTopicId);
    if (scopeChapterIds.length > 0 && !scopeChapterIds.includes(st.chapterId)) {
      throw new SubTopicNotFoundError(t.subTopicId);
    }
    seen.add(t.subTopicId);
    // When a plan is present, the count is LOCKED to its item count — the tutor
    // approved exactly those N items, so drafting a different N would draft
    // something never approved (single-mode's approveAuthoringPlan rule). Only a
    // plan-less target honours the caller's raw count.
    //
    // Slice QAUTH-A / D-QAUTH-8: re-apply the kind allowlist HERE too. This plan
    // came from `proposeTargetSet` (the MASTER planner, which does not hold the
    // palette doc) and round-tripped through the client on the way back, so
    // clamping it once at propose time does not bind what actually arrives. The
    // worker's own single-mode plans are deliberately NOT normalised anywhere —
    // that component holds the full palette, so blanking a kind it named in its
    // own words would discard good information rather than protect anything.
    const plan =
      t.plan && t.plan.items.length > 0
        ? {
            ...t.plan,
            items: t.plan.items.map((i) => ({
              ...i,
              kind: normalizePlannedKind(i.kind),
            })),
          }
        : null;
    resolved.push({
      id: st.id,
      name: st.name,
      topicName: st.topicName,
      chapterName: st.chapterName,
      count: plan ? plan.items.length : Math.min(Math.max(t.count, 1), 8),
      plan,
    });
    if (resolved.length >= PROPOSE_SET_MAX) break;
  }
  if (resolved.length === 0) {
    throw new SubTopicNotFoundError("(empty set)");
  }

  // Fan out. Each worker runs in its own withBoard tx (independent connection +
  // RLS) so the spawns are truly concurrent; the outer `tx` idles meanwhile. The
  // worker drafts commit per-sub_topic — a later outer failure can't un-author
  // them (they re-surface via listDrafts), which is the intended fault isolation.
  const settled = await Promise.allSettled(
    resolved.map((r) =>
      withBoard(args.boardId, async (wtx) => {
        const nextOrdinal = await nextOrdinalFor(wtx, r.id);
        const { drafts } = await spawnAuthoringWorker(wtx, {
          boardId: args.boardId,
          chatId: row.id,
          subTopicId: r.id,
          vendor: row.vendor as VendorChoice,
          count: r.count,
          brief,
          // SET-PLAN-GATE: hand the drafter the approved blueprint directly. There
          // is no episode row on this path, so spawnAuthoringWorker can't read it
          // from prior turns — it must be passed in.
          approvedPlan: r.plan,
          // Slice QAUTH-A / item 12 / D-QAUTH-7 — a fan-out over MORE THAN ONE
          // sub_topic produces questions that will be served interleaved: an
          // interleaved chat always mixes, and after Slice MIXED a blocked-mode
          // coverage batch mixes too unless the tutor picks `separate` at approve
          // time. That choice happens AFTER authoring, so the trigger has to be
          // the composition. A single-sub_topic fan-out is not a mix and does not
          // get the instruction (the chat's own mode can still turn it on inside
          // buildScopedWorld).
          mixed: resolved.length > 1,
        });
        const persisted = await persistDrafts(wtx, {
          boardId: args.boardId,
          subTopicId: r.id,
          targetStudentId: row.studentId,
          drafts,
        });
        return {
          subTopicId: r.id,
          subTopicName: r.name,
          topicName: r.topicName,
          chapterName: r.chapterName,
          nextOrdinal,
          drafts: persisted,
        } satisfies AuthorSetGroup;
      }),
    ),
  );

  const groups: AuthorSetGroup[] = [];
  const failures: AuthorSetFailure[] = [];
  settled.forEach((s, i) => {
    if (s.status === "fulfilled") {
      groups.push(s.value);
    } else {
      const r = resolved[i]!;
      console.error(
        `[authoring-set] ${r.id} (${r.name}) FAILED: ${String((s.reason as Error)?.message ?? s.reason).slice(0, 200)}`,
      );
      failures.push({
        subTopicId: r.id,
        subTopicName: r.name,
        error: String((s.reason as Error)?.message ?? s.reason).slice(0, 300),
      });
    }
  });

  // Keep the chat's focus pointing at a real authored sub_topic (parity with the
  // single-target paths). Only when at least one group succeeded.
  if (groups.length > 0) {
    await tx
      .update(authoringChat)
      .set({ subTopicId: groups[0]!.subTopicId, updatedAt: new Date() })
      .where(eq(authoringChat.id, row.id));
  }

  return {
    chatId: row.id,
    studentId: row.studentId,
    groups,
    failures,
  };
}

// ───────────────────────── reviseDraft (per-question mini-chat) ─────────────────────────

/**
 * Revise ONE drafted question per the tutor's instruction ("make this harder",
 * "swap the context") — the per-question mini-chat (Slice AUTH-v2.1). Ported from
 * Starkhorn's regenerateQuestion SHAPE, but on a PRE-SAVE draft (drafts are UI-held
 * per D-AUTH-1) → no snapshot/embedding machinery. Vendor-aware, reuses the
 * question-craft bar; returns the revised draft (the tutor still edits + saves).
 */
export async function reviseDraft(
  tx: Tx,
  args: {
    tutorUserId: string;
    chatId: string;
    questionId: string; // FIG-AUTH: the persisted draft to revise in-place
    refinementNote: string;
  },
): Promise<PersistedDraft> {
  const row = await ownedChat(tx, args.tutorUserId, args.chatId);
  const note = args.refinementNote.trim();
  if (!note) throw new Error("refinementNote is empty");

  // The current persisted draft (also ownership-guards the question).
  const existing = await assertOwnedDraft(tx, args.tutorUserId, args.questionId);
  const existingJson = {
    axis: existing.axis,
    stem: existing.stem,
    referenceAnswer: existing.referenceAnswer,
    explanation: existing.explanation,
    image: existing.image,
  };

  // Keep the revision aimed at the same LOs when a focus sub_topic is set.
  let loBlock = "";
  if (row.subTopicId) {
    const los = await tx
      .select()
      .from(learningObjective)
      .where(eq(learningObjective.subTopicId, row.subTopicId));
    if (los.length) {
      loBlock =
        `\nLEARNING OBJECTIVES (keep the question aimed at these):\n` +
        los.map((l, n) => `  ${n + 1}. [${l.axis}] ${l.description}`).join("\n") +
        `\n`;
    }
  }

  const prompt = `Revise this ONE question. Keep it aimed at the same target and axis unless the instruction says otherwise; apply the tutor's instruction; keep it SUBJECTIVE and to the question-craft bar.
${loBlock}
EXISTING QUESTION (JSON):
${JSON.stringify(existingJson, null, 2)}

TUTOR'S REVISION INSTRUCTION: ${note}

Return the revised question as a "questions" array containing EXACTLY ONE question, in the same JSON shape.`;

  // Refinement authors to the SAME method pack/bar as the worker (QA3-e) —
  // incl. the full kinds palette + the dial catalog for the QUESTION's subject.
  const pack = await loadMethodPack(
    await methodPackContextFor(tx, existing.subTopicId),
  );
  const drafts = await runVendoredJson({
    vendor: row.vendor as VendorChoice,
    geminiSystem: pack,
    geminiResponseSchema: geminiQuestionSchema,
    claudeSystem: claudeSystemFor(pack),
    prompt,
    parse: (raw) => draftBatchSchema.parse(raw).questions,
    label: `authoring-chat:revise:${args.chatId}`,
    endpoint: REVISE_ENDPOINT,
  });
  const revised = drafts[0];
  if (!revised) throw new Error("revision returned no question");
  // Persist the revision in-place (recomposes pedagogical_note, logs the edit).
  return applyDraftRevision(tx, {
    tutorUserId: args.tutorUserId,
    questionId: args.questionId,
    draft: revised,
  });
}

// FIG-AUTH: saveAuthoredQuestions REMOVED — the chat now persists drafts on author
// (persistDrafts) and the tutor commits them via authoring.approveDrafts (status
// draft→approved). The M11 enablement path is approveDrafts, not a live insert.

// ───────────────────────── small helpers ─────────────────────────

async function nextOrdinalFor(tx: Tx, subTopicId: string): Promise<number> {
  const [maxRow] = await tx
    .select({ ordinal: question.ordinal })
    .from(question)
    .where(eq(question.subTopicId, subTopicId))
    .orderBy(desc(question.ordinal))
    .limit(1);
  return (maxRow?.ordinal ?? -1) + 1;
}
