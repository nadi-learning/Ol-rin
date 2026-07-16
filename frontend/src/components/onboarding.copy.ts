import type { OnboardingStep } from "@b2c/kernel/contracts";
import { FAV_CHARACTERS, isKnownPet } from "@b2c/kernel/contracts";
import { canEcho, looksLikeRefusal } from "../lib/safeEcho";
import petOwl from "../assets/pets/owl.png";
import petDragon from "../assets/pets/dragon.png";
import petDirewolf from "../assets/pets/direwolf.png";
import petGroot from "../assets/pets/groot.png";

// Slice ONB-1 — every word Olórin says, in one file. OnboardingPage is a dumb
// walker over this; changing the script should never mean touching the
// component.
//
// ⚠️ The ORDER lives on the SERVER (ONBOARDING_STEPS in @b2c/kernel/contracts),
// not here. This file is keyed BY those ids. Two ordered lists drift, and the
// server computes the resume point — a drifted order would resume a half-done
// student at the wrong beat. Add a beat in contracts.ts first, then key it here.
//
// The load-bearing idea: a typewriter + an input bar is an interrogation in a
// friendly font. What makes this a conversation is `reaction` — Olórin says
// something back to YOUR answer before the next ask. Zero AI, all templated.
// If you add a beat and skip its reaction, the flow degrades to a form.
//
// 🔴 S91 — WHY THE FREE TEXT IS GONE (founder call). The S90 eyeball found the
// real bug: a template will mail-merge ANY string into praise. The founder
// typed "No movie" and got "No movie - great pick. That one's staying with me",
// then Pikachu shouted it. A flow that congratulates a brush-off proves nobody
// is listening — and no amount of animation polish saves that. Chips fix it at
// the root: every answer we can receive is one we wrote a reaction for. The
// only free text left is the custom pet, and it is guarded twice (canEcho +
// looksLikeRefusal).
//
// ⚠️ ECHOING: any reaction that repeats what the student typed MUST go through
// canEcho() (lib/safeEcho.ts) and have a no-echo fallback. Olórin saying a
// child's answer back in 52px display type is the charm AND the risk.

/** One option on a chip beat. `value` is what persists; `label` is what they read. */
export type ChipOption = { value: string; label: string; hint?: string; img?: string };

/**
 * S92 — one row of a duo beat: a label and its options, rendered as a line of a
 * sentence the student fills in. `style` picks the control's look.
 */
export type DuoRow = {
  key: "grade" | "pronoun";
  label: string | ((ctx: BeatCtx) => string);
  /** 'board' = little classroom slates (founder); 'pill' = the usual chips. */
  style: "board" | "pill";
  /** Literal options, or null to use the board's REAL grades (D-ONB-2). */
  chips: ChipOption[] | null;
};

/**
 * The "something else" escape hatch on a chip beat (S91, founder). Tapping it
 * swaps the chips for a text field IN PLACE — it is not a separate step, so a
 * student who taps it and abandons resumes on the chips with nothing lost.
 */
export type OtherOption = {
  label: string;
  emoji?: string;
  placeholder: string;
  /** The way back, because a mis-tap must never be a trap. */
  back: string;
};

export type BeatInput =
  | { kind: "none"; cta: string }
  /** `big` renders the options as full-width choice cards rather than pills. */
  | {
      kind: "chips";
      source: "grades" | "literal";
      chips?: ChipOption[];
      big?: boolean;
      /** Sticker-forward picker cards — the art IS the appeal (S91/S92, pets). */
      cards?: boolean;
      other?: OtherOption;
    }
  /** S92 — two picks on one screen, committed together (founder). */
  | { kind: "duo"; rows: DuoRow[]; cta: string }
  | { kind: "text"; placeholder: string };

/** What a beat knows when it composes its words: the name, and what's been answered. */
export type BeatCtx = {
  name: string;
  answers: {
    grade: string | null;
    pronoun: string | null;
    favCharacter: string | null;
    pet: string | null;
    phone: string | null;
  };
};

export type Beat = {
  id: Exclude<OnboardingStep, "done">;
  /**
   * What Olórin types. A function when the ask depends on an earlier answer —
   * `lore` asks differently if you already told us Gandalf is your favourite.
   */
  prompt: string | ((ctx: BeatCtx) => string);
  /** A quieter second line under the prompt — context, never a new question. */
  sub?: string | ((ctx: BeatCtx) => string);
  input: BeatInput;
  /** Shows a Skip control and lets the beat commit a null value. */
  optional?: boolean;
  /** Olórin's templated reply to the answer, shown before the next ask. */
  reaction: (value: string | null) => string;
};

/** First name only — Google gives "Amarnath Bollu"; "Hi Amarnath Bollu" reads like a bank letter. */
export function firstName(full: string): string {
  return full.trim().split(/\s+/)[0] || "there";
}

/** The second line of the lore reveal — always shown, whichever chip was tapped. */
export const LORE_CLOSER = "He mostly helped people find their own way through. That's the job. Now, let's get you set up!";

// ── the characters (S91) ───────────────────────────────────────────────────
//
// Keyed by the FAV_CHARACTERS ids in contracts. The id is what persists; every
// word about it lives here. Each one gets its OWN reaction — that is the entire
// point of going closed-set. A shared "great pick!" for all six would be the
// same not-listening bug wearing chips instead of an input bar.
//
// `gandalf` is the deliberate one: picking him sets up the lore beat, which is
// already about Olórin being Gandalf. The wink costs nothing and lands later.
type CharacterCopy = { label: string; reaction: string };

export const CHARACTERS: Record<string, CharacterCopy> = {
  harry_potter: {
    label: "Harry Potter",
    reaction: "The one who kept walking back into it. Brave isn't the same as unafraid.",
  },
  iron_man: {
    label: "Iron Man",
    reaction: "A genius who builds his way out of trouble. We're going to get along.",
  },
  spider_man: {
    label: "Spider-Man",
    reaction: "Still does his homework between the swinging. Respect.",
  },
  batman: {
    label: "Batman",
    reaction: "No powers. Just preparation. That's a study strategy, actually.",
  },
  gandalf: {
    label: "Gandalf",
    reaction: "...Interesting. Hold that thought - we'll come back to it.",
  },
  naruto: {
    label: "Naruto",
    reaction: "Never gives up, however long it takes. That's the whole trick, honestly.",
  },
};

/** The chips for the fav_character beat — derived from the contract, so a new id can't go unlisted. */
export const CHARACTER_CHIPS: ChipOption[] = FAV_CHARACTERS.map((id) => ({
  value: id,
  label: CHARACTERS[id]?.label ?? id,
}));

/** The label for a stored value. Tolerates pre-S91 rows, which hold typed text, not ids. */
export function characterLabel(value: string | null): string | null {
  if (!value) return null;
  return CHARACTERS[value]?.label ?? value;
}

// ── the pets (S91, art S92) ────────────────────────────────────────────────
//
// Four temperaments, not four animals: the pick is the only read we get on how
// a student sees themselves. S92 replaced the placeholder emoji with the
// founder's sticker art (background removed, white halo added) — the art is the
// beat, and it is why this ask earns a whole screen. Everything about a pet
// lives in this one table: swap `img` and the label and nothing else moves.
// `spoken` is how the pet is named INSIDE a sentence ("Getting your owl…").
// It exists because lowercasing the label is wrong for a proper noun: it
// produced "Getting your groot…". Species go lowercase, names keep their
// capital, and only this table knows which is which.
type PetCopy = { label: string; spoken: string; img: string; reaction: string; pika: string };

export const PET_COPY: Record<string, PetCopy> = {
  owl: {
    label: "Owl",
    spoken: "owl",
    img: petOwl,
    reaction: "An owl. Quiet, watches everything, misses nothing. Good company for late nights.",
    pika: "Pika-pi! One owl, coming right up!",
  },
  dragon: {
    label: "Dragon",
    spoken: "dragon",
    img: petDragon,
    reaction: "A dragon. Small now. That doesn't last - ask anyone who's raised one.",
    pika: "Pika! One dragon! ...Pikachu is fireproof. Probably.",
  },
  direwolf: {
    label: "Direwolf",
    spoken: "direwolf",
    img: petDirewolf,
    reaction: "A direwolf. Loyal to the people it picks, and it has picked you. Winter's fine, then.",
    pika: "Pika-pi! One direwolf! It's bigger than Pikachu!",
  },
  groot: {
    label: "Groot",
    // A name, not a species — this is the whole reason `spoken` exists.
    spoken: "Groot",
    img: petGroot,
    reaction: "Groot. Says one sentence, means about nine. I like him already.",
    pika: "Pika! One Groot! ...He said his name. That's it. That's the whole conversation.",
  },
};

/** The stand-in when a pet has to be "arranged" — the owl covers the shift. */
const STAND_IN_PET = "owl";

export const PET_CHIPS: ChipOption[] = Object.entries(PET_COPY).map(([value, c]) => ({
  value,
  label: c.label,
  img: c.img,
}));

export const PET_OTHER: OtherOption = {
  label: "Something else",
  emoji: "✨",
  placeholder: "e.g. a llama",
  back: "← back to the list",
};

// ── the about-you beat (S92, founder: "ask class and gender together") ─────
//
// Written as a SENTENCE the student completes, not two stacked form fields —
// "I'm in class __ , and when I talk about you I'll say __". That framing is
// what keeps a two-input screen inside the conversation instead of dropping out
// of it into a form, which is the failure the whole slice exists to avoid.
//
// The pronoun row is NOT "what is your gender". Olórin asks for what he
// actually needs — the word he'll use when he mentions you to a tutor — and
// "just my name" is a first-class answer, so a child who would rather not say
// still gives a usable one. See the PRONOUNS contract.
export const ABOUT_ROWS: DuoRow[] = [
  {
    key: "grade",
    label: "I'm in class",
    style: "board",
    chips: null, // the board's REAL grades (D-ONB-2)
  },
  {
    key: "pronoun",
    label: "and when I mention you to a tutor, I'll say",
    style: "pill",
    chips: [
      { value: "he", label: "he" },
      { value: "she", label: "she" },
      // The opt-out that still answers. Filled with their real first name at
      // render time, so it reads as a choice rather than a refusal.
      { value: "name", label: "just {name}" },
    ],
  },
];

export const BEATS: Beat[] = [
  {
    id: "greet",
    // S90: warmed per founder feedback ("the messages are not so greeting") —
    // the old draft read dry for the very first thing the platform ever says.
    prompt: "Hey {name}! Welcome in - I'm Olórin.",
    sub: "I'll be right beside you while you study here. Give me a minute to get to know you, then the place is all yours.",
    input: { kind: "none", cta: "Let's go" },
    reaction: () => "",
  },
  {
    id: "about_you",
    // S92 — class + pronoun on ONE screen (founder). Grade is still the only
    // asked field with a consumer waiting (D-ONB-2) and is still chips, never
    // free text: "10th" / "X" / "tenth" all mean class 10 and none of them parse.
    prompt: "First things first.",
    input: { kind: "duo", rows: ABOUT_ROWS, cta: "That's me" },
    // The reaction reads the GRADE (the pronoun's payoff is that Olórin simply
    // uses it later — announcing it back would make a quiet courtesy loud).
    reaction: (v) =>
      v === "10" || v === "12"
        ? `Class ${v}! Board year - the big one. We'll make it count.`
        : `Class ${v}! Nice - we've got room to go deep.`,
  },
  {
    id: "fav_character",
    // S91 — chips, not an input bar (founder). The ask narrowed with them: the
    // old "favourite movie, AND the best character in it?" was two questions in
    // one and invited a sentence. A picker asks one thing.
    prompt: "Now the important stuff - who's your favourite?",
    sub: "Nothing to do with studying. I'm just curious.",
    input: { kind: "chips", source: "literal", chips: CHARACTER_CHIPS },
    // Closed set ⇒ this lookup is total, and the fallback is unreachable from
    // the UI. It exists for pre-S91 rows and hand-rolled requests only.
    reaction: (v) => (v && CHARACTERS[v]?.reaction) || "Good pick. That one's staying with me.",
  },
  {
    id: "pikachu",
    // 🔴 The PROMISE was killed, the ASK was kept (S85). We do NOT say "we'll
    // connect you with your favourite character" — that names a feature with no
    // build plan, to a child, in the first thing the platform ever says (the
    // same reasoning that killed the AVAIL countdown). The payoff is that
    // Pikachu reacts in the MOMENT: rare, real, and it costs nothing.
    prompt: "Wait... I think someone heard you.",
    input: { kind: "none", cta: "Hi Pikachu!" },
    reaction: () => "",
  },
  {
    id: "pet",
    // S91 (founder) — the flow's only GIVE. Seven beats of Olórin asking things
    // becomes the platform handing the student something they chose; the pet is
    // the first thing in the product that is theirs. It is also the one beat
    // whose answer we deliberately don't know in advance ("something else"),
    // which is why it is the only echo-guarded ask left.
    prompt: "Now - every student here gets a pet. Which one's yours?",
    sub: "It'll be waiting for you inside.",
    input: {
      kind: "chips",
      source: "literal",
      chips: PET_CHIPS,
      cards: true,
      other: PET_OTHER,
    },
    reaction: (v) => {
      if (!v) return "";
      if (isKnownPet(v)) return PET_COPY[v]!.reaction;
      // The custom path: never repeat a refusal or a blocked word back in 52px
      // display type. Both fall through to the owl, who volunteers.
      if (looksLikeRefusal(v) || !canEcho(v)) {
        return "No strong feelings? Then the owl picks you. It usually does.";
      }
      return `A ${v}? Bold. Let me see what I can do.`;
    },
  },
  {
    id: "phone",
    // LAST-ish, optional, with the reason stated (founder's call, revising "cut
    // it"). Nothing consumes it yet and it is child PII — so it is asked at the
    // END, where a refusal costs nothing. Mid-conversation it also shatters the
    // fiction: nobody chatting with you asks for your number third.
    prompt: "Almost done - could I get a phone number?",
    sub: "Nothing sends to it today. It's just so a tutor can reach you if you're ever stuck. Skipping is completely fine.",
    input: { kind: "text", placeholder: "Optional" },
    optional: true,
    // S91 — typing "no" here used to get "Got it! Nothing noisy, promise.",
    // which is the same not-listening bug on a smaller stage. A refusal now
    // takes the skip voice, because that is what it is.
    reaction: (v) =>
      !v || looksLikeRefusal(v)
        ? "Skipped - honestly, I'd have skipped it too."
        : "Got it! Nothing noisy, promise.",
  },
  {
    id: "lore",
    // Both paths land the SAME reveal — the question is theatre, not a branch.
    // The closer rides in the same reaction: with no transcript (S90) there is
    // no second bubble to land it in.
    //
    // S91 — the Gandalf wink pays off here. Picking him at fav_character makes
    // this ask personal instead of rhetorical; the REVEAL is identical either
    // way, so the branch costs one line and no new state.
    prompt: (ctx) =>
      ctx.answers.favCharacter === "gandalf"
        ? "Right - about Gandalf. Do you know who Olórin is?"
        : "Last thing before I let you go - do you know who Olórin is?",
    input: {
      kind: "chips",
      source: "literal",
      chips: [
        { value: "Yes", label: "Yes" },
        { value: "No", label: "No" },
      ],
    },
    reaction: (v) =>
      (v === "Yes"
        ? "Then you know the rest! Olórin was his name in the West, long before the grey hat."
        : "Olórin was his name in the West, before Middle-earth called him Gandalf. Same person, older story.") +
      `\n\n${LORE_CLOSER}`,
  },
];

/**
 * The Pikachu beat's payoff — reacting to what they ACTUALLY picked. This is the
 * whole reason the fav-character ask survived after the promise was cut: the
 * answer comes back at them, once, immediately.
 *
 * S91: the value is now a closed-set id, so the label he shouts is one we
 * wrote — canEcho stays as defence in depth (the id arrives from a client) and
 * still covers pre-S91 rows, which hold whatever was typed.
 */
export function pikachuLine(favCharacter: string | null): string {
  const c = characterLabel(favCharacter)?.trim();
  if (!canEcho(c)) return "Pika! …Pika-pi?";
  return `Pika! Pika-pi... ${c}!`;
}

// ── the loader / the delivery ──────────────────────────────────────────────
//
// S91 (founder): "in loading pickchu should tell the getting your pet and
// sticker of pet should come upfront". So the close is no longer a spinner with
// a mascot — it is the moment the pet ARRIVES. Pikachu hands it over.
//
// 🔴 THE 2-3 DAYSSSS PROMISE. The founder asked for it explicitly and it is
// funny, but S85 killed "we'll connect you with your favourite character" for a
// reason: a promise made to a child, in the first thing the platform ever says,
// that nothing in the build plan fulfils. So it ships in the softened form —
// the gag stays AND a stand-in owl arrives NOW, so no student is ever left
// waiting with nothing. The request itself is stored in onboarding.pet, so
// fulfilling one by hand (drop in a sticker, it appears) is a real option at
// whitelist scale. Founder's call.
export const LOADER_MIN_MS = 2500;

export const LOADER_LINES = [
  "Sorting your chapters…",
  "Sharpening a few questions…",
  "Hiding the boring bits…",
  "Almost there…",
];

/** The sticker that lands on the loader. A custom pet gets the stand-in. */
export function loaderPetImg(pet: string | null): string {
  if (isKnownPet(pet)) return PET_COPY[pet]!.img;
  return PET_COPY[STAND_IN_PET]!.img;
}

/** Alt text — the sticker is the payoff, so it must not be invisible to a reader. */
export function loaderPetAlt(pet: string | null): string {
  if (isKnownPet(pet)) return PET_COPY[pet]!.label;
  return PET_COPY[STAND_IN_PET]!.label;
}

export function loaderTitle(pet: string | null): string {
  if (isKnownPet(pet)) return `Getting your ${PET_COPY[pet]!.spoken}…`;
  return "Setting up your account…";
}

/**
 * What Pikachu says as he hands the pet over. The custom branch is the founder's
 * "2-3 dayssss" line — with the owl explicitly covering, so the student leaves
 * with a pet either way.
 */
export function loaderPikaSay(pet: string | null): string {
  if (isKnownPet(pet)) return PET_COPY[pet]!.pika;
  const p = pet?.trim();
  if (!p || looksLikeRefusal(p) || !canEcho(p)) {
    return "Pika-pi! The owl volunteered! It's already here!";
  }
  return `Pika! One ${p}, ordered - it'll reach you in 2-3 dayssss! The owl's covering till then.`;
}

export const BEAT_BY_ID: Record<string, Beat | undefined> = Object.fromEntries(
  BEATS.map((b) => [b.id, b]),
);
