/**
 * Parent-dashboard COPY — the single default map for every parent-facing string
 * the portfolio narrates (D-PDASH-3). Lives in the kernel so BOTH sides consume
 * one source: the backend read path (this file resolves horizontal labels and the
 * generated-plan default it embeds in the payload) and the frontend portfolio
 * (section headings, colour/axis/bucket names, Olórin's lines).
 *
 * The ruling (D-PDASH-3): CODE ships the full default map; a DB row OVERRIDES per
 * key; a missing/failed key FALLS BACK to the built-in default and NEVER renders
 * blank. This file is the code-default half — `resolveParentCopy(key)` always
 * returns a string. The DB-override half (a small `/admin` editor writing a copy
 * table) is a deferred follow-on; when it ships, its lookup slots in AHEAD of the
 * default here, same signature. Because every key exists here, the fallback is
 * total by construction.
 *
 * The one hazard a plain code file wouldn't have (brainstorm §copy inventory):
 * INTERPOLATED strings ("across {covered} of {total} topics") need placeholder
 * validation, or a DB override could reference a slot the caller never passes and
 * render "{total}" to a parent. `fillCopy` enforces it — every `{token}` in the
 * template must be supplied, and it throws otherwise (caught at save-time by the
 * future editor; here it guards the defaults themselves via the probe).
 *
 * NO raw 1–5 levels, NO `tutor_level`, NO `log` appear in any string here — the
 * never-show boundary (brainstorm §never-shown) is a copy constraint too.
 *
 * ── NO GENDERED PRONOUNS. Use `{name}`. (founder, S168) ──────────────────────
 * Every string here said "she"/"her". `student.pronoun` exists as a column and
 * the backfill even populates it, but NOTHING reads it — so the page was not
 * inferring anything, it was asserting one gender in 18 strings. Both students
 * loaded so far happen to be girls, which is exactly why it went unnoticed: the
 * first boy's dashboard would have misgendered him on every heading.
 *
 * The fix is the founder's: say the child's NAME. It reads warmer than "they",
 * it removes the failure mode rather than deferring it to a pronoun-inflection
 * table, and `{name}` was already threaded through half these strings.
 *
 * ⚠️ Adding `{name}` to a string makes it MANDATORY at every call site —
 * `fillCopy` throws on a missing token, by design. If you add `{name}` to a key,
 * check `ParentPage.tsx` passes it (S168 had to thread `name` into five
 * components that did not previously receive it).
 */

// ────────────────────────── the default map ──────────────────────────
// Flat dotted keys so a DB override can target one string. Grouped by comment.
export const PARENT_COPY_DEFAULTS = {
  // Axis names + their capability phrasing (never "conceptual/procedural" to a parent).
  "axis.conceptual.label": "Understanding",
  "axis.procedural.label": "Application",
  "axis.conceptual.capability": "understands the ideas",
  "axis.procedural.capability": "can apply them reliably",

  // Chapter-map colour names (D-PDASH-1: 3 states).
  "map.green": "solid",
  "map.yellow": "practising",
  "map.gray": "not taught yet",

  // Bird's-eye chapter overview — one box per chapter, coloured by progress %
  // (green sub-topics ÷ all sub-topics in the chapter). 4 states incl. red.
  "map.view.detail": "Detail",
  "map.view.overview": "Overview",
  "map.over.green": "secure",
  "map.over.yellow": "in progress",
  "map.over.red": "needs work",
  "map.over.gray": "not started",

  // Mastery buckets — texture, never a raw level (D-INS-1).
  "bucket.emerging": "just starting",
  "bucket.developing": "developing",
  "bucket.strong": "strong",
  "bucket.secure": "secure",

  // Horizontal-skill scale — DELIBERATELY three words, not the four mastery
  // buckets (S170). A cross-subject skill is a coarser claim than a topic level:
  // a tutor says "she can do this / it's uneven / this needs work", and the
  // founder's authored assessments are written in exactly those terms. Reusing
  // `bucket.*` here would either misquote them or drag topic cards along with a
  // rewording meant only for this slide.
  "hz.strong": "strong",
  "hz.mixed": "mixed",
  "hz.needswork": "needs work",

  // Section headings (the portfolio's 8 sections).
  "section.cover.title": "{name}'s progress",
  "section.month.title": "This month",
  "section.map.title": "What {name} has covered",
  "section.meters.title": "What {name} can do now",
  "section.calibration.title": "How well {name} judges their own work",
  "section.weakness.title": "Where {name} is stuck — and what's being done",
  "section.horizontals.title": "Skills that carry across subjects",
  "section.closing.title": "That's the picture",
  "section.pace.title": "The plan — and where {name} is",

  // Olórin's per-section lines — DEFAULTS (v1 templated; generation is a later
  // slice). Each says the thing its section can't say about itself, never a caption.
  "olorin.cover": "{name} is a bright one — quick to catch on, and coming along nicely. I've walked beside {name} since the start; here's what those months have built.",
  "olorin.month": "The work that came back wasn't {name}'s to choose — the schedule brought it back to check it held.",
  "olorin.map": "Green doesn't mean {name} got it right once. It means {name} got it right again, weeks later, when I brought it back.",
  "olorin.meters": "Understanding a thing and being able to do it are different skills. Where {name} has a gap between them, it's the normal kind — and the fixable one.",
  "olorin.calibration": "Being wrong is fine. Being sure while wrong is where marks quietly slip — so it's worth watching with {name}.",
  "olorin.weakness": "I don't hide these from you. A page with no problems on it would be one you shouldn't trust.",
  "olorin.horizontals": "These aren't one subject's skills. They're the ones that follow {name} into every subject ahead.",
  "olorin.closing": "That's {name}'s story so far. I'll keep watching — come back whenever you like.",
  "olorin.pace": "Every chapter has a rhythm I plan for {name}. Here's the pace I set — and honestly, how close {name} is keeping to it.",

  // Mechanism names — WHY a topic was practised (CLOCK-1 dispatch_reason + origin).
  "mechanism.first_teach": "learning it for the first time",
  "mechanism.climb": "building on what {name} already knew",
  "mechanism.retention": "a retention check brought it back",
  "mechanism.self_serve": "unprompted",
  "mechanism.tutor_assigned": "set by the tutor",

  // Small print (interpolated — validated).
  "smallprint.coverage": "across {covered} of {total} topics covered",
  "smallprint.calibration": "based on {answered} answers {name} rated their confidence on",

  // The one headline number (element 2).
  "headline.solid": "{solid} of {total} solid",
  "headline.was": "was {prior} last month",

  // Element 6 — the plan a tutor hasn't written yet. Generated default, undated
  // (only human sentences carry a date). Never blank.
  "plan.generated_default":
    "Flagged and on the tutor's worklist — a specific plan will appear here once it's set.",

  // Story template slots (element 2 — the templated story, all data-filled).
  "story.topics": "This period {name} worked on {topics} topics.",
  "story.retention": "A retention check brought back {topic} — and {name} got it.",
  "story.self_directed": "{name} practised {count} of them unprompted.",
} as const;

export type ParentCopyKey = keyof typeof PARENT_COPY_DEFAULTS;

// ────────────────────────── interpolation ──────────────────────────
const TOKEN = /\{(\w+)\}/g;

/** Every `{token}` referenced by any default string (for validation/tests). */
export function placeholdersOf(template: string): string[] {
  return [...template.matchAll(TOKEN)].map((m) => m[1]!);
}

/**
 * Fill a template's `{token}`s from `vars`. THROWS if a token has no value —
 * the placeholder-validation the brainstorm flagged as the one hazard. Extra vars
 * are ignored (a template may use a subset). Values are coerced to string.
 */
export function fillCopy(template: string, vars: Record<string, string | number> = {}): string {
  return template.replace(TOKEN, (_, name: string) => {
    if (!(name in vars)) {
      throw new Error(`copy: missing placeholder {${name}} in "${template}"`);
    }
    return String(vars[name]);
  });
}

/**
 * Resolve a copy key to its final string. Code-default only for now; the DB
 * override slots in ahead of this when the editor ships (same signature). Always
 * returns a string (fallback is total — every key exists in the default map).
 */
export function resolveParentCopy(
  key: ParentCopyKey,
  vars: Record<string, string | number> = {},
): string {
  return fillCopy(PARENT_COPY_DEFAULTS[key], vars);
}

// ────────────────────── horizontal-skill labels (D-PDASH-5) ──────────────────────
// Slug → parent-facing {label, gloss}, phrased as things the child DOES ("Explains
// why", not "causal reasoning"). ⚠️ The REAL copy is DEFERRED — it needs the actual
// ingested slug list (local has 0 published chapters) + a founder brand-voice redline
// (D-PDASH-5). This is a small placeholder set covering the demo's slugs; any unmapped
// slug falls back to a prettified label + the skill's own definition as the gloss.
export const HORIZONTAL_COPY: Record<string, { label: string; gloss: string }> = {
  language_precision: {
    label: "Says it precisely",
    gloss: "States definitions in full and shows complete working, not shortcuts.",
  },
  causal_reasoning: {
    label: "Explains why",
    gloss: "Reasons from a principle to a result, rather than pattern-matching an answer.",
  },
  algebraic_fluency: {
    label: "Handles the algebra",
    gloss: "Manipulates and simplifies expressions accurately and without slips.",
  },
  notation_discipline: {
    label: "Writes it cleanly",
    gloss: "Keeps every line a true equation — no dropped signs or misused equals.",
  },

  // ── Authored taxonomy (S170) ────────────────────────────────────────────
  // Names for skills a tutor actually named, added when the founder authored
  // real per-student assessments. These are TAXONOMY — the name of a skill and
  // what it means in general — so they belong here. The sentence about a
  // particular child lives in `horizontal_skill_state.prose`, in the database,
  // sourced from the out-of-repo hand-off; it must never be pasted into this
  // file, which is a shared git-tracked package.
  // The `gloss` is the generic meaning and is what renders when a student has
  // no authored prose of their own.
  transfer_to_new_situations: {
    label: "Transfer to new situations",
    gloss: "Carries an idea into an unfamiliar setup without being told to.",
  },
  spotting_contradictions: {
    label: "Spotting contradictions",
    gloss: "Notices when a reason doesn't hold, even when it sounds convincing.",
  },
  picking_the_right_tool: {
    label: "Picking the right tool",
    gloss: "Asks what kind of question this is before starting to calculate.",
  },
  diagram_to_algebra: {
    label: "Moving between diagram and algebra",
    gloss: "Turns a picture into equations, and equations back into a picture.",
  },
  precision_of_language: {
    label: "Precision of language",
    gloss: "Says exactly what is wrong, not only that something is wrong.",
  },
  clear_thinking: {
    label: "Clear thinking",
    gloss: "Knows what is being asked and what they are working towards, and can say it out loud.",
  },
  fixed_vs_varying: {
    label: "Separating what's fixed from what varies",
    gloss: "Keeps what is given apart from what is being asked for.",
  },
};

/** Prettify an unmapped slug: `causal_reasoning` → `Causal reasoning`. */
export function prettySlug(slug: string): string {
  const s = slug.replace(/[_-]+/g, " ").trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Parent-facing label + gloss for a horizontal slug. Mapped copy wins; otherwise
 * a prettified label and (if available) the skill's own definition as the gloss.
 */
export function horizontalLabel(
  slug: string,
  definition?: string | null,
): { label: string; gloss: string } {
  const mapped = HORIZONTAL_COPY[slug];
  if (mapped) return mapped;
  return { label: prettySlug(slug), gloss: definition ?? "" };
}
