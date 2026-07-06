// AI orchestrator — vendor-agnostic facade.
//
// Ported from Starkhorn (nadi-backend/src/services/ai_client.ts). Resolves a
// request to a vendor (via req.vendorId or the default), calls vendor.complete(),
// records a forensic line, and translates vendor failure modes:
//
//   - finishReason="stop"   → return result (callers read .text, .sessionId, …)
//   - finishReason="empty"  → throw EmptyResponseError (callers retry or surface)
//   - finishReason="error"  → throw new Error(errorMessage)
//
// The vendor itself never throws for "normal" failure modes — those are encoded
// into the result shape. Only unexpected failures (binary not on PATH, SDK
// crash) bubble up as exceptions; this layer catches them, logs, and rethrows.
//
// b2c micro-decision #1 (AUTH-v2): Starkhorn writes every call to an `ai_call_log`
// DB table. b2c has no such table — forensics are CONSOLE lines here (matching
// the existing services/ai/gemini.ts style). The table is pure forensics, off
// the functional path; porting it is out of scope for this slice.

import { createHash } from "node:crypto";
import { getVendor } from "./ai/registry";
import { EmptyResponseError } from "./ai/errors";
import type {
  VendorCompletionRequest,
  VendorCompletionResult,
  VendorId,
} from "./ai/types";

// ---------- re-exports ----------
export { EmptyResponseError } from "./ai/errors";
export type {
  VendorCompletionRequest as CompletionRequest,
  VendorCompletionResult as CompletionResult,
  FinishReason,
  ErrorCause,
  VendorId,
} from "./ai/types";

const DEFAULT_VENDOR: VendorId = "claude_cli";

/**
 * Compute the resume fingerprint for this call. Vendors compare this against the
 * per-thread fingerprint stored alongside resumeSessionId; mismatch → fall back
 * to a fresh / stitched-history path rather than resume into a session authored
 * under a different system prompt.
 */
export function computeSessionFingerprint(req: VendorCompletionRequest): string {
  const slotComponent = req.slotId ?? req.endpoint;
  return createHash("sha256")
    .update(req.systemPrompt)
    .update("")
    .update(slotComponent)
    .digest("hex")
    .slice(0, 32);
}

function resolveVendor(req: VendorCompletionRequest): VendorId {
  return req.vendorId ?? DEFAULT_VENDOR;
}

export async function complete(
  req: VendorCompletionRequest,
): Promise<VendorCompletionResult> {
  const vendorId = resolveVendor(req);
  const vendor = getVendor(vendorId);

  const sessionFingerprint =
    req.sessionFingerprint ?? computeSessionFingerprint(req);

  let result: VendorCompletionResult;
  try {
    result = await vendor.complete({ ...req, sessionFingerprint });
  } catch (err) {
    // Truly unexpected vendor failure (spawn error, SDK crash, etc.).
    logCall({
      req,
      vendorId,
      ok: false,
      latencyMs: 0,
      tokensIn: 0,
      tokensOut: 0,
      finishReason: "error",
      errorMessage: `unhandled vendor error: ${(err as Error).message}`,
    });
    throw err;
  }

  logCall({
    req,
    vendorId,
    ok: result.finishReason === "stop",
    latencyMs: result.latencyMs,
    tokensIn: result.inputTokens,
    tokensOut: result.outputTokens,
    finishReason: result.finishReason,
    errorMessage: result.errorMessage,
  });

  if (result.finishReason === "empty") {
    const timeoutMs = (req.timeoutSec ?? 0) * 1000;
    const cause = result.cause;
    if (cause !== "silent_timeout" && cause !== "broken_pipe") {
      throw new Error(
        `vendor returned finishReason=empty without a known cause (got: ${cause ?? "undefined"})`,
      );
    }
    throw new EmptyResponseError({
      latencyMs: result.latencyMs,
      timeoutMs,
      endpoint: req.endpoint,
      cause,
      vendorId: result.vendorId,
      stderr: result.stderr,
    });
  }

  if (result.finishReason === "error") {
    throw new Error(result.errorMessage ?? `${vendorId} returned error`);
  }

  // Stamp the fingerprint onto the success result so callers can persist it
  // alongside sessionId on chat messages for downstream resume validation.
  return { ...result, sessionFingerprint };
}

// ---------- forensics (console) ----------

interface LogRowArgs {
  req: VendorCompletionRequest;
  vendorId: VendorId;
  ok: boolean;
  latencyMs: number;
  tokensIn: number;
  tokensOut: number;
  finishReason: VendorCompletionResult["finishReason"];
  errorMessage?: string;
}

function logCall(a: LogRowArgs): void {
  const tag = a.ok ? "ok" : "FAIL";
  console.log(
    `[ai_client] ${tag} vendor=${a.vendorId} endpoint=${a.req.endpoint} ` +
      `model=${a.req.model || "(default)"} latency=${a.latencyMs}ms ` +
      `in=${a.tokensIn} out=${a.tokensOut} finish=${a.finishReason}` +
      (a.errorMessage ? ` err=${a.errorMessage.slice(0, 200)}` : ""),
  );
}

// ---------- helpers ----------

/**
 * Strip a JSON object out of a model response that may contain prose, code
 * fences, etc. Returns null if no parseable JSON object found. Used by the
 * Claude authoring call (CLI Claude has no schema-constrained output — it's
 * prompted for JSON and parsed here; micro-decision #2).
 */
export function extractJsonObject<T = unknown>(text: string): T | null {
  try {
    return JSON.parse(text) as T;
  } catch {
    /* fall through */
  }

  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced?.[1]) {
    try {
      return JSON.parse(fenced[1]) as T;
    } catch {
      /* fall through */
    }
  }

  const start = text.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i]!;
    if (inStr) {
      if (esc) {
        esc = false;
      } else if (ch === "\\") {
        esc = true;
      } else if (ch === '"') {
        inStr = false;
      }
      continue;
    }
    if (ch === '"') {
      inStr = true;
      continue;
    }
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) {
        const slice = text.slice(start, i + 1);
        try {
          return JSON.parse(slice) as T;
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}
