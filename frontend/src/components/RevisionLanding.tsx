import { useEffect, useMemo, useRef, useState } from "react";
import { trpc } from "../trpc";
import { useTypewriter } from "../lib/useTypewriter";
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

// useTypewriter moved to ../lib/useTypewriter (ONB-1 shares it). Same code,
// same behaviour — this file only changed its import.

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

  // Slice I — every sub_topic pick on this page goes through here: the first
  // one that will actually RENDER, searched across sections rather than
  // assuming `topics[0]`. The landing's chips and headline CTA aim at real
  // targets; before this they aimed at the first row of the curriculum spine,
  // which on CBSE is a 404.
  const firstOpenable = (ch: Nav[number] | undefined): string | null =>
    ch?.topics.flatMap((t) => t.subTopics).find((s) => s.hasContent)?.id ?? null;

  const script = useMemo(() => {
    if (!state || !nav) return null;
    // The first chapter with something to open — not the first by ordinal.
    const first = nav.find((c) => c.hasContent);
    const firstSub = firstOpenable(first);
    return pickLanding(state, studentName, {
      firstChapter:
        first && firstSub
          ? { chapterId: first.id, name: first.name, firstSubTopicId: firstSub }
          : null,
      firstSubTopicOf: (chapterId) => firstOpenable(nav.find((c) => c.id === chapterId)),
    });
  }, [state, nav, studentName]);

  const theatre = !!state?.firstTime && !reducedMotion;
  const { visible, done } = useTypewriter(script?.headline ?? "", theatre, 45);

  const chapters = useMemo(() => {
    if (!nav) return [];
    const q = query.trim().toLowerCase();
    return nav
      .map((ch) => {
        // Slice I — counts and search both run over what OPENS. The previous
        // gate was `slideCount > 0`, which counted spine rows: it let through
        // any chapter the curriculum merely mentions, so the CBSE grid offered
        // 24 cards of which 1 rendered. Counting renderable sub_topics makes
        // the same one-line filter mean what it always claimed to.
        const openable = ch.topics.filter((t) => t.subTopics.some((s) => s.hasContent));
        const sectionCount = openable.length;
        const slideCount = openable.reduce(
          (n, t) => n + t.subTopics.filter((s) => s.hasContent).length,
          0,
        );
        // Searching unpublished names would surface a card that opens on
        // something else entirely, so the haystack is the openable set too.
        const matches =
          q.length === 0 ||
          ch.name.toLowerCase().includes(q) ||
          openable.some(
            (t) =>
              t.name.toLowerCase().includes(q) ||
              t.subTopics.some((st) => st.hasContent && st.name.toLowerCase().includes(q)),
          );
        return { ch, sectionCount, slideCount, matches };
      })
      .filter((x) => x.matches && x.slideCount > 0);
  }, [nav, query]);

  const openChapter = (chapterId: string) => {
    const resume = state?.lastVisitedByChapter[chapterId];
    const ch = nav?.find((c) => c.id === chapterId);
    // `resume` is a sub_topic the student actually visited, so it rendered
    // then; the fallback is the first that renders NOW.
    const target = resume ?? firstOpenable(ch);
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
