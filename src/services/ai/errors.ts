// AI vendor abstraction — error types. Ported from Starkhorn
// (nadi-backend/src/services/ai/errors.ts). Vendor-agnostic; shared by the
// vendor impls and the orchestrator (services/ai_client.ts).

import type { ErrorCause, VendorId } from "./types";

/**
 * Thrown by the orchestrator when a vendor returned zero output tokens via a
 * known failure pattern (silent SIGTERM, broken pipe). Callers that can absorb
 * a retry catch this and retry once; callers that can't surface the error.
 *
 * b2c logs the call (console) before the throw so forensics aren't blind.
 */
export class EmptyResponseError extends Error {
  readonly latencyMs: number;
  readonly timeoutMs: number;
  readonly endpoint: string;
  readonly cause: Extract<ErrorCause, "silent_timeout" | "broken_pipe">;
  readonly vendorId: VendorId;
  readonly stderr?: string;
  constructor(opts: {
    latencyMs: number;
    timeoutMs: number;
    endpoint: string;
    cause: Extract<ErrorCause, "silent_timeout" | "broken_pipe">;
    vendorId: VendorId;
    stderr?: string;
  }) {
    const causeStr =
      opts.cause === "silent_timeout"
        ? "silent SIGTERM"
        : "broken pipe (fast subprocess exit)";
    super(
      `${opts.vendorId} produced 0 output tokens after ${opts.latencyMs}ms ` +
        `(timeout=${opts.timeoutMs}ms, endpoint=${opts.endpoint}) — ${causeStr}`,
    );
    this.name = "EmptyResponseError";
    this.latencyMs = opts.latencyMs;
    this.timeoutMs = opts.timeoutMs;
    this.endpoint = opts.endpoint;
    this.cause = opts.cause;
    this.vendorId = opts.vendorId;
    this.stderr = opts.stderr;
  }
}
