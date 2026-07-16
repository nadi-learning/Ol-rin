/**
 * ai_call_log writer — the forensics spine for every AI call.
 *
 * ONE writer, used by BOTH vendor paths:
 *   - services/ai/gemini.ts  `geminiJson()`  — the structured-JSON path (9 services)
 *   - services/ai_client.ts  `complete()`    — the vendor abstraction (CLI + gemini)
 * Either path alone leaves a blind spot: the 2026-07-16 authoring stall happened
 * on the geminiJson path and produced no [ai_client] line at all.
 *
 * Two hard rules:
 *  1. BEST-EFFORT — a logging failure must NEVER break the AI call it observes
 *     (mirrors enqueueStage1Scoring's fault isolation). Failures go to stderr so
 *     a broken logger is visible rather than silent.
 *  2. LOG BOTH OUTCOMES — success AND failure. The failure path is the one that
 *     matters; today's incident was invisible precisely because the error path
 *     recorded no latency and no token usage.
 *
 * The table is GLOBAL (no RLS) by founder call — see the schema comment. The
 * write therefore uses the plain `db` handle and needs no board claim, which is
 * what lets a board-less geminiJson call still land a row.
 */
import { aiCallLog } from "@b2c/kernel/schema";
import { db } from "../db/client";

export interface AiLogRow {
  boardId?: string | null;
  userId?: string | null;
  endpoint: string;
  model: string;
  vendorId?: string | null;
  slotId?: string | null;
  tokensIn?: number | null;
  tokensOut?: number | null;
  thinkingTokens?: number | null;
  latencyMs: number;
  timeoutMs?: number | null;
  ok: boolean;
  finishReason?: string | null;
  errorCause?: string | null;
  errorMessage?: string | null;
  promptIn?: string | null;
  promptOut?: string | null;
  aiSessionId?: string | null;
  sessionFingerprint?: string | null;
  attempt?: number | null;
}

/**
 * Append one ai_call_log row. Never throws — a forensics write losing to the work
 * it observes would be exactly backwards.
 */
export async function logAiCall(row: AiLogRow): Promise<void> {
  try {
    await db.insert(aiCallLog).values({
      boardId: row.boardId ?? null,
      userId: row.userId ?? null,
      endpoint: row.endpoint,
      model: row.model,
      vendorId: row.vendorId ?? null,
      slotId: row.slotId ?? null,
      tokensIn: row.tokensIn ?? null,
      tokensOut: row.tokensOut ?? null,
      thinkingTokens: row.thinkingTokens ?? null,
      latencyMs: row.latencyMs,
      timeoutMs: row.timeoutMs ?? null,
      ok: row.ok,
      finishReason: row.finishReason ?? null,
      errorCause: row.errorCause ?? null,
      errorMessage: row.errorMessage ?? null,
      promptIn: row.promptIn ?? null,
      promptOut: row.promptOut ?? null,
      aiSessionId: row.aiSessionId ?? null,
      sessionFingerprint: row.sessionFingerprint ?? null,
      attempt: row.attempt ?? null,
    });
  } catch (err) {
    console.error(
      `[ai_log] failed to write ai_call_log row for ${row.endpoint} (non-fatal): ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }
}

/** Render system + user as one replayable blob (mirrors Starkhorn's formatPromptIn). */
export function formatPromptIn(systemPrompt: string, userMessage: string): string {
  return `=== SYSTEM ===\n${systemPrompt}\n\n=== USER ===\n${userMessage}`;
}
