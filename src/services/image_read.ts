// Current-image lookup (Slice IMG Stage-3) — the read side that lets Practice
// and the tutor Saved-questions surface a question's rendered figure.
//
// The CURRENT image for a question = its highest-version question_image row (a
// re-render bumps the version, D-IMG-6). These helpers select all rows for the
// given question ids and keep the highest version per question — cheap for the
// small sets involved (a practice session's questions, a saved-question list).
// Board-scoped by the caller's tx (RLS binds).

import { asc, inArray } from "drizzle-orm";
import type { PgTransaction } from "drizzle-orm/pg-core";
import { questionImage } from "@b2c/kernel/schema";

type Tx = PgTransaction<any, any, any>;

export interface CurrentImage {
  imageId: string;
  version: number;
  verifierLabel: string | null; // PASS | FAIL | ERROR | null(=PENDING)
  // The stamping model — a Gemini id, or TUTOR_OVERRIDE_MODEL ("tutor_override")
  // when a tutor manually overrode a FAIL/ERROR. The FE badges the latter as
  // "✓ Verified (tutor)".
  verifierModel: string | null;
}

/** Map questionId → its current (highest-version) image, for a batch of ids. */
export async function currentImagesFor(
  tx: Tx,
  questionIds: string[],
): Promise<Map<string, CurrentImage>> {
  const map = new Map<string, CurrentImage>();
  if (questionIds.length === 0) return map;
  const rows = await tx
    .select({
      questionId: questionImage.questionId,
      id: questionImage.id,
      version: questionImage.version,
      verifierLabel: questionImage.verifierLabel,
      verifierModel: questionImage.verifierModel,
    })
    .from(questionImage)
    .where(inArray(questionImage.questionId, questionIds))
    .orderBy(asc(questionImage.version)); // asc → later (higher version) overwrites
  for (const r of rows) {
    map.set(r.questionId, {
      imageId: r.id,
      version: r.version,
      verifierLabel: r.verifierLabel,
      verifierModel: r.verifierModel,
    });
  }
  return map;
}

/** The current image for a single question (or null if none rendered). */
export async function currentImageFor(
  tx: Tx,
  questionId: string,
): Promise<CurrentImage | null> {
  const m = await currentImagesFor(tx, [questionId]);
  return m.get(questionId) ?? null;
}
