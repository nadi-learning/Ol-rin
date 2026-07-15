/**
 * Immediate subjective-answer feedback (Slice T1) — the student-facing eval a
 * self-serve practice answer gets AT SUBMIT. Prod has this; the rewrite was
 * reveal-only + silence. On demand (a SEPARATE call from submit, so submit stays
 * fast + always persists the attempt — "practice must always work"), Gemini reads
 * the student's worked answer against the reference and returns a warm, honest
 * read: a soft verdict + prose + a couple of strengths/improvements.
 *
 * Fork B (D-T1-2) REVERSED by the founder 2026-07-15: the read now carries a
 * numeric score (marksAwarded/marksMax) shown in place of the verdict tag.
 * marksMax anchors to the stem's declared "[n marks]" (S82 format) when present;
 * legacy stems get an AI-chosen total. The rigorous 1–5 still lives in the blind
 * Stage-1 `observation` pipeline for the tutor — this score never moves mastery.
 *
 * D1 v0 (D-T1-1): this NEVER moves mastery. Stage-2 (tutor-in-the-loop) stays the
 * sole mastery gate. This is a separate, single, student-facing Gemini call —
 * fully fault-isolated from Stage-1/Stage-2 (one job per AI call).
 *
 * Persisted + idempotent (D-T1-3): the result is cached on `attempt.feedback`
 * (jsonb). A second call returns the cached read — no re-spend, refresh-safe. The
 * Gemini call fails LOUD (AiNotConfigured / empty / bad-JSON propagate) and does
 * NOT persist on failure, so a retry can succeed; the router maps a failure to a
 * soft FE state (the reveal + model answer are already shown regardless).
 *
 * v0 scope = TYPED answers. A skip (no answer) or a photo answer (answer_text
 * null — the Q3 upload path) is NOT_EVALUABLE here; photo-answer feedback is a
 * follow-on. Ownership-guarded (attempt.app_user_id == caller) like every
 * practice read — RLS scopes by board, not user (D-L-5).
 */
import { eq } from "drizzle-orm";
import type { PgTransaction } from "drizzle-orm/pg-core";
import { z } from "zod";
import { attempt, question } from "@b2c/kernel/schema";
import { Type } from "@google/genai";
import { geminiJson } from "./ai/gemini";

type Tx = PgTransaction<any, any, any>;

export class AttemptFeedbackNotFoundError extends Error {
  readonly code = "ATTEMPT_NOT_FOUND";
  constructor(attemptId: string) {
    super(`no attempt ${attemptId} for this user`);
    this.name = "AttemptFeedbackNotFoundError";
  }
}

export class NotEvaluableError extends Error {
  readonly code = "NOT_EVALUABLE";
  constructor(attemptId: string) {
    super(`attempt ${attemptId} has no typed answer to evaluate`);
    this.name = "NotEvaluableError";
  }
}

// ───────────────────────── the student-facing read contract ─────────────────────────

/**
 * What the student sees. Founder reversal of Fork B (2026-07-15): the practice
 * feedback now SHOWS a numeric score — marksAwarded/marksMax — instead of the
 * verdict tag. marksMax is anchored to the stem's declared "[n marks]" when
 * present (every question authored after the S82 prompt change); for the
 * legacy bank the AI picks a sensible total from the reference answer. The
 * verdict stays in the contract (stored + FE fallback for pre-marks cached
 * feedback). Marks are nullable so old cached attempt.feedback still parses.
 */
export const answerFeedbackSchema = z.object({
  verdict: z.enum(["strong", "partial", "off_track"]),
  feedback: z.string().min(1),
  strengths: z.array(z.string()).default([]),
  improvements: z.array(z.string()).default([]),
  marksAwarded: z.number().int().min(0).nullable().default(null),
  marksMax: z.number().int().min(1).nullable().default(null),
});
export type AnswerFeedback = z.infer<typeof answerFeedbackSchema>;

// What we cache on attempt.feedback: the read + forensics meta.
const storedFeedbackSchema = answerFeedbackSchema.extend({
  model: z.string(),
  generatedAt: z.string(),
});

const geminiResponseSchema = {
  type: Type.OBJECT,
  properties: {
    verdict: {
      type: Type.STRING,
      enum: ["strong", "partial", "off_track"],
      description:
        "strong = captures the key idea(s) correctly and completely enough; partial = right track but missing/muddled on something that matters; off_track = misses or misunderstands the core",
    },
    feedback: {
      type: Type.STRING,
      description:
        "2–4 sentences to the student (second person, warm + honest, concrete): what they got + what to fix. NO score, NO marks.",
    },
    strengths: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "0–3 short phrases naming what the answer did well (empty if off_track)",
    },
    improvements: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "0–3 short, actionable phrases for what to add/fix next time",
    },
    marksAwarded: {
      type: Type.INTEGER,
      description: "marks earned by THIS answer, 0..marksMax, per the marking rules",
    },
    marksMax: {
      type: Type.INTEGER,
      description:
        "total marks this question is worth: the sum of the stem's declared [n marks] when present, else your own sensible total (2–5) from the reference answer's demands",
    },
  },
  required: ["verdict", "feedback", "marksAwarded", "marksMax"],
} as const;

const FEEDBACK_SYSTEM = `You give a student immediate, encouraging feedback on ONE subjective answer they just wrote, in a low-stakes practice sandbox. Your job is to help them SEE how their answer compares to a good one and what to do next — NOT to grade them.

You are given the question, a REFERENCE answer (what a good response looks like), and the student's answer. Judge the student's answer against the reference on substance — the ideas, the reasoning, the completeness — not spelling or phrasing.

VERDICT — pick one, honestly:
- strong: they captured the key idea(s) correctly and completely enough. A minor omission is still strong.
- partial: they're on the right track but missing or muddled on something that matters.
- off_track: they miss or misunderstand the core of what the question asks.

TONE: address the student directly ("you"). Be warm but honest — never inflate. If they're off track, say so kindly and point the way; do not pretend a wrong answer is partly right. If they're strong, affirm specifically (name WHAT was good), don't just praise.

MARKS — award a score alongside the prose:
- marksMax (the total this question is worth): if the question text declares marks — "[2 marks]" per part or overall — marksMax is their SUM. If it declares none, choose a sensible total yourself (2–5) from how much the reference answer demands (one idea = 2, a multi-part or multi-step answer = 3–5).
- marksAwarded: mark the student's answer against the reference like a fair examiner — credit each key idea/step they got, no credit for what's missing or wrong. 0..marksMax; full marks is fine for a complete answer, 0 for off_track.
- Keep the marks OUT of the prose — the feedback text explains, the numbers score. Never mention a different score in words than the numbers say.

Keep feedback to 2–4 sentences. strengths = up to 3 short phrases of what they did well (leave empty if off_track). improvements = up to 3 short, actionable things to add or fix. Ground every point in THIS answer vs the reference — no generic study advice.

Return the structured JSON.`;

// Sum the stem's declared "[n marks]" / "[n mark]" annotations (the S82 exam-
// presentation format). null when the stem declares none (the legacy bank).
export function declaredMarksTotal(stem: string): number | null {
  const m = stem.match(/\[\s*\d+\s*marks?\s*\]/gi);
  if (!m) return null;
  return m.reduce((sum, tag) => sum + Number(tag.match(/\d+/)![0]), 0);
}

// ───────────────────────── the read ─────────────────────────

/**
 * Get (or compute-and-cache) the immediate feedback for one owned attempt. Runs
 * inside the caller's board-scoped tx (protectedProcedure → withBoard) — the
 * same house pattern as Stage-1/Stage-2 (the Gemini call runs within the tx).
 */
export async function getAnswerFeedback(
  tx: Tx,
  args: { appUserId: string; attemptId: string },
): Promise<AnswerFeedback> {
  const [a] = await tx
    .select()
    .from(attempt)
    .where(eq(attempt.id, args.attemptId))
    .limit(1);
  // RLS scopes to the board; the user check stops cross-student reads (D-L-5).
  if (!a || a.appUserId !== args.appUserId) {
    throw new AttemptFeedbackNotFoundError(args.attemptId);
  }

  // Idempotent: return the cached read if we already evaluated this attempt.
  if (a.feedback) {
    return answerFeedbackSchema.parse(a.feedback);
  }

  // v0 = typed answers only. A skip / photo answer has no answer_text to read.
  if (a.skipReason || !a.answerText) {
    throw new NotEvaluableError(args.attemptId);
  }

  const [q] = await tx
    .select({
      stem: question.stem,
      referenceAnswer: question.referenceAnswer,
      explanation: question.explanation,
    })
    .from(question)
    .where(eq(question.id, a.questionId))
    .limit(1);
  if (!q) throw new AttemptFeedbackNotFoundError(args.attemptId); // RLS-invisible q

  const prompt = `QUESTION:
${q.stem}

REFERENCE ANSWER (what a good response looks like — judge the student against this):
${q.referenceAnswer}${q.explanation ? `\n\nEXPLANATION: ${q.explanation}` : ""}

THE STUDENT'S ANSWER:
${a.answerText}

Give this student your feedback per your instructions. Return the structured JSON.`;

  const raw = await geminiJson<unknown>({
    label: `answerFeedback:${args.attemptId}`,
    systemInstruction: FEEDBACK_SYSTEM,
    prompt,
    responseSchema: geminiResponseSchema as never,
    // Default cap (8192) is generous headroom over the small answer — the
    // thinking-model budget (M28) isn't near the answer size here. Timeout +
    // retry-once in geminiJson remain the runaway guards.
  });

  const feedback = answerFeedbackSchema.parse(raw);

  // Deterministic anchor: when the stem declares marks ("[2 marks]" per part),
  // their sum IS marksMax — the model's total is only trusted for the legacy
  // bank with no declared marks. Awarded is clamped into 0..max either way.
  const declaredMax = declaredMarksTotal(q.stem);
  if (declaredMax != null) feedback.marksMax = declaredMax;
  if (feedback.marksMax != null) {
    feedback.marksAwarded = Math.max(
      0,
      Math.min(feedback.marksAwarded ?? 0, feedback.marksMax),
    );
  }

  // Cache on the attempt (idempotent). Store forensics meta alongside; the FE
  // reads only the AnswerFeedback fields.
  const stored = storedFeedbackSchema.parse({
    ...feedback,
    model: process.env.GEMINI_MODEL ?? "gemini-3-flash-preview",
    generatedAt: new Date().toISOString(),
  });
  await tx
    .update(attempt)
    .set({ feedback: stored })
    .where(eq(attempt.id, args.attemptId));

  return feedback;
}
