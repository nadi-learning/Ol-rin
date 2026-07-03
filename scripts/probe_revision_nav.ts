/**
 * probe_revision_nav — Feature B exit gate (prod-style slide nav source).
 *
 * Proves revision.getChapterNav builds the chapter→section→slide tree in correct
 * ordinal order (not insertion order) against the real DB + real RLS, using a
 * THROWAWAY fixture (boards P/Q) it cleans up (M22). Rows are seeded in DELIBERATE
 * non-ordinal order so the test fails if grouping/ordering regresses.
 *
 *   Fixture under P (one chapter):
 *     topic "Beta"  ordinal 1  → subTopic b1 (ord 1)
 *     topic "Alpha" ordinal 2  → subTopics a2 (ord 1), a1 (ord 2)
 *   Inserted: Alpha before Beta; a1 before a2 → expected tree order Beta→Alpha,
 *   Alpha.subTopics = [a2, a1]; expected FLAT order = [b1, a2, a1].
 *
 *   1. connectivity
 *   2. one chapter, two topics, ordinal-ordered (Beta then Alpha)
 *   3. sub_topics grouped + ordinal-ordered within a topic
 *   4. derived FLAT order matches tree order
 *   5. RLS: getChapterNav under board Q → empty
 *   6. membership gate, both sides (M11)
 *   7. HTTP no-session → 401 (soft)
 */
import { eq, sql } from "drizzle-orm";
import type { PgTransaction } from "drizzle-orm/pg-core";
import {
  board,
  chapter,
  appUser,
  membership,
  subTopic,
  subject,
  topic,
  whitelist,
} from "@b2c/kernel/schema";
import { db, queryClient } from "../src/db/client";
import { withBoard } from "../src/db/with-board";
import { getChapterNav } from "../src/services/revision";
import {
  NoMembershipError,
  requireMembership,
  resolveMembership,
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

function flatten(nav: Awaited<ReturnType<typeof getChapterNav>>): string[] {
  const out: string[] = [];
  for (const ch of nav) for (const tp of ch.topics) for (const st of tp.subTopics) out.push(st.name);
  return out;
}

async function main() {
  const tag = `${Date.now()}`;
  await db.execute(sql`select 1`);
  check("DB connectivity (select 1) as app role", true);

  const [P] = await db.insert(board).values({ slug: `prn-p-${tag}`, name: "Probe P" }).returning();
  const [Q] = await db.insert(board).values({ slug: `prn-q-${tag}`, name: "Probe Q" }).returning();
  if (!P || !Q) throw new Error("board seed failed");

  // build the fixture in deliberate non-ordinal insertion order
  await withBoard(P.id, async (tx: Tx) => {
    const [subj] = await tx
      .insert(subject)
      .values({ boardId: P.id, slug: "phys", name: "Physics", grade: "IGCSE" })
      .returning();
    const [chap] = await tx
      .insert(chapter)
      .values({ boardId: P.id, subjectId: subj!.id, slug: "ch", name: "Chapter One", ordinal: 1 })
      .returning();
    // Alpha (ordinal 2) inserted BEFORE Beta (ordinal 1)
    const [alpha] = await tx
      .insert(topic)
      .values({ boardId: P.id, chapterId: chap!.id, slug: "alpha", name: "Alpha", ordinal: 2 })
      .returning();
    const [beta] = await tx
      .insert(topic)
      .values({ boardId: P.id, chapterId: chap!.id, slug: "beta", name: "Beta", ordinal: 1 })
      .returning();
    // a1 (ord 2) inserted BEFORE a2 (ord 1)
    await tx.insert(subTopic).values({ boardId: P.id, topicId: alpha!.id, slug: "a1", name: "a1", ordinal: 2 });
    await tx.insert(subTopic).values({ boardId: P.id, topicId: alpha!.id, slug: "a2", name: "a2", ordinal: 1 });
    await tx.insert(subTopic).values({ boardId: P.id, topicId: beta!.id, slug: "b1", name: "b1", ordinal: 1 });
  });

  // 2 + 3. tree structure + ordering
  const nav = await withBoard(P.id, (tx) => getChapterNav(tx));
  check("one chapter", nav.length === 1);
  check("two topics", nav[0]?.topics.length === 2);
  check("topics ordinal-ordered (Beta before Alpha)", nav[0]?.topics[0]?.name === "Beta" && nav[0]?.topics[1]?.name === "Alpha");
  check("Beta has 1 sub_topic (b1)", nav[0]?.topics[0]?.subTopics.map((s) => s.name).join() === "b1");
  check("Alpha sub_topics ordinal-ordered (a2 before a1)", nav[0]?.topics[1]?.subTopics.map((s) => s.name).join() === "a2,a1");

  // 4. derived flat order
  check("flat order = [b1, a2, a1]", flatten(nav).join() === "b1,a2,a1");

  // 5. RLS cross-board → empty
  const navQ = await withBoard(Q.id, (tx) => getChapterNav(tx));
  check("RLS: getChapterNav under another board → empty", navQ.length === 0);

  // 6. membership gate, both sides (M11)
  const emailW = `prn-w-${tag}@example.com`;
  const emailX = `prn-x-${tag}@example.com`;
  let noMembership = false;
  try {
    await withBoard(P.id, (tx) => requireMembership(tx, { email: emailX, board: P }));
  } catch (e) {
    noMembership = e instanceof NoMembershipError;
  }
  check("gate: non-member → NoMembershipError", noMembership);

  await withBoard(P.id, (tx) => tx.insert(whitelist).values({ boardId: P.id, email: emailW, role: "student" }));
  await withBoard(P.id, (tx) => resolveMembership(tx, { email: emailW, name: "Probe W", board: P }));
  const gateRole = await withBoard(P.id, (tx) => requireMembership(tx, { email: emailW, board: P }));
  check("gate: member (created by real flow) → role 'student'", gateRole.role === "student");

  // 7. HTTP no-session → 401 (soft)
  try {
    const res = await fetch(`http://localhost:${env.PORT}/trpc/revision.getChapterNav`, {
      headers: { "x-board": P.slug },
    });
    check(`HTTP getChapterNav (no session) → 401 (got ${res.status})`, res.status === 401);
  } catch {
    console.log("  ~ HTTP getChapterNav skipped (server not running)");
  }

  // cleanup
  await withBoard(P.id, async (tx: Tx) => {
    await tx.delete(subTopic).where(eq(subTopic.boardId, P.id));
    await tx.delete(topic).where(eq(topic.boardId, P.id));
    await tx.delete(chapter).where(eq(chapter.boardId, P.id));
    await tx.delete(subject).where(eq(subject.boardId, P.id));
    await tx.delete(membership).where(eq(membership.boardId, P.id));
    await tx.delete(whitelist).where(eq(whitelist.boardId, P.id));
  });
  await db.delete(appUser).where(eq(appUser.email, emailW));
  await db.delete(board).where(eq(board.id, P.id));
  await db.delete(board).where(eq(board.id, Q.id));

  console.log(`\nprobe_revision_nav: ${passed} passed, ${failed} failed`);
  await queryClient.end();
  process.exit(failed === 0 ? 0 : 1);
}

main().catch(async (err) => {
  console.error("probe_revision_nav FAILED:", err);
  await queryClient.end();
  process.exit(1);
});
