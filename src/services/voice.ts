/**
 * Voice tutoring (Slice VOICE-1) — the backend spine. NO audio transport yet
 * (that's VOICE-2, Gemini Live server-relay); everything here is exercisable by
 * feeding a canned transcript, exactly like Stage-1 shipped the scorer before
 * any FE.
 *
 * A student on a revision slide starts a spoken session grounded in that slide's
 * manifest `voice_context` (revision.getVoiceGrounding). VOICE-1:
 *   - startSession → resolve grounding (reject if the slide has none), create a
 *     `voice_session` row (status=active), return the session id + the system
 *     prompt the VOICE-2 relay will hand Gemini Live.
 *   - endSession → persist the transcript (shared `transcript` table,
 *     kind='voice_tutoring'), run a mode-specific post-call analysis via Gemini
 *     (fault-isolated + kill-switch), stamp voice_session.analysis + an
 *     event_log 'voice_session' row, mark completed.
 *
 * Load-bearing boundaries:
 *   - NO mastery move. The analysis is EVIDENCE (like a Stage-1 observation),
 *     never a certified read — only tutor Stage-2 moves mastery.
 *   - Ownership (D-L-5): RLS scopes the board, not the user, so every read of a
 *     session asserts `student_id == caller` → a foreign session is NOT_FOUND
 *     (no existence leak), the practice.ts pattern.
 *   - Kill-switch: if GEMINI_API_KEY is unset (or the call fails), the session
 *     still persists with analysis=null — the durable record never depends on AI.
 */
import { eq } from "drizzle-orm";
import type { PgTransaction } from "drizzle-orm/pg-core";
import { z } from "zod";
import { Type } from "@google/genai";
import { eventLog, transcript, voiceSession } from "@b2c/kernel/schema";
import { geminiJson } from "./ai/gemini";
import { getVoiceGrounding } from "./revision";

type Tx = PgTransaction<any, any, any>;

const VOICE_EVENT = "voice_session";
const TRANSCRIPT_KIND = "voice_tutoring";

// v0: only 'overview' (explain/discuss the slide). 'test'/'doubt' follow (each
// carries its own analysis schema); kept as text in the DB so adding one is a
// prompt + schema change, no migration.
export const voiceModeSchema = z.enum(["overview"]);
export type VoiceMode = z.infer<typeof voiceModeSchema>;

// One conversational turn as the FE/relay will hand it to endSession.
export const voiceTurnSchema = z.object({
  role: z.enum(["student", "tutor"]),
  text: z.string(),
});
export type VoiceTurn = z.infer<typeof voiceTurnSchema>;

export class VoiceSessionNotFoundError extends Error {
  readonly code = "VOICE_SESSION_NOT_FOUND";
  constructor(sessionId: string) {
    super(`no voice session ${sessionId} for this user`);
    this.name = "VoiceSessionNotFoundError";
  }
}

export class VoiceContextMissingError extends Error {
  readonly code = "NO_VOICE_CONTEXT";
  constructor(subTopicId: string) {
    super(`sub_topic ${subTopicId} has no voice_context — cannot tutor by voice`);
    this.name = "VoiceContextMissingError";
  }
}

export type VoiceSessionStart = {
  sessionId: string;
  subTopicId: string;
  mode: VoiceMode;
  status: "active";
  /** The system prompt the VOICE-2 Gemini Live relay opens the session with. */
  systemPrompt: string;
};

export type VoiceSessionEnd = {
  sessionId: string;
  status: "completed";
  analysis: unknown | null;
};

/** Build the live-tutor system prompt for a mode, grounded in the slide.
 *  This IS the v0 agent prompt (Polaris frame 3) — a distillation of prod's
 *  `voice/overview.txt`, adapted to be self-contained. */
function buildSystemPrompt(
  mode: VoiceMode,
  grounding: { title: string; voiceContext: { context: string; keywords: string[] } },
): string {
  const kw = grounding.voiceContext.keywords.length
    ? `\n\nKey terms to use precisely: ${grounding.voiceContext.keywords.join(", ")}.`
    : "";
  // overview (v0): explain the slide conversationally, check for understanding
  // as you go, keep it short and spoken (no markdown — this is read aloud).
  return `You are a warm, encouraging voice tutor helping a student understand a single revision slide out loud. Speak in short, natural spoken sentences — this is a live conversation, not an essay, and there is no screen to read from.

The slide is: "${grounding.title}".

What this slide is about (your grounding — stay within it, don't wander to other topics):
${grounding.voiceContext.context}${kw}

Your job for this session: explain this slide clearly, one idea at a time, pausing to check the student is following ("does that make sense?", "want me to go over that again?"). Invite their questions and answer them simply. If they go off-topic, gently bring them back to this slide. Never lecture for long — keep turns brief and let the student talk.`;
}

/** Start (create) a voice session on a sub_topic. Rejects a slide with no
 *  voice_context (VoiceContextMissingError → BAD_REQUEST). SlideNotFoundError
 *  (from grounding resolution) propagates → NOT_FOUND at the router. */
export async function startVoiceSession(
  tx: Tx,
  args: {
    boardId: string;
    appUserId: string;
    subTopicId: string;
    mode?: VoiceMode;
  },
): Promise<VoiceSessionStart> {
  const mode = args.mode ?? "overview";
  const grounding = await getVoiceGrounding(tx, args.subTopicId);
  if (!grounding.voiceContext) {
    throw new VoiceContextMissingError(args.subTopicId);
  }
  const systemPrompt = buildSystemPrompt(mode, {
    title: grounding.title,
    voiceContext: grounding.voiceContext,
  });

  const [created] = await tx
    .insert(voiceSession)
    .values({
      boardId: args.boardId,
      studentId: args.appUserId,
      subTopicId: args.subTopicId,
      mode,
      status: "active",
    })
    .returning();

  return {
    sessionId: created!.id,
    subTopicId: args.subTopicId,
    mode,
    status: "active",
    systemPrompt,
  };
}

/** Fetch a session owned by the caller, or throw NOT_FOUND (no existence leak).
 *  RLS scopes the board; this stops cross-student access. */
async function ownedSession(tx: Tx, sessionId: string, appUserId: string) {
  const [s] = await tx
    .select()
    .from(voiceSession)
    .where(eq(voiceSession.id, sessionId))
    .limit(1);
  if (!s || s.studentId !== appUserId) {
    throw new VoiceSessionNotFoundError(sessionId);
  }
  return s;
}

/** What the VOICE-2 relay needs to open a Gemini Live session for an existing
 *  session: the owned row's identity + the re-derived system prompt. The prompt
 *  isn't persisted (startSession only returns it), so the relay rebuilds it from
 *  the row's sub_topic + mode — same buildSystemPrompt as startSession. */
export type RelaySessionInfo = {
  subTopicId: string;
  mode: VoiceMode;
  status: string;
  systemPrompt: string;
};

/** Resolve a live session for the relay. Ownership-guarded (foreign session →
 *  VOICE_SESSION_NOT_FOUND, no existence leak). Rejects a slide that lost its
 *  voice_context (NO_VOICE_CONTEXT) — the same gate startSession applies, in
 *  case grounding changed since the session was created. */
export async function resolveRelaySession(
  tx: Tx,
  sessionId: string,
  appUserId: string,
): Promise<RelaySessionInfo> {
  const s = await ownedSession(tx, sessionId, appUserId);
  const grounding = await getVoiceGrounding(tx, s.subTopicId);
  if (!grounding.voiceContext) {
    throw new VoiceContextMissingError(s.subTopicId);
  }
  const systemPrompt = buildSystemPrompt(s.mode as VoiceMode, {
    title: grounding.title,
    voiceContext: grounding.voiceContext,
  });
  return {
    subTopicId: s.subTopicId,
    mode: s.mode as VoiceMode,
    status: s.status,
    systemPrompt,
  };
}

// ── Post-call analysis (overview mode) ─────────────────────────────────────
//
// Mirrors prod `voice/post_call_overview.txt`: summarise what the tutor
// covered + list the student's questions. Structured JSON, uncapped (M28 — a
// thinking model bounds thinking+answer together; a small answer here but the
// discipline is uniform). Third-person, tutor-facing (this is evidence, not a
// student-facing blurb).
const OVERVIEW_ANALYSIS_SYSTEM = `You are analysing the transcript of a completed voice tutoring session in which an AI tutor explained ONE revision slide to a student. Produce a concise, factual, third-person summary for the student's human tutor to skim. Report: a one-paragraph summary of what happened; the specific points/sub-topics the tutor covered; and any questions the student asked (empty if none). Do not invent content that isn't in the transcript. Do not grade the student.`;

const overviewAnalysisResponseSchema = {
  type: Type.OBJECT,
  properties: {
    summary: {
      type: Type.STRING,
      description: "one-paragraph, third-person summary of the session",
    },
    topicsCovered: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "the specific points/sub-topics the tutor explained",
    },
    studentQuestions: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "questions the student asked (empty array if none)",
    },
  },
  required: ["summary", "topicsCovered", "studentQuestions"],
} as const;

const overviewAnalysisSchema = z.object({
  summary: z.string(),
  topicsCovered: z.array(z.string()),
  studentQuestions: z.array(z.string()),
});
export type OverviewAnalysis = z.infer<typeof overviewAnalysisSchema>;

function renderTranscript(turns: VoiceTurn[]): string {
  return turns
    .map((t) => `${t.role === "student" ? "STUDENT" : "TUTOR"}: ${t.text}`)
    .join("\n");
}

/** Run the mode-specific post-call analysis. Fault-isolated: any failure
 *  (no key / bad JSON / vendor error) returns null so the session still
 *  finalizes with a durable transcript. */
async function runAnalysis(
  mode: VoiceMode,
  sessionId: string,
  turns: VoiceTurn[],
): Promise<unknown | null> {
  if (turns.length === 0) return null;
  try {
    if (mode === "overview") {
      const raw = await geminiJson<unknown>({
        label: `voice:overview:${sessionId}`,
        systemInstruction: OVERVIEW_ANALYSIS_SYSTEM,
        prompt: `TRANSCRIPT:\n${renderTranscript(turns)}`,
        responseSchema: overviewAnalysisResponseSchema as any,
        maxOutputTokens: null, // uncapped (M28)
      });
      return overviewAnalysisSchema.parse(raw);
    }
    return null;
  } catch (err) {
    // Kill-switch + fault isolation: the analysis is best-effort. A missing key
    // or a vendor hiccup must never lose the session.
    console.error(
      `[voice] analysis skipped for ${sessionId}: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
    return null;
  }
}

/** End a session: persist the transcript, analyse it, stamp the row + an
 *  event_log entry, mark completed. Idempotent-ish: ending an already-completed
 *  session returns its stored state without re-persisting. NO mastery move. */
export async function endVoiceSession(
  tx: Tx,
  args: {
    boardId: string;
    appUserId: string;
    sessionId: string;
    transcript: VoiceTurn[];
  },
): Promise<VoiceSessionEnd> {
  const s = await ownedSession(tx, args.sessionId, args.appUserId);
  if (s.status === "completed") {
    return { sessionId: s.id, status: "completed", analysis: s.analysis ?? null };
  }

  // 1. Persist the transcript (shared audit store, kind='voice_tutoring').
  const [tr] = await tx
    .insert(transcript)
    .values({
      boardId: args.boardId,
      studentId: args.appUserId,
      subTopicId: s.subTopicId,
      kind: TRANSCRIPT_KIND,
      body: { turns: args.transcript },
      meta: { mode: s.mode, voiceSessionId: s.id },
    })
    .returning({ id: transcript.id });

  // 2. Mode-specific post-call analysis (fault-isolated + kill-switch).
  const analysis = await runAnalysis(s.mode as VoiceMode, s.id, args.transcript);

  // 3. Stamp the session: completed + transcript link + analysis.
  await tx
    .update(voiceSession)
    .set({
      status: "completed",
      endedAt: new Date(),
      transcriptId: tr?.id ?? null,
      analysis,
    })
    .where(eq(voiceSession.id, s.id));

  // 4. Evidence event (G1). Record-only — NOT a mastery move.
  await tx.insert(eventLog).values({
    boardId: args.boardId,
    eventType: VOICE_EVENT,
    studentId: args.appUserId,
    subTopicId: s.subTopicId,
    payload: {
      voiceSessionId: s.id,
      mode: s.mode,
      turnCount: args.transcript.length,
      transcriptId: tr?.id ?? null,
      analysisPresent: analysis != null,
    },
  });

  return { sessionId: s.id, status: "completed", analysis };
}
