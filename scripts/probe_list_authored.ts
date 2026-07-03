/**
 * probe_list_authored — Slice AUTH-v2.1 item #2 (preview saved questions).
 *
 * Proves tutor.listAuthoredQuestions against the real DB + real RLS, using a
 * THROWAWAY fixture (unique per-run boards P/Q) so canonical seeds stay pristine
 * (M22). Cleans up after itself.
 *
 *   1. DB connectivity as the app role.
 *   2. FILTER (the M11-family leak check): a tutor's student S1 has 2 private
 *      authored questions across 2 sub_topics; the sub_topic also holds a
 *      CANONICAL question (target null) and a question authored to a DIFFERENT
 *      student S2. listAuthoredQuestions(S1) → exactly the 2 S1-private rows —
 *      never the canonical, never S2's.
 *   3. TUTOR surface: the reference answer + pedagogical note ARE returned (the
 *      answer-key gate is for student reads, not the author's own review).
 *   4. GROUPING/order: topic → sub_topic → ordinal; carries topicName/subTopicName;
 *      hasImage true only when an image spec exists.
 *   5. OWNERSHIP: listAuthoredQuestions(unlinked S2) → StudentNotFoundError.
 *   6. RLS cross-board: under board Q the read → StudentNotFoundError (link invisible).
 *   7. HTTP: no session → 401 (soft).
 */
import { eq, sql } from "drizzle-orm";
import type { PgTransaction } from "drizzle-orm/pg-core";
import {
  appUser,
  board,
  chapter,
  membership,
  question,
  subTopic,
  subject,
  topic,
  tutorStudent,
  whitelist,
} from "@b2c/kernel/schema";
import { db, queryClient } from "../src/db/client";
import { withBoard } from "../src/db/with-board";
import { resolveMembership } from "../src/services/membership";
import { listAuthoredQuestions } from "../src/services/authoring";
import { StudentNotFoundError } from "../src/services/tutor";
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

const AUTHORING = "b2c_authoring";

async function main() {
  const tag = `${Date.now()}`;

  // 1. connectivity
  await db.execute(sql`select 1`);
  check("DB connectivity (select 1) as app role", true);

  const [P] = await db.insert(board).values({ slug: `pla-p-${tag}`, name: "Probe P" }).returning();
  const [Q] = await db.insert(board).values({ slug: `pla-q-${tag}`, name: "Probe Q" }).returning();
  if (!P || !Q) throw new Error("board seed failed");

  // Fixture: spine (2 sub_topics A/B under 1 topic).
  const fx = await withBoard(P.id, async (tx: Tx) => {
    const [subj] = await tx.insert(subject).values({ boardId: P.id, slug: "phys", name: "Physics", grade: "IGCSE" }).returning();
    const [chap] = await tx.insert(chapter).values({ boardId: P.id, subjectId: subj!.id, slug: "ch", name: "Ch", ordinal: 1 }).returning();
    const [tp] = await tx.insert(topic).values({ boardId: P.id, chapterId: chap!.id, slug: "tp", name: "Tp", ordinal: 1 }).returning();
    const [stA] = await tx.insert(subTopic).values({ boardId: P.id, topicId: tp!.id, slug: "sta", name: "ST A", ordinal: 1 }).returning();
    const [stB] = await tx.insert(subTopic).values({ boardId: P.id, topicId: tp!.id, slug: "stb", name: "ST B", ordinal: 2 }).returning();
    return { A: stA!.id, B: stB!.id };
  });

  // tutor T + students S1 (linked), S2 (unlinked) via the REAL flow.
  const emailT = `pla-t-${tag}@example.com`;
  const emailS1 = `pla-s1-${tag}@example.com`;
  const emailS2 = `pla-s2-${tag}@example.com`;
  await withBoard(P.id, async (tx: Tx) => {
    await tx.insert(whitelist).values({ boardId: P.id, email: emailT, role: "tutor" });
    await tx.insert(whitelist).values({ boardId: P.id, email: emailS1, role: "student" });
    await tx.insert(whitelist).values({ boardId: P.id, email: emailS2, role: "student" });
  });
  const T = await withBoard(P.id, (tx) => resolveMembership(tx, { email: emailT, name: "Tutor", board: P }));
  const S1 = await withBoard(P.id, (tx) => resolveMembership(tx, { email: emailS1, name: "Stu One", board: P }));
  const S2 = await withBoard(P.id, (tx) => resolveMembership(tx, { email: emailS2, name: "Stu Two", board: P }));
  const userT = T.user.id;
  const userS1 = S1.user.id;
  const userS2 = S2.user.id;

  // link T → S1 only (S2 deliberately UNLINKED)
  await withBoard(P.id, (tx) =>
    tx.insert(tutorStudent).values({ boardId: P.id, tutorId: userT, studentId: userS1 }),
  );

  // Seed questions: S1-private on A (with a figure) + on B; a CANONICAL on A;
  // an S2-private on A. Ordinals prove the topic→sub_topic→ordinal order.
  await withBoard(P.id, async (tx: Tx) => {
    const q = (v: Partial<typeof question.$inferInsert> & { subTopicId: string; ordinal: number }) =>
      tx.insert(question).values({
        boardId: P.id,
        axis: "conceptual",
        kind: "subjective",
        stem: "stem",
        referenceAnswer: "REF_ANSWER",
        explanation: "EXPL_TEXT",
        pedagogicalNote: "PED_NOTE",
        source: AUTHORING,
        ...v,
      });
    // canonical (target null) on A — MUST be excluded
    await q({ subTopicId: fx.A, ordinal: 0, targetStudentId: null, stem: "canonical A" });
    // S1-private on A, ordinal 2, WITH a figure spec
    await q({ subTopicId: fx.A, ordinal: 2, targetStudentId: userS1, stem: "S1 A-fig", image: { description: "a lever", shows: [], hides: [] } });
    // S2-private on A — MUST be excluded from S1's list
    await q({ subTopicId: fx.A, ordinal: 3, targetStudentId: userS2, stem: "S2 A" });
    // S1-private on B, ordinal 1
    await q({ subTopicId: fx.B, ordinal: 1, targetStudentId: userS1, stem: "S1 B" });
  });

  // 2. FILTER — S1's authored list = exactly the 2 S1-private rows
  const list = await withBoard(P.id, (tx) => listAuthoredQuestions(tx, { tutorUserId: userT, studentId: userS1 }));
  check("listAuthoredQuestions(S1) → exactly 2 rows (S1-private only)", list.length === 2);
  check("filter: canonical (target null) excluded", !list.some((r) => r.stem === "canonical A"));
  check("filter: other student's private (S2) excluded", !list.some((r) => r.stem === "S2 A"));

  // 3. TUTOR surface — reference answer + note ARE present (not gated)
  const s1a = list.find((r) => r.stem === "S1 A-fig");
  check("tutor surface: reference answer IS returned", s1a?.referenceAnswer === "REF_ANSWER");
  check("tutor surface: explanation + pedagogical note returned", s1a?.explanation === "EXPL_TEXT" && s1a?.pedagogicalNote === "PED_NOTE");

  // 4. GROUPING/order + names + hasImage
  check("order: topic→sub_topic→ordinal (A before B)", list[0]!.stem === "S1 A-fig" && list[1]!.stem === "S1 B");
  check("carries topicName + subTopicName", s1a?.topicName === "Tp" && s1a?.subTopicName === "ST A");
  check("hasImage true only when an image spec exists", s1a?.hasImage === true && list.find((r) => r.stem === "S1 B")?.hasImage === false);

  // 5. OWNERSHIP — unlinked student S2 → StudentNotFoundError
  const ownerFail = async (fn: () => Promise<unknown>) => {
    try { await fn(); return false; } catch (e) { return e instanceof StudentNotFoundError; }
  };
  check("ownership: listAuthoredQuestions(unlinked S2) → StudentNotFoundError",
    await ownerFail(() => withBoard(P.id, (tx) => listAuthoredQuestions(tx, { tutorUserId: userT, studentId: userS2 }))));

  // 6. RLS cross-board — under Q the link is invisible → StudentNotFoundError
  check("RLS: listAuthoredQuestions under another board → StudentNotFoundError",
    await ownerFail(() => withBoard(Q.id, (tx) => listAuthoredQuestions(tx, { tutorUserId: userT, studentId: userS1 }))));

  // 7. HTTP no-session → 401 (soft)
  try {
    const res = await fetch(`http://localhost:${env.PORT}/trpc/tutor.listAuthoredQuestions?input=${encodeURIComponent(JSON.stringify({ json: { studentId: userS1 } }))}`, { headers: { "x-board": P.slug } });
    check(`HTTP tutor.listAuthoredQuestions (no session) → 401 (got ${res.status})`, res.status === 401);
  } catch {
    console.log("  ~ HTTP tutor.listAuthoredQuestions skipped (server not running)");
  }

  // ── cleanup (FK-safe order) ──
  await withBoard(P.id, async (tx: Tx) => {
    await tx.delete(question).where(eq(question.boardId, P.id));
    await tx.delete(tutorStudent).where(eq(tutorStudent.boardId, P.id));
    await tx.delete(subTopic).where(eq(subTopic.boardId, P.id));
    await tx.delete(topic).where(eq(topic.boardId, P.id));
    await tx.delete(chapter).where(eq(chapter.boardId, P.id));
    await tx.delete(subject).where(eq(subject.boardId, P.id));
    await tx.delete(membership).where(eq(membership.boardId, P.id));
    await tx.delete(whitelist).where(eq(whitelist.boardId, P.id));
  });
  await db.delete(appUser).where(eq(appUser.email, emailT));
  await db.delete(appUser).where(eq(appUser.email, emailS1));
  await db.delete(appUser).where(eq(appUser.email, emailS2));
  await db.delete(board).where(eq(board.id, P.id));
  await db.delete(board).where(eq(board.id, Q.id));

  console.log(`\nprobe_list_authored: ${passed} passed, ${failed} failed`);
  await queryClient.end();
  process.exit(failed === 0 ? 0 : 1);
}

main().catch(async (err) => {
  console.error("probe_list_authored FAILED:", err);
  await queryClient.end();
  process.exit(1);
});
