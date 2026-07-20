/**
 * probe_answerphoto — Slice UPLOAD-UX exit gate (owner-scoped answer-photo serve).
 *
 * Proves the two serve resolvers against the real DB + RLS + fs object store,
 * driving the real upload→submit flow (M11). Throwaway boards P/Q (M22); cleans
 * up rows + stored bytes.
 *
 * resolveAnswerPhotoBytes (durable, by attempt_image id — reveal + review):
 *   A1 owner W                    → 200, bytes round-trip, mime image/png
 *   A2 unauth (no email)          → 401
 *   A3 board-mate X (not owner)   → 404 (no leak — a peer can't pull your answer)
 *   A4 cross-board (Q member)     → 404 (RLS hides the P row under a Q claim)
 *   A5 unknown imageId (owner)    → 404
 *
 * resolveUploadPreviewBytes (transient, by token — pre-submit preview):
 *   P1 owner W, CONSUMED token    → 200 (still serves after submit)
 *   P2 owner W, UPLOADED token    → 200, mime image/jpeg
 *   P3 unauth                     → 401
 *   P4 board-mate X (not owner)   → 404
 *   P5 board mismatch (owner, Q)  → 404
 *   P6 PENDING token (owner)      → 404 (nothing uploaded yet)
 *
 * HTTP (soft, M30 — a new route needs a server restart to register):
 *   H1 GET /practice/answer-photo/:id   unauth → 401 (registered)
 *   H2 GET /practice/upload-preview/:t   unauth → 401 (registered)
 */
import { eq, sql } from "drizzle-orm";
import { rm } from "node:fs/promises";
import { resolve } from "node:path";
import type { PgTransaction } from "drizzle-orm/pg-core";
import {
  appUser,
  attempt,
  attemptImage,
  board,
  chapter,
  membership,
  practiceSession,
  question,
  subTopic,
  subject,
  topic,
  tutorStudent,
  uploadToken,
} from "@b2c/kernel/schema";
import { db, queryClient } from "../src/db/client";
import { withBoard } from "../src/db/with-board";
import { mintUploadToken, recordPhoneUpload } from "../src/services/upload";
import { startSession, submitPhotoAttempt } from "../src/services/practice";
import { grantRole } from "../src/services/membership";
import { ImageError } from "../src/services/image_serve";
import {
  resolveAnswerPhotoBytes,
  resolveTutorAnswerPhotoBytes,
  resolveUploadPreviewBytes,
} from "../src/services/answer_photo_serve";
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

const IMG = (b: number) => new Uint8Array([137, 80, 78, 71, b]); // arbitrary bytes

/** Run a resolver and capture its ImageError status (or 200 + bytes/mime). */
async function call(fn: () => Promise<{ bytes: Uint8Array; mime: string }>) {
  try {
    const r = await fn();
    return { status: 200, bytes: r.bytes, mime: r.mime };
  } catch (e) {
    if (e instanceof ImageError) return { status: e.status, code: e.code };
    throw e;
  }
}

async function main() {
  const tag = `${Date.now()}`;
  await db.execute(sql`select 1`);
  check("DB connectivity (select 1) as app role", true);

  const [P] = await db.insert(board).values({ slug: `ap-p-${tag}`, name: "Probe P" }).returning();
  const [Q] = await db.insert(board).values({ slug: `ap-q-${tag}`, name: "Probe Q" }).returning();
  if (!P || !Q) throw new Error("board seed failed");

  const fx = await withBoard(P.id, async (tx: Tx) => {
    const [subj] = await tx.insert(subject).values({ boardId: P.id, slug: "phys", name: "Physics", grade: "IGCSE" }).returning();
    const [chap] = await tx.insert(chapter).values({ boardId: P.id, subjectId: subj!.id, slug: "ch", name: "Ch", ordinal: 1 }).returning();
    const [tp] = await tx.insert(topic).values({ boardId: P.id, chapterId: chap!.id, slug: "tp", name: "Tp", ordinal: 1 }).returning();
    const [st] = await tx.insert(subTopic).values({ boardId: P.id, topicId: tp!.id, slug: "st", name: "ST", ordinal: 1 }).returning();
    const [q1] = await tx.insert(question).values({ boardId: P.id, subTopicId: st!.id, axis: "conceptual", kind: "subjective", stem: "Q1", referenceAnswer: "REF1", explanation: "EX1", pedagogicalNote: "N1", ordinal: 1, source: "b2c_authoring" }).returning();
    const [q2] = await tx.insert(question).values({ boardId: P.id, subTopicId: st!.id, axis: "procedural", kind: "subjective", stem: "Q2", referenceAnswer: "REF2", explanation: "EX2", pedagogicalNote: "N2", ordinal: 2, source: "b2c_authoring" }).returning();
    return { subTopic: st!.id, q1: q1!.id, q2: q2!.id };
  });

  const emailW = `ap-w-${tag}@example.com`;
  const emailX = `ap-x-${tag}@example.com`;
  const emailQ = `ap-q-${tag}@example.com`;
  const W = await withBoard(P.id, (tx) => grantRole(tx, { email: emailW, name: "W", board: P, role: "student" }));
  const X = await withBoard(P.id, (tx) => grantRole(tx, { email: emailX, name: "X", board: P, role: "student" }));
  await withBoard(Q.id, (tx) => grantRole(tx, { email: emailQ, name: "QU", board: Q, role: "student" }));
  const userW = W.user.id;
  const userX = X.user.id;

  // W answers q1 with a PHOTO (png) → submit → attempt_image (durable).
  const sW = await withBoard(P.id, (tx) => startSession(tx, { boardId: P.id, appUserId: userW, subTopicId: fx.subTopic }));
  const tokW1 = await withBoard(P.id, (tx) => mintUploadToken(tx, { boardId: P.id, appUserId: userW, sessionId: sW.sessionId, questionId: fx.q1 }));
  await recordPhoneUpload(tokW1.token, [{ bytes: IMG(1), mime: "image/png" }]);
  const submitRes = await withBoard(P.id, (tx) => submitPhotoAttempt(tx, { boardId: P.id, appUserId: userW, sessionId: sW.sessionId, questionId: fx.q1, uploadToken: tokW1.token, confidence: 3, timeMs: 1000 }));
  const imgId = submitRes.photoImageIds[0]!;
  check("submitPhotoAttempt returns photoImageIds (durable id present)", submitRes.photoImageIds.length === 1 && !!imgId);

  // W uploads q2 (jpeg) but does NOT submit → token stays 'uploaded'.
  const tokW2 = await withBoard(P.id, (tx) => mintUploadToken(tx, { boardId: P.id, appUserId: userW, sessionId: sW.sessionId, questionId: fx.q2 }));
  await recordPhoneUpload(tokW2.token, [{ bytes: IMG(2), mime: "image/jpeg" }]);

  // X mints for q1 but never uploads → token stays 'pending'.
  const sX = await withBoard(P.id, (tx) => startSession(tx, { boardId: P.id, appUserId: userX, subTopicId: fx.subTopic }));
  const tokX1 = await withBoard(P.id, (tx) => mintUploadToken(tx, { boardId: P.id, appUserId: userX, sessionId: sX.sessionId, questionId: fx.q1 }));

  // ── resolveAnswerPhotoBytes (durable) ──
  const a1 = await call(() => resolveAnswerPhotoBytes({ imageId: imgId, boardSlug: P.slug, email: emailW }));
  check("A1 owner W → 200, bytes round-trip, mime image/png", a1.status === 200 && a1.bytes?.[0] === 137 && a1.bytes?.[4] === 1 && a1.mime === "image/png");
  const a2 = await call(() => resolveAnswerPhotoBytes({ imageId: imgId, boardSlug: P.slug, email: null }));
  check("A2 unauth → 401", a2.status === 401);
  const a3 = await call(() => resolveAnswerPhotoBytes({ imageId: imgId, boardSlug: P.slug, email: emailX }));
  check("A3 board-mate X (not owner) → 404 (no leak)", a3.status === 404);
  const a4 = await call(() => resolveAnswerPhotoBytes({ imageId: imgId, boardSlug: Q.slug, email: emailQ }));
  check("A4 cross-board (Q member, P image) → 404 (RLS)", a4.status === 404);
  const a5 = await call(() => resolveAnswerPhotoBytes({ imageId: "00000000-0000-0000-0000-000000000000", boardSlug: P.slug, email: emailW }));
  check("A5 unknown imageId (owner) → 404", a5.status === 404);

  // ── resolveTutorAnswerPhotoBytes (tutor recall panel) ──
  // A tutor T linked to student W may pull W's answer photo; the OWNER cannot use
  // this route (they use the owner one), a non-tutor/unlinked caller gets 404.
  const emailT = `apt-t-${tag}@example.com`;
  const T = await withBoard(P.id, (tx) => grantRole(tx, { email: emailT, name: "T", board: P, role: "tutor" }));
  await withBoard(P.id, (tx) => tx.insert(tutorStudent).values({ boardId: P.id, tutorId: T.user.id, studentId: userW }));
  const t1 = await call(() => resolveTutorAnswerPhotoBytes({ imageId: imgId, boardSlug: P.slug, email: emailT }));
  check("T1 linked tutor → 200, bytes round-trip", t1.status === 200 && t1.bytes?.[0] === 137 && t1.mime === "image/png");
  const t2 = await call(() => resolveTutorAnswerPhotoBytes({ imageId: imgId, boardSlug: P.slug, email: emailX }));
  check("T2 board-mate student (not a tutor) → 404", t2.status === 404);
  const t3 = await call(() => resolveTutorAnswerPhotoBytes({ imageId: imgId, boardSlug: P.slug, email: emailW }));
  check("T3 owner via tutor route (no self-link) → 404", t3.status === 404);
  const t4 = await call(() => resolveTutorAnswerPhotoBytes({ imageId: imgId, boardSlug: P.slug, email: null }));
  check("T4 unauth → 401", t4.status === 401);
  const t5 = await call(() => resolveTutorAnswerPhotoBytes({ imageId: imgId, boardSlug: Q.slug, email: emailQ }));
  check("T5 cross-board (Q member, P image) → 404 (RLS)", t5.status === 404);

  // ── resolveUploadPreviewBytes (transient) ──
  const p1 = await call(() => resolveUploadPreviewBytes({ token: tokW1.token, boardSlug: P.slug, email: emailW }));
  check("P1 owner W, CONSUMED token → 200 (still serves post-submit)", p1.status === 200 && p1.bytes?.[4] === 1);
  const p2 = await call(() => resolveUploadPreviewBytes({ token: tokW2.token, boardSlug: P.slug, email: emailW }));
  check("P2 owner W, UPLOADED token → 200, mime image/jpeg", p2.status === 200 && p2.bytes?.[4] === 2 && p2.mime === "image/jpeg");
  const p3 = await call(() => resolveUploadPreviewBytes({ token: tokW2.token, boardSlug: P.slug, email: null }));
  check("P3 unauth → 401", p3.status === 401);
  const p4 = await call(() => resolveUploadPreviewBytes({ token: tokW2.token, boardSlug: P.slug, email: emailX }));
  check("P4 board-mate X (not owner) → 404", p4.status === 404);
  const p5 = await call(() => resolveUploadPreviewBytes({ token: tokW2.token, boardSlug: Q.slug, email: emailW }));
  check("P5 board mismatch (owner, wrong board) → 404", p5.status === 404);
  const p6 = await call(() => resolveUploadPreviewBytes({ token: tokX1.token, boardSlug: P.slug, email: emailX }));
  check("P6 PENDING token (owner) → 404 (nothing uploaded)", p6.status === 404);

  // ── HTTP (soft, M30) ──
  try {
    const h1 = await fetch(`http://localhost:${env.PORT}/practice/answer-photo/${imgId}`);
    const h2 = await fetch(`http://localhost:${env.PORT}/practice/upload-preview/${tokW2.token}`);
    const h3 = await fetch(`http://localhost:${env.PORT}/practice/tutor-answer-photo/${imgId}`);
    if (h1.status === 404 || h2.status === 404 || h3.status === 404) {
      console.log("  ~ HTTP skipped (route 404 → server stale/down, M30 restart needed)");
    } else {
      check(`H1 GET /practice/answer-photo/:id unauth → 401 (got ${h1.status})`, h1.status === 401);
      check(`H2 GET /practice/upload-preview/:t unauth → 401 (got ${h2.status})`, h2.status === 401);
      check(`H3 GET /practice/tutor-answer-photo/:id unauth → 401 (got ${h3.status})`, h3.status === 401);
    }
  } catch {
    console.log("  ~ HTTP skipped (server not running)");
  }

  // ── cleanup (FK-safe order + stored bytes) ──
  const tokens = await db.select({ token: uploadToken.token }).from(uploadToken).where(eq(uploadToken.boardId, P.id));
  await withBoard(P.id, async (tx: Tx) => {
    await tx.delete(tutorStudent).where(eq(tutorStudent.boardId, P.id));
    await tx.delete(attemptImage).where(eq(attemptImage.boardId, P.id));
    await tx.delete(attempt).where(eq(attempt.boardId, P.id));
    await tx.delete(uploadToken).where(eq(uploadToken.boardId, P.id));
    await tx.delete(practiceSession).where(eq(practiceSession.boardId, P.id));
    await tx.delete(question).where(eq(question.boardId, P.id));
    await tx.delete(subTopic).where(eq(subTopic.boardId, P.id));
    await tx.delete(topic).where(eq(topic.boardId, P.id));
    await tx.delete(chapter).where(eq(chapter.boardId, P.id));
    await tx.delete(subject).where(eq(subject.boardId, P.id));
    await tx.delete(membership).where(eq(membership.boardId, P.id));
  });
  await withBoard(Q.id, async (tx: Tx) => {
    await tx.delete(membership).where(eq(membership.boardId, Q.id));
  });
  await db.delete(appUser).where(eq(appUser.email, emailW));
  await db.delete(appUser).where(eq(appUser.email, emailX));
  await db.delete(appUser).where(eq(appUser.email, emailT));
  await db.delete(appUser).where(eq(appUser.email, emailQ));
  await db.delete(board).where(eq(board.id, P.id));
  await db.delete(board).where(eq(board.id, Q.id));
  if (env.STORAGE_DRIVER === "fs") {
    for (const t of tokens) {
      await rm(resolve(env.UPLOADS_DIR, "uploads", t.token), { recursive: true, force: true }).catch(() => {});
    }
  }

  console.log(`\nprobe_answerphoto: ${passed} passed, ${failed} failed`);
  await queryClient.end();
  process.exit(failed === 0 ? 0 : 1);
}

main().catch(async (err) => {
  console.error("probe_answerphoto FAILED:", err);
  await queryClient.end();
  process.exit(1);
});
