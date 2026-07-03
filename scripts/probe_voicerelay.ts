/**
 * probe_voicerelay — Slice VOICE-2a exit gate (the Gemini Live relay).
 *
 * Drives the REAL `VoiceRelay` class against REAL Gemini Live + a REAL DB, with a
 * fake browser socket — no HTTP/WS server, no mic (the over-the-wire WS handshake
 * + browser audio are VOICE-2b's authed-smoke + eyeball). A deterministic TEXT
 * turn stands in for spoken input: Gemini Live still answers with AUDIO + an
 * output transcription, which is exactly the bidirectional path + server-side
 * transcript capture we need to prove.
 *
 * Throwaway fixture (boards P/Q, M22), full cleanup. Two-tier (don't over-read
 * one AI response):
 *   FIRM — plumbing we own: grounding → systemPrompt, ownership guard, the relay
 *     opens Live (ready), model AUDIO is relayed back to the socket, the server
 *     captures a TUTOR transcript turn, finalize persists (voice_session
 *     completed + transcript + event_log) from the SERVER-captured turns, BLIND
 *     (no mastery), and the persisted turns == relay.capturedTurns.
 *   SOFT — the model's actual words / audio volume: log, never fail on them.
 *
 *   1. DB connectivity.
 *   2. resolveRelaySession → systemPrompt carries the slide grounding.
 *   3. OWNERSHIP: resolveRelaySession under a foreign user → VOICE_SESSION_NOT_FOUND.
 *   4. relay.start → 'ready' frame (Live socket opened with the grounded prompt).
 *   5. after a text turn: ≥1 AUDIO frame relayed to the socket (Gemini→browser).
 *   6. a TUTOR transcript was captured server-side (output transcription).
 *   7. the STUDENT text turn is in the captured turns.
 *   8. end → 'ended' frame + socket closed 1000.
 *   9. voice_session stamped: completed + transcriptId + endedAt.
 *  10. transcript row persisted (kind voice_tutoring); its turns == captured turns.
 *  11. event_log 'voice_session' row.
 *  12. BLIND: no mastery_state row.
 */
import { eq, sql } from "drizzle-orm";
import type { PgTransaction } from "drizzle-orm/pg-core";
import {
  appUser,
  board,
  chapter,
  contentUnit,
  contentVersion,
  eventLog,
  masteryState,
  subTopic,
  subject,
  topic,
  transcript,
  voiceSession,
} from "@b2c/kernel/schema";
import { db, queryClient } from "../src/db/client";
import { withBoard } from "../src/db/with-board";
import { __liveConfigured } from "../src/services/ai/gemini_live";
import {
  resolveRelaySession,
  startVoiceSession,
  VoiceSessionNotFoundError,
} from "../src/services/voice";
import {
  VoiceRelay,
  type RelayContext,
  type RelayServerFrame,
  type RelaySocket,
} from "../src/services/voice_relay";

type Tx = PgTransaction<any, any, any>;

let passed = 0;
let failed = 0;
function check(name: string, ok: boolean) {
  if (ok) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.error(`  ✗ ${name}`);
  }
}
function soft(name: string, value: unknown) {
  console.log(`  ~ [soft] ${name}: ${JSON.stringify(value)}`);
}

const VOICE_CONTEXT_TEXT =
  "A force is a push or a pull that can change an object's speed, direction, or shape. The newton (N) is the unit of force. Balanced forces produce no change in motion; unbalanced forces cause acceleration in the direction of the resultant force.";

/** A fake browser socket: records JSON control frames + counts binary audio. */
class FakeWS implements RelaySocket {
  jsonFrames: RelayServerFrame[] = [];
  audioFrames = 0;
  audioBytes = 0;
  closed = false;
  closeCode: number | undefined;
  send(data: string | ArrayBuffer | Uint8Array) {
    if (typeof data === "string") {
      this.jsonFrames.push(JSON.parse(data) as RelayServerFrame);
    } else {
      this.audioFrames++;
      this.audioBytes += data instanceof Uint8Array ? data.byteLength : data.byteLength;
    }
  }
  close(code?: number) {
    this.closed = true;
    this.closeCode = code;
  }
  hasFrame(pred: (f: RelayServerFrame) => boolean) {
    return this.jsonFrames.some(pred);
  }
}

async function waitFor(pred: () => boolean, timeoutMs: number, intervalMs = 250) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (pred()) return true;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return pred();
}

async function main() {
  if (!__liveConfigured()) {
    console.error("GEMINI_API_KEY not set — VOICE-2a probe needs real Gemini Live.");
    await queryClient.end();
    process.exit(1);
  }

  const tag = `${Date.now()}`;
  await db.execute(sql`select 1`);
  check("DB connectivity (select 1) as app role", true);

  const [P] = await db.insert(board).values({ slug: `vr-p-${tag}`, name: "Probe P" }).returning();
  const [Q] = await db.insert(board).values({ slug: `vr-q-${tag}`, name: "Probe Q" }).returning();
  if (!P || !Q) throw new Error("board seed failed");

  const emailA = `vr-a-${tag}@example.com`;
  const emailB = `vr-b-${tag}@example.com`;
  const [stuA] = await db.insert(appUser).values({ email: emailA, name: "Stu A" }).returning();
  const [stuB] = await db.insert(appUser).values({ email: emailB, name: "Stu B" }).returning();
  if (!stuA || !stuB) throw new Error("app_user seed failed");

  // Fixture under P: a slide_module content_version whose manifest slide-1 has
  // voice_context (→ st1).
  const fx = await withBoard(P.id, async (tx: Tx) => {
    const [subj] = await tx.insert(subject).values({ boardId: P.id, slug: "phys", name: "Physics", grade: "IGCSE" }).returning();
    const [chap] = await tx.insert(chapter).values({ boardId: P.id, subjectId: subj!.id, slug: "forces", name: "Forces & Motion", ordinal: 1 }).returning();
    const [tp] = await tx.insert(topic).values({ boardId: P.id, chapterId: chap!.id, slug: "forces-basics", name: "Forces basics", ordinal: 1 }).returning();
    const [st1] = await tx.insert(subTopic).values({ boardId: P.id, topicId: tp!.id, slug: "what-is-a-force", name: "What is a force", ordinal: 1, contentSlideKey: "slide-1" }).returning();

    const manifest = {
      module_id: "forces_mod",
      sections: [
        {
          id: "sec1",
          topics: [
            { id: "slide-1", title: "What is a force?", voice_context: { context: VOICE_CONTEXT_TEXT, keywords: ["force", "newton", "balanced", "unbalanced", "acceleration"] } },
          ],
        },
      ],
    };

    const [unit] = await tx.insert(contentUnit).values({ boardId: P.id, type: "slide_module", chapterId: chap!.id, subTopicId: null, source: "starkhorn" }).returning();
    const [ver] = await tx.insert(contentVersion).values({ contentUnitId: unit!.id, versionNo: 1, body: { manifest }, publishedAt: new Date() }).returning();
    await tx.update(contentUnit).set({ currentVersionId: ver!.id }).where(eq(contentUnit.id, unit!.id));

    return { st1: st1!.id, unitId: unit!.id };
  });

  // Create the active session the relay will operate on (the tRPC startSession path).
  const started = await withBoard(P.id, (tx: Tx) =>
    startVoiceSession(tx, { boardId: P.id, appUserId: stuA.id, subTopicId: fx.st1, mode: "overview" }),
  );

  // 2. resolveRelaySession → grounded prompt
  const info = await withBoard(P.id, (tx: Tx) => resolveRelaySession(tx, started.sessionId, stuA.id));
  check("resolveRelaySession → systemPrompt carries the slide grounding",
    info.systemPrompt.includes("What is a force?") && info.systemPrompt.includes("A force is a push or a pull") && info.systemPrompt.includes("newton"));

  // 3. OWNERSHIP — foreign user can't resolve A's session
  let owned = false;
  try {
    await withBoard(P.id, (tx: Tx) => resolveRelaySession(tx, started.sessionId, stuB.id));
  } catch (e) {
    owned = e instanceof VoiceSessionNotFoundError;
  }
  check("OWNERSHIP: resolveRelaySession under a foreign user → VOICE_SESSION_NOT_FOUND", owned);

  // ── Drive the relay against real Gemini Live ──
  const ctx: RelayContext = {
    boardId: P.id,
    appUserId: stuA.id,
    sessionId: started.sessionId,
    mode: "overview",
    systemPrompt: info.systemPrompt,
  };
  const relay = new VoiceRelay(ctx);
  const ws = new FakeWS();

  const t0 = Date.now();
  await relay.start(ws);
  check("relay.start → 'ready' frame (Live socket opened)", ws.hasFrame((f) => f.type === "ready"));
  if (ws.hasFrame((f) => f.type === "error")) {
    soft("relay error frame", ws.jsonFrames.find((f) => f.type === "error"));
  }

  // 4/5/6. Send a deterministic text turn → expect audio + a tutor transcript.
  await relay.onClientMessage(
    JSON.stringify({ type: "text", text: "In one or two sentences, what is a force?" }),
    ws,
  );
  // Wait for a FULL tutor turn: audio flowed AND the model completed its turn
  // (the relay emits status 'listening' on turnComplete). Falls back to whatever
  // was captured if the turn runs past the cap.
  const gotResponse = await waitFor(
    () =>
      ws.audioFrames > 0 &&
      ws.hasFrame((f) => f.type === "transcript" && f.role === "tutor") &&
      ws.hasFrame((f) => f.type === "status" && f.state === "listening"),
    60_000,
  );
  const latencyMs = Date.now() - t0;
  soft("first-response latency ms", latencyMs);
  soft("audio frames relayed", ws.audioFrames);
  soft("audio bytes relayed", ws.audioBytes);
  soft("tutor transcript (partials joined)",
    ws.jsonFrames.filter((f): f is Extract<RelayServerFrame, { type: "transcript" }> => f.type === "transcript" && f.role === "tutor").map((f) => f.text).join(""));

  check("bidirectional relay: ≥1 model AUDIO frame reached the socket", ws.audioFrames > 0);
  check("server captured a TUTOR transcript (output transcription)",
    ws.hasFrame((f) => f.type === "transcript" && f.role === "tutor"));
  if (!gotResponse) soft("WARN: timed out waiting for audio+tutor-transcript", true);

  // 7. the student text turn was recorded
  check("STUDENT text turn recorded in captured turns",
    relay.capturedTurns.some((t) => t.role === "student" && t.text.includes("what is a force")));

  // 8. end → finalize + ended frame + close
  await relay.onClientMessage(JSON.stringify({ type: "end" }), ws);
  check("end → 'ended' frame emitted", ws.hasFrame((f) => f.type === "ended"));
  check("end → socket closed with 1000", ws.closed && ws.closeCode === 1000);

  const capturedAfterEnd = relay.capturedTurns;
  soft("captured turns", capturedAfterEnd);

  // 9. voice_session stamped
  const rows = await withBoard(P.id, (tx: Tx) => tx.select().from(voiceSession).where(eq(voiceSession.id, started.sessionId)));
  const vs: any = rows[0];
  check("voice_session stamped: completed + transcriptId + endedAt",
    vs?.status === "completed" && !!vs?.transcriptId && !!vs?.endedAt);

  // 10. transcript persisted from the SERVER-captured turns
  const trs = await withBoard(P.id, (tx: Tx) => tx.select().from(transcript).where(eq(transcript.subTopicId, fx.st1)));
  const voiceTrs = trs.filter((t: any) => t.kind === "voice_tutoring");
  check("transcript row persisted (kind voice_tutoring)", voiceTrs.length === 1);
  const persistedTurns = (voiceTrs[0]?.body as any)?.turns ?? [];
  check("persisted transcript == server-captured turns (authoritative, not client)",
    persistedTurns.length === capturedAfterEnd.length &&
      persistedTurns.every((t: any, i: number) => t.role === capturedAfterEnd[i]!.role && t.text === capturedAfterEnd[i]!.text));
  check("persisted transcript contains a tutor turn (server-side transcription)",
    persistedTurns.some((t: any) => t.role === "tutor" && t.text.length > 0));

  // 11. event_log
  const evs = await withBoard(P.id, (tx: Tx) => tx.select().from(eventLog).where(eq(eventLog.subTopicId, fx.st1)));
  const voiceEv: any = evs.find((e: any) => e.eventType === "voice_session");
  check("event_log 'voice_session' row written", !!voiceEv && voiceEv.studentId === stuA.id);

  // 12. BLIND — no mastery move
  const mastery = await withBoard(P.id, (tx: Tx) => tx.select().from(masteryState).where(eq(masteryState.studentId, stuA.id)));
  check("BLIND: no mastery_state row written by the relay", mastery.length === 0);

  // ── cleanup (FK-safe) ──
  await withBoard(P.id, async (tx: Tx) => {
    await tx.delete(voiceSession).where(eq(voiceSession.boardId, P.id));
    await tx.delete(eventLog).where(eq(eventLog.boardId, P.id));
    await tx.delete(transcript).where(eq(transcript.boardId, P.id));
    await tx.delete(contentVersion).where(eq(contentVersion.contentUnitId, fx.unitId));
    await tx.delete(contentUnit).where(eq(contentUnit.boardId, P.id));
    await tx.delete(subTopic).where(eq(subTopic.boardId, P.id));
    await tx.delete(topic).where(eq(topic.boardId, P.id));
    await tx.delete(chapter).where(eq(chapter.boardId, P.id));
    await tx.delete(subject).where(eq(subject.boardId, P.id));
  });
  await db.delete(appUser).where(eq(appUser.email, emailA));
  await db.delete(appUser).where(eq(appUser.email, emailB));
  await db.delete(board).where(eq(board.id, P.id));
  await db.delete(board).where(eq(board.id, Q.id));

  console.log(`\nprobe_voicerelay: ${passed} passed, ${failed} failed`);
  await queryClient.end();
  process.exit(failed === 0 ? 0 : 1);
}

main().catch(async (err) => {
  console.error("probe_voicerelay FAILED:", err);
  await queryClient.end();
  process.exit(1);
});
