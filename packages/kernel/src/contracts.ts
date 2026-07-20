/**
 * Zod contracts for the spine. Enums live here (the DB stores them as `text`;
 * zod is the runtime guard). Leaf-surface payload schemas land in later passes.
 */
import { z } from "zod";

// The four membership roles. `ROLES` is the array form — the DB CHECK on
// membership.role is generated from this list, and `grantRole` takes a `Role`,
// so the enum, the constraint and the one write path can no longer drift.
// Ordered by PRIVILEGE, highest first: migration 0033 uses this order to pick
// the surviving row when collapsing a user's multiple roles on one board.
export const ROLES = ["admin", "tutor", "parent", "student"] as const;
export const Role = z.enum(ROLES);
export type Role = z.infer<typeof Role>;

/** The role a brand-new member gets. Everyone starts here; admin promotes. */
export const DEFAULT_ROLE: Role = "student";

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
// S90 — `school` was REMOVED from the flow (founder call): nothing consumed it,
// and an unvalidatable free-text ask that feeds nothing is cost without payoff.
// The onboarding.school COLUMN survives (it holds real answers from the S89
// walkthroughs and dropping it buys nothing) — it is simply never asked again.
//
// S91 — the fun-fact PAIR was removed the same way (founder call), and `pet`
// took its slot. The reason is the S90 eyeball's real finding: free text let a
// student answer "No movie", and the templated reaction praised it ("great
// pick") while Pikachu shouted it back. A flow that congratulates a brush-off
// proves nobody is listening. Chips fix that at the root rather than patching
// it — every answer we can receive is one we authored a reaction for.
// `fun_fact_about`/`fun_fact` COLUMNS survive, same reasoning as `school`.
// S92 — `grade` became `about_you` (founder): class and pronoun are asked on ONE
// screen. It is the flow's only multi-answer beat, so it does NOT go through
// saveStep (which is one-step-one-column by design) — it has its own mutation,
// saveAboutYou. saveStep REJECTS it rather than half-writing it.
// S96 (ONB-5, the story reskin) — `pikachu` is GONE (founder: "leave Pikachu out
// of v0"). He was the flow's echo beat AND the loader's courier; both jobs move
// to Olórin, who now has a body (a sketch) and can carry them. The reason is
// style, not sentiment: a bright yellow Pokémon inside a pencil-drawn
// Middle-earth reads as two products. He is parked, not killed.
//
// ⚠️ A row can still hold current_step='pikachu' — real students walked S91–S95.
// A step this array no longer names would resume nowhere, so the SERVER maps a
// retired step forward (see RETIRED_ONBOARDING_STEPS). Deleting a step is never
// just a deletion from this list.
export const ONBOARDING_STEPS = [
  "greet",
  "about_you",
  "fav_character",
  "pet",
  "phone",
  "done",
] as const;
export const OnboardingStep = z.enum(ONBOARDING_STEPS);
export type OnboardingStep = z.infer<typeof OnboardingStep>;

/**
 * Steps that USED to exist, mapped to where a student sitting on one should
 * resume. Read by the server when it loads a row (never by the client).
 *
 * This exists because a stored `current_step` outlives the flow that wrote it:
 * `pikachu` rows are real (S91–S95 walks), and without this they'd resolve to
 * "unknown step" and either trap the student or silently restart them at greet,
 * replaying beats they already answered. Mapping to the SUCCESSOR is what makes
 * removing a beat safe — the student loses the retired beat, nothing else.
 */
export const RETIRED_ONBOARDING_STEPS: Record<string, OnboardingStep> = {
  pikachu: "pet",
  // ONB-7 (founder): the Gandalf reveal leaves onboarding — Olórin introduces
  // himself later in the product, at a moment the student is actually stuck.
  // A row parked on it resumes at the close.
  lore: "done",
  // S90/S91 cut these before the step list was the resume key; kept for the
  // same reason — a row that names them must still resolve somewhere real.
  school: "fav_character",
  fun_fact_about: "pet",
  fun_fact: "pet",
  grade: "about_you",
};

/** Where a stored step resumes: itself if live, its successor if retired. */
export function resolveOnboardingStep(stored: string): OnboardingStep {
  if ((ONBOARDING_STEPS as readonly string[]).includes(stored)) {
    return stored as OnboardingStep;
  }
  return RETIRED_ONBOARDING_STEPS[stored] ?? "greet";
}

// S92 — how Olórin refers to the student when he talks ABOUT them (to a tutor,
// in a report). Deliberately NOT a gender field:
//  - it has a consumer the moment tutor/parent copy needs a pronoun, whereas
//    "gender" would be stored and never read — the exact shape of `school`,
//    which S90 cut for being askable rather than needed;
//  - "just use my name" is a real answer, not a refusal, so a child who does
//    not want to answer has a dignified way through that still returns
//    something usable.
// 'name' means: use their first name instead of a pronoun.
export const PRONOUNS = ["he", "she", "name"] as const;
export const Pronoun = z.enum(PRONOUNS);
export type Pronoun = z.infer<typeof Pronoun>;

// S91 — fav_character is a CLOSED SET (founder: "we should not show input bar
// instead give option chips"). These are IDS, not words: the labels and every
// reaction live in the FE copy file, which owns the voice. Storing an id also
// keeps the reaction lookup total — a stored label could drift from the copy.
//
// This is what makes Pikachu's echo — the loudest repeat in the flow — provably
// safe: he can only ever shout a string we wrote ourselves. The value still
// arrives from a client, so the server validates it (a hand-rolled POST is the
// only way to miss the chips) and the FE still routes it through canEcho as
// defence in depth.
// S96 (ONB-5) — the roster grew to 11 and became PRONOUN-AWARE, and both
// changes are the same idea: the hero is no longer trivia, it is the character
// the story hands you. So the list a student sees is the list they'd actually
// pick from (`about_you` asks pronoun BEFORE this beat, so tailoring is free),
// and every hero pairs with a companion from their OWN universe — picking Jon
// and then meeting Ghost is the wink the whole beat exists for.
//
// ⚠️ This is the FULL set — the server validates against it and must accept any
// hero regardless of pronoun. The pronoun only decides what is SHOWN (see
// HEROES_BY_PRONOUN in the FE copy): a boy who wants Arya taps "more heroes"
// and gets her, and that pick must not 400. Validating per-pronoun would make
// the display default a cage, which is not what it is.
//
// `spider_man` and `gandalf` are GONE as picks: no founder art arrived for
// Spider-Man, and Gandalf-as-a-hero collides with the lore beat now that Olórin
// is a visible character in the story rather than a closing reveal.
export const FAV_CHARACTERS = [
  // shown to `he` by default
  "harry_potter",
  "jon_snow",
  "hiccup",
  "thor",
  "iron_man",
  "batman",
  "naruto",
  // shown to `she` by default
  "arya_stark",
  "daenerys",
  "mulan",
  "wonder_woman",
] as const;
export const FavCharacter = z.enum(FAV_CHARACTERS);
export type FavCharacter = z.infer<typeof FavCharacter>;

/**
 * The companion each hero brings — the pet that is PRE-SELECTED on the next
 * beat, with a wink ("Ghost has been waiting").
 *
 * Lives in contracts, not the copy file, because it is a RULE (which pet
 * defaults) rather than a voice (what Olórin says about it) — the probe asserts
 * against this, and a copy-file table would let the two drift.
 *
 * Partial by design: Wonder Woman has no canonical companion, so she gets a
 * free choice rather than an invented one. `undefined` here means "no default,
 * let them pick" — it is not a gap to be filled.
 */
export const HERO_COMPANION: Partial<Record<FavCharacter, Pet>> = {
  harry_potter: "owl",
  jon_snow: "direwolf",
  arya_stark: "direwolf",
  hiccup: "dragon",
  daenerys: "dragon",
  thor: "groot",
  naruto: "kurama",
  iron_man: "jarvis",
  batman: "alfred",
  // wonder_woman + mulan: deliberately absent — free pick. Mulan's Khan is a
  // real pairing, but no standalone horse art exists yet (he is only inside her
  // scene art), and a companion with no sticker cannot be handed over. v1.
};

// S91 — the pet (founder). Four temperaments + an OTHER escape hatch, which is
// why this is NOT a closed set server-side: `other` commits whatever the
// student types, so `pet` holds either one of these ids or free text.
//
// Deliberately four distinct self-images rather than four animals: the pick is
// the only read we get on how a student sees themselves, and 'owl vs dragon'
// says something that 'dog vs cat' does not.
//
// S92 — fox/panda gave way to direwolf/groot when the founder supplied real
// sticker art for all four. The art is the beat; emoji were always a stand-in.
// S96 (ONB-5) — three more, one per hero-universe that had no animal: Naruto's
// Kurama, Iron Man's JARVIS, Batman's Alfred (founder's call on the last two).
// JARVIS and Alfred are not animals, which is the point — "companion" is the
// category, and a butler who has seen everything is a better read on a student
// who picks Batman than any creature would be.
//
// Order matters: it is the render order of the pet cards, so the four originals
// stay first and read as the house set.
export const PETS = [
  "owl",
  "dragon",
  "direwolf",
  "groot",
  "kurama",
  "jarvis",
  "alfred",
] as const;
export const Pet = z.enum(PETS);
export type Pet = z.infer<typeof Pet>;

/**
 * True when `pet` is one of ours.
 *
 * ⚠️ Slice L closed the set — `saveStep` now REJECTS anything off this list, so
 * no new row can fail this check. It is still load-bearing, and the reason is
 * the only reason: rows written BEFORE Slice L hold free text (the retired
 * "something else" hatch), they are read on every dashboard and every resume,
 * and this is what routes them to the stand-in owl instead of to `undefined`.
 * A future migration that backfills those rows is what makes this deletable.
 */
export function isKnownPet(pet: string | null | undefined): pet is Pet {
  return Boolean(pet) && (PETS as readonly string[]).includes(pet!);
}

// The only SINGLE-answer beats → the onboarding column each writes. Anything
// not in here either takes no answer (greet/pikachu/lore) or is the multi-answer
// beat `about_you`, which has its own mutation. Both are rejected by saveStep.
export const ONBOARDING_ANSWER_COLUMNS = {
  fav_character: "favCharacter",
  pet: "pet",
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
