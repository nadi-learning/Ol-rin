// Slice QA3-e — the authoring WORKER (D-QA3-7 master→worker refactor).
//
// The master chat (authoring_chat.ts) orchestrates the tutor dialogue with broad
// context. When it authors, it SPAWNS a fresh, scoped worker session for ONE
// sub_topic via `spawnAuthoringWorker`. The worker gets ONLY its slice — the
// chapter's raw topics.md blob, the sub_topic's LOs, the existing bank questions,
// and the tutor's brief — NOT the master's full multi-chapter grounding. "One
// job, clean context" (the front-load-cognitive-work / federated-agent principle).
//
// Method delivery (D-QA3-7 refinement, Option A — user-approved QA3-e):
//   ONE method body, read at fire-time from the LOCAL method-pack file
//   (.claude/skills/question-authoring-worker/SKILL.md), delivered as SYSTEM
//   CONTEXT to both vendors — Claude via --system-prompt, Gemini via
//   systemInstruction. The pack carries O1 (the conceptual-kinds palette) + O2
//   (the spiral default), which the old hand-distilled QUESTION_AUTHOR_SYSTEM
//   lacked. Read fresh each call so pack edits apply (the snapshot-vs-read gotcha).
//
// Resume (D-QA3-8): each spawn is logged to `authoring_worker` (session id +
// fingerprint + brief + output). On a re-author of the SAME (chat, sub_topic) the
// Claude worker RESUMES the prior session — but only when the fingerprint still
// matches (same pack) and the CLI JSONL is still on disk; otherwise a fresh spawn.
// A stable pack → stable fingerprint → resumable (a mismatched pack must NOT
// resume — resuming a session built under a different system prompt silently
// corrupts context; ai-integration-gotchas). Gemini is a stateless structured
// call: no session id, "resume" = re-issue with the (bank-aware) scoped context.

import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { and, desc, eq } from "drizzle-orm";
import type { PgTransaction } from "drizzle-orm/pg-core";
import { Type } from "@google/genai";
import {
  authoringWorker,
  board,
  chapter,
  learningObjective,
  question,
  subject,
  subTopic,
  topic,
} from "@b2c/kernel/schema";
import {
  WorkerPlan,
  WorkerTurn,
  type VendorChoice,
  type WorkerEpisodeStatus,
} from "@b2c/kernel/contracts";
import { complete, computeSessionFingerprint, extractJsonObject } from "./ai_client";
import { geminiJson } from "./ai/gemini";
import { SubTopicNotFoundError } from "./assessment";
import {
  draftBatchSchema,
  geminiQuestionSchema,
  type DraftItem,
} from "./authoring";

type Tx = PgTransaction<any, any, any>;

const WORKER_ENDPOINT = "authoring.worker";
const WORKER_TIMEOUT_SEC = 600;

// Authoring's Gemini bounds. Authoring still rides the HTTP request, so these
// are only safe UNDER nginx's proxy timeout — they are not independent numbers.
//
// 🔴 HARD PROD DEPENDENCY — READ BEFORE DEPLOYING THIS FILE.
// `geminiJson` retries once and its catch swallows timeouts too, so the real
// bound is 2 x AUTHORING_TIMEOUT_MS = 600s. That REQUIRES nginx's
// `proxy_read_timeout`/`proxy_send_timeout` on /trpc/ + /api/ to be **700s**.
// At nginx's previous 300s this file 504s: nginx serves its HTML error page,
// the tRPC client JSON.parse's it, and the tutor sees
// `Unexpected token '<', "<html> <h"...` — the 2026-07-16 incident, verbatim.
// The nginx config is HAND-AUTHORED on the box (/etc/nginx/nginx.conf), NOT
// templated from this repo — so it does not travel with a deploy and must be
// re-applied by hand if nginx.conf is ever regenerated. See deploy-olorin.md.
//
// The thinking cap, not the timeout, is what actually bounds latency.
// Measured: normal authors spend 6-9k thinking tokens (60-116s); one prod run
// hit 62,910 (217s) on the SAME task — a 7x runaway. The problem was never the
// mean, it was unbounded variance. 16k is ~2x headroom over every normal author
// observed and kills only the runaway. With it in place no normal author should
// approach 300s; the timeout is the backstop, not the working bound.
//
// The cap REVISES the earlier call recorded here ("do NOT bound authoring
// quality for latency"), on the founder's decision once the variance data
// existed: a 16k floor bounds the runaway, not the quality — no normal author
// reaches it. Per M28, cap `thinkingBudget`, NEVER `maxOutputTokens` — on a
// thinking model the latter bounds thinking + answer together and starves the
// JSON out of the response.
//
// All of this is a compromise with the request/response shape. Moving authoring
// to BullMQ + poll removes the proxy ceiling and makes both numbers obsolete.
const AUTHORING_TIMEOUT_MS = 300_000;
const AUTHORING_THINKING_BUDGET = 16_000;

// The method pack lives at the repo root under .claude/skills/… (its natural
// home; Claude can load it as a real skill later). v0 reads its TEXT and injects
// it as system context. process.cwd() is the BE repo root at runtime.
const METHOD_PACK_DIR = join(
  process.cwd(),
  ".claude",
  "skills",
  "question-authoring-worker",
);
const METHOD_PACK_PATH = join(METHOD_PACK_DIR, "SKILL.md");
// Full source docs (migrated from b2c/.claude/skills/learning-system/, 2026-07-23):
// the complete conceptual-kinds palette + the per-board/subject difficulty-dial
// catalogs. SKILL.md keeps only pointers; these ride along as appended sections.
const KINDS_DOC_PATH = join(METHOD_PACK_DIR, "conceptual-question-kinds.md");
const DIAL_DOCS: Record<string, string> = {
  "science-g10": join(METHOD_PACK_DIR, "science-g10-difficulty-dials.md"),
  "math-g10": join(METHOD_PACK_DIR, "math-g10-difficulty-dials.md"),
  "cambridge-physics": join(METHOD_PACK_DIR, "cambridge-physics-difficulty-dials.md"),
};

// Strip a leading YAML frontmatter block (--- … ---) so the model sees only the
// method body, not the skill's metadata. Keeps the file a valid loadable skill.
function stripFrontmatter(md: string): string {
  const m = md.match(/^---\n[\s\S]*?\n---\n?/);
  return m ? md.slice(m[0].length).trimStart() : md;
}

/**
 * Pick the difficulty-dials catalog for a (board, subject) pair. Grounded on the
 * live subject slugs (2026-07-23): cbse → chemistry|maths|physics|custom-assessment,
 * cambridge → physics|custom-assessment. Unknown/custom subjects get NO dial doc —
 * SKILL.md's compressed dial sentence remains the fallback calibration.
 */
export function dialDocKeyFor(
  boardSlug: string | null | undefined,
  subjectSlug: string | null | undefined,
): string | null {
  if (!subjectSlug) return null;
  const s = subjectSlug.toLowerCase();
  if (s.startsWith("math")) return "math-g10"; // 'maths' | 'math'
  const isPhysics = s.startsWith("phys");
  const isScience =
    isPhysics || s.startsWith("chem") || s.startsWith("bio") || s === "science";
  if (!isScience) return null; // custom-assessment etc.
  if (boardSlug?.toLowerCase() === "cambridge" && isPhysics)
    return "cambridge-physics";
  return "science-g10";
}

export type MethodPackContext = {
  boardSlug: string | null;
  subjectSlug: string | null;
};

/**
 * Resolve the (board, subject) slugs that select the dial doc, from a sub_topic.
 * Used by callers that don't already join the hierarchy (reviseDraft).
 */
export async function methodPackContextFor(
  tx: Tx,
  subTopicId: string,
): Promise<MethodPackContext> {
  const [row] = await tx
    .select({ boardSlug: board.slug, subjectSlug: subject.slug })
    .from(subTopic)
    .innerJoin(topic, eq(topic.id, subTopic.topicId))
    .innerJoin(chapter, eq(chapter.id, topic.chapterId))
    .innerJoin(subject, eq(subject.id, chapter.subjectId))
    .innerJoin(board, eq(board.id, chapter.boardId))
    .where(eq(subTopic.id, subTopicId));
  return { boardSlug: row?.boardSlug ?? null, subjectSlug: row?.subjectSlug ?? null };
}

// Read fresh each call (fire-time read — pack edits apply without a redeploy).
// Small files, low-frequency call; no memoization needed. Exported so the sibling
// refinement path (reviseDraft) authors to the SAME pack/bar.
//
// Composition (2026-07-23, user-directed): SKILL.md (the bar + spiral + output
// rules) + the FULL conceptual-kinds palette doc + the (board, subject)-selected
// difficulty-dials catalog. SKILL.md + the kinds doc are load-bearing repo files —
// a missing one THROWS (a deploy bug must surface, not silently degrade the bar).
// The dial doc is selected — no match (custom-assessment, unknown subject, no
// context) simply omits the section.
export async function loadMethodPack(ctx?: MethodPackContext): Promise<string> {
  const [skillRaw, kindsRaw] = await Promise.all([
    readFile(METHOD_PACK_PATH, "utf8"),
    readFile(KINDS_DOC_PATH, "utf8"),
  ]);
  const parts = [
    stripFrontmatter(skillRaw),
    `===== THE CONCEPTUAL-QUESTION-KINDS PALETTE (the full palette — pick kinds from HERE) =====

${stripFrontmatter(kindsRaw)}

===== END PALETTE =====`,
  ];
  const dialKey = dialDocKeyFor(ctx?.boardSlug, ctx?.subjectSlug);
  if (dialKey) {
    const dialRaw = await readFile(DIAL_DOCS[dialKey]!, "utf8");
    parts.push(`===== THE DIFFICULTY-DIALS CATALOG for this subject (calibrate procedural difficulty from HERE) =====

${stripFrontmatter(dialRaw)}

===== END DIALS =====`);
  }
  return parts.join("\n\n");
}

// Claude has no schema-constrained output — append the strict JSON shape to the
// pack (mirrors the retired CLAUDE_AUTHOR_FORMAT tail). Gemini uses the response
// schema instead, so its systemInstruction is the bare pack.
export function claudeSystemFor(pack: string): string {
  return `${pack}

OUTPUT FORMAT (STRICT): respond with ONLY a single JSON object, no prose, no markdown fences, of the exact shape:
{"questions":[{"axis":"conceptual|procedural|both","stem":"...","referenceAnswer":"...","explanation":"... or null","intent":"...","rubric":{"ar":0,"ms":0,"mr":0,"ba":0,"gl":0},"honestLowReason":"...","image":null}]}
Every question MUST include ALL FIVE rubric axes (ar, ms, mr, ba, gl). Set "image" to null unless a figure is genuinely required; when required, use {"description":"...","shows":["..."],"hides":["..."]}.`;
}

/**
 * The worker's ENTIRE world for one sub_topic, assembled once and shared by BOTH
 * phases (Slice TWOWAY-1). The plan and the draft MUST reason over byte-identical
 * grounding — a plan made against different material than the draft is worse than
 * no plan at all, because the tutor approves something the drafter never saw.
 * Extracted verbatim from what spawnAuthoringWorker used to do inline.
 */
type ScopedWorld = {
  st: {
    id: string;
    name: string;
    topicName: string;
    chapterId: string;
    chapterName: string;
    subjectSlug: string;
    boardSlug: string;
  };
  pack: string;
  /** The scoped prompt MINUS any "how many" / "what to do" instruction. */
  basePrompt: string;
};

async function buildScopedWorld(
  tx: Tx,
  args: { subTopicId: string; brief: string },
): Promise<ScopedWorld> {
  // 1. Resolve the sub_topic + its chapter (for identity + the raw topics.md blob)
  //    + the (board, subject) slugs that select the difficulty-dials catalog.
  const [st] = await tx
    .select({
      id: subTopic.id,
      name: subTopic.name,
      topicName: topic.name,
      chapterId: chapter.id,
      chapterName: chapter.name,
      chapterMetadata: chapter.metadata,
      subjectSlug: subject.slug,
      boardSlug: board.slug,
    })
    .from(subTopic)
    .innerJoin(topic, eq(topic.id, subTopic.topicId))
    .innerJoin(chapter, eq(chapter.id, topic.chapterId))
    .innerJoin(subject, eq(subject.id, chapter.subjectId))
    .innerJoin(board, eq(board.id, chapter.boardId))
    .where(eq(subTopic.id, args.subTopicId));
  if (!st) throw new SubTopicNotFoundError(args.subTopicId);

  // 2. LOs for the sub_topic, split by axis.
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

  // 3. Existing bank questions for this sub_topic (D-QA3-9: coherence + dedup).
  //    Stem + axis + difficulty only — no reference answers (not needed, and the
  //    worker authors NEW questions, it doesn't grade).
  const bank = await tx
    .select({
      stem: question.stem,
      axis: question.axis,
      difficulty: question.difficulty,
    })
    .from(question)
    .where(eq(question.subTopicId, args.subTopicId))
    .orderBy(question.ordinal);

  // 4. The method pack (fire-time read; kinds palette + subject-selected dials).
  const pack = await loadMethodPack({
    boardSlug: st.boardSlug,
    subjectSlug: st.subjectSlug,
  });

  // 5. The scoped prompt — the worker's ENTIRE world.
  const rawTopicsMd =
    (st.chapterMetadata as { topicsMd?: string } | null)?.topicsMd ?? null;
  const loList = (ls: string[]) =>
    ls.length ? ls.map((d, n) => `  ${n + 1}. ${d}`).join("\n") : "  (none recorded)";
  const bankList = bank.length
    ? bank
        .map(
          (q, n) =>
            `  ${n + 1}. [${q.axis}${q.difficulty ? `/${q.difficulty}` : ""}] ${q.stem}`,
        )
        .join("\n")
    : "  (none authored yet)";

  const basePrompt = `===== SOURCE MATERIAL (the chapter's topics.md — human-authored prose; read this) =====
${rawTopicsMd ?? "(no topics.md on record for this chapter — author from the LOs below)"}
===== END SOURCE MATERIAL =====

CHAPTER: ${st.chapterName}
TOPIC: ${st.topicName}
SUB-TOPIC: ${st.name}

CONCEPTUAL LEARNING OBJECTIVES:
${loList(conceptualLos)}

PROCEDURAL LEARNING OBJECTIVES:
${loList(proceduralLos)}

EXISTING QUESTIONS IN THE BANK FOR THIS SUB-TOPIC (for coherence + to avoid near-duplicates):
${bankList}

===== BRIEF FROM THE TUTOR =====
${args.brief.trim() || "(no specific brief — author to this sub-topic's LOs at a sensible default depth, applying the spiral default)"}
===== END BRIEF =====`;

  return {
    st: {
      id: st.id,
      name: st.name,
      topicName: st.topicName,
      chapterId: st.chapterId,
      chapterName: st.chapterName,
      subjectSlug: st.subjectSlug,
      boardSlug: st.boardSlug,
    },
    pack,
    basePrompt,
  };
}

// ───────────────────── Slice TWOWAY-1: the PLAN phase ─────────────────────
//
// Before drafting anything, the worker states what it intends to write and why —
// its read of this student on this sub-topic, one line per intended question, and
// anything it wants to ask the tutor. That plan is gated by the tutor (approve /
// amend) before a single question is drafted.
//
// The plan is a SMALL structured output (a read + N one-liners), which is why it
// is safe as ONE call on both vendors: the truncation class that forced Gemini's
// per-question draft loop needs a big output to bite. Gemini gets a responseSchema;
// Claude gets prompted JSON + extractJsonObject with one retry.

const PLAN_ENDPOINT = "authoring.worker.plan";

const PLAN_SYSTEM_TAIL = `
===== YOUR TASK THIS TURN: PLAN, DO NOT WRITE =====
Do NOT write any questions this turn. Instead produce a PLAN the tutor will approve or amend:
  - "read": your read of THIS student on THIS sub-topic, grounded in the tutor's brief and the source material — where they are weak, what the bank already covers, and what you therefore think is worth probing. 2–4 sentences, specific, no hedging.
  - "items": ONE entry per question you intend to write, in the order you'd write them, each with its axis, the conceptual-question KIND you'd use (from the palette), the specific INTENT (which misconception or skill it probes), and the DIFFICULTY setting in words (per the dial catalog).
  - "questions": anything you genuinely need the tutor to decide before you draft. Usually EMPTY — only ask when the brief is actually ambiguous in a way that would change what you write. Never ask to be polite.
The tutor reads this in a few seconds and either approves it or tells you what to change. Be concrete enough that approving it is a real decision.
===== END TASK =====`;

const geminiPlanSchema = {
  type: Type.OBJECT,
  properties: {
    read: {
      type: Type.STRING,
      description:
        "your read of this student on this sub-topic (2–4 specific sentences: weakness, what the bank covers, what is worth probing)",
    },
    items: {
      type: Type.ARRAY,
      description: "one entry per question you intend to write, in intended order",
      items: {
        type: Type.OBJECT,
        properties: {
          n: { type: Type.INTEGER, description: "1-based position in the set" },
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
        required: ["n", "axis", "kind", "intent", "difficulty"],
      },
    },
    questions: {
      type: Type.ARRAY,
      description:
        "anything you need the tutor to decide before drafting; usually empty",
      items: { type: Type.STRING },
    },
  },
  required: ["read", "items", "questions"],
} as const;

/** Render the worker conversation so far into the next prompt. The worker is
 *  STITCHED, not resumed — its Gemini path is `geminiJson` (stateless, because it
 *  needs responseSchema), so its own history is what carries continuity. This is
 *  also what makes an amendment land: the worker sees its prior plan AND what the
 *  tutor said about it, so a re-plan is a revision, not a fresh guess. */
function workerConversationBlock(turns: WorkerTurn[]): string {
  if (turns.length === 0) return "";
  const lines = turns.map((t) => {
    if (t.role === "tutor") return `TUTOR (amendment): ${t.text}`;
    return `YOU (${t.kind}): ${t.text}`;
  });
  return `\n\n===== YOUR EXCHANGE WITH THE TUTOR SO FAR (this is your own history — build on it, do not restart) =====
${lines.join("\n\n")}
===== END EXCHANGE =====`;
}

/** Human-legible rendering of a plan — persisted as the worker turn's `text` and
 *  relayed into the master chat. Derived from the structured plan at write time so
 *  the two can never disagree. */
export function renderPlanText(plan: WorkerPlan): string {
  const items = plan.items
    .map(
      (i) =>
        `  ${i.n}. [${i.axis}] ${i.kind} — ${i.intent} (difficulty: ${i.difficulty})`,
    )
    .join("\n");
  const asks =
    plan.questions.length > 0
      ? `\n\nBefore I draft:\n${plan.questions.map((q) => `  - ${q}`).join("\n")}`
      : "";
  return `${plan.read}\n\nI'd write:\n${items || "  (nothing — see my questions below)"}${asks}`;
}

export type PlanWorkResult = {
  workerId: string;
  plan: WorkerPlan;
  turns: WorkerTurn[];
  aiSessionId: string | null;
};

/**
 * Run ONE plan turn for an authoring episode and append it to the worker
 * conversation. Creates the episode row when `workerRowId` is absent (a first
 * plan) and appends to it when present (a re-plan after an amendment).
 *
 * Leaves the episode `status = 'planned'` — awaiting the tutor's gate. Runs inside
 * the caller's board-scoped tx (RLS applies).
 */
export async function planAuthoringWork(
  tx: Tx,
  args: {
    boardId: string;
    chatId: string;
    subTopicId: string;
    vendor: VendorChoice;
    count: number;
    /** The tutor's authoring intent distilled from the master conversation. */
    brief: string;
    /** An existing episode to append this plan to (a re-plan); absent = first plan. */
    workerRowId?: string;
  },
): Promise<PlanWorkResult> {
  const world = await buildScopedWorld(tx, {
    subTopicId: args.subTopicId,
    brief: args.brief,
  });

  // The episode's prior turns (empty on a first plan). Read BEFORE the AI call so
  // the amendment the tutor just wrote is part of what the worker replies to.
  const priorTurns = args.workerRowId
    ? await episodeTurns(tx, args.workerRowId)
    : [];

  const planPrompt = `${world.basePrompt}${workerConversationBlock(priorTurns)}

HOW MANY: the tutor asked for ${args.count} question${args.count === 1 ? "" : "s"}. Plan exactly that many items unless your read says a different number is right — if so, plan what you think is right and say why in "read".
${PLAN_SYSTEM_TAIL}`;

  const { plan, aiSessionId } = await runPlanCall({
    vendor: args.vendor,
    pack: world.pack,
    prompt: planPrompt,
    label: `authoring-plan:${args.subTopicId}`,
  });

  const turn: WorkerTurn = {
    id: randomUUID(),
    role: "worker",
    kind: "plan",
    text: renderPlanText(plan),
    plan,
    createdAt: new Date().toISOString(),
    vendorId: args.vendor,
    ...(aiSessionId ? { aiSessionId } : {}),
  };
  const turns = [...priorTurns, turn];

  const workerId = await upsertEpisode(tx, {
    boardId: args.boardId,
    chatId: args.chatId,
    subTopicId: args.subTopicId,
    vendor: args.vendor,
    workerRowId: args.workerRowId,
    brief: planPrompt,
    aiSessionId,
    turns,
    status: "planned",
  });

  return { workerId, plan, turns, aiSessionId };
}

/** The plan call's vendor branch. Small structured output → ONE call on both
 *  vendors (the per-question loop exists for the DRAFT phase's big output only). */
async function runPlanCall(opts: {
  vendor: VendorChoice;
  pack: string;
  prompt: string;
  label: string;
}): Promise<{ plan: WorkerPlan; aiSessionId: string | null }> {
  if (opts.vendor === "gemini_api") {
    const raw = await geminiJson<unknown>({
      label: opts.label,
      systemInstruction: opts.pack,
      prompt: opts.prompt,
      responseSchema: geminiPlanSchema as never,
      timeoutMs: AUTHORING_TIMEOUT_MS,
      thinkingBudget: AUTHORING_THINKING_BUDGET,
      // Uncapped on purpose (M28): thinking is bounded above instead.
      maxOutputTokens: null,
    });
    return { plan: WorkerPlan.parse(raw), aiSessionId: null };
  }

  // Claude CLI: prompted JSON, retry ONCE on an unparseable frame (transient).
  const claudeSystem = `${opts.pack}

OUTPUT FORMAT (STRICT): respond with ONLY a single JSON object, no prose, no markdown fences, of the exact shape:
{"read":"...","items":[{"n":1,"axis":"conceptual|procedural|both","kind":"...","intent":"...","difficulty":"..."}],"questions":["..."]}
"questions" MUST be present — use [] when you have nothing to ask.`;
  let lastErr: unknown;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const ai = await complete({
        systemPrompt: claudeSystem,
        userMessage: opts.prompt,
        endpoint: PLAN_ENDPOINT,
        model: "", // vendor default (opus)
        timeoutSec: WORKER_TIMEOUT_SEC,
        vendorId: "claude_cli",
        slotId: PLAN_ENDPOINT,
      });
      const parsed = extractJsonObject<unknown>(ai.text);
      if (parsed === null) {
        throw new Error(
          `claude authoring-plan returned no parseable JSON: ${ai.text.slice(0, 200)}`,
        );
      }
      return { plan: WorkerPlan.parse(parsed), aiSessionId: ai.sessionId ?? null };
    } catch (err) {
      lastErr = err;
      console.error(
        `[authoring-plan] ${opts.label} claude attempt=${attempt} FAILED: ${(err as Error).message.slice(0, 200)}`,
      );
    }
  }
  throw lastErr;
}

/** Parse an episode's stored conversation. Tolerates a turn the current contract
 *  rejects by DROPPING it rather than throwing — a malformed history must not make
 *  an episode permanently unopenable (it would strand a tutor mid-gate). */
function parseTurns(raw: unknown): WorkerTurn[] {
  const arr = Array.isArray(raw) ? raw : [];
  const out: WorkerTurn[] = [];
  for (const t of arr) {
    const parsed = WorkerTurn.safeParse(t);
    if (parsed.success) out.push(parsed.data);
  }
  return out;
}

/** One episode's turns, by row id. Returns [] for a pre-slice row (messages '[]'). */
export async function episodeTurns(tx: Tx, workerRowId: string): Promise<WorkerTurn[]> {
  const [row] = await tx
    .select({ messages: authoringWorker.messages })
    .from(authoringWorker)
    .where(eq(authoringWorker.id, workerRowId));
  return parseTurns(row?.messages);
}

/** Create the episode row, or append to an existing one. The single write path for
 *  authoring_worker — every turn, every status change goes through here so a
 *  status can never drift from the conversation that justifies it. */
async function upsertEpisode(
  tx: Tx,
  a: {
    boardId: string;
    chatId: string;
    subTopicId: string;
    vendor: VendorChoice;
    workerRowId?: string;
    brief: string;
    aiSessionId: string | null;
    sessionFingerprint?: string | null;
    turns: WorkerTurn[];
    status: WorkerEpisodeStatus;
    output?: unknown;
  },
): Promise<string> {
  if (a.workerRowId) {
    await tx
      .update(authoringWorker)
      .set({
        messages: a.turns,
        status: a.status,
        brief: a.brief,
        ...(a.aiSessionId ? { aiSessionId: a.aiSessionId } : {}),
        ...(a.sessionFingerprint !== undefined
          ? { sessionFingerprint: a.sessionFingerprint }
          : {}),
        ...(a.output !== undefined ? { output: a.output } : {}),
      })
      .where(eq(authoringWorker.id, a.workerRowId));
    return a.workerRowId;
  }
  const [created] = await tx
    .insert(authoringWorker)
    .values({
      boardId: a.boardId,
      chatId: a.chatId,
      subTopicId: a.subTopicId,
      vendor: a.vendor,
      aiSessionId: a.aiSessionId,
      sessionFingerprint: a.sessionFingerprint ?? null,
      brief: a.brief,
      messages: a.turns,
      status: a.status,
      ...(a.output !== undefined ? { output: a.output } : {}),
    })
    .returning({ id: authoringWorker.id });
  return created!.id;
}

export type SpawnWorkerResult = {
  workerId: string;
  drafts: DraftItem[];
  aiSessionId: string | null;
  resumed: boolean;
};

/**
 * Spawn a fresh scoped worker to author `count` questions for ONE sub_topic.
 * Runs inside the caller's board-scoped tx (RLS applies). Returns the authored
 * DraftItem[] (NOT yet persisted as question rows — the caller persists via
 * persistDrafts) plus the worker row id + captured session id.
 *
 * Slice TWOWAY-1: when the episode was PLANNED and the tutor approved it, the
 * approved plan rides along (`workerRowId` + the episode's turns) and the draft
 * call is told to write EXACTLY that plan. Without a `workerRowId` this behaves
 * exactly as it did pre-slice — a one-shot spawn that inserts its own audit row —
 * which is what the plan-skip path and the interleaved fan-out still use.
 */
export async function spawnAuthoringWorker(
  tx: Tx,
  args: {
    boardId: string;
    chatId: string;
    subTopicId: string;
    vendor: VendorChoice;
    count: number;
    /** The tutor's authoring intent distilled from the master conversation. */
    brief: string;
    /** The episode this draft belongs to (Slice TWOWAY-1); absent = one-shot spawn. */
    workerRowId?: string;
  },
): Promise<SpawnWorkerResult> {
  const world = await buildScopedWorld(tx, {
    subTopicId: args.subTopicId,
    brief: args.brief,
  });
  const st = world.st;
  const pack = world.pack;

  // Slice TWOWAY-1: the episode's approved exchange, when there is one. The plan
  // is the LAST worker plan turn — an amendment cycle can leave several, and the
  // one the tutor approved is the newest.
  const priorTurns = args.workerRowId
    ? await episodeTurns(tx, args.workerRowId)
    : [];
  const approvedPlan =
    [...priorTurns].reverse().find((t) => t.kind === "plan")?.plan ?? null;
  const planBlock = approvedPlan
    ? `\n\n===== THE PLAN THE TUTOR APPROVED (write THIS — it is not a suggestion) =====
${renderPlanText(approvedPlan)}
===== END APPROVED PLAN =====`
    : "";

  const basePrompt = `${world.basePrompt}${workerConversationBlock(priorTurns)}${planBlock}`;

  // Claude's single-call batch prompt (the whole set in one call — Claude has no
  // JSON-truncation problem, so it keeps the coherent batch). Also the fingerprint
  // / worker-row `brief` of record for both vendors.
  const batchPrompt = `${basePrompt}

HOW MANY: write exactly ${args.count} question${args.count === 1 ? "" : "s"}, as an ordered scaffolded sequence, aimed at this student's weakness as established in the brief.

Author the set now. Apply the bar and the palette, and self-score each on the rubric (honest low on at least one axis). Return the structured JSON object with a "questions" array.`;

  // 6. Vendor-delivered author call (+ session capture + resume).
  const { drafts, aiSessionId, resumed } = await runWorkerCall(tx, {
    boardId: args.boardId,
    chatId: args.chatId,
    subTopicId: args.subTopicId,
    vendor: args.vendor,
    pack,
    basePrompt,
    batchPrompt,
    count: args.count,
    plan: approvedPlan,
  });

  // 7. Log the spawn (D-QA3-8): session id + fingerprint + brief + output.
  //    Slice TWOWAY-1: when this draft belongs to a planned EPISODE, close that
  //    episode ('drafted') and append a drafted turn — so the conversation records
  //    what the plan actually produced, and the episode can be addressed later.
  //    With no episode this is the pre-slice one-shot insert, unchanged.
  const fingerprint =
    args.vendor === "claude_cli"
      ? computeSessionFingerprint({
          systemPrompt: claudeSystemFor(pack),
          userMessage: batchPrompt,
          endpoint: WORKER_ENDPOINT,
          slotId: WORKER_ENDPOINT,
          model: "",
        })
      : null;
  const draftedTurn: WorkerTurn = {
    id: randomUUID(),
    role: "worker",
    kind: "drafted",
    text: `Drafted ${drafts.length} question${drafts.length === 1 ? "" : "s"}:\n${drafts
      .map((d, n) => `  ${n + 1}. [${d.axis}] ${d.stem}`)
      .join("\n")}`,
    createdAt: new Date().toISOString(),
    vendorId: args.vendor,
    ...(aiSessionId ? { aiSessionId } : {}),
  };
  const workerId = await upsertEpisode(tx, {
    boardId: args.boardId,
    chatId: args.chatId,
    subTopicId: args.subTopicId,
    vendor: args.vendor,
    ...(args.workerRowId ? { workerRowId: args.workerRowId } : {}),
    brief: batchPrompt,
    aiSessionId,
    sessionFingerprint: fingerprint,
    turns: [...priorTurns, draftedTurn],
    status: "drafted",
    output: { count: drafts.length },
  });

  return { workerId, drafts, aiSessionId, resumed };
}

// Carry-forward block (Gemini per-question drafting): the questions already
// drafted in THIS set, so the next single-question call is a coherent next step in
// the scaffold rather than a fresh isolated question. Kept SHORT (axis + stem) —
// enough for coherence, small enough to stay well clear of the truncation ceiling.
function draftedSoFarBlock(drafts: DraftItem[]): string {
  if (drafts.length === 0) {
    return "QUESTIONS ALREADY DRAFTED IN THIS SET: (none yet — this is the first)";
  }
  const lines = drafts.map((d, n) => `  ${n + 1}. [${d.axis}] ${d.stem}`).join("\n");
  return `QUESTIONS ALREADY DRAFTED IN THIS SET (build the next one to FOLLOW ON from these as a coherent scaffolded progression; do NOT repeat them):\n${lines}`;
}

/**
 * The vendor branch. Gemini = schema-constrained generation (stateless, no
 * session), drafted PER-QUESTION (Slice AUTHOR-ASYNC truncation fix): asking for
 * the whole batch in one call returned TRUNCATED JSON on heavy content (stems cut
 * mid-word at ~265s) → an unparseable-JSON failure. Each single-question call has a
 * tiny output that can't truncate, and the already-drafted questions are fed back
 * as carry-forward so the set stays a coherent scaffold. N× calls is fine now that
 * authoring runs OFF the request path (no nginx wall). Claude CLI = prompted JSON +
 * extractJsonObject with worker-session RESUME (no truncation problem → one batch
 * call, unchanged).
 */
async function runWorkerCall(
  tx: Tx,
  opts: {
    boardId: string;
    chatId: string;
    subTopicId: string;
    vendor: VendorChoice;
    pack: string;
    basePrompt: string;
    batchPrompt: string;
    count: number;
    /** Slice TWOWAY-1: the approved plan, when this draft came through the gate. */
    plan?: WorkerPlan | null;
  },
): Promise<{ drafts: DraftItem[]; aiSessionId: string | null; resumed: boolean }> {
  if (opts.vendor === "gemini_api") {
    const drafts: DraftItem[] = [];
    for (let i = 0; i < opts.count; i++) {
      // Slice TWOWAY-1: pin THIS call to the plan item the tutor approved for this
      // position. Without it the per-question loop would re-decide each question's
      // kind/intent from the whole plan and could quietly drift off what was
      // approved — the plan gate would then be theatre. Matched by `n` first (the
      // model numbers its own items) and by position as a fallback.
      const item =
        opts.plan?.items.find((x) => x.n === i + 1) ?? opts.plan?.items[i] ?? null;
      const itemBlock = item
        ? `\n\nTHE APPROVED ITEM FOR THIS QUESTION (write exactly this one):
  axis: ${item.axis}
  kind: ${item.kind}
  intent: ${item.intent}
  difficulty: ${item.difficulty}`
        : "";
      const perQuestionPrompt = `${opts.basePrompt}

${draftedSoFarBlock(drafts)}${itemBlock}

HOW MANY: write EXACTLY ONE question — number ${i + 1} of ${opts.count} in an ordered, scaffolded sequence aimed at this student's weakness (per the brief). ${
        i === 0
          ? "This is the FIRST question in the set."
          : "It must FOLLOW ON from the questions already drafted above — the natural next step, not a repeat."
      }

Apply the bar and the palette, and self-score on the rubric (honest low on at least one axis). Return the structured JSON object with a "questions" array containing EXACTLY ONE question.`;
      const raw = await geminiJson<unknown>({
        label: `authoring-worker:${opts.subTopicId}:${i + 1}/${opts.count}`,
        systemInstruction: opts.pack,
        prompt: perQuestionPrompt,
        responseSchema: geminiQuestionSchema as never,
        // Bounds + rationale at AUTHORING_TIMEOUT_MS above. A single question is a
        // small output; this timeout is a backstop, not the working bound. Runs on
        // the global GEMINI_MODEL (= gemini-3.5-flash). geminiJson retries once on a
        // blip; a genuine double-failure fails the job (surfaced to the FE).
        timeoutMs: AUTHORING_TIMEOUT_MS,
        thinkingBudget: AUTHORING_THINKING_BUDGET,
        // Stays null on purpose (M28): thinking is capped above instead. Capping
        // maxOutputTokens on a thinking model truncates the JSON mid-answer.
        maxOutputTokens: null,
      });
      const q = draftBatchSchema.parse(raw).questions[0];
      if (!q) {
        throw new Error(
          `authoring-worker gemini returned no question for ${opts.subTopicId} (${i + 1}/${opts.count})`,
        );
      }
      drafts.push(q);
    }
    return { drafts, aiSessionId: null, resumed: false };
  }

  // Claude CLI.
  const claudeSystem = claudeSystemFor(opts.pack);
  const fingerprint = computeSessionFingerprint({
    systemPrompt: claudeSystem,
    userMessage: opts.batchPrompt,
    endpoint: WORKER_ENDPOINT,
    slotId: WORKER_ENDPOINT,
    model: "",
  });
  const resumeSessionId = await resumableWorkerSession(
    tx,
    opts.chatId,
    opts.subTopicId,
    fingerprint,
  );

  // Try resume first (when eligible); on ANY failure fall back to a fresh spawn.
  // Then, independently, retry a parse miss once (transient — clean on a fresh frame).
  let lastErr: unknown;
  const attempts: Array<string | undefined> = resumeSessionId
    ? [resumeSessionId, undefined, undefined]
    : [undefined, undefined];
  for (let i = 0; i < attempts.length; i++) {
    const resume = attempts[i];
    try {
      const ai = await complete({
        systemPrompt: claudeSystem,
        userMessage: opts.batchPrompt,
        endpoint: WORKER_ENDPOINT,
        model: "", // vendor default (opus)
        timeoutSec: WORKER_TIMEOUT_SEC,
        vendorId: "claude_cli",
        slotId: WORKER_ENDPOINT,
        sessionFingerprint: fingerprint,
        ...(resume ? { resumeSessionId: resume } : {}),
      });
      const parsed = extractJsonObject<unknown>(ai.text);
      if (parsed === null) {
        throw new Error(
          `claude authoring-worker returned no parseable JSON: ${ai.text.slice(0, 200)}`,
        );
      }
      return {
        drafts: draftBatchSchema.parse(parsed).questions,
        aiSessionId: ai.sessionId ?? null,
        resumed: !!resume,
      };
    } catch (err) {
      lastErr = err;
      console.error(
        `[authoring-worker] ${opts.subTopicId} attempt=${i + 1}` +
          `${resume ? " (resume)" : ""} FAILED: ${(err as Error).message.slice(0, 200)}`,
      );
    }
  }
  throw lastErr;
}

// A prior Claude worker session for this (chat, sub_topic) is resumable only when
// the pack (→ fingerprint) is unchanged AND the CLI JSONL is still on disk.
async function resumableWorkerSession(
  tx: Tx,
  chatId: string,
  subTopicId: string,
  fingerprint: string,
): Promise<string | undefined> {
  // The most recent worker spawn for THIS (chat, sub_topic) — a different
  // sub_topic is a different job, not a resume target.
  const [prior] = await tx
    .select({
      aiSessionId: authoringWorker.aiSessionId,
      sessionFingerprint: authoringWorker.sessionFingerprint,
      vendor: authoringWorker.vendor,
    })
    .from(authoringWorker)
    .where(
      and(
        eq(authoringWorker.chatId, chatId),
        eq(authoringWorker.subTopicId, subTopicId),
      ),
    )
    .orderBy(desc(authoringWorker.createdAt))
    .limit(1);
  if (
    !prior ||
    prior.vendor !== "claude_cli" ||
    !prior.aiSessionId ||
    prior.sessionFingerprint !== fingerprint
  ) {
    return undefined;
  }
  const { jsonlExists } = await import("./cli_session");
  return (await jsonlExists(prior.aiSessionId)) ? prior.aiSessionId : undefined;
}
