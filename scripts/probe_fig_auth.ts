/**
 * probe_fig_auth — Slice FIG-AUTH: the DRAFT lifecycle + on-demand figure render
 * before approval. Real Gemini + real nadi-pyrender (:8002 must be up).
 *
 * FIRM (deterministic):
 *   - persistDrafts writes status='draft' rows with ids + ordinals-after-max
 *   - the M11 gate: a draft is INVISIBLE to Practice until approveDrafts flips it
 *   - ownership: a foreign tutor / unlinked student → STUDENT_NOT_FOUND
 *   - updateDraft edits fields + the figure spec (+ logs authoring_edit)
 *   - generate → verify → currentImageFor wire correctly on a DRAFT
 *   - discardDraft removes the draft + its rendered images
 *   - RLS: the draft is invisible under another board
 *   - HTTP generateQuestionImage (no session) → 401
 * SOFT (model-dependent):
 *   - §7 (D-FIG-3): an explicit "include a diagram" brief makes the AI author a
 *     STRUCTURED image spec (not just prose) on ≥1 draft
 */
import { and, asc, eq, sql } from "drizzle-orm";
import type { PgTransaction } from "drizzle-orm/pg-core";
import {
  appUser,
  board,
  chapter,
  learningObjective,
  masteryState,
  observation,
  question,
  questionImage,
  subject,
  subTopic,
  topic,
  tutorStudent,
} from "@b2c/kernel/schema";
import { db, queryClient } from "../src/db/client";
import { withBoard } from "../src/db/with-board";
import { env } from "../src/config/env";
import {
  approveDrafts,
  assertOwnedDraft,
  discardDraft,
  DraftNotFoundError,
  persistDrafts,
  updateDraft,
  type DraftItem,
} from "../src/services/authoring";
import { authorFromChat, startChat } from "../src/services/authoring_chat";
import { startSession } from "../src/services/practice";
import { generateImageForQuestion } from "../src/services/image_gen";
import { verifyImage } from "../src/services/image_verify";
import { currentImageFor } from "../src/services/image_read";
import { StudentNotFoundError } from "../src/services/tutor";

type Tx = PgTransaction<any, any, any>;
let passed = 0;
let failed = 0;
function check(name: string, ok: boolean) {
  if (ok) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.error(`  ✗ ${name}`); }
}
function soft(name: string, value: unknown) {
  console.log(`  ~ [soft] ${name}: ${JSON.stringify(value)}`);
}
const rows = <T>(boardId: string, fn: (tx: Tx) => Promise<T>) => withBoard(boardId, fn);

const mkDraft = (overrides: Partial<DraftItem> = {}): DraftItem => ({
  axis: "conceptual",
  stem: "A right-angled triangle has legs 3 cm and 4 cm. Explain, in words, how you know the hypotenuse is 5 cm and why the relationship holds.",
  referenceAnswer: "By Pythagoras 3²+4²=9+16=25 → √25 = 5 cm; it holds because...",
  explanation: null,
  intent: "aims at C1 — reasoning about the Pythagorean relationship",
  rubric: { ar: 2, ms: 1, mr: 2, ba: 1, gl: 2 },
  honestLowReason: "MS=1: a slip vs a misconception is hard to distinguish here",
  image: null,
  ...overrides,
});

async function main() {
  const tag = `${Date.now()}`;
  await db.execute(sql`select 1`);
  check("DB connectivity (select 1) as app role", true);

  const [P] = await db.insert(board).values({ slug: `fig-p-${tag}`, name: "Fig P" }).returning();
  const [Q] = await db.insert(board).values({ slug: `fig-q-${tag}`, name: "Fig Q" }).returning();
  if (!P || !Q) throw new Error("board seed failed");

  const [tut] = await db.insert(appUser).values({ email: `fig-tut-${tag}@example.com`, name: "Tutor" }).returning();
  const [tut2] = await db.insert(appUser).values({ email: `fig-tut2-${tag}@example.com`, name: "Other Tutor" }).returning();
  const [stuA] = await db.insert(appUser).values({ email: `fig-a-${tag}@example.com`, name: "Student A" }).returning();
  const [stuB] = await db.insert(appUser).values({ email: `fig-b-${tag}@example.com`, name: "Student B" }).returning();
  if (!tut || !tut2 || !stuA || !stuB) throw new Error("app_user seed failed");

  const fx = await withBoard(P.id, async (tx: Tx) => {
    const [subj] = await tx.insert(subject).values({ boardId: P.id, slug: "phys", name: "Physics", grade: "IGCSE" }).returning();
    const [chap] = await tx.insert(chapter).values({ boardId: P.id, subjectId: subj!.id, slug: "motion", name: "Motion", ordinal: 1 }).returning();
    const [tp] = await tx.insert(topic).values({ boardId: P.id, chapterId: chap!.id, slug: "speed", name: "Speed", ordinal: 1 }).returning();
    const [st] = await tx.insert(subTopic).values({ boardId: P.id, topicId: tp!.id, slug: "accel", name: "Acceleration", ordinal: 1 }).returning();
    await tx.insert(learningObjective).values({ boardId: P.id, subTopicId: st!.id, axis: "conceptual", code: "C1", description: "Reasons about geometric relationships." });
    await tx.insert(tutorStudent).values({ boardId: P.id, tutorId: tut.id, studentId: stuA.id });
    await tx.insert(tutorStudent).values({ boardId: P.id, tutorId: tut.id, studentId: stuB.id });
    // ONE canonical (shared, approved-by-default) question at ordinal 0.
    await tx.insert(question).values({ boardId: P.id, subTopicId: st!.id, axis: "conceptual", kind: "subjective", stem: "Canonical Q", referenceAnswer: "ref", ordinal: 0, source: "seed" });
    await tx.insert(masteryState).values({ boardId: P.id, studentId: stuA.id, subTopicId: st!.id, conceptualLevel: 3, proceduralLevel: 2, description: "solid", log: "internal" });
    await tx.insert(observation).values({ boardId: P.id, studentId: stuA.id, subTopicId: st!.id, axis: "conceptual", observationLevel: 3, reasoning: "reasons well", source: "stage1_scorer", calibrationFlag: "ok" });
    return { chapterId: chap!.id, subTopicId: st!.id };
  });

  const fxQ = await withBoard(Q.id, async (tx: Tx) => {
    const [subj] = await tx.insert(subject).values({ boardId: Q.id, slug: "phys", name: "Physics", grade: "IGCSE" }).returning();
    const [chap] = await tx.insert(chapter).values({ boardId: Q.id, subjectId: subj!.id, slug: "motion", name: "Motion", ordinal: 1 }).returning();
    const [tp] = await tx.insert(topic).values({ boardId: Q.id, chapterId: chap!.id, slug: "speed", name: "Speed", ordinal: 1 }).returning();
    const [st] = await tx.insert(subTopic).values({ boardId: Q.id, topicId: tp!.id, slug: "accel", name: "Acceleration", ordinal: 1 }).returning();
    return { subTopicId: st!.id };
  });

  // ─────────── 1. persist drafts ───────────
  const persisted = await rows(P.id, (tx) =>
    persistDrafts(tx, { boardId: P.id, subTopicId: fx.subTopicId, targetStudentId: stuA.id, drafts: [mkDraft(), mkDraft({ axis: "procedural" })] }),
  );
  check("persist: 2 drafts returned with ids", persisted.length === 2 && persisted.every((d) => !!d.id));
  const d0 = persisted[0]!;
  const dbRows = await rows(P.id, (tx) => tx.select().from(question).where(and(eq(question.subTopicId, fx.subTopicId), eq(question.source, "b2c_authoring"))).orderBy(asc(question.ordinal)));
  check("persist: all status='draft'", dbRows.every((q) => (q as { status: string }).status === "draft"));
  check("persist: ordinals after canonical max → 1,2", JSON.stringify(dbRows.map((q) => q.ordinal)) === JSON.stringify([1, 2]));
  check("persist: target_student_id = A", dbRows.every((q) => q.targetStudentId === stuA.id));

  // ─────────── 2. M11 gate: draft NOT servable before approve ───────────
  // Assert via the delivery predicate directly (startSession would FREEZE + then
  // RESUME an active session per D-L-6, masking a later approve — so we query the
  // servable set instead of opening a session A would later reuse).
  const servableBefore = await rows(P.id, (tx) =>
    tx.select().from(question).where(and(
      eq(question.subTopicId, fx.subTopicId),
      eq(question.status, "approved"),
    )),
  );
  check("M11 gate: only the 1 canonical is servable before approve (drafts hidden)", servableBefore.length === 1);

  // ─────────── 3. ownership guards ───────────
  let foreignTutor = false;
  try { await rows(P.id, (tx) => assertOwnedDraft(tx, tut2.id, d0.id)); }
  catch (e) { foreignTutor = e instanceof StudentNotFoundError; }
  check("ownership: foreign tutor → STUDENT_NOT_FOUND", foreignTutor);

  let badDraft = false;
  try { await rows(P.id, (tx) => assertOwnedDraft(tx, tut.id, "00000000-0000-0000-0000-000000000000")); }
  catch (e) { badDraft = e instanceof DraftNotFoundError; }
  check("ownership: unknown id → DRAFT_NOT_FOUND", badDraft);

  // ─────────── 4. updateDraft (edit fields + set figure spec) ───────────
  const spec = { description: "A right triangle with legs 3 and 4 and hypotenuse 5, right-angle marked.", shows: ["legs labelled 3 and 4", "hypotenuse labelled 5", "right-angle square marker"], hides: ["grid lines", "coordinate axes"] };
  const upd = await rows(P.id, (tx) => updateDraft(tx, { tutorUserId: tut.id, questionId: d0.id, patch: { axis: "conceptual", stem: d0.stem + " (edited)", referenceAnswer: d0.referenceAnswer, explanation: "edited note", image: spec } }));
  check("updateDraft: returns the spec on the draft", !!upd.image && upd.image.description === spec.description);
  const afterEdit = await rows(P.id, (tx) => tx.select().from(question).where(eq(question.id, d0.id)));
  check("updateDraft: DB row carries the image spec + edited stem", (afterEdit[0]!.image as { description?: string })?.description === spec.description && afterEdit[0]!.stem.endsWith("(edited)"));

  let updForeign = false;
  try { await rows(P.id, (tx) => updateDraft(tx, { tutorUserId: tut2.id, questionId: d0.id, patch: { axis: "conceptual", stem: "x", referenceAnswer: "y", explanation: null, image: null } })); }
  catch (e) { updForeign = e instanceof StudentNotFoundError; }
  check("updateDraft: foreign tutor → STUDENT_NOT_FOUND", updForeign);

  // ─────────── 5. render + verify on the DRAFT (real Gemini + pyrender) ───────────
  let imageId: string | null = null;
  let verifierLabel: string | null = null;
  try {
    const gen = await generateImageForQuestion(P.id, d0.id);
    imageId = gen.imageId;
    check("generate: rendered v1 on the draft (imageId + bytes)", gen.version === 1 && gen.bytes.length > 0 && !!gen.imageId);
    const v = await verifyImage(P.id, gen.imageId);
    verifierLabel = v.label;
    check("verify: label ∈ PASS/FAIL/ERROR", ["PASS", "FAIL", "ERROR"].includes(v.label));
    soft("verifier verdict on the 3-4-5 triangle", { label: v.label, reason: v.reason.slice(0, 120) });
    const cur = await rows(P.id, (tx) => currentImageFor(tx, d0.id));
    check("currentImageFor: returns the rendered image + its verdict", cur?.imageId === gen.imageId && cur?.verifierLabel === v.label);
  } catch (e) {
    check("generate+verify on the draft (real Gemini + pyrender)", false);
    console.error("    render/verify error:", (e as Error).message);
  }

  // ─────────── 6. approve → the ENABLEMENT side ───────────
  const appr = await rows(P.id, (tx) => approveDrafts(tx, { tutorUserId: tut.id, questionIds: [d0.id] }));
  check("approve: 1 id approved", appr.approvedIds.length === 1);
  const afterAppr = await rows(P.id, (tx) => tx.select().from(question).where(eq(question.id, d0.id)));
  check("approve: status flipped to 'approved'", (afterAppr[0]! as { status: string }).status === "approved");
  const postA = await rows(P.id, (tx) => startSession(tx, { boardId: P.id, appUserId: stuA.id, subTopicId: fx.subTopicId }));
  check("M11 enable: A's session now serves canonical + the approved draft = 2", postA.total === 2);
  const postB = await rows(P.id, (tx) => startSession(tx, { boardId: P.id, appUserId: stuB.id, subTopicId: fx.subTopicId }));
  check("delivery: B sees ONLY canonical (private still isolated) = 1", postB.total === 1);
  // d0 is no longer a draft → draft ops now reject it.
  let notDraftAnymore = false;
  try { await rows(P.id, (tx) => assertOwnedDraft(tx, tut.id, d0.id)); }
  catch (e) { notDraftAnymore = e instanceof DraftNotFoundError; }
  check("post-approve: the row is no longer a draft (draft ops reject it)", notDraftAnymore);

  // ─────────── 7. discardDraft removes the draft + its images ───────────
  const d1 = persisted[1]!;
  await rows(P.id, (tx) => discardDraft(tx, { tutorUserId: tut.id, questionId: d1.id }));
  const gone = await rows(P.id, (tx) => tx.select().from(question).where(eq(question.id, d1.id)));
  check("discard: draft row deleted", gone.length === 0);

  // ─────────── 8. RLS: the (now-approved) private question invisible under Q ───────────
  const underQ = await rows(Q.id, (tx) => tx.select().from(question).where(eq(question.subTopicId, fx.subTopicId)));
  check("RLS: P's questions invisible under board Q", underQ.length === 0);
  void fxQ;

  // ─────────── 9. §7 (D-FIG-3) SOFT: does an explicit diagram brief yield a structured spec? ───────────
  try {
    const gchat = await rows(P.id, (tx) => startChat(tx, { boardId: P.id, tutorUserId: tut.id, studentId: stuA.id, vendor: "gemini_api", chapterId: fx.chapterId }));
    const ares = await rows(P.id, (tx) => authorFromChat(tx, { tutorUserId: tut.id, chatId: gchat.chatId, subTopicId: fx.subTopicId, count: 2 }));
    const withSpec = ares.drafts.filter((d) => d.image != null).length;
    soft("§7: drafts carrying a STRUCTURED image spec (of 2)", withSpec);
    check("§7 authored drafts persisted as drafts (ids present)", ares.drafts.every((d) => !!d.id));
    // clean up these extra drafts so they don't linger
    for (const d of ares.drafts) await rows(P.id, (tx) => discardDraft(tx, { tutorUserId: tut.id, questionId: d.id }));
  } catch (e) {
    check("§7 gemini author smoke", false);
    console.error("    §7 smoke error:", (e as Error).message);
  }

  // ─────────── 10. HTTP: generateQuestionImage (no session) → 401 ───────────
  try {
    const res = await fetch(`http://localhost:${env.PORT}/trpc/tutor.generateQuestionImage?batch=1`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-board": P.slug },
      body: JSON.stringify({ 0: { json: { questionId: d0.id } } }),
    });
    check(`HTTP generateQuestionImage (no session) → 401 (got ${res.status})`, res.status === 401);
  } catch {
    console.log("  ~ HTTP generateQuestionImage skipped (server not running)");
  }

  console.log(`\n  ${passed} passed, ${failed} failed`);
  await queryClient.end();
  if (failed > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
