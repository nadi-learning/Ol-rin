/**
 * probe_ai_call_log — exit gate for the AI forensics table (2026-07-16).
 *
 * The table exists because prod authoring stalled and left NO durable trace: both
 * attempts died on "The operation timed out." with no thinking count and no
 * elapsed time. Diagnosis needed a replay of a brief that happened to be stored
 * on another row. This probe proves the table would have caught that incident.
 *
 * FIRM (the plumbing we control):
 *   1. A board-less write LANDS. This is the whole design point — geminiJson has
 *      no board claim, so a tenant-scoped WITH CHECK policy would have REJECTED
 *      exactly the rows worth having. If this fails, the table is RLS'd and the
 *      forensics are a lie.
 *   2. A board-attributed row is readable WITHOUT a board claim (global table —
 *      cross-board debugging works; a tenant table would hide it).
 *   3. The timeout shape round-trips: ok=false + latency_ms + timeout_ms +
 *      finish_reason='timeout' — i.e. the exact row today's incident lacked.
 *   4. thinking_tokens round-trips — the runaway axis (normal 6–9k; one prod call
 *      hit 62,910). Starkhorn's table has no such column.
 *   5. FAULT ISOLATION: a doomed write (bogus user FK) does NOT throw. A
 *      forensics insert must never break the AI call it observes.
 *   6. THE REAL PATH writes a row. Claims 1–5 drive logAiCall() directly, which
 *      is NOT proof: the first cut of this probe passed all of them while a real
 *      geminiJson call logged NOTHING (the insert was fire-and-forget and lost
 *      the race against process exit). Only driving the actual wrapper catches
 *      that, so this claim uses a REAL — but tiny/cheap — Gemini call.
 *
 * Runs as the app role (DATABASE_URL → b2c_app, NON-superuser) — otherwise the
 * RLS-related claims would pass vacuously (M11).
 */
import { Type } from "@google/genai";
import { eq, sql } from "drizzle-orm";
import { aiCallLog, board } from "@b2c/kernel/schema";
import { db, queryClient } from "../src/db/client";
import { geminiJson } from "../src/services/ai/gemini";
import { logAiCall } from "../src/services/ai_log";
import { env } from "../src/config/env";

let passed = 0;
let failed = 0;
function check(name: string, ok: boolean, detail?: string) {
  if (ok) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

async function main() {
  // Precondition (M11): a superuser would bypass RLS and make claim 1 vacuous.
  const superRows = await db.execute<{ superuser: boolean }>(
    sql`SELECT usesuper AS superuser FROM pg_user WHERE usename = current_user`,
  );
  const superuser = superRows[0]?.superuser;
  check(
    "precondition: connected as a NON-superuser role",
    superuser === false,
    `usesuper=${superuser}`,
  );

  const [boardRow] = await db.select({ id: board.id }).from(board).limit(1);
  if (!boardRow) throw new Error("no board rows — seed first");

  const stamp = `probe-${process.pid}-${passed}`;

  // ── 1. Board-less write lands (the design point) ────────────────────────────
  const boardlessEndpoint = `${stamp}:boardless`;
  await logAiCall({
    endpoint: boardlessEndpoint,
    model: "gemini-3.5-flash",
    vendorId: "gemini_api",
    latencyMs: 116_000,
    ok: true,
    thinkingTokens: 8_996,
  });
  const boardless = await db
    .select()
    .from(aiCallLog)
    .where(eq(aiCallLog.endpoint, boardlessEndpoint));
  check("1. a board-less write LANDS (no RLS blocking geminiJson's path)", boardless.length === 1);

  // ── 2. Board-attributed row readable with NO board claim ────────────────────
  const attributedEndpoint = `${stamp}:attributed`;
  await logAiCall({
    boardId: boardRow.id,
    endpoint: attributedEndpoint,
    model: "gemini-3.5-flash",
    latencyMs: 35_000,
    ok: true,
  });
  const attributed = await db
    .select()
    .from(aiCallLog)
    .where(eq(aiCallLog.endpoint, attributedEndpoint));
  check(
    "2. a board-attributed row is readable WITHOUT a board claim (global table)",
    attributed.length === 1 && attributed[0]!.boardId === boardRow.id,
  );

  // ── 3. The timeout row — the shape today's incident needed ──────────────────
  const timeoutEndpoint = `${stamp}:timeout`;
  await logAiCall({
    endpoint: timeoutEndpoint,
    model: "gemini-3.5-flash",
    vendorId: "gemini_api",
    latencyMs: 300_000,
    timeoutMs: 300_000,
    ok: false,
    finishReason: "timeout",
    errorCause: "silent_timeout",
    errorMessage: "The operation timed out.",
    promptIn: "=== SYSTEM ===\n(pack)\n\n=== USER ===\n(brief)",
    attempt: 1,
  });
  const [timeoutRow] = await db
    .select()
    .from(aiCallLog)
    .where(eq(aiCallLog.endpoint, timeoutEndpoint));
  check(
    "3. the TIMED-OUT row round-trips (ok=false + latency + timeout + prompt)",
    !!timeoutRow &&
      timeoutRow.ok === false &&
      timeoutRow.latencyMs === 300_000 &&
      timeoutRow.timeoutMs === 300_000 &&
      timeoutRow.finishReason === "timeout" &&
      (timeoutRow.promptIn?.length ?? 0) > 0,
  );

  // ── 4. thinking_tokens — the runaway axis ───────────────────────────────────
  check(
    "4. thinking_tokens round-trips (the 62,910-token runaway would be visible)",
    boardless[0]?.thinkingTokens === 8_996,
    `got ${boardless[0]?.thinkingTokens}`,
  );

  // ── 5. Fault isolation — a doomed write must NOT throw ──────────────────────
  let threw = false;
  try {
    await logAiCall({
      endpoint: `${stamp}:doomed`,
      model: "x",
      latencyMs: 1,
      ok: true,
      // Bogus FK — app_user has no such row. The insert MUST fail internally.
      userId: "00000000-0000-0000-0000-000000000000",
    });
  } catch {
    threw = true;
  }
  const doomed = await db
    .select()
    .from(aiCallLog)
    .where(eq(aiCallLog.endpoint, `${stamp}:doomed`));
  check("5. a doomed forensics write does NOT throw (never breaks the AI call)", !threw);
  check("5b. …and the doomed row is genuinely absent (the FK really did reject)", doomed.length === 0);

  // ── 6. THE REAL PATH (SOFT — needs a key; skipped without one) ──────────────
  // The claim that matters. A tiny prompt keeps it cheap; we assert the ROW, not
  // the answer. This is what caught the fire-and-forget drop.
  const realEndpoint = `${stamp}:real`;
  if (!env.GEMINI_API_KEY) {
    console.log("  — 6. real geminiJson row: SKIPPED (no GEMINI_API_KEY)");
  } else {
    await geminiJson<{ answer: string }>({
      label: realEndpoint,
      systemInstruction: "Reply with JSON only.",
      prompt: "Return {\"answer\":\"ok\"}",
      responseSchema: {
        type: Type.OBJECT,
        properties: { answer: { type: Type.STRING } },
        required: ["answer"],
      } as never,
      maxOutputTokens: 512,
    });
    const [realRow] = await db
      .select()
      .from(aiCallLog)
      .where(eq(aiCallLog.endpoint, realEndpoint));
    check(
      "6. a REAL geminiJson call writes its row (not lost to fire-and-forget)",
      !!realRow && realRow.ok === true && realRow.vendorId === "gemini_api",
    );
    check(
      "6b. …with latency + prompt_in captured from the live call",
      (realRow?.latencyMs ?? 0) > 0 && (realRow?.promptIn?.length ?? 0) > 0,
    );
    await db.delete(aiCallLog).where(eq(aiCallLog.endpoint, realEndpoint));
  }

  // cleanup
  for (const ep of [boardlessEndpoint, attributedEndpoint, timeoutEndpoint]) {
    await db.delete(aiCallLog).where(eq(aiCallLog.endpoint, ep));
  }

  console.log(`\nprobe_ai_call_log: ${passed} passed, ${failed} failed`);
  await queryClient.end();
  process.exit(failed === 0 ? 0 : 1);
}

main().catch(async (err) => {
  console.error("probe_ai_call_log FAILED:", err);
  await queryClient.end();
  process.exit(1);
});
