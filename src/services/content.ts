/**
 * Content byte-serving (S4) — streams a published module bundle to the browser.
 *
 * The FE renders a slide by dynamic-`import()`ing the module bundle. A browser
 * `import()` CANNOT set custom headers, so unlike the tRPC procedures this path
 * can't carry the `x-board` header — but the (host-scoped) Better Auth session
 * cookie rides along automatically. So we gate the same way getSlide does, but
 * source the board from a QUERY PARAM instead of a header (D-S4-1):
 *
 *   1. resolve board by slug (global table)            — unknown → 404
 *   2. resolve app_user by email (global)              — unknown → 403
 *   3. withBoard(board):  requireMembership(email)     — non-member → 403
 *      then read the version's content_unit UNDER the claim (RLS) — a version
 *      whose unit is on ANOTHER board is invisible → 404.
 *
 * The query-param board is NOT a trust hole: a non-member fails requireMembership
 * (403), and a member naming a board they belong to but a versionId from a
 * DIFFERENT board's unit gets RLS-hidden (404). Same guarantee as getSlide; the
 * board is just sourced explicitly because the transport can't carry a header.
 *
 * content_version is not RLS'd directly (reached transitively via the RLS'd
 * content_unit), so we read the version by id, then confirm its unit is visible
 * under the board claim before serving the bytes.
 */
import { and, eq } from "drizzle-orm";
import {
  appUser,
  board as boardTable,
  contentUnit,
  contentVersion,
} from "@b2c/kernel/schema";
import { db } from "../db/client";
import { withBoard } from "../db/with-board";
import { NoMembershipError, requireMembership } from "./membership";

/** Typed failure with the HTTP status the route should return. */
export class BundleError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(code);
    this.name = "BundleError";
  }
}

/**
 * Resolve the JS source of a published module bundle for (versionId, boardSlug),
 * gated by the caller's membership on that board. Returns the bundle string;
 * throws BundleError(status, code) on any gate failure.
 */
export async function resolveBundle(args: {
  versionId: string;
  boardSlug: string;
  email: string | null;
}): Promise<string> {
  const { versionId, boardSlug, email } = args;

  if (!email) throw new BundleError(401, "NOT_AUTHENTICATED");

  // 1. board by slug (global, no RLS)
  const [b] = await db
    .select({ id: boardTable.id, slug: boardTable.slug })
    .from(boardTable)
    .where(eq(boardTable.slug, boardSlug))
    .limit(1);
  if (!b) throw new BundleError(404, "BOARD_NOT_FOUND");

  // 2. app_user by email (global)
  const [user] = await db
    .select({ id: appUser.id })
    .from(appUser)
    .where(eq(appUser.email, email))
    .limit(1);
  if (!user) throw new BundleError(403, "NO_MEMBERSHIP");

  // 3. board-scoped: membership gate + RLS-confirmed version → bytes
  return withBoard(b.id, async (tx) => {
    try {
      await requireMembership(tx, { email, board: b });
    } catch (e) {
      if (e instanceof NoMembershipError) throw new BundleError(403, "NO_MEMBERSHIP");
      throw e;
    }

    // content_version is not RLS'd — read it, then confirm its unit is visible
    // under THIS board's claim (cross-board → invisible → 404).
    const [ver] = await tx
      .select({ id: contentVersion.id, unitId: contentVersion.contentUnitId, body: contentVersion.body })
      .from(contentVersion)
      .where(eq(contentVersion.id, versionId))
      .limit(1);
    if (!ver) throw new BundleError(404, "VERSION_NOT_FOUND");

    const [unit] = await tx
      .select({ id: contentUnit.id })
      .from(contentUnit)
      .where(and(eq(contentUnit.id, ver.unitId), eq(contentUnit.type, "slide_module")))
      .limit(1);
    if (!unit) throw new BundleError(404, "VERSION_NOT_FOUND"); // cross-board or wrong type

    const bundle = (ver.body as any)?.bundle;
    if (typeof bundle !== "string" || bundle.length === 0) {
      throw new BundleError(404, "BUNDLE_EMPTY");
    }
    return bundle;
  });
}
