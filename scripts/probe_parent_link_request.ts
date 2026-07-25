/**
 * probe_parent_link_request — Slice S164 exit gate (the parent self-serve "admin leg").
 *
 * The flow: a board-LESS parent files a request against their child's email/phone →
 * it lands `pending` → an admin sees it on THEIR board with the matching students as
 * candidates → links (flips student.parent_id) or rejects. Real DB + real RLS on
 * THROWAWAY boards (M22); cleans up after itself.
 *
 *  1. DB connectivity.
 *  2. submit → pending request created + the parent PROFILE SHELL is minted.
 *  3. idempotent: re-submitting the same identifier returns the same row (no dup).
 *  4. submit a second identifier (a cross-board child) → a second pending request.
 *  5. myRequests → the parent sees their own requests, all pending.
 *  6. admin listPending on board P: the P-child request carries P's student as a
 *     candidate; the cross-board child's request shows ZERO candidates under P
 *     (RLS wall — candidate resolution is board-scoped).
 *  7. that same cross-board request DOES resolve a candidate under board Q.
 *  8. phone match: a request by phone resolves the student by phone under P.
 *  9. link: resolve→link flips student.parent_id to the parent + activates the
 *     parent detail row + marks the request `linked`.
 * 10. a linked request drops out of the pending list.
 * 11. re-resolving a terminal request → REQUEST_NOT_PENDING.
 * 12. resolving an unknown id → REQUEST_NOT_FOUND.
 * 13. link with no studentUserId → MISSING_STUDENT.
 * 14. cross-board link (student not on this board) → InvalidLinkError, request stays pending.
 * 15. reject → request `rejected`, audit stamped.
 */
import { and, eq, sql } from "drizzle-orm";
import type { PgTransaction } from "drizzle-orm/pg-core";
import {
  appUser,
  board,
  parent,
  parentLinkRequest,
  student,
} from "@b2c/kernel/schema";
import { db, queryClient } from "../src/db/client";
import { withBoard } from "../src/db/with-board";
import {
  InvalidLinkError,
  listMyParentLinkRequests,
  listPendingParentLinkRequests,
  MissingStudentError,
  RequestNotFoundError,
  RequestNotPendingError,
  resolveParentLinkRequest,
  submitParentLinkRequest,
} from "../src/services/parent_link";

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
const rows = <T>(boardId: string, fn: (tx: Tx) => Promise<T>) => withBoard(boardId, fn);

async function main() {
  const tag = `${Date.now()}`;

  // 1. connectivity
  await db.execute(sql`select 1`);
  check("1. DB connectivity (select 1) as app role", true);

  const [P] = await db.insert(board).values({ slug: `plr-p-${tag}`, name: "Probe P" }).returning();
  const [Q] = await db.insert(board).values({ slug: `plr-q-${tag}`, name: "Probe Q" }).returning();
  if (!P || !Q) throw new Error("board seed failed");

  // Global identities. Two students carry an email AND a phone; one on each board.
  const spEmail = `plr-sp-${tag}@example.com`;
  const spPhone = `+91-99${tag.slice(-8)}`;
  const sqEmail = `plr-sq-${tag}@example.com`;
  const sqPhone = `+91-88${tag.slice(-8)}`;
  const parentEmail = `plr-par-${tag}@example.com`;
  const adminEmail = `plr-adm-${tag}@example.com`;

  const [sp] = await db.insert(appUser).values({ email: spEmail, phone: spPhone, name: "Child P", userType: "student" }).returning();
  const [sq] = await db.insert(appUser).values({ email: sqEmail, phone: sqPhone, name: "Child Q", userType: "student" }).returning();
  const [adm] = await db.insert(appUser).values({ email: adminEmail, name: "Admin", userType: "admin" }).returning();
  if (!sp || !sq || !adm) throw new Error("app_user seed failed");
  await rows(P.id, (tx) => tx.insert(student).values({ userId: sp.id, boardId: P.id, class: "9" }));
  await rows(Q.id, (tx) => tx.insert(student).values({ userId: sq.id, boardId: Q.id, class: "10" }));

  // 2. submit → pending request + parent shell minted.
  const reqA = await submitParentLinkRequest({ email: parentEmail, name: "Parent", identifier: spEmail });
  const [parShell] = await db
    .select({ id: appUser.id })
    .from(appUser)
    .where(and(eq(appUser.email, parentEmail), eq(appUser.userType, "parent")))
    .limit(1);
  check("2a. request created as pending", reqA.status === "pending" && reqA.enteredIdentifier === spEmail);
  check("2b. parent PROFILE SHELL minted (user_type=parent)", !!parShell);
  const parentId = parShell!.id;

  // 3. idempotent re-submit of the SAME identifier → same row, no duplicate.
  const reqAgain = await submitParentLinkRequest({ email: parentEmail, name: "Parent", identifier: spEmail });
  const dupCount = await db
    .select({ n: sql<string>`count(*)` })
    .from(parentLinkRequest)
    .where(and(eq(parentLinkRequest.parentUserId, parentId), eq(parentLinkRequest.enteredIdentifier, spEmail)));
  check("3. idempotent: same identifier returns same row (no dup)", reqAgain.id === reqA.id && Number(dupCount[0]!.n) === 1);

  // 4. a second request, against the CROSS-BOARD child (on Q).
  const reqCross = await submitParentLinkRequest({ email: parentEmail, name: "Parent", identifier: sqEmail });
  check("4. second pending request (cross-board child)", reqCross.status === "pending" && reqCross.id !== reqA.id);

  // 5. the parent sees their own requests.
  const mine = await listMyParentLinkRequests(parentEmail);
  check("5. myRequests lists both, all pending", mine.length === 2 && mine.every((r) => r.status === "pending"));

  // 6. admin listPending on board P.
  const pendP = await rows(P.id, (tx) => listPendingParentLinkRequests(tx));
  const pA = pendP.find((r) => r.id === reqA.id);
  const pCrossUnderP = pendP.find((r) => r.id === reqCross.id);
  check("6a. P-child request present with the P student as candidate", !!pA && pA.candidates.some((c) => c.studentUserId === sp.id));
  check("6b. candidate is unlinked (not to this parent, not to another)", !!pA && pA.candidates.every((c) => !c.alreadyLinkedToThisParent && !c.alreadyLinkedToAnother));
  check("6c. RLS wall: cross-board child request shows ZERO candidates under P", !!pCrossUnderP && pCrossUnderP.candidates.length === 0);

  // 7. the SAME cross-board request resolves a candidate under board Q.
  const pendQ = await rows(Q.id, (tx) => listPendingParentLinkRequests(tx));
  const cUnderQ = pendQ.find((r) => r.id === reqCross.id);
  check("7. cross-board request resolves the Q student under board Q", !!cUnderQ && cUnderQ.candidates.some((c) => c.studentUserId === sq.id));

  // 8. phone match — a request by PHONE resolves the student by phone under P.
  const reqPhone = await submitParentLinkRequest({ email: parentEmail, name: "Parent", identifier: spPhone });
  const pendP2 = await rows(P.id, (tx) => listPendingParentLinkRequests(tx));
  const pPhone = pendP2.find((r) => r.id === reqPhone.id);
  check("8. request by phone resolves the student by phone", !!pPhone && pPhone.candidates.some((c) => c.studentUserId === sp.id));

  // 9. link — resolve reqA to the P student.
  const linked = await rows(P.id, (tx) =>
    resolveParentLinkRequest(tx, { requestId: reqA.id, action: "link", studentUserId: sp.id, board: P, actorUserId: adm.id }),
  );
  const [stuRow] = await rows(P.id, (tx) => tx.select({ parentId: student.parentId }).from(student).where(eq(student.userId, sp.id)));
  const [parDetail] = await db.select({ status: parent.status }).from(parent).where(eq(parent.userId, parentId));
  const [reqARow] = await db.select().from(parentLinkRequest).where(eq(parentLinkRequest.id, reqA.id));
  check("9a. resolve returns linked", linked.status === "linked");
  check("9b. student.parent_id flipped to the parent", stuRow!.parentId === parentId);
  check("9c. parent detail row active", parDetail?.status === "active");
  check("9d. request marked linked + audit stamped", reqARow!.status === "linked" && reqARow!.resolvedStudentId === sp.id && reqARow!.resolvedBy === adm.id && reqARow!.resolvedAt instanceof Date);

  // 10. a linked request drops out of the pending list.
  const pendP3 = await rows(P.id, (tx) => listPendingParentLinkRequests(tx));
  check("10. linked request no longer pending", !pendP3.some((r) => r.id === reqA.id));

  // 11. re-resolving a terminal request → REQUEST_NOT_PENDING.
  let notPending = false;
  try {
    await rows(P.id, (tx) => resolveParentLinkRequest(tx, { requestId: reqA.id, action: "reject", board: P, actorUserId: adm.id }));
  } catch (e) {
    notPending = e instanceof RequestNotPendingError;
  }
  check("11. terminal request → REQUEST_NOT_PENDING", notPending);

  // 12. unknown id → REQUEST_NOT_FOUND.
  let notFound = false;
  try {
    await rows(P.id, (tx) => resolveParentLinkRequest(tx, { requestId: "00000000-0000-0000-0000-000000000000", action: "reject", board: P, actorUserId: adm.id }));
  } catch (e) {
    notFound = e instanceof RequestNotFoundError;
  }
  check("12. unknown request id → REQUEST_NOT_FOUND", notFound);

  // 13. link with no student → MISSING_STUDENT (reqCross stays pending).
  let missing = false;
  try {
    await rows(Q.id, (tx) => resolveParentLinkRequest(tx, { requestId: reqCross.id, action: "link", board: Q, actorUserId: adm.id }));
  } catch (e) {
    missing = e instanceof MissingStudentError;
  }
  check("13. link with no studentUserId → MISSING_STUDENT", missing);

  // 14. cross-board link — link reqCross to the Q student, but under board P → InvalidLinkError.
  let crossBoard = false;
  try {
    await rows(P.id, (tx) => resolveParentLinkRequest(tx, { requestId: reqCross.id, action: "link", studentUserId: sq.id, board: P, actorUserId: adm.id }));
  } catch (e) {
    crossBoard = e instanceof InvalidLinkError;
  }
  const [crossStill] = await db.select().from(parentLinkRequest).where(eq(parentLinkRequest.id, reqCross.id));
  check("14a. student not on this board → InvalidLinkError", crossBoard);
  check("14b. failed link leaves the request pending", crossStill!.status === "pending");

  // 15. reject reqCross under Q → rejected + stamped.
  const rejected = await rows(Q.id, (tx) => resolveParentLinkRequest(tx, { requestId: reqCross.id, action: "reject", board: Q, actorUserId: adm.id }));
  const [rejRow] = await db.select().from(parentLinkRequest).where(eq(parentLinkRequest.id, reqCross.id));
  check("15. reject → status rejected, resolvedBy stamped", rejected.status === "rejected" && rejRow!.status === "rejected" && rejRow!.resolvedBy === adm.id);

  // ── cleanup (FK-safe: requests → students → app_users → boards) ──
  await db.delete(parentLinkRequest).where(eq(parentLinkRequest.parentUserId, parentId));
  await rows(P.id, (tx) => tx.delete(student).where(eq(student.boardId, P.id)));
  await rows(Q.id, (tx) => tx.delete(student).where(eq(student.boardId, Q.id)));
  for (const email of [spEmail, sqEmail, adminEmail, parentEmail]) {
    await db.delete(appUser).where(eq(appUser.email, email)); // parent detail cascades
  }
  await db.delete(board).where(eq(board.id, P.id));
  await db.delete(board).where(eq(board.id, Q.id));

  console.log(`\nprobe_parent_link_request: ${passed} passed, ${failed} failed`);
  await queryClient.end();
  process.exit(failed === 0 ? 0 : 1);
}

main().catch(async (err) => {
  console.error("probe_parent_link_request FAILED:", err);
  await queryClient.end();
  process.exit(1);
});
