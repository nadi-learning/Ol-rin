# Parent-dashboard backfill — data-extraction contract

**Goal:** populate a *real* student's parent dashboard on **prod (olorin)** by extracting from old b2c
(`/Users/mab/Desktop/nadi/b2c/data/…`) into a per-student JSON, then running a backfill script that
writes the new-system rows. Target: a **few real students** (Avnki K + others) — so the JSON below is
**one object per student**, and the script loops.

**Fidelity decision (founder, 2026-07-25):** *synthesize a full page.* Extract what's genuinely real
(attempts, activity, whatever mastery/coverage old b2c holds); for the layers old b2c has no source for
(two-axis levels, calibration, weakness+plan, horizontals, pace, monthly snapshots) put in **plausible,
representative values** so every section renders. Flagged per-field below as **REAL** (extract) vs
**SYNTH** (author a sensible value).

**Parent link:** treat the parent as **deferred/admin** — you'll create + link the parent profile via
`/admin` afterwards. The JSON does **not** need parent identity; it only needs the **student** fully
populated. (The dashboard reads `student.parent_id`; once you link the parent in admin, it lights up.)

---

## 0. THE hard prerequisite — content-spine mapping (read first)

Every row below hangs off a **`sub_topic` that already exists and is published on the student's board**
in the **new** DB. The dashboard only shows subjects where the student has a `mastery_state` row, and the
map only draws sub_topics that exist in the new spine. **Prod currently has very few published chapters.**

So before extraction:
1. Pick the student's **board** (e.g. `cbse`) and the **subjects/chapters you'll demo**.
2. Pull the **real `sub_topic` slugs (or ids)** that exist under those chapters on prod.
3. Map each old-b2c topic → one of those real sub_topic slugs.
4. **Count them.** `SELECT count(*)` of published sub_topics per subject you touch — that number becomes
   the **topic budget**, the fixed scale of the growth-bar chart (§3), and the parent now sees the unfilled
   remainder as "not started". Picking a subject commits you to its *entire* sub_topic count, not just the
   chapters you mapped.

**Every `subTopicRef` in the JSON must be a slug/id that exists in prod.** A ref that doesn't exist =
that row is silently dropped or the script errors. This mapping is the gating work; the rest is mechanical.

> The JSON uses `subTopicRef` (a slug or id) and `subjectRef` / `chapterRef` everywhere. The script
> resolves them to prod ids at load time and fails loudly on any unknown ref.

---

## 1. Identity (required — the dashboard won't load without it)

| Field | Req | REAL/SYNTH | Notes |
|---|---|---|---|
| `email` | ✅ | REAL | Student's login email (new-system profile key, `user_type='student'`). |
| `name` | ✅ | REAL | Display name (e.g. "Avnki K"). |
| `board` | ✅ | REAL | Board slug, e.g. `cbse`. Must match the content you mapped. |
| `class` | ✅ | REAL | e.g. `"9"`. |
| `pronoun` | ⬜ | REAL | `she` / `he` / `they` — used in Olórin's copy. Default `they`. |
| `tutorRef` | ⬜ | REAL/SYNTH | Tutor email to set `student.tutor_id` — **needed for the pace slide**. Use a real tutor or a demo one. |
| `onboardingCompleted` | ✅ | SYNTH | Set `true` so the app doesn't gate her. |

**Parent:** NOT in this JSON. Create + link the parent via `/admin` after backfill (sets `student.parent_id`).

---

## 2. Mastery — `mastery` (REQUIRED; this is the spine of the whole page)

One entry **per sub_topic the student has been assessed on.** No mastery rows → **completely empty
dashboard.** This is the single most important dataset.

```jsonc
"mastery": [
  {
    "subTopicRef": "kinematics-speed",   // MUST exist on prod (see §0)
    "conceptual": 5,                      // 1–5 or null  (null = that axis not yet assessed)
    "procedural": 4,                      // 1–5 or null
    "description": "Distinguishes speed from velocity fluently…", // parent-VISIBLE prose (never internal notes)
    "updatedAt": "2026-07-21",            // when certified
    "priorConceptual": 4,                 // OPTIONAL — previous level → drives the trend arrow (↑/↓/flat)
    "priorProcedural": 4,                 // OPTIONAL
    "priorAt": "2026-06-15"               // OPTIONAL — when the prior state held
  }
]
```

| Field | Req | REAL/SYNTH | Feeds / rules |
|---|---|---|---|
| `subTopicRef` | ✅ | REAL | The topic. Determines subject scope + map cell. |
| `conceptual` / `procedural` | ✅ | SYNTH* | 1–5 **or null**. Map colour: **gray**=both null · **green**=both ≥4 · **yellow**=anything else. Meters: "green" = axis ≥4. *If old b2c has any mastery/score, translate it; else author.* |
| `description` | ✅ | SYNTH | The prose shown to the parent on the topic card. Never paste internal/tutor notes. |
| `updatedAt` | ✅ | REAL/SYNTH | Certification date. |
| `prior*` | ⬜ | SYNTH | Only to make the trend arrow move. Omit → arrow shows "new". |

> **Coverage vs. gap:** to show a topic as **"not yet started" (gray)** in a chapter, simply **omit it**
> from `mastery` (but the sub_topic must still exist in the new spine so the map can draw it as gray).
> To show a **coverage gap on one axis**, set that axis `null` and the other 1–5 (renders yellow).

---

## 3. Monthly snapshots — `snapshots` (STRONGLY RECOMMENDED; powers the growth bars)

**The chart changed (2026-07-26).** The mastery-growth slide is no longer vertical columns that
auto-scale to the tallest month. It is now a stack of **horizontal bars on ONE fixed scale**, and that
scale is the **topic budget** — every sub_topic that exists in the student's in-scope subjects. The top
row is **now**; every row below is one monthly snapshot. Because all rows share the scale, the parent
reads progress as the green edge marching right — and, for the first time, sees **how much is left**.

```
                                       ←────── budget: 69 topics ──────→
TOTAL   ████████████████░░░░░░░░░░▒▒▒▒▒▒▒▒▒▒▒▒   42 solid · 27 practising · 18 not started
Jul     ████████████████░░░░░░░░░░▒▒▒▒▒▒▒▒▒▒▒▒
Jun     █████████████░░░░░░░░▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒
May     ███████████░░░░░░░▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒
Apr     ████████░░░░░▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒
Mar     █████░░░▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒

  █ solid      ░ practising      ▒ not started
```

### 3a. The budget is NOT in this JSON — it is derived, and it is bigger than you think

Nothing you write here sets the scale. The budget is counted live off the spine at read time
(`totals.totalNow`, `src/services/parent.ts:361`): **every sub_topic under every subject in which the
student holds at least one `mastery_state` row.**

⚠️ **The scope gate is the SUBJECT, not the chapter** (`parent.ts:560-568` picks the subjects, `:616-643`
then pulls *all* their sub_topics). One mastery row anywhere in Physics drags in **every published
sub_topic of every Physics chapter on that board** as budget. A subject with 8 published chapters and 3
mastery rows renders a bar that is ~96 % gray — technically honest, and a terrible thing to show a
parent in a meeting.

**So the denominator is controlled in §0 and §2, never here.** Pick which *subjects* the student is
scored in; then give each of those subjects enough §2 mastery rows that the bar reads as progress rather
than as a near-empty tank. Sanity-check before you ship: count the published sub_topics per subject you
touch, and make sure §2 covers a respectable share of it.

### 3b. Fields (shape unchanged — one object per prior month)

```jsonc
"snapshots": [
  { "period": "2026-04-01", "covered": 22, "solid": 12 },
  { "period": "2026-05-01", "covered": 34, "solid": 19 },
  { "period": "2026-06-01", "covered": 48, "solid": 28 }   // also the "was N last month" row
]
```

| Field | Req | REAL/SYNTH | Rules |
|---|---|---|---|
| `period` | ✅ | SYNTH | **First of the month**, `YYYY-MM-01`. One row per month, no gaps. |
| `covered` | ✅ | SYNTH | # sub_topics with a mastery row that month — the **solid + practising** width. |
| `solid` | ✅ | SYNTH | # green that month — the **solid** width. |

### 3c. Segment maths — how each row is drawn

| Segment | TOTAL row (top) | A month row |
|---|---|---|
| **solid** █ | `totals.solidNow` | `solid` |
| **practising** ░ | `coveredNow − solidNow` | `covered − solid` |
| **not started** ▒ | `totalNow − coveredNow` | `budget − covered` |

> **The top row does not come from `snapshots`.** It is computed live from your §2 `mastery` rows. §3
> draws only the month rows underneath. If §2 and §3 disagree in direction, the chart shows it.

### 3d. Constraints the loader must enforce (fail loudly)

- **`0 ≤ solid ≤ covered ≤ budget`** on every row. A `covered` above the budget renders a bar
  overflowing its own scale — the single most visible way to get this wrong.
- **Non-decreasing.** `solid` and `covered` should never fall month over month unless you *mean* to show
  regression; a dip reads to a parent as the child going backwards.
- **The newest month must sit strictly below the TOTAL row.** Equal values make the top two bars
  identical and the chart looks broken.
- **3–6 months reads best.** Fewer than 3 and there is no visible march; more than 6 and the rows get thin.
- The earliest month sets the badge — `+N solid since <first month>` is `last.solid − first.solid`
  (`ParentPage.tsx:199`). Start it low enough that N is worth printing.

### 3e. Gotchas

- 🔴 **Never author a snapshot for the CURRENT month.** `buildTrend` (`parent.ts:831-834`) drops any row
  whose `period` equals first-of-this-month and substitutes the live point. That live point *is* the
  TOTAL row. Author last month backwards.
- `mastery_snapshot.metrics` is **`NOT NULL` jsonb** (`packages/kernel/src/schema.ts:740`). The loader must
  write at least `{"perSubject": []}` or the insert fails. The global chart never reads it; it feeds
  per-subject tooltips.
- Unique on `(student_id, period)` (`schema.ts:745`) → write it as an upsert so re-running the backfill is safe.
- `mastery_snapshot` is board-scoped and **in `ALL_TABLES` (RLS)** — rows need the right `board_id` and must
  be written under `withBoard`.

---

## 4. Practice sessions — `sessions` (OPTIONAL; powers the "this period" story + retention line)

Only sessions in the **last 35 days** feed the story. Drives: topics practised, "brought back by a
retention check", and self-directed count.

```jsonc
"sessions": [
  {
    "subTopicRef": "kinematics-graphs",
    "dispatchReason": "retention",  // first_teach | climb | retention | null
    "origin": "self_serve",         // self_serve | tutor_assigned
    "at": "2026-07-13"
  }
]
```

| Field | Req | REAL/SYNTH | Rules |
|---|---|---|---|
| `subTopicRef` | ✅ | REAL | The topic practised. |
| `dispatchReason` | ⬜ | SYNTH | New-system concept — old b2c has no source. `retention` powers the hero "retention check brought this back" line. Use `null` if unsure. |
| `origin` | ✅ | REAL/SYNTH | `self_serve` counts toward "started on her own". |
| `at` | ✅ | REAL | Session date. Put ≥1 within 35 days of the demo for the story to render. |

---

## 5. Attempts — `attempts` (REAL; powers effort metrics + the activity heatmap + calibration denominator)

This is the layer most likely **genuinely extractable** from old b2c. Each answered attempt with a date
lights a day on the year-to-date heatmap and adds to answered/time metrics.

```jsonc
"attempts": [
  {
    "subTopicRef": "kinematics-speed",
    "answered": true,          // false = a skip
    "confidence": 3,           // 1–5, or null. REQUIRED (non-null) on ≥10 answers or calibration hides
    "timeMs": 45000,           // engaged time
    "skipReason": null,        // set (e.g. "not_sure") when answered=false
    "at": "2026-07-10"         // submitted date — drives the heatmap day
  }
]
```

| Field | Req | REAL/SYNTH | Rules |
|---|---|---|---|
| `subTopicRef` | ✅ | REAL | Topic the attempt was on. |
| `answered` | ✅ | REAL | `true` → has `answerText`; `false` → a skip. |
| `confidence` | ⬜ | REAL/SYNTH | 1–5 or null. **Calibration section stays HIDDEN until ≥10 answered attempts carry a non-null confidence** (`CALIBRATION_MIN_ANSWERS`). If you want calibration to show, ensure ≥10. |
| `timeMs` | ⬜ | REAL | Sums into total engaged time. |
| `skipReason` | ⬜ | REAL | Only when `answered=false`. |
| `at` | ✅ | REAL | **Date matters** — heatmap is year-to-date by day; monthly bars use it too. Spread across the year for a full heatmap. |

> **Volume for a good heatmap:** the demo seeder spreads ~130 active days / a few hundred attempts.
> You don't need that much real data — but a handful of attempts on a handful of days will look sparse.

---

## 6. Calibration observations — `observations` (SYNTH; over/under-confidence section)

Only needed if you want the calibration section populated. Each ties a confidence-bearing attempt to an
over/under flag. **The section only appears at all if §5 has ≥10 confidence-rated answered attempts.**

```jsonc
"observations": [
  {
    "subTopicRef": "forces-friction",
    "axis": "conceptual",           // conceptual | procedural
    "calibrationFlag": "over",      // over (confident-and-wrong) | under (unsure-and-right) | null
    "at": "2026-07-06"
  }
]
```

| Field | Req | REAL/SYNTH | Rules |
|---|---|---|---|
| `subTopicRef` | ✅ | SYNTH | Where the miss clustered (shown as the location). |
| `axis` | ✅ | SYNTH | `conceptual` / `procedural`. |
| `calibrationFlag` | ✅ | SYNTH | `over` / `under` drive the two counts; the sub_topic name becomes a "location". |
| `at` | ⬜ | SYNTH | Date. |

---

## 7. Weakness + plan — `weaknesses` (SYNTH; the "named weakness + tutor's plan" section)

**How the real system derives this (so your synth is principled):** `cross_concept_flag` is written by
the assessment pipeline — Stage-1 (`assessment.ts`) when the scorer notices a *foreign skill slipping
while the student works a target sub-topic* (e.g. a unit-conversion slip during momentum), anchored to
the `from_sub_topic` + the observation that caught it; and Stage-2b synthesis pools those into a worklist.
The `plan` is **tutor-authored** (or a generated default when null). **Old b2c produces none of this** →
SYNTH. Derive each one from the student's **weakest / most-skipped / lowest-scoring** old-b2c topic, phrased
as "a foreign skill leaked in here", + a plan written as a tutor would.

Each entry = one cross-concept flag. If `plan` is present it renders as an authored tutor plan; if null,
the page shows a generated default. No entries → the section is empty.

```jsonc
"weaknesses": [
  {
    "fromSubTopicRef": "algebra-quadratic",
    "note": "procedural gap in fraction manipulation — surfaced while clearing denominators",
    "plan": "Re-teaching fraction operations Thursday, then two spaced retrievals over the fortnight.",
    "planUpdatedAt": "2026-07-23"   // only when plan is set
  }
]
```

| Field | Req | REAL/SYNTH | Rules |
|---|---|---|---|
| `fromSubTopicRef` | ✅ | SYNTH | Where it surfaced. |
| `note` | ✅ | SYNTH | The weakness statement (parent-facing). |
| `plan` | ⬜ | SYNTH | Tutor's plan prose. Omit/null → page shows its generated default. |
| `planUpdatedAt` | ⬜ | SYNTH | Only with an authored plan. |

---

## 8. Horizontal skills — `horizontals` (SYNTH; the cross-cutting-skills section)

**How the real system derives this:** written in ONE place — Stage-2b synthesis (`synthesis.ts`), *"the
first thing that reasons above the sub-topic"*. At finalize it pools the whole sitting's evidence across
all sub-topics of a subject and assigns each **predefined** horizontal skill (from a per-subject taxonomy)
a **subject-wide level + prose**. **Old b2c has no such pipeline** → SYNTH: derive each as a **roll-up of
the per-subject mastery** you already set in §2 (e.g. procedural-high + conceptual-low across a subject →
`causal_reasoning` weak; consistently clean manipulation → `algebraic_fluency` strong). Pick ~2 skills per
subject; set the level to match the subject's overall profile.

⚠️ **Taxonomy must exist first.** The state references a predefined `slug`; the backfill upserts the
taxonomy row (`horizontal_skill`: subject, chapter, slug, `definition`) **before** the state
(`horizontal_skill_state`: level, prose). Each JSON entry below carries both — the script writes them in
that order. Subject-wide skill levels (e.g. "causal reasoning", "algebraic fluency"). Omit the whole array
to skip the section.

```jsonc
"horizontals": [
  {
    "subjectRef": "physics",
    "chapterRef": "motion",           // taxonomy anchor
    "slug": "causal_reasoning",
    "definition": "Reasons from a principle to a consequence, not just pattern-matching.",
    "level": 2,                        // 1–5, or null (not yet observed)
    "prose": "Reaches correct answers procedurally but struggles to say WHY across Motion."
  }
]
```

| Field | Req | REAL/SYNTH | Rules |
|---|---|---|---|
| `subjectRef` / `chapterRef` | ✅ | REAL | Must exist on prod. |
| `slug` | ✅ | SYNTH | Skill key (kebab/underscore). |
| `definition` | ✅ | SYNTH | Taxonomy description. |
| `level` | ✅ | SYNTH | 1–5 or null. |
| `prose` | ✅ | SYNTH | Parent-facing paragraph. |

---

## 9. Pace plan — `pace` (SYNTH; the intended-vs-actual pace slide)

One plan per subject. Without a plan, that subject's pace slide shows "needs setup". Needs `tutorRef`/a
tutor set (§1) since pace is a tutor/student-set deadline.

```jsonc
"pace": [
  {
    "subjectRef": "physics",
    "startDate": "2026-07-07",
    "endDate": "2026-08-09",
    "chapters": [
      { "chapterRef": "motion",  "completed": false },
      { "chapterRef": "energy",  "completed": false }
    ]
  }
]
```

| Field | Req | REAL/SYNTH | Rules |
|---|---|---|---|
| `subjectRef` | ✅ | REAL | Must exist on prod. |
| `startDate` / `endDate` | ✅ | SYNTH | The plan window (`YYYY-MM-DD`). Tune dates for a visible mix (one subject on-track, one a touch behind). |
| `chapters[]` | ✅ | REAL(refs)/SYNTH(completed) | Chapter refs must exist; `completed` you set. |

---

## Full per-student JSON skeleton

```jsonc
{
  "email": "avnki@…",
  "name": "Avnki K",
  "board": "cbse",
  "class": "9",
  "pronoun": "she",
  "tutorRef": "tutor@…",
  "onboardingCompleted": true,

  "mastery":      [ /* §2 — REQUIRED */ ],
  "snapshots":    [ /* §3 */ ],
  "sessions":     [ /* §4 */ ],
  "attempts":     [ /* §5 */ ],
  "observations": [ /* §6 */ ],
  "weaknesses":   [ /* §7 */ ],
  "horizontals":  [ /* §8 */ ],
  "pace":         [ /* §9 */ ]
}
```

The backfill file is an **array of these** (one per student).

---

## What makes each section appear — quick reference

| Section | Shows when | Hidden/thin when |
|---|---|---|
| Progress map + meters + headline | ≥1 `mastery` row | no mastery → whole dashboard empty |
| Growth bars — TOTAL row + budget scale | ≥1 `mastery` row (budget is spine-derived) | thin §2 coverage → a mostly-gray bar |
| Growth bars — the month rows below | ≥1 `snapshots` row | none → TOTAL row alone, no march, no "+N since" badge |
| Trend arrows on cards | `prior*` on a mastery row | none → "new" |
| Effort metrics | any `attempts` | none → zeros |
| Activity heatmap / monthly bars | answered `attempts` with real dates | sparse dates → sparse heatmap |
| **Calibration** | **≥10 answered attempts with non-null `confidence`** + `observations` | <10 → **section hidden** |
| Story ("this period", retention) | `sessions` within 35 days | none → thin |
| Weakness + plan | ≥1 `weaknesses` | none → empty |
| Horizontals | ≥1 `horizontals` | none → empty |
| Pace | `pace` plan per subject (+ tutor set) | none → "needs setup" |

---

## Extraction order (what to do)

1. **Spine map (§0):** pull real prod sub_topic/chapter/subject slugs for the demo scope; build the
   old-topic → new-`subTopicRef` map. *(This is the gating step — everything refs it.)*
2. Extract **REAL** layers from `/nadi/b2c/data/…`: student identity, attempts (dates!), any coverage/
   mastery signal, sessions.
3. **SYNTH** the rest to a full, plausible page: mastery levels + descriptions, snapshots (monotonic,
   never the current month, newest strictly below the live TOTAL), calibration (≥10 conf attempts +
   flags), weakness+plan, horizontals, pace.
4. Emit the per-student JSON (array), run the backfill script → prod.
5. In `/admin`: create + link the **parent** to each student (`student.parent_id`), then walk the dashboard.

> ⚠️ **Prod writes are board-scoped** and any identity insert needs the right conn — coordinate the run
> the same way as prior prod deploys. Verify each student's dashboard end-to-end before the meeting.
