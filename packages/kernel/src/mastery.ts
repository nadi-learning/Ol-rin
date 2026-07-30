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

/* ══════════════════ THE CERTIFICATION LADDER — Slice CERT-RULE ══════════════════
 *
 * Until now this ladder lived ONLY as English inside STAGE2_SYSTEM, and Gemini
 * executed it. The prompt itself concedes the point — "COUNTS + SPACING ARE A
 * RULE YOU EXECUTE FAITHFULLY, not your discretion" — which is the tell that it
 * was never the model's job.
 *
 * S97 (2026-07-17) is why this module exists. A student certified at conceptual
 * 3 produced two observations at level 3, one day apart. L3 asks for 2 obs at >=3
 * and NOTHING else. The model imported L4's >=1-week gap into the L3 decision,
 * decided L3 was unmet, and DEMOTED the student 3 -> 2. ~1 run in 6, at
 * temperature 0, with every probe green throughout — because the model writes
 * both the answer AND the log the tutor reads to check the answer.
 *
 * The fix is not a better prompt. It is that arithmetic belongs in code.
 *
 * ── WHAT CODE OWNS vs WHAT THE MODEL OWNS ──
 * Code owns COUNTS + SPACING — pure functions of (level, timestamp) tuples.
 * The model keeps everything that requires reading text:
 *   - whether an item was a transfer / far-transfer / flexibility probe (an
 *     ADDITIONAL requirement at conceptual L4/L5 and procedural L5 that is read
 *     from the author's pedagogical comment, never a tag). Code cannot see it,
 *     so `certifiableCeiling` is an UPPER BOUND at those rungs — the model may
 *     always propose LOWER, and nothing here ever forces a climb.
 *   - the DOWN rule: was a below-level answer a substantive failure or a slip?
 *   - description / reasoning / flags / climbNextDue.
 *
 * ⚠️ This binds the DRAFT only. The tutor's edit in the review form still wins
 * (assessment.md §6 — the tutor wins on the evidence); finalize is untouched.
 */

export type CertAxis = "conceptual" | "procedural";

/** One Stage-1 observation, reduced to what the ladder actually reads. */
export type CertObservation = {
  /** The EFFECTIVE level — a tutor correction supersedes the machine read. */
  level: number;
  at: Date;
};

type Rung = {
  level: number;
  /** how many observations scored `atLeast` or higher */
  need: number;
  atLeast: number;
  /** a gap of >= this many days must exist between SOME two qualifying observations */
  gapDays?: number;
  /** true where the rung ALSO needs a qualitative item read only the model can do */
  needsItemJudgment?: boolean;
};

/**
 * assessment.md §3, as data. Read one row as a sentence:
 * conceptual L3 = "two separate answers, each scored 3 or better" — no gap, no
 * item requirement.
 *
 * 🔑 A level whose row names NO `gapDays` has NO spacing requirement. Importing a
 * higher rung's gap into a lower rung's decision IS the S97 bug; expressing the
 * ladder as data makes that structurally impossible — each rung reads only its
 * own row.
 */
export const CERT_LADDER: Record<CertAxis, readonly Rung[]> = {
  conceptual: [
    { level: 1, need: 1, atLeast: 1 },
    { level: 2, need: 1, atLeast: 2 },
    { level: 3, need: 2, atLeast: 3 },
    { level: 4, need: 2, atLeast: 4, gapDays: 7, needsItemJudgment: true },
    { level: 5, need: 3, atLeast: 5, gapDays: 14, needsItemJudgment: true },
  ],
  procedural: [
    { level: 1, need: 1, atLeast: 1 },
    { level: 2, need: 1, atLeast: 2 },
    { level: 3, need: 3, atLeast: 3, gapDays: 1 },
    { level: 4, need: 4, atLeast: 4, gapDays: 14 },
    { level: 5, need: 5, atLeast: 5, gapDays: 21, needsItemJudgment: true },
  ],
};

const MS_PER_DAY = 86_400_000;

/**
 * Days between the EARLIEST and LATEST of a set. The rule asks for a gap between
 * SOME two qualifying observations, so the full span is the right measure — if
 * the span clears the bar, such a pair exists.
 */
function spanDays(obs: readonly CertObservation[]): number {
  if (obs.length < 2) return 0;
  let min = obs[0]!.at.getTime();
  let max = min;
  for (const o of obs) {
    const t = o.at.getTime();
    if (t < min) min = t;
    if (t > max) max = t;
  }
  return (max - min) / MS_PER_DAY;
}

/**
 * The highest rung whose COUNT + SPACING conditions hold, on one axis.
 *
 * Returns null only for an empty set. Stops at the first rung that fails — the
 * ladder is monotonic, so a rung you cannot reach caps everything above it.
 *
 * ⚠️ At rungs carrying `needsItemJudgment` this is an UPPER BOUND, not a verdict:
 * the qualitative half is the model's to apply, and it applies it by proposing
 * lower. Never treat this number as "the level the student has earned".
 */
export function certifiableCeiling(
  obs: readonly CertObservation[],
  axis: CertAxis,
): number | null {
  let best: number | null = null;
  for (const rung of CERT_LADDER[axis]) {
    const qualifying = obs.filter((o) => o.level >= rung.atLeast);
    if (qualifying.length < rung.need) break;
    if (rung.gapDays != null && spanDays(qualifying) < rung.gapDays) break;
    best = rung.level;
  }
  return best;
}

export type CertRuleResult = {
  /** The level after the rule. */
  level: number | null;
  /** Did the rule move the model's number? */
  adjusted: boolean;
  /** Human-readable why, for the tutor-visible log. Null when nothing moved. */
  reason: string | null;
};

/**
 * Apply the ladder to ONE axis of a Stage-2 proposal.
 *
 * Two guards, both pure arithmetic:
 *
 *   CEILING — the model may not certify above what counts + spacing support.
 *     Raised to `current` first, because a standing already on the record is
 *     never walked back by arithmetic alone: a TUTOR may have set it, and §6
 *     says the tutor wins on the evidence. Only the DOWN rule may lower it.
 *
 *   FLOOR — a demotion needs a failure to point at. If NO observation sits below
 *     the student's current certified level, there is no clear failure at that
 *     level, so they cannot drop below it. This is the gate S97 needed.
 */
export function applyCertificationRule(args: {
  proposed: number | null;
  current: number | null;
  observations: readonly CertObservation[];
  axis: CertAxis;
}): CertRuleResult {
  const { proposed, current, observations, axis } = args;
  const hold = (reason: string | null): CertRuleResult =>
    reason == null
      ? { level: current, adjusted: false, reason: null }
      : { level: current, adjusted: true, reason };

  // No evidence on this axis at all. The level cannot move: hold the standing, or
  // stay NOT-YET-OBSERVED. STAGE2_SYSTEM says exactly this; here it is true by
  // construction rather than by the model's compliance.
  if (observations.length === 0) {
    if (proposed === current) return hold(null);
    return hold(
      current == null
        ? `${axis}: no observations on this axis — held at NOT YET OBSERVED (model proposed ${proposed})`
        : `${axis}: no observations on this axis — held at ${current} (model proposed ${proposed})`,
    );
  }

  const evidenceCeiling = certifiableCeiling(observations, axis);
  const ceiling = Math.max(evidenceCeiling ?? 1, current ?? 1);
  const anyBelowCurrent = current != null && observations.some((o) => o.level < current);
  const floor = current != null && !anyBelowCurrent ? current : null;

  // The model returned "not yet observed" for an axis that HAS observations —
  // arithmetically false. An axis with evidence has a level.
  if (proposed == null) {
    return {
      level: ceiling,
      adjusted: true,
      reason: `${axis}: model returned null but ${observations.length} observation(s) exist — set to ${ceiling} by the evidence`,
    };
  }

  if (proposed > ceiling) {
    return {
      level: ceiling,
      adjusted: true,
      reason: `${axis}: model proposed ${proposed}; counts+spacing support at most ${ceiling} — capped`,
    };
  }

  if (floor != null && proposed < floor) {
    return {
      level: floor,
      adjusted: true,
      reason: `${axis}: model proposed ${proposed}, below the certified ${floor}, but NO observation sits below ${floor} — no clear failure to demote on, held at ${floor}`,
    };
  }

  return { level: proposed, adjusted: false, reason: null };
}
