import type { OnboardingStep, Pet } from "@b2c/kernel/contracts";
import { FAV_CHARACTERS, HERO_COMPANION, PETS, isKnownPet } from "@b2c/kernel/contracts";
import { looksLikeRefusal } from "../lib/safeEcho";
// Slice L — the pronoun row's two stickers (D-L1).
// ⚠️ These two files are PLACEHOLDER art (D-L2) — dashed frame, the word
// PLACEHOLDER printed on them. They sit at the final paths so the real
// sketches drop in as a file overwrite with no code change. The slot is
// aspect-independent by construction (`.onb-choice-img` is height-driven +
// `object-fit: contain`, the S114 lesson), so art of any shape lands correctly.
import pronounHe from "../assets/pronoun/he.png";
import pronounShe from "../assets/pronoun/she.png";
import petOwl from "../assets/pets/owl.png";
import petDragon from "../assets/pets/dragon.png";
import petDirewolf from "../assets/pets/direwolf.png";
import petGroot from "../assets/pets/groot.png";
import petKurama from "../assets/pets/kurama.png";
import petJarvis from "../assets/pets/jarvis.png";
import petAlfred from "../assets/pets/alfred.png";
import sceneOlorin from "../assets/scenes/olorin.jpg";
import sceneThrone from "../assets/scenes/throne.jpg";
import shire1 from "../assets/scenes/shire-1.jpg";
import shire2 from "../assets/scenes/shire-2.jpg";
import shire3 from "../assets/scenes/shire-3.jpg";
import shire4 from "../assets/scenes/shire-4.jpg";
import doodleJon from "../assets/scenes/doodle-jon.jpg";
import doodleNaruto from "../assets/scenes/doodle-naruto.jpg";
import heroHarry from "../assets/scenes/hero-harry_potter.jpg";
import heroHarry2 from "../assets/scenes/hero-harry_potter-2.jpg";
import heroHarry3 from "../assets/scenes/hero-harry_potter-3.jpg";
import heroJon from "../assets/scenes/hero-jon_snow.jpg";
import heroJon2 from "../assets/scenes/hero-jon_snow-2.jpg";
import heroJon3 from "../assets/scenes/hero-jon_snow-3.jpg";
import heroHiccup from "../assets/scenes/hero-hiccup.jpg";
import heroHiccup2 from "../assets/scenes/hero-hiccup-2.jpg";
import heroHiccup3 from "../assets/scenes/hero-hiccup-3.jpg";
import heroThor from "../assets/scenes/hero-thor.jpg";
import heroThor2 from "../assets/scenes/hero-thor-2.jpg";
import heroThor3 from "../assets/scenes/hero-thor-3.jpg";
// S123 — `hero-iron_man.jpg` (the da Vinci codex page) is no longer imported;
// the founder replaced it with the figure sketch below. The FILE is kept on
// disk deliberately: it is the founder's own art and a future full-bleed scene
// beat may want it. Nothing renders it today.
import heroIronManFigure from "../assets/scenes/hero-iron_man-figure.jpg";
import heroIronMan2 from "../assets/scenes/hero-iron_man-2.jpg";
import heroIronMan3 from "../assets/scenes/hero-iron_man-3.jpg";
import heroBatman from "../assets/scenes/hero-batman.jpg";
import heroBatman2 from "../assets/scenes/hero-batman-2.jpg";
import heroBatman3 from "../assets/scenes/hero-batman-3.jpg";
import heroNaruto from "../assets/scenes/hero-naruto.jpg";
import heroNaruto2 from "../assets/scenes/hero-naruto-2.jpg";
import heroNaruto3 from "../assets/scenes/hero-naruto-3.jpg";
import heroArya from "../assets/scenes/hero-arya_stark.jpg";
import heroArya2 from "../assets/scenes/hero-arya_stark-2.jpg";
import heroArya3 from "../assets/scenes/hero-arya_stark-3.jpg";
import heroDaenerys from "../assets/scenes/hero-daenerys.jpg";
import heroDaenerys2 from "../assets/scenes/hero-daenerys-2.jpg";
import heroDaenerys3 from "../assets/scenes/hero-daenerys-3.jpg";
import heroMulan from "../assets/scenes/hero-mulan.jpg";
import heroMulan2 from "../assets/scenes/hero-mulan-2.jpg";
import heroMulan3 from "../assets/scenes/hero-mulan-3.jpg";
import heroWonderWoman from "../assets/scenes/hero-wonder_woman.jpg";
import heroWonderWoman2 from "../assets/scenes/hero-wonder_woman-2.jpg";
import heroWonderWoman3 from "../assets/scenes/hero-wonder_woman-3.jpg";
// ONB-8 — iron_man's throne flank: his -3 helmet bust, PRE-MIRRORED to face
// the throne (a CSS scaleX(-1) sits too close to the multiply compositing).
import heroIronManThrone from "../assets/scenes/hero-iron_man-throne.jpg";

// Slice ONB-5 (S96) — THE STORY RESKIN. Every word Olórin says, in one file.
//
// Slice ONB-7 — THE LEAN CUT. The first two outside viewers both said the same
// thing: "onboarding is big and a lot of English to read." The founder's rule
// for the cut: keep the student and THE ROLE OF EACH CHARACTER; everything
// else goes. So: every character gets one job line (Olórin = guide, hero =
// beside you daily, pet = grows as you work), the hero payoff is one short
// page, the pet payoff page and the lore quiz are gone, the reveal is one
// screen, and the epilogue is ~10s. Total mandatory reading ≈ 200 words —
// probe:echoguard holds a word BUDGET so it cannot creep back up.
//
// Slice ONB-6 (S103) — THE JOURNEY REWRITE. The founder's video verdict on
// ONB-5: "the copy doesn't match... i want onboarding to be a journey that a
// student is part of", "each step should feel like a page of a nice fairy-tale
// comic", "the platform is commanding - it should talk in first person".
// So this file changed shape, not just words:
//  - VOICE: Olórin speaks in the FIRST PERSON throughout — he narrates and
//    invites, never instructs. "First things first" (a form's voice) became
//    "Every story opens the same way - with who you are" (a narrator's).
//  - PAGES: a beat can now end in Next-gated STORY PAGES instead of a timed
//    reaction. The hero and pet picks earn a payoff page (who they are, why
//    they're here, how they help — the founder: "we are not explaining who and
//    why the hero is here"); the lore beat became a THREE-page reveal, because
//    the old single reaction "vanished before someone read it".
//  - BUBBLES: the hero/pet speaks ONE line in a hand-lettered comic bubble on
//    their payoff page (founder: "add dialog of character if needed along the
//    sketches"). One line, in character, printed on the page — see the promise
//    bound below for why it must stay one line.
//  - COLLAGE scenes: beats dress the stage with several sketches at once, both
//    sides, the text column clear (founder: "it should be like a canvas of
//    sketches... only the text part should be empty").
//  - EPILOGUE: the loader is now a ~45s read-along close (founder: "make it
//    45 sec") — five pages of the world being made ready, not a spinner.
//
// OnboardingPage is a dumb walker over this; changing the script should never
// mean touching the component.
//
// ⚠️ The ORDER lives on the SERVER (ONBOARDING_STEPS in @b2c/kernel/contracts),
// not here. This file is keyed BY those ids. Two ordered lists drift, and the
// server computes the resume point — a drifted order would resume a half-done
// student at the wrong beat. Add a beat in contracts.ts first, then key it here.
// The story pages are CLIENT-SIDE sub-pages inside an existing beat — they add
// no steps, so a refresh mid-pages resumes at the NEXT beat (payoff skipped,
// never stuck).
//
// 🔴 THE PROMISE BOUND (founder, locked S96 / D-ONB-14). Onboarding may say the
// hero WALKS WITH YOU. It may NOT say you can talk to him, tell him about
// school, or share anything — that feature does not exist yet, and a child who
// tries on day 2 and finds nothing learns the story was a lie. The comic
// BUBBLES live inside this bound: a printed line on a page is the character
// PRESENT, like a quote at a chapter head — it is not an invitation to reply,
// and no bubble may ask the student a question or promise an answer.
// ⚠️ If you are adding copy to this file: presence, never conversation.
//
// The load-bearing idea from ONB-1 still holds: a typewriter + an input bar is
// an interrogation in a friendly font. What makes this a conversation is that
// Olórin says something back to YOUR answer before the next ask — now usually
// as a story page rather than a timed line. Zero AI, all templated.
//
// 🔴 S91 — WHY THE FREE TEXT IS GONE. A template will mail-merge ANY string into
// praise. Chips fix it at the root: every answer we can receive is one we wrote
// a reaction for.
//
// 🔑 Slice L FINISHED that job. The custom pet was the last free-text answer
// that got echoed, and it was guarded twice (canEcho + looksLikeRefusal) rather
// than closed. It is now a closed set, enforced server-side in saveStep. The
// only `kind:"text"` ask left in the whole flow is the optional phone, and the
// phone is never repeated back.
//
// ⚠️ ECHOING: any reaction that repeats what the student typed MUST go through
// canEcho() (lib/safeEcho.ts) and have a no-echo fallback. Nothing in this file
// does any more — but the rule stands for whatever is added next, and note that
// the ONE echoed value the flow still has is the student's own `displayName`,
// which comes from signup and has never passed through the guard (see the
// standing note at the top of lib/safeEcho.ts).

/** One option on a chip beat. `value` is what persists; `label` is what they read. */
export type ChipOption = { value: string; label: string; hint?: string; img?: string };

/**
 * S92 — one row of a duo beat: a label and its options, rendered as a line of a
 * sentence the student fills in. `style` picks the control's look.
 */
export type DuoRow = {
  /**
   * ⚠️ `examBoard`, NOT `board` (Slice E). `DuoRow.style: "board"` already means
   * "little classroom slate" in this file, and a third sense of the word here
   * — tenant, control shape, and answer key — would be genuinely confusing to
   * read. The exam board is the TENANT; it is stored in `membership`, never in
   * the onboarding answers.
   */
  key: "examBoard" | "grade" | "pronoun";
  label: string | ((ctx: BeatCtx) => string);
  /**
   * 'board'   little classroom slates (founder)
   * 'pill'    the usual chips
   * 'sticker' (Slice L) sticker-forward cards — the SAME `.onb-choice` +
   *           `.onb-choice-img` pair the pet beat uses. The pattern existed
   *           since S91 but lived only in the `kind:"chips"` branch, so the
   *           duo branch ignored `img` entirely; this is that one look, now
   *           reachable from both.
   */
  style: "board" | "pill" | "sticker";
  /**
   * Literal options, or a DYNAMIC SOURCE fetched at render time. There are two
   * such sources since Slice E, so this is a discriminator rather than the old
   * `null` sentinel — `null` could only ever mean "the grades", and silently
   * meaning "whichever dynamic list this row happens to want" is how the wrong
   * list ends up under the wrong label.
   *   grades — the board's REAL grades (D-ONB-2)
   *   boards — the exam boards that have a catalogue (Slice E)
   */
  chips: ChipOption[] | { source: "grades" | "boards" };
};

// S123 — `aside` (Slice L / D-L1) is DELETED along with its only user, the
// pronoun row's "just {name}" opt-out (founder). Deleted rather than left as
// unused machinery, the same call Slice L made about `OtherOption` below (M59).
//
// Worth keeping the reason it existed, because it is a real layout constraint
// and the next third option will hit it again: a third STICKER would have
// needed a drawing of "no pronoun" and would have read as a third gender, and a
// leftover PILL beside two cards is the accident the pet hatch already made
// once. An aside — quieter, on its own line, still a full answer — was the
// shape that fit. There is simply no longer anything to fit.

// Slice L — `OtherOption` (the "something else" escape hatch on a chip beat,
// S91) is DELETED along with its only user, the custom pet. Deleted rather
// than left unused (M59); the reason it went is worth keeping:
//
// 🔑 It was the flow's LAST free-text answer that gets echoed. Every other ask
// is a closed set precisely so that "Olórin can only say something we wrote"
// is true by construction rather than by guarding — and the hatch was the one
// hole in that, patched twice over (canEcho + looksLikeRefusal) instead of
// closed. It also promised a pet we never built ("2-3 dayssss"), which was
// hand-fulfillable at invite-only scale and stopped being so when signup
// opened in S110. Closing the set retires the promise and the guards together.
//
// If a chip beat ever needs an escape hatch again, this type is a clean
// re-add — but note that re-adding it re-opens the echo surface.

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
    }
  /** S92 — two picks on one screen, committed together (founder). */
  | { kind: "duo"; rows: DuoRow[]; cta: string }
  | { kind: "text"; placeholder: string };

/** Where a collage sketch hangs: four corners + the two mid-edges. */
export type CollageSlot = "tl" | "tr" | "bl" | "br" | "ml" | "mr";

/**
 * S96 — how a beat dresses the stage. The component reads this and renders the
 * art layer; it never names an image itself.
 *
 *  - `single`  one sketch, offset to a side, the words beside it.
 *  - `corners` four sketches, one per corner, the words in the middle.
 *  - `rotate`  the hero carousel: cycles art every ROTATE_MS until a pick lands.
 *  - `pair`    two sketches, left and right — the Olórin reveal, young + old.
 *  - `collage` (ONB-6) the comic page: an optional big `main` sketch on one
 *              side plus any number of slotted sketches — corners and
 *              mid-edges — with the text column kept clear. This is the
 *              founder's "canvas of sketches"; density is the point.
 */
export type Scene =
  | { kind: "single"; img: string; side?: "left" | "right"; alt: string }
  | { kind: "corners"; imgs: string[]; alt: string }
  | { kind: "rotate"; alt: string }
  | {
      kind: "pair";
      left: string;
      right: string;
      /** ONB-6 — corner sketches around the pair (founder, on the lore beat:
          "some sketches of shire or middle earth would be like wow"). */
      items?: { img: string; slot: CollageSlot }[];
      alt: string;
    }
  | {
      kind: "collage";
      main?: { img: string; side: "left" | "right" };
      items: { img: string; slot: CollageSlot }[];
      alt: string;
    };

/** One line of hand-lettered comic dialog — the character present on the page. */
export type Bubble = { text: string; by: string };

/**
 * ONB-6 — one Next-gated page of the story. The body TYPES (founder: "each
 * should come in typing animation... i want the user to have enough time to
 * follow along"), the bubble pops once the typing lands, and NOTHING advances
 * until the student hits the CTA — the fix for "a para comes all of a sudden
 * and it vanishes before someone read it".
 *
 */
export type StoryPage = {
  /** The headline — lands instantly (it is short); the body types under it. */
  title?: string;
  text: string;
  scene?: Scene;
  bubble?: Bubble;
  cta: string;
};

/** What a beat knows when it composes its words: the name, and what's been answered. */
export type BeatCtx = {
  name: string;
  /**
   * Slice E — this student has not committed to a board, so `about_you` is
   * asking THREE things rather than two. Copy that counts the questions has to
   * know, or it tells the student the wrong number.
   */
  needsBoard?: boolean;
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
   * `pet` asks differently once it knows who your hero is.
   */
  prompt: string | ((ctx: BeatCtx) => string);
  /** A quieter second line under the prompt — context, never a new question. */
  sub?: string | ((ctx: BeatCtx) => string);
  /** The art behind the words. A function when it depends on an earlier answer. */
  scene?: Scene | ((ctx: BeatCtx) => Scene | undefined);
  input: BeatInput;
  /** Shows a Skip control and lets the beat commit a null value. */
  optional?: boolean;
  /** Olórin's templated reply to the answer, shown before the next ask. */
  reaction: (value: string | null, ctx: BeatCtx) => string;
  /**
   * ONB-6 — the beat's payoff: Next-gated story pages shown INSTEAD of the
   * timed reaction. Returns undefined for beats that keep the quick reply.
   */
  pages?: (value: string | null, ctx: BeatCtx) => StoryPage[] | undefined;
};

/** First name only — Google gives "Amarnath Bollu"; "Hi Amarnath Bollu" reads like a bank letter. */
export function firstName(full: string): string {
  return full.trim().split(/\s+/)[0] || "there";
}

/** How long each hero's art holds before the carousel moves on (founder: 5s). */
export const ROTATE_MS = 5000;

// ── the heroes (S96, pages ONB-6) ──────────────────────────────────────────
//
// Keyed by the FAV_CHARACTERS ids in contracts. The id is what persists; every
// word and every image about it lives here. Each one gets its OWN reaction,
// story and bubble — that is the entire point of going closed-set. A shared
// "great pick!" for all eleven would be the same not-listening bug wearing chips.
//
// `story` is the payoff page's body — who this hero is, why they're in the
// platform, and how they walk with you (founder: "we need to explain everything
// about pet and hero"). It is where the hero's PRESENCE is promised — never
// conversation. `bubble` is the hero's one printed line, in character.
// `pages` is the extra art that composes their comic page around the text.
type HeroCopy = {
  label: string;
  img: string;
  /** The payoff page's extra sketches (the -2/-3 scenes). */
  pages: string[];
  /**
   * ONB-8 — which of the hero's three scans flanks the coronation throne.
   * Curated per hero (each scan was LOOKED AT): the composite needs a bust or
   * half-body portrait; a hero whose main art is a tiny figure in a big scene
   * (iron_man's codex page) scatters the whole close. Defaults to `img`.
   */
  throneImg?: string;
  /** Olórin's immediate quip — the payoff page's headline. */
  reaction: string;
  /** The payoff page's body: who they are, why they're here, who they bring. */
  story: string;
  /** The hero's own printed line. One line. Never a question to the student. */
  bubble: Bubble;
};

export const HEROES: Record<string, HeroCopy> = {
  harry_potter: {
    label: "Harry Potter",
    img: heroHarry,
    pages: [heroHarry2, heroHarry3],
    throneImg: heroHarry2,
    reaction: "The one who kept walking back into it. Brave isn't the same as unafraid.",
    story:
      "Harry never felt ready and walked in anyway. He's beside you on the days you don't feel ready - and his owl finds you anywhere.",
    bubble: { text: "First years never feel ready. You'll be fine - I had worse.", by: "Harry" },
  },
  jon_snow: {
    label: "Jon Snow",
    img: heroJon,
    pages: [heroJon2, heroJon3],
    throneImg: heroJon2,
    reaction: "The one who does the right thing the hard way. Every single time.",
    story:
      "Jon shows up when it's hard - especially then. That's what he does for you. Ghost pads along and misses nothing.",
    bubble: { text: "Some days I know nothing either. We keep going anyway.", by: "Jon" },
  },
  hiccup: {
    label: "Hiccup",
    img: heroHiccup,
    pages: [heroHiccup2, heroHiccup3],
    reaction: "The one who looked at the monster and thought: what if everyone's wrong?",
    story:
      "Hiccup asked the question nobody else would. He's here for the ones you're almost afraid to ask. Toothless flies wherever you go.",
    bubble: { text: "It's not impossible. It's just not finished yet.", by: "Hiccup" },
  },
  thor: {
    label: "Thor",
    img: heroThor,
    pages: [heroThor2, heroThor3],
    reaction: "Lost the hammer, kept the thunder. Turns out it was never the hammer.",
    story:
      "The thunder was never in the hammer. Thor walks with you on the days you feel ordinary - he knows better. Groot comes along.",
    bubble: { text: "Bring me the hardest question you have. I've met bigger.", by: "Thor" },
  },
  iron_man: {
    label: "Iron Man",
    // 🔑 S123 — the founder's replacement sketch. `img` was `heroIronMan`, the
    // da Vinci CODEX PAGE: a dark, full-bleed, ink-on-parchment scene that read
    // as a black rectangle wherever it was shrunk, and the single asset behind
    // the composite defect this journal logged twice (S117 D-K5, S118 M75).
    // The new figure is graphite on light ground like every other hero's art,
    // so it composes instead of blotting.
    //
    // ⚠️ HEADLINE ART ONLY. It is a FULL-BODY model sheet, and a full body in
    // the 190px composite slot is precisely the smudge S117/S118 shipped twice.
    // `throneImg` stays the helmet BUST for that reason — do not "simplify"
    // these two into one asset.
    //
    // ⚠️ NOT the flying pose the founder asked for; no flying scan exists in the
    // repo. This is the closest of what we hold, taken as the interim on their
    // "or something similar i might already shared with you". Still owed.
    img: heroIronManFigure,
    pages: [heroIronMan2, heroIronMan3],
    throneImg: heroIronManThrone,
    reaction: "A genius who builds his way out of trouble. We're going to get along.",
    story:
      "Tony builds his way out of everything. He's here to prove clever is practised, not born - you'll see. JARVIS comes along.",
    bubble: { text: "Genius is a habit. We'll make it yours.", by: "Tony" },
  },
  batman: {
    label: "Batman",
    img: heroBatman,
    pages: [heroBatman2, heroBatman3],
    reaction: "No powers. Just preparation. That's a study strategy, actually.",
    story:
      "No powers. Bruce just out-prepares everyone - and that's a thing you can learn. Alfred comes along; he's seen it done.",
    bubble: { text: "Train. Prepare. Win. In that order.", by: "Bruce" },
  },
  naruto: {
    label: "Naruto",
    img: heroNaruto,
    pages: [heroNaruto2, heroNaruto3],
    throneImg: heroNaruto3,
    reaction: "Never gives up, however long it takes. That's the whole trick, honestly.",
    story:
      "Bottom of his class, and he simply refused to stop. He's beside you on the days you want to quit. Kurama's been there from the start.",
    bubble: { text: "Believe it - we don't give up. Ever.", by: "Naruto" },
  },
  arya_stark: {
    label: "Arya Stark",
    img: heroArya,
    pages: [heroArya2, heroArya3],
    reaction: "Small, quick, and underestimated by everyone. Right up until she isn't.",
    story:
      "Arya learned what she wanted from anyone who'd teach her. She walks with you for that stubbornness - the kind that finishes things. Nymeria comes too.",
    bubble: { text: "What do we say to giving up? Not today.", by: "Arya" },
  },
  daenerys: {
    label: "Daenerys",
    img: heroDaenerys,
    pages: [heroDaenerys2, heroDaenerys3],
    throneImg: heroDaenerys3,
    reaction: "Walked into the fire and walked back out. With dragons.",
    story:
      "She was patient with three stone eggs until they woke. Daenerys walks with you while your own slow things grow. Her dragon comes too.",
    bubble: { text: "Small things grow. Mine flew.", by: "Daenerys" },
  },
  mulan: {
    label: "Mulan",
    img: heroMulan,
    pages: [heroMulan2, heroMulan3],
    reaction: "Practised until impossible looked easy. That's not magic, that's repetition.",
    story:
      "Mulan was still climbing after everyone else sat down. She's with you on the long climbs - again, and again, until it's easy.",
    bubble: { text: "Again. That's how it gets easy.", by: "Mulan" },
  },
  wonder_woman: {
    label: "Wonder Woman",
    img: heroWonderWoman,
    pages: [heroWonderWoman2, heroWonderWoman3],
    throneImg: heroWonderWoman3,
    reaction: "Strength and wisdom — she trained for both. That's the combination.",
    story:
      "Diana trained for years before anyone let her fight - she brings you the training and the kindness. She travels light, so your companion is your own call.",
    bubble: { text: "Courage first. The rest follows it.", by: "Diana" },
  },
};

/** The chips for the fav_character beat — derived from the contract, so a new id can't go unlisted. */
export const HERO_CHIPS: ChipOption[] = FAV_CHARACTERS.map((id) => ({
  value: id,
  label: HEROES[id]?.label ?? id,
}));

/**
 * S96 — which heroes show FIRST, by pronoun (founder: "the hero list cannot be
 * exact same for boy and girl").
 *
 * 🔴 This is a DEFAULT, not a gate. The server accepts any hero from any
 * pronoun (see FAV_CHARACTERS' comment) and the UI offers "more heroes", so a
 * girl who wants Iron Man gets Iron Man. The pronoun decides what is on top of
 * the pile, not what she is allowed to like — a list that refused would be the
 * app telling a child who they are, which is the opposite of this beat's job.
 *
 * `any` gets a MIX — the fallback when the pronoun is null or unrecognised, and
 * the one student we know nothing about. (It was keyed `name` until S123, for
 * the "just my name" opt-out the founder has since removed; the roster outlived
 * the option because a null pronoun still has to be answered.)
 */
// ⚠️ v0 IMBALANCE, known and accepted (founder: "the girl heroes are missing,
// which is Hermione and all... let's do that in v1 and consider this as v0").
// `she` is 4 and `he` is 7 until Hermione's art lands. It is visible but not
// broken — "more heroes" is one tap away and carries the other seven.
export const HEROES_BY_PRONOUN: Record<string, readonly string[]> = {
  he: ["harry_potter", "jon_snow", "hiccup", "thor", "iron_man", "batman", "naruto"],
  she: ["arya_stark", "daenerys", "mulan", "wonder_woman"],
  // 🔴 S123 RENAMED THIS KEY FROM 'name' TO 'any', AND THE RENAME IS THE POINT.
  // The founder removed the "just {name}" option, so 'name' is no longer a
  // pronoun anyone can hold — but this key was doing a SECOND, unrelated job:
  // it is the fallback roster for a NULL or unrecognised pronoun (see below).
  // Deleting it with the option would have left `heroesFor(null)` returning an
  // empty list, i.e. an onboarding step offering zero heroes and no way past.
  // A mixed roster is exactly right for "we don't know", so the list stays and
  // only the name changes to say what it is actually for.
  any: ["harry_potter", "arya_stark", "naruto", "daenerys", "iron_man", "mulan"],
};

/** The heroes to show first for a pronoun; everything else hides behind "more heroes". */
export function heroesFor(pronoun: string | null): {
  primary: ChipOption[];
  rest: ChipOption[];
} {
  const ids = HEROES_BY_PRONOUN[pronoun ?? "any"] ?? HEROES_BY_PRONOUN.any!;
  const primary = ids.filter((id) => id in HEROES).map((id) => ({ value: id, label: HEROES[id]!.label, img: HEROES[id]!.img }));
  const rest = FAV_CHARACTERS.filter((id) => !ids.includes(id)).map((id) => ({
    value: id,
    label: HEROES[id]!.label,
    img: HEROES[id]!.img,
  }));
  return { primary, rest };
}

/** The label for a stored value. Tolerates pre-S96 rows, which hold retired ids. */
export function heroLabel(value: string | null): string | null {
  if (!value) return null;
  return HEROES[value]?.label ?? value;
}

/** The picked hero's art, for the beats that keep it on the stage. */
export function heroImg(value: string | null): string | undefined {
  return value ? HEROES[value]?.img : undefined;
}

/**
 * The picked hero's art FOR A COMPOSITE — a character standing beside other
 * elements rather than owning the page.
 *
 * Slice J extracted this from `throneClose`, which had been the only caller.
 * It is deliberately a different question from `heroImg`: `img` is the hero's
 * headline art and some of it is a full-bleed SCENE (iron_man's is a da Vinci
 * codex page), which reads fine at page scale and scatters at 150px beside
 * text. `throneImg` is the per-hero curated bust — each one was looked at —
 * and every composite wants that one, falling back to `img` for the heroes
 * whose headline art already IS a portrait.
 *
 * One definition, because there are now two composites (the coronation and the
 * Journal front) and S116 left "one concept, two call sites" as a standing debt
 * rather than paying it twice.
 */
export function heroCompositeImg(value: string | null): string | undefined {
  if (!value) return undefined;
  const entry = HEROES[value];
  return entry ? (entry.throneImg ?? entry.img) : undefined;
}

// Slice K — a `heroArtVariants()` helper briefly lived here, returning all of a
// hero's scans so the Crew column could cycle them. It is deleted rather than
// left unused (M59), and the reason is worth keeping:
//
// 🔑 A hero has THREE scans but only ONE of them is composite-grade. The other
// two are full-bleed page scenes drawn for the onboarding comic, and dropped
// into a 190px slot they render as plates — which is the entire reason
// `throneImg` was curated in the first place. Cycling them put the exact art
// S117 banned from composites straight back into one (D-K5, caught by a
// screenshot while the walk ran 89/89 green).
//
// So a hero is in the same position as a pet: exactly one image that works
// beside a card. `heroCompositeImg` above already answers every question Crew
// has — which art, and whether any resolves at all.

// ── the pets (S91, art S92, companions S96, pages ONB-6) ───────────────────
//
// Everything about a pet lives in this one table: swap `img` and the label and
// nothing else moves. `spoken` is how the pet is named INSIDE a sentence
// ("Getting your owl…"). It exists because lowercasing the label is wrong for a
// proper noun: it produced "Getting your groot…". Species go lowercase, names
// keep their capital, and only this table knows which is which.
//
// S96 — `wink` is what Olórin says when this pet is the one your HERO brought.
// ONB-7 — the pet payoff PAGE is cut (the lean pass): the pick lands with the
// one-line reaction only, and the growth promise lives in the beat's ask.
type PetCopy = {
  label: string;
  spoken: string;
  img: string;
  reaction: string;
  /** Shown on the card when this pet is the picked hero's companion. */
  wink?: string;
};

export const PET_COPY: Record<string, PetCopy> = {
  owl: {
    label: "Owl",
    spoken: "owl",
    img: petOwl,
    reaction: "An owl. Quiet, watches everything, misses nothing. Good company for late nights.",
    wink: "Hedwig's been waiting.",
  },
  dragon: {
    label: "Dragon",
    spoken: "dragon",
    img: petDragon,
    reaction: "A dragon. Small now. That doesn't last - ask anyone who's raised one.",
    wink: "It hatched for you. They know.",
  },
  direwolf: {
    label: "Direwolf",
    spoken: "direwolf",
    img: petDirewolf,
    reaction: "A direwolf. Loyal to the people it picks, and it has picked you. Winter's fine, then.",
    wink: "Ghost has been waiting.",
  },
  groot: {
    label: "Groot",
    // A name, not a species — this is the whole reason `spoken` exists.
    spoken: "Groot",
    img: petGroot,
    reaction: "Groot. Says one sentence, means about nine. I like him already.",
    wink: "He helped forge the axe, you know.",
  },
  kurama: {
    label: "Kurama",
    spoken: "Kurama",
    img: petKurama,
    reaction: "Kurama. Nine tails, one very long memory, and absolutely no patience for excuses.",
    wink: "He's been with Naruto from the start.",
  },
  jarvis: {
    label: "JARVIS",
    spoken: "JARVIS",
    img: petJarvis,
    reaction: "JARVIS. He remembers what you forget, which - no offence - is going to be useful.",
    wink: "Tony never goes anywhere without a second brain.",
  },
  alfred: {
    label: "Alfred",
    spoken: "Alfred",
    img: petAlfred,
    reaction: "Alfred. He's watched a boy your age become Batman. He's not easily impressed - but he's never once left.",
    wink: "He's been doing this since Bruce was your age.",
  },
};

/** The stand-in when a pet has to be "arranged" — the owl covers the shift. */
const STAND_IN_PET = "owl";

export const PET_CHIPS: ChipOption[] = PETS.map((value) => ({
  value,
  label: PET_COPY[value]!.label,
  img: PET_COPY[value]!.img,
}));

/** The companion this hero brings, if any (Wonder Woman + Mulan bring nobody). */
export function companionFor(hero: string | null): Pet | undefined {
  if (!hero) return undefined;
  return HERO_COMPANION[hero as keyof typeof HERO_COMPANION];
}

/** The wink for a pet, but ONLY when it is this hero's own companion. */
export function petWink(pet: string, hero: string | null): string | undefined {
  return companionFor(hero) === pet ? PET_COPY[pet]?.wink : undefined;
}

// ── the about-you beat (S92, founder: "ask class and gender together") ─────
//
// Written as a SENTENCE the student completes, not two stacked form fields —
// that framing is what keeps a two-input screen inside the conversation
// instead of dropping out of it into a form.
//
// The pronoun row is NOT "what is your gender". Olórin asks for what he
// actually needs — the word he'll use when he mentions you to a tutor — and
// "just my name" is a first-class answer, so a child who would rather not say
// still gives a usable one. See the PRONOUNS contract.
//
// Slice E — the exam-board row is FIRST, and it is shown ONLY to a student who
// has not committed to a board yet (OnboardingPage filters it out otherwise;
// re-asking someone who already belongs somewhere would invite a switch that
// silently enrols them twice). First because the class list is board-scoped:
// asking "what class" before "whose syllabus" would mean showing chips we
// cannot know yet.
export const ABOUT_ROWS: DuoRow[] = [
  {
    key: "examBoard",
    label: "I'm studying",
    style: "board",
    chips: { source: "boards" },
  },
  {
    key: "grade",
    label: "I'm in class",
    style: "board",
    chips: { source: "grades" }, // the board's REAL grades (D-ONB-2)
  },
  {
    key: "pronoun",
    label: "and when I mention you to a tutor, I'll say",
    // Slice L (founder) — was `pill`. Two words on two capsules was the one
    // row in the flow that still looked like a form control; the rest of
    // onboarding picks things by their picture. Same classes as the pets.
    style: "sticker",
    chips: [
      { value: "he", label: "he", img: pronounHe },
      { value: "she", label: "she", img: pronounShe },
    ],
    // 🔴 S123 DELETED THE `aside` HERE — the "just {name}" opt-out (founder).
    // It was the last row in the flow offering a third, quieter way out, and
    // with it goes the only `aside` any row ever used. The `aside` support on
    // DuoRow went with it rather than being left as unused machinery (M59).
  },
];

/**
 * The hero payoff page (ONB-6). One page: the quip as headline, the story
 * typed, the hero's own sketches composed around it, and the hero's one
 * printed line. Next-gated — the founder's "it vanished before someone read
 * it" can no longer happen to the flow's biggest explanation.
 */
function heroPages(value: string | null): StoryPage[] | undefined {
  if (!value) return undefined;
  const h = HEROES[value];
  if (!h) return undefined;
  // Founder: "same more sketches of hero in the page its still the lot blank" —
  // so the hero's own two extra sketches take the LEFT column and a corner,
  // and the Shire fills the last blank corner. Three drawings + the main.
  const items: { img: string; slot: CollageSlot }[] = [];
  if (h.pages[0]) items.push({ img: h.pages[0], slot: "ml" });
  if (h.pages[1]) items.push({ img: h.pages[1], slot: "bl" });
  items.push({ img: shire2, slot: "tl" });
  return [
    {
      title: h.reaction,
      text: h.story,
      scene: {
        kind: "collage",
        main: { img: h.img, side: "right" },
        items,
        alt: `Sketches of ${h.label}`,
      },
      bubble: h.bubble,
      cta: "Next",
    },
  ];
}

// ONB-7 — the pet payoff page and the three-page reveal are CUT (the lean
// pass): the pet pick lands with its one-line reaction, and the reveal is the
// lore beat's own single screen. The role explanation those pages carried now
// lives in the beats' asks, one line each.

export const BEATS: Beat[] = [
  {
    id: "greet",
    // ONB-7 — the cover page, lean: who Olórin IS and what he DOES for you, in
    // one breath. Two colleagues' verdict on ONB-6 ("too big, a lot of English
    // to read") set the rule for every beat: role stated, story cut.
    prompt: "Hi {name} - I'm Olórin, your guide here.",
    sub: "I plan your prep, watch your progress, and stay with you till the boards. Shall we?",
    scene: {
      kind: "collage",
      main: { img: sceneOlorin, side: "right" },
      items: [
        { img: shire3, slot: "tl" },
        { img: shire4, slot: "bl" },
        { img: shire1, slot: "ml" },
      ],
      alt: "Olórin leaning on his staff, sketches of a far-off country beside him",
    },
    input: { kind: "none", cta: "Let's go" },
    reaction: () => "",
  },
  {
    id: "about_you",
    // S92 — class + pronoun on ONE screen (founder). Grade is still the only
    // asked field with a consumer waiting (D-ONB-2) and is still chips, never
    // free text: "10th" / "X" / "tenth" all mean class 10 and none of them parse.
    //
    // ONB-6 — the founder on the old opener: "'First things first' should
    // change to something interesting as it's the start of the journey." It is
    // now the narrator starting a book, and the corners grew two margin
    // doodles (founder: "more art... only the text part should be empty").
    // ⚠️ Slice E — the count is CONDITIONAL. A student who must still pick a
    // board is answering three things, and "Two quick things" above three rows
    // is the kind of small lie that makes a child distrust the rest of the
    // flow. The three-way phrasing leads with the board because that is the row
    // the other two depend on.
    prompt: (ctx: BeatCtx) =>
      ctx.needsBoard
        ? "Three quick things - your board, your class, and the word I use for you."
        : "Two quick things - your class, and the word I use for you.",
    scene: {
      kind: "collage",
      items: [
        { img: shire1, slot: "tl" },
        { img: shire2, slot: "tr" },
        { img: shire3, slot: "bl" },
        { img: shire4, slot: "br" },
        { img: doodleJon, slot: "ml" },
        { img: doodleNaruto, slot: "mr" },
      ],
      alt: "Pages of a sketchbook: hobbit-holes, a signpost, little pencil doodles",
    },
    input: { kind: "duo", rows: ABOUT_ROWS, cta: "That's me" },
    // The reaction reads the GRADE (the pronoun's payoff is that Olórin simply
    // uses it later — announcing it back would make a quiet courtesy loud).
    reaction: (v) =>
      v === "10" || v === "12"
        ? `Class ${v} - board year. We'll make it count.`
        : `Class ${v}! Good - room to go deep.`,
  },
  {
    id: "fav_character",
    // S96 — this stopped being trivia. The hero is the character the story hands
    // you, so the ask names the stakes instead of apologising for being nosy.
    // ONB-6 — the ask now EXPLAINS why a hero exists before asking (founder:
    // "we are not explaining who and why the hero is here").
    //
    // The art ROTATES behind the capsules every 5s until a pick lands (founder),
    // then settles on the picked hero — the settle IS the reward, which is why
    // nothing else animates on this beat.
    prompt: "Now - pick your hero.",
    sub: "They stand beside you every day you study. Your call, entirely.",
    scene: { kind: "rotate", alt: "Sketches of the heroes, one after another" },
    input: { kind: "chips", source: "literal", chips: HERO_CHIPS, cards: true },
    // Closed set ⇒ this lookup is total, and the fallback is unreachable from
    // the UI. It exists for pre-S96 rows (which hold retired ids like
    // 'spider_man' / 'gandalf') and hand-rolled requests only.
    reaction: (v) => (v && HEROES[v]?.reaction) || "Good pick. That one's staying with me.",
    pages: (v) => heroPages(v),
  },
  {
    id: "pet",
    // S91 (founder) — the flow's only GIVE. Beats of Olórin asking things become
    // the platform handing the student something they chose; the pet is the
    // first thing in the product that is theirs.
    //
    // S96 — the hero's own companion is PRE-SELECTED and winks ("Ghost has been
    // waiting"), but every other pet stays pickable (founder, agreed: a lock
    // turns the flow's only gift back into an assignment). Wonder Woman and
    // Mulan bring nobody, so their students get a clean free pick and the ask
    // reads differently — hence the function.
    prompt: (ctx) => {
      const hero = ctx.answers.favCharacter;
      const pet = companionFor(hero);
      if (pet && hero) {
        return `Ah - ${HEROES[hero]?.label ?? "your hero"} brought someone along.`;
      }
      return "Now your companion. Which one's yours?";
    },
    sub: (ctx) =>
      companionFor(ctx.answers.favCharacter)
        ? "Yours if you want them - or pick another. It grows as you work."
        : "It grows as you work - the more you study, the more it becomes.",
    scene: (ctx) => {
      const img = heroImg(ctx.answers.favCharacter);
      return img
        ? { kind: "single", img, side: "right", alt: heroLabel(ctx.answers.favCharacter) ?? "" }
        : undefined;
    },
    // Slice L — the "Something else" hatch is GONE and the set is closed.
    input: {
      kind: "chips",
      source: "literal",
      chips: PET_CHIPS,
      cards: true,
    },
    // Slice L — the custom and refusal branches went with the hatch: there is
    // no longer an input that can produce a value outside PETS, and saveStep
    // now rejects one server-side. `isKnownPet` still guards rather than a bare
    // lookup, because a PRE-Slice-L row holds free text and this reaction is
    // reachable from a resume.
    reaction: (v) => {
      if (!v) return "";
      return isKnownPet(v) ? PET_COPY[v]!.reaction : "";
    },
  },
  {
    id: "phone",
    // LAST-ish, optional, with the reason stated (founder's call, revising "cut
    // it"). Nothing consumes it yet and it is child PII — so it is asked at the
    // END, where a refusal costs nothing.
    // ONB-6 — first person, asking permission rather than requesting a field,
    // and the student's own companion carries the scene (it is picked by now):
    // the messenger asking how messages should travel.
    prompt: "Nearly there. May I keep a phone number?",
    sub: "So a real tutor can reach you when you're stuck. Nothing noisy - I promise.",
    scene: (ctx) => {
      const img = loaderPetImg(ctx.answers.pet);
      return { kind: "single", img, side: "left", alt: loaderPetAlt(ctx.answers.pet) };
    },
    input: { kind: "text", placeholder: "10-digit mobile, starting 6-9" },
    // Founder, this session: the Skip is GONE and every answer is now a
    // deliberate act. `optional` stays in the type — it is the beat-level
    // affordance, not a phone-specific one — but no beat sets it today.
    optional: false,
    // S91 — typing "no" here used to get "Got it! Nothing noisy, promise.",
    // which is the same not-listening bug on a smaller stage. A refusal keeps
    // its own voice even though there is no longer a skip to take: a student
    // who types "no" is still talking to someone, and answering them with
    // "Got it!" is the not-listening bug regardless of what the form allows.
    reaction: (v) =>
      !v || looksLikeRefusal(v)
        ? "I'll still need one to reach you - whenever you're ready."
        : "Got it! Nothing noisy, promise.",
  },
  // ONB-7 (founder): the `lore` beat — the Gandalf reveal — is CUT from
  // onboarding entirely. Olórin introduces himself later in the product, at a
  // moment the student is actually stuck (the "some of my best work happens in
  // the dark" surface, when it exists). The step is retired in contracts
  // (RETIRED_ONBOARDING_STEPS maps parked rows to `done`); the young/old pair
  // art waits in rewrite/art-pool for that later surface.
];

// ── the epilogue (ONB-6 — was "the loader"; ONB-7 — cut to ~10s) ───────────
//
// ONB-6 stretched the close to 45s at the founder's ask; the first two outside
// viewers called the flow "too big" and the founder approved the cut to two
// brisk pages over ~10s. The server finalize fires at the start; the pages
// pace themselves regardless.
//
// 🔴 THE 2-3 DAYSSSS PROMISE (D-ONB-7) IS RETIRED — Slice L. It survived in the
// custom-pet branch of page one, and its own caveat is what killed it: it was
// hand-fulfillable only at invite-only scale, and signup opened in S110. Rather
// than let the flow keep promising a pet nobody would make, the custom pet is
// gone and every student now leaves with one of the seven that exist.
//
// ⚠️ Students who onboarded BEFORE this slice may still hold a free-text pet.
// They are not broken: loaderPetImg/loaderPetAlt/loaderSay all fall back to the
// stand-in owl. That fallback is load-bearing, not leftover.
export const EPILOGUE_TOTAL_MS = 10_000;

export type EpiloguePage = {
  say: string | ((ctx: BeatCtx) => string);
  /** Foreground art for the page (scene jpg), or... */
  img?: string | ((ctx: BeatCtx) => string | undefined);
  /** ...the pet sticker, foreground — page one, the handover. */
  sticker?: boolean;
  /**
   * ONB-8 — the CORONATION close (founder: "instead of loader... a throne with
   * boy or girl sitting, hero and pet on both side and gandalf in back"). The
   * page renders the composited throne (see throneClose) instead of img/sticker.
   */
  throne?: boolean;
  /**
   * ONB-9 — Olórin's spoken line on the coronation (founder: "a comment from
   * Olórin should be also there"). Printed in the comic bubble the beats
   * already use, attributed to him, UNDER the composite — the narration line
   * stays put and stays unattributed. D-ONB-14 still binds: it is a line
   * printed on a page, never a question, never an input.
   */
  olorinSay?: string | ((ctx: BeatCtx) => string);
  /**
   * ONB-6 — the scene layer BEHIND the epilogue (founder: "loading page is
   * long blank use more sketches"). Same art layer as the beats, so the close
   * is drawn on the same paper as the story rather than on an empty grid.
   */
  scene?: Scene | ((ctx: BeatCtx) => Scene | undefined);
};

export const EPILOGUE_PAGES: EpiloguePage[] = [
  {
    // The handover — Olórin gives you the thing you chose. loaderSay carries
    // the known/custom/refusal branches (including the owl covering).
    say: (ctx) => loaderSay(ctx.answers.pet),
    sticker: true,
    scene: (ctx) => ({
      kind: "collage",
      main: { img: heroImg(ctx.answers.favCharacter) ?? sceneOlorin, side: "right" },
      items: [
        { img: shire1, slot: "ml" },
        { img: shire4, slot: "tl" },
      ],
      alt: "",
    }),
  },
  {
    // ONB-8 — the CORONATION. The words got shorter because the picture now
    // does the telling: the student ON the throne, their hero and companion at
    // its sides, Olórin behind. The hero's presence moved from the sentence
    // into the drawing — that is the whole trade.
    say: (ctx) =>
      ctx.answers.grade
        ? `The seat was always yours, ${ctx.name}. Class ${ctx.answers.grade} won't know what hit it.`
        : `The seat was always yours, ${ctx.name}. Your story starts now.`,
    throne: true,
    // His line makes the composition literal: he is drawn behind the throne,
    // and he says he is behind you. Guide role, first person, no question.
    olorinSay: "You chose every piece of this. Sit - I will be right behind you, always.",
    // Two corner doodles only — the composite is the show; four would bury it.
    scene: {
      kind: "collage",
      items: [
        { img: shire2, slot: "tl" },
        { img: shire3, slot: "br" },
      ],
      alt: "",
    },
  },
];

/**
 * ONB-8 — everything the coronation composite hangs on the stage, resolved
 * from the student's own picks. The component draws; this file decides WHAT.
 * A student with no hero gets throne + pet + Olórin (the frame still reads);
 * a custom pet gets the stand-in owl, same as the handover.
 */
export function throneClose(ctx: BeatCtx): {
  throne: string;
  olorin: string;
  hero: string | undefined;
  pet: string;
  /** she → the seated silhouette wears longer hair; he/name → cropped. */
  longHair: boolean;
  alt: string;
} {
  const hero = heroLabel(ctx.answers.favCharacter);
  return {
    throne: sceneThrone,
    olorin: sceneOlorin,
    // Slice J — was `heroEntry.throneImg ?? heroEntry.img` inline here. Same
    // resolution, now named and shared with the Journal front.
    hero: heroCompositeImg(ctx.answers.favCharacter),
    pet: loaderPetImg(ctx.answers.pet),
    longHair: ctx.answers.pronoun === "she",
    alt: `You on the throne, ${hero ?? "your hero"} and ${loaderPetAlt(ctx.answers.pet)} at your sides, Olórin behind you.`,
  };
}

/** The sticker that lands on the epilogue's first page. A custom pet gets the stand-in. */
export function loaderPetImg(pet: string | null): string {
  if (isKnownPet(pet)) return PET_COPY[pet]!.img;
  return PET_COPY[STAND_IN_PET]!.img;
}

/** Alt text — the sticker is the payoff, so it must not be invisible to a reader. */
export function loaderPetAlt(pet: string | null): string {
  if (isKnownPet(pet)) return PET_COPY[pet]!.label;
  return PET_COPY[STAND_IN_PET]!.label;
}

/**
 * Slice G — the companion's name INSIDE a sentence ("Tap {x} to talk").
 * `label` is Title-cased for buttons and alt text, so it produces "Tap Owl",
 * which reads like the owl is called Owl. `spoken` already draws the only
 * distinction that matters here — a NAME is capitalised, a SPECIES is not (see
 * the comment on groot) — so a species takes an article and a name does not.
 * Derived from `spoken`'s case rather than a second hand-maintained flag: one
 * of those can drift out of sync with the other, and this cannot.
 */
export function loaderPetSpoken(pet: string | null): string {
  const s = isKnownPet(pet) ? PET_COPY[pet]!.spoken : PET_COPY[STAND_IN_PET]!.spoken;
  const isName = s[0] === s[0]?.toUpperCase();
  return isName ? s : `the ${s}`;
}

/**
 * What OLÓRIN says as he hands the companion over (S96 — was Pikachu's line).
 *
 * Slice L — the "2-3 dayssss" branch is DELETED with the custom pet, and with
 * it the last line in the flow that echoed free text. The remaining fallback is
 * NOT dead code and must not be tidied away: a pre-Slice-L row holds whatever
 * that student typed, and this function still runs for them on a resume. It
 * says the owl covers, which is the truth for exactly those students — the
 * difference is that no NEW student can reach it, and nobody is promised a pet
 * we never built.
 */
export function loaderSay(pet: string | null): string {
  if (isKnownPet(pet)) return `Here - one ${PET_COPY[pet]!.spoken}, yours to keep. Look after each other.`;
  return "The owl volunteered to be yours. It usually does.";
}

export const BEAT_BY_ID: Record<string, Beat | undefined> = Object.fromEntries(
  BEATS.map((b) => [b.id, b]),
);
