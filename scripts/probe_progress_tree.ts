/**
 * probe_progress_tree — Slice QA3-c exit gate (progress-first two-axis tree).
 *
 * Proves tutor.getProgressTree against the real DB + real RLS with a THROWAWAY
 * fixture (unique per-run boards P/Q; cleans up, M22). The load-bearing logic is
 * the WEAKEST-LINK + spread rollup (D-QA3-2) with UNTAUGHT sub_topics counting
 * as level 0 (D-QA3-c-1), so the fixture is built to pin that math exactly.
 *
 * Fixture spine under P (1 chapter, 2 topics):
 *   Topic 1 (Motion):   ST A conceptual 4 / procedural 3
 *                       ST B conceptual 2 / procedural 5
 *                       ST C UNTAUGHT (no mastery_state)         → counts as 0/0
 *   Topic 2 (Forces):   ST D conceptual 3 / procedural 3
 *                       ST E conceptual 5 / procedural 4
 *
 * Expected rollups (min = weakest-link; spread[i] = #leaves at level i):
 *   Topic 1 conceptual: min 0 (C drags), spread [1,0,1,0,1,0]   (0:C 2:B 4:A)
 *   Topic 1 procedural: min 0,           spread [1,0,0,1,0,1]   (0:C 3:A 5:B)
 *   Topic 2 conceptual: min 3,           spread [0,0,0,1,0,1]   (3:D 5:E)
 *   Topic 2 procedural: min 3,           spread [0,0,0,2,0,0]   (3:D 3?..) → D3,E4 = [0,0,0,1,1,0]
 *   Chapter  conceptual: min 0,          spread [1,0,1,1,1,1]   (0:C 2:B 3:D 4:A 5:E)
 *   Chapter  procedural: min 0,          spread [1,0,0,2,1,1]   (0:C 3:A,D 4:E 5:B)
 *
 * Checks: tree shape + ordinal order · untaught leaf (0/0, hasMastery false,
 * null description) · taught leaf raw levels + description · topic + chapter
 * weakest-link + exact spread · spread sums to descendant count · cold-start
 * student (no mastery → full spine, all 0) · ownership (unlinked → NOT_FOUND) ·
 * RLS cross-board · HTTP no-session → 401 (soft).
 */
import { eq, sql } from "drizzle-orm";
import type { PgTransaction } from "drizzle-orm/pg-core";
import {
  appUser,
  board,
  chapter,
  masteryState,
  membership,
  subTopic,
  subject,
  topic,
  tutorStudent,
} from "@b2c/kernel/schema";
import { db, queryClient } from "../src/db/client";
import { withBoard } from "../src/db/with-board";
import { grantRole } from "../src/services/membership";
import {
  getProgressTree,
  StudentNotFoundError,
} from "../src/services/tutor";
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
const eqArr = (a: readonly number[], b: readonly number[]) =>
  a.length === b.length && a.every((v, i) => v === b[i]);

async function main() {
  const tag = `${Date.now()}`;

  await db.execute(sql`select 1`);
  check("DB connectivity (select 1) as app role", true);

  const [P] = await db.insert(board).values({ slug: `ppt-p-${tag}`, name: "Probe P" }).returning();
  const [Q] = await db.insert(board).values({ slug: `ppt-q-${tag}`, name: "Probe Q" }).returning();
  if (!P || !Q) throw new Error("board seed failed");

  // Spine: 1 chapter → 2 topics → 5 sub_topics (A,B,C | D,E).
  const fx = await withBoard(P.id, async (tx: Tx) => {
    const [subj] = await tx.insert(subject).values({ boardId: P.id, slug: "phys", name: "Physics", grade: "IGCSE" }).returning();
    const [chap] = await tx.insert(chapter).values({ boardId: P.id, subjectId: subj!.id, slug: "ch", name: "Ch", ordinal: 1 }).returning();
    const [t1] = await tx.insert(topic).values({ boardId: P.id, chapterId: chap!.id, slug: "t1", name: "Motion", ordinal: 1 }).returning();
    const [t2] = await tx.insert(topic).values({ boardId: P.id, chapterId: chap!.id, slug: "t2", name: "Forces", ordinal: 2 }).returning();
    const [stA] = await tx.insert(subTopic).values({ boardId: P.id, topicId: t1!.id, slug: "sta", name: "ST A", ordinal: 1 }).returning();
    const [stB] = await tx.insert(subTopic).values({ boardId: P.id, topicId: t1!.id, slug: "stb", name: "ST B", ordinal: 2 }).returning();
    const [stC] = await tx.insert(subTopic).values({ boardId: P.id, topicId: t1!.id, slug: "stc", name: "ST C", ordinal: 3 }).returning();
    const [stD] = await tx.insert(subTopic).values({ boardId: P.id, topicId: t2!.id, slug: "std", name: "ST D", ordinal: 1 }).returning();
    const [stE] = await tx.insert(subTopic).values({ boardId: P.id, topicId: t2!.id, slug: "ste", name: "ST E", ordinal: 2 }).returning();
    return { chapId: chap!.id, t1: t1!.id, t2: t2!.id, A: stA!.id, B: stB!.id, C: stC!.id, D: stD!.id, E: stE!.id };
  });

  // tutor T + student S1 (linked) + student S2 (UNLINKED) + student SC (linked, cold)
  const emailT = `ppt-t-${tag}@example.com`;
  const emailS1 = `ppt-s1-${tag}@example.com`;
  const emailS2 = `ppt-s2-${tag}@example.com`;
  const emailSC = `ppt-sc-${tag}@example.com`;
  const T = await withBoard(P.id, (tx) => grantRole(tx, { email: emailT, name: "Tutor", board: P, role: "tutor" }));
  const S1 = await withBoard(P.id, (tx) => grantRole(tx, { email: emailS1, name: "Stu One", board: P, role: "student" }));
  const S2 = await withBoard(P.id, (tx) => grantRole(tx, { email: emailS2, name: "Stu Two", board: P, role: "student" }));
  const SC = await withBoard(P.id, (tx) => grantRole(tx, { email: emailSC, name: "Stu Cold", board: P, role: "student" }));
  const userT = T.user.id, userS1 = S1.user.id, userS2 = S2.user.id, userSC = SC.user.id;

  // link T → S1 and T → SC (S2 deliberately UNLINKED)
  await withBoard(P.id, async (tx: Tx) => {
    await tx.insert(tutorStudent).values({ boardId: P.id, tutorId: userT, studentId: userS1 });
    await tx.insert(tutorStudent).values({ boardId: P.id, tutorId: userT, studentId: userSC });
  });

  // Mastery for S1: A,B (topic1) + D,E (topic2); C left UNTAUGHT.
  await withBoard(P.id, async (tx: Tx) => {
    const m = (subTopicId: string, c: number, p: number) =>
      tx.insert(masteryState).values({
        boardId: P.id, studentId: userS1, subTopicId,
        conceptualLevel: c, proceduralLevel: p,
        description: `where S1 is on ${subTopicId.slice(0, 4)}`, log: "internal-only",
      });
    await m(fx.A, 4, 3);
    await m(fx.B, 2, 5);
    await m(fx.D, 3, 3);
    await m(fx.E, 5, 4);
  });

  // ── the tree ──
  const tree = await withBoard(P.id, (tx) => getProgressTree(tx, { tutorUserId: userT, studentId: userS1 }));
  check("tree → 1 chapter", tree.length === 1);
  const ch = tree[0]!;
  check("chapter → 2 topics, ordinal-ordered (Motion, Forces)",
    ch.topics.length === 2 && ch.topics[0]!.name === "Motion" && ch.topics[1]!.name === "Forces");
  const [T1, T2] = ch.topics as [typeof ch.topics[number], typeof ch.topics[number]];
  check("topic1 → 3 sub_topics ordinal-ordered (A,B,C)",
    T1.subTopics.length === 3 && T1.subTopics.map((s) => s.name).join(",") === "ST A,ST B,ST C");
  check("topic2 → 2 sub_topics ordinal-ordered (D,E)",
    T2.subTopics.length === 2 && T2.subTopics.map((s) => s.name).join(",") === "ST D,ST E");

  // untaught leaf C
  const C = T1.subTopics[2]!;
  check("untaught leaf C → hasMastery false, levels 0/0, description null",
    C.hasMastery === false && C.conceptualLevel === 0 && C.proceduralLevel === 0 && C.description === null);
  // taught leaf A
  const A = T1.subTopics[0]!;
  check("taught leaf A → hasMastery true, raw levels 4/3, description present",
    A.hasMastery === true && A.conceptualLevel === 4 && A.proceduralLevel === 3 && (A.description ?? "").length > 0);
  check("taught leaf B → raw levels 2/5", T1.subTopics[1]!.conceptualLevel === 2 && T1.subTopics[1]!.proceduralLevel === 5);

  // topic-1 rollup: untaught C drags min to 0
  check("topic1 conceptual → weakest-link 0 (untaught C drags)", T1.conceptual.level === 0);
  check("topic1 conceptual spread [1,0,1,0,1,0]", eqArr(T1.conceptual.spread, [1, 0, 1, 0, 1, 0]));
  check("topic1 procedural → weakest-link 0", T1.procedural.level === 0);
  check("topic1 procedural spread [1,0,0,1,0,1]", eqArr(T1.procedural.spread, [1, 0, 0, 1, 0, 1]));

  // topic-2 rollup: all taught, min = 3
  check("topic2 conceptual → weakest-link 3", T2.conceptual.level === 3);
  check("topic2 conceptual spread [0,0,0,1,0,1]", eqArr(T2.conceptual.spread, [0, 0, 0, 1, 0, 1]));
  check("topic2 procedural → weakest-link 3", T2.procedural.level === 3);
  check("topic2 procedural spread [0,0,0,1,1,0] (D3,E4)", eqArr(T2.procedural.spread, [0, 0, 0, 1, 1, 0]));

  // chapter rollup: over ALL 5 leaves
  check("chapter conceptual → weakest-link 0", ch.conceptual.level === 0);
  check("chapter conceptual spread [1,0,1,1,1,1]", eqArr(ch.conceptual.spread, [1, 0, 1, 1, 1, 1]));
  check("chapter procedural → weakest-link 0", ch.procedural.level === 0);
  check("chapter procedural spread [1,0,0,2,1,1] (0:C 3:A,D 4:E 5:B)", eqArr(ch.procedural.spread, [1, 0, 0, 2, 1, 1]));
  const sum = (a: readonly number[]) => a.reduce((x, y) => x + y, 0);
  check("chapter spread sums to 5 descendants (both axes)",
    sum(ch.conceptual.spread) === 5 && sum(ch.procedural.spread) === 5);

  // cold-start student SC: linked, zero mastery → full spine, all untaught 0
  const cold = await withBoard(P.id, (tx) => getProgressTree(tx, { tutorUserId: userT, studentId: userSC }));
  const coldLeaves = cold.flatMap((c) => c.topics.flatMap((t) => t.subTopics));
  check("cold-start → full spine present (5 leaves)", coldLeaves.length === 5);
  check("cold-start → every leaf untaught (hasMastery false, 0/0)",
    coldLeaves.every((s) => s.hasMastery === false && s.conceptualLevel === 0 && s.proceduralLevel === 0));
  check("cold-start → every rollup level 0",
    cold.every((c) => c.conceptual.level === 0 && c.procedural.level === 0 &&
      c.topics.every((t) => t.conceptual.level === 0 && t.procedural.level === 0)));

  // never leaks the internal log field
  check("payload has NO internal log field (only user-visible description)",
    !/"log"/.test(JSON.stringify(tree)));

  // ownership: unlinked S2 → StudentNotFoundError
  const ownerFail = async (fn: () => Promise<unknown>) => {
    try { await fn(); return false; } catch (e) { return e instanceof StudentNotFoundError; }
  };
  check("ownership: getProgressTree(unlinked S2) → StudentNotFoundError",
    await ownerFail(() => withBoard(P.id, (tx) => getProgressTree(tx, { tutorUserId: userT, studentId: userS2 }))));

  // RLS cross-board: under Q the link is invisible → NOT_FOUND
  check("RLS: getProgressTree under another board → StudentNotFoundError",
    await ownerFail(() => withBoard(Q.id, (tx) => getProgressTree(tx, { tutorUserId: userT, studentId: userS1 }))));

  // HTTP no-session → 401 (soft)
  try {
    const res = await fetch(`http://localhost:${env.PORT}/trpc/tutor.getProgressTree?input=${encodeURIComponent(JSON.stringify({ json: { studentId: userS1 } }))}`, { headers: { "x-board": P.slug } });
    check(`HTTP tutor.getProgressTree (no session) → 401 (got ${res.status})`, res.status === 401);
  } catch {
    console.log("  ~ HTTP tutor.getProgressTree skipped (server not running)");
  }

  // ── cleanup (FK-safe order) ──
  await withBoard(P.id, async (tx: Tx) => {
    await tx.delete(masteryState).where(eq(masteryState.boardId, P.id));
    await tx.delete(tutorStudent).where(eq(tutorStudent.boardId, P.id));
    await tx.delete(subTopic).where(eq(subTopic.boardId, P.id));
    await tx.delete(topic).where(eq(topic.boardId, P.id));
    await tx.delete(chapter).where(eq(chapter.boardId, P.id));
    await tx.delete(subject).where(eq(subject.boardId, P.id));
    await tx.delete(membership).where(eq(membership.boardId, P.id));
  });
  for (const email of [emailT, emailS1, emailS2, emailSC]) {
    await db.delete(appUser).where(eq(appUser.email, email));
  }
  await db.delete(board).where(eq(board.id, P.id));
  await db.delete(board).where(eq(board.id, Q.id));

  console.log(`\nprobe_progress_tree: ${passed} passed, ${failed} failed`);
  await queryClient.end();
  process.exit(failed === 0 ? 0 : 1);
}

main().catch(async (err) => {
  console.error("probe_progress_tree FAILED:", err);
  await queryClient.end();
  process.exit(1);
});
