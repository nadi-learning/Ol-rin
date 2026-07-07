/**
 * Immediate subjective-answer feedback (Slice T1) — the student-facing eval a
 * self-serve practice answer gets AT SUBMIT. Prod has this; the rewrite was
 * reveal-only + silence. On demand (a SEPARATE call from submit, so submit stays
 * fast + always persists the attempt — "practice must always work"), Gemini reads
 * the student's worked answer against the reference and returns a warm, honest
 * read: a soft verdict + prose + a couple of strengths/improvements.
 *
 * Fork B (D-T1-2): QUALITATIVE ONLY — NO numeric grade. The self-serve sandbox is
 * a no-grade space (G3 + D-L-3); the rigorous 1–5 lives in the blind Stage-1
 * `observation` pipeline for the tutor, not here.
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

/** What the student sees. Fork B: a soft verdict, NOT a number. */
export const answerFeedbackSchema = z.object({
  verdict: z.enum(["strong", "partial", "off_track"]),
  feedback: z.string().min(1),
  strengths: z.array(z.string()).default([]),
  improvements: z.array(z.string()).default([]),
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
  },
  required: ["verdict", "feedback"],
} as const;

const FEEDBACK_SYSTEM = `You give a student immediate, encouraging feedback on ONE subjective answer they just wrote, in a low-stakes practice sandbox. Your job is to help them SEE how their answer compares to a good one and what to do next — NOT to grade them.

You are given the question, a REFERENCE answer (what a good response looks like), and the student's answer. Judge the student's answer against the reference on substance — the ideas, the reasoning, the completeness — not spelling or phrasing.

VERDICT — pick one, honestly:
- strong: they captured the key idea(s) correctly and completely enough. A minor omission is still strong.
- partial: they're on the right track but missing or muddled on something that matters.
- off_track: they miss or misunderstand the core of what the question asks.

TONE: address the student directly ("you"). Be warm but honest — never inflate. If they're off track, say so kindly and point the way; do not pretend a wrong answer is partly right. If they're strong, affirm specifically (name WHAT was good), don't just praise.

NO GRADE: never output or imply a score, mark, percentage, or "X out of Y". This is a no-grade space. The word "correct/incorrect" is fine; a number is not.

Keep feedback to 2–4 sentences. strengths = up to 3 short phrases of what they did well (leave empty if off_track). improvements = up to 3 short, actionable things to add or fix. Ground every point in THIS answer vs the reference — no generic study advice.

Return the structured JSON.`;

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
