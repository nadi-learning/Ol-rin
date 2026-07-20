/**
 * admin_users — Slice D: the admin PEOPLE surface.
 *
 * This service replaces the operational capability the whitelist provided. With
 * the whitelist dead (Slice C) anyone who signs in is a student; this is the
 * only way anyone becomes a tutor, parent or admin.
 *
 * Procedures (all adminProcedure, board-scoped): listPeople · findByEmail ·
 * setRole · listLinks · linkStudent · unlinkStudent.
 *
 * 🔑 THE LOAD-BEARING DISTINCTION — `users` vs `app_user` (the two-user-tables
 * trap). The founder's locked decision is "roles are granted AFTER the person
 * has signed in once. No pre-invite." Enforcing that means asking the right
 * table:
 *   - `users`     — Better Auth's. A row here means a REAL authenticated
 *                   identity. This is the only proof of "has signed in".
 *   - `app_user`  — the spine's. Written by `resolveMembership` on login, but
 *                   ALSO by `grantRole` for whatever email it is handed — every
 *                   seed mints these for people who have never logged in.
 * So `app_user` is NOT proof of sign-in. If `assertHasSignedIn` checked it, an
 * admin could type any address and mint a tutor — which is the pre-invite the
 * founder deleted, rebuilt in the admin panel. We check `users`, by email.
 * `probe_admin_people` asserts this directly so it cannot quietly regress.
 *
 * Both `users` and `app_user` are GLOBAL (no RLS); `membership`, `tutor_student`
 * and `parent_child` are board-scoped and FORCE-RLS'd, so every read and write
 * below is automatically confined to ctx.board by running inside ctx.tx.
 *
 * M11: `setRole` delegates to `grantRole` — the SAME helper every seed and probe
 * drives. The path the probe exercises is the path the admin UI exercises, not a
 * look-alike.
 */
import { and, eq, sql } from "drizzle-orm";
import { alias, type PgTransaction } from "drizzle-orm/pg-core";
import { appUser, membership, parentChild, tutorStudent, users } from "@b2c/kernel/schema";
import type { Role } from "@b2c/kernel/contracts";
import { grantRole } from "./membership";

type Tx = PgTransaction<any, any, any>;

// ───────────────────────────── errors ─────────────────────────────

/**
 * The person has no Better Auth identity — they have never signed in. Distinct
 * from "has no membership on this board", which is fine and grantable.
 */
export class UserNotFoundError extends Error {
  readonly code = "USER_NOT_FOUND";
  constructor(email: string) {
    super(`${email} has never signed in — ask them to sign in once, then grant the role`);
    this.name = "UserNotFoundError";
  }
}

/**
 * An admin may not change their OWN role. Without this an admin can demote
 * themselves to student and lock the board out of its only people surface —
 * recoverable only by a DB write. Checked on app_user id, not email.
 */
export class CannotChangeOwnRoleError extends Error {
  readonly code = "CANNOT_CHANGE_OWN_ROLE";
  constructor() {
    super("You cannot change your own role");
    this.name = "CannotChangeOwnRoleError";
  }
}

/** A link endpoint is not on this board, or does not hold the role the link requires. */
export class InvalidLinkError extends Error {
  readonly code = "INVALID_LINK";
  constructor(message: string) {
    super(message);
    this.name = "InvalidLinkError";
  }
}

// ───────────────────────────── reads ─────────────────────────────

export type Person = {
  userId: string;
  email: string;
  name: string | null;
  role: string;
  /** false ⇒ has a membership but no Better Auth identity (seeded, never logged in). */
  hasSignedIn: boolean;
};

/**
 * Everyone with a membership on THIS board (RLS-scoped), newest first.
 *
 * `hasSignedIn` is surfaced rather than filtered: seeds legitimately create
 * memberships for people who have never logged in, and hiding them would make
 * the list disagree with the DB for no stated reason. The admin sees the truth
 * and `setRole` is what enforces the rule.
 */
export async function listPeople(tx: Tx): Promise<Person[]> {
  const rows = await tx
    .select({
      userId: appUser.id,
      email: appUser.email,
      name: appUser.name,
      role: membership.role,
      authId: users.id,
    })
    .from(membership)
    .innerJoin(appUser, eq(appUser.id, membership.userId))
    // LEFT join — a membership without a Better Auth row is real and must still
    // list. An inner join here would silently drop seeded people (the spurious
    // zero this codebase has been bitten by before).
    .leftJoin(users, eq(users.email, appUser.email))
    .orderBy(sql`${membership.createdAt} desc`);

  return rows.map((r) => ({
    userId: r.userId,
    email: r.email,
    name: r.name,
    role: r.role,
    hasSignedIn: r.authId !== null,
  }));
}

export type FoundPerson = {
  email: string;
  name: string | null;
  hasSignedIn: boolean;
  /** Their role on THIS board, or null if they have no membership here yet. */
  role: string | null;
};

/**
 * Exact-email lookup across the GLOBAL identity tables — the counterpart to
 * `listPeople`.
 *
 * Why global: with open signup a person signs up on whichever board they landed
 * on, so someone an admin wants to make a tutor here may have no membership here
 * at all. `listPeople` answers "who is on my board"; this answers "does this
 * exact address exist anywhere", which is what makes granting possible. Exact
 * match only — no prefix search — so it cannot be used to enumerate the user
 * table.
 */
export async function findByEmail(tx: Tx, email: string): Promise<FoundPerson | null> {
  const needle = email.trim().toLowerCase();

  const [authRow] = await tx
    .select({ email: users.email, name: users.name })
    .from(users)
    .where(sql`lower(${users.email}) = ${needle}`)
    .limit(1);

  const [spineRow] = await tx
    .select({ id: appUser.id, email: appUser.email, name: appUser.name })
    .from(appUser)
    .where(sql`lower(${appUser.email}) = ${needle}`)
    .limit(1);

  if (!authRow && !spineRow) return null;

  // Membership is board-scoped (RLS): absent here just means "not on this board".
  let role: string | null = null;
  if (spineRow) {
    const [m] = await tx
      .select({ role: membership.role })
      .from(membership)
      .where(eq(membership.userId, spineRow.id))
      .limit(1);
    role = m?.role ?? null;
  }

  return {
    email: authRow?.email ?? spineRow!.email,
    name: authRow?.name ?? spineRow?.name ?? null,
    hasSignedIn: Boolean(authRow),
    role,
  };
}

// ───────────────────────────── setRole ─────────────────────────────

/**
 * Grant a role on this board. THE one enablement path (M11) — delegates to
 * `grantRole`, the same helper the seeds use.
 *
 * There is no revoke: revoking is `setRole('student')`. Deleting the membership
 * would orphan the student's own data and get recreated at their next login
 * anyway, so it would be destructive AND ineffective.
 *
 * An admin CAN mint another admin. Deliberate: the founder must not be the only
 * admin forever, and `CANNOT_CHANGE_OWN_ROLE` already removes the way this locks
 * anyone out.
 */
export async function setRole(
  tx: Tx,
  args: {
    board: { id: string; slug: string };
    actorUserId: string;
    email: string;
    role: Role;
  },
): Promise<Person> {
  const { board, actorUserId, email, role } = args;
  const needle = email.trim().toLowerCase();

  // 1. Must have a Better Auth identity — see the header. This is what makes
  // "no pre-invite" real rather than decorative.
  const [authRow] = await tx
    .select({ email: users.email, name: users.name })
    .from(users)
    .where(sql`lower(${users.email}) = ${needle}`)
    .limit(1);
  if (!authRow) throw new UserNotFoundError(email);

  // 2. Refuse self-change BEFORE writing. Resolved on app_user id (the actor's
  // membership id), never on the email string — case and aliasing make string
  // comparison the wrong instrument for an authorization check.
  const [target] = await tx
    .select({ id: appUser.id, name: appUser.name })
    .from(appUser)
    .where(sql`lower(${appUser.email}) = ${needle}`)
    .limit(1);
  if (target && target.id === actorUserId) throw new CannotChangeOwnRoleError();

  // 3. The one write path. Force-sets the role on (user, board).
  // `grantRole` upserts app_user.name unconditionally, so passing a null Better
  // Auth name would WIPE a display name the spine already holds — granting a
  // role must not rename anyone. Keep whichever name we actually have.
  const granted = await grantRole(tx, {
    email: authRow.email,
    name: authRow.name ?? target?.name ?? null,
    board,
    role,
  });

  return {
    userId: granted.user.id,
    email: granted.user.email,
    name: granted.user.name,
    role: granted.role,
    hasSignedIn: true,
  };
}

// ───────────────────────────── links ─────────────────────────────

export type Link = {
  kind: "tutor" | "parent";
  adultUserId: string;
  adultEmail: string;
  adultName: string | null;
  studentUserId: string;
  studentEmail: string;
  studentName: string | null;
};

/**
 * Every tutor→student and parent→child link on THIS board (RLS-scoped).
 *
 * Both tables are FORCE-RLS'd, so an admin on one board cannot see the other's
 * links — asserted in the probe, because a leak here would expose the roster of
 * a board the admin has no membership on.
 */
export async function listLinks(tx: Tx): Promise<Link[]> {
  // app_user appears TWICE in each query (the adult and the student), so the
  // student side needs a real alias — drizzle's `alias()`, not a raw-SQL join,
  // so the column references stay typed and cannot drift from the schema.
  const studentUser = alias(appUser, "student_user");

  const cols = {
    adultUserId: appUser.id,
    adultEmail: appUser.email,
    adultName: appUser.name,
    studentUserId: studentUser.id,
    studentEmail: studentUser.email,
    studentName: studentUser.name,
  };

  // ORDER BY is load-bearing, not cosmetic. Without it Postgres may return these
  // in any order, so the list reshuffles after every mutation — and "Remove" is
  // a per-ROW button, so a reshuffle between render and click aims the delete at
  // a different link than the admin was looking at. Ordered by the adult then the
  // student so a given board always renders the same way.
  const tutorRows = await tx
    .select(cols)
    .from(tutorStudent)
    .innerJoin(appUser, eq(appUser.id, tutorStudent.tutorId))
    .innerJoin(studentUser, eq(studentUser.id, tutorStudent.studentId))
    .orderBy(appUser.email, studentUser.email);

  const parentRows = await tx
    .select(cols)
    .from(parentChild)
    .innerJoin(appUser, eq(appUser.id, parentChild.parentId))
    .innerJoin(studentUser, eq(studentUser.id, parentChild.studentId))
    .orderBy(appUser.email, studentUser.email);

  return [
    ...tutorRows.map((r) => ({ kind: "tutor" as const, ...r })),
    ...parentRows.map((r) => ({ kind: "parent" as const, ...r })),
  ];
}

/**
 * Resolve a (user, board) pair and assert the role the link requires.
 *
 * Both endpoints must hold a membership on THIS board. `linkStudent` is the
 * first write path to these tables outside seeds, and `tutor.ts`/`parent.ts`
 * read them as authorization facts — a link naming a non-tutor would grant a
 * student's data to someone the guards believe is staff. Validate on the way in;
 * the read side has no way to tell afterwards.
 */
async function resolveEndpoint(
  tx: Tx,
  args: { email: string; expectedRole: Role | "student"; label: string },
): Promise<string> {
  const needle = args.email.trim().toLowerCase();
  const [row] = await tx
    .select({ id: appUser.id, role: membership.role })
    .from(appUser)
    .innerJoin(membership, eq(membership.userId, appUser.id))
    .where(sql`lower(${appUser.email}) = ${needle}`)
    .limit(1);

  if (!row) {
    throw new InvalidLinkError(`${args.label} ${args.email} has no membership on this board`);
  }
  if (row.role !== args.expectedRole) {
    throw new InvalidLinkError(
      `${args.email} is a ${row.role} on this board, not a ${args.expectedRole}`,
    );
  }
  return row.id;
}

/**
 * Link an adult to a student on this board. Idempotent — re-linking the same
 * pair is a no-op, not an error, so a double-click cannot produce a duplicate
 * or a spurious failure.
 */
export async function linkStudent(
  tx: Tx,
  args: {
    boardId: string;
    kind: "tutor" | "parent";
    adultEmail: string;
    studentEmail: string;
  },
): Promise<{ linked: true }> {
  const { boardId, kind, adultEmail, studentEmail } = args;

  const adultId = await resolveEndpoint(tx, {
    email: adultEmail,
    expectedRole: kind,
    label: kind === "tutor" ? "Tutor" : "Parent",
  });
  const studentId = await resolveEndpoint(tx, {
    email: studentEmail,
    expectedRole: "student",
    label: "Student",
  });

  if (kind === "tutor") {
    await tx
      .insert(tutorStudent)
      .values({ boardId, tutorId: adultId, studentId })
      .onConflictDoNothing({
        target: [tutorStudent.boardId, tutorStudent.tutorId, tutorStudent.studentId],
      });
  } else {
    await tx
      .insert(parentChild)
      .values({ boardId, parentId: adultId, studentId })
      .onConflictDoNothing({
        // Includes boardId — S109 widened this unique; targeting the old
        // two-column form raises Postgres 42P10 (the bug seed_parent.ts hit).
        target: [parentChild.boardId, parentChild.parentId, parentChild.studentId],
      });
  }

  return { linked: true };
}

/**
 * Remove a link. Deletes the join row only — never the membership or any of the
 * student's data. Idempotent: unlinking an absent pair reports 0 and succeeds.
 */
export async function unlinkStudent(
  tx: Tx,
  args: {
    kind: "tutor" | "parent";
    adultUserId: string;
    studentUserId: string;
  },
): Promise<{ removed: number }> {
  const { kind, adultUserId, studentUserId } = args;

  const rows =
    kind === "tutor"
      ? await tx
          .delete(tutorStudent)
          .where(
            and(
              eq(tutorStudent.tutorId, adultUserId),
              eq(tutorStudent.studentId, studentUserId),
            ),
          )
          .returning({ id: tutorStudent.id })
      : await tx
          .delete(parentChild)
          .where(
            and(eq(parentChild.parentId, adultUserId), eq(parentChild.studentId, studentUserId)),
          )
          .returning({ id: parentChild.id });

  return { removed: rows.length };
}
