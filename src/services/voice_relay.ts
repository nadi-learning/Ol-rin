/**
 * Voice relay (Slice VOICE-2a) — the glue between a browser WebSocket and a
 * Gemini Live session. Framework-agnostic on purpose: `index.ts` owns the Hono/
 * Bun WS lifecycle and hands each connection a `VoiceRelay`; the probe drives the
 * exact same class with a fake socket (no HTTP needed).
 *
 * Data flow (server-relay, D-VOICE-1 — the key stays server-side, the transcript
 * is server-authoritative):
 *   browser mic  ──audio frames──▶  relay  ──sendAudio──▶  Gemini Live
 *   browser audio ◀──audio frames──  relay  ◀──onAudio───   Gemini Live
 *   the relay accumulates BOTH transcriptions (input=student, output=tutor) as
 *   they stream, flushes them into ordered turns on each turnComplete, and on
 *   end persists them via voice.endVoiceSession (transcript + analysis + event).
 *
 * Load-bearing boundaries:
 *   - The transcript comes from Gemini's server-side transcription, NOT the
 *     client — the client only streams audio + signals end (D-VOICE-1).
 *   - Finalize runs inside withBoard(boardId) so endVoiceSession's writes are
 *     RLS-scoped exactly like the tRPC path.
 *   - Finalize is idempotent + guarded: a socket drop AND an explicit end both
 *     route through finalize() once; endVoiceSession itself no-ops a second end.
 *   - NO mastery move — endVoiceSession only writes evidence (VOICE-1 invariant).
 */
import { withBoard } from "../db/with-board";
import { AiNotConfiguredError } from "./ai/gemini";
import { openLiveSession, type LiveHandle } from "./ai/gemini_live";
import { endVoiceSession, type VoiceMode, type VoiceTurn } from "./voice";

/** The resolved, ownership-checked identity the relay operates under. Built by
 *  the WS auth gate (index.ts) or the probe from voice.resolveRelaySession. */
export interface RelayContext {
  boardId: string;
  appUserId: string;
  sessionId: string;
  mode: VoiceMode;
  systemPrompt: string;
}

/** The minimal socket the relay writes to — Hono's WSContext and the probe's
 *  fake both satisfy it. Audio goes out as binary; control/transcript as JSON. */
export interface RelaySocket {
  send(data: string | ArrayBuffer | Uint8Array): void;
  close(code?: number, reason?: string): void;
}

/** Control/transcript frames the relay emits to the browser (JSON strings).
 *  Audio frames are sent as raw binary, not via this shape. */
export type RelayServerFrame =
  | { type: "ready" }
  | { type: "status"; state: "listening" | "speaking" }
  | { type: "transcript"; role: "student" | "tutor"; text: string; partial: boolean }
  | { type: "ended"; analysisPresent: boolean }
  | { type: "error"; message: string };

/** Frames the browser/probe sends to the relay (JSON strings). Binary frames are
 *  raw PCM16 audio input (forwarded to Gemini as-is). */
export type RelayClientFrame =
  | { type: "end" }
  // Text turn — the probe uses this to drive a deterministic turn without a mic;
  // the browser (VOICE-2b) streams audio instead.
  | { type: "text"; text: string };

export class VoiceRelay {
  private live: LiveHandle | null = null;
  private readonly turns: VoiceTurn[] = [];
  // Partial transcription buffers, flushed into `turns` on each turnComplete.
  private curStudent = "";
  private curTutor = "";
  private finalized = false;
  private started = false;

  constructor(private readonly ctx: RelayContext) {}

  private emit(ws: RelaySocket, frame: RelayServerFrame) {
    ws.send(JSON.stringify(frame));
  }

  /** Push any accumulated transcription into ordered turns (student before
   *  tutor, matching real conversation order) and reset the buffers. */
  private flushTurns() {
    const student = this.curStudent.trim();
    const tutor = this.curTutor.trim();
    if (student) this.turns.push({ role: "student", text: student });
    if (tutor) this.turns.push({ role: "tutor", text: tutor });
    this.curStudent = "";
    this.curTutor = "";
  }

  /** Open the Gemini Live session and begin relaying. Call once, on socket open.
   *  If Live can't be opened (no key / connect error) the browser is told and
   *  the socket closed — no session is left half-open. */
  async start(ws: RelaySocket): Promise<void> {
    if (this.started) return;
    this.started = true;
    try {
      this.live = await openLiveSession({
        systemPrompt: this.ctx.systemPrompt,
        onAudio: (b64, _mime) => {
          // Forward the model's spoken audio to the browser as raw bytes.
          ws.send(Buffer.from(b64, "base64"));
          this.emit(ws, { type: "status", state: "speaking" });
        },
        onInputTranscript: (t) => {
          this.curStudent += t;
          this.emit(ws, { type: "transcript", role: "student", text: t, partial: true });
        },
        onOutputTranscript: (t) => {
          this.curTutor += t;
          this.emit(ws, { type: "transcript", role: "tutor", text: t, partial: true });
        },
        onTurnComplete: () => {
          this.flushTurns();
          this.emit(ws, { type: "status", state: "listening" });
        },
        onError: (err) => {
          this.emit(ws, {
            type: "error",
            message: err instanceof Error ? err.message : String(err),
          });
        },
        onClose: (reason) => {
          // Gemini closed its side. A non-empty reason on a close we didn't
          // initiate (still not finalized) is abnormal (bad model id, quota,
          // idle timeout) — surface it so the browser doesn't wait forever for a
          // model that will never speak. finalize() still runs on the browser's
          // own close/end, persisting whatever was captured.
          if (!this.finalized && reason) {
            this.emit(ws, { type: "error", message: `voice session ended: ${reason}` });
          }
        },
      });
      this.emit(ws, { type: "ready" });
    } catch (err) {
      const message =
        err instanceof AiNotConfiguredError
          ? "voice tutoring is not configured"
          : err instanceof Error
            ? err.message
            : String(err);
      this.emit(ws, { type: "error", message });
      // 1011 = server error / unavailable.
      ws.close(1011, "live_unavailable");
    }
  }

  /** Handle an inbound frame from the browser/probe. Strings are JSON control;
   *  everything else is a raw PCM audio frame forwarded to Gemini. */
  async onClientMessage(
    data: string | ArrayBuffer | Uint8Array | Buffer,
    ws: RelaySocket,
  ): Promise<void> {
    if (typeof data === "string") {
      let frame: RelayClientFrame;
      try {
        frame = JSON.parse(data) as RelayClientFrame;
      } catch {
        return; // ignore malformed control frames
      }
      if (frame.type === "end") {
        await this.finalize();
        this.emit(ws, { type: "ended", analysisPresent: this.analysisPresent });
        ws.close(1000, "ended");
      } else if (frame.type === "text") {
        // Deterministic text turn (probe). No input transcription for text, so
        // record the student turn here; the tutor turn flushes on turnComplete.
        this.turns.push({ role: "student", text: frame.text });
        this.live?.sendText(frame.text);
      }
      return;
    }
    // Binary → raw PCM16 audio in. Forward to Gemini untouched.
    this.live?.sendAudio(
      data instanceof Uint8Array ? data : new Uint8Array(data as ArrayBuffer),
    );
  }

  /** The browser socket dropped without an explicit `end`. Finalize durably so
   *  the session (and whatever was said) is never lost. */
  async onClientClose(): Promise<void> {
    await this.finalize();
  }

  private analysisPresent = false;

  /** Persist the session exactly once: flush partials, close the Live socket,
   *  and run endVoiceSession (transcript + fault-isolated analysis + event_log)
   *  inside a board-scoped transaction. NO mastery move. */
  private async finalize(): Promise<void> {
    if (this.finalized) return;
    this.finalized = true;
    this.flushTurns();
    this.live?.close();
    try {
      const res = await withBoard(this.ctx.boardId, (tx) =>
        endVoiceSession(tx, {
          boardId: this.ctx.boardId,
          appUserId: this.ctx.appUserId,
          sessionId: this.ctx.sessionId,
          transcript: this.turns,
        }),
      );
      this.analysisPresent = res.analysis != null;
    } catch (err) {
      // The durable record is the goal; a persist failure is logged, not thrown
      // into a socket callback (there's no caller to handle it).
      console.error(
        `[voice-relay] finalize failed for ${this.ctx.sessionId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  /** Test seam: the turns captured so far (server-authoritative transcript). */
  get capturedTurns(): ReadonlyArray<VoiceTurn> {
    return this.turns;
  }
}
