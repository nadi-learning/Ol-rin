import { GoogleGenAI, type Schema } from "@google/genai";
import { env } from "../../config/env";

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
}

/**
 * One structured JSON call to Gemini. Returns the parsed object (typed by the
 * caller). Retries ONCE on an empty/bad-JSON response (transient), then throws.
 */
export async function geminiJson<T>(args: GeminiJsonArgs): Promise<T> {
  const ai = getClient();
  const model = env.GEMINI_MODEL;

  let lastErr: unknown;
  for (let attempt = 1; attempt <= 2; attempt++) {
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
          temperature: 0,
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
      console.error(
        `[gemini] ${args.label} attempt=${attempt} FAILED: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      if (attempt === 2) throw lastErr;
    }
  }
  // Unreachable (loop either returns or throws), but satisfies the type checker.
  throw lastErr;
}

export const __aiConfigured = () => Boolean(env.GEMINI_API_KEY);
