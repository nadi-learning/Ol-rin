import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// FE dev server on 5174 (offset from Starkhorn 5173). Proxies API to BE :3010.
export default defineConfig({
  plugins: [react()],
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
