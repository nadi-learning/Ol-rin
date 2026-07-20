import { useEffect, useMemo, useState } from "react";
import { trpc } from "../trpc";
import { PreviewShell } from "./PreviewShell";
import { QuickCheck } from "./QuickCheck";
import { VoicePanel } from "./VoicePanel";
import { RevisionLanding } from "./RevisionLanding";
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
//
// Slice REV-LAND: a LANDING mode fronts the slide view (D-REV-3) — templated
// greeting + chips + chapter grid (RevisionLanding). Nav-rail entry always
// lands here; the dashboard's deep-link (initialSubTopicId) skips straight to
// the slide. Each successful slide resolve records a `revision_visit`
// (fire-and-forget) so the landing can resume durably (D-REV-1).

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
  onOpenPace,
  pet,
}: {
  studentName: string;
  /** Slice G — passed straight through to the voice tutor's avatar. */
  pet: string | null;
  /** Slice DASH: a sub_topic to open at (from the dashboard "Continue lesson"
   *  deep-link). Snaps once the nav tree is loaded; null = open at the landing. */
  initialSubTopicId?: string | null;
  /** REV-LAND: the landing's "Set my plan" chip → the Pace Plan surface. */
  onOpenPace?: () => void;
}) {
  const [rawNav, setRawNav] = useState<Nav | null>(null);

  /**
   * Slice I — the viewer runs on the OPENABLE tree, not the curriculum spine.
   *
   * This one derivation is deliberately at the top, because EVERYTHING below
   * reads it: `flat` (prev/next + the "n / total" counter), the index sidebar,
   * and the deep-link's findIndex. Filtering any one of them alone would leave
   * the others disagreeing about what this chapter contains.
   *
   * 🔴 What it fixes, all of it found by the Slice I walk and none of it
   * visible to a probe:
   *   1. `currentIdx` starts at 0, so the FIRST slide fetched on any deep-link
   *      was `flat[0]` — the first sub_topic of the first chapter in SPINE
   *      order, which on CBSE is "Basics" and 404s. Every single lesson open
   *      fired a doomed getSlide before the real one.
   *   2. prev/next walked THROUGH unrenderable slides — 128 of CBSE's 159 are
   *      dead, so "Next" was mostly a 404 machine.
   *   3. the counter read "68 / 159" when 31 slides exist.
   */
  const nav = useMemo<Nav | null>(() => {
    if (!rawNav) return null;
    return rawNav
      .map((ch) => ({
        ...ch,
        topics: ch.topics
          .map((t) => ({ ...t, subTopics: t.subTopics.filter((s) => s.hasContent) }))
          .filter((t) => t.subTopics.length > 0),
      }))
      .filter((ch) => ch.topics.length > 0);
  }, [rawNav]);
  const [mode, setMode] = useState<"landing" | "slide">(
    initialSubTopicId ? "slide" : "landing",
  );
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
        setRawNav(tree);
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
    if (idx !== -1) {
      setCurrentIdx(idx);
      setMode("slide"); // a deep-link always skips the landing (D-REV-3)
    }
  }, [initialSubTopicId, flat]);

  // Resolve the slide whenever the selection changes — SLIDE MODE ONLY. In
  // landing mode `selected` defaults to flat[0] the moment nav loads; fetching
  // (and worse, recording a visit) there would fabricate resume state for a
  // slide the student never opened.
  useEffect(() => {
    if (mode !== "slide" || !selected) return;
    setSlide(null);
    setError(null);
    // 🔴 Slice I — STALENESS GUARD. `setError(null)` above only clears at the
    // START of a fetch, which does nothing about a LOSING one that lands late:
    // the Slice I walk caught a fully-rendered slide wearing a SLIDE_NOT_FOUND
    // banner, because the doomed flat[0] request rejected AFTER the real one
    // had resolved and overwrote the cleared error. The nav filter above stops
    // that particular doomed request, but any fast prev/next would re-open the
    // same race — so the class gets closed, not just the instance.
    let live = true;
    trpc.revision.getSlide
      .query({ subTopicId: selected })
      .then((s) => {
        if (!live) return;
        setSlide(s);
        // D-REV-1: durable resume. Fire-and-forget — a lost visit only costs
        // resume freshness, never the slide render.
        trpc.revision.recordVisit.mutate({ subTopicId: selected }).catch(() => {});
      })
      .catch((e) => {
        if (!live) return;
        setError(String(e?.message ?? e));
      });
    return () => {
      live = false;
    };
  }, [selected, mode]);

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
  // so goPrev/goNext clamp against the current total. Landing mode unbinds —
  // arrows must not step slides behind an unrendered slide view.
  useEffect(() => {
    if (mode !== "slide") return;
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
  }, [flat.length, mode]);

  // REV-LAND: landing → slide hand-off (chips + chapter grid land here).
  const openFromLanding = (subTopicId: string) => {
    const idx = flat.findIndex((f) => f.id === subTopicId);
    if (idx !== -1) {
      setCurrentIdx(idx);
      setMode("slide");
    }
  };

  if (mode === "landing") {
    return (
      <RevisionLanding
        studentName={studentName}
        nav={nav}
        onOpen={openFromLanding}
        onOpenPace={onOpenPace ?? (() => {})}
      />
    );
  }

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
            <button
              className="rev-topbar-overview"
              onClick={() => setMode("landing")}
            >
              <Chevron dir="left" /> Overview
            </button>
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
              {total > 0 ? `${currentIdx + 1} / ${total}` : "-"}
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
          <VoicePanel
            key={selected}
            subTopicId={selected}
            slideTitle={current?.name}
            pet={pet}
          />
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
