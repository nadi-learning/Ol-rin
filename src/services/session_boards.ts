/**
 * Slice E → ID-1 — the pre-board session surface (board pick + who-am-I).
 *
 * 🔑 THE CHICKEN-AND-EGG THIS EXISTS TO BREAK. Every other read in this app is
 * board-scoped: `authedProcedure` (init.ts) rejects any call whose `x-board`
 * header is missing or unknown, and the grade chips a student picks from are
 * themselves board-scoped. So a brand-new student cannot be shown grades until
 * they have committed to a board — and cannot commit to a board through any
 * procedure that already requires one. These reads are the only ones that run
 * WITHOUT a board, and they are deliberately tiny.
 *
 * ID-1: the `membership` table is gone. A person's profiles are `app_user` rows
 * (one per user_type); a profile is OPERATIONAL when its role-detail row exists
 * (student.board_id / tutor.boards[] / parent). `whoami` reports every profile
 * with that operational flag + the board(s) it serves, so the FE can route a
 * signed-in tutor to their waiting room WITHOUT first calling `me` (which needs a
 * board they may not have yet). `enterProfile` is the login shell-mint.
 *
 * 🔴 STUDENT ROWS ARE RLS-SCOPED, so a board-less select returns ZERO and reads
 * as "belongs nowhere" — the spurious clean answer this codebase has been bitten
 * by repeatedly (b2c-two-user-tables, M29/M80). Every student read here iterates
 * boards under withBoard. tutor/parent are GLOBAL and read directly. DO NOT
 * "optimise" the student loop into a board-less read or a policy carve-out.
 */
import { eq } from "drizzle-orm";
import type { PgTransaction } from "drizzle-orm/pg-core";
import { appUser, board as boardTable, parent, student, tutor } from "@b2c/kernel/schema";
import { isSelfAssignableRole, type Role } from "@b2c/kernel/contracts";
import { db } from "../db/client";
import { withBoard } from "../db/with-board";
import { ensureProfile, resolveMembership, type ResolvedMembership } from "./membership";

export class BoardNotFoundError extends Error {
  readonly code = "BOARD_NOT_FOUND";
  constructor(slug: string) {
    super(`no board with slug ${slug}`);
    this.name = "BoardNotFoundError";
  }
}

export type BoardOption = { slug: string; name: string };

/**
 * One profile the person holds. `slug`/`name` are null for a board-less profile
 * (a not-yet-onboarded student, a waiting-room tutor/parent, an admin). A tutor
 * who serves several boards yields one entry per board.
 */
export type MembershipSummary = {
  slug: string | null;
  name: string | null;
  role: string;
  /** The role-detail row exists (and, for a tutor, includes this board). */
  enabled: boolean;
};
export type Whoami = {
  memberships: MembershipSummary[];
  /** The board to enter on boot, or null when there is no operational board yet. */
  preferred: string | null;
};

/** Every board row (global table, no RLS). Ordered so callers are deterministic. */
async function allBoards(): Promise<{ id: string; slug: string; name: string }[]> {
  return await db
    .select({ id: boardTable.id, slug: boardTable.slug, name: boardTable.name })
    .from(boardTable)
    .orderBy(boardTable.name);
}

/**
 * 🔑 Slice M (founder) — THE OFFERED BOARDS ARE A PRODUCT DECISION, not a query
 * result. An explicit allow-list can never regress into offering probe-litter
 * boards ("Fig P", "Probe Q") the way a `subject`/content-derived rule once did,
 * and a board with nothing behind it lands the student on "still setting this up"
 * rather than vanishing. Every slug here MUST exist in `board` (`bun run
 * seed:boards`) — `chooseBoard` throws BoardNotFound on a miss. Order = render order.
 */
const SUPPORTED_BOARDS: readonly string[] = ["cbse", "cambridge"];

export async function listBoards(): Promise<BoardOption[]> {
  const boards = await allBoards();
  const bySlug = new Map(boards.map((b) => [b.slug, b]));
  return SUPPORTED_BOARDS.flatMap((slug) => {
    const b = bySlug.get(slug);
    if (!b) {
      console.warn(`[listBoards] offered board '${slug}' has no row — run: bun run seed:boards`);
      return [];
    }
    return [{ slug: b.slug, name: b.name }];
  });
}

/**
 * Login's PROFILE-SHELL mint (decision 1). Called by `session.enter` on boot with
 * the landing persona: it upserts the board-less `app_user` shell for (email,
 * persona) so the person's profiles are on record — a signed-in tutor becomes a
 * row an admin can find and set up (ID-2), and a signed-in student has an identity
 * to hang onboarding off (ID-3).
 *
 * 🔴 ADMIN IS NOT SELF-MINTED. A person sending `x-profile: admin` who is not one
 * gets NO admin shell created — admin profiles come only from `grantRole` / the
 * cutover, gated by the whitelist. A non-self-assignable persona falls back to
 * `student`, the honest default, rather than minting nothing (which would leave a
 * brand-new visitor with no identity at all).
 *
 * Returns the fresh `whoami` so boot is one round-trip.
 */
export async function enterProfile(args: {
  email: string;
  name: string | null;
  persona?: string | null;
}): Promise<Whoami> {
  const userType: Role = isSelfAssignableRole(args.persona) ? args.persona : "student";
  // app_user is GLOBAL (no RLS) → no board claim needed; a plain tx suffices.
  await db.transaction((tx) =>
    ensureProfile(tx as PgTransaction<any, any, any>, {
      email: args.email,
      name: args.name,
      userType,
    }),
  );
  return whoami(args.email);
}

/**
 * Every profile this identity holds, with its operational state + board(s).
 * Drives the FE boot: the FE finds the entry for the claimed persona and routes
 * on `enabled`/`slug` — an enabled student enters at their board, a disabled
 * tutor/parent lands in the waiting room, a board-less student goes to onboarding.
 *
 * `preferred` is the OLDEST profile that is operational AND has a board, so a
 * returning person lands where they actually work.
 */
export async function whoami(email: string): Promise<Whoami> {
  const boards = await allBoards();
  const byId = new Map(boards.map((b) => [b.id, b]));

  const profiles = await db
    .select({ id: appUser.id, userType: appUser.userType, at: appUser.createdAt })
    .from(appUser)
    .where(eq(appUser.email, email))
    .orderBy(appUser.createdAt);

  const found: (MembershipSummary & { at: Date })[] = [];

  for (const p of profiles) {
    if (p.userType === "student") {
      // RLS: the student row is visible only under its own board's claim, so
      // iterate. A shell-only student (no row yet) yields a board-less, disabled
      // entry → the FE sends them to onboarding, not the waiting room.
      let entry: MembershipSummary & { at: Date } = {
        slug: null,
        name: null,
        role: "student",
        enabled: false,
        at: p.at,
      };
      for (const b of boards) {
        const [s] = await withBoard(b.id, (tx) =>
          tx
            .select({ userId: student.userId })
            .from(student)
            .where(eq(student.userId, p.id))
            .limit(1),
        );
        if (s) {
          entry = { slug: b.slug, name: b.name, role: "student", enabled: true, at: p.at };
          break;
        }
      }
      found.push(entry);
    } else if (p.userType === "tutor") {
      const [t] = await db
        .select({ boards: tutor.boards, status: tutor.status })
        .from(tutor)
        .where(eq(tutor.userId, p.id))
        .limit(1);
      const boardIds =
        t && t.status === "active" && Array.isArray(t.boards) ? (t.boards as string[]) : [];
      if (boardIds.length === 0) {
        found.push({ slug: null, name: null, role: "tutor", enabled: false, at: p.at });
      } else {
        for (const boardId of boardIds) {
          const b = byId.get(boardId);
          found.push({
            slug: b?.slug ?? null,
            name: b?.name ?? null,
            role: "tutor",
            enabled: true,
            at: p.at,
          });
        }
      }
    } else if (p.userType === "parent") {
      const [pr] = await db
        .select({ status: parent.status })
        .from(parent)
        .where(eq(parent.userId, p.id))
        .limit(1);
      found.push({
        slug: null,
        name: null,
        role: "parent",
        enabled: !!pr && pr.status === "active",
        at: p.at,
      });
    } else {
      // admin — board-agnostic; the whitelist is the gate (adminProcedure).
      found.push({ slug: null, name: null, role: "admin", enabled: true, at: p.at });
    }
  }

  // Stable oldest-first (Array.sort is stable in every runtime this ships on).
  found.sort((a, b) => a.at.getTime() - b.at.getTime());

  const preferred = found.find((m) => m.enabled && m.slug)?.slug ?? null;
  return {
    memberships: found.map(({ slug, name, role, enabled }) => ({ slug, name, role, enabled })),
    preferred,
  };
}

/**
 * Commit this identity to a board (session.chooseBoard). Since ID-1 the student's
 * OPERATIONAL row (student.board_id + class) is minted by onboarding (ID-3), so
 * this validates the board and ensures the profile shell — it no longer writes a
 * board-scoped row. Delegates to `resolveMembership`, kept as the shared entry
 * point login and board-pick both drive (M11).
 */
export async function chooseBoard(args: {
  slug: string;
  email: string;
  name: string | null;
  /** The landing persona, passed through to `resolveMembership`. */
  intendedRole?: string | null;
}): Promise<ResolvedMembership> {
  const [b] = await db
    .select({ id: boardTable.id, slug: boardTable.slug })
    .from(boardTable)
    .where(eq(boardTable.slug, args.slug))
    .limit(1);
  if (!b) throw new BoardNotFoundError(args.slug);

  return await withBoard(b.id, (tx) =>
    resolveMembership(tx as PgTransaction<any, any, any>, {
      email: args.email,
      name: args.name,
      board: b,
      intendedRole: args.intendedRole,
    }),
  );
}

/**
 * Run a read inside a board WITHOUT requiring membership there — the other half
 * of the chicken-and-egg break, used by `session.listGradesForBoard`. Narrow by
 * design: a slug in, a board-scoped tx out. Do not export a generic "run anything
 * unscoped" helper.
 */
export async function withBoardBySlug<T>(
  slug: string,
  fn: (tx: PgTransaction<any, any, any>) => Promise<T>,
): Promise<T> {
  const [b] = await db
    .select({ id: boardTable.id })
    .from(boardTable)
    .where(eq(boardTable.slug, slug))
    .limit(1);
  if (!b) throw new BoardNotFoundError(slug);
  return await withBoard(b.id, fn);
}
