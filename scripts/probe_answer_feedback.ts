/**
 * probe_answer_feedback — Slice T1 exit gate (immediate subjective-answer
 * feedback at submit). REAL Gemini + real DB + real RLS, throwaway fixture
 * (boards T/U, unique per run — M22), cleans up after itself.
 *
 * FIRM (deterministic plumbing + the boundaries that must hold):
 *   1. DB connectivity as the app role.
 *   2. getAnswerFeedback on a typed attempt → well-formed AnswerFeedback:
 *      verdict ∈ {strong,partial,off_track}, non-empty feedback, arrays present.
 *   3. MARKS (Fork B reversed 2026-07-15): marksAwarded/marksMax are integers,
 *      1 ≤ max, 0 ≤ awarded ≤ max; a stem with declared "[n marks]" parts gets
 *      marksMax = their SUM exactly (the deterministic anchor overrides the AI);
 *      declaredMarksTotal parses/sums correctly (pure, no AI).
 *   4. PERSISTED: attempt.feedback jsonb set with verdict/feedback + model + ts.
 *   5. IDEMPOTENT (D-T1-3): a second call returns the byte-identical cached read
 *      (proves it did NOT re-call Gemini).
 *   6. NOT_EVALUABLE: a skip attempt (no answer) → NotEvaluableError.
 *   6c. PHOTO answer (widened 2026-07-18, founder call): the REAL Q3 flow — a
 *      pyrender "handwritten" PNG → mint → phone upload → submitPhotoAttempt →
 *      getAnswerFeedback reads the photo via Gemini VISION (no NotEvaluable):
 *      well-formed read, declared-marks anchor holds, persisted with photoCount
 *      forensics, idempotent cached. Needs pyrender UP (same bar as probe:vision).
 *   7. ownership (D-L-5): a bystander on the SAME board → ATTEMPT_NOT_FOUND.
 *   8. cross-board RLS: the attempt under another board claim → ATTEMPT_NOT_FOUND.
 *   9. HTTP: practice.getAnswerFeedback unauth → 401 (soft; new route needs a
 *      server restart, M30 — skipped if the live server is stale/down).
 *
 * SOFT (don't over-read one AI response): the exact verdict is logged, with a
 * light directional nudge (a strong on-reference answer should not read
 * off_track) — a WARN, never a failure. The vision OCR read is held to the same
 * bar: plumbing FIRM, the model's judgement SOFT.
 */
import { eq, sql } from "drizzle-orm";
import type { PgTransaction } from "drizzle-orm/pg-core";
import {
  appUser,
  attempt,
  attemptImage,
  board,
  chapter,
  membership,
  observation,
  practiceSession,
  question,
  subTopic,
  subject,
  topic,
  uploadToken,
  whitelist,
} from "@b2c/kernel/schema";
import { db, queryClient } from "../src/db/client";
import { withBoard } from "../src/db/with-board";
import { pyrenderHealth, renderScript } from "../src/services/matplotlib";
import { startSession, submitAttempt, skip, submitPhotoAttempt } from "../src/services/practice";
import { mintUploadToken, recordPhoneUpload } from "../src/services/upload";
import {
  AttemptFeedbackNotFoundError,
  declaredMarksTotal,
  getAnswerFeedback,
  NotEvaluableError,
} from "../src/services/answer_feedback";
import { resolveMembership } from "../src/services/membership";
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

function isPng(b: Uint8Array): boolean {
  return b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47;
}

// A legible "handwritten" answer PNG via pyrender (the probe_vision_scoring
// proxy: printed text verifies the vision PLUMBING; true-handwriting OCR is SOFT).
function answerScript(lines: string[]): string {
  const body = lines
    .map((t, n) => `ax.text(0.04, ${(0.9 - n * 0.13).toFixed(2)}, ${JSON.stringify(t)}, fontsize=19, va="top")`)
    .join("\n");
  return `import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
fig, ax = plt.subplots(figsize=(6.5, 4.5))
ax.axis("off")
${body}
plt.savefig("out.png", dpi=150)`;
}

async function main() {
  if (!(await pyrenderHealth())) {
    console.error(
      "nadi-pyrender is DOWN (the photo-feedback leg needs it) — start it first:\n" +
        "  (cd /Users/mab/Desktop/nadi/nadi-pyrender && .venv/bin/python -m uvicorn server:app --host 127.0.0.1 --port 8002)",
    );
    await queryClient.end();
    process.exit(1);
  }
  const tag = `${Date.now()}`;

  // 1. connectivity
  await db.execute(sql`select 1`);
  check("DB connectivity (select 1) as app role", true);

  const [T] = await db.insert(board).values({ slug: `t1-t-${tag}`, name: "Probe T" }).returning();
  const [U] = await db.insert(board).values({ slug: `t1-u-${tag}`, name: "Probe U" }).returning();
  if (!T || !U) throw new Error("board seed failed");

  // Fixture under T: spine + 2 questions with REAL reference answers (grader
  // context the eval reads). q1 = the answered one; q2 = skipped.
  const fx = await withBoard(T.id, async (tx: Tx) => {
    const [subj] = await tx.insert(subject).values({ boardId: T.id, slug: "phys", name: "Physics", grade: "IGCSE" }).returning();
    const [chap] = await tx.insert(chapter).values({ boardId: T.id, subjectId: subj!.id, slug: "ch", name: "Motion", ordinal: 1 }).returning();
    const [tp] = await tx.insert(topic).values({ boardId: T.id, chapterId: chap!.id, slug: "tp", name: "Projectiles", ordinal: 1 }).returning();
    const [st] = await tx.insert(subTopic).values({ boardId: T.id, topicId: tp!.id, slug: "st", name: "Vertical motion", ordinal: 1 }).returning();
    const [q1] = await tx.insert(question).values({
      boardId: T.id, subTopicId: st!.id, axis: "conceptual", kind: "subjective",
      stem: "A ball is thrown straight up. Explain why it momentarily stops at the top of its path before falling back down.",
      referenceAnswer: "As the ball rises, gravity acts downward and decelerates it, so its velocity keeps decreasing. At the highest point the velocity is momentarily zero. Gravity is still acting (the acceleration is non-zero and downward the whole time), so the ball immediately begins to accelerate back downward.",
      explanation: "Key idea: velocity = 0 at the top, but acceleration due to gravity is unchanged, so the ball does not stay at rest.",
      pedagogicalNote: "Probes whether the student separates velocity (momentarily zero) from acceleration (constant).",
      ordinal: 1, source: "b2c_authoring",
    }).returning();
    const [q2] = await tx.insert(question).values({
      boardId: T.id, subTopicId: st!.id, axis: "conceptual", kind: "subjective",
      stem: "State the acceleration of a freely-falling object near Earth's surface.",
      referenceAnswer: "About 9.8 m/s^2 directed downward.",
      explanation: null, pedagogicalNote: null, ordinal: 2, source: "b2c_authoring",
    }).returning();
    // q3: S82 exam-format stem with DECLARED marks — the anchor leg. Sum = 5.
    const [q3] = await tx.insert(question).values({
      boardId: T.id, subTopicId: st!.id, axis: "conceptual", kind: "subjective",
      stem: "A ball is thrown straight up.\n(a) State its velocity at the highest point. [2 marks]\n(b) Explain why its acceleration at that instant is NOT zero. [3 marks]",
      referenceAnswer: "(a) Zero. [2 marks]\n(b) Gravity acts on the ball throughout the flight, so the acceleration stays 9.8 m/s^2 downward even at the instant the velocity is zero. [3 marks]",
      explanation: null, pedagogicalNote: null, ordinal: 3, source: "b2c_authoring",
    }).returning();
    // q4: the PHOTO-answered question (6c) — procedural with declared marks so
    // the deterministic anchor is FIRM even on a vision read. Sum = 2.
    const [q4] = await tx.insert(question).values({
      boardId: T.id, subTopicId: st!.id, axis: "procedural", kind: "subjective",
      stem: "A block has mass 240 g and volume 30 cm³. Calculate its density, showing your working. [2 marks]",
      referenceAnswer: "density = mass / volume = 240 g / 30 cm³ = 8 g/cm³. [2 marks]",
      explanation: null, pedagogicalNote: null, ordinal: 4, source: "b2c_authoring",
    }).returning();
    return { subTopic: st!.id, q1: q1!.id, q2: q2!.id, q3: q3!.id, q4: q4!.id };
  });

  // two members on T: owner W + bystander X (REAL flow, M11)
  const emailW = `t1-w-${tag}@example.com`;
  const emailX = `t1-x-${tag}@example.com`;
  await withBoard(T.id, async (tx: Tx) => {
    await tx.insert(whitelist).values({ boardId: T.id, email: emailW, role: "student" });
    await tx.insert(whitelist).values({ boardId: T.id, email: emailX, role: "student" });
  });
  const W = await withBoard(T.id, (tx) => resolveMembership(tx, { email: emailW, name: "W", board: T }));
  const X = await withBoard(T.id, (tx) => resolveMembership(tx, { email: emailX, name: "X", board: T }));
  const userW = W.user.id;
  const userX = X.user.id;

  // Start a session + submit a STRONG typed answer to q1 → get the attemptId.
  const s1 = await withBoard(T.id, (tx) => startSession(tx, { boardId: T.id, appUserId: userW, subTopicId: fx.subTopic }));
  const strongAnswer =
    "Gravity pulls the ball downward the whole time, so as it goes up it keeps slowing down until its speed reaches zero at the very top. At that instant its velocity is zero, but the acceleration from gravity is still acting downward and hasn't changed, so the ball immediately starts to speed up again on the way down.";
  const r1 = await withBoard(T.id, (tx) => submitAttempt(tx, {
    boardId: T.id, appUserId: userW, sessionId: s1.sessionId, questionId: fx.q1,
    answerText: strongAnswer, confidence: 4, timeMs: 45000,
  }));
  check("submitAttempt returns an attemptId (T1 wiring)", typeof r1.attemptId === "string" && r1.attemptId.length > 0);

  // 2. getAnswerFeedback — REAL Gemini
  const fb1 = await withBoard(T.id, (tx) => getAnswerFeedback(tx, { appUserId: userW, attemptId: r1.attemptId }));
  check("feedback verdict ∈ {strong,partial,off_track}", ["strong", "partial", "off_track"].includes(fb1.verdict));
  check("feedback prose is non-empty", typeof fb1.feedback === "string" && fb1.feedback.trim().length > 0);
  check("strengths + improvements are arrays", Array.isArray(fb1.strengths) && Array.isArray(fb1.improvements));
  console.log(`    → verdict=${fb1.verdict} | ${fb1.feedback.slice(0, 120)}…`);
  // SOFT directional (WARN only): a strong on-reference answer shouldn't read off_track.
  if (fb1.verdict === "off_track") {
    console.warn("    ~ SOFT: strong on-reference answer scored off_track — review the prompt (not a failure)");
  }

  // 3. MARKS (Fork B reversed) — a real score rides along.
  check("marksMax is an integer ≥ 1",
    Number.isInteger(fb1.marksMax) && (fb1.marksMax as number) >= 1);
  check("marksAwarded is an integer in 0..marksMax",
    Number.isInteger(fb1.marksAwarded) &&
    (fb1.marksAwarded as number) >= 0 &&
    (fb1.marksAwarded as number) <= (fb1.marksMax as number));
  console.log(`    → score ${fb1.marksAwarded}/${fb1.marksMax}`);
  check("returned feedback keys are exactly {verdict,feedback,strengths,improvements,marksAwarded,marksMax}",
    JSON.stringify(Object.keys(fb1).sort()) ===
    JSON.stringify(["feedback", "improvements", "marksAwarded", "marksMax", "strengths", "verdict"]));

  // 3b. declaredMarksTotal — pure parser (no AI).
  check("declaredMarksTotal sums multi-part [n marks] tags",
    declaredMarksTotal("(a) State X. [2 marks]\n(b) Explain Y. [3 marks]") === 5);
  check("declaredMarksTotal handles [1 mark] singular + spacing",
    declaredMarksTotal("Define Z. [ 1 mark ]") === 1);
  check("declaredMarksTotal → null when the stem declares none",
    declaredMarksTotal("Explain why the sky is blue.") === null);

  // 4. PERSISTED on attempt.feedback
  const [row] = await withBoard(T.id, (tx) => tx.select().from(attempt).where(eq(attempt.id, r1.attemptId)));
  const stored = row?.feedback as any;
  check("attempt.feedback jsonb PERSISTED", stored != null && stored.verdict === fb1.verdict && stored.feedback === fb1.feedback);
  check("stored feedback carries forensics meta (model + generatedAt)",
    typeof stored?.model === "string" && typeof stored?.generatedAt === "string");

  // 5. IDEMPOTENT — second call returns the byte-identical cached read (no re-spend).
  const fb2 = await withBoard(T.id, (tx) => getAnswerFeedback(tx, { appUserId: userW, attemptId: r1.attemptId }));
  check("second call returns the CACHED read (byte-identical → no re-call)",
    JSON.stringify(fb1) === JSON.stringify(fb2));

  // 6. NOT_EVALUABLE — a skip has no answer to read.
  const r2 = await withBoard(T.id, (tx) => skip(tx, { boardId: T.id, appUserId: userW, sessionId: s1.sessionId, questionId: fx.q2, reason: "unsure" }));
  let notEvaluable = false;
  try {
    await withBoard(T.id, (tx) => getAnswerFeedback(tx, { appUserId: userW, attemptId: r2.attemptId }));
  } catch (e) {
    notEvaluable = e instanceof NotEvaluableError;
  }
  check("getAnswerFeedback on a skip attempt → NotEvaluableError", notEvaluable);

  // 6b. STEM ANCHOR — after the q2 skip, q3 (declared "[2 marks]"+"[3 marks]")
  // is current in the SAME session: its marksMax must be EXACTLY the sum, 5.
  const r3 = await withBoard(T.id, (tx) => submitAttempt(tx, {
    boardId: T.id, appUserId: userW, sessionId: s1.sessionId, questionId: fx.q3,
    answerText: "(a) Zero.\n(b) The acceleration is 9.8 m/s^2 downward, unchanged, because gravity keeps acting on the ball even when its velocity is momentarily zero.",
    confidence: 3, timeMs: 30000,
  }));
  const fb3 = await withBoard(T.id, (tx) => getAnswerFeedback(tx, { appUserId: userW, attemptId: r3.attemptId }));
  check(`declared-marks stem → marksMax EXACTLY the declared sum 5 (got ${fb3.marksMax})`, fb3.marksMax === 5);
  check("declared-marks stem → awarded within 0..5",
    Number.isInteger(fb3.marksAwarded) && (fb3.marksAwarded as number) >= 0 && (fb3.marksAwarded as number) <= 5);
  console.log(`    → anchored score ${fb3.marksAwarded}/${fb3.marksMax}`);

  // 6c. PHOTO answer (widened 2026-07-18) — the REAL Q3 flow, then feedback
  // reads the photo via vision. q4 is current after the q3 submit.
  const png = await renderScript({
    script: answerScript([
      "Density",
      "density = mass / volume",
      "= 240 g / 30 cm3",
      "= 8 g/cm3",
    ]),
  });
  check("pyrender → a valid PNG for the photo answer (magic header, >1KB)", isPng(png) && png.length > 1024);
  const mint = await withBoard(T.id, (tx: Tx) =>
    mintUploadToken(tx, { boardId: T.id, appUserId: userW, sessionId: s1.sessionId, questionId: fx.q4 }),
  );
  await recordPhoneUpload(mint.token, [{ bytes: png, mime: "image/png" }]);
  const r4 = await withBoard(T.id, (tx) => submitPhotoAttempt(tx, {
    boardId: T.id, appUserId: userW, sessionId: s1.sessionId, questionId: fx.q4,
    uploadToken: mint.token, confidence: 4, timeMs: 60000,
  }));
  check("photo attempt persisted (answer IS the photos — attempt_image linked)",
    typeof r4.attemptId === "string" && r4.photoImageIds.length >= 1);

  const fb4 = await withBoard(T.id, (tx) => getAnswerFeedback(tx, { appUserId: userW, attemptId: r4.attemptId }));
  check("PHOTO attempt is EVALUABLE — vision read returns a well-formed AnswerFeedback",
    ["strong", "partial", "off_track"].includes(fb4.verdict) &&
    typeof fb4.feedback === "string" && fb4.feedback.trim().length > 0);
  check(`photo read: declared-marks anchor holds ([2 marks] → marksMax 2, got ${fb4.marksMax})`,
    fb4.marksMax === 2);
  check("photo read: awarded within 0..2",
    Number.isInteger(fb4.marksAwarded) && (fb4.marksAwarded as number) >= 0 && (fb4.marksAwarded as number) <= 2);
  console.log(`    → photo verdict=${fb4.verdict} | score ${fb4.marksAwarded}/${fb4.marksMax} | ${fb4.feedback.slice(0, 120)}…`);
  // SOFT directional (WARN only): a correct on-reference worked answer shouldn't read off_track.
  if (fb4.verdict === "off_track") {
    console.warn("    ~ SOFT: correct on-reference photo answer scored off_track — review the vision read (not a failure)");
  }

  const [row4] = await withBoard(T.id, (tx) => tx.select().from(attempt).where(eq(attempt.id, r4.attemptId)));
  check("photo feedback PERSISTED with photoCount forensics",
    (row4?.feedback as any)?.verdict === fb4.verdict && (row4?.feedback as any)?.photoCount >= 1);
  const fb4b = await withBoard(T.id, (tx) => getAnswerFeedback(tx, { appUserId: userW, attemptId: r4.attemptId }));
  check("photo second call returns the CACHED read (byte-identical → no re-call)",
    JSON.stringify(fb4) === JSON.stringify(fb4b));

  // 7. ownership — bystander X cannot read W's attempt feedback.
  let notOwned = false;
  try {
    await withBoard(T.id, (tx) => getAnswerFeedback(tx, { appUserId: userX, attemptId: r1.attemptId }));
  } catch (e) {
    notOwned = e instanceof AttemptFeedbackNotFoundError;
  }
  check("another user (same board) → AttemptFeedbackNotFoundError", notOwned);

  // 8. cross-board RLS — W's attempt invisible under a U claim.
  let crossBoard = false;
  try {
    await withBoard(U.id, (tx) => getAnswerFeedback(tx, { appUserId: userW, attemptId: r1.attemptId }));
  } catch (e) {
    crossBoard = e instanceof AttemptFeedbackNotFoundError;
  }
  check("RLS: attempt under another board claim → AttemptFeedbackNotFoundError", crossBoard);

  // 9. HTTP unauth → 401 (soft; new route needs a server restart — M30)
  try {
    const res = await fetch(`http://localhost:${env.PORT}/trpc/practice.getAnswerFeedback`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-board": T.slug },
      body: JSON.stringify({ attemptId: r1.attemptId }),
    });
    check(`HTTP practice.getAnswerFeedback (unauth) → 401 (got ${res.status})`, res.status === 401);
  } catch {
    console.log("  ~ HTTP practice.getAnswerFeedback skipped (server not running)");
  }

  // ── cleanup (FK-safe order) ──
  await withBoard(T.id, async (tx: Tx) => {
    // Defensive: a running dev worker may have drained the Stage-1 enqueue and
    // written observations for these throwaway attempts (memory: worker-breaks-probes).
    await tx.delete(observation).where(eq(observation.boardId, T.id));
    await tx.delete(attemptImage).where(eq(attemptImage.boardId, T.id));
    await tx.delete(attempt).where(eq(attempt.boardId, T.id));
    // upload_token is GLOBAL (no board scope in RLS) — delete by the session link.
    await tx.delete(uploadToken).where(eq(uploadToken.practiceSessionId, s1.sessionId));
    await tx.delete(practiceSession).where(eq(practiceSession.boardId, T.id));
    await tx.delete(question).where(eq(question.boardId, T.id));
    await tx.delete(subTopic).where(eq(subTopic.boardId, T.id));
    await tx.delete(topic).where(eq(topic.boardId, T.id));
    await tx.delete(chapter).where(eq(chapter.boardId, T.id));
    await tx.delete(subject).where(eq(subject.boardId, T.id));
    await tx.delete(membership).where(eq(membership.boardId, T.id));
    await tx.delete(whitelist).where(eq(whitelist.boardId, T.id));
  });
  await db.delete(appUser).where(eq(appUser.email, emailW));
  await db.delete(appUser).where(eq(appUser.email, emailX));
  await db.delete(board).where(eq(board.id, T.id));
  await db.delete(board).where(eq(board.id, U.id));

  console.log(`\nprobe_answer_feedback: ${passed} passed, ${failed} failed`);
  await queryClient.end();
  process.exit(failed === 0 ? 0 : 1);
}

main().catch(async (err) => {
  console.error("probe_answer_feedback FAILED:", err);
  await queryClient.end();
  process.exit(1);
});
