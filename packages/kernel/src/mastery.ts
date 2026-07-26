/**
 * THE definition of "solid" — one place, because two places is the bug.
 *
 * A sub-topic's two axes (conceptual, procedural) each carry a 1–5 certified
 * level. "Solid" is the single derived word the parent surface is built on: it
 * colours the progress map green, counts the chapter tile's `n/total secure`,
 * and is the `solid` segment of every bar in the growth chart.
 *
 * ⚠️ It is read from TWO code paths that must never disagree:
 *   - services/parent.ts  → the LIVE top row of the growth chart, computed now
 *   - services/snapshot.ts → the FROZEN month rows underneath it (CLOCK-2)
 * They ran on separate hardcoded `>= 4` checks until S168. If those two drift,
 * the chart draws month bars that contradict the total sitting above them —
 * the exact failure the backfill hand-off warned about. Hence this module: both
 * import `isSolid`, and a threshold change moves them together or not at all.
 *
 * ── D-PDASH-7 (founder, 2026-07-26) — supersedes D-PDASH-1's green rule ──
 * Was: green ⇔ BOTH axes >= 4.
 * Now: green ⇔ EITHER axis >= 3, AND both axes have actually been assessed.
 *
 * Why it moved: the first real student data (two Grade-10 students, 1,157
 * attempts extracted from old b2c) reached procedural 4 exactly ONCE across 169
 * rows. Olórin's procedural rung 4 is defined by SPEED, and the old system's
 * timer logged wall-clock — a full page of handwritten working uploaded as a
 * photo reads as 31 seconds. The axis was capped at 3 by a broken stopwatch, so
 * `both >= 4` rendered every chapter of five months' real work as red "needs
 * work". The threshold was measuring the instrument, not the child.
 *
 * Why the both-assessed clause: with a bare `either >= 3`, a topic scored
 * conceptual 3 / procedural NEVER-RATED goes green — the page would call an
 * axis nobody has looked at "secure". A null is not evidence. That clause costs
 * ~12 rows per student and is the difference between a generous rule and a
 * dishonest one.
 */

/** An axis at or above this reads as green. */
export const SOLID_AXIS_LEVEL = 3;

/**
 * Is this sub-topic SOLID (the progress map's green)?
 *
 * Both axes must be assessed; then either one reaching SOLID_AXIS_LEVEL is
 * enough. `null` means "not yet rated" and never contributes.
 */
export function isSolid(
  conceptual: number | null | undefined,
  procedural: number | null | undefined,
): boolean {
  if (conceptual == null || procedural == null) return false;
  return conceptual >= SOLID_AXIS_LEVEL || procedural >= SOLID_AXIS_LEVEL;
}

/**
 * Is ONE axis green, on its own terms? The §4 meters ask a different question
 * from the map — "of the topics she's covered, how many are green on the
 * conceptual axis?" — so this deliberately does NOT require the other axis to
 * be assessed. The map is the joint claim; a meter is a single-axis claim.
 */
export function isAxisGreen(level: number | null | undefined): boolean {
  return level != null && level >= SOLID_AXIS_LEVEL;
}
