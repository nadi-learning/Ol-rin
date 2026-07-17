/**
 * Slice S2R-4 — the Stage-2b CHAT: the tutor talking to an advisory model about
 * an OPEN sitting, before finalize.
 *
 * ADVISORY ONLY (D-S2R-10). The chat can discuss the drafts, the evidence, and
 * what it all means — it can never touch the certification. Any change to a
 * level or description happens in the review form, by the tutor's hand, and
 * lands through finalize's `items` like every other edit. That keeps the trust
 * surface exactly where S2R-2 put it: a client (and now a conversation) can
 * choose levels only through the tutor, never write reasoning attributed to
 * the model.
 *
 * THE TRANSCRIPT IS NOT DISCARDED. It persists on the sitting row (`messages`)
 * and rides into the synthesis call at finalize (D-S2R-11) — a tutor turn can
 * carry context nothing stored has ("he was ill that week"), and it would be
 * absurd to collect that in a chat and then ignore it at the one moment the
 * system reasons across the sitting.
 *
 * MECHANICS mirror authoring_chat.ts's history-in-a-row pattern: load history
 * from the row → stitch it into the prompt → ONE complete() call → append the
 * user+assistant pair → persist. Deliberately simpler than authoring_chat:
 * Gemini-only (D-S2R-6 — the model is the global default), no session resume
 * (sittings are short; stitching is deterministic and has no stale-interaction
 * failure mode), no tools (advisory only — there is nothing to fire).
 */
import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import type { PgTransaction } from "drizzle-orm/pg-core";
import { ChatMessage } from "@b2c/kernel/contracts";
import { assessmentSession, observation, subTopic } from "@b2c/kernel/schema";
import { complete } from "./ai_client";
import {
  type AssessmentSessionView,
  type SessionDrafts,
  SessionAlreadyFinalizedError,
  getAssessmentSession,
} from "./assessment_session";
import { gatherSynthesisInput } from "./synthesis";

type Tx = PgTransaction<any, any, any>;

const ASSESSMENT_CHAT_ENDPOINT = "assessment.chat";
// A single flash turn settles in seconds; this is headroom, not an expectation.
const CHAT_TIMEOUT_SEC = 120;

export const ASSESSMENT_CHAT_SYSTEM = `You are the Stage-2b ASSESSMENT ADVISOR in a two-axis mastery engine. A tutor has opened an assessment sitting: Stage 2a has proposed a certification (two levels + a description) for each sub-topic, and the tutor is reviewing them before committing. You are the conversation they have while deciding.

YOU ARE ADVISORY. You cannot change a level, a description, or anything else — only the tutor can, in their review form. Never claim to have applied a change, never say "done" to an edit request; instead say what you would change and why, and remind them the edit is theirs to make in the form. If the tutor asks you to change something directly, that is the one request you must deflect.

WHAT YOU ARE FOR:
- explaining WHY a draft proposes what it proposes, from the evidence shown;
- weighing a tutor's doubt against the observations ("is level 3 harsh here?");
- reading across the sitting — patterns the per-sub-topic drafts cannot see;
- being honest about thin evidence: one observation is an anecdote, not a trend.

GROUND RULES:
- The drafts are PROPOSALS, not finals. The tutor outranks them and outranks you.
- Only the evidence shown to you exists. Never invent an observation, a score, or a history you were not given. If the evidence cannot answer the tutor's question, say so plainly.
- The student's levels use null/"not yet observed" as a first-class value — it means the axis was never exposed, NOT that the student is weak.
- Be concrete and quote the evidence ("in the conduction answer they wrote…"), not vague ("some issues with clarity").
- Keep answers short. The tutor is mid-review; three tight paragraphs beat ten.`;

/** What sendAssessmentChatTurn returns — enough for the FE to re-render the
 *  thread without re-fetching the whole sitting. */
export type AssessmentChatView = {
  sessionId: string;
  messages: ChatMessage[];
};

function draftsBlock(drafts: SessionDrafts, subTopicIds: string[]): string {
  const lvl = (n: number | null) => (n == null ? "not yet observed" : String(n));
  return subTopicIds
    .map((id) => {
      const d = drafts[id];
      if (!d) return `  - (no draft for ${id})`;
      const cur = d.current
        ? `current mastery: conceptual=${lvl(d.current.conceptualLevel)}, procedural=${lvl(d.current.proceduralLevel)} — ${d.current.description}`
        : "current mastery: cold start (never certified)";
      return [
        `  - ${d.subTopicName} (${d.observationCount} observation${d.observationCount === 1 ? "" : "s"})`,
        `      ${cur}`,
        `      PROPOSED: conceptual=${lvl(d.draft.conceptualLevel)}, procedural=${lvl(d.draft.proceduralLevel)}`,
        `      description: ${d.draft.description}`,
        `      log: ${d.draft.log}`,
        `      the model's reasoning: ${d.draft.reasoning}`,
        d.draft.flags.length ? `      flags: ${d.draft.flags.join(" | ")}` : null,
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n");
}

/**
 * One chat turn on an OPEN sitting. Appends the user+assistant pair to the
 * row's `messages` and returns the full thread.
 *
 * Every turn re-stitches grounding + history rather than resuming a vendor
 * session: the sitting's evidence is finite and the thread is short, so the
 * deterministic path wins over resume plumbing (authoring_chat needed resume
 * for Claude CLI; this chat is Gemini-only by D-S2R-6).
 */
export async function sendAssessmentChatTurn(
  tx: Tx,
  args: { tutorUserId: string; sessionId: string; text: string },
): Promise<AssessmentChatView> {
  // Ownership + existence ride on the same read the FE uses.
  const session: AssessmentSessionView = await getAssessmentSession(tx, {
    tutorUserId: args.tutorUserId,
    sessionId: args.sessionId,
  });
  // The chat exists to settle an open sitting. After finalize the transcript
  // stays readable (spec §6), but the conversation is over — a finalized
  // certification is not something to keep litigating in a side channel.
  if (session.status === "finalized") {
    throw new SessionAlreadyFinalizedError(args.sessionId);
  }

  const history = session.messages;

  // Grounding: the same scope/insights/notes synthesis reads (minus the chat —
  // the thread is stitched below as conversation, not evidence), plus the drafts
  // and the raw Stage-1 observations (spec §2's input list for 2b).
  const synthInput = await gatherSynthesisInput(tx, {
    studentId: session.studentId,
    subTopicIds: session.subTopicIds,
    certified: session.subTopicIds.map((id) => {
      const d = session.drafts[id]?.draft;
      return {
        subTopicId: id,
        conceptualLevel: d?.conceptualLevel ?? null,
        proceduralLevel: d?.proceduralLevel ?? null,
        description: d?.description ?? "(no draft)",
      };
    }),
  });

  const obs = await tx
    .select({
      subTopicId: observation.subTopicId,
      subTopicName: subTopic.name,
      axis: observation.axis,
      observationLevel: observation.observationLevel,
      tutorLevel: observation.tutorLevel,
      reasoning: observation.reasoning,
      nonSubtopicNote: observation.nonSubtopicNote,
      createdAt: observation.createdAt,
    })
    .from(observation)
    .innerJoin(subTopic, eq(subTopic.id, observation.subTopicId))
    .where(
      and(
        eq(observation.studentId, session.studentId),
        inArray(observation.subTopicId, session.subTopicIds),
      ),
    )
    .orderBy(observation.createdAt);

  const lvl = (n: number | null) => (n == null ? "not yet observed" : String(n));
  const obsBlock = obs.length
    ? obs
        .map(
          (o) =>
            `  - [${o.subTopicName} · ${o.axis} · scored ${o.tutorLevel ?? o.observationLevel}${o.tutorLevel != null ? " (tutor-corrected)" : ""} · ${o.createdAt.toISOString().slice(0, 10)}]\n      ${o.reasoning}` +
            (o.nonSubtopicNote ? `\n      outside this sub-topic: ${o.nonSubtopicNote}` : ""),
        )
        .join("\n")
    : "  (none)";

  const subjectBlock = [...synthInput.scope.subjects.values()]
    .map(
      (s) =>
        `  - ${s.name} (${s.grade}) — current subject insight: ${s.currentInsight ?? "(none yet)"}`,
    )
    .join("\n");
  const chapterBlock = [...synthInput.scope.chapters.values()]
    .map((c) => `  - ${c.name} — current chapter insight: ${c.currentInsight ?? "(none yet)"}`)
    .join("\n");
  const horizontalBlock = synthInput.scope.currentHorizontals.length
    ? synthInput.scope.currentHorizontals
        .map((h) => `  - ${h.slug}: level=${lvl(h.level)} — ${h.prose}`)
        .join("\n")
    : "  (none levelled yet)";

  const grounding = `THE SITTING (${session.kind === "catch_all" ? "catch-all — practice outside any assignment" : "one assignment"}), with Stage-2a's PROPOSALS:
${draftsBlock(session.drafts, session.subTopicIds)}

RAW STAGE-1 OBSERVATIONS (oldest first — the evidence behind the proposals):
${obsBlock}

SUBJECT CONTEXT:
${subjectBlock}

CHAPTER CONTEXT:
${chapterBlock}

THE STUDENT'S HORIZONTAL-SKILL STANDING:
${horizontalBlock}`;

  const convo = history
    .map((m) => `${m.role === "user" ? "TUTOR" : "YOU"}: ${m.text}`)
    .join("\n\n");
  const userMessage = [
    grounding,
    "",
    convo ? `===== CONVERSATION SO FAR =====\n${convo}\n===== END CONVERSATION =====\n` : "",
    `TUTOR: ${args.text}`,
    "",
    "Reply as the assessment advisor.",
  ].join("\n");

  const ai = await complete({
    systemPrompt: ASSESSMENT_CHAT_SYSTEM,
    userMessage,
    endpoint: ASSESSMENT_CHAT_ENDPOINT,
    userId: args.tutorUserId,
    model: "", // vendor default — gemini-3.5-flash (D-S2R-6)
    timeoutSec: CHAT_TIMEOUT_SEC,
    vendorId: "gemini_api",
    slotId: ASSESSMENT_CHAT_ENDPOINT,
  });

  // complete() throws on empty/error finishes, so a blank here is a contract
  // break, not a normal outcome — fail loudly rather than persist an empty
  // bubble the tutor stares at.
  if (!ai.text || !ai.text.trim()) {
    throw new Error("assessment chat: vendor returned no text");
  }

  const userMsg: ChatMessage = {
    id: randomUUID(),
    role: "user",
    text: args.text,
    createdAt: new Date().toISOString(),
  };
  const assistantMsg: ChatMessage = {
    id: randomUUID(),
    role: "assistant",
    text: ai.text,
    createdAt: new Date().toISOString(),
    vendorId: "gemini_api",
  };

  const messages = [...history, userMsg, assistantMsg];
  await tx
    .update(assessmentSession)
    .set({ messages })
    .where(eq(assessmentSession.id, args.sessionId));

  return { sessionId: args.sessionId, messages };
}
