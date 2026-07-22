/**
 * probe_image_render — Slice IMG Stage-1 exit gate (figure render pipeline).
 *
 * Runs the REAL pipeline: question figure SPEC → Gemini writes a matplotlib
 * script → nadi-pyrender renders it → PNG on local FS + question_image row →
 * auth-gated serve. Real Gemini + real sidecar + real DB + real RLS, on a
 * THROWAWAY fixture (boards P/Q per run, M22) with full cleanup. Needs
 * GEMINI_API_KEY and pyrender UP on PYRENDER_URL.
 *
 * Two-tier (build-discipline — don't over-read a single AI response):
 *   FIRM — plumbing we control: a row is written (v1, then v2 bump), the bytes
 *     are a real PNG, py_script imports matplotlib, verifier cols are NULL, RLS
 *     hides cross-board, the serve gate returns bytes for a member and
 *     401/403/404 otherwise, no-spec/unknown throw, and the REAL save flow
 *     enqueues a render (M11 both sides).
 *   SOFT — whether the diagram is pedagogically correct (that's Stage-2's vision
 *     verifier): we LOG the script's shape + byte size, never fail on it.
 *
 *  1. DB connectivity.
 *  2. generateImageForQuestion → { imageId, version:1, storageKey, bytes }.
 *  3. bytes are a real PNG (magic header) + non-trivial size.
 *  4. question_image row: v1, storageKey, mime, spec preserved, py_script imports
 *     matplotlib, verifier cols NULL.
 *  5. re-render → version 2 (bump), unique (question_id,version) holds.
 *  6. RLS: the P image is invisible under board Q.
 *  7. serve: resolveImageBytes for a P member → the PNG bytes.
 *  8. serve 401: no email.
 *  9. serve 403: a non-member email.
 * 10. serve 404: a Q member reading a P image (RLS-hidden).
 * 11. NoImageSpecError: a question with image=null.
 * 12. QuestionNotFoundError: an unknown id.
 * 13. M11: saveQuestions with a figure-spec item ENQUEUES a render job; a
 *     spec-less item does NOT.
 */
import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import type { PgTransaction } from "drizzle-orm/pg-core";
import {
  appUser,
  board,
  chapter,
  question,
  questionImage,
  student,
  subTopic,
  subject,
  topic,
  tutor,
} from "@b2c/kernel/schema";
import { db, queryClient } from "../src/db/client";
import { withBoard } from "../src/db/with-board";
import { redisConnection } from "../src/redis/connection";
import { __aiConfigured } from "../src/services/ai/gemini";
import {
  NoImageSpecError,
  QuestionNotFoundError,
  generateImageForQuestion,
} from "../src/services/image_gen";
import { ImageError, resolveImageBytes } from "../src/services/image_serve";
import { pyrenderHealth } from "../src/services/matplotlib";
import { saveQuestions, type SaveItem } from "../src/services/authoring";
import { generateImageQueue, getActiveImageJobId } from "../src/worker/queue";

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

const isPng = (b: Uint8Array) =>
  b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47;

const SPEC = {
  description: "A right-angled triangle with the right angle at B, sides labelled",
  shows: ["vertices A, B, C", "right-angle mark at B", "hypotenuse AC labelled 10 cm"],
  hides: ["any shading", "grid lines"],
};

// A minimal valid SaveItem carrying a figure spec (the AI-draft shape).
function saveItem(withImage: boolean): SaveItem {
  const draft = {
    axis: "conceptual" as const,
    stem: "State Pythagoras' theorem and explain in words why it holds for the triangle described (right angle at B, hypotenuse AC = 10 cm).",
    referenceAnswer: "AC² = AB² + BC²; the square on the hypotenuse equals the sum of the squares on the other two sides.",
    explanation: null,
    intent: "Probes the conceptual statement of the theorem, not a numeric plug-in.",
    rubric: { ar: 2, ms: 1, mr: 2, ba: 1, gl: 2 },
    honestLowReason: "MS is 1 — few specific misconceptions are probed by a statement task.",
    image: withImage ? SPEC : null,
  };
  return { draft, final: { axis: draft.axis, stem: draft.stem, referenceAnswer: draft.referenceAnswer, explanation: null, image: draft.image } };
}

async function main() {
  if (!__aiConfigured()) {
    console.error("GEMINI_API_KEY not set — probe_image_render needs the real vendor.");
    await queryClient.end();
    process.exit(1);
  }
  if (!(await pyrenderHealth())) {
    console.error(
      "nadi-pyrender is DOWN — start it first:\n" +
        "  (cd /Users/mab/Desktop/nadi/nadi-pyrender && .venv/bin/python -m uvicorn server:app --host 127.0.0.1 --port 8002)",
    );
    await queryClient.end();
    process.exit(1);
  }

  const tag = `${Date.now()}`;
  await db.execute(sql`select 1`);
  check("DB connectivity (select 1) as app role", true);

  const [P] = await db.insert(board).values({ slug: `img-p-${tag}`, name: "Probe P" }).returning();
  const [Q] = await db.insert(board).values({ slug: `img-q-${tag}`, name: "Probe Q" }).returning();
  if (!P || !Q) throw new Error("board seed failed");

  // A student member of BOTH boards (P for the happy serve, Q for the RLS-hide),
  // and a tutor for the save flow. Global identity rows + per-board membership.
  const stuEmail = `img-stu-${tag}@example.com`;
  const stuQEmail = `img-stuq-${tag}@example.com`; // a SEPARATE student who belongs to board Q (single-board model)
  const outsiderEmail = `img-out-${tag}@example.com`;
  const [stu] = await db.insert(appUser).values({ email: stuEmail, name: "Stu", userType: "student" }).returning();
  const [stuQ] = await db.insert(appUser).values({ email: stuQEmail, name: "Stu Q", userType: "student" }).returning();
  const [tut] = await db.insert(appUser).values({ email: `img-tut-${tag}@example.com`, name: "Tut", userType: "tutor" }).returning();
  const [out] = await db.insert(appUser).values({ email: outsiderEmail, name: "Out", userType: "student" }).returning();
  if (!stu || !stuQ || !tut || !out) throw new Error("app_user seed failed");

  // Fixture under P: spine + a question WITH a figure spec + one with none.
  const fx = await withBoard(P.id, async (tx: Tx) => {
    await tx.insert(student).values({ userId: stu.id, boardId: P.id, class: "9", tutorId: tut.id });
    const [subj] = await tx.insert(subject).values({ boardId: P.id, slug: "math", name: "Mathematics", grade: "IGCSE" }).returning();
    const [chap] = await tx.insert(chapter).values({ boardId: P.id, subjectId: subj!.id, slug: "pythagoras", name: "Pythagoras", ordinal: 1 }).returning();
    const [tp] = await tx.insert(topic).values({ boardId: P.id, chapterId: chap!.id, slug: "right-triangles", name: "Right triangles", ordinal: 1 }).returning();
    const [st] = await tx.insert(subTopic).values({ boardId: P.id, topicId: tp!.id, slug: "theorem", name: "The theorem", ordinal: 1 }).returning();
    const [qImg] = await tx.insert(question).values({ boardId: P.id, subTopicId: st!.id, axis: "conceptual", kind: "subjective", stem: "State Pythagoras' theorem for the right-angled triangle described (right angle at B, hypotenuse AC = 10 cm).", referenceAnswer: "AC² = AB² + BC².", explanation: null, pedagogicalNote: null, ordinal: 0, source: "b2c_authoring", image: SPEC }).returning();
    const [qNoImg] = await tx.insert(question).values({ boardId: P.id, subTopicId: st!.id, axis: "conceptual", kind: "subjective", stem: "Define the hypotenuse.", referenceAnswer: "The side opposite the right angle.", explanation: null, pedagogicalNote: null, ordinal: 1, source: "b2c_authoring", image: null }).returning();
    return { st: st!.id, qImg: qImg!.id, qNoImg: qNoImg!.id };
  });
  // A DISTINCT student who belongs to Q — for the RLS-hide serve test (test 10).
  // Single-board model: `stu` is on P and cannot also be on Q (student PK = userId).
  await withBoard(Q.id, (tx: Tx) => tx.insert(student).values({ userId: stuQ.id, boardId: Q.id, class: "9" }));

  // Make `tut` an OPERATIONAL tutor on P (detail row, board in boards[]) — for the
  // role-agnostic serve test (test 7b): a tutor viewing an authored figure. The
  // `tutor` table is global (no RLS). Regression guard for the spranav bug where
  // the student-default gate 403'd a tutor with no student row.
  await db.insert(tutor).values({ userId: tut.id, boards: [P.id], status: "active" });

  // 2 + 3. Render the spec → a PNG.
  const r1 = await generateImageForQuestion(P.id, fx.qImg);
  check("generateImageForQuestion → imageId + version 1 + storageKey + bytes", !!r1.imageId && r1.version === 1 && r1.storageKey === `${fx.qImg}/v1.png` && r1.bytes.length > 0);
  check("rendered bytes are a real PNG (magic header) + non-trivial size (>1KB)", isPng(r1.bytes) && r1.bytes.length > 1024);
  soft("v1 PNG size (bytes)", r1.bytes.length);

  // 4. The row.
  const [row1] = await withBoard(P.id, (tx: Tx) => tx.select().from(questionImage).where(eq(questionImage.id, r1.imageId)));
  const rr: any = row1;
  check("question_image row: v1, mime image/png, storageKey matches", rr && rr.version === 1 && rr.mime === "image/png" && rr.storageKey === r1.storageKey);
  check("question_image row: spec preserved (description)", rr?.spec?.description === SPEC.description);
  check("question_image row: py_script present + imports matplotlib", typeof rr?.pyScript === "string" && /import\s+matplotlib/.test(rr.pyScript));
  check("question_image row: verifier columns NULL (Stage-2 fills them)", rr?.verifierLabel === null && rr?.verifierReason === null && rr?.verifiedAt === null && rr?.specHash === null);
  soft("py_script first line", rr?.pyScript?.split("\n")[0]);

  // 5. Re-render → version 2.
  const r2 = await generateImageForQuestion(P.id, fx.qImg);
  const allVers = await withBoard(P.id, (tx: Tx) => tx.select({ v: questionImage.version }).from(questionImage).where(eq(questionImage.questionId, fx.qImg)));
  check("re-render → version 2 (bump), both versions present", r2.version === 2 && allVers.length === 2);

  // 6. RLS cross-board.
  const underQ = await withBoard(Q.id, (tx: Tx) => tx.select().from(questionImage).where(eq(questionImage.id, r1.imageId)));
  check("RLS: the P image row is invisible under board Q", underQ.length === 0);

  // 7. serve happy path (student).
  const served = await resolveImageBytes({ imageId: r1.imageId, boardSlug: P.slug, email: stuEmail });
  check("serve: P member gets the PNG bytes back", isPng(served.bytes) && served.mime === "image/png" && served.bytes.length === r1.bytes.length);

  // 7b. serve role-agnostic (tutor): a tutor serving P (in boards[]) gets the bytes.
  // An <img src> can't send x-profile, so the gate must accept ANY board-belonging
  // role, not only student. This is the spranav authoring-image regression.
  const servedTut = await resolveImageBytes({ imageId: r1.imageId, boardSlug: P.slug, email: tut.email });
  check("serve: P tutor (no student row) gets the PNG bytes back", isPng(servedTut.bytes) && servedTut.bytes.length === r1.bytes.length);

  // 8. serve 401 — no email.
  let s401 = 0;
  try { await resolveImageBytes({ imageId: r1.imageId, boardSlug: P.slug, email: null }); } catch (e) { if (e instanceof ImageError) s401 = e.status; }
  check("serve 401: no email → NOT_AUTHENTICATED", s401 === 401);

  // 9. serve 403 — a non-member email.
  let s403 = 0;
  try { await resolveImageBytes({ imageId: r1.imageId, boardSlug: P.slug, email: outsiderEmail }); } catch (e) { if (e instanceof ImageError) s403 = e.status; }
  check("serve 403: non-member → NO_MEMBERSHIP", s403 === 403);

  // 10. serve 404 — a Q member reading a P image (RLS-hidden under the Q claim).
  let s404 = 0;
  try { await resolveImageBytes({ imageId: r1.imageId, boardSlug: Q.slug, email: stuQEmail }); } catch (e) { if (e instanceof ImageError) s404 = e.status; }
  check("serve 404: Q member reading a P image → IMAGE_NOT_FOUND (RLS-hidden)", s404 === 404);

  // 11. no spec.
  let noSpec = false;
  try { await generateImageForQuestion(P.id, fx.qNoImg); } catch (e) { noSpec = e instanceof NoImageSpecError; }
  check("generateImageForQuestion on image=null question → NoImageSpecError", noSpec);

  // 12. unknown question.
  let unknown = false;
  try { await generateImageForQuestion(P.id, randomUUID()); } catch (e) { unknown = e instanceof QuestionNotFoundError; }
  check("unknown question id → QuestionNotFoundError", unknown);

  // 13. M11 — the real save flow enqueues a render for a spec-carrying question,
  // and does NOT for a spec-less one. (We assert the enqueue wiring; the worker
  // loop is exercised by the direct render above.)
  const saveRes = await withBoard(P.id, (tx: Tx) =>
    saveQuestions(tx, { boardId: P.id, tutorUserId: tut.id, subTopicId: fx.st, items: [saveItem(true), saveItem(false)] }),
  );
  const [withImgId, noImgId] = saveRes.savedIds;
  const jobWith = await generateImageQueue.getJob(`image-${withImgId}`);
  const jobNo = await generateImageQueue.getJob(`image-${noImgId}`);
  check("M11: saveQuestions enqueues a render for the figure-spec question", !!jobWith && jobWith.data.questionId === withImgId && jobWith.data.boardId === P.id);
  check("M11: saveQuestions does NOT enqueue for the spec-less question", !jobNo);

  // Resume handle (durable "Regenerating…" loader): the FE finds a live render job
  // by (board, question) on mount to re-attach its poll after a page refresh.
  const activeJob = await getActiveImageJobId(P.id, withImgId!);
  check("resume: getActiveImageJobId finds the live render job for the question", activeJob === jobWith?.id);
  const noActive = await getActiveImageJobId(P.id, fx.qNoImg);
  check("resume: getActiveImageJobId → null for a question with no live job", noActive === null);
  const wrongBoard = await getActiveImageJobId(Q.id, withImgId!);
  check("resume: getActiveImageJobId → null under a different board (isolation)", wrongBoard === null);

  // ── cleanup (FK-safe) ──
  await generateImageQueue.obliterate({ force: true }).catch(() => {});
  await withBoard(P.id, async (tx: Tx) => {
    await tx.delete(questionImage).where(eq(questionImage.boardId, P.id));
    await tx.delete(question).where(eq(question.boardId, P.id));
    await tx.delete(subTopic).where(eq(subTopic.boardId, P.id));
    await tx.delete(topic).where(eq(topic.boardId, P.id));
    await tx.delete(chapter).where(eq(chapter.boardId, P.id));
    await tx.delete(subject).where(eq(subject.boardId, P.id));
    await tx.delete(student).where(eq(student.boardId, P.id));
  });
  await withBoard(Q.id, (tx: Tx) => tx.delete(student).where(eq(student.boardId, Q.id)));
  await db.delete(tutor).where(eq(tutor.userId, tut.id)); // global; before the app_user FK parent
  await db.delete(appUser).where(and(eq(appUser.email, stuEmail)));
  await db.delete(appUser).where(eq(appUser.email, stuQEmail));
  await db.delete(appUser).where(eq(appUser.email, `img-tut-${tag}@example.com`));
  await db.delete(appUser).where(eq(appUser.email, outsiderEmail));
  await db.delete(board).where(eq(board.id, P.id));
  await db.delete(board).where(eq(board.id, Q.id));

  console.log(`\nprobe_image_render: ${passed} passed, ${failed} failed`);
  await generateImageQueue.close().catch(() => {});
  await redisConnection.quit().catch(() => {});
  await queryClient.end();
  process.exit(failed === 0 ? 0 : 1);
}

main().catch(async (err) => {
  console.error("probe_image_render FAILED:", err);
  await queryClient.end();
  process.exit(1);
});
