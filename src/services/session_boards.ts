/**
 * Slice E — the board pick. The pre-board session surface.
 *
 * 🔑 THE CHICKEN-AND-EGG THIS EXISTS TO BREAK. Every other read in this app is
 * board-scoped: `authedProcedure` (init.ts) rejects any call whose `x-board`
 * header is missing or unknown, and the grade chips a student picks from are
 * themselves board-scoped (`listGradeOptions` reads `subject`, which is
 * FORCE-RLS'd). So a brand-new student cannot be shown grades until they have
 * committed to a board — and cannot commit to a board through any procedure
 * that already requires one. These four reads are the only ones in the codebase
 * that run WITHOUT a board, and they are deliberately tiny.
 *
 * 🔴 EVERY MEMBERSHIP READ HERE ITERATES BOARDS UNDER withBoard. `membership`
 * is FORCE-RLS'd, so a board-less select returns ZERO rows and reads as
 * "this person belongs nowhere" — the spurious clean answer this codebase has
 * been bitten by repeatedly (see b2c-two-user-tables). The loop costs one
 * transaction per board and there are TWO boards. That is the price of not
 * punching an RLS hole, and it is the right price: a policy exception here
 * would be a permanent tenant-isolation weakness bought to save one query.
 * DO NOT "optimise" this into a board-less read or a policy carve-out.
 */
// `isNotNull`/`isNull`/`sql` + `contentUnit` went with the published-slides
// count in listBoards (Slice M) — the offered set is now an allow-list, so this
// file no longer reads content at all.
import { and, eq } from "drizzle-orm";
import type { PgTransaction } from "drizzle-orm/pg-core";
import { appUser, board as boardTable, membership } from "@b2c/kernel/schema";
import { db } from "../db/client";
import { withBoard } from "../db/with-board";
import { resolveMembership, type ResolvedMembership } from "./membership";

export class BoardNotFoundError extends Error {
  readonly code = "BOARD_NOT_FOUND";
  constructor(slug: string) {
    super(`no board with slug ${slug}`);
    this.name = "BoardNotFoundError";
  }
}

export type BoardOption = { slug: string; name: string };
export type MembershipSummary = { slug: string; name: string; role: string };
export type Whoami = {
  memberships: MembershipSummary[];
  /** The board to enter on boot, or null when the student must still pick. */
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
 * The boards a student may actually pick — those with something to LEARN.
 *
 * 🔴 THE TEST IS PUBLISHED SLIDES, NOT A `subject` ROW. The first cut of this
 * checked `subject`, on the reasoning that a board with no grades strands the
 * student on `— no classes set up yet —`. The browser walk showed what that
 * actually returns against a real database: **46 boards**, because "insert one
 * subject" is a single line every probe writes, and the picker offered a child
 * "Fig P", "Probe Q" and "Probe T". Measured on the dev DB: 76 boards exist,
 * 46 have a subject, and exactly **2** have published slides — cbse and
 * cambridge, the two real ones.
 *
 * Published slides is also the RIGHT rule, not merely a stricter one. The dead
 * end that matters is not "no grades", it is "no lessons": a board with a full
 * grade list and nothing published drops the student on a dashboard where every
 * "Start lesson" 404s. This is the same signal `getChapterNav.hasContent` uses
 * to aim the first-run CTA (S108) — one concept, two call sites, not a new one.
 *
 * ⚠️ CONSEQUENCE, worth knowing before content moves: a board is only pickable
 * while it has ≥1 published chapter. If cbse's single published chapter were
 * ever unpublished, cbse would vanish from the picker rather than offer an
 * empty product. That is deliberate, but it means the picker is now downstream
 * of content publishing.
 *
 * `content_unit` is RLS'd, hence the per-board withBoard (see the file header).
 */
/**
 * 🔑 Slice M (founder) — THE OFFERED BOARDS ARE A PRODUCT DECISION, not a query
 * result. This **supersedes the published-slides rule documented above**, which
 * is kept verbatim because its reasoning still explains the two failure modes
 * this list has to keep avoiding.
 *
 * What changed and why: the derived rule made the picker downstream of content
 * publishing (its own ⚠️ said so). The founder wants the three boards we intend
 * to serve — CBSE, IGCSE, Cambridge — visible now, and a board with nothing
 * behind it to land the student on the "still setting this up" screen rather
 * than hide. That is a strictly better dead end than the derived rule's, which
 * was to make the board VANISH: a child told "we're setting it up" knows the
 * app works and their board is coming; a child who cannot find their board at
 * all concludes the product is not for them.
 *
 * 🔴 The old rule's real win is preserved. It existed because a `subject`-based
 * check offered a child "Fig P", "Probe Q" and "Probe T" — 46 boards, mostly
 * probe litter. An explicit allow-list cannot regress into that no matter what
 * any probe inserts, which is a stronger guarantee than the content check was.
 *
 * 🔴 EVERY SLUG HERE MUST EXIST IN `board`. `chooseBoard` throws BoardNotFound
 * on a miss, so an unseeded slug is a crash on the student's first tap, not an
 * empty product. `bun run seed:boards` creates them and is the sibling of this
 * list — see `scripts/seed_boards.ts`.
 *
 * Order is the order the chips render.
 */
const SUPPORTED_BOARDS: readonly string[] = ["cbse", "igcse", "cambridge"];

export async function listBoards(): Promise<BoardOption[]> {
  const boards = await allBoards();
  const bySlug = new Map(boards.map((b) => [b.slug, b]));
  // Missing rows are SKIPPED rather than fabricated: a chip we cannot resolve
  // to a real board id is the crash described above, so the picker showing two
  // boards on an unseeded database is the safe failure, not the silent one.
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
 * Where this identity already belongs. Drives the FE boot: no memberships ⇒
 * show the picker inside onboarding; otherwise enter at `preferred`.
 *
 * `preferred` is the OLDEST membership, not the first board alphabetically —
 * a tutor who was later granted a second board must keep landing on the one
 * they have been using. Ties (same timestamp) fall back to board name order,
 * which `allBoards` already imposes.
 *
 * Returns memberships rather than a single board on purpose: the FE needs to
 * distinguish "none yet" (pick) from "exactly one" (enter) without a second
 * round-trip, and a future board switcher reads the same shape.
 */
export async function whoami(email: string): Promise<Whoami> {
  const boards = await allBoards();
  const found: (MembershipSummary & { at: Date })[] = [];

  for (const b of boards) {
    const row = await withBoard(b.id, async (tx) => {
      const [m] = await tx
        .select({ role: membership.role, at: membership.createdAt })
        .from(membership)
        .innerJoin(appUser, eq(appUser.id, membership.userId))
        .where(and(eq(appUser.email, email), eq(membership.boardId, b.id)))
        .limit(1);
      return m ?? null;
    });
    if (row) found.push({ slug: b.slug, name: b.name, role: row.role, at: row.at });
  }

  // Stable sort: `found` is already in board-name order, and Array.sort is
  // stable in every runtime this ships on, so equal timestamps keep that order.
  found.sort((a, b) => a.at.getTime() - b.at.getTime());

  return {
    memberships: found.map(({ slug, name, role }) => ({ slug, name, role })),
    preferred: found[0]?.slug ?? null,
  };
}

/**
 * Commit this identity to a board — the SOLE membership-creation path since
 * Slice E. `me` used to create memberships as a side effect of being read,
 * which meant the FE's hard-coded `x-board: cbse` minted a CBSE membership
 * before the student had ever seen a picker. That inversion is the whole point
 * of this slice: creation is now an explicit act with an explicit board.
 *
 * Delegates to `resolveMembership` (M11) — the same helper login has always
 * driven — so this is a new ENTRY POINT, not a second implementation. Calling
 * it for a board the student already belongs to is a no-op that returns the
 * existing role: the read-before-write in `resolveMembership` means a returning
 * tutor is not demoted by re-picking their own board.
 */
export async function chooseBoard(args: {
  slug: string;
  email: string;
  name: string | null;
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
    }),
  );
}

/**
 * Run a read inside a board WITHOUT requiring a membership there — the other
 * half of the chicken-and-egg break, used by `session.listGradesForBoard`.
 *
 * Deliberately narrow: it takes a slug and hands back a board-scoped tx, so the
 * only thing that widens the pre-membership read surface is a new caller, which
 * is reviewable. Do not export a generic "run anything unscoped" helper.
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
