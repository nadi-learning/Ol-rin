/**
 * b2c spine — the one-way-door schema (rewrite/spine-schema.md, forks F1–F5).
 *
 * Conventions:
 *  - F1: every row has a surrogate uuid PK (gen_random_uuid). slug/name/ordinal
 *    are ATTRIBUTES, never keys — rename/reorder never breaks an FK.
 *  - Tenancy: every tenant-scoped table carries `board_id`; Postgres RLS keyed
 *    on the `app.board` session claim is the backstop (F5). The set of
 *    tenant-scoped tables is exported as TENANT_SCOPED_TABLES so migrate.ts
 *    applies RLS from one source of truth (no drift).
 *  - Enums modeled as `text` (+ zod enums in contracts.ts), NOT pg enums —
 *    sidesteps the "ADD VALUE then seed in one migration" trap (ai-build-miss M23).
 *  - State tables overwritten (current truth); log/history tables append-only.
 */
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  smallint,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

const id = () => uuid("id").primaryKey().defaultRandom();
const createdAt = () =>
  timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

// ───────────────────────── 1. Identity & tenancy ─────────────────────────

// Tenant. One row per board. NOT tenant-scoped (it IS the tenant).
export const board = pgTable("board", {
  id: id(),
  slug: text("slug").notNull().unique(), // 'cambridge' | 'cbse'
  name: text("name").notNull(),
  config: jsonb("config").notNull().default({}),
  createdAt: createdAt(),
});

// Account. Shared with Starkhorn (F3, Google OAuth). Board-agnostic; a user
// participates in boards via membership. NOT tenant-scoped.
export const appUser = pgTable("app_user", {
  id: id(),
  email: text("email").notNull().unique(),
  name: text("name"),
  createdAt: createdAt(),
});

export const membership = pgTable(
  "membership",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => appUser.id),
    boardId: uuid("board_id")
      .notNull()
      .references(() => board.id),
    role: text("role").notNull(), // 'student'|'tutor'|'parent'|'admin'
    createdAt: createdAt(),
  },
  (t) => [unique().on(t.userId, t.boardId, t.role)],
);

// Access gate — who may use a board before they have data.
export const whitelist = pgTable(
  "whitelist",
  {
    id: id(),
    boardId: uuid("board_id")
      .notNull()
      .references(() => board.id),
    email: text("email").notNull(),
    role: text("role").notNull(),
    invitedBy: uuid("invited_by").references(() => appUser.id),
    createdAt: createdAt(),
  },
  (t) => [unique().on(t.boardId, t.email)],
);

export const parentChild = pgTable(
  "parent_child",
  {
    id: id(),
    boardId: uuid("board_id")
      .notNull()
      .references(() => board.id),
    parentId: uuid("parent_id")
      .notNull()
      .references(() => appUser.id),
    studentId: uuid("student_id")
      .notNull()
      .references(() => appUser.id),
    createdAt: createdAt(),
  },
  (t) => [unique().on(t.parentId, t.studentId)],
);

export const tutorStudent = pgTable(
  "tutor_student",
  {
    id: id(),
    boardId: uuid("board_id")
      .notNull()
      .references(() => board.id),
    tutorId: uuid("tutor_id")
      .notNull()
      .references(() => appUser.id),
    studentId: uuid("student_id")
      .notNull()
      .references(() => appUser.id),
    createdAt: createdAt(),
  },
  (t) => [unique().on(t.boardId, t.tutorId, t.studentId)],
);

// ───────────────────────── 1b. Auth (Better Auth) ─────────────────────────
// Vanilla Better Auth tables (ported from Starkhorn nadi-backend), GLOBAL —
// NOT tenant-scoped (identity is board-agnostic; board access is in membership).
// Better Auth owns these; b2c does not write them directly. The link to the
// spine is by EMAIL: on login we resolve/upsert app_user by users.email
// (decision F3-B / Option B). usePlural:true → plural table + schema-map keys.
// generateId:false → Postgres generates the uuid PK (BA's CUID string would be
// rejected by a uuid column). JS property names MUST match BA's canonical field
// names (emailVerified, userId, expiresAt, …) — that's how the adapter maps.

export const users = pgTable("users", {
  id: id(),
  email: text("email").notNull().unique(),
  name: text("name"),
  image: text("image"),
  emailVerified: boolean("email_verified").notNull().default(false),
  createdAt: createdAt(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const sessions = pgTable("sessions", {
  id: id(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  createdAt: createdAt(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const accounts = pgTable(
  "accounts",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    password: text("password"),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", {
      withTimezone: true,
    }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", {
      withTimezone: true,
    }),
    scope: text("scope"),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [unique().on(t.providerId, t.accountId)],
);

export const verifications = pgTable("verifications", {
  id: id(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: createdAt(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ──────────────────── 2. Curriculum spine (the one-way door) ────────────────────

export const subject = pgTable(
  "subject",
  {
    id: id(),
    boardId: uuid("board_id")
      .notNull()
      .references(() => board.id),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    grade: text("grade").notNull(), // 'IGCSE' | 'Class_9' | 'Class_10' | 'Grade8'
    createdAt: createdAt(),
  },
  (t) => [unique().on(t.boardId, t.slug, t.grade)],
);

export const chapter = pgTable(
  "chapter",
  {
    id: id(),
    boardId: uuid("board_id")
      .notNull()
      .references(() => board.id),
    subjectId: uuid("subject_id")
      .notNull()
      .references(() => subject.id),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    ordinal: integer("ordinal").notNull(), // reorder-safe: attribute, not a key
    // Cross-system content key (D-C1-1): the Starkhorn manifest `module_id`
    // (= chapters.chapter_key, e.g. "ch4_motion"). Bridges the rewrite's human
    // slug to Starkhorn's stable content key; ingestion resolves the target
    // chapter by this. Nullable — set only for chapters with pulled content.
    contentModuleKey: text("content_module_key"),
    // Question-Authoring v3 (D-QA3-5): the raw human-authored `topics.md`,
    // stored VERBATIM at chapter grain (under key `topicsMd`). The normalized
    // spine rows (topic/sub_topic/learning_objective) are the platform/UI read
    // path; every LLM-facing use (authoring worker, grounding) reads THIS raw
    // blob, not the reassembled rows. jsonb (not text) leaves room for other
    // chapter-level metadata. Nullable — set only via the admin ingest tool
    // (D-QA3-6, the sole prod write path); existing chapters stay null.
    metadata: jsonb("metadata"),
    createdAt: createdAt(),
  },
  (t) => [unique().on(t.subjectId, t.slug)],
);

export const topic = pgTable(
  "topic",
  {
    id: id(),
    boardId: uuid("board_id")
      .notNull()
      .references(() => board.id),
    chapterId: uuid("chapter_id")
      .notNull()
      .references(() => chapter.id),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    ordinal: integer("ordinal").notNull(),
    thresholds: jsonb("thresholds"),
    createdAt: createdAt(),
  },
  (t) => [unique().on(t.chapterId, t.slug)],
);

// THE stable spine node — sub_topic_id is the system-wide key.
export const subTopic = pgTable(
  "sub_topic",
  {
    id: id(),
    boardId: uuid("board_id")
      .notNull()
      .references(() => board.id),
    topicId: uuid("topic_id")
      .notNull()
      .references(() => topic.id),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    ordinal: integer("ordinal").notNull(),
    thresholds: jsonb("thresholds"),
    // Cross-system content key (D-C1-1): the Starkhorn manifest `slideId`
    // (e.g. "t1-1") this sub_topic renders. The manifest has NO sub_topic level
    // (module→section→slide); the slideId encodes the sub_topic, so the rewrite
    // declares the sub_topic→slideId map here. getSlide resolves the slide via
    // this key. Nullable — set only for sub_topics with pulled content.
    contentSlideKey: text("content_slide_key"),
    createdAt: createdAt(),
  },
  (t) => [unique().on(t.topicId, t.slug)],
);

// LOs split by axis. Context for the assessor, never a per-LO scoreboard.
export const learningObjective = pgTable("learning_objective", {
  id: id(),
  boardId: uuid("board_id")
    .notNull()
    .references(() => board.id),
  subTopicId: uuid("sub_topic_id")
    .notNull()
    .references(() => subTopic.id),
  axis: text("axis").notNull(), // 'conceptual'|'procedural'
  code: text("code"),
  description: text("description").notNull(),
  createdAt: createdAt(),
});

// ───────── 4. Evidence & event stores (defined before mastery for FK order) ─────────

// event_log — human-judgment events + low-frequency system milestones (G1).
export const eventLog = pgTable("event_log", {
  id: id(),
  boardId: uuid("board_id")
    .notNull()
    .references(() => board.id),
  eventType: text("event_type").notNull(),
  studentId: uuid("student_id").references(() => appUser.id),
  tutorId: uuid("tutor_id").references(() => appUser.id),
  subTopicId: uuid("sub_topic_id").references(() => subTopic.id),
  before: jsonb("before"),
  after: jsonb("after"),
  reason: text("reason"),
  payload: jsonb("payload").notNull().default({}),
  createdAt: createdAt(),
});

// transcript — big text blobs (audit). Referenced by id from observation/event.
export const transcript = pgTable("transcript", {
  id: id(),
  boardId: uuid("board_id")
    .notNull()
    .references(() => board.id),
  studentId: uuid("student_id").references(() => appUser.id),
  subTopicId: uuid("sub_topic_id").references(() => subTopic.id),
  kind: text("kind").notNull(), // 'stage2' | 'teachback'
  body: jsonb("body").notNull(),
  meta: jsonb("meta").notNull().default({}),
  createdAt: createdAt(),
});

// observation — machine per-answer reads (the firehose). One row per axis per answer.
export const observation = pgTable(
  "observation",
  {
    id: id(),
    boardId: uuid("board_id")
      .notNull()
      .references(() => board.id),
    studentId: uuid("student_id")
      .notNull()
      .references(() => appUser.id),
    subTopicId: uuid("sub_topic_id")
      .notNull()
      .references(() => subTopic.id),
    questionId: uuid("question_id"), // references question(id) in the leaf pass; null for teach-back
    // D-AI1-1: the specific attempt this read scored. Nullable — teach-back
    // observations have no attempt. Gives Stage-1 idempotency (dedupe by
    // attempt_id + axis) + Stage-2 traceability back to the raw answer.
    attemptId: uuid("attempt_id").references(() => attempt.id),
    axis: text("axis").notNull(), // 'conceptual'|'procedural'
    // The MACHINE's read. IMMUTABLE — a tutor correction never overwrites it
    // (see tutorLevel below). Stage-1's original call, right or wrong, is the
    // half of the training pair we can't reconstruct later.
    observationLevel: smallint("observation_level").notNull(),
    reasoning: text("reasoning").notNull(),
    signals: jsonb("signals").notNull().default({}),
    calibrationFlag: text("calibration_flag"), // null | 'over' | 'under'
    pedagogicalComment: text("pedagogical_comment"),
    source: text("source").notNull(), // 'stage1_scorer' | 'teachback'
    transcriptId: uuid("transcript_id").references(() => transcript.id),
    // ── Tutor correction of THIS read (assessment.md §6: "adjust an observation
    // level … with a reason"). Observations are the DURABLE evidence every future
    // Stage-2 recounts from, so a Stage-1 misread the tutor can see but not correct
    // would keep corrupting counts forever.
    //
    // Layered, NOT overwritten: the EFFECTIVE level everything counts from is
    // `tutorLevel ?? observationLevel`, while `observationLevel` keeps the machine's
    // original. That pair — what the AI said, what the human said, and why — IS the
    // labeled judgment the data engine exists to collect (Polaris frame 4);
    // overwriting would fix the count and destroy the label.
    tutorLevel: smallint("tutor_level"), // null = not overridden
    overrideReason: text("override_reason"),
    overriddenBy: uuid("overridden_by").references(() => appUser.id),
    overriddenAt: timestamp("overridden_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    check(
      "observation_level_range",
      sql`${t.observationLevel} between 1 and 5`,
    ),
    check("observation_tutor_level_range", sql`${t.tutorLevel} between 1 and 5`),
  ],
);

// cross_concept_flag — "they ran the target procedure fine but stumbled on a
// prerequisite from ANOTHER concept" (assessment.md §2 procedural Step 4).
//
// The rule that creates these: such a slip must NOT lower the rung of the sub-topic
// being assessed — the student did that procedure well. Instead Stage-1 emits a note
// naming the other skill, and §6 carries it out "as evidence for that other concept."
// Before ASSESS-FIX-4 that note was written into observation.signals, shown once in a
// draft, and never seen again — it died against the WRONG sub-topic.
//
// It is deliberately NOT an `observation`: Stage-1 never read the other sub-topic's
// LOs, so the note carries NO rung. Materialising it as a scored observation would
// mean inventing a level from zero evidence — the exact thing ASSESS-FIX-1 removed.
// It counts toward nothing; it is a signal for the human.
//
// v1 routes to the STUDENT (an open worklist, tagged with where it was seen), not to
// a resolved target sub_topic_id — that would need the AI to guess an id from free
// text. Adding a nullable `to_sub_topic_id` later is a trivial migration if the flat
// list proves too coarse.
export const crossConceptFlag = pgTable(
  "cross_concept_flag",
  {
    id: id(),
    boardId: uuid("board_id")
      .notNull()
      .references(() => board.id),
    studentId: uuid("student_id")
      .notNull()
      .references(() => appUser.id),
    // Where the student was working when the other skill broke.
    fromSubTopicId: uuid("from_sub_topic_id")
      .notNull()
      .references(() => subTopic.id),
    note: text("note").notNull(), // "procedural issue in <other skill> — <what broke>"
    // The read that raised it. UNIQUE → re-finalizing a sub-topic can't duplicate flags.
    sourceObservationId: uuid("source_observation_id")
      .notNull()
      .references(() => observation.id),
    addressedAt: timestamp("addressed_at", { withTimezone: true }), // null = open
    addressedBy: uuid("addressed_by").references(() => appUser.id),
    createdAt: createdAt(),
  },
  (t) => [unique().on(t.sourceObservationId)],
);

// ───────────────────────── 3. Mastery (four-field model) ─────────────────────────

// Live working memory. ONE row per (student × sub_topic). Overwritten each Stage-2 finalize.
export const masteryState = pgTable(
  "mastery_state",
  {
    id: id(),
    boardId: uuid("board_id")
      .notNull()
      .references(() => board.id),
    studentId: uuid("student_id")
      .notNull()
      .references(() => appUser.id),
    subTopicId: uuid("sub_topic_id")
      .notNull()
      .references(() => subTopic.id),
    // NULL = NOT YET OBSERVED on this axis — never "level 1". An item that
    // couldn't expose an axis is a coverage gap, not weakness (assessment.md §2's
    // bound, §4's "don't guess — hold"). Stage-2 writes null rather than invent a
    // level it has no evidence for; a null only ever becomes a number, never back.
    // (The range CHECK still guards real values — NULL passes a CHECK in Postgres.)
    conceptualLevel: smallint("conceptual_level"),
    proceduralLevel: smallint("procedural_level"),
    description: text("description").notNull(), // dense blob, USER-VISIBLE
    log: text("log").notNull(), // agent working notes, INTERNAL
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique().on(t.studentId, t.subTopicId),
    check(
      "mastery_state_levels_range",
      sql`${t.conceptualLevel} between 1 and 5 and ${t.proceduralLevel} between 1 and 5`,
    ),
  ],
);

// Append snapshot on every overwrite. Enables re-baselining + rollback.
export const masteryHistory = pgTable("mastery_history", {
  id: id(),
  boardId: uuid("board_id")
    .notNull()
    .references(() => board.id),
  studentId: uuid("student_id")
    .notNull()
    .references(() => appUser.id),
  subTopicId: uuid("sub_topic_id")
    .notNull()
    .references(() => subTopic.id),
  conceptualLevel: smallint("conceptual_level"), // null = not yet observed (see mastery_state)
  proceduralLevel: smallint("procedural_level"),
  description: text("description").notNull(),
  log: text("log").notNull(),
  sourceEventId: uuid("source_event_id").references(() => eventLog.id),
  snapshotAt: timestamp("snapshot_at", { withTimezone: true }).notNull(),
});

// ───────────────────────── 5. Scheduling store ─────────────────────────

export const schedulingState = pgTable(
  "scheduling_state",
  {
    id: id(),
    boardId: uuid("board_id")
      .notNull()
      .references(() => board.id),
    studentId: uuid("student_id")
      .notNull()
      .references(() => appUser.id),
    subTopicId: uuid("sub_topic_id")
      .notNull()
      .references(() => subTopic.id),
    taughtAt: timestamp("taught_at", { withTimezone: true }), // null = not yet in spiral
    // CLIMB is the only stored date — it needs Stage-2's judgment (which level is
    // being climbed, which observations qualified). RETENTION is deliberately NOT
    // stored (ASSESS-FIX-3): it is pure arithmetic off the procedural level
    // (RETENTION_LADDER_DAYS) and the scheduler derives it on read. A stored copy
    // had exactly one possible future — going stale (it already had; D-SCH-1).
    climbNextDue: date("climb_next_due"),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [unique().on(t.studentId, t.subTopicId)],
);

// ───────────────────── 6. Content versioning + fork-on-start ─────────────────────

// Canonical content item (shared, reusable). current_version_id points at the
// live published version. NOTE: current_version_id is a plain uuid (NOT a
// drizzle FK) to break the content_unit ↔ content_version reference cycle;
// integrity is enforced in app code. content_version.content_unit_id is the
// real FK direction.
export const contentUnit = pgTable("content_unit", {
  id: id(),
  boardId: uuid("board_id")
    .notNull()
    .references(() => board.id),
  type: text("type").notNull(), // 'slide_module'|'narrative'|'topics_md'|'lo_config'|'question'
  // A content_unit anchors at whatever grain it's authored at (D-S2-1):
  //  - chapter-grained (slide_module): chapter_id set, sub_topic_id null
  //  - leaf-grained   (question/narrative): sub_topic_id set
  // chapter_id gives a chapter-level module an indexed path back to its chapter
  // so S3 can resolve sub_topic → chapter → module (the spine's "chapter-level
  // content" language presupposes this anchor; the original DDL lacked it).
  chapterId: uuid("chapter_id").references(() => chapter.id), // null for leaf-grained content
  subTopicId: uuid("sub_topic_id").references(() => subTopic.id), // null for chapter-level (e.g. slide_module)
  currentVersionId: uuid("current_version_id"), // -> content_version.id (app-enforced; cycle break)
  needsReview: boolean("needs_review").notNull().default(false), // G7 staleness flag (not a serving gate)
  source: text("source").notNull(), // 'starkhorn' | 'b2c_authoring'
  createdAt: createdAt(),
});

// Immutable published versions. Append-only; never updated in place. NOT
// tenant-scoped directly — reached only via content_unit (which is RLS'd).
export const contentVersion = pgTable(
  "content_version",
  {
    id: id(),
    contentUnitId: uuid("content_unit_id")
      .notNull()
      .references(() => contentUnit.id),
    versionNo: integer("version_no").notNull(),
    body: jsonb("body").notNull(), // published artifact: { bundle, manifest } for slide_module
    publishedAt: timestamp("published_at", { withTimezone: true }).notNull(),
  },
  (t) => [unique().on(t.contentUnitId, t.versionNo)],
);

// ─────────────────── 7. Practice capture (leaf pass — Slice L) ───────────────────
//
// The first leaf-pass tables. NO AI, NO mastery, NO tutor — pure evidence
// capture: a student answers a frozen set of subjective questions and every
// attempt persists. Stage-1 (the first AI slice) later reads `attempt` BLIND →
// writes `observation`. All three are tenant-scoped + RLS.

// Canonical, version-able practice question (the #13 authoring-agent stand-in —
// SEEDED for now, like the content seed was D-WS2). reference_answer/explanation
// /pedagogical_note are SERVER-SIDE — projected out on read, revealed only after
// an attempt is submitted (D-L-3, the MCQ-key discipline applied to subjective).
export const question = pgTable("question", {
  id: id(),
  boardId: uuid("board_id")
    .notNull()
    .references(() => board.id),
  subTopicId: uuid("sub_topic_id")
    .notNull()
    .references(() => subTopic.id),
  axis: text("axis").notNull(), // 'conceptual'|'procedural'|'both'
  kind: text("kind").notNull(), // 'subjective' (v0)
  stem: text("stem").notNull(),
  referenceAnswer: text("reference_answer").notNull(), // server-side; never shipped pre-submit
  explanation: text("explanation"),
  pedagogicalNote: text("pedagogical_note"), // internal; never shipped
  ordinal: integer("ordinal").notNull(),
  source: text("source").notNull(), // 'b2c_authoring' (seed stand-in)
  // Slice FIG-AUTH (D-FIG-1): draft lifecycle. 'approved' = live/servable to
  // students (the DEFAULT — every existing/seeded canonical row + the v1 save path
  // stays live, fault-isolated). 'draft' = authored-but-not-yet-approved: it has a
  // real id (so a figure can be rendered + previewed against it) but is INVISIBLE
  // to Practice/insights until the tutor approves it. Chat authoring inserts
  // 'draft'; approveDrafts flips it to 'approved' (the M11 enablement side).
  status: text("status").notNull().default("approved"), // 'draft' | 'approved'
  // Slice AUTH-v2: when set, this question is PRIVATE to one student (authored to
  // their weakness in a tutor↔AI chat). NULL = canonical/shared (every student
  // sees it, exactly as today). Practice delivery filters
  // `target_student_id IS NULL OR = caller` (practice.ts). Additive — existing
  // canonical rows stay null → the shared bank is fault-isolated. App-enforced
  // FK (nullable; → app_user.id).
  targetStudentId: uuid("target_student_id").references(() => appUser.id),
  // Slice AUTH-v2.1: optional figure SPEC for this question (Starkhorn's
  // QuestionImage shape { description, shows[], hides[], file? }). The AI authors
  // the spec (a matplotlib figure BRIEF); the rendered file ref lands in `file`
  // later when the render pipeline runs. NULL = no figure. Additive — existing
  // rows stay null.
  image: jsonb("image"),
  // Question-Authoring v3 (D-QA3-9): the method's V0-kept difficulty tag. Fed
  // as authoring context (coherence + dedup from the existing bank) and set by
  // the author; assessor/selection may read it later. text (not a pg enum) to
  // match the axis/kind/status convention + dodge the enum-seed-in-migration
  // hazard (M23). Nullable — existing/seeded rows stay valid.
  difficulty: text("difficulty"), // e.g. 'easy'|'medium'|'hard' (loose V0 tag)
  createdAt: createdAt(),
});

// The assigned set. question_ids[] is FROZEN + ordered at start (D-L-1: fork-on-
// start v0 = pin canonical ids, pin-not-copy, G6). NAMED practice_session — the
// plain `sessions` name is taken by Better Auth (D-L-4).
export const practiceSession = pgTable("practice_session", {
  id: id(),
  boardId: uuid("board_id")
    .notNull()
    .references(() => board.id),
  appUserId: uuid("app_user_id")
    .notNull()
    .references(() => appUser.id),
  subTopicId: uuid("sub_topic_id")
    .notNull()
    .references(() => subTopic.id),
  questionIds: uuid("question_ids").array().notNull(), // frozen ordered canonical ids
  currentIndex: integer("current_index").notNull().default(0),
  status: text("status").notNull().default("active"), // 'active'|'completed'
  origin: text("origin").notNull().default("self_serve"), // 'self_serve' | 'tutor_assigned'
  // Slice ASG: links a tutor-assigned execution back to its assignment (Option A).
  // Null for self-serve sessions. Additive — existing rows unaffected.
  assignmentId: uuid("assignment_id"), // FK → assignment.id (app-enforced; declared after assignment to avoid cycle)
  createdAt: createdAt(),
});

// The raw evidence row Stage-1 will read next slice. One row per submit OR skip:
// an answer carries answer_text/confidence/time_ms (skip_reason null); a skip
// carries skip_reason (the others null).
export const attempt = pgTable(
  "attempt",
  {
    id: id(),
    boardId: uuid("board_id")
      .notNull()
      .references(() => board.id),
    practiceSessionId: uuid("practice_session_id")
      .notNull()
      .references(() => practiceSession.id),
    questionId: uuid("question_id")
      .notNull()
      .references(() => question.id),
    appUserId: uuid("app_user_id")
      .notNull()
      .references(() => appUser.id),
    answerText: text("answer_text"), // null on skip
    confidence: smallint("confidence"), // 1–5, null on skip
    timeMs: integer("time_ms"), // null on skip
    skipReason: text("skip_reason"), // set on skip
    // Slice T1 — the student-facing immediate feedback on THIS answer (verdict +
    // prose + strengths/improvements; Fork B, NO numeric grade). null until
    // practice.getAnswerFeedback runs; computed once then cached here (idempotent,
    // refresh-safe). Separate from the blind Stage-1 `observation` pipeline — this
    // is the self-serve sandbox eval (G3), never touches mastery (D1 v0).
    feedback: jsonb("feedback"),
    submittedAt: timestamp("submitted_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    check(
      "attempt_confidence_range",
      sql`${t.confidence} is null or ${t.confidence} between 1 and 5`,
    ),
  ],
);

// The tutor's compose→assign unit (Slice ASG — closes the spiral due-queue loop,
// D-SCH-2's deferred half). ONE flow, two configs (intent §5):
//  - 'blocked'     — tutor picks sub_topics within one chapter (chapter_id set).
//  - 'interleaved' — system pre-fills from the due-queue's eligible set across a
//                    subject (subject_id set); the tutor edits before assigning.
// sub_topic_ids[] is the FROZEN composition (pin-not-copy, same discipline as
// D-L-1). Execution is per-sub_topic: each sub_topic the student works becomes a
// practice_session carrying assignment_id (Option A) — so attempt→question→
// sub_topic keeps per-sub_topic evidence clean for Stage-1/mastery.
export const assignment = pgTable("assignment", {
  id: id(),
  boardId: uuid("board_id")
    .notNull()
    .references(() => board.id),
  tutorId: uuid("tutor_id")
    .notNull()
    .references(() => appUser.id),
  studentId: uuid("student_id")
    .notNull()
    .references(() => appUser.id),
  mode: text("mode").notNull(), // 'blocked' | 'interleaved'
  subjectId: uuid("subject_id").references(() => subject.id), // interleaved scope
  chapterId: uuid("chapter_id").references(() => chapter.id), // blocked scope
  subTopicIds: uuid("sub_topic_ids").array().notNull(), // frozen ordered composition
  status: text("status").notNull().default("assigned"), // 'assigned' | 'completed'
  createdAt: createdAt(),
});

// Parent sign-off report (Slice Report-Signoff) — the deferred half of Polaris
// #4 (D-P-1). A tutor assembles a child's progress into a FROZEN snapshot, then
// signs it off → published to the parent. The whole semantic of sign-off is that
// the parent sees exactly what the tutor approved, not data that drifted after —
// so `snapshot` is an immutable jsonb of { child, metrics, mastery } captured at
// assemble time (mirrors the append-only immutable-version discipline). Re-
// assembling makes a NEW report. `log` is NEVER captured into the snapshot (the
// M11 projection boundary — the snapshot is built from the same read the parent
// surface uses, which selects `description` only). v0 = tutor-only sign-off;
// admin/founder approval is a separable layer (the `admin` role exists in the
// enum but has no surface yet).
export const report = pgTable("report", {
  id: id(),
  boardId: uuid("board_id")
    .notNull()
    .references(() => board.id),
  studentId: uuid("student_id")
    .notNull()
    .references(() => appUser.id),
  tutorId: uuid("tutor_id")
    .notNull()
    .references(() => appUser.id),
  status: text("status").notNull().default("draft"), // 'draft' | 'published'
  snapshot: jsonb("snapshot").notNull(), // frozen { child, metrics, mastery }
  tutorNote: text("tutor_note"), // tutor's free-text feedback, set at publish
  publishedAt: timestamp("published_at", { withTimezone: true }), // null until published
  createdAt: createdAt(),
});

// Tutor↔AI question-authoring conversation (Slice AUTH-v2). A tutor picks a
// student, opens a chat grounded in that student's two-axis mastery + Stage-1
// observations + activity, converses to shape intent, then authors questions to
// the student's weakness (a SEPARATE structured call — fork 4). `messages` is the
// full ChatMessage[] transcript (role/text/aiSessionId/vendorId/sessionFingerprint
// per turn — the vendor-resume + stitched-history machinery ported from
// Starkhorn's unit_chat). `vendor` is the per-thread lock (claude_cli | gemini_api,
// tutor-picked on the first turn). Tenant-scoped (board_id) + RLS.
export const authoringChat = pgTable("authoring_chat", {
  id: id(),
  boardId: uuid("board_id")
    .notNull()
    .references(() => board.id),
  tutorId: uuid("tutor_id")
    .notNull()
    .references(() => appUser.id),
  studentId: uuid("student_id")
    .notNull()
    .references(() => appUser.id),
  // Slice AUTH-v2.1: the chat is scoped to ONE chapter chosen upfront (chapter →
  // topic → sub_topic hierarchy preserved). proposeTarget resolves the sub_topic
  // from the conversation WITHIN this chapter's allowlist. Nullable (additive;
  // pre-v2.1 rows have none), but the v2.1 flow always sets it.
  chapterId: uuid("chapter_id").references(() => chapter.id),
  // Slice QA3-d: the mode + multi-chapter scope. `mode` is 'blocked' (one chapter,
  // chapter_id set) or 'interleaved' (grounded across several chapters, chapter_id
  // null). `chapterIds` is the selected chapter list — blocked writes [the one]
  // AND keeps chapter_id set; interleaved writes the N with chapter_id null. Both
  // nullable/text (M23 — no pg enum; assignment.mode precedent). Pre-QA3-d rows
  // have mode/chapterIds null → the effective-chapters helper falls back to
  // chapter_id, so legacy chats read as single-chapter blocked.
  mode: text("mode"), // 'blocked' | 'interleaved' | null (legacy)
  chapterIds: jsonb("chapter_ids"), // string[] of selected chapter ids
  subTopicId: uuid("sub_topic_id").references(() => subTopic.id), // resolved focus; set by proposeTarget
  vendor: text("vendor").notNull(), // per-thread lock: 'claude_cli' | 'gemini_api'
  messages: jsonb("messages").notNull().default([]), // ChatMessage[]
  createdAt: createdAt(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// Slice QA3-e: one row per SPAWNED authoring worker (D-QA3-8 — master + worker
// session persistence). The master chat (authoring_chat) orchestrates the tutor
// dialogue; when it authors, it spawns a FRESH scoped worker session for ONE
// sub_topic. This row is that spawn's audit/resume log: which chat + sub_topic,
// which vendor, the vendor session id (Claude only — Gemini is a stateless
// structured call, so ai_session_id null), the resume fingerprint, the scoped
// brief the worker was given, and a compact record of what it returned. Keyed to
// the master turn by chat_id. Tenant-scoped (board_id) + RLS.
export const authoringWorker = pgTable("authoring_worker", {
  id: id(),
  boardId: uuid("board_id")
    .notNull()
    .references(() => board.id),
  chatId: uuid("chat_id")
    .notNull()
    .references(() => authoringChat.id),
  subTopicId: uuid("sub_topic_id")
    .notNull()
    .references(() => subTopic.id),
  vendor: text("vendor").notNull(), // 'claude_cli' | 'gemini_api'
  aiSessionId: text("ai_session_id"), // Claude CLI session id (resume/audit); null for Gemini
  sessionFingerprint: text("session_fingerprint"), // resume guard (sha256 of the pack + slot)
  brief: text("brief").notNull(), // the scoped prompt the worker was given (audit + resume context)
  output: jsonb("output"), // compact record of the spawn's result: { draftIds: string[], count }
  createdAt: createdAt(),
});

// A RENDERED figure for a question (Slice IMG). The AI authors a figure SPEC on
// `question.image` (a matplotlib brief); the render pipeline turns that spec into
// a matplotlib script → PNG (via the nadi-pyrender sidecar) → this row + a
// local-FS file. Keyed (question_id, version) so a re-render bumps the version;
// the CURRENT image is the highest version. Verifier columns are filled by
// Stage-2 (vision check) and stay NULL until then (NULL verifier_label = the
// Starkhorn "PENDING" state — not yet verified). Tenant-scoped (board_id) + RLS.
export const questionImage = pgTable(
  "question_image",
  {
    id: id(),
    boardId: uuid("board_id")
      .notNull()
      .references(() => board.id),
    questionId: uuid("question_id")
      .notNull()
      .references(() => question.id),
    version: integer("version").notNull().default(1),
    // FS key `{questionId}/v{n}.png` (same shape a future R2 key would take —
    // storage is local-FS for v0, R2 deferred to deploy).
    storageKey: text("storage_key").notNull(),
    mime: text("mime").notNull().default("image/png"),
    spec: jsonb("spec").notNull(), // ImageSpec snapshot at render time
    pyScript: text("py_script"), // the matplotlib source (for debug / regen)
    // Verifier (Stage-2). Enums as text (M23). NULL = not yet verified.
    verifierLabel: text("verifier_label"), // 'PASS' | 'FAIL' | 'ERROR'
    verifierReason: text("verifier_reason"),
    verifierModel: text("verifier_model"),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    specHash: text("spec_hash"), // Stage-2 staleness tripwire
    meta: jsonb("meta"), // { generationModel, generationTimeMs }
    createdAt: createdAt(),
  },
  (t) => [unique().on(t.questionId, t.version)],
);

// Slice PACE-1 — the student's Pace Plan (one per student, per subject). Stores
// INPUTS ONLY (D-PACE-5): the ordered chapter list + self-declared completion,
// the subject window, and breaks. Everything derived — each chapter's projected
// date range, its pace status, and (PACE-2) preparedness — is recomputed at read
// time and NEVER persisted, so there is no drift and an edit reflects on the next
// fetch. One plan per (app_user, subject). Tenant-scoped (board_id) + RLS; the
// per-user scope is app-enforced (D-L-5), RLS scopes board not user.
export const pacePlan = pgTable(
  "pace_plan",
  {
    id: id(),
    boardId: uuid("board_id")
      .notNull()
      .references(() => board.id),
    appUserId: uuid("app_user_id")
      .notNull()
      .references(() => appUser.id),
    subjectId: uuid("subject_id")
      .notNull()
      .references(() => subject.id),
    // ISO YYYY-MM-DD. end_date is student-set (NO default — the pace check is
    // meaningless without a real deadline; requirements §2 / D-PACE-1).
    startDate: date("start_date", { mode: "string" }).notNull(),
    endDate: date("end_date", { mode: "string" }).notNull(),
    // Ordered chapter list + self-declared completion: [{ chapterId, completed }].
    // The ORDER is the plan's chapter sequence; recommended weeks + projected
    // ranges are derived from it at read time (never stored).
    chapters: jsonb("chapters").notNull().default([]),
    // Break ranges [{ startDate, endDate }] — deferred/empty in PACE-1 (PACE math
    // will subtract break days later; the column exists so PACE-2 needs no migration).
    breaks: jsonb("breaks").notNull().default([]),
    // Null until first-visit setup is completed (the "ownership" moment,
    // requirements §2a) — distinguishes "no plan yet" from a saved one.
    setupCompletedAt: timestamp("setup_completed_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [unique().on(t.appUserId, t.subjectId)],
);

// ───────────────────── 9. Voice tutoring (Slice VOICE-1) ─────────────────────
//
// A student has a spoken conversation with an AI tutor about a revision slide,
// grounded in that slide's manifest `voice_context`. VOICE-1 is the backend
// spine only (no audio transport — that's VOICE-2/Gemini Live): a session row +
// the persisted transcript + a post-call analysis. NO mastery move (like
// Stage-1, the transcript/analysis is evidence, not a certified read).
//
// `mode`/`status` are text (M23 — no pg enum). The full transcript lives in the
// shared `transcript` table (kind='voice_tutoring'); transcript_id points at it.
// `analysis` is the mode-specific post-call read (jsonb; null if the AI call was
// skipped/failed — the kill-switch keeps the session durable either way).
export const voiceSession = pgTable("voice_session", {
  id: id(),
  boardId: uuid("board_id")
    .notNull()
    .references(() => board.id),
  studentId: uuid("student_id")
    .notNull()
    .references(() => appUser.id),
  subTopicId: uuid("sub_topic_id")
    .notNull()
    .references(() => subTopic.id),
  mode: text("mode").notNull().default("overview"), // 'overview' (v0) | 'test' | 'doubt'
  status: text("status").notNull().default("active"), // 'active' | 'completed' | 'abandoned'
  transcriptId: uuid("transcript_id").references(() => transcript.id), // set on endSession
  analysis: jsonb("analysis"), // mode-specific post-call read; null if AI skipped/failed
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  endedAt: timestamp("ended_at", { withTimezone: true }),
  createdAt: createdAt(),
});

// ─────────────── 10. Cross-Device Upload (Slice Q3 — photo capture) ───────────────
//
// A student answers a SUBJECTIVE practice question on paper, scans a QR on the
// desktop, and uploads photos from their phone (UNAUTHENTICATED). Two tables:
//
// upload_token — the phone-side CREDENTIAL. GLOBAL (NOT tenant-scoped / NOT in
//   TENANT_SCOPED_TABLES) ON PURPOSE (D-Q3-1): the phone carries no session
//   cookie and no board, so RLS (which needs the `app.board` claim) can't gate
//   it — the 128-bit unguessable `token` string IS the credential. It CARRIES
//   `board_id` as a plain attribute so every downstream write it authorizes runs
//   under withBoard(token.board_id). Minted by an authed desktop call (inside a
//   board claim, so its FKs validate); read GLOBALLY by token string on the
//   unauth upload route. Bound to one (student, session, question) slot + 30-min
//   expiry + single-use (pending→uploaded→consumed) — the security envelope.
export const uploadToken = pgTable("upload_token", {
  id: id(),
  token: text("token").notNull().unique(), // 128-bit hex; the credential
  boardId: uuid("board_id")
    .notNull()
    .references(() => board.id),
  appUserId: uuid("app_user_id")
    .notNull()
    .references(() => appUser.id),
  practiceSessionId: uuid("practice_session_id")
    .notNull()
    .references(() => practiceSession.id),
  questionId: uuid("question_id")
    .notNull()
    .references(() => question.id),
  status: text("status").notNull().default("pending"), // 'pending'|'uploaded'|'consumed'
  // Object-storage keys of the uploaded photos (S3/fs; `uploads/{token}/{n}.ext`).
  // Empty until the phone POSTs; the durable evidence link is attempt_image
  // (below), written when the desktop consumes the token into an attempt.
  uploadKeys: text("upload_keys").array().notNull().default(sql`'{}'::text[]`),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  uploadedAt: timestamp("uploaded_at", { withTimezone: true }),
  consumedAt: timestamp("consumed_at", { withTimezone: true }),
  createdAt: createdAt(),
});

// attempt_image — the photos that ARE a subjective answer, once the desktop
// submits (D-Q3-2). Tenant-scoped (board_id) + RLS. One attempt → N photos
// (ordered). `storage_key` is the S3/fs object key (bytes live in object
// storage, metadata here — D-Q3-5). Stage-1 vision reads these (Q3-2) exactly
// as it reads answer_text for typed answers.
export const attemptImage = pgTable(
  "attempt_image",
  {
    id: id(),
    boardId: uuid("board_id")
      .notNull()
      .references(() => board.id),
    attemptId: uuid("attempt_id")
      .notNull()
      .references(() => attempt.id),
    storageKey: text("storage_key").notNull(),
    mime: text("mime").notNull(),
    ordinal: integer("ordinal").notNull(),
    createdAt: createdAt(),
  },
  (t) => [unique().on(t.attemptId, t.ordinal)],
);

// onboarding — the conversational welcome, Slice ONB-1. Tenant-scoped + RLS.
//
// It runs on first LOGIN, not signup: the platform is whitelist-gated, so we
// already know who they are before they ever arrive (services/membership.ts).
// This is the FIRST personal data the platform stores about a student — until
// now it held only email + name from the OAuth identity.
//
// ONE table, not profile-split-from-stage-machine: nothing outside this flow
// reads the profile yet, so splitting is premature. Every answer column is
// nullable because every beat after `grade` is skippable and because a row is
// written at beat 1, long before any of them have answers.
//
// D-ONB-1 (write-per-answer): `current_step` + a row per answer is what makes
// the flow resumable — close the tab at beat 4, come back to beat 4. The
// alternative (buffer client-side, commit once at the end) loses everything on
// a refresh, which for a child on a phone is the common case, not the edge.
export const onboarding = pgTable(
  "onboarding",
  {
    id: id(),
    boardId: uuid("board_id")
      .notNull()
      .references(() => board.id),
    userId: uuid("user_id")
      .notNull()
      .references(() => appUser.id),
    // text + CHECK, never a pg enum (M23 — see the header conventions).
    status: text("status").notNull().default("in_progress"),
    // The step id from onboarding.copy.ts — the resume point, not an index, so
    // reordering or inserting a beat can't silently teleport a half-done user.
    currentStep: text("current_step").notNull(),
    // The answers. `grade` is the ONLY one with a consumer waiting (subject.grade
    // filtering); the rest are stored for when there IS something to do with
    // them. `phone` is child PII and optional by deliberate design — see the
    // slice notes on DPDP + verifiable parental consent.
    grade: text("grade"),
    // ⚠️ NO LONGER ASKED (S90, founder call) — `school` is not in
    // ONBOARDING_STEPS any more. The column stays because it holds real
    // answers and dropping it buys nothing; expect it NULL on every row
    // written from S90 on. Do not add it back to the flow without a consumer.
    school: text("school"),
    // S91 — now a CLOSED SET of ids (FAV_CHARACTERS), not free text. Rows
    // written before S91 hold whatever the student typed ("Interstellar -
    // Cooper", "No movie"); rows from S91 on hold an id ("iron_man"). Read it
    // through the copy file's lookup, which tolerates both by falling back.
    favCharacter: text("fav_character"),
    // ⚠️ NO LONGER ASKED (S91, founder call) — the fun-fact pair is not in
    // ONBOARDING_STEPS any more; `pet` took its slot. Same treatment as
    // `school`: the columns stay because they hold real S89/S90 answers and
    // dropping them buys nothing. Expect both NULL on every row from S91 on.
    funFactAbout: text("fun_fact_about"),
    funFact: text("fun_fact"),
    // S91 — the pet the student chose (founder). Either a PETS id ('owl') or
    // free text when they picked "something else" — which is exactly why there
    // is no CHECK here. isKnownPet() in contracts is the discriminator, and it
    // is what decides whether the pet ARRIVES on the loader or gets Pikachu's
    // "2-3 dayssss" line. A custom value is the one free-text echo left in the
    // flow, so the FE routes it through canEcho before repeating it.
    pet: text("pet"),
    phone: text("phone"),
    // Spelled out rather than createdAt(): that helper emits a column literally
    // named created_at, and started_at/completed_at is the pair that says what
    // this row actually tracks.
    startedAt: timestamp("started_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => [
    unique().on(t.userId, t.boardId),
    check("onboarding_status", sql`${t.status} IN ('in_progress', 'completed')`),
  ],
);

// ───────────────────────── AI forensics ─────────────────────────

/**
 * ai_call_log — one append-only row per AI call, across BOTH vendor paths
 * (services/ai_client.ts `complete()` AND services/ai/gemini.ts `geminiJson()`).
 * Ported from Starkhorn's `ai_call_log`, plus two columns Starkhorn lacks:
 * `thinking_tokens` and `timeout_ms`.
 *
 * WHY those two: on 2026-07-16 prod authoring stalled and both attempts died on
 * "The operation timed out." with NO thinking count and NO elapsed time in the
 * journal — the spend was invisible, and diagnosis needed a replay of a stored
 * brief to discover thinking is the runaway axis (normal 6–9k tokens; one prod
 * call hit 62,910). A forensics table that can't answer "how long, and how much
 * thinking?" would not have solved that incident.
 *
 * GLOBAL — deliberately NOT in TENANT_SCOPED_TABLES (founder call, 2026-07-16):
 * `geminiJson` is a low-level wrapper with no board claim, so a `WITH CHECK`
 * policy would REJECT exactly the rows worth having (the authoring-worker path
 * that broke). `board_id` is best-effort attribution for filtering, nullable by
 * design, never a security boundary. Same reasoning as `upload_token` above.
 * ⚠️ Consequence: prompt text (which contains student answers/names) is readable
 * by the app role across boards. Accepted for forensic completeness.
 *
 * The write is BEST-EFFORT and must never break the call it observes — a
 * forensics insert failing is a logged warning, not a failed AI call.
 */
export const aiCallLog = pgTable(
  "ai_call_log",
  {
    id: id(),
    // Best-effort attribution ONLY — nullable, no RLS, not a boundary.
    //
    // ON DELETE SET NULL is what makes that true (0025). Shipped as bare
    // `.references()` in 0024, which defaults to NO ACTION — so a log row
    // PINNED its board/user and blocked their deletion, making the column the
    // hard boundary this comment says it isn't. It broke every AI probe's M22
    // teardown (throwaway board -> AI call -> log row -> board undeletable),
    // i.e. the pattern that leaves probe litter behind.
    //
    // The log row is the durable artifact; attribution is a convenience that
    // may outlive its subject. Deleting a user drops the name, keeps the
    // forensics. Never CASCADE: that would let a cleanup erase the evidence.
    boardId: uuid("board_id").references(() => board.id, { onDelete: "set null" }),
    userId: uuid("user_id").references(() => appUser.id, { onDelete: "set null" }),
    // e.g. 'authoring.worker' | 'authoring.chat' | 'stage1:conceptual' | 'imagegen'.
    endpoint: text("endpoint").notNull(),
    model: text("model").notNull(),
    vendorId: text("vendor_id"), // 'gemini_api' | 'claude_cli'
    slotId: text("slot_id"),
    tokensIn: integer("tokens_in"),
    tokensOut: integer("tokens_out"),
    // The runaway axis — the whole reason this table exists.
    thinkingTokens: integer("thinking_tokens"),
    latencyMs: integer("latency_ms"),
    // The cap in force for this call, so a TIMED-OUT row is self-evident
    // (latency_ms ≈ timeout_ms) instead of needing the source to interpret.
    timeoutMs: integer("timeout_ms"),
    ok: boolean("ok").notNull().default(true),
    finishReason: text("finish_reason"),
    errorCause: text("error_cause"),
    errorMessage: text("error_message"),
    // Full bodies (founder call, 2026-07-16): an authoring brief is ~113KB and is
    // precisely the call worth replaying verbatim — truncation would defeat the
    // purpose. Revisit with a retention sweep if growth bites.
    promptIn: text("prompt_in"),
    promptOut: text("prompt_out"),
    aiSessionId: text("ai_session_id"),
    sessionFingerprint: text("session_fingerprint"),
    attempt: integer("attempt"),
    createdAt: createdAt(),
  },
  (t) => [
    index("idx_ai_call_log_endpoint_ts").on(t.endpoint, t.createdAt),
    index("idx_ai_call_log_ok_ts").on(t.ok, t.createdAt),
    index("idx_ai_call_log_board_ts").on(t.boardId, t.createdAt),
  ],
);

/**
 * Tables carrying board_id → get RLS ENABLE + FORCE + a board-claim policy.
 * Single source of truth for src/db/migrate.ts (rls application). board,
 * app_user, content_version are intentionally absent (board/app_user are
 * global; content_version is scoped transitively via content_unit).
 * upload_token is ALSO intentionally absent — it is a GLOBAL credential read
 * without a board claim (the unauth phone has none); see its comment above.
 * ai_call_log is absent for the same reason — see its comment above.
 */
export const TENANT_SCOPED_TABLES = [
  "membership",
  "whitelist",
  "parent_child",
  "tutor_student",
  "subject",
  "chapter",
  "topic",
  "sub_topic",
  "learning_objective",
  "event_log",
  "transcript",
  "observation",
  "cross_concept_flag",
  "mastery_state",
  "mastery_history",
  "scheduling_state",
  "content_unit",
  "question",
  "practice_session",
  "attempt",
  "assignment",
  "report",
  "authoring_chat",
  "authoring_worker",
  "question_image",
  "pace_plan",
  "voice_session",
  "attempt_image", // Slice Q3 — subjective answer photos (tenant-scoped + RLS)
  "onboarding", // Slice ONB-1 — the conversational welcome (tenant-scoped + RLS)
] as const;

// All table names (for blanket GRANTs to the app role). Includes the GLOBAL
// (non-tenant-scoped) tables: board, app_user, the Better Auth tables, and
// content_version (RLS'd transitively via content_unit).
export const ALL_TABLES = [
  "board",
  "app_user",
  "users",
  "sessions",
  "accounts",
  "verifications",
  ...TENANT_SCOPED_TABLES,
  "content_version",
  "upload_token", // Slice Q3 — GLOBAL credential (no RLS); needs the app-role grant
  "ai_call_log", // AI forensics — GLOBAL (no RLS, see its comment); needs the grant
] as const;
