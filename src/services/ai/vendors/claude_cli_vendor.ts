// Claude CLI vendor — wraps the local `claude` subprocess.
//
// Ported from Starkhorn (nadi-backend/src/services/ai/vendors/claude_cli_vendor.ts)
// for the AUTH-v2 conversational authoring slice. The user's directive: port the
// chat plumbing EXACTLY as nadi-backend (CLI subprocess + OAuth subscription,
// not the @anthropic-ai/sdk). Starkhorn is deployed this way and it works.
//
// b2c deviation (the ONLY one): the agentic file-editing path and the XML
// tool-shim are DROPPED. b2c's authoring chat never sets req.tools (fork 4 makes
// question authoring a separate structured call) and never uses mode:'agentic',
// so the shim's parse branch and the agenticPath would be dead code. The
// one-shot + streaming conversational paths are verbatim.
//
// Auth: strips ANTHROPIC_API_KEY from the subprocess env so Claude Code falls
// back to its OAuth credentials (the user's Claude subscription). The `claude`
// binary must be on PATH; no API key is needed.
//
// Returns VendorCompletionResult on every normal path (success, empty,
// vendor-error). Throws only on truly unexpected failures (e.g. `claude` binary
// not on PATH). The orchestrator (services/ai_client.ts) handles logging and
// translates finishReason="empty" into EmptyResponseError.

import { publish as publishStream } from "../../../sse/stream_bus";
import type {
  AiVendor,
  ErrorCause,
  VendorCompletionRequest,
  VendorCompletionResult,
} from "../types";

// b2c: the FE type-checks the BE graph transitively via its type-only AppRouter
// import (D-S1-5), but the FE tsconfig carries no bun-types — so the `Bun` global
// is unknown there (the BE has it). Reach the runtime via globalThis with a
// minimal local type so BOTH tsconfigs compile. Runtime behaviour is identical to
// Starkhorn's bare `Bun.spawn`.
type BunSpawnResult = {
  stdin: { write: (s: string) => void; end: () => Promise<void> };
  stdout: ReadableStream<Uint8Array>;
  stderr: ReadableStream<Uint8Array>;
  exited: Promise<number>;
  exitCode: number | null;
  kill: (sig?: string) => void;
};
const bunRT = (
  globalThis as unknown as {
    Bun: { spawn: (cmd: string[], opts: Record<string, unknown>) => BunSpawnResult };
  }
).Bun;

const VENDOR_ID = "claude_cli" as const;
const DEFAULT_MODEL = "opus";

const DEFAULT_ONESHOT_TIMEOUT_SEC = 120;
const DEFAULT_STREAM_TIMEOUT_SEC = 180;

// Built-in Claude Code tools we never want the backend agent reaching for. The
// conversational path denies them all — the model speaks only in text.
const DISALLOWED_TOOLS = [
  "Task",
  "TaskCreate",
  "TaskGet",
  "TaskList",
  "TaskUpdate",
  "AskUserQuestion",
  "Bash",
  "CronCreate",
  "CronDelete",
  "CronList",
  "Edit",
  "EnterPlanMode",
  "EnterWorktree",
  "ExitPlanMode",
  "ExitWorktree",
  "Glob",
  "Grep",
  "ListMcpResourcesTool",
  "Monitor",
  "NotebookEdit",
  "PushNotification",
  "Read",
  "ReadMcpResourceTool",
  "RemoteTrigger",
  "ScheduleWakeup",
  "Skill",
  "TaskOutput",
  "TaskStop",
  "TodoWrite",
  "ToolSearch",
  "WebFetch",
  "WebSearch",
  "Write",
];

interface ClaudeJsonResult {
  type: "result";
  subtype: "success" | "error_during_execution" | string;
  is_error: boolean;
  result: string;
  session_id?: string;
  total_cost_usd?: number;
  duration_ms?: number;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
  };
  modelUsage?: Record<
    string,
    { inputTokens?: number; outputTokens?: number; costUSD?: number }
  >;
  api_error_status?: number;
}

interface ClaudeStreamEvent {
  type: string;
  subtype?: string;
  is_error?: boolean;
  result?: string;
  total_cost_usd?: number;
  api_error_status?: number;
  duration_ms?: number;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
  };
  session_id?: string;
  event?: {
    type: string;
    delta?: { type?: string; text?: string };
    index?: number;
  };
  rate_limit_info?: unknown;
}

/**
 * EPIPE check — Bun's FileSink.end() throws this when the child closed its
 * stdin before draining the buffer. Matches both Node-style EPIPE and Bun's
 * "broken pipe, send" wording.
 */
function isBrokenPipe(err: unknown): boolean {
  if (!err) return false;
  const msg = (err as Error).message ?? String(err);
  return /EPIPE|broken pipe/i.test(msg);
}

// Vars dropped from the env of EVERY Claude subprocess. Defence-in-depth so a
// future call site can't accidentally leak these into the model's environment.
const SUBPROCESS_ENV_BLOCKLIST = new Set<string>([
  "ANTHROPIC_API_KEY",
  "DATABASE_URL",
  "MIGRATE_DATABASE_URL",
  "BETTER_AUTH_SECRET",
  "GOOGLE_CLIENT_SECRET",
  "GEMINI_API_KEY",
]);

function makeEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (SUBPROCESS_ENV_BLOCKLIST.has(k)) continue;
    if (v != null) env[k] = v;
  }
  return env;
}

/** Tool-gating for the conversational paths — deny every tool; the model
 *  replies only in text. */
function toolGatingArgs(): string[] {
  return ["--disallowedTools", ...DISALLOWED_TOOLS];
}

/**
 * Pure detector for the silent-timeout pattern: zero output tokens AND latency
 * that essentially fills the subprocess timeout window. 2-second grace accounts
 * for spawn + teardown overhead before SIGTERM.
 */
function isSilentTimeout(
  outputTokens: number,
  latencyMs: number,
  timeoutMs: number,
): boolean {
  return outputTokens === 0 && latencyMs >= timeoutMs - 2000;
}

class ClaudeCliVendor implements AiVendor {
  readonly id = VENDOR_ID;

  async complete(req: VendorCompletionRequest): Promise<VendorCompletionResult> {
    // Two conversational paths:
    //   1. streaming — when caller needs early session_id capture, SSE stream,
    //      or session resume.
    //   2. one-shot — default. Lowest overhead.
    const usesStreaming = !!(
      req.onSessionId ||
      req.resumeSessionId ||
      req.streamKey
    );
    const effectiveTimeoutSec =
      req.timeoutSec ||
      (usesStreaming ? DEFAULT_STREAM_TIMEOUT_SEC : DEFAULT_ONESHOT_TIMEOUT_SEC);
    const reqWithTimeout: VendorCompletionRequest = {
      ...req,
      timeoutSec: effectiveTimeoutSec,
    };

    return usesStreaming
      ? await this.streamPath(reqWithTimeout)
      : await this.oneShotPath(reqWithTimeout);
  }

  private async oneShotPath(
    req: VendorCompletionRequest,
  ): Promise<VendorCompletionResult> {
    // `||` not `??`: callers pass `""` to mean "use vendor default" when a chat
    // thread has been flipped to a non-native vendor. `??` would let the empty
    // string through and the CLI errors on `--model ""`.
    const model = req.model || DEFAULT_MODEL;
    const args = [
      "--print",
      "--output-format",
      "json",
      "--input-format",
      "text",
      "--model",
      model,
      "--system-prompt",
      req.systemPrompt,
      "--exclude-dynamic-system-prompt-sections",
      "--strict-mcp-config",
      ...toolGatingArgs(),
      ...(req.resumeSessionId ? ["--resume", req.resumeSessionId] : []),
      ...(req.extraArgs ?? []),
    ];

    const startedAt = Date.now();
    const proc = bunRT.spawn(["claude", ...args], {
      env: makeEnv(),
      stdin: "pipe",
      stdout: "pipe",
      stderr: "pipe",
    });

    // Install killer FIRST so any later step that hangs gets cleaned up.
    const timeoutMs = (req.timeoutSec ?? DEFAULT_ONESHOT_TIMEOUT_SEC) * 1000;
    const killer = setTimeout(() => {
      try {
        proc.kill("SIGTERM");
      } catch {
        /* noop */
      }
    }, timeoutMs);
    if (req.abortSignal) {
      const onAbort = () => {
        try {
          proc.kill("SIGTERM");
        } catch {
          /* noop */
        }
      };
      if (req.abortSignal.aborted) onAbort();
      else req.abortSignal.addEventListener("abort", onAbort, { once: true });
    }

    let stdout = "";
    let stderr = "";
    let brokenPipe = false;
    try {
      try {
        proc.stdin.write(req.userMessage);
        await proc.stdin.end();
      } catch (err) {
        // EPIPE on a large payload + fast-exit child: subprocess closed stdin
        // before draining the FileSink buffer. The proc is already dead; we can
        // still read whatever stdout/stderr it managed to emit.
        if (!isBrokenPipe(err)) throw err;
        brokenPipe = true;
      }

      [stdout, stderr] = await Promise.all([
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text(),
      ]);
      await proc.exited;
    } finally {
      clearTimeout(killer);
    }

    const latencyMs = Date.now() - startedAt;
    const exitCode = proc.exitCode;

    // Case 1: broken pipe + empty stdout = fast-empty exit.
    if (brokenPipe && !stdout.trim()) {
      return this.emptyResult({
        cause: "broken_pipe",
        latencyMs,
        model,
        stderr,
        errorMessage:
          `broken pipe — subprocess exited before reading stdin; ` +
          `exit=${exitCode}; stderr=${stderr.slice(0, 500)}`,
      });
    }

    // Case 2: empty stdout + latency ≥ timeout window = silent SIGTERM.
    if (!stdout.trim() && isSilentTimeout(0, latencyMs, timeoutMs)) {
      return this.emptyResult({
        cause: "silent_timeout",
        latencyMs,
        model,
        stderr,
        errorMessage:
          `silent timeout — subprocess returned no stdout after ${latencyMs}ms ` +
          `(timeout=${timeoutMs}ms); exit=${exitCode}; stderr=${stderr.slice(0, 500)}`,
      });
    }

    // Case 3: parse the JSON envelope.
    let parsed: ClaudeJsonResult | null = null;
    try {
      parsed = JSON.parse(stdout) as ClaudeJsonResult;
    } catch (err) {
      return this.errorResult({
        cause: "bad_json",
        latencyMs,
        model,
        stderr,
        errorMessage:
          `bad JSON from claude CLI: ${(err as Error).message}; ` +
          `stdout=${stdout.slice(0, 200)}; stderr=${stderr.slice(0, 200)}`,
        partialText: stdout || null,
      });
    }

    if (parsed.is_error) {
      return {
        text: parsed.result ?? "",
        inputTokens: parsed.usage?.input_tokens ?? 0,
        outputTokens: parsed.usage?.output_tokens ?? 0,
        costUsd: parsed.total_cost_usd ?? 0,
        latencyMs,
        sessionId: parsed.session_id ?? null,
        model,
        vendorId: VENDOR_ID,
        finishReason: "error",
        cause: "unknown",
        errorMessage:
          `claude error (api_status=${parsed.api_error_status ?? "n/a"}): ` +
          (parsed.result ?? "claude reported error"),
        stderr,
      };
    }

    // Success.
    return {
      text: parsed.result,
      inputTokens: parsed.usage?.input_tokens ?? 0,
      outputTokens: parsed.usage?.output_tokens ?? 0,
      costUsd: parsed.total_cost_usd ?? 0,
      latencyMs,
      sessionId: parsed.session_id ?? null,
      model,
      vendorId: VENDOR_ID,
      finishReason: "stop",
    };
  }

  private async streamPath(
    req: VendorCompletionRequest,
  ): Promise<VendorCompletionResult> {
    const model = req.model || DEFAULT_MODEL;
    const args = [
      "--print",
      "--output-format",
      "stream-json",
      "--input-format",
      "text",
      "--verbose",
      "--include-partial-messages",
      "--model",
      model,
      "--system-prompt",
      req.systemPrompt,
      "--exclude-dynamic-system-prompt-sections",
      "--strict-mcp-config",
      ...toolGatingArgs(),
      ...(req.resumeSessionId ? ["--resume", req.resumeSessionId] : []),
      ...(req.extraArgs ?? []),
    ];

    const startedAt = Date.now();
    const proc = bunRT.spawn(["claude", ...args], {
      env: makeEnv(),
      stdin: "pipe",
      stdout: "pipe",
      stderr: "pipe",
    });

    const timeoutMs = (req.timeoutSec ?? DEFAULT_STREAM_TIMEOUT_SEC) * 1000;
    const killer = setTimeout(() => {
      try {
        proc.kill("SIGTERM");
      } catch {
        /* noop */
      }
    }, timeoutMs);
    if (req.abortSignal) {
      const onAbort = () => {
        try {
          proc.kill("SIGTERM");
        } catch {
          /* noop */
        }
      };
      if (req.abortSignal.aborted) onAbort();
      else req.abortSignal.addEventListener("abort", onAbort, { once: true });
    }

    let brokenPipe = false;
    try {
      proc.stdin.write(req.userMessage);
      await proc.stdin.end();
    } catch (err) {
      if (!isBrokenPipe(err)) {
        clearTimeout(killer);
        throw err;
      }
      brokenPipe = true;
    }

    let fullText = "";
    let inputTokens = 0;
    let outputTokens = 0;
    let costUsd = 0;
    let sessionId: string | null = null;
    let errored = false;
    let errorMessage: string | undefined;
    let apiErrorStatus: number | undefined;

    try {
      for await (const evt of readJsonLines(proc.stdout)) {
        const ev = evt as ClaudeStreamEvent;
        if (!ev?.type) continue;

        // system/init fires before any inference — carries session_id. Capture
        // and notify the caller immediately so the id can be persisted for
        // retry resumption even if the call later fails.
        if (ev.type === "system" && ev.subtype === "init" && ev.session_id) {
          sessionId = ev.session_id;
          if (req.onSessionId) {
            try {
              await req.onSessionId(ev.session_id);
            } catch {
              /* notify-failure is non-fatal */
            }
          }
          continue;
        }

        if (ev.type === "rate_limit_event") {
          continue;
        }

        if (ev.type === "stream_event" && ev.event) {
          if (
            ev.event.type === "content_block_delta" &&
            ev.event.delta?.type === "text_delta" &&
            typeof ev.event.delta.text === "string"
          ) {
            const tok = ev.event.delta.text;
            fullText += tok;
            if (req.streamKey) {
              await publishStream(req.streamKey, { type: "token", text: tok });
            }
          }
          continue;
        }

        if (ev.type === "result") {
          if (ev.is_error) {
            errored = true;
            apiErrorStatus = ev.api_error_status;
            errorMessage =
              ev.result ??
              `claude error (status=${ev.api_error_status ?? "n/a"})`;
            if (req.streamKey) {
              await publishStream(req.streamKey, {
                type: "error",
                message: errorMessage,
              });
            }
          } else {
            inputTokens = ev.usage?.input_tokens ?? 0;
            outputTokens = ev.usage?.output_tokens ?? 0;
            costUsd = ev.total_cost_usd ?? 0;
            sessionId = sessionId ?? ev.session_id ?? null;
            // If we never got partial deltas (flag misbehaved), use result text.
            if (!fullText && ev.result) {
              fullText = ev.result;
              if (req.streamKey) {
                await publishStream(req.streamKey, {
                  type: "token",
                  text: ev.result,
                });
              }
            }
          }
          break;
        }
      }

      await proc.exited;
    } finally {
      clearTimeout(killer);
    }

    const latencyMs = Date.now() - startedAt;

    let stderrText: string | undefined;
    if (brokenPipe) {
      try {
        stderrText = await new Response(proc.stderr).text();
      } catch {
        /* stderr drain failure is non-fatal */
      }
    }

    if (errored) {
      return {
        text: fullText,
        inputTokens,
        outputTokens,
        costUsd,
        latencyMs,
        sessionId,
        model,
        vendorId: VENDOR_ID,
        finishReason: "error",
        cause: "unknown",
        errorMessage:
          errorMessage ?? `claude error (status=${apiErrorStatus ?? "n/a"})`,
        stderr: stderrText,
      };
    }

    if (brokenPipe && outputTokens === 0) {
      return this.emptyResult({
        cause: "broken_pipe",
        latencyMs,
        model,
        stderr: stderrText,
        sessionId,
        errorMessage:
          `broken pipe — subprocess exited before reading stdin; ` +
          `exit=${proc.exitCode}; stderr=${(stderrText ?? "").slice(0, 500)}`,
      });
    }

    if (isSilentTimeout(outputTokens, latencyMs, timeoutMs)) {
      return this.emptyResult({
        cause: "silent_timeout",
        latencyMs,
        model,
        stderr: stderrText,
        sessionId,
        errorMessage:
          `silent timeout — stream produced 0 tokens after ${latencyMs}ms ` +
          `(timeout=${timeoutMs}ms)`,
      });
    }

    return {
      text: fullText,
      inputTokens,
      outputTokens,
      costUsd,
      latencyMs,
      sessionId,
      model,
      vendorId: VENDOR_ID,
      finishReason: "stop",
      stderr: stderrText,
    };
  }

  private emptyResult(opts: {
    cause: Extract<ErrorCause, "silent_timeout" | "broken_pipe">;
    latencyMs: number;
    model: string;
    stderr?: string;
    errorMessage: string;
    sessionId?: string | null;
  }): VendorCompletionResult {
    return {
      text: "",
      inputTokens: 0,
      outputTokens: 0,
      costUsd: 0,
      latencyMs: opts.latencyMs,
      sessionId: opts.sessionId ?? null,
      model: opts.model,
      vendorId: VENDOR_ID,
      finishReason: "empty",
      cause: opts.cause,
      errorMessage: opts.errorMessage,
      stderr: opts.stderr,
    };
  }

  private errorResult(opts: {
    cause: ErrorCause;
    latencyMs: number;
    model: string;
    stderr?: string;
    errorMessage: string;
    partialText: string | null;
  }): VendorCompletionResult {
    return {
      text: opts.partialText ?? "",
      inputTokens: 0,
      outputTokens: 0,
      costUsd: 0,
      latencyMs: opts.latencyMs,
      sessionId: null,
      model: opts.model,
      vendorId: VENDOR_ID,
      finishReason: "error",
      cause: opts.cause,
      errorMessage: opts.errorMessage,
      stderr: opts.stderr,
    };
  }
}

async function* readJsonLines(
  stream: ReadableStream<Uint8Array>,
): AsyncGenerator<unknown, void, void> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let nl;
      while ((nl = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);
        if (!line) continue;
        try {
          yield JSON.parse(line);
        } catch {
          /* skip malformed line */
        }
      }
    }
    if (buffer.trim()) {
      try {
        yield JSON.parse(buffer);
      } catch {
        /* ignore */
      }
    }
  } finally {
    reader.releaseLock();
  }
}

export const claudeCliVendor: AiVendor = new ClaudeCliVendor();
