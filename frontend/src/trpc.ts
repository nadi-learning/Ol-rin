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

/**
 * 🔴 BOARD-TAB (S151) — THE BOARD LIVES IN `sessionStorage`, WHICH IS PER-TAB.
 * It used to live in `localStorage`, which is per-ORIGIN: every tab and window of
 * the app shared ONE value. A tutor with two windows open — one authoring for a
 * CBSE student, one for a Cambridge student — had the second window's
 * `setBoard(student.board)` silently overwrite the first's. The first window's
 * next call then carried the WRONG `x-board`, its board-scoped rows went
 * RLS-invisible, and the tutor saw `AUTHORING_CHAT_NOT_FOUND` ("authoring thread
 * not found") on a chat that was sitting right there. Same fault previously ate a
 * real assessment finalize (ASSESSMENT_SESSION_NOT_FOUND, S148) — that path was
 * patched with a synchronous re-pin, which narrowed the race but could not close
 * it, because the two windows keep flipping one shared value.
 *
 * `sessionStorage` is scoped to the tab, so the two windows simply stop sharing
 * board state and the whole cross-tab drift class disappears.
 *
 * Cost, accepted deliberately: a NEW tab does not inherit the board. That is
 * fine — the board is re-resolved from the SERVER on boot, never trusted from
 * storage: students via `whoami`'s resolved membership (App.tsx), tutors via
 * `listTutorBoards` (TutorPage), and selecting a student re-pins their board.
 * Storage is a within-tab cache, not the source of truth.
 */
export function getBoard(): string | null {
  try {
    return sessionStorage.getItem(BOARD_KEY);
  } catch {
    // Private-mode / blocked storage: treat as "no board picked". The student
    // re-picks each session rather than the app failing to boot.
    return null;
  }
}

export function setBoard(slug: string): void {
  try {
    sessionStorage.setItem(BOARD_KEY, slug);
    // Evict the pre-BOARD-TAB localStorage value. Nothing reads it any more, so
    // leaving it behind would only mislead the next person debugging a board bug
    // in devtools. One-shot self-clean; harmless once already gone.
    localStorage.removeItem(BOARD_KEY);
  } catch {
    /* see getBoard */
  }
}

export function clearBoard(): void {
  try {
    sessionStorage.removeItem(BOARD_KEY);
    localStorage.removeItem(BOARD_KEY); // see setBoard
  } catch {
    /* see getBoard */
  }
}

/**
 * ADM-CH — the ADMIN'S board, chosen by the board switcher on `/admin`, kept in
 * a SEPARATE key from the student board. Admin content is board-scoped (ingest,
 * add-chapter), but the founder is admin-only and has no student board to
 * borrow; before this, `x-board` was simply absent → "no board" on every admin
 * content call. This is scoped to `/admin` exactly like `x-profile: admin`
 * (below): reading it only while on `/admin` keeps it from ever polluting the
 * student board key a founder-who-is-also-a-student relies on at `/`.
 */
const ADMIN_BOARD_KEY = "b2c.admin.board";

// BOARD-TAB (S151) — per-tab for the same reason as the student board above: two
// `/admin` tabs on different boards would otherwise flip one shared value under
// each other. AdminPage already falls back to the first board when unset, so a
// fresh tab lands sanely.
export function getAdminBoard(): string | null {
  try {
    return sessionStorage.getItem(ADMIN_BOARD_KEY);
  } catch {
    return null;
  }
}

export function setAdminBoard(slug: string): void {
  try {
    sessionStorage.setItem(ADMIN_BOARD_KEY, slug);
    localStorage.removeItem(ADMIN_BOARD_KEY); // evict the pre-BOARD-TAB value
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
        // S125 — THE URL IS THE ADMIN PROFILE SELECTOR. While the tab is on
        // `/admin`, every call carries `x-profile: admin` regardless of the
        // stored persona, so `me` (and every `admin.*` call) resolves the admin
        // membership instead of the student one a founder also holds.
        //
        // 🔴 URL-SCOPED, NOT PERSISTED. This deliberately does NOT `setPersona`.
        // Writing "admin" to localStorage would make `/` resolve admin too and
        // bounce the founder — who is also a student — out of the student app
        // for the rest of the session. Reading the pathname per-request keeps the
        // admin profile alive ONLY while physically on `/admin`; leaving the URL
        // restores the persona with no cleanup.
        //
        // ⚠️ It SELECTS, it does not grant (context.ts): a non-admin sending this
        // asks for a row they do not hold and gets NO_MEMBERSHIP. App.tsx's boot
        // never fires the `me` fetch for such a visitor — it renders the same
        // not-found door an off-list admin gets — so that 403 is never reached.
        const onAdmin = window.location.pathname.replace(/\/+$/, "") === "/admin";
        const p = onAdmin ? "admin" : getPersona();
        // ADM-CH — on `/admin` the board comes from the admin switcher, not the
        // student board key. Same URL-scoping rationale as `x-profile: admin`.
        const board = onAdmin ? getAdminBoard() : b;
        return {
          ...(board ? { "x-board": board } : {}),
          ...(p ? { "x-profile": p } : {}),
        };
      },
      fetch: (url, opts) => fetch(url, { ...opts, credentials: "include" }),
    }),
  ],
});
