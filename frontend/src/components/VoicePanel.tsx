// VoicePanel (Slice VOICE-3) — the student's spoken-tutor surface, reskinned
// from a card-below-the-slide (VOICE-2b) into a FLOATING COMPANION anchored
// bottom-left. The relay wiring is UNCHANGED from VOICE-2b:
//
//   startSession (tRPC) → open WS /voice/live?board&sessionId → on "ready", stream
//   mic PCM16@16k up (binary) ; play model PCM16@24k down (binary) ; render the
//   server-authoritative transcript (JSON control frames) ; "End" sends {end},
//   the relay persists the transcript + analysis and closes.
//
// The character (a knocked-out Pikachu peeker, a DEV PLACEHOLDER — real product
// needs an original mascot) sits at the bottom-left corner and animates off the
// live state: idle bob · connecting pulse · listening rise · SPEAKING squash-
// stretch bounce (the "talking" feel — bounce-only, no lip-sync, per the VOICE-3
// design chat). Tapping it opens a small HUB (Talk / End / Show conversation);
// the per-slide transcript is an on-demand DRAWER, hidden by default.
//
// M31: this component holds the WS/mic/playback refs and stays MOUNTED the whole
// time (parent keys it on subTopicId). The hub + drawer toggle via CSS
// (is-open / data-attrs), never a conditional unmount — unmounting would kill
// the live call. Only slide navigation (a real dispose) unmounts it → the
// cleanup effect closes the socket → the relay finalizes server-side.
//
// Only rendered when the slide has voice_context (RevisionPage gates on
// slide.hasVoiceContext). All classes are `.voice-`-scoped (voice.css) to dodge
// the verbatim Starkhorn revision-shell.css globals (the S23 convention).

import { useEffect, useReducer, useRef, useState } from "react";
import { trpc, BOARD } from "../trpc";
import {
  startMicCapture,
  createPlaybackQueue,
  type MicCapture,
  type PlaybackQueue,
} from "./voice/voice-audio";
import pikachuPeeker from "../assets/pikachu-peeker.png";
import "./voice.css";

type Phase = "idle" | "connecting" | "live" | "ending" | "ended" | "error";
type Turn = { role: "student" | "tutor"; text: string };

// Server → client control frames (mirrors RelayServerFrame in voice_relay.ts).
type ServerFrame =
  | { type: "ready" }
  | { type: "status"; state: "listening" | "speaking" }
  | { type: "transcript"; role: "student" | "tutor"; text: string; partial: boolean }
  | { type: "ended"; analysisPresent: boolean }
  | { type: "error"; message: string };

function voiceWsUrl(sessionId: string): string {
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  const qs = new URLSearchParams({ board: BOARD, sessionId });
  // Same-origin through the Vite proxy (ws:true) so the session cookie rides.
  return `${proto}//${window.location.host}/voice/live?${qs.toString()}`;
}

export function VoicePanel({
  subTopicId,
  slideTitle,
}: {
  subTopicId: string;
  slideTitle?: string;
}) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [speaking, setSpeaking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [analysisSaved, setAnalysisSaved] = useState<boolean | null>(null);

  // Presentational toggles (VOICE-3). Neither holds async state — the WS/mic
  // refs below live on this always-mounted component (M31), so these only drive
  // CSS visibility.
  const [hubOpen, setHubOpen] = useState(false);
  const [convoOpen, setConvoOpen] = useState(false);

  // The live conversation lives in a ref (server-authoritative transcript
  // streams in as partial chunks; we accumulate per role and commit a turn on
  // each turnComplete, matching the relay's own flushTurns). forceRender ticks
  // the view — avoids stale closures inside the once-bound WS handlers.
  const convoRef = useRef<{ turns: Turn[]; liveStudent: string; liveTutor: string }>({
    turns: [],
    liveStudent: "",
    liveTutor: "",
  });
  const [, forceRender] = useReducer((x: number) => x + 1, 0);

  const wsRef = useRef<WebSocket | null>(null);
  const micRef = useRef<MicCapture | null>(null);
  const playbackRef = useRef<PlaybackQueue | null>(null);
  const tornRef = useRef(false); // idempotent teardown guard
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // Keep the transcript pinned to the newest line.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  });

  async function teardown() {
    if (tornRef.current) return;
    tornRef.current = true;
    try {
      await micRef.current?.stop();
    } catch {
      /* ignore */
    }
    micRef.current = null;
    try {
      await playbackRef.current?.stop();
    } catch {
      /* ignore */
    }
    playbackRef.current = null;
    const ws = wsRef.current;
    wsRef.current = null;
    if (ws && ws.readyState <= WebSocket.OPEN) {
      try {
        ws.close();
      } catch {
        /* ignore */
      }
    }
  }

  function commitLiveTurns() {
    const c = convoRef.current;
    const s = c.liveStudent.trim();
    const t = c.liveTutor.trim();
    if (s) c.turns.push({ role: "student", text: s });
    if (t) c.turns.push({ role: "tutor", text: t });
    c.liveStudent = "";
    c.liveTutor = "";
    forceRender();
  }

  async function handleServerFrame(frame: ServerFrame, ws: WebSocket) {
    switch (frame.type) {
      case "ready": {
        // Gemini Live is connected — start streaming the mic. Guard against a
        // teardown that raced in while startSession/ws-open were pending.
        try {
          const mic = await startMicCapture((pcm) => {
            if (wsRef.current?.readyState === WebSocket.OPEN) wsRef.current.send(pcm);
          });
          if (tornRef.current) {
            void mic.stop();
            return;
          }
          micRef.current = mic;
          setPhase("live");
        } catch {
          setError("Microphone access was blocked. Allow the mic and try again.");
          setPhase("error");
          void teardown();
        }
        break;
      }
      case "status":
        setSpeaking(frame.state === "speaking");
        if (frame.state === "listening") commitLiveTurns(); // turn boundary
        break;
      case "transcript":
        if (frame.role === "student") convoRef.current.liveStudent += frame.text;
        else convoRef.current.liveTutor += frame.text;
        forceRender();
        break;
      case "ended":
        commitLiveTurns();
        setAnalysisSaved(frame.analysisPresent);
        setPhase("ended");
        void teardown();
        break;
      case "error":
        setError(frame.message);
        // A pre-ready failure (e.g. live_unavailable) will also close the socket;
        // surface the message but let onclose drive the terminal phase.
        break;
    }
    void ws; // (kept for symmetry / future per-frame replies)
  }

  async function start() {
    setError(null);
    setAnalysisSaved(null);
    setHubOpen(true); // keep the hub open so the student sees Connecting… → Listening
    convoRef.current = { turns: [], liveStudent: "", liveTutor: "" };
    tornRef.current = false;
    setPhase("connecting");
    try {
      const { sessionId } = await trpc.voice.startSession.mutate({ subTopicId });
      // Create the playback context inside the click gesture so autoplay allows it.
      playbackRef.current = createPlaybackQueue();

      const ws = new WebSocket(voiceWsUrl(sessionId));
      ws.binaryType = "arraybuffer";
      wsRef.current = ws;

      ws.onmessage = (evt) => {
        if (typeof evt.data === "string") {
          let frame: ServerFrame;
          try {
            frame = JSON.parse(evt.data) as ServerFrame;
          } catch {
            return;
          }
          void handleServerFrame(frame, ws);
        } else {
          // Binary → model audio PCM16@24k → play it.
          playbackRef.current?.enqueue(evt.data as ArrayBuffer);
        }
      };
      ws.onerror = () => {
        if (phase !== "ended") setError((e) => e ?? "Voice connection error.");
      };
      ws.onclose = () => {
        // If the relay closed us without an explicit {ended} (drop / abnormal),
        // still land in a terminal state.
        if (!tornRef.current) {
          setPhase((p) => (p === "ending" || p === "error" ? p : "ended"));
          void teardown();
        }
      };
    } catch (e) {
      setError(String((e as { message?: string })?.message ?? e));
      setPhase("error");
      void teardown();
    }
  }

  function end() {
    setPhase("ending");
    // Stop capturing immediately; ask the relay to finalize (it replies {ended}).
    void micRef.current?.stop();
    micRef.current = null;
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "end" }));
    } else {
      void teardown();
      setPhase("ended");
    }
  }

  // Dispose on unmount (slide navigation / page leave). Closing the socket makes
  // the relay finalize the session server-side (onClientClose). Not the M31 case
  // — this is a genuine navigate-away disposal, not a hide.
  useEffect(() => {
    return () => {
      void teardown();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const c = convoRef.current;
  const busy = phase === "connecting" || phase === "ending";
  const active = phase === "live";
  const inCall = phase === "connecting" || phase === "live" || phase === "ending";
  const hasConversation = c.turns.length > 0 || !!c.liveStudent || !!c.liveTutor;

  const statusLine =
    phase === "idle"
      ? "Ask me about this slide - out loud."
      : phase === "connecting"
        ? "Connecting…"
        : phase === "live"
          ? speaking
            ? "Speaking…"
            : "Listening - go ahead."
          : phase === "ending"
            ? "Wrapping up…"
            : phase === "ended"
              ? analysisSaved
                ? "Saved a summary for your tutor."
                : "Session ended."
              : "Couldn’t start the voice session.";

  return (
    <div className="voice-fab" data-phase={phase} data-speaking={speaking ? "1" : "0"}>
      {/* Transcript drawer — stays mounted, CSS-hidden when closed so scroll +
          state survive the toggle (M31 discipline, though it holds no async). */}
      <div className={`voice-drawer${convoOpen ? " is-open" : ""}`} aria-hidden={!convoOpen}>
        <div className="voice-drawer-head">
          <span className="voice-drawer-title">
            Conversation{slideTitle ? ` · ${slideTitle}` : ""}
          </span>
          <button
            className="voice-drawer-close"
            onClick={() => setConvoOpen(false)}
            aria-label="Close conversation"
          >
            <CloseIcon />
          </button>
        </div>
        <div className="voice-transcript" ref={scrollRef}>
          {!hasConversation && (
            <p className="voice-transcript-hint">
              {inCall ? "Say hello to get started…" : "No conversation yet. Tap Pikachu to talk."}
            </p>
          )}
          {c.turns.map((turn, i) => (
            <div key={i} className={`voice-turn voice-turn--${turn.role}`}>
              <span className="voice-turn-role">{turn.role === "student" ? "You" : "Tutor"}</span>
              <p className="voice-turn-text">{turn.text}</p>
            </div>
          ))}
          {c.liveStudent.trim() && (
            <div className="voice-turn voice-turn--student is-partial">
              <span className="voice-turn-role">You</span>
              <p className="voice-turn-text">{c.liveStudent}</p>
            </div>
          )}
          {c.liveTutor.trim() && (
            <div className="voice-turn voice-turn--tutor is-partial">
              <span className="voice-turn-role">Tutor</span>
              <p className="voice-turn-text">{c.liveTutor}</p>
            </div>
          )}
        </div>
      </div>

      {/* Ambient live signal — just a wave, no card. Visible whenever a call is
          connecting/live/ending (the VOICE-3 eyeball ask: "a wave signal, just
          that, would suffice" — the heavy status card is gone). Green + gentle
          while listening, blue + livelier while the tutor speaks. */}
      {inCall && (
        <div
          className={`voice-signal${active ? " is-live" : ""}${speaking ? " is-speaking" : ""}`}
          aria-label={statusLine}
        >
          <span /><span /><span /><span /><span />
        </div>
      )}

      {/* Controls — small floating chips revealed on tap (no rectangle box). */}
      <div className={`voice-hub${hubOpen ? " is-open" : ""}`} aria-hidden={!hubOpen}>
        {error && <p className="voice-error">{error}</p>}
        <span className="voice-hub-caption">{statusLine}</span>
        <div className="voice-hub-actions">
          {!inCall ? (
            <button className="voice-btn voice-btn--start" onClick={start} disabled={busy}>
              {phase === "ended" || phase === "error" ? "Talk again" : "Talk to me"}
            </button>
          ) : (
            <button
              className="voice-btn voice-btn--end"
              onClick={end}
              disabled={phase === "ending"}
            >
              {phase === "ending" ? "Ending…" : "End session"}
            </button>
          )}
          <button
            className="voice-btn voice-btn--ghost"
            onClick={() => setConvoOpen((v) => !v)}
            disabled={!hasConversation && !inCall}
          >
            {convoOpen ? "Hide conversation" : "Show conversation"}
          </button>
        </div>
      </div>

      {/* The character. Tap to open/close the hub. Animates off data-phase /
          data-speaking on the root (voice.css). */}
      <button
        className="voice-avatar"
        onClick={() => setHubOpen((v) => !v)}
        aria-label={hubOpen ? "Close voice tutor" : "Talk to this slide"}
        aria-expanded={hubOpen}
      >
        <span className="voice-avatar-shadow" aria-hidden />
        <img className="voice-avatar-img" src={pikachuPeeker} alt="" draggable={false} />
        <span className={`voice-avatar-dot${inCall ? " is-live" : ""}${speaking ? " is-speaking" : ""}`} aria-hidden />
      </button>
    </div>
  );
}

function CloseIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}
