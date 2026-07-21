/**
 * admin_users — ID-2: the admin PEOPLE + ASSIGNMENTS surface, rebuilt on the
 * profile model (S127 redesign). Replaces the operational capability the
 * whitelist provided: anyone who signs in is a student shell, and this is the
 * only way anyone becomes a tutor, parent or admin, or gets linked to a tutor.
 *
 * Procedures (all adminProcedure): listPeople · setRole · listLinkCandidates ·
 * listLinks · linkStudent · unlinkStudent.
 *
 * 🔑 THE MODEL SHIFT FROM SLICE-D. There is no `membership` / `tutor_student` /
 * `parent_child` any more:
 *   - A person's identity is one `app_user` PROFILE per (email, user_type). The
 *     same email holds up to four distinct profiles, each its own id.
 *   - "role" is the profile's `user_type`. Being OPERATIONAL needs the role-detail
 *     row (`tutor`/`parent`/`student`); `grantRole` creates it (M11: the one SET
 *     path the seeds also drive).
 *   - A tutor↔student link is `student.tutor_id`; a parent↔child link is
 *     `student.parent_id` — single-pointer columns that REPLACE the join tables.
 *     One tutor + one parent per student BY CONSTRUCTION.
 *   - Links are resolved by PROFILE ID via admin pickers, never by email. The old
 *     email→role `resolveEndpoint` resolver (the "spranav is admin not tutor"
 *     bug: one email, several profiles, a LIMIT-1 arbitrary pick) is DELETED.
 *
 * 🔑 SCOPE — GLOBAL vs BOARD. `app_user`/`users` are GLOBAL (no RLS), so
 * `listPeople` lists EVERY profile: a unified People list can only be global,
 * because a parent/admin profile has no board column to scope by. Board-scoped
 * reads (`listLinks`, the unlinked-student pickers) go through `student.board_id`,
 * which IS RLS'd, so running inside ctx.tx confines them to ctx.board for free.
 * `tutor.boards[]` is a jsonb array (a tutor spans boards), so tutor-on-this-board
 * filtering takes an explicit boardId rather than RLS.
 *
 * 🔑 THE TWO-USER-TABLES TRAP (kept from Slice D). `app_user` is NOT proof of
 * sign-in — `grantRole` mints app_user rows for any email, as every seed does.
 * "Has signed in" is a `users` (Better Auth) row, by email. `setRole` refuses an
 * email with no `users` row (USER_NOT_FOUND) so the founder's "no pre-invite"
 * rule stays real. `probe_admin_people` asserts this directly.
 */
import { and, desc, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { alias, type PgTransaction } from "drizzle-orm/pg-core";
import {
  appUser,
  masteryState,
  observation,
  parent,
  student,
  tutor,
  tutorAssignment,
  users,
} from "@b2c/kernel/schema";
import type { Role } from "@b2c/kernel/contracts";
import { grantRole } from "./membership";

type Tx = PgTransaction<any, any, any>;

// ───────────────────────────── errors ─────────────────────────────

/**
 * The person has no Better Auth identity — they have never signed in. Distinct
 * from "has no role-detail row here", which is fine and grantable.
 */
export class UserNotFoundError extends Error {
  readonly code = "USER_NOT_FOUND";
  constructor(email: string) {
    super(`${email} has never signed in — ask them to sign in once, then grant the role`);
    this.name = "UserNotFoundError";
  }
}

/**
 * An admin may not change their OWN identity's role. Resolved by EMAIL now, not
 * by profile id: a person's identity spans all four of their profiles, so "is
 * this me" is an email question. Without it an admin could grant their own email
 * a student profile and confuse their own portal.
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
  /** false ⇒ has a profile but no Better Auth identity (seeded, never logged in). */
  hasSignedIn: boolean;
};

/**
 * EVERY profile, newest first (GLOBAL — see the header). One row per app_user, so
 * one person's email can appear up to four times (student/tutor/parent/admin),
 * each its own id. `hasSignedIn` is a LEFT join to `users` by email: it is a
 * property of the identity, so all of a person's profiles share it.
 *
 * Surfaced rather than filtered: seeds legitimately mint profiles for people who
 * have never logged in, and hiding them would make the list disagree with the DB.
 * `setRole` is what enforces the "must have signed in" rule.
 */
export async function listPeople(tx: Tx): Promise<Person[]> {
  const rows = await tx
    .select({
      userId: appUser.id,
      email: appUser.email,
      name: appUser.name,
      role: appUser.userType,
      authId: users.id,
    })
    .from(appUser)
    .leftJoin(users, sql`lower(${users.email}) = lower(${appUser.email})`)
    .orderBy(desc(appUser.createdAt));

  return rows.map((r) => ({
    userId: r.userId,
    email: r.email,
    name: r.name,
    role: r.role,
    hasSignedIn: r.authId != null,
  }));
}

/** An adult a link can point at — a tutor (on this board) or a parent. */
export type AdultCandidate = { userId: string; email: string; name: string | null };
/** A student the LINK form may offer — one that is currently UNLINKED for this kind. */
export type StudentCandidate = {
  userId: string;
  email: string;
  name: string | null;
  class: string;
};

export type LinkCandidates = {
  tutors: AdultCandidate[];
  parents: AdultCandidate[];
  /** Students on this board with `tutor_id IS NULL` — the tutor-link picker's set. */
  unlinkedForTutor: StudentCandidate[];
  /** Students on this board with `parent_id IS NULL` — the parent-link picker's set. */
  unlinkedForParent: StudentCandidate[];
};

/**
 * The four picker feeds for the LINK form — every field is a PICKER, not a typed
 * email, so the same-email ambiguity is structurally impossible (an id is
 * chosen, never resolved). Adults are the ACTIVE tutors serving this board /
 * ACTIVE parents; the student sets are the unlinked-for-that-kind students on
 * this board. A linked student never appears (a re-link is a CHANGE from the
 * assignments list, which fires the handover snapshot).
 */
export async function listLinkCandidates(tx: Tx, boardId: string): Promise<LinkCandidates> {
  const tutors = await tx
    .select({ userId: appUser.id, email: appUser.email, name: appUser.name })
    .from(tutor)
    .innerJoin(appUser, eq(appUser.id, tutor.userId))
    .where(
      and(
        eq(tutor.status, "active"),
        // tutor.boards is a jsonb array of board ids; @> tests containment.
        sql`${tutor.boards} @> ${JSON.stringify([boardId])}::jsonb`,
      ),
    )
    .orderBy(appUser.email);

  const parents = await tx
    .select({ userId: appUser.id, email: appUser.email, name: appUser.name })
    .from(parent)
    .innerJoin(appUser, eq(appUser.id, parent.userId))
    .where(eq(parent.status, "active"))
    .orderBy(appUser.email);

  // Both student reads are RLS-scoped to ctx.board via student.board_id.
  const unlinkedForTutor = await tx
    .select({
      userId: student.userId,
      email: appUser.email,
      name: appUser.name,
      class: student.class,
    })
    .from(student)
    .innerJoin(appUser, eq(appUser.id, student.userId))
    .where(isNull(student.tutorId))
    .orderBy(appUser.email);

  const unlinkedForParent = await tx
    .select({
      userId: student.userId,
      email: appUser.email,
      name: appUser.name,
      class: student.class,
    })
    .from(student)
    .innerJoin(appUser, eq(appUser.id, student.userId))
    .where(isNull(student.parentId))
    .orderBy(appUser.email);

  return { tutors, parents, unlinkedForTutor, unlinkedForParent };
}

// ───────────────────────────── setRole ─────────────────────────────

/**
 * Grant a role to an email — THE one enablement path (M11), delegates to
 * `grantRole` (the seeds' helper). Under the profile model a "role change" is
 * additive: granting tutor to a student's email mints a DISTINCT tutor profile +
 * its detail row; it never rewrites the student profile's user_type (that is part
 * of the identity key and cannot change). There is no revoke here; removing a
 * profile is a delete, out of scope for the grant path.
 *
 * `actorEmail` is the signed-in admin's email — the self-change guard compares on
 * it (identity is per-email, spanning profiles), never on a profile id.
 */
export async function setRole(
  tx: Tx,
  args: {
    board: { id: string; slug: string };
    actorEmail: string;
    email: string;
    role: Role;
  },
): Promise<Person> {
  const { board, actorEmail, email, role } = args;
  const needle = email.trim().toLowerCase();

  // Refuse self-change before any write (lockout guard). Identity = email.
  if (needle === actorEmail.trim().toLowerCase()) throw new CannotChangeOwnRoleError();

  // Must have a Better Auth identity — the "no pre-invite" rule (see the header).
  const [authRow] = await tx
    .select({ email: users.email, name: users.name })
    .from(users)
    .where(sql`lower(${users.email}) = ${needle}`)
    .limit(1);
  if (!authRow) throw new UserNotFoundError(email);

  // Preserve a spine name the auth provider lacks: `grantRole` upserts
  // app_user.name, so passing a null auth name would wipe a display name the
  // profile already holds. Read the existing (email, role) profile's name first.
  const [existing] = await tx
    .select({ name: appUser.name })
    .from(appUser)
    .where(and(eq(appUser.email, authRow.email), eq(appUser.userType, role)))
    .limit(1);

  const granted = await grantRole(tx, {
    email: authRow.email,
    name: authRow.name ?? existing?.name ?? null,
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
 * Every tutor→student and parent→child assignment on THIS board (RLS-scoped via
 * `student.board_id`). Read straight off the single-pointer columns and resolved
 * to profiles by two aliased self-joins on app_user. Ordered (tutor kind first,
 * then adult email, then student email) so a per-row Remove can't act on a link
 * that reshuffled between render and click.
 */
export async function listLinks(tx: Tx): Promise<Link[]> {
  const stu = alias(appUser, "stu");

  const tutU = alias(appUser, "tut");
  const tutorLinks = await tx
    .select({
      adultUserId: tutU.id,
      adultEmail: tutU.email,
      adultName: tutU.name,
      studentUserId: stu.id,
      studentEmail: stu.email,
      studentName: stu.name,
    })
    .from(student)
    .innerJoin(stu, eq(stu.id, student.userId))
    .innerJoin(tutU, eq(tutU.id, student.tutorId))
    .where(isNotNull(student.tutorId));

  const parU = alias(appUser, "par");
  const parentLinks = await tx
    .select({
      adultUserId: parU.id,
      adultEmail: parU.email,
      adultName: parU.name,
      studentUserId: stu.id,
      studentEmail: stu.email,
      studentName: stu.name,
    })
    .from(student)
    .innerJoin(stu, eq(stu.id, student.userId))
    .innerJoin(parU, eq(parU.id, student.parentId))
    .where(isNotNull(student.parentId));

  const links: Link[] = [
    ...tutorLinks.map((l) => ({ kind: "tutor" as const, ...l })),
    ...parentLinks.map((l) => ({ kind: "parent" as const, ...l })),
  ];

  links.sort((a, b) =>
    a.kind !== b.kind
      ? a.kind === "tutor"
        ? -1
        : 1
      : a.adultEmail !== b.adultEmail
        ? a.adultEmail.localeCompare(b.adultEmail)
        : a.studentEmail.localeCompare(b.studentEmail),
  );
  return links;
}

/**
 * Freeze a student's progress on this board as a point-in-time snapshot — the
 * handover payload the FORMER tutor keeps when the tutor changes (founder ask).
 * Mirrors report.snapshot discipline: a frozen `description`, never a live `log`.
 * Read under ctx.tx so mastery/observation are RLS-scoped to this board.
 */
async function freezeProgress(tx: Tx, boardId: string, studentUserId: string) {
  const mastery = await tx
    .select({
      subTopicId: masteryState.subTopicId,
      conceptualLevel: masteryState.conceptualLevel,
      proceduralLevel: masteryState.proceduralLevel,
      description: masteryState.description,
    })
    .from(masteryState)
    .where(eq(masteryState.studentId, studentUserId));

  const [obs] = await tx
    .select({ n: sql<number>`count(*)::int` })
    .from(observation)
    .where(eq(observation.studentId, studentUserId));

  return {
    board: boardId,
    mastery,
    metrics: {
      masteryCount: mastery.length,
      observationCount: obs?.n ?? 0,
    },
  };
}

/**
 * Point `student.tutor_id` at `tutorUserId`, driving the tutor_assignment ledger.
 * Fresh assign → set the pointer + open an `active` row. Switch (a different tutor
 * already set) → close the prior `active` row with a frozen `progress_snapshot`,
 * set the pointer, open a new `active` row. Same tutor → idempotent no-op. All
 * writes are RLS-scoped to this board.
 */
async function assignTutor(
  tx: Tx,
  boardId: string,
  studentUserId: string,
  tutorUserId: string,
  currentTutorId: string | null,
): Promise<void> {
  if (currentTutorId === tutorUserId) return; // idempotent

  if (currentTutorId) {
    // Close the outgoing tutor's active row(s) with a frozen snapshot.
    const snapshot = await freezeProgress(tx, boardId, studentUserId);
    await tx
      .update(tutorAssignment)
      .set({
        status: "ended",
        endedAt: sql`now()`,
        progressSnapshot: snapshot,
        endedReason: "reassigned",
      })
      .where(
        and(
          eq(tutorAssignment.studentId, studentUserId),
          eq(tutorAssignment.tutorId, currentTutorId),
          eq(tutorAssignment.status, "active"),
        ),
      );
  }

  await tx.update(student).set({ tutorId: tutorUserId }).where(eq(student.userId, studentUserId));

  await tx.insert(tutorAssignment).values({
    boardId,
    studentId: studentUserId,
    tutorId: tutorUserId,
    status: "active",
  });
}

/**
 * Link an adult to a student on this board, resolving each endpoint by PROFILE ID
 * (from the admin pickers). Validates the student is on this board (RLS) and the
 * adult really holds the role the link requires (a tutor serving this board / an
 * active parent). Tutor links drive the assignment ledger (assign or switch);
 * parent links are a simple mutable pointer with no history (toggle 9).
 */
export async function linkStudent(
  tx: Tx,
  args: {
    boardId: string;
    kind: "tutor" | "parent";
    adultUserId: string;
    studentUserId: string;
  },
): Promise<{ linked: true }> {
  const { boardId, kind, adultUserId, studentUserId } = args;

  // Student must be on THIS board — the read is RLS-scoped, so an off-board (or
  // non-existent) student simply is not visible here.
  const [s] = await tx
    .select({ tutorId: student.tutorId, parentId: student.parentId })
    .from(student)
    .where(eq(student.userId, studentUserId))
    .limit(1);
  if (!s) throw new InvalidLinkError("that student is not on this board");

  if (kind === "tutor") {
    // Adult must be a tutor profile with an active detail row serving this board.
    const [t] = await tx
      .select({ boards: tutor.boards, status: tutor.status })
      .from(tutor)
      .innerJoin(appUser, eq(appUser.id, tutor.userId))
      .where(and(eq(tutor.userId, adultUserId), eq(appUser.userType, "tutor")))
      .limit(1);
    const boards = Array.isArray(t?.boards) ? (t!.boards as string[]) : [];
    if (!t || t.status !== "active" || !boards.includes(boardId)) {
      throw new InvalidLinkError("that person is not a tutor on this board");
    }
    await assignTutor(tx, boardId, studentUserId, adultUserId, s.tutorId);
    return { linked: true };
  }

  // parent
  const [p] = await tx
    .select({ status: parent.status })
    .from(parent)
    .innerJoin(appUser, eq(appUser.id, parent.userId))
    .where(and(eq(parent.userId, adultUserId), eq(appUser.userType, "parent")))
    .limit(1);
  if (!p || p.status !== "active") {
    throw new InvalidLinkError("that person is not a parent");
  }
  if (s.parentId === adultUserId) return { linked: true }; // idempotent
  await tx.update(student).set({ parentId: adultUserId }).where(eq(student.userId, studentUserId));
  return { linked: true };
}

/**
 * Remove a student's tutor or parent link — clears the single pointer only,
 * never any of the student's own data. A tutor unlink closes the active
 * tutor_assignment row with a frozen snapshot (the former tutor keeps a
 * read-only view); a parent unlink just clears the pointer (no history).
 * Idempotent: removing an already-absent link returns `removed: 0`.
 */
export async function unlinkStudent(
  tx: Tx,
  args: {
    boardId: string;
    kind: "tutor" | "parent";
    studentUserId: string;
  },
): Promise<{ removed: number }> {
  const { boardId, kind, studentUserId } = args;

  const [s] = await tx
    .select({ tutorId: student.tutorId, parentId: student.parentId })
    .from(student)
    .where(eq(student.userId, studentUserId))
    .limit(1);
  if (!s) return { removed: 0 };

  if (kind === "tutor") {
    if (!s.tutorId) return { removed: 0 };
    const snapshot = await freezeProgress(tx, boardId, studentUserId);
    await tx
      .update(tutorAssignment)
      .set({
        status: "ended",
        endedAt: sql`now()`,
        progressSnapshot: snapshot,
        endedReason: "removed",
      })
      .where(
        and(
          eq(tutorAssignment.studentId, studentUserId),
          eq(tutorAssignment.tutorId, s.tutorId),
          eq(tutorAssignment.status, "active"),
        ),
      );
    await tx.update(student).set({ tutorId: null }).where(eq(student.userId, studentUserId));
    return { removed: 1 };
  }

  // parent
  if (!s.parentId) return { removed: 0 };
  await tx.update(student).set({ parentId: null }).where(eq(student.userId, studentUserId));
  return { removed: 1 };
}
