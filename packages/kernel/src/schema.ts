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
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const id = () => uuid("id").primaryKey().defaultRandom();
const createdAt = () =>
  timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

// ───────────────────────── 1. Identity & tenancy ─────────────────────────

// Tenant. One row per board. NOT tenant-scoped (it IS the tenant).
export const board = pgTable(
  "board",
  {
    id: id(),
    slug: text("slug").notNull().unique(), // 'cambridge' | 'cbse' — RLS/withBoard key
    name: text("name").notNull(),
    config: jsonb("config").notNull().default({}),
    // ID-0 toggle 1 (founder-ratified 2026-07-21): a board can be switched off
    // without being deleted. `is_active` was never a column; this is its
    // first-class replacement. text + CHECK, house style (M23: no pg enums).
    status: text("status").notNull().default("active"), // 'active' | 'inactive'
    // Content/config revision counter for this board (toggle 1). Bump on a
    // content/config change so consumers can compare + invalidate.
    version: integer("version").notNull().default(1),
    createdAt: createdAt(),
  },
  (t) => [check("board_status_check", sql`${t.status} IN ('active','inactive')`)],
);

/**
 * The PROFILE — the unit of identity (ID-0, S127 redesign). One row per
 * (email × phone × user_type): the same person's email can hold up to FOUR
 * distinct profiles (student/tutor/parent/admin), each its own id, each its own
 * spine of evidence. This ABSORBS the old `membership` table — `user_type`
 * lives here now, not on a per-board row. GLOBAL, never tenant-scoped
 * (decision 5): board lives on the role tables (student.board_id, tutor.boards[]).
 *
 * Uniqueness is NULLS NOT DISTINCT so the phone-null login window (decision 1:
 * app_user is created at login with phone NULL, filled at onboarding) still
 * enforces ONE row per (email, user_type) — Postgres's default treats two NULL
 * phones as distinct and would let a second login mint a duplicate profile.
 */
export const appUser = pgTable(
  "app_user",
  {
    id: id(),
    email: text("email").notNull(),
    name: text("name"),
    // NULL until onboarding captures it (decision 1). Part of the profile key.
    phone: text("phone"),
    // student | tutor | parent | admin. The 4th (admin) preserves the "DB role
    // AND whitelist" gate (contracts.ts ADMIN_EMAILS). text + CHECK (M23).
    userType: text("user_type").notNull(),
    // 7-char alphanumeric, minted per profile at signup (founder ask 2026-07-21;
    // generateReferralCode in contracts.ts). UNIQUE. Nullable at the DDL level so
    // the reshape migration lands on pre-cutover rows; the write path
    // (login-upsert, ID-1) always sets it, and the cutover mints one for the
    // preserved founder admin. Tighten to NOT NULL once every row carries one.
    referralCode: text("referral_code").unique(),
    createdAt: createdAt(),
  },
  (t) => [
    unique("app_user_email_phone_type_uq")
      .on(t.email, t.phone, t.userType)
      .nullsNotDistinct(),
    check(
      "app_user_user_type_check",
      sql`${t.userType} IN ('student','tutor','parent','admin')`,
    ),
  ],
);

// ── Per-role attribute tables + per-student character instances (ID-0). ──
// Keyed user_id → app_user.id (1:1 with the profile). email/name/phone live
// ONLY on app_user; these hold role-specific fields. ON DELETE CASCADE: the
// profile row is the identity, the role row is its detail. The old `membership`
// table is ABSORBED into app_user.user_type (see appUser above) and DROPPED.

// The onboarding character — a per-student INSTANCE (no shared catalog), the
// AI persona the student learns with, carrying voice/chat model routing. GLOBAL
// (scoped transitively via the student that owns it).
export const hero = pgTable("hero", {
  heroId: uuid("hero_id").primaryKey().defaultRandom(),
  heroLevel: integer("hero_level").notNull().default(0),
  heroName: text("hero_name"),
  heroType: text("hero_type"),
  heroRef: text("hero_ref"), // 'marvel' | 'dc' | …
  status: text("status").notNull().default("active"),
  // Text tag for now (toggle 4); a `persona` config table is a later slice.
  personaId: text("persona_id"),
  defaultVoiceModel: text("default_voice_model"),
  defaultChatModel: text("default_chat_model"),
  createdAt: createdAt(),
});

// The companion — same per-student-instance shape as hero.
export const pet = pgTable("pet", {
  petId: uuid("pet_id").primaryKey().defaultRandom(),
  petLevel: integer("pet_level").notNull().default(0),
  petName: text("pet_name"),
  petType: text("pet_type"),
  petRef: text("pet_ref"),
  status: text("status").notNull().default("active"),
  personaId: text("persona_id"),
  defaultVoiceModel: text("default_voice_model"),
  defaultChatModel: text("default_chat_model"),
  createdAt: createdAt(),
});

// Tutor profile detail. GLOBAL — a tutor works across MANY boards, held in the
// `boards` json array (decision 5), so there is no single board_id to RLS on.
export const tutor = pgTable(
  "tutor",
  {
    userId: uuid("user_id")
      .primaryKey()
      .references(() => appUser.id, { onDelete: "cascade" }),
    boards: jsonb("boards").notNull().default([]), // board ids the tutor serves
    level: integer("level").notNull().default(0),
    qualifications: text("qualifications"),
    startedAt: timestamp("started_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    status: text("status").notNull().default("active"),
    createdAt: createdAt(),
  },
  (t) => [check("tutor_status_check", sql`${t.status} IN ('active','inactive')`)],
);

// Parent profile detail. GLOBAL. The relationship to a student is the student's
// `parent_id` pointer (below), not a column here.
export const parent = pgTable(
  "parent",
  {
    userId: uuid("user_id")
      .primaryKey()
      .references(() => appUser.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("active"),
    relation: text("relation").notNull().default("guardian"), // mother|father|guardian|…
    planTier: text("plan_tier"),
    createdAt: createdAt(),
  },
  (t) => [check("parent_status_check", sql`${t.status} IN ('active','inactive')`)],
);

// `whitelist` (the access gate) lived here until Slice F (S113), which DROPPED
// the table (migration 0034). The gate is open: anyone who signs in is a
// student; roles above student are set from the admin People surface.

// Student profile detail — the ONE identity table that is tenant-scoped
// (decision 5): `board_id` is the RLS key. Carries the single-pointer
// relationships that REPLACE tutor_student / parent_child: one tutor + one
// parent per student BY CONSTRUCTION (a tutor/parent still has many students).
// The old join tables are DROPPED; the same-email resolver bug is gone because
// admin now assigns by profile id via pickers, never by resolving email → role.
export const student = pgTable(
  "student",
  {
    userId: uuid("user_id")
      .primaryKey()
      .references(() => appUser.id, { onDelete: "cascade" }),
    boardId: uuid("board_id")
      .notNull()
      .references(() => board.id), // RLS key
    age: integer("age"),
    class: text("class").notNull(), // e.g. '9' | '10'
    // Single-pointer relationships (→ app_user.id). Nullable: a student may be
    // unlinked. Server-validated on write; the admin LINK picker only offers
    // real board tutors/parents. `tutor_id IS NULL` == "unlinked" — the picker's
    // filter (ID-2).
    tutorId: uuid("tutor_id").references(() => appUser.id),
    parentId: uuid("parent_id").references(() => appUser.id),
    school: text("school"),
    pronoun: text("pronoun"), // 'he' | 'she' | … (S92), moved here (toggle 5)
    heroId: uuid("hero_id").references(() => hero.heroId),
    petId: uuid("pet_id").references(() => pet.petId),
    status: text("status").notNull().default("active"),
    onboardingAt: timestamp("onboarding_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [check("student_status_check", sql`${t.status} IN ('active','inactive')`)],
);

// tutor_assignment — append-only handover ledger (ID-0, founder ask). On a tutor
// switch/remove the prior row is closed with a FROZEN progress_snapshot
// ({ mastery, insights, metrics } to the switch), so the FORMER tutor keeps a
// read-only point-in-time view; progress is never lost. `student.tutor_id` stays
// the LIVE pointer. Tenant-scoped (board_id + RLS). Mirrors report.snapshot
// discipline: a frozen description, never a live log. Parent handovers have no
// history (toggle 9). student_id / tutor_id → app_user.id (the profiles).
export const tutorAssignment = pgTable(
  "tutor_assignment",
  {
    id: id(),
    boardId: uuid("board_id")
      .notNull()
      .references(() => board.id), // RLS key
    studentId: uuid("student_id")
      .notNull()
      .references(() => appUser.id),
    tutorId: uuid("tutor_id")
      .notNull()
      .references(() => appUser.id),
    status: text("status").notNull().default("active"), // 'active' | 'ended'
    assignedAt: timestamp("assigned_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    endedAt: timestamp("ended_at", { withTimezone: true }), // null while active
    progressSnapshot: jsonb("progress_snapshot"), // frozen at end
    endedReason: text("ended_reason"),
    createdAt: createdAt(),
  },
  (t) => [
    check("tutor_assignment_status_check", sql`${t.status} IN ('active','ended')`),
    index("idx_tutor_assignment_student").on(t.studentId),
    index("idx_tutor_assignment_tutor").on(t.tutorId),
  ],
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
    // S2R-1 (Stage-2 redesign §3): anything this answer revealed that does NOT
    // belong to this sub-topic — adjacent-skill slips, hints of gaps in other
    // chapters, horizontal-skill signals. Asked for on BOTH axes (the old
    // procedural-only crossConceptNote folded into this). Stage-1 is the only
    // place with the raw answer: DETECTION happens here; evaluation/
    // categorisation happens at Stage-2b, which pools these across the
    // assignment. Nullable — most answers stay inside their sub-topic.
    // (Legacy rows carry the old note in signals.crossConceptNote; readers
    // fall back to it.)
    nonSubtopicNote: text("non_subtopic_note"),
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
// GENERALISED by Slice S2R-3 (spec §5): the worklist MECHANISM is kept exactly as
// it was — a clearable queue is the one thing about this table that worked — and
// only what FEEDS it is broadened. Stage-2b's synthesis now emits actionable items
// (re-teach X, prerequisite gap Y, recurring horizontal weakness Z) into the same
// queue, under the split rule: STATE goes to the chapter/subject insight text;
// ACTIONS come here.
//
// That required loosening two NOT NULLs, and it is worth being precise about why:
// a synthesis item is a claim about a PATTERN across a whole sitting, so it has no
// single originating observation and often no single originating sub_topic. Both
// columns stay for stage-1 items (where they are the provenance that makes a flag
// checkable) and go null for synthesis items, with `origin` naming which is which
// rather than leaving the reader to infer it from a null.
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
    // Which detector raised this. NOT derivable from the null columns alone —
    // name it, so a reader never has to reverse-engineer provenance from absence.
    origin: text("origin").notNull().default("stage1_cross_concept"), // | 'stage2_synthesis'
    // Where the student was working when the other skill broke. NULL for a
    // synthesis item that spans the sitting rather than sitting in one sub_topic.
    fromSubTopicId: uuid("from_sub_topic_id").references(() => subTopic.id),
    note: text("note").notNull(), // "procedural issue in <other skill> — <what broke>"
    // The read that raised it. UNIQUE → re-finalizing a sub-topic can't duplicate
    // flags. NULL for synthesis items (a pattern has no one source read); Postgres
    // never treats NULLs as equal, so the unique below cannot constrain them — the
    // same property D-S2R-7 leans on for the catch-all sitting.
    sourceObservationId: uuid("source_observation_id").references(() => observation.id),
    // What a synthesis item is deduped by instead: a sitting finalizes exactly once
    // (SessionAlreadyFinalizedError + the status flip are in the same tx), so its
    // items are inserted exactly once. Kept for provenance + the tutor's "which
    // assessment raised this?" read.
    sourceSessionId: uuid("source_session_id").references(() => assessmentSession.id),
    addressedAt: timestamp("addressed_at", { withTimezone: true }), // null = open
    addressedBy: uuid("addressed_by").references(() => appUser.id),
    createdAt: createdAt(),
  },
  (t) => [
    unique().on(t.sourceObservationId),
    index("cross_concept_flag_session_idx").on(t.sourceSessionId),
    // A stage-1 flag without its source read would be an unfalsifiable claim; a
    // synthesis flag is not expected to have one. Encode that rather than trusting
    // the writers to be consistent.
    check(
      "cross_concept_flag_origin_provenance",
      sql`(${t.origin} = 'stage1_cross_concept' and ${t.sourceObservationId} is not null and ${t.fromSubTopicId} is not null)
       or (${t.origin} = 'stage2_synthesis' and ${t.sourceSessionId} is not null)`,
    ),
  ],
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

// ────────── 3b. Above-sub-topic insight stores (Slice S2R-3) ──────────
//
// Everything in §3 is keyed by sub_topic. These three stores are the first
// things in the model that live ABOVE it — written by Stage-2b's synthesis
// segment at finalize (D-S2R-3), which is the only place with a cross-sub-topic
// view. Spec §4: "these gaps are real (seen in manual ground-tests) but have no
// home in the sub-topic × two-axis store."
//
// All three are INCREMENTAL, never complete: one assignment refines a chapter or
// subject view, it does not finish it. Synthesis edits the existing text where it
// can and rewrites where it cannot, so these are state tables (overwritten), not
// append-only logs.

// The horizontal-skill TAXONOMY. Predefined content, ingested from the topic
// registry's `chapters[].horizontal[{slug, description}]` (D-S2R-4) — not a
// taxonomy anyone invents or maintains by hand.
//
// ⚠️ CHAPTER-GRAIN ON PURPOSE, and it does NOT match the state's grain below.
// A slug is reused across chapters of one subject with a DIFFERENT description
// each time — measured, not assumed: Cambridge Physics IGCSE defines
// `language_precision` as "both-halves definitions / 'show that' working" in
// Motion and "read and write the chapter's notation exactly" in Electricity;
// CBSE Maths Class 10 defines it in three chapters, three ways.
// D-S2R-8 reads that reuse as deliberate: ONE subject-wide skill, described
// through a local chapter lens. So the definitions stay chapter-grain (each says
// what the skill looks like HERE) while the student's level pools at subject
// grain (horizontal_skill_state). Synthesis is handed the descriptions for the
// chapters in the sitting's scope — never a single "winning" description, which
// would silently discard the others.
export const horizontalSkill = pgTable(
  "horizontal_skill",
  {
    id: id(),
    boardId: uuid("board_id")
      .notNull()
      .references(() => board.id),
    // Denormalized from chapter.subject_id so the subject-grain state can resolve
    // a slug's in-scope definitions without a join through chapter.
    subjectId: uuid("subject_id")
      .notNull()
      .references(() => subject.id),
    chapterId: uuid("chapter_id")
      .notNull()
      .references(() => chapter.id),
    slug: text("slug").notNull(), // 'language_precision' | 'causal_reasoning' | …
    description: text("description").notNull(), // what the skill looks like in THIS chapter
    createdAt: createdAt(),
  },
  (t) => [
    // One definition per (chapter, slug) — re-running the ingest updates in place.
    unique().on(t.chapterId, t.slug),
    index("horizontal_skill_subject_idx").on(t.subjectId, t.slug),
  ],
);

// A student's standing on one horizontal skill, SUBJECT-WIDE (spec §4; D-S2R-8).
// The pooling is the point: "recurring horizontal weakness" (spec §5) is a claim
// no chapter-local store could make.
export const horizontalSkillState = pgTable(
  "horizontal_skill_state",
  {
    id: id(),
    boardId: uuid("board_id")
      .notNull()
      .references(() => board.id),
    studentId: uuid("student_id")
      .notNull()
      .references(() => appUser.id),
    subjectId: uuid("subject_id")
      .notNull()
      .references(() => subject.id),
    // Not an FK to horizontal_skill: that table is keyed per chapter, this row is
    // per subject, and a slug's definitions are many. The slug string IS the join
    // key (horizontal_skill.subject_id + slug → every in-scope definition).
    slug: text("slug").notNull(),
    // NULL = NOT YET OBSERVED, never "level 1" — the same bound mastery_state
    // holds (assessment.md §2). A horizontal the student has had no chance to
    // show is a coverage gap, not a weakness.
    level: smallint("level"),
    prose: text("prose").notNull(), // the evidence behind the level, tutor-visible
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique().on(t.studentId, t.subjectId, t.slug),
    check("horizontal_skill_state_level_range", sql`${t.level} between 1 and 5`),
  ],
);

// Free-form chapter-level view of a student. One row per (student × chapter).
export const studentChapterInsight = pgTable(
  "student_chapter_insight",
  {
    id: id(),
    boardId: uuid("board_id")
      .notNull()
      .references(() => board.id),
    studentId: uuid("student_id")
      .notNull()
      .references(() => appUser.id),
    chapterId: uuid("chapter_id")
      .notNull()
      .references(() => chapter.id),
    insight: text("insight").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [unique().on(t.studentId, t.chapterId)],
);

// Free-form subject-level view. One row per (student × subject).
export const studentSubjectInsight = pgTable(
  "student_subject_insight",
  {
    id: id(),
    boardId: uuid("board_id")
      .notNull()
      .references(() => board.id),
    studentId: uuid("student_id")
      .notNull()
      .references(() => appUser.id),
    subjectId: uuid("subject_id")
      .notNull()
      .references(() => subject.id),
    insight: text("insight").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [unique().on(t.studentId, t.subjectId)],
);

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

// Slice S2R-2 — the Stage-2 assessment SESSION: the unit the tutor certifies in.
// Replaces the per-sub_topic draft-then-form path (D-S2R-5, hard cut).
//
// ONE row per assessment sitting. Two kinds, distinguished by assignment_id:
//  - assignment_id SET  — the assignment's frozen composition, assessed together.
//                         This is the case the redesign spec §1 describes.
//  - assignment_id NULL — the CATCH-ALL (D-S2R-7): pending sub_topics that no
//                         assignment covers (self-serve practice, teach-back).
//                         Without it the hard cut would silently strand that
//                         evidence — it is ~36% of real observations today, and
//                         nothing would error; mastery would just stop moving.
//
// sub_topic_ids[] is FROZEN at open (same pin-not-copy discipline as assignment):
// the sitting assesses what was pending when it opened, so evidence arriving
// mid-sitting can't shift the composition under the tutor.
//
// `drafts` holds the Stage-2a proposals (subTopicId → Stage2DraftResult), written
// once when the session opens and all N draft calls run in PARALLEL. This is a
// deliberate reversal of D-S2-1's "no draft table": with N calls per sitting the
// tutor cannot re-wait N×~10s on every render, and Stage-2b (S2R-4) needs a
// stable set of drafts to converse ABOUT. Persisting them server-side also means
// finalize no longer trusts an FE round-trip for the AI-authored half.
//
// `messages` is Stage-2b's chat history (S2R-4) — [] until then. Mirrors
// authoring_chat's proven history-in-a-row pattern rather than a new table.
export const assessmentSession = pgTable(
  "assessment_session",
  {
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
    // null = the catch-all sitting for unassigned evidence (D-S2R-7).
    assignmentId: uuid("assignment_id").references(() => assignment.id),
    subTopicIds: uuid("sub_topic_ids").array().notNull(), // frozen at open
    drafts: jsonb("drafts").notNull().default({}), // subTopicId → Stage2DraftResult
    messages: jsonb("messages").notNull().default([]), // Stage-2b chat (S2R-4)
    // S2R-3 — what Stage-2b's synthesis segment produced at finalize, INCLUDING
    // its reasoning and anything dropped as unresolvable. `drafts` holds 2a's
    // reasoning; this is 2b's. Spec §6: the tutor reads why, after the fact —
    // "hidden reasoning defeats the point". Null until the sitting is finalized.
    synthesis: jsonb("synthesis"),
    status: text("status").notNull().default("open"), // 'open' | 'finalized'
    finalizedAt: timestamp("finalized_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    // At most ONE open sitting per assignment. Partial (status='open') so a
    // finalized sitting doesn't block a later re-assessment of the same
    // assignment when fresh evidence lands.
    uniqueIndex("assessment_session_open_assignment_idx")
      .on(t.assignmentId)
      .where(sql`${t.status} = 'open' and ${t.assignmentId} is not null`),
    // ...and at most one open CATCH-ALL per student (assignment_id is null, so
    // the index above can't constrain it — NULLs are never equal in Postgres).
    uniqueIndex("assessment_session_open_catchall_idx")
      .on(t.studentId)
      .where(sql`${t.status} = 'open' and ${t.assignmentId} is null`),
    index("assessment_session_student_idx").on(t.studentId, t.status),
  ],
);

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
//
// 🔑 Slice TWOWAY-1 — THIS ROW IS NOW A CONVERSATION, NOT JUST AN AUDIT LOG.
// `messages` (WorkerTurn[]) holds the ordered two-way exchange for ONE authoring
// EPISODE — the worker's plan, the tutor's amendments, the re-plans, and finally
// the drafted marker — and `status` is that episode's lifecycle
// (WorkerEpisodeStatus). The history lives in a jsonb column rather than a child
// table for the same reason authoring_chat.messages does: it is read and written
// whole, always in the context of its parent, and never queried across rows.
//
// One row per (chat, sub_topic) EPISODE, reused across a plan→amend→re-plan→draft
// cycle — NOT one row per AI call. A brand-new episode for the same
// (chat, sub_topic) opens a new row, which is why the Claude resume lookup still
// takes the most-recent row rather than assuming uniqueness.
//
// Both columns are DEFAULTED so pre-slice rows read correctly with no backfill:
// messages '[]' (their exchange was never a conversation) and status 'drafted'
// (they are completed one-shot spawns). Every new column defaulted, never a bare
// NOT NULL — snapshot-restore probes and backfills depend on it.
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
  // Slice TWOWAY-1: the ordered two-way exchange for this episode (WorkerTurn[]).
  messages: jsonb("messages").notNull().default([]),
  // Slice TWOWAY-1: the episode lifecycle (WorkerEpisodeStatus). 'planned' is the
  // ONLY state that blocks on a human — it is what the plan gate reads.
  status: text("status").notNull().default("drafted"),
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
// It runs on first LOGIN, not signup. Signup is open (Slice C, S110), so the
// first login is the first moment the platform has an identity to hang answers
// on (services/membership.ts). This is the FIRST personal data the platform
// stores about a student — before it, only email + name from the OAuth identity.
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
// Onboarding — a STATE-MACHINE HEADER now (ID-0), not an answer bag. The answers
// land on their real homes at onboarding time (ID-3): phone → app_user.phone;
// class/school/pronoun/hero/pet → student. GLOBAL: keyed on user_id
// (globally-unique app_user.id). Board isn't known until the student picks one
// mid-flow, so there is no board_id to scope on — onboarding drops OUT of RLS
// (was tenant-scoped pre-ID-0). Per-transition audit lives in onboarding_flow_log.
export const onboarding = pgTable(
  "onboarding",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => appUser.id, { onDelete: "cascade" }),
    // text + CHECK, never a pg enum (M23 — see the header conventions).
    status: text("status").notNull().default("in_progress"),
    // The current step id (from onboarding.copy.ts) — the resume point, not an
    // index, so reordering a beat can't teleport a half-done user.
    state: text("state").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    endAt: timestamp("end_at", { withTimezone: true }), // null until completed
    createdAt: createdAt(),
  },
  (t) => [
    unique().on(t.userId),
    check("onboarding_status", sql`${t.status} IN ('in_progress', 'completed')`),
  ],
);

// onboarding_flow_log — append-only, one row per state transition (ID-0). The
// audit trail behind the header above.
export const onboardingFlowLog = pgTable("onboarding_flow_log", {
  id: id(),
  onboardingId: uuid("onboarding_id")
    .notNull()
    .references(() => onboarding.id, { onDelete: "cascade" }),
  state: text("state").notNull(),
  status: text("status").notNull(),
  failureReason: text("failure_reason"),
  createdAt: createdAt(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

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
 *
 * ⚠️ This list is hand-maintained in BOTH directions and neither is checked by
 * the toolchain:
 *   - ADDING a board_id table without adding it here ships that table with RLS
 *     OFF and the migration still prints success (M34) — a cross-tenant leak.
 *   - DROPPING a table without removing it here makes `src/db/migrate.ts`
 *     hard-fail on `ALTER TABLE <gone>`, which breaks not just that migration
 *     but every later one (Slice F, S113).
 * probe_boot's census leg asserts this list against pg_class, so both
 * directions now fail loudly instead of silently.
 */
export const TENANT_SCOPED_TABLES = [
  // ID-0 identity redesign: `student` (board_id) + `tutor_assignment` (board_id)
  // are the only tenant-scoped identity tables. app_user/tutor/parent/hero/pet/
  // onboarding are GLOBAL (decision 5); membership/parent_child/tutor_student are
  // DROPPED. The census in probe_boot reconciles this list against pg_class.
  "student",
  "tutor_assignment",
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
  // Slice S2R-2 — the Stage-2 sitting. Holds a student's drafts + (soon) the
  // tutor's chat: student data, so RLS is not optional (M34).
  "assessment_session",
  // Slice S2R-3 — the above-sub-topic stores. The three state tables hold student
  // data; horizontal_skill is board-scoped CONTENT (a board's taxonomy), and it
  // carries a board_id, so it is scoped for the same reason `chapter` is.
  "horizontal_skill",
  "horizontal_skill_state",
  "student_chapter_insight",
  "student_subject_insight",
] as const;

// All table names (for blanket GRANTs to the app role). Includes the GLOBAL
// (non-tenant-scoped) tables: board, app_user, the Better Auth tables, and
// content_version (RLS'd transitively via content_unit).
export const ALL_TABLES = [
  "board",
  "app_user",
  // GLOBAL identity role/instance/flow tables (ID-0, decision 5 — not scoped):
  "tutor",
  "parent",
  "hero",
  "pet",
  "onboarding",
  "onboarding_flow_log",
  // Better Auth (global):
  "users",
  "sessions",
  "accounts",
  "verifications",
  ...TENANT_SCOPED_TABLES, // includes student + tutor_assignment
  "content_version",
  "upload_token", // Slice Q3 — GLOBAL credential (no RLS); needs the app-role grant
  "ai_call_log", // AI forensics — GLOBAL (no RLS, see its comment); needs the grant
] as const;
