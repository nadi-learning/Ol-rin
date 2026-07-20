/**
 * probe_board_pick — Slice E's exit gate: the student picks their board.
 *
 * Slice E inverts who creates a membership. `me` used to be an authedProcedure
 * that called `resolveMembership`, so READING "who am I" ENROLLED you on
 * whatever board the `x-board` header carried — and the FE hard-coded `cbse`.
 * Every new student was therefore silently enrolled on CBSE before they had
 * ever seen a picker. Now `me` is a pure read on `protectedProcedure` and
 * `session.chooseBoard` is the sole creation path.
 *
 * What this probe holds:
 *   1. DB connectivity as the app role.
 *   2. 🔴 THE INVERSION — `whoami` on a brand-new identity reports nothing AND
 *      WRITES NOTHING, and `me`'s gate (requireMembership) refuses them. This
 *      is the leg the whole slice exists for.
 *   3. chooseBoard is the creation path: membership appears, at 'student',
 *      written by the real flow (M11 — no seeded shortcut).
 *   4. chooseBoard is idempotent, and NON-DEMOTING for a tutor who re-picks
 *      their own board (the S110b read-before-write invariant, reached through
 *      the new entry point).
 *   5. 🔴 whoami ITERATES BOARDS UNDER withBoard. `membership` is FORCE-RLS'd,
 *      so a board-less read returns ZERO rows and reads as "belongs nowhere".
 *      The leg creates a membership and requires whoami to FIND it — which is
 *      exactly what a "simplified" board-less read would fail.
 *   6. `preferred` is the OLDEST membership, not the first board in list order.
 *   7. listBoards offers only boards with a real catalogue — an empty one
 *      strands the student on `— no classes set up yet —` with no way back.
 *   8. 🔑 THE CHICKEN-AND-EGG BREAK — listGradesForBoard returns a board's real
 *      grades WITHOUT a membership on it, and returns EXACTLY what onboarding's
 *      own `listGradeOptions` returns (two implementations would drift into a
 *      closed-set rejection at save time).
 *   9. Unknown slugs are refused on both entry points (no silent empty answer).
 *  10. SOURCE-LEVEL: `me` is declared on `protectedProcedure` and every
 *      `session.*` procedure on `sessionProcedure`. The runtime legs can only
 *      test what exists today; this is what catches `me` being quietly reverted
 *      to authedProcedure, or a fifth session procedure being added that needs
 *      a board it will never have.
 *  11. HTTP: session.whoami with no session → 401 (soft — skipped if the server
 *      isn't running). The board pick is pre-BOARD, never pre-AUTH.
 *
 * Unique per-run emails/slugs so it never touches real data (M22); cleans up
 * after itself.
 */
import { and, eq, sql } from "drizzle-orm";
import { appUser, board, chapter, contentUnit, membership, subject } from "@b2c/kernel/schema";
import { db, queryClient } from "../src/db/client";
import { withBoard } from "../src/db/with-board";
import {
  BoardNotFoundError,
  chooseBoard,
  listBoards,
  whoami,
  withBoardBySlug,
} from "../src/services/session_boards";
import { grantRole, NoMembershipError, requireMembership } from "../src/services/membership";
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
  const emailN = `probe-bp-new-${tag}@example.com`; // the brand-new student
  const emailT = `probe-bp-tut-${tag}@example.com`; // the tutor who re-picks
  const emailO = `probe-bp-old-${tag}@example.com`; // the `preferred` ordering actor

  // 1. connectivity
  await db.execute(sql`select 1`);
  check("DB connectivity (select 1) as app role", true);

  // Two throwaway boards. Names chosen so `allBoards`' name ordering puts
  // "Probe Alpha" FIRST — leg 6 needs list order and age to disagree.
  const [boardA] = await db
    .insert(board)
    .values({ slug: `probe-bp-a-${tag}`, name: `Probe Alpha ${tag}` })
    .returning();
  const [boardZ] = await db
    .insert(board)
    .values({ slug: `probe-bp-z-${tag}`, name: `Probe Zulu ${tag}` })
    .returning();
  if (!boardA || !boardZ) throw new Error("board seed failed");

  // Grades on BOTH boards — the difference between them is PUBLISHED CONTENT,
  // which is the whole point of leg 7. A board with grades and nothing to open
  // must not be offered, and giving Z grades is what makes that leg mean
  // something: the first cut of `listBoards` tested `subject` and would pass a
  // version of this probe where only A had any.
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
      // for this count (the FK is app-enforced, cycle-broken by design), and
      // pointing it at a real content_version would be testing the publisher,
      // not the picker.
      currentVersionId: chapA!.id,
      source: "starkhorn",
    }),
  );

  // ── 2. 🔴 THE INVERSION. A brand-new identity is known to auth and to
  // nothing else. Reading must not enrol them, and the `me` gate must refuse.
  const w0 = await whoami(emailN);
  check("new identity: whoami reports no memberships", w0.memberships.length === 0);
  check("new identity: whoami has no preferred board", w0.preferred === null);

  // …and the READ WROTE NOTHING. Asserted against the table, not the return
  // value: the old `me` returned a perfectly sensible answer while enrolling
  // the caller, so a return-value-only check would have gone green through
  // exactly the bug this slice removes.
  const wroteA = await withBoard(boardA.id, (tx) =>
    tx
      .select()
      .from(membership)
      .innerJoin(appUser, eq(membership.userId, appUser.id))
      .where(eq(appUser.email, emailN)),
  );
  check("🔴 whoami ENROLLED NOBODY (0 membership rows after the read)", wroteA.length === 0);

  // and `me`'s gate — protectedProcedure's requireMembership — refuses them.
  let refused = false;
  try {
    await withBoard(boardA.id, (tx) => requireMembership(tx, { email: emailN, board: boardA }));
  } catch (e) {
    refused = e instanceof NoMembershipError;
  }
  check("🔴 me's gate refuses a member-less identity (NO_MEMBERSHIP)", refused);

  // ── 3. chooseBoard is the creation path.
  const chosen = await chooseBoard({ slug: boardA.slug, email: emailN, name: "Probe New" });
  check("chooseBoard: role is 'student'", chosen.role === "student");
  check("chooseBoard: returns the board that was asked for", chosen.board.slug === boardA.slug);

  const rowsA = await withBoard(boardA.id, (tx) =>
    tx
      .select({ role: membership.role })
      .from(membership)
      .innerJoin(appUser, eq(membership.userId, appUser.id))
      .where(and(eq(appUser.email, emailN), eq(membership.boardId, boardA.id))),
  );
  check("M11: membership written by the real flow (exactly 1 row)", rowsA.length === 1);

  // and now the gate lets them through.
  const nowSeen = await withBoard(boardA.id, (tx) =>
    requireMembership(tx, { email: emailN, board: boardA }),
  );
  check("me's gate now admits them, at 'student'", nowSeen.role === "student");

  // ── 4. idempotent + non-demoting.
  await chooseBoard({ slug: boardA.slug, email: emailN, name: "Probe New" });
  const rowsA2 = await withBoard(boardA.id, (tx) =>
    tx
      .select({ role: membership.role })
      .from(membership)
      .innerJoin(appUser, eq(membership.userId, appUser.id))
      .where(and(eq(appUser.email, emailN), eq(membership.boardId, boardA.id))),
  );
  check("chooseBoard is idempotent: still exactly 1 membership", rowsA2.length === 1);

  // M54: assert the ROLE, not the row count. A demotion OVERWRITES the row —
  // a count-only check stays green straight through the regression.
  await withBoard(boardA.id, (tx) =>
    grantRole(tx, { email: emailT, name: "Probe Tutor", board: boardA, role: "tutor" }),
  );
  const reChosen = await chooseBoard({ slug: boardA.slug, email: emailT, name: "Probe Tutor" });
  check("NO-DOWNGRADE: a tutor re-picking their board is STILL a tutor", reChosen.role === "tutor");
  const tSeen = await withBoard(boardA.id, (tx) =>
    requireMembership(tx, { email: emailT, board: boardA }),
  );
  check("NO-DOWNGRADE: the DB row says tutor too, not just the return value", tSeen.role === "tutor");

  // ── 5. 🔴 whoami really iterates boards under withBoard.
  const wN = await whoami(emailN);
  check("whoami FINDS the membership it was just given", wN.memberships.length === 1);
  check("whoami reports the right board", wN.memberships[0]?.slug === boardA.slug);
  check("whoami reports the right role", wN.memberships[0]?.role === "student");
  check("whoami: preferred is that board", wN.preferred === boardA.slug);

  // The RLS trap head-on: a membership on the SECOND board must also be found.
  // A board-less `select from membership` returns ZERO rows under FORCE-RLS and
  // would report "belongs nowhere" — the spurious clean answer.
  await chooseBoard({ slug: boardZ.slug, email: emailN, name: "Probe New" });
  const wBoth = await whoami(emailN);
  check("🔴 whoami spans BOTH boards (the withBoard loop, not a boardless read)", wBoth.memberships.length === 2);

  // ── 6. `preferred` is the OLDEST membership, not list order.
  // Zulu's membership is backdated so age and name-order DISAGREE; if preferred
  // were "first board in the list" this leg fails, which is the point.
  await chooseBoard({ slug: boardA.slug, email: emailO, name: "Probe Old" });
  await chooseBoard({ slug: boardZ.slug, email: emailO, name: "Probe Old" });
  const [oUser] = await db.select({ id: appUser.id }).from(appUser).where(eq(appUser.email, emailO));
  await withBoard(boardZ.id, (tx) =>
    tx
      .update(membership)
      .set({ createdAt: new Date(Date.now() - 86_400_000) })
      .where(and(eq(membership.userId, oUser!.id), eq(membership.boardId, boardZ.id))),
  );
  const wOld = await whoami(emailO);
  check("preferred is the OLDEST membership, not the first board listed", wOld.preferred === boardZ.slug);

  // ── 7. listBoards offers the SUPPORTED boards — an allow-list, not a query.
  //
  // 🔑 INVERTED in Slice M. This section used to assert the published-slides
  // rule: board A (published) offered, board Z (grades, nothing published)
  // hidden. The founder's call replaced the derivation with a fixed set —
  // cbse, igcse, cambridge — so a board is offered because we intend to serve
  // it, not because content happens to exist behind it today.
  //
  // 🔴 THE OLD SECTION'S REAL WIN IS NOW STRONGER, AND THAT IS WHY THIS IS AN
  // INVERSION AND NOT A DELETION. Its purpose was never "published slides" for
  // its own sake — it was that a `subject`-based test offered a child 46 boards
  // of probe litter ("Fig P", "Probe Q"). Under an allow-list that CANNOT
  // happen for any reason: boardA here has published slides and is still not
  // offered, which no content-based rule could guarantee.
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
  check(
    "the three supported boards ARE offered, in order",
    JSON.stringify(slugs) === JSON.stringify(["cbse", "igcse", "cambridge"]),
  );
  // igcse is the board that exists with NOTHING behind it — the population the
  // "still setting this up" screen was built for. If this ever drops out, that
  // screen has no way to be reached and the seed has silently not run.
  check("igcse is offered despite having no content at all", slugs.includes("igcse"));
  // and the real answer stays sane — the picker a student actually sees is the
  // two real boards, not every row in the table.
  check("listBoards stays small against the real DB (< 5 boards)", offered.length < 5);
  console.log(`     boards offered: ${slugs.join(", ")}`);

  // ── 8. 🔑 the chicken-and-egg break.
  // emailN has a membership on A by now, so use a slug read alone — the service
  // takes no identity at all, which is the property: grades load for a student
  // who belongs nowhere.
  const grades = await withBoardBySlug(boardA.slug, (tx) => listGradeOptions(tx));
  check("listGradesForBoard reads a board's grades with NO membership", grades.length === 2);
  // numeric-first ordering (D-ONB-2) survives the new entry point
  check("grades keep their child-readable order (9 before 10)", grades[0] === "9" && grades[1] === "10");
  // and it is the SAME function onboarding validates against, not a copy
  const direct = await withBoard(boardA.id, (tx) => listGradeOptions(tx));
  check(
    "same answer as onboarding's own listGradeOptions (no second implementation)",
    JSON.stringify(grades) === JSON.stringify(direct),
  );

  // ── 9. unknown slugs are refused, not answered empty.
  let cbRefused = false;
  try {
    await chooseBoard({ slug: `no-such-board-${tag}`, email: emailN, name: null });
  } catch (e) {
    cbRefused = e instanceof BoardNotFoundError;
  }
  check("chooseBoard refuses an unknown board (BOARD_NOT_FOUND)", cbRefused);

  let gRefused = false;
  try {
    await withBoardBySlug(`no-such-board-${tag}`, async () => null);
  } catch (e) {
    gRefused = e instanceof BoardNotFoundError;
  }
  check("listGradesForBoard refuses an unknown board (BOARD_NOT_FOUND)", gRefused);

  // ── 10. SOURCE-LEVEL declarations.
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
  check("session namespace declares all four procedures", procs.length === 4);
  check(
    "🔑 every session.* procedure is on sessionProcedure",
    procs.length > 0 && procs.every(([, , p]) => p === "sessionProcedure"),
  );
  // and nothing else in the router runs pre-board. Matches DECLARATIONS
  // (`name: sessionProcedure`) rather than the bare identifier — the identifier
  // also appears in the import and in prose comments, so a bare count would be
  // asserting something about the documentation.
  const outsideDecls = routerSrc.replace(sessionBody, "").match(/^\s*\w+:\s*sessionProcedure\b/gm) ?? [];
  check("no procedure OUTSIDE the session namespace runs pre-board", outsideDecls.length === 0);

  // ── 11. HTTP (soft).
  try {
    const res = await fetch(`http://localhost:${env.PORT}/trpc/session.whoami?input=%7B%7D`, {
      signal: AbortSignal.timeout(5000),
    });
    check(`HTTP session.whoami (no session) → 401 (got ${res.status})`, res.status === 401);
  } catch {
    console.log("  ~ HTTP session.whoami skipped (server not running)");
  }

  // cleanup — RLS-scoped rows withBoard; app_user + board global.
  await withBoard(boardA.id, (tx) => tx.delete(membership).where(eq(membership.boardId, boardA.id)));
  await withBoard(boardZ.id, (tx) => tx.delete(membership).where(eq(membership.boardId, boardZ.id)));
  // Order matters: content_unit → chapter → subject (FK dependency chain).
  await withBoard(boardA.id, (tx) => tx.delete(contentUnit).where(eq(contentUnit.boardId, boardA.id)));
  await withBoard(boardA.id, (tx) => tx.delete(chapter).where(eq(chapter.boardId, boardA.id)));
  await withBoard(boardA.id, (tx) => tx.delete(subject).where(eq(subject.boardId, boardA.id)));
  await withBoard(boardZ.id, (tx) => tx.delete(subject).where(eq(subject.boardId, boardZ.id)));
  for (const e of [emailN, emailT, emailO]) {
    await db.delete(appUser).where(eq(appUser.email, e));
  }
  await db.delete(board).where(eq(board.id, boardA.id));
  await db.delete(board).where(eq(board.id, boardZ.id));

  console.log(`\nprobe_board_pick: ${passed} passed, ${failed} failed`);
  await queryClient.end();
  process.exit(failed === 0 ? 0 : 1);
}

main().catch(async (err) => {
  console.error("probe_board_pick FAILED:", err);
  await queryClient.end();
  process.exit(1);
});
