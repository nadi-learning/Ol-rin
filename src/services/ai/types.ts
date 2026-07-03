// AI vendor abstraction — types only.
//
// Ported VERBATIM from Starkhorn (nadi-backend/src/services/ai/types.ts) for
// the AUTH-v2 conversational authoring slice (the user's directive: port the
// chat plumbing exactly as nadi-backend, nothing reinvented). One interface,
// multiple vendor implementations. Callers depend on this module (or the
// orchestrator in services/ai_client.ts) — never on a vendor directly. Adding a
// new vendor = adding a file under vendors/ + a registry entry; zero service
// changes.
//
// b2c note: the tool fields (ToolSpec/ToolCall/ToolResultIn/ToolUseEvent + the
// req.tools/toolResults/toolChoice/mode/agentic fields) are carried over for
// shape-fidelity but are UNUSED in b2c — fork 4 makes question authoring a
// separate structured call, so the chat never sets req.tools. They are type-only
// and harmless; kept so the vendor bodies port verbatim.

export type VendorId = "claude_cli" | "gemini_api" | (string & {});

/**
 * Normalized tool declaration. Maps onto Gemini's Function_2 ({type:'function',
 * name, description, parameters}); Claude path ignores `tools` entirely.
 * `inputSchemaJson` is a JSON Schema object (e.g. from zod-to-json-schema).
 */
export interface ToolSpec {
  name: string;
  description: string;
  inputSchemaJson: Record<string, unknown>;
}

/**
 * Normalized representation of a tool call the model produced. Vendors map
 * their native function_call shape onto this — Gemini's FunctionCallStep
 * yields `{id, name, args}` directly.
 */
export interface ToolCall {
  /** Vendor-issued call id. Echoed back on the follow-up tool result. */
  id: string;
  name: string;
  args: Record<string, unknown>;
}

/**
 * Caller-provided tool result for a follow-up turn. The orchestrator hands it
 * to the vendor as the next call's input alongside `resumeSessionId`. Gemini
 * maps it onto a FunctionResultStep in the input array.
 */
export interface ToolResultIn {
  /** Must match the ToolCall.id from the prior response. */
  callId: string;
  name: string;
  /** Free-form result. Vendors stringify or pass through depending on the API. */
  result: unknown;
  isError?: boolean;
}

/**
 * Tool-use event emitted by the agentic Claude vendor (mode: 'agentic'). Unused
 * in b2c (no agentic mode here); carried for shape-fidelity with the verbatim
 * vendor port.
 *
 *  - tool_use     : Claude is about to invoke a tool (Read/Write/Edit/Glob/Grep).
 *  - tool_result  : the tool returned. `isError` set when the tool failed.
 */
export interface ToolUseEvent {
  type: "tool_use" | "tool_result";
  /** Tool name (e.g. "Write", "Read"). Present on both event types. */
  toolName: string;
  /** Stable id linking a tool_use to its corresponding tool_result. */
  toolUseId: string;
  /** Tool input — present on tool_use; shape depends on the tool. */
  input?: unknown;
  /** Tool output — present on tool_result. Often a string; may be structured. */
  output?: unknown;
  /** Set on tool_result when the tool reported an error. */
  isError?: boolean;
  /** Unix ms when the vendor saw the event. */
  timestamp: number;
}

/**
 * Normalized terminal state per call. Vendors map their native termination
 * signals onto this enum so callers and forensics see one taxonomy.
 *
 *  - stop    : model produced output and finished normally.
 *  - length  : hit max_tokens / output cap.
 *  - timeout : wall-clock timeout from the vendor's side.
 *  - empty   : produced zero output tokens (silent_timeout or broken_pipe).
 *  - error   : vendor-level error (rate limit, auth, network, …).
 */
export type FinishReason = "stop" | "length" | "timeout" | "empty" | "error";

/**
 * Normalized failure-cause taxonomy. Populated when finishReason !== "stop".
 * Vendors map their native errors (EPIPE, HTTP 429, etc.) onto this enum.
 */
export type ErrorCause =
  | "silent_timeout" // claude CLI: SIGTERM with 0 output tokens
  | "broken_pipe" // claude CLI: EPIPE on stdin (oversized payload + fast-exit child)
  | "stream_cutoff" // partial stream — output tokens > 0 but text << expected
  | "rate_limit" // 429 / OAuth account cap / per-minute key cap
  | "quota_exceeded" // 403 quota / daily cap
  | "bad_json" // CLI didn't return parseable JSON envelope
  | "auth_failed" // OAuth expired / invalid key
  | "network" // transport error
  | "unknown";

/** A base64 image part for a multimodal turn. Unused in b2c (no image turns). */
export interface VendorImagePart {
  mimeType: string;
  data: string;
}

/**
 * Vendor-uniform request shape. The vendor maps these fields onto its native
 * API:
 *
 *  - ClaudeCliVendor:  systemPrompt → --system-prompt, userMessage → stdin,
 *                      resumeSessionId → --resume <id>.
 *  - GeminiApiVendor:  systemPrompt → system_instruction, userMessage → input,
 *                      resumeSessionId → previous_interaction_id.
 *
 * For chat resume, callers persist `result.sessionId` after each turn and pass
 * it back via `resumeSessionId` on the next turn. The vendor decides whether to
 * honor it (Claude needs the JSONL on disk; Gemini just hands it to the API).
 */
export interface VendorCompletionRequest {
  systemPrompt: string;
  userMessage: string;
  /** Image parts attached to THIS turn. Only the Gemini vendor consumes them. */
  images?: VendorImagePart[];
  /** External abort handle for user-initiated "Stop". */
  abortSignal?: AbortSignal;
  /** Vendor-native model id ("sonnet", "haiku", "gemini-3-flash-preview", …). */
  model: string;
  /** Slot label persisted for forensics ("authoring.chat" …). */
  endpoint: string;
  userId?: string | null;
  workspaceId?: string | null;
  /** Wall-clock seconds before the vendor must terminate the call. Vendor-defaulted when omitted. */
  timeoutSec?: number;
  /**
   * Opaque continuation handle from a prior turn. Vendor-private semantics —
   * the orchestrator never inspects it. Vendors that don't support resume
   * (or that detect a fingerprint mismatch) silently ignore it.
   */
  resumeSessionId?: string;
  /**
   * sha256(systemPrompt || slotId). Vendors compare against the per-thread
   * fingerprint persisted alongside resumeSessionId; mismatch → fall back to
   * fresh / stitched-history path.
   */
  sessionFingerprint?: string;
  /** Slot id. Populated by the orchestrator from req.endpoint when known. */
  slotId?: string;
  /**
   * Explicit vendor selection. When set, the orchestrator routes this call to
   * the named vendor regardless of slot defaults. Used by the per-thread vendor
   * toggle and by probes that exercise a specific vendor.
   */
  vendorId?: VendorId;
  /**
   * Fired as soon as the vendor receives its continuation handle (Claude's
   * system/init event, Gemini's interaction.id). Used to persist the id for
   * retry resumption.
   */
  onSessionId?: (sessionId: string) => Promise<void> | void;
  /**
   * SSE bus identifier. When set, the vendor publishes per-token deltas to
   * `nadi:stream:<streamKey>` for the FE to render live.
   */
  streamKey?: string;
  /** Vendor-specific escape hatch. Claude CLI uses this for `--add-dir <imagesDir>`. */
  extraArgs?: string[];
  /** Lift the native Read tool out of the Claude denylist for an image-embed turn. Unused in b2c. */
  allowImageRead?: boolean;
  /** Tool declarations the model may call. Unused in b2c (fork 4: separate structured call). */
  tools?: ToolSpec[];
  /** Tool results for the FOLLOW-UP turn. Unused in b2c. */
  toolResults?: ToolResultIn[];
  /** Force tool-calling behavior on this turn. Unused in b2c. */
  toolChoice?: "auto" | "any" | "none" | "validated";
  /** Vendor-mode selector. "agentic" routes Claude through the file-editing path. Unused in b2c. */
  mode?: "agentic";
  /** Absolute cwd for the agentic Claude subprocess. Unused in b2c. */
  workingDir?: string;
  /** Per-event callback for agentic tool-use events. Unused in b2c. */
  onToolEvent?: (event: ToolUseEvent) => void;
  /** Bash command prefixes the agentic Claude may run. Unused in b2c. */
  allowedBashCommands?: string[];
}

/**
 * Vendor-uniform result. Vendors return this on EVERY non-exception path.
 * Exceptions are reserved for unexpected failures (spawn errors, SDK crashes);
 * the orchestrator catches those, logs, and rethrows.
 */
export interface VendorCompletionResult {
  text: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  latencyMs: number;
  /** The vendor's continuation handle for the next turn. Null if stateless / failed early. */
  sessionId: string | null;
  model: string;
  vendorId: VendorId;
  finishReason: FinishReason;
  /** Set when finishReason !== "stop". */
  cause?: ErrorCause;
  /** Set when finishReason === "error" — vendor's native error string. */
  errorMessage?: string;
  /** Vendor-raw diagnostic; not consumed by callers. */
  stderr?: string;
  /** Stamped by the orchestrator; persist alongside sessionId for resume validation. */
  sessionFingerprint?: string;
  /** Function calls the model emitted, normalized across vendors. Unused in b2c. */
  toolCalls?: ToolCall[];
}

export interface AiVendor {
  readonly id: VendorId;
  complete(req: VendorCompletionRequest): Promise<VendorCompletionResult>;
}
