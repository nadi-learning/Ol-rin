/**
 * probe_authoring — Slice AUTH exit gate (#1 Question authoring, the b2c content
 * engine + the second AI agent in the loop).
 *
 * Real DB + real RLS + real Gemini, throwaway boards P/Q (M22) with full cleanup.
 * Two-tier (build-discipline: don't over-read a single AI response):
 *   FIRM — the plumbing we control: N questions persisted, subjective kind, valid
 *     axis, non-empty stem+referenceAnswer, pedagogical_note carries the rubric,
 *     consecutive ordinals AFTER the sub_topic's current max, source='b2c_authoring',
 *     `authoring_edit` logged ONLY for the edited draft (none for unedited),
 *     cross-board RLS invisibility, sub_topic-not-found, HTTP no-session→401 (soft).
 *   SOFT — the questions' pedagogical quality (one AI response is not a verdict);
 *     we LOG the drafted axes + rubric scores rather than assert them.
 *
 *   1. DB connectivity.
 *   2. draft: a sub-topic on another board (RLS) → SUB_TOPIC_NOT_FOUND.
 *   3. draft (REAL Gemini): returns `count` questions; each has valid axis,
 *      non-empty stem + referenceAnswer, intent, rubric 0–2, honestLowReason;
 *      nextOrdinal = current max + 1. SOFT: log axes + rubric.
 *   4. save (edit ONE draft, leave the rest): all persisted with kind='subjective',
 *      source='b2c_authoring'; consecutive ordinals after max; pedagogical_note
 *      contains the author intent + rubric line; editedCount===1; exactly one
 *      `authoring_edit` event (before≠after); none for the unedited drafts.
 *   5. RLS: the saved questions are invisible under board Q.
 *   6. HTTP: POST /trpc/tutor.draftQuestions with no session → 401 (soft).
 */
import { and, asc, eq, sql } from "drizzle-orm";
import type { PgTransaction } from "drizzle-orm/pg-core";
import {
  appUser,
  board,
  chapter,
  eventLog,
  learningObjective,
  question,
  subject,
  subTopic,
  topic,
} from "@b2c/kernel/schema";
import { db, queryClient } from "../src/db/client";
import { withBoard } from "../src/db/with-board";
import { env } from "../src/config/env";
import {
  draftQuestions,
  saveQuestions,
  SubTopicNotFoundError,
  type SaveItem,
} from "../src/services/authoring";
import { __aiConfigured } from "../src/services/ai/gemini";

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
function soft(name: string, value: unknown) {
  console.log(`  ~ [soft] ${name}: ${JSON.stringify(value)}`);
}

const rows = <T>(boardId: string, fn: (tx: Tx) => Promise<T>) => withBoard(boardId, fn);

async function main() {
  if (!__aiConfigured()) {
    console.error("GEMINI_API_KEY not set — Slice AUTH probe needs the real vendor.");
    await queryClient.end();
    process.exit(1);
  }

  const tag = `${Date.now()}`;
  await db.execute(sql`select 1`);
  check("DB connectivity (select 1) as app role", true);

  const [P] = await db.insert(board).values({ slug: `auth-p-${tag}`, name: "Probe P" }).returning();
  const [Q] = await db.insert(board).values({ slug: `auth-q-${tag}`, name: "Probe Q" }).returning();
  if (!P || !Q) throw new Error("board seed failed");

  const tutorEmail = `auth-tut-${tag}@example.com`;
  const [tut] = await db.insert(appUser).values({ email: tutorEmail, name: "Tutor" }).returning();
  if (!tut) throw new Error("app_user seed failed");

  // fixture under P: spine + LOs + ONE pre-existing question at ordinal 2 (so the
  // authored set must slot at 3, 4, …). A second sub-topic on board Q for the RLS leg.
  const fx = await withBoard(P.id, async (tx: Tx) => {
    const [subj] = await tx.insert(subject).values({ boardId: P.id, slug: "phys", name: "Physics", grade: "IGCSE" }).returning();
    const [chap] = await tx.insert(chapter).values({ boardId: P.id, subjectId: subj!.id, slug: "motion", name: "Motion", ordinal: 1 }).returning();
    const [tp] = await tx.insert(topic).values({ boardId: P.id, chapterId: chap!.id, slug: "speed", name: "Speed", ordinal: 1 }).returning();
    const [st] = await tx.insert(subTopic).values({ boardId: P.id, topicId: tp!.id, slug: "accel", name: "Acceleration", ordinal: 1 }).returning();
    await tx.insert(learningObjective).values({ boardId: P.id, subTopicId: st!.id, axis: "conceptual", code: "C1", description: "Explains acceleration as the rate of change of velocity, distinguishing it from velocity itself, and reasons about what changes it." });
    await tx.insert(learningObjective).values({ boardId: P.id, subTopicId: st!.id, axis: "procedural", code: "P1", description: "Computes acceleration = Δv / Δt with correct units on a given motion." });
    // a pre-existing question at ordinal 2 → current max ordinal = 2.
    await tx.insert(question).values({
      boardId: P.id, subTopicId: st!.id, axis: "conceptual", kind: "subjective",
      stem: "Pre-existing seed Q", referenceAnswer: "seed", ordinal: 2, source: "seed",
    });
    return { subTopicId: st!.id };
  });

  const fxQ = await withBoard(Q.id, async (tx: Tx) => {
    const [subj] = await tx.insert(subject).values({ boardId: Q.id, slug: "phys", name: "Physics", grade: "IGCSE" }).returning();
    const [chap] = await tx.insert(chapter).values({ boardId: Q.id, subjectId: subj!.id, slug: "motion", name: "Motion", ordinal: 1 }).returning();
    const [tp] = await tx.insert(topic).values({ boardId: Q.id, chapterId: chap!.id, slug: "speed", name: "Speed", ordinal: 1 }).returning();
    const [st] = await tx.insert(subTopic).values({ boardId: Q.id, topicId: tp!.id, slug: "accel", name: "Acceleration", ordinal: 1 }).returning();
    return { subTopicId: st!.id };
  });

  // 2. RLS / not-found — draft board-Q's sub_topic under board P → invisible → NOT_FOUND
  let nf = false;
  try {
    await rows(P.id, (tx) => draftQuestions(tx, { tutorUserId: tut.id, subTopicId: fxQ.subTopicId, count: 2 }));
  } catch (e) {
    nf = e instanceof SubTopicNotFoundError;
  }
  check("draft: cross-board sub_topic → SUB_TOPIC_NOT_FOUND (RLS)", nf);

  // 3. REAL Gemini draft — 4 questions
  const COUNT = 4;
  const dres = await rows(P.id, (tx) =>
    draftQuestions(tx, {
      tutorUserId: tut.id,
      subTopicId: fx.subTopicId,
      count: COUNT,
      axisFocus: "conceptual",
      intent: "Build toward transfer: the closer should make the student restate the principle in their own words.",
    }),
  );
  check(`draft: returned exactly ${COUNT} questions`, dres.drafts.length === COUNT);
  check("draft: every axis valid", dres.drafts.every((d) => ["conceptual", "procedural", "both"].includes(d.axis)));
  check("draft: every stem + referenceAnswer non-empty", dres.drafts.every((d) => d.stem.trim().length > 0 && d.referenceAnswer.trim().length > 0));
  check("draft: every intent + honestLowReason present", dres.drafts.every((d) => d.intent.trim().length > 0 && d.honestLowReason.trim().length > 0));
  check("draft: every rubric axis in 0–2", dres.drafts.every((d) => [d.rubric.ar, d.rubric.ms, d.rubric.mr, d.rubric.ba, d.rubric.gl].every((x) => x >= 0 && x <= 2)));
  check("draft: nextOrdinal = current max (2) + 1 = 3", dres.nextOrdinal === 3);
  soft("draft axes", dres.drafts.map((d) => d.axis));
  soft("draft rubrics", dres.drafts.map((d) => `AR${d.rubric.ar}MS${d.rubric.ms}MR${d.rubric.mr}BA${d.rubric.ba}GL${d.rubric.gl}`));

  // 4. save — edit the FIRST draft (change its stem), leave the rest unedited.
  const items: SaveItem[] = dres.drafts.map((d, i) => ({
    draft: d,
    final:
      i === 0
        ? { axis: d.axis, stem: `${d.stem} (tutor edit)`, referenceAnswer: d.referenceAnswer, explanation: d.explanation, image: d.image }
        : { axis: d.axis, stem: d.stem, referenceAnswer: d.referenceAnswer, explanation: d.explanation, image: d.image },
  }));
  const sres = await rows(P.id, (tx) => saveQuestions(tx, { boardId: P.id, tutorUserId: tut.id, subTopicId: fx.subTopicId, items }));
  check(`save: persisted ${COUNT} ids`, sres.savedIds.length === COUNT && sres.count === COUNT);
  check("save: editedCount = 1 (only the first was edited)", sres.editedCount === 1);

  const saved = await rows(P.id, async (tx) => ({
    qs: await tx.select().from(question).where(and(eq(question.subTopicId, fx.subTopicId), eq(question.source, "b2c_authoring"))).orderBy(asc(question.ordinal)),
    edits: await tx.select().from(eventLog).where(and(eq(eventLog.subTopicId, fx.subTopicId), eq(eventLog.eventType, "authoring_edit"))),
  }));
  check("save: all saved kind='subjective'", saved.qs.length === COUNT && saved.qs.every((q) => q.kind === "subjective"));
  check("save: consecutive ordinals after max → 3,4,5,6", JSON.stringify(saved.qs.map((q) => q.ordinal)) === JSON.stringify([3, 4, 5, 6]));
  check("save: pedagogical_note carries the author rubric line", saved.qs.every((q) => (q.pedagogicalNote ?? "").includes("Author rubric — AR")));
  check("save: exactly ONE authoring_edit event", saved.edits.length === 1);
  check(
    "save: the edit event's before≠after stem (the edited Q)",
    saved.edits.length === 1 &&
      (saved.edits[0]!.before as any)?.stem !== (saved.edits[0]!.after as any)?.stem &&
      String((saved.edits[0]!.after as any)?.stem).includes("(tutor edit)"),
  );

  // 5. RLS — the saved questions invisible under board Q
  const qUnderQ = await rows(Q.id, (tx) => tx.select().from(question).where(eq(question.subTopicId, fx.subTopicId)));
  check("RLS: P's authored questions invisible under board Q", qUnderQ.length === 0);

  // 6. HTTP no-session → 401 (soft)
  try {
    const res = await fetch(`http://localhost:${env.PORT}/trpc/tutor.draftQuestions?batch=1`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-board": P.slug },
      body: JSON.stringify({ 0: { json: { subTopicId: fx.subTopicId, count: 2 } } }),
    });
    check(`HTTP draftQuestions (no session) → 401 (got ${res.status})`, res.status === 401);
  } catch {
    console.log("  ~ HTTP draftQuestions skipped (server not running)");
  }

  // ── cleanup (FK-safe) ──
  await withBoard(P.id, async (tx: Tx) => {
    await tx.delete(eventLog).where(eq(eventLog.boardId, P.id));
    await tx.delete(question).where(eq(question.boardId, P.id));
    await tx.delete(learningObjective).where(eq(learningObjective.boardId, P.id));
    await tx.delete(subTopic).where(eq(subTopic.boardId, P.id));
    await tx.delete(topic).where(eq(topic.boardId, P.id));
    await tx.delete(chapter).where(eq(chapter.boardId, P.id));
    await tx.delete(subject).where(eq(subject.boardId, P.id));
  });
  await withBoard(Q.id, async (tx: Tx) => {
    await tx.delete(subTopic).where(eq(subTopic.boardId, Q.id));
    await tx.delete(topic).where(eq(topic.boardId, Q.id));
    await tx.delete(chapter).where(eq(chapter.boardId, Q.id));
    await tx.delete(subject).where(eq(subject.boardId, Q.id));
  });
  await db.delete(appUser).where(eq(appUser.email, tutorEmail));
  await db.delete(board).where(eq(board.id, P.id));
  await db.delete(board).where(eq(board.id, Q.id));

  console.log(`\nprobe_authoring: ${passed} passed, ${failed} failed`);
  await queryClient.end();
  process.exit(failed === 0 ? 0 : 1);
}

main().catch(async (err) => {
  console.error("probe_authoring FAILED:", err);
  await queryClient.end();
  process.exit(1);
});
