/**
 * probe_revision_read — S3 exit gate.
 *
 * Proves the bridge read + its gates against the real DB + real RLS, using a
 * THROWAWAY fixture (unique per-run boards P/Q) so the canonical S2 seed stays
 * pristine at v1 for the S4 browser smoke (M22). Cleans up after itself.
 *
 *   1. DB connectivity as the app role.
 *   2. getSlide resolves the current slide (v1) for a sub_topic → correct
 *      versionNo + slideId + a bundleUrl pointing at v1.
 *   3. LIVE REFLECTION: append v2 + advance current_version_id → the SAME call
 *      now returns v2 (new versionNo, new slideId, bundleUrl points at v2).
 *   4. Cross-board RLS: getSlide for board-P's sub_topic under a board-Q claim
 *      → SLIDE_NOT_FOUND (the sub_topic is invisible; content_version is reached
 *      only via the RLS'd content_unit, so there's no board-less path to it).
 *   5. Membership gate, both sides (M11): requireMembership for a non-member →
 *      NoMembershipError; after the real grantRole flow creates one →
 *      requireMembership returns the role.
 *   6. HTTP: GET /trpc/revision.getSlide with no session → 401 (soft — skipped
 *      if the server isn't running).
 */
import { and, eq } from "drizzle-orm";
import { sql } from "drizzle-orm";
import type { PgTransaction } from "drizzle-orm/pg-core";
import {
  board,
  chapter,
  contentUnit,
  contentVersion,
  appUser,
  student,
  subTopic,
  subject,
  topic,
} from "@b2c/kernel/schema";
import { db, queryClient } from "../src/db/client";
import { withBoard } from "../src/db/with-board";
import { getSlide, SlideNotFoundError } from "../src/services/revision";
import {
  NoMembershipError,
  grantRole,
  requireMembership,
} from "../src/services/membership";
import { env } from "../src/config/env";

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

function bodyFor(slideId: string, tag: string) {
  return {
    contractVersion: "1",
    manifest: { slides: { pst: slideId } }, // sub_topic slug 'pst' → slideId
    bundle: `/* ${tag} */`,
  };
}

async function main() {
  const tag = `${Date.now()}`;

  // 1. connectivity
  await db.execute(sql`select 1`);
  check("DB connectivity (select 1) as app role", true);

  // throwaway boards P (the fixture) + Q (the other tenant)
  const [P] = await db.insert(board).values({ slug: `prv-p-${tag}`, name: "Probe P" }).returning();
  const [Q] = await db.insert(board).values({ slug: `prv-q-${tag}`, name: "Probe Q" }).returning();
  if (!P || !Q) throw new Error("board seed failed");

  // ── build the fixture under P: spine + slide_module + v1 ──
  const fixture = await withBoard(P.id, async (tx: Tx) => {
    const [subj] = await tx
      .insert(subject)
      .values({ boardId: P.id, slug: "phys", name: "Physics", grade: "IGCSE" })
      .returning();
    const [chap] = await tx
      .insert(chapter)
      .values({ boardId: P.id, subjectId: subj!.id, slug: "ch", name: "Ch", ordinal: 1 })
      .returning();
    const [tp] = await tx
      .insert(topic)
      .values({ boardId: P.id, chapterId: chap!.id, slug: "tp", name: "Tp", ordinal: 1 })
      .returning();
    const [st] = await tx
      .insert(subTopic)
      .values({ boardId: P.id, topicId: tp!.id, slug: "pst", name: "Pst", ordinal: 1 })
      .returning();
    const [unit] = await tx
      .insert(contentUnit)
      .values({
        boardId: P.id,
        type: "slide_module",
        chapterId: chap!.id,
        subTopicId: null,
        source: "starkhorn",
      })
      .returning();
    const [v1] = await tx
      .insert(contentVersion)
      .values({
        contentUnitId: unit!.id,
        versionNo: 1,
        body: bodyFor("slide-pst-v1", "v1"),
        publishedAt: new Date(),
      })
      .returning();
    await tx
      .update(contentUnit)
      .set({ currentVersionId: v1!.id })
      .where(eq(contentUnit.id, unit!.id));
    return { subTopicId: st!.id, unitId: unit!.id, v1Id: v1!.id };
  });

  // 2. getSlide → v1
  const r1 = await withBoard(P.id, (tx) => getSlide(tx, { subTopicId: fixture.subTopicId }));
  check("getSlide → versionNo 1", r1.versionNo === 1);
  check("getSlide → slideId 'slide-pst-v1'", r1.slideId === "slide-pst-v1");
  check("getSlide → bundleUrl points at v1", r1.bundleUrl === `/content/bundle/${fixture.v1Id}`);

  // 3. LIVE REFLECTION: append v2 + advance the pointer
  const v2Id = await withBoard(P.id, async (tx: Tx) => {
    const [v2] = await tx
      .insert(contentVersion)
      .values({
        contentUnitId: fixture.unitId,
        versionNo: 2,
        body: bodyFor("slide-pst-v2", "v2"),
        publishedAt: new Date(),
      })
      .returning();
    await tx
      .update(contentUnit)
      .set({ currentVersionId: v2!.id })
      .where(eq(contentUnit.id, fixture.unitId));
    return v2!.id;
  });
  const r2 = await withBoard(P.id, (tx) => getSlide(tx, { subTopicId: fixture.subTopicId }));
  check("live reflection: same call → versionNo 2", r2.versionNo === 2);
  check("live reflection: slideId now 'slide-pst-v2'", r2.slideId === "slide-pst-v2");
  check("live reflection: bundleUrl now points at v2", r2.bundleUrl === `/content/bundle/${v2Id}`);

  // 4. cross-board RLS: P's sub_topic invisible under Q's claim → NOT_FOUND
  let crossBoardBlocked = false;
  try {
    await withBoard(Q.id, (tx) => getSlide(tx, { subTopicId: fixture.subTopicId }));
  } catch (e) {
    crossBoardBlocked = e instanceof SlideNotFoundError;
  }
  check("RLS: getSlide across boards → SLIDE_NOT_FOUND", crossBoardBlocked);

  // 5. membership gate, both sides (M11)
  const emailW = `prv-w-${tag}@example.com`;
  const emailX = `prv-x-${tag}@example.com`;
  let noMembership = false;
  try {
    await withBoard(P.id, (tx) => requireMembership(tx, { email: emailX, board: P }));
  } catch (e) {
    noMembership = e instanceof NoMembershipError;
  }
  check("gate: non-member → NoMembershipError", noMembership);

  // grantRole mints only the profile shell (ID-4); requireMembership('student')
  // now needs the operational student row, so insert it (onboarding's output).
  const W = await withBoard(P.id, (tx) =>
    grantRole(tx, { email: emailW, name: "Probe W", board: P, role: "student" }),
  );
  await withBoard(P.id, (tx: Tx) =>
    tx.insert(student).values({ userId: W.user.id, boardId: P.id, class: "9" }),
  );
  const gateRole = await withBoard(P.id, (tx) =>
    requireMembership(tx, { email: emailW, board: P }),
  );
  check("gate: member (created by real flow) → role 'student'", gateRole.role === "student");

  // 6. HTTP no-session → 401 (soft)
  try {
    const input = encodeURIComponent(JSON.stringify({ subTopicId: fixture.subTopicId }));
    const res = await fetch(
      `http://localhost:${env.PORT}/trpc/revision.getSlide?input=${input}`,
      { headers: { "x-board": P.slug } },
    );
    check(`HTTP getSlide (no session) → 401 (got ${res.status})`, res.status === 401);
  } catch {
    console.log("  ~ HTTP getSlide skipped (server not running)");
  }

  // ── cleanup (FK-safe order); RLS rows withBoard, globals direct ──
  await db.delete(contentVersion).where(eq(contentVersion.contentUnitId, fixture.unitId));
  await withBoard(P.id, async (tx: Tx) => {
    await tx.delete(contentUnit).where(eq(contentUnit.boardId, P.id));
    await tx.delete(subTopic).where(eq(subTopic.boardId, P.id));
    await tx.delete(topic).where(eq(topic.boardId, P.id));
    await tx.delete(chapter).where(eq(chapter.boardId, P.id));
    await tx.delete(subject).where(eq(subject.boardId, P.id));
    await tx.delete(student).where(eq(student.boardId, P.id));
  });
  await db.delete(appUser).where(eq(appUser.email, emailW));
  await db.delete(board).where(eq(board.id, P.id));
  await db.delete(board).where(eq(board.id, Q.id));

  console.log(`\nprobe_revision_read: ${passed} passed, ${failed} failed`);
  await queryClient.end();
  process.exit(failed === 0 ? 0 : 1);
}

main().catch(async (err) => {
  console.error("probe_revision_read FAILED:", err);
  await queryClient.end();
  process.exit(1);
});
