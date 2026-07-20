import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import { withBoard } from "../db/with-board";
import { NoMembershipError, requireMembership } from "../services/membership";
import { assertTutor, TutorOnlyError } from "../services/tutor";
import { assertParent, ParentOnlyError } from "../services/parent";
import { assertAdmin, AdminOnlyError } from "../services/admin_ingest";
import type { Context } from "./context";

const t = initTRPC.context<Context>().create({ transformer: superjson });

export const router = t.router;
export const publicProcedure = t.procedure;

/**
 * Session-only procedure (Slice E) — a Better Auth session, and NOTHING else.
 * No board, no `ctx.tx`, no membership. It sits BELOW authedProcedure.
 *
 * 🔑 This exists to break one chicken-and-egg: the grade chips a new student
 * picks from are board-scoped, so a board must be committed before they can
 * load — but `authedProcedure` rejects every call without a valid `x-board`.
 * A brand-new student therefore has no board to send and no way to get one.
 * The `session` namespace runs here instead.
 *
 * 🔴 There is deliberately no `ctx.tx`. A resolver on this procedure has NO RLS
 * board claim, so every tenant-scoped table reads EMPTY for it. That is
 * fail-closed and correct — anything needing tenant data must open its own
 * `withBoard`, which makes the board it chose explicit and reviewable. Do not
 * add a board-less `db` handle to this context to save a line.
 *
 * Keep this namespace SMALL. Every procedure added here is one that runs before
 * tenancy is established.
 */
export const sessionProcedure = t.procedure.use(async ({ ctx, next }) => {
  if (!ctx.realUser) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "not signed in" });
  }
  const { realUser } = ctx;
  return next({ ctx: { ...ctx, realUser } });
});

/**
 * Authed + board-scoped procedure.
 *  - requires a Better Auth session (else UNAUTHORIZED)
 *  - requires a resolved board from the x-board header (else BAD_REQUEST)
 *  - runs the whole resolver INSIDE withBoard(board.id): the per-request RLS
 *    claim is set automatically, and `ctx.tx` is the board-scoped transaction
 *    every DB call in the resolver should use.
 *
 * NB: this requires auth + board but NOT yet a membership. Slice E moved the
 * creation side OFF this procedure: `session.chooseBoard` is now the only path
 * that mints a membership, and `me` became `protectedProcedure`. So an
 * authedProcedure resolver may still run for a boardless-membership identity —
 * it must not assume one exists.
 */
export const authedProcedure = t.procedure.use(async ({ ctx, next }) => {
  if (!ctx.realUser) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "not signed in" });
  }
  if (!ctx.board) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "no board (x-board header missing or unknown)",
    });
  }
  const { realUser, board } = ctx;
  return withBoard(board.id, (tx) =>
    next({ ctx: { ...ctx, realUser, board, tx } }),
  );
});

/**
 * Authed + board-scoped + MEMBERSHIP-required procedure. Chains on
 * authedProcedure (so it runs inside withBoard with ctx.tx set), then asserts
 * an active membership for (user, board) — the CHECK side of the gate (M11).
 * The SET side is `session.chooseBoard` (Slice E), never this path and no
 * longer `me`. Exposes ctx.membership { userId,
 * role }. Use for every post-onboarding surface (revision.getSlide, …).
 *
 *  - no membership → FORBIDDEN (message NO_MEMBERSHIP)
 */
export const protectedProcedure = authedProcedure.use(async ({ ctx, next }) => {
  try {
    const m = await requireMembership(ctx.tx, {
      email: ctx.realUser.email,
      board: ctx.board,
      // S123: WHICH profile this request is for. Without it a person holding
      // both a student and a tutor row on this board would get whichever row
      // the planner returned first — the nondeterminism the widened unique
      // introduces and this header removes.
      profile: ctx.profile,
    });
    return next({ ctx: { ...ctx, membership: m } });
  } catch (e) {
    if (e instanceof NoMembershipError) {
      throw new TRPCError({ code: "FORBIDDEN", message: e.code });
    }
    throw e;
  }
});

/**
 * Authed + board + membership + TUTOR-ROLE-required procedure (Slice T). Chains
 * on protectedProcedure, then asserts the membership role is 'tutor' — the CHECK
 * side of the role gate (M11). The SET side is the real `grantRole(…, role:
 * 'tutor')` flow (seed_tutor / the probe / admin.setRole drive it, never a
 * direct membership insert). Use for every tutor surface (tutor.listStudents, …).
 *
 *  - non-tutor membership → FORBIDDEN (message NOT_A_TUTOR)
 */
export const tutorProcedure = protectedProcedure.use(async ({ ctx, next }) => {
  try {
    assertTutor(ctx.membership.role);
  } catch (e) {
    if (e instanceof TutorOnlyError) {
      throw new TRPCError({ code: "FORBIDDEN", message: e.code });
    }
    throw e;
  }
  return next({ ctx });
});

/**
 * Authed + board + membership + PARENT-ROLE-required procedure (Slice P). The
 * parent sibling of tutorProcedure: asserts the membership role is 'parent' —
 * the CHECK side of the role gate (M11). The SET side is the real
 * `grantRole(…, role: 'parent')` flow (seed_parent / the probe / admin.setRole
 * drive it). Use for every parent surface (parent.listChildren, …).
 *
 *  - non-parent membership → FORBIDDEN (message NOT_A_PARENT)
 */
export const parentProcedure = protectedProcedure.use(async ({ ctx, next }) => {
  try {
    assertParent(ctx.membership.role);
  } catch (e) {
    if (e instanceof ParentOnlyError) {
      throw new TRPCError({ code: "FORBIDDEN", message: e.code });
    }
    throw e;
  }
  return next({ ctx });
});

/**
 * Authed + board + membership + ADMIN-ROLE-required procedure (Slice QA3-b). The
 * admin sibling of tutor/parentProcedure: asserts the membership role is 'admin' —
 * the CHECK side of the role gate (M11). The SET side is the real
 * `grantRole(…, role: 'admin')` flow (seed_admin / the probe / admin.setRole
 * drive it). Use for the admin ingest + state surfaces (admin.extractTopicsMd, …).
 *
 *  - non-admin membership → FORBIDDEN (message NOT_AN_ADMIN)
 */
export const adminProcedure = protectedProcedure.use(async ({ ctx, next }) => {
  try {
    assertAdmin(ctx.membership.role);
  } catch (e) {
    if (e instanceof AdminOnlyError) {
      throw new TRPCError({ code: "FORBIDDEN", message: e.code });
    }
    throw e;
  }
  return next({ ctx });
});
