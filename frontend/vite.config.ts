import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// FE dev server on 5174 (offset from Starkhorn 5173). Proxies API to BE :3010.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    proxy: {
      "/trpc": "http://localhost:3010",
      "/health": "http://localhost:3010",
      // Module bundle bytes — the FE dynamic-import()s /content/bundle/:id?board=
      // through the proxy (same-origin) so the host-scoped session cookie rides.
      "/content": "http://localhost:3010",
      // Voice tutoring WebSocket (Slice VOICE-2b). Proxied same-origin so the
      // Better Auth session cookie rides the upgrade (the WS can't set the
      // x-board header, hence board is a query param — the D-S4-1 pattern).
      "/voice": { target: "http://localhost:3010", ws: true },
    },
  },
});
