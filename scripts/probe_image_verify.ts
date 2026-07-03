/**
 * probe_image_verify — Slice IMG Stage-2 exit gate (the figure vision VERIFIER).
 *
 * Runs the REAL pipeline end of Stage-1 then Stage-2: render a spec (Gemini →
 * nadi-pyrender → PNG), then verify the PNG against its spec with Gemini-VISION
 * and stamp the question_image verifier columns. Real Gemini (script + vision) +
 * real sidecar + real DB + real RLS, on a THROWAWAY fixture (boards P/Q per run,
 * M22) with full cleanup. Needs GEMINI_API_KEY and pyrender UP on PYRENDER_URL.
 *
 * Two-tier (build-discipline — don't over-read a single AI response):
 *   FIRM — plumbing we control: a verdict stamps the row (label ∈ PASS/FAIL,
 *     model + verifiedAt + specHash set, reason present); a missing PNG file
 *     stamps ERROR and does NOT throw (fault isolation); a cross-board / unknown
 *     image throws VerifyImageNotFoundError and stamps nothing; re-verify
 *     overwrites (idempotent); specHash is deterministic for the same spec.
 *   SOFT — the model's actual judgment (vision is fallible): a clean triangle
 *     render SHOULD PASS and an impossible-spec verify SHOULD FAIL — LOGGED, never
 *     hard-failed.
 *
 *  1. DB connectivity.
 *  2. render a real triangle → imageId (Stage-1, reused).
 *  3. verifyImage → row stamped: label ∈ {PASS,FAIL}, model set, verifiedAt set,
 *     specHash set + == computeSpecHash(spec), reason non-empty. [FIRM]
 *  4. SOFT: the good triangle → PASS (logged).
 *  5. SOFT: overwrite the row spec with an impossible shows-list → verify → FAIL
 *     (logged); + FIRM: specHash changed to track the new spec.
 *  6. FS-missing → ERROR: delete the PNG file, verify → label ERROR, NO throw,
 *     row stamped ERROR. [FIRM]  (also proves idempotent overwrite of #5's verdict)
 *  7. RLS/not-found: verifyImage(Q, pImage) → VerifyImageNotFoundError, and the P
 *     row's verdict is UNCHANGED (nothing stamped under Q). [FIRM]
 *  8. unknown image id → VerifyImageNotFoundError. [FIRM]
 */
import { randomUUID } from "node:crypto";
import { rm } from "node:fs/promises";
import { resolve } from "node:path";
import { and, eq, sql } from "drizzle-orm";
import type { PgTransaction } from "drizzle-orm/pg-core";
import {
  appUser,
  board,
  chapter,
  membership,
  question,
  questionImage,
  subTopic,
  subject,
  topic,
} from "@b2c/kernel/schema";
import { db, queryClient } from "../src/db/client";
import { env } from "../src/config/env";
import { withBoard } from "../src/db/with-board";
import { redisConnection } from "../src/redis/connection";
import { __aiConfigured } from "../src/services/ai/gemini";
import { generateImageForQuestion } from "../src/services/image_gen";
import {
  VerifyImageNotFoundError,
  computeSpecHash,
  verifyImage,
} from "../src/services/image_verify";
import { pyrenderHealth } from "../src/services/matplotlib";

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

const SPEC = {
  description: "A right-angled triangle with the right angle at B, sides labelled",
  shows: ["vertices A, B, C", "right-angle mark at B", "hypotenuse AC labelled 10 cm"],
  hides: ["any shading", "grid lines"],
};

async function readRow(boardId: string, imageId: string) {
  const [r] = await withBoard(boardId, (tx: Tx) =>
    tx.select().from(questionImage).where(eq(questionImage.id, imageId)),
  );
  return r as any;
}

async function main() {
  if (!__aiConfigured()) {
    console.error("GEMINI_API_KEY not set — probe_image_verify needs the real vendor.");
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

  const [P] = await db.insert(board).values({ slug: `imv-p-${tag}`, name: "Verify P" }).returning();
  const [Q] = await db.insert(board).values({ slug: `imv-q-${tag}`, name: "Verify Q" }).returning();
  if (!P || !Q) throw new Error("board seed failed");

  const fx = await withBoard(P.id, async (tx: Tx) => {
    const [subj] = await tx.insert(subject).values({ boardId: P.id, slug: "math", name: "Mathematics", grade: "IGCSE" }).returning();
    const [chap] = await tx.insert(chapter).values({ boardId: P.id, subjectId: subj!.id, slug: "pythagoras", name: "Pythagoras", ordinal: 1 }).returning();
    const [tp] = await tx.insert(topic).values({ boardId: P.id, chapterId: chap!.id, slug: "right-triangles", name: "Right triangles", ordinal: 1 }).returning();
    const [st] = await tx.insert(subTopic).values({ boardId: P.id, topicId: tp!.id, slug: "theorem", name: "The theorem", ordinal: 1 }).returning();
    const [q] = await tx.insert(question).values({ boardId: P.id, subTopicId: st!.id, axis: "conceptual", kind: "subjective", stem: "State Pythagoras' theorem for the right-angled triangle described (right angle at B, hypotenuse AC = 10 cm).", referenceAnswer: "AC² = AB² + BC².", explanation: null, pedagogicalNote: null, ordinal: 0, source: "b2c_authoring", image: SPEC }).returning();
    return { q: q!.id };
  });

  // 2. Render (Stage-1) → a real PNG + row.
  const r = await generateImageForQuestion(P.id, fx.q);
  check("render → imageId + version 1 (Stage-1 reused)", !!r.imageId && r.version === 1);

  // 3. Verify → row stamped. [FIRM]
  const v1 = await verifyImage(P.id, r.imageId);
  const row1 = await readRow(P.id, r.imageId);
  check("verifyImage → label ∈ {PASS,FAIL}", v1.label === "PASS" || v1.label === "FAIL");
  check("row stamped: verifierLabel matches the return", row1?.verifierLabel === v1.label);
  check("row stamped: verifierModel == GEMINI_MODEL", row1?.verifierModel === env.GEMINI_MODEL);
  check("row stamped: verifiedAt set", row1?.verifiedAt instanceof Date);
  check("row stamped: reason non-empty", typeof row1?.verifierReason === "string" && row1.verifierReason.length > 0);
  check("row stamped: specHash == computeSpecHash(spec)", row1?.specHash === computeSpecHash(SPEC as any));
  // 4. SOFT — the good render should PASS.
  soft("good-triangle verdict", { label: v1.label, reason: v1.reason });

  // 5. Impossible spec → FAIL (SOFT) + specHash tracks the new spec (FIRM).
  const impossible = { description: "A colour photograph of a live cat", shows: ["a photograph of a real cat", "whiskers"], hides: [] };
  await withBoard(P.id, (tx: Tx) => tx.update(questionImage).set({ spec: impossible }).where(eq(questionImage.id, r.imageId)));
  const v2 = await verifyImage(P.id, r.imageId);
  const row2 = await readRow(P.id, r.imageId);
  soft("impossible-spec verdict (expect FAIL)", { label: v2.label, reason: v2.reason });
  check("re-verify overwrote the verdict (idempotent update)", row2?.verifierLabel === v2.label);
  check("specHash changed to track the new (impossible) spec", row2?.specHash === computeSpecHash(impossible as any) && row2.specHash !== computeSpecHash(SPEC as any));

  // 6. FS-missing → ERROR, no throw. [FIRM]
  await rm(resolve(env.IMAGES_DIR, r.storageKey), { force: true });
  const v3 = await verifyImage(P.id, r.imageId);
  const row3 = await readRow(P.id, r.imageId);
  check("FS-missing PNG → label ERROR (fault-isolated, no throw)", v3.label === "ERROR");
  check("row stamped ERROR + reason mentions unreadable", row3?.verifierLabel === "ERROR" && /unreadable/i.test(row3?.verifierReason ?? ""));

  // 7. RLS/not-found: verify under Q can't see the P row → throws, stamps nothing.
  let crossBoard = false;
  try { await verifyImage(Q.id, r.imageId); } catch (e) { crossBoard = e instanceof VerifyImageNotFoundError; }
  const row4 = await readRow(P.id, r.imageId);
  check("verifyImage(Q, pImage) → VerifyImageNotFoundError (RLS-hidden)", crossBoard);
  check("P row verdict UNCHANGED after the cross-board attempt (nothing stamped under Q)", row4?.verifierLabel === "ERROR" && row4?.verifiedAt?.getTime() === row3?.verifiedAt?.getTime());

  // 8. Unknown image id.
  let unknown = false;
  try { await verifyImage(P.id, randomUUID()); } catch (e) { unknown = e instanceof VerifyImageNotFoundError; }
  check("unknown image id → VerifyImageNotFoundError", unknown);

  // ── cleanup (FK-safe) ──
  await withBoard(P.id, async (tx: Tx) => {
    await tx.delete(questionImage).where(eq(questionImage.boardId, P.id));
    await tx.delete(question).where(eq(question.boardId, P.id));
    await tx.delete(subTopic).where(eq(subTopic.boardId, P.id));
    await tx.delete(topic).where(eq(topic.boardId, P.id));
    await tx.delete(chapter).where(eq(chapter.boardId, P.id));
    await tx.delete(subject).where(eq(subject.boardId, P.id));
  });
  await db.delete(board).where(and(eq(board.id, P.id)));
  await db.delete(board).where(eq(board.id, Q.id));

  console.log(`\nprobe_image_verify: ${passed} passed, ${failed} failed`);
  await redisConnection.quit().catch(() => {});
  await queryClient.end();
  process.exit(failed === 0 ? 0 : 1);
}

main().catch(async (err) => {
  console.error("probe_image_verify FAILED:", err);
  await queryClient.end();
  process.exit(1);
});
