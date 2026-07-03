// Voice-tutoring browser audio (Slice VOICE-2b) — the mic-in / speaker-out
// halves of the Gemini Live relay. Kept out of the React component so the panel
// only orchestrates a WebSocket + these two handles.
//
// Formats are fixed by the Gemini Live contract (mirrored server-side in
// gemini_live.ts): mic UP = PCM16 mono @ 16 kHz; model audio DOWN = PCM16 mono
// @ 24 kHz. We run each direction's AudioContext at its native rate so the
// browser does the resampling and our code only does int16⇄float conversion.

import captureWorkletUrl from "./capture-worklet.js?url";

const INPUT_RATE = 16000; // Gemini Live input: audio/pcm;rate=16000
const OUTPUT_RATE = 24000; // Gemini Live output audio rate

/** A running mic capture. Streams PCM16 @16 kHz frames to `onFrame` until stop(). */
export interface MicCapture {
  stop(): Promise<void>;
}

/** Request the mic and stream PCM16 @16 kHz frames via the AudioWorklet.
 *  Rejects if permission is denied (the caller surfaces it + ends the session). */
export async function startMicCapture(
  onFrame: (pcm: ArrayBuffer) => void,
): Promise<MicCapture> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
  });
  // Run the whole capture graph at 16 kHz → the worklet gets mic audio already
  // at Gemini's input rate (the browser resamples the device into the context).
  const ctx = new AudioContext({ sampleRate: INPUT_RATE });
  await ctx.audioWorklet.addModule(captureWorkletUrl);
  const source = ctx.createMediaStreamSource(stream);
  const node = new AudioWorkletNode(ctx, "capture-processor");
  node.port.onmessage = (e) => onFrame(e.data as ArrayBuffer);
  source.connect(node);
  // Deliberately NOT connected to ctx.destination — we don't play the mic back.

  return {
    async stop() {
      try {
        node.port.onmessage = null;
        node.disconnect();
        source.disconnect();
      } catch {
        /* graph already torn down */
      }
      for (const t of stream.getTracks()) t.stop();
      try {
        await ctx.close();
      } catch {
        /* already closed */
      }
    },
  };
}

/** A sequential playback queue for the model's PCM16 @24 kHz audio chunks.
 *  Schedules each chunk right after the previous one so speech stays contiguous.
 *  (A ring-buffer AudioWorklet would be the fully gap-proof upgrade; the
 *  scheduled-source queue is the standard, robust v0 choice and needs no second
 *  worklet file.) */
export interface PlaybackQueue {
  enqueue(pcm: ArrayBuffer): void;
  stop(): Promise<void>;
}

export function createPlaybackQueue(): PlaybackQueue {
  const ctx = new AudioContext({ sampleRate: OUTPUT_RATE });
  let nextStart = 0;
  const live = new Set<AudioBufferSourceNode>();

  return {
    enqueue(pcm) {
      const int16 = new Int16Array(pcm);
      if (int16.length === 0) return;
      const buf = ctx.createBuffer(1, int16.length, OUTPUT_RATE);
      const ch = buf.getChannelData(0);
      for (let i = 0; i < int16.length; i++) ch[i] = int16[i]! / 0x8000;

      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.connect(ctx.destination);
      const startAt = Math.max(ctx.currentTime, nextStart);
      src.start(startAt);
      nextStart = startAt + buf.duration;
      live.add(src);
      src.onended = () => live.delete(src);
    },
    async stop() {
      for (const s of live) {
        try {
          s.stop();
        } catch {
          /* already stopped */
        }
      }
      live.clear();
      try {
        await ctx.close();
      } catch {
        /* already closed */
      }
    },
  };
}
