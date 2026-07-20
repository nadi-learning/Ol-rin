import { useEffect, useState } from "react";
import {
  ROTATE_MS,
  heroCompositeImg,
  heroLabel,
  loaderPetImg,
  loaderPetAlt,
  loaderPetSpoken,
} from "./onboarding.copy";
import "./crew.css";

// Slice K — the Crew surface. Who walks with you, and what they will each do.
//
// All classes are `.crew-`-scoped (the revision-shell.css global-leak discipline).
//
// No backend, no state that outlives the page, nothing stored — the same reason
// Journal could ship as a page (Slice J): this describes a cast the onboarding
// already chose, so there is nothing to read and nothing to write.

// ── what the crew will do ──────────────────────────────────────────────────
//
// D-K1 — these cards are PLAIN. Not one of them carries its own "coming soon"
// pill, even though none of it is built: the page carries a single soon panel
// at the foot and that panel speaks for everything above it. This is the rule
// inherited from SoonBanner (`practice.css:90`) and applied in Slices I and J —
// once per page, never per row. A per-row "soon" is what turned AVAIL v1 into a
// wall of 154 grey chips, and the plan's own line ("cards carry coming soon")
// is the third answer to a question already settled twice.
type Capability = { title: string; line: string };

// Three each, which is also the hero's art count — the collapsed column shows
// one card beside one scan, so the two cycles stay in step instead of drifting
// against each other.
const HERO_CAPS: readonly Capability[] = [
  { title: "Talks you through it", line: "Stuck halfway down a chapter? They'll walk the rest of it with you." },
  { title: "Answers out loud", line: "Ask it in your own words and hear it back. No typing when you'd rather not." },
  { title: "Remembers the hard parts", line: "The thing that didn't land last week is the thing they'll circle back to." },
];

const PET_CAPS: readonly Capability[] = [
  { title: "Always around", line: "On every page you open, in the corner, keeping you company." },
  { title: "Notices you turned up", line: "Every day you show up is a day they were there to see it." },
  { title: "Grows with you", line: "Small now. That doesn't last - it depends entirely on you." },
];

// ── the two columns ────────────────────────────────────────────────────────

type Column = {
  key: "hero" | "pet";
  /** The character's own name — never a role word. */
  name: string;
  /** One line under the name saying what they ARE to the student. */
  role: string;
  /**
   * 🔑 D-K5 — ONE image, never a cycle. A hero has three scans and a pet has
   * one, but only ONE of the hero's three is composite-grade: the other two are
   * full-bleed page scenes that render as plates beside a card, which is why
   * `throneImg` was curated at all. Cycling them re-admitted the exact defect
   * S117 closed. So both members are in the same position, and the column holds
   * its one good image while the CARDS carry the motion.
   */
  art: string;
  alt: string;
  caps: readonly Capability[];
};

/**
 * D-K4 — a hero with no art gets NO COLUMN, and the pet stands alone.
 *
 * This is a real population rather than a defensive branch, and it is the same
 * one D-J3 was written for: a student who skipped the hero beat has no answer
 * at all, and a pre-S91 row holds free text, which the label resolver echoes
 * back raw. Either way the art resolver comes back empty.
 *
 * The alternative — a placeholder frame under a printed `Interstellar - Cooper`
 * — is the "render a hole" failure the pet fallback exists to prevent
 * everywhere else. Here there is nothing to fall back TO: the pet already owns
 * the other column, so borrowing it would put the same animal on the page
 * twice. Reaching for Olórin is the option that is quietly forbidden (S109's
 * pivot took him off every post-onboarding surface), so the honest answer is
 * one column.
 */
function columnsFor(hero: string | null, pet: string | null): Column[] {
  const cols: Column[] = [];

  const heroArt = heroCompositeImg(hero);
  if (heroArt) {
    cols.push({
      key: "hero",
      // Non-null by construction: art only resolves for a hero the table knows,
      // and the table gives every one of those a label.
      name: heroLabel(hero) ?? "Your hero",
      role: "Who you talk to",
      art: heroArt,
      alt: heroLabel(hero) ?? "Your hero",
      caps: HERO_CAPS,
    });
  }

  // The pet ALWAYS resolves — every pet helper lands on the owl stand-in — so
  // this column can never be absent and the page can never be empty.
  cols.push({
    key: "pet",
    name: loaderPetAlt(pet),
    role: "Who stays with you",
    art: loaderPetImg(pet),
    alt: loaderPetSpoken(pet),
    caps: PET_CAPS,
  });

  return cols;
}

export function CrewPage({ hero, pet }: { hero: string | null; pet: string | null }) {
  const cols = columnsFor(hero, pet);

  // D-K3 — one timer for the whole page, not one per column. Two independent
  // intervals started at the same moment drift apart within a minute or two
  // (they are re-armed after each callback, not on a shared clock), and two
  // columns cycling almost-but-not-quite together reads as a stutter. A single
  // tick keeps them locked.
  const [tick, setTick] = useState(0);

  // Read once, not subscribed. A student who flips the OS setting mid-page is
  // not a case worth a listener; every other surface in this app reads it the
  // same way (`DashboardPage`, `RevisionLanding`, `OnboardingPage`).
  const [reducedMotion] = useState(
    () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false,
  );

  // Which column is opened up. `null` is the resting state and BOTH columns
  // cycle in it — that is the page as most students will first meet it.
  const [open, setOpen] = useState<"hero" | "pet" | null>(null);

  useEffect(() => {
    if (reducedMotion) return;
    const t = setInterval(() => setTick((i) => i + 1), ROTATE_MS);
    return () => clearInterval(t);
  }, [reducedMotion]);

  return (
    <section className="crew" aria-labelledby="crew-head">
      <header className="crew-say">
        <h1 className="crew-head" id="crew-head">
          Your crew
        </h1>
        <p className="crew-sub">
          You picked them. Here's what each of them is going to do.
        </p>
      </header>

      <div className={`crew-cols crew-cols--${open ?? "even"}`}>
        {cols.map((col) => {
          const isOpen = open === col.key;
          // The opened column stops cycling: motion under something the student
          // has just chosen to look at is the thing they were asking to stop.
          // It shows the whole card list instead, so nothing is lost by being
          // still. (The ART never cycles for anyone — see D-K5 on `art`.)
          const capIdx = isOpen ? 0 : tick % col.caps.length;

          return (
            <section
              key={col.key}
              className={`crew-col crew-col--${isOpen ? "open" : open ? "small" : "even"}`}
            >
              <button
                className="crew-pick"
                aria-expanded={isOpen}
                aria-controls={`crew-caps-${col.key}`}
                // Pressing the open column closes it back to the resting state,
                // so the student is never trapped in a view they can't leave.
                onClick={() => setOpen(isOpen ? null : col.key)}
              >
                <img className="crew-art" src={col.art} alt={col.alt} draggable={false} />
                <span className="crew-name">{col.name}</span>
                <span className="crew-role">{col.role}</span>
              </button>

              {/* Open: the whole list. Closed: one card at a time, cycling.
                  The list is the same either way — opening does not reveal
                  anything the resting page was hiding, it just stops asking the
                  student to wait for the rest. */}
              <ul className="crew-caps" id={`crew-caps-${col.key}`}>
                {(isOpen ? col.caps : [col.caps[capIdx]!]).map((cap) => (
                  <li key={cap.title} className="crew-cap">
                    <h3 className="crew-cap-title">{cap.title}</h3>
                    <p className="crew-cap-line">{cap.line}</p>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>

      {/* D-K1 — the soon, ONCE, at the foot, covering everything above it. */}
      <div className="crew-soon">
        <h2 className="crew-soon-head">Not yet — but soon.</h2>
        <p className="crew-soon-body">
          None of this is switched on yet. Olórin is still teaching them their jobs,
          and we'll tell you the day they're ready.
        </p>
      </div>
    </section>
  );
}
