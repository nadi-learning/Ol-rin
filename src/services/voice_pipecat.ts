/**
 * Voice — Pipecat orchestrator (Slice VOICE-A0, D2 → Option A).
 *
 * The D2 pivot: the rewrite stops trying to run a native Gemini-Live speech-to-
 * speech model and instead becomes the ORCHESTRATOR for the proven `nadi-tutor`
 * bot on Pipecat Cloud (the same bot b2c prod uses). The bot runs the discrete
 * STT→LLM→TTS pipeline (Deepgram + Gemini-in-text + ElevenLabs, LaTeX whiteboard,
 * guardrails) — that is why prod is more accurate. We just assemble a per-session
 * config, POST it to Pipecat Cloud → get back a Daily room + owner token → the FE
 * joins the room (transport swap is A2).
 *
 * Ported verbatim in shape from prod `b2c/backend/services/voice_service.py`
 * (`start_session` + `_create_pipecat_session`), including its ABSENCES — we add
 * defenses only when a live smoke surfaces a real need (ai-integration-gotchas:
 * "port the reference impl's shape first, including what it doesn't defend").
 *
 * Fault-isolation (memory: additive-features-fault-isolated): this path is
 * SELF-CONTAINED and never touches the working VOICE-2 Gemini-Live service
 * (`voice.ts`). The `VOICE_BACKEND` flag (default `gemini_live`) decides which
 * one the FE drives, so shipping A0 cannot regress the current voice path.
 *
 * Boundaries:
 *   - Kill switch: Pipecat/Daily creds are OPTIONAL env — a missing key throws
 *     VoicePipecatNotConfiguredError at START, never at boot.
 *   - NO migration: the session's correlation id is a pre-generated uuid we hand
 *     the bot as `config.session_id`; the bot echoes it in A1's webhook. It is
 *     also the `voice_session.id` we persist, so A1 correlates with no new column.
 *   - NO mastery move (unchanged G3 stance) — a voice session is evidence only.
 *   - Ownership/RLS: the voice_session row is board-scoped (RLS via the board tx).
 */
import { eq } from "drizzle-orm";
import type { PgTransaction } from "drizzle-orm/pg-core";
import { z } from "zod";
import { appUser, voiceSession } from "@b2c/kernel/schema";
import { env } from "../config/env";
import { getVoiceGrounding } from "./revision";
import { VoiceContextMissingError } from "./voice";

type Tx = PgTransaction<any, any, any>;

// A0 scope (user-confirmed): the two modes the bot is proven on and that Q5
// needs first. Text in the DB (voice_session.mode) so adding a mode later is a
// prompt file + this enum, no migration. teach_back's richer topic-registry
// grounding is A3; A0 grounds both from the slide manifest voice_context.
export const pipecatVoiceModeSchema = z.enum(["overview", "teach_back"]);
export type PipecatVoiceMode = z.infer<typeof pipecatVoiceModeSchema>;

/** Kill switch — a required Pipecat/Daily cred is missing. Fails the START call,
 *  never boot (the GEMINI_API_KEY stance). */
export class VoicePipecatNotConfiguredError extends Error {
  readonly code = "VOICE_PIPECAT_NOT_CONFIGURED";
  constructor(missing: string) {
    super(`voice (pipecat) not configured — ${missing} is unset`);
    this.name = "VoicePipecatNotConfiguredError";
  }
}

/** Pipecat Cloud rejected/failed the session-create. Carries the HTTP status
 *  (0 = network/timeout) + the vendor's response body so the reason is never
 *  swallowed (M32: a swallowed vendor failure reads as a silent hang). */
export class PipecatStartError extends Error {
  readonly code = "PIPECAT_START_FAILED";
  constructor(
    readonly httpStatus: number,
    readonly body: string,
  ) {
    super(`pipecat start failed (status ${httpStatus}): ${body.slice(0, 300)}`);
    this.name = "PipecatStartError";
  }
}

/** The Daily room + token Pipecat Cloud returns. Zod-parsed at the boundary
 *  (coding-patterns: route external data through a schema at the door) so a
 *  shape drift in the bot's response is a loud PipecatStartError, not a crash
 *  three layers deep. */
const pipecatStartResponseSchema = z.object({
  dailyRoom: z.string().url(),
  dailyToken: z.string().min(1),
  sessionId: z.string().min(1),
});

// The runtime config the bot reads (prod voice_service.py:163-174, verbatim
// keys). `session_id` is OUR correlation id; the bot echoes it in the webhook.
export type PipecatConfig = {
  session_id: string;
  system_prompt: string;
  context_messages: { role: string; content: string }[];
  tools: string[];
  stt_keywords: string[];
  webhook_url: string;
  student_name: string;
  mode: PipecatVoiceMode;
  idle_timeout: number;
  llm_thinking_level: string;
};

/** True when the Pipecat path can run (both load-bearing creds present). Read at
 *  call time (env is process-wide), so a probe/test in an unconfigured env sees
 *  the kill switch fire and skips the real (billable) leg. */
export function voicePipecatConfigured(): boolean {
  return Boolean(env.PIPECAT_API_KEY && env.VOICE_WEBHOOK_DOMAIN);
}

/** Load an OWNED mode prompt (we forked prod's `voice/*.txt` into the repo so we
 *  control them) and inject the template vars. Same three vars prod fills. */
export async function buildSystemPrompt(
  mode: PipecatVoiceMode,
  vars: { studentName: string; topicTitle: string; voiceContext: string },
): Promise<string> {
  const path = `${import.meta.dir}/voice/prompts/${mode}.txt`;
  const raw = await Bun.file(path).text();
  return raw
    .replaceAll("{{student_name}}", vars.studentName)
    .replaceAll("{{topic_title}}", vars.topicTitle)
    .replaceAll("{{voice_context}}", vars.voiceContext);
}

/** Pure: assemble the bot's runtime config. Kept separate + exported so the
 *  probe can assert the per-mode shape deterministically without a network call. */
export function assembleVoiceConfig(args: {
  sessionId: string;
  mode: PipecatVoiceMode;
  systemPrompt: string;
  voiceContext: string;
  keywords: string[];
  studentName: string;
  webhookDomain: string;
}): PipecatConfig {
  return {
    session_id: args.sessionId,
    system_prompt: args.systemPrompt,
    context_messages: [{ role: "system", content: args.voiceContext }],
    tools: ["whiteboard", "end_session"],
    stt_keywords: args.keywords,
    webhook_url: `https://${args.webhookDomain}/voice/webhook`,
    student_name: args.studentName,
    mode: args.mode,
    idle_timeout: 120,
    llm_thinking_level: "minimal",
  };
}

/** POST the config to Pipecat Cloud → create a Daily room + owner token. Ported
 *  from prod `_create_pipecat_session`. Log-before-throw + surface the vendor's
 *  reason on any non-200 / network error (never a silent hang). */
export async function createPipecatSession(
  config: PipecatConfig,
): Promise<{ roomUrl: string; token: string; pipecatSessionId: string }> {
  if (!env.PIPECAT_API_KEY) {
    throw new VoicePipecatNotConfiguredError("PIPECAT_API_KEY");
  }
  const url = `${env.PIPECAT_CLOUD_API}/${env.PIPECAT_AGENT_NAME}/start`;
  const payload = {
    createDailyRoom: true,
    body: config,
    dailyRoomProperties: { enable_recording: "cloud" },
    dailyMeetingTokenProperties: { is_owner: true, start_cloud_recording: true },
  };

  // Bot cold-start can spike; prod uses 30s. Abort (not hang) past it.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);
  let resp: Response;
  try {
    resp = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.PIPECAT_API_KEY}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
  } catch (e) {
    const reason = String((e as Error)?.message ?? e);
    console.error(
      `[voice_pipecat] start FAILED (network/timeout) agent=${env.PIPECAT_AGENT_NAME}: ${reason}`,
    );
    throw new PipecatStartError(0, reason);
  } finally {
    clearTimeout(timer);
  }

  const text = await resp.text();
  if (resp.status !== 200) {
    console.error(
      `[voice_pipecat] start FAILED ${resp.status} agent=${env.PIPECAT_AGENT_NAME}: ${text}`,
    );
    throw new PipecatStartError(resp.status, text);
  }

  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    console.error(`[voice_pipecat] start 200 but non-JSON body: ${text.slice(0, 300)}`);
    throw new PipecatStartError(200, `non-JSON body: ${text.slice(0, 200)}`);
  }
  const parsed = pipecatStartResponseSchema.safeParse(json);
  if (!parsed.success) {
    console.error(
      `[voice_pipecat] start 200 but unexpected shape:`,
      parsed.error.flatten(),
      json,
    );
    throw new PipecatStartError(200, `unexpected response shape`);
  }
  return {
    roomUrl: parsed.data.dailyRoom,
    token: parsed.data.dailyToken,
    pipecatSessionId: parsed.data.sessionId,
  };
}

export type PipecatSessionStart = {
  sessionId: string;
  roomUrl: string;
  token: string;
  mode: PipecatVoiceMode;
};

/**
 * Start a Pipecat-backed voice session on a sub_topic:
 *   1. resolve the slide's voice_context grounding (reject if none, as prod does
 *      — the button was gated on it: VoiceContextMissingError → BAD_REQUEST).
 *   2. build the system prompt from the OWNED mode prompt + grounding.
 *   3. pre-generate the correlation id → create the Daily room via Pipecat Cloud
 *      (prod ordering: room first, so we never persist a session whose room
 *      failed to create).
 *   4. persist the voice_session row (status active) under that id.
 * Returns the Daily room + token the FE joins. SlideNotFoundError (grounding)
 * propagates → NOT_FOUND at the router.
 */
export async function startPipecatVoiceSession(
  tx: Tx,
  args: {
    boardId: string;
    appUserId: string;
    subTopicId: string;
    mode?: PipecatVoiceMode;
  },
): Promise<PipecatSessionStart> {
  if (!env.PIPECAT_API_KEY) throw new VoicePipecatNotConfiguredError("PIPECAT_API_KEY");
  if (!env.VOICE_WEBHOOK_DOMAIN) {
    throw new VoicePipecatNotConfiguredError("VOICE_WEBHOOK_DOMAIN");
  }

  const mode = args.mode ?? "overview";
  const grounding = await getVoiceGrounding(tx, args.subTopicId);
  if (!grounding.voiceContext) {
    throw new VoiceContextMissingError(args.subTopicId);
  }

  // Authoritative student name — fetch from the row, never guess PII from ambient
  // context (M9). appUser is identity (not tenant-scoped). Fallback "there".
  const [u] = await tx
    .select({ name: appUser.name })
    .from(appUser)
    .where(eq(appUser.id, args.appUserId))
    .limit(1);
  const studentName = (u?.name ?? "").trim() || "there";

  const systemPrompt = await buildSystemPrompt(mode, {
    studentName,
    topicTitle: grounding.title || "this topic",
    voiceContext: grounding.voiceContext.context,
  });

  const sessionId = crypto.randomUUID();
  const config = assembleVoiceConfig({
    sessionId,
    mode,
    systemPrompt,
    voiceContext: grounding.voiceContext.context,
    keywords: grounding.voiceContext.keywords,
    studentName,
    webhookDomain: env.VOICE_WEBHOOK_DOMAIN,
  });

  const { roomUrl, token } = await createPipecatSession(config);

  await tx.insert(voiceSession).values({
    id: sessionId,
    boardId: args.boardId,
    studentId: args.appUserId,
    subTopicId: args.subTopicId,
    mode,
    status: "active",
  });

  return { sessionId, roomUrl, token, mode };
}
