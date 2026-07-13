/**
 * Slice PACE-1 — the student Pace Plan (#7 pacing, the FEATURE not the acquisition
 * engine — D-PACE-1). A per-student, per-subject timeline: the student sets a
 * subject window (start today + a self-chosen deadline), confirms the chapter
 * order, marks chapters complete, and reads a pace pill per chapter (are they
 * behind the projected deadline?) + a subject-level roll-up.
 *
 * Ported from the Python prod Student Pace Plan (b2c/docs/plans/student-pace-plan),
 * S1-equivalent, onto the rewrite spine (multi-tenant, subject = the scope unit).
 *
 * Load-bearing decisions realized here:
 *  - D-PACE-5  STORE INPUTS ONLY. pace_plan holds start/end/chapters/breaks; every
 *              derived value (projected date ranges, pace status, budget) is
 *              recomputed by getPlan on every read — never persisted, so there's
 *              no drift and an edit reflects on the next fetch.
 *  - D-PACE-2  RECOMMENDED WEEKS = the TOPIC(section)-count proxy (~1 week/topic).
 *              The rewrite has no authored session_estimate (prod's source), and
 *              sub_topic = a SLIDE (~31/chapter → absurd), so topic count is the
 *              sane grain. Chapters with no ingested topics (the un-authored
 *              siblings) fall back to a flat default. An admin-fed value overrides
 *              once ADMIN-1 exists (not built).
 *  - D-PACE-1  end_date is student-set with NO default — the pace check is
 *              meaningless without a real deadline (requirements §2).
 *  - D-L-5     per-user ownership: RLS scopes board not user, so every read/write
 *              is filtered by the caller's app_user id; a plan is (board, user,
 *              subject)-unique. A foreign plan is simply never selected.
 *
 * Projection model (faithful to prod): chapters are laid END-TO-END from
 * start_date, each spanning `recommended_days`; projected_end is the running
 * cursor. The student's end_date is NOT used to distribute chapters — it feeds
 * the BUDGET check (does the summed plan fit inside the window). Pace status
 * compares TODAY to a chapter's projected_end. Math in DAYS; weeks are display.
 */
import { and, eq, sql } from "drizzle-orm";
import type { PgTransaction } from "drizzle-orm/pg-core";
import { chapter, pacePlan, subject, topic } from "@b2c/kernel/schema";
import { computeChildReport } from "./parent";
import type { ChildSummary, ReportMasteryCard } from "./parent";

type Tx = PgTransaction<any, any, any>;

// ── tunables (single place the pace policy lives) ──────────────────────────
const WEEK_DAYS = 7;
/** Fallback weeks for a chapter with no ingested topics (D-PACE-2). */
const DEFAULT_WEEKS_NO_TOPICS = 2;
/** Sane bounds for a student's per-chapter estimate override (D-PACE-10). */
const OVERRIDE_MIN_WEEKS = 0.5;
const OVERRIDE_MAX_WEEKS = 52;
/**
 * Preparedness bands on the chapter aggregate (a 1–5 value). D-PACE-4/D-PACE-11.
 * ≥4 strong · ≥2.5 on_track · else needs_work · 0 certified sub_topics → not_started.
 */
const PREP_STRONG_MIN = 4;
const PREP_ON_TRACK_MIN = 2.5;

export class PaceSubjectNotFoundError extends Error {
  code = "PACE_SUBJECT_NOT_FOUND" as const;
  constructor(subjectId: string) {
    super(`subject not found: ${subjectId}`);
  }
}
export class PaceValidationError extends Error {
  code = "PACE_VALIDATION" as const;
}

export type PaceStatus = "completed" | "on_time" | "delay_risk" | "amber" | "red";
export type BudgetStatus = "ok" | "over" | "under";

/** System-measured readiness for a chapter, rolled up from certified mastery. */
export type PreparednessLabel = "strong" | "on_track" | "needs_work" | "not_started";
export type Preparedness = {
  label: PreparednessLabel;
  /** The 1–5 chapter aggregate (mean of per-sub_topic two-axis means); null when not_started. */
  value: number | null;
  /** How many of the chapter's sub_topics have certified mastery (drove the value). */
  certifiedSubTopics: number;
};

/** Severity order for the subject-level worst-case roll-up (completed excluded). */
const SEVERITY: Record<Exclude<PaceStatus, "completed">, number> = {
  on_time: 0,
  delay_risk: 1,
  amber: 2,
  red: 3,
};

// ── date helpers (ISO YYYY-MM-DD, UTC-anchored so there's no TZ drift) ─────
function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}
function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
/** b − a in whole days. */
function daysBetween(aIso: string, bIso: string): number {
  const a = Date.parse(`${aIso}T00:00:00Z`);
  const b = Date.parse(`${bIso}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}
function isIsoDate(s: unknown): s is string {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));
}

/** SUGGESTED weeks for a chapter (topic-count proxy + flat fallback). D-PACE-2. */
export function computeRecommendedWeeks(topicCount: number): number {
  return topicCount > 0 ? topicCount : DEFAULT_WEEKS_NO_TOPICS;
}

/**
 * EFFECTIVE weeks that drive the plan = the student's per-chapter override when
 * present, else the proxy suggestion (D-PACE-10). Precedence is
 * studentOverride ?? adminDefault ?? proxy; ADMIN-1 (the admin default) isn't
 * built yet, so it collapses to override ?? proxy here.
 */
export function effectiveWeeks(topicCount: number, weeksOverride?: number): number {
  return weeksOverride ?? computeRecommendedWeeks(topicCount);
}

function validateWeeksOverride(w: number): void {
  if (typeof w !== "number" || Number.isNaN(w))
    throw new PaceValidationError("weeksOverride must be a number");
  if (w < OVERRIDE_MIN_WEEKS || w > OVERRIDE_MAX_WEEKS)
    throw new PaceValidationError(
      `weeksOverride must be between ${OVERRIDE_MIN_WEEKS} and ${OVERRIDE_MAX_WEEKS} weeks`,
    );
}

/**
 * Preparedness roll-up for ONE chapter from its certified mastery cards (D-PACE-4,
 * the rewrite's rework of prod's Strong/Good/Weak `_compute_chapter_preparedness`).
 * Logic lives here only — no per-page recomputation.
 *
 * - Two axes → one number: per sub_topic take mean(conceptual, procedural) on the
 *   1–5 scale (D-PACE-11, "avg" chosen over "min" for a faithful, non-harsh read),
 *   then average across the chapter's certified sub_topics.
 * - Bands: ≥4 strong · ≥2.5 on_track · else needs_work.
 * - Zero certified sub_topics → not_started (value null). We do NOT apply prod's
 *   "<50% coverage → Limited data" rule: rewrite sub_topic = a single slide and
 *   Stage-2 certification is tutor-gated + sparse, so coverage would misfire on
 *   nearly every chapter (D-PACE-4: sparse-is-fine, no hiding on mastery; D-PACE-11).
 */
export function preparednessForChapter(cards: ReportMasteryCard[]): Preparedness {
  // An UNOBSERVED axis (null) is absent evidence, not a low score — averaging it
  // in as 0/1 would fabricate weakness. Take the mean over the axes we actually
  // observed; a card with neither axis observed contributes nothing at all.
  const scored = cards.flatMap((c) => {
    const axes = [c.conceptualLevel, c.proceduralLevel].filter(
      (l): l is number => l != null,
    );
    return axes.length ? [axes.reduce((a, b) => a + b, 0) / axes.length] : [];
  });
  const n = scored.length;
  if (n === 0) return { label: "not_started", value: null, certifiedSubTopics: 0 };
  const value = scored.reduce((a, b) => a + b, 0) / n;
  const label: PreparednessLabel =
    value >= PREP_STRONG_MIN ? "strong" : value >= PREP_ON_TRACK_MIN ? "on_track" : "needs_work";
  return { label, value, certifiedSubTopics: n };
}

/** Group a student's certified mastery cards by chapterId (for the pace roll-up). */
function groupCardsByChapter(cards: ReportMasteryCard[]): Map<string, ReportMasteryCard[]> {
  const byChapter = new Map<string, ReportMasteryCard[]>();
  for (const c of cards) {
    const list = byChapter.get(c.chapterId);
    if (list) list.push(c);
    else byChapter.set(c.chapterId, [c]);
  }
  return byChapter;
}

/** Pace status for one chapter: today vs its projected end date. */
function paceStatusFor(projectedEndIso: string, todayIso: string, completed: boolean): PaceStatus {
  if (completed) return "completed";
  const daysPast = daysBetween(projectedEndIso, todayIso); // today − projectedEnd
  if (daysPast <= 0) return "on_time";
  if (daysPast <= 7) return "delay_risk";
  if (daysPast <= 14) return "amber";
  return "red";
}

// ── shapes ─────────────────────────────────────────────────────────────────
type StoredChapter = { chapterId: string; completed: boolean; weeksOverride?: number };
type BreakRange = { startDate: string; endDate: string };

export type SubjectRef = { id: string; slug: string; name: string; grade: string };

export type PaceChapterRow = {
  chapterId: string;
  name: string;
  order: number; // 0-based position in the plan
  topicCount: number;
  /** EFFECTIVE weeks driving the plan = override ?? proxy (D-PACE-10). */
  recommendedWeeks: number;
  /** The proxy suggestion — the anchor kept visible next to any override. */
  suggestedWeeks: number;
  /** The student's raw override, if set (undefined = using the suggestion). */
  weeksOverride?: number;
  recommendedDays: number;
  completed: boolean;
  /** Present only for a set-up plan (needsSetup === false). */
  projectedStartDate?: string;
  projectedEndDate?: string;
  paceStatus?: PaceStatus;
  /**
   * System-measured readiness from certified mastery (PACE-2, D-PACE-4). Present
   * on the set-up timeline rows, co-located with the complete toggle (§8). Plan-
   * independent — recomputed at read, never persisted (D-PACE-5).
   */
  preparedness?: Preparedness;
};

export type PaceSummary = {
  startDate: string;
  endDate: string;
  totalRecommendedDays: number;
  availableDays: number;
  budgetStatus: BudgetStatus;
  subjectStatus: PaceStatus; // worst non-completed chapter (or 'completed' when all done)
};

export type PacePlanView =
  | {
      needsSetup: true;
      subject: SubjectRef;
      defaultStartDate: string;
      chapters: PaceChapterRow[]; // registry (ordinal) order, no dates
    }
  | {
      needsSetup: false;
      subject: SubjectRef;
      chapters: PaceChapterRow[]; // plan order, with projected dates + pace
      summary: PaceSummary;
    };

// ── internals ────────────────────────────────────────────────────────────
async function loadSubject(tx: Tx, subjectId: string): Promise<SubjectRef> {
  const [s] = await tx
    .select({ id: subject.id, slug: subject.slug, name: subject.name, grade: subject.grade })
    .from(subject)
    .where(eq(subject.id, subjectId))
    .limit(1);
  if (!s) throw new PaceSubjectNotFoundError(subjectId);
  return s;
}

/** Subject's chapters (ordinal order) + their topic counts, RLS-scoped. */
async function loadChapters(
  tx: Tx,
  subjectId: string,
): Promise<Array<{ chapterId: string; name: string; ordinal: number; topicCount: number }>> {
  const rows = await tx
    .select({
      chapterId: chapter.id,
      name: chapter.name,
      ordinal: chapter.ordinal,
      topicCount: sql<number>`count(${topic.id})`.mapWith(Number),
    })
    .from(chapter)
    .leftJoin(topic, eq(topic.chapterId, chapter.id))
    .where(eq(chapter.subjectId, subjectId))
    .groupBy(chapter.id, chapter.name, chapter.ordinal)
    .orderBy(chapter.ordinal);
  return rows;
}

async function loadPlanRow(tx: Tx, appUserId: string, subjectId: string) {
  const [row] = await tx
    .select()
    .from(pacePlan)
    .where(and(eq(pacePlan.appUserId, appUserId), eq(pacePlan.subjectId, subjectId)))
    .limit(1);
  return row ?? null;
}

// ── reads ──────────────────────────────────────────────────────────────────

/**
 * The whole derive-at-read view. `today` is injectable (defaults to real today)
 * purely so the probe can pin the clock and assert pace thresholds deterministically.
 */
export async function getPlan(
  tx: Tx,
  args: { self: ChildSummary; subjectId: string; today?: string },
): Promise<PacePlanView> {
  const appUserId = args.self.studentId;
  const subj = await loadSubject(tx, args.subjectId);
  const chapters = await loadChapters(tx, args.subjectId);
  const today = args.today ?? todayIso();
  const plan = await loadPlanRow(tx, appUserId, args.subjectId);

  // No plan yet, or setup never finished → the setup view (registry order, no dates).
  if (!plan || !plan.setupCompletedAt) {
    return {
      needsSetup: true,
      subject: subj,
      defaultStartDate: today,
      chapters: chapters.map((c, i) => {
        // No plan yet → no overrides; suggested == effective.
        const weeks = computeRecommendedWeeks(c.topicCount);
        return {
          chapterId: c.chapterId,
          name: c.name,
          order: i,
          topicCount: c.topicCount,
          recommendedWeeks: weeks,
          suggestedWeeks: weeks,
          recommendedDays: Math.round(weeks * WEEK_DAYS),
          completed: false,
        };
      }),
    };
  }

  // Set-up plan → order by the stored chapter list; append any subject chapters
  // not in the plan (added after setup) at the end so nothing silently vanishes.
  const stored = (plan.chapters as StoredChapter[]) ?? [];
  const byId = new Map(chapters.map((c) => [c.chapterId, c]));
  const ordered: Array<{
    meta: (typeof chapters)[number];
    completed: boolean;
    weeksOverride?: number;
  }> = [];
  const seen = new Set<string>();
  for (const s of stored) {
    const meta = byId.get(s.chapterId);
    if (meta) {
      ordered.push({ meta, completed: !!s.completed, weeksOverride: s.weeksOverride });
      seen.add(s.chapterId);
    }
  }
  for (const c of chapters) {
    if (!seen.has(c.chapterId)) ordered.push({ meta: c, completed: false });
  }

  // Preparedness (PACE-2, D-PACE-4): plan-independent readiness rolled up from the
  // caller's certified mastery. Reuse computeChildReport (the ONE mastery read +
  // the M11 description-only/never-`log` boundary — D-PACE-11), grouped by chapter.
  // Returns the student's whole board; other subjects' cards simply don't match.
  const report = await computeChildReport(tx, args.self);
  const cardsByChapter = groupCardsByChapter(report.mastery);

  // Lay chapters END-TO-END from start_date; project each range; status vs today.
  const startDate = plan.startDate as string;
  const endDate = plan.endDate as string;
  let cursor = startDate;
  let totalRecommendedDays = 0;
  let worst = -1;

  const rows: PaceChapterRow[] = ordered.map((o, i) => {
    const suggested = computeRecommendedWeeks(o.meta.topicCount);
    const weeks = effectiveWeeks(o.meta.topicCount, o.weeksOverride);
    const days = Math.round(weeks * WEEK_DAYS);
    const projectedStart = cursor;
    const projectedEnd = addDays(cursor, days);
    cursor = projectedEnd;
    totalRecommendedDays += days;
    const status = paceStatusFor(projectedEnd, today, o.completed);
    if (status !== "completed") worst = Math.max(worst, SEVERITY[status]);
    return {
      chapterId: o.meta.chapterId,
      name: o.meta.name,
      order: i,
      topicCount: o.meta.topicCount,
      recommendedWeeks: weeks,
      suggestedWeeks: suggested,
      weeksOverride: o.weeksOverride,
      recommendedDays: days,
      completed: o.completed,
      projectedStartDate: projectedStart,
      projectedEndDate: projectedEnd,
      paceStatus: status,
      preparedness: preparednessForChapter(cardsByChapter.get(o.meta.chapterId) ?? []),
    };
  });

  const breakDays = (plan.breaks as BreakRange[]).reduce(
    (n, b) => n + Math.max(0, daysBetween(b.startDate, b.endDate)),
    0,
  );
  const availableDays = Math.max(0, daysBetween(startDate, endDate) - breakDays);
  const budgetStatus: BudgetStatus =
    totalRecommendedDays > availableDays ? "over" : totalRecommendedDays < availableDays ? "under" : "ok";
  const subjectStatus: PaceStatus =
    worst < 0
      ? "completed" // every chapter completed (or no chapters)
      : (Object.keys(SEVERITY) as Array<Exclude<PaceStatus, "completed">>).find((k) => SEVERITY[k] === worst)!;

  return {
    needsSetup: false,
    subject: subj,
    chapters: rows,
    summary: {
      startDate,
      endDate,
      totalRecommendedDays,
      availableDays,
      budgetStatus,
      subjectStatus,
    },
  };
}

/** Subjects under the board (for the dashboard cards / subject picker). */
export async function listSubjects(tx: Tx): Promise<SubjectRef[]> {
  return tx
    .select({ id: subject.id, slug: subject.slug, name: subject.name, grade: subject.grade })
    .from(subject)
    .orderBy(subject.name);
}

// ── writes ───────────────────────────────────────────────────────────────

function validateChapterOrder(chapterIds: string[], subjectChapterIds: Set<string>): void {
  if (chapterIds.length === 0) throw new PaceValidationError("chapter order is empty");
  const seen = new Set<string>();
  for (const id of chapterIds) {
    if (!subjectChapterIds.has(id)) throw new PaceValidationError(`chapter not in subject: ${id}`);
    if (seen.has(id)) throw new PaceValidationError(`duplicate chapter in order: ${id}`);
    seen.add(id);
  }
}

/**
 * First-visit setup (or re-setup): the ownership moment. endDate is REQUIRED and
 * must be after startDate (D-PACE-1). Upserts the (user, subject) plan and stamps
 * setupCompletedAt. Idempotent per (user, subject) via the unique constraint.
 */
export async function setupPlan(
  tx: Tx,
  args: {
    boardId: string;
    appUserId: string;
    subjectId: string;
    startDate?: string;
    endDate: string;
    chapterOrder: string[];
  },
): Promise<void> {
  await loadSubject(tx, args.subjectId); // 404s a cross-board / unknown subject
  const start = args.startDate ?? todayIso();
  if (!isIsoDate(start)) throw new PaceValidationError("startDate must be YYYY-MM-DD");
  if (!isIsoDate(args.endDate)) throw new PaceValidationError("endDate must be YYYY-MM-DD");
  if (daysBetween(start, args.endDate) <= 0)
    throw new PaceValidationError("endDate must be after startDate");

  const chapters = await loadChapters(tx, args.subjectId);
  validateChapterOrder(args.chapterOrder, new Set(chapters.map((c) => c.chapterId)));

  const storedChapters: StoredChapter[] = args.chapterOrder.map((chapterId) => ({
    chapterId,
    completed: false,
  }));

  await tx
    .insert(pacePlan)
    .values({
      boardId: args.boardId,
      appUserId: args.appUserId,
      subjectId: args.subjectId,
      startDate: start,
      endDate: args.endDate,
      chapters: storedChapters,
      breaks: [],
      setupCompletedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [pacePlan.appUserId, pacePlan.subjectId],
      set: {
        startDate: start,
        endDate: args.endDate,
        chapters: storedChapters,
        setupCompletedAt: new Date(),
        updatedAt: new Date(),
      },
    });
}

/**
 * Update an existing (set-up) plan: dates, chapter order, and/or completion flags.
 * `chapters` (when given) is the full ordered list with completion — it replaces
 * the stored list (order + flags in one write). Only touches the caller's plan.
 */
export async function updatePlan(
  tx: Tx,
  args: {
    appUserId: string;
    subjectId: string;
    startDate?: string;
    endDate?: string;
    chapters?: StoredChapter[];
  },
): Promise<void> {
  const plan = await loadPlanRow(tx, args.appUserId, args.subjectId);
  if (!plan || !plan.setupCompletedAt)
    throw new PaceValidationError("no set-up plan to update (run setup first)");

  const set: Record<string, unknown> = { updatedAt: new Date() };

  const start = args.startDate ?? (plan.startDate as string);
  const end = args.endDate ?? (plan.endDate as string);
  if (args.startDate !== undefined) {
    if (!isIsoDate(args.startDate)) throw new PaceValidationError("startDate must be YYYY-MM-DD");
    set.startDate = args.startDate;
  }
  if (args.endDate !== undefined) {
    if (!isIsoDate(args.endDate)) throw new PaceValidationError("endDate must be YYYY-MM-DD");
    set.endDate = args.endDate;
  }
  if ((args.startDate !== undefined || args.endDate !== undefined) && daysBetween(start, end) <= 0)
    throw new PaceValidationError("endDate must be after startDate");

  if (args.chapters !== undefined) {
    const chapters = await loadChapters(tx, args.subjectId);
    validateChapterOrder(
      args.chapters.map((c) => c.chapterId),
      new Set(chapters.map((c) => c.chapterId)),
    );
    for (const c of args.chapters) if (c.weeksOverride !== undefined) validateWeeksOverride(c.weeksOverride);
    // Persist the full ordered list, preserving each chapter's estimate override
    // (undefined = fall back to the proxy suggestion). D-PACE-10.
    set.chapters = args.chapters.map((c) => {
      const stored: StoredChapter = { chapterId: c.chapterId, completed: !!c.completed };
      if (c.weeksOverride !== undefined) stored.weeksOverride = c.weeksOverride;
      return stored;
    });
  }

  await tx
    .update(pacePlan)
    .set(set)
    .where(and(eq(pacePlan.appUserId, args.appUserId), eq(pacePlan.subjectId, args.subjectId)));
}
