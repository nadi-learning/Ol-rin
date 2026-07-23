# Cambridge IGCSE Physics — Difficulty Dials Catalog

**STATUS: DRAFT — pending tutor ratification.** The clustering below is empirically derived, but the tutor's classroom sense overrides it wherever they disagree. Treat rung labels and exemplar placements as proposals, not law.

**What this is.** The chapter-independent "dial vocabulary" for sizing up the difficulty of any Cambridge IGCSE Physics question — and for authoring along it. Difficulty here is the **number and size of the leaps** a question forces: the unstated moves a student must supply (a leap = a step *not* printed on the surface that the student's mind has to produce). Six dials name *what kind* of leap; two cross-cutting dimensions size *how many* and *how hard*; one hygiene tag captures procedural noise. This is the sibling of the CBSE catalogs (`science-g10-difficulty-dials.md`, `math-g10-difficulty-dials.md`) — same skeleton, but Cambridge's dials are different because they were derived from Cambridge papers, not borrowed.

**Provenance.** Derived empirically from ~87 questions read across all 6 chapters of the Papers 2 (Extended MCQ) + 4 (Extended structured) PYQ bank. Method: two open-coding grounded-theory pilots (Ch1 Mechanics → 8 raw leap families; Ch4 Electricity → the 5-dial abstraction) plus four confirmatory validation passes (Ch2 Thermal, Ch3 Waves, Ch5 Nuclear, Ch6 Space). Every question was solved by hand from the figure image *before* the mark scheme, traced as the path the student must produce, each self-supplied move tagged SHALLOW/MID/DEEP, then coded onto a dial+rung. `metadata.difficulty` was never used (project-flagged untrustworthy). The six source artifacts in `cambridge-dials-*.md` (siblings here) remain the audit trail; this catalog states the conclusions.

**Sampling caveats (read before trusting an absence).** A quiet dial in one chapter's sample is *not* evidence against it. Thermal's REPRESENT never fired because no graph-production items were sampled (heating/cooling curves exist in the chapter). Space's REPRESENT scored zero for the same reason (H–R diagrams, radiation curves exist). Thermal's sample found *zero* DEEP leaps — likely real (its hard idea is a distribution argument PYQs usually ask at MID) but possibly a sampling artifact. Read low dial-counts as "this sample didn't exercise it," never "the chapter lacks it."

---

## The core idea

A Cambridge Physics question's difficulty is a **mix of six dials**, plus two dimensions that cut across all of them, plus one hygiene tag.

- **Six dials** — RETRIEVE, READ THE STRUCTURE, CHAIN, REPRESENT, EXPLAIN, CALIBRATE. Each is an ordered ladder (rungs easy→hard) naming *what the student's mind has to do*.
- **Two cross-cutting dimensions** — BREADTH (total leap count) and DEPTH (hardness of the single hardest leap: SHALLOW/MID/DEEP). These are the "number and size of leaps" made explicit. **Leap count ≠ leap depth** — a 13-mark question can be wide-but-shallow; a 6-mark one can be narrow-but-deep.
- **One hygiene tag** — calculation hygiene (unit conversion, powers-of-ten/standard-form, sig-figs, periodic normalisation). A count feeding BREADTH, never a dial.

A chapter has a **signature**: which dials it loads high, which it leaves idle. Know the signature and you know what "hard" means for that chapter before writing a question.

Every question reports as `{dominant dial(s), depth of hardest leap, total breadth}`.

---

## Dial 1 — RETRIEVE: supply the unstated relation, definition, or fact

*The surface hands a term or values; the student must produce the law/relation/definition/fact that connects them. The relation is never printed.* The backbone dial — by far the most-used in every chapter, and the entire workhorse of MCQs.

| Rung | What changes in the demand | Exemplars (chapter · qid) | Why it's at this rung |
|------|----------------------------|---------------------------|------------------------|
| **1 — Single clean recall** | One named relation, definition, fact, **or cause**; no competitor | Mech `mcq_0450` (efficiency ≤100% from conservation), Mech `mcq_0775` (Newton-1 on a moving body); Elec `mcq_0430` (E=VIt); Waves `mcq_0390` (EM spectrum order); Nuclear `mcq_0150` (half-life = time to halve); Space `mcq_0072` (Sun's 3 emission bands) | One lookup, nothing to reject. Includes "supply the unstated *cause* of an observation" (Waves `mcq_0480`: multiple exit rays → multiple frequencies). |
| **2 — Two-component / precise recall** | The answer needs *both halves* stated, or exact wording | Mech (define acceleration, `str_0222`); Elec `mcq_0610` (field = force on a **positive** charge), `str_0128` (define field; define kWh); Thermal `str_0061` (SHC = per-mass AND per-temp), `str_0089` (boiling point = temperature AND phase change); Space `str_0024` (Hubble constant = speed ÷ distance, both halves) | Dropping one qualifier loses the mark. The "specific"/"positive"/denominator half is the routine casualty. |
| **3 — Discriminate a near-neighbour** | Reject a confusable relation/member | Mech `str_0247` (thermal capacity C=mc vs specific c); Elec `mcq_0470` (inverse-area direction), `str_0111` (NOR vs OR vs NAND); Waves `mcq_0345` (seismic P=longitudinal vs S=transverse); Nuclear `mcq_0285` (β: n→p+e⁻, not "electron emitted"); Space `mcq_0133` (Sun peaks visible, not red/IR) | The difficulty is the *discrimination*, not the recall. Distractors weaponise the near-neighbour. |
| **3.5 — Locate on a stored model/sequence** *(provisional — Space)* | Place a stage/item within a remembered process or ordering | Space `mcq_0110` (red supergiant on the high-mass branch of the life-cycle fork; rule out remnants & low-mass), `str_0027` (life-cycle gap-fill), `mcq_0133` (Sun on the temperature→peak-band scale) | Recall-family but distinct from r3: you locate a state in a *model*, not reject a confusable definition. Appeared 3× in Space; watch for recurrence before firming up. |
| **4 — Fight a contrary intuition** | The right relation contradicts a strong prior; weaponise a distractor on that prior | Mech `mcq_0680` (centripetal not centrifugal), `mcq_0775` (force-to-keep-moving); **Elec `mcq_0360` + `str_0099` (e.m.f. ∝ rate-of-change, not amount — the induction DEEP)**; **Waves `str_0126` (shiny = good reflector, not emitter — DEEP), `str_0072` (object inside f → image flips virtual — DEEP)**; Nuclear `str_0042` (subtract background before halving — DEEP), `str_0064` (3-way α/β/γ for a thickness gauge — DEEP); Space `str_0027` (seasons via axial tilt, not Sun distance) | Turning the dial = how much the right answer has to *fight*. This rung carries most DEEP leaps. Note nuclear's fights are decay-mode confusions, not everyday misconceptions. |

**Author knob.** *Down:* ask for the relation with no competing option (r1). *Up:* require both components / exact wording (r2) → offer a tempting near-neighbour (r3) → set the scenario so the correct relation contradicts everyday intuition and weaponise a distractor on it (r4). **Distractors that weaponise a misconception ARE Dial-1 r3–4 made visible** — an item with a misconception-matched distractor is harder than the same stem with filler options.

---

## Dial 2 — READ THE STRUCTURE: build the situation model before any law applies

*Before a formula or rule is usable, the student must read the figure/scenario/data and decide which element the physics applies to, how things connect, or which direction/sense is in play.* Merges "pick the element," "pick the force sense," and "read the topology" — one demand: **construct the model the equation will run on.**

| Rung | What changes in the demand | Exemplars (chapter · qid) | Why it's at this rung |
|------|----------------------------|---------------------------|------------------------|
| **1 — Pick the right element** | Choose which labelled object/arrow/ray the law uses | Mech `mcq_0398` (the perpendicular segment among q/r/s/t); Waves `str_0072` (the undeviated centre ray to locate the lens); Nuclear (which Rutherford path is closest) | Several plausible labelled candidates; the discrimination *is* the question. |
| **2 — Decide a single sense/direction** | One binary spatial decision | Mech `mcq_0510` (balancing force up vs down) | One sign/direction choice gates the rest. |
| **3 — Read a connection topology (incl. tabulated/relational data)** | Map how multiple elements relate — series/parallel/feed — **or read a relational pattern off a table** | Elec `str_0136` (series-within-parallel), `mcq_0510` (transformer sides); Waves `str_0120` (further galaxy = more redshift, off a table) | A wrong topology loses the whole part. *Amended per Waves:* tabulated/relational data counts here, not only spatial figures. |
| **4 — Resolve a 3D / multi-term spatial assembly** | Build a signed/3D configuration with no option to check against | Mech `str_0156` (free-body: air resistance = weight + ma); **Elec `mcq_0395` (Fleming 3D, motion ⊥ page)**; Space `str_0028` (coincident orbital angles → conjunction) | The structured register's hardest READ — no multiple-choice safety net. |

**Author knob.** *Down:* state the structure in words ("the resistors are in parallel"). *Up:* force it off the figure (r1) → require a direction decision (r2) → use a compound topology or a data table they must parse (r3) → require a 3D/multi-term signed assembly (r4). **Chapter note:** Thermal, Nuclear, and Space barely fire this dial — they are "structurally flat" (little topology to read). That is a true chapter signature, not a defect.

---

## Dial 3 — CHAIN: run the solution through unstated intermediate steps

*The target can't be reached directly; the student must manufacture one or more hidden quantities, possibly nested, and carry results forward.* The two axes are *how many links / how deep the nesting* and *whether the paper scaffolds them*.

| Rung | What changes in the demand | Exemplars (chapter · qid) | Why it's at this rung |
|------|----------------------------|---------------------------|------------------------|
| **1 — One link, scaffolded** | The intermediate is pre-asked as its own labelled part | Mech `str_0231` (impulse asked before force); Elec `str_0094` (V_out feeds charge, separate parts); Thermal `str_0089` (energy pre-asked, feeds the rate calc) | Scaffolding collapses the depth — same chain, easy setting. |
| **2 — One link, unscaffolded** | Must spot one hidden quantity yourself | Mech `str_0192` (work = mgh, force never given); Elec `str_0128` (convert W→kW *inside* the energy calc); Thermal `str_0089` (recognise the answer is a *rate*, divide by t); Nuclear `str_0056` (neutrons = A−Z) | No sub-part flags the hidden quantity. |
| **3 — Two links / multi-step chain** | Two stacked hidden steps, no scaffold | Mech `str_0222` (work → force → deceleration); Elec `str_0136` (parallel R, then subtract); Nuclear `str_0042` (halve net, then re-add background) | Demand rises with (nesting depth) × (1 − scaffolding). |
| **4 — Long chain with held intermediates** | Three+ links, must carry values across them | Mech `str_0247` (ΔT → energy via C → time via power); Elec `str_0099` (4-stage transformer causal chain) | Hold multiple intermediates simultaneously. |

**Author knob.** *Down:* pre-ask every intermediate as a labelled sub-part. *Up:* remove the scaffold (r2) → require two stacked steps (r3) → lengthen the chain and force carried intermediates (r4). **Scaffolding is the single cheapest difficulty knob** — same chain, two settings, demonstrated cleanly in Thermal `str_0089`. **Chapter note:** Electricity is CHAIN-heavy; Waves and Space are CHAIN-light (their calculations are short single substitutions, difficulty living in units/scale instead).

---

## Dial 4 — REPRESENT: produce or decode a representation whose form carries the physics

*Generate a diagram/graph/symbol to a required shape, or extract physics from one — where the* form *itself is the answer, not a value read off it.*

| Rung | What changes in the demand | Exemplars (chapter · qid) | Why it's at this rung |
|------|----------------------------|---------------------------|------------------------|
| **1 — Decode a convention** | Read meaning from a standard representation | Elec `str_0125` (field-line density → strength); Waves `mcq_0305` (read peak height, not axis range), `mcq_0260` (infer motion sense off a snapshot); Nuclear `mcq_0261` (read a decay-graph point against a value) | Read the form correctly first; the trap is misreading the convention. |
| **2 — Recall & produce a fixed symbol/shape** | Render a standard symbol or determinate shape | Mech `str_0222` (two-segment speed–time from prose); Elec `str_0094` (draw PD symbol), `str_0111` (gate symbols) | The shape is determinate; the student must render it. |
| **3 — Produce a shape that encodes a behaviour (incl. particle-track / trajectory diagrams)** | Render a curve/graph/path whose *form* states a law | Mech `str_0146` (Hooke curve bending past the limit); Elec `str_0099` (sinusoidal e.m.f.–time, correct cycle count); Waves `str_0107` (internal prism ray consistent across both faces); **Nuclear `str_0045` (Rutherford back-scatter / partial-deflection paths)** | *Amended per Nuclear:* particle-track/trajectory diagrams qualify, not only graphs. The form must encode the physics correctly. |
| **4 — Produce *then measure* your own construction** | Build a representation and read a quantity off it | Mech `str_0201` (tangent construction + gradient read); **Waves `str_0072` (4-step parallel-ray-through-F construction + measure f — DEEP)** | Reading-accuracy compounds production; the examiner-confirmed loss point. |

**Author knob.** *Down:* give the representation, ask for one decoded value (r1). *Up:* ask them to draw a standard symbol/shape (r2) → a shape that must encode a behaviour (r3) → construct *and then measure* their own diagram (r4). **Chapter note:** Waves is REPRESENT-heavy (wave snapshots, ray diagrams, graphs everywhere). Thermal and Space scored zero in-sample — a sampling gap, not an absence (heating curves, H–R diagrams exist).

---

## Dial 5 — EXPLAIN: originate a multi-clause causal / process / balance argument

*Explain an observable by reasoning over a process, mechanism, or balance — the answer is a structured argument with required linked clauses, not a single value.* P4-only register: MCQs cannot grade it.

| Rung | What changes in the demand | Exemplars (chapter · qid) | Why it's at this rung |
|------|----------------------------|---------------------------|------------------------|
| **1 — Step-by-step process description** | Narrate a sequence of states/transfers (incl. particle-model: which particles, what they do, the macroscopic result) | Mech `str_0192` (energy-transfer narrative); Thermal `str_0072` (pressure from molecular collisions), `str_0052` (evaporative cooling, conduction relay); Space `str_0033` (state the expansion pattern) | Narrate a known process; the characteristic Thermal demand is *particle-model narration*. |
| **2 — Coupled two-clause mechanism** | Two clauses that must *both* appear and link | Thermal `str_0052` (ion→electron→ion relay, two-ended); Elec `str_0111` (relay: coil driven by small output AND switch closes high-current path); Waves `str_0091` (lens shortens focal length → image onto retina); Space `str_0028` (low density but huge volume → greater mass → higher GFS) | A one-sided answer earns partial credit only. |
| **3 — Equilibrium / balance argument, or evidence-to-conclusion inference** | Explain a static observable via equal opposing rates, **or generalise from a pattern to a conclusion** | Mech `str_0247` (steady temp = rate-in equals rate-out); Elec `str_0099` (each link causes the next); Waves `str_0120` (trend → "universe is expanding") | *Amended per Waves:* inductive "trend → conclusion" reasoning sits here alongside balance arguments. |
| **4 — Counterfactual / limiting argument** | Reason about an unreachable state by contradiction or extrapolation | Mech `str_0156` ("if speed were zero, drag vanishes → can't reach zero"); Space `str_0033` (time-reversal: expanding now → once a point — the Big-Bang argument) | The genuine ceiling of the dial; proof-by-contradiction or extrapolate-to-origin. |

**Author knob.** *Down:* ask for a one-line description of a single step. *Up:* full step-by-step process (r1) → two coupled mark-bearing clauses (r2) → a balance/inference argument (r3) → a counterfactual/limiting argument (r4). **Cheapest sub-knob:** the mark scheme can demand 1, 2, or 3 linked clauses for the marks — same prompt, rising ceiling. **Chapter note:** Thermal loads this dial high (kinetic-model narration); it is its signature alongside RETRIEVE.

---

## Dial 6 — CALIBRATE: judge a magnitude / scale and match it to a requirement, method, or representation

*Bring or compute an order-of-magnitude estimate and pair it with something — an instrument's resolution, an application's requirement, a measurement method valid at that scale, or a unit conversion whose scale makes it hard.* Reinstated after appearing across **three chapters** (Mechanics, Nuclear, Space) — it cleared the ≥2-chapter rule that the pilots used to retire chapter-specific singletons. Distinct from the hygiene tag: hygiene is shallow-by-definition; CALIBRATE is where scale-work becomes a *reasoning* demand.

| Rung | What changes in the demand | Exemplars (chapter · qid) | Why it's at this rung |
|------|----------------------------|---------------------------|------------------------|
| **1 — Pick the right order of magnitude / match to a tool** | Bring an unstated size estimate, pair it with an instrument or region | Mech `mcq_0620` (paper ≈ 0.1 mm → micrometer ≈ 0.01 mm); Mech `str_0201` (distance = area under a *curved* region, estimate it) | A clean order-of-magnitude match; no competing constraint. |
| **2 — Justify a magnitude against a single requirement** | Choose a value so it satisfies one application constraint | Nuclear `str_0064` (smoke-alarm/gauge half-life must be *years* — long enough to last, not seconds or millennia) | Reason "this magnitude, because the application needs it." |
| **3 — Scale-conditioned method/representation selection** | Pick the right method/instrument/model for the order-of-magnitude regime in play | Space `str_0029` (supernova standard-candle, not parallax, because Hubble is circular at cosmological scale) | Know which method is *valid at which scale* — none of D1–D5 names this. |
| **4 — Deep scale construction / non-linear conversion** | Construct or convert across orders of magnitude where the scale itself fights intuition | Space `str_0028` (km³→m³ = ×10⁹ not ×10³, cubic conversion fighting the linear-unit intuition; MS-flagged poorly answered); Space `str_0027` (build a light-year from off-sheet constants, unprompted 10¹⁵ recall) | The scale-work *is* the ceiling — same "fight a contrary intuition" demand as D1 r4, in scale costume. |

**Author knob.** *Down:* hand the magnitude and the tool. *Up:* require an unstated estimate matched to a tool (r1) → justify a value against an application requirement (r2) → select the method/representation valid at the scale (r3) → force a deep non-linear scale construction or off-sheet order-of-magnitude recall (r4). **Caveat:** rungs 3–4 are built from single-chapter (Space) instances and remain provisional — confirm against a second scale-heavy chapter.

---

## The hygiene tag — calculation hygiene

*Unit conversion + powers-of-ten / standard-form + significant-figures + periodic (mod-360) normalisation.* Procedural noise, recorded as a **count feeding BREADTH**, never a dial. Inventing a dial for it re-commits the over-granularity error the pilots were built to avoid.

**Tutor-ruled design decision (implement exactly): the tag is SHALLOW-BY-DEFINITION. It has NO depth field.** Anything deep enough to want a depth field was never hygiene — deep scale-work codes onto **Dial 6 (CALIBRATE)** instead. This resolves the tension Space exposed (its km³→m³ and light-year leaps looked like "deep unit conversion"): they are not hygiene at all, they are CALIBRATE r4.

**Tutor's insight, verbatim — record it as a chapter-level finding:**

> "the unit conversation for the space chapter might be a key understanding of that chapter, sure it is a horizontal skill but the skill becomes difficult only in that chapter."

So for the **Space chapter specifically**, scale-handling is not a side-skill but a **key understanding of the chapter itself** — Space's breakdown should surface it as a chapter-level learning objective, and the chapter's signature loads **Dial 6 high**. A horizontal skill that becomes a vertical demand only here.

---

## The two cross-cutting dimensions

Not dials you turn on an LO in isolation — they describe the *whole question*. The pilots' central lesson: these two are independent, and **leap count ≠ leap depth**.

- **BREADTH — total leap count.** How many supplied moves the question demands. High-mark questions are often *wide* (many shallow leaps), not deep. *Author knob:* add/remove sub-parts. *Ceiling read:* count the leaps (include hygiene-tag instances).
- **DEPTH — hardness of the single hardest leap** (SHALLOW / MID / DEEP). The deepest demand carries the ceiling regardless of breadth. *Author knob:* push the hardest single leap up a rung. *Ceiling read:* tag the hardest leap.

**Report a question as `{dominant dial(s), depth, breadth}`.** The wide-vs-deep contrast, from the data:

- **Narrow-but-deep:** Elec `str_0099` = *Dial 5 r3 + Dial 1 r4 (DEEP), breadth 9* — the induction concept carries it.
- **Wide-but-shallow:** Elec `str_0136` = *Dial 2 r3 + Dial 3 r3, all ≤MID, breadth 7*; Thermal `str_0061` = *10 marks, 12 leaps, all ≤MID* — wide, no DEEP.

Two questions of similar mark value, opposite difficulty signatures — exactly what a single "marks" number hides.

---

## Chapter signatures

Which dials each chapter loads, from the actual coded data. The dial *set* is fixed; only the loading changes — and the loading is itself a fingerprint.

| Chapter | Loads high | Loads low / idle | DEPTH ceiling in sample |
|---------|-----------|------------------|--------------------------|
| **Ch1 Mechanics** | READ THE STRUCTURE + CHAIN heavy; EXPLAIN at the top end | — | DEEP (free-body assembly, counterfactual limit) |
| **Ch4 Electricity** | CHAIN-heavy; conversion-dense (hygiene tag busy) | — | DEEP — concentrated in **induction** |
| **Ch2 Thermal** | RETRIEVE + EXPLAIN (kinetic-model narration) | READ THE STRUCTURE (1 hit), REPRESENT (0, unsampled) | MID only in sample (no DEEP found — see caveats) |
| **Ch3 Waves** | REPRESENT-heavy (snapshots, ray diagrams, graphs) | CHAIN-light (short substitutions) | DEEP (lens focal boundary, shiny-reflector) |
| **Ch5 Nuclear** | RETRIEVE + CHAIN (notation, conservation, half-life arithmetic); CALIBRATE present | READ THE STRUCTURE near-idle | DEEP (background subtraction, α/β/γ selection) |
| **Ch6 Space** | RETRIEVE-dominant; CALIBRATE / scale ceiling | READ THE STRUCTURE (1 hit), CHAIN (short), REPRESENT (0, unsampled) | DEEP (Big-Bang time-reversal; cubic scale conversion) |

RETRIEVE is the always-on backbone in every chapter (≈49–51% of leaps), exactly as the CBSE Concept dial is always-on.

---

## Chapter ceiling concepts

The 1–2 ideas per chapter that carry its DEEP leaps. Directly useful for teaching allocation — this is where Dial-1 r4 and Dial-5/6 upper rungs cluster, and where teaching effort buys the most ceiling.

| Chapter | Ceiling concept(s) |
|---------|--------------------|
| **Mechanics** | Signed free-body assembly under acceleration; counterfactual limiting arguments (terminal velocity) |
| **Electricity** | **Induction = rate-of-change of flux, not amount** (both DEEP leaps in the sample were this single idea) |
| **Thermal** | The molecular-distribution model as a *causal* tool (only the fastest escape → average KE of the rest falls); conduction as an ion→electron→ion relay. *No DEEP reached in sample — pushable to DEEP via distribution-tail items* |
| **Waves** | Lens image behaviour across the focal boundary (object inside f → virtual); **shiny = reflector, not emitter** |
| **Nuclear** | Background subtraction (separate a source's activity from a constant baseline); radiation-type trade-offs for an application (penetration/ionisation). **NOT half-life arithmetic** — that codes SHALLOW/MID throughout |
| **Space** | The expanding-universe model (Hubble → Big Bang, time-reversal + scale-conditioned distance methods); **order-of-magnitude / non-linear scale handling** (the chapter's surprise procedural ceiling) |

---

## How to use this when authoring

1. **Read the chapter's signature first.** Decide which dials the LO should exercise and how far. That decides what "hard" means here before you write anything. (Don't force CHAIN into Waves; don't force READ-THE-STRUCTURE into Space.)
2. **Take one concept and ride it up a dial.** Define a relation (D1 r1) → require both halves (r2) → offer a near-neighbour distractor (r3) → pit it against an intuition (r4). One concept, escalating demand.
3. **Turn the two cheapest knobs.** (a) **Scaffolding** (Dial 3): pre-ask intermediates to lower difficulty, remove the scaffold to raise it — same chain, two settings. (b) **Distractor design** (Dial 1): a distractor that weaponises a specific misconception *is* a Dial-1 r3–4 rung made visible; filler options leave the same stem easier.
4. **Set DEPTH and BREADTH on purpose.** Want a hard-but-fair item? Push one leap to DEEP and keep breadth low (narrow-but-deep). Want broad coverage? Stack many SHALLOW leaps (wide-but-shallow). Don't conflate the two.
5. **Pitch the ceiling at the ceiling concepts.** If you want to lift a chapter's ceiling, author at its ceiling concept (induction, focal-boundary, background subtraction, expanding-universe/scale) — that's where D1 r4 and D5/D6 upper rungs live.

---

## How a ceiling-setter reads a PYQ

1. **Solve it by hand first** (before the mark scheme) — the intended path reveals leaps the surface text hides.
2. **Trace the leaps** — every step the student must *supply* that isn't printed. Mark each SHALLOW/MID/DEEP.
3. **Assign each leap a dial + rung** — what kind of move is it (D1–D6), and which rung. Hygiene moves get the tag, not a dial.
4. **The ceiling = the max rung reached per dial, plus the overall DEPTH tag** (the single hardest leap). Report `{dominant dial(s), depth, breadth}`.
5. **Sanity-check against the chapter signature** — if a Waves item codes CHAIN-heavy or a Space item codes DEEP-without-scale, re-examine; it may be a mis-trace.

---

## The headline caveat — difficulty ≠ value

The dials grade **demand, not pedagogical worth.** A question can be easy on every dial and still be essential; hard on a dial and pedagogically thin.

- **Easy-but-essential:** "does light bend toward or away from the normal entering glass?" scores near-zero on every dial — yet it locks in a core intuition. Author by dials alone and you'd skip it.
- **Hard-but-thin:** a lens-displacement method-trick (object size = √(I₁·I₂)) scores Dial-4 hard but teaches little about how lenses work.

So the dials sit **under** the purpose layer (the chapter's conceptual targets in `topics.md`, plus misconception/quality judgement). Use them to *grade and escalate* questions whose purpose is already set — never to decide which questions are worth writing. RETRIEVE r1 recall, especially, can be either rote-trivial or load-bearing-foundational; the dial cannot tell you which — `topics.md` can.
