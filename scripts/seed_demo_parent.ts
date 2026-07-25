/**
 * seed_demo_parent — a FULLY-POPULATED parent-dashboard demo, LOCAL ONLY.
 *
 * seed_demo_pair mints identity only (a tutor↔student pair, zero evidence). The
 * parent dashboard narrates EVIDENCE — mastery across subjects, month-over-month
 * growth, why each topic was practised, calibration, horizontal skills, and a
 * named weakness with the tutor's plan. This seeder builds all of it directly.
 *
 * DECISION #4 (founder, 2026-07-25): write `mastery_state` (and the rest of the
 * evidence) DIRECTLY — do NOT drive the real Stage-2 pipeline. Fast + deterministic
 * for a demo; the shape is hand-matched to what the read surfaces expect. (The
 * risk the founder accepted: directly-written rows can take a shape real Stage-2
 * data never would — kept plausible here, but it is demo data, not a fixture of
 * real behaviour.)
 *
 * Builds, all on the `cbse` board, under `demo-*` slugs so nothing collides with
 * real content:
 *   · identity   — parent@example.com (parent row) linked to student@example.com,
 *                  who is linked to tutor@example.com (reuses the seed_demo_pair pair)
 *   · spine      — 2 subjects (Science, Maths) → chapters → topics → 13 sub_topics
 *   · mastery    — 12 of 13 covered, 7 solid (both axes ≥4); one axis NULL (a
 *                  coverage gap, not weakness); one sub_topic left uncovered (gray)
 *   · history    — prior snapshots per sub_topic so the trend arrows move
 *   · snapshot   — a PRIOR-month mastery_snapshot (covered 10 / solid 4) so the
 *                  dashboard reads "7 solid — was 4 last month"
 *   · sessions   — practice_session rows spanning every dispatch_reason
 *                  (first_teach|climb|retention|null) × origin (self_serve|tutor_assigned)
 *   · attempts   — answered (with confidence + time) and skipped, for the metrics
 *   · observations — a spread with calibration_flag (over/under/null) above noise floor
 *   · horizontals — 2 skills/subject with a subject-wide level (one weak)
 *   · flags      — a cross_concept_flag WITH a CLOCK-3 plan (element 6 authored) +
 *                  one WITHOUT a plan (renders the page's generated default)
 *
 * IDEMPOTENT: spine upserts by slug; the demo student's evidence is WIPED and
 * rebuilt on every run. Re-runnable safely.
 *
 * LOCAL ONLY — reads DATABASE_URL from .env (localhost:5435/b2c). Never prod.
 *
 *   bun scripts/seed_demo_parent.ts
 *
 * Then, at the landing picker → dev-login:
 *   PARENT  → parent@example.com   → parent surface (the dashboard)
 *   STUDENT → student@example.com
 *   TUTOR   → tutor@example.com
 */
import { and, eq, inArray } from "drizzle-orm";
import {
  appUser,
  attempt,
  board,
  chapter,
  crossConceptFlag,
  horizontalSkill,
  horizontalSkillState,
  masteryHistory,
  masterySnapshot,
  masteryState,
  observation,
  onboarding,
  pacePlan,
  practiceSession,
  question,
  schedulingState,
  student,
  subTopic,
  subject,
  topic,
} from "@b2c/kernel/schema";
import { db, queryClient } from "../src/db/client";
import { withBoard } from "../src/db/with-board";
import { ensureProfile, grantRole } from "../src/services/membership";

const TUTOR_EMAIL = "tutor@example.com";
const STUDENT_EMAIL = "student@example.com";
const PARENT_EMAIL = "parent@example.com";
const CLASS = "9";
const GRADE = "Class_9";

// Deterministic clock: everything is offset back from "now" so the demo always
// looks recent. Plain script (not a Workflow) → `new Date()` is allowed.
const now = new Date();
const DAY = 86_400_000;
const daysAgo = (d: number) => new Date(now.getTime() - d * DAY);
const dateStr = (d: Date) => d.toISOString().slice(0, 10);
// First-of-previous-month, the period the "was N last month" number reads from.
const priorPeriod = dateStr(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)));

type Trend = "up" | "down" | "flat" | "new";

// ── The spine + mastery spec. Each sub_topic names its subject/chapter/topic
// (all created on demand), its ordinal within the topic, its certified levels
// (procedural null = a genuine coverage gap), and a trend the history seeds. ──
type StSpec = {
  subj: string; // subject slug (demo-*)
  subjName: string;
  chap: string;
  chapName: string;
  chapOrd: number;
  top: string;
  topName: string;
  topOrd: number;
  slug: string;
  name: string;
  ord: number;
  c: number | null; // conceptual
  p: number | null; // procedural
  trend: Trend;
  desc: string;
};

const SCI = { subj: "demo-science", subjName: "Physics" };
const MAT = { subj: "demo-maths", subjName: "Mathematics" };

const SUBTOPICS: StSpec[] = [
  // Science → Motion → Kinematics
  { ...SCI, chap: "demo-motion", chapName: "Motion", chapOrd: 1, top: "demo-kinematics", topName: "Kinematics", topOrd: 1, slug: "demo-speed", name: "Speed & velocity", ord: 1, c: 5, p: 5, trend: "up", desc: "Distinguishes speed from velocity fluently and computes both cleanly; explains direction's role without prompting." },
  { ...SCI, chap: "demo-motion", chapName: "Motion", chapOrd: 1, top: "demo-kinematics", topName: "Kinematics", topOrd: 1, slug: "demo-accel", name: "Acceleration", ord: 2, c: 4, p: 4, trend: "up", desc: "Reads acceleration as the rate of change of velocity and applies a=Δv/Δt reliably; occasional unit slips under time pressure." },
  { ...SCI, chap: "demo-motion", chapName: "Motion", chapOrd: 1, top: "demo-kinematics", topName: "Kinematics", topOrd: 1, slug: "demo-graphs", name: "Motion graphs", ord: 3, c: 3, p: 3, trend: "flat", desc: "Reads gradients and areas correctly when cued, but still confuses which quantity a slope represents on distance–time vs velocity–time graphs." },
  { ...SCI, chap: "demo-motion", chapName: "Motion", chapOrd: 1, top: "demo-kinematics", topName: "Kinematics", topOrd: 1, slug: "demo-freefall", name: "Free fall", ord: 4, c: 4, p: 5, trend: "new", desc: "Executes g-based free-fall calculations accurately and can justify why mass drops out of the result." },
  // Science → Motion → Forces
  { ...SCI, chap: "demo-motion", chapName: "Motion", chapOrd: 1, top: "demo-forces", topName: "Forces", topOrd: 2, slug: "demo-newton1", name: "Newton's first law", ord: 1, c: 5, p: 4, trend: "up", desc: "Explains inertia with strong everyday transfer; identifies balanced forces reliably in worked problems." },
  { ...SCI, chap: "demo-motion", chapName: "Motion", chapOrd: 1, top: "demo-forces", topName: "Forces", topOrd: 2, slug: "demo-friction", name: "Friction", ord: 2, c: 2, p: 3, trend: "down", desc: "Can compute friction from a coefficient when set up, but the conceptual account (why static exceeds kinetic) is unstable and slipped since last month." },
  { ...SCI, chap: "demo-motion", chapName: "Motion", chapOrd: 1, top: "demo-forces", topName: "Forces", topOrd: 2, slug: "demo-momentum", name: "Momentum", ord: 3, c: null, p: 3, trend: "new", desc: "Procedure (p=mv, conservation set-ups) is coming along; the conceptual axis has not been assessed yet — no explain-why item has been served." },
  // Maths → Algebra → Equations
  { ...MAT, chap: "demo-algebra", chapName: "Algebra", chapOrd: 1, top: "demo-equations", topName: "Equations", topOrd: 1, slug: "demo-linear", name: "Linear equations", ord: 1, c: 5, p: 5, trend: "up", desc: "Solves multi-step linear equations without error and explains each inverse operation; strong, automatic." },
  { ...MAT, chap: "demo-algebra", chapName: "Algebra", chapOrd: 1, top: "demo-equations", topName: "Equations", topOrd: 1, slug: "demo-quadratic", name: "Quadratic equations", ord: 2, c: 4, p: 4, trend: "up", desc: "Factorises and applies the formula reliably; recognises when each method is efficient. Sign errors in the discriminant have largely resolved." },
  { ...MAT, chap: "demo-algebra", chapName: "Algebra", chapOrd: 1, top: "demo-equations", topName: "Equations", topOrd: 1, slug: "demo-simultaneous", name: "Simultaneous equations", ord: 3, c: 3, p: 4, trend: "flat", desc: "Executes elimination and substitution accurately; the conceptual account of why a solution is the intersection point is still developing." },
  // Maths → Algebra → Polynomials
  { ...MAT, chap: "demo-algebra", chapName: "Algebra", chapOrd: 1, top: "demo-polynomials", topName: "Polynomials", topOrd: 2, slug: "demo-factoring", name: "Factoring", ord: 1, c: 4, p: 4, trend: "up", desc: "Factors quadratics and simple cubics dependably, including grouping; recognises common structures on sight." },
  { ...MAT, chap: "demo-algebra", chapName: "Algebra", chapOrd: 1, top: "demo-polynomials", topName: "Polynomials", topOrd: 2, slug: "demo-remainder", name: "Remainder theorem", ord: 2, c: 3, p: 3, trend: "new", desc: "Applies the theorem to test factors correctly when reminded of the set-up; the underlying 'why' is not yet secure." },
  // demo-identities is deliberately LEFT UNCOVERED (no mastery_state row) → the
  // dashboard's "not yet taught" gray, distinct from a low level.
  { ...MAT, chap: "demo-algebra", chapName: "Algebra", chapOrd: 1, top: "demo-polynomials", topName: "Polynomials", topOrd: 2, slug: "demo-identities", name: "Algebraic identities", ord: 3, c: null, p: null, trend: "new", desc: "" },
];
// ── 3 SUBJECTS × 8 CHAPTERS. Physics + Mathematics keep their hand-written anchor
// chapters above (Motion, Algebra — the narrative sections hang off those sub_topic
// slugs); every other chapter is generated. Each chapter's `states` array spreads
// the heat across the atlas so no territory is one flat colour:
//   G = solid (both ≥4) · Y = practising (covered, not solid) · R = low ·
//   N = not-started (NO mastery row → a gray "not yet started" province).
type ChSt = "G" | "Y" | "R" | "N";
type ChapDef = { chap: string; chapName: string; top: string; topName: string; states: ChSt[] };
const LVL: Record<ChSt, { c: number | null; p: number | null; trend: Trend }> = {
  G: { c: 5, p: 4, trend: "up" },
  Y: { c: 4, p: 3, trend: "flat" },
  R: { c: 2, p: 2, trend: "down" },
  N: { c: null, p: null, trend: "new" },
};
const PART = ["fundamentals", "core skills", "applications"];
function mkChapters(subj: string, subjName: string, chaps: ChapDef[], chapOrdStart: number): StSpec[] {
  const out: StSpec[] = [];
  chaps.forEach((ch, ci) => {
    ch.states.forEach((st, si) => {
      const L = LVL[st];
      out.push({
        subj,
        subjName,
        chap: ch.chap,
        chapName: ch.chapName,
        chapOrd: chapOrdStart + ci,
        top: ch.top,
        topName: ch.topName,
        topOrd: 1,
        slug: `${ch.chap}-st${si + 1}`,
        name: `${ch.chapName} — ${PART[si] ?? `part ${si + 1}`}`,
        ord: si + 1,
        c: L.c,
        p: L.p,
        trend: L.trend,
        desc: st === "N" ? "" : `demo-seed: ${ch.chapName} ${PART[si] ?? ""} — certified for the demo atlas.`,
      });
    });
  });
  return out;
}

const CHEM = { subj: "demo-chemistry", subjName: "Chemistry" };

// Each subject gets a spread: ~2 green, ~3 yellow, ~2 red, 1 gray across its 8 chapters.
const EXTRA: StSpec[] = [
  // Physics — Motion is chapter 1 (the anchor, above); these are chapters 2..8.
  ...mkChapters(SCI.subj, SCI.subjName, [
    { chap: "demo-energy", chapName: "Work & Energy", top: "demo-work", topName: "Work & power", states: ["G", "G", "G"] },
    { chap: "demo-light", chapName: "Light", top: "demo-optics", topName: "Reflection & refraction", states: ["G", "R", "R"] },
    { chap: "demo-sound", chapName: "Sound", top: "demo-waves", topName: "Waves", states: ["G", "G", "Y"] },
    { chap: "demo-gravitation", chapName: "Gravitation", top: "demo-gravity", topName: "Gravity", states: ["G", "G", "G"] },
    { chap: "demo-electricity", chapName: "Electricity", top: "demo-current", topName: "Current", states: ["R", "R", "R"] },
    { chap: "demo-magnetism", chapName: "Magnetism", top: "demo-fields", topName: "Magnetic fields", states: ["N", "N", "N"] },
    { chap: "demo-heat", chapName: "Heat", top: "demo-thermo", topName: "Thermal physics", states: ["G", "G", "Y"] },
  ], 2),
  // Mathematics — Algebra is chapter 1 (the anchor, above); these are chapters 2..8.
  ...mkChapters(MAT.subj, MAT.subjName, [
    { chap: "demo-geometry", chapName: "Coordinate Geometry", top: "demo-coords", topName: "Coordinates", states: ["G", "G", "G"] },
    { chap: "demo-trig", chapName: "Trigonometry", top: "demo-ratios", topName: "Trig ratios", states: ["G", "R", "R"] },
    { chap: "demo-number", chapName: "Number Systems", top: "demo-reals", topName: "Real numbers", states: ["G", "G", "G"] },
    { chap: "demo-lines", chapName: "Lines & Angles", top: "demo-angles", topName: "Angles", states: ["G", "G", "Y"] },
    { chap: "demo-circles", chapName: "Circles", top: "demo-chords", topName: "Chords & tangents", states: ["R", "R", "R"] },
    { chap: "demo-stats", chapName: "Statistics", top: "demo-data", topName: "Data handling", states: ["G", "G", "Y"] },
    { chap: "demo-mensuration", chapName: "Mensuration", top: "demo-area", topName: "Area & volume", states: ["N", "N", "N"] },
  ], 2),
  // Chemistry — all generated, 8 chapters.
  ...mkChapters(CHEM.subj, CHEM.subjName, [
    { chap: "demo-matter", chapName: "Matter Around Us", top: "demo-states", topName: "States of matter", states: ["G", "G", "G"] },
    { chap: "demo-atoms", chapName: "Atoms & Molecules", top: "demo-mole", topName: "The mole concept", states: ["G", "G", "Y"] },
    { chap: "demo-atomic", chapName: "Structure of the Atom", top: "demo-shells", topName: "Electron shells", states: ["G", "R", "R"] },
    { chap: "demo-reactions", chapName: "Chemical Reactions", top: "demo-chemeq", topName: "Balancing equations", states: ["G", "G", "Y"] },
    { chap: "demo-acids", chapName: "Acids, Bases & Salts", top: "demo-ph", topName: "The pH scale", states: ["G", "G", "G"] },
    { chap: "demo-metals", chapName: "Metals & Non-metals", top: "demo-reactivity", topName: "Reactivity series", states: ["R", "R", "R"] },
    { chap: "demo-carbon", chapName: "Carbon Compounds", top: "demo-hydrocarbons", topName: "Hydrocarbons", states: ["G", "G", "Y"] },
    { chap: "demo-periodic", chapName: "Periodic Classification", top: "demo-ptable", topName: "The periodic table", states: ["N", "N", "N"] },
  ], 1),
];

// The full mapped spine. COVERED = every sub_topic that gets a mastery_state row;
// both-null entries (the N chapters + demo-identities) are LEFT uncovered → gray.
const MAPPED: StSpec[] = [...SUBTOPICS, ...EXTRA];
const COVERED = MAPPED.filter((s) => !(s.c === null && s.p === null));

// Sessions spanning every dispatch_reason × origin. subtopic slug → (reason, origin).
const SESSIONS: { slug: string; reason: string | null; origin: string; ageDays: number }[] = [
  { slug: "demo-speed", reason: "first_teach", origin: "self_serve", ageDays: 26 },
  { slug: "demo-accel", reason: "climb", origin: "self_serve", ageDays: 20 },
  { slug: "demo-graphs", reason: "retention", origin: "self_serve", ageDays: 12 },
  { slug: "demo-newton1", reason: "climb", origin: "tutor_assigned", ageDays: 9 },
  { slug: "demo-friction", reason: "retention", origin: "tutor_assigned", ageDays: 6 },
  { slug: "demo-linear", reason: "first_teach", origin: "tutor_assigned", ageDays: 24 },
  { slug: "demo-quadratic", reason: null, origin: "self_serve", ageDays: 3 }, // taught, no clock
];

// Horizontal skills: (subject, chapter) taxonomy + the student's subject-wide level.
const HSKILLS: { subj: string; chap: string; slug: string; def: string; level: number; prose: string }[] = [
  { subj: SCI.subj, chap: "demo-motion", slug: "language_precision", def: "States definitions with both halves and shows 'show that' working in full.", level: 3, prose: "Definitions are usually complete; working is sometimes compressed, dropping a justifying line under time pressure." },
  { subj: SCI.subj, chap: "demo-motion", slug: "causal_reasoning", def: "Reasons from a principle to a consequence, not just pattern-matching.", level: 2, prose: "Recurring weakness: reaches correct answers procedurally but struggles to say WHY across Motion — the 'because' is often missing." },
  { subj: MAT.subj, chap: "demo-algebra", slug: "algebraic_fluency", def: "Manipulates expressions accurately and efficiently without arithmetic slips.", level: 4, prose: "Fluent and fast; rearranges and simplifies cleanly across Algebra." },
  { subj: MAT.subj, chap: "demo-algebra", slug: "notation_discipline", def: "Writes each line as a true equation; no dropped signs or equals-sign abuse.", level: 3, prose: "Mostly disciplined; the occasional chained-equals slip still appears in longer derivations." },
];

async function main() {
  const [b] = await db.select({ id: board.id, slug: board.slug }).from(board).where(eq(board.slug, "cbse"));
  if (!b) throw new Error("cbse board not found locally — seed boards first");

  await withBoard(b.id, async (tx) => {
    // ── 1. Identity: tutor, student, parent, all linked. ──
    const tutor = await grantRole(tx, { email: TUTOR_EMAIL, name: "Demo Tutor", board: b, role: "tutor" });
    const parent = await grantRole(tx, { email: PARENT_EMAIL, name: "Demo Parent", board: b, role: "parent" });
    const stu = await ensureProfile(tx, { email: STUDENT_EMAIL, name: "Demo Student", userType: "student" });
    const studentId = stu.id;

    await tx
      .insert(student)
      .values({ userId: studentId, boardId: b.id, class: CLASS, pronoun: "she", tutorId: tutor.user.id, parentId: parent.user.id, status: "active", onboardingAt: new Date() })
      .onConflictDoUpdate({ target: student.userId, set: { boardId: b.id, class: CLASS, pronoun: "she", tutorId: tutor.user.id, parentId: parent.user.id } });

    const [head] = await tx.select({ userId: onboarding.userId }).from(onboarding).where(eq(onboarding.userId, studentId)).limit(1);
    if (head) await tx.update(onboarding).set({ status: "completed", state: "done" }).where(eq(onboarding.userId, studentId));
    else await tx.insert(onboarding).values({ userId: studentId, status: "completed", state: "done" });

    // ── 2. Spine (upsert by slug). Build slug→id maps as we go. ──
    const subjId = new Map<string, string>();
    const chapId = new Map<string, string>();
    const topId = new Map<string, string>();
    const stId = new Map<string, string>();

    for (const spec of MAPPED) {
      if (!subjId.has(spec.subj)) {
        const [row] = await tx
          .insert(subject)
          .values({ boardId: b.id, slug: spec.subj, name: spec.subjName, grade: GRADE })
          .onConflictDoUpdate({ target: [subject.boardId, subject.slug, subject.grade], set: { name: spec.subjName } })
          .returning();
        subjId.set(spec.subj, row!.id);
      }
      if (!chapId.has(spec.chap)) {
        const [row] = await tx
          .insert(chapter)
          .values({ boardId: b.id, subjectId: subjId.get(spec.subj)!, slug: spec.chap, name: spec.chapName, ordinal: spec.chapOrd })
          .onConflictDoUpdate({ target: [chapter.subjectId, chapter.slug], set: { name: spec.chapName, ordinal: spec.chapOrd } })
          .returning();
        chapId.set(spec.chap, row!.id);
      }
      if (!topId.has(spec.top)) {
        const [row] = await tx
          .insert(topic)
          .values({ boardId: b.id, chapterId: chapId.get(spec.chap)!, slug: spec.top, name: spec.topName, ordinal: spec.topOrd })
          .onConflictDoUpdate({ target: [topic.chapterId, topic.slug], set: { name: spec.topName, ordinal: spec.topOrd } })
          .returning();
        topId.set(spec.top, row!.id);
      }
      const [row] = await tx
        .insert(subTopic)
        .values({ boardId: b.id, topicId: topId.get(spec.top)!, slug: spec.slug, name: spec.name, ordinal: spec.ord })
        .onConflictDoUpdate({ target: [subTopic.topicId, subTopic.slug], set: { name: spec.name, ordinal: spec.ord } })
        .returning();
      stId.set(spec.slug, row!.id);
    }

    // Horizontal-skill taxonomy (upsert by chapter+slug).
    for (const h of HSKILLS) {
      await tx
        .insert(horizontalSkill)
        .values({ boardId: b.id, subjectId: subjId.get(h.subj)!, chapterId: chapId.get(h.chap)!, slug: h.slug, description: h.def })
        .onConflictDoUpdate({ target: [horizontalSkill.chapterId, horizontalSkill.slug], set: { description: h.def } });
    }

    // Pace plans — a SET-UP plan per subject (student-set deadline + chapter list)
    // so the parent dashboard's pace slide shows intended-vs-actual, not "no plan".
    // Dates chosen for a visible mix: Maths on track, Science a touch behind.
    const DAY = 86_400_000;
    const isoDay = (offsetDays: number) =>
      new Date(Date.now() + offsetDays * DAY).toISOString().slice(0, 10);
    // Multi-chapter plans, dates tuned for a visible mix (chapters lay end-to-end
    // by ~topicCount weeks from start): Science = Motion a touch behind + upcoming
    // on track; Maths = Algebra done + upcoming on track.
    const PACE: {
      subj: string;
      startAgo: number;
      endIn: number;
      chapters: { chap: string; completed: boolean }[];
    }[] = [
      {
        subj: SCI.subj,
        startAgo: 18,
        endIn: 15,
        chapters: [
          { chap: "demo-motion", completed: false }, // 2wk → due -4 (a touch behind)
          { chap: "demo-energy", completed: false }, // 1wk → due +3 (on track)
          { chap: "demo-light", completed: false }, // 1wk → due +10 (on track)
        ],
      },
      {
        subj: MAT.subj,
        startAgo: 20,
        endIn: 15,
        chapters: [
          { chap: "demo-algebra", completed: true }, // 2wk → due -6, done
          { chap: "demo-geometry", completed: false }, // 1wk → due +1 (on track)
          { chap: "demo-trig", completed: false }, // 1wk → due +8 (on track)
        ],
      },
      {
        subj: CHEM.subj,
        startAgo: 16,
        endIn: 18,
        chapters: [
          { chap: "demo-matter", completed: true }, // done
          { chap: "demo-atoms", completed: false }, // on track
          { chap: "demo-acids", completed: false }, // on track
        ],
      },
    ];
    for (const p of PACE) {
      const chapters = p.chapters.map((c) => ({
        chapterId: chapId.get(c.chap)!,
        completed: c.completed,
      }));
      const startDate = isoDay(-p.startAgo);
      const endDate = isoDay(p.endIn);
      await tx
        .insert(pacePlan)
        .values({
          boardId: b.id,
          appUserId: studentId,
          subjectId: subjId.get(p.subj)!,
          startDate,
          endDate,
          chapters,
          breaks: [],
          setupCompletedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [pacePlan.appUserId, pacePlan.subjectId],
          set: { startDate, endDate, chapters, setupCompletedAt: new Date() },
        });
    }

    // ── 3. WIPE the demo student's evidence (idempotent rebuild). Child→parent. ──
    const demoStIds = [...stId.values()];
    await tx.delete(crossConceptFlag).where(eq(crossConceptFlag.studentId, studentId));
    await tx.delete(observation).where(eq(observation.studentId, studentId));
    await tx.delete(attempt).where(eq(attempt.appUserId, studentId));
    await tx.delete(practiceSession).where(eq(practiceSession.appUserId, studentId));
    await tx.delete(question).where(inArray(question.subTopicId, demoStIds));
    await tx.delete(masteryHistory).where(eq(masteryHistory.studentId, studentId));
    await tx.delete(masteryState).where(eq(masteryState.studentId, studentId));
    await tx.delete(masterySnapshot).where(eq(masterySnapshot.studentId, studentId));
    await tx.delete(horizontalSkillState).where(eq(horizontalSkillState.studentId, studentId));
    await tx.delete(schedulingState).where(eq(schedulingState.studentId, studentId));

    // ── 4. Mastery state + history (the trend). ──
    for (const s of COVERED) {
      await tx.insert(masteryState).values({
        boardId: b.id,
        studentId,
        subTopicId: stId.get(s.slug)!,
        conceptualLevel: s.c,
        proceduralLevel: s.p,
        description: s.desc,
        log: `demo-seed: certified ${s.c ?? "—"}/${s.p ?? "—"}`,
        updatedAt: daysAgo(4),
      });
      // A prior snapshot so the arrow moves. "new" → no history (first certification).
      if (s.trend !== "new") {
        const priorC = s.trend === "up" ? clamp(s.c, -1) : s.trend === "down" ? clamp(s.c, +1) : s.c;
        const priorP = s.trend === "up" ? clamp(s.p, -1) : s.trend === "down" ? clamp(s.p, +1) : s.p;
        await tx.insert(masteryHistory).values({
          boardId: b.id,
          studentId,
          subTopicId: stId.get(s.slug)!,
          conceptualLevel: priorC,
          proceduralLevel: priorP,
          description: "demo-seed prior state",
          log: "demo-seed prior",
          snapshotAt: daysAgo(40),
        });
      }
    }

    // ── 5. Monthly mastery_snapshots — the last FOUR months, a rising curve, so
    // the dashboard's progress chart has a real trend (not just "was N last
    // month"). Current live counts are covered 12 / solid 7; the months climb up
    // to the -1mo point (covered 10 / solid 4 = the "was 4" number the headline
    // still reads). Per-subject breakdowns match the dashboard's aggregation. ──
    const firstOfMonthBack = (n: number) =>
      dateStr(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - n, 1)));
    // Live counts drive the curve so it scales with however many subjects exist —
    // the four months rise toward (but stay under) the live now-point, no cliff.
    const liveCoveredNow = COVERED.length;
    const liveSolidNow = COVERED.filter((s) => (s.c ?? 0) >= 4 && (s.p ?? 0) >= 4).length;
    const SNAP_F = [0.36, 0.57, 0.76, 0.9]; // back 4 → back 1 (the "was N" month)
    const SNAPS = [4, 3, 2, 1].map((back, i) => ({
      back,
      covered: Math.round(liveCoveredNow * SNAP_F[i]!),
      solid: Math.round(liveSolidNow * SNAP_F[i]!),
    }));
    for (const sn of SNAPS) {
      const period = firstOfMonthBack(sn.back);
      await tx.insert(masterySnapshot).values({
        boardId: b.id,
        studentId,
        period,
        coveredCount: sn.covered,
        solidCount: sn.solid,
        // perSubject powers no current chart (ProgressTrend reads covered/solid
        // totals only); left empty rather than carry a stale two-subject rollup.
        metrics: { perSubject: [] },
        capturedAt: new Date(`${period}T03:00:00Z`),
      });
    }

    // ── 6. Sessions (dispatch reasons) + attempts (metrics) + observations (calibration). ──
    // A rotating calibration pattern that clears element 8's noise floor.
    const calib: (string | null)[] = ["over", null, "under", null, "over", null, "under"];
    let ci = 0;
    for (const sess of SESSIONS) {
      const subTopicId = stId.get(sess.slug)!;
      const when = daysAgo(sess.ageDays);
      // A demo question to anchor the frozen session set + attempts.
      const [q] = await tx
        .insert(question)
        .values({ boardId: b.id, subTopicId, axis: "both", kind: "subjective", stem: `Demo question for ${sess.slug}`, referenceAnswer: "REF", explanation: "EXPL", pedagogicalNote: "NOTE", ordinal: 1, source: "b2c_authoring" })
        .returning();
      const [ps] = await tx
        .insert(practiceSession)
        .values({ boardId: b.id, appUserId: studentId, subTopicId, questionIds: [q!.id], currentIndex: 1, status: "completed", origin: sess.origin, dispatchReason: sess.reason, createdAt: when })
        .returning();
      // One answered attempt (confidence + time) and, on alternate sessions, a skip.
      const [att] = await tx
        .insert(attempt)
        .values({ boardId: b.id, practiceSessionId: ps!.id, questionId: q!.id, appUserId: studentId, answerText: "Demo answer showing working.", confidence: 3 + (ci % 3) - 1, timeMs: 45_000 + ci * 5_000, submittedAt: when })
        .returning();
      if (ci % 3 === 2) {
        await tx.insert(attempt).values({ boardId: b.id, practiceSessionId: ps!.id, questionId: q!.id, appUserId: studentId, skipReason: "not_sure", submittedAt: when });
      }
      // A SECOND answered attempt per session so the calibration element (element 8)
      // clears its ~10-answer noise floor (CALIBRATION_MIN_ANSWERS). No observation
      // on it → it lifts only the denominator, never the over/under counts.
      await tx.insert(attempt).values({ boardId: b.id, practiceSessionId: ps!.id, questionId: q!.id, appUserId: studentId, answerText: "Second demo answer.", confidence: 3, timeMs: 30_000, submittedAt: when });
      // An observation on this attempt, carrying a calibration flag on a rotation.
      await tx.insert(observation).values({
        boardId: b.id,
        studentId,
        subTopicId,
        questionId: q!.id,
        attemptId: att!.id,
        axis: ci % 2 === 0 ? "conceptual" : "procedural",
        observationLevel: 3,
        reasoning: "demo-seed Stage-1 read",
        calibrationFlag: calib[ci % calib.length] ?? null,
        source: "stage1_scorer",
        createdAt: when,
      });
      ci++;
    }

    // ── 6b. Daily activity spread — powers the GitHub-style contribution heatmap
    // AND the monthly-activity bars (the "effort" half of the dashboard). Runs over
    // ~19 weeks. Deterministic pseudo-random (a hash of the day index) so re-seeds
    // are STABLE: active-day probability rises with recency and dips on weekends;
    // each active day = one practice_session + 1–5 answered attempts dated that day.
    // No observations here → these lift activity + effort, never the calibration
    // over/under counts. ──
    const ACTIVITY_DAYS = 133;
    const hash = (n: number) => {
      const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
      return x - Math.floor(x); // deterministic 0..1
    };
    // A question pool on the covered sub_topics to attach activity attempts to.
    const activityQ: { qid: string; sid: string }[] = [];
    for (const cs of COVERED) {
      const sid = stId.get(cs.slug)!;
      const [q] = await tx
        .insert(question)
        .values({ boardId: b.id, subTopicId: sid, axis: "both", kind: "subjective", stem: `Practice item — ${cs.name}`, referenceAnswer: "REF", explanation: "EXPL", pedagogicalNote: "NOTE", ordinal: 2, source: "b2c_authoring" })
        .returning();
      activityQ.push({ qid: q!.id, sid });
    }
    let actDays = 0;
    let actAttempts = 0;
    for (let d = ACTIVITY_DAYS; d >= 1; d--) {
      const when = daysAgo(d);
      const dow = when.getUTCDay();
      const recency = 1 - d / ACTIVITY_DAYS; // 0 (old) → 1 (recent)
      const pActive = (0.3 + recency * 0.42) * (dow === 0 || dow === 6 ? 0.5 : 1);
      if (hash(d) > pActive) continue;
      actDays++;
      const count = 1 + Math.floor(hash(d * 7.3) * (2 + recency * 3)); // 1..~5
      const pick = activityQ[d % activityQ.length]!;
      const [ps] = await tx
        .insert(practiceSession)
        .values({ boardId: b.id, appUserId: studentId, subTopicId: pick.sid, questionIds: [pick.qid], currentIndex: 1, status: "completed", origin: d % 4 === 0 ? "tutor_assigned" : "self_serve", dispatchReason: null, createdAt: when })
        .returning();
      for (let k = 0; k < count; k++) {
        await tx.insert(attempt).values({ boardId: b.id, practiceSessionId: ps!.id, questionId: pick.qid, appUserId: studentId, answerText: "Practice answer showing working.", confidence: 3, timeMs: 40_000 + k * 4_000, submittedAt: when });
        actAttempts++;
      }
    }

    // ── 7. Horizontal-skill state (subject-wide levels; one weak). ──
    for (const h of HSKILLS) {
      await tx.insert(horizontalSkillState).values({ boardId: b.id, studentId, subjectId: subjId.get(h.subj)!, slug: h.slug, level: h.level, prose: h.prose, updatedAt: daysAgo(5) });
    }

    // ── 8. Cross-concept flags — element 6 (named weakness + plan). One WITH a
    // CLOCK-3 plan (authored), one WITHOUT (the page shows a generated default).
    // stage1_cross_concept needs from_sub_topic_id + source_observation_id, so
    // anchor each to a real observation on the sub_topic where it surfaced. ──
    const flagSources = [
      { slug: "demo-quadratic", note: "procedural gap in fraction manipulation — surfaced while clearing denominators in quadratics", plan: "Re-teaching fraction operations this Thursday, then two spaced retrievals over the following fortnight. Will confirm it holds under mixed practice before closing." },
      { slug: "demo-momentum", note: "unit-conversion slip (g vs kg) recurring in momentum problems", plan: null },
    ];
    for (const fs of flagSources) {
      const subTopicId = stId.get(fs.slug)!;
      const [obs] = await tx
        .insert(observation)
        .values({ boardId: b.id, studentId, subTopicId, axis: "procedural", observationLevel: 4, reasoning: "demo-seed: ran the target procedure fine but a foreign skill slipped", source: "stage1_scorer", createdAt: daysAgo(5) })
        .returning();
      await tx.insert(crossConceptFlag).values({
        boardId: b.id,
        studentId,
        origin: "stage1_cross_concept",
        fromSubTopicId: subTopicId,
        sourceObservationId: obs!.id,
        note: fs.note,
        plan: fs.plan,
        planUpdatedAt: fs.plan ? daysAgo(2) : null,
        planBy: fs.plan ? tutor.user.id : null,
      });
    }

    console.log(`✓ parent  ${PARENT_EMAIL}  (id ${parent.user.id}) — parent row, linked to the student`);
    console.log(`✓ student ${STUDENT_EMAIL} (id ${studentId}) — parent_id + tutor_id set, onboarding done`);
    console.log(`✓ spine   ${subjId.size} subjects, ${MAPPED.length} sub_topics (${COVERED.length} covered, 1 left uncovered)`);
    console.log(`✓ mastery ${liveCoveredNow} covered / ${liveSolidNow} solid now — ${SNAPS.length} monthly snapshots (rising, prior ${priorPeriod})`);
    console.log(`✓ sessions ${SESSIONS.length} across dispatch reasons; ${ci} observations (calibration mix); 2 cross-concept flags (1 with a plan)`);
    console.log(`✓ activity ${actDays} active days / ${actAttempts} attempts over ${ACTIVITY_DAYS}d (heatmap + monthly bars)`);
  });

  console.log("\nseed_demo_parent: done (cbse). Landing → dev-login:");
  console.log(`    Parent  → ${PARENT_EMAIL}`);
  console.log(`    Student → ${STUDENT_EMAIL}`);
  console.log(`    Tutor   → ${TUTOR_EMAIL}`);
  await queryClient.end();
}

// Nudge a level toward a prior value, clamped to 1..5 (null stays null).
function clamp(v: number | null, delta: number): number | null {
  if (v == null) return null;
  return Math.max(1, Math.min(5, v + delta));
}

main().catch(async (e) => {
  console.error("seed_demo_parent FAILED:", e);
  await queryClient.end();
  process.exit(1);
});
