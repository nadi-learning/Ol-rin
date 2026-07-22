/**
 * Question-image byte-serving (Slice IMG) — streams a rendered PNG to the browser.
 *
 * Same gate as resolveBundle (content.ts): the FE loads the image via a plain
 * <img src> which can't carry the x-board header, so board comes from a ?board=
 * query param and the (host-scoped) Better Auth session cookie rides along.
 *
 *   1. board by slug (global)                       — unknown → 404
 *   2. app_user by email (global)                   — unknown → 403
 *   3. withBoard(board): belongsToBoardAnyRole      — non-belonger → 403
 *      then read question_image by id UNDER the claim (RLS) — a row on ANOTHER
 *      board is invisible → 404. Then read the bytes off local FS.
 *
 * ROLE-AGNOSTIC belonging (not student-only): an <img src> can't send x-profile,
 * so we can't name the viewer's persona. A rendered figure is non-sensitive
 * (shown to students by design; RLS still hides cross-board rows), so the gate is
 * "does this email belong on this board in ANY capacity" — student on this board,
 * tutor serving it, or admin. This is what lets a TUTOR authoring image questions
 * see the preview; the old student-default check 403'd them (they have no student
 * row). See belongsToBoardAnyRole.
 *
 * The query-param board is not a trust hole: a non-belonger fails the check (403),
 * and a belonger naming a board they belong to but an imageId from a DIFFERENT
 * board is RLS-hidden (404). Answer keys don't apply here — the M11 gate protects
 * reference answers, not diagrams.
 */
import { eq } from "drizzle-orm";
import { appUser, board as boardTable, questionImage } from "@b2c/kernel/schema";
import { db } from "../db/client";
import { withBoard } from "../db/with-board";
import { readImage } from "./image_storage";
import { belongsToBoardAnyRole } from "./membership";

export class ImageError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(code);
    this.name = "ImageError";
  }
}

export interface ResolvedImage {
  bytes: Uint8Array;
  mime: string;
}

export async function resolveImageBytes(args: {
  imageId: string;
  boardSlug: string;
  email: string | null;
}): Promise<ResolvedImage> {
  const { imageId, boardSlug, email } = args;

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

  return withBoard(b.id, async (tx) => {
    const belongs = await belongsToBoardAnyRole(tx, { email, board: b });
    if (!belongs) throw new ImageError(403, "NO_MEMBERSHIP");

    const [img] = await tx
      .select({ storageKey: questionImage.storageKey, mime: questionImage.mime })
      .from(questionImage)
      .where(eq(questionImage.id, imageId))
      .limit(1);
    if (!img) throw new ImageError(404, "IMAGE_NOT_FOUND"); // cross-board or absent

    try {
      const bytes = await readImage(img.storageKey);
      return { bytes, mime: img.mime };
    } catch {
      // Row exists but the FS file is gone (e.g. dev store cleared) — treat as 404.
      throw new ImageError(404, "IMAGE_FILE_MISSING");
    }
  });
}
