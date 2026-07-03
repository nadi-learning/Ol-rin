import { useEffect, useMemo, useState } from "react";
import { trpc } from "../trpc";
import { PreviewShell } from "./PreviewShell";
import { QuickCheck } from "./QuickCheck";
import { VoicePanel } from "./VoicePanel";
import "./revision.css";
import "./revision-nav.css";

// The Revision surface (Feature B). Prod-style slide navigation:
//   - left content-index sidebar: chapter → section (topic) → slide (sub_topic),
//     sections collapsible, active slide highlighted (mirrors prod IndexPanel).
//   - top bar: ◀ Previous · "n / total" · Next ▶ stepping a flat slide index
//     (mirrors prod goPrev/goNext).
// Selecting/advancing → revision.getSlide → PreviewShell + the Slice-A QuickCheck.
// Nav source is revision.getChapterNav (RLS-scoped tree); the flat prev/next
// order is derived from it in tree order (D-B-2).

type Nav = Awaited<ReturnType<typeof trpc.revision.getChapterNav.query>>;
type Slide = Awaited<ReturnType<typeof trpc.revision.getSlide.query>>;

type FlatSlide = {
  id: string;
  name: string;
  topicId: string;
  topicName: string;
  chapterName: string;
};

export function RevisionPage({
  studentName,
  initialSubTopicId = null,
}: {
  studentName: string;
  /** Slice DASH: a sub_topic to open at (from the dashboard "Continue lesson"
   *  deep-link). Snaps once the nav tree is loaded; null = open at the default. */
  initialSubTopicId?: string | null;
}) {
  const [nav, setNav] = useState<Nav | null>(null);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [slide, setSlide] = useState<Slide | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [collapsed, setCollapsed] = useState(false);

  // Flat, tree-ordered slide list — drives prev/next + index display.
  const flat = useMemo<FlatSlide[]>(() => {
    const out: FlatSlide[] = [];
    for (const ch of nav ?? [])
      for (const tp of ch.topics)
        for (const st of tp.subTopics)
          out.push({
            id: st.id,
            name: st.name,
            topicId: tp.id,
            topicName: tp.name,
            chapterName: ch.name,
          });
    return out;
  }, [nav]);

  const current = flat[currentIdx];
  const selected = current?.id ?? null;

  // load the nav tree once
  useEffect(() => {
    trpc.revision.getChapterNav
      .query()
      .then((tree) => {
        setNav(tree);
        setCurrentIdx(0);
      })
      .catch((e) => setError(String(e?.message ?? e)));
  }, []);

  // Slice DASH deep-link: when the dashboard hands us a target sub_topic, snap
  // to it once the flat tree is available. Keyed on [target, flat] so it fires
  // after nav loads (flat was empty when the prop first arrived) and again if
  // the student picks a different lesson — but NOT on manual prev/next (those
  // change currentIdx, not these deps), so it never fights in-page navigation.
  useEffect(() => {
    if (!initialSubTopicId) return;
    const idx = flat.findIndex((f) => f.id === initialSubTopicId);
    if (idx !== -1) setCurrentIdx(idx);
  }, [initialSubTopicId, flat]);

  // resolve the slide whenever the selection changes
  useEffect(() => {
    if (!selected) return;
    setSlide(null);
    setError(null);
    trpc.revision.getSlide
      .query({ subTopicId: selected })
      .then(setSlide)
      .catch((e) => setError(String(e?.message ?? e)));
  }, [selected]);

  // auto-expand the section (topic) containing the active slide
  useEffect(() => {
    if (current) setExpanded((prev) => new Set(prev).add(current.topicId));
  }, [current?.topicId]);

  const toggleSection = (topicId: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(topicId) ? next.delete(topicId) : next.add(topicId);
      return next;
    });

  const goTo = (id: string) => {
    const idx = flat.findIndex((f) => f.id === id);
    if (idx !== -1) setCurrentIdx(idx);
  };
  const goPrev = () => setCurrentIdx((i) => Math.max(0, i - 1));
  const goNext = () => setCurrentIdx((i) => Math.min(flat.length - 1, i + 1));

  const total = flat.length;
  const atStart = currentIdx <= 0;
  const atEnd = currentIdx >= total - 1;

  // Keyboard ← / → step slides (same as the top-bar Prev/Next). Skipped when the
  // user is typing in a field or a modifier is held (so it never hijacks form
  // input or browser shortcuts like ⌘←). Re-bound when the slide count changes
  // so goPrev/goNext clamp against the current total.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      const tag = el?.tagName;
      if (
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        el?.isContentEditable
      )
        return;
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        goPrev();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        goNext();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [flat.length]);

  return (
    <div className={`rev-layout${collapsed ? " is-collapsed" : ""}`}>
      {/* ── Content index sidebar ── */}
      <aside className="rev-nav" aria-label="Content index">
        {collapsed ? (
          <button className="rev-nav-expand" onClick={() => setCollapsed(false)} aria-label="Expand index">
            <Chevron dir="right" />
          </button>
        ) : (
          <>
            <div className="rev-nav-head">
              <h2 className="rev-nav-title">{flat[0]?.chapterName ?? "Contents"}</h2>
              <button className="rev-nav-collapse" onClick={() => setCollapsed(true)} aria-label="Collapse index">
                <Chevron dir="left" />
              </button>
            </div>
            <nav className="rev-nav-tree">
              {(nav ?? []).map((ch) =>
                ch.topics.map((tp, secIdx) => {
                  const isOpen = expanded.has(tp.id);
                  return (
                    <div key={tp.id} className="rev-nav-section">
                      <button
                        className={`rev-nav-section-btn${isOpen ? " is-open" : ""}`}
                        onClick={() => toggleSection(tp.id)}
                      >
                        <span className="rev-nav-section-num">{secIdx + 1}</span>
                        <span className="rev-nav-section-title">{tp.name}</span>
                        <span className="rev-nav-chevron">
                          <Chevron dir={isOpen ? "down" : "right"} />
                        </span>
                      </button>
                      {isOpen && (
                        <div className="rev-nav-slides">
                          {tp.subTopics.map((st) => {
                            const active = st.id === selected;
                            return (
                              <button
                                key={st.id}
                                className={`rev-nav-slide${active ? " is-active" : ""}`}
                                onClick={() => goTo(st.id)}
                              >
                                <span className={`rev-nav-dot${active ? " is-active" : ""}`} />
                                <span className="rev-nav-slide-title">{st.name}</span>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                }),
              )}
            </nav>
          </>
        )}
      </aside>

      {/* ── Main: top bar + slide stage ── */}
      <section className="rev-main">
        <header className="rev-topbar">
          <div className="rev-topbar-info">
            <p className="rev-topbar-eyebrow">
              {current ? current.topicName : "Revision"}
            </p>
            <h1 className="rev-topbar-title">{current ? current.name : "Revision"}</h1>
          </div>
          <div className="rev-topbar-nav">
            <button className="rev-nav-btn" onClick={goPrev} disabled={atStart}>
              <Chevron dir="left" /> Previous
            </button>
            <span className="rev-topbar-count">
              {total > 0 ? `${currentIdx + 1} / ${total}` : "—"}
            </span>
            <button className="rev-nav-btn" onClick={goNext} disabled={atEnd}>
              Next <Chevron dir="right" />
            </button>
          </div>
        </header>

        {slide && (
          <div className="revision-stage">
            <span className="version-badge">v{slide.versionNo}</span>
            <PreviewShell
              bundleUrl={slide.bundleUrl}
              slideKey={slide.slideId}
              studentName={studentName}
              questions={
                // Slice A: server-checked Quick Check MCQs. Rendered INSIDE the
                // slide grid's right column (prod/Starkhorn layout), not full-width
                // below. Keyed on the slide id so it fully resets per slide.
                selected ? (
                  <QuickCheck key={selected} subTopicId={selected} />
                ) : null
              }
            />
          </div>
        )}

        {/* Slice VOICE-2b: spoken tutor for this slide. Gated on the slide having
            authored voice_context (the prod button gate). Keyed on the sub_topic
            so navigating slides disposes the session (unmount → relay finalizes). */}
        {slide?.hasVoiceContext && selected && (
          <VoicePanel key={selected} subTopicId={selected} slideTitle={current?.name} />
        )}

        {!slide && !error && <p className="revision-muted">Loading…</p>}
        {error && <p className="revision-error">{error}</p>}
      </section>
    </div>
  );
}

function Chevron({ dir }: { dir: "left" | "right" | "down" }) {
  const d =
    dir === "left" ? "m15 18-6-6 6-6" : dir === "right" ? "m9 18 6-6-6-6" : "m6 9 6 6 6-6";
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}
