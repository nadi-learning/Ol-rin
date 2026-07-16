/**
 * Zod contracts for the spine. Enums live here (the DB stores them as `text`;
 * zod is the runtime guard). Leaf-surface payload schemas land in later passes.
 */
import { z } from "zod";

export const Role = z.enum(["student", "tutor", "parent", "admin"]);
export type Role = z.infer<typeof Role>;

export const Axis = z.enum(["conceptual", "procedural"]);
export type Axis = z.infer<typeof Axis>;

export const MasteryLevel = z.number().int().min(1).max(5);

export const ContentType = z.enum([
  "slide_module",
  "narrative",
  "topics_md",
  "lo_config",
  "question",
]);
export type ContentType = z.infer<typeof ContentType>;

export const ContentSource = z.enum(["starkhorn", "b2c_authoring"]);
export type ContentSource = z.infer<typeof ContentSource>;

export const ObservationSource = z.enum(["stage1_scorer", "teachback"]);
export type ObservationSource = z.infer<typeof ObservationSource>;

export const TranscriptKind = z.enum(["stage2", "teachback"]);
export type TranscriptKind = z.infer<typeof TranscriptKind>;

// Practice capture (Slice L). Question axis allows 'both' (a question can
// exercise both ladders); the spine Axis (observation/mastery) stays binary.
export const QuestionAxis = z.enum(["conceptual", "procedural", "both"]);
export type QuestionAxis = z.infer<typeof QuestionAxis>;

export const QuestionKind = z.enum(["subjective"]);
export type QuestionKind = z.infer<typeof QuestionKind>;

export const PracticeStatus = z.enum(["active", "completed"]);
export type PracticeStatus = z.infer<typeof PracticeStatus>;

export const PracticeOrigin = z.enum(["self_serve"]);
export type PracticeOrigin = z.infer<typeof PracticeOrigin>;

// ───────────── Slice AUTH-v2: conversational authoring (ported chat plumbing) ─────────────

// The two AI vendors the tutor can pick per chat (ported from Starkhorn's
// VendorChoice). Matches the AiVendor registry ids in src/services/ai/.
export const VendorChoice = z.enum(["claude_cli", "gemini_api"]);
export type VendorChoice = z.infer<typeof VendorChoice>;

// One persisted chat turn (a trim of Starkhorn's ChatMessage — dropped the
// teacher-app fields: toolCall/attachments/audio/planVersion/learningHint).
// Stored in authoring_chat.messages jsonb. The assistant turn carries the
// vendor's continuation handle (aiSessionId) + vendorId + sessionFingerprint so
// the next turn can resume (Claude --resume / Gemini previous_interaction_id) or
// fall back to stitched history on a vendor/fingerprint mismatch.
export const ChatMessage = z.object({
  id: z.string(),
  role: z.enum(["user", "assistant"]),
  text: z.string(),
  createdAt: z.string().datetime(),
  aiSessionId: z.string().optional(),
  vendorId: z.string().optional(),
  sessionFingerprint: z.string().optional(),
});
export type ChatMessage = z.infer<typeof ChatMessage>;

// ── Slice ONB-1 — the conversational welcome ──────────────────────────────
//
// The ORDER of the beats lives here, not in the FE copy file, so there is one
// source of truth: the copy file is keyed BY these ids (prompts + reactions),
// and the server computes the resume point from this array. Two ordered lists
// would drift, and a drifted resume point sends a half-done student to the
// wrong beat.
//
// Beats that only TALK (greet, pikachu, lore) are steps too — current_step has
// to be able to name them, or closing the tab on the Pikachu beat resumes you
// at the last thing you TYPED, replaying dialogue you already saw.
export const ONBOARDING_STEPS = [
  "greet",
  "grade",
  "school",
  "fav_character",
  "pikachu",
  "phone",
  "lore",
  "done",
] as const;
export const OnboardingStep = z.enum(ONBOARDING_STEPS);
export type OnboardingStep = z.infer<typeof OnboardingStep>;

// The only beats that persist an answer → the onboarding column each writes.
// Anything not in here is a talk-only beat and must not carry a value.
export const ONBOARDING_ANSWER_COLUMNS = {
  grade: "grade",
  school: "school",
  fav_character: "favCharacter",
  phone: "phone",
} as const satisfies Partial<Record<OnboardingStep, string>>;

export const OnboardingStatus = z.enum(["in_progress", "completed"]);
export type OnboardingStatus = z.infer<typeof OnboardingStatus>;

// event_log.event_type enum (v0) — rewrite/spine-schema.md §4b.
export const EventType = z.enum([
  "assessment_override",
  "description_edit",
  "authoring_edit",
  "cross_concept_route",
  "taught",
  "stage2_finalize",
  "content_version_bump",
  "staleness_flag",
  "report_published",
]);
export type EventType = z.infer<typeof EventType>;
