import { createTRPCClient, httpBatchLink } from "@trpc/client";
import superjson from "superjson";
import type { AppRouter } from "../../src/trpc/router";

/**
 * Slice E — the board is now the STUDENT'S, not a constant.
 *
 * It used to be `export const BOARD = "cbse"`, sent as `x-board` on every call.
 * That single line was the reason a brand-new student got silently enrolled on
 * CBSE: the FE's first request carried a board the student had never chosen,
 * and the old `me` created a membership from it. So the board now lives in
 * localStorage, is written only by a real pick (or by boot resolving an
 * existing membership), and the header is OMITTED entirely when unset.
 *
 * 🔴 OMITTED, not defaulted. A missing `x-board` makes every board-scoped
 * procedure fail loudly with BAD_REQUEST, which is correct and visible; a
 * default would silently resurrect the exact bug this slice removes.
 *
 * The pre-board `session.*` procedures don't need the header at all — see
 * `sessionProcedure` in src/trpc/init.ts.
 */
const BOARD_KEY = "b2c.board";

export function getBoard(): string | null {
  try {
    return localStorage.getItem(BOARD_KEY);
  } catch {
    // Private-mode / blocked storage: treat as "no board picked". The student
    // re-picks each session rather than the app failing to boot.
    return null;
  }
}

export function setBoard(slug: string): void {
  try {
    localStorage.setItem(BOARD_KEY, slug);
  } catch {
    /* see getBoard */
  }
}

export function clearBoard(): void {
  try {
    localStorage.removeItem(BOARD_KEY);
  } catch {
    /* see getBoard */
  }
}

// Type-only import of the backend router → end-to-end type safety with no
// shared build step. Calls go through the Vite proxy to BE :3010. credentials:
// "include" so the Better Auth session cookie travels with every request.
export const trpc = createTRPCClient<AppRouter>({
  links: [
    httpBatchLink({
      url: "/trpc",
      transformer: superjson,
      // Read per-request, NOT captured once: the board changes mid-session when
      // a student picks one, and a captured value would keep sending the old
      // (or absent) board until a reload.
      headers: () => {
        const b = getBoard();
        return b ? { "x-board": b } : {};
      },
      fetch: (url, opts) => fetch(url, { ...opts, credentials: "include" }),
    }),
  ],
});
