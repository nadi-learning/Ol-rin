import { type ReactNode } from "react";
import { heroImg, heroLabel } from "./onboarding.copy";
import sceneSentinel from "../assets/scenes/sentinel.jpg";

// The shared TAITOR app shell — a floating white left nav rail beside a
// graph-paper canvas (the tutor-canvas layout from the reference). For the
// walking skeleton only "Revision" (book) is wired; the other rail items are
// on-design placeholders for later surfaces.

export type AppView =
  | "dashboard"
  | "journal"
  | "crew"
  | "revision"
  | "practice"
  | "insights"
  | "pace"
  | "profile";

type Props = {
  children: ReactNode;
  userName: string;
  /** Active surface — drives which rail item is highlighted. */
  view: AppView;
  onNavigate: (view: AppView) => void;
  /** Break the content out of the 920px reading cap (e.g. the Revision slide). */
  wide?: boolean;
  /**
   * Slice M — the student's hero answer, for the Crew rail item's hover reveal
   * ONLY. Optional and nullable on purpose: a student who skipped the hero beat
   * (or holds a pre-S96 free-text row) resolves to no art, and that rail item
   * simply falls back to its text tooltip. Nothing else in the shell reads it.
   */
  hero?: string | null;
};

export function AppShell({
  children,
  userName,
  view,
  onNavigate,
  wide = false,
  hero = null,
}: Props) {
  const initials = userName.trim().slice(0, 1).toUpperCase() || "?";

  return (
    <div className="app-shell">
      <nav className="nav-rail">
        {/* Slice G — the logo is INERT again. It used to summon a full-page
            Pikachu splash; the founder retired the easter egg along with every
            other Pikachu, so the trigger, the splash and its state went with
            it. Deliberately still a <div>, not a <button>: a button that does
            nothing is a worse affordance than no button. */}
        <div className="nav-logo" title="b2c" aria-hidden>
          <Logo />
        </div>

        <div className="nav-group">
          <RailItem
            label="Home"
            icon={<HomeIcon />}
            active={view === "dashboard"}
            onClick={() => onNavigate("dashboard")}
          />
          {/* Slice J (D-J1) — Journal is a REAL destination now, so the rail
              item stops being inert. `soon` is gone from here deliberately: the
              page itself carries the coming-soon, and that is the governing rule
              this whole pattern inherits from SoonBanner — once per page, never
              per row. A rail that said "soon" beside a page that opens would be
              two answers to one question. The badge STAYS: the red dot exists to
              draw the eye to a slot worth noticing, which is still true. */}
          <RailItem
            label="Journal"
            icon={<JournalIcon />}
            badge
            active={view === "journal"}
            onClick={() => onNavigate("journal")}
          />
          {/* Slice K (D-K2) — Crew sits HERE, in the companion group, and not in
              the vacated Search slot below. The lower group is the study tools
              (Revision, Practice, Insights, Pace plan); Crew is about who walks
              with you, which is the question Journal asks. Filing it beside
              Home/Journal is what makes the two groups mean something instead of
              being "the short one and the long one".

              No `soon`, for the same reason Journal dropped it in Slice J: the
              page opens, and the coming-soon lives once, on the page. */}
          {/* 🔑 Slice M (founder) — the Crew item is a SPARKLE, and hovering it
              shows the student their own hero.
              The label stays "Crew" and stays the `aria-label`: the icon is
              decorative and a sparkle names nothing on its own, so removing the
              word would leave a screen-reader user with an unnamed button.
              What the founder asked to change is what the EYE gets, and that is
              the icon plus the hover art. */}
          <RailItem
            label="Crew"
            icon={<SparkleIcon />}
            hoverArt={heroImg(hero)}
            hoverArtAlt={heroLabel(hero) ?? "Your hero"}
            // Founder, this session — Crew's "coming soon" was invisible from
            // the rail. The page itself has always said it, but nothing on the
            // way in did, so the sparkle read as a finished feature and the
            // student only learned otherwise after clicking.
            //
            // NOT the retired inert variant: this item still navigates, and the
            // page it opens is real. The sticker marks what the crew will DO as
            // unbuilt, which is a different claim from "this button is dead".
            soon
            active={view === "crew"}
            onClick={() => onNavigate("crew")}
          />
        </div>

        <div className="nav-spacer" />

        <div className="nav-group">
          <RailItem
            label="Revision"
            icon={<BookIcon />}
            active={view === "revision"}
            onClick={() => onNavigate("revision")}
          />
          <RailItem
            label="Practice"
            icon={<PencilIcon />}
            active={view === "practice"}
            onClick={() => onNavigate("practice")}
          />
          <RailItem
            label="Insights"
            icon={<ChartIcon />}
            active={view === "insights"}
            onClick={() => onNavigate("insights")}
          />
          <RailItem
            label="Pace plan"
            icon={<CalendarIcon />}
            active={view === "pace"}
            onClick={() => onNavigate("pace")}
          />
          {/* Slice K — the Search rail item is GONE. It had been inert since the
              walking skeleton and there is no search behind it, so it was a
              permanent promise nobody was working on. Its icon went with it
              rather than being left orphaned (M59: dead code that matches
              nothing reports no failure). */}
          <button
            className={`nav-avatar${view === "profile" ? " nav-avatar--active" : ""}`}
            aria-label={`${userName} - profile`}
            aria-current={view === "profile" ? "page" : undefined}
            onClick={() => onNavigate("profile")}
          >
            {initials}
            <span className="nav-tip">Profile</span>
          </button>
        </div>
      </nav>

      <main className="canvas graph-paper">
        <div className="canvas-accent canvas-accent--tl" />
        <div className="canvas-accent canvas-accent--br" />

        {/* 🔑 S123 — THE ARGONATH, LIFTED OUT OF THE DASHBOARD (founder: "these
            statues should be there on every screen, in the bg").
            They lived in `DashboardPage` anchored to `.dash`, so seven of the
            eight views never had them. Moved here they are shell furniture, and
            every view inherits them.
            Anchored to `.canvas` (z-index 0) rather than to the reading column,
            which is the change that makes "in the bg" literally true: the
            column paints ABOVE them (`.canvas-inner` is z-index 1), so they may
            pass behind the cards instead of having to fit in a gutter wide
            enough to clear them. That is what lets them show on a 1440 laptop
            at all — see the breakpoint note in app-shell.css. */}
        <img
          className="shell-sentinel shell-sentinel--left"
          src={sceneSentinel}
          alt=""
          aria-hidden="true"
        />
        <img
          className="shell-sentinel shell-sentinel--right"
          src={sceneSentinel}
          alt=""
          aria-hidden="true"
        />
        <div className={`canvas-inner${wide ? " canvas-inner--wide" : ""}`}>
          {children}
        </div>
      </main>
    </div>
  );
}

// Slice K — the inert variant is GONE, along with the last item that used it.
// `onClick` is required now rather than optional, so the compiler is what stops
// a future rail item from being added with nowhere to go — which is the failure
// the deleted variant used to dress up as a feature. Same move as D-J4, where
// the viewless dashboard tile type was tightened instead of left in place.
function RailItem({
  label,
  icon,
  active = false,
  badge = false,
  soon = false,
  hoverArt,
  hoverArtAlt,
  onClick,
}: {
  label: string;
  icon: ReactNode;
  active?: boolean;
  /** Red dot — draws the eye to a rail slot worth noticing. */
  badge?: boolean;
  /**
   * A visible "soon" sticker on the icon. The item still navigates and its page
   * is real — this marks the FEATURE as unbuilt, not the button as inert.
   * Distinct from `badge`, which says "new, go look".
   */
  soon?: boolean;
  /**
   * Slice M — art shown INSIDE the hover tooltip, above the label. Undefined
   * (the default, and every item but Crew) renders the plain text tip exactly
   * as before, so this is additive rather than a new tooltip variant everyone
   * has to opt out of.
   */
  hoverArt?: string;
  hoverArtAlt?: string;
  onClick: () => void;
}) {
  return (
    <button
      className={`nav-item${active ? " nav-item--active" : ""}`}
      // The sticker is aria-hidden below, so "soon" has to reach a screen
      // reader through the name — otherwise the one signal the sighted user
      // gets is the one signal the non-sighted user doesn't.
      aria-label={soon ? `${label} - coming soon` : label}
      aria-current={active ? "page" : undefined}
      onClick={onClick}
    >
      {icon}
      {badge && <span className="nav-dot" aria-hidden />}
      {soon && (
        <span className="nav-soon" aria-hidden>
          soon
        </span>
      )}
      <span className={`nav-tip${hoverArt ? " nav-tip--art" : ""}`}>
        {/* aria-hidden + empty alt: the button's aria-label already names this
            item, and announcing the hero here would name it twice. The art is
            a delight, not information. */}
        {hoverArt && (
          <img className="nav-tip-art" src={hoverArt} alt="" aria-hidden="true" draggable={false} />
        )}
        {/* When the art is showing, the HERO'S NAME replaces the item label
            rather than sitting above it: the tip was rendering "Harry Potter"
            and "Crew" as two stacked lines, which reads as a two-line caption
            on a 120px card and wrapped to three. The button's `aria-label` is
            still "Crew", so nothing is lost to a screen reader — this only
            changes what the eye gets, which is the founder's ask. */}
        {hoverArt ? (
          <>
            <em className="nav-tip-who">{hoverArtAlt ?? label}</em>
            {/* The hero's NAME replaces the label here, so without this the
                tooltip is the one place the sticker's claim disappears. */}
            {soon && <em className="nav-tip-soon">coming soon</em>}
          </>
        ) : (
          <>
            {label}
            {badge && <em className="nav-tip-new">new</em>}
            {soon && <em className="nav-tip-soon">coming soon</em>}
          </>
        )}
      </span>
    </button>
  );
}

/* --- inline icons (dependency-free, 1.6 stroke, rounded) --- */
const ic = {
  width: 22,
  height: 22,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.7,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

function Logo() {
  // a small sleeping-face doodle nod to the reference mark
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="2.5" y="6" width="19" height="12" rx="6" fill="#15162b" />
      <path d="M7 12c.7-.9 2.3-.9 3 0" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M14 12c.7-.9 2.3-.9 3 0" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}
function HomeIcon() {
  return (
    <svg {...ic} aria-hidden>
      <path d="M4 10.5 12 4l8 6.5" />
      <path d="M6 9.5V19h12V9.5" />
    </svg>
  );
}
function JournalIcon() {
  // The butterfly mark, redrawn in the rail's idiom: mono `currentColor`, so it
  // greys when inert and flips white on the active tile like every sibling.
  //
  // FILLED, not stroked — deliberate. The mark is four solid wings around a
  // centre seam; outlining them turns the negative space into cells and it
  // reads as a 2x2 grid icon at 22px. Filled keeps the silhouette (tall upper
  // wings, half-round lower wings, pinched waist) legible at rail size. The
  // cost is that it sits heavier than the 1.7-stroke siblings.
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M11.1 3.4H8.2A3.6 3.6 0 0 0 4.6 7v3.8c0 .9.5 1.7 1.4 2l5.1 2z" />
      <path d="M12.9 3.4h2.9A3.6 3.6 0 0 1 19.4 7v3.8c0 .9-.5 1.7-1.4 2l-5.1 2z" />
      <path d="M11.1 12.8v7.8H8.6a4 4 0 0 1 0-8c.9 0 1.7.2 2.5.2z" />
      <path d="M12.9 12.8v7.8h2.5a4 4 0 0 0 0-8c-.9 0-1.7.2-2.5.2z" />
    </svg>
  );
}
function BookIcon() {
  return (
    <svg {...ic} aria-hidden>
      <path d="M5 4h9a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z" />
      <path d="M5 17a3 3 0 0 1 3-3h9" />
    </svg>
  );
}
/**
 * Slice M (founder) — the Crew mark is a SPARKLE.
 *
 * A four-point star (the tall/short axis pair is what makes it read as a
 * sparkle rather than as a plus sign or a compass rose) plus one small
 * companion spark, which is what stops it reading as a "new"/AI badge — the
 * one meaning a lone four-point star has picked up everywhere else.
 *
 * FILLED, like the Journal butterfly and unlike the 1.7-stroke siblings: a
 * stroked star at 22px is four thin outlines with a hole in the middle and
 * loses its silhouette entirely at rail size.
 */
function SparkleIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M13 2.2c.2 3.1.7 5.2 1.9 6.5 1.2 1.2 3.3 1.8 6.4 2-3.1.2-5.2.8-6.4 2-1.2 1.3-1.7 3.4-1.9 6.5-.2-3.1-.7-5.2-1.9-6.5-1.2-1.2-3.3-1.8-6.4-2 3.1-.2 5.2-.8 6.4-2C12.3 7.4 12.8 5.3 13 2.2z" />
      <path d="M5.6 15.4c.1 1.5.3 2.5.9 3.1.6.6 1.6.8 3.1.9-1.5.1-2.5.3-3.1.9-.6.6-.8 1.6-.9 3.1-.1-1.5-.3-2.5-.9-3.1-.6-.6-1.6-.8-3.1-.9 1.5-.1 2.5-.3 3.1-.9.6-.6.8-1.6.9-3.1z" />
    </svg>
  );
}

// Slice M — CrewIcon is RETIRED, not deleted, and has no call sites. It is kept
// because the sparkle is a founder aesthetic call on a rail that has been
// re-cut twice; if the two-figure mark is ever wanted back, this is it.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function _CrewIcon() {
  // Two figures, one slightly behind the other — the crew, not a single user.
  // Stroked at the shared 1.7 like every sibling except the Journal butterfly,
  // which is filled for a reason particular to that mark.
  return (
    <svg {...ic} aria-hidden>
      <circle cx="9.5" cy="8" r="3.2" />
      <path d="M3.8 19.5c0-3.1 2.6-5.2 5.7-5.2s5.7 2.1 5.7 5.2" />
      <path d="M16.2 6.2a3.2 3.2 0 0 1 0 6" />
      <path d="M17.4 14.6c1.8.6 3 2.2 3 4.3" />
    </svg>
  );
}
function PencilIcon() {
  return (
    <svg {...ic} aria-hidden>
      <path d="M4 20h4L19 9a2 2 0 0 0-3-3L5 17z" />
      <path d="M14 7l3 3" />
    </svg>
  );
}
function ChartIcon() {
  return (
    <svg {...ic} aria-hidden>
      <path d="M5 4v15a1 1 0 0 0 1 1h14" />
      <path d="M8 16v-3" />
      <path d="M12 16V9" />
      <path d="M16 16v-5" />
    </svg>
  );
}
function CalendarIcon() {
  return (
    <svg {...ic} aria-hidden>
      <rect x="4" y="5" width="16" height="15" rx="2" />
      <path d="M4 9h16M8 3v4M16 3v4" />
    </svg>
  );
}
