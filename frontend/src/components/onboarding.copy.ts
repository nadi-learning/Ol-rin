import type { OnboardingStep, Pet } from "@b2c/kernel/contracts";
import { FAV_CHARACTERS, HERO_COMPANION, PETS, isKnownPet } from "@b2c/kernel/contracts";
import { canEcho, looksLikeRefusal } from "../lib/safeEcho";
import petOwl from "../assets/pets/owl.png";
import petDragon from "../assets/pets/dragon.png";
import petDirewolf from "../assets/pets/direwolf.png";
import petGroot from "../assets/pets/groot.png";
import petKurama from "../assets/pets/kurama.png";
import petJarvis from "../assets/pets/jarvis.png";
import petAlfred from "../assets/pets/alfred.png";
import sceneOlorin from "../assets/scenes/olorin.jpg";
import sceneGandalfYoung from "../assets/scenes/gandalf-young.jpg";
import sceneGandalfOld from "../assets/scenes/gandalf-old.jpg";
import sceneMoria from "../assets/scenes/moria.jpg";
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
import heroIronMan from "../assets/scenes/hero-iron_man.jpg";
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

// Slice ONB-5 (S96) — THE STORY RESKIN. Every word Olórin says, in one file.
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
// a reaction for. The only free text left is the custom pet, and it is guarded
// twice (canEcho + looksLikeRefusal).
//
// ⚠️ ECHOING: any reaction that repeats what the student typed MUST go through
// canEcho() (lib/safeEcho.ts) and have a no-echo fallback.

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
 * `trio` marks the fellowship page: hero + companion + Olórin rendered in the
 * FOREGROUND with their names — the one page where the art outranks the words.
 */
export type StoryPage = {
  /** The headline — lands instantly (it is short); the body types under it. */
  title?: string;
  text: string;
  scene?: Scene;
  bubble?: Bubble;
  /** Foreground sticker (the pet payoff page — the sticker IS the gift). */
  sticker?: { img: string; label: string };
  /** The fellowship page: hero art + pet sticker + Olórin, named, foreground. */
  trio?: {
    heroImg?: string;
    heroLabel: string;
    petImg: string;
    petLabel: string;
    olorinImg: string;
  };
  cta: string;
};

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
    reaction: "The one who kept walking back into it. Brave isn't the same as unafraid.",
    story:
      "You picked the one who never felt ready - not once, not for any of it. Harry walked in anyway, got it wrong, tried again with his friends beside him, and that is how the impossible got done. He walks with you for exactly the days you don't feel ready. His owl comes too; she'll find you anywhere.",
    bubble: { text: "First years never feel ready. You'll be fine - I had worse.", by: "Harry" },
  },
  jon_snow: {
    label: "Jon Snow",
    img: heroJon,
    pages: [heroJon2, heroJon3],
    reaction: "The one who does the right thing the hard way. Every single time.",
    story:
      "They told Jon he was nobody, so he kept his word until he was the one everybody counted on. That is his whole magic - showing up when it is hard, especially then. He walks with you through the long watches. Ghost pads along beside him and misses nothing you do.",
    bubble: { text: "Some days I know nothing either. We keep going anyway.", by: "Jon" },
  },
  hiccup: {
    label: "Hiccup",
    img: heroHiccup,
    pages: [heroHiccup2, heroHiccup3],
    reaction: "The one who looked at the monster and thought: what if everyone's wrong?",
    story:
      "The whole island said dragons could not be tamed. Hiccup asked the question nobody else would ask, and rewrote the book - he was the worst Viking there, and it never mattered once. He walks with you for the questions you are almost afraid to ask. Toothless flies wherever you two go.",
    bubble: { text: "It's not impossible. It's just not finished yet.", by: "Hiccup" },
  },
  thor: {
    label: "Thor",
    img: heroThor,
    pages: [heroThor2, heroThor3],
    reaction: "Lost the hammer, kept the thunder. Turns out it was never the hammer.",
    story:
      "Thor had everything handed to him, lost the lot, and found out the thunder was never in the hammer - it was in him the whole time. He walks with you on the days you feel ordinary, because he knows better than anyone that you are not. Groot helped forge his axe, and Groot comes along.",
    bubble: { text: "Bring me the hardest question you have. I've met bigger.", by: "Thor" },
  },
  iron_man: {
    label: "Iron Man",
    img: heroIronMan,
    pages: [heroIronMan2, heroIronMan3],
    reaction: "A genius who builds his way out of trouble. We're going to get along.",
    story:
      "Tony built the first suit in a cave, out of scrap, because clever is a thing you practise - not a thing you are born with. He walks with you to prove exactly that, one build at a time. JARVIS keeps track of everything he forgets, and he forgets plenty.",
    bubble: { text: "Genius is a habit. We'll make it yours.", by: "Tony" },
  },
  batman: {
    label: "Batman",
    img: heroBatman,
    pages: [heroBatman2, heroBatman3],
    reaction: "No powers. Just preparation. That's a study strategy, actually.",
    story:
      "No magic, no powers. Bruce simply out-prepares everyone in the room, every single time - and that, quietly, is a superpower you can learn. He walks with you while you build it. Alfred comes with him; he has watched this done before, since Bruce was your age.",
    bubble: { text: "Train. Prepare. Win. In that order.", by: "Bruce" },
  },
  naruto: {
    label: "Naruto",
    img: heroNaruto,
    pages: [heroNaruto2, heroNaruto3],
    reaction: "Never gives up, however long it takes. That's the whole trick, honestly.",
    story:
      "Bottom of his class, ignored by everyone, and he simply refused to stop. That is the entire secret, and it is not a secret. Naruto walks with you on the days you want to quit - he has had a thousand of them and quit on none. Kurama has been with him from the start.",
    bubble: { text: "Believe it - we don't give up. Ever.", by: "Naruto" },
  },
  arya_stark: {
    label: "Arya Stark",
    img: heroArya,
    pages: [heroArya2, heroArya3],
    reaction: "Small, quick, and underestimated by everyone. Right up until she isn't.",
    story:
      "Everyone told Arya what girls do. She went and learned the thing she actually wanted, one lesson at a time, from anyone who would teach her. She walks with you for exactly that stubbornness - the kind that finishes things. Nymeria never forgot her; direwolves don't.",
    bubble: { text: "What do we say to giving up? Not today.", by: "Arya" },
  },
  daenerys: {
    label: "Daenerys",
    img: heroDaenerys,
    pages: [heroDaenerys2, heroDaenerys3],
    reaction: "Walked into the fire and walked back out. With dragons.",
    story:
      "She started with nothing but a name and three stone eggs, and she was patient with them until they woke. Some things take that long, and they are always the ones worth having. Daenerys walks with you while your own slow things grow. Her dragon comes too.",
    bubble: { text: "Small things grow. Mine flew.", by: "Daenerys" },
  },
  mulan: {
    label: "Mulan",
    img: heroMulan,
    pages: [heroMulan2, heroMulan3],
    reaction: "Practised until impossible looked easy. That's not magic, that's repetition.",
    story:
      "Mulan was not the strongest recruit on that mountain. She was the one still climbing after everyone else sat down - and by the end, impossible looked easy. She walks with you on the long climbs, and she would tell you the trick out loud: again, and again, and again.",
    bubble: { text: "Again. That's how it gets easy.", by: "Mulan" },
  },
  wonder_woman: {
    label: "Wonder Woman",
    img: heroWonderWoman,
    pages: [heroWonderWoman2, heroWonderWoman3],
    reaction: "Strength and wisdom — she trained for both. That's the combination.",
    story:
      "Diana trained in secret for years before anyone let her near a battle, and she never once mistook being kind for being weak. She walks with you with both - the training and the kindness. She travels light, so your companion is entirely your own call.",
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
 * `name` (the "just my name" opt-out) gets a MIX — that path has to answer too,
 * and it is the one student we know nothing about.
 */
// ⚠️ v0 IMBALANCE, known and accepted (founder: "the girl heroes are missing,
// which is Hermione and all... let's do that in v1 and consider this as v0").
// `she` is 4 and `he` is 7 until Hermione's art lands. It is visible but not
// broken — "more heroes" is one tap away and carries the other seven.
export const HEROES_BY_PRONOUN: Record<string, readonly string[]> = {
  he: ["harry_potter", "jon_snow", "hiccup", "thor", "iron_man", "batman", "naruto"],
  she: ["arya_stark", "daenerys", "mulan", "wonder_woman"],
  name: ["harry_potter", "arya_stark", "naruto", "daenerys", "iron_man", "mulan"],
};

/** The heroes to show first for a pronoun; everything else hides behind "more heroes". */
export function heroesFor(pronoun: string | null): {
  primary: ChipOption[];
  rest: ChipOption[];
} {
  const ids = HEROES_BY_PRONOUN[pronoun ?? "name"] ?? HEROES_BY_PRONOUN.name!;
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

// ── the pets (S91, art S92, companions S96, pages ONB-6) ───────────────────
//
// Everything about a pet lives in this one table: swap `img` and the label and
// nothing else moves. `spoken` is how the pet is named INSIDE a sentence
// ("Getting your owl…"). It exists because lowercasing the label is wrong for a
// proper noun: it produced "Getting your groot…". Species go lowercase, names
// keep their capital, and only this table knows which is which.
//
// S96 — `wink` is what Olórin says when this pet is the one your HERO brought.
// ONB-6 — `story` is the payoff page's body (what this companion is FOR — the
// growth line is safe ONLY because the pet loop is the next slice, D-ONB-14),
// and `bubble` is the pet's own printed line. The creatures who can't talk get
// a stage direction instead of words — a direwolf that chats is nobody's
// direwolf.
type PetCopy = {
  label: string;
  spoken: string;
  img: string;
  /** The payoff page's sketches: art from this companion's OWN universe. */
  pages: string[];
  reaction: string;
  /** Shown on the card when this pet is the picked hero's companion. */
  wink?: string;
  /** The payoff page's body — what this companion does. */
  story: string;
  /** The pet's printed line (or stage direction, for the wordless ones). */
  bubble: Bubble;
};

export const PET_COPY: Record<string, PetCopy> = {
  owl: {
    label: "Owl",
    spoken: "owl",
    img: petOwl,
    pages: [heroHarry2, heroHarry3],
    reaction: "An owl. Quiet, watches everything, misses nothing. Good company for late nights.",
    wink: "Hedwig's been waiting.",
    story:
      "Your owl keeps the hours you keep - the late ones included. Every assignment you finish on time feeds her, and she grows the way you will: slowly, and then all at once. Look after each other and you'll both be fine.",
    bubble: { text: "(a slow, approving blink)", by: "Your owl" },
  },
  dragon: {
    label: "Dragon",
    spoken: "dragon",
    img: petDragon,
    pages: [heroHiccup2, heroDaenerys2],
    reaction: "A dragon. Small now. That doesn't last - ask anyone who's raised one.",
    wink: "It hatched for you. They know.",
    story:
      "Small now - and that will not last. Every assignment you finish on time feeds your dragon, and dragons remember exactly who fed them. Give it one term and see what you are flying.",
    bubble: { text: "(a small, proud puff of smoke)", by: "Your dragon" },
  },
  direwolf: {
    label: "Direwolf",
    spoken: "direwolf",
    img: petDirewolf,
    pages: [heroJon2, heroJon3],
    reaction: "A direwolf. Loyal to the people it picks, and it has picked you. Winter's fine, then.",
    wink: "Ghost has been waiting.",
    story:
      "A direwolf picks one person and stays picked - and it has picked you. Every assignment you finish on time feeds it, and it grows into something that walks beside you, not behind. Winters stop mattering rather quickly after that.",
    bubble: { text: "(watches you carefully - and stays)", by: "Your direwolf" },
  },
  groot: {
    label: "Groot",
    // A name, not a species — this is the whole reason `spoken` exists.
    spoken: "Groot",
    img: petGroot,
    pages: [heroThor2, heroThor3],
    reaction: "Groot. Says one sentence, means about nine. I like him already.",
    wink: "He helped forge the axe, you know.",
    story:
      "Groot will say one sentence to you and mean about nine of them. Every assignment you finish on time feeds him - and he grows. He really, truly grows. Ask Thor what he grew into.",
    bubble: { text: "I am Groot.", by: "Groot" },
  },
  kurama: {
    label: "Kurama",
    spoken: "Kurama",
    img: petKurama,
    pages: [heroNaruto2, heroNaruto3],
    reaction: "Kurama. Nine tails, one very long memory, and absolutely no patience for excuses.",
    wink: "He's been with Naruto from the start.",
    story:
      "Kurama has heard every excuse there is and believes precisely none of them - yours included. Every assignment you finish on time feeds him, and a nine-tailed fox on your side is worth an army. He knows it, too.",
    bubble: { text: "Hmph. Don't slow me down, kid.", by: "Kurama" },
  },
  jarvis: {
    label: "JARVIS",
    spoken: "JARVIS",
    img: petJarvis,
    pages: [heroIronMan2, heroIronMan3],
    reaction: "JARVIS. He remembers what you forget, which - no offence - is going to be useful.",
    wink: "Tony never goes anywhere without a second brain.",
    story:
      "JARVIS keeps track of everything you drop - dates, chapters, the one formula that always escapes you. Every assignment you finish on time sharpens him, and he only gets better at knowing what you need before you ask.",
    bubble: { text: "At your service. I've already taken notes.", by: "JARVIS" },
  },
  alfred: {
    label: "Alfred",
    spoken: "Alfred",
    img: petAlfred,
    pages: [heroBatman2, heroBatman3],
    reaction: "Alfred. He's watched a boy your age become Batman. He's not easily impressed - but he's never once left.",
    wink: "He's been doing this since Bruce was your age.",
    story:
      "Alfred has watched someone your age do the impossible from a standing start, so he is very hard to impress and completely impossible to lose. Every assignment you finish on time earns his attention - and his attention is worth more than it sounds.",
    bubble: { text: "Very good. I shall expect great things - quietly.", by: "Alfred" },
  },
};

/** The stand-in when a pet has to be "arranged" — the owl covers the shift. */
const STAND_IN_PET = "owl";

export const PET_CHIPS: ChipOption[] = PETS.map((value) => ({
  value,
  label: PET_COPY[value]!.label,
  img: PET_COPY[value]!.img,
}));

export const PET_OTHER: OtherOption = {
  label: "Something else",
  emoji: "✨",
  placeholder: "e.g. a llama",
  back: "← back to the list",
};

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

/** The pet payoff page — the sticker foreground, the mechanics typed. */
function petPages(value: string | null, ctx: BeatCtx): StoryPage[] | undefined {
  if (!value || !isKnownPet(value)) return undefined; // custom path keeps the quick reply
  const p = PET_COPY[value]!;
  const heroArt = heroImg(ctx.answers.favCharacter);
  const items: { img: string; slot: CollageSlot }[] = [];
  // The companion's OWN drawings — the art where this creature actually
  // appears, from its own universe. A direwolf page shows Ghost, not a
  // generic wolf.
  if (p.pages[0]) items.push({ img: p.pages[0], slot: "ml" });
  if (p.pages[1]) items.push({ img: p.pages[1], slot: "bl" });
  items.push({ img: shire3, slot: "tl" });
  return [
    {
      title: p.reaction,
      text: p.story,
      sticker: { img: p.img, label: p.label },
      scene: {
        kind: "collage",
        main: heroArt ? { img: heroArt, side: "right" } : undefined,
        items,
        alt: `Sketches of your ${p.spoken}`,
      },
      bubble: p.bubble,
      cta: "Next",
    },
  ];
}

/**
 * The three-page reveal (ONB-6). Page one: who Olórin is — IN THE FIRST
 * PERSON, because the founder's note was exact ("the platform is commanding…
 * it should talk in first person"), and "Olórin was MY name" is a different
 * sentence from "Olórin was his name". Page two: where he sits in the
 * platform — the role explanation that used to vanish. Page three: the
 * fellowship — hero, companion, wizard, named, together. The WOW is that the
 * student assembled this company themselves, one pick at a time.
 *
 * ⚠️ "when something feels impossible" is a promise about PRESENCE and it is
 * deliberately vague about mechanism, because no mechanism exists yet. Do
 * not sharpen it into a feature ("tap here for Olórin") until one does.
 */
function lorePages(value: string | null, ctx: BeatCtx): StoryPage[] {
  const hero = heroLabel(ctx.answers.favCharacter) ?? "your hero";
  const pet = ctx.answers.pet;
  const petSpoken = isKnownPet(pet) ? PET_COPY[pet]!.spoken : PET_COPY[STAND_IN_PET]!.spoken;
  const petImg = loaderPetImg(pet);
  const petLabel = loaderPetAlt(pet);
  const opening =
    value === "Yes"
      ? "Then you already know the rest. Olórin was my name in the West, long before Middle-earth started calling me Gandalf. Younger then - same eyes. I've spent a very long time walking with people through hard roads, and I haven't lost one yet."
      : "Olórin was my name in the West, long before Middle-earth started calling me Gandalf. Same person - older story. I've spent a very long time walking with people through hard roads, and I haven't lost one yet.";
  return [
    {
      title: "You've been talking to him.",
      text: opening,
      scene: {
        kind: "pair",
        left: sceneGandalfYoung,
        right: sceneGandalfOld,
        alt: "Two sketches of the same wizard, young and old",
      },
      cta: "Next",
    },
    {
      title: "So here's how we work.",
      text: `${hero} walks with you every single day - that's the whole job, showing up. Your ${petSpoken} grows every time you finish what you started. And me? You'll hardly see me at all. I turn up when something feels impossible. It's an old habit - some of my best work happens in the dark.`,
      scene: { kind: "single", img: sceneMoria, side: "right", alt: "A staff-light held up in a dark hall" },
      cta: "Next",
    },
    {
      title: ctx.answers.grade
        ? `Ready to conquer class ${ctx.answers.grade}, ${ctx.name}?`
        : `Ready when you are, ${ctx.name}.`,
      text: "This is your company - chosen by you, every one of them, and none of them going anywhere. The rest of the story happens inside, and it is already being written. Go on.",
      trio: {
        heroImg: heroImg(ctx.answers.favCharacter),
        heroLabel: hero,
        petImg,
        petLabel,
        olorinImg: sceneOlorin,
      },
      cta: "Turn the page",
    },
  ];
}

export const BEATS: Beat[] = [
  {
    id: "greet",
    // ONB-6 — the cover page. Olórin on the right, the world he's from on the
    // left (founder: "image on both sides... like a canvas of sketches"). The
    // sub carries the story's actual premise: every student gets a story, this
    // one is yours. That premise IS the onboarding.
    prompt: "Hey {name} - welcome to the home of Olórin. I hope you're keeping well.",
    sub: "Every student who comes through that door gets a story, and I keep every one of them - I've been at it a very long time. Yours is still a blank page. Shall we?",
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
    input: { kind: "none", cta: "Open the book" },
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
    prompt: "Before your story begins, let me understand who you are.",
    sub: "Two small things - your class, and the word I should use when I mention you to a tutor. Then we're off.",
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
        ? `Class ${v}! Board year - the big one. I've seen a hundred of these. We'll make it count.`
        : `Class ${v}! Good - we've got room to go deep.`,
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
    prompt: "Now - my favourite part.",
    sub: "On a long journey it helps to have a hero who is simply always there for you: someone who did impossible things badly first, and who shows up beside you every day you study. Pick the one you want. This choice is entirely yours.",
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
        return `Ah - someone else came along with ${HEROES[hero]?.label ?? "them"}.`;
      }
      return "Every student in my book gets a companion of their own. Which one's yours?";
    },
    sub: (ctx) =>
      companionFor(ctx.answers.favCharacter)
        ? "Yours if you want them - or pick another, nobody minds. A companion grows alongside you while you work. That's their whole magic."
        : "It grows alongside you while you work - that's its whole magic. It'll be waiting inside.",
    scene: (ctx) => {
      const img = heroImg(ctx.answers.favCharacter);
      return img
        ? { kind: "single", img, side: "right", alt: heroLabel(ctx.answers.favCharacter) ?? "" }
        : undefined;
    },
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
    pages: (v, ctx) => petPages(v, ctx),
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
    sub: "So we can stay in touch outside these walls too - a real tutor can reach you if you're ever properly stuck, and you'd hear from us when something matters. Nothing noisy, and nothing sends today. Skipping is completely fine; my owls usually manage.",
    scene: (ctx) => {
      const img = loaderPetImg(ctx.answers.pet);
      return { kind: "single", img, side: "left", alt: loaderPetAlt(ctx.answers.pet) };
    },
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
    // The reveal — ONB-6: now the flow's climax, three Next-gated pages (see
    // lorePages). The ask itself stays light; the weight is all in the payoff.
    prompt: "Last thing before the book opens - do you know who Olórin is?",
    sub: "Be honest. Most people only know my other name.",
    scene: {
      kind: "pair",
      left: sceneGandalfYoung,
      right: sceneGandalfOld,
      // The founder's "some sketches of shire or middle earth would be like
      // wow" on the flow's best page: the country he is from, in the corners
      // he is standing between.
      items: [
        { img: shire4, slot: "tl" },
        { img: shire2, slot: "tr" },
      ],
      alt: "Two sketches of the same wizard, young and old, and the country between them",
    },
    input: {
      kind: "chips",
      source: "literal",
      chips: [
        { value: "Yes", label: "Yes" },
        { value: "No", label: "No" },
      ],
    },
    // Unreachable when pages render (they always do for this beat); kept as the
    // G3 fallback so an unknown-step walker still has words to say.
    reaction: (v) =>
      v === "Yes"
        ? "Then you know the rest! Olórin was my name in the West, long before the grey hat."
        : "Olórin was my name in the West, before Middle-earth called me Gandalf. Same person, older story.",
    pages: (v, ctx) => lorePages(v, ctx),
  },
];

// ── the epilogue (ONB-6 — was "the loader") ────────────────────────────────
//
// The founder, on the 2.5s spinner: "the loader setting up is also like 5 sec
// make it 45 sec". So the close is no longer a wait — it is the story's
// epilogue: five slow pages of the world being made ready, read along at
// typewriter pace, with an HONEST progress bar filling underneath. The server
// finalize fires at the start; the pages pace themselves regardless.
//
// 🔴 THE 2-3 DAYSSSS PROMISE (D-ONB-7) survives in the custom-pet branch of
// page one. The stand-in owl arrives NOW, so no student is left waiting with
// nothing; the request is stored verbatim in onboarding.pet, so fulfilling one
// by hand is a real option at whitelist scale.
export const EPILOGUE_TOTAL_MS = 45_000;

export type EpiloguePage = {
  say: string | ((ctx: BeatCtx) => string);
  /** Foreground art for the page (scene jpg), or... */
  img?: string | ((ctx: BeatCtx) => string | undefined);
  /** ...the pet sticker, foreground — page one, the handover. */
  sticker?: boolean;
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
    say: "Now hold on while I get your place ready. Inking your chapters - every one you'll need this year, drawn fresh.",
    img: () => shire3,
    scene: {
      kind: "collage",
      items: [
        { img: shire1, slot: "ml" },
        { img: shire2, slot: "mr" },
        { img: shire4, slot: "tl" },
        { img: doodleJon, slot: "br" },
      ],
      alt: "",
    },
  },
  {
    say: "Sharpening the questions - the difficult ones, the ones that ask about you. I told them to behave. They won't.",
    img: () => sceneMoria,
    scene: {
      kind: "collage",
      items: [
        { img: sceneGandalfOld, slot: "mr" },
        { img: shire2, slot: "tl" },
        { img: doodleNaruto, slot: "bl" },
      ],
      alt: "",
    },
  },
  {
    say: (ctx) => {
      const hero = heroLabel(ctx.answers.favCharacter);
      return hero
        ? `And I've told ${hero} you're on the way. Waiting by the door already, of course.`
        : "And I've told your hero you're on the way. Waiting by the door already, of course.";
    },
    img: (ctx) => heroImg(ctx.answers.favCharacter) ?? sceneOlorin,
    scene: (ctx) => {
      const h = ctx.answers.favCharacter;
      const extra = h ? HEROES[h]?.pages ?? [] : [];
      const items: { img: string; slot: CollageSlot }[] = [{ img: shire3, slot: "tl" }];
      if (extra[0]) items.push({ img: extra[0], slot: "ml" });
      if (extra[1]) items.push({ img: extra[1], slot: "mr" });
      return { kind: "collage", items, alt: "" };
    },
  },
  {
    say: (ctx) =>
      ctx.answers.grade
        ? `And… hiding the boring bits. Done. Class ${ctx.answers.grade} won't know what hit it. Off you go, ${ctx.name}.`
        : `And… hiding the boring bits. Done. Off you go, ${ctx.name} - your story starts now.`,
    img: () => sceneOlorin,
    scene: {
      kind: "collage",
      items: [
        { img: shire4, slot: "ml" },
        { img: shire1, slot: "mr" },
        { img: shire2, slot: "tl" },
        { img: shire3, slot: "br" },
      ],
      alt: "",
    },
  },
];

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
 * What OLÓRIN says as he hands the companion over (S96 — was Pikachu's line).
 * The custom branch is the founder's "2-3 dayssss" line — with the owl
 * explicitly covering, so the student leaves with a companion either way.
 */
export function loaderSay(pet: string | null): string {
  if (isKnownPet(pet)) return `Here - one ${PET_COPY[pet]!.spoken}, yours to keep. Look after each other.`;
  const p = pet?.trim();
  if (!p || looksLikeRefusal(p) || !canEcho(p)) {
    return "The owl volunteered to be yours. It usually does.";
  }
  return `One ${p}, ordered - it'll reach you in 2-3 dayssss. The owl's covering till then.`;
}

export const BEAT_BY_ID: Record<string, Beat | undefined> = Object.fromEntries(
  BEATS.map((b) => [b.id, b]),
);
