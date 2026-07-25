/**
 * Slice S164 — the PARENT self-serve LINK-REQUEST leg (the "admin leg").
 *
 * The flow, end to end:
 *   1. A parent signs up (Google) and is board-LESS — no linked child yet, so no
 *      board, no `parent` membership. They cannot reach `parentProcedure`; they
 *      submit through `sessionProcedure` (the board-less namespace).
 *   2. `submitParentLinkRequest` mints the parent PROFILE SHELL (user_type=
 *      'parent') and drops a `pending` row into `parent_link_request` carrying the
 *      RAW email/phone they use for their child. No matching happens here — the
 *      requesting parent has no board, and we never trust a typed string as an FK.
 *   3. `listPendingParentLinkRequests` runs on the ADMIN's board-scoped tx and,
 *      per request, resolves candidate students BY that identifier — but only
 *      students visible on the admin's board (RLS on `student`), so the board wall
 *      holds for the sensitive half (which real student this maps to).
 *   4. `resolveParentLinkRequest` closes it: on 'link' it grants the parent role
 *      on this board and calls the existing `linkStudent` (which flips
 *      `student.parent_id` after re-validating), then marks the request `linked`;
 *      on 'reject' it just marks it closed.
 *
 * `parent_link_request` is GLOBAL / non-RLS by design (see schema): staging for an
 * identity that has no board yet. The board only enters at step 3/4, on the admin
 * side, where RLS is real.
 */
import { and, asc, desc, eq, or, sql } from "drizzle-orm";
import type { PgTransaction } from "drizzle-orm/pg-core";
import { appUser, parentLinkRequest, student } from "@b2c/kernel/schema";
import { db } from "../db/client";
import { ensureProfile, grantRole } from "./membership";
import { InvalidLinkError, linkStudent } from "./admin_users";
import { redeemReferralCode, type RedeemOutcome } from "./referral";

type Tx = PgTransaction<any, any, any>;

export class EmptyIdentifierError extends Error {
  readonly code = "EMPTY_IDENTIFIER";
  constructor() {
    super("a student email or phone is required");
    this.name = "EmptyIdentifierError";
  }
}
export class RequestNotFoundError extends Error {
  readonly code = "REQUEST_NOT_FOUND";
  constructor(id: string) {
    super(`parent link request ${id} not found`);
    this.name = "RequestNotFoundError";
  }
}
export class RequestNotPendingError extends Error {
  readonly code = "REQUEST_NOT_PENDING";
  constructor(status: string) {
    super(`request is already ${status}`);
    this.name = "RequestNotPendingError";
  }
}
export class MissingStudentError extends Error {
  readonly code = "MISSING_STUDENT";
  constructor() {
    super("linking requires a student to link to");
    this.name = "MissingStudentError";
  }
}

export type ParentLinkRequestView = {
  id: string;
  enteredIdentifier: string;
  status: "pending" | "linked" | "rejected";
  createdAt: Date;
};

const view = (r: {
  id: string;
  enteredIdentifier: string;
  status: string;
  createdAt: Date;
}): ParentLinkRequestView => ({
  id: r.id,
  enteredIdentifier: r.enteredIdentifier,
  status: r.status as ParentLinkRequestView["status"],
  createdAt: r.createdAt,
});

/**
 * Parent side (board-less, sessionProcedure). Mints the parent profile shell and
 * files a pending request for the raw identifier. Idempotent: a second submit of
 * the same identifier while one is still pending returns the existing row rather
 * than stacking duplicates. Runs on a plain `db` transaction with NO board claim
 * — every table it touches (`app_user`, `parent_link_request`) is global.
 */
export async function submitParentLinkRequest(args: {
  email: string;
  name: string | null;
  identifier: string;
  /**
   * S166 — an OPTIONAL referral code typed in the same form (founder: capture it
   * "alongside student email/phone"). It rides this call rather than getting its
   * own because this is the one moment a brand-new parent is in front of us.
   */
  referralCode?: string | null;
}): Promise<ParentLinkRequestView & { referral: RedeemOutcome }> {
  const identifier = args.identifier.trim();
  if (!identifier) throw new EmptyIdentifierError();
  return db.transaction(async (tx) => {
    const parentUser = await ensureProfile(tx, {
      email: args.email,
      name: args.name,
      userType: "parent",
    });

    // 🔑 The referral NEVER fails the link. A bad code returns an outcome the
    // caller reports back; the request below is filed either way. The parent's
    // errand here is reaching their child's dashboard — a typo in a bonus code
    // must not cost them that. (See services/referral.ts header.)
    const referral = await redeemReferralCode(tx, {
      referredUserId: parentUser.id,
      rawCode: args.referralCode,
    });

    const [existing] = await tx
      .select()
      .from(parentLinkRequest)
      .where(
        and(
          eq(parentLinkRequest.parentUserId, parentUser.id),
          eq(parentLinkRequest.enteredIdentifier, identifier),
          eq(parentLinkRequest.status, "pending"),
        ),
      )
      .limit(1);
    if (existing) return { ...view(existing), referral };
    const [row] = await tx
      .insert(parentLinkRequest)
      .values({ parentUserId: parentUser.id, enteredIdentifier: identifier })
      .returning();
    return { ...view(row!), referral };
  });
}

/** Parent side — the caller's own requests, newest first (all statuses). */
export async function listMyParentLinkRequests(
  email: string,
): Promise<ParentLinkRequestView[]> {
  const rows = await db
    .select({
      id: parentLinkRequest.id,
      enteredIdentifier: parentLinkRequest.enteredIdentifier,
      status: parentLinkRequest.status,
      createdAt: parentLinkRequest.createdAt,
    })
    .from(parentLinkRequest)
    .innerJoin(appUser, eq(appUser.id, parentLinkRequest.parentUserId))
    .where(and(eq(appUser.email, email), eq(appUser.userType, "parent")))
    .orderBy(desc(parentLinkRequest.createdAt));
  return rows.map(view);
}

export type PendingRequestCandidate = {
  studentUserId: string;
  name: string | null;
  email: string;
  class: string;
  alreadyLinkedToThisParent: boolean;
  alreadyLinkedToAnother: boolean;
};
export type PendingParentLinkRequest = {
  id: string;
  enteredIdentifier: string;
  createdAt: Date;
  parent: { userId: string; name: string | null; email: string };
  candidates: PendingRequestCandidate[];
};

/**
 * Admin side (board-scoped tx). Every pending request, each with the students on
 * THIS board that match its identifier (email or phone). Candidate resolution
 * joins `student` — RLS-scoped — so a match on another board simply does not
 * appear here; the admin links within their own board (the linkStudent rule).
 */
export async function listPendingParentLinkRequests(
  tx: Tx,
): Promise<PendingParentLinkRequest[]> {
  const requests = await tx
    .select({
      id: parentLinkRequest.id,
      enteredIdentifier: parentLinkRequest.enteredIdentifier,
      createdAt: parentLinkRequest.createdAt,
      parentUserId: appUser.id,
      parentName: appUser.name,
      parentEmail: appUser.email,
    })
    .from(parentLinkRequest)
    .innerJoin(appUser, eq(appUser.id, parentLinkRequest.parentUserId))
    .where(eq(parentLinkRequest.status, "pending"))
    .orderBy(asc(parentLinkRequest.createdAt));

  const out: PendingParentLinkRequest[] = [];
  for (const r of requests) {
    const candidates = await tx
      .select({
        studentUserId: student.userId,
        name: appUser.name,
        email: appUser.email,
        class: student.class,
        parentId: student.parentId,
      })
      .from(appUser)
      .innerJoin(student, eq(student.userId, appUser.id))
      .where(
        and(
          eq(appUser.userType, "student"),
          or(
            eq(appUser.email, r.enteredIdentifier),
            eq(appUser.phone, r.enteredIdentifier),
          ),
        ),
      );
    out.push({
      id: r.id,
      enteredIdentifier: r.enteredIdentifier,
      createdAt: r.createdAt,
      parent: { userId: r.parentUserId, name: r.parentName, email: r.parentEmail },
      candidates: candidates.map((c) => ({
        studentUserId: c.studentUserId,
        name: c.name,
        email: c.email,
        class: c.class,
        alreadyLinkedToThisParent: c.parentId === r.parentUserId,
        alreadyLinkedToAnother: c.parentId != null && c.parentId !== r.parentUserId,
      })),
    });
  }
  return out;
}

/**
 * Admin side (board-scoped tx) — close a pending request. 'link' grants the
 * parent role on this board (so `linkStudent`'s active-parent check passes) then
 * flips `student.parent_id` via the shared linkStudent; 'reject' just marks it
 * closed. Either way the request becomes terminal with an audit stamp.
 */
export async function resolveParentLinkRequest(
  tx: Tx,
  args: {
    requestId: string;
    action: "link" | "reject";
    studentUserId?: string;
    board: { id: string; slug: string };
    actorUserId: string;
  },
): Promise<{ status: "linked" | "rejected" }> {
  const [req] = await tx
    .select()
    .from(parentLinkRequest)
    .where(eq(parentLinkRequest.id, args.requestId))
    .limit(1);
  if (!req) throw new RequestNotFoundError(args.requestId);
  if (req.status !== "pending") throw new RequestNotPendingError(req.status);

  if (args.action === "reject") {
    await tx
      .update(parentLinkRequest)
      .set({ status: "rejected", resolvedBy: args.actorUserId, resolvedAt: new Date() })
      .where(eq(parentLinkRequest.id, args.requestId));
    return { status: "rejected" };
  }

  if (!args.studentUserId) throw new MissingStudentError();

  // The parent's profile → grant the parent role on this board so the detail row
  // exists and is active (linkStudent requires it), then link. linkStudent
  // re-validates the student is on THIS board and throws InvalidLinkError if not.
  const [pu] = await tx
    .select({ email: appUser.email, name: appUser.name })
    .from(appUser)
    .where(eq(appUser.id, req.parentUserId))
    .limit(1);
  if (!pu) throw new RequestNotFoundError(args.requestId); // parent profile vanished
  await grantRole(tx, { email: pu.email, name: pu.name, board: args.board, role: "parent" });
  await linkStudent(tx, {
    boardId: args.board.id,
    kind: "parent",
    adultUserId: req.parentUserId,
    studentUserId: args.studentUserId,
  });
  await tx
    .update(parentLinkRequest)
    .set({
      status: "linked",
      resolvedStudentId: args.studentUserId,
      resolvedBy: args.actorUserId,
      resolvedAt: new Date(),
    })
    .where(eq(parentLinkRequest.id, args.requestId));
  return { status: "linked" };
}

export { InvalidLinkError };
