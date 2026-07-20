/**
 * Membership resolution — the b2c side of login (Option B / F3-B).
 *
 * Better Auth authenticates an identity (users row, by email). This service
 * links that identity into the spine:
 *   1. upsert app_user by email (the spine's identity key — global table)
 *   2. read the EXISTING membership(user, board) and return its role if present
 *   3. else create one at DEFAULT_ROLE ('student')
 *
 * Slice C (S110, founder call): **the platform is no longer gated.** The
 * whitelist is gone; anyone who signs in becomes a student. Roles above student
 * are granted afterwards by an admin via `grantRole` — never pre-invited.
 *
 * 🔴 STEP 2 IS LOAD-BEARING. This runs on EVERY login. A blind upsert to
 * 'student' here would silently demote every tutor, parent and admin the first
 * time they signed in again — the single worst regression this slice can cause,
 * and one that nothing downstream would catch (they would simply see the
 * student surface and assume a routing bug). Read first, create only if absent.
 * `probe_auth_membership`'s no-downgrade leg exists solely to hold this line.
 *
 * Runs INSIDE withBoard(boardId) so the RLS board claim is set: the membership
 * read and write both require board_id = claim. app_user is global (no RLS) so
 * its upsert is unaffected.
 *
 * M11 (ai-build-miss): this is the REAL enablement path for a student's own
 * membership. The probe must NOT seed membership directly — it must drive
 * resolveMembership so the checked side (protectedProcedure) and the set side
 * (here) are exercised by the same flow. For roles ABOVE student the real set
 * side is `grantRole`, which `admin.setRole` and every seed/probe also drive.
 */
import { and, eq } from "drizzle-orm";
import type { PgTransaction } from "drizzle-orm/pg-core";
import { appUser, membership } from "@b2c/kernel/schema";
import { DEFAULT_ROLE, type Role } from "@b2c/kernel/contracts";

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

  // 2. 🔴 READ the existing membership FIRST and keep its role. See the header:
  // this is what stops every login from demoting a tutor/parent/admin back to
  // 'student'. RLS-scoped to the active board, so a membership on another board
  // is invisible here and correctly counts as absent.
  const [existing] = await tx
    .select({ role: membership.role })
    .from(membership)
    .where(and(eq(membership.userId, user.id), eq(membership.boardId, board.id)))
    .limit(1);

  let role: string;
  if (existing) {
    role = existing.role;
  } else {
    // 3. First entry on this board — create at the default role. DoNothing on
    // conflict covers the concurrent-login race (two tabs, one new user): the
    // loser's insert is a no-op rather than an error, and both return 'student'
    // — which is what the winner wrote anyway, so the answer is still correct.
    role = DEFAULT_ROLE;
    await tx
      .insert(membership)
      .values({ userId: user.id, boardId: board.id, role })
      .onConflictDoNothing({
        target: [membership.userId, membership.boardId],
      });
  }

  return {
    user: { id: user.id, email: user.email, name: user.name },
    board,
    role,
  };
}

/**
 * The SET side for a role — S109. Upserts the person and FORCE-SETS their role
 * on this board, last writer wins.
 *
 * This is the replacement for `insert(whitelist) → resolveMembership`, which
 * was the only way to mint a tutor/parent/admin. Every seed and probe that used
 * that pair now calls this instead, and so does `admin.setRole` — so the M11
 * discipline survives the whitelist's death: the enablement path a probe drives
 * is the same one the admin UI drives, not a look-alike.
 *
 * Returns `ResolvedMembership` deliberately — identical to `resolveMembership`,
 * so the ~34 call sites keep reading `.user.id` off the result unchanged.
 *
 * Runs inside withBoard(board.id): the membership write needs the RLS claim.
 * `app_user` is global (no RLS), so its upsert is unaffected.
 */
export async function grantRole(
  tx: PgTransaction<any, any, any>,
  args: {
    email: string;
    name: string | null;
    board: { id: string; slug: string };
    role: Role;
  },
): Promise<ResolvedMembership> {
  const { email, name, board, role } = args;

  const [user] = await tx
    .insert(appUser)
    .values({ email, name })
    .onConflictDoUpdate({ target: appUser.email, set: { name } })
    .returning();
  if (!user) throw new Error("app_user upsert returned no row");

  // Force-set: the point of this function is to CHANGE a role, so a conflict
  // must overwrite rather than no-op. Targets (user, board) — the S109 unique.
  await tx
    .insert(membership)
    .values({ userId: user.id, boardId: board.id, role })
    .onConflictDoUpdate({
      target: [membership.userId, membership.boardId],
      set: { role },
    });

  return { user: { id: user.id, email: user.email, name: user.name }, board, role };
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
