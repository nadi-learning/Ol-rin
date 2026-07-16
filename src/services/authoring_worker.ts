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
import { join } from "node:path";
import { and, desc, eq } from "drizzle-orm";
import type { PgTransaction } from "drizzle-orm/pg-core";
import {
  authoringWorker,
  chapter,
  learningObjective,
  question,
  subTopic,
  topic,
} from "@b2c/kernel/schema";
import type { VendorChoice } from "@b2c/kernel/contracts";
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
const METHOD_PACK_PATH = join(
  process.cwd(),
  ".claude",
  "skills",
  "question-authoring-worker",
  "SKILL.md",
);

// Strip a leading YAML frontmatter block (--- … ---) so the model sees only the
// method body, not the skill's metadata. Keeps the file a valid loadable skill.
function stripFrontmatter(md: string): string {
  const m = md.match(/^---\n[\s\S]*?\n---\n?/);
  return m ? md.slice(m[0].length).trimStart() : md;
}

// Read fresh each call (fire-time read — pack edits apply without a redeploy).
// Small file, low-frequency call; no memoization needed. Exported so the sibling
// refinement path (reviseDraft) authors to the SAME pack/bar.
export async function loadMethodPack(): Promise<string> {
  const raw = await readFile(METHOD_PACK_PATH, "utf8");
  return stripFrontmatter(raw);
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
  },
): Promise<SpawnWorkerResult> {
  // 1. Resolve the sub_topic + its chapter (for identity + the raw topics.md blob).
  const [st] = await tx
    .select({
      id: subTopic.id,
      name: subTopic.name,
      topicName: topic.name,
      chapterId: chapter.id,
      chapterName: chapter.name,
      chapterMetadata: chapter.metadata,
    })
    .from(subTopic)
    .innerJoin(topic, eq(topic.id, subTopic.topicId))
    .innerJoin(chapter, eq(chapter.id, topic.chapterId))
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

  // 4. The method pack (fire-time read).
  const pack = await loadMethodPack();

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

  const prompt = `===== SOURCE MATERIAL (the chapter's topics.md — human-authored prose; read this) =====
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
===== END BRIEF =====

HOW MANY: write exactly ${args.count} question${args.count === 1 ? "" : "s"}, as an ordered scaffolded sequence, aimed at this student's weakness as established in the brief.

Author the set now. Apply the bar and the palette, and self-score each on the rubric (honest low on at least one axis). Return the structured JSON object with a "questions" array.`;

  // 6. Vendor-delivered author call (+ session capture + resume).
  const { drafts, aiSessionId, resumed } = await runWorkerCall(tx, {
    boardId: args.boardId,
    chatId: args.chatId,
    subTopicId: args.subTopicId,
    vendor: args.vendor,
    pack,
    prompt,
  });

  // 7. Log the spawn (D-QA3-8): session id + fingerprint + brief + output.
  const fingerprint =
    args.vendor === "claude_cli"
      ? computeSessionFingerprint({
          systemPrompt: claudeSystemFor(pack),
          userMessage: prompt,
          endpoint: WORKER_ENDPOINT,
          slotId: WORKER_ENDPOINT,
          model: "",
        })
      : null;
  const [workerRow] = await tx
    .insert(authoringWorker)
    .values({
      boardId: args.boardId,
      chatId: args.chatId,
      subTopicId: args.subTopicId,
      vendor: args.vendor,
      aiSessionId,
      sessionFingerprint: fingerprint,
      brief: prompt,
      output: { count: drafts.length },
    })
    .returning({ id: authoringWorker.id });

  return { workerId: workerRow!.id, drafts, aiSessionId, resumed };
}

/**
 * The vendor branch. Gemini = schema-constrained generation (stateless, no
 * session). Claude CLI = prompted JSON + extractJsonObject, with worker-session
 * RESUME when a valid prior session exists for this (chat, sub_topic).
 */
async function runWorkerCall(
  tx: Tx,
  opts: {
    boardId: string;
    chatId: string;
    subTopicId: string;
    vendor: VendorChoice;
    pack: string;
    prompt: string;
  },
): Promise<{ drafts: DraftItem[]; aiSessionId: string | null; resumed: boolean }> {
  if (opts.vendor === "gemini_api") {
    const raw = await geminiJson<unknown>({
      label: `authoring-worker:${opts.subTopicId}`,
      systemInstruction: opts.pack,
      prompt: opts.prompt,
      responseSchema: geminiQuestionSchema as never,
      // Bounds + rationale at AUTHORING_TIMEOUT_MS above (incl. the nginx
      // dependency). Runs on the global GEMINI_MODEL (= gemini-3.5-flash).
      timeoutMs: AUTHORING_TIMEOUT_MS,
      thinkingBudget: AUTHORING_THINKING_BUDGET,
      // Stays null on purpose (M28): thinking is capped above instead. Capping
      // maxOutputTokens on a thinking model truncates the JSON mid-answer.
      maxOutputTokens: null,
    });
    return { drafts: draftBatchSchema.parse(raw).questions, aiSessionId: null, resumed: false };
  }

  // Claude CLI.
  const claudeSystem = claudeSystemFor(opts.pack);
  const fingerprint = computeSessionFingerprint({
    systemPrompt: claudeSystem,
    userMessage: opts.prompt,
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
        userMessage: opts.prompt,
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
