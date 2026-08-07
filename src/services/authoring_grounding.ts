/**
 * The PURE renderers + rules shared by the authoring MASTER CHAT and the scoped
 * WORKER (Slice QAUTH-A).
 *
 * Why a third module rather than an import between the two: `authoring_chat.ts`
 * already imports `spawnAuthoringWorker`/`planAuthoringWork` from
 * `authoring_worker.ts`, so a worker→chat import to reach `renderInsightBlocks`
 * would close a cycle. Same move `question_access.ts` made in Slice MIXED, for
 * the same reason. `authoring_chat.ts` re-exports `renderInsightBlocks` so
 * existing importers (probe_authoring_chat) keep working unchanged.
 *
 * Everything here is PURE — no tx, no AI. That is the point: every rule this
 * slice adds is assertable with no vendor in the loop (M101 — an assertion over a
 * value you do not control passes vacuously the moment that value is
 * unremarkable, and every one of these rules would otherwise only be observable
 * through a model's answer).
 */

// ───────────────────────── the insight layer (moved, + item 8) ─────────────────────────
//
// Everything a tutor records ABOVE sub-topic grain — the chapter view, the
// subject view, the student's standing on the subject-wide horizontal skills —
// is written by Stage-2b synthesis at finalize.
//
// Each block sits at the grain its TABLE is keyed on (founder ruling, S181):
// chapter insight follows the CALLER's chapter scope (the chat's chapters; the
// worker's ONE chapter), while `student_subject_insight` and
// `horizontal_skill_state` are per-SUBJECT rows and resolve to the subject(s)
// those chapters belong to.
export type InsightGroundingRows = {
  /** Chapter-grain insight for the caller's chapter(s), in chapter order. */
  chapters: Array<{ chapterName: string; insight: string }>;
  /** Subject-grain insight for the subject(s) those chapters belong to. */
  subjects: Array<{ subjectName: string; insight: string }>;
  horizontals: Array<{
    subjectName: string;
    slug: string;
    /** NULL = never observed. NOT level 1 — see below. */
    level: number | null;
    prose: string;
  }>;
  /**
   * Slice AUTHOR-PREF (item 10) — the TUTOR'S OWN instruction on how to teach
   * this student, per CHAPTER (D-CHAPTER-PREF, S185). Unlike the three above it
   * is not synthesis output: a human wrote it by hand and owns it. Only chapters
   * with a note appear; an unwritten chapter is absent, never an empty line.
   *
   * `chapterName` is NOT optional and is NOT gated on `multiSubject`: these rows
   * span the whole subject, so most of them describe a chapter the caller is not
   * working in. Dropping the name would present a note written about
   * Thermodynamics as though it were about the chapter being authored.
   */
  preferences: Array<{ subjectName: string; chapterName: string; preference: string }>;
  /** Name the subject per line only when the caller actually spans several. */
  multiSubject: boolean;
  /**
   * Slice QAUTH-A (item 8) — the chapter the CALLER is authoring in, when there
   * is exactly one (the worker always; the chat never). The note for that chapter
   * is marked `← THIS CHAPTER` so a fan-out worker can tell its own tutor note
   * apart from the ones written about its siblings.
   *
   * Item 8's literal ask was "pass each worker its own chapter's note, not the
   * chat's". Read strictly that means DROPPING the others — which is what
   * D-CHAPTER-PREF (S185) deliberately refused for the chat, because a note
   * exists on ~1 chapter in 74 and own-chapter-only would strand nearly all of
   * them at the one surface that actually writes questions. Marking closes item
   * 8's real complaint (guidance about another chapter presented as if it were
   * about yours) without re-stranding the note.
   */
  ownChapterName?: string;
};

/**
 * Render the insight layer into grounding sections. PURE — no tx, no AI — so the
 * rule it encodes can be gated deterministically instead of through a
 * nondeterministic model read (M101: assert the rule, not an instance of it).
 *
 * The rule that matters: a horizontal with a NULL level renders "not yet
 * observed", NEVER "L1". Null means the student was never given a chance to show
 * the skill — a coverage gap, not a weakness (`horizontal_skill_state.level`'s
 * own bound, and the null≠1 note item 8 put in front of the tutor). Collapsing
 * the two would tell the author to drill a weakness the student never displayed.
 */
export function renderInsightBlocks(rows: InsightGroundingRows): string[] {
  const out: string[] = [];

  if (rows.chapters.length > 0) {
    out.push(
      "",
      "STUDENT INSIGHT — CHAPTER VIEW (the tutor's standing view of this student in this chapter, written at Stage-2 certification. This is a HUMAN-REVIEWED judgement about the student and outranks any inference you would draw from the observation list):",
      rows.chapters.map((c) => `  - ${c.chapterName}: ${c.insight}`).join("\n"),
    );
  }

  if (rows.subjects.length > 0) {
    out.push(
      "",
      "STUDENT INSIGHT — SUBJECT VIEW (the same, one level up: how this student works across the whole subject, including chapters outside this one. Use it for the shape of a question — framing, scaffolding, what to assume — not for what to test):",
      rows.subjects.map((s) => `  - ${s.subjectName}: ${s.insight}`).join("\n"),
    );
  }

  if (rows.horizontals.length > 0) {
    out.push(
      "",
      'HORIZONTAL SKILLS (subject-wide skills that cut across chapters — 1–5, pooled from every sitting. "not yet observed" means the student has never been given a chance to show it: a coverage GAP, never a weakness, and never the same as level 1):',
      rows.horizontals
        .map(
          (h) =>
            `  - ${h.slug}${rows.multiSubject ? ` (${h.subjectName})` : ""}: ` +
            `${h.level == null ? "not yet observed" : `L${h.level}`} — ${h.prose}`,
        )
        .join("\n"),
    );
  }

  // Item 10. Last of the four, i.e. closest to the task the author is about to
  // do — and the only one written BY A HUMAN, which is why it is framed as an
  // instruction rather than as evidence. It says how to SHAPE the question; it
  // never says what to test (that stays with mastery + the coverage map), so a
  // preference must not talk the author out of an under-covered sub-topic.
  //
  // Every line carries its chapter name unconditionally (D-CHAPTER-PREF): the
  // read spans the subject, so most lines are about a DIFFERENT chapter than the
  // one being authored, and the header above tells the model how to weigh that.
  if (rows.preferences.length > 0) {
    const own = rows.ownChapterName;
    out.push(
      "",
      "HOW TO TEACH THIS STUDENT (written BY THE TUTOR, by hand, about this specific student — not inferred by any model. Treat it as an INSTRUCTION about the FORM of what you author: question style, framing, what has been landing. It does NOT change WHAT to test — coverage and mastery decide that. Where it conflicts with your own inference, the tutor is right. Each note is labelled with the CHAPTER the tutor wrote it against — that chapter is often NOT the one you are authoring, because a tutor's read on how a student learns carries across a subject. Apply a note from another chapter as general guidance; apply one labelled with your own chapter as specific" +
        (own
          ? ` — the note marked ${OWN_CHAPTER_MARK} is the one written about the chapter you are authoring in right now`
          : "") +
        "):",
      rows.preferences
        .map(
          (p) =>
            `  - ${rows.multiSubject ? `${p.subjectName} · ` : ""}${p.chapterName}: ${p.preference}` +
            (own && p.chapterName === own ? `  ${OWN_CHAPTER_MARK}` : ""),
        )
        .join("\n"),
    );
  }

  return out;
}

/** The marker item 8 turns on. Exported so a probe can assert it EXACTLY rather
 *  than against a remembered prefix (M109). */
export const OWN_CHAPTER_MARK = "← THIS CHAPTER";

// ───────────────────────── D-QAUTH-4: the served history ─────────────────────────
//
// 🔑 Item 3's stated rationale is NOT served by item 3's stated fix. Its "why" is
// "…and avoids duplicating work she never saw" — but scoping the bank to
// `target_student_id = me` only removes OTHER students' questions. Her OWN
// approved-but-never-served questions survive that filter and still read to the
// author as covered ground. Only `attempt` separates them.
//
// ⚠️ TWO DEFINITIONS OF "SPENT", DELIBERATELY DIFFERENT. Serving (Slice NEWONLY,
// `unansweredExpr`) counts `skip_reason IS NULL` — a skipped question comes back.
// AUTHORING counts ANY attempt row, because a skipped question was still READ:
// re-authoring the same probe wastes the slot even though practice will re-serve
// it. So do NOT collapse this to a boolean — render the three states and let the
// model weigh them.

export type ServedState =
  | { state: "answered"; at: string; confidence: number | null }
  | { state: "skipped"; at: string }
  | { state: "unserved" };

export type BankRowForPrompt = {
  stem: string;
  axis: string;
  difficulty: string | null;
  served: ServedState;
  /** Stage-1's blind read of the answer, for ANSWERED rows. Never an answer key. */
  stage1: Array<{ axis: string; level: number; reasoning: string }>;
};

/** One bank row's served state, as the author reads it. Exported for the probe. */
export function renderServedState(s: ServedState): string {
  if (s.state === "answered") {
    return `ANSWERED ${s.at}${s.confidence == null ? "" : `, the student rated their own confidence ${s.confidence}/5`}`;
  }
  if (s.state === "skipped") return `SKIPPED ${s.at} (seen and passed over — still practisable, but the probe is spent)`;
  return "NOT YET SERVED (authored, approved, and this student has never met it)";
}

/**
 * The worker's bank block: every question this student CAN see for this
 * sub-topic, each annotated with whether they have actually met it. PURE.
 */
export function renderBankWithHistory(rows: BankRowForPrompt[]): string {
  if (rows.length === 0) return "  (none authored yet — this student has an empty bank for this sub-topic)";
  return rows
    .map((r, n) => {
      const head = `  ${n + 1}. [${r.axis}${r.difficulty ? `/${r.difficulty}` : ""}] ${renderServedState(r.served)}\n     ${r.stem}`;
      const reads = r.stage1
        .map((o) => `\n     └ Stage-1 read: ${o.axis} L${o.level} — ${o.reasoning}`)
        .join("");
      return head + reads;
    })
    .join("\n");
}

/**
 * The CHAT's copy of the same signal — counts only. The chat pays for its
 * grounding on EVERY turn (Gemini never resumes, authoring_chat.ts:1419-1429)
 * while the worker pays once, so the chat gets the number and the worker gets the
 * list. PURE.
 */
export function renderServedSummary(c: {
  answered: number;
  skipped: number;
  unserved: number;
}): string {
  const parts: string[] = [];
  if (c.answered > 0) parts.push(`${c.answered} answered`);
  if (c.skipped > 0) parts.push(`${c.skipped} skipped`);
  if (c.unserved > 0) parts.push(`${c.unserved} not yet served`);
  return parts.join(", ");
}

// ───────────────────────── D-QAUTH-8: the palette index + the kind allowlist ─────────────────────────
//
// 🔴 A DEFECT, not a quality gap. `PROPOSE_SET_SYSTEM`/`PROPOSE_COVERAGE_SYSTEM`
// instruct the model to name "the conceptual-question KIND (from the palette)"
// and `runVendoredJson` sends that paragraph as the ENTIRE system prompt — no
// SKILL.md, no palette, no dials. `kind` was then an unvalidated `z.string()`,
// and the result becomes a LOCKED instruction to the worker ("write exactly this
// one", authoring_worker.ts). So the planner could propose POE — which is 🔒
// LOCKED for want of multi-part support — the tutor would approve a
// plausible-looking blueprint, and the worker (which DOES hold the palette) would
// be pinned to an instruction contradicting its own pack.
//
// The fix is two halves that must ship together: TELL the planner what the kinds
// are, and REFUSE to pass one through that the worker cannot honour.
//
// Deliberately NOT added: the difficulty-dial catalogs. `difficulty` is free
// prose by contract design and the worker re-interprets it against the catalog it
// already holds. And the index rather than the full 9.6k palette doc, because the
// planner only needs enough to CHOOSE — the worker holds the full doc to EXECUTE.

type PaletteKind = {
  /** The canonical display name, as the worker's palette doc spells it. */
  name: string;
  /** The walkthrough handle (T1…T12) — models cite these, so they are aliases. */
  handle: string;
  /** One line: the situation to reach for it, in axis terms. */
  when: string;
  /** 🔒 LOCKED kinds exist in the palette but must never reach the worker. */
  locked?: true;
};

export const PALETTE_KINDS: PaletteKind[] = [
  {
    name: "Contrasting Cases",
    handle: "T2",
    when: "build the conceptual axis when it is the lesser one — the student executes reliably but reasons from surface patterns",
  },
  {
    name: "Error Analysis",
    handle: "T1",
    when: "a specific wrong model is suspected AND the student can follow a multi-step worked chain; also for sharpening particular facets of a concept broadly in place",
  },
  {
    name: "Justification",
    handle: "T10",
    when: "the student applies a formula or procedure but has not tied it to the principle — near-universal, worth doing for essentially every formula",
  },
  {
    name: "Predict–Observe–Explain (POE)",
    handle: "T3",
    when: "shallow conceptual understanding you want to force a change of model on",
    locked: true,
  },
  {
    name: "Multi-Representational Translation",
    handle: "T6",
    when: "build representational flexibility — a canonical pairing when the conceptual axis is thin, an exotic pairing when both axes are strong",
  },
  {
    name: "Counterfactual / Boundary",
    handle: "T4",
    when: "extend a student strong on both axes — use only when BOTH axis levels are 3 or above",
  },
  {
    name: "Isomorphic / Near–Far Transfer",
    handle: "T8",
    when: "understanding is average or above and procedural strength in the sub-topic is above average — never when struggling",
  },
  {
    name: "Misconception Confrontation MCQ",
    handle: "T5",
    when: "a diagnostic move, usable at any stage, to surface what is actually broken",
  },
  {
    name: "Particulate / Micro→Macro Reasoning",
    handle: "T12",
    when: "the topic has a micro level AND the conceptual axis is weak while the procedural has moved at least a little",
  },
];

/**
 * What `kind` becomes when the planner names one the worker cannot honour. NOT an
 * empty string: the drafter's item block prints `kind: <this>` as a LOCKED
 * instruction, so it has to read as an instruction to choose rather than as a
 * kind called "". Exported so a probe asserts EXACT equality instead of a
 * remembered prefix (M109).
 */
export const KIND_UNPINNED = "(not fixed — choose the kind yourself from the palette)";

/** The two hard rules, stated to the planner in the same words the worker gets. */
export const PALETTE_HARD_RULES =
  `TWO HARD RULES: **${PALETTE_KINDS.find((k) => k.locked)?.name ?? "Predict–Observe–Explain (POE)"} is 🔒 LOCKED — never propose it** (it needs multi-part questions, which the product does not support, so the worker cannot write it). ` +
  `**Misconception Confrontation MCQ is the ONE sanctioned MCQ** — use it sparingly and NEVER as the closer of a sequence.`;

/**
 * The compressed palette, for a caller that must CHOOSE a kind but does not hold
 * the full palette doc. Built from `PALETTE_KINDS` rather than hand-written, so
 * the index and the allowlist can never disagree about which kinds exist.
 */
export const PALETTE_INDEX = `THE CONCEPTUAL-QUESTION KINDS (pick each item's \`kind\` from THIS list, by the name given — the worker that writes the question holds the full palette and will execute whichever you name):
${PALETTE_KINDS.filter((k) => !k.locked)
  .map((k) => `  - ${k.name} (${k.handle}) — ${k.when}`)
  .join("\n")}
${PALETTE_HARD_RULES}`;

/** Normalize for matching: lowercase, strip everything that is not a letter or
 *  digit. Collapses "Predict–Observe–Explain (POE)" / "predict observe explain" /
 *  "POE" onto comparable tokens. */
function fold(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

// Exact aliases, checked BEFORE substring containment. "t1" must not swallow
// "t10"/"t12", which is exactly what a prefix or `includes` test would do.
const KIND_ALIASES: Record<string, string> = {
  poe: "Predict–Observe–Explain (POE)",
  predictobserveexplain: "Predict–Observe–Explain (POE)",
  multirep: "Multi-Representational Translation",
  multirepresentational: "Multi-Representational Translation",
  counterfactual: "Counterfactual / Boundary",
  boundary: "Counterfactual / Boundary",
  isomorphic: "Isomorphic / Near–Far Transfer",
  neartransfer: "Isomorphic / Near–Far Transfer",
  fartransfer: "Isomorphic / Near–Far Transfer",
  particulate: "Particulate / Micro→Macro Reasoning",
  micromacro: "Particulate / Micro→Macro Reasoning",
  mcq: "Misconception Confrontation MCQ",
  misconceptionmcq: "Misconception Confrontation MCQ",
  ...Object.fromEntries(PALETTE_KINDS.map((k) => [fold(k.handle), k.name])),
};

/**
 * Constrain a planner-proposed `kind` to the palette — the parse-boundary half of
 * D-QAUTH-8.
 *
 * Returns the CANONICAL name when the proposal names a real, authorable kind
 * (however it spelled it), and `KIND_UNPINNED` when it names the LOCKED kind or
 * something that is not in the palette at all.
 *
 * NEUTRALISE, DO NOT REJECT. Throwing would 500 the whole proposal over one bad
 * pick — the outlier this resolver was already fixed away from once (S179 §8,
 * `items` was `.min(1)` per pick). Neutralising also runs BEFORE the tutor's card
 * is rendered, so the card shows what the worker will actually be told; a
 * silently-corrected kind on the drafting side would be the same defect wearing
 * the other mask.
 *
 * PURE — so "POE can never reach the worker" is a leg with no AI in it.
 */
export function normalizePlannedKind(raw: string | null | undefined): string {
  const f = fold(raw ?? "");
  if (!f) return KIND_UNPINNED;
  const aliased = KIND_ALIASES[f];
  const hit =
    (aliased ? PALETTE_KINDS.find((k) => k.name === aliased) : undefined) ??
    PALETTE_KINDS.find((k) => fold(k.name) === f) ??
    // Last resort: the model wrapped the name in prose ("use Contrasting Cases
    // here"). Containment is safe HERE because it runs after the exact checks
    // and only against multi-word canonical names.
    PALETTE_KINDS.find((k) => fold(k.name).length >= 8 && f.includes(fold(k.name)));
  if (!hit || hit.locked) return KIND_UNPINNED;
  return hit.name;
}
