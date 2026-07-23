# Conceptual Question Kinds — the palette

**Status: started (9 kinds; 1 locked for future use), grows on evidence.** Start small, add a kind once its when-to-use is confirmed. This is the *which*, not the *how* or the *how-good*: [`question-authoring.md`](question-authoring.md) is **how** an assignment is authored; [`question-craft.md`](question-craft.md) is **what makes any question good**; this doc is **which kind of conceptual question to reach for, and when.**

**Who reads this / "you" = the author.** The standardized palette an AI picks from when it authors the conceptual side of an assignment — and part of the v0 brief for the in-app authoring agent (Polaris #1). The **procedural** side of the palette is the **difficulty dials** (sibling docs here — science / math; Cambridge physics in draft); this doc is its conceptual counterpart.

**How "when to use" is expressed.** Each kind names the **situation** to reach for it, in the current mastery terms — the two **axis levels** (conceptual / procedural, 1–5) and the **weakness the mastery description names** (defined in [`assessment.md`](assessment.md)). It does **not** use the old named cells (Blank / Novice / Hollow / Slow Hands / Solid — dropped in assessment D46); where the source material framed a kind by cell, it's re-expressed here off the levels.

**Source.** These kinds and their when-to-use were decided one-at-a-time in the Nadi-14 walkthrough (`../question-authoring/leaning/nadi_to_dials_walkthrough.md`, with verbatim tutor calls) and its clean map (`nadi_to_dials_map.md`). The `Tn` handle on each kind cross-references that walkthrough.

**Organizing cut: flat (decided).** Kept as a flat list with the situation stated per entry — several kinds (Multi-Rep, POE, Isomorphic Transfer) flex by student level (build when an axis is thin, extend when it's strong), so no fixed bucketing is forced on them.

---

## The kinds

Each entry: **what it is** (one line) → **when to reach for it** (the situation, in axis terms).

### 1. Contrasting Cases (T2)

Two or three near-identical items differing in exactly **one** critical feature that flips the answer; the student explains the difference *before* being told.

- **Reach for it to build the conceptual axis when it's the lesser one** — the student executes reliably (procedural is up) but reasons from surface patterns, so the conceptual level lags. Engineer the contrast so the surface pattern *fails* and only the principle survives — that's what forces the schema to deepen.

*Variation theory: a feature becomes discernible only when it varies against an invariant background.*

### 2. Error Analysis (T1)

Hand the student a worked solution carrying a conceptually-informative flaw; they locate it, explain *why* in terms of the principle, and write the correct version.

- **Two situations.**
  - **(a) Repair a misconception that lives inside a reasoning chain** — the chain makes it hard, the misconception makes it diagnostic. Reach for it when you suspect a specific wrong model and the student has enough footing to follow a multi-step worked chain.
  - **(b) Nuanced strengthening of specific aspects of a concept** — when the concept is broadly in place but particular facets need sharpening; a targeted faulty step probes exactly that facet.

*Tutor lock (verbatim): "It works best when there is a reasoning chain involved along with some sort of misconception."*

### 3. Justification (T10)

"Why is the formula / relationship this way?" — or read a symbol or unit in plain English (e.g. what m/s² physically counts).

- **Reach for it when the student can apply a formula or procedure but hasn't tied it to the principle** — it lifts the conceptual axis on a procedural / formula topic. **Near-universal:** worth doing for essentially every formula.

### 4. Predict–Observe–Explain (POE, T3) — 🔒 LOCKED, future use

> 🔒 **LOCKED — for future use; not authorable in the product yet.** POE needs **multi-part questions** (commit a prediction → observe → explain/reconcile), and the product has **no multi-part question support yet.** Kept here so the palette is complete; **do not author until the feature exists.**

The student commits a prediction *with reasoning* before the reveal, then observes and reconciles.

- **When:** the conceptual understanding is **shallow** and you want to **force a change of mental model** — engineer the dissatisfaction (commit → surprise) so the schema rebuilds. The sibling of Contrasting Cases for shallow conceptual: T2 via minimal-pair contrast, T3 via commit-then-surprise.

### 5. Multi-Representational Translation (T6)

Translate between graph ↔ story ↔ symbol ↔ table.

- **When:** to build **representational flexibility**, with the demand set by *what* you ask them to translate. A **canonical pairing** (e.g. v–t graph ↔ story) is **naturally useful when the conceptual axis is thin** — it builds. An **exotic pairing** makes it useful when **both axes are strong** — it extends.

### 6. Counterfactual / Boundary (T4)

"What if X were absent / reversed?"; reverse probes, boundary tests.

- **When:** to **extend a student strong on both axes** — push them to find where the rule or method *breaks* (boundary awareness). **Use when both axis levels are 3 or above.**

### 7. Isomorphic / Near–Far Transfer (T8)

Same deep structure on a new surface. It **need not be a pair** — ask the main question with a reference to the underlying phenomenon; the difficulty lever is whether you *name that phenomenon* in the stem or remove it.

- **When:** the student's understanding is **average or above — not when struggling**, and **procedural strength in that sub-topic is above average** before you start. Near = keep the phenomenon reference (for the average student); far = remove it (harder, needs higher fluency).
- **Also does double duty:** it builds **application fluency** (fluency in *applying* the concept across surfaces, not just executing a procedure), and it gets the student to **feel / see the deeper structure within the concept.**

*Tutor lock (verbatim): "use this when the student's understanding is already average or above, not when the student is struggling… the procedural strength in that subtopic should be above average before we start using this."*

### 8. Misconception Confrontation MCQ (T5)

Distractors are each a diagnostic of a specific wrong model; the choice itself carries the signal.

- **When:** primarily a **diagnostic move, usable across all stages** to surface what's actually broken — and **what you test depends on the student's current levels.** This is the one conceptual MCQ that earns its place: the distractor *is* the diagnostic (matches [`question-craft.md`](question-craft.md) §5).

*Tutor lock (verbatim): "its more of a diagnostic move more than anything else and can be used across stages to diagnose the issues that the students have."*

### 9. Particulate / Micro→Macro Reasoning (T12)

Forbid the symbolic level — reason at the level of particles / ions / electrons / fields, then show how the **micro converges into the observed macro** phenomenon.

- **Subject-conditional — use when the topic has a micro level.** Not just chemistry: kinetic theory of gases, electricity, magnetic effects of current, etc. For some topics it is **conditional-mandatory** — the student *must* reason it out when relevant (cf. Justification's "every formula").
- **When:** the **conceptual axis is weak and the procedural aspect has moved at least a little** — a conceptual-axis *builder* deployed early, once a little procedural footing exists (not a fluent-student repair).

*Tutor lock (verbatim): "Should be used when the conceptual axis of the student is weak and the procedural aspect has moved at least a little."*

---

## Reference & grounding

- **Method:** [`question-authoring.md`](question-authoring.md) — how an assignment is authored (this doc supplies the conceptual kinds it picks from).
- **Bar:** [`question-craft.md`](question-craft.md) — how good any of these must be, whatever the kind.
- **Procedural counterpart:** the difficulty dials — sibling docs here: `math-g10-difficulty-dials.md` · `science-g10-difficulty-dials.md` · `cambridge-physics-difficulty-dials.md` (DRAFT — pending tutor ratification). Bridge map: `../question-authoring/leaning/nadi_to_dials_map.md`.
- **#19 cite-by-key** (verified in [`../../../research/INDEX.md`](../../../research/INDEX.md); science distilled inline, cite for the deep dive):
  - the palette overall → `nadi-14-question-types`, `conceptual-vs-procedural`, `difficulty-not-equal-value`
  - Contrasting Cases → `variation-theory`, `analogical-structure-mapping`
  - Error Analysis → `knowledge-integration`, `knowledge-in-pieces`, `self-explanation-effect`
  - Justification → `self-explanation-effect`, `conceptual-vs-procedural`
  - Predict–Observe–Explain → `productive-failure`, `desirable-difficulties`, `knowledge-integration`
  - Multi-Representational Translation → `representational-competence`, `transfer-near-far`
  - Counterfactual / Boundary → `knowledge-in-pieces`, `higher-order-quality-rubric`, `transfer-near-far`
  - Isomorphic / Near–Far Transfer → `transfer-near-far`, `analogical-structure-mapping`, `procedural-fluency`
  - Misconception Confrontation MCQ → `llm-question-failure-modes`, `knowledge-in-pieces`, `higher-order-quality-rubric`
  - Particulate / Micro→Macro Reasoning → `representational-competence`, `conceptual-vs-procedural`
