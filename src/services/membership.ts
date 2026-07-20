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
import { and, eq, sql } from "drizzle-orm";
import type { PgTransaction } from "drizzle-orm/pg-core";
import { appUser, membership } from "@b2c/kernel/schema";
import { DEFAULT_ROLE, isSelfAssignableRole, type Role } from "@b2c/kernel/contracts";

/**
 * The tie-break when a request does NOT name a profile (S123).
 *
 * One email can now hold several roles on one board, so every membership read
 * needs a defined answer for "which one" even with no `x-profile`. Student
 * first: it is the role almost everyone has, the only one minted automatically,
 * and the least privileged — so an unlabelled request resolves to the SMALLEST
 * capability the person holds, never the largest. `created_at` then `id` break
 * remaining ties so the result is stable across replicas and restarts.
 *
 * 🔴 This is a DETERMINISM guarantee, not an authorisation one. It exists so
 * that two identical requests cannot disagree; it is not a substitute for the
 * role filter above.
 */
function profileOrder() {
  return sql`case ${membership.role}
    when 'student' then 0
    when 'parent'  then 1
    when 'tutor'   then 2
    when 'admin'   then 3
    else 4 end, ${membership.createdAt} asc, ${membership.id} asc`;
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
  /** False only for a self-assigned parent/tutor still waiting on an admin. */
  enabled: boolean;
};

export async function resolveMembership(
  tx: PgTransaction<any, any, any>,
  args: {
    email: string;
    name: string | null;
    board: { id: string; slug: string };
    /**
     * WHICH PROFILE the person is asking for (the landing persona).
     *
     * 🔴 S123 CHANGED THIS FROM A CLAIM INTO A SELECTOR, on the founder's call:
     * "there is no construct like self promote." It used to MINT the role it
     * named (disabled, pending an admin). It no longer mints anything but a
     * student — a tutor or parent row can be created ONLY by `grantRole`.
     *
     * So this now means: look up MY row for this role. Found → that is the
     * session. Absent → NoMembershipError, and the FE shows the waiting-room
     * signboard. Nothing is written on the way past.
     */
    intendedRole?: string | null;
  },
): Promise<ResolvedMembership> {
  const { email, name, board, intendedRole } = args;

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
  //
  // S123: scoped to the REQUESTED profile. Without this filter the widened
  // unique would let a returning tutor's read match their student row (or the
  // reverse — the exact report that opened S123), because the pick among
  // several matching rows was arbitrary. `profileOrder` keeps the unfiltered
  // case (no persona sent) deterministic rather than accidental.
  // 🔴 ASKED-FOR vs NOT-ASKED are different questions, and collapsing them was a
  // real bug in the first cut of this slice. Defaulting `wanted` to 'student'
  // when no persona arrived meant a tutor logging in found no STUDENT row, fell
  // to the mint branch, and was handed a freshly-created student membership —
  // silently manufacturing a second profile on every login, and landing them on
  // the student app. That is the S123 report wearing a different hat.
  //
  //   named a profile  → that row exactly, or a miss (no substitute)
  //   named nothing    → whichever profile they already hold (profileOrder)
  const wanted: Role | null = isSelfAssignableRole(intendedRole) ? intendedRole : null;
  const [existing] = await tx
    .select({ role: membership.role, enabled: membership.enabled })
    .from(membership)
    .where(
      and(
        eq(membership.userId, user.id),
        eq(membership.boardId, board.id),
        ...(wanted ? [eq(membership.role, wanted)] : []),
      ),
    )
    .orderBy(profileOrder())
    .limit(1);

  let role: string;
  let enabled: boolean;
  if (existing) {
    role = existing.role;
    enabled = existing.enabled;
  } else if (wanted && wanted !== DEFAULT_ROLE) {
    // 🔴 NO SELF-PROMOTE (founder, S123). Asking for a tutor/parent profile you
    // do not hold creates NOTHING — not even the disabled placeholder row the
    // pre-S123 code minted. It is a miss, and the waiting-room signboard is the
    // answer to a miss.
    //
    // Minting a disabled row here would look harmless and is not: it becomes a
    // real membership that `whoami` lists and the admin People page shows, so a
    // curious click would manufacture a pending tutor application. That is how
    // the founder ended up holding a disabled tutor row they never asked for.
    throw new NoMembershipError(email, board.slug);
  } else {
    // 3. First entry on this board — mint it. DoNothing on conflict covers the
    // concurrent-login race (two tabs, one new user): the loser's insert is a
    // no-op rather than an error, and both return the same answer the winner
    // wrote, so the result is still correct.
    //
    // S123: the ONLY role this path can create is `student`. The branch above
    // returned for everything else, so there is no longer a claim to honour
    // here — `wanted === DEFAULT_ROLE` is an invariant of reaching this line,
    // and a student is enabled on arrival because there is nobody to wait for.
    role = DEFAULT_ROLE;
    enabled = true;
    await tx
      .insert(membership)
      .values({ userId: user.id, boardId: board.id, role, enabled })
      .onConflictDoNothing({
        // Must match the S123 unique exactly. Left at (user, board) this would
        // name a constraint that no longer exists and throw at runtime — and
        // only on the concurrent-login race, i.e. almost never in a probe.
        target: [membership.userId, membership.boardId, membership.role],
      });
    // 🔴 Re-read after a DoNothing. On the losing side of the race the insert
    // wrote nothing, so the local `role`/`enabled` describe a row that does not
    // exist — and if the two tabs claimed different personas, returning the
    // loser's claim would hand back a role the database disagrees with.
    const [settled] = await tx
      .select({ role: membership.role, enabled: membership.enabled })
      .from(membership)
      .where(
        and(
          eq(membership.userId, user.id),
          eq(membership.boardId, board.id),
          eq(membership.role, role),
        ),
      )
      .limit(1);
    if (settled) {
      role = settled.role;
      enabled = settled.enabled;
    }
  }

  return {
    user: { id: user.id, email: user.email, name: user.name },
    board,
    role,
    enabled,
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

  // 🔴 S123 CHANGED WHAT THIS FUNCTION DOES, and the change is the point of the
  // slice. Targeting the new (user, board, ROLE) unique means granting `tutor`
  // to someone who is already a `student` now ADDS a second profile beside the
  // first instead of overwriting it. That is the founder's construct: one email,
  // several profiles, different content in each.
  //
  // It also means this is no longer a way to REMOVE a role — granting student to
  // a tutor leaves the tutor row standing. Taking a profile away is a delete,
  // and deliberately does not live behind an upsert.
  //
  // 🔑 ENABLED travels with the grant, and must. This is the ONLY way out of
  // the waiting room a parent/tutor sits in — an admin setting the role without
  // switching it on would leave them staring at the same "reach out to us"
  // board they were already looking at. Granting a role IS agreeing to it;
  // there is no third state. Since S123 it is also the only way a non-student
  // row comes into existence at all.
  await tx
    .insert(membership)
    .values({ userId: user.id, boardId: board.id, role, enabled: true })
    .onConflictDoUpdate({
      target: [membership.userId, membership.boardId, membership.role],
      set: { role, enabled: true },
    });

  return {
    user: { id: user.id, email: user.email, name: user.name },
    board,
    role,
    enabled: true,
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
  args: {
    email: string;
    board: { id: string; slug: string };
    /**
     * WHICH profile this request means (`ctx.profile`, from `x-profile`).
     *
     * 🔴 THE FILTER IS THE WHOLE SAFETY STORY OF S123. Since the unique widened
     * to (user, board, role) this query can match several rows, and it used to
     * take `.limit(1)` with no ORDER BY — i.e. an arbitrary one. Passing the
     * profile makes the answer exact.
     *
     * When ABSENT (probes, older clients, anything pre-S123) we do NOT fall back
     * to an arbitrary row: `profileOrder` picks by explicit precedence, so the
     * answer stays deterministic either way. Absent means "you didn't say", not
     * "any will do".
     */
    profile?: Role | null;
  },
): Promise<{ userId: string; role: string; enabled: boolean }> {
  const { email, board, profile } = args;
  const [user] = await tx
    .select({ id: appUser.id })
    .from(appUser)
    .where(eq(appUser.email, email))
    .limit(1);
  if (!user) throw new NoMembershipError(email, board.slug);

  const [m] = await tx
    .select({ role: membership.role, enabled: membership.enabled })
    .from(membership)
    .where(
      and(
        eq(membership.userId, user.id),
        eq(membership.boardId, board.id),
        // Asked for a specific profile → that row or nothing. Not "that row, or
        // else something else": silently serving a student their tutor surface
        // (or the reverse — the S123 report) is the bug being fixed.
        ...(profile ? [eq(membership.role, profile)] : []),
      ),
    )
    .orderBy(profileOrder())
    .limit(1);
  if (!m) throw new NoMembershipError(email, board.slug);

  // ⚠️ Returned, NOT enforced. This function answers "do they belong here",
  // and a disabled parent still belongs — they are waiting, not rejected.
  // Throwing here would 403 them out of the very screen that tells them who to
  // call. The gate is a RENDER decision (App.tsx), which is why it travels as
  // data rather than as an exception.
  return { userId: user.id, role: m.role, enabled: m.enabled };
}
