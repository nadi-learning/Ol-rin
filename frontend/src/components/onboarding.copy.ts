import type { OnboardingStep } from "@b2c/kernel/contracts";

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

export type BeatInput =
  | { kind: "none"; cta: string }
  | { kind: "chips"; source: "grades" | "literal"; chips?: string[] }
  | { kind: "text"; placeholder: string };

export type Beat = {
  id: Exclude<OnboardingStep, "done">;
  /** What Olórin types. `{name}` is replaced with the student's first name. */
  prompt: string;
  /** A quieter second line under the prompt — context, never a new question. */
  sub?: string;
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

export const BEATS: Beat[] = [
  {
    id: "greet",
    prompt: "Hi {name}. I'm Olórin.",
    sub: "I'll be around while you study here. Two minutes and I'll leave you alone.",
    input: { kind: "none", cta: "Okay" },
    reaction: () => "",
  },
  {
    id: "grade",
    // The ONLY asked field with a consumer waiting (D-ONB-2). Chips, never free
    // text — "10th" / "X" / "tenth" all mean class 10 and none of them parse.
    prompt: "Which class are you in?",
    input: { kind: "chips", source: "grades" },
    reaction: (v) =>
      v === "10" || v === "12"
        ? `Class ${v}. Board year - we'll make it count.`
        : `Class ${v}. Good, we've got room to go deep.`,
  },
  {
    id: "school",
    prompt: "Which school?",
    sub: "Only so I know the shape of your year. Skip it if you'd rather not.",
    input: { kind: "text", placeholder: "Type your school…" },
    optional: true,
    reaction: (v) => (v ? `${v}. Noted.` : "Fair enough. Moving on."),
  },
  {
    id: "fav_character",
    prompt: "Favourite movie - and who's the best character in it?",
    sub: "Unrelated to physics. I'm just curious.",
    input: { kind: "text", placeholder: "e.g. Interstellar - Cooper" },
    reaction: (v) => (v ? `${v}. Noted - that one's staying with me.` : "No? Alright."),
  },
  {
    id: "pikachu",
    // 🔴 The PROMISE was killed, the ASK was kept (S85). We do NOT say "we'll
    // connect you with your favourite character" — that names a feature with no
    // build plan, to a child, in the first thing the platform ever says (the
    // same reasoning that killed the AVAIL countdown). The payoff is that
    // Pikachu reacts in the MOMENT: rare, real, and it costs nothing.
    prompt: "Someone heard you.",
    input: { kind: "none", cta: "Hi Pikachu" },
    reaction: () => "",
  },
  {
    id: "phone",
    // LAST, optional, with the reason stated (founder's call, revising "cut
    // it"). Nothing consumes it yet and it is child PII — so it is asked at the
    // END, where a refusal costs nothing. Mid-conversation it also shatters the
    // fiction: nobody chatting with you asks for your number third.
    prompt: "Last thing - a phone number?",
    sub: "Nothing sends to it today. It's there so a tutor can reach you if you ever get stuck. Skip is completely fine.",
    input: { kind: "text", placeholder: "Optional" },
    optional: true,
    reaction: (v) => (v ? "Got it. I won't use it for anything noisy." : "Skipped. Good - I'd have skipped it too."),
  },
  {
    id: "lore",
    // Both paths land the SAME reveal — the question is theatre, not a branch.
    prompt: "Do you know who Olórin is?",
    input: { kind: "chips", source: "literal", chips: ["Yes", "No"] },
    reaction: (v) =>
      v === "Yes"
        ? "Then you know the rest. Olórin was his name in the West, long before the grey hat."
        : "Olórin was his name in the West, before Middle-earth called him Gandalf. Same person, older story.",
  },
];

/** The second line of the lore reveal — always shown, whichever chip was tapped. */
export const LORE_CLOSER = "He mostly just helped people find their own way through. That's the job.";

/**
 * The Pikachu beat's payoff — reacting to what they ACTUALLY typed. This is the
 * whole reason the fav-character ask survived after the promise was cut: the
 * answer comes back at them, once, immediately.
 *
 * Falls back to a characterless line when they typed nothing, so the beat never
 * renders "Pika! Pika, ." at someone who skipped.
 */
export function pikachuLine(favCharacter: string | null): string {
  const c = favCharacter?.trim();
  if (!c) return "Pika! …Pika-pi?";
  return `Pika! Pika-pi... ${c}!`;
}

// The loader beat. The founder deliberately under-specified the fun activity
// ("will think about this later") — so it is isolated here and trivially
// replaced. ~2.5s minimum while complete() commits, so the finish reads as
// deliberate rather than as a hang.
export const LOADER_MIN_MS = 2500;
export const LOADER_TITLE = "Setting up your account…";
export const LOADER_LINES = [
  "Sorting your chapters…",
  "Sharpening a few questions…",
  "Feeding Pikachu…",
  "Hiding the boring bits…",
  "Almost there…",
];

export const BEAT_BY_ID: Record<string, Beat | undefined> = Object.fromEntries(
  BEATS.map((b) => [b.id, b]),
);
