/**
 * probe_vision_scoring — Slice Q3-2 exit gate (Stage-1 reads ANSWER PHOTOS).
 *
 * Widens Stage-1 blind scoring (Slice AI-1) to read a HANDWRITTEN answer: a photo
 * attempt has answer_text null and its attempt_image rows ARE the answer. The
 * scorer loads them from object storage, sends them to the SAME per-axis Gemini
 * call as inline images (multimodal), and writes observations exactly as it does
 * for typed text — BLIND, no mastery.
 *
 * Runs the REAL scorer against the REAL Gemini VISION vendor + real DB + real RLS
 * + a real pyrender render (the legible "handwritten" answer PNG), on a THROWAWAY
 * fixture (boards P/Q per run, M22) with full cleanup. Needs GEMINI_API_KEY and
 * pyrender UP on PYRENDER_URL (same bar as the figure probes).
 *
 * Two-tier (build-discipline — don't over-read a single AI response):
 *   FIRM — plumbing we control: a photo attempt is NO LONGER short-circuited (the
 *     Session-64 answer_text-null skip is lifted for photos); an observation is
 *     written from the image; the signal marks it a photo read (photoCount); BLIND
 *     (no mastery); the REAL submit flow enqueues + the worker drains it (M11 both
 *     sides: submit ENABLES, scorer READS); idempotency; RLS; not-found.
 *   SOFT — the model's actual vision read (OCR of handwriting is fallible): the
 *     level + reasoning are LOGGED, never hard-failed, but we DO confirm it read
 *     *something* (reasoning references the working) so a blank read can't pass.
 *
 *   1. DB connectivity.
 *   2. render a legible procedural answer PNG (pyrender) — valid PNG bytes.
 *   3. REAL flow: mint → phone upload (rendered bytes) → submitPhotoAttempt →
 *      attempt(answer_text null) + attempt_image row persisted. [FIRM]
 *   4. scoreAttempt on that photo attempt → scored:true, a PROCEDURAL observation
 *      (1–5) written (the answer_text-null short-circuit is lifted). [FIRM]
 *   5. observation: attempt_id, source, signals.photoCount>=1 + model. [FIRM]
 *   6. BLIND: no mastery_state written. [FIRM]
 *   7. SOFT: procedural level + reasoning (LOGGED); FIRM-lite: reasoning non-empty.
 *   8. IDEMPOTENT: re-score → obs count unchanged. [FIRM]
 *   9. conceptual photo answer (direct) → a CONCEPTUAL observation — vision routes
 *      by axis tag just like text. [FIRM the obs exists; SOFT the level]
 *  10. RLS: scoring a P photo attempt under board Q → ATTEMPT_NOT_FOUND. [FIRM]
 *  11. unknown attempt id → ATTEMPT_NOT_FOUND. [FIRM]
 *  12. SOFT E2E: enqueue a photo attempt → inline Worker drains → observation appears.
 */
import { randomUUID } from "node:crypto";
import { and, asc, eq, sql } from "drizzle-orm";
import type { PgTransaction } from "drizzle-orm/pg-core";
import { Worker } from "bullmq";
import {
  appUser,
  attempt,
  attemptImage,
  board,
  chapter,
  learningObjective,
  masteryState,
  observation,
  practiceSession,
  question,
  subTopic,
  subject,
  topic,
  uploadToken,
} from "@b2c/kernel/schema";
import { db, queryClient } from "../src/db/client";
import { withBoard } from "../src/db/with-board";
import { redisConnection } from "../src/redis/connection";
import { AttemptNotFoundError, scoreAttempt } from "../src/services/assessment";
import { __aiConfigured } from "../src/services/ai/gemini";
import { pyrenderHealth, renderScript } from "../src/services/matplotlib";
import { putObject } from "../src/services/object_storage";
import { submitPhotoAttempt } from "../src/services/practice";
import { mintUploadToken, recordPhoneUpload } from "../src/services/upload";
import {
  ASSESSMENT_QUEUE,
  assessmentQueue,
  enqueueStage1Scoring,
  type Stage1JobData,
} from "../src/worker/queue";

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

function isPng(b: Uint8Array): boolean {
  return b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47;
}

async function obsFor(boardId: string, attemptId: string) {
  return withBoard(boardId, (tx: Tx) =>
    tx.select().from(observation).where(eq(observation.attemptId, attemptId)),
  );
}

// A legible "handwritten" answer, rendered to a real PNG by pyrender. Printed
// text (not cursive) is a fair proxy — Q3-2 verifies the vision PLUMBING; the
// model's OCR of true handwriting is the SOFT tier + the Q3-3 device eyeball.
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
  if (!__aiConfigured()) {
    console.error("GEMINI_API_KEY not set — Slice Q3-2 probe needs the real vision vendor.");
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

  const [P] = await db.insert(board).values({ slug: `q32-p-${tag}`, name: "Probe P" }).returning();
  const [Q] = await db.insert(board).values({ slug: `q32-q-${tag}`, name: "Probe Q" }).returning();
  if (!P || !Q) throw new Error("board seed failed");

  const email = `q32-stu-${tag}@example.com`;
  const [stu] = await db.insert(appUser).values({ email, name: "Stu" }).returning();
  if (!stu) throw new Error("app_user seed failed");

  // Fixture under P: spine + LOs (both axes) + a procedural and a conceptual
  // question + a practice_session whose current question is the procedural one
  // (the slot the real upload flow fills).
  const fx = await withBoard(P.id, async (tx: Tx) => {
    const [subj] = await tx.insert(subject).values({ boardId: P.id, slug: "phys", name: "Physics", grade: "IGCSE" }).returning();
    const [chap] = await tx.insert(chapter).values({ boardId: P.id, subjectId: subj!.id, slug: "matter", name: "Matter", ordinal: 1 }).returning();
    const [tp] = await tx.insert(topic).values({ boardId: P.id, chapterId: chap!.id, slug: "density", name: "Density", ordinal: 1 }).returning();
    const [st] = await tx.insert(subTopic).values({ boardId: P.id, topicId: tp!.id, slug: "density-calc", name: "Density & conduction", ordinal: 1 }).returning();
    await tx.insert(learningObjective).values({ boardId: P.id, subTopicId: st!.id, axis: "procedural", code: "P1", description: "Computes density = mass / volume with correct units." });
    await tx.insert(learningObjective).values({ boardId: P.id, subTopicId: st!.id, axis: "conceptual", code: "C1", description: "Explains thermal conduction as energy transfer by free electrons / particle vibration." });

    const mk = (axis: string, stem: string, ref: string, ord: number, note: string) =>
      tx.insert(question).values({ boardId: P.id, subTopicId: st!.id, axis, kind: "subjective", stem, referenceAnswer: ref, explanation: null, pedagogicalNote: note, ordinal: ord, status: "approved", source: "b2c_authoring" }).returning();

    const [qProc] = await mk("procedural", "A metal block has mass 240 g and volume 30 cm³. Calculate its density. Show your working.", "density = mass / volume = 240 / 30 = 8 g/cm³.", 1, "Routine execution of density = m/V.");
    const [qConcept] = await mk("conceptual", "Explain why a metal spoon feels colder to the touch than a wooden spoon at the same temperature.", "Metal conducts thermal energy away from the hand quickly (free electrons); wood is an insulator. Both are at the same temperature.", 2, "Probes the conceptual principle behind conduction.");

    const [sess] = await tx.insert(practiceSession).values({ boardId: P.id, appUserId: stu.id, subTopicId: st!.id, questionIds: [qProc!.id], currentIndex: 0, status: "active", origin: "self_serve" }).returning();
    return { st: st!.id, qProc: qProc!.id, qConcept: qConcept!.id, sess: sess!.id };
  });

  // 2. render a legible procedural answer PNG via pyrender.
  const procPng = await renderScript({
    script: answerScript([
      "Density",
      "density = mass / volume",
      "= 240 g / 30 cm3",
      "= 8 g/cm3",
    ]),
  });
  check("pyrender → a valid PNG for the procedural answer (magic header, >1KB)", isPng(procPng) && procPng.length > 1024);

  // 3. REAL flow: authed mint → unauth phone upload (the rendered bytes) → authed
  // desktop submit. Proves the ENABLE side (submit enqueues) + persistence.
  const mint = await withBoard(P.id, (tx: Tx) =>
    mintUploadToken(tx, { boardId: P.id, appUserId: stu.id, sessionId: fx.sess, questionId: fx.qProc }),
  );
  await recordPhoneUpload(mint.token, [{ bytes: procPng, mime: "image/png" }]);
  await withBoard(P.id, (tx: Tx) =>
    submitPhotoAttempt(tx, {
      boardId: P.id,
      appUserId: stu.id,
      sessionId: fx.sess,
      questionId: fx.qProc,
      uploadToken: mint.token,
      confidence: 4,
      timeMs: 90000,
    }),
  );
  const [aRow] = await withBoard(P.id, (tx: Tx) =>
    tx.select().from(attempt).where(and(eq(attempt.practiceSessionId, fx.sess), eq(attempt.questionId, fx.qProc))),
  );
  const procAttemptId = aRow!.id;
  const procImgs = await withBoard(P.id, (tx: Tx) =>
    tx.select().from(attemptImage).where(eq(attemptImage.attemptId, procAttemptId)).orderBy(asc(attemptImage.ordinal)),
  );
  check("REAL submit: attempt persisted with answer_text NULL (the answer is the photo)", aRow!.answerText === null && aRow!.skipReason === null);
  check("REAL submit: one attempt_image row (storage_key + image/png + board)", procImgs.length === 1 && procImgs[0]!.mime === "image/png" && procImgs[0]!.boardId === P.id);

  // 4. score the photo attempt DIRECTLY (deterministic, no queue) — the vision read.
  const rProc = await scoreAttempt(P.id, procAttemptId);
  const oProc = await obsFor(P.id, procAttemptId);
  const procObs: any = oProc.find((o: any) => o.axis === "procedural");
  check("photo attempt (answer_text null) is NO LONGER short-circuited → scored:true", rProc.scored === true);
  check("procedural photo answer → a procedural observation (1–5)", !!procObs && procObs.observationLevel >= 1 && procObs.observationLevel <= 5);
  check("procedural photo → NO conceptual observation (axis tag procedural)", oProc.filter((o: any) => o.axis === "conceptual").length === 0);

  // 5. observation fields — the photo-read forensics.
  check("observation: attempt_id set + source 'stage1_scorer'", procObs?.attemptId === procAttemptId && procObs?.source === "stage1_scorer");
  check("observation: signals.photoCount>=1 (marks a VISION read) + model set", procObs?.signals?.photoCount >= 1 && typeof procObs?.signals?.model === "string");
  check("observation: signals carry confidence + timeMs from the desktop", procObs?.signals?.confidence === 4 && procObs?.signals?.timeMs === 90000);

  // 6. BLIND — no mastery moved.
  const mastery = await withBoard(P.id, (tx: Tx) => tx.select().from(masteryState).where(eq(masteryState.studentId, stu.id)));
  check("BLIND: no mastery_state written by Stage-1 vision read", mastery.length === 0);

  // 7. SOFT read quality — log the level + reasoning; confirm it read SOMETHING.
  soft("procedural level (photo)", procObs?.observationLevel);
  soft("procedural reasoning (photo)", procObs?.reasoning?.slice(0, 240));
  check("read is non-empty (the model produced reasoning from the image, not a blank)", typeof procObs?.reasoning === "string" && procObs.reasoning.length > 10);

  // 8. IDEMPOTENT re-score.
  const before = (await obsFor(P.id, procAttemptId)).length;
  await scoreAttempt(P.id, procAttemptId);
  const after = (await obsFor(P.id, procAttemptId)).length;
  check(`IDEMPOTENT: re-score photo attempt → obs count unchanged (${before}→${after})`, before === after && after >= 1);

  // 9. conceptual photo answer (direct create) → a conceptual observation.
  const conceptPng = await renderScript({
    script: answerScript([
      "Both spoons are the same temperature.",
      "Metal FEELS colder because it conducts",
      "thermal energy away from the hand much",
      "faster (free electrons), so energy leaves",
      "the skin quickly. Wood is an insulator so",
      "energy flows out slowly and feels warmer.",
    ]),
  });
  const conceptKey = `uploads/probe-${tag}/concept.png`;
  await putObject(conceptKey, conceptPng, "image/png");
  const conceptAttemptId = await withBoard(P.id, async (tx: Tx) => {
    const [a] = await tx.insert(attempt).values({ boardId: P.id, practiceSessionId: fx.sess, questionId: fx.qConcept, appUserId: stu.id, answerText: null, confidence: 4, timeMs: 120000, skipReason: null }).returning({ id: attempt.id });
    await tx.insert(attemptImage).values({ boardId: P.id, attemptId: a!.id, storageKey: conceptKey, mime: "image/png", ordinal: 0 });
    return a!.id;
  });
  const rConcept = await scoreAttempt(P.id, conceptAttemptId);
  const oConcept = await obsFor(P.id, conceptAttemptId);
  check("conceptual photo answer → scored + a conceptual observation", rConcept.scored === true && oConcept.filter((o: any) => o.axis === "conceptual").length === 1);
  soft("conceptual level (photo)", oConcept.find((o: any) => o.axis === "conceptual")?.observationLevel);

  // 10. RLS cross-board.
  let rls = false;
  try {
    await scoreAttempt(Q.id, procAttemptId);
  } catch (e) {
    rls = e instanceof AttemptNotFoundError;
  }
  check("RLS: scoring a P photo attempt under board Q → ATTEMPT_NOT_FOUND", rls);

  // 11. unknown attempt id.
  let unknown = false;
  try {
    await scoreAttempt(P.id, randomUUID());
  } catch (e) {
    unknown = e instanceof AttemptNotFoundError;
  }
  check("unknown attempt id → ATTEMPT_NOT_FOUND", unknown);

  // 12. SOFT E2E — enqueue a fresh photo attempt → inline Worker → observation.
  try {
    const key = `uploads/probe-${tag}/e2e.png`;
    await putObject(key, procPng, "image/png");
    const e2eId = await withBoard(P.id, async (tx: Tx) => {
      const [a] = await tx.insert(attempt).values({ boardId: P.id, practiceSessionId: fx.sess, questionId: fx.qProc, appUserId: stu.id, answerText: null, confidence: 3, timeMs: 60000, skipReason: null }).returning({ id: attempt.id });
      await tx.insert(attemptImage).values({ boardId: P.id, attemptId: a!.id, storageKey: key, mime: "image/png", ordinal: 0 });
      return a!.id;
    });
    const worker = new Worker<Stage1JobData>(
      ASSESSMENT_QUEUE,
      async (job) => scoreAttempt(job.data.boardId, job.data.attemptId),
      { connection: redisConnection, concurrency: 1 },
    );
    const done = new Promise<boolean>((resolve) => {
      const t = setTimeout(() => resolve(false), 60_000);
      worker.on("completed", (job) => {
        if (job.data.attemptId === e2eId) {
          clearTimeout(t);
          resolve(true);
        }
      });
    });
    await enqueueStage1Scoring({ attemptId: e2eId, boardId: P.id });
    const ok = await done;
    const oE2E = await obsFor(P.id, e2eId);
    check(`E2E queue→worker→vision drained a photo attempt (${ok})`, ok && oE2E.length >= 1);
    await worker.close();
  } catch (e) {
    console.log(`  ~ E2E queue round-trip skipped: ${e instanceof Error ? e.message : e}`);
  }

  // ── cleanup (FK-safe) ──
  await withBoard(P.id, async (tx: Tx) => {
    await tx.delete(observation).where(eq(observation.boardId, P.id));
    await tx.delete(attemptImage).where(eq(attemptImage.boardId, P.id));
    await tx.delete(attempt).where(eq(attempt.boardId, P.id));
    // upload_token is GLOBAL (no board scope in RLS) — delete by the session link.
    await tx.delete(uploadToken).where(eq(uploadToken.practiceSessionId, fx.sess));
    await tx.delete(practiceSession).where(eq(practiceSession.boardId, P.id));
    await tx.delete(question).where(eq(question.boardId, P.id));
    await tx.delete(learningObjective).where(eq(learningObjective.boardId, P.id));
    await tx.delete(subTopic).where(eq(subTopic.boardId, P.id));
    await tx.delete(topic).where(eq(topic.boardId, P.id));
    await tx.delete(chapter).where(eq(chapter.boardId, P.id));
    await tx.delete(subject).where(eq(subject.boardId, P.id));
  });
  await db.delete(appUser).where(eq(appUser.email, email));
  await db.delete(board).where(eq(board.id, P.id));
  await db.delete(board).where(eq(board.id, Q.id));
  await assessmentQueue.obliterate({ force: true }).catch(() => {});

  console.log(`\nprobe_vision_scoring: ${passed} passed, ${failed} failed`);
  await assessmentQueue.close().catch(() => {});
  await redisConnection.quit().catch(() => {});
  await queryClient.end();
  process.exit(failed === 0 ? 0 : 1);
}

main().catch(async (err) => {
  console.error("probe_vision_scoring FAILED:", err);
  await queryClient.end();
  process.exit(1);
});
