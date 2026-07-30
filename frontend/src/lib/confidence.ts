/**
 * The confidence scale, shared by the surface that WRITES it (PracticePage's
 * chips) and the surface that READS it (the tutor's assess evidence rows).
 *
 * Slice UPLOAD-UX made the student's choice a labeled three-way pick, stored as
 * smallint 1/3/5 so the assessor's "/5" calibration signal kept working with no
 * migration. The tutor was still shown the raw number — "confidence 5/5" — which
 * is the number the student never saw. Slice ASSESS-SEE (item 1) shows the label
 * they actually chose.
 *
 * Two places is the bug: the chips and the tutor's label must come from one list,
 * or a re-worded chip silently makes the tutor's view a lie.
 */
export const CONF_CHIPS: [number, string][] = [
  [1, "Guessing"],
  [3, "Partially sure"],
  [5, "Nailed it"],
];

/**
 * The label the student picked, or null when we cannot honestly name one.
 *
 * 🔑 Levels 2 and 4 are REAL and common — 395 of 810 local observations carry
 * them — but the chip UI cannot produce them. They come from the migrated
 * old-b2c attempts, which used a continuous 1–5 scale with different wording.
 * Naming those "Guessing" or "Nailed it" would attribute to a student a choice
 * they were never offered, so they get no label and the caller falls back to the
 * bare number. Callers render the number EITHER WAY, so nothing is ever lost.
 */
export function confidenceLabel(n: number | null | undefined): string | null {
  if (n == null) return null;
  return CONF_CHIPS.find(([v]) => v === n)?.[1] ?? null;
}
