/**
 * probe_image_read — Slice IMG Stage-3 exit gate (the current-image READ side).
 *
 * NO AI, NO pyrender — inserts question_image rows DIRECTLY (deterministic) to
 * prove the read logic that surfaces a figure to Practice (student) and to the
 * tutor Saved-questions review. Real DB + real RLS, throwaway board P (M22), full
 * cleanup.
 *
 * FIRM (all plumbing we control):
 *  1. DB connectivity.
 *  2. currentImagesFor picks the HIGHEST version per question.
 *  3. STUDENT gate (D-IMG-13): Practice getSession exposes imageId ONLY when the
 *     current image is PASS — a FAIL/ERROR/PENDING current render → imageId null.
 *  4. A question with NO render → imageId null.
 *  5. TUTOR view: listAuthoredQuestions returns the current imageId + verifierLabel
 *     REGARDLESS of verdict (author must see FAIL/ERROR to regen).
 */
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
} from "@b2c/kernel/schema";
import { db, queryClient } from "../src/db/client";
import { withBoard } from "../src/db/with-board";
import { currentImagesFor } from "../src/services/image_read";
import { getSession, startSession } from "../src/services/practice";
import { listAuthoredQuestions } from "../src/services/authoring";

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

const SPEC = { description: "a triangle", shows: ["A", "B", "C"], hides: [] };

// Insert a question_image row at an explicit version + verdict (bypasses render).
async function seedImage(
  tx: Tx,
  boardId: string,
  questionId: string,
  version: number,
  verifierLabel: string | null,
): Promise<string> {
  const [row] = await tx
    .insert(questionImage)
    .values({
      boardId,
      questionId,
      version,
      storageKey: `${questionId}/v${version}.png`,
      mime: "image/png",
      spec: SPEC,
      pyScript: "import matplotlib",
      verifierLabel,
      verifierReason: verifierLabel ? `${verifierLabel} (probe)` : null,
      verifierModel: verifierLabel ? "probe" : null,
      verifiedAt: verifierLabel ? new Date() : null,
    })
    .returning({ id: questionImage.id });
  return row!.id;
}

async function main() {
  const tag = `${Date.now()}`;
  await db.execute(sql`select 1`);
  check("DB connectivity (select 1) as app role", true);

  const [P] = await db.insert(board).values({ slug: `imr-p-${tag}`, name: "Read P" }).returning();
  if (!P) throw new Error("board seed failed");

  const stuEmail = `imr-stu-${tag}@example.com`;
  const [stu] = await db.insert(appUser).values({ email: stuEmail, name: "Stu", userType: "student" }).returning();
  const [tut] = await db.insert(appUser).values({ email: `imr-tut-${tag}@example.com`, name: "Tut", userType: "tutor" }).returning();
  if (!stu || !tut) throw new Error("app_user seed failed");

  const fx = await withBoard(P.id, async (tx: Tx) => {
    await tx.insert(student).values({ userId: stu.id, boardId: P.id, class: "9", tutorId: tut.id });
    const [subj] = await tx.insert(subject).values({ boardId: P.id, slug: "math", name: "Mathematics", grade: "IGCSE" }).returning();
    const [chap] = await tx.insert(chapter).values({ boardId: P.id, subjectId: subj!.id, slug: "geo", name: "Geometry", ordinal: 1 }).returning();
    const [tp] = await tx.insert(topic).values({ boardId: P.id, chapterId: chap!.id, slug: "tri", name: "Triangles", ordinal: 1 }).returning();
    const [st] = await tx.insert(subTopic).values({ boardId: P.id, topicId: tp!.id, slug: "sides", name: "Sides", ordinal: 1 }).returning();
    // A canonical (student-visible) question WITH a figure spec + a plain one, both self-serve.
    const [qImg] = await tx.insert(question).values({ boardId: P.id, subTopicId: st!.id, axis: "conceptual", kind: "subjective", stem: "Describe the triangle.", referenceAnswer: "…", explanation: null, pedagogicalNote: null, ordinal: 0, source: "b2c_authoring", image: SPEC }).returning();
    const [qPlain] = await tx.insert(question).values({ boardId: P.id, subTopicId: st!.id, axis: "conceptual", kind: "subjective", stem: "Define a side.", referenceAnswer: "…", explanation: null, pedagogicalNote: null, ordinal: 1, source: "b2c_authoring", image: null }).returning();
    // A question authored PRIVATE to the student (the tutor Saved-questions surface).
    const [qPriv] = await tx.insert(question).values({ boardId: P.id, subTopicId: st!.id, axis: "procedural", kind: "subjective", stem: "Private figure question.", referenceAnswer: "…", explanation: null, pedagogicalNote: null, ordinal: 2, source: "b2c_authoring", image: SPEC, targetStudentId: stu.id }).returning();
    return { st: st!.id, qImg: qImg!.id, qPlain: qPlain!.id, qPriv: qPriv!.id };
  });

  // 2. currentImagesFor → highest version. Seed v1 FAIL, v2 PASS.
  await withBoard(P.id, async (tx: Tx) => {
    await seedImage(tx, P.id, fx.qImg, 1, "FAIL");
    await seedImage(tx, P.id, fx.qImg, 2, "PASS");
  });
  const cur = await withBoard(P.id, (tx: Tx) => currentImagesFor(tx, [fx.qImg]));
  check("currentImagesFor picks the highest version (v2, PASS)", cur.get(fx.qImg)?.version === 2 && cur.get(fx.qImg)?.verifierLabel === "PASS");

  // 3. STUDENT gate — current is PASS → imageId exposed.
  const passImageId = cur.get(fx.qImg)!.imageId;
  const sess = await withBoard(P.id, (tx: Tx) => startSession(tx, { boardId: P.id, appUserId: stu.id, subTopicId: fx.st }));
  // The session freezes qImg, qPlain, qPriv (all student-visible); step to whichever is qImg.
  const seenPass = await withBoard(P.id, async (tx: Tx) => {
    let s = await getSession(tx, { sessionId: sess.sessionId, appUserId: stu.id });
    // qImg is ordinal 0 → the first question.
    return s.question?.id === fx.qImg ? s.question?.imageId : null;
  });
  check("STUDENT: PASS current image → getSession exposes imageId", seenPass === passImageId);

  // 3b. Bump to a FAIL current render (v3) → student imageId now null.
  await withBoard(P.id, (tx: Tx) => seedImage(tx, P.id, fx.qImg, 3, "FAIL"));
  const seenFail = await withBoard(P.id, async (tx: Tx) => {
    const s = await getSession(tx, { sessionId: sess.sessionId, appUserId: stu.id });
    return s.question?.id === fx.qImg ? s.question?.imageId : "wrong-question";
  });
  check("STUDENT gate: FAIL current render → imageId withheld (null)", seenFail === null);

  // 3c. A PENDING current render (label null) → also withheld.
  await withBoard(P.id, (tx: Tx) => seedImage(tx, P.id, fx.qImg, 4, null));
  const seenPending = await withBoard(P.id, async (tx: Tx) => {
    const s = await getSession(tx, { sessionId: sess.sessionId, appUserId: stu.id });
    return s.question?.id === fx.qImg ? s.question?.imageId : "wrong-question";
  });
  check("STUDENT gate: PENDING (unverified) current render → imageId withheld (null)", seenPending === null);

  // 4. A question with NO render → imageId null (via a fresh direct load path).
  const noRender = await withBoard(P.id, (tx: Tx) => currentImagesFor(tx, [fx.qPlain]));
  check("no render for a question → currentImagesFor has no entry", !noRender.has(fx.qPlain));

  // 5. TUTOR view — private question with a FAIL render still shows imageId + label.
  const privImageId = await withBoard(P.id, (tx: Tx) => seedImage(tx, P.id, fx.qPriv, 1, "FAIL"));
  const authored = await withBoard(P.id, (tx: Tx) => listAuthoredQuestions(tx, { tutorUserId: tut.id, studentId: stu.id }));
  const privRow = authored.find((r) => r.id === fx.qPriv);
  check("TUTOR: listAuthoredQuestions returns the private question", !!privRow);
  check("TUTOR: FAIL render is SHOWN (imageId + verifierLabel present, regardless of verdict)", privRow?.imageId === privImageId && privRow?.verifierLabel === "FAIL" && privRow?.hasImage === true);

  // ── cleanup (FK-safe) ──
  await withBoard(P.id, async (tx: Tx) => {
    await tx.delete(questionImage).where(eq(questionImage.boardId, P.id));
    // practice_session + attempt from startSession
    await tx.execute(sql`delete from attempt where board_id = ${P.id}`);
    await tx.execute(sql`delete from practice_session where board_id = ${P.id}`);
    await tx.delete(question).where(eq(question.boardId, P.id));
    await tx.delete(subTopic).where(eq(subTopic.boardId, P.id));
    await tx.delete(topic).where(eq(topic.boardId, P.id));
    await tx.delete(chapter).where(eq(chapter.boardId, P.id));
    await tx.delete(subject).where(eq(subject.boardId, P.id));
    await tx.delete(student).where(eq(student.boardId, P.id));
  });
  await db.delete(appUser).where(eq(appUser.email, stuEmail));
  await db.delete(appUser).where(eq(appUser.email, `imr-tut-${tag}@example.com`));
  await db.delete(board).where(and(eq(board.id, P.id)));

  console.log(`\nprobe_image_read: ${passed} passed, ${failed} failed`);
  await queryClient.end();
  process.exit(failed === 0 ? 0 : 1);
}

main().catch(async (err) => {
  console.error("probe_image_read FAILED:", err);
  await queryClient.end();
  process.exit(1);
});
