/**
 * Stage-1 blind scoring (Slice AI-1) — the FIRST AI in the loop.
 *
 * Reads a single submitted `attempt` BLIND (no mastery, no history, no expected
 * level — assessment.md §1) and runs TWO Gemini calls (one per axis, "one job
 * each, no cross-contamination" — §1), each placing the answer on the 1–5 SOLO /
 * execution ladder (§2). Writes `observation` rows. **NEVER touches
 * mastery_state** — moving certified mastery is Stage-2, tutor-in-the-loop (§6),
 * which needs a tutor surface we don't have yet.
 *
 * The answer is read the same way whether it was TYPED or handwritten: a typed
 * answer rides in `answer_text`; a PHOTO answer (Slice Q3) has `answer_text` null
 * and its `attempt_image` rows are loaded, fetched from object storage, and sent
 * to the SAME per-axis Gemini call as inline images (multimodal, Q3-2). The
 * ladders + the blind/abstain rules are identical for both.
 *
 * The two system prompts below ARE the v0 agent prompts (Polaris frame 3: the
 * skill file becomes the agent's system prompt) — faithful distillations of
 * assessment.md §2. The data turn carries the sub-topic's LOs (the
 * what-good-looks-like target), the question + reference answer (grader context,
 * D-AI1-2), and the student's answer + signals.
 *
 * Abstain-capable (D-AI1-3): an axis the question/answer didn't expose yields NO
 * observation (applicable=false → no row), per §2's "bound" — an unexposed axis
 * is a coverage gap, never a low level.
 *
 * Idempotent (D-AI1-1): re-scoring an attempt deletes its prior Stage-1
 * observations first (dedupe by attempt_id), so a retried job can't double-write.
 */
import { and, asc, eq } from "drizzle-orm";
import type { PgTransaction } from "drizzle-orm/pg-core";
import { z } from "zod";
import {
  attempt,
  attemptImage,
  crossConceptFlag,
  eventLog,
  learningObjective,
  masteryHistory,
  masteryState,
  observation,
  question,
  schedulingState,
  subTopic,
  transcript,
} from "@b2c/kernel/schema";
import { Type } from "@google/genai";
import { withBoard } from "../db/with-board";
import { geminiJson } from "./ai/gemini";
import { getObject } from "./object_storage";
import { assertTutorsStudent } from "./tutor";

type Tx = PgTransaction<any, any, any>;

const STAGE1_SOURCE = "stage1_scorer";

export class AttemptNotFoundError extends Error {
  readonly code = "ATTEMPT_NOT_FOUND";
  constructor(attemptId: string) {
    super(`no attempt ${attemptId} on this board`);
    this.name = "AttemptNotFoundError";
  }
}

// ───────────────────────── the per-axis read contract ─────────────────────────

// What each Gemini call returns. `applicable=false` ⇒ the answer/question did
// not expose this axis ⇒ NO observation written (§2 bound). When applicable,
// `level` is 1–5.
const axisReadSchema = z.object({
  applicable: z.boolean(),
  level: z.number().int().min(1).max(5).nullable(),
  reasoning: z.string().min(1),
  calibrationFlag: z.enum(["over", "under"]).nullable().default(null),
  nonSubtopicNote: z.string().nullable().default(null),
});
type AxisRead = z.infer<typeof axisReadSchema>;

// Gemini structured-output schema mirroring axisReadSchema.
const geminiResponseSchema = {
  type: Type.OBJECT,
  properties: {
    applicable: {
      type: Type.BOOLEAN,
      description:
        "true only if the answer/question actually exposed THIS axis; false = coverage gap (no observation)",
    },
    level: {
      type: Type.INTEGER,
      nullable: true,
      description: "the 1–5 rung when applicable; null when applicable=false",
    },
    reasoning: {
      type: Type.STRING,
      description: "the deconstructed read — WHY this rung (or why not applicable)",
    },
    calibrationFlag: {
      type: Type.STRING,
      nullable: true,
      enum: ["over", "under"],
      description:
        "'over' = high confidence + low rung; 'under' = low confidence + high rung; null otherwise. Secondary flag, never sets the level.",
    },
    nonSubtopicNote: {
      type: Type.STRING,
      nullable: true,
      description:
        "anything this answer reveals that does NOT belong to this sub-topic: an adjacent-skill slip (name the other concept + what broke), a hint of a gap in another chapter, or a horizontal-skill signal (language precision, quantitative thinking, diagram reading, …). Detection only — do not judge or categorise it here. null when the answer stays inside the sub-topic",
    },
  },
  required: ["applicable", "reasoning"],
} as const;

const CONCEPTUAL_SYSTEM = `You score ONE student answer on the CONCEPTUAL axis only: how well the reasoning shows the PRINCIPLE behind the sub-topic's conceptual learning objectives — named, connected, carried to new cases — INDEPENDENT of whether the final answer is right.

You are BLIND to the student's history, current level, and any expected level. Score this answer on its own merits.

STEP 1 — Isolate the reasoning. Pull out exactly what the student offered as justification: the links ("because…", "so…", "this means…", "if… then…"), the principles named, the connections drawn, how they handled any twist. Set the final number/answer aside; score the EXTRACTED reasoning, not the prose or the boxed result.

STEP 2 — Place it on the 5 rungs:
1 Misses the point: restates the question, a tautology, an irrelevant reason, or only names a rule with no meaning; freezes/misapplies on a twist.
2 One idea: one relevant aspect, then stops; no connection.
3 Several, unlinked: several correct points LISTED not connected ("and… and…"); explains WHAT not WHY; justification correct but local to this problem. (The shallow plateau.)
4 Connected to principle: integrates the pieces, explains WHY, links to the underlying principle, reasons counterfactually, handles a non-routine variant by reasoning FROM the principle. (The shallow→deep jump.)
5 Generalises: everything in 4 AND carries the principle to an UNTAUGHT context/new domain.

GATES: 3→4 is connection, not count — the single most important line. 4→5 requires transfer to a context NOT taught on (drilled variants are still 4).

BOUND (critical): you can only read a rung the answer gives evidence for. A bare correct answer with NO "why" exposes NO conceptual reasoning → return applicable=false (NOT a low level — an unexposed axis is a coverage gap, not weakness). A routine question demanding no explanation cannot yield a high conceptual rung however cleanly answered.

DO NOT reward eloquence — length/fluency is not depth. Score the connections, not the word count.

IF THE FINAL ANSWER IS WRONG, locate the break (Newman): reading / comprehension / transformation are CONCEPTUAL failures and lower the rung; process-skill / encoding slips are PROCEDURAL — they do NOT dent the conceptual read (sound reasoning ruined by an arithmetic slip still scores conceptually high).

CALIBRATION: if the student's confidence clashes with their reasoning quality, set calibrationFlag ('over' = confident but low rung, 'under' = unsure but high rung). It NEVER moves the level.

NON-SUBTOPIC SIGNAL (purely ADDITIVE — it never changes your read): you are the only reader who ever sees this raw answer, so anything you don't capture is lost. If the answer reveals something that does NOT belong to this sub-topic — a misconception from another chapter, a prerequisite gap, or a horizontal-skill signal (imprecise language, weak quantitative sense, misread diagram/notation) — record it in nonSubtopicNote: name what you saw and where it seems to belong. DETECTION ONLY; a later stage evaluates it. Decide applicable and level EXACTLY as you would if this field did not exist, then fill it in — noticing non-subtopic material NEVER lowers the rung and NEVER makes the axis inapplicable. In particular: an answer that reasons about a NEIGHBOURING concept rather than this sub-topic's stated LOs is still conceptual reasoning — score it and note the mismatch; do NOT abstain. null when the answer stays inside the sub-topic.

Return applicable=false ONLY when the answer/question exposed no conceptual reasoning AT ALL (no "why" offered) — never merely because the reasoning sits outside this sub-topic's LOs.`;

const PROCEDURAL_SYSTEM = `You score ONE student answer on the PROCEDURAL axis only: how fluently the student EXECUTED the procedure the sub-topic's learning objectives target — INDEPENDENT of whether the final answer is right (a clean wrong answer can be a slip; a correct one can be laboured). Read EXECUTION, never speed alone.

You are BLIND to the student's history, current level, and any expected level.

STEP 1 — Gather execution signals: speed vs a reasonable expectation, smoothness, self-corrections / crossings-out / restarts, compressed vs laboured steps, hesitation, and method choice. Treat timing as NOISY and corroborating, not deciding (large times may be idle/typing; very short may be a lookup). No single signal sets the rung, least of all speed.

STEP 2 — Place execution on the 5 rungs:
1 Can't execute: can't start/abandons, steps out of order, the METHOD itself is broken (not just a slip).
2 Struggling: reaches the answer with visible FRICTION — uncompressed sub-steps, self-corrections, restarts, occasional slips; rigidly one method; slow.
3 Reliable but deliberate: right and clean, method solid and repeatable, few self-corrections — but walks every step explicitly, no compression. (Most solid work sits here — that is fine.)
4 Automatic: fast vs expectation, smooth, COMPRESSED steps (skips obvious intermediates), few/no self-corrections.
5 Automatic + flexible: all of 4 PLUS chooses an efficient/non-standard method or adapts to an atypical case.

Rungs 4–5 are aspirational — do not inflate without the speed/compression (4) or flexibility (5) actually shown.

BOUND (critical): a question demanding no real execution (a pure "explain why") yields NO procedural observation → return applicable=false. You can only score a rung the execution gives evidence for.

SLIP PLACEMENT: a slip in THIS procedure (arithmetic/sign/units/notation) CAPS the rung (keeps them out of 4–5). A slip in a DIFFERENT adjacent skill (they ran the target procedure well but stumbled on a prerequisite from another concept) does NOT lower this rung — score the target procedure on what they showed and record it in nonSubtopicNote (see below). Choosing the WRONG method entirely is CONCEPTUAL, not procedural — don't penalise execution for it here.

NON-SUBTOPIC SIGNAL (purely ADDITIVE — it never changes your read): you are the only reader who ever sees this raw answer, so anything you don't capture is lost. Record in nonSubtopicNote anything the execution reveals that does NOT belong to this sub-topic: the adjacent-skill slip above (name the other concept + what broke), a prerequisite gap from another chapter, or a horizontal-skill signal (sloppy notation, weak arithmetic sense, misread diagram). DETECTION ONLY; a later stage evaluates it. Decide applicable and level EXACTLY as you would if this field did not exist, then fill it in — noticing non-subtopic material NEVER lowers the rung and NEVER makes the axis inapplicable. null when the answer stays inside the sub-topic.

CALIBRATION: confidence clashing with execution quality → calibrationFlag ('over'/'under'); never moves the level.

Return applicable=false when the question/answer offered no real execution to read.`;

// ───────────────────────── the read ─────────────────────────

interface ScoreResult {
  attemptId: string;
  scored: boolean; // false = skip/no-answer, nothing to read
  axesRun: string[];
  observationsWritten: number;
}

/**
 * Score one attempt (opens its own board-scoped tx — the worker job and the
 * probe both call this with just boardId + attemptId; RLS binds inside).
 */
export async function scoreAttempt(
  boardId: string,
  attemptId: string,
): Promise<ScoreResult> {
  return withBoard(boardId, async (tx) => {
    const [a] = await tx.select().from(attempt).where(eq(attempt.id, attemptId));
    if (!a) throw new AttemptNotFoundError(attemptId);

    // A skip carries no answer to read — nothing to score (the attempt is still
    // captured evidence for Stage-2's coverage view, just not Stage-1-scorable).
    if (a.skipReason) {
      return { attemptId, scored: false, axesRun: [], observationsWritten: 0 };
    }

    // Answer photos (Q3-2): a photo answer has answer_text null — the answer IS
    // the image(s). Load them once (both axes reuse the same bytes), lowest
    // ordinal first, and decode to base64 for the multimodal Gemini call. Text
    // answers have no rows here → images stays empty (the text path is unchanged).
    const imgRows = await tx
      .select()
      .from(attemptImage)
      .where(eq(attemptImage.attemptId, attemptId))
      .orderBy(asc(attemptImage.ordinal));

    // Nothing to read at all (no typed answer AND no photos) → not scorable.
    if (!a.answerText && imgRows.length === 0) {
      return { attemptId, scored: false, axesRun: [], observationsWritten: 0 };
    }

    const images: Array<{ mimeType: string; data: string }> = [];
    for (const r of imgRows) {
      const bytes = await getObject(r.storageKey);
      images.push({ mimeType: r.mime, data: Buffer.from(bytes).toString("base64") });
    }

    const [q] = await tx
      .select()
      .from(question)
      .where(eq(question.id, a.questionId));
    if (!q) throw new AttemptNotFoundError(attemptId); // RLS-invisible question

    const [st] = await tx
      .select()
      .from(subTopic)
      .where(eq(subTopic.id, q.subTopicId));
    const los = await tx
      .select()
      .from(learningObjective)
      .where(eq(learningObjective.subTopicId, q.subTopicId));

    // Idempotency (D-AI1-1): clear this attempt's prior Stage-1 reads first.
    await tx
      .delete(observation)
      .where(
        and(
          eq(observation.attemptId, attemptId),
          eq(observation.source, STAGE1_SOURCE),
        ),
      );

    // Which axes does the question's tag put on offer? (§2 Step 3 — read the
    // axis tag.) 'both' → run both; the call still abstains if the answer
    // didn't actually expose that axis.
    const axes: Array<"conceptual" | "procedural"> =
      q.axis === "both"
        ? ["conceptual", "procedural"]
        : q.axis === "procedural"
          ? ["procedural"]
          : ["conceptual"];

    const subTopicName = st?.name ?? "(unknown sub-topic)";
    let written = 0;

    for (const axis of axes) {
      const read = await runAxisCall(axis, {
        subTopicName,
        los: los
          .filter((lo) => lo.axis === axis || lo.axis === "both")
          .map((lo) => lo.description),
        stem: q.stem,
        referenceAnswer: q.referenceAnswer,
        explanation: q.explanation,
        pedagogicalNote: q.pedagogicalNote,
        answerText: a.answerText,
        images,
        confidence: a.confidence,
        timeMs: a.timeMs,
        attemptId,
      });

      // Bound: no observation when the axis wasn't exposed (§2).
      if (!read.applicable || read.level == null) continue;

      await tx.insert(observation).values({
        boardId,
        studentId: a.appUserId,
        subTopicId: q.subTopicId,
        questionId: q.id,
        attemptId,
        axis,
        observationLevel: read.level,
        reasoning: read.reasoning,
        signals: {
          confidence: a.confidence ?? null,
          timeMs: a.timeMs ?? null,
          model: process.env.GEMINI_MODEL ?? "gemini-3-flash-preview",
          // Forensics: this read was of a photo answer (Q3-2), not typed text.
          ...(images.length ? { photoCount: images.length } : {}),
        },
        // S2R-1: the non-subtopic signal is a real column now (both axes), no
        // longer buried in signals. Legacy rows keep signals.crossConceptNote;
        // readers fall back.
        nonSubtopicNote: read.nonSubtopicNote,
        calibrationFlag: read.calibrationFlag,
        pedagogicalComment: q.pedagogicalNote,
        source: STAGE1_SOURCE,
      });
      written++;
    }

    return {
      attemptId,
      scored: true,
      axesRun: axes,
      observationsWritten: written,
    };
  });
}

interface AxisCallInput {
  subTopicName: string;
  los: string[];
  stem: string;
  referenceAnswer: string;
  explanation: string | null;
  pedagogicalNote: string | null;
  // Typed answer, or null when the answer is handwritten in the photo(s).
  answerText: string | null;
  // Answer photos (Q3-2), base64. Empty for a typed answer.
  images: Array<{ mimeType: string; data: string }>;
  confidence: number | null;
  timeMs: number | null;
  attemptId: string;
}

async function runAxisCall(
  axis: "conceptual" | "procedural",
  i: AxisCallInput,
): Promise<AxisRead> {
  const loBlock = i.los.length
    ? i.los.map((d, n) => `  ${n + 1}. ${d}`).join("\n")
    : "  (no learning objectives recorded for this sub-topic — judge against the question's evident target)";

  const prompt = `SUB-TOPIC: ${i.subTopicName}

${axis.toUpperCase()} LEARNING OBJECTIVES (what good looks like — score against these, NOT a per-LO scoreboard):
${loBlock}

QUESTION (what it demands tells you whether this axis was even on offer):
${i.stem}

REFERENCE ANSWER (grader context — what a correct response looks like; you are NOT scoring against the student's history):
${i.referenceAnswer}${i.explanation ? `\n\nEXPLANATION: ${i.explanation}` : ""}${
    i.pedagogicalNote ? `\n\nAUTHOR'S INTENTION (what this question probes): ${i.pedagogicalNote}` : ""
  }

STUDENT ANSWER:
${
    i.images.length
      ? `The student answered ON PAPER — their answer is in the ${
          i.images.length === 1 ? "attached photo" : `${i.images.length} attached photos`
        }. Read the handwriting, including every step of working, any diagrams, crossings-out/self-corrections, and the final result.${
          i.answerText ? `\n\nTyped note alongside the photo(s): ${i.answerText}` : ""
        }`
      : i.answerText
  }

SIGNALS: self-rated confidence = ${i.confidence ?? "n/a"}/5; time taken = ${
    i.timeMs != null ? `${i.timeMs} ms` : "n/a"
  }.

Read this single answer on the ${axis} axis per your instructions. Return the structured JSON.`;

  const raw = await geminiJson<unknown>({
    label: `stage1:${axis}:${i.attemptId}`,
    systemInstruction: axis === "conceptual" ? CONCEPTUAL_SYSTEM : PROCEDURAL_SYSTEM,
    prompt,
    images: i.images.length ? i.images : undefined,
    responseSchema: geminiResponseSchema as never,
    // M28: a vision read (OCR of handwriting + working) spikes thinking well
    // above a text read — run it UNCAPPED (model default) so thinking can't
    // starve the JSON. Text answers keep the default ceiling. Timeout + retry
    // remain the runaway guards.
    maxOutputTokens: i.images.length ? null : undefined,
  });

  return axisReadSchema.parse(raw);
}

// ════════════════════════════ Stage-2 — the mastery move ════════════════════════════
//
// Slice S2 — the end-of-assignment, tutor-in-the-loop certification (assessment.md
// §3 + §6). The ONLY place mastery moves. Two halves:
//   - draftStage2: ONE Gemini call reads ALL of a sub-topic's Stage-1 observations
//     + the current mastery_state (or null = cold start) + the LOs + datetimes,
//     applies §3's raise/lower rule + the spacing gaps IN THE LLM (§6.2), and
//     PROPOSES the new pair + description + log + the two re-check dates. Reads only,
//     re-runnable — no draft table (D-S2-1).
//   - finalizeStage2: the tutor-adjusted proposal is committed in ONE tx — snapshot
//     → mastery_history; overwrite mastery_state; append transcript(stage2);
//     append event_log (stage2_finalize always; assessment_override SEPARATELY when
//     the tutor changed the draft, §6; taught/G2 when newly ≥L2 either axis);
//     upsert scheduling_state (climb + retention + taughtAt).
//
// v0 = "draft-then-form" (one AI call + a structured review screen), NOT the full
// conversational Polaris #2 agent. The tutor edits the levels + description (§6's
// tutor-editable set); log / dates / reasoning / flags are AI-authored, read-only.

export class SubTopicNotFoundError extends Error {
  readonly code = "SUB_TOPIC_NOT_FOUND";
  constructor(subTopicId: string) {
    super(`no sub_topic ${subTopicId} on this board`);
    this.name = "SubTopicNotFoundError";
  }
}

export class NoObservationsError extends Error {
  readonly code = "NO_OBSERVATIONS";
  constructor(subTopicId: string) {
    super(`no Stage-1 observations to certify for sub_topic ${subTopicId}`);
    this.name = "NoObservationsError";
  }
}

const STAGE2_SYSTEM = `You are the Stage-2 assessor. You turn a stream of Stage-1 per-answer OBSERVATIONS into the CERTIFIED mastery for ONE sub-topic, on BOTH axes (conceptual + procedural). This is the ONLY place certified mastery moves — be conservative and faithful to the rule below.

TWO TERMS, KEPT APART:
- observation level = what a SINGLE answer demonstrated (already scored, given to you).
- certified level = the stored 1–5 for the sub-topic on an axis; it accumulates from many observations. You output this.

TUTOR-CORRECTED OBSERVATIONS: an observation marked "⚠ TUTOR-CORRECTED" was re-read by the tutor, who overruled the Stage-1 scorer. The obs-level shown IS the tutor's — count it, and do NOT re-litigate it back toward the machine's number. The tutor wins on the evidence (§6); their reason is given so you can reflect it in the description/log, not so you can argue with it.

THE QUALIFYING-OBSERVATION RULE (read first): "N observations at level X" means N SEPARATE answers each at observation level X OR HIGHER — not N answers of any level. Counts are per sub-topic × axis (the LOs pool), never per-LO.

TO CERTIFY A LEVEL — both conditions required:
CONCEPTUAL axis: L1=1 obs · L2=1 obs · L3=2 obs · L4=2 obs, ≥1 on a transfer/variant item, AND a ≥1-week gap between some two qualifying obs · L5=3 obs, ≥1 on a far-transfer/untaught item, AND a ≥2-week gap.
PROCEDURAL axis: L1=1 obs · L2=1 obs · L3=3 obs AND a ≥1-day gap · L4=4 obs (sustained speed+accuracy) AND a ≥2-week gap · L5=5 obs, ≥1 a flexibility/non-standard-method item, AND a ≥3-week gap.
Spacing is measured between the qualifying observations THEMSELVES (sub-topic level): the gap just has to exist between SOME two of them. Whether an item was a transfer/variant/flexibility probe you read from its AUTHOR'S INTENTION (the pedagogical comment), not a tag.

HOW THE CERTIFIED LEVEL MOVES:
- UP only when the next level's BOTH conditions are met — NEVER on a single standout answer.
- DOWN immediately on a CLEAR failure at the current level: an observation below the current level for a SUBSTANTIVE reason (wrong reasoning = conceptual; broken/abandoned method = procedural rung 1). A careless slip is NOT a drop (Stage-1 already kept it out of the upward count).
- TIME does nothing on its own. A level only changes in response to answers.
- Hold otherwise — when evidence is thin or an item couldn't expose the axis, STAY at the current certified level and say "not enough to move."

COUNTS + SPACING ARE A RULE YOU EXECUTE FAITHFULLY, not your discretion — derive them exactly from the observations + the datetimes given. Your genuine judgment is narrow: does an answer actually COVER an LO, and are the sub-topic's LOs covered (coverage attribution).

NEVER INVENT A LEVEL YOU HAVE NO EVIDENCE FOR. If an axis has NO qualifying observations:
- there IS a current certified level for it → HOLD it there (unchanged) and add a coverage-gap flag;
- there is NO current level for it (this axis has never been observed) → return **null** for that axis and add a coverage-gap flag naming what to serve next.
Null means NOT YET OBSERVED — it is NOT a low level. An item that couldn't expose an axis is a coverage gap, never evidence of weakness, so it must never be recorded as a 1. (Both axes null is impossible here — you are only ever called with at least one observation.)

COLD START (no current mastery state): certify from these observations alone; write the description + log fresh. An axis with no observations in that set is null, not 1.

OUTPUT:
- conceptualLevel, proceduralLevel (1–5, or null = not yet observed) — the certified pair, the whole standing (no fused score).
- description: ONE dense blob spanning both axes. It MUST state BOTH halves, explicitly, EVERY time: (a) what the student CAN do — the ground they actually hold; and (b) what they STRUGGLE with — what improvement is needed next. A description that praises without naming a gap, or lists gaps without crediting what is solid, is incomplete. User-visible. Fold any calibration flags into this prose.
  This is a REPORTING contract, and it is purely about HOW YOU WRITE this one field. It changes NOTHING you certify: decide conceptualLevel, proceduralLevel, applicability, the dates and the flags EXACTLY as you would if this paragraph did not exist. Naming a struggle is not evidence for a lower level, and naming a strength is not evidence for a higher one — the rung comes from the qualifying-observation rule above, and from nothing else.
  If an axis is null (NOT YET OBSERVED), say so plainly — "we have not yet seen them execute this" — and do NOT invent a struggle to fill the half. An unobserved axis is a coverage gap, never a weakness.
  If an axis is genuinely TOPPED OUT (certified 5 — nothing left to climb on it), do NOT manufacture a weakness to satisfy the both-halves rule: say plainly that the axis is fully mastered. The struggle half binds only where real ground is left to gain. Inventing a gap the evidence does not show is a REPORTING error, exactly as bad as omitting a real one.
- log: your internal working notes — qualifying-obs counts per axis, LO coverage, #questions at each rating, whether the spacing criteria were met. Not shown to the student.
- climbNextDue (YYYY-MM-DD or null): the date to re-ask so a ready student can climb — the LAST qualifying observation's date + the gap the NEXT level needs. Null when the climbable axis is already topped out (both at 5, or nothing left to climb). This is the ONE date you emit: it needs your judgment (which level is being climbed, which observations qualified). The anti-fade RETENTION date is NOT yours — it is pure arithmetic off the procedural level and the scheduler derives it. Do not compute or mention it.
- reasoning: why each axis landed where it did (the move + its justification).
- flags: coverage gaps ("stuck at 3: no transfer item served"), cross-concept notes carried from Stage-1, and calibration flags.`;

export const stage2DraftSchema = z.object({
  // null = NOT YET OBSERVED (never "level 1") — see mastery_state in the kernel schema.
  conceptualLevel: z.number().int().min(1).max(5).nullable().default(null),
  proceduralLevel: z.number().int().min(1).max(5).nullable().default(null),
  description: z.string().min(1),
  log: z.string().min(1),
  // ASSESS-FIX-3: climb is the ONLY date Stage-2 emits. Retention is a pure
  // function of the procedural level (the 3/7/14/21 ladder) and is DERIVED by the
  // scheduler — one owner, one home. Asking the LLM for it too gave us two sources
  // that could disagree, and the stored copy was already dead (D-SCH-1).
  climbNextDue: z.string().nullable().default(null),
  reasoning: z.string().min(1),
  flags: z.array(z.string()).default([]),
});
export type Stage2Draft = z.infer<typeof stage2DraftSchema>;

const stage2GeminiSchema = {
  type: Type.OBJECT,
  properties: {
    conceptualLevel: {
      type: Type.INTEGER,
      nullable: true,
      description: "certified conceptual level 1–5, or null = never observed (NOT a 1)",
    },
    proceduralLevel: {
      type: Type.INTEGER,
      nullable: true,
      description: "certified procedural level 1–5, or null = never observed (NOT a 1)",
    },
    description: {
      type: Type.STRING,
      description:
        "dense blob, both axes; USER-VISIBLE. MUST state both what the student CAN do and what they STRUGGLE with, explicitly, every time — EXCEPT where an axis is null (not yet observed) or topped out at 5, where naming the absence beats inventing a gap",
    },
    log: {
      type: Type.STRING,
      description: "internal working notes: counts / LO coverage / #Qs per rating / spacing met",
    },
    climbNextDue: {
      type: Type.STRING,
      nullable: true,
      description: "YYYY-MM-DD re-check to climb, or null if topped out",
    },
    reasoning: { type: Type.STRING, description: "why each axis landed where it did" },
    flags: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "coverage gaps, cross-concept notes, calibration flags",
    },
  },
  required: ["conceptualLevel", "proceduralLevel", "description", "log", "reasoning"],
} as const;

export type CurrentMastery = {
  conceptualLevel: number | null; // null = not yet observed
  proceduralLevel: number | null;
  description: string;
  log: string;
  updatedAt: Date;
};

export type Stage2DraftResult = {
  subTopicId: string;
  subTopicName: string;
  observationCount: number;
  current: CurrentMastery | null; // null = cold start
  draft: Stage2Draft;
};

// Keep only YYYY-MM-DD (the `date` column wants a date string). Forgiving on the
// model's format — SOFT on the exact value, just don't let a bad string break the
// commit (returns null on anything that isn't an ISO-ish date prefix).
export function normalizeDate(s: string | null): string | null {
  if (!s) return null;
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(s.trim());
  return m ? m[1]! : null;
}

/**
 * Gather everything the Stage-2 call needs for one (student × sub_topic) — the
 * DB half of draftStage2, split out for S2R-2.
 *
 * WHY THE SPLIT: a sitting drafts all N of its sub-topics in PARALLEL, but a
 * single Postgres transaction cannot serve concurrent queries — firing
 * `Promise.all(ids.map(id => draftStage2(tx, …)))` would race reads on one
 * connection. So the caller gathers each input sequentially on the tx (cheap,
 * pure reads), then fans out ONLY `runStage2Call` (which touches no DB) and
 * awaits them together. Wall-clock is the slowest single call, not the sum.
 *
 * Ownership-guarded (the caller tutors this student) like every tutor read.
 */
export async function gatherStage2Input(
  tx: Tx,
  args: { tutorUserId: string; studentId: string; subTopicId: string },
): Promise<{ input: Stage2CallInput; subTopicName: string; observationCount: number; current: CurrentMastery | null }> {
  await assertTutorsStudent(tx, args.tutorUserId, args.studentId);

  const [st] = await tx
    .select()
    .from(subTopic)
    .where(eq(subTopic.id, args.subTopicId));
  if (!st) throw new SubTopicNotFoundError(args.subTopicId);

  const los = await tx
    .select()
    .from(learningObjective)
    .where(eq(learningObjective.subTopicId, args.subTopicId));

  // ALL the sub-topic's Stage-1 observations (whole history — §3 spacing needs
  // the full set, not just "pending"), oldest first so the model reads dates in order.
  const obs = await tx
    .select()
    .from(observation)
    .where(
      and(
        eq(observation.studentId, args.studentId),
        eq(observation.subTopicId, args.subTopicId),
        eq(observation.source, STAGE1_SOURCE),
      ),
    )
    .orderBy(asc(observation.createdAt));
  if (obs.length === 0) throw new NoObservationsError(args.subTopicId);

  const [cur] = await tx
    .select()
    .from(masteryState)
    .where(
      and(
        eq(masteryState.studentId, args.studentId),
        eq(masteryState.subTopicId, args.subTopicId),
      ),
    );
  const current: CurrentMastery | null = cur
    ? {
        conceptualLevel: cur.conceptualLevel,
        proceduralLevel: cur.proceduralLevel,
        description: cur.description,
        log: cur.log,
        updatedAt: cur.updatedAt,
      }
    : null;

  const input: Stage2CallInput = {
    subTopicName: st.name,
    conceptualLos: los.filter((l) => l.axis === "conceptual" || l.axis === "both").map((l) => l.description),
    proceduralLos: los.filter((l) => l.axis === "procedural" || l.axis === "both").map((l) => l.description),
    current,
    observations: obs.map((o) => ({
      axis: o.axis,
      // The EFFECTIVE level — a tutor correction (§6) supersedes the machine read
      // for every count. The machine's original + the tutor's reason ride along so
      // the model sees that a human already adjudicated this answer.
      level: o.tutorLevel ?? o.observationLevel,
      machineLevel: o.tutorLevel != null ? o.observationLevel : null,
      overrideReason: o.overrideReason,
      reasoning: o.reasoning,
      calibrationFlag: o.calibrationFlag,
      // S2R-1: real column first; legacy rows carry it in signals.
      nonSubtopicNote:
        o.nonSubtopicNote ??
        (o.signals as { crossConceptNote?: string | null } | null)?.crossConceptNote ??
        null,
      pedagogicalComment: o.pedagogicalComment,
      at: o.createdAt,
    })),
    completionAt: new Date(),
    subTopicId: args.subTopicId,
  };

  return { input, subTopicName: st.name, observationCount: obs.length, current };
}

/**
 * Build the Stage-2 proposal for one (student × sub_topic). ONE Gemini call.
 * Reads-only and re-runnable — the tutor can re-draft freely before finalizing.
 *
 * Kept as the single-sub-topic composition of gather + call. S2R-2 removed its
 * tRPC endpoint (D-S2R-5, hard cut) but the function itself is still the unit
 * every sitting is built from — assessment_session drafts N of these.
 */
export async function draftStage2(
  tx: Tx,
  args: { tutorUserId: string; studentId: string; subTopicId: string },
): Promise<Stage2DraftResult> {
  const { input, subTopicName, observationCount, current } = await gatherStage2Input(tx, args);
  const draft = await runStage2Call(input);
  return {
    subTopicId: args.subTopicId,
    subTopicName,
    observationCount,
    current,
    draft: { ...draft, climbNextDue: normalizeDate(draft.climbNextDue) },
  };
}

export interface Stage2CallInput {
  subTopicName: string;
  conceptualLos: string[];
  proceduralLos: string[];
  current: CurrentMastery | null;
  observations: Array<{
    axis: string;
    level: number; // effective (tutor correction wins)
    machineLevel: number | null; // the machine's read, when a tutor overrode it
    overrideReason: string | null;
    reasoning: string;
    calibrationFlag: string | null;
    nonSubtopicNote: string | null;
    pedagogicalComment: string | null;
    at: Date;
  }>;
  completionAt: Date;
  subTopicId: string;
}

export async function runStage2Call(i: Stage2CallInput): Promise<Stage2Draft> {
  const loList = (ls: string[]) =>
    ls.length ? ls.map((d, n) => `  ${n + 1}. ${d}`).join("\n") : "  (none recorded)";

  const lvl = (n: number | null) => (n == null ? "NOT YET OBSERVED (null — no evidence ever seen on this axis)" : String(n));

  const stateBlock = i.current
    ? `conceptual=${lvl(i.current.conceptualLevel)}, procedural=${lvl(i.current.proceduralLevel)}
last description: ${i.current.description}
last log: ${i.current.log}
last finalized: ${i.current.updatedAt.toISOString()}`
    : "COLD START — no prior mastery state for this sub-topic. Certify from these observations alone.";

  const obsBlock = i.observations
    .map(
      (o, n) =>
        `  [${n + 1}] axis=${o.axis} obs-level=${o.level} at=${o.at.toISOString()}` +
        (o.calibrationFlag ? ` calibration=${o.calibrationFlag}` : "") +
        (o.nonSubtopicNote ? ` non-subtopic="${o.nonSubtopicNote}"` : "") +
        (o.machineLevel != null
          ? `\n      ⚠ TUTOR-CORRECTED: the Stage-1 scorer read this as ${o.machineLevel}; the tutor set it to ${o.level}` +
            `${o.overrideReason ? ` — "${o.overrideReason}"` : ""}. Count ${o.level}; the tutor has already adjudicated this answer.`
          : "") +
        `\n      author's intention: ${o.pedagogicalComment ?? "(none)"}` +
        `\n      Stage-1 reasoning: ${o.reasoning}`,
    )
    .join("\n");

  const prompt = `SUB-TOPIC: ${i.subTopicName}

CONCEPTUAL LEARNING OBJECTIVES (what good looks like; pool into ONE conceptual count, not per-LO):
${loList(i.conceptualLos)}

PROCEDURAL LEARNING OBJECTIVES (pool into ONE procedural count):
${loList(i.proceduralLos)}

CURRENT MASTERY STATE:
${stateBlock}

STAGE-1 OBSERVATIONS (${i.observations.length}; oldest first — use the datetimes to apply §3's spacing gaps):
${obsBlock}

ASSIGNMENT COMPLETION DATETIME (use for the retention re-check + as "now"): ${i.completionAt.toISOString()}

Apply the rule. Propose the certified pair, the description, the log, the two re-check dates, your reasoning, and any flags. Return the structured JSON.`;

  const raw = await geminiJson<unknown>({
    label: `stage2:${i.subTopicId}`,
    systemInstruction: STAGE2_SYSTEM,
    prompt,
    responseSchema: stage2GeminiSchema as never,
    // Uncapped (model default) — the most reasoning-heavy call in the system, and
    // gemini-3's thinking spend is large + variable (observed 7.8k–8.2k+). Any
    // fixed ceiling near that risks the thinking starving the JSON; b2c prod's
    // equivalent mastery assessment call also passes NO cap. Timeout + retry guard runaway.
    maxOutputTokens: null,
  });

  return stage2DraftSchema.parse(raw);
}

export type FinalizeResult = {
  conceptualLevel: number | null; // null = not yet observed
  proceduralLevel: number | null;
  description: string;
  taught: boolean; // a `taught` (G2) event was emitted this finalize
  overridden: boolean; // the tutor changed the draft → an override was logged
  eventId: string;
};

/**
 * Commit the (tutor-adjusted) Stage-2 proposal — the mastery move. Runs inside
 * the caller's board-scoped tx (tutorProcedure → withBoard), so every write below
 * is one transaction, RLS-bound to the board.
 *
 * `final` = the tutor's edited pair + description (§6's editable set). `draft` =
 * the proposal returned by draftStage2 (round-tripped by the FE) — supplies the
 * AI-authored log / dates / reasoning / flags AND the PROPOSED values we diff
 * against to log an override separately (§6).
 */
export async function finalizeStage2(
  tx: Tx,
  args: {
    boardId: string;
    tutorUserId: string;
    studentId: string;
    subTopicId: string;
    final: {
      conceptualLevel: number | null;
      proceduralLevel: number | null;
      description: string;
    };
    draft: Stage2Draft;
  },
): Promise<FinalizeResult> {
  await assertTutorsStudent(tx, args.tutorUserId, args.studentId);

  const [st] = await tx
    .select({ id: subTopic.id })
    .from(subTopic)
    .where(eq(subTopic.id, args.subTopicId));
  if (!st) throw new SubTopicNotFoundError(args.subTopicId);

  const now = new Date();
  const { boardId, studentId, subTopicId, final, draft } = args;

  // prior state (for the history snapshot + the taught/override decisions).
  const [prior] = await tx
    .select()
    .from(masteryState)
    .where(
      and(
        eq(masteryState.studentId, studentId),
        eq(masteryState.subTopicId, subTopicId),
      ),
    );
  const [priorSched] = await tx
    .select()
    .from(schedulingState)
    .where(
      and(
        eq(schedulingState.studentId, studentId),
        eq(schedulingState.subTopicId, subTopicId),
      ),
    );

  const overridden =
    final.conceptualLevel !== draft.conceptualLevel ||
    final.proceduralLevel !== draft.proceduralLevel ||
    final.description.trim() !== draft.description.trim();

  // ≥L2 on EITHER axis crosses into the spiral. A null axis is "not yet observed",
  // so it can never trigger `taught` on its own (null → 0 for this test only).
  const newlyTaught =
    ((final.conceptualLevel ?? 0) >= 2 || (final.proceduralLevel ?? 0) >= 2) &&
    priorSched?.taughtAt == null;

  // 1. stage2_finalize event — always (the finalize is the auditable act).
  const [finalizeEvent] = await tx
    .insert(eventLog)
    .values({
      boardId,
      eventType: "stage2_finalize",
      studentId,
      tutorId: args.tutorUserId,
      subTopicId,
      before: prior
        ? { conceptual: prior.conceptualLevel, procedural: prior.proceduralLevel }
        : null,
      after: { conceptual: final.conceptualLevel, procedural: final.proceduralLevel },
      payload: { observationReasoning: draft.reasoning, coldStart: !prior },
    })
    .returning({ id: eventLog.id });
  const eventId = finalizeEvent!.id;

  // 2. assessment_override — SEPARATELY (§6), only when the tutor changed the draft.
  if (overridden) {
    await tx.insert(eventLog).values({
      boardId,
      eventType: "assessment_override",
      studentId,
      tutorId: args.tutorUserId,
      subTopicId,
      before: {
        conceptual: draft.conceptualLevel,
        procedural: draft.proceduralLevel,
        description: draft.description,
      },
      after: {
        conceptual: final.conceptualLevel,
        procedural: final.proceduralLevel,
        description: final.description,
      },
      reason: "tutor adjusted the Stage-2 draft",
    });
  }

  // 3. snapshot the PRIOR state → history (skip on cold start — nothing to snapshot).
  if (prior) {
    await tx.insert(masteryHistory).values({
      boardId,
      studentId,
      subTopicId,
      conceptualLevel: prior.conceptualLevel,
      proceduralLevel: prior.proceduralLevel,
      description: prior.description,
      log: prior.log,
      sourceEventId: eventId,
      snapshotAt: now,
    });
  }

  // 4. overwrite (or insert) the live mastery_state — the four fields (§6 contract).
  await tx
    .insert(masteryState)
    .values({
      boardId,
      studentId,
      subTopicId,
      conceptualLevel: final.conceptualLevel,
      proceduralLevel: final.proceduralLevel,
      description: final.description,
      log: draft.log,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [masteryState.studentId, masteryState.subTopicId],
      set: {
        conceptualLevel: final.conceptualLevel,
        proceduralLevel: final.proceduralLevel,
        description: final.description,
        log: draft.log,
        updatedAt: now,
      },
    });

  // 5. audit transcript — the full proposal + the final committed values + datetimes.
  await tx.insert(transcript).values({
    boardId,
    studentId,
    subTopicId,
    kind: "stage2",
    body: { proposed: draft, final, overridden },
    meta: {
      tutorId: args.tutorUserId,
      eventId,
      datetimesUsed: { completionAt: now.toISOString() },
    },
  });

  // 6. scheduling_state — the assessment's dated input to the spiral engine (#3).
  //    taughtAt: keep the existing one, else stamp now iff newly ≥L2 (G2).
  //    CLIMB ONLY (ASSESS-FIX-3): the retention date is not stored — it is a pure
  //    function of the procedural level and the scheduler derives it on read. One
  //    owner, one home; a stored copy could only ever go stale (D-SCH-1).
  const taughtAt = priorSched?.taughtAt ?? (newlyTaught ? now : null);
  await tx
    .insert(schedulingState)
    .values({
      boardId,
      studentId,
      subTopicId,
      taughtAt,
      climbNextDue: draft.climbNextDue,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [schedulingState.studentId, schedulingState.subTopicId],
      set: {
        taughtAt,
        climbNextDue: draft.climbNextDue,
        updatedAt: now,
      },
    });

  // 6b. ASSESS-FIX-4 — persist the CROSS-CONCEPT flags this sub-topic's reads raised.
  // "They ran the trigonometry fine but couldn't rationalise the denominator": that
  // slip must not dent THIS sub-topic's rung (§2 procedural Step 4), so it has to
  // leave as its own signal or it dies here. Not an observation — it carries no rung
  // (Stage-1 never read the other concept's LOs); it counts toward nothing.
  // UNIQUE(source_observation_id) → re-finalizing cannot duplicate a flag.
  const flagged = await tx
    .select({
      id: observation.id,
      signals: observation.signals,
      nonSubtopicNote: observation.nonSubtopicNote,
    })
    .from(observation)
    .where(
      and(
        eq(observation.studentId, studentId),
        eq(observation.subTopicId, subTopicId),
        eq(observation.source, STAGE1_SOURCE),
      ),
    );
  for (const o of flagged) {
    // S2R-1: real column first (both axes now emit); legacy rows fall back to
    // the old procedural-only signals.crossConceptNote.
    const note =
      o.nonSubtopicNote ??
      (o.signals as { crossConceptNote?: string | null } | null)?.crossConceptNote;
    if (!note) continue;
    await tx
      .insert(crossConceptFlag)
      .values({
        boardId,
        studentId,
        fromSubTopicId: subTopicId,
        note,
        sourceObservationId: o.id,
      })
      .onConflictDoNothing({ target: crossConceptFlag.sourceObservationId });
  }

  // 7. taught (G2) — emitted once, when the sub-topic first crosses ≥L2 either axis.
  if (newlyTaught) {
    await tx.insert(eventLog).values({
      boardId,
      eventType: "taught",
      studentId,
      tutorId: args.tutorUserId,
      subTopicId,
      payload: {
        conceptual: final.conceptualLevel,
        procedural: final.proceduralLevel,
      },
    });
  }

  return {
    conceptualLevel: final.conceptualLevel,
    proceduralLevel: final.proceduralLevel,
    description: final.description,
    taught: newlyTaught,
    overridden,
    eventId,
  };
}
