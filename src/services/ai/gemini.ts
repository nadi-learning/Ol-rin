import { GoogleGenAI, type Schema } from "@google/genai";
import { env } from "../../config/env";
import { formatPromptIn, logAiCall } from "../ai_log";

/**
 * Thin single-vendor orchestrator for Gemini (Slice AI-1, the first AI in the
 * loop). Deliberately small (build-discipline ai-integration-gotchas: ONE
 * vendor, thin wrapper). When a second vendor is needed it slots in beside this
 * file behind the same `geminiJson` shape.
 *
 * Discipline applied here:
 * - Log every call BEFORE returning/throwing (no ghost calls in forensics).
 * - Silent-empty detector: a completed call with no text is a loud error, not "".
 * - Timeout set high, then measured (we log latency on every call).
 * - AiNotConfiguredError if no key — the kill switch. Callers (the worker job)
 *   fail loudly; the app + worker still BOOT without a key (env makes it optional).
 */

export class AiNotConfiguredError extends Error {
  constructor() {
    super("GEMINI_API_KEY not set — Stage-1 scoring is disabled");
    this.name = "AiNotConfiguredError";
  }
}

export class AiEmptyResponseError extends Error {
  constructor(label: string) {
    super(`Gemini returned no text for ${label}`);
    this.name = "AiEmptyResponseError";
  }
}

export class AiBadJsonError extends Error {
  constructor(label: string, raw: string) {
    super(`Gemini returned unparseable JSON for ${label}: ${raw.slice(0, 200)}`);
    this.name = "AiBadJsonError";
  }
}

// Generous; first call can spike (model warmup). Measure from the logs, tighten later.
// Per-call override via `timeoutMs` — authoring needs far more than this default
// (see AUTHORING_TIMEOUT_MS in authoring_worker.ts).
const TIMEOUT_MS = 120_000;
// Default cap on runaway/degenerate generations. IMPORTANT: on gemini-3 THINKING
// models this bounds thinking + answer TOGETHER (b2c prod gemini.py says so), and
// thinking spend is large + unpredictable (Stage-2 was observed at ~7900 thinking
// tokens; Stage-1 intermittently > 1900). A cap near the ANSWER size starves the
// thinking and truncates the JSON — so the default is generous; it still catches a
// truly degenerate loop. (The earlier 2048, mirroring prod's *eval* cap, was wrong
// for these calls — prod's *assessment* call uses NO cap.) Override per call if a
// specific call needs even more.
const DEFAULT_MAX_OUTPUT_TOKENS = 8192;

let client: GoogleGenAI | null = null;
function getClient(): GoogleGenAI {
  if (!env.GEMINI_API_KEY) throw new AiNotConfiguredError();
  // Memoize — a fresh client per call wastes the connection pool (cf. M1).
  if (!client) {
    client = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
  }
  return client;
}

export interface GeminiJsonArgs {
  /** Short label for logs/errors, e.g. "stage1:conceptual:<attemptId>". */
  label: string;
  /** Behaviour/role instruction (the skill body — what kind of read this is). */
  systemInstruction: string;
  /** The data turn (question + answer + LOs). */
  prompt: string;
  /**
   * Optional inline images (base64). When present the call becomes multimodal —
   * the image parts are sent BEFORE the text prompt in a single user turn (the
   * order Gemini vision expects). Used by the figure verifier (Slice IMG Stage-2)
   * to show the rendered PNG alongside its spec; text-only callers omit it.
   */
  images?: Array<{ mimeType: string; data: string }>;
  /** Forces structured output — Gemini constrains generation to this shape. */
  responseSchema: Schema;
  /**
   * Cap on output tokens (thinking + answer together on gemini-3 thinking
   * models). Defaults to DEFAULT_MAX_OUTPUT_TOKENS. Pass a higher number for a
   * bigger answer, or `null` to OMIT the cap entirely (model default — what b2c
   * prod's assessment call does; thinking is then never starved). The 120s
   * timeout + retry-once remain the runaway guards when uncapped.
   */
  maxOutputTokens?: number | null;
  /**
   * Wall-clock cap for ONE attempt, in ms. Defaults to TIMEOUT_MS. Until now no
   * timeout was wired at all (TIMEOUT_MS was declared and never read), so the
   * effective bound was the runtime's own opaque ~300s fetch deadline — which is
   * what surfaced as "The operation timed out." with no latency line to prove it.
   */
  timeoutMs?: number;
  /**
   * Cap on THINKING tokens. `undefined` ⇒ model default (automatic). A number
   * bounds the thinking spend directly — the right knob for a runaway (M28:
   * `maxOutputTokens` is NOT, it bounds thinking + answer together and starves
   * the JSON).
   */
  thinkingBudget?: number;
  /**
   * How many attempts before giving up. Defaults to 2 (retry once on an
   * empty/bad-JSON/timeout response — the transient-blip guard). Pass 1 for a
   * LONG call whose 2× worst case would otherwise blow a wall downstream: a
   * single 600s attempt is 600s, but two are 1200s (past nginx's 700s). The
   * async worker path uses maxAttempts:1 + a long timeout — it isn't behind a
   * proxy, so the bound it needs is a predictable single leg, not resilience.
   */
  maxAttempts?: number;
  /** Best-effort ai_call_log attribution (no RLS on that table — not a boundary). */
  boardId?: string | null;
  userId?: string | null;
}

/**
 * One structured JSON call to Gemini. Returns the parsed object (typed by the
 * caller). Retries ONCE on an empty/bad-JSON response (transient), then throws.
 */
export async function geminiJson<T>(args: GeminiJsonArgs): Promise<T> {
  const ai = getClient();
  const model = env.GEMINI_MODEL;
  const timeoutMs = args.timeoutMs ?? TIMEOUT_MS;

  const maxAttempts = args.maxAttempts ?? 2;
  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const startedAt = Date.now();
    try {
      // Text-only → pass the bare string (unchanged). Multimodal → one user turn
      // whose parts are the image(s) then the text prompt.
      const contents = args.images?.length
        ? [
            {
              role: "user",
              parts: [
                ...args.images.map((im) => ({
                  inlineData: { mimeType: im.mimeType, data: im.data },
                })),
                { text: args.prompt },
              ],
            },
          ]
        : args.prompt;
      const res = await ai.models.generateContent({
        model,
        contents,
        config: {
          systemInstruction: args.systemInstruction,
          responseMimeType: "application/json",
          responseSchema: args.responseSchema,
          // `null` (explicit) ⇒ omit the cap (model default); `undefined` ⇒ the
          // default ceiling; a number ⇒ that ceiling.
          ...(args.maxOutputTokens === null
            ? {}
            : { maxOutputTokens: args.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS }),
          ...(args.thinkingBudget === undefined
            ? {}
            : { thinkingConfig: { thinkingBudget: args.thinkingBudget } }),
          temperature: 0,
          abortSignal: AbortSignal.timeout(timeoutMs),
          httpOptions: { timeout: timeoutMs },
        },
      });
      const latencyMs = Date.now() - startedAt;
      const text = res.text?.trim() ?? "";
      const usage = res.usageMetadata;

      // Log BEFORE any throw — success path included. `thoughts` exposes the
      // thinking-token spend so a truncation (thinking ate the budget) is visible.
      console.log(
        `[gemini] ${args.label} model=${model} attempt=${attempt} ` +
          `latency=${latencyMs}ms in=${usage?.promptTokenCount ?? "?"} ` +
          `out=${usage?.candidatesTokenCount ?? "?"} ` +
          `thoughts=${usage?.thoughtsTokenCount ?? "?"} chars=${text.length}`,
      );
      // Forensics row (best-effort, never throws). Written BEFORE the empty/bad-JSON
      // throws below so a degenerate response is still on the record with its
      // token spend — those are the rows worth reading later.
      //
      // AWAITED, not fire-and-forget: an un-awaited insert loses the race against
      // process exit and silently drops the row (caught by the E2E — a real call
      // logged nothing). An AI call costs 5–100s; this insert is noise beside it.
      await logAiCall({
        boardId: args.boardId,
        userId: args.userId,
        endpoint: args.label,
        model,
        vendorId: "gemini_api",
        tokensIn: usage?.promptTokenCount ?? null,
        tokensOut: usage?.candidatesTokenCount ?? null,
        thinkingTokens: usage?.thoughtsTokenCount ?? null,
        latencyMs,
        timeoutMs,
        ok: text.length > 0,
        finishReason: text.length > 0 ? "stop" : "empty",
        errorMessage: text.length > 0 ? null : "empty response (no text)",
        promptIn: formatPromptIn(args.systemInstruction, args.prompt),
        promptOut: text || null,
        attempt,
      });

      if (!text) throw new AiEmptyResponseError(args.label);

      try {
        return JSON.parse(text) as T;
      } catch {
        throw new AiBadJsonError(args.label, text);
      }
    } catch (err) {
      lastErr = err;
      // A config/auth error won't fix itself on retry — surface immediately.
      if (err instanceof AiNotConfiguredError) throw err;
      // Log the ELAPSED time on the failure path too. Without it a timeout is
      // indistinguishable from an instant network error in the journal — which
      // is exactly why the 2026-07-16 authoring stall took a forensic dig.
      const latencyMs = Date.now() - startedAt;
      const timedOut = latencyMs >= timeoutMs - 1_000;
      const message = err instanceof Error ? err.message : String(err);
      console.error(
        `[gemini] ${args.label} model=${model} attempt=${attempt} ` +
          `latency=${latencyMs}ms timeout=${timeoutMs}ms${timedOut ? " TIMED-OUT" : ""} ` +
          `FAILED: ${message}`,
      );
      // The row that today's incident needed and did not have. A timeout yields
      // no usage metadata (the response never arrived), so tokens stay null —
      // but latency + timeout + the prompt are enough to replay it. Awaited for
      // the same reason as the success path above.
      await logAiCall({
        boardId: args.boardId,
        userId: args.userId,
        endpoint: args.label,
        model,
        vendorId: "gemini_api",
        latencyMs,
        timeoutMs,
        ok: false,
        finishReason: timedOut ? "timeout" : "error",
        errorCause: timedOut ? "silent_timeout" : null,
        errorMessage: message,
        promptIn: formatPromptIn(args.systemInstruction, args.prompt),
        attempt,
      });
      if (attempt === 2) throw lastErr;
    }
  }
  // Unreachable (loop either returns or throws), but satisfies the type checker.
  throw lastErr;
}

export const __aiConfigured = () => Boolean(env.GEMINI_API_KEY);
