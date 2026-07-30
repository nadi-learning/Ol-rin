/**
 * The Stage-1 scoring ladders, for the tutor deciding an override.
 *
 * Slice ASSESS-SEE (item 8). The override control is the tutor's authority over
 * the machine, and until now it was a bare `Level 1..5` dropdown with no
 * statement of what the levels MEAN — so the one judgment the system most
 * depends on was being made without the rubric being scored against.
 *
 * ⚠️ MAINTENANCE: this is a hand-kept copy of the ladders inside the Stage-1
 * prompts — `CONCEPTUAL_SYSTEM` (`src/services/assessment.ts`, "STEP 2 — Place
 * it on the 5 rungs") and `PROCEDURAL_SYSTEM` (same file, "STEP 2 — Place
 * execution on the 5 rungs"). If those are ever retuned, update this file. It is
 * deliberately a constant and not a server read: the prompt is one long template
 * string, and parsing rungs out of it at runtime would be far more fragile than
 * a copy that drifts loudly (the wording is quoted, so a mismatch is greppable).
 *
 * Verified against the prompts 2026-07-30.
 */

export type RubricAxis = "conceptual" | "procedural";

export type Rung = {
  level: number;
  /** the prompt's own name for the rung */
  title: string;
  body: string;
  /** the prompt's parenthetical aside, where it has one — these are the lines that stop inflation */
  aside?: string;
};

export const RUBRIC: Record<RubricAxis, readonly Rung[]> = {
  conceptual: [
    {
      level: 1,
      title: "Misses the point",
      body: "Restates the question, a tautology, an irrelevant reason, or only names a rule with no meaning; freezes or misapplies on a twist.",
    },
    {
      level: 2,
      title: "One idea",
      body: "One relevant aspect, then stops. No connection.",
    },
    {
      level: 3,
      title: "Several, unlinked",
      body: "Several correct points LISTED not connected (“and… and…”); explains WHAT not WHY; justification correct but local to this problem.",
      aside: "The shallow plateau — most work sits here.",
    },
    {
      level: 4,
      title: "Connected to principle",
      body: "Integrates the pieces, explains WHY, links to the underlying principle, reasons counterfactually, handles a non-routine variant by reasoning FROM the principle.",
      aside: "The shallow→deep jump.",
    },
    {
      level: 5,
      title: "Generalises",
      body: "Everything in 4, AND carries the principle to an UNTAUGHT context or new domain.",
    },
  ],
  procedural: [
    {
      level: 1,
      title: "Can't execute",
      body: "Can't start or abandons, steps out of order, the METHOD itself is broken — not just a slip.",
    },
    {
      level: 2,
      title: "Struggling",
      body: "Reaches the answer with visible friction: uncompressed sub-steps, self-corrections, restarts, occasional slips; rigidly one method; slow.",
    },
    {
      level: 3,
      title: "Reliable but deliberate",
      body: "Right and clean, method solid and repeatable, few self-corrections — but walks every step explicitly, with no compression.",
      aside: "Most solid work sits here — that is fine.",
    },
    {
      level: 4,
      title: "Automatic",
      body: "Fast against expectation, smooth, COMPRESSED steps (skips obvious intermediates), few or no self-corrections.",
    },
    {
      level: 5,
      title: "Automatic + flexible",
      body: "All of 4, PLUS chooses an efficient or non-standard method, or adapts to an atypical case.",
      aside: "4–5 are aspirational — don't inflate without the compression (4) or flexibility (5) actually shown.",
    },
  ],
};

/** The gates that decide which level is correct — each one is a common override error. */
export const RUBRIC_GATES: Record<RubricAxis, readonly string[]> = {
  conceptual: [
    "3→4 is connection, not count — the single most important line.",
    "4→5 requires transfer to a context NOT taught on. A drilled variant is still 4.",
    "A wrong final answer only lowers this axis if the break was reading / comprehension / transformation. An arithmetic slip does not dent a sound explanation.",
  ],
  procedural: [
    "A slip in THIS procedure (arithmetic, sign, units, notation) CAPS the rung — it keeps them out of 4–5.",
    "A slip in a DIFFERENT adjacent skill does NOT lower this rung.",
    "Choosing the WRONG method entirely is CONCEPTUAL, not procedural — don't penalise execution for it.",
  ],
};

/**
 * The easiest override mistake in the system, and the reason this note exists.
 *
 * The Stage-2 level control offers null as a real, selectable value. A tutor who
 * reads "not yet assessed" as "level 1" and sets it there converts a COVERAGE GAP
 * into a recorded WEAKNESS — which then flows into mastery, the worklist, and the
 * parent's report. The prompt's own BOUND rule is explicit: "an unexposed axis is
 * a coverage gap, not weakness."
 */
export const RUBRIC_NULL_NOTE =
  "null is NOT level 1. Null means the axis was never exposed — the question gave no chance to show it. That is a coverage gap, not a weakness. Setting it to 1 records a weakness the student never demonstrated.";
