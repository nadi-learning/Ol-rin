// Image generation (Slice IMG) — turn a question's figure SPEC into a rendered
// PNG. Ported from Starkhorn's nadi-backend (services/image_gen.ts), adapted to
// b2c's shape: one Gemini call (not Claude Haiku — the deployable worker vendor,
// D-IMG-1) returning the matplotlib script as structured JSON, then rendered via
// the nadi-pyrender sidecar.
//
// Flow (runs inside the worker, board-scoped):
//   question.image spec  (a matplotlib brief authored by the AI)
//     → Gemini writes a matplotlib script (IMAGE_GEN_SYSTEM, UNCAPPED — M28)
//     → POST to nadi-pyrender → PNG bytes
//     → save to local FS (image_storage) + INSERT question_image at version+1
//   Verifier columns stay NULL (Stage-2 fills them).
//
// FAULT-ISOLATED: the enqueue that triggers this (authoring.ts saveQuestions) is
// best-effort, and a failure here fails only the render JOB — never the save,
// never the student's practice. A question with a failed render simply shows no
// image (the stem stays self-contained; the §7 prompt still forbids "see the
// diagram" phrasing that would strand a student).

import { eq, max as sqlMax } from "drizzle-orm";
import { Type, type Schema } from "@google/genai";
import { chapter, question, questionImage, subTopic, topic } from "@b2c/kernel/schema";
import { env } from "../config/env";
import { withBoard } from "../db/with-board";
import { geminiJson } from "./ai/gemini";
import { PyrenderError, renderScript } from "./matplotlib";
import { saveImage, storageKeyFor } from "./image_storage";

// The figure brief the AI authored onto question.image (Starkhorn's QuestionImage
// shape). Kept local so this module stays decoupled from the authoring service.
export interface FigureSpec {
  description: string;
  shows?: string[];
  hides?: string[];
  file?: string | null;
}

export class NoImageSpecError extends Error {
  constructor(questionId: string) {
    super(`question ${questionId} has no image spec (image.description missing)`);
    this.name = "NoImageSpecError";
  }
}
export class QuestionNotFoundError extends Error {
  constructor(questionId: string) {
    super(`question ${questionId} not found`);
    this.name = "QuestionNotFoundError";
  }
}

// ───────────────────────── prompt ─────────────────────────

export const IMAGE_GEN_SYSTEM = `You are a precise matplotlib diagram author for textbook questions.

You receive an image specification (description, what it must show, what it must NOT show) and question/chapter context. You output a single Python script that produces the diagram.

OUTPUT FORMAT:
Return ONLY the structured JSON { "script": "<the full python source>" }. The "script" value is raw Python source — no markdown fences, no prose. Its first characters are "import matplotlib".

THE SCRIPT MUST:
- Begin with: import matplotlib; matplotlib.use("Agg")
- Import only: matplotlib, matplotlib.pyplot, matplotlib.patches, matplotlib.path, numpy
- Build a single matplotlib figure (one plt.subplots() call)
- Use clean black-on-white colors: lines #1a1a1a, soft fills like #eaf2fb, fonts default size 10-12
- Set ax.axis("off") for diagrams (not for data plots / charts)
- Use plain ASCII for text labels (no LaTeX rendering — just inline math like "n = c/v")
- End with: plt.savefig("out.png", dpi=150) — the renderer intercepts the path; bytes are captured server-side
- Stay under 200 lines

CONSTRAINTS:
- Do NOT use os, sys, subprocess, urllib, requests, socket, or any I/O beyond plt.savefig
- Do NOT use tkinter or interactive backends
- Do NOT call plt.show()
- Diagram must render in under 10 seconds

The output is a textbook diagram — clean, labeled, geometrically correct, no decorative elements.`;

const scriptSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    script: {
      type: Type.STRING,
      description:
        "the full matplotlib Python source (raw code, no fences), obeying every rule in the system prompt",
    },
  },
  required: ["script"],
};

// ───────────────────────── helpers ─────────────────────────

/**
 * Defensive extraction/validation: even under structured output the model may
 * wrap the script in ```python fences or prepend a prose line. Strip to the first
 * real code line and assert it imports matplotlib (a wrong/empty script would
 * only fail later inside pyrender with a murkier error).
 */
export function extractPythonScript(raw: string): string {
  let text = raw.trim();
  const fence = text.match(/```(?:python|py)?\s*([\s\S]*?)```/);
  if (fence?.[1]) text = fence[1].trim();
  const lines = text.split("\n");
  let start = 0;
  while (start < lines.length) {
    const ln = lines[start]!.trim();
    if (
      ln.startsWith("import ") ||
      ln.startsWith("from ") ||
      ln.startsWith("#!") ||
      ln.startsWith("'''") ||
      ln.startsWith('"""') ||
      ln === ""
    ) {
      break;
    }
    start++;
  }
  text = lines.slice(start).join("\n").trim();
  if (!text) throw new Error("image_gen: AI produced no script");
  if (!/import\s+matplotlib/.test(text)) {
    throw new Error(
      `image_gen: script does not import matplotlib (first 200 chars: ${text.slice(0, 200)})`,
    );
  }
  return text;
}

function buildUserMessage(ctx: {
  stem: string;
  chapterName: string;
  topicName: string;
  subTopicName: string;
  spec: FigureSpec;
  refinementNote?: string | null;
}): string {
  const { spec } = ctx;
  return [
    `Chapter: ${ctx.chapterName} · Topic: ${ctx.topicName} · Sub-topic: ${ctx.subTopicName}`,
    "",
    "Question this diagram is for:",
    ctx.stem,
    "",
    "===== IMAGE SPECIFICATION =====",
    `Description: ${spec.description}`,
    spec.shows?.length
      ? `Must SHOW:\n${spec.shows.map((s) => `  - ${s}`).join("\n")}`
      : "Must SHOW: (none specified — infer from description)",
    spec.hides?.length
      ? `Must NOT SHOW:\n${spec.hides.map((s) => `  - ${s}`).join("\n")}`
      : "Must NOT SHOW: (none specified)",
    "===== END SPECIFICATION =====",
    // Slice FIG-AUTH: the tutor's regenerate instruction (Starkhorn refinementNote).
    ctx.refinementNote?.trim()
      ? `\nTUTOR'S REFINEMENT (apply this when redrawing): ${ctx.refinementNote.trim()}`
      : "",
    "",
    "Output the JSON with the Python script now.",
  ].join("\n");
}

// ───────────────────────── main ─────────────────────────

export interface GenerateImageResult {
  imageId: string;
  version: number;
  storageKey: string;
  bytes: Uint8Array;
}

/**
 * Render the CURRENT figure spec on a question into a new question_image version.
 * Board-scoped (opens its own withBoard so RLS binds for the read + insert — the
 * worker calls this with the job's boardId, mirroring scoreAttempt). Throws on a
 * missing spec / question, an AI failure, or a pyrender failure (traceback
 * surfaced) — the worker logs the failure; the question keeps no image.
 */
export async function generateImageForQuestion(
  boardId: string,
  questionId: string,
  refinementNote?: string | null,
): Promise<GenerateImageResult> {
  return withBoard(boardId, async (tx) => {
    const [q] = await tx
      .select({
        stem: question.stem,
        image: question.image,
        subTopicName: subTopic.name,
        topicName: topic.name,
        chapterName: chapter.name,
      })
      .from(question)
      .innerJoin(subTopic, eq(question.subTopicId, subTopic.id))
      .innerJoin(topic, eq(subTopic.topicId, topic.id))
      .innerJoin(chapter, eq(topic.chapterId, chapter.id))
      .where(eq(question.id, questionId))
      .limit(1);
    if (!q) throw new QuestionNotFoundError(questionId);

    const spec = (q.image ?? null) as FigureSpec | null;
    if (!spec?.description) throw new NoImageSpecError(questionId);

    const userMessage = buildUserMessage({
      stem: q.stem,
      chapterName: q.chapterName,
      topicName: q.topicName,
      subTopicName: q.subTopicName,
      spec,
      refinementNote,
    });

    // M28: matplotlib scripts are a large answer on a thinking model — run
    // UNCAPPED (like Stage-2 / authoring), never bound near the answer size.
    const startedAt = Date.now();
    const out = await geminiJson<{ script: string }>({
      label: `imagegen:${questionId}`,
      systemInstruction: IMAGE_GEN_SYSTEM,
      prompt: userMessage,
      responseSchema: scriptSchema,
      maxOutputTokens: null,
    });
    const generationTimeMs = Date.now() - startedAt;
    const pyScript = extractPythonScript(out.script);

    let pngBytes: Uint8Array;
    try {
      pngBytes = await renderScript({
        script: pyScript,
        dpi: 150,
        timeoutSec: 30,
        fetchTimeoutMs: 45_000,
      });
    } catch (err) {
      if (err instanceof PyrenderError) {
        throw new Error(
          `pyrender failed (status ${err.httpStatus}): ${err.message}` +
            (err.traceback ? `\n--- traceback ---\n${err.traceback}` : ""),
        );
      }
      throw err;
    }

    const [mx] = await tx
      .select({ v: sqlMax(questionImage.version) })
      .from(questionImage)
      .where(eq(questionImage.questionId, questionId));
    const version = (mx?.v ?? 0) + 1;
    const storageKey = storageKeyFor(questionId, version);

    await saveImage({ questionId, version, pngBytes, pyScript });

    const [row] = await tx
      .insert(questionImage)
      .values({
        boardId,
        questionId,
        version,
        storageKey,
        mime: "image/png",
        spec,
        pyScript,
        // Verifier columns stay NULL until Stage-2 (NULL = "PENDING").
        meta: { generationModel: env.GEMINI_MODEL, generationTimeMs },
      })
      .returning({ id: questionImage.id, version: questionImage.version });
    if (!row) throw new Error("image_gen: failed to insert question_image row");

    return { imageId: row.id, version: row.version, storageKey, bytes: pngBytes };
  });
}
