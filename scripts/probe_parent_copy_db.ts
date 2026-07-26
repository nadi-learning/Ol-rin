/**
 * probe_parent_copy_db — the DB half of D-PDASH-3 (S168): per-board overrides of
 * the parent-dashboard copy.
 *
 * Drives the real service against a throwaway board (M22), then tears it down.
 * The sibling `probe_parent_copy.ts` guards the CODE map (no pronouns, every
 * call site supplies its tokens); this one guards the OVERRIDE path:
 *
 *   · an override wins over the code default, and clearing reverts to it
 *   · an override introducing a NEW `{token}` is REFUSED at save time — the one
 *     way this feature could blank a real parent's dashboard, since `fillCopy`
 *     throws during render and the call sites supply a fixed set of tokens
 *   · overrides are BOARD-SCOPED — board B cannot see or be changed by board A
 *   · an override for a key that no longer exists in the code map is INERT
 *   · the dashboard payload actually CARRIES them (`copyOverrides`), which is
 *     what lets the client-resolved half of the page speak in the same voice
 *
 * §8+ (S169, D-PDASH-8) guard the SECOND scope — per-student overrides:
 *
 *   · the chain resolves default → board → student, in that order
 *   · one student's row does NOT leak onto a sibling's page
 *   · clearing a student row falls back to the BOARD's voice, not the code
 *     default (the two differ, and reverting too far is the likely mistake)
 *   · the token guard and the board-crossing refusal both hold at student scope
 *
 *   bun scripts/probe_parent_copy_db.ts
 */
import { eq } from "drizzle-orm";
import { board, parentCopy } from "@b2c/kernel/schema";
import { PARENT_COPY_DEFAULTS } from "@b2c/kernel/parent-copy";
import { db, queryClient } from "../src/db/client";
import { withBoard } from "../src/db/with-board";
import {
  listParentCopy,
  listParentCopyStudents,
  readParentCopyOverrides,
  setParentCopy,
  UnknownCopyKeyError,
  UnknownCopyStudentError,
  UnsafeCopyTokensError,
} from "../src/services/parent_copy";
import { ensureProfile } from "../src/services/membership";
import { student as studentTable } from "@b2c/kernel/schema";

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
  console.log("probe_parent_copy_db\n");
  const tag = Date.now().toString(36);
  const [P] = await db
    .insert(board)
    .values({ slug: `pcopy-p-${tag}`, name: "P" })
    .returning();
  const [Q] = await db
    .insert(board)
    .values({ slug: `pcopy-q-${tag}`, name: "Q" })
    .returning();
  const actor = await db.transaction((tx) =>
    ensureProfile(tx as any, { email: `pcopy-${tag}@example.com`, name: "Ed", userType: "admin" }),
  );

  try {
    // §1 no overrides → every entry falls back, nothing is blank.
    const base = await withBoard(P!.id, (tx) => listParentCopy(tx));
    check(
      `§1 lists all ${Object.keys(PARENT_COPY_DEFAULTS).length} keys with no overrides set`,
      base.length === Object.keys(PARENT_COPY_DEFAULTS).length && base.every((e) => e.override === null),
    );
    check("§1b every entry carries its code default", base.every((e) => e.default.length > 0));
    check(
      "§1c the editor is told which tokens it may use",
      base.find((e) => e.key === "section.map.title")?.tokens.join() === "name",
    );

    // §2 set → wins over the default.
    await withBoard(P!.id, (tx) =>
      setParentCopy(tx, {
        boardId: P!.id,
        key: "section.map.title",
        value: "Chapters {name} has worked through",
        actorId: actor.id,
      }),
    );
    const afterSet = await withBoard(P!.id, (tx) => readParentCopyOverrides(tx));
    check(
      "§2 override is stored and read back",
      afterSet["section.map.title"] === "Chapters {name} has worked through",
    );

    // §3 THE GUARD — a new token would throw at RENDER for a real parent.
    let refused: UnsafeCopyTokensError | null = null;
    try {
      await withBoard(P!.id, (tx) =>
        setParentCopy(tx, {
          boardId: P!.id,
          key: "section.map.title",
          value: "How {name} is doing in {subject}",
          actorId: actor.id,
        }),
      );
    } catch (e) {
      if (e instanceof UnsafeCopyTokensError) refused = e;
    }
    check("§3 an override introducing a NEW {token} is REFUSED", refused !== null);
    check("§3b the error names the offending token", refused?.offending.join() === "subject");
    check(
      "§3c the refusal did NOT overwrite the good value",
      (await withBoard(P!.id, (tx) => readParentCopyOverrides(tx)))["section.map.title"] ===
        "Chapters {name} has worked through",
    );
    // Using FEWER tokens than the default is fine — a plainer heading is legal.
    await withBoard(P!.id, (tx) =>
      setParentCopy(tx, {
        boardId: P!.id,
        key: "section.meters.title",
        value: "What they can do now",
        actorId: actor.id,
      }),
    );
    check(
      "§3d dropping a token is ALLOWED (fewer is safe, more is not)",
      (await withBoard(P!.id, (tx) => readParentCopyOverrides(tx)))["section.meters.title"] ===
        "What they can do now",
    );

    // §4 unknown key refused — nothing would ever read it.
    let unknown = false;
    try {
      await withBoard(P!.id, (tx) =>
        setParentCopy(tx, { boardId: P!.id, key: "section.nope", value: "x", actorId: actor.id }),
      );
    } catch (e) {
      unknown = e instanceof UnknownCopyKeyError;
    }
    check("§4 an unknown copy key is refused", unknown);

    // §5 BOARD SCOPING — Q must not see P's voice.
    const qView = await withBoard(Q!.id, (tx) => readParentCopyOverrides(tx));
    check("§5 board Q sees NONE of board P's overrides (RLS)", Object.keys(qView).length === 0);
    await withBoard(Q!.id, (tx) =>
      setParentCopy(tx, {
        boardId: Q!.id,
        key: "section.map.title",
        value: "Q's own heading for {name}",
        actorId: actor.id,
      }),
    );
    check(
      "§5b the two boards hold DIFFERENT values for the same key",
      (await withBoard(P!.id, (tx) => readParentCopyOverrides(tx)))["section.map.title"] !==
        (await withBoard(Q!.id, (tx) => readParentCopyOverrides(tx)))["section.map.title"],
    );

    // §6 CLEAR reverts to the code default (and deletes, never stores "").
    await withBoard(P!.id, (tx) =>
      setParentCopy(tx, { boardId: P!.id, key: "section.map.title", value: "   ", actorId: actor.id }),
    );
    const cleared = await withBoard(P!.id, (tx) => readParentCopyOverrides(tx));
    check("§6 a blank value CLEARS the override", cleared["section.map.title"] === undefined);
    const rows = await withBoard(P!.id, (tx) =>
      tx.select().from(parentCopy).where(eq(parentCopy.key, "section.map.title")),
    );
    check("§6b the row is DELETED, not stored as an empty string", rows.length === 0);

    // §7 a stale key (copy refactor) is inert, not a fault.
    await withBoard(P!.id, (tx) =>
      tx.insert(parentCopy).values({ boardId: P!.id, key: "section.retired.title", value: "ghost" }),
    );
    const withStale = await withBoard(P!.id, (tx) => readParentCopyOverrides(tx));
    check(
      "§7 an override for a key no longer in the code map is IGNORED",
      withStale["section.retired.title"] === undefined,
    );
    check("§7b the surviving override still reads", withStale["section.meters.title"] === "What they can do now");

    // ── S169 · the SECOND scope: per-student overrides (D-PDASH-8) ───────────
    // Two children on P, one on Q — enough to prove both that a sibling is
    // unaffected and that a student id from another board is refused.
    const kidA = await db.transaction((tx) =>
      ensureProfile(tx as any, { email: `pcopy-a-${tag}@example.com`, name: "Ada", userType: "student" }),
    );
    const kidB = await db.transaction((tx) =>
      ensureProfile(tx as any, { email: `pcopy-b-${tag}@example.com`, name: "Bo", userType: "student" }),
    );
    const kidQ = await db.transaction((tx) =>
      ensureProfile(tx as any, { email: `pcopy-q-${tag}@example.com`, name: "Qi", userType: "student" }),
    );
    await withBoard(P!.id, (tx) =>
      tx.insert(studentTable).values([
        { userId: kidA.id, boardId: P!.id, class: "10" },
        { userId: kidB.id, boardId: P!.id, class: "9" },
      ]),
    );
    await withBoard(Q!.id, (tx) =>
      tx.insert(studentTable).values({ userId: kidQ.id, boardId: Q!.id, class: "10" }),
    );

    // The board voice for the key under test (set in §3d, still standing).
    const BOARD_VOICE = "What they can do now";
    await withBoard(P!.id, (tx) =>
      setParentCopy(tx, {
        boardId: P!.id,
        studentId: kidA.id,
        key: "section.meters.title",
        value: "What Ada can do now",
        actorId: actor.id,
      }),
    );

    const aView = await withBoard(P!.id, (tx) => readParentCopyOverrides(tx, kidA.id));
    const bView = await withBoard(P!.id, (tx) => readParentCopyOverrides(tx, kidB.id));
    const boardView = await withBoard(P!.id, (tx) => readParentCopyOverrides(tx, null));
    check("§8 the student's own row WINS over the board's", aView["section.meters.title"] === "What Ada can do now");
    check("§8b a SIBLING still reads the board's voice", bView["section.meters.title"] === BOARD_VOICE);
    check("§8c the BOARD scope is unchanged by a student edit", boardView["section.meters.title"] === BOARD_VOICE);

    // A key the student has NOT overridden still inherits the board's row.
    await withBoard(P!.id, (tx) =>
      setParentCopy(tx, {
        boardId: P!.id,
        key: "section.map.title",
        value: "Board heading for {name}",
        actorId: actor.id,
      }),
    );
    check(
      "§8d an un-overridden key falls through the chain to the BOARD row",
      (await withBoard(P!.id, (tx) => readParentCopyOverrides(tx, kidA.id)))["section.map.title"] ===
        "Board heading for {name}",
    );

    // §9 the editor's view of a student scope.
    const aList = await withBoard(P!.id, (tx) => listParentCopy(tx, { studentId: kidA.id }));
    const meters = aList.find((e) => e.key === "section.meters.title");
    check("§9 the student view shows the student's own row as the override", meters?.override === "What Ada can do now");
    check("§9b it reports the BOARD value as what clearing reverts to", meters?.inherited === BOARD_VOICE);
    check("§9c it carries the board override separately for context", meters?.boardOverride === BOARD_VOICE);
    const untouched = aList.find((e) => e.key === "section.calibration.title");
    check(
      "§9d an untouched key shows NO student override and falls back to the code default",
      untouched?.override === null &&
        untouched?.inherited === PARENT_COPY_DEFAULTS["section.calibration.title"],
    );
    const boardList = await withBoard(P!.id, (tx) => listParentCopy(tx));
    check(
      "§9e the BOARD view is unpolluted by student rows",
      boardList.find((e) => e.key === "section.meters.title")?.override === BOARD_VOICE,
    );

    // §10 clearing a student row exposes the BOARD's voice, not the code default.
    await withBoard(P!.id, (tx) =>
      setParentCopy(tx, {
        boardId: P!.id,
        studentId: kidA.id,
        key: "section.meters.title",
        value: "",
        actorId: actor.id,
      }),
    );
    check(
      "§10 clearing a student row falls back to the BOARD, not the code default",
      (await withBoard(P!.id, (tx) => readParentCopyOverrides(tx, kidA.id)))["section.meters.title"] ===
        BOARD_VOICE,
    );
    check(
      "§10b the student row is DELETED, not stored empty",
      (await withBoard(P!.id, (tx) =>
        tx.select().from(parentCopy).where(eq(parentCopy.studentId, kidA.id)),
      )).length === 0,
    );

    // §11 the guards hold at student scope too.
    let studentTokenRefused = false;
    try {
      await withBoard(P!.id, (tx) =>
        setParentCopy(tx, {
          boardId: P!.id,
          studentId: kidA.id,
          key: "section.map.title",
          value: "How {name} is doing in {subject}",
          actorId: actor.id,
        }),
      );
    } catch (e) {
      studentTokenRefused = e instanceof UnsafeCopyTokensError;
    }
    check("§11 the token guard applies at STUDENT scope", studentTokenRefused);

    // A student on ANOTHER board is refused — RLS makes the lookup come back
    // empty, and the service turns that into a refusal rather than a silent
    // board-crossing write.
    let crossBoard = false;
    try {
      await withBoard(P!.id, (tx) =>
        setParentCopy(tx, {
          boardId: P!.id,
          studentId: kidQ.id,
          key: "section.map.title",
          value: "nope",
          actorId: actor.id,
        }),
      );
    } catch (e) {
      crossBoard = e instanceof UnknownCopyStudentError;
    }
    check("§11b a student from ANOTHER board is REFUSED", crossBoard);
    let crossBoardList = false;
    try {
      await withBoard(P!.id, (tx) => listParentCopy(tx, { studentId: kidQ.id }));
    } catch (e) {
      crossBoardList = e instanceof UnknownCopyStudentError;
    }
    check("§11c reading another board's student is REFUSED too", crossBoardList);

    // §12 the picker feed.
    await withBoard(P!.id, (tx) =>
      setParentCopy(tx, {
        boardId: P!.id,
        studentId: kidB.id,
        key: "section.meters.title",
        value: "What Bo can do now",
        actorId: actor.id,
      }),
    );
    const roster = await withBoard(P!.id, (tx) => listParentCopyStudents(tx));
    check("§12 the picker lists this board's students only", roster.length === 2);
    check(
      "§12b it counts each student's OWN overrides (board rows excluded)",
      roster.find((s) => s.studentId === kidB.id)?.overrides === 1 &&
        roster.find((s) => s.studentId === kidA.id)?.overrides === 0,
    );
    check(
      "§12c it flags a child no parent can read yet",
      roster.every((s) => s.hasParent === false),
    );
    const qRoster = await withBoard(Q!.id, (tx) => listParentCopyStudents(tx));
    check("§12d board Q's picker sees only Q's student", qRoster.length === 1 && qRoster[0]!.studentId === kidQ.id);
  } finally {
    // ⚠️ `parent_copy` is RLS'd + FORCEd, so a board-less `db.delete` matches
    // NOTHING and silently leaves the rows behind — after which dropping the
    // board fails on the FK. Teardown must claim each board too (M80's family:
    // an RLS-scoped statement outside a claim is a no-op, not an error).
    // Order matters: copy rows reference students, students reference the board.
    // Both deletes must run INSIDE the claim for the same reason.
    for (const b of [P!, Q!]) {
      await withBoard(b.id, (tx) => tx.delete(parentCopy));
      await withBoard(b.id, (tx) => tx.delete(studentTable));
      await db.delete(board).where(eq(board.id, b.id));
    }
  }

  console.log(`\nprobe_parent_copy_db: ${passed} passed, ${failed} failed`);
  await queryClient.end();
  process.exit(failed === 0 ? 0 : 1);
}

main().catch(async (err) => {
  console.error("probe_parent_copy_db FAILED:", err);
  await queryClient.end();
  process.exit(1);
});
