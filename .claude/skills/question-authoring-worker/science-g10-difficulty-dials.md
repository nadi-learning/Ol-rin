# How Science Difficulty Works — The Dials Framework

**Where this came from:** reading one full chapter of the Amaatra Academy / PES University workbook (CBSE Class 10 Physics) — **Light: Reflection & Refraction** — across worksheets 3.1 to 3.5 (~80 questions: definitions, numericals, ray diagrams, MCQs, a data table, and an assertion-reason block). The same patterns showed up over and over. This document writes them down so we can size up any science chapter — and author for it — the same way. It is the science sibling of `math-g10-difficulty-dials.md`.

---

## The core idea

A science question's difficulty is a **mix of four dials**, plus two things that cut across all four.

- **Four dials** — Concept, Calculation, Representation, Application. Each one can be turned from off to high.
- **Two cross-cutting modifiers** — the Assertion-Reason format (evaluate a claim instead of producing an answer) and the Inverse move (solve forward vs. work backward).

A chapter has a **signature**: which dials it turns up, and how far. Once you know the signature, you know what "hard" means for that chapter — before you write a single question.

### Relationship to the maths dials

Science is **the three maths dials, relabelled — plus one new dial.**

| Maths dial | Science dial | Why it carries over |
|---|---|---|
| Algebra | **Calculation** | Same thing: symbol/number-pushing with formulae (mirror, lens, RI). |
| Figure | **Representation** | Same thing: read or build a diagram (ray diagrams, data tables). |
| Story | **Application** | Same thing: map a real-world scene to the underlying machinery (device ↔ principle). |
| — | **Concept** *(new)* | Maths *assumes* the concepts and only makes you use them. Science **tests the knowledge itself** — definitions, laws, causal relationships, and whether a claim is even true. This is the science-specific dial. |

So the one structural difference: science adds a **Concept dial** that runs from rote recall all the way up to judging whether a stated relationship holds. Everything else is the maths framework wearing different clothes.

---

## Dial 1 — Concept: how hard is the knowing and reasoning itself? *(the new dial)*

| Stage | What it looks like | Concrete example (from this chapter) | Why it's at this stage |
|---|---|---|---|
| **C0 — Recall** | Retrieve a fact, definition, law, or unit. No reasoning. | "Define pole, centre of curvature, principal focus, aperture, focal length." (3.1a Q5) · "Units of power of a lens?" (3.2a Q7) · "What is a prism?" (3.2a Q9) | One lookup. The only demand is whether the fact is in memory. |
| **C1 — Apply one rule once** | Take a single relationship and apply it to one situation. | "Speed in air 3×10⁸, in medium 1.5×10⁸ — find refractive index." (3.5 Q3) · "Why are convex mirrors used as rear-view mirrors?" (3.1a Q4) | One rule, one application. RI = c/v; or "convex → wider field of view." |
| **C2 — Chain rules causally** | Link two or more relationships into a causal chain to reach the answer. | "Same angle of incidence in P, Q, R; refraction angles 45°, 35°, 15°. In which medium is velocity minimum?" (3.2a Q12) · "Which of media A, B, C has maximum optical density?" (15b-i) | You must run: *smaller refraction angle → more bending → higher RI → higher optical density → lower speed.* Four links, no number plugged anywhere. |
| **C3 — Judge a claim** | Decide whether a statement is true, or whether a stated reason actually explains an effect. | "A virtual image cannot be photographed" — true or false? (Q29) · "Plane mirror may form a real image" (Q22) · "Will the refractive index of B relative to C be more or less than unity?" (15b-iv) | The hardest conceptual demand: you evaluate the *relationship*, and the trap is usually a misconception (a virtual image **can** be photographed — your eye and a camera both do it). |

**Why it climbs:** C0 asks only "is it in memory?". C2 asks "can you connect the rules without a number to lean on?" — the medium-density questions are pure reasoning, no arithmetic. C3 removes the safety of a known fact entirely: the statement *looks* plausible and you must reason about whether it actually holds. **This is also where misconception-targeting lives** — most C3 items are built around a specific wrong belief students hold.

---

## Dial 2 — Calculation: how hard is the number/symbol work? *(≈ maths Algebra)*

| Stage | What it looks like | Concrete example | Why it's at this stage |
|---|---|---|---|
| **Q0 — Direct plug-in** | Values given, one formula, correct sign obvious. Answer is a number. | "5 cm object, concave mirror f = 12 cm, object at 18 cm — find position, size, nature." (Page 23 Q9) | Substitute into 1/v + 1/u = 1/f, then m = -v/u. One pass. |
| **Q1 — Sign / right-formula sensitive** | The arithmetic is easy, but you must pick the right sign or the right configuration, or you get a wrong-but-plausible answer. | "A spherical mirror and a thin lens each have f = -15 cm. The mirror and lens are likely…" → mirror **convex**, lens **concave** (3.5 Q8) · "Object at f/2 from a convex lens f — image distance?" → -f (3.5 Q6) | No real computation; the whole question is whether you know that f < 0 means convex for a mirror but concave for a lens. The distractors are all sign-confusions. |
| **Q2 — Multi-formula chain** | Two or more formulae in sequence: position → magnification → height, or RI → speed → another RI. | "Candle image 30 cm from a spherical lens is formed at 60 cm. Identify the lens, calculate f, and find the image height if the flame is 3 cm." (3.2b Q6) · "RI of glass 3/2 and water 4/3; speed in glass 2×10⁸ — find speed in water." (3.2a Q1) | You can't reach the asked quantity in one step; each formula feeds the next. |
| **Q3 — Inverse** | Given the *answer's property* (a magnification, an image size), find the input. | "Magnification of a concave mirror is +1/3 — find the type of mirror and object position." (3.1b Q7) · "Object 60 cm in front of a concave mirror, real image 30 cm in front — find magnification." (3.5 Q2) | You can't brute-force forward; you work back from the property. See also the Inverse modifier below. |
| **Q4 — Symbolic / special-method** | No numbers, or a standard method that's hidden behind an insight you must supply first. | "A convex mirror produces an image 1/nth the size — find the object distance." → **(n-1)f** (3.5 Q12) · "Object + screen, convex lens, image 9 cm; lens shifted 20 cm, image 1 cm — find f and object size." → **f = 7.5 cm, object = 3 cm** (3.5 Q14) | The (n-1)f question is pure symbols — maths A2/A3 territory inside a physics chapter. The displacement question is unsolvable by the normal lens formula until you spot that object size = √(I₁ × I₂) and that the two lens positions are conjugate. |

**Why it climbs:** Q0 lets you lean on the formula. Q1 takes away the obvious sign so only understanding survives. Q4 takes the numbers away (or hides the method), so you must reason about the structure of the optics, not the arithmetic.

---

## Dial 3 — Representation: how hard is the diagram / data work? *(≈ maths Figure)*

| Stage | What it looks like | Concrete example | Why it's at this stage |
|---|---|---|---|
| **R0 — Off** | No diagram, no data to read. | (any definition or plain numerical) | — |
| **R1 — Read a given figure or table** | The picture/data is handed to you; extract a value or identify something. | "Find the angle of incidence and reflection from the diagram" (35° to the surface → 55°, 55°) (3.5 Q1) · "Rays A and B enter component X and emerge as C and D (converging) — the component is…" → convex lens (Q15) · the candle data-table → "find the focal length **without** the lens formula" (Page 27 Q9a) | You must read the representation correctly first. The angle trap: 35° is measured from the *mirror*, not the *normal* — so the angle of incidence is 55°. |
| **R2 — Construct one diagram** | You draw the right diagram yourself before anything else works. | "Draw a ray diagram for refraction through a glass slab; mark the angle of refraction and the lateral shift." (3.2a Q2) · "Draw a labelled ray diagram for a convex lens f = 20 cm, object at 30 cm." (Page 27 Q14) | Seeing *which* rays to draw (parallel-ray, focal-ray) is the whole task; once drawn, the answer is visible. |
| **R3 — Multi-case / busy diagram** | Several diagrams, or one diagram carrying several cases, held at once. | "Draw ray diagrams for an object placed (i) between F and C, (ii) between F and pole, (iii) between C and infinity." (Page 23 Q13a) · "Draw ray diagrams for a ray (i) through C of a concave mirror, (ii) parallel to axis on a convex mirror, (iii) at the pole of a convex mirror, (iv) through the focus of a concave mirror." (Page 23 Q14b) | You hold four distinct configurations and keep their rules straight — the representational analog of maths' "chain across a busy figure." |

**Why it climbs:** R1 hands you the picture and asks you to read it (and not misread the reference line — normal vs. surface). R2 makes you *produce* the right picture. R3 makes you produce several and not let their rules bleed into each other.

---

## Dial 4 — Application: how hard is mapping the real world to the principle? *(≈ maths Story)*

| Stage | What it looks like | Concrete example | Why it's at this stage |
|---|---|---|---|
| **X0 — Off** | Pure abstract optics, no real device or scene. | (any identity-style or formula question) | — |
| **X1 — Name the standard use** | Recognise a textbook device and its principle. | "Convex mirror → rear-view mirror, why?" (3.1a Q4) · "Mirrors used in solar furnaces — how are high temperatures achieved?" (3.1a Q7) | One known device ↔ one known property. Recall-flavoured. |
| **X2 — Pick the device for a goal** | Given a *goal*, choose the right component and justify it. | "Which lens would you use to read small letters in a dictionary?" → convex, short focal length (3.5 Q10) · "A man sees his image with a small head and normal-size legs — what mirror(s)?" (3.1a Q10b) · "What should the object's position be for a concave mirror used as a shaving mirror?" (3.1a Q10a) | You reason *from* the desired effect *to* the device. The dictionary answer needs "magnifier ⇒ convex ⇒ *short* focal length," not just "convex." |
| **X3 — Model a novel multi-constraint scene** | A real scenario you must model **and** compute **and** often diagram — all three at once. | "A student wants to project a candle flame onto a screen 80 cm in front of a mirror, keeping the candle 20 cm from the pole. (a) Which mirror? (b) Magnification? (c) Distance between object and image? (d) Ray diagram." (Page 23 Q12) | Device selection (X2) + multi-step calculation (Q2) + a constructed diagram (R2) in one question. This is the science "boss question." |

**Why it climbs:** X1 is recognition. X2 reverses the arrow — from outcome to device. X3 loads Application *on top of* Calculation and Representation, so the student switches between three kinds of thinking inside one question.

---

## Two modifiers that cut across all four dials

### The Assertion-Reason format — evaluate a claim instead of producing an answer *(≈ maths Proof axis)*

You're given an **Assertion (A)** and a **Reason (R)** and must decide: is A true? is R true? and **does R correctly explain A?** That third question is the hard one. This format cross-cuts every dial — it can wrap a concept, a calculation, or a diagram fact — and it's where most **misconception traps** are planted.

Three flavours, all present in this chapter:

- **Both true, R explains A** — "Large concave mirrors concentrate sunlight in solar cookers; *because* a concave mirror converges rays to a point." (Q20) · "Red light travels faster in glass than green; *because* glass's RI is less for red than green." (Q30) ✓ correct explanation.
- **Both true, R does *not* explain A** — the reason is a true fact but not the cause. A common author move: pair a real assertion with a true-but-irrelevant reason.
- **One of them false** — the trap. "A virtual image cannot be photographed" — **A is false** (Q29). "A ray along the normal retraces its path *because* its angle of incidence is π/2" — **R is false**; a normal ray has angle of incidence **0**, not π/2 (Q25). "The height of an object is always positive" — tests the sign-convention misconception (Q26).

It's the cheapest high-discrimination format to author: take any two facts, pose them as A and R, and *tune which of the three flavours you want.* A single concept can be turned into five different A-R items by varying the reason.

### The Inverse move — solve forward vs. work backward *(same as maths)*

Instead of "find the image," the question gives the image's property and asks for the cause.

- "Magnification is +1/3 — find the type of mirror and the object's position." (3.1b Q7)
- "A virtual image three times the size is formed by a concave mirror of RoC 36 cm — find the object distance." → 12 cm (3.5 Q11)
- "What mirror should the student use to get this image on a screen?" (Page 23 Q12a)

It raises difficulty on whichever dial it sits on, because you can't plug-and-chug. It's cheap to author — take any forward question and flip it.

**The nasty sub-flavour — the branch trap.** Some inverse questions secretly admit *two* valid configurations, and the difficulty is realising there are two. "Find the object position for a concave mirror (f = 30 cm) so the image is **3× the size**." (3.1b Q4) — the image could be **real (m = -3)** or **virtual (m = +3)**, giving two different object positions. A student who finds one answer and stops has missed half the question. The same trap drives "object at 100, 20, 30 cm across three mirrors — which give m = -1?" (3.1b Q6): you must sweep cases, not solve once.

---

## How each chapter sets its dials (and why)

| Chapter | Concept | Calculation | Representation | Application | Why it's set this way |
|---|---|---|---|---|---|
| **Light (Reflection & Refraction)** | **C0–C3** | **Q0–Q4** | **R1–R3** | **X1–X3** | The optics "boss chapter." It loads **all four dials high** — a dense vocabulary (Concept), two formula families with brutal sign conventions (Calculation), ray diagrams as a first-class skill (Representation), and a long list of real devices (Application). Like Heights & Distances in maths, its difficulty is that students must switch between four kinds of thinking. |
| **Electricity** (Physics) | C0–C2 | **Q0–Q3** | **R1–R3** (circuits) | X1–X2 | Quantitative + diagrammatic: Ohm's law, series/parallel, circuit diagrams. Concept is mostly recall + one-step reasoning; little inverse-symbolic work. |
| **Carbon & its Compounds** (Chem) | **C0–C3** | Q0 (off) | R1–R2 (structures) | X1 | Concept-dominated: nomenclature, reaction logic, structural drawing. Calculation barely fires. |
| **Life Processes** (Bio) | **C0–C3** | off | R1–R2 (labelled diagrams) | X1 | Almost pure Concept + Representation. The whole chapter rides definitions, causal reasoning ("why does X happen"), and reading/labelling diagrams. |

**The two big takeaways from this table:**

1. **The dial *set* is fixed for all of science; only the loading changes.** Every science chapter is graded on the same four dials — you just read which ones it turns up. (Biology zeroes Calculation; Electricity zeroes the symbolic end of Calculation; optics loads everything.) This is exactly the maths pattern — same dials, different signature.
2. **Concept is the dial that's always on.** Unlike maths (where many chapters keep "story" or "figure" at zero), *no* science chapter turns Concept off — science always tests the knowledge itself. The question is only how high it climbs (recall-only vs. up to claim-judging).

---

## Worked examples (different dial mixes)

**1. "Which medium has minimum velocity?" (3.2a Q12)** — *Pure Concept chain.*
> For the same angle of incidence in media P, Q, R, the angles of refraction are 45°, 35°, 15°. In which medium is the velocity of light minimum? Give reason.
- Concept **C2** (chain four rules: smaller refraction angle → more bending → higher RI → lower speed). Calculation **Q0** (no arithmetic at all). Representation **R0**. Application **X0**.
- The difficulty is entirely in *holding the causal chain* — there is nothing to compute. A student who only memorised "RI = c/v" but never linked bending → density → speed cannot do it. This is a high-value, low-Calculation question — exactly the kind difficulty-by-numbers would wrongly score "easy."

**2. "Find f from the table without the lens formula" (Page 27 Q9)** — *Representation + hidden method.*
> Flame/screen distances: 60/20, 40/24, 30/30, 24/40, 15/70. (a) Find the focal length without the lens formula. (b) Which set of observations is incorrect and why? (c) In which case are object and image the same size?
- Representation **R1** (read the table). Calculation **Q4** (the method is *hidden* — you must know that object distance = image distance happens only at **2f**). Concept **C3** (judge which row is impossible).
- (a) The 30/30 row means object = image distance = 2f = 30 ⇒ **f = 15 cm**. (b) The 15/70 row is impossible: object at 15 cm = f, so rays emerge parallel and no real image forms on a screen — it can't be at 70 cm. (c) Same size also at 30/30 (object at 2f). The whole question is one insight (*2f is where object and image distances meet*); without it, no formula helps.

**3. "Image 3× the size — find the object" (3.1b Q4)** — *Inverse + branch trap.*
> Find the object position for a concave mirror (f = 30 cm) so that the image is three times the size of the object.
- Calculation **Q3** (inverse). The branch trap (modifier): "3× the size" is ambiguous — **real image, m = -3** gives one object position; **virtual image, m = +3** gives another. Two valid answers.
- The difficulty isn't the algebra; it's *recognising that the word "3×" hides two cases.* A student who solves for m = -3 and stops has done the easy half.

**4. "Project the candle on a screen 80 cm away" (Page 23 Q12)** — *All four dials.*
> A student wants to project a candle flame onto a screen 80 cm in front of a mirror, keeping the candle 20 cm from the pole. (a) Which mirror? (b) Magnification? (c) Distance between object and image? (d) Ray diagram.
- Application **X3** (model the scene: "project onto a screen" ⇒ *real* image ⇒ *concave* mirror). Calculation **Q2** (find v from u = 20, then m). Representation **R2** (construct the ray diagram). Concept **C1** ("real image on screen" ⇒ concave).
- This is why Light feels like the boss chapter — one question makes you select a device, compute through two formulae, and draw, in sequence. The maths analog is the lighthouse-with-two-ships problem.

**5. "A ray along the normal retraces because its angle of incidence is π/2" (3.5 Q25)** — *Assertion-Reason misconception.*
> Assertion: A ray incident along the normal to a plane mirror retraces its path. Reason: A ray along the normal has angle of incidence π/2 and hence retraces.
- Concept **C3** wrapped in the **Assertion-Reason** modifier. The assertion is **true**; the reason is **false** — a ray along the normal has angle of incidence **0**, not π/2 (the angle is measured *from the normal*, and the ray *is* the normal). Correct choice: A true, R false.
- The whole item is a single misconception (measuring the angle from the surface instead of the normal — the same trap as worked example R1, the 35° diagram). One misconception, delivered through the cheapest possible format.

---

## How to use this when authoring

1. **Read the chapter's signature first.** Decide which of the four dials it should load, and how far. Concept is always on — decide whether it climbs to C2/C3 or stays at recall. That decides what "hard" even means here.
2. **Take one concept and ride it up all four dials.** This is the core move, and the chapter does it explicitly with *magnification*: define it (C0) → sign MCQ, "f = -15, which mirror/lens" (Q1) → compute the image height (Q2) → inverse, "m = +1/3, find the object" (Q3) → "what does m = -1 signify?" (C3) → draw the ray diagram (R2). One concept, escalating demand. Don't let a concept sit at only one dial.
3. **Turn the dials on purpose, and separately.** You can make the *concept* hard (a four-link causal chain), or the *calculation* hard (inverse/symbolic), or the *representation* hard (multi-case diagrams), or the *application* hard (model a novel scene). Choose; don't blur them.
4. **Use the two cheap modifiers.** Assertion-Reason and Inverse are near-free to author and high-signal. For A-R, decide which of the three flavours (both-true-explains / both-true-doesn't / one-false) and plant a real misconception in the false case. For Inverse, flip any forward question — and consider a branch trap where "the answer" secretly has two cases.
5. **Match the chapter type.** A Concept-dominated chapter (Carbon, Life Processes) should be authored like those — climb the Concept dial to C3 and lean on Representation; don't force Calculation that isn't there. A multi-dial chapter (Light, Electricity) needs questions that genuinely exercise the dials you intend, including X3 boss questions that combine them.

---

## How the dials relate to our other frameworks

The dials are a **difficulty** lens. Our other frameworks are **purpose** lenses. They stack; they don't compete. The dials grade *how hard* a question is — not *what cognitive job it does* or *whether it's any good.*

### vs. the maths dials (`math-g10-difficulty-dials.md`)

- **Same skeleton:** dials with ordered stages, two cross-cutting modifiers, a per-chapter signature, the difficulty-≠-value caveat.
- **The one addition:** Concept. Maths takes the concepts as given and grades how you *use* them; science also grades whether you *know and can reason about* them. Concept is the dial that captures recall → causal-chain reasoning → claim-judging.
- **Modifier swap:** maths' Proof axis becomes science's Assertion-Reason format — both are "evaluate a logical relationship rather than compute an answer." The Inverse move is identical in both.

### vs. Nadi question-design (kind + quality + misconception)

- **Overlap:** Calculation Q3–Q4 ≈ Nadi's AR axis (algorithmic resistance). Concept C3 + the Assertion-Reason modifier ≈ Nadi's MS axis (misconception sensitivity) and types T1/T5 (error analysis, misconception confrontation). Representation ≈ multi-representational translation (P8, T6). Application X2–X3 ≈ transfer pairs (T8). The branch trap ≈ counterfactual / boundary-condition (T4).
- **Nadi has, dials lack:** a *quality bar* (the 5-axis rubric), the curiosity / student-generated dimension (T14, P10), and the explicit naming of *which* misconception a distractor diagnoses. The dials tell you a question is C3-hard; Nadi tells you whether it's a *good* C3 question.
- **Dials have, Nadi doesn't foreground:** an ordered difficulty ladder you author *along*; the four-faculty split (especially Concept as the always-on science dial); the chapter-signature idea; sign-convention sensitivity (Q1) as a first-class difficulty source.

### vs. `topics.md` (conceptual target + intuition + translation + contrast)

- **The gap is bigger here.** topics.md justifies a question by *what understanding it builds*, never by difficulty. A question like "Which medium has minimum velocity?" earns its place because it forces the *bending → density → speed* mental model — not because it's hard (it scores trivial on Calculation).
- **topics.md has, dials are blind to:** which misconception to confront, which intuition to lock in, which representation-to-representation translation matters for *this* sub-topic.
- **Dials add to topics.md:** a difficulty spine. topics.md's per-sub-topic question lists are flat; the dials can escalate any one of them (e.g. take "RI = c/v" from C1 recall up to the C2 medium-density chain, or flip it Inverse).

### The headline caveat — difficulty ≠ value

This chapter proves it twice over:

- **Easy-but-essential:** "Will light travelling from A to B bend towards or away from the normal?" (15b-iii) scores near-zero on every dial — no calculation, no diagram to build, no device. Yet it is a *core* intuition-builder: it locks in *rarer→denser bends toward the normal.* Author by dials alone and you'd skip it as "too easy."
- **Hard-but-thin:** the lens-displacement question (f = 7.5, object = 3) scores Q4-hard, but pedagogically it's a *method trick* — once you know "object size = √(I₁I₂)," it teaches little about how lenses actually work.

And science adds its own reason to distrust difficulty-as-value: the **Concept dial's easy end (recall) can be either rote-trivial or load-bearing-foundational**, and the dial can't tell you which. "Define focal length" (C0) is trivial to *grade* but indispensable to *know.*

**So the dials sit *under* the purpose layer (Nadi's misconception/quality axes + the chapter's conceptual targets in topics.md) — never replace it.** Use them to grade and escalate questions whose *purpose* is already set, not to decide which questions to write.
