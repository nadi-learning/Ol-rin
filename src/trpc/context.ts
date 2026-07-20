import type { Context as HonoContext } from "hono";
import { eq } from "drizzle-orm";
import { board as boardTable } from "@b2c/kernel/schema";
import { isRole, type Role } from "@b2c/kernel/contracts";
import { auth } from "../auth/auth";
import { db } from "../db/client";

/**
 * Request context (S1).
 *  - `realUser`  — the Better Auth session user (id/email/name) or null.
 *  - `board`     — resolved from the `x-board` header (slug → board row), or
 *                  null. In prod this maps to the subdomain; in dev the FE/probe
 *                  sends the header. `board` is a global (non-RLS) table.
 *  - `profile`   — the ACTIVE ROLE for this request, from the `x-profile` header.
 *                  Sibling of `x-board`, and load-bearing for the same reason:
 *                  since S123 one email may hold a student AND a tutor AND a
 *                  parent row on the same board, so "which membership is this"
 *                  is no longer answerable from (user, board) alone.
 *  - `headers`   — passed through for Better Auth session re-reads if needed.
 *
 * 🔴 `profile` IS A CLAIM, NOT A CAPABILITY. It only ever SELECTS among the
 * memberships this person already has — `requireMembership` filters on it and
 * throws NoMembershipError if they hold no such row. Sending `x-profile: admin`
 * therefore grants nothing; it asks for a row that will not be found. Never use
 * this value as the role itself; use the one that came back from the database.
 *
 * No DB writes here. The per-request RLS board claim is set by authedProcedure
 * (init.ts), which wraps the resolver in withBoard.
 */
const BOARD_HEADER = "x-board";
const PROFILE_HEADER = "x-profile";

export async function createContext(c: HonoContext) {
  const headers = c.req.raw.headers;

  const session = await auth.api.getSession({ headers });
  const realUser = session?.user
    ? {
        id: session.user.id,
        email: session.user.email,
        name: session.user.name ?? null,
      }
    : null;

  const boardSlug = headers.get(BOARD_HEADER);
  let board: { id: string; slug: string } | null = null;
  if (boardSlug) {
    const [row] = await db
      .select({ id: boardTable.id, slug: boardTable.slug })
      .from(boardTable)
      .where(eq(boardTable.slug, boardSlug))
      .limit(1);
    if (row) board = row;
  }

  // Shape-checked here, membership-checked in requireMembership. An unknown
  // string becomes null rather than an error: a bad header should fall back to
  // the deterministic default, not 400 someone out of the app.
  const rawProfile = headers.get(PROFILE_HEADER);
  const profile: Role | null = isRole(rawProfile) ? rawProfile : null;

  return { realUser, board, profile, headers };
}

export type Context = Awaited<ReturnType<typeof createContext>>;
