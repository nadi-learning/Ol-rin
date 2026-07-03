import { createTRPCClient, httpBatchLink } from "@trpc/client";
import superjson from "superjson";
import type { AppRouter } from "../../src/trpc/router";

// Skeleton: the board is hard-coded; prod derives it from the subdomain. Sent
// as the x-board header on every call (BE context resolves slug → board row).
// Board for this build (walking-skeleton single-tenant FE const). `cbse` shows
// the live-pulled "Exploring Mixtures and their Separation" chapter; `cambridge`
// shows the ch4_motion fixture. Whitelist the smoke email on whichever is set.
export const BOARD = "cbse";

// Type-only import of the backend router → end-to-end type safety with no
// shared build step. Calls go through the Vite proxy to BE :3010. credentials:
// "include" so the Better Auth session cookie travels with every request.
export const trpc = createTRPCClient<AppRouter>({
  links: [
    httpBatchLink({
      url: "/trpc",
      transformer: superjson,
      headers: () => ({ "x-board": BOARD }),
      fetch: (url, opts) => fetch(url, { ...opts, credentials: "include" }),
    }),
  ],
});
