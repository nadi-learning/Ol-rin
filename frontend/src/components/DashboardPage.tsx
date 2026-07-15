import { useEffect, useState, type ReactNode } from "react";
import { trpc } from "../trpc";
import "./dashboard.css";

// Slice DASH — the student home/landing surface, the "Home" view in the left-rail
// AppShell. Adapts the TAITOR dashboard reference (rewrite/design/dashboard.png):
// a chunky "My Lessons" heading, three stat cards, and a list of lessons
// (chapters) each with a "Continue" CTA that deep-links into Revision.
//
// Data: stat cards ← dashboard.getStudentSummary (the caller's own practice
// history, real numbers); lesson list ← revision.getChapterNav (the RLS-scoped
// tree, reused). Deferred from the reference (no dead UI): New Lesson, search /
// filter / sort, File Library, Settings, the Plan Summary/billing card.
//
// All classes are `.dash-`-scoped — the standing revision-shell.css global-leak
// discipline (the sheet is now host-scoped, but the prefix stays as hygiene).

type Summary = Awaited<ReturnType<typeof trpc.dashboard.getStudentSummary.query>>;
type Nav = Awaited<ReturnType<typeof trpc.revision.getChapterNav.query>>;

export function DashboardPage({
  studentName,
  onOpenLesson,
  onOpenPace,
}: {
  studentName: string;
  /** Open Revision at this sub_topic (the "Continue lesson" deep-link). */
  onOpenLesson: (subTopicId: string) => void;
  /** Open the Pace Plan surface (Slice PACE-1 dashboard entry). */
  onOpenPace: () => void;
}) {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [nav, setNav] = useState<Nav | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    Promise.all([
      trpc.dashboard.getStudentSummary.query(),
      trpc.revision.getChapterNav.query(),
    ])
      .then(([s, tree]) => {
        setSummary(s);
        setNav(tree);
      })
      .catch((e) => setError(String(e?.message ?? e)));
  }, []);

  const toggle = (chapterId: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(chapterId) ? next.delete(chapterId) : next.add(chapterId);
      return next;
    });

  const firstSubTopic = (ch: Nav[number]): string | null =>
    ch.topics[0]?.subTopics[0]?.id ?? null;

  const time = formatTime(summary?.totalTimeMs ?? 0);

  return (
    <div className="dash">
      <header className="dash-head">
        <p className="dash-hello">Hi {studentName} 👋</p>
        <h1 className="dash-title">My Lessons</h1>
      </header>

      {/* Stat cards — real numbers from the caller's practice history. */}
      <section className="dash-stats" aria-label="Your progress">
        <StatCard
          tint="lilac"
          icon={<BookIcon />}
          value={summary ? String(summary.completedSessions) : "-"}
          label="Lessons completed"
        />
        <StatCard
          tint="yellow"
          icon={<ClockIcon />}
          value={summary ? time.value : "-"}
          label={summary ? `${time.unit} practised` : "Time practised"}
        />
        <StatCard
          tint="pink"
          icon={<SpinnerIcon />}
          value={summary ? String(summary.activeSessions) : "-"}
          label="In progress"
        />
      </section>

      {/* Pace Plan entry (Slice PACE-1) — own your timeline vs your deadline. */}
      <button className="dash-pace-card" onClick={onOpenPace}>
        <span className="dash-pace-icon" aria-hidden>
          <CalendarIcon />
        </span>
        <span className="dash-pace-text">
          <span className="dash-pace-title">Plan your pace</span>
          <span className="dash-pace-sub">
            Set your deadline, order your chapters, and see if you’re on track.
          </span>
        </span>
        <span className="dash-pace-arrow" aria-hidden>
          <ArrowIcon />
        </span>
      </button>

      {/* Lesson list — chapters from the RLS-scoped nav tree. */}
      <section className="dash-list" aria-label="Lessons">
        {error && <p className="dash-error">{error}</p>}
        {!error && !nav && <p className="dash-muted">Loading your lessons…</p>}
        {!error && nav && nav.length === 0 && (
          <p className="dash-muted">No lessons published for your class yet.</p>
        )}
        {nav?.map((ch) => {
          const isOpen = expanded.has(ch.id);
          const start = firstSubTopic(ch);
          const sectionCount = ch.topics.length;
          const slideCount = ch.topics.reduce((n, t) => n + t.subTopics.length, 0);
          return (
            <div className={`dash-lesson${isOpen ? " dash-lesson--open" : ""}`} key={ch.id}>
              <div className="dash-lesson-row">
                <button
                  className="dash-lesson-main"
                  onClick={() => toggle(ch.id)}
                  aria-expanded={isOpen}
                >
                  <span className={`dash-chevron${isOpen ? " dash-chevron--open" : ""}`}>
                    <ChevronIcon />
                  </span>
                  <span className="dash-lesson-text">
                    <span className="dash-lesson-name">{ch.name}</span>
                    <span className="dash-lesson-meta">
                      {sectionCount} {sectionCount === 1 ? "section" : "sections"} ·{" "}
                      {slideCount} {slideCount === 1 ? "slide" : "slides"} ·{" "}
                      <span className="dash-lesson-cue">
                        {isOpen ? "Hide slides" : "Show slides"}
                      </span>
                    </span>
                  </span>
                </button>
                <button
                  className="dash-continue"
                  disabled={!start}
                  onClick={() => start && onOpenLesson(start)}
                >
                  Continue lesson <ArrowIcon />
                </button>
              </div>

              {isOpen && (
                <div className="dash-sublist">
                  {ch.topics.map((tp) => (
                    <div className="dash-section" key={tp.id}>
                      <p className="dash-section-name">{tp.name}</p>
                      {tp.subTopics.map((st) => (
                        <button
                          className="dash-slide"
                          key={st.id}
                          onClick={() => onOpenLesson(st.id)}
                        >
                          <span className="dash-slide-dot" />
                          {st.name}
                        </button>
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </section>
    </div>
  );
}

function StatCard({
  tint,
  icon,
  value,
  label,
}: {
  tint: "lilac" | "yellow" | "pink";
  icon: ReactNode;
  value: string;
  label: string;
}) {
  return (
    <div className="dash-stat">
      <span className={`dash-burst dash-burst--${tint}`} aria-hidden>
        {icon}
      </span>
      <span className="dash-stat-body">
        <span className="dash-stat-num">{value}</span>
        <span className="dash-stat-label">{label}</span>
      </span>
    </div>
  );
}

/** ms → a friendly {value, unit}: minutes under an hour, else hours (1 dp). */
function formatTime(ms: number): { value: string; unit: string } {
  const minutes = Math.round(ms / 60000);
  if (minutes < 60) return { value: String(minutes), unit: minutes === 1 ? "Minute" : "Minutes" };
  const hours = Math.round((minutes / 60) * 10) / 10;
  return { value: String(hours), unit: hours === 1 ? "Hour" : "Hours" };
}

/* --- inline icons (dependency-free) --- */
const ic = {
  width: 22,
  height: 22,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};
function BookIcon() {
  return (
    <svg {...ic} aria-hidden>
      <path d="M5 4h9a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z" />
      <path d="M5 17a3 3 0 0 1 3-3h9" />
    </svg>
  );
}
function ClockIcon() {
  return (
    <svg {...ic} aria-hidden>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 8v4.5l3 2" />
    </svg>
  );
}
function SpinnerIcon() {
  return (
    <svg {...ic} aria-hidden>
      <path d="M12 4a8 8 0 1 0 8 8" />
      <path d="M12 4v3" />
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
function ChevronIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}
function ArrowIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}
