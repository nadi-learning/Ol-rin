// S90 — the echo guard.
//
// Onboarding repeats what a student types back at them: Olórin replies with
// their answer, and Pikachu shouts their favourite character. That is the whole
// charm of the flow, and it is also the risk — a child typing "FUCK YOU" into a
// free-text ask gets it rendered back in 52px display type, and Pikachu says it.
//
// SCOPE, so this is not mistaken for something it isn't:
//  - This is an ECHO guard, NOT moderation. It decides whether we REPEAT the
//    text, never whether we ACCEPT it. Every answer is stored verbatim either
//    way — the row is the record of what they typed, and sanitising storage
//    would only hide it from us.
//  - It is a deterministic word list on purpose (founder call, S90). An LLM
//    check was considered and rejected: it would put 1-3s of latency, a network
//    failure mode, and a per-call cost inside the first-run flow, to catch a
//    long tail that an invite-only audience of known students did not have.
//
//    ⚠️ THAT PREMISE IS GONE (Slice C / S110). The whitelist was deleted;
//    anyone who signs in becomes a student. The S90 note said "revisit when
//    public signup lands" — public signup HAS landed. But the revisit found
//    something more useful than "the tail got longer":
//
//    🔴 THIS GUARD IS AIMED AT THE WRONG INPUT.
//    Both canEcho() call sites guarded the CUSTOM PET free text.
//
//    ⚠️ SLICE L HAS NOW LANDED, and this prediction came true exactly: PET_OTHER
//    and the "Something else" hatch are deleted, saveStep validates `pet`
//    against the closed PETS set, and both canEcho() call sites are gone. The
//    only `kind:"text"` ask left in onboarding is the optional phone, which is
//    never echoed.
//
//    🔴 SO canEcho() NOW HAS ZERO LIVE CALL SITES. It is retained deliberately,
//    not by oversight: the founder's S110 decision below is still the plan, and
//    the word list + its probe legs are the thing that slice will re-aim. If you
//    are reading this because a dead-code sweep flagged it — the answer is to DO
//    the name slice, not to delete the guard.
//
//    Meanwhile the input that open signup actually exposed is UNGUARDED:
//    `displayName` (App.tsx:83) is `me.user.name`, straight from the Better
//    Auth signup name. It is echoed all through onboarding — the greet, and the
//    coronation's "The seat was always yours, {name}" — and never passes
//    through canEcho(). Anyone can now sign up under any display name.
//    It is also NOT confined to the student's own screen, which is what the
//    "blast radius is one screen" argument below rests on: appUser.name renders
//    in the tutor's student list (tutor.ts:176,515), parent surfaces
//    (parent.ts:114,138), the parent report (report.ts:125) and the voice tutor
//    (voice_pipecat.ts:257). Reaching those needs an admin link (Slice D), so
//    it is not open-broadcast — but it does leave the student's own screen.
//
//    DECIDED (founder, S110): point the guard at the NAME, as its own slice
//    with its own probe — deliberately NOT smuggled into Slice C. Until then
//    the word list stays exactly as-is; it costs nothing and still catches the
//    blunt cases on the path it currently covers.
//  - It WILL miss things (l33tspeak, spacing, anything not on the list). A miss
//    means Olórin echoes something crude back to the one child who typed it —
//    the blast radius is one screen, not a broadcast. That is the accepted cost.
//
// Word-boundary matched, never substring: "class" contains "ass", "Scunthorpe"
// contains the other one, and blocking those would be its own bug.
const BLOCKED = [
  "fuck",
  "fucking",
  "fucker",
  "shit",
  "bitch",
  "bastard",
  "cunt",
  "dick",
  "cock",
  "pussy",
  "slut",
  "whore",
  "rape",
  "nigger",
  "nigga",
  "faggot",
  "retard",
  "chutiya",
  "madarchod",
  "behenchod",
  "bhenchod",
  "randi",
  "gaand",
  "lund",
];

const PATTERN = new RegExp(`\\b(${BLOCKED.join("|")})\\b`, "i");

/**
 * True when `text` is safe to repeat back on screen.
 *
 * Empty/blank is NOT echoable — a caller asking "can I say this back?" about
 * nothing should take its no-answer branch, not render an empty quote.
 */
export function canEcho(text: string | null | undefined): boolean {
  const t = text?.trim();
  if (!t) return false;
  return !PATTERN.test(t);
}

// ── S91 — the refusal guard ────────────────────────────────────────────────
//
// The bug this exists for, caught by the founder's own walkthrough: they typed
// "No movie" and Olórin replied "No movie - great pick. That one's staying with
// me", then Pikachu shouted "Pika-pi... No movie!". A template mail-merges any
// string into praise, so the instant a student declines, the flow congratulates
// them for it — which proves, louder than anything else could, that nobody is
// listening. Praising a brush-off is worse than saying nothing.
//
// S91's chips remove most of the exposure (a closed set cannot be refused), so
// this now guards only the two free-text asks left: the custom pet and phone.
// Same stance as the blocklist above: deterministic, offline, and it gates what
// Olórin SAYS, never what we STORE. "No movie" in the row is honest data about
// a disengaged student; hiding it would only hide it from us.
const REFUSALS = [
  "no",
  "nope",
  "nah",
  "na",
  "none",
  "nothing",
  "no one",
  "noone",
  "nobody",
  "idk",
  "dunno",
  "i dont know",
  "i don't know",
  "dont know",
  "don't know",
  "dont care",
  "don't care",
  "n/a",
  "na na",
  "-",
  "nil",
  "skip",
  "pass",
  "no idea",
  "no comment",
];

/** Words that START a refusal — only when the whole answer stays short. */
const REFUSAL_LEADS = ["no", "not", "nothing", "none", "never"];

/**
 * True when `text` reads as a decline rather than an answer.
 *
 * The length rule is what protects real answers: a leading "no" only counts as
 * a refusal in a SHORT phrase. "No movie" (2 words) is a brush-off; "No Country
 * for Old Men - Anton" is somebody's actual favourite and must still be
 * celebrated. Getting that backwards would be a worse bug than the one this
 * fixes.
 *
 * Accepted cost, stated (same shape as the blocklist's): a creative refusal
 * ("wouldn't you like to know") still reads as an answer and gets praised. A
 * miss is one flat line on one screen, not a broadcast.
 */
export function looksLikeRefusal(text: string | null | undefined): boolean {
  const t = text?.trim().toLowerCase();
  if (!t) return false;

  // Strip trailing punctuation/emphasis so "no!!" and "nope." still match.
  const bare = t.replace(/[.!?,;:]+$/g, "").trim();
  if (!bare) return true; // punctuation only — not an answer either
  if (REFUSALS.includes(bare)) return true;

  const words = bare.split(/\s+/);
  if (words.length <= 2 && REFUSAL_LEADS.includes(words[0]!)) return true;

  return false;
}
