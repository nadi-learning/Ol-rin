/**
 * probe_upload_capture — Slice Q3-1 exit gate (Cross-Device Upload, backend).
 *
 * Proves the whole token lifecycle against the real DB + RLS + fs object store,
 * driving the REAL flow non-seeded (M11): mint → phone upload → poll → submit.
 * Throwaway boards P/Q (M22); cleans up rows + stored bytes.
 *
 *   1. DB connectivity.
 *   2. mint → token pending, bound to (user, session, question), future expiry.
 *   3. mint idempotent → same token for the same slot.
 *   4. mint guards: foreign session · question-not-in-session → UPLOAD_SLOT_INVALID.
 *   5. phone view: getUploadTokenForPhone → stem present, status pending, and
 *      M11 — NO reference_answer / key text in the phone payload.
 *   6. phone upload → status uploaded, 2 keys, and the BYTES are really stored
 *      (getObject round-trips them).
 *   7. upload guards: non-image → NOT_AN_IMAGE · re-upload → ALREADY_UPLOADED ·
 *      unknown token → TOKEN_NOT_FOUND · expired token → TOKEN_EXPIRED.
 *   8. poll: getUploadStatus → uploaded, photoCount 2.
 *   9. submit → attempt PERSISTS (answer_text NULL, confidence, time_ms), and
 *      2 attempt_image rows persist (keys/mime/ordinal), token → consumed, the
 *      reveal returns the reference answer, index advances.
 *  10. single-use: a second submit with the consumed token → UPLOAD_NOT_READY.
 *  11. Stage-1 is NOT enqueued for a photo answer (Q3-1 staging — answer_text
 *      null): the attempt has no answer_text (Q3-2 wires vision).
 *  12. cross-board: consuming a P token under a Q claim → session NOT_FOUND.
 *  13. ownership: bystander X cannot mint for W's session → UPLOAD_SLOT_INVALID.
 *  14. HTTP (real unauth routes, soft): GET /upload/:token → 200 + stem;
 *      POST /upload/:token multipart → 200; unknown → 404.
 */
import { and, eq, sql } from "drizzle-orm";
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
  uploadToken,
} from "@b2c/kernel/schema";
import { db, queryClient } from "../src/db/client";
import { withBoard } from "../src/db/with-board";
import {
  PracticeSessionNotFoundError,
  startSession,
  submitPhotoAttempt,
} from "../src/services/practice";
import {
  consumeUploadToken,
  getUploadStatus,
  getUploadTokenForPhone,
  mintUploadToken,
  recordPhoneUpload,
  UploadError,
  UploadNotReadyError,
  UploadSlotInvalidError,
} from "../src/services/upload";
import { getObject } from "../src/services/object_storage";
import { grantRole } from "../src/services/membership";
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

const IMG = (b: number) => new Uint8Array([137, 80, 78, 71, b]); // arbitrary bytes; mime is what matters for Q3-1

async function main() {
  const tag = `${Date.now()}`;

  await db.execute(sql`select 1`);
  check("DB connectivity (select 1) as app role", true);

  const [P] = await db.insert(board).values({ slug: `q3-p-${tag}`, name: "Probe P" }).returning();
  const [Q] = await db.insert(board).values({ slug: `q3-q-${tag}`, name: "Probe Q" }).returning();
  if (!P || !Q) throw new Error("board seed failed");

  const fx = await withBoard(P.id, async (tx: Tx) => {
    const [subj] = await tx.insert(subject).values({ boardId: P.id, slug: "phys", name: "Physics", grade: "IGCSE" }).returning();
    const [chap] = await tx.insert(chapter).values({ boardId: P.id, subjectId: subj!.id, slug: "ch", name: "Ch", ordinal: 1 }).returning();
    const [tp] = await tx.insert(topic).values({ boardId: P.id, chapterId: chap!.id, slug: "tp", name: "Tp", ordinal: 1 }).returning();
    const [st] = await tx.insert(subTopic).values({ boardId: P.id, topicId: tp!.id, slug: "st", name: "ST", ordinal: 1 }).returning();
    const [q1] = await tx.insert(question).values({ boardId: P.id, subTopicId: st!.id, axis: "conceptual", kind: "subjective", stem: "Balance the equation", referenceAnswer: "REF_SECRET_A1", explanation: "EXPL_SECRET", pedagogicalNote: "NOTE_SECRET", ordinal: 1, source: "b2c_authoring" }).returning();
    const [q2] = await tx.insert(question).values({ boardId: P.id, subTopicId: st!.id, axis: "procedural", kind: "subjective", stem: "Q2 stem", referenceAnswer: "REF_A2", explanation: "EXPL_A2", pedagogicalNote: "NOTE_A2", ordinal: 2, source: "b2c_authoring" }).returning();
    return { subTopic: st!.id, q1: q1!.id, q2: q2!.id };
  });

  const emailW = `q3-w-${tag}@example.com`;
  const emailX = `q3-x-${tag}@example.com`;
  const W = await withBoard(P.id, (tx) => grantRole(tx, { email: emailW, name: "W", board: P, role: "student" }));
  const X = await withBoard(P.id, (tx) => grantRole(tx, { email: emailX, name: "X", board: P, role: "student" }));
  const userW = W.user.id;
  const userX = X.user.id;

  // session for W → q1 is current
  const s1 = await withBoard(P.id, (tx) => startSession(tx, { boardId: P.id, appUserId: userW, subTopicId: fx.subTopic }));
  const sessionId = s1.sessionId;

  // 2. mint
  const mint = await withBoard(P.id, (tx) => mintUploadToken(tx, { boardId: P.id, appUserId: userW, sessionId, questionId: fx.q1 }));
  check("mint → token issued (32-hex)", /^[0-9a-f]{32}$/.test(mint.token));
  check("mint → expiry in the future", mint.expiresAt.getTime() > Date.now());
  const [tokRow] = await db.select().from(uploadToken).where(eq(uploadToken.token, mint.token)).limit(1);
  check("mint → row is pending, bound to (user, session, question), carries board", tokRow?.status === "pending" && tokRow?.appUserId === userW && tokRow?.practiceSessionId === sessionId && tokRow?.questionId === fx.q1 && tokRow?.boardId === P.id);

  // 3. idempotent
  const mint2 = await withBoard(P.id, (tx) => mintUploadToken(tx, { boardId: P.id, appUserId: userW, sessionId, questionId: fx.q1 }));
  check("mint idempotent → same token for the same slot", mint2.token === mint.token);
  const allForSlot = await db.select().from(uploadToken).where(and(eq(uploadToken.practiceSessionId, sessionId), eq(uploadToken.questionId, fx.q1)));
  check("mint idempotent → no duplicate token row", allForSlot.length === 1);

  // 4. mint guards
  let foreignSession = false;
  try {
    await withBoard(P.id, (tx) => mintUploadToken(tx, { boardId: P.id, appUserId: userX, sessionId, questionId: fx.q1 }));
  } catch (e) { foreignSession = e instanceof UploadSlotInvalidError; }
  check("mint for another user's session → UPLOAD_SLOT_INVALID", foreignSession);

  let qNotInSession = false;
  const sX = await withBoard(P.id, (tx) => startSession(tx, { boardId: P.id, appUserId: userX, subTopicId: fx.subTopic }));
  try {
    // a random uuid that isn't in the session
    await withBoard(P.id, (tx) => mintUploadToken(tx, { boardId: P.id, appUserId: userX, sessionId: sX.sessionId, questionId: "00000000-0000-0000-0000-000000000000" }));
  } catch (e) { qNotInSession = e instanceof UploadSlotInvalidError; }
  check("mint for a question not in the session → UPLOAD_SLOT_INVALID", qNotInSession);

  // 5. phone view (unauth) — stem present, NO answer key leaked
  const view = await getUploadTokenForPhone(mint.token);
  check("phone view → status pending + question stem shown", view.status === "pending" && view.stem === "Balance the equation");
  check("phone view → M11: no reference/answer-key text in payload", !/REF_SECRET|EXPL_SECRET|NOTE_SECRET/.test(JSON.stringify(view)));

  // 6. phone upload
  const up = await recordPhoneUpload(mint.token, [
    { bytes: IMG(1), mime: "image/png" },
    { bytes: IMG(2), mime: "image/jpeg" },
  ]);
  check("phone upload → 2 photos accepted", up.photoCount === 2);
  const [afterUp] = await db.select().from(uploadToken).where(eq(uploadToken.token, mint.token)).limit(1);
  check("phone upload → token status uploaded, 2 keys, uploadedAt set", afterUp?.status === "uploaded" && afterUp?.uploadKeys.length === 2 && afterUp?.uploadedAt !== null);
  const storedBytes = await getObject(afterUp!.uploadKeys[0]!);
  check("phone upload → bytes really stored (object store round-trips)", storedBytes[0] === 137 && storedBytes[4] === 1);

  // 7. upload guards
  let reUpload = false;
  try { await recordPhoneUpload(mint.token, [{ bytes: IMG(9), mime: "image/png" }]); }
  catch (e) { reUpload = e instanceof UploadError && e.code === "ALREADY_UPLOADED"; }
  check("re-upload an uploaded token → ALREADY_UPLOADED (409)", reUpload);

  // fresh token to test the non-image + unknown + expired guards
  const mintG = await withBoard(P.id, (tx) => mintUploadToken(tx, { boardId: P.id, appUserId: userW, sessionId, questionId: fx.q2 }));
  let notImage = false;
  try { await recordPhoneUpload(mintG.token, [{ bytes: IMG(1), mime: "application/pdf" }]); }
  catch (e) { notImage = e instanceof UploadError && e.code === "NOT_AN_IMAGE"; }
  check("upload a non-image part → NOT_AN_IMAGE (415)", notImage);

  let unknown = false;
  try { await getUploadTokenForPhone("deadbeef".repeat(4)); }
  catch (e) { unknown = e instanceof UploadError && e.code === "TOKEN_NOT_FOUND"; }
  check("unknown token → TOKEN_NOT_FOUND (404)", unknown);

  // expired: insert a token with past expiry directly. Bind it to X's slot (NOT
  // W's q1 slot) so it can't shadow W's poll below (getUploadStatus = latest for
  // the slot; real usage never has two tokens per slot — mint is idempotent).
  const expiredTok = `expired${tag}`.padEnd(32, "0").slice(0, 32);
  await db.insert(uploadToken).values({ token: expiredTok, boardId: P.id, appUserId: userX, practiceSessionId: sX.sessionId, questionId: fx.q1, status: "pending", expiresAt: new Date(Date.now() - 1000) });
  let expired = false;
  try { await getUploadTokenForPhone(expiredTok); }
  catch (e) { expired = e instanceof UploadError && e.code === "TOKEN_EXPIRED"; }
  check("expired token → TOKEN_EXPIRED (410)", expired);

  // 8. poll
  const status = await withBoard(P.id, (tx) => getUploadStatus(tx, { sessionId, questionId: fx.q1, appUserId: userW }));
  check("poll getUploadStatus → uploaded, photoCount 2, token matches", status.status === "uploaded" && status.photoCount === 2 && status.token === mint.token);

  // 8b. TOKEN-SCOPED poll (regression for the StrictMode double-mint bug). Two
  // pending tokens can exist for one slot (dev double-effect / a re-mint); the
  // phone uploaded to mint.token but a NEWER sibling is still pending. A poll that
  // keys off the exact QR token must report THAT token's 'uploaded' status — while
  // the legacy "newest for slot" poll would wrongly report the sibling's 'pending'.
  const sibling = await withBoard(P.id, (tx) => mintUploadToken(tx, { boardId: P.id, appUserId: userW, sessionId, questionId: fx.q1 }));
  check("double-mint made a distinct newer sibling token", sibling.token !== mint.token);
  const byToken = await withBoard(P.id, (tx) => getUploadStatus(tx, { sessionId, questionId: fx.q1, appUserId: userW, token: mint.token }));
  check("poll WITH token=QR token → uploaded (not stranded on the sibling)", byToken.status === "uploaded" && byToken.token === mint.token);
  const bySlot = await withBoard(P.id, (tx) => getUploadStatus(tx, { sessionId, questionId: fx.q1, appUserId: userW }));
  check("poll WITHOUT token → newest sibling (pending) — the exact bug the token guards against", bySlot.status === "pending" && bySlot.token === sibling.token);

  // 9. submit → attempt + attempt_image persist, token consumed, reveal
  const res = await withBoard(P.id, (tx) => submitPhotoAttempt(tx, { boardId: P.id, appUserId: userW, sessionId, questionId: fx.q1, uploadToken: mint.token, confidence: 3, timeMs: 45000 }));
  check("submit → reveal returns reference answer (post-submit)", res.reveal.referenceAnswer === "REF_SECRET_A1");
  check("submit → advances to index 1", res.currentIndex === 1 && res.completed === false);

  const atts = await withBoard(P.id, (tx) => tx.select().from(attempt).where(eq(attempt.practiceSessionId, sessionId)));
  const photoAtt = atts.find((a: any) => a.questionId === fx.q1);
  check("submit → attempt PERSISTED with NULL answer_text + confidence + time_ms", photoAtt?.answerText === null && photoAtt?.confidence === 3 && photoAtt?.timeMs === 45000 && photoAtt?.skipReason === null);

  const imgs = await withBoard(P.id, (tx) => tx.select().from(attemptImage).where(eq(attemptImage.attemptId, photoAtt!.id)));
  const ordinals = imgs.map((r: any) => r.ordinal).sort();
  check("submit → 2 attempt_image rows persisted, ordinals 0,1", imgs.length === 2 && ordinals[0] === 0 && ordinals[1] === 1);
  check("submit → attempt_image carries storage_key + mime + board", imgs.every((r: any) => r.storageKey.startsWith(`uploads/${mint.token}/`) && r.boardId === P.id) && imgs.some((r: any) => r.mime === "image/png") && imgs.some((r: any) => r.mime === "image/jpeg"));

  const [consumedTok] = await db.select().from(uploadToken).where(eq(uploadToken.token, mint.token)).limit(1);
  check("submit → token flipped to consumed, consumedAt set", consumedTok?.status === "consumed" && consumedTok?.consumedAt !== null);

  // 11. Stage-1 staging: a photo answer has no answer_text → not text-scored (Q3-2 wires vision)
  check("Q3-1 staging → photo attempt has no answer_text (Stage-1 vision is Q3-2)", photoAtt?.answerText === null);

  // 10. single-use: consuming an uploaded token flips it to consumed; a SECOND
  // consume of the same token throws (defense in depth, isolated from the
  // session-advance guard — through submit, the question wouldn't be current on a
  // retry, so this tests the token guard directly). Uses X's q1 slot (already
  // uploaded above? no — mint+upload a fresh one for X).
  const sU = await withBoard(P.id, (tx) => startSession(tx, { boardId: P.id, appUserId: userX, subTopicId: fx.subTopic }));
  const mintU = await withBoard(P.id, (tx) => mintUploadToken(tx, { boardId: P.id, appUserId: userX, sessionId: sU.sessionId, questionId: fx.q1 }));
  await recordPhoneUpload(mintU.token, [{ bytes: IMG(5), mime: "image/png" }]);
  const firstConsume = await withBoard(P.id, (tx) => consumeUploadToken(tx, { token: mintU.token, sessionId: sU.sessionId, questionId: fx.q1, appUserId: userX }));
  check("consume → returns the uploaded photos (1)", firstConsume.length === 1 && firstConsume[0]!.mime === "image/png");
  let consumedReuse = false;
  try {
    await withBoard(P.id, (tx) => consumeUploadToken(tx, { token: mintU.token, sessionId: sU.sessionId, questionId: fx.q1, appUserId: userX }));
  } catch (e) { consumedReuse = e instanceof UploadNotReadyError; }
  check("second consume of a consumed token → UPLOAD_NOT_READY (single-use)", consumedReuse);

  // consume with a mismatched slot (right token, wrong question) → UPLOAD_NOT_READY
  const mintM = await withBoard(P.id, (tx) => mintUploadToken(tx, { boardId: P.id, appUserId: userW, sessionId, questionId: fx.q2 }));
  await recordPhoneUpload(mintM.token, [{ bytes: IMG(8), mime: "image/png" }]);
  let slotMismatch = false;
  try {
    await withBoard(P.id, (tx) => consumeUploadToken(tx, { token: mintM.token, sessionId, questionId: fx.q1, appUserId: userW }));
  } catch (e) { slotMismatch = e instanceof UploadNotReadyError; }
  check("consume a token against the wrong question slot → UPLOAD_NOT_READY", slotMismatch);

  // 12. cross-board: submitting a P-board token under a Q claim → the P session
  // is invisible under Q's RLS claim (session guard fires before the token is
  // touched). Reuse mintM (still 'uploaded' — the slot-mismatch consume threw
  // before flipping it).
  let crossBoard = false;
  try {
    await withBoard(Q.id, (tx) => submitPhotoAttempt(tx, { boardId: Q.id, appUserId: userW, sessionId, questionId: fx.q2, uploadToken: mintM.token, confidence: 2, timeMs: 100 }));
  } catch (e) { crossBoard = e instanceof PracticeSessionNotFoundError; }
  check("cross-board: consume a P token under a Q claim → session NOT_FOUND (RLS)", crossBoard);

  // 14. HTTP (soft) — the REAL unauth phone routes
  const httpTok = await withBoard(P.id, (tx) => mintUploadToken(tx, { boardId: P.id, appUserId: userW, sessionId, questionId: fx.q1 }));
  try {
    const g = await fetch(`http://localhost:${env.PORT}/upload/${httpTok.token}`);
    if (g.status === 404) {
      console.log("  ~ HTTP /upload skipped (route 404 → server stale/down, M30 restart needed)");
    } else {
      const body = (await g.json()) as any;
      check(`HTTP GET /upload/:token → 200 (got ${g.status})`, g.status === 200);
      check("HTTP GET → returns the question stem, no key text", body.stem === "Balance the equation" && !/REF_SECRET|EXPL_SECRET|NOTE_SECRET/.test(JSON.stringify(body)));

      const fd = new FormData();
      fd.append("answer_image", new File([IMG(3)], "a.png", { type: "image/png" }));
      fd.append("answer_image", new File([IMG(4)], "b.jpg", { type: "image/jpeg" }));
      const p = await fetch(`http://localhost:${env.PORT}/upload/${httpTok.token}`, { method: "POST", body: fd });
      const pbody = (await p.json()) as any;
      check(`HTTP POST /upload/:token multipart → 200, 2 photos (got ${p.status})`, p.status === 200 && pbody.photoCount === 2);

      const unk = await fetch(`http://localhost:${env.PORT}/upload/${"0".repeat(32)}`);
      check(`HTTP GET unknown token → 404 (got ${unk.status})`, unk.status === 404);
    }
  } catch {
    console.log("  ~ HTTP /upload skipped (server not running)");
  }

  // ── cleanup (FK-safe order + stored bytes) ──
  const tokens = await withBoard(P.id, (tx) => tx.select({ token: uploadToken.token }).from(uploadToken).where(eq(uploadToken.boardId, P.id)));
  await withBoard(P.id, async (tx: Tx) => {
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
  await db.delete(appUser).where(eq(appUser.email, emailW));
  await db.delete(appUser).where(eq(appUser.email, emailX));
  await db.delete(board).where(eq(board.id, P.id));
  await db.delete(board).where(eq(board.id, Q.id));
  // stored bytes (fs driver only — S3 objects would be cleaned separately)
  if (env.STORAGE_DRIVER === "fs") {
    for (const t of tokens) {
      await rm(resolve(env.UPLOADS_DIR, "uploads", t.token), { recursive: true, force: true }).catch(() => {});
    }
  }

  console.log(`\nprobe_upload_capture: ${passed} passed, ${failed} failed`);
  await queryClient.end();
  process.exit(failed === 0 ? 0 : 1);
}

main().catch(async (err) => {
  console.error("probe_upload_capture FAILED:", err);
  await queryClient.end();
  process.exit(1);
});
