// AudioWorklet processor for voice-tutoring mic capture (Slice VOICE-2b).
//
// Runs OFF the main thread (that's the point of the worklet — the mic never
// drops frames while React re-renders). It receives Float32 mic samples at the
// context's sample rate; we run the capture AudioContext at 16 kHz, so the
// browser has already resampled the mic into the graph and no resampling is
// needed here — we only convert Float32 [-1,1] → little-endian PCM16 and post
// the raw bytes up. The main thread forwards them over the voice WebSocket to
// Gemini Live (audio/pcm;rate=16000).
//
// Plain JS on purpose: worklet code executes in AudioWorkletGlobalScope and
// can't import app modules or run through the TS transform, so this file is
// loaded verbatim via Vite's `?url` import.
class CaptureProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const input = inputs[0];
    // No input this quantum (e.g. between track (re)starts) — keep the node alive.
    if (!input || input.length === 0) return true;
    const channel = input[0];
    if (!channel || channel.length === 0) return true;

    const pcm = new Int16Array(channel.length);
    for (let i = 0; i < channel.length; i++) {
      let s = channel[i];
      if (s > 1) s = 1;
      else if (s < -1) s = -1;
      pcm[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    // Transfer the buffer (zero-copy) to the main thread.
    this.port.postMessage(pcm.buffer, [pcm.buffer]);
    return true;
  }
}

registerProcessor("capture-processor", CaptureProcessor);
