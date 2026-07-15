/**
 * Revision read path (S3) — the bridge read.
 *
 * Given a sub_topic, return the CURRENT published slide for it. Revision is
 * always-latest (D-WS3): it reflects `content_unit.current_version_id`, no
 * fork-on-start pin (that's a Practice concern). Resolution chain:
 *
 *   sub_topic → topic → chapter → slide_module content_unit (by chapter_id,
 *   D-S2-1) → current_version → manifest.slides[sub_topic.slug] → slideId
 *
 * Runs inside the board-scoped tx (protectedProcedure → withBoard): every spine
 * read is RLS-gated, so a sub_topic from another board simply isn't found →
 * SLIDE_NOT_FOUND. content_version is reached only via the RLS'd content_unit,
 * so it's protected transitively (no board-less path to its id).
 *
 * The bundle BYTES live in content_version.body.bundle; this returns a
 * `bundleUrl` pointing at the S4 route that serves them — never the bytes
 * themselves (keeps the read response small; the FE fetches the bundle once).
 */
import { and, desc, eq, isNotNull, isNull } from "drizzle-orm";
import type { PgTransaction } from "drizzle-orm/pg-core";
import { z } from "zod";
import {
  chapter,
  contentUnit,
  contentVersion,
  eventLog,
  pacePlan,
  subTopic,
  topic,
} from "@b2c/kernel/schema";
import { computeDueQueue } from "./scheduler";
import { getPlan } from "./pace";
import type { PreparednessLabel } from "./pace";
import type { ChildSummary } from "./parent";

export class SlideNotFoundError extends Error {
  readonly code = "SLIDE_NOT_FOUND";
  constructor(subTopicId: string) {
    super(`no current slide for sub_topic ${subTopicId}`);
    this.name = "SlideNotFoundError";
  }
}

export class QuestionNotFoundError extends Error {
  readonly code = "QUESTION_NOT_FOUND";
  constructor(questionId: string) {
    super(`no question ${questionId} in this slide's pools`);
    this.name = "QuestionNotFoundError";
  }
}

/** The route (served in S4) that streams a version's module bundle bytes. */
export const bundleUrlFor = (versionId: string) => `/content/bundle/${versionId}`;

export type SlideRef = {
  versionNo: number;
  slideId: string;
  bundleUrl: string;
  /** Slice VOICE-2b: true when this slide has authored voice_context — the FE
   *  gates the "Talk to this slide" button on it (mirrors prod's button gate).
   *  Derived from the same manifest getVoiceGrounding reads, no extra query. */
  hasVoiceContext: boolean;
};

export type SubTopicNav = {
  id: string;
  slug: string;
  name: string;
  topicName: string;
  chapterName: string;
};

/**
 * Nav source for the Revision FE (S4): the sub_topics visible under the current
 * board claim, with their topic + chapter names for grouping. RLS-scoped via the
 * board tx, so another board's spine is invisible. Ordered by chapter/topic/
 * sub_topic ordinal for a stable nav. The FE can't hardcode generated UUIDs, so
 * it reads ids from here to call getSlide.
 */
export async function listSubTopics(
  tx: PgTransaction<any, any, any>,
): Promise<SubTopicNav[]> {
  return tx
    .select({
      id: subTopic.id,
      slug: subTopic.slug,
      name: subTopic.name,
      topicName: topic.name,
      chapterName: chapter.name,
      chapterOrdinal: chapter.ordinal,
      topicOrdinal: topic.ordinal,
      subOrdinal: subTopic.ordinal,
    })
    .from(subTopic)
    .innerJoin(topic, eq(subTopic.topicId, topic.id))
    .innerJoin(chapter, eq(topic.chapterId, chapter.id))
    .orderBy(chapter.ordinal, topic.ordinal, subTopic.ordinal)
    .then((rows) =>
      rows.map(({ chapterOrdinal, topicOrdinal, subOrdinal, ...nav }) => nav),
    );
}

// ── Chapter nav tree (Feature B) ───────────────────────────────────────────
//
// Prod-style slide nav source: the board's chapter → topic(section) → sub_topic
// (slide) tree, with stable ids + ordinals so the FE can render a collapsible
// section sidebar AND derive the flat prev/next order (tree order) from it.
// RLS-scoped (board tx) + ordinal-ordered. Supersedes listSubTopics for the
// Revision page; per-slide resolution failures stay handled by getSlide (D-B-1).

export type ChapterNavSubTopic = {
  id: string;
  slug: string;
  name: string;
  ordinal: number;
};
export type ChapterNavTopic = {
  id: string;
  name: string;
  ordinal: number;
  subTopics: ChapterNavSubTopic[];
};
export type ChapterNavChapter = {
  id: string;
  name: string;
  ordinal: number;
  topics: ChapterNavTopic[];
};

export async function getChapterNav(
  tx: PgTransaction<any, any, any>,
): Promise<ChapterNavChapter[]> {
  const rows = await tx
    .select({
      chapterId: chapter.id,
      chapterName: chapter.name,
      chapterOrdinal: chapter.ordinal,
      topicId: topic.id,
      topicName: topic.name,
      topicOrdinal: topic.ordinal,
      subId: subTopic.id,
      subSlug: subTopic.slug,
      subName: subTopic.name,
      subOrdinal: subTopic.ordinal,
    })
    .from(subTopic)
    .innerJoin(topic, eq(subTopic.topicId, topic.id))
    .innerJoin(chapter, eq(topic.chapterId, chapter.id))
    .orderBy(chapter.ordinal, topic.ordinal, subTopic.ordinal);

  // Group the ordered rows into the tree. Rows are already in tree order, so a
  // simple "current chapter / current topic" fold preserves ordinal order
  // without re-sorting.
  const chapters: ChapterNavChapter[] = [];
  const chapterById = new Map<string, ChapterNavChapter>();
  const topicById = new Map<string, ChapterNavTopic>();

  for (const r of rows) {
    let ch = chapterById.get(r.chapterId);
    if (!ch) {
      ch = { id: r.chapterId, name: r.chapterName, ordinal: r.chapterOrdinal, topics: [] };
      chapterById.set(r.chapterId, ch);
      chapters.push(ch);
    }
    let tp = topicById.get(r.topicId);
    if (!tp) {
      tp = { id: r.topicId, name: r.topicName, ordinal: r.topicOrdinal, subTopics: [] };
      topicById.set(r.topicId, tp);
      ch.topics.push(tp);
    }
    tp.subTopics.push({
      id: r.subId,
      slug: r.subSlug,
      name: r.subName,
      ordinal: r.subOrdinal,
    });
  }

  return chapters;
}

/**
 * The resolution chain shared by getSlide / getQuestions / checkAnswer
 * (sub_topic → topic → chapter → slide_module → current_version → manifest +
 * validated slideId). Runs inside the board-scoped tx, so every hop is RLS-gated
 * — a cross-board sub_topic simply isn't found → SLIDE_NOT_FOUND. Returns the
 * manifest so the question paths can read `question_pools[slideId]` server-side.
 */
type SlideContext = {
  versionId: string;
  versionNo: number;
  slideId: string;
  manifest: any;
};

async function resolveSlideContext(
  tx: PgTransaction<any, any, any>,
  subTopicId: string,
): Promise<SlideContext> {
  const [st] = await tx
    .select({
      id: subTopic.id,
      slug: subTopic.slug,
      topicId: subTopic.topicId,
      contentSlideKey: subTopic.contentSlideKey,
    })
    .from(subTopic)
    .where(eq(subTopic.id, subTopicId))
    .limit(1);
  if (!st) throw new SlideNotFoundError(subTopicId);

  const [tp] = await tx
    .select({ chapterId: topic.chapterId })
    .from(topic)
    .where(eq(topic.id, st.topicId))
    .limit(1);
  if (!tp) throw new SlideNotFoundError(subTopicId);

  // assert the chapter is visible under the current claim (defensive; the FK
  // chain already implies it, but makes cross-board failure explicit)
  const [ch] = await tx
    .select({ id: chapter.id })
    .from(chapter)
    .where(eq(chapter.id, tp.chapterId))
    .limit(1);
  if (!ch) throw new SlideNotFoundError(subTopicId);

  const [unit] = await tx
    .select({ currentVersionId: contentUnit.currentVersionId })
    .from(contentUnit)
    .where(
      and(
        eq(contentUnit.type, "slide_module"),
        eq(contentUnit.chapterId, ch.id),
        isNull(contentUnit.subTopicId),
      ),
    )
    .limit(1);
  if (!unit?.currentVersionId) throw new SlideNotFoundError(subTopicId);

  const [ver] = await tx
    .select({
      id: contentVersion.id,
      versionNo: contentVersion.versionNo,
      body: contentVersion.body,
    })
    .from(contentVersion)
    .where(eq(contentVersion.id, unit.currentVersionId))
    .limit(1);
  if (!ver) throw new SlideNotFoundError(subTopicId);

  const manifest = (ver.body as any)?.manifest;

  // Real path (D-C1-1): the sub_topic's content_slide_key IS the slideId; the
  // real Starkhorn manifest (module → section → slide) has no sub_topic level,
  // so the spine declares the mapping. Validate the slideId is published in this
  // version's manifest before serving it.
  // Legacy fallback: pre-C1 synthetic fixtures carry no content_slide_key and a
  // simplified `manifest.slides{slug→slideId}` map. (Remove when seed_s2 retires.)
  let slideId: unknown;
  if (st.contentSlideKey) {
    slideId = st.contentSlideKey;
    const published =
      Array.isArray(manifest?.sections) &&
      manifest.sections.some(
        (sec: any) =>
          Array.isArray(sec.topics) &&
          sec.topics.some((t: any) => t.id === slideId),
      );
    if (!published) throw new SlideNotFoundError(subTopicId);
  } else {
    slideId = manifest?.slides?.[st.slug];
  }
  if (typeof slideId !== "string" || slideId.length === 0) {
    throw new SlideNotFoundError(subTopicId);
  }

  return { versionId: ver.id, versionNo: ver.versionNo, slideId, manifest };
}

export async function getSlide(
  tx: PgTransaction<any, any, any>,
  args: { subTopicId: string },
): Promise<SlideRef> {
  const { versionId, versionNo, slideId, manifest } = await resolveSlideContext(
    tx,
    args.subTopicId,
  );
  const { voiceContext } = voiceContextFromManifest(manifest, slideId);
  return {
    versionNo,
    slideId,
    bundleUrl: bundleUrlFor(versionId),
    hasVoiceContext: voiceContext !== null,
  };
}

// ── Voice grounding (Slice VOICE-1) ────────────────────────────────────────
//
// The manifest already carries `voice_context` per topic/slide (it rides in on
// the content pull, untouched — ingest.ts types it). Voice tutoring reads it as
// the AI's grounding for THIS slide: the `context` blurb + domain `keywords`.
// null when the slide has no voice_context authored (the button was gated on
// this in prod) — voice.startSession rejects that case.

export type VoiceGrounding = {
  slideId: string;
  title: string;
  voiceContext: { context: string; keywords: string[] } | null;
};

/** Pure: pull a slide's title + voice_context out of an already-resolved
 *  manifest. Shared by getSlide (the hasVoiceContext gating flag) and
 *  getVoiceGrounding (the full grounding) so the "does this slide have voice?"
 *  rule lives in exactly one place. voiceContext=null when none is authored. */
function voiceContextFromManifest(
  manifest: any,
  slideId: string,
): { title: string; voiceContext: VoiceGrounding["voiceContext"] } {
  let title = "";
  let voiceContext: VoiceGrounding["voiceContext"] = null;
  if (Array.isArray(manifest?.sections)) {
    for (const sec of manifest.sections) {
      if (!Array.isArray(sec.topics)) continue;
      const t = sec.topics.find((x: any) => x?.id === slideId);
      if (!t) continue;
      title = typeof t.title === "string" ? t.title : "";
      const vc = t.voice_context;
      if (
        vc &&
        typeof vc === "object" &&
        typeof vc.context === "string" &&
        vc.context.trim().length > 0
      ) {
        voiceContext = {
          context: vc.context,
          keywords: Array.isArray(vc.keywords)
            ? vc.keywords.filter((k: unknown): k is string => typeof k === "string")
            : [],
        };
      }
      break;
    }
  }
  return { title, voiceContext };
}

export async function getVoiceGrounding(
  tx: PgTransaction<any, any, any>,
  subTopicId: string,
): Promise<VoiceGrounding> {
  const { slideId, manifest } = await resolveSlideContext(tx, subTopicId);
  const { title, voiceContext } = voiceContextFromManifest(manifest, slideId);
  return { slideId, title, voiceContext };
}

// ── In-slide MCQs (Slice A) ────────────────────────────────────────────────
//
// Server-checked Quick Checks. The b2c rule is load-bearing here: answer keys
// (`evaluation.correct_answer` / `.explanation`) live in the manifest stored in
// content_version.body — they must NEVER reach the client until after a check.
// getQuestions therefore builds the public question by ALLOWLIST (id/question/
// options/marks), so `evaluation` can't leak by accident; checkAnswer reads the
// key server-side and returns the verdict.
//
// Transliterated from prod `revision_service.select_section_questions` +
// `/revision/check`: question_pools[slideId] is a list of SLOTS, each slot a
// pool; pick ONE question per slot. Param locked: RANDOM each load (matches prod
// `random.choice`). checkAnswer now RECORDS each check to event_log (D-A-1
// closure / D-MCQ-1) — record-only, no LLM scoring (G4: MCQ is special-purpose).

/** The public, key-free question shape sent to the client. */
export const revisionQuestionSchema = z.object({
  id: z.string().min(1),
  question: z.string(),
  options: z.array(z.object({ label: z.string(), text: z.string() })),
  marks: z.number(),
});
export type RevisionQuestion = z.infer<typeof revisionQuestionSchema>;

export type CheckResult = {
  isCorrect: boolean;
  correctAnswer: string;
  explanation: string;
  marksAwarded: number;
  marksMax: number;
};

/** Raw manifest slot/question access — these objects DO carry `evaluation`. */
function slotsFor(manifest: any, slideId: string): any[] {
  const pool = manifest?.question_pools?.[slideId];
  return Array.isArray(pool) ? pool : [];
}

/**
 * One random question per slot, projected to the public (key-free) shape.
 * Returns an empty list when the slide has no question_pools (e.g. synthetic
 * fixtures) — never throws on "no questions".
 */
export async function getQuestions(
  tx: PgTransaction<any, any, any>,
  args: { subTopicId: string },
): Promise<{ slideId: string; questions: RevisionQuestion[] }> {
  const { slideId, manifest } = await resolveSlideContext(tx, args.subTopicId);

  const questions: RevisionQuestion[] = [];
  for (const slot of slotsFor(manifest, slideId)) {
    const pool = Array.isArray(slot?.questions) ? slot.questions : [];
    if (pool.length === 0) continue;
    const chosen = pool[Math.floor(Math.random() * pool.length)];
    // ALLOWLIST projection — evaluation is structurally excluded, then zod-
    // parsed as a second guard so no answer key can ride along.
    questions.push(
      revisionQuestionSchema.parse({
        id: chosen?.id,
        question: chosen?.question ?? "",
        options: Array.isArray(chosen?.options)
          ? chosen.options.map((o: any) => ({
              label: String(o?.label ?? ""),
              text: String(o?.text ?? ""),
            }))
          : [],
        marks: typeof chosen?.marks === "number" ? chosen.marks : 1,
      }),
    );
  }

  return { slideId, questions };
}

/** event_log eventType for a recorded Quick Check (G1 typed firehose). */
export const MCQ_CHECK_EVENT = "mcq_check";

/**
 * Grade one answer server-side. Scoped to THIS sub_topic's slide pool (D-A-2):
 * subTopicId → slideId is server-resolved + RLS-gated, so we don't trust a
 * client-supplied section. The answer key never leaves the server until the
 * verdict is returned here.
 *
 * Record-only evidence (D-A-1 closure, D-MCQ-1): after grading, write ONE
 * event_log row (`mcq_check`) capturing which question, the chosen option, the
 * verdict, marks and time. NO LLM, NO observation, NO mastery move — G4 scopes
 * MCQ as special-purpose (a single letter choice is not the worked answer the
 * two-axis Stage-1 ladders read). The write rides the same board-scoped tx as
 * the grade → atomic + RLS-consistent; the answer key is logged SERVER-SIDE only
 * (event_log is never shipped to the client). Best-effort would defeat the
 * point (we want the evidence), so a failed insert fails the mutation honestly.
 * No dedupe: re-checking (e.g. a re-rolled question on slide reload) is a new
 * event — the firehose records each check (G1).
 */
export async function checkAnswer(
  tx: PgTransaction<any, any, any>,
  args: {
    subTopicId: string;
    questionId: string;
    answer: string;
    boardId: string;
    appUserId: string;
    timeMs?: number | null;
  },
): Promise<CheckResult> {
  const { slideId, manifest } = await resolveSlideContext(tx, args.subTopicId);

  let found: any = null;
  for (const slot of slotsFor(manifest, slideId)) {
    for (const q of Array.isArray(slot?.questions) ? slot.questions : []) {
      if (q?.id === args.questionId) {
        found = q;
        break;
      }
    }
    if (found) break;
  }
  if (!found) throw new QuestionNotFoundError(args.questionId);

  const correctAnswer = String(found?.evaluation?.correct_answer ?? "");
  const explanation = String(found?.evaluation?.explanation ?? "");
  const marksMax = typeof found?.marks === "number" ? found.marks : 1;
  const isCorrect = args.answer === correctAnswer;
  const marksAwarded = isCorrect ? marksMax : 0;

  await tx.insert(eventLog).values({
    boardId: args.boardId,
    eventType: MCQ_CHECK_EVENT,
    studentId: args.appUserId,
    subTopicId: args.subTopicId,
    payload: {
      slideId,
      slideQuestionId: args.questionId,
      chosen: args.answer,
      correctAnswer,
      isCorrect,
      marksAwarded,
      marksMax,
      timeMs: args.timeMs ?? null,
    },
  });

  return {
    isCorrect,
    correctAnswer,
    explanation,
    marksAwarded,
    marksMax,
  };
}

// ── Revision landing (Slice REV-LAND) ──────────────────────────────────────
//
// The entry surface before the slide view: a templated greeting + suggestion
// chips driven by DETERMINISTIC scheduler/plan/mastery data — no AI call on
// landing (locked in brainstorm; the intelligence comes from the scheduler).
//
//  - D-REV-1: last-visited persistence = `revision_visit` rows in event_log
//    (durable, cross-device; NOT localStorage — anti-pattern "FE-only ephemeral
//    state"). The FE fires recordVisit when a slide resolves; getLandingState
//    reads the newest visit back. event_log's generic (event_type, payload)
//    shape means NO migration — same pattern as mcq_check.
//  - D-REV-2: the student reads their OWN due queue via computeDueQueue (the
//    tutor wall stays on getDueQueue). DueItem's raw 1–5 levels never reach the
//    student (D-INS-1): the landing projection is an ALLOWLIST of name/chapter/
//    overdue only.
//  - One aggregate read: the FE calls getLandingState once per landing, not
//    four endpoints. Everything derived is recomputed here (D-PACE-5 spirit).

/** event_log eventType for a recorded slide visit (G1 typed firehose). */
export const REVISION_VISIT_EVENT = "revision_visit";

/**
 * Record that the caller opened a slide. Fire-and-forget from the FE (a lost
 * visit only costs resume freshness). The explicit sub_topic visibility check
 * matters: FK validation BYPASSES RLS, so without it an insert referencing
 * another board's sub_topic id would succeed and become an existence oracle.
 */
export async function recordVisit(
  tx: PgTransaction<any, any, any>,
  args: { boardId: string; appUserId: string; subTopicId: string },
): Promise<void> {
  const [st] = await tx
    .select({ id: subTopic.id })
    .from(subTopic)
    .where(eq(subTopic.id, args.subTopicId))
    .limit(1);
  if (!st) throw new SlideNotFoundError(args.subTopicId);

  await tx.insert(eventLog).values({
    boardId: args.boardId,
    eventType: REVISION_VISIT_EVENT,
    studentId: args.appUserId,
    subTopicId: args.subTopicId,
    payload: {},
  });
}

export type LandingLastVisited = {
  subTopicId: string;
  subTopicName: string;
  topicName: string;
  chapterId: string;
  chapterName: string;
  visitedAt: Date;
};

/** Student-safe due projection (D-REV-2): NO mastery levels, ever. */
export type LandingDueTop = {
  subTopicId: string;
  subTopicName: string;
  chapterName: string;
  overdueDays: number;
};

export type LandingPlan = {
  subjectId: string;
  subjectName: string;
  /** The chapter whose projected window contains today; falls back to the
   *  first non-completed chapter when the student is ahead/behind the plan. */
  currentChapter: { chapterId: string; name: string } | null;
  /** Highest preparedness roll-up among assessed chapters (null = none assessed). */
  strongestChapter: { chapterId: string; name: string; label: PreparednessLabel } | null;
};

export type LandingState = {
  /** True until the student's first recorded visit — drives the one-time theatre. */
  firstTime: boolean;
  lastVisited: LandingLastVisited | null;
  /** chapterId → last-visited sub_topic in that chapter (chapter-grid resume). */
  lastVisitedByChapter: Record<string, string>;
  dueTop: LandingDueTop | null;
  /** null = no set-up pace plan (the landing offers "Set my plan"). */
  plan: LandingPlan | null;
};

/**
 * Everything the landing's template tree needs, in one board-scoped read.
 * `asOf` is injectable purely so probes can pin the clock (pace/scheduler
 * pattern); real callers omit it.
 */
export async function getLandingState(
  tx: PgTransaction<any, any, any>,
  args: { self: ChildSummary; asOf?: Date },
): Promise<LandingState> {
  const appUserId = args.self.studentId;
  const asOf = args.asOf ?? new Date();
  const todayIso = asOf.toISOString().slice(0, 10);

  // firstTime — from the RAW event table, NOT the joined read below: a visit
  // whose sub_topic was since unpublished must still count as "has visited"
  // (a veteran student must never get the first-time theatre back).
  const [anyVisit] = await tx
    .select({ id: eventLog.id })
    .from(eventLog)
    .where(
      and(
        eq(eventLog.studentId, appUserId),
        eq(eventLog.eventType, REVISION_VISIT_EVENT),
      ),
    )
    .limit(1);
  const firstTime = !anyVisit;

  // Newest visit PER CHAPTER in one pass (DISTINCT ON) — powers both the
  // global resume chip (row with the max visitedAt) and the chapter grid's
  // per-chapter entry point. Inner joins re-resolve the spine under RLS, so a
  // cross-board or unpublished sub_topic simply drops out.
  const visitRows = await tx
    .selectDistinctOn([chapter.id], {
      chapterId: chapter.id,
      chapterName: chapter.name,
      topicName: topic.name,
      subTopicId: subTopic.id,
      subTopicName: subTopic.name,
      visitedAt: eventLog.createdAt,
    })
    .from(eventLog)
    .innerJoin(subTopic, eq(eventLog.subTopicId, subTopic.id))
    .innerJoin(topic, eq(subTopic.topicId, topic.id))
    .innerJoin(chapter, eq(topic.chapterId, chapter.id))
    .where(
      and(
        eq(eventLog.studentId, appUserId),
        eq(eventLog.eventType, REVISION_VISIT_EVENT),
      ),
    )
    .orderBy(chapter.id, desc(eventLog.createdAt));

  let lastVisited: LandingLastVisited | null = null;
  const lastVisitedByChapter: Record<string, string> = {};
  for (const r of visitRows) {
    lastVisitedByChapter[r.chapterId] = r.subTopicId;
    if (!lastVisited || r.visitedAt > lastVisited.visitedAt) lastVisited = r;
  }

  // dueTop — the single most-overdue item across every subject, projected to
  // the student-safe shape (D-REV-2: levels stripped).
  let dueTop: LandingDueTop | null = null;
  for (const group of await computeDueQueue(tx, { studentId: appUserId, asOf })) {
    for (const it of group.items) {
      if (!dueTop || it.overdueDays > dueTop.overdueDays) {
        dueTop = {
          subTopicId: it.subTopicId,
          subTopicName: it.subTopicName,
          chapterName: it.chapterName,
          overdueDays: it.overdueDays,
        };
      }
    }
  }

  // plan — the caller's most recently touched SET-UP pace plan (one subject at
  // a time on this board today; updatedAt breaks ties if that changes).
  let plan: LandingPlan | null = null;
  const [planRow] = await tx
    .select({ subjectId: pacePlan.subjectId })
    .from(pacePlan)
    .where(
      and(eq(pacePlan.appUserId, appUserId), isNotNull(pacePlan.setupCompletedAt)),
    )
    .orderBy(desc(pacePlan.updatedAt))
    .limit(1);
  if (planRow) {
    const view = await getPlan(tx, {
      self: args.self,
      subjectId: planRow.subjectId,
      today: todayIso,
    });
    if (!view.needsSetup) {
      const open = view.chapters.filter((c) => !c.completed);
      const current =
        open.find(
          (c) =>
            c.projectedStartDate! <= todayIso && todayIso < c.projectedEndDate!,
        ) ??
        open[0] ??
        null;
      let strongest: LandingPlan["strongestChapter"] = null;
      let strongestValue = -Infinity;
      for (const c of view.chapters) {
        const p = c.preparedness;
        if (!p || p.value == null) continue;
        if (p.value > strongestValue) {
          strongestValue = p.value;
          strongest = { chapterId: c.chapterId, name: c.name, label: p.label };
        }
      }
      plan = {
        subjectId: view.subject.id,
        subjectName: view.subject.name,
        currentChapter: current
          ? { chapterId: current.chapterId, name: current.name }
          : null,
        strongestChapter: strongest,
      };
    }
  }

  return { firstTime, lastVisited, lastVisitedByChapter, dueTop, plan };
}
