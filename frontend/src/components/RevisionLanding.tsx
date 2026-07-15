import { useEffect, useMemo, useRef, useState } from "react";
import { trpc } from "../trpc";
import { pickLanding } from "./revision-landing.copy";
import type { LandingChip } from "./revision-landing.copy";
import "./revision-landing.css";

// Slice REV-LAND — the Revision entry surface. A templated typewriter greeting
// + suggestion chips (all deterministic, one getLandingState read) + a chapter
// grid with a search bar. First time = slow typewriter + zoom theatre; every
// return = instant render, no theatre (a daily student never waits for it).
// Reduced-motion always gets the instant path.

type Nav = Awaited<ReturnType<typeof trpc.revision.getChapterNav.query>>;
type LandingState = Awaited<ReturnType<typeof trpc.revision.getLandingState.query>>;

/** Typewriter over `text`; instant when `animate` is false. */
function useTypewriter(text: string, animate: boolean, speedMs: number) {
  const [shown, setShown] = useState(animate ? 0 : text.length);
  useEffect(() => {
    if (!animate) {
      setShown(text.length);
      return;
    }
    setShown(0);
    let i = 0;
    const t = setInterval(() => {
      i += 1;
      setShown(i);
      if (i >= text.length) clearInterval(t);
    }, speedMs);
    return () => clearInterval(t);
  }, [text, animate, speedMs]);
  return { visible: text.slice(0, shown), done: shown >= text.length };
}

export function RevisionLanding({
  studentName,
  nav,
  onOpen,
  onOpenPace,
}: {
  studentName: string;
  nav: Nav | null;
  onOpen: (subTopicId: string) => void;
  onOpenPace: () => void;
}) {
  const [state, setState] = useState<LandingState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    trpc.revision.getLandingState
      .query()
      .then(setState)
      .catch((e) => setError(String(e?.message ?? e)));
  }, []);

  const reducedMotion = useRef(
    typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches,
  ).current;

  const script = useMemo(() => {
    if (!state || !nav) return null;
    const first = nav[0];
    const firstSub = first?.topics[0]?.subTopics[0];
    return pickLanding(state, studentName, {
      firstChapter:
        first && firstSub
          ? { chapterId: first.id, name: first.name, firstSubTopicId: firstSub.id }
          : null,
      firstSubTopicOf: (chapterId) => {
        const ch = nav.find((c) => c.id === chapterId);
        return ch?.topics[0]?.subTopics[0]?.id ?? null;
      },
    });
  }, [state, nav, studentName]);

  const theatre = !!state?.firstTime && !reducedMotion;
  const { visible, done } = useTypewriter(script?.headline ?? "", theatre, 45);

  const chapters = useMemo(() => {
    if (!nav) return [];
    const q = query.trim().toLowerCase();
    return nav
      .map((ch) => {
        const sectionCount = ch.topics.length;
        const slideCount = ch.topics.reduce((n, t) => n + t.subTopics.length, 0);
        const matches =
          q.length === 0 ||
          ch.name.toLowerCase().includes(q) ||
          ch.topics.some(
            (t) =>
              t.name.toLowerCase().includes(q) ||
              t.subTopics.some((st) => st.name.toLowerCase().includes(q)),
          );
        return { ch, sectionCount, slideCount, matches };
      })
      .filter((x) => x.matches && x.slideCount > 0);
  }, [nav, query]);

  const openChapter = (chapterId: string) => {
    const resume = state?.lastVisitedByChapter[chapterId];
    const ch = nav?.find((c) => c.id === chapterId);
    const target = resume ?? ch?.topics[0]?.subTopics[0]?.id;
    if (target) onOpen(target);
  };

  const onChip = (chip: LandingChip) => {
    if (chip.kind === "open") onOpen(chip.subTopicId);
    else onOpenPace();
  };

  if (error) return <p className="revision-error">{error}</p>;
  if (!script) return <p className="revision-muted">Loading…</p>;

  return (
    <div className={`rev-landing${theatre ? " is-theatre" : ""}`}>
      <div className="rev-landing-hero">
        <h1 className="rev-landing-headline">
          {visible}
          {theatre && !done && <span className="rev-landing-caret" />}
        </h1>
        {script.sub && (
          <p className={`rev-landing-sub${theatre && !done ? " is-waiting" : ""}`}>
            {script.sub}
          </p>
        )}
        <div className={`rev-landing-chips${theatre && !done ? " is-waiting" : ""}`}>
          {script.chips.map((chip) => (
            <button
              key={chip.label}
              className={`rev-landing-chip${chip.kind === "plan" ? " is-plan" : ""}`}
              onClick={() => onChip(chip)}
            >
              {chip.label}
            </button>
          ))}
        </div>
      </div>

      <div className={`rev-landing-browse${theatre && !done ? " is-waiting" : ""}`}>
        <input
          className="rev-landing-search"
          type="search"
          placeholder="Find a chapter or topic..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Find a chapter"
        />
        {nav && nav.length === 0 && (
          <p className="revision-muted">No lessons published for your class yet.</p>
        )}
        {nav && nav.length > 0 && chapters.length === 0 && (
          <p className="revision-muted">Nothing matches "{query}".</p>
        )}
        <div className="rev-landing-grid">
          {chapters.map(({ ch, sectionCount, slideCount }) => {
            const visited = !!state?.lastVisitedByChapter[ch.id];
            return (
              <button
                key={ch.id}
                className="rev-landing-card"
                onClick={() => openChapter(ch.id)}
              >
                <span className="rev-landing-card-name">{ch.name}</span>
                <span className="rev-landing-card-meta">
                  {sectionCount} {sectionCount === 1 ? "section" : "sections"} ·{" "}
                  {slideCount} {slideCount === 1 ? "slide" : "slides"}
                </span>
                <span className={`rev-landing-card-cta${visited ? " is-resume" : ""}`}>
                  {visited ? "Continue →" : "Start →"}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
