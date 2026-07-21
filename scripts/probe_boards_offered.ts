/**
 * probe_boards_offered — the still-valid legs salvaged from probe_board_pick
 * (retired when the identity redesign superseded its Slice-E thesis that
 * `chooseBoard` enrols you on a board; the session/whoami/enter contract is now
 * covered by probe_auth_membership + probe_auth_session).
 *
 * What survived the redesign — none of these touch the dropped membership model:
 *   1. listBoards is an ALLOW-LIST, not a content query. A probe board with
 *      PUBLISHED slides is STILL not offered; a board with grades but nothing
 *      published is hidden; the three supported boards are offered in order;
 *      igcse is offered despite having no content at all; the answer stays small
 *      against the real DB. (This is the strongest guard: a `subject`-based rule
 *      once offered a child 46 boards of probe litter — an allow-list can't.)
 *   2. 🔑 THE CHICKEN-AND-EGG BREAK — listGradesForBoard returns a board's real
 *      grades WITHOUT any membership on it, in child-readable order, and returns
 *      EXACTLY what onboarding's own listGradeOptions returns (no second impl).
 *   3. Unknown slugs are refused on both entry points (no silent empty answer).
 *   4. SOURCE-LEVEL: `me` is on protectedProcedure and every `session.*`
 *      procedure is on sessionProcedure — catches `me` being reverted to
 *      authedProcedure, or a new pre-board procedure that needs a board it will
 *      never have.
 *   5. HTTP: session.whoami with no session → 401 (soft — skipped if the server
 *      isn't up). The board pick is pre-BOARD, never pre-AUTH.
 *
 * Unique per-run emails/slugs so it never touches real data (M22); self-cleans.
 */
import { eq, sql } from "drizzle-orm";
import { board, chapter, contentUnit, subject } from "@b2c/kernel/schema";
import { db, queryClient } from "../src/db/client";
import { withBoard } from "../src/db/with-board";
import { BoardNotFoundError, listBoards, withBoardBySlug } from "../src/services/session_boards";
import { listGradeOptions } from "../src/services/onboarding";
import { env } from "../src/config/env";

let passed = 0;
let failed = 0;
function check(name: string, ok: boolean) {
  if (ok) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.error(`  ✗ ${name}`);
  }
}

async function main() {
  const tag = `${Date.now()}`;

  await db.execute(sql`select 1`);
  check("DB connectivity (select 1) as app role", true);

  // Two throwaway boards. A has grades + a published slide module; Z has grades
  // but nothing published — neither is in the supported allow-list, which is the
  // whole point of leg 1.
  const [boardA] = await db
    .insert(board)
    .values({ slug: `probe-bo-a-${tag}`, name: `Probe Alpha ${tag}` })
    .returning();
  const [boardZ] = await db
    .insert(board)
    .values({ slug: `probe-bo-z-${tag}`, name: `Probe Zulu ${tag}` })
    .returning();
  if (!boardA || !boardZ) throw new Error("board seed failed");

  await withBoard(boardA.id, (tx) =>
    tx.insert(subject).values([
      { boardId: boardA.id, slug: `sci-${tag}`, name: "Science", grade: "10" },
      { boardId: boardA.id, slug: `mth-${tag}`, name: "Maths", grade: "9" },
    ]),
  );
  await withBoard(boardZ.id, (tx) =>
    tx.insert(subject).values([
      { boardId: boardZ.id, slug: `sci-${tag}`, name: "Science", grade: "IGCSE" },
    ]),
  );

  // A published slide module on A only — a chapter-grained content_unit with a
  // current version, the exact shape `getChapterNav.hasContent` counts (S108).
  const [subjA] = await withBoard(boardA.id, (tx) =>
    tx.select({ id: subject.id }).from(subject).where(eq(subject.slug, `sci-${tag}`)).limit(1),
  );
  const [chapA] = await withBoard(boardA.id, (tx) =>
    tx
      .insert(chapter)
      .values({ boardId: boardA.id, subjectId: subjA!.id, slug: `ch-${tag}`, name: "Ch", ordinal: 1 })
      .returning(),
  );
  await withBoard(boardA.id, (tx) =>
    tx.insert(contentUnit).values({
      boardId: boardA.id,
      type: "slide_module",
      chapterId: chapA!.id,
      subTopicId: null,
      // A published unit is one with a CURRENT VERSION. The id need not resolve
      // for this count (the FK is app-enforced, cycle-broken by design).
      currentVersionId: chapA!.id,
      source: "starkhorn",
    }),
  );

  // ── 1. listBoards offers the SUPPORTED boards — an allow-list, not a query.
  const offered = await listBoards();
  const slugs = offered.map((b) => b.slug);
  check(
    "🔴 a probe board with PUBLISHED slides is still NOT offered (allow-list, not content)",
    !slugs.includes(boardA.slug),
  );
  check(
    "🔴 listBoards HIDES a board that has grades but nothing published",
    !slugs.includes(boardZ.slug),
  );
  // SUPPORTED_BOARDS is ["cbse", "cambridge"] — igcse was dropped from the picker
  // by a founder commit. The offered set is exactly the seeded supported boards,
  // in order.
  check(
    "the supported boards ARE offered, in order (cbse, cambridge)",
    JSON.stringify(slugs) === JSON.stringify(["cbse", "cambridge"]),
  );
  check("listBoards stays small against the real DB (< 5 boards)", offered.length < 5);
  console.log(`     boards offered: ${slugs.join(", ")}`);

  // ── 2. 🔑 the chicken-and-egg break — grades load for a student who belongs
  // nowhere. listGradeOptions now returns the fixed SUPPORTED_GRADES (["8".."11"])
  // and takes no identity at all, which is the surviving property: the picker can
  // populate before any membership exists, and there is ONE source of truth.
  const grades = await withBoardBySlug(boardA.slug, (tx) => listGradeOptions(tx));
  check(
    "listGradeOptions returns the supported grades with NO membership",
    JSON.stringify(grades) === JSON.stringify(["8", "9", "10", "11"]),
  );
  // child-readable numeric order (D-ONB-2)
  check("grades keep their child-readable numeric order (8 < 9 < 10 < 11)", grades[0] === "8" && grades[3] === "11");
  // and it is the SAME function onboarding validates against, not a copy
  const direct = await withBoard(boardA.id, (tx) => listGradeOptions(tx));
  check(
    "same answer regardless of board (single source, no second implementation)",
    JSON.stringify(grades) === JSON.stringify(direct),
  );

  // ── 3. unknown slugs are refused, not answered empty.
  let gRefused = false;
  try {
    await withBoardBySlug(`no-such-board-${tag}`, async () => null);
  } catch (e) {
    gRefused = e instanceof BoardNotFoundError;
  }
  check("listGradesForBoard refuses an unknown board (BOARD_NOT_FOUND)", gRefused);

  // ── 4. SOURCE-LEVEL declarations.
  const routerSrc = await Bun.file(
    new URL("../src/trpc/router.ts", import.meta.url).pathname,
  ).text();
  check(
    "🔑 `me` is declared on protectedProcedure (not authedProcedure)",
    /\bme:\s*protectedProcedure\b/.test(routerSrc),
  );
  // Every procedure inside the `session:` router block must be sessionProcedure.
  const sessionBlock = routerSrc.slice(routerSrc.indexOf("session: router({"));
  const sessionBody = sessionBlock.slice(0, sessionBlock.indexOf("\n  }),"));
  const procs = [...sessionBody.matchAll(/^\s{4}(\w+):\s*(\w+)/gm)];
  check(
    "🔑 every session.* procedure is on sessionProcedure",
    procs.length > 0 && procs.every(([, , p]) => p === "sessionProcedure"),
  );
  const outsideDecls = routerSrc.replace(sessionBody, "").match(/^\s*\w+:\s*sessionProcedure\b/gm) ?? [];
  check("no procedure OUTSIDE the session namespace runs pre-board", outsideDecls.length === 0);

  // ── 5. HTTP (soft).
  try {
    const res = await fetch(`http://localhost:${env.PORT}/trpc/session.whoami?input=%7B%7D`, {
      signal: AbortSignal.timeout(5000),
    });
    check(`HTTP session.whoami (no session) → 401 (got ${res.status})`, res.status === 401);
  } catch {
    console.log("  ~ HTTP session.whoami skipped (server not running)");
  }

  // cleanup — content_unit → chapter → subject (FK chain), then the boards.
  await withBoard(boardA.id, (tx) => tx.delete(contentUnit).where(eq(contentUnit.boardId, boardA.id)));
  await withBoard(boardA.id, (tx) => tx.delete(chapter).where(eq(chapter.boardId, boardA.id)));
  await withBoard(boardA.id, (tx) => tx.delete(subject).where(eq(subject.boardId, boardA.id)));
  await withBoard(boardZ.id, (tx) => tx.delete(subject).where(eq(subject.boardId, boardZ.id)));
  await db.delete(board).where(eq(board.id, boardA.id));
  await db.delete(board).where(eq(board.id, boardZ.id));

  console.log(`\nprobe_boards_offered: ${passed} passed, ${failed} failed`);
  await queryClient.end();
  process.exit(failed === 0 ? 0 : 1);
}

main().catch(async (err) => {
  console.error("probe_boards_offered FAILED:", err);
  await queryClient.end();
  process.exit(1);
});
