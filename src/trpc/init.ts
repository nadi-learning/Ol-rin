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
 * Authed + board-scoped procedure.
 *  - requires a Better Auth session (else UNAUTHORIZED)
 *  - requires a resolved board from the x-board header (else BAD_REQUEST)
 *  - runs the whole resolver INSIDE withBoard(board.id): the per-request RLS
 *    claim is set automatically, and `ctx.tx` is the board-scoped transaction
 *    every DB call in the resolver should use.
 *
 * NB: this requires auth + board but NOT yet a membership — `me` is what
 * creates the membership (the onboarding step). A stricter membership-requiring
 * procedure for post-onboarding surfaces lands when S3 needs it.
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
 * an active membership for (user, board) — the CHECK side of the gate (M11);
 * `me`/authedProcedure is what CREATES it. Exposes ctx.membership { userId,
 * role }. Use for every post-onboarding surface (revision.getSlide, …).
 *
 *  - no membership → FORBIDDEN (message NO_MEMBERSHIP)
 */
export const protectedProcedure = authedProcedure.use(async ({ ctx, next }) => {
  try {
    const m = await requireMembership(ctx.tx, {
      email: ctx.realUser.email,
      board: ctx.board,
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
 * side of the role gate (M11). The SET side is the real whitelist(role='tutor')
 * → resolveMembership flow (seed_tutor / the probe drive it, never a direct
 * membership insert). Use for every tutor surface (tutor.listStudents, …).
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
 * whitelist(role='parent') → resolveMembership flow (seed_parent / the probe
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
 * whitelist(role='admin') → resolveMembership flow (seed_admin / the probe drive
 * it). Use for the admin ingest + state surfaces (admin.extractTopicsMd, …).
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
