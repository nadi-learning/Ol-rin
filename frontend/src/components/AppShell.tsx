import type { ReactNode } from "react";

// The shared TAITOR app shell — a floating white left nav rail beside a
// graph-paper canvas (the tutor-canvas layout from the reference). For the
// walking skeleton only "Revision" (book) is wired; the other rail items are
// on-design placeholders for later surfaces.

export type AppView = "dashboard" | "revision" | "practice" | "insights" | "pace";

type Props = {
  children: ReactNode;
  userName: string;
  onSignOut: () => void;
  /** Active surface — drives which rail item is highlighted. */
  view: AppView;
  onNavigate: (view: AppView) => void;
  /** Break the content out of the 920px reading cap (e.g. the Revision slide). */
  wide?: boolean;
};

export function AppShell({
  children,
  userName,
  onSignOut,
  view,
  onNavigate,
  wide = false,
}: Props) {
  const initials = userName.trim().slice(0, 1).toUpperCase() || "?";
  return (
    <div className="app-shell">
      <nav className="nav-rail">
        <div className="nav-logo" title="b2c">
          <Logo />
        </div>

        <div className="nav-group">
          <RailItem
            label="Home"
            icon={<HomeIcon />}
            active={view === "dashboard"}
            onClick={() => onNavigate("dashboard")}
          />
          <RailItem label="Library" icon={<FolderIcon />} soon />
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
          <button className="nav-avatar" aria-label={`${userName} — sign out`} onClick={onSignOut}>
            {initials}
            <span className="nav-tip">Sign out</span>
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
  onClick,
}: {
  label: string;
  icon: ReactNode;
  active?: boolean;
  /** Not-yet-wired destination — shown but inert, tooltip flags "soon". */
  soon?: boolean;
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
      <span className="nav-tip">
        {label}
        {soon && <em className="nav-tip-soon">soon</em>}
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
function FolderIcon() {
  return (
    <svg {...ic} aria-hidden>
      <path d="M4 7a2 2 0 0 1 2-2h3l2 2h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" />
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
