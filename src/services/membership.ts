/**
 * Membership resolution — the b2c side of login (Option B / F3-B).
 *
 * Better Auth authenticates a Google identity (users row, by email). This
 * service links that identity into the spine:
 *   1. upsert app_user by email (the spine's identity key — global table)
 *   2. read whitelist(board, email) — RLS-scoped to the active board
 *   3. whitelisted → upsert membership(user, board, role); else NOT_WHITELISTED
 *
 * Runs INSIDE withBoard(boardId) so the RLS board claim is set: the whitelist
 * read and membership write both require board_id = claim. app_user is global
 * (no RLS) so its upsert is unaffected.
 *
 * M11 (ai-build-miss): this is the REAL enablement path for membership. The
 * probe must NOT seed membership directly — it must drive resolveMembership so
 * the checked side (a future protectedProcedure requiring membership) and the
 * set side (here) are exercised by the same flow.
 */
import { and, eq } from "drizzle-orm";
import type { PgTransaction } from "drizzle-orm/pg-core";
import { appUser, membership, whitelist } from "@b2c/kernel/schema";

export class NotWhitelistedError extends Error {
  readonly code = "NOT_WHITELISTED";
  constructor(email: string, boardSlug: string) {
    super(`${email} is not whitelisted for board ${boardSlug}`);
    this.name = "NotWhitelistedError";
  }
}

export class NoMembershipError extends Error {
  readonly code = "NO_MEMBERSHIP";
  constructor(email: string, boardSlug: string) {
    super(`${email} has no membership on board ${boardSlug}`);
    this.name = "NoMembershipError";
  }
}

export type ResolvedMembership = {
  user: { id: string; email: string; name: string | null };
  board: { id: string; slug: string };
  role: string;
};

export async function resolveMembership(
  tx: PgTransaction<any, any, any>,
  args: { email: string; name: string | null; board: { id: string; slug: string } },
): Promise<ResolvedMembership> {
  const { email, name, board } = args;

  // 1. upsert app_user by email (global; insert-or-fetch). On re-login keep the
  // existing row; backfill name if it was null.
  const [user] = await tx
    .insert(appUser)
    .values({ email, name })
    .onConflictDoUpdate({
      target: appUser.email,
      set: { name },
    })
    .returning();
  if (!user) throw new Error("app_user upsert returned no row");

  // 2. whitelist lookup (RLS-scoped to the active board).
  const [wl] = await tx
    .select()
    .from(whitelist)
    .where(and(eq(whitelist.boardId, board.id), eq(whitelist.email, email)))
    .limit(1);
  if (!wl) throw new NotWhitelistedError(email, board.slug);

  // 3. upsert membership(user, board, role) — idempotent on re-login.
  await tx
    .insert(membership)
    .values({ userId: user.id, boardId: board.id, role: wl.role })
    .onConflictDoNothing({
      target: [membership.userId, membership.boardId, membership.role],
    });

  return {
    user: { id: user.id, email: user.email, name: user.name },
    board,
    role: wl.role,
  };
}

/**
 * The CHECK side of the access gate (M11) — asserts an ALREADY-EXISTING
 * membership for (email, board). Used by protectedProcedure for post-onboarding
 * surfaces (e.g. revision.getSlide); unlike `me` it never creates one. Runs
 * inside withBoard, so the membership read is RLS-scoped to the active board:
 * a membership on another board is invisible and counts as absent.
 *
 * app_user is global (resolve the id by email); membership is board-scoped.
 */
export async function requireMembership(
  tx: PgTransaction<any, any, any>,
  args: { email: string; board: { id: string; slug: string } },
): Promise<{ userId: string; role: string }> {
  const { email, board } = args;
  const [user] = await tx
    .select({ id: appUser.id })
    .from(appUser)
    .where(eq(appUser.email, email))
    .limit(1);
  if (!user) throw new NoMembershipError(email, board.slug);

  const [m] = await tx
    .select({ role: membership.role })
    .from(membership)
    .where(and(eq(membership.userId, user.id), eq(membership.boardId, board.id)))
    .limit(1);
  if (!m) throw new NoMembershipError(email, board.slug);

  return { userId: user.id, role: m.role };
}
