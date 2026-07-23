# How Maths Difficulty Works — The Dials Framework

**Where this came from:** reading five chapters of the Amaatra Academy / PES University workbook (CBSE Class 10 maths) — Linear Equations, Polynomials, Circles, Trigonometry (identities), and Applications of Trigonometry (heights & distances). The same patterns showed up every time. This document writes them down so we can size up any chapter — and author for it — the same way.

---

## The core idea

A maths question's difficulty is not one number. It's a **mix of three dials**, plus two things that cut across all three.

- **Three dials** — Algebra, Story, Figure. Each one can be turned from off to high.
- **Two cross-cutting modifiers** — the Proof axis (find a value vs. prove a general truth) and the Inverse move (solve forward vs. work backward).

A chapter has a **signature**: which dials it turns up, and how far. Once you know the signature, you know what "hard" means for that chapter — before you write a single question.

> **Note on earlier framing.** We first talked about "six difficulty steps." Those steps now live *inside* the dials as stages. The mapping: Step 1 (plug-and-chug) → A0. Step 2 (hidden shape) → A1 or F2. Step 3 (letters) → A2. Step 4 (work backward) → the Inverse move. Step 5 (show it two ways) → the Figure dial switching on. Step 6 (heavy) → the top stage of whichever dial is loaded. Step "prove" → the Proof axis. Nothing is lost; it's just organised better.

---

## Dial 1 — Algebra: how hard is the symbol-pushing?

| Stage | What it looks like | Concrete example | Seen in |
|---|---|---|---|
| **A0 — Direct numbers** | Recognise the type, run one procedure. Answer is a plain number. | "Write the zeros of x² + 2x + 1." | Polynomials L1, Linear L1 |
| **A1 — Hidden form (still numbers)** | You must transform it before the normal method works. | "x + 6/y = 6" — treat 1/y as one thing first. Or "7(y + 1/y) − 2(y² + 1/y²) = 9." | Linear L2, Polynomials MCQ |
| **A2 — Letters instead of numbers** | Coefficients are symbols. You work on the *structure*, not the arithmetic. | Solve (b²/a)x − (a²/b)y = ab(a+b), answer comes out x = b²/2a. | Linear L2, Polynomials L2, Trig identities |
| **A3 — Prove an identity in letters** | No numbers at all. Show a general statement is *always* true. | "Prove α²/β² + β²/α² = p⁴/q² − 4p²/q + 2." | Polynomials L2, Trig identities L2 |

**Why it climbs:** each stage removes a crutch. A0 lets you lean on arithmetic. A2 takes the numbers away, so you can only succeed if you understand the method. A3 takes the specific case away too, so you must reason about *all* cases at once.

---

## Dial 2 — Story: how hard is turning the real-world scene into maths?

| Stage | What it looks like | Concrete example | Seen in |
|---|---|---|---|
| **S0 — Off** | No story. Pure maths. | (any identity / polynomial question) | Polynomials, Trig identities |
| **S1 — One-step translation** | One clean relationship, usually two data points. | Taxi fare = fixed charge + per-km charge; given two trips, find both. | Linear L2, Heights (simple) |
| **S2 — Standard archetype, a few linked conditions** | A known story type with two or three conditions to track. | "Mix 90% and 97% acid to get 21 L of 95%." Or "two cars 90 km apart, same vs. opposite direction." | Linear L1/L2 |
| **S3 — Tangled / conditional / classic** | Confusing wording, nested "if-then", or a quantity that changes partway. | Wizard-and-gold; train whose speed drops to 4/5 partway with two late-arrival scenarios; cloud and its reflection in a lake. | Linear L1/L2, Heights (hard) |

**Two flavours of S3 — keep them apart when authoring:**
- **Lots to track** — the train problem: a changing speed, time split into pieces, minutes to convert.
- **Deliberately confusing words** — the wizard problem: the maths is small, but the language is built to mislead.

You can make a story hard either way, and they test different things (holding many parts vs. careful reading).

---

## Dial 3 — Figure: how hard is the picture / spatial reasoning?

| Stage | What it looks like | Concrete example | Seen in |
|---|---|---|---|
| **F0 — Off** | No diagram needed. | (any identity question) | Polynomials, Trig identities |
| **F1 — Read a given figure** | The diagram is drawn for you; apply the right property directly. | "OT = 6, OP = 10, find the tangent PT" — one Pythagoras step on the given picture. | Circles, Heights (simple) |
| **F2 — Build or add to the figure** | You must draw the triangle yourself, or add a construction line (join the centre to a point, drop a perpendicular) before any theorem applies. | Most circle proofs; any heights problem where you set up the right triangle yourself. | Circles, Heights |
| **F3 — Chain across a busy figure** | Several shapes or theorems, in sequence, across one diagram. | Perimeter of polygon PQTRSO; three circles touching each other; a lighthouse with two ships at different angles. | Circles, Heights (hard) |

**Why it climbs:** F1 hands you the picture. F2 makes you *produce* the right picture — and seeing which line to add is often the whole difficulty. F3 makes you hold several linked pictures at once.

---

## Two modifiers that cut across all three dials

### The Proof axis — find a value vs. prove a general truth

| Level | Meaning | Seen in |
|---|---|---|
| **P0** | Find a number or value. | Linear (mostly), Heights L1 |
| **P1** | A few "show that" questions, usually at the top. | Polynomials |
| **P2** | A whole block of "prove" questions — the backbone of the chapter. | Circles, Trig identities |

Proving is a different demand from computing. It asks for a logical argument, not an answer. A chapter can sit anywhere on this axis independent of its dials.

### The Inverse move — solve forward vs. work backward

Instead of "solve this," the question gives you the *answer's property* and asks for the *input*.

- "Find a and b so the pair has infinitely many solutions." (Linear)
- "Find K so that x² + 5kx + k² + 5 is divisible by x + 2 but **not** x + 3." (Polynomials)
- "The two tangents are perpendicular and each is 5 cm — find the radius." (Circles)

The inverse move raises difficulty on whichever dial it sits on, because you can't brute-force it. It's cheap to author — take any forward question and flip it.

---

## How each chapter sets its dials (and why)

| Chapter | Algebra | Story | Figure | Proof | Why it's set this way |
|---|---|---|---|---|---|
| **Linear equations** | A0–A2 | **S2–S3** | F0 (one graph) | P0 | The chapter's whole point is *modelling* real situations with two unknowns. So it pushes the Story dial and keeps the algebra (2×2 systems) simple, so attention stays on the translation. |
| **Polynomials** | **A0–A3** | S0 | F1 (graph match) | P1 | It's about the link between a polynomial's coefficients and its roots — an abstract, symbolic relationship. So difficulty rides on symbol control, climbing to proofs. |
| **Circles** | A0–A1 | rare | **F1–F3** | **P2** | Circle geometry is about configurations and theorems. You can't even start without the right picture, and the syllabus emphasises *proving* tangent and angle properties. |
| **Trig identities** | **A2–A3** | S0 | F0 | **P2** | It's the algebra of the Pythagorean identities — a closed symbolic system. Polynomials' twin: one small engine, cranked through symbols and proofs. |
| **Heights & distances** | A1–A2 | **S2–S3** | **F2–F3** | P1–P2 | It is the *application* of trig — by definition you take a real scene (story), model it as a triangle (figure), and compute with trig ratios (algebra). The only chapter that loads all three dials at once. |

**The two big takeaways from this table:**

1. **Chapters come in types.** Polynomials and trig identities have the *same* signature (Algebra + Proof, everything else off). Knowing the type tells you how to author for it.
2. **A chapter can load one dial or all three.** Most lean on one. Heights & distances proves the hard end exists — and those multi-dial chapters are the genuinely difficult ones for students, because they must switch between three kinds of thinking inside one question.

---

## Worked examples (different dial mixes)

**1. Train engine-defect (Linear)** — *Story-driven.*
> Travels 30 km at full speed, then the engine drops to 4/5 speed; arrives 45 min late. If the fault had come 18 km later, only 36 min late. Find the speed and distance.
- Story **S3** (lots to track: changing speed, two scenarios, minutes→hours). Algebra **A1** (clean once set up). Figure **F0**. Proof **P0**.
- The difficulty is almost all in the setup, not the solving.

**2. Wizard and gold (Linear)** — *Story-driven, the other flavour.*
> "If your cock loses, give me all your gold; if it wins, I give you two-thirds of that." Same to the other owner with three-fourths. He gains 12 either way. Find each owner's gold.
- Story **S3** (deliberately confusing words). Algebra **A1**. Figure **F0**. Proof **P0**.
- Built by "disturb one thing two ways": two possible outcomes, both pinned to 12 → two equations.

**3. Prove α²/β² + β²/α² = p⁴/q² − 4p²/q + 2 (Polynomials)** — *Algebra + proof.*
- Algebra **A3** (pure symbols). Proof **P2** (general truth). Story **S0**. Figure **F0**.
- Runs on the one engine: sum and product of roots.

**4. Lighthouse with two ships (Heights)** — *All three dials.*
> From the top of a 75 m lighthouse, the angles of depression of two ships are 30° and 45°. Find the distance between them.
- Story **S2** (read the scene). Figure **F3** (two right triangles sharing the height). Algebra **A1** (tan 30°, tan 45°, subtract). Proof **P0**.
- This is why heights & distances feels like the "boss chapter" — you do all three in sequence.

---

## How to use this when authoring

1. **Read the chapter's signature first.** Decide which dials it should load, and how far. That decides what "hard" even means here.
2. **Spread questions across the stages of the loaded dial(s).** Don't let everything sit at A0/S1/F1. Climb.
3. **Turn the dials on purpose, and separately.** You can make the algebra hard *or* the story hard *or* the figure hard. Choose; don't blur them.
4. **Use the two cheap modifiers.** Add some inverse ("find the input that makes the answer behave this way") and, where the chapter calls for it, some proof. Both are low-effort, high-signal.
5. **Match the chapter type.** If it's an Algebra+Proof chapter (polynomials, trig identities), author like polynomials. If it's multi-dial (heights), make sure each question genuinely exercises the dials you intend.

---

## How the dials relate to our other frameworks

The dials are a **difficulty** lens. Our other two frameworks are **purpose** lenses. They stack; they don't compete. The dials grade *how hard* a question is — not *what cognitive job it does* or *whether it's any good*.

### vs. Nadi question-design (kind + quality + misconception)

- **Overlap:** Algebra A2–A3 ≈ Nadi's AR axis (algorithmic resistance). Archetype-reskin ≈ variation theory (P6) + transfer pairs (T8). Figure dial + Proof axis ≈ multi-rep (P8) + justification types (T10, T13). Inverse move ≈ counterfactual/boundary (T4).
- **Nadi has, dials lack:** the whole misconception dimension (MS axis; types T1, T5, T3), a quality bar (the rubric), and curiosity/student-generated work (T14).
- **Dials have, Nadi doesn't foreground:** an ordered difficulty ladder you author *along*; construction recipes; the chapter-signature idea; the Figure dial as a first-class axis.

### vs. Motion `topics.md` (conceptual target + intuition + translation + contrast)

- **The gap is bigger here.** Motion's question ideas are justified by *what understanding they build* — never by difficulty. "Sign-switch" locks in *sign is a free choice*; "tell me the story of this graph" forces *graph → real-event translation*; "what does 5 m/s² mean?" makes a *symbol carry meaning*.
- **Motion has, dials are blind to:** misconception/contrast ("what it is NOT"); translation *between* representations (the dials treat Figure and Story as separate, with no notion of moving between them); reading meaning into a symbol.
- **Dials add to Motion:** a difficulty spine. Motion's per-sub-topic question lists are flat — no ordering. The dials can escalate them (e.g. sign-switch A0 → A2).

### The headline caveat — difficulty ≠ value

Motion proves it: "which is faster — 50 m in 3 s or 500 m in 100 s?" scores **trivial** on the dials, yet it's a *core* intuition-builder. Author by dials alone and you skip your best questions because they score "easy" — and the axes you'd skip (contrast, translation, generative narration) are **the same ones the drift diagnostic (SYNTHESIS.md) found collapsing.**

**So the dials sit *under* the purpose layer (Nadi's misconception/quality axes + the chapter's conceptual targets) — never replace it.** Use them to grade and escalate questions whose *purpose* is already set, not to decide which questions to write.
