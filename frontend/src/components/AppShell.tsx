import { useRef, useState, type ReactNode } from "react";
import { PikaSplash } from "./PikaSplash";

// The shared TAITOR app shell — a floating white left nav rail beside a
// graph-paper canvas (the tutor-canvas layout from the reference). For the
// walking skeleton only "Revision" (book) is wired; the other rail items are
// on-design placeholders for later surfaces.

export type AppView = "dashboard" | "revision" | "practice" | "insights" | "pace" | "profile";

type Props = {
  children: ReactNode;
  userName: string;
  /** Active surface — drives which rail item is highlighted. */
  view: AppView;
  onNavigate: (view: AppView) => void;
  /** Break the content out of the 920px reading cap (e.g. the Revision slide). */
  wide?: boolean;
};

export function AppShell({ children, userName, view, onNavigate, wide = false }: Props) {
  const initials = userName.trim().slice(0, 1).toUpperCase() || "?";
  const [pikaOpen, setPikaOpen] = useState(false);
  const [logoPulse, setLogoPulse] = useState(false);
  const logoRef = useRef<HTMLButtonElement>(null);

  // Pikachu is summoned by the logo ONLY — he never appears on his own. An
  // easter egg you can't trigger on purpose is an interruption, not a reward.
  const closePika = () => {
    setPikaOpen(false);
    setLogoPulse(true);
    window.setTimeout(() => setLogoPulse(false), 900);
  };

  return (
    <div className="app-shell">
      {pikaOpen && <PikaSplash onClose={closePika} logoRef={logoRef} />}
      <nav className="nav-rail">
        <button
          ref={logoRef}
          className={`nav-logo${logoPulse ? " nav-logo--pulse" : ""}`}
          title="b2c"
          aria-label="Pikachu"
          onClick={() => setPikaOpen(true)}
        >
          <Logo />
        </button>

        <div className="nav-group">
          <RailItem
            label="Home"
            icon={<HomeIcon />}
            active={view === "dashboard"}
            onClick={() => onNavigate("dashboard")}
          />
          <RailItem label="Journal" icon={<JournalIcon />} badge soon />
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
          <RailItem label="Search" icon={<SearchIcon />} soon />
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
        <div className={`canvas-inner${wide ? " canvas-inner--wide" : ""}`}>
          {children}
        </div>
      </main>
    </div>
  );
}

function RailItem({
  label,
  icon,
  active = false,
  soon = false,
  badge = false,
  onClick,
}: {
  label: string;
  icon: ReactNode;
  active?: boolean;
  /** Not-yet-wired destination — shown but inert, tooltip flags "soon". */
  soon?: boolean;
  /** Red dot — draws the eye to a rail slot worth noticing. */
  badge?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      className={`nav-item${active ? " nav-item--active" : ""}${soon ? " nav-item--soon" : ""}`}
      aria-label={soon ? `${label} (coming soon)` : label}
      aria-current={active ? "page" : undefined}
      aria-disabled={soon || undefined}
      onClick={soon ? undefined : onClick}
    >
      {icon}
      {badge && <span className="nav-dot" aria-hidden />}
      <span className="nav-tip">
        {label}
        {/* one tag only — "NEW SOON" side by side contradicts itself. The badge
            wins: it's the louder claim, and the dot has already made it. */}
        {badge ? <em className="nav-tip-new">new</em> : soon && <em className="nav-tip-soon">soon</em>}
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
function SearchIcon() {
  return (
    <svg {...ic} aria-hidden>
      <circle cx="11" cy="11" r="6" />
      <path d="m20 20-3.2-3.2" />
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
