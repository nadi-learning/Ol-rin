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
  persistDrafts,
  QUESTION_AUTHOR_SYSTEM,
  type DraftItem,
  type PersistedDraft,
} from "./authoring";
import { SubTopicNotFoundError } from "./assessment";
import { assertTutorsStudent, getStudentMastery } from "./tutor";
import { jsonlExists } from "./cli_session";

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

// Claude path — no tool. Authoring runs through the button, so tell the tutor
// exactly that (this is TRUE for Claude → the AI never contradicts itself).
const CHAT_SYSTEM_CLAUDE = `${CHAT_SYSTEM_BASE}

HOW AUTHORING HAPPENS (so you can guide the tutor correctly): you do NOT write the final questions in your chat replies. When you and the tutor have converged on what to work on, tell them to click the **"Suggest what to work on"** button (next to the message box). That makes you formally propose ONE sub-topic + a number of questions; the tutor confirms it, and the questions are drafted into a review form for them to edit and save. So when the tutor says "let's author" or "go ahead", point them to the "Suggest what to work on" button to lock the target — don't say authoring happens elsewhere, and don't claim you can't author.`;

// Gemini path — has the author_questions tool. It authors IN-CHAT on the tutor's
// go-ahead. The drafts still land in the review form (decision 2b: the tutor
// edits + saves; nothing goes live to a student without that). The button also
// remains available.
const CHAT_SYSTEM_GEMINI = `${CHAT_SYSTEM_BASE}

HOW AUTHORING HAPPENS (so you author correctly): you have a tool — \`author_questions\`. When you and the tutor have converged and the tutor gives a clear go-ahead ("author 3", "go ahead", "let's do it", "make those"), CALL \`author_questions\` with (a) \`subTopicNumber\` = the number of the chosen sub-topic from the AUTHORING TARGETS list in the message, and (b) the drafted \`questions\`. The drafts then appear in a review form where the tutor edits and saves them — so authoring happens RIGHT HERE, by you. Until the tutor gives a go-ahead, do NOT call the tool — keep discussing. Emit the tool as a STRUCTURED function call — NEVER print it as text, pseudocode, tool_code, or \`print(default_api...)\`. (A "Suggest what to work on" button also exists as an alternative, but you don't need it — the tool is yours.)`;

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
      "Draft a batch of subjective practice questions for ONE sub-topic, targeting this student's weakness. Call ONLY after the tutor gives an explicit go-ahead. The drafts are shown to the tutor in a review form to edit + save — this does NOT save them directly. `subTopicNumber` MUST be one of the numbers in the AUTHORING TARGETS list.",
    inputSchemaJson: {
      type: Type.OBJECT,
      properties: {
        subTopicNumber: {
          type: Type.INTEGER,
          description:
            "the 1-based number of the sub-topic to author for, from the AUTHORING TARGETS list in the message",
        },
        questions: geminiQuestionSchema.properties.questions,
      },
      required: ["subTopicNumber", "questions"],
    } as Record<string, unknown>,
  };
  return cachedAuthorTool;
}

// Validates the tool call's args. `questions` reuses the draft schema (so the
// tool output is byte-identical to what authorFromChat/the form already handle).
const authorToolArgsSchema = z.object({
  subTopicNumber: z.number().int(),
  questions: draftBatchSchema.shape.questions,
});

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
  args: { tutorUserId: string; studentId: string; chapterId?: string | null },
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
              `conceptual L${m.conceptualLevel}, procedural L${m.proceduralLevel}. ${m.description}`,
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
  const coverageLines = args.chapterId
    ? await (async () => {
        const rows = await tx
          .select({
            topicName: topic.name,
            topicOrdinal: topic.ordinal,
            subTopicId: subTopic.id,
            subTopicName: subTopic.name,
            subTopicOrdinal: subTopic.ordinal,
          })
          .from(subTopic)
          .innerJoin(topic, eq(topic.id, subTopic.topicId))
          .where(eq(topic.chapterId, args.chapterId!))
          .orderBy(asc(topic.ordinal), asc(subTopic.ordinal));

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

        return rows
          .map((r) => {
            const n = byId.get(r.subTopicId) ?? 0;
            const tag =
              n === 0
                ? "NONE authored yet"
                : `${n} question${n === 1 ? "" : "s"} authored`;
            return `  - ${r.topicName} › ${r.subTopicName}: ${tag}`;
          })
          .join("\n");
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
          "CHAPTER COVERAGE (every sub-topic in this chat's chapter + how many questions already exist for THIS student — canonical + private. Use this to answer what's left to author):",
          coverageLines,
        ]
      : []),
    "",
    "===== END STUDENT GROUNDING =====",
  ].join("\n");
}

// ───────────────────────── chat lifecycle ─────────────────────────

export type ChatView = {
  chatId: string;
  studentId: string;
  chapterId: string | null; // the upfront chapter scope (Slice AUTH-v2.1)
  subTopicId: string | null; // resolved authoring focus (set by proposeTarget)
  vendor: VendorChoice;
  messages: ChatMessage[];
  // Set ONLY on a sendTurn where the Gemini author_questions tool fired: the
  // drafted questions the FE routes into the review form (decision 2b — same
  // shape as authorFromChat; not persisted, the tutor edits + saves). Absent on
  // every ordinary turn and on the Claude path.
  draft?: AuthorFromChatResult;
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

/** Start a new authoring chat for one student with a chosen vendor. */
export async function startChat(
  tx: Tx,
  args: {
    boardId: string;
    tutorUserId: string;
    studentId: string;
    vendor: VendorChoice;
    // The chapter chosen upfront (Slice AUTH-v2.1). Optional at the service layer
    // for back-compat, but the v2.1 flow always passes it — proposeTarget requires
    // it to scope the sub_topic allowlist.
    chapterId?: string | null;
  },
): Promise<ChatView> {
  await assertTutorsStudent(tx, args.tutorUserId, args.studentId);
  const [created] = await tx
    .insert(authoringChat)
    .values({
      boardId: args.boardId,
      tutorId: args.tutorUserId,
      studentId: args.studentId,
      chapterId: args.chapterId ?? null,
      vendor: args.vendor,
      messages: [],
    })
    .returning();
  return {
    chatId: created!.id,
    studentId: created!.studentId,
    chapterId: created!.chapterId ?? null,
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
  return {
    chatId: row.id,
    studentId: row.studentId,
    chapterId: row.chapterId ?? null,
    subTopicId: row.subTopicId ?? null,
    vendor: row.vendor as VendorChoice,
    messages: parseMessages(row.messages),
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
    chapterId: row.chapterId ?? null,
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

  // Gemini authors in-chat via the author_questions tool, picking the target
  // BY NUMBER — so give it the chapter's numbered sub-topic list (the same
  // allowlist proposeTarget uses) on EVERY Gemini turn. Small + always current,
  // so the numbering the tool references is stable regardless of resume.
  let subs: {
    subTopicId: string;
    subTopicName: string;
    topicName: string;
    chapterName: string;
  }[] = [];
  let targetsBlock = "";
  if (isGemini && row.chapterId) {
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
      .where(eq(chapter.id, row.chapterId))
      .orderBy(asc(topic.ordinal), asc(subTopic.ordinal));
    if (subs.length > 0) {
      const list = subs
        .map((s, i) => `  ${i + 1}. ${s.topicName} › ${s.subTopicName}`)
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
      const idx = Math.min(Math.max(parsed.data.subTopicNumber, 1), subs.length) - 1;
      const chosen = subs[idx]!;
      const nextOrdinal = await nextOrdinalFor(tx, chosen.subTopicId);

      // Persist the resolved focus (mirrors proposeTarget/authorFromChat).
      await tx
        .update(authoringChat)
        .set({ subTopicId: chosen.subTopicId, updatedAt: new Date() })
        .where(eq(authoringChat.id, row.id));

      // Slice FIG-AUTH (D-FIG-5): persist the drafts as status='draft' rows so each
      // has a real id — the review form can render a figure against it + preview
      // before the tutor approves. Still NOT live (decision 2b + D-FIG-1: nothing
      // reaches a student until approveDrafts flips status).
      const persisted = await persistDrafts(tx, {
        boardId: row.boardId,
        subTopicId: chosen.subTopicId,
        targetStudentId: row.studentId,
        drafts: parsed.data.questions,
      });

      const toolResult = {
        drafted: parsed.data.questions.length,
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

      return {
        chatId: row.id,
        studentId: row.studentId,
        chapterId: row.chapterId ?? null,
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
    // Args failed schema → fall through to the normal path (treat as a plain
    // reply; the model usually re-offers next turn).
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
  // Chapter-scope guard (Slice AUTH-v2.1): the confirmed sub_topic MUST live in the
  // chat's chosen chapter — the anchor can't escape the hierarchy the tutor picked.
  if (row.chapterId && st.chapterId !== row.chapterId) {
    throw new SubTopicNotFoundError(args.subTopicId);
  }
  // Persist the authoring focus (also set by proposeTarget; kept in sync when
  // authorFromChat is called directly).
  await tx
    .update(authoringChat)
    .set({ subTopicId: args.subTopicId, updatedAt: new Date() })
    .where(eq(authoringChat.id, row.id));

  const los = await tx
    .select()
    .from(learningObjective)
    .where(eq(learningObjective.subTopicId, args.subTopicId));
  const conceptualLos = los
    .filter((l) => l.axis === "conceptual" || l.axis === "both")
    .map((l) => l.description);
  const proceduralLos = los
    .filter((l) => l.axis === "procedural" || l.axis === "both")
    .map((l) => l.description);

  const nextOrdinal = await nextOrdinalFor(tx, args.subTopicId);

  const grounding = await assembleGrounding(tx, {
    tutorUserId: args.tutorUserId,
    studentId: row.studentId,
    chapterId: row.chapterId ?? null,
  });
  const convo = history
    .map((m) => `${m.role === "user" ? "TUTOR" : "AI"}: ${m.text}`)
    .join("\n\n");

  const loList = (ls: string[]) =>
    ls.length ? ls.map((d, n) => `  ${n + 1}. ${d}`).join("\n") : "  (none recorded)";

  const prompt = `${grounding}

===== AUTHORING BRIEF (from the conversation with the tutor) =====
${convo || "(no conversation — author to the student's weakest areas in the grounding above)"}
===== END BRIEF =====

CHAPTER: ${st.chapterName}
TOPIC: ${st.topicName}
SUB-TOPIC: ${st.name}

CONCEPTUAL LEARNING OBJECTIVES:
${loList(conceptualLos)}

PROCEDURAL LEARNING OBJECTIVES:
${loList(proceduralLos)}

HOW MANY: write exactly ${args.count} question${args.count === 1 ? "" : "s"}, as an ordered scaffolded sequence, AIMED AT THIS STUDENT'S WEAKNESS as established above.

Author the set now. Apply §1–§6 and self-score each on the rubric (honest low on at least one axis). Return the structured JSON object with a "questions" array.`;

  const drafts = await runVendoredAuthorCall(row.vendor as VendorChoice, prompt, args.subTopicId);

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

// Claude's strict-shape instruction for the question-authoring JSON (Gemini uses
// geminiQuestionSchema instead). `image` is optional (null when no figure).
const CLAUDE_AUTHOR_FORMAT = `${QUESTION_AUTHOR_SYSTEM}

OUTPUT FORMAT (STRICT): respond with ONLY a single JSON object, no prose, no markdown fences, of the exact shape:
{"questions":[{"axis":"conceptual|procedural|both","stem":"...","referenceAnswer":"...","explanation":"... or null","intent":"...","rubric":{"ar":0,"ms":0,"mr":0,"ba":0,"gl":0},"honestLowReason":"...","image":null}]}
Every question MUST include ALL FIVE rubric axes (ar, ms, mr, ba, gl). Set "image" to null unless a figure is genuinely required; when required, use {"description":"...","shows":["..."],"hides":["..."]}.`;

/** The structured question-authoring call, vendor-aware. Returns N drafts. */
function runVendoredAuthorCall(
  vendor: VendorChoice,
  prompt: string,
  label: string,
): Promise<DraftItem[]> {
  return runVendoredJson({
    vendor,
    geminiSystem: QUESTION_AUTHOR_SYSTEM,
    geminiResponseSchema: geminiQuestionSchema,
    claudeSystem: CLAUDE_AUTHOR_FORMAT,
    prompt,
    parse: (raw) => draftBatchSchema.parse(raw).questions,
    label: `authoring-chat:${label}`,
    endpoint: AUTHORING_CALL_ENDPOINT,
  });
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
  if (!row.chapterId) {
    throw new ProposeTargetError("NO_CHAPTER", "this chat has no chapter scope");
  }

  // The allowlist: the chosen chapter's sub_topics, in hierarchy order.
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
    .where(eq(chapter.id, row.chapterId))
    .orderBy(asc(topic.ordinal), asc(subTopic.ordinal));
  if (subs.length === 0) {
    throw new ProposeTargetError("NO_SUBTOPICS", "this chapter has no sub-topics");
  }

  const grounding = await assembleGrounding(tx, {
    tutorUserId: args.tutorUserId,
    studentId: row.studentId,
    chapterId: row.chapterId ?? null,
  });
  const history = parseMessages(row.messages);
  const convo = history
    .map((m) => `${m.role === "user" ? "TUTOR" : "AI"}: ${m.text}`)
    .join("\n\n");
  const list = subs
    .map((s, i) => `  ${i + 1}. ${s.topicName} › ${s.subTopicName}`)
    .join("\n");

  const prompt = `${grounding}

===== CONVERSATION SO FAR =====
${convo || "(no conversation yet — use the grounding to pick the student's weakest area)"}
===== END CONVERSATION =====

SUB-TOPICS IN THIS CHAPTER (choose ONE by its number):
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

  const prompt = `Revise this ONE question. Keep it aimed at the same target and axis unless the instruction says otherwise; apply the tutor's instruction; keep it SUBJECTIVE and to the question-craft bar (§1–§7).
${loBlock}
EXISTING QUESTION (JSON):
${JSON.stringify(existingJson, null, 2)}

TUTOR'S REVISION INSTRUCTION: ${note}

Return the revised question as a "questions" array containing EXACTLY ONE question, in the same JSON shape.`;

  const drafts = await runVendoredAuthorCall(
    row.vendor as VendorChoice,
    prompt,
    `revise:${args.chatId}`,
  );
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
