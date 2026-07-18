// Figure vision VERIFIER (Slice IMG Stage-2) — the quality gate on the render
// pipeline. AI-generated matplotlib is error-prone, so after a render we show the
// rendered PNG + its spec (must-show / must-not-show) to Gemini-VISION and record
// a verdict on the question_image row's verifier columns.
//
// Ported in SHAPE from Starkhorn's nadi-backend (services/verifier.ts) — the
// strict "PASS / FAIL: reason" examiner prompt + the spec_hash staleness idea —
// but adapted to b2c:
//   - structured JSON output ({ label, reason }) via geminiJson, not text parsing
//     (b2c's whole IMG path is structured; image_gen already uses geminiJson);
//   - the vision plumbing is the SAME geminiJson call with an `images` part
//     (extended in Stage-2), not a separate REST client;
//   - no ai_call_log table (forensics = console, the b2c AI convention).
//
// FAULT-ISOLATED: a verifier failure (Gemini error, missing PNG, bad JSON) NEVER
// re-throws — it stamps verifier_label='ERROR' + the reason and returns. A wrong
// or missing verdict must never fail the render job or hide the image; the FE just
// shows the badge (PASS / FAIL / ERROR / PENDING) and a tutor decides whether to
// regenerate. Verifier output does NOT gate visibility.

import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import type { PgTransaction } from "drizzle-orm/pg-core";
import { Type, type Schema } from "@google/genai";
import { chapter, question, questionImage, subTopic, topic } from "@b2c/kernel/schema";
import { env } from "../config/env";
import { withBoard } from "../db/with-board";
import { geminiJson } from "./ai/gemini";
import type { FigureSpec } from "./image_gen";
import { readImage } from "./image_storage";

type Tx = PgTransaction<any, any, any>;

export type VerifierLabel = "PASS" | "FAIL" | "ERROR";

// verifier_model stamped by a MANUAL tutor override (vs a real Gemini model id).
// The FE renders it as "✓ Verified (tutor)"; the AI verdict it replaced is
// preserved in the row's meta.tutorOverride.
export const TUTOR_OVERRIDE_MODEL = "tutor_override";

export class VerifyImageNotFoundError extends Error {
  constructor(imageId: string) {
    super(`question_image ${imageId} not found under the given board`);
    this.name = "VerifyImageNotFoundError";
  }
}

export class ImageNotOverridableError extends Error {
  readonly code = "IMAGE_NOT_OVERRIDABLE";
  constructor(imageId: string, label: string | null) {
    super(
      `question_image ${imageId} is ${label ?? "PENDING"} — only a FAIL/ERROR verdict can be overridden`,
    );
    this.name = "ImageNotOverridableError";
  }
}

export interface VerifyImageResult {
  imageId: string;
  label: VerifierLabel;
  reason: string;
  model: string;
}

// ───────────────────────── spec hash (staleness tripwire) ─────────────────────
//
// Ported from Starkhorn's computeSpecHash (idea, not bytes): a deterministic sha
// over the spec fields, so a FUTURE reader can tell a stored verdict was computed
// against a different spec than what's on the row now. b2c v0 STORES it (cheap,
// mirrors the column's intent) but does not yet build the staleness-comparison UI
// — that's a later signal (D-IMG-11). Sorted keys so JSON.stringify is stable.
export function computeSpecHash(spec: FigureSpec | null | undefined): string {
  const s = spec ?? ({} as FigureSpec);
  const payload = {
    description: s.description ?? "",
    hides: s.hides ?? [],
    shows: s.shows ?? [],
  };
  return createHash("sha1").update(JSON.stringify(payload)).digest("hex");
}

// ───────────────────────── prompt ─────────────────────────

export const VERIFIER_SYSTEM = `You are a strict vision examiner for textbook diagrams.

You are shown a single rendered image and its specification (a description, the items the image MUST show, and the items it must NOT show). Decide whether the image satisfies the specification.

RULES:
- PASS only if ALL "must show" items are clearly visible AND none of the "must NOT show" items appear.
- Be strict about labels (A, B, C, F1, F2, units, values), arrow directions, and geometric correctness.
- Do NOT reward stylistic effort — judge only specification compliance.
- If you genuinely cannot see the image, return FAIL with reason "image not visible".

OUTPUT — return ONLY the structured JSON:
  { "label": "PASS" | "FAIL", "reason": "<short single sentence>" }
- On PASS, reason can be a brief confirmation (e.g. "all required elements present").
- On FAIL, reason names the specific defect (missing element, wrong geometry, forbidden element present, mislabeled, etc.) in one sentence.
- No preamble, no markdown, no extra keys.`;

const verifierSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    label: {
      type: Type.STRING,
      enum: ["PASS", "FAIL"],
      description: "PASS iff every must-show item is visible and no must-not-show item appears",
    },
    reason: {
      type: Type.STRING,
      description: "one short sentence — a confirmation on PASS, the specific defect on FAIL",
    },
  },
  required: ["label", "reason"],
};

function buildUserMessage(ctx: {
  stem: string;
  chapterName: string;
  topicName: string;
  subTopicName: string;
  spec: FigureSpec;
}): string {
  const { spec } = ctx;
  return [
    `Subject/chapter: ${ctx.chapterName} · Topic: ${ctx.topicName} · Sub-topic: ${ctx.subTopicName}`,
    `Question the diagram is for: ${ctx.stem}`,
    "",
    "===== SPECIFICATION =====",
    `Description: ${spec.description}`,
    spec.shows?.length
      ? `MUST SHOW:\n${spec.shows.map((s) => `  - ${s}`).join("\n")}`
      : "MUST SHOW: (none specified — judge against the description)",
    spec.hides?.length
      ? `MUST NOT SHOW:\n${spec.hides.map((s) => `  - ${s}`).join("\n")}`
      : "MUST NOT SHOW: (none specified)",
    "===== END SPECIFICATION =====",
    "",
    "Return the JSON verdict now.",
  ].join("\n");
}

// ───────────────────────── main ─────────────────────────

interface ImageRow {
  storageKey: string;
  spec: FigureSpec;
  stem: string;
  subTopicName: string;
  topicName: string;
  chapterName: string;
}

async function stampVerifier(
  boardId: string,
  imageId: string,
  fields: { label: VerifierLabel; reason: string; specHash: string },
): Promise<void> {
  await withBoard(boardId, (tx) =>
    tx
      .update(questionImage)
      .set({
        verifierLabel: fields.label,
        verifierReason: fields.reason.slice(0, 1000),
        verifierModel: env.GEMINI_MODEL,
        verifiedAt: new Date(),
        specHash: fields.specHash,
      })
      .where(eq(questionImage.id, imageId)),
  );
}

/**
 * Verify the rendered PNG for one question_image against its spec, and stamp the
 * verdict onto the row. Board-scoped (opens its own withBoard so RLS binds the
 * read + write — the worker calls this with the render job's boardId). The row
 * must be visible under `boardId` (it always is when the worker calls right after
 * the render) — a cross-board / missing row throws VerifyImageNotFoundError
 * (there is nothing to stamp). Every OTHER failure (missing PNG file, Gemini
 * error, bad JSON) is caught → stamped as ERROR → returned (never re-thrown).
 */
export async function verifyImage(
  boardId: string,
  imageId: string,
): Promise<VerifyImageResult> {
  const row = await withBoard(boardId, async (tx): Promise<ImageRow | null> => {
    const [r] = await tx
      .select({
        storageKey: questionImage.storageKey,
        spec: questionImage.spec,
        stem: question.stem,
        subTopicName: subTopic.name,
        topicName: topic.name,
        chapterName: chapter.name,
      })
      .from(questionImage)
      .innerJoin(question, eq(questionImage.questionId, question.id))
      .innerJoin(subTopic, eq(question.subTopicId, subTopic.id))
      .innerJoin(topic, eq(subTopic.topicId, topic.id))
      .innerJoin(chapter, eq(topic.chapterId, chapter.id))
      .where(eq(questionImage.id, imageId))
      .limit(1);
    return (r as ImageRow | undefined) ?? null;
  });
  if (!row) throw new VerifyImageNotFoundError(imageId);

  const spec = row.spec as FigureSpec;
  const specHash = computeSpecHash(spec);

  // Load the rendered bytes. A missing FS file is an ERROR verdict, not a throw.
  let base64: string;
  try {
    const bytes = await readImage(row.storageKey);
    base64 = Buffer.from(bytes).toString("base64");
  } catch (err) {
    const message = `image file unreadable: ${err instanceof Error ? err.message : String(err)}`;
    await stampVerifier(boardId, imageId, { label: "ERROR", reason: message, specHash });
    return { imageId, label: "ERROR", reason: message, model: env.GEMINI_MODEL };
  }

  const userMessage = buildUserMessage({
    stem: row.stem,
    chapterName: row.chapterName,
    topicName: row.topicName,
    subTopicName: row.subTopicName,
    spec,
  });

  // The vision call. The verdict is tiny; leave the model's default token ceiling
  // (generous — M28) so thinking is never starved on the gemini-3 thinking model.
  let verdict: { label: string; reason: string };
  try {
    verdict = await geminiJson<{ label: string; reason: string }>({
      label: `imageverify:${imageId}`,
      systemInstruction: VERIFIER_SYSTEM,
      prompt: userMessage,
      responseSchema: verifierSchema,
      images: [{ mimeType: "image/png", data: base64 }],
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await stampVerifier(boardId, imageId, { label: "ERROR", reason: message, specHash });
    return { imageId, label: "ERROR", reason: message, model: env.GEMINI_MODEL };
  }

  // Normalize: the schema constrains label to PASS/FAIL, but be defensive.
  const label: VerifierLabel = verdict.label === "PASS" ? "PASS" : "FAIL";
  const reason = verdict.reason?.trim() || (label === "PASS" ? "OK" : "no reason given");
  await stampVerifier(boardId, imageId, { label, reason, specHash });
  return { imageId, label, reason, model: env.GEMINI_MODEL };
}

/**
 * MANUAL tutor override (founder call 2026-07-18): stamp a FAIL/ERROR verdict to
 * PASS on the tutor's say-so. PASS gates student visibility (D-IMG-13), so this
 * is what actually publishes a figure the AI wrongly rejected. The AI's verdict
 * is preserved in meta.tutorOverride (audit); verifier_model = TUTOR_OVERRIDE_MODEL
 * is what the FE renders as "✓ Verified (tutor)". A PASS needs no override and a
 * PENDING row may still be racing the verifier → both are rejected. Undo = the
 * existing Re-verify (a fresh AI verdict overwrites these columns wholesale).
 * Runs inside the caller's board-scoped tx (tutorProcedure → withBoard); the
 * tutor-owns-this-question guard is the ROUTER's, like every draft op.
 */
export async function overrideImageVerdict(
  tx: Tx,
  args: { questionId: string; imageId: string },
): Promise<{ imageId: string; label: "PASS"; reason: string; model: string }> {
  const [row] = await tx
    .select({
      id: questionImage.id,
      questionId: questionImage.questionId,
      verifierLabel: questionImage.verifierLabel,
      verifierReason: questionImage.verifierReason,
      verifierModel: questionImage.verifierModel,
      meta: questionImage.meta,
    })
    .from(questionImage)
    .where(eq(questionImage.id, args.imageId))
    .limit(1);
  // Wrong pairing / cross-board / unknown all read the same: nothing to stamp.
  if (!row || row.questionId !== args.questionId) {
    throw new VerifyImageNotFoundError(args.imageId);
  }
  if (row.verifierLabel !== "FAIL" && row.verifierLabel !== "ERROR") {
    throw new ImageNotOverridableError(args.imageId, row.verifierLabel);
  }
  const reason =
    `Approved by tutor override (verifier said ${row.verifierLabel}: ${row.verifierReason ?? "no reason"})`.slice(
      0,
      1000,
    );
  await tx
    .update(questionImage)
    .set({
      verifierLabel: "PASS",
      verifierReason: reason,
      verifierModel: TUTOR_OVERRIDE_MODEL,
      verifiedAt: new Date(),
      // spec_hash untouched — it tracks what the AI verdict was computed against.
      meta: {
        ...((row.meta as Record<string, unknown> | null) ?? {}),
        tutorOverride: {
          at: new Date().toISOString(),
          priorLabel: row.verifierLabel,
          priorReason: row.verifierReason,
          priorModel: row.verifierModel,
        },
      },
    })
    .where(eq(questionImage.id, args.imageId));
  return { imageId: args.imageId, label: "PASS", reason, model: TUTOR_OVERRIDE_MODEL };
}
