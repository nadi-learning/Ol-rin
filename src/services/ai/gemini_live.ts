import {
  GoogleGenAI,
  Modality,
  type LiveServerMessage,
  type Session,
} from "@google/genai";
import { env } from "../../config/env";
import { AiNotConfiguredError } from "./gemini";

/**
 * Thin single-vendor orchestrator for the Gemini **Live** API (Slice VOICE-2a) —
 * the realtime spoken-tutor transport. Sibling to `gemini.ts` (the request/response
 * JSON path); this is a DISTINCT surface (`ai.live.connect`, a persistent
 * bidirectional WebSocket to Gemini) that streams audio both ways and emits
 * server-side transcriptions.
 *
 * Discipline applied here (build-discipline ai-integration-gotchas):
 *  - ONE vendor, thin wrapper. The relay (`voice_relay.ts`) never touches the
 *    SDK — it only sees the small `LiveHandle` / `LiveCallbacks` shape below.
 *  - Kill-switch: no GEMINI_API_KEY → AiNotConfiguredError (the shared switch),
 *    so voice degrades loudly but the app/worker still boot.
 *  - Port the shape, defend on real need: we forward frames and surface errors;
 *    we do NOT predict Live's failure modes (VOICE-2b's live smoke will).
 *
 * Transcription is captured on the SERVER (inputAudioTranscription +
 * outputAudioTranscription) — the relay's transcript is authoritative, never
 * client-trusted (D-VOICE-1).
 */

/** Callbacks the relay hands in — the SDK's message stream, demuxed. */
export interface LiveCallbacks {
  /** The grounded system prompt (from voice.startSession / resolveRelaySession). */
  systemPrompt: string;
  /** A chunk of the model's spoken audio (base64 PCM) to forward to the browser. */
  onAudio(base64Pcm: string, mimeType: string): void;
  /** A partial transcription of the STUDENT's speech (input audio). */
  onInputTranscript(text: string): void;
  /** A partial transcription of the TUTOR's speech (the model's audio output). */
  onOutputTranscript(text: string): void;
  /** The model finished a turn — a clean boundary to flush accumulated turns. */
  onTurnComplete(): void;
  /** A vendor/socket error on the Live session. */
  onError(err: unknown): void;
  /** The Live socket closed (from Gemini's side). `reason` carries Gemini's close
   *  message — a NON-empty reason on an early close (e.g. a bad model id, quota)
   *  is an abnormal close the relay must surface, not swallow (else it looks like
   *  the model is just "thinking" forever). */
  onClose(reason: string): void;
}

/** The handle the relay drives — send audio/text upstream, or close. */
export interface LiveHandle {
  /** Forward a raw PCM16 (16 kHz mono) audio frame from the browser to Gemini. */
  sendAudio(pcm: ArrayBuffer | Uint8Array): void;
  /** Send a text turn (used by the probe; the browser sends audio). */
  sendText(text: string): void;
  /** Close the Gemini Live session. */
  close(): void;
}

// The Gemini Live input audio contract: 16 kHz mono PCM (little-endian s16).
const INPUT_MIME = "audio/pcm;rate=16000";

let liveClient: GoogleGenAI | null = null;
function getLiveClient(): GoogleGenAI {
  if (!env.GEMINI_API_KEY) throw new AiNotConfiguredError();
  // Memoize (cf. M1 — a fresh client per session wastes the connection setup).
  if (!liveClient) liveClient = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
  return liveClient;
}

/**
 * Open a Gemini Live session grounded in `systemPrompt`, wired to `cb`. Resolves
 * once the socket is open (the SDK resolves after `onopen`). Throws
 * AiNotConfiguredError if no key, or the SDK's connect error otherwise — the
 * relay catches and tells the browser, then finalizes the session durably.
 */
export async function openLiveSession(cb: LiveCallbacks): Promise<LiveHandle> {
  const ai = getLiveClient();
  const model = env.GEMINI_LIVE_MODEL;

  const session: Session = await ai.live.connect({
    model,
    config: {
      // Audio out (spoken tutor); text-in from the probe still yields audio out.
      responseModalities: [Modality.AUDIO],
      systemInstruction: cb.systemPrompt,
      // Server-side transcription of BOTH directions → the authoritative transcript.
      inputAudioTranscription: {},
      outputAudioTranscription: {},
    },
    callbacks: {
      onopen: () => console.log(`[gemini-live] open model=${model}`),
      onmessage: (m: LiveServerMessage) => {
        const sc = m.serverContent;
        if (!sc) return;
        if (sc.inputTranscription?.text) cb.onInputTranscript(sc.inputTranscription.text);
        if (sc.outputTranscription?.text) cb.onOutputTranscript(sc.outputTranscription.text);
        for (const p of sc.modelTurn?.parts ?? []) {
          const d = p.inlineData;
          if (d?.data) cb.onAudio(d.data, d.mimeType ?? "audio/pcm");
        }
        if (sc.turnComplete) cb.onTurnComplete();
      },
      onerror: (e) => cb.onError(e),
      onclose: (e) => cb.onClose(e?.reason ?? ""),
    },
  });

  return {
    sendAudio(pcm) {
      const bytes = pcm instanceof Uint8Array ? pcm : new Uint8Array(pcm);
      session.sendRealtimeInput({
        audio: { data: Buffer.from(bytes).toString("base64"), mimeType: INPUT_MIME },
      });
    },
    sendText(text) {
      session.sendClientContent({
        turns: [{ role: "user", parts: [{ text }] }],
        turnComplete: true,
      });
    },
    close() {
      // Best-effort — a double-close or an already-dead socket must not throw
      // into the finalize path (the transcript persist is what matters).
      try {
        session.close();
      } catch {
        /* already closed */
      }
    },
  };
}

/** True if a Live session can be opened (a key is configured). */
export const __liveConfigured = () => Boolean(env.GEMINI_API_KEY);
