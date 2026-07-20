import { useEffect, useState, type ReactNode } from "react";
import { trpc } from "../trpc";
import { BoardSettingUp } from "./BoardSettingUp";
import { firstName, loaderPetAlt, loaderPetImg } from "./onboarding.copy";
import { useTypewriter } from "../lib/useTypewriter";
import type { AppView } from "./AppShell";
import sceneSentinel from "../assets/scenes/sentinel.jpg";
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
type Onb = Awaited<ReturnType<typeof trpc.onboarding.getState.query>>;

export function DashboardPage({
  studentName,
  onOpenLesson,
  onOpenPace,
  onNavigate,
}: {
  studentName: string;
  /** Open Revision at this sub_topic (the "Continue lesson" deep-link). */
  onOpenLesson: (subTopicId: string) => void;
  /** Open the Pace Plan surface (Slice PACE-1 dashboard entry). */
  onOpenPace: () => void;
  /** Slice H — the first-run tour's section tiles navigate through the shell. */
  onNavigate: (view: AppView) => void;
}) {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [nav, setNav] = useState<Nav | null>(null);
  const [onb, setOnb] = useState<Onb | null>(null);
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

    // DASH-FR — the onboarding picks, read SEPARATELY and deliberately not in
    // the Promise.all above: the welcome is decoration on a working dashboard,
    // so a failure here must cost the student their hero, never their lessons.
    // (getState already fails open server-side; this is the second wall.)
    trpc.onboarding.getState
      .query()
      .then(setOnb)
      .catch(() => setOnb(null));
  }, []);

  const toggle = (chapterId: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(chapterId) ? next.delete(chapterId) : next.add(chapterId);
      return next;
    });

  // Slice I — the first sub_topic that will actually RENDER, not the first by
  // ordinal. Two changes in one line, both load-bearing: it tests each
  // sub_topic's own `hasContent` (the chapter-level flag says only that
  // SOMETHING under it opens), and it searches ACROSS sections rather than
  // giving up on `topics[0]` — a chapter whose first section is unpublished and
  // whose second is not is still perfectly openable.
  const renderableSubTopics = (ch: Nav[number]) =>
    ch.topics.flatMap((t) => t.subTopics).filter((s) => s.hasContent);
  const firstSubTopic = (ch: Nav[number]): string | null =>
    renderableSubTopics(ch)[0]?.id ?? null;

  // Slice I — the lesson list shows only chapters with something to open. The
  // spine lists all 24 CBSE chapters; 1 is published. Offering the other 23 as
  // pressable rows is offering 23 dead ends.
  const lessons = nav?.filter((ch) => ch.hasContent) ?? null;

  const time = formatTime(summary?.totalTimeMs ?? 0);

  // DASH-FR — the first-run landing. Held until BOTH reads are in: flashing the
  // stat row and then swapping it for the welcome (or the reverse) is worse
  // than waiting a beat, and `summary === null` is indistinguishable from a
  // genuine zero until it resolves.
  const firstRun = Boolean(summary && !summary.hasStarted && nav && nav.length > 0);
  // Aim at the first chapter that will actually OPEN. `lessons` is already
  // exactly those, so this is just its head.
  //
  // 🔴 D-I2 — there is NO fallback to nav[0] when nothing is published. The
  // previous cut fell back so the CTA "stayed honest about the order", but a
  // CTA pointing at a chapter we KNOW 404s is not honest, it is a dead end
  // wearing a primary button. Slice H already degrades correctly here: the tour
  // takes `canStart={false}`, keeps its greeting and its five tiles, and simply
  // does not offer a lesson that does not exist.
  const firstChapter = firstRun ? (lessons?.[0] ?? null) : null;
  const firstStart = firstChapter ? firstSubTopic(firstChapter) : null;

  return (
    <div className="dash">
      {/* DASH-GUARD — the canvas is capped at a readable column, so on a wide
          screen the gutters either side of it are dead space. They become the
          Argonath: two sentinels the student reads BETWEEN. Decoration only —
          aria-hidden, pointer-events off, and hidden entirely below the width
          where the gutters actually exist (else they crowd the content). */}
      <img
        className="dash-sentinel dash-sentinel--left"
        src={sceneSentinel}
        alt=""
        aria-hidden="true"
      />
      <img
        className="dash-sentinel dash-sentinel--right"
        src={sceneSentinel}
        alt=""
        aria-hidden="true"
      />

      <header className="dash-head">
        <p className="dash-hello">Hi {studentName} 👋</p>
        <h1 className="dash-title">My Lessons</h1>
      </header>

      {/* DASH-FR/Slice H — on the very first landing the three stat cards would
          read 0 / 0 / 0, which lands as failure on a student who has done nothing
          wrong. There is no history to summarise yet, so the space goes to the
          things they actually need: where to begin, and what the rest of the app
          holds. The stats return the moment they start their first lesson.

          🔑 The `loaded` gate is load-bearing, and it is NOT the same guard as
          `firstRun`. `firstRun` is held until both reads are in — but this is a
          ternary, so until then the ELSE branch was rendering, and a brand-new
          student watched three "-" stat cards appear and then get swapped for the
          tour. That is precisely the flash the comment above claims to prevent;
          the hold only ever stopped it in the tour→stats direction. Caught by the
          Slice H walk, which found the stat row on a student whose hasStarted was
          still false. Rendering nothing for the brief load is strictly better than
          rendering numbers we know are wrong. */}
      {!summary || !nav ? null : firstRun ? (
        <FirstRunTour
          studentName={studentName}
          answers={onb?.answers ?? null}
          chapterName={firstChapter?.name ?? null}
          onStart={() => firstStart && onOpenLesson(firstStart)}
          canStart={Boolean(firstStart)}
          onNavigate={onNavigate}
        />
      ) : (
        /* Stat cards — real numbers from the caller's practice history. */
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
      )}

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
        {/* Slice M — was a flat grey line ("No lessons published for your class
            yet"), which reads as a fault report. With igcse offered as a real
            board this is a first-run screen a student can land on with nothing
            else on the page, so it says who is doing something about it. Same
            panel as the revision landing's, deliberately. */}
        {!error && lessons && lessons.length === 0 && <BoardSettingUp />}
        {lessons?.map((ch, i) => {
          const isOpen = expanded.has(ch.id);
          const start = firstSubTopic(ch);
          // Slice I — counts describe what the card actually OPENS, so they
          // match the rows revealed below rather than the spine behind them.
          // A "12 slides" chapter that expands to 3 is a worse lie than a
          // small honest number.
          const openable = renderableSubTopics(ch);
          const sections = ch.topics.filter((t) => t.subTopics.some((s) => s.hasContent));
          const sectionCount = sections.length;
          const slideCount = openable.length;
          // DASH-FR — "Start here" marks ONE chapter, the first, and only while
          // nothing has been started. Fourteen chapters and no signal is a
          // choice the student shouldn't have to make on day one.
          const isStartHere = firstRun && ch.id === firstChapter?.id;
          return (
            <div
              className={`dash-lesson${isOpen ? " dash-lesson--open" : ""}${
                isStartHere ? " dash-lesson--starthere" : ""
              }`}
              key={ch.id}
            >
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
                    <span className="dash-lesson-name">
                      {ch.name}
                      {isStartHere && <span className="dash-starthere">Start here</span>}
                    </span>
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
                  {/* "Continue" is a lie on a chapter nobody has opened. While
                      the student has no history at all, every chapter is
                      genuinely unstarted, so the whole list says "Start". */}
                  {firstRun ? "Start lesson" : "Continue lesson"} <ArrowIcon />
                </button>
              </div>

              {isOpen && (
                <div className="dash-sublist">
                  {/* Slice I — sections and slides are BOTH filtered to what
                      opens. Filtering the chapter list alone would have left the
                      dead ends one click deeper: a published chapter can carry
                      unpublished sub_topics, and every one of them rendered here
                      as a pressable row that 404s. That conflation — chapter
                      qualifies, sub_topic doesn't — is the exact bug this slice
                      exists to kill, so it gets killed at every depth. */}
                  {sections.map((tp) => (
                    <div className="dash-section" key={tp.id}>
                      <p className="dash-section-name">{tp.name}</p>
                      {tp.subTopics
                        .filter((st) => st.hasContent)
                        .map((st) => (
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

/**
 * Slice H — the first-run dashboard. Replaces DASH-FR's Olórin welcome card.
 *
 * The onboarding spends five beats building a cast, and DASH-FR carried that
 * across the seam by RE-STATING it (Olórin's scan, the hero, the companion, and
 * his signature). Slice H keeps the handover but changes what it is FOR: the
 * student has met the cast — what they have not met is the app. So the companion
 * they chose speaks one line and then the product itself rises in behind it, as
 * tiles they can actually press.
 *
 * The pet is the speaker, which is why there is no signature line: the sticker
 * beside the box IS the voice, and a wizard's signature under a companion's
 * sentence would name the wrong character.
 *
 * (That sentence deliberately does not quote the old signature string — the
 * echo-guard greps this file for it, and a comment quoting it reads as a
 * reintroduction. The claim keeps its teeth; the prose gives way.)
 *
 * Degrades in layers rather than disappearing — a student whose onboarding read
 * failed, who skipped the pet, or whose board has no chapters still gets a
 * coherent greeting, working tiles, and (where there is content) a CTA.
 */

// D-H1 — animate ONCE per session, not once per mount.
//
// The tour lives until `hasStarted` flips, so it is still on screen when a
// student bounces dashboard → revision → dashboard. Re-typing the same sentence
// and re-raising the same five tiles on every return is the annoyance the founder
// ruled against; showing NOTHING on return would hide the tiles from someone who
// navigated away mid-tour.
//
// Module scope is the whole mechanism: it survives unmount/remount inside the SPA
// (which is exactly the bounce we are suppressing) and resets on a hard reload
// (a genuinely new session, where replaying is correct). No persistence, no new
// column, nothing to migrate — deliberately the smallest primitive that holds the
// rule.
let tourHasAnimated = false;

const TOUR_TYPE_MS = 26;

/** The section tiles, in the order the rail lists them. */
// Slice J — `view` is no longer nullable. Journal was the ONLY viewless tile and
// it now has a page, so the null case is dead. Typed away rather than left in
// place: an `AppView | null` that nothing sets to null is an invitation to add a
// tile that silently no-ops on press, and the compiler is a better guard against
// that than the comment which used to sit here.
const TOUR_TILES: readonly {
  view: AppView;
  label: string;
  line: string;
}[] = [
  // One short line each. Five tiles share a desktop row, so each gets ~150px —
  // a sentence that wraps to four lines there stops being a hint and becomes
  // something to read. Every line is trimmed to fit two.
  { view: "revision", label: "Revision", line: "Chapters, slide by slide." },
  { view: "practice", label: "Practice", line: "Questions that adapt." },
  { view: "insights", label: "Insights", line: "What's landed, what hasn't." },
  // "Pace plan", not "Pace Plan" — this navigates to the same place as the rail
  // item, and two spellings of one destination is two destinations to a child.
  { view: "pace", label: "Pace plan", line: "Set a deadline, stay on track." },
  // Slice J — Journal navigates now. The page it opens is itself a coming-soon,
  // so the "soon" pill left this tile with it: the tile no longer needs to warn
  // that pressing it goes nowhere, because pressing it goes somewhere.
  { view: "journal", label: "Journal", line: "Your day, in your words." },
];

function FirstRunTour({
  studentName,
  answers,
  chapterName,
  onStart,
  canStart,
  onNavigate,
}: {
  studentName: string;
  answers: Onb["answers"] | null;
  chapterName: string | null;
  onStart: () => void;
  canStart: boolean;
  onNavigate: (view: AppView) => void;
}) {
  const petArt = loaderPetImg(answers?.pet ?? null);
  const petName = loaderPetAlt(answers?.pet ?? null);

  // Reduced motion and a second visit take the SAME instant path — both want the
  // settled tour, and `useTypewriter` already renders the full string when
  // `animate` is false (REV-LAND's hook, reused rather than re-implemented).
  const [reducedMotion] = useState(
    () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false,
  );
  const [skipped, setSkipped] = useState(false);
  const [animate] = useState(() => !tourHasAnimated && !reducedMotion);
  useEffect(() => {
    tourHasAnimated = true;
  }, []);

  // First name only — the same rule (and helper) the onboarding greets with,
  // whose own comment puts it best: "Hi Amarnath Bollu" reads like a bank letter.
  // It is also what makes the sentence fit at 390, where the full name wrapped
  // this line to four.
  const line = `Welcome ${firstName(studentName)} — let's explore.`;
  const { visible: typed, done: typedDone } = useTypewriter(
    line,
    animate && !skipped,
    TOUR_TYPE_MS,
  );
  // The tiles wait for the sentence to finish, then rise in staggered. A skip or
  // an instant path lands them immediately.
  const tilesIn = !animate || skipped || typedDone;

  return (
    <section
      className="dash-tour"
      aria-label="Welcome"
      // Skippable (plan §Slice H). Clicking anywhere in the tour settles it —
      // a discrete "Skip" button would be a sixth pressable competing with the
      // five tiles the beat exists to introduce.
      onClick={() => setSkipped(true)}
    >
      <div className="dash-tour-say">
        <img className="dash-tour-pet" src={petArt} alt={petName} />
        <p className="dash-tour-line">
          {typed}
          {animate && !skipped && !typedDone && <span className="dash-tour-caret" />}
        </p>
      </div>

      {/* The single unambiguous next action. Kept above the tiles (D-H2): the
          tiles orient, but a brand-new student needs one place to BEGIN, and
          Revision-the-tile does not say "start here" the way this does. */}
      {canStart && (
        <button className="dash-tour-cta" onClick={onStart}>
          {/* Chapter names run to "Exploring Mixtures and their Separation";
              past ~24 characters the button outgrows the sentence above it. */}
          {chapterName && chapterName.length <= 24
            ? `Start ${chapterName}`
            : chapterName
              ? "Start this lesson"
              : "Start your first lesson"}{" "}
          <ArrowIcon />
        </button>
      )}

      <ul className={`dash-tour-tiles${tilesIn ? " is-in" : ""}`}>
        {TOUR_TILES.map((t, i) => (
          <li
            key={t.label}
            className="dash-tour-tile-wrap"
            // The stagger is a CSS transition-delay driven by index, NOT an
            // @keyframes with fill-mode (M60: `both` leaves the transform applied
            // forever, which silently kills blend modes on the subtree). The
            // settled state here is `transform: none`.
            style={{ ["--i" as string]: String(i) }}
          >
            {/* Slice J — the viewless branch is GONE (all five tiles navigate),
                and with it the `!` that used to reassure the compiler. */}
            <button
              className="dash-tour-tile"
              onClick={(e) => {
                e.stopPropagation();
                onNavigate(t.view);
              }}
            >
              <span className="dash-tour-tile-label">{t.label}</span>
              <span className="dash-tour-tile-line">{t.line}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
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
