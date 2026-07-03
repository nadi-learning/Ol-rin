// Gemini API vendor — wraps @google/genai's interactions API.
//
// Ported VERBATIM from Starkhorn (nadi-backend/src/services/ai/vendors/
// gemini_api_vendor.ts) for the AUTH-v2 conversational authoring slice. b2c runs
// @google/genai ^2.10 (newer than Starkhorn's 2.3); the interactions surface is
// the same.
//
// Auth: GEMINI_API_KEY from env. Construction is lazy — the client is built on
// the first call so deployments without a key don't fail at module load.
//
// NOTE on the SDK: ai.interactions is marked "experimental" by Google. We picked
// it deliberately — it's the only chat primitive that exposes a server-side
// `previous_interaction_id` resume handle (parity with Claude CLI's --resume).
// If Google rev the API surface, this file is where we adapt.
//
// Returns VendorCompletionResult on every normal path. Errors map onto our
// normalized ErrorCause taxonomy:
//
//    HTTP 401            → auth_failed
//    HTTP 403            → quota_exceeded
//    HTTP 429            → rate_limit
//    HTTP 5xx / network  → network
//    AbortError          → finishReason="timeout" + cause="network"

import { GoogleGenAI, ApiError } from "@google/genai";
import { publish as publishStream } from "../../../sse/stream_bus";
import type {
  AiVendor,
  ErrorCause,
  ToolCall,
  ToolResultIn,
  ToolSpec,
  VendorCompletionRequest,
  VendorCompletionResult,
} from "../types";

const VENDOR_ID = "gemini_api" as const;
const DEFAULT_MODEL = "gemini-3.1-pro-preview";
const DEFAULT_ONESHOT_TIMEOUT_SEC = 120;
const DEFAULT_STREAM_TIMEOUT_SEC = 180;

let cachedClient: GoogleGenAI | null = null;
function getClient(): GoogleGenAI {
  if (cachedClient) return cachedClient;
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "GEMINI_API_KEY is not set in env — Gemini vendor unavailable",
    );
  }
  cachedClient = new GoogleGenAI({ apiKey });
  return cachedClient;
}

function classifyError(err: unknown): { cause: ErrorCause; message: string } {
  if (err instanceof ApiError) {
    const status = err.status ?? 0;
    let cause: ErrorCause = "unknown";
    if (status === 401) cause = "auth_failed";
    else if (status === 403) cause = "quota_exceeded";
    else if (status === 429) cause = "rate_limit";
    else if (status >= 500) cause = "network";
    return { cause, message: `gemini ApiError ${status}: ${err.message}` };
  }
  if (err instanceof Error) {
    const msg = err.message;
    if (msg === "The operation was aborted.") {
      return { cause: "network", message: "gemini call aborted (timeout or signal)" };
    }
    if (/ENOTFOUND|ECONNREFUSED|fetch failed|network/i.test(msg)) {
      return { cause: "network", message: msg };
    }
    return { cause: "unknown", message: msg };
  }
  return { cause: "unknown", message: String(err) };
}

class GeminiApiVendor implements AiVendor {
  readonly id = VENDOR_ID;

  async complete(
    req: VendorCompletionRequest,
  ): Promise<VendorCompletionResult> {
    const model = req.model || DEFAULT_MODEL;
    const usesStreaming = !!req.streamKey;
    const timeoutSec =
      req.timeoutSec ??
      (usesStreaming ? DEFAULT_STREAM_TIMEOUT_SEC : DEFAULT_ONESHOT_TIMEOUT_SEC);
    const timeoutMs = timeoutSec * 1000;
    const startedAt = Date.now();

    let ai: GoogleGenAI;
    try {
      ai = getClient();
    } catch (err) {
      return this.errorResult({
        latencyMs: Date.now() - startedAt,
        model,
        cause: "auth_failed",
        message: (err as Error).message,
      });
    }

    const inputForCall = buildInput(req);
    const baseParams: Record<string, unknown> = {
      model,
      input: inputForCall,
    };
    if (req.systemPrompt) baseParams.system_instruction = req.systemPrompt;
    if (req.resumeSessionId) {
      baseParams.previous_interaction_id = req.resumeSessionId;
    }
    if (req.tools && req.tools.length > 0) {
      baseParams.tools = req.tools.map(toolSpecToFunctionTool);
      if (req.toolChoice) {
        baseParams.generation_config = { tool_choice: req.toolChoice };
      }
    }

    const abortCtrl = new AbortController();
    const killer = setTimeout(() => abortCtrl.abort(), timeoutMs);
    if (req.abortSignal) {
      if (req.abortSignal.aborted) abortCtrl.abort();
      else
        req.abortSignal.addEventListener("abort", () => abortCtrl.abort(), {
          once: true,
        });
    }

    try {
      if (usesStreaming) {
        return await this.streamPath({
          req,
          ai,
          baseParams,
          startedAt,
          model,
          signal: abortCtrl.signal,
          timeoutMs,
        });
      }
      return await this.oneShotPath({
        req,
        ai,
        baseParams,
        startedAt,
        model,
        signal: abortCtrl.signal,
        timeoutMs,
      });
    } catch (err) {
      const { cause, message } = classifyError(err);
      const latencyMs = Date.now() - startedAt;
      const isTimeout =
        err instanceof Error &&
        (err.name === "AbortError" || /aborted/i.test(err.message));
      return {
        text: "",
        inputTokens: 0,
        outputTokens: 0,
        costUsd: 0,
        latencyMs,
        sessionId: null,
        model,
        vendorId: VENDOR_ID,
        finishReason: isTimeout ? "timeout" : "error",
        cause: isTimeout ? "network" : cause,
        errorMessage: isTimeout
          ? `gemini call aborted after ${latencyMs}ms (timeout=${timeoutMs}ms)`
          : message,
      };
    } finally {
      clearTimeout(killer);
    }
  }

  private async oneShotPath(args: {
    req: VendorCompletionRequest;
    ai: GoogleGenAI;
    baseParams: Record<string, unknown>;
    startedAt: number;
    model: string;
    signal: AbortSignal;
    timeoutMs: number;
  }): Promise<VendorCompletionResult> {
    const { req, ai, baseParams, startedAt, model, signal, timeoutMs } = args;

    const interaction = (await (
      ai.interactions.create as unknown as (
        params: typeof baseParams,
        opts: { signal: AbortSignal; timeout: number },
      ) => Promise<RawInteraction>
    )(baseParams, { signal, timeout: timeoutMs })) as RawInteraction;

    const latencyMs = Date.now() - startedAt;
    const text = interaction.output_text ?? extractTextFromSteps(interaction.steps);
    const inputTokens = interaction.usage?.total_input_tokens ?? 0;
    const outputTokens = interaction.usage?.total_output_tokens ?? 0;
    const toolCalls = extractToolCalls(interaction.steps);

    if (interaction.status === "failed" || interaction.status === "cancelled") {
      return {
        text,
        inputTokens,
        outputTokens,
        costUsd: 0,
        latencyMs,
        sessionId: interaction.id,
        model,
        vendorId: VENDOR_ID,
        finishReason: "error",
        cause: "unknown",
        errorMessage: `gemini interaction status=${interaction.status}`,
        toolCalls,
      };
    }

    if (interaction.status === "incomplete") {
      return {
        text,
        inputTokens,
        outputTokens,
        costUsd: 0,
        latencyMs,
        sessionId: interaction.id,
        model,
        vendorId: VENDOR_ID,
        finishReason: "length",
        toolCalls,
      };
    }

    if (req.onSessionId && interaction.id) {
      try {
        await req.onSessionId(interaction.id);
      } catch {
        /* noop */
      }
    }

    if (outputTokens === 0 && !text && toolCalls.length === 0) {
      return {
        text: "",
        inputTokens,
        outputTokens: 0,
        costUsd: 0,
        latencyMs,
        sessionId: interaction.id,
        model,
        vendorId: VENDOR_ID,
        finishReason: "empty",
        cause: "silent_timeout",
        errorMessage: `gemini one-shot returned status=${interaction.status} with no text + no tool calls`,
      };
    }

    return {
      text,
      inputTokens,
      outputTokens,
      costUsd: 0,
      latencyMs,
      sessionId: interaction.id,
      model,
      vendorId: VENDOR_ID,
      finishReason: "stop",
      toolCalls,
    };
  }

  private async streamPath(args: {
    req: VendorCompletionRequest;
    ai: GoogleGenAI;
    baseParams: Record<string, unknown>;
    startedAt: number;
    model: string;
    signal: AbortSignal;
    timeoutMs: number;
  }): Promise<VendorCompletionResult> {
    const { req, ai, baseParams, startedAt, model } = args;

    const streamParams = { ...baseParams, stream: true };
    const stream = (await (
      ai.interactions.create as unknown as (
        params: typeof streamParams,
        opts: { signal: AbortSignal; timeout: number },
      ) => Promise<AsyncIterable<Record<string, unknown>>>
    )(streamParams, { signal: args.signal, timeout: args.timeoutMs })) as AsyncIterable<{
      event_type: string;
      index?: number;
      step?: RawStep;
      delta?: { type?: string; text?: string; arguments?: string };
      interaction?: RawInteraction;
      error?: { code?: string; message?: string };
    }>;

    let fullText = "";
    let interactionId: string | null = null;
    let inputTokens = 0;
    let outputTokens = 0;
    let finalStatus: string | null = null;
    let errorMessage: string | null = null;
    let finalSteps: RawStep[] | undefined;
    const streamedSteps = new Map<
      number,
      { step: RawStep; argsBuffer: string }
    >();

    for await (const ev of stream) {
      if (ev.event_type === "step.start" && ev.step && typeof ev.index === "number") {
        streamedSteps.set(ev.index, { step: ev.step, argsBuffer: "" });
        continue;
      }

      if (
        ev.event_type === "step.delta" &&
        ev.delta?.type === "text" &&
        typeof ev.delta.text === "string"
      ) {
        const tok = ev.delta.text;
        fullText += tok;
        if (req.streamKey) {
          await publishStream(req.streamKey, { type: "token", text: tok });
        }
        continue;
      }

      if (
        ev.event_type === "step.delta" &&
        ev.delta?.type === "arguments_delta" &&
        typeof ev.delta.arguments === "string" &&
        typeof ev.index === "number"
      ) {
        const entry = streamedSteps.get(ev.index);
        if (entry) entry.argsBuffer += ev.delta.arguments;
        continue;
      }

      if (ev.event_type === "interaction.created" && ev.interaction?.id) {
        interactionId = ev.interaction.id;
        if (req.onSessionId) {
          try {
            await req.onSessionId(interactionId);
          } catch {
            /* noop */
          }
        }
        continue;
      }

      if (ev.event_type === "interaction.completed" && ev.interaction) {
        interactionId = ev.interaction.id;
        finalStatus = ev.interaction.status;
        inputTokens = ev.interaction.usage?.total_input_tokens ?? 0;
        outputTokens = ev.interaction.usage?.total_output_tokens ?? 0;
        finalSteps = ev.interaction.steps;
        continue;
      }

      if (ev.event_type === "error") {
        errorMessage = ev.error?.message ?? "gemini stream error";
        if (req.streamKey) {
          await publishStream(req.streamKey, {
            type: "error",
            message: errorMessage,
          });
        }
      }
    }

    const latencyMs = Date.now() - startedAt;
    for (const entry of streamedSteps.values()) {
      if (entry.step.type === "function_call" && entry.argsBuffer) {
        try {
          entry.step.arguments = JSON.parse(entry.argsBuffer) as Record<
            string,
            unknown
          >;
        } catch (err) {
          console.warn(
            `[gemini] failed to parse function_call arguments buffer (${entry.argsBuffer.length} chars): ${(err as Error).message}`,
          );
        }
      }
    }
    const stepsForExtraction =
      finalSteps && finalSteps.length > 0
        ? finalSteps
        : Array.from(streamedSteps.values()).map((e) => e.step);
    const toolCalls = extractToolCalls(stepsForExtraction);
    const finalText = fullText || extractTextFromSteps(stepsForExtraction);

    if (errorMessage) {
      return {
        text: finalText,
        inputTokens,
        outputTokens,
        costUsd: 0,
        latencyMs,
        sessionId: interactionId,
        model,
        vendorId: VENDOR_ID,
        finishReason: "error",
        cause: "unknown",
        errorMessage,
        toolCalls,
      };
    }

    if (finalStatus === "failed" || finalStatus === "cancelled") {
      return {
        text: finalText,
        inputTokens,
        outputTokens,
        costUsd: 0,
        latencyMs,
        sessionId: interactionId,
        model,
        vendorId: VENDOR_ID,
        finishReason: "error",
        cause: "unknown",
        errorMessage: `gemini stream status=${finalStatus}`,
        toolCalls,
      };
    }

    if (finalStatus === "incomplete") {
      return {
        text: finalText,
        inputTokens,
        outputTokens,
        costUsd: 0,
        latencyMs,
        sessionId: interactionId,
        model,
        vendorId: VENDOR_ID,
        finishReason: "length",
        toolCalls,
      };
    }

    if (
      !finalStatus &&
      outputTokens === 0 &&
      !finalText &&
      toolCalls.length === 0
    ) {
      return {
        text: "",
        inputTokens: 0,
        outputTokens: 0,
        costUsd: 0,
        latencyMs,
        sessionId: interactionId,
        model,
        vendorId: VENDOR_ID,
        finishReason: "empty",
        cause: "silent_timeout",
        errorMessage: `gemini stream ended without completion event after ${latencyMs}ms`,
      };
    }

    return {
      text: finalText,
      inputTokens,
      outputTokens,
      costUsd: 0,
      latencyMs,
      sessionId: interactionId,
      model,
      vendorId: VENDOR_ID,
      finishReason: "stop",
      toolCalls,
    };
  }

  private errorResult(opts: {
    latencyMs: number;
    model: string;
    cause: ErrorCause;
    message: string;
  }): VendorCompletionResult {
    return {
      text: "",
      inputTokens: 0,
      outputTokens: 0,
      costUsd: 0,
      latencyMs: opts.latencyMs,
      sessionId: null,
      model: opts.model,
      vendorId: VENDOR_ID,
      finishReason: "error",
      cause: opts.cause,
      errorMessage: opts.message,
    };
  }
}

export const geminiApiVendor: AiVendor = new GeminiApiVendor();

// ---------- helpers ----------

interface RawStep {
  type: string;
  id?: string;
  name?: string;
  arguments?: Record<string, unknown>;
  content?: Array<{ type?: string; text?: string }>;
}
interface RawInteraction {
  id: string;
  status: string;
  steps?: RawStep[];
  output_text?: string;
  usage?: {
    total_input_tokens?: number;
    total_output_tokens?: number;
  };
}

function toolSpecToFunctionTool(spec: ToolSpec): Record<string, unknown> {
  return {
    type: "function",
    name: spec.name,
    description: spec.description,
    parameters: spec.inputSchemaJson,
  };
}

function toolResultsToInputSteps(
  results: ToolResultIn[],
): Array<Record<string, unknown>> {
  return results.map((r) => ({
    type: "function_result",
    call_id: r.callId,
    name: r.name,
    result: r.result,
    is_error: r.isError ?? false,
  }));
}

/**
 * Build the `input` field for interactions.create. In b2c the chat path always
 * hits the fast path (plain string) — no tool results, no images. The other
 * branches are carried for shape-fidelity with the verbatim port.
 */
export function buildInput(req: VendorCompletionRequest): unknown {
  const hasToolResults = !!req.toolResults && req.toolResults.length > 0;
  const hasImages = !!req.images && req.images.length > 0;
  if (!hasToolResults && !hasImages) return req.userMessage;

  const steps = hasToolResults ? toolResultsToInputSteps(req.toolResults!) : [];

  const content: Array<Record<string, unknown>> = [];
  if (hasImages) {
    for (const img of req.images!) {
      content.push({ type: "image", data: img.data, mime_type: img.mimeType });
    }
  }
  if (req.userMessage && req.userMessage.length > 0) {
    content.push({ type: "text", text: req.userMessage });
  }

  if (content.length > 0) {
    return [...steps, { type: "user_input", content }];
  }
  return steps;
}

function extractToolCalls(steps?: RawStep[]): ToolCall[] {
  if (!steps) return [];
  const out: ToolCall[] = [];
  for (const s of steps) {
    if (s.type !== "function_call") continue;
    if (!s.id || !s.name) continue;
    out.push({
      id: s.id,
      name: s.name,
      args: s.arguments ?? {},
    });
  }
  return out;
}

function extractTextFromSteps(steps?: RawStep[]): string {
  if (!steps) return "";
  const out: string[] = [];
  for (const s of steps) {
    if (s.type !== "model_output" || !s.content) continue;
    for (const part of s.content) {
      if (part.type === "text" && typeof part.text === "string") {
        out.push(part.text);
      }
    }
  }
  return out.join("");
}
