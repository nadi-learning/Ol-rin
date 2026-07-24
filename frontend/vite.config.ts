import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Slice TWOWAY-FIX — the BUILD STAMP.
//
// Why this exists: a tab left open across a deploy keeps running the old bundle
// indefinitely, and nothing tells it otherwise. On 2026-07-24 that stranded a tutor
// in an unbounded authoring loop for an hour — the FE was too old to draw the plan
// gate, so it kept re-triggering work it couldn't display. The failure presented as
// "the AI is broken", which is the worst property of this class: it is invisible and
// it misattributes.
//
// A TIMESTAMP, deliberately, not a git sha: the box builds from an rsync'd tree with
// no `.git` (the deploy rsync excludes it), so a sha resolves to nothing there. Every
// build is a new id, which is exactly the claim being made — "the served app changed".
const BUILD_ID = Date.now().toString(36);

/** Emit the id as a tiny asset the running app can poll and compare against its own
 *  baked-in copy. Same origin, no backend involvement, and it ships in the same dist
 *  as the bundle it describes — so the two can never disagree about what was deployed. */
function buildStamp() {
  return {
    name: "b2c-build-stamp",
    generateBundle(this: { emitFile: (f: unknown) => void }) {
      this.emitFile({
        type: "asset",
        fileName: "version.json",
        source: JSON.stringify({ build: BUILD_ID }),
      });
    },
  };
}

// FE dev server on 5174 (offset from Starkhorn 5173). Proxies API to BE :3010.
export default defineConfig({
  plugins: [react(), buildStamp()],
  define: { __BUILD_ID__: JSON.stringify(BUILD_ID) },
  server: {
    port: 5174,
    // Bind all interfaces so a phone on the same LAN can reach the dev server
    // (Cross-Device Upload — the QR points the phone at this origin).
    host: true,
    proxy: {
      "/trpc": "http://localhost:3010",
      "/health": "http://localhost:3010",
      // Module bundle bytes — the FE dynamic-import()s /content/bundle/:id?board=
      // through the proxy (same-origin) so the host-scoped session cookie rides.
      "/content": "http://localhost:3010",
      // Cross-Device Upload JSON API (Slice Q3). The unauth mobile page lives at
      // the FE route `/u/:token` (SPA fallback, NOT proxied); it fetches the
      // stem + POSTs photos to the backend's `/upload/:token` same-origin
      // through this proxy (Option B — page path ≠ API path, no collision).
      "/upload": "http://localhost:3010",
      // Answer-photo bytes (Slice UPLOAD-UX). The practice flow renders answer
      // photos via plain <img src="/practice/upload-preview/:token"> and
      // <img src="/practice/answer-photo/:id"> — same-origin so the session
      // cookie rides. Without this the SPA index-fallback (200 text/html) is
      // served for the img and the thumbnail renders broken.
      "/practice": "http://localhost:3010",
      // Voice tutoring WebSocket (Slice VOICE-2b). Proxied same-origin so the
      // Better Auth session cookie rides the upgrade (the WS can't set the
      // x-board header, hence board is a query param — the D-S4-1 pattern).
      "/voice": { target: "http://localhost:3010", ws: true },
    },
  },
});
