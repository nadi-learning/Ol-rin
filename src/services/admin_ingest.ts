/**
 * admin_ingest — Slice QA3-b: the admin topics.md ingestion service (D-QA3-6).
 *
 * The SOLE prod write-path for a chapter's curriculum spine + raw topics.md.
 * An admin uploads a chapter's `topics.md` (rich human PROSE, variable shape) →
 * `extractTopicsMd` runs ONE structured LLM call to pull the normalized SKELETON
 * (topics → sub_topics → learning_objectives[axis,code,description] + thresholds,
 * D-QA3-b-2) → the admin reviews the preview → `commitTopicsMd` upserts the spine
 * and stores the raw blob verbatim in `chapter.metadata.topicsMd` (D-QA3-5).
 *
 * Decisions realized here:
 *  - D-QA3-b-1  LLM structured-extraction (prose is too variable for a determinist
 *               parser) + admin-review-before-commit (the FE preview is the gate).
 *  - D-QA3-b-2  normalize the SKELETON only; misconceptions/palette/narrative stay
 *               in the raw blob (the authoring worker reads the blob, D-QA3-5).
 *  - D-QA3-b-3  refuse-if-dependent: commit REJECTS if the chapter's sub_topics
 *               already carry student/authoring data (mastery_state / observation /
 *               question / practice_session) — never orphan real rows. Otherwise
 *               upsert-by-slug (idempotent), like seed_topic_registry.
 *  - O8         validation: >=1 sub_topic · every LO axis-tagged · >=1 LO/sub_topic
 *               · thresholds optional · reject malformed with a clear message.
 *
 * The topics.md may have NO explicit topic level (the coord-geo example is
 * chapter→sub-topics); the extractor synthesizes topics so the fixed
 * chapter→topic→sub_topic spine is always satisfiable.
 */
import { and, eq, inArray, sql } from "drizzle-orm";
import type { PgTransaction } from "drizzle-orm/pg-core";
import { Type } from "@google/genai";
import { z } from "zod";
import {
  chapter,
  learningObjective,
  masteryState,
  observation,
  practiceSession,
  question,
  subject,
  subTopic,
  topic,
} from "@b2c/kernel/schema";
import { isAdminEmail } from "@b2c/kernel/contracts";
import { geminiJson } from "./ai/gemini";

type Tx = PgTransaction<any, any, any>;

// ───────────────────── chapter picker (read) ─────────────────────

export type AdminChapter = {
  chapterId: string;
  name: string;
  subjectName: string;
  grade: string;
  hasTopicsMd: boolean;
};

/** Board-scoped (RLS via ctx.tx) chapter list for the admin ingest picker. */
export async function listChaptersForAdmin(tx: Tx): Promise<AdminChapter[]> {
  const rows = await tx
    .select({
      chapterId: chapter.id,
      name: chapter.name,
      ordinal: chapter.ordinal,
      subjectName: subject.name,
      grade: subject.grade,
      metadata: chapter.metadata,
    })
    .from(chapter)
    .innerJoin(subject, eq(chapter.subjectId, subject.id))
    .orderBy(subject.name, chapter.ordinal);
  return rows.map((r) => ({
    chapterId: r.chapterId,
    name: r.name,
    subjectName: r.subjectName,
    grade: r.grade,
    hasTopicsMd: Boolean((r.metadata as Record<string, unknown> | null)?.topicsMd),
  }));
}

// ───────────────── subject + chapter authoring (write) ─────────────────
// Slice ADM-CH — the admin can seed a board's curriculum spine before any
// topics.md ingest: create/pick a subject, then append chapters to it. Every
// call is board-scoped via ctx.tx (RLS) + ctx.board.id; the board itself is
// chosen by the FE board switcher (x-board), NOT inferred. Chapters made here
// are empty shells (no topics.md, no topic rows) — the ingest tool fills each
// one's spine afterwards. Idempotent by slug so a re-submit never dupes.

export type AdminSubject = {
  subjectId: string;
  name: string;
  grade: string;
  slug: string;
  chapterCount: number;
};

/** Board-scoped subjects (with chapter counts) for the add-chapter picker. */
export async function listSubjectsForAdmin(tx: Tx): Promise<AdminSubject[]> {
  const rows = await tx
    .select({
      subjectId: subject.id,
      name: subject.name,
      grade: subject.grade,
      slug: subject.slug,
      chapterCount: sql<number>`count(${chapter.id})::int`,
    })
    .from(subject)
    .leftJoin(chapter, eq(chapter.subjectId, subject.id))
    .groupBy(subject.id, subject.name, subject.grade, subject.slug)
    .orderBy(subject.name, subject.grade);
  return rows.map((r) => ({ ...r, chapterCount: Number(r.chapterCount) }));
}

/** Create (or return the existing) subject on this board. Idempotent by (board, slug, grade). */
export async function createSubjectForAdmin(
  tx: Tx,
  input: { boardId: string; name: string; grade: string },
): Promise<AdminSubject> {
  const name = input.name.trim();
  const slug = slugify(name);
  if (!slug) throw new AdminInputError("subject name must contain letters or digits");
  if (!input.grade.trim()) throw new AdminInputError("grade is required");
  const row = await getOrCreate(
    tx,
    subject,
    and(eq(subject.boardId, input.boardId), eq(subject.slug, slug), eq(subject.grade, input.grade)),
    { boardId: input.boardId, slug, name, grade: input.grade },
  );
  return { subjectId: row.id, name: row.name, grade: row.grade, slug: row.slug, chapterCount: 0 };
}

/**
 * Append chapters to a subject: each name → slug + the next ordinal (after the
 * subject's current max). Idempotent — a name whose slug already exists under
 * this subject is SKIPPED (not duped, not an error), so the whole submit is
 * safe to retry. Returns what was created vs skipped.
 */
export async function addChaptersForAdmin(
  tx: Tx,
  input: { boardId: string; subjectId: string; names: string[] },
): Promise<{ created: { chapterId: string; name: string }[]; skipped: string[] }> {
  // subject must be visible under THIS board (RLS scopes the read → cross-board
  // subjectId resolves to nothing and 404s, never leaks or writes off-board).
  const subj = (await tx.select().from(subject).where(eq(subject.id, input.subjectId)))[0];
  if (!subj) throw new SubjectNotFoundError(input.subjectId);

  const existing = await tx
    .select({ slug: chapter.slug, ordinal: chapter.ordinal })
    .from(chapter)
    .where(eq(chapter.subjectId, input.subjectId));
  const seen = new Set(existing.map((c) => c.slug));
  let ordinal = existing.reduce((m, c) => Math.max(m, c.ordinal), 0);

  const created: { chapterId: string; name: string }[] = [];
  const skipped: string[] = [];
  for (const rawName of input.names) {
    const name = rawName.trim();
    if (!name) continue; // blank line
    const slug = slugify(name);
    if (!slug || seen.has(slug)) {
      skipped.push(name);
      continue;
    }
    seen.add(slug);
    ordinal += 1;
    const [row] = await tx
      .insert(chapter)
      .values({ boardId: input.boardId, subjectId: input.subjectId, slug, name, ordinal })
      .returning({ id: chapter.id });
    created.push({ chapterId: row!.id, name });
  }
  return { created, skipped };
}

// ───────────────────────── errors ─────────────────────────

/** Bad admin input (empty name, blank grade, …) → BAD_REQUEST. */
export class AdminInputError extends Error {
  readonly code = "ADMIN_INPUT";
  constructor(message: string) {
    super(message);
    this.name = "AdminInputError";
  }
}

/** Subject not visible under this board → NOT_FOUND (RLS or wrong id). */
export class SubjectNotFoundError extends Error {
  readonly code = "SUBJECT_NOT_FOUND";
  constructor(subjectId: string) {
    super(`subject ${subjectId} not found in this board`);
    this.name = "SubjectNotFoundError";
  }
}

/** ROLE gate — the CHECK side (M11). adminProcedure calls this. */
export class AdminOnlyError extends Error {
  readonly code = "NOT_AN_ADMIN";
  constructor(role: string) {
    super(`role '${role}' is not an admin`);
    this.name = "AdminOnlyError";
  }
}
export function assertAdmin(role: string): void {
  if (role !== "admin") throw new AdminOnlyError(role);
}

/**
 * THE FULL ADMIN GATE (S124) — role AND email. `adminProcedure` calls this and
 * nothing else; `assertAdmin` above is now only half the rule and must never be
 * the last word on its own.
 *
 * 🔴 A NON-WHITELISTED ADMIN IS REPORTED AS `NOT_AN_ADMIN`, DELIBERATELY —
 * the SAME code an ordinary student gets. The two failures are indistinguishable
 * from outside on purpose: a distinct code (`EMAIL_NOT_ALLOWED`) would confirm
 * to whoever is probing that they hold a real admin row and only the address is
 * missing, which tells them exactly what to attack next. The cost is that a
 * genuinely misconfigured admin sees a generic refusal — accepted, because the
 * fix for that lives in ADMIN_EMAILS where a human can read it.
 *
 * Order matters only for clarity, not safety: both must pass.
 */
export function assertAdminAccess(role: string, email: string | null | undefined): void {
  assertAdmin(role);
  if (!isAdminEmail(email)) throw new AdminOnlyError(role);
}

/** The target chapter isn't visible under the caller's board (RLS) — or absent. */
export class ChapterNotFoundError extends Error {
  readonly code = "CHAPTER_NOT_FOUND";
  constructor(chapterId: string) {
    super(`chapter ${chapterId} not found in this board`);
    this.name = "ChapterNotFoundError";
  }
}

/** Extraction failed the O8 structural rules. Carries the human-readable reasons. */
export class TopicsMdInvalidError extends Error {
  readonly code = "TOPICS_MD_INVALID";
  constructor(readonly errors: string[]) {
    super(`topics.md invalid: ${errors.join("; ")}`);
    this.name = "TopicsMdInvalidError";
  }
}

/** refuse-if-dependent (D-QA3-b-3): the chapter's spine already carries data. */
export class ChapterHasDependentDataError extends Error {
  readonly code = "CHAPTER_HAS_DEPENDENT_DATA";
  constructor(readonly counts: { questions: number; mastery: number; observations: number; sessions: number }) {
    super(
      `chapter has dependent data (questions=${counts.questions}, mastery=${counts.mastery}, ` +
        `observations=${counts.observations}, sessions=${counts.sessions}) — re-ingest would orphan it`,
    );
    this.name = "ChapterHasDependentDataError";
  }
}

// ───────────────────── extraction shapes ─────────────────────

export const extractedLoSchema = z.object({
  axis: z.enum(["conceptual", "procedural"]),
  code: z.string().nullable(),
  description: z.string().min(1),
});
export const extractedSubTopicSchema = z.object({
  name: z.string().min(1),
  learningObjectives: z.array(extractedLoSchema),
});
export const extractedTopicSchema = z.object({
  name: z.string().min(1),
  subTopics: z.array(extractedSubTopicSchema),
});
export const extractedThresholdSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
});
export const extractedTopicsMdSchema = z.object({
  topics: z.array(extractedTopicSchema),
  thresholds: z.array(extractedThresholdSchema),
});
export type ExtractedTopicsMd = z.infer<typeof extractedTopicsMdSchema>;

// Gemini structured-output schema (mirrors the zod above; enum guarantees axis).
const geminiExtractSchema = {
  type: Type.OBJECT,
  properties: {
    topics: {
      type: Type.ARRAY,
      description: "the chapter's topics IN SOURCE ORDER; synthesize topics if the source is flat",
      items: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING, description: "topic name" },
          subTopics: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                name: { type: Type.STRING, description: "sub-topic name" },
                learningObjectives: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      axis: {
                        type: Type.STRING,
                        enum: ["conceptual", "procedural"],
                        description: "conceptual (C-codes / 'Conceptual LOs') or procedural (P-codes / 'Procedural LOs')",
                      },
                      code: {
                        type: Type.STRING,
                        nullable: true,
                        description: "the LO label if the source has one (e.g. 'C1', 'P3'); null otherwise",
                      },
                      description: { type: Type.STRING, description: "the LO text, verbatim-ish" },
                    },
                    required: ["axis", "description"],
                  },
                },
              },
              required: ["name", "learningObjectives"],
            },
          },
        },
        required: ["name", "subTopics"],
      },
    },
    thresholds: {
      type: Type.ARRAY,
      description: "ratified threshold concepts if the source lists any; else an empty array",
      items: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING },
          description: { type: Type.STRING },
        },
        required: ["name", "description"],
      },
    },
  },
  required: ["topics", "thresholds"],
};

const EXTRACT_SYSTEM = `You extract the STRUCTURAL SKELETON from a chapter's topics.md — a human-authored markdown breakdown (prose). Return ONLY the normalized structure the platform needs; the rich prose (narrative, misconceptions, question palette) is kept elsewhere, so DO NOT try to capture it.

Extract, in SOURCE ORDER:
- topics → sub_topics → learning objectives.
- Each learning objective has: axis ('conceptual' or 'procedural'), an optional code (the source's LO label like "C1"/"P3" — null if none), and its description text.

Rules:
- Map the source's "Conceptual LOs" (C-codes) to axis 'conceptual' and "Procedural LOs" (P-codes) to axis 'procedural'. EVERY learning objective must be axis-tagged.
- If the source has NO explicit topic grouping (goes straight chapter → sub-topics), SYNTHESIZE topics: group the sub-topics by pedagogical theme, or emit a single topic named after the chapter that holds all sub-topics. The output MUST have at least one topic and every sub-topic must sit under a topic.
- Do NOT invent learning objectives that aren't in the source. Skip misconceptions, question-kind/palette notes, and narrative prose — they are not part of the skeleton.
- Capture ratified threshold concepts into 'thresholds' if the source lists them; otherwise return an empty array.`;

/**
 * O8 validation — pure. Structural rules the skeleton must satisfy before commit.
 * (axis is enum-guaranteed by the schema; we still assert it for a hand-built
 * or edited payload arriving at commit.)
 */
export function validateExtracted(x: ExtractedTopicsMd): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  if (x.topics.length === 0) errors.push("no topics found");
  let subTopicCount = 0;
  for (const t of x.topics) {
    for (const s of t.subTopics) {
      subTopicCount++;
      if (s.learningObjectives.length === 0) {
        errors.push(`sub-topic "${s.name}" has no learning objectives`);
      }
      for (const lo of s.learningObjectives) {
        if (lo.axis !== "conceptual" && lo.axis !== "procedural") {
          errors.push(`learning objective under "${s.name}" is not axis-tagged conceptual|procedural`);
        }
      }
    }
  }
  if (subTopicCount === 0) errors.push("no sub-topics found");
  return { ok: errors.length === 0, errors };
}

/**
 * ONE structured LLM call: topics.md prose → normalized skeleton + a validation
 * verdict. Does NOT throw on invalid — returns the verdict so the FE can show the
 * reasons and gate the Confirm button (D-QA3-b-1, admin-review-before-commit).
 * Uncapped output (M28): a full-chapter skeleton is a large structured answer on a
 * gemini-3 thinking model, where maxOutputTokens bounds thinking + answer together.
 */
export async function extractTopicsMd(
  rawMd: string,
): Promise<{ extracted: ExtractedTopicsMd; validation: { ok: boolean; errors: string[] } }> {
  const raw = await geminiJson<unknown>({
    label: `admin:extract-topics-md:${rawMd.length}chars`,
    systemInstruction: EXTRACT_SYSTEM,
    prompt: `Extract the skeleton from this topics.md. Return the structured JSON.\n\n---\n${rawMd}`,
    responseSchema: geminiExtractSchema as never,
    maxOutputTokens: null,
  });
  const extracted = extractedTopicsMdSchema.parse(raw);
  return { extracted, validation: validateExtracted(extracted) };
}

// ───────────────────────── commit ─────────────────────────

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
}

async function getOrCreate(tx: Tx, table: any, where: any, values: any) {
  const existing = (await tx.select().from(table).where(where))[0];
  if (existing) return existing;
  return (await tx.insert(table).values(values).returning())[0];
}

export interface CommitInput {
  boardId: string;
  chapterId: string;
  rawMd: string;
  extracted: ExtractedTopicsMd;
}

/**
 * Commit the reviewed skeleton (one tx): re-validate → refuse-if-dependent →
 * upsert the spine by slug → write the raw blob to chapter.metadata.topicsMd.
 * The tx is the caller's board-scoped ctx.tx (RLS already bound).
 */
export async function commitTopicsMd(
  tx: Tx,
  input: CommitInput,
): Promise<{ topics: number; subTopics: number; los: number }> {
  const { boardId, chapterId, rawMd, extracted } = input;

  // 1. chapter must be visible under this board (RLS scopes the read).
  const ch = (await tx.select().from(chapter).where(eq(chapter.id, chapterId)))[0];
  if (!ch) throw new ChapterNotFoundError(chapterId);

  // 2. re-validate (defense — the payload came back from the client, D-QA3-b-1).
  const v = validateExtracted(extracted);
  if (!v.ok) throw new TopicsMdInvalidError(v.errors);

  // 3. refuse-if-dependent (D-QA3-b-3): never orphan student/authoring rows.
  const existingSubTopics = await tx
    .select({ id: subTopic.id })
    .from(subTopic)
    .innerJoin(topic, eq(subTopic.topicId, topic.id))
    .where(eq(topic.chapterId, chapterId));
  const stIds = existingSubTopics.map((r) => r.id);
  if (stIds.length > 0) {
    const countIn = async (table: any) => {
      const [row] = await tx
        .select({ n: sql<number>`count(*)::int` })
        .from(table)
        .where(inArray(table.subTopicId, stIds));
      return row?.n ?? 0;
    };
    const counts = {
      questions: await countIn(question),
      mastery: await countIn(masteryState),
      observations: await countIn(observation),
      sessions: await countIn(practiceSession),
    };
    if (counts.questions + counts.mastery + counts.observations + counts.sessions > 0) {
      throw new ChapterHasDependentDataError(counts);
    }
  }

  // 4. upsert the spine by slug (idempotent) — topic → sub_topic → LO.
  let topicN = 0;
  let subN = 0;
  let loN = 0;
  for (let ti = 0; ti < extracted.topics.length; ti++) {
    const t = extracted.topics[ti]!;
    const tSlug = slugify(t.name);
    const topRow = await getOrCreate(
      tx,
      topic,
      and(eq(topic.chapterId, chapterId), eq(topic.slug, tSlug)),
      { boardId, chapterId, slug: tSlug, name: t.name, ordinal: ti + 1 },
    );
    // keep name/ordinal current on re-ingest
    await tx.update(topic).set({ name: t.name, ordinal: ti + 1 }).where(eq(topic.id, topRow.id));
    topicN++;

    for (let si = 0; si < t.subTopics.length; si++) {
      const s = t.subTopics[si]!;
      const sSlug = slugify(s.name);
      const stRow = await getOrCreate(
        tx,
        subTopic,
        and(eq(subTopic.topicId, topRow.id), eq(subTopic.slug, sSlug)),
        { boardId, topicId: topRow.id, slug: sSlug, name: s.name, ordinal: si + 1, contentSlideKey: null },
      );
      await tx.update(subTopic).set({ name: s.name, ordinal: si + 1 }).where(eq(subTopic.id, stRow.id));
      subN++;

      for (let li = 0; li < s.learningObjectives.length; li++) {
        const lo = s.learningObjectives[li]!;
        // stable code so re-ingest dedupes (source code, else a synthesized one).
        const code = lo.code ?? `auto-${lo.axis}-${li + 1}`;
        const loRow = await getOrCreate(
          tx,
          learningObjective,
          and(eq(learningObjective.subTopicId, stRow.id), eq(learningObjective.code, code)),
          { boardId, subTopicId: stRow.id, axis: lo.axis, code, description: lo.description },
        );
        await tx
          .update(learningObjective)
          .set({ axis: lo.axis, description: lo.description })
          .where(eq(learningObjective.id, loRow.id));
        loN++;
      }
    }
  }

  // 5. write the raw blob VERBATIM (D-QA3-5) + thresholds, merged into metadata.
  const existingMeta = (ch.metadata as Record<string, unknown> | null) ?? {};
  await tx
    .update(chapter)
    .set({ metadata: { ...existingMeta, topicsMd: rawMd, thresholds: extracted.thresholds } })
    .where(eq(chapter.id, chapterId));

  return { topics: topicN, subTopics: subN, los: loN };
}
