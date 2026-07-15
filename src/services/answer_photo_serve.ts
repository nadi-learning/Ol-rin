/**
 * Answer-photo byte-serving (Slice UPLOAD-UX) — streams a student's OWN uploaded
 * answer photo back to their desktop, so the upload flow can show a preview and
 * the post-submit reveal / done→Review can persist a thumbnail.
 *
 * Same transport as the question-image route (image_serve.ts): a plain <img src>
 * can't carry x-board, so board rides in ?board= and the (host-scoped) Better
 * Auth session cookie rides along. Two lifecycles, two owner-scoped resolvers:
 *
 *   resolveUploadPreviewBytes(token)  — TRANSIENT. The phone has uploaded but the
 *     desktop hasn't submitted yet (no attempt_image row exists). Keyed on the
 *     upload_token (GLOBAL, not RLS — same as the mint/consume path); owner =
 *     token.app_user_id must equal the caller. Serves while 'uploaded' OR
 *     'consumed' (consume does not clear upload_keys), so the same URL survives
 *     the submit that turns it into an attempt.
 *
 *   resolveAnswerPhotoBytes(imageId) — DURABLE. Post-submit. Keyed on the
 *     attempt_image row (tenant-scoped + RLS); owner = the parent attempt's
 *     app_user_id must equal the caller. Used by the reveal + the review view,
 *     which have no token in hand — only the persisted image id.
 *
 * Owner-scoping is the point: unlike a rendered question figure (shown to every
 * student by design), an answer photo is one student's private work. A member of
 * the same board who is NOT the owner gets 404 (not 403 — don't leak that the id
 * exists). Cross-board is RLS-hidden (attempt_image) or board-mismatch (token).
 */
import { and, eq } from "drizzle-orm";
import {
  appUser,
  attempt,
  attemptImage,
  board as boardTable,
  tutorStudent,
  uploadToken,
} from "@b2c/kernel/schema";
import { db } from "../db/client";
import { withBoard } from "../db/with-board";
import { ImageError, type ResolvedImage } from "./image_serve";
import { NoMembershipError, requireMembership } from "./membership";
import { getObject } from "./object_storage";

const MIME_BY_EXT: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  heic: "image/heic",
  heif: "image/heif",
  gif: "image/gif",
};

function mimeFromKey(key: string): string {
  const ext = key.split(".").pop()?.toLowerCase() ?? "";
  return MIME_BY_EXT[ext] ?? "application/octet-stream";
}

/** Board (by slug) + app_user (by email), or the matching ImageError. Shared
 *  head of both resolvers — 401 no session, 404 unknown board, 403 unknown user. */
async function resolveBoardAndUser(
  boardSlug: string,
  email: string | null,
): Promise<{ boardId: string; boardSlug: string; userId: string; email: string }> {
  if (!email) throw new ImageError(401, "NOT_AUTHENTICATED");

  const [b] = await db
    .select({ id: boardTable.id, slug: boardTable.slug })
    .from(boardTable)
    .where(eq(boardTable.slug, boardSlug))
    .limit(1);
  if (!b) throw new ImageError(404, "BOARD_NOT_FOUND");

  const [user] = await db
    .select({ id: appUser.id })
    .from(appUser)
    .where(eq(appUser.email, email))
    .limit(1);
  if (!user) throw new ImageError(403, "NO_MEMBERSHIP");

  return { boardId: b.id, boardSlug: b.slug, userId: user.id, email };
}

/**
 * Transient pre-submit preview: the freshly-uploaded photo for one upload token,
 * owned by the caller. Serves the first photo (ordinal 0) — the practice flow is
 * one photo per slot. 404 for a missing/other-user/other-board token, or one that
 * hasn't been uploaded yet (nothing to preview).
 */
export async function resolveUploadPreviewBytes(args: {
  token: string;
  boardSlug: string;
  email: string | null;
}): Promise<ResolvedImage> {
  const { boardId, userId } = await resolveBoardAndUser(args.boardSlug, args.email);

  // upload_token is GLOBAL (not RLS) — read by the token string, then owner+board
  // check in code. Mirrors mint/consume, which also read it without a claim.
  const [row] = await db
    .select({
      appUserId: uploadToken.appUserId,
      tokenBoardId: uploadToken.boardId,
      status: uploadToken.status,
      keys: uploadToken.uploadKeys,
    })
    .from(uploadToken)
    .where(eq(uploadToken.token, args.token))
    .limit(1);
  // A non-existent / not-yours / wrong-board / not-yet-uploaded token all read as
  // 404 — no existence leak, and nothing to preview.
  if (!row || row.appUserId !== userId || row.tokenBoardId !== boardId) {
    throw new ImageError(404, "PREVIEW_NOT_FOUND");
  }
  if (row.status !== "uploaded" && row.status !== "consumed") {
    throw new ImageError(404, "PREVIEW_NOT_READY");
  }
  const storageKey = row.keys[0];
  if (!storageKey) throw new ImageError(404, "PREVIEW_NOT_FOUND");

  try {
    const bytes = await getObject(storageKey);
    return { bytes, mime: mimeFromKey(storageKey) };
  } catch {
    throw new ImageError(404, "PREVIEW_FILE_MISSING");
  }
}

/**
 * Durable post-submit serve: an attempt_image the caller owns. RLS scopes the row
 * to the board; the owner check (parent attempt.app_user_id) makes it the CALLER's
 * own answer, not any board-mate's. Used by the reveal + review thumbnails.
 */
export async function resolveAnswerPhotoBytes(args: {
  imageId: string;
  boardSlug: string;
  email: string | null;
}): Promise<ResolvedImage> {
  const { boardId, boardSlug, userId, email } = await resolveBoardAndUser(
    args.boardSlug,
    args.email,
  );

  return withBoard(boardId, async (tx) => {
    try {
      await requireMembership(tx, { email, board: { id: boardId, slug: boardSlug } });
    } catch (e) {
      if (e instanceof NoMembershipError) throw new ImageError(403, "NO_MEMBERSHIP");
      throw e;
    }

    const [img] = await tx
      .select({
        storageKey: attemptImage.storageKey,
        mime: attemptImage.mime,
        ownerId: attempt.appUserId,
      })
      .from(attemptImage)
      .innerJoin(attempt, eq(attempt.id, attemptImage.attemptId))
      .where(eq(attemptImage.id, args.imageId))
      .limit(1);
    // Absent, cross-board (RLS-hidden), or owned by another student → 404. A
    // board-mate must not be able to pull a peer's answer photo.
    if (!img || img.ownerId !== userId) {
      throw new ImageError(404, "ANSWER_PHOTO_NOT_FOUND");
    }

    try {
      const bytes = await getObject(img.storageKey);
      return { bytes, mime: img.mime };
    } catch {
      throw new ImageError(404, "ANSWER_PHOTO_FILE_MISSING");
    }
  });
}

/**
 * Tutor-scoped serve: an answer photo belonging to a student the caller TUTORS.
 * Same durable attempt_image row as resolveAnswerPhotoBytes, but the owner check
 * is inverted — the caller must NOT be the owner (they're the tutor) but must hold
 * a tutor↔student link to the owner. Powers the collapsed question/answer recall
 * panel in the tutor Assess view. A non-tutor, or a tutor not linked to the owner
 * student, gets 404 (no existence leak — a student's answer photo is private work).
 */
export async function resolveTutorAnswerPhotoBytes(args: {
  imageId: string;
  boardSlug: string;
  email: string | null;
}): Promise<ResolvedImage> {
  const { boardId, boardSlug, userId, email } = await resolveBoardAndUser(
    args.boardSlug,
    args.email,
  );

  return withBoard(boardId, async (tx) => {
    try {
      await requireMembership(tx, { email, board: { id: boardId, slug: boardSlug } });
    } catch (e) {
      if (e instanceof NoMembershipError) throw new ImageError(403, "NO_MEMBERSHIP");
      throw e;
    }

    const [img] = await tx
      .select({
        storageKey: attemptImage.storageKey,
        mime: attemptImage.mime,
        ownerId: attempt.appUserId,
      })
      .from(attemptImage)
      .innerJoin(attempt, eq(attempt.id, attemptImage.attemptId))
      .where(eq(attemptImage.id, args.imageId))
      .limit(1);
    if (!img) throw new ImageError(404, "ANSWER_PHOTO_NOT_FOUND");

    // The caller must tutor the student who owns this attempt (same board via RLS).
    const [link] = await tx
      .select({ id: tutorStudent.id })
      .from(tutorStudent)
      .where(
        and(
          eq(tutorStudent.tutorId, userId),
          eq(tutorStudent.studentId, img.ownerId),
        ),
      )
      .limit(1);
    if (!link) throw new ImageError(404, "ANSWER_PHOTO_NOT_FOUND");

    try {
      const bytes = await getObject(img.storageKey);
      return { bytes, mime: img.mime };
    } catch {
      throw new ImageError(404, "ANSWER_PHOTO_FILE_MISSING");
    }
  });
}
