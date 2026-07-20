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

/**
 * What the person said they were on the landing page — the persona card,
 * which the founder made load-bearing this session (it used to only prefill a
 * dev-login email).
 *
 * 🔴 S123 PROMOTED THIS FROM A ONE-SHOT CLAIM INTO THE ACTIVE PROFILE. It used
 * to live only between the persona click and the membership mint, and was
 * CLEARED once spent. It now persists for the session and rides every request
 * as `x-profile`, because one email can hold several profiles and the server
 * cannot infer which one this browser means. "Whatever session is logged in a
 * browser should resume, and the profile the user clicked should route to the
 * respective session" (founder) — this value is that routing.
 *
 * 🔴 STILL UNTRUSTED, and now more obviously so. It SELECTS a membership; it
 * never creates or grants one. Since S123 there is no self-promote path at all:
 * `resolveMembership` refuses to mint anything but a student, so a tampered
 * `x-profile: admin` asks for a row that does not exist and gets
 * NoMembershipError. The worst a forged value does is show someone the waiting
 * room they could have reached by clicking a card.
 *
 * ⚠️ Its persistence is also its hazard, and this exact file has caused two
 * production bugs (M78, M79) by latching a stale value out of localStorage.
 * The rule that keeps it honest: it is VALIDATED against real memberships on
 * every boot (App.tsx) and never treated as the role itself. Read the role off
 * the server's answer, never off this.
 */
const PERSONA_KEY = "b2c.persona";

export function getPersona(): string | null {
  try {
    return localStorage.getItem(PERSONA_KEY);
  } catch {
    return null;
  }
}

export function setPersona(persona: string): void {
  try {
    localStorage.setItem(PERSONA_KEY, persona);
  } catch {
    /* see getBoard */
  }
}

export function clearPersona(): void {
  try {
    localStorage.removeItem(PERSONA_KEY);
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
      // S123: `x-profile` rides alongside `x-board` and for the same reason —
      // one email can now hold a student, tutor and parent profile on ONE
      // board, so the board alone no longer identifies the membership. Both are
      // read per-request rather than captured: the profile is chosen on the
      // landing page after this client is constructed.
      headers: () => {
        const b = getBoard();
        const p = getPersona();
        return {
          ...(b ? { "x-board": b } : {}),
          ...(p ? { "x-profile": p } : {}),
        };
      },
      fetch: (url, opts) => fetch(url, { ...opts, credentials: "include" }),
    }),
  ],
});
