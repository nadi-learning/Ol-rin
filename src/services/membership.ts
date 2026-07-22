/**
 * Identity resolution — the b2c side of login (ID-1, S127/S128 redesign).
 *
 * ⚠️ FILENAME KEPT ON PURPOSE. The plan renames this "membership → identity",
 * but ~8 call sites that still belong to later slices (ID-2 admin, ID-3
 * onboarding, ID-4 tutor/parent) import from `./membership` and read the old
 * table. Renaming the file (or the exported symbols) now would churn code this
 * slice does not own and cannot yet compile. The rename is a cosmetic pass once
 * the tree is green (ID-4). The SEMANTICS below are already the new model.
 *
 * THE NEW MODEL (there is no `membership` table any more):
 *   - A person's identity is an `app_user` PROFILE, keyed (email, phone,
 *     user_type). The same email holds up to four distinct profiles
 *     (student/tutor/parent/admin), each its own id, each its own evidence.
 *   - "role" is the `user_type` of the profile the request signed in as — the
 *     `x-profile` header names it (ctx.profile). There is no per-board role row.
 *   - Being an OPERATIONAL tutor/parent/student needs the role-DETAIL row
 *     (tutor.boards[] / parent / student.board_id). Those are created by an
 *     admin (ID-2) or by onboarding (ID-3, the student), never here. A profile
 *     whose detail row is absent is a WAITING ROOM, not a capability — the exact
 *     "claim ≠ grant" line S123 drew, now enforced by row existence rather than
 *     an `enabled` flag.
 *
 * BOARD-BELONGING falls out of the schema, differently per role:
 *   - student: `student.board_id` is the ONE RLS-scoped identity column. A read
 *     under withBoard(ctx.board) sees the student row ONLY when its board_id
 *     matches — so "does this student belong on this board" is answered by RLS
 *     for free (no board column to compare by hand). Absent ⇒ not their board.
 *   - tutor: the `tutor` table is GLOBAL (a tutor spans boards); belonging is
 *     `ctx.board ∈ tutor.boards[]`, checked in code.
 *   - parent/admin: board-agnostic. A parent's board is transitively their
 *     child's; an admin is gated by the email whitelist, not a board.
 *
 * M11 (ai-build-miss): the SET side a probe drives must be the SET side the app
 * drives. Shell-mint is `ensureProfile` (login/`session.enter`); the role-detail
 * SET side is `grantRole` (admin/seeds) and, for a student, ID-3's onboarding —
 * never a direct table insert in a probe.
 */
import { and, eq } from "drizzle-orm";
import type { PgTransaction } from "drizzle-orm/pg-core";
import { appUser, student, tutor, parent } from "@b2c/kernel/schema";
import {
  DEFAULT_ROLE,
  generateReferralCode,
  type Role,
} from "@b2c/kernel/contracts";

type Tx = PgTransaction<any, any, any>;

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
  /**
   * The profile is OPERATIONAL — its role-detail row exists (and, for a tutor,
   * includes this board). False = the waiting room: the profile shell exists but
   * an admin has not set it up. Students are enabled the moment their `student`
   * row exists (ID-3); there is nobody to wait for.
   */
  enabled: boolean;
};

/**
 * Mint (or fetch) the board-less PROFILE SHELL for (email, userType). This is
 * decision 1's "login upserts app_user" — an identity shell, NOT an enrolment:
 * no board, no role-detail row, so it can never resurrect the "a read enrolled
 * the student on cbse" bug (that bug wrote a board-scoped row; this writes none).
 *
 * 🔴 READ-FIRST, DO NOT `onConflictDoUpdate` ON THE PROFILE UNIQUE. The unique
 * is (email, phone, user_type) NULLS NOT DISTINCT, and login always sends phone
 * NULL. Once onboarding fills the phone, the row is (email, '99…', user_type); a
 * later phone-NULL upsert would NOT conflict with it (null ≠ '99…') and would
 * INSERT A SECOND student profile. So we look the profile up by (email,
 * user_type) — the pair that is really unique per person — and only insert when
 * it is genuinely absent.
 *
 * `app_user` is GLOBAL (no RLS), so this needs no board claim; callers pass the
 * plain `db` transaction.
 *
 * referral_code: minted on first insert. A collision on the 7-char code (unique)
 * is astronomically unlikely at our scale (~31^7) and is NOT retried inside the
 * tx — a failed INSERT poisons a Postgres transaction, so a savepoint dance would
 * be the only way, and it is not worth it: the login errors, and the next attempt
 * mints a fresh code. Log-and-throw if it ever fires.
 */
export async function ensureProfile(
  tx: Tx,
  args: { email: string; name: string | null; userType: Role },
): Promise<{ id: string; email: string; name: string | null }> {
  const { email, name, userType } = args;

  const [existing] = await tx
    .select({ id: appUser.id, email: appUser.email, name: appUser.name })
    .from(appUser)
    .where(and(eq(appUser.email, email), eq(appUser.userType, userType)))
    .limit(1);
  if (existing) {
    // Backfill a name the shell was created without (a probe/seed may insert
    // email-only). Never overwrite an existing name — admin.setRole (S111)
    // deliberately preserves a spine name the auth provider does not have.
    if (!existing.name && name) {
      await tx.update(appUser).set({ name }).where(eq(appUser.id, existing.id));
      return { ...existing, name };
    }
    return existing;
  }

  const [row] = await tx
    .insert(appUser)
    .values({ email, name, userType, referralCode: generateReferralCode() })
    // Covers the concurrent-first-login race (two tabs): the loser's insert is a
    // no-op on the profile unique rather than an error. Target must name the
    // real unique exactly (NULLS NOT DISTINCT), or it throws at runtime.
    .onConflictDoNothing({
      target: [appUser.email, appUser.phone, appUser.userType],
    })
    .returning({ id: appUser.id, email: appUser.email, name: appUser.name });
  if (row) return row;

  // Lost the race (DoNothing wrote nothing) — the winner's row is now there.
  const [settled] = await tx
    .select({ id: appUser.id, email: appUser.email, name: appUser.name })
    .from(appUser)
    .where(and(eq(appUser.email, email), eq(appUser.userType, userType)))
    .limit(1);
  if (!settled) throw new Error(`ensureProfile: no row after conflict for ${email}/${userType}`);
  return settled;
}

/**
 * The CHECK side of the access gate (M11), consumed by protectedProcedure and
 * the voice-relay HTTP path. Resolves the profile named by `profile` (the
 * `x-profile` header) and answers "does this identity belong on this board, and
 * is the profile operational". Runs INSIDE withBoard(board.id) — the student read
 * below is RLS-scoped to the active board, which is what makes board-belonging
 * free.
 *
 * Throws NoMembershipError when the request is not OPERATIONAL on this board:
 *   - the named profile shell does not exist,
 *   - a student has no `student` row visible on this board (wrong board / not yet
 *     onboarded) — for a student, board-belonging IS membership,
 *   - a tutor whose `tutor.boards[]` does not include this board (preserves the
 *     old "a tutor off their board is 403'd" behaviour; the membership table used
 *     to enforce this by having no row there), or
 *   - a parent with no `parent` detail row.
 *
 * 🔑 THE WAITING ROOM IS NOT DECIDED HERE. A signed-in tutor/parent with a shell
 * but no detail row is board-LESS, so they never reach this function (they have
 * no `x-board` to send, and `me` is only fetched once boot has an operational
 * board). The FE renders AccessPending straight from `whoami`, which carries the
 * per-profile `enabled` flag. So this function only ever runs for a profile that
 * should be operational, and a non-operational result here is a genuine
 * mismatch (wrong board) that SHOULD 403 — not a waiting room to render.
 * `enabled` in the return is therefore always true; it is kept for the
 * ResolvedMembership/`me` shape and as a belt to the whoami braces.
 */
export async function requireMembership(
  tx: Tx,
  args: {
    email: string;
    board: { id: string; slug: string };
    /** WHICH profile this request means (ctx.profile). Absent ⇒ student. */
    profile?: Role | null;
  },
): Promise<{ userId: string; role: string; enabled: boolean }> {
  const { email, board } = args;
  const role: Role = args.profile ?? DEFAULT_ROLE;

  const [p] = await tx
    .select({ id: appUser.id })
    .from(appUser)
    .where(and(eq(appUser.email, email), eq(appUser.userType, role)))
    .limit(1);
  if (!p) throw new NoMembershipError(email, board.slug);

  if (role === "student") {
    // RLS-scoped: the student row is visible only if board_id = ctx.board. A
    // student on another board (or one who has not onboarded, so has no row at
    // all) reads absent here and correctly does not belong.
    const [s] = await tx
      .select({ userId: student.userId })
      .from(student)
      .where(eq(student.userId, p.id))
      .limit(1);
    if (!s) throw new NoMembershipError(email, board.slug);
    return { userId: p.id, role, enabled: true };
  }

  if (role === "tutor") {
    // GLOBAL table — readable under any board tx. Operational = a tutor detail
    // row that is active AND serves THIS board; anything else is off-board and
    // 403s (the old membership table 403'd it by simply having no row there).
    const [t] = await tx
      .select({ boards: tutor.boards, status: tutor.status })
      .from(tutor)
      .where(eq(tutor.userId, p.id))
      .limit(1);
    const boards = Array.isArray(t?.boards) ? (t!.boards as string[]) : [];
    if (!t || t.status !== "active" || !boards.includes(board.id)) {
      throw new NoMembershipError(email, board.slug);
    }
    return { userId: p.id, role, enabled: true };
  }

  if (role === "parent") {
    const [pr] = await tx
      .select({ status: parent.status })
      .from(parent)
      .where(eq(parent.userId, p.id))
      .limit(1);
    if (!pr || pr.status !== "active") throw new NoMembershipError(email, board.slug);
    return { userId: p.id, role, enabled: true };
  }

  // admin: the profile shell existing is enough to resolve identity here; the
  // whitelist (the real second lock) is re-checked in adminProcedure. Board is
  // irrelevant to an admin.
  return { userId: p.id, role, enabled: true };
}

/**
 * "Does this email belong on this board in ANY capacity?" — the gate for a
 * NON-SENSITIVE, role-agnostic byte read (question figures, `/content/image`).
 *
 * `requireMembership` answers belonging for ONE named profile, and it defaults
 * to `student` when no profile is given. But a plain `<img src>` cannot send the
 * `x-profile` header, so the byte routes have no persona to name — and a TUTOR
 * (or admin) viewing an authored figure has no `student` row, so the student
 * default 403s them (the spranav authoring-image bug). A rendered figure is not
 * a secret (it is shown to students by design; RLS still hides cross-board rows),
 * so the right question is simply "is this a real identity that belongs here" —
 * true if ANY of the person's profiles (student on this board / tutor serving it
 * / admin) belongs. Enumerate the person's real profiles and reuse the exact
 * per-role logic in `requireMembership`; allow if any passes.
 *
 * Runs inside withBoard(board.id) — the student branch's read is RLS-scoped, as
 * requireMembership requires.
 */
export async function belongsToBoardAnyRole(
  tx: Tx,
  args: { email: string; board: { id: string; slug: string } },
): Promise<boolean> {
  const profiles = await tx
    .select({ userType: appUser.userType })
    .from(appUser)
    .where(eq(appUser.email, args.email));

  for (const { userType } of profiles) {
    try {
      await requireMembership(tx, {
        email: args.email,
        board: args.board,
        profile: userType as Role,
      });
      return true;
    } catch (e) {
      if (e instanceof NoMembershipError) continue; // this profile doesn't belong; try the next
      throw e;
    }
  }
  return false;
}

/**
 * The SET side for a role (admin People + seeds) — grants a profile its
 * role-DETAIL row, the only way out of the waiting room. Upserts the profile
 * shell, then creates/activates the detail row for the role:
 *   - tutor  → tutor row, this board appended to boards[] (idempotent)
 *   - parent → parent row
 *   - admin  → shell only (admin has no board-scoped detail; the whitelist gates)
 *   - student→ NOT created here: a student row needs class/pronoun/hero/pet, all
 *     captured by onboarding (ID-3). grantRole(student) mints only the shell; the
 *     operational student row is onboarding's job. (Seeds that need a ready-made
 *     student create the `student` row directly with a class — that is a fixture,
 *     not the product's path.)
 *
 * Returns ResolvedMembership (enabled=true) so the ~1 call site (admin_users)
 * keeps reading `.user.id` unchanged.
 *
 * Runs inside withBoard(board.id): tutor/parent are GLOBAL so the claim is not
 * needed for them, but the caller already opened one and passing the scoped tx is
 * harmless.
 */
export async function grantRole(
  tx: Tx,
  args: {
    email: string;
    name: string | null;
    board: { id: string; slug: string };
    role: Role;
  },
): Promise<ResolvedMembership> {
  const { email, name, board, role } = args;
  const user = await ensureProfile(tx, { email, name, userType: role });

  if (role === "tutor") {
    // Append this board to boards[] without dropping any the tutor already
    // serves. Read-modify-write (the array is a jsonb blob, not a relation);
    // upsert the row on first grant.
    const [t] = await tx
      .select({ boards: tutor.boards })
      .from(tutor)
      .where(eq(tutor.userId, user.id))
      .limit(1);
    const boards = new Set(Array.isArray(t?.boards) ? (t!.boards as string[]) : []);
    boards.add(board.id);
    await tx
      .insert(tutor)
      .values({ userId: user.id, boards: [...boards], status: "active" })
      .onConflictDoUpdate({
        target: tutor.userId,
        set: { boards: [...boards], status: "active" },
      });
  } else if (role === "parent") {
    await tx
      .insert(parent)
      .values({ userId: user.id, status: "active" })
      .onConflictDoUpdate({ target: parent.userId, set: { status: "active" } });
  }
  // admin / student: shell only (see the header).

  return {
    user: { id: user.id, email: user.email, name: user.name },
    board,
    role,
    enabled: true,
  };
}

/**
 * The board-pick entry point (session.chooseBoard). Since ID-1 the student's
 * OPERATIONAL row (student.board_id + class) is minted by onboarding (ID-3, at
 * the about_you beat where the class is finally known), NOT here — so this
 * shrank to: validate the board (the caller already did) and ensure the profile
 * shell exists. It stays a distinct entry point because the FE onboarding flow
 * still calls it before about_you, and a working shell keeps that flow from 500ing
 * while ID-3 is unbuilt.
 *
 * Keeps the name `resolveMembership` and the ResolvedMembership return so the one
 * caller (session_boards.chooseBoard) is unchanged.
 */
export async function resolveMembership(
  tx: Tx,
  args: {
    email: string;
    name: string | null;
    board: { id: string; slug: string };
    /** The landing persona. Only self-assignable roles reach here; defaults to student. */
    intendedRole?: string | null;
  },
): Promise<ResolvedMembership> {
  const { email, name, board, intendedRole } = args;
  const role: Role =
    intendedRole === "tutor" || intendedRole === "parent" ? intendedRole : DEFAULT_ROLE;
  const user = await ensureProfile(tx, { email, name, userType: role });
  return {
    user: { id: user.id, email: user.email, name: user.name },
    board,
    role,
    // A freshly-picked board does not make a student operational on its own — the
    // student row is ID-3's. But chooseBoard's historical contract returned
    // enabled for a student, and the FE reads it only to decide the waiting room,
    // which students never see. Report the honest role-detail state.
    enabled: role === DEFAULT_ROLE,
  };
}
