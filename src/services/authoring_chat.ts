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
  chapter,
  learningObjective,
  observation,
  question,
  subTopic,
  topic,
} from "@b2c/kernel/schema";
import { ChatMessage, type VendorChoice } from "@b2c/kernel/contracts";
import { complete, extractJsonObject } from "./ai_client";
import type { ToolSpec, VendorId } from "./ai/types";
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
  spawnAuthoringWorker,
} from "./authoring_worker";
import { SubTopicNotFoundError } from "./assessment";
import { assertTutorsStudent, getStudentMastery } from "./tutor";
import { jsonlExists } from "./cli_session";
import { withBoard } from "../db/with-board";

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
const CHAT_SYSTEM_CLAUDE = `${CHAT_SYSTEM_BASE}

HOW AUTHORING HAPPENS (so you author correctly): when you and the tutor have converged and the tutor gives a clear go-ahead ("author 3", "go ahead", "let's do it", "make those"), author by emitting EXACTLY ONE fenced code block whose info string is \`author_questions\` and whose body is a JSON object with two integer fields — \`subTopicNumber\` (the 1-based number of the chosen sub-topic from the AUTHORING TARGETS list in the message) and \`count\` (how many questions, 1–8). Exactly like this, the JSON alone inside the fence:
\`\`\`author_questions
{"subTopicNumber": 2, "count": 3}
\`\`\`
You do NOT write the questions yourself — emitting that block spawns a specialist authoring worker that drafts them to the full craft bar; the drafts then appear in a review form where the tutor edits and saves them. Emit the block ONLY after a clear go-ahead — until then, keep discussing and do NOT emit it. You may write one short natural sentence before the block (e.g. "On it — drafting 3 now."). (A "Suggest what to work on" button also exists as an alternative, but you don't need it.)`;

// Gemini path — has the author_questions tool. It authors IN-CHAT on the tutor's
// go-ahead. The drafts still land in the review form (decision 2b: the tutor
// edits + saves; nothing goes live to a student without that). The button also
// remains available.
const CHAT_SYSTEM_GEMINI = `${CHAT_SYSTEM_BASE}

HOW AUTHORING HAPPENS (so you guide it correctly): you have a tool — \`author_questions\`. When you and the tutor have converged and the tutor gives a clear go-ahead ("author 3", "go ahead", "let's do it", "make those"), CALL \`author_questions\` with (a) \`subTopicNumber\` = the number of the chosen sub-topic from the AUTHORING TARGETS list in the message, and (b) \`count\` = how many questions to author. You do NOT write the questions yourself — calling the tool spawns a specialist authoring worker that drafts them to the full craft bar; the drafts then appear in a review form where the tutor edits and saves them. Until the tutor gives a go-ahead, do NOT call the tool — keep discussing. Emit the tool as a STRUCTURED function call — NEVER print it as text, pseudocode, tool_code, or \`print(default_api...)\`. (A "Suggest what to work on" button also exists as an alternative, but you don't need it — the tool is yours.)`;

function chatSystemFor(vendor: VendorChoice): string {
  return vendor === "gemini_api" ? CHAT_SYSTEM_GEMINI : CHAT_SYSTEM_CLAUDE;
}

// Iter-3.5 layer A (ported from Starkhorn unit_chat) — fake-tool-call detector.
// Gemini occasionally decides to author but emits the call as PSEUDOCODE TEXT
// (tool_code / thought / print(default_api.author_questions(...))) instead of a
// structured function_call. That yields empty toolCalls + junk text + no draft.
const FAKE_TOOL_CALL_RE =
  /(^|\n)\s*(tool_code|thought)\b|default_api\.author_questions\s*\(|\bprint\s*\(\s*default_api\./i;
function looksLikeFakeToolCall(text: string | null | undefined): boolean {
  if (!text) return false;
  return FAKE_TOOL_CALL_RE.test(text);
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

// The Gemini author_questions tool. Reuses the exact question shape from
// authoring.ts (geminiQuestionSchema.properties.questions) + adds subTopicNumber
// so the model picks the target BY NUMBER from the AUTHORING TARGETS list (never
// a raw UUID — ai-build-miss M15). Decision 2b: the tool DRAFTS (does not save);
// the drafts route into the existing review form.
const AUTHOR_QUESTIONS_TOOL_NAME = "author_questions";
let cachedAuthorTool: ToolSpec | null = null;
function authorQuestionsToolSpec(): ToolSpec {
  if (cachedAuthorTool) return cachedAuthorTool;
  cachedAuthorTool = {
    name: AUTHOR_QUESTIONS_TOOL_NAME,
    description:
      "Select ONE sub-topic to author subjective practice questions for, and how many. Call ONLY after the tutor gives an explicit go-ahead. This spawns a specialist authoring worker that drafts the questions to the full craft bar; the drafts are shown to the tutor in a review form to edit + save — it does NOT save them directly. `subTopicNumber` MUST be one of the numbers in the AUTHORING TARGETS list.",
    inputSchemaJson: {
      type: Type.OBJECT,
      properties: {
        subTopicNumber: {
          type: Type.INTEGER,
          description:
            "the 1-based number of the sub-topic to author for, from the AUTHORING TARGETS list in the message",
        },
        count: {
          type: Type.INTEGER,
          description: "how many questions to author (1–8)",
        },
      },
      required: ["subTopicNumber", "count"],
    } as Record<string, unknown>,
  };
  return cachedAuthorTool;
}

// Validates the tool call's args. The tool SELECTS a target + count; the worker
// authors the questions (QA3-e master→worker split). Shared by the Gemini tool
// AND the Claude marker path below.
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

/**
 * Build the student-grounding block for the chat's first (stitched) user turn.
 * Reuses the tutor read surface (getStudentMastery + the ownership guard) and a
 * recent-observations read. NEVER includes any answer key — observations carry
 * the AI's reasoning + levels only (the M11 boundary, same as the tutor surface).
 */
export async function assembleGrounding(
  tx: Tx,
  args: { tutorUserId: string; studentId: string; chapterIds?: string[] },
): Promise<string> {
  const mastery = await getStudentMastery(tx, args); // asserts ownership

  const obs = await tx
    .select({
      axis: observation.axis,
      level: observation.observationLevel,
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

  const obsLines =
    obs.length > 0
      ? obs
          .map(
            (o) =>
              `  - [${o.subTopicName}] ${o.axis} L${o.level}` +
              (o.calibrationFlag ? ` (calibration: ${o.calibrationFlag})` : "") +
              `: ${o.reasoning}`,
          )
          .join("\n")
      : "  (no Stage-1 observations yet — the student has not submitted scored practice)";

  // Chapter coverage: the chapter's full sub-topic list (topic-ordered) with a
  // per-sub-topic count of questions that ALREADY EXIST for this student
  // (canonical/shared OR private to them). Lets the AI answer "what's left to
  // author?" — without it the AI can only see the student's mastery, not the
  // curriculum map (Eyeball feedback #1). Skipped for legacy chapter-less chats.
  // Coverage spans ALL of the chat's chapters (one for blocked, N for interleaved
  // — Slice QA3-d). When more than one chapter is in scope, each line is prefixed
  // with its chapter name so cross-chapter targets are unambiguous.
  const groundChapterIds = args.chapterIds ?? [];
  const coverageLines =
    groundChapterIds.length > 0
      ? await (async () => {
          const rows = await tx
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
            .orderBy(asc(chapter.ordinal), asc(topic.ordinal), asc(subTopic.ordinal));

          if (rows.length === 0) return null;

          const counts = await tx
            .select({
              subTopicId: question.subTopicId,
              n: sql<number>`count(*)::int`,
            })
            .from(question)
            .where(
              and(
                inArray(
                  question.subTopicId,
                  rows.map((r) => r.subTopicId),
                ),
                or(
                  isNull(question.targetStudentId),
                  eq(question.targetStudentId, args.studentId),
                ),
              ),
            )
            .groupBy(question.subTopicId);
          const byId = new Map(counts.map((c) => [c.subTopicId, c.n]));

          const multi = groundChapterIds.length > 1;
          return rows
            .map((r) => {
              const n = byId.get(r.subTopicId) ?? 0;
              const tag =
                n === 0
                  ? "NONE authored yet"
                  : `${n} question${n === 1 ? "" : "s"} authored`;
              const path = multi
                ? `${r.chapterName} › ${r.topicName} › ${r.subTopicName}`
                : `${r.topicName} › ${r.subTopicName}`;
              return `  - ${path}: ${tag}`;
            })
            .join("\n");
        })()
      : null;

  // Raw topics.md (D-QA3-5): the VERBATIM authored breakdown for the chat's
  // chapter(s) — the full pedagogical map (sub-topics, LOs, misconceptions,
  // teaching notes) the tutor decides against. Stored at
  // chapter.metadata->>'topicsMd' by the admin ingest (QA3-b, the sole write
  // path); null for chapters seeded via content-pull, in which case this section
  // is omitted and the AI falls back to the CHAPTER COVERAGE sub-topic names.
  const topicsMdBlock =
    groundChapterIds.length > 0
      ? await (async () => {
          const rows = await tx
            .select({
              chapterName: chapter.name,
              chapterOrdinal: chapter.ordinal,
              topicsMd: sql<string | null>`${chapter.metadata} ->> 'topicsMd'`,
            })
            .from(chapter)
            .where(inArray(chapter.id, groundChapterIds))
            .orderBy(asc(chapter.ordinal));
          const withMd = rows.filter((r) => r.topicsMd && r.topicsMd.trim());
          if (withMd.length === 0) return null;
          const multi = groundChapterIds.length > 1;
          return withMd
            .map((r) => (multi ? `----- ${r.chapterName} -----\n${r.topicsMd}` : r.topicsMd!))
            .join("\n\n");
        })()
      : null;

  return [
    "===== STUDENT GROUNDING (read this before responding) =====",
    "",
    "CERTIFIED TWO-AXIS MASTERY (conceptual = reasoning/why; procedural = execution; 1–5):",
    masteryLines,
    "",
    "RECENT STAGE-1 OBSERVATIONS (the AI's blind read of the student's recent answers — reasoning + level per axis, no answer keys):",
    obsLines,
    ...(coverageLines
      ? [
          "",
          "CHAPTER COVERAGE (every sub-topic in this chat's chapter(s) + how many questions already exist for THIS student — canonical + private. Use this to answer what's left to author):",
          coverageLines,
        ]
      : []),
    ...(topicsMdBlock
      ? [
          "",
          "CHAPTER BREAKDOWN (the VERBATIM authored topics.md — the full pedagogical map: sub-topics, learning objectives, misconceptions, and teaching notes. This is the AUTHORITATIVE source for what each sub-topic actually covers and where students struggle; ground your authoring decisions in it, not in general knowledge):",
          topicsMdBlock,
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
  subTopicId: string | null; // resolved authoring focus (set by proposeTarget)
  vendor: VendorChoice;
  messages: ChatMessage[];
  // Set ONLY on a sendTurn where an in-chat author fired — the Gemini
  // author_questions tool OR the Claude `author_questions` marker: the drafted
  // questions the FE routes into the review form (same shape as authorFromChat;
  // persisted as status='draft'/private, the tutor edits + approves). Absent on
  // every ordinary discussion turn.
  draft?: AuthorFromChatResult;
  // The student's still-unapproved (status='draft') authored questions, flat
  // across sub-topics (interleaved may span several). Populated ONLY by getChat so
  // that RESUMING a chat mid-review (from either the landing history picker or a
  // remount) re-hydrates the review form — no resume path can silently skip the
  // restore. Absent on start/turn responses (no review in progress there).
  pendingDrafts?: Awaited<ReturnType<typeof listDrafts>>;
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

  const [created] = await tx
    .insert(authoringChat)
    .values({
      boardId: args.boardId,
      tutorId: args.tutorUserId,
      studentId: args.studentId,
      mode,
      chapterId: storedChapterId,
      chapterIds: storedChapterIds,
      vendor: args.vendor,
      messages: [],
    })
    .returning();
  return {
    chatId: created!.id,
    studentId: created!.studentId,
    chapterId: created!.chapterId ?? null,
    chapterIds: chatChapterIds(created!),
    mode: (created!.mode as AuthoringMode) ?? "blocked",
    subTopicId: created!.subTopicId ?? null,
    vendor: created!.vendor as VendorChoice,
    messages: [],
  };
}

export async function getChat(
  tx: Tx,
  args: { tutorUserId: string; chatId: string },
): Promise<ChatView> {
  const row = await ownedChat(tx, args.tutorUserId, args.chatId);
  // Re-hydrate the review form on resume: the student's still-unapproved drafts.
  // Scoped by student (a draft is student-private, not chat-scoped) + tutor-owned
  // (listDrafts asserts the tutor↔student link).
  const pendingDrafts = await listDrafts(tx, {
    tutorUserId: args.tutorUserId,
    studentId: row.studentId,
  });
  return {
    chatId: row.id,
    studentId: row.studentId,
    chapterId: row.chapterId ?? null,
    chapterIds: chatChapterIds(row),
    mode: (row.mode as AuthoringMode) ?? "blocked",
    subTopicId: row.subTopicId ?? null,
    vendor: row.vendor as VendorChoice,
    messages: parseMessages(row.messages),
    pendingDrafts,
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
 * Shared in-chat authoring core (both the Gemini tool branch and the Claude marker
 * branch call this). Resolve the numbered target — clamped INTO the chapter
 * allowlist so it can never escape to a raw id (M15) — pin it on the chat, spawn a
 * scoped worker (method pack + O1/O2), and persist the drafts as status='draft' /
 * private. Both paths therefore draft to the SAME craft bar (QA3-e master→worker).
 */
async function resolveAndAuthor(
  tx: Tx,
  a: {
    row: Awaited<ReturnType<typeof ownedChat>>;
    subs: SubRef[];
    subTopicNumber: number;
    count: number;
    history: ChatMessage[];
    text: string;
    vendor: VendorChoice;
  },
): Promise<{ chosen: SubRef; nextOrdinal: number; persisted: PersistedDraft[] }> {
  const idx = Math.min(Math.max(a.subTopicNumber, 1), a.subs.length) - 1;
  const chosen = a.subs[idx]!;
  const count = Math.min(Math.max(a.count, 1), 8);
  const nextOrdinal = await nextOrdinalFor(tx, chosen.subTopicId);

  // Persist the resolved focus (mirrors proposeTarget/authorFromChat).
  await tx
    .update(authoringChat)
    .set({ subTopicId: chosen.subTopicId, updatedAt: new Date() })
    .where(eq(authoringChat.id, a.row.id));

  // The master SELECTED the target; spawn a fresh scoped worker to author (method
  // pack + O1/O2 + the scoped slice) so both in-chat paths draft to the SAME bar
  // as the structured authorFromChat path.
  const brief = [
    ...a.history.map((m) => `${m.role === "user" ? "TUTOR" : "AI"}: ${m.text}`),
    `TUTOR: ${a.text}`,
  ].join("\n\n");
  const { drafts } = await spawnAuthoringWorker(tx, {
    boardId: a.row.boardId,
    chatId: a.row.id,
    subTopicId: chosen.subTopicId,
    vendor: a.vendor,
    count,
    brief,
  });
  // FIG-AUTH (D-FIG-5): persist as status='draft' rows so each has a real id — the
  // review form renders + previews before approve. Still NOT live (D-FIG-1).
  const persisted = await persistDrafts(tx, {
    boardId: a.row.boardId,
    subTopicId: chosen.subTopicId,
    targetStudentId: a.row.studentId,
    drafts,
  });
  return { chosen, nextOrdinal, persisted };
}

/** Build the ChatView returned when an in-chat author fired (drafts → review). */
function buildAuthoredView(
  row: Awaited<ReturnType<typeof ownedChat>>,
  vendor: VendorChoice,
  chosen: SubRef,
  nextOrdinal: number,
  persisted: PersistedDraft[],
  messages: ChatMessage[],
): ChatView {
  return {
    chatId: row.id,
    studentId: row.studentId,
    chapterId: row.chapterId ?? null,
    chapterIds: chatChapterIds(row),
    mode: (row.mode as AuthoringMode) ?? "blocked",
    subTopicId: chosen.subTopicId,
    vendor,
    messages,
    draft: {
      chatId: row.id,
      studentId: row.studentId,
      subTopicId: chosen.subTopicId,
      subTopicName: chosen.subTopicName,
      topicName: chosen.topicName,
      chapterName: chosen.chapterName,
      nextOrdinal,
      drafts: persisted,
    },
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
  },
): Promise<ChatView> {
  const row = await ownedChat(tx, args.tutorUserId, args.chatId);
  const text = args.text.trim();
  if (!text) throw new Error("message is empty");

  const vendor = row.vendor as VendorChoice;
  const history = parseMessages(row.messages);

  const userMsg: ChatMessage = {
    id: randomUUID(),
    role: "user",
    text,
    createdAt: new Date().toISOString(),
  };

  // Grounding is assembled once and woven into the FIRST (stitched) user turn;
  // on resumed turns it already lives in the vendor session.
  const grounding = await assembleGrounding(tx, {
    tutorUserId: args.tutorUserId,
    studentId: row.studentId,
    chapterIds: chatChapterIds(row),
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
  const canResume =
    prevSessionId !== null &&
    sameVendor &&
    (!needsJsonlPreflight || (await jsonlExists(prevSessionId)));

  const isGemini = vendor === "gemini_api";

  // Both vendors author in-chat by picking the target BY NUMBER (Gemini via the
  // author_questions tool; Claude via the fenced marker) — so give EVERY turn the
  // chapter's numbered sub-topic list (the same allowlist proposeTarget uses).
  // Small + always current, so the numbering both paths reference is stable
  // regardless of resume.
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
      targetsBlock = `\n\n===== AUTHORING TARGETS (for author_questions.subTopicNumber) =====\n${list}\n===== END AUTHORING TARGETS =====`;
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

  const tools = isGemini && subs.length > 0 ? [authorQuestionsToolSpec()] : undefined;

  const call = (
    resumeId: string | undefined,
    msg: string,
    toolChoice?: "auto" | "any" | "none",
  ) =>
    complete({
      systemPrompt: chatSystemFor(vendor),
      userMessage: msg,
      endpoint: AUTHORING_CHAT_ENDPOINT,
      userId: args.tutorUserId,
      model: "", // vendor default (claude opus / gemini pro)
      timeoutSec: CHAT_TIMEOUT_SEC,
      streamKey: args.streamKey,
      resumeSessionId: resumeId,
      vendorId: vendor as VendorId,
      slotId: AUTHORING_CHAT_ENDPOINT,
      tools,
      toolChoice: tools ? (toolChoice ?? "auto") : undefined,
    });

  let ai: Awaited<ReturnType<typeof complete>>;
  try {
    ai = await call(resumeSessionId, userMessage);
  } catch (err) {
    // Stale Gemini interaction id → drop resume + retry stitched (unit_chat
    // iter-3.5). Other errors bubble.
    if (resumeSessionId !== undefined && isStaleInteractionError(err)) {
      ai = await call(undefined, buildStitched() + targetsBlock);
    } else {
      throw err;
    }
  }

  const firedTool = () =>
    ai.toolCalls?.find((c) => c.name === AUTHOR_QUESTIONS_TOOL_NAME);

  // Iter-3.5 layer A/B — Gemini decided to author but emitted the call as
  // pseudocode TEXT instead of a structured function_call (observed on resumed
  // turns). Retry once, stitched + tool_choice=any, to force a real call.
  if (
    tools &&
    resumeSessionId !== undefined &&
    !firedTool() &&
    looksLikeFakeToolCall(ai.text)
  ) {
    ai = await call(undefined, buildStitched() + targetsBlock, "any");
  }

  // ── Tool-call path (Gemini only): the model authored. Resolve the target,
  //    validate the drafts, follow up for a wrap-up line, and RETURN the drafts
  //    for the review form (decision 2b — NOT saved here; the tutor edits + saves). ──
  const toolCall = firedTool();
  if (tools && toolCall) {
    const parsed = authorToolArgsSchema.safeParse(toolCall.args);
    if (parsed.success && subs.length > 0) {
      const { chosen, nextOrdinal, persisted } = await resolveAndAuthor(tx, {
        row,
        subs,
        subTopicNumber: parsed.data.subTopicNumber,
        count: parsed.data.count,
        history,
        text,
        vendor,
      });

      const toolResult = {
        drafted: persisted.length,
        subTopic: chosen.subTopicName,
        status: "shown to the tutor in a review form to edit + save",
      };

      // Follow-up: hand the tool result back so Gemini writes a short wrap-up.
      // Re-pass tools + tool_choice=none (Gemini's interactions API 400s on a
      // follow-up that drops the tool schema).
      const followUp = await complete({
        systemPrompt: chatSystemFor(vendor),
        userMessage: "",
        endpoint: AUTHORING_CHAT_ENDPOINT,
        userId: args.tutorUserId,
        model: "",
        timeoutSec: CHAT_TIMEOUT_SEC,
        streamKey: args.streamKey,
        resumeSessionId: ai.sessionId ?? undefined,
        vendorId: vendor as VendorId,
        slotId: AUTHORING_CHAT_ENDPOINT,
        tools,
        toolChoice: "none",
        toolResults: [
          { callId: toolCall.id, name: AUTHOR_QUESTIONS_TOOL_NAME, result: toolResult },
        ],
      });

      const wrapText =
        sanitiseAssistantText(followUp.text) ||
        `Drafted ${toolResult.drafted} question${toolResult.drafted === 1 ? "" : "s"} for ${chosen.subTopicName} — review, edit, and save them below.`;

      const assistantMsg: ChatMessage = {
        id: randomUUID(),
        role: "assistant",
        text: wrapText,
        createdAt: new Date().toISOString(),
        aiSessionId: followUp.sessionId ?? undefined,
        vendorId: vendor,
        sessionFingerprint: followUp.sessionFingerprint,
      };
      const messages = [...history, userMsg, assistantMsg];
      await tx
        .update(authoringChat)
        .set({ messages, updatedAt: new Date() })
        .where(eq(authoringChat.id, row.id));

      return buildAuthoredView(row, vendor, chosen, nextOrdinal, persisted, messages);
    }
    // Args failed schema → fall through to the normal path (treat as a plain
    // reply; the model usually re-offers next turn).
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
      const { chosen, nextOrdinal, persisted } = await resolveAndAuthor(tx, {
        row,
        subs,
        subTopicNumber: marker.subTopicNumber,
        count: marker.count,
        history,
        text,
        vendor,
      });

      // Wrap-up = Claude's own prose with the directive block removed (no follow-up
      // call — Claude has no tool schema to hand a result back to); fall back to a
      // canned line if stripping left nothing.
      const wrapText =
        stripAuthorMarker(ai.text) ||
        `Drafted ${persisted.length} question${persisted.length === 1 ? "" : "s"} for ${chosen.subTopicName} — review, edit, and save them below.`;

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

      return buildAuthoredView(row, vendor, chosen, nextOrdinal, persisted, messages);
    }
  }

  // ── Normal path: persist the assistant turn as-is. sanitise only on Gemini
  //    (a stray "thought"/"tool_code" leak); Claude text is passed through. ──
  const assistantMsg: ChatMessage = {
    id: randomUUID(),
    role: "assistant",
    text: isGemini ? sanitiseAssistantText(ai.text) || ai.text : ai.text,
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
    mode: (row.mode as AuthoringMode) ?? "blocked",
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
 * Author N subjective questions to the student's weakness, using the chat as
 * intent. ONE structured call, reads-only/re-runnable. Honors the chat's vendor:
 * Gemini → geminiJson (responseSchema); Claude CLI → prompted JSON + extractJson.
 */
export async function authorFromChat(
  tx: Tx,
  args: {
    tutorUserId: string;
    chatId: string;
    subTopicId: string;
    count: number;
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

  return {
    chatId: row.id,
    studentId: row.studentId,
    subTopicId: chosen.subTopicId,
    subTopicName: chosen.subTopicName,
    topicName: chosen.topicName,
    chapterName: chosen.chapterName,
    count,
    rationale: parsed.rationale,
  };
}

// ───────────────────────── proposeTargetSet (interleaved fan-out, QA3-e-2) ─────────────────────────

// The set proposer (interleaved authoring). Where proposeTarget picks ONE
// sub_topic, this picks a SET (2–5) that together make a good interleaved
// practice mix across the chat's chosen chapters — the master-side selection that
// feeds the parallel fan-out (authorSetFromChat). Interleaved is a policy of the
// FE (it only offers this in interleaved mode); the service stays general.
const PROPOSE_SET_MAX = 5;
const PROPOSE_SET_ENDPOINT = "authoring.proposeTargetSet";

const PROPOSE_SET_SYSTEM = `You help a tutor assemble an INTERLEAVED practice set for a specific student — a MIX of sub-topics (from possibly different chapters) that are worth practising together so the student must DISCRIMINATE between them, not just drill one skill. You are given the student's grounding (two-axis mastery + Stage-1 observations), the conversation so far, and a NUMBERED list of candidate sub-topics across the chosen chapters. Pick 2–${PROPOSE_SET_MAX} sub-topics that (a) target genuine weaknesses and (b) are close enough to be confusable / benefit from being mixed. For EACH pick, choose a small count (1–4; interleaved sets are short per sub-topic — 2 is a sensible default). You MUST pick by the list's number — never invent a sub-topic; never repeat a number. Return ONLY {picks:[{choice,count}], rationale} where rationale is one sentence on why this MIX.`;

const proposeSetResultSchema = z.object({
  picks: z
    .array(z.object({ choice: z.number().int(), count: z.number().int() }))
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
          count: {
            type: Type.INTEGER,
            description: "how many questions for this sub-topic (1–4); 2 is a sensible default",
          },
        },
        required: ["choice", "count"],
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

OUTPUT FORMAT (STRICT): respond with ONLY a JSON object {"picks":[{"choice":<1-based number>,"count":<1-4>}],"rationale":"..."}. No prose, no fences.`;

export type ProposeSetPick = {
  subTopicId: string;
  subTopicName: string;
  topicName: string;
  chapterName: string;
  count: number;
};
export type ProposeSetResult = {
  chatId: string;
  studentId: string;
  rationale: string;
  picks: ProposeSetPick[];
};

/**
 * Propose an interleaved SET of sub-topics + per-sub-topic counts from the
 * conversation + grounding (QA3-e-2). Like proposeTarget, the model picks BY
 * NUMBER from the chat's chapter allowlist (index, never a raw UUID — M15), so
 * every pick is a valid in-scope anchor. Dedups, clamps counts (1–4) and the set
 * size (≤${PROPOSE_SET_MAX}). Reads-only/re-runnable (fork 4 preserved). The tutor
 * confirms; authorSetFromChat then fans out.
 */
export async function proposeTargetSet(
  tx: Tx,
  args: { tutorUserId: string; chatId: string },
): Promise<ProposeSetResult> {
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
${convo || "(no conversation yet — use the grounding to pick a confusable mix of the student's weakest areas)"}
===== END CONVERSATION =====

SUB-TOPICS ACROSS THESE CHAPTERS (choose 2–${PROPOSE_SET_MAX} by their numbers, as an interleaved mix):
${list}

Assemble the interleaved set now. Return {picks:[{choice,count}], rationale}.`;

  const parsed = await runVendoredJson<z.infer<typeof proposeSetResultSchema>>({
    vendor: row.vendor as VendorChoice,
    geminiSystem: PROPOSE_SET_SYSTEM,
    geminiResponseSchema: geminiProposeSetSchema,
    claudeSystem: CLAUDE_PROPOSE_SET_FORMAT,
    prompt,
    parse: (raw) => proposeSetResultSchema.parse(raw),
    label: `propose-set:${args.chatId}`,
    endpoint: PROPOSE_SET_ENDPOINT,
  });

  // Clamp each choice onto a real allowlist entry, clamp counts (1–4), DEDUP by
  // sub_topic (a repeated number collapses), and cap the set size.
  const seen = new Set<string>();
  const picks: ProposeSetPick[] = [];
  for (const p of parsed.picks) {
    const idx = Math.min(Math.max(p.choice, 1), subs.length) - 1;
    const chosen = subs[idx]!;
    if (seen.has(chosen.subTopicId)) continue;
    seen.add(chosen.subTopicId);
    picks.push({
      subTopicId: chosen.subTopicId,
      subTopicName: chosen.subTopicName,
      topicName: chosen.topicName,
      chapterName: chosen.chapterName,
      count: Math.min(Math.max(p.count, 1), 4),
    });
    if (picks.length >= PROPOSE_SET_MAX) break;
  }
  if (picks.length === 0) {
    // The model returned only out-of-range/dup picks — fall back to the first
    // allowlist entry so the tutor still gets an actionable proposal.
    const first = subs[0]!;
    picks.push({
      subTopicId: first.subTopicId,
      subTopicName: first.subTopicName,
      topicName: first.topicName,
      chapterName: first.chapterName,
      count: 2,
    });
  }

  return {
    chatId: row.id,
    studentId: row.studentId,
    rationale: parsed.rationale,
    picks,
  };
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
    targets: { subTopicId: string; count: number }[];
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
    resolved.push({
      id: st.id,
      name: st.name,
      topicName: st.topicName,
      chapterName: st.chapterName,
      count: Math.min(Math.max(t.count, 1), 8),
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

  // Refinement authors to the SAME method pack/bar as the worker (QA3-e).
  const pack = await loadMethodPack();
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
