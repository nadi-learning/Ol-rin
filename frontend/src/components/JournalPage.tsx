import { useState } from "react";
import {
  firstName,
  heroCompositeImg,
  heroLabel,
  loaderPetImg,
  loaderPetSpoken,
} from "./onboarding.copy";
import { useTypewriter } from "../lib/useTypewriter";
import "./journal.css";

/**
 * What a journal IS, in Olórin's voice — the founder's ask this session.
 *
 * Three lines, and each earns its place: what it is, what he does with it, and
 * who else can see it. The last one is not filler — a student asked to write
 * down a bad day wants to know where it goes before they write anything.
 */
const EXPLAINER = [
  "A journal is where you tell me how the day actually went - typed, or just spoken out loud.",
  "I keep it. I notice what keeps tripping you up, and I bring it back when it matters.",
  "Nobody else reads it. This one is yours.",
].join("\n");

// Slice J — the Journal surface. A real AppView (D-J1) whose CONTENT is the
// coming-soon: the hero greets and asks about the day, and the shape of the
// thing being built sits blurred behind it.
//
// All classes are `.jrnl-`-scoped (the revision-shell.css global-leak discipline).
//
// There is NO backend here and no state. Journal writes nothing, reads nothing,
// and stores nothing yet — which is precisely why it can ship as a page instead
// of waiting on a table.

// ── the companion who fronts the page ──────────────────────────────────────
//
// Hero-led, with the PET as the fallback — never Olórin. S109's pivot took
// Olórin off every post-onboarding surface, so reaching for him here to cover a
// missing hero would quietly reopen a closed decision (D-J3).
//
// The fallback is load-bearing, not defensive: the hero art resolver returns
// undefined for a student who skipped the hero beat AND for a pre-S96 row
// holding free text (`fav_character`'s own schema comment records those). The
// label resolver tolerates them by echoing the raw value back, so such a student
// would otherwise get a printed `jon_snow` beside an empty image box.
// `loaderPetImg()` always resolves (owl stand-in), so this can never render a
// hole.
//
// Phrased without naming the headline-art call: the probe greps this file to
// prove the COMPOSITE resolver is the one used here, and a comment quoting the
// other one reddens the claim it exists to support (S115's finding).
function frontOf(hero: string | null, pet: string | null): { img: string; alt: string } {
  // The COMPOSITE art, not the headline art. The walk caught the difference:
  // iron_man's `img` is a full-bleed codex page, which at 150px beside a card
  // rendered as a dark rectangle rather than a character. `throneImg` is the
  // curated bust, and this slot has the same need the coronation does.
  const art = heroCompositeImg(hero);
  // Both halves must come from the SAME character. Taking the hero's label with
  // the pet's art (or the reverse) is the kind of mismatch that reads as a bug
  // to everyone except the code that produced it.
  if (art) return { img: art, alt: heroLabel(hero) ?? "Your hero" };
  return { img: loaderPetImg(pet), alt: loaderPetSpoken(pet) };
}

export function JournalPage({
  studentName,
  hero,
  pet,
}: {
  studentName: string;
  hero: string | null;
  pet: string | null;
}) {
  const front = frontOf(hero, pet);
  // First name only — the same rule the onboarding greets with and the first-run
  // tour reuses. "How was today, Amarnath Bollu?" reads like a form.
  const name = firstName(studentName);

  // Founder, this session — the page has to SAY what a journal is, in Olórin's
  // voice, typed the way onboarding types. Same hook, so there is one typing
  // feel in the product rather than two that drift.
  //
  // ⚠️ UNCONDITIONAL today, and that is a known gap, not an oversight. The ask
  // was "until at least one journal is created" — but Journal has no entries
  // backend at all (this whole page is a blurred mock, D-J2), so there is
  // nothing to count. When entries exist, THIS is the line that grows a
  // condition; until then a flag would be permanently false and would read as
  // though the rule were implemented.
  const [reducedMotion] = useState(
    () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false,
  );
  // One typewriter across all three lines, joined by newlines and rendered with
  // `white-space: pre-line` — three separate hooks would type the lines in
  // parallel, which reads as a wall appearing rather than someone speaking.
  const { visible, done } = useTypewriter(EXPLAINER, !reducedMotion, 22);

  return (
    <section className="jrnl" aria-labelledby="jrnl-head">
      <header className="jrnl-say">
        <img className="jrnl-front" src={front.img} alt={front.alt} draggable={false} />
        <div className="jrnl-bubble">
          <h1 className="jrnl-head" id="jrnl-head">
            How was today, {name}?
          </h1>
          {/* The full string is in the a11y tree from the first frame — a
              screen reader should not have to wait out an animation, and a
              live region would re-announce on every single character. */}
          <p className="jrnl-sub" aria-label={EXPLAINER}>
            <span aria-hidden="true">
              {visible}
              {!done && <span className="jrnl-caret" />}
            </span>
          </p>
        </div>
      </header>

      {/* The preview and the panel share ONE grid cell (`.jrnl-stage`) rather
          than the panel being absolutely positioned over the preview. Absolute
          takes the panel out of flow, so at 390 the copy would spill past the
          blurred art it sits on; sharing a cell makes the row as tall as the
          TALLER of the two, which is the behaviour that survives a phone. */}
      <div className="jrnl-stage">
      {/* ── the preview ────────────────────────────────────────────────────
          A blurred mock of the thing being built (D-J2), not a live surface.

          `aria-hidden` is NOT decoration here, it is correctness: without it a
          screen reader narrates four fabricated messages as though the student
          had written them. The blur hides that from sighted users only, so the
          non-visual path needs its own answer. Nothing inside is focusable for
          the same reason — these are divs, never buttons, so a keyboard tab
          cannot land inside a mock. */}
      <div className="jrnl-preview" aria-hidden="true">
        <div className="jrnl-thread">
          {/* Widths, not words. Lorem text under a blur is still text — it
              renders at a real length, gets selected by ctrl-A, and copies out
              as gibberish. Sized bars say "a conversation goes here" without
              ever being a sentence that doesn't exist. */}
          <div className="jrnl-msg jrnl-msg--them" style={{ width: "62%" }} />
          <div className="jrnl-msg jrnl-msg--me" style={{ width: "48%" }} />
          <div className="jrnl-msg jrnl-msg--them" style={{ width: "74%" }} />
          <div className="jrnl-msg jrnl-msg--me" style={{ width: "38%" }} />
        </div>
        <div className="jrnl-audio">
          <div className="jrnl-audio-orb" />
          <div className="jrnl-wave">
            {/* A fixed pattern, never a randomised one — a waveform that
                reshuffles on every render is motion nobody asked for, and it
                would make the walk's screenshots differ run to run for no
                reason. (Phrased without naming the RNG on purpose: the probe
                greps this file for that call, and a comment quoting it reddens
                the claim it exists to support — S115's finding, third time.) */}
            {[38, 64, 22, 88, 51, 73, 30, 95, 44, 60, 26, 81, 47, 69, 33].map((h, i) => (
              <span key={i} className="jrnl-wave-bar" style={{ height: `${h}%` }} />
            ))}
          </div>
        </div>
      </div>

      {/* The soon panel — ONCE on the page, over the preview it explains.
          Same rule as SoonBanner (`practice.css:90`), same reason. */}
      <div className="jrnl-soon">
        <h2 className="jrnl-soon-head">Not yet — but soon.</h2>
        <p className="jrnl-soon-body">
          Olórin and I are building this. Soon you'll be able to talk or type your day
          here, and I'll be listening.
        </p>
      </div>
      </div>
    </section>
  );
}
