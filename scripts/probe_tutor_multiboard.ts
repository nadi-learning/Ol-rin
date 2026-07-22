/**
 * probe_tutor_multiboard — the data contract behind the tutor BOARD SWITCHER.
 *
 * The FE capsule (TutorPage) derives its switchable boards from `whoami` and
 * re-scopes the roster by flipping `x-board`. This proves the two facts that
 * FE logic depends on, against real RLS, with a THROWAWAY fixture (boards P/Q):
 *
 *   1. A tutor granted on TWO boards yields TWO enabled tutor entries from
 *      whoami — one per board, each with the board's slug+name (the capsule).
 *   2. listStudents re-scopes by active board: under P → only P's student,
 *      under Q → only Q's student (the switch itself). Cross-board isolation.
 *
 * Cleans up after itself (M22 — canonical seeds stay pristine).
 */
import { eq } from "drizzle-orm";
import type { PgTransaction } from "drizzle-orm/pg-core";
import { appUser, board, student } from "@b2c/kernel/schema";
import { db, queryClient } from "../src/db/client";
import { withBoard } from "../src/db/with-board";
import { grantRole } from "../src/services/membership";
import { listStudents } from "../src/services/tutor";
import { whoami } from "../src/services/session_boards";

type Tx = PgTransaction<any, any, any>;

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
  const [P] = await db.insert(board).values({ slug: `mbt-p-${tag}`, name: "MB Alpha" }).returning();
  const [Q] = await db.insert(board).values({ slug: `mbt-q-${tag}`, name: "MB Beta" }).returning();
  if (!P || !Q) throw new Error("board seed failed");

  const emailT = `mbt-t-${tag}@example.com`;
  const emailSP = `mbt-sp-${tag}@example.com`;
  const emailSQ = `mbt-sq-${tag}@example.com`;

  // Tutor granted on BOTH boards via the real flow — grantRole appends each
  // board to tutor.boards[] (membership.ts), exactly as the admin board-switcher
  // does. One student per board, each linked to the tutor (student.tutor_id).
  const T = await withBoard(P.id, (tx) => grantRole(tx, { email: emailT, name: "Multi Tutor", board: P, role: "tutor" }));
  await withBoard(Q.id, (tx) => grantRole(tx, { email: emailT, name: "Multi Tutor", board: Q, role: "tutor" }));
  const SP = await withBoard(P.id, (tx) => grantRole(tx, { email: emailSP, name: "Alpha Student", board: P, role: "student" }));
  const SQ = await withBoard(Q.id, (tx) => grantRole(tx, { email: emailSQ, name: "Beta Student", board: Q, role: "student" }));
  const userT = T.user.id;

  await withBoard(P.id, (tx: Tx) =>
    tx.insert(student).values({ userId: SP.user.id, boardId: P.id, class: "9", tutorId: userT }),
  );
  await withBoard(Q.id, (tx: Tx) =>
    tx.insert(student).values({ userId: SQ.user.id, boardId: Q.id, class: "9", tutorId: userT }),
  );

  // 1. whoami → the capsule's board list. Exactly two enabled tutor entries,
  //    one per board, each carrying the board's slug + name.
  const who = await whoami(emailT);
  const tutorEntries = who.memberships.filter((m) => m.role === "tutor" && m.enabled);
  const slugs = new Set(tutorEntries.map((m) => m.slug));
  check("whoami → exactly 2 enabled tutor entries (one per board)", tutorEntries.length === 2);
  check("whoami → both board slugs present (P and Q)", slugs.has(P.slug) && slugs.has(Q.slug));
  check(
    "whoami → each tutor entry carries slug + name (capsule label)",
    tutorEntries.every((m) => !!m.slug && !!m.name),
  );

  // 2. listStudents re-scopes by active board — the switch itself.
  const underP = await withBoard(P.id, (tx) => listStudents(tx, userT));
  const underQ = await withBoard(Q.id, (tx) => listStudents(tx, userT));
  check("under board P → only Alpha Student", underP.length === 1 && underP[0]!.email === emailSP);
  check("under board Q → only Beta Student", underQ.length === 1 && underQ[0]!.email === emailSQ);
  check(
    "roster differs across boards (the switch changes what's shown)",
    underP[0]!.studentId !== underQ[0]!.studentId,
  );

  // 3. Each student carries its OWN board slug — the FE pins setBoard(student.board)
  //    on select so a drifted global x-board can't 404 a cross-board student's thread.
  check("under P → student.board is P's slug (FE pins the header to this)", underP[0]!.board === P.slug);
  check("under Q → student.board is Q's slug", underQ[0]!.board === Q.slug);

  // ── cleanup (FK-safe: student rows FK app_user; then appUser cascades tutor) ──
  await withBoard(P.id, (tx: Tx) => tx.delete(student).where(eq(student.boardId, P.id)));
  await withBoard(Q.id, (tx: Tx) => tx.delete(student).where(eq(student.boardId, Q.id)));
  await db.delete(appUser).where(eq(appUser.email, emailT));
  await db.delete(appUser).where(eq(appUser.email, emailSP));
  await db.delete(appUser).where(eq(appUser.email, emailSQ));
  await db.delete(board).where(eq(board.id, P.id));
  await db.delete(board).where(eq(board.id, Q.id));

  console.log(`\nprobe_tutor_multiboard: ${passed} passed, ${failed} failed`);
  await queryClient.end();
  process.exit(failed === 0 ? 0 : 1);
}

main().catch(async (err) => {
  console.error("probe_tutor_multiboard FAILED:", err);
  await queryClient.end();
  process.exit(1);
});
