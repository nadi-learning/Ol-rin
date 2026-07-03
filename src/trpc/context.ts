import type { Context as HonoContext } from "hono";
import { eq } from "drizzle-orm";
import { board as boardTable } from "@b2c/kernel/schema";
import { auth } from "../auth/auth";
import { db } from "../db/client";

/**
 * Request context (S1).
 *  - `realUser`  — the Better Auth session user (id/email/name) or null.
 *  - `board`     — resolved from the `x-board` header (slug → board row), or
 *                  null. In prod this maps to the subdomain; in dev the FE/probe
 *                  sends the header. `board` is a global (non-RLS) table.
 *  - `headers`   — passed through for Better Auth session re-reads if needed.
 *
 * No DB writes here. The per-request RLS board claim is set by authedProcedure
 * (init.ts), which wraps the resolver in withBoard.
 */
const BOARD_HEADER = "x-board";

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

  return { realUser, board, headers };
}

export type Context = Awaited<ReturnType<typeof createContext>>;
