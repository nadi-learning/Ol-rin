/**
 * inspect_ai_session — forensics for one AI call by its vendor session id.
 *
 * Run ON THE BOX (uses the box .env DATABASE_URL → prod RDS `b2c`):
 *   bun run scripts/inspect_ai_session.ts v1_ChdfbTVn...
 *
 * Prints:
 *  1. every ai_call_log row for that ai_session_id (the call itself),
 *  2. the surrounding authoring.chat FAILURES in a ±5-min window (catches the
 *     "two errors back-to-back" — the retry, which has its OWN session id),
 *  3. the tutor (app_user) each row is attributed to.
 *
 * Read-only. No writes, no mutation.
 */
import { sql } from "drizzle-orm";
import { db, queryClient } from "../src/db/client";

const sessionId = process.argv[2];
if (!sessionId) {
  console.error("usage: bun run scripts/inspect_ai_session.ts <ai_session_id>");
  process.exit(1);
}

function fmt(rows: Record<string, unknown>[]) {
  for (const r of rows) {
    console.log("─".repeat(80));
    for (const [k, v] of Object.entries(r)) {
      const val =
        typeof v === "string" && v.length > 300 ? `${v.slice(0, 300)}… (${v.length} chars)` : v;
      console.log(`  ${k.padEnd(18)} ${val ?? "∅"}`);
    }
  }
}

async function main() {
  // 1. The row(s) for this exact session id.
  const direct = await db.execute(sql`
    select l.created_at, l.endpoint, l.vendor_id, l.model, l.ok,
           l.finish_reason, l.error_cause, l.error_message,
           l.latency_ms, l.timeout_ms, l.tokens_in, l.tokens_out,
           l.thinking_tokens, l.attempt, l.ai_session_id,
           u.email as user_email,
           length(l.prompt_in)  as prompt_in_len,
           length(l.prompt_out) as prompt_out_len
    from ai_call_log l
    left join app_user u on u.id = l.user_id
    where l.ai_session_id = ${sessionId}
    order by l.created_at
  `);
  console.log(`\n=== ai_call_log rows for ai_session_id = ${sessionId} (${direct.length}) ===`);
  fmt(direct as unknown as Record<string, unknown>[]);

  if (direct.length === 0) {
    console.log(
      "\n(no row with that session id — it may be an interaction id the stream dropped before logging; check the window below)",
    );
  }

  // Anchor time = the matched row, else now. Widen to catch the retry row, which
  // carries a DIFFERENT session id but lands in the same few seconds.
  const anchor = (direct[0] as { created_at?: Date } | undefined)?.created_at;
  const window = await db.execute(sql`
    select l.created_at, l.endpoint, l.vendor_id, l.ok, l.finish_reason,
           l.error_cause, l.error_message, l.latency_ms, l.tokens_out,
           l.attempt, l.ai_session_id, u.email as user_email
    from ai_call_log l
    left join app_user u on u.id = l.user_id
    where l.endpoint = 'authoring.chat'
      and l.ok = false
      ${anchor ? sql`and l.created_at between ${anchor}::timestamptz - interval '5 minutes'
                                          and ${anchor}::timestamptz + interval '5 minutes'` : sql`and l.created_at > now() - interval '2 days'`}
    order by l.created_at
  `);
  console.log(
    `\n=== authoring.chat FAILURES ${anchor ? "±5min around that call" : "(last 2 days)"} (${window.length}) ===`,
  );
  fmt(window as unknown as Record<string, unknown>[]);

  // Cause breakdown for authoring.chat over the last week — is this systemic?
  const causes = await db.execute(sql`
    select date_trunc('day', created_at) as day, ok, finish_reason, error_cause,
           count(*) as n, round(avg(latency_ms)) as avg_ms
    from ai_call_log
    where endpoint = 'authoring.chat' and created_at > now() - interval '7 days'
    group by 1,2,3,4 order by 1 desc, n desc
  `);
  console.log(`\n=== authoring.chat outcomes, last 7 days ===`);
  fmt(causes as unknown as Record<string, unknown>[]);

  await queryClient.end();
}

main().catch(async (e) => {
  console.error("inspect_ai_session FAILED:", e);
  await queryClient.end();
  process.exit(1);
});
