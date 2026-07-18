/**
 * Question authoring (Slice AUTH) — Polaris #1, the b2c CONTENT engine, and the
 * second AI agent in the loop (after #14 assessment). A tutor picks a sub_topic,
 * one INLINE Gemini call drafts N subjective questions aimed at that sub_topic's
 * LOs/thresholds, the tutor reviews/edits each in a form, and the approved set is
 * inserted as live `question` rows. This replaces the hand-seeded #13 stand-in
 * with real authoring; the questions feed Practice → evidence → Stage-1/Stage-2.
 *
 * Shape = "draft-then-form", a near-exact mirror of Stage-2 (assessment.ts
 * draftStage2/finalizeStage2). One structured call drafts; a structured review
 * screen edits; save commits. NO conversational re-draft loop in v0 — the tutor
 * edits manually (same cut as Stage-2 v0).
 *
 * QUESTION_AUTHOR_SYSTEM below IS the v0 agent prompt (Polaris frame 3: the skill
 * file becomes the agent's system prompt) — a faithful distillation of
 * learning-system/question-craft.md: §1 aim at the LOs/thresholds, §3 the 5-axis
 * rubric self-score (AR/MS/MR/BA/GL + an honest low), §4 depth ceiling, §5
 * subjective-by-default + generative, §6 scaffolded order.
 *
 * Decisions:
 * - D-AUTH-1 drafts live in the UI, persisted on SAVE; NO question.status column
 *   (mirrors Stage-2; new rows insert live, Practice selection untouched; existing
 *   pinned sessions per D-L-1 don't see them → fault-isolated).
 * - D-AUTH-2 runs INLINE (tutorProcedure mutation, the tutor waits) like
 *   getStage2Draft (D-S2-5). One structured call; no queue.
 * - D-AUTH-3 scope = ONE sub_topic, N subjective questions; returned ordered,
 *   saved with consecutive ordinals AFTER the sub_topic's current max (honors the
 *   scaffolded-sequence order, question-craft §6).
 * - D-AUTH-4 v0 authors CANONICAL questions to the LOs (NOT per-student weakness;
 *   question-craft §2 realtime mode deferred — questions are shared canonical per
 *   G6). So role-gate only, NO per-student ownership guard.
 * - D-AUTH-5 the 5-axis rubric self-score + honest-low reason + the author's
 *   intent are folded into `pedagogical_note` — exactly what Stage-1/Stage-2 read
 *   as "AUTHOR'S INTENTION". No schema change.
 * - D-AUTH-6 a `authoring_edit` event_log row is logged per EDITED draft (G1
 *   "tutor edits = data engine"); unedited drafts log nothing.
 */
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import type { PgTransaction } from "drizzle-orm/pg-core";
import { z } from "zod";
import {
  chapter,
  eventLog,
  learningObjective,
  question,
  questionImage,
  subTopic,
  topic,
} from "@b2c/kernel/schema";
import { Type } from "@google/genai";
import { geminiJson } from "./ai/gemini";
import { SubTopicNotFoundError } from "./assessment";
import { assertTutorsStudent } from "./tutor";
import { currentImagesFor } from "./image_read";
import { enqueueImageGeneration } from "../worker/queue";

type Tx = PgTransaction<any, any, any>;

const AUTHORING_SOURCE = "b2c_authoring";

export { SubTopicNotFoundError };

// ───────────────────────── the per-question draft contract ─────────────────────────

// Each axis defaults to 0 when absent. Gemini's responseSchema always fills all
// five, so v1 is unchanged; the default exists for the AUTH-v2 CLI-Claude path,
// which is prompted for JSON (no schema enforcement — micro-decision #2) and
// occasionally omits a sub-field. The rubric is advisory author-intention
// metadata folded into pedagogical_note, never the question itself — a missing
// self-score must not crash authoring.
const rubricSchema = z.object({
  ar: z.number().int().min(0).max(2).default(0),
  ms: z.number().int().min(0).max(2).default(0),
  mr: z.number().int().min(0).max(2).default(0),
  ba: z.number().int().min(0).max(2).default(0),
  gl: z.number().int().min(0).max(2).default(0),
});
export type Rubric = z.infer<typeof rubricSchema>;

// Optional figure SPEC for a question (Starkhorn's QuestionImage shape). The AI
// authors a matplotlib figure BRIEF (description + what it must show / must not
// show); a later render pipeline turns it into an image and fills `file`. NULL =
// no figure. Stored on save into question.image (jsonb); render deferred.
const imageSpecSchema = z
  .object({
    description: z.string().min(1),
    shows: z.array(z.string()).default([]),
    hides: z.array(z.string()).default([]),
  })
  .nullable()
  .default(null);
export type ImageSpec = z.infer<typeof imageSpecSchema>;

// One authored question as the model returns it. `intent` = the author's
// intention (what this question probes) — folded into pedagogical_note on save.
export const draftItemSchema = z.object({
  axis: z.enum(["conceptual", "procedural", "both"]),
  stem: z.string().min(1),
  referenceAnswer: z.string().min(1),
  explanation: z.string().nullable().default(null),
  intent: z.string().min(1),
  rubric: rubricSchema.default({}), // tolerant: CLI-Claude may omit it (see rubricSchema)
  honestLowReason: z.string().min(1),
  image: imageSpecSchema, // optional figure brief; null when none needed
});
export type DraftItem = z.infer<typeof draftItemSchema>;

// Exported for reuse by the AUTH-v2 conversational authoring call
// (authoring_chat.ts), which wraps the SAME question-craft bar + draft contract
// around a student-grounded conversation (D-AUTH2: reuse v1's prompt + schema).
export const draftBatchSchema = z.object({
  questions: z.array(draftItemSchema).min(1),
});

export const geminiQuestionSchema = {
  type: Type.OBJECT,
  properties: {
    questions: {
      type: Type.ARRAY,
      description:
        "the authored questions, IN SCAFFOLDED ORDER (each builds a facet; the closer consolidates)",
      items: {
        type: Type.OBJECT,
        properties: {
          axis: {
            type: Type.STRING,
            enum: ["conceptual", "procedural", "both"],
            description:
              "which axis this question primarily exposes — 'both' when it demands reasoning AND execution",
          },
          stem: {
            type: Type.STRING,
            description:
              "the question as the student sees it; self-contained (restate any numbers a prior question set up); multi-ask stems split into (a)/(b) parts on their own lines, every part/question ending with its marks in square brackets e.g. [2 marks]",
          },
          referenceAnswer: {
            type: Type.STRING,
            description:
              "the model answer / mark scheme — what a correct response looks like (server-side, never shown pre-submit)",
          },
          explanation: {
            type: Type.STRING,
            nullable: true,
            description: "optional teaching note expanding the reference answer; null if none",
          },
          intent: {
            type: Type.STRING,
            description:
              "AUTHOR'S INTENTION: which LO/threshold this aims at + what kind of probe it is (transfer / variant / flexibility / fluency). The assessor reads method-choice + transfer intent from here.",
          },
          rubric: {
            type: Type.OBJECT,
            description: "the 5-axis self-score, each 0/1/2",
            properties: {
              ar: { type: Type.INTEGER, description: "Algorithmic Resistance 0–2" },
              ms: { type: Type.INTEGER, description: "Misconception Sensitivity 0–2" },
              mr: { type: Type.INTEGER, description: "Multi-Representation 0–2" },
              ba: { type: Type.INTEGER, description: "Boundary Awareness 0–2" },
              gl: { type: Type.INTEGER, description: "Generative Load 0–2" },
            },
            required: ["ar", "ms", "mr", "ba", "gl"],
          },
          honestLowReason: {
            type: Type.STRING,
            description:
              "the ONE axis owned honestly at 0 or 1, named + why (the honesty anchor — no question is 2 on all five)",
          },
          image: {
            type: Type.OBJECT,
            nullable: true,
            description:
              "a figure SPEC when a clean line diagram would help the student (ray diagram, circuit, force vectors, labelled geometry, chart) — author the STRUCTURED spec rather than describing a diagram in the stem prose; null only when no figure fits.",
            properties: {
              description: {
                type: Type.STRING,
                description: "one sentence describing the clean matplotlib figure to draw",
              },
              shows: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: "3–6 elements the figure MUST show (labels, angles, arrows)",
              },
              hides: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: "things the figure must NOT show",
              },
            },
            required: ["description"],
          },
        },
        required: ["axis", "stem", "referenceAnswer", "intent", "rubric", "honestLowReason"],
      },
    },
  },
  required: ["questions"],
} as const;

export const QUESTION_AUTHOR_SYSTEM = `You are the question-authoring agent for an exam-prep tutoring system. You write a SHORT, ORDERED set of SUBJECTIVE questions for ONE sub-topic, aimed at its learning objectives. The tutor reviews and edits each before it goes live — write to the bar below so little editing is needed.

§1 AIM AT THE LOs / THRESHOLDS. Every question is FOR something specific — name the target LO before writing the stem. Weight toward the hardest conceptual leaps; a question that is merely on-topic is wasted. Probe the leap, don't enumerate it.

§3 THE RUBRIC — self-score every question on five axes, each 0/1/2:
  AR Algorithmic Resistance — can't be answered by blindly running a memorised procedure.
  MS Misconception Sensitivity — a wrong answer maps to a SPECIFIC real misconception, not a slip.
  MR Multi-Representation — uses/links more than one representation (graph, diagram, table, equation, words).
  BA Boundary Awareness — probes where a rule/assumption/formula breaks down or holds.
  GL Generative Load — the student must construct, explain, or decide — not select or compute.
  THE BAR: every axis ≥ 1 AND at least three axes ≥ 2. A question that can't clear it — revise it before returning it.
  HONESTY ANCHOR: NO question scores 2 on all five. Each must own ≥ 1 axis honestly at 0 or 1, with a one-line reason (honestLowReason). Without this the rubric stops biting.
  (The rubric is the bar for higher-order conceptual/transfer questions. A pure fluency-drill — speed + accuracy the legitimate point — need not clear it; say so in its honest-low.)

§4 DEPTH CEILING — pitch the THINKING high, framed in the grade's content. Hard thinking on in-scope material — never reach for out-of-scope content to manufacture difficulty.

§5 SUBJECTIVE + GENERATIVE — every question is subjective: anchor a setup, then ask WHY / WHAT WOULD CHANGE IF / STATE THE RULE IN YOUR OWN WORDS. The articulation is what builds the understanding and what the assessor later reads — a bare letter exposes no reasoning. Do NOT write multiple-choice. "Show your working" keeps procedural thinking visible.

§6 SCAFFOLDED ORDER — return the questions as an ORDERED sequence that builds the sub-topic's model: each builds a specific facet (if two swap with no loss it's a pile, not a sequence). Make a hard leap reachable — embed a hint, then a question or two later ask the student to restate it in their own words. CLOSE with consolidation (unify the facets), not a new fight. Keep each stem self-contained — restate the critical numbers/results, students resume after days.

§6b EXAM PRESENTATION — format every stem the way it would appear on a real exam paper. Parts: if a stem asks for more than one deliverable, split it into labelled parts — (a), (b), (c) (use (i), (ii) for sub-parts) — each part on its OWN LINE, one ask per part; never bury two or three asks in one run-on paragraph. The setup/scenario comes first as plain prose; the asks follow as labelled parts. Marks: EVERY question carries marks — end each part with its marks in square brackets, e.g. "[2 marks]" ("[1 mark]" when singular); a single-ask question gets one "[n marks]" at the end of the stem. Size a part's marks to the thinking it demands, in the grade's exam style. Mirror the same part labels in referenceAnswer so the mark scheme allocates marks per part. (Labelled parts within one stem are formatting only — the student still answers in one response.) Math notation: write mathematics as inline TeX delimited by $...$ (display blocks $$...$$) — e.g. $10\\ \\Omega$, $V = IR$. NEVER use \\(...\\) delimiters or bare TeX commands outside dollars — only $-delimited TeX is rendered; anything else reaches the student as raw markup. Simple values may use plain unicode (12 V, 30°) instead.

AXIS TAG — set axis to 'conceptual' (reasoning/why), 'procedural' (execution/working), or 'both'. The default conceptual question is 'conceptual'; a show-your-working computation is 'procedural'.

INTENT — for each question, write the author's intention: the LO/threshold it aims at and what KIND of probe it is (routine / variant / transfer / far-transfer / flexibility / fluency). The downstream assessor reads transfer-intent and method-choice from this field, so be precise.

§7 FIGURES (image) — a matplotlib figure renderer IS available. For each question, ask yourself whether a clean line diagram would help the student understand or unlock a richer scenario — use your judgement, no quota, no ceiling. When a figure helps, AUTHOR THE STRUCTURED image SPEC (description + shows + hides). Do NOT merely describe a diagram in the stem prose while leaving image null — if a question involves a figure, the structured spec MUST be present. When the tutor explicitly asks for diagrams/figures, author a spec on the questions where one genuinely fits (don't force one where it adds nothing). SPEC shape: description = one sentence describing the clean matplotlib figure; shows = 3-6 elements it MUST contain (labels, angles, arrows); hides = things it must NOT show. It renders as textbook line-art (matplotlib) — never a photo or anything needing rich colour/texture; if it can't be drawn that way, use words instead and set image=null. GUARD (the render can fail): keep every stem answerable from its TEXT ALONE — describe the essential arrangement in words too (e.g. "a block on a 30° incline with friction acting up the slope"), so a student who never sees the image can still answer. Do not make a figure the ONLY way to get the setup. NEVER reference the figure in the stem text: phrases like "in the circuit shown", "the diagram below", "as shown in the figure", "the setup shown" are BANNED — a render can fail verification and be withheld, and a stem that points at a missing figure is broken for the student. Write the setup fully in words; when the figure passes it simply appears alongside as reinforcement, unreferenced.

Return ONLY the structured JSON: a "questions" array in sequence order.`;

// ───────────────────────── draft ─────────────────────────

export type AuthorDraftResult = {
  subTopicId: string;
  subTopicName: string;
  topicName: string;
  chapterName: string;
  conceptualLos: string[];
  proceduralLos: string[];
  nextOrdinal: number; // where these would slot in (current max + 1)
  drafts: DraftItem[];
};

/**
 * Draft N subjective questions for one sub_topic. ONE Gemini call. Reads-only and
 * re-runnable — the tutor can re-draft freely before saving. Role-gated only
 * (tutorProcedure); authoring is BOARD content, not per-student, so there is no
 * ownership guard (D-AUTH-4). RLS scopes the sub_topic read to the active board.
 */
export async function draftQuestions(
  tx: Tx,
  args: {
    tutorUserId: string;
    subTopicId: string;
    count: number;
    axisFocus?: "conceptual" | "procedural" | "both" | null;
    intent?: string | null;
  },
): Promise<AuthorDraftResult> {
  const [st] = await tx
    .select({
      id: subTopic.id,
      name: subTopic.name,
      topicName: topic.name,
      chapterName: chapter.name,
    })
    .from(subTopic)
    .innerJoin(topic, eq(topic.id, subTopic.topicId))
    .innerJoin(chapter, eq(chapter.id, topic.chapterId))
    .where(eq(subTopic.id, args.subTopicId));
  if (!st) throw new SubTopicNotFoundError(args.subTopicId);

  const los = await tx
    .select()
    .from(learningObjective)
    .where(eq(learningObjective.subTopicId, args.subTopicId));
  const conceptualLos = los
    .filter((l) => l.axis === "conceptual" || l.axis === "both")
    .map((l) => l.description);
  const proceduralLos = los
    .filter((l) => l.axis === "procedural" || l.axis === "both")
    .map((l) => l.description);

  // The slot the saved set will occupy (current max ordinal + 1) — also shown to
  // the tutor so they see where these land in the sequence.
  const [maxRow] = await tx
    .select({ ordinal: question.ordinal })
    .from(question)
    .where(eq(question.subTopicId, args.subTopicId))
    .orderBy(desc(question.ordinal))
    .limit(1);
  const nextOrdinal = (maxRow?.ordinal ?? -1) + 1;

  const drafts = await runAuthorCall({
    subTopicName: st.name,
    topicName: st.topicName,
    chapterName: st.chapterName,
    conceptualLos,
    proceduralLos,
    count: args.count,
    axisFocus: args.axisFocus ?? null,
    intent: args.intent ?? null,
    subTopicId: args.subTopicId,
  });

  return {
    subTopicId: args.subTopicId,
    subTopicName: st.name,
    topicName: st.topicName,
    chapterName: st.chapterName,
    conceptualLos,
    proceduralLos,
    nextOrdinal,
    drafts,
  };
}

interface AuthorCallInput {
  subTopicName: string;
  topicName: string;
  chapterName: string;
  conceptualLos: string[];
  proceduralLos: string[];
  count: number;
  axisFocus: "conceptual" | "procedural" | "both" | null;
  intent: string | null;
  subTopicId: string;
}

async function runAuthorCall(i: AuthorCallInput): Promise<DraftItem[]> {
  const loList = (ls: string[]) =>
    ls.length ? ls.map((d, n) => `  ${n + 1}. ${d}`).join("\n") : "  (none recorded)";

  const focusLine =
    i.axisFocus && i.axisFocus !== "both"
      ? `Weight the set toward the ${i.axisFocus.toUpperCase()} axis.`
      : "Author a natural mix across both axes as the LOs warrant.";

  const intentLine = i.intent
    ? `TUTOR'S BRIEF FOR THIS BATCH (honor it): ${i.intent}`
    : "No extra tutor brief — author to the LOs at a sensible default depth (cold-start canonical questions).";

  const prompt = `CHAPTER: ${i.chapterName}
TOPIC: ${i.topicName}
SUB-TOPIC: ${i.subTopicName}

CONCEPTUAL LEARNING OBJECTIVES (aim conceptual questions at these):
${loList(i.conceptualLos)}

PROCEDURAL LEARNING OBJECTIVES (aim procedural questions at these):
${loList(i.proceduralLos)}

HOW MANY: write exactly ${i.count} question${i.count === 1 ? "" : "s"}, as an ordered scaffolded sequence.
${focusLine}
${intentLine}

Author the set now. Apply §1–§6 and self-score each on the rubric (honest low on at least one axis). Return the structured JSON.`;

  const raw = await geminiJson<unknown>({
    label: `authoring:${i.subTopicId}`,
    systemInstruction: QUESTION_AUTHOR_SYSTEM,
    prompt,
    responseSchema: geminiQuestionSchema as never,
    // Uncapped (model default), like Stage-2 (assessment.ts) — this is a GENERATIVE
    // call returning N full questions (stems + reference answers + explanations),
    // the largest answer in the system, on a gemini-3 thinking model where
    // maxOutputTokens bounds thinking + answer together (ai-build-miss M28). A
    // fixed ceiling near the answer size would risk the thinking starving the JSON.
    maxOutputTokens: null,
  });

  return draftBatchSchema.parse(raw).questions;
}

// ───────────────────────── save ─────────────────────────

// The tutor-editable fields (the form). rubric + honestLowReason + intent come
// from the AI draft unchanged (intent/rubric ride into pedagogical_note).
export const finalItemSchema = z.object({
  axis: z.enum(["conceptual", "procedural", "both"]),
  stem: z.string().min(1),
  referenceAnswer: z.string().min(1),
  explanation: z.string().nullable().default(null),
  image: imageSpecSchema, // tutor-editable figure brief (or null); flows through to question.image
});
export type FinalItem = z.infer<typeof finalItemSchema>;

export const saveItemSchema = z.object({
  draft: draftItemSchema,
  final: finalItemSchema,
});
export type SaveItem = z.infer<typeof saveItemSchema>;

export type SaveResult = {
  savedIds: string[];
  count: number;
  editedCount: number;
};

/** Did the tutor change any persisted field of the draft? (drives D-AUTH-6.) */
function wasEdited(draft: DraftItem, final: FinalItem): boolean {
  return (
    draft.axis !== final.axis ||
    draft.stem.trim() !== final.stem.trim() ||
    draft.referenceAnswer.trim() !== final.referenceAnswer.trim() ||
    (draft.explanation?.trim() ?? "") !== (final.explanation?.trim() ?? "") ||
    JSON.stringify(draft.image ?? null) !== JSON.stringify(final.image ?? null)
  );
}

/** Fold the author's intent + the 5-axis self-score into the single
 *  pedagogical_note field — what Stage-1/Stage-2 read as AUTHOR'S INTENTION
 *  (D-AUTH-5). The rubric line is appended so the downstream assessor can read
 *  transfer/flexibility intent and the author's own quality read. */
function composePedagogicalNote(draft: DraftItem): string {
  const r = draft.rubric;
  return (
    `${draft.intent}\n\n` +
    `[Author rubric — AR ${r.ar} · MS ${r.ms} · MR ${r.mr} · BA ${r.ba} · GL ${r.gl}; ` +
    `honest low: ${draft.honestLowReason}]`
  );
}

/**
 * Insert the approved set as live `question` rows (D-AUTH-1: no status column —
 * saved questions go live; Practice selection picks them up; existing pinned
 * sessions per D-L-1 don't see them → fault-isolated). Consecutive ordinals after
 * the sub_topic's current max (D-AUTH-3). Logs an `authoring_edit` event per
 * EDITED draft only (D-AUTH-6). Runs inside the caller's board-scoped tx.
 */
export async function saveQuestions(
  tx: Tx,
  args: {
    boardId: string;
    tutorUserId: string;
    subTopicId: string;
    items: SaveItem[];
    // Slice AUTH-v2: when set, the saved questions are PRIVATE to this student
    // (authored to their weakness in the tutor↔AI chat). Omit / null = canonical
    // (shared), exactly the v1 behaviour — fault-isolated.
    targetStudentId?: string | null;
  },
): Promise<SaveResult> {
  const [st] = await tx
    .select({ id: subTopic.id })
    .from(subTopic)
    .where(eq(subTopic.id, args.subTopicId));
  if (!st) throw new SubTopicNotFoundError(args.subTopicId);

  // consecutive ordinals after the current max (re-read here so a save after a
  // prior save in the same batch can't collide).
  const [maxRow] = await tx
    .select({ ordinal: question.ordinal })
    .from(question)
    .where(eq(question.subTopicId, args.subTopicId))
    .orderBy(desc(question.ordinal))
    .limit(1);
  let ordinal = (maxRow?.ordinal ?? -1) + 1;

  const savedIds: string[] = [];
  let editedCount = 0;

  for (const item of args.items) {
    const { draft, final } = item;
    const [inserted] = await tx
      .insert(question)
      .values({
        boardId: args.boardId,
        subTopicId: args.subTopicId,
        axis: final.axis,
        kind: "subjective",
        stem: final.stem,
        referenceAnswer: final.referenceAnswer,
        explanation: final.explanation,
        pedagogicalNote: composePedagogicalNote(draft),
        ordinal,
        source: AUTHORING_SOURCE,
        targetStudentId: args.targetStudentId ?? null,
        image: final.image ?? null, // figure spec (Slice AUTH-v2.1); render pipeline fills `file` later
      })
      .returning({ id: question.id });
    const questionId = inserted!.id;
    savedIds.push(questionId);
    ordinal += 1;

    // Slice IMG: if this question carries a figure spec, enqueue a render. M11
    // (both sides of the gate): §7 of QUESTION_AUTHOR_SYSTEM lets the AI author a
    // spec; THIS is the consumer that turns it into a PNG — the real save flow
    // produces the image, not just the probe. Best-effort + fault-isolated (the
    // 1.5s delay covers this tx's commit); a render failure never fails the save.
    if (final.image != null) {
      await enqueueImageGeneration({ questionId, boardId: args.boardId });
    }

    // D-AUTH-6: log the edit only when the tutor actually changed the draft.
    if (wasEdited(draft, final)) {
      editedCount += 1;
      await tx.insert(eventLog).values({
        boardId: args.boardId,
        eventType: "authoring_edit",
        tutorId: args.tutorUserId,
        subTopicId: args.subTopicId,
        before: {
          axis: draft.axis,
          stem: draft.stem,
          referenceAnswer: draft.referenceAnswer,
          explanation: draft.explanation,
        },
        after: {
          axis: final.axis,
          stem: final.stem,
          referenceAnswer: final.referenceAnswer,
          explanation: final.explanation,
        },
        payload: { questionId },
      });
    }
  }

  return { savedIds, count: savedIds.length, editedCount };
}

// ─────────────────────────────────────────────────────────────────────────────
// Slice AUTH-v2.1 item #2 — preview saved questions (the review read).
// ─────────────────────────────────────────────────────────────────────────────

/**
 * One authored question as the tutor reviews it. This is a TUTOR-ONLY read, so
 * the reference answer + pedagogical intent ARE returned — the M11 answer-key
 * gate is for STUDENT-facing reads (Practice), not the author's own review.
 */
export type AuthoredQuestionView = {
  id: string;
  chapterId: string;
  chapterName: string;
  topicName: string;
  subTopicName: string;
  axis: string;
  stem: string;
  referenceAnswer: string;
  explanation: string | null;
  pedagogicalNote: string | null;
  hasImage: boolean; // a figure SPEC was authored onto the question
  // The current rendered figure (highest version) + its verifier badge, shown to
  // the TUTOR regardless of verdict (D-IMG-13) — the author needs to see a
  // FAIL/ERROR render to decide whether to regenerate. imageId null = no render
  // yet; verifierLabel null = rendered-but-not-yet-verified (PENDING).
  imageId: string | null;
  verifierLabel: string | null; // PASS | FAIL | ERROR | null(=PENDING)
  // "tutor_override" when a tutor manually verified — FE badges "(tutor)".
  verifierModel: string | null;
  createdAt: Date;
};

/**
 * Every question authored PRIVATE to one of the tutor's students
 * (`target_student_id = studentId`, `source = 'b2c_authoring'`) — the surface the
 * tutor uses to review what a chat produced. Ownership-guarded
 * (`assertTutorsStudent` → foreign student = STUDENT_NOT_FOUND, no existence
 * leak; the D-L-5 pattern, since RLS scopes by board not by user). Ordered
 * oldest-first within topic/sub_topic so the newest additions land at the end of
 * their group. Runs inside the board-scoped tx (tutorProcedure → withBoard).
 */
export async function listAuthoredQuestions(
  tx: Tx,
  args: { tutorUserId: string; studentId: string },
): Promise<AuthoredQuestionView[]> {
  await assertTutorsStudent(tx, args.tutorUserId, args.studentId);
  const rows = await tx
    .select({
      id: question.id,
      chapterId: chapter.id,
      chapterName: chapter.name,
      topicName: topic.name,
      subTopicName: subTopic.name,
      axis: question.axis,
      stem: question.stem,
      referenceAnswer: question.referenceAnswer,
      explanation: question.explanation,
      pedagogicalNote: question.pedagogicalNote,
      image: question.image,
      createdAt: question.createdAt,
    })
    .from(question)
    .innerJoin(subTopic, eq(question.subTopicId, subTopic.id))
    .innerJoin(topic, eq(subTopic.topicId, topic.id))
    .innerJoin(chapter, eq(topic.chapterId, chapter.id))
    .where(
      and(
        eq(question.targetStudentId, args.studentId),
        eq(question.source, AUTHORING_SOURCE),
        eq(question.status, "approved"), // Saved tab = APPROVED history; drafts live in listDrafts (D-FIG-1)
      ),
    )
    // Chapter-wise ordering for the Authored-questions tree (D-AUTHUI-3).
    .orderBy(
      asc(chapter.ordinal),
      asc(topic.ordinal),
      asc(subTopic.ordinal),
      asc(question.ordinal),
    );
  // Current render + verifier badge per question (highest version), for the
  // thumbnail + PASS/FAIL/ERROR/PENDING chip on the review surface.
  const images = await currentImagesFor(tx, rows.map((r) => r.id));
  return rows.map((r) => {
    const img = images.get(r.id) ?? null;
    return {
      id: r.id,
      chapterId: r.chapterId,
      chapterName: r.chapterName,
      topicName: r.topicName,
      subTopicName: r.subTopicName,
      axis: r.axis,
      stem: r.stem,
      referenceAnswer: r.referenceAnswer,
      explanation: r.explanation,
      pedagogicalNote: r.pedagogicalNote,
      hasImage: r.image != null,
      imageId: img?.imageId ?? null,
      verifierLabel: img?.verifierLabel ?? null,
      verifierModel: img?.verifierModel ?? null,
      createdAt: r.createdAt,
    };
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Slice FIG-AUTH — the DRAFT lifecycle (D-FIG-1/D-FIG-5). Chat authoring persists
// its drafts as status='draft' question rows (so each has a real id to render a
// figure against + a live rendered preview), the tutor edits + generates figures
// in the review form, then APPROVES → status='approved' → live to the student.
// This supersedes D-AUTH-1's "drafts live in the UI, no status column".
// ─────────────────────────────────────────────────────────────────────────────

// A persisted draft as the review form sees it: the id (so it can be edited /
// rendered / approved) + the editable fields + the current figure render.
export type PersistedDraft = {
  id: string;
  axis: string;
  stem: string;
  referenceAnswer: string;
  explanation: string | null;
  // The author's intent + self-rubric (composePedagogicalNote, D-AUTH-5) — shown
  // read-only ABOVE the question in the review form (founder call 2026-07-18) so
  // the tutor can recall WHY the question exists.
  pedagogicalNote: string | null;
  image: ImageSpec | null; // the editable figure spec (or null)
  imageId: string | null; // current rendered figure (highest version), or null
  verifierLabel: string | null; // PASS | FAIL | ERROR | null(=PENDING/none)
  // "tutor_override" when a tutor manually verified — FE badges "(tutor)".
  verifierModel: string | null;
  ordinal: number;
};

/**
 * Insert a batch of AI drafts as status='draft' question rows PRIVATE to a
 * student. Consecutive ordinals after the sub_topic's current max (D-AUTH-3), the
 * author intent+rubric folded into pedagogical_note (D-AUTH-5), the figure spec
 * stored on `image`. NO render is enqueued here — rendering is TUTOR-TRIGGERED
 * on-demand in the review form (D-FIG-2). Runs inside the caller's board tx.
 */
export async function persistDrafts(
  tx: Tx,
  args: {
    boardId: string;
    subTopicId: string;
    targetStudentId: string;
    drafts: DraftItem[];
  },
): Promise<PersistedDraft[]> {
  const [maxRow] = await tx
    .select({ ordinal: question.ordinal })
    .from(question)
    .where(eq(question.subTopicId, args.subTopicId))
    .orderBy(desc(question.ordinal))
    .limit(1);
  let ordinal = (maxRow?.ordinal ?? -1) + 1;

  const out: PersistedDraft[] = [];
  for (const draft of args.drafts) {
    const [inserted] = await tx
      .insert(question)
      .values({
        boardId: args.boardId,
        subTopicId: args.subTopicId,
        axis: draft.axis,
        kind: "subjective",
        stem: draft.stem,
        referenceAnswer: draft.referenceAnswer,
        explanation: draft.explanation,
        pedagogicalNote: composePedagogicalNote(draft),
        ordinal,
        source: AUTHORING_SOURCE,
        status: "draft", // D-FIG-1: not live until approved
        targetStudentId: args.targetStudentId,
        image: draft.image ?? null,
      })
      .returning({ id: question.id });
    out.push({
      id: inserted!.id,
      axis: draft.axis,
      stem: draft.stem,
      referenceAnswer: draft.referenceAnswer,
      explanation: draft.explanation,
      pedagogicalNote: composePedagogicalNote(draft),
      image: draft.image ?? null,
      imageId: null,
      verifierLabel: null,
      verifierModel: null,
      ordinal,
    });
    ordinal += 1;
  }
  return out;
}

/**
 * Ownership + shape guard for a draft op: the question must be a b2c_authoring
 * DRAFT private to a student the tutor owns. Returns the row. Foreign / non-draft
 * / canonical → SubTopicNotFoundError-style opacity via assertTutorsStudent (the
 * D-L-5 pattern — RLS scopes board, not user). Used by every mutating draft op.
 */
async function assertOwnedDraft(
  tx: Tx,
  tutorUserId: string,
  questionId: string,
): Promise<{
  id: string;
  boardId: string;
  subTopicId: string;
  targetStudentId: string;
  axis: string;
  stem: string;
  referenceAnswer: string;
  explanation: string | null;
  pedagogicalNote: string | null;
  image: ImageSpec | null;
}> {
  const [q] = await tx
    .select({
      id: question.id,
      boardId: question.boardId,
      subTopicId: question.subTopicId,
      targetStudentId: question.targetStudentId,
      source: question.source,
      status: question.status,
      axis: question.axis,
      stem: question.stem,
      referenceAnswer: question.referenceAnswer,
      explanation: question.explanation,
      pedagogicalNote: question.pedagogicalNote,
      image: question.image,
    })
    .from(question)
    .where(eq(question.id, questionId));
  if (!q || q.source !== AUTHORING_SOURCE || q.status !== "draft" || !q.targetStudentId) {
    throw new DraftNotFoundError(questionId);
  }
  await assertTutorsStudent(tx, tutorUserId, q.targetStudentId); // → STUDENT_NOT_FOUND if not owned
  return {
    id: q.id,
    boardId: q.boardId,
    subTopicId: q.subTopicId,
    targetStudentId: q.targetStudentId,
    axis: q.axis,
    stem: q.stem,
    referenceAnswer: q.referenceAnswer,
    explanation: q.explanation,
    pedagogicalNote: q.pedagogicalNote,
    image: (q.image as ImageSpec | null) ?? null,
  };
}

/**
 * Ownership guard for ops that apply to a DRAFT *or* an APPROVED authored
 * question — the verifier-override lives on both surfaces (the draft preview and
 * the Saved-questions review). Same opacity rules as assertOwnedDraft.
 */
export async function assertOwnedAuthored(
  tx: Tx,
  tutorUserId: string,
  questionId: string,
): Promise<{ id: string; targetStudentId: string; status: string }> {
  const [q] = await tx
    .select({
      id: question.id,
      source: question.source,
      status: question.status,
      targetStudentId: question.targetStudentId,
    })
    .from(question)
    .where(eq(question.id, questionId));
  if (
    !q ||
    q.source !== AUTHORING_SOURCE ||
    (q.status !== "draft" && q.status !== "approved") ||
    !q.targetStudentId
  ) {
    throw new AuthoredQuestionNotFoundError(questionId);
  }
  await assertTutorsStudent(tx, tutorUserId, q.targetStudentId); // → STUDENT_NOT_FOUND if not owned
  return { id: q.id, targetStudentId: q.targetStudentId, status: q.status };
}

export class AuthoredQuestionNotFoundError extends Error {
  readonly code = "QUESTION_NOT_FOUND";
  constructor(questionId: string) {
    super(`authored question ${questionId} not found`);
    this.name = "AuthoredQuestionNotFoundError";
  }
}

export class DraftNotFoundError extends Error {
  readonly code = "DRAFT_NOT_FOUND";
  constructor(questionId: string) {
    super(`draft question ${questionId} not found / not a draft`);
    this.name = "DraftNotFoundError";
  }
}

/** Edit one persisted draft's tutor-facing fields (+ figure spec). Logs an
 *  authoring_edit event when a field actually changed (D-AUTH-6, applied to the
 *  live-draft model). Returns the updated PersistedDraft (with current render). */
export async function updateDraft(
  tx: Tx,
  args: {
    tutorUserId: string;
    questionId: string;
    patch: FinalItem;
  },
): Promise<PersistedDraft> {
  const q = await assertOwnedDraft(tx, args.tutorUserId, args.questionId);
  const p = args.patch;
  const changed =
    q.axis !== p.axis ||
    q.stem.trim() !== p.stem.trim() ||
    q.referenceAnswer.trim() !== p.referenceAnswer.trim() ||
    (q.explanation?.trim() ?? "") !== (p.explanation?.trim() ?? "") ||
    JSON.stringify(q.image ?? null) !== JSON.stringify(p.image ?? null);

  await tx
    .update(question)
    .set({
      axis: p.axis,
      stem: p.stem,
      referenceAnswer: p.referenceAnswer,
      explanation: p.explanation,
      image: p.image ?? null,
    })
    .where(eq(question.id, q.id));

  if (changed) {
    await tx.insert(eventLog).values({
      boardId: q.boardId,
      eventType: "authoring_edit",
      tutorId: args.tutorUserId,
      subTopicId: q.subTopicId,
      before: { axis: q.axis, stem: q.stem, referenceAnswer: q.referenceAnswer, explanation: q.explanation },
      after: { axis: p.axis, stem: p.stem, referenceAnswer: p.referenceAnswer, explanation: p.explanation },
      payload: { questionId: q.id },
    });
  }

  const img = (await currentImagesFor(tx, [q.id])).get(q.id) ?? null;
  const [row] = await tx
    .select({ ordinal: question.ordinal })
    .from(question)
    .where(eq(question.id, q.id));
  return {
    id: q.id,
    axis: p.axis,
    stem: p.stem,
    referenceAnswer: p.referenceAnswer,
    explanation: p.explanation,
    pedagogicalNote: q.pedagogicalNote,
    image: p.image ?? null,
    imageId: img?.imageId ?? null,
    verifierLabel: img?.verifierLabel ?? null,
    verifierModel: img?.verifierModel ?? null,
    ordinal: row?.ordinal ?? 0,
  };
}

/** Replace a persisted draft in-place with a full re-drafted DraftItem (the
 *  per-question mini-chat / reviseDraft target). Recomposes pedagogical_note from
 *  the new intent+rubric, logs an authoring_edit, returns the updated draft. */
export async function applyDraftRevision(
  tx: Tx,
  args: { tutorUserId: string; questionId: string; draft: DraftItem },
): Promise<PersistedDraft> {
  const q = await assertOwnedDraft(tx, args.tutorUserId, args.questionId);
  const d = args.draft;
  await tx
    .update(question)
    .set({
      axis: d.axis,
      stem: d.stem,
      referenceAnswer: d.referenceAnswer,
      explanation: d.explanation,
      pedagogicalNote: composePedagogicalNote(d),
      image: d.image ?? null,
    })
    .where(eq(question.id, q.id));
  await tx.insert(eventLog).values({
    boardId: q.boardId,
    eventType: "authoring_edit",
    tutorId: args.tutorUserId,
    subTopicId: q.subTopicId,
    before: { axis: q.axis, stem: q.stem, referenceAnswer: q.referenceAnswer, explanation: q.explanation },
    after: { axis: d.axis, stem: d.stem, referenceAnswer: d.referenceAnswer, explanation: d.explanation },
    payload: { questionId: q.id, revised: true },
  });
  const img = (await currentImagesFor(tx, [q.id])).get(q.id) ?? null;
  const [row] = await tx
    .select({ ordinal: question.ordinal })
    .from(question)
    .where(eq(question.id, q.id));
  return {
    id: q.id,
    axis: d.axis,
    stem: d.stem,
    referenceAnswer: d.referenceAnswer,
    explanation: d.explanation,
    pedagogicalNote: composePedagogicalNote(d),
    image: d.image ?? null,
    imageId: img?.imageId ?? null,
    verifierLabel: img?.verifierLabel ?? null,
    verifierModel: img?.verifierModel ?? null,
    ordinal: row?.ordinal ?? 0,
  };
}

/**
 * Approve drafts → status='approved' (the M11 ENABLEMENT side: this is the ONLY
 * path that makes an authored question servable to the student; Practice/insights
 * filter status='approved' on the CHECK side). Every id is ownership-guarded; a
 * foreign/non-draft id throws (no partial approve of an unowned row).
 */
export async function approveDrafts(
  tx: Tx,
  args: { tutorUserId: string; questionIds: string[] },
): Promise<{ approvedIds: string[] }> {
  if (args.questionIds.length === 0) return { approvedIds: [] };
  for (const id of args.questionIds) {
    await assertOwnedDraft(tx, args.tutorUserId, id); // guard EACH before any write
  }
  await tx
    .update(question)
    .set({ status: "approved" })
    .where(inArray(question.id, args.questionIds));
  return { approvedIds: args.questionIds };
}

/** Discard a draft (+ any rendered figures). Ownership-guarded. */
export async function discardDraft(
  tx: Tx,
  args: { tutorUserId: string; questionId: string },
): Promise<{ discardedId: string }> {
  const q = await assertOwnedDraft(tx, args.tutorUserId, args.questionId);
  await tx.delete(questionImage).where(eq(questionImage.questionId, q.id));
  await tx.delete(question).where(eq(question.id, q.id));
  return { discardedId: q.id };
}

/** The student's current DRAFT set (status='draft'), for the review form +
 *  rehydrate-on-load. Ownership-guarded; ordered by sub_topic then ordinal.
 *  Each carries its editable fields + current figure render (thumbnail/badge). */
export async function listDrafts(
  tx: Tx,
  args: { tutorUserId: string; studentId: string },
): Promise<
  (PersistedDraft & { subTopicId: string; topicName: string; subTopicName: string })[]
> {
  await assertTutorsStudent(tx, args.tutorUserId, args.studentId);
  const rows = await tx
    .select({
      id: question.id,
      subTopicId: question.subTopicId,
      topicName: topic.name,
      subTopicName: subTopic.name,
      axis: question.axis,
      stem: question.stem,
      referenceAnswer: question.referenceAnswer,
      explanation: question.explanation,
      pedagogicalNote: question.pedagogicalNote,
      image: question.image,
      ordinal: question.ordinal,
    })
    .from(question)
    .innerJoin(subTopic, eq(question.subTopicId, subTopic.id))
    .innerJoin(topic, eq(subTopic.topicId, topic.id))
    .where(
      and(
        eq(question.targetStudentId, args.studentId),
        eq(question.source, AUTHORING_SOURCE),
        eq(question.status, "draft"),
      ),
    )
    .orderBy(asc(topic.ordinal), asc(subTopic.ordinal), asc(question.ordinal));
  const images = await currentImagesFor(tx, rows.map((r) => r.id));
  return rows.map((r) => {
    const img = images.get(r.id) ?? null;
    return {
      id: r.id,
      subTopicId: r.subTopicId,
      topicName: r.topicName,
      subTopicName: r.subTopicName,
      axis: r.axis,
      stem: r.stem,
      referenceAnswer: r.referenceAnswer,
      explanation: (r.explanation as string | null) ?? null,
      pedagogicalNote: (r.pedagogicalNote as string | null) ?? null,
      image: (r.image as ImageSpec | null) ?? null,
      imageId: img?.imageId ?? null,
      verifierLabel: img?.verifierLabel ?? null,
      verifierModel: img?.verifierModel ?? null,
      ordinal: r.ordinal,
    };
  });
}

export { assertOwnedDraft };
