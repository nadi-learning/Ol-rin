import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import rough from "roughjs";
import { trpc } from "../trpc";
import {
  fillCopy,
  resolveParentCopy,
  type ParentCopyKey,
} from "@b2c/kernel/parent-copy";
import { REFERRAL_OFFER } from "@b2c/kernel/contracts";
import { useTypewriter } from "../lib/useTypewriter";
import { ContributionHeatmap, ProgressTrend } from "./parent-charts";
import gandalfSketch from "../assets/scenes/gandalf-sketch.png";
import "./parent.css";
import "./parent-dashboard.css";

// Slice DASH-2 — the parent PORTFOLIO page (read side of Polaris #4, the parent
// dashboard). A single scrollable portfolio narrated by Olórin (fixed
// bottom-right, one line per section via scroll-spy), over `getChildDashboard`.
// Replaces the old Reports/Mastery tabs. Every string comes from the kernel copy
// module (@b2c/kernel/parent-copy) so BE + FE share one source (D-PDASH-3).
//
// D-DASH-1 render boundary: the payload still carries raw 1–5 levels (mirrors
// getChildReport); THIS page must reduce them — map → 3 colours, meters →
// green/covered counts, per-topic detail → buckets. NEVER render a raw `n/5` to a
// parent (D-INS-1). The hard never-show fields (log/tutor_level/reasoning) are
// already cut at the read path. All classes `.par-`/`.pdash-`-scoped (landmine-safe).

type Child = Awaited<ReturnType<typeof trpc.parent.listChildren.query>>[number];
/** One of this parent's own link requests (S168 — the add-another-child pill). */
type LinkRequest = Awaited<ReturnType<typeof trpc.parentLink.myRequests.query>>[number];
type Dashboard = Awaited<
  ReturnType<typeof trpc.parent.getChildDashboard.query>
>;
type SubjectPanel = Dashboard["subjects"][number];
type MasteryCard = SubjectPanel["mastery"][number];
type Horizontal = SubjectPanel["horizontals"][number];

// ── copy resolution: board OVERRIDE first, code default second (D-PDASH-3) ────
// The portfolio resolves most of its own copy client-side, so the overrides have
// to travel in the dashboard payload (`dash.copyOverrides`) and be applied here,
// or the two halves of one page would speak in two voices.
//
// Held in a module-level map rather than a React context, because `copy()` is
// called from ~36 places including plain helper functions that are not
// components and could not read a hook. It is SET DURING RENDER by `Portfolio`,
// before any child renders — React renders a parent to completion before its
// children, so every consumer below sees the right board's voice on the first
// paint. NOT a latch (M78's failure mode): it is re-set on every dashboard load,
// so switching child A → B cannot leave A's overrides behind.
let COPY_OVERRIDES: Record<string, string> = {};

// A `.query`-inferred copy helper. Always returns a string: an override wins if
// present, else the code default — and every key exists in the default map, so
// the fallback is total and nothing can render blank.
function copy(key: ParentCopyKey, vars?: Record<string, string | number>): string {
  const override = COPY_OVERRIDES[key];
  // `fillCopy` throws on a token the caller didn't supply. The admin editor
  // refuses to save an override introducing a NEW token (services/parent_copy.ts)
  // — but a row written by hand could still do it, and a throw during render is a
  // BLANK DASHBOARD, not a blank string. So the override is best-effort and the
  // default is the floor.
  if (override !== undefined) {
    try {
      return fillCopy(override, vars ?? {});
    } catch {
      /* fall through to the code default */
    }
  }
  return resolveParentCopy(key, vars);
}

export function ParentPage({
  parentName,
  onSignOut,
}: {
  parentName: string;
  onSignOut: () => void;
}) {
  const [children, setChildren] = useState<Child[] | null>(null);
  const [selected, setSelected] = useState<Child | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    trpc.parent.listChildren
      .query()
      .then((r) => {
        setChildren(r);
        if (r.length === 1) setSelected(r[0]!); // one child — open straight away
      })
      .catch((e) => setError(String(e?.message ?? e)));
  }, []);

  return (
    <div className="par-root graph-paper">
      <header className="par-header">
        <div>
          <div className="par-eyebrow">Parent</div>
          <h1 className="par-title">{parentName}</h1>
        </div>
        <button className="par-signout" onClick={onSignOut}>
          Sign out
        </button>
      </header>

      {error && <p className="par-error">{error}</p>}

      {!selected ? (
        <ChildList children={children} onPick={(c) => setSelected(c)} />
      ) : (
        <ChildPortfolio
          key={selected.studentId}
          child={selected}
          siblings={children ?? []}
          onPick={(c) => setSelected(c)}
          onBack={() => setSelected(null)}
        />
      )}
    </div>
  );
}

function ChildList({
  children,
  onPick,
}: {
  children: Child[] | null;
  onPick: (c: Child) => void;
}) {
  if (children === null) return <p className="par-muted">Loading…</p>;
  if (children.length === 0)
    return <p className="par-muted">No children linked to your account yet.</p>;
  return (
    <section className="par-section">
      <h2 className="par-section-title">Your children</h2>
      <div className="par-child-grid">
        {children.map((c) => (
          <button
            key={c.studentId}
            className="par-child-card"
            onClick={() => onPick(c)}
          >
            <span className="par-avatar">
              {(c.name ?? c.email).trim().slice(0, 1).toUpperCase()}
            </span>
            <span className="par-child-meta">
              <span className="par-child-name">{c.name ?? c.email}</span>
              <span className="par-child-email">{c.email}</span>
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}

// ───────────────────────────── the portfolio ─────────────────────────────

/**
 * The child SWITCHER (S169, founder ask: "if i am a parent which has multiple
 * child no option to switch").
 *
 * Before this there was only `← All children` — a round trip out of the
 * portfolio and back in, which reads as leaving one child's page rather than
 * comparing two. A parent with three children moves between them constantly, so
 * the children are always on screen and one tap apart.
 *
 * Fixed top-LEFT because the two other fixed anchors are taken: the progress-map
 * pill is top-centre and Sign out is top-right. Hidden entirely for an only
 * child — a switcher with one option is furniture.
 */
function ChildSwitcher({
  siblings,
  currentId,
  onPick,
  onBack,
}: {
  siblings: Child[];
  currentId: string;
  onPick: (c: Child) => void;
  onBack: () => void;
}) {
  if (siblings.length < 2) return null;
  return (
    <nav className="pdash-kids" aria-label="Switch child">
      {siblings.map((c) => {
        const isCurrent = c.studentId === currentId;
        return (
          <button
            key={c.studentId}
            className={`pdash-kid${isCurrent ? " is-current" : ""}`}
            aria-current={isCurrent ? "page" : undefined}
            onClick={() => !isCurrent && onPick(c)}
            title={c.email}
          >
            <span className="pdash-kid-avatar">
              {(c.name ?? c.email).trim().slice(0, 1).toUpperCase()}
            </span>
            <span className="pdash-kid-name">{(c.name ?? c.email).split(" ")[0]}</span>
          </button>
        );
      })}
      <button className="pdash-kid pdash-kid-all" onClick={onBack} title="Back to all children">
        All
      </button>
    </nav>
  );
}

function ChildPortfolio({
  child,
  siblings,
  onPick,
  onBack,
}: {
  child: Child;
  siblings: Child[];
  onPick: (c: Child) => void;
  onBack: () => void;
}) {
  const [dash, setDash] = useState<Dashboard | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDash(null);
    setError(null);
    trpc.parent.getChildDashboard
      .query({ childId: child.studentId })
      .then(setDash)
      .catch((e) => setError(String(e?.message ?? e)));
  }, [child.studentId]);

  return (
    <div>
      <ChildSwitcher
        siblings={siblings}
        currentId={child.studentId}
        onPick={onPick}
        onBack={onBack}
      />

      {error && <p className="par-error">{error}</p>}
      {dash === null && !error && (
        <p className="par-muted">Loading portfolio…</p>
      )}

      {dash && <Portfolio dash={dash} />}
    </div>
  );
}

// The section keys are BOTH the scroll-spy anchors AND the `olorin.<key>` copy
// suffixes — keep them exactly aligned with the copy map.
type SectionKey =
  | "cover"
  | "month"
  | "map"
  | "meters"
  | "calibration"
  | "weakness"
  | "horizontals"
  | "closing";

function prefersReduced(): boolean {
  return (
    typeof window !== "undefined" &&
    !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
  );
}

// The portfolio is a SLIDE DECK: the name resolves in and dissolves like vapour,
// then a vertical snap-scroll of wooden planks (rough-edged, centre-aligned) —
// scrolling turns the page one slide at a time. A carved nameplate opens it with
// the child's name; then narration, the two charts, the numbers, and the details.
// (Gandalf + signpost sketches removed for this pass. The Tolkien Shire address
// under the nameplate was removed S170 — real parents are about to read this.)

function Portfolio({ dash }: { dash: Dashboard }) {
  // Apply this board's copy overrides BEFORE anything below renders (see the
  // COPY_OVERRIDES note at the top). Render-phase on purpose: an effect would
  // run AFTER the first paint, so a parent would see the default voice flash.
  COPY_OVERRIDES = dash.copyOverrides ?? {};
  const name = dash.child.name ?? dash.child.email;
  const reduced = prefersReduced();
  const [splashDone, setSplashDone] = useState(false);

  const trend = dash.trend;
  const first = trend[0];
  const last = trend[trend.length - 1];
  const gain = first && last ? last.solid - first.solid : 0;

  return (
    <>
      <AnimatePresence>
        {!splashDone && (
          <VaporSplash
            key="splash"
            name={name}
            reduced={reduced}
            onDone={() => setSplashDone(true)}
          />
        )}
      </AnimatePresence>

      {splashDone && <WhoIsOlorin name={name} />}
      {splashDone && <ReferEarn />}
      {splashDone && <AddChild />}
      {splashDone && <RealmMapControl subjects={dash.subjects} name={name} />}

      {splashDone && (
        <motion.div
          className="pdash-deck"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5 }}
        >
          <Slide>
            <Nameplate name={name} />
          </Slide>
          <Slide>
            <NarrationPlank dash={dash} name={name} reduced={reduced} />
          </Slide>
          <Slide>
            <Plank
              title={`How ${name}'s mastery has grown`}
              badge={gain > 0 && first ? `+${gain} solid since ${first.label}` : undefined}
            >
              {/* `totalNow` is the syllabus budget — it honours chapter_budget
                  where set and falls back to the carved count (S169). Each chip
                  carries its OWN budget, summed from that subject's chapters, so
                  filtering to Maths measures against Maths, not the whole page. */}
              <ProgressTrend
                trend={trend}
                budget={dash.totals.totalNow}
                scopes={dash.subjects.map((s) => ({
                  subjectId: s.subjectId,
                  subjectName: s.subjectName,
                  budget: s.chapters.reduce((n, c) => n + c.budget, 0),
                }))}
              />
            </Plank>
          </Slide>
          <Slide>
            <Plank title="Practice, day by day">
              <ContributionHeatmap
                daily={dash.activity.daily}
                days={dash.activity.days}
              />
            </Plank>
          </Slide>
          <Slide>
            <Plank title="The numbers at a glance">
              <MetricGrid dash={dash} name={name} />
            </Plank>
          </Slide>
          <Slide>
            <Plank>
              <WeaknessSection name={name} weaknesses={dash.weaknesses} />
            </Plank>
          </Slide>
          <Slide>
            <Plank title={copy("section.pace.title", { name })}>
              <PaceSection pace={dash.pace} name={name} />
            </Plank>
          </Slide>
          <Slide>
            <Plank>
              <HorizontalsSection name={name} subjects={dash.subjects} />
            </Plank>
          </Slide>
        </motion.div>
      )}
    </>
  );
}

// A full-viewport snap slide; its sketch board is centred within.
function Slide({ children }: { children: React.ReactNode }) {
  return <section className="pdash-slide">{children}</section>;
}

// A HAND-DRAWN NOTICE BOARD (rough.js). Pure black ink on white — NO colour, NO
// fill. The frame is a tree-trunk border drawn as line-work only: a wobbly outer
// + inner outline (deliberately NOT a clean rectangle), wood-grain strands, bark
// cracks and a knot or two, all in ink. The interior is the bare white canvas the
// content sits crisp on. Redrawn on resize.
function SketchBoard({
  variant,
  children,
}: {
  variant?: "cover" | "narration" | "wide";
  children: React.ReactNode;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    const box = boxRef.current;
    const svg = svgRef.current;
    if (!box || !svg) return;
    let raf = 0;
    const draw = () => {
      const w = box.clientWidth;
      const h = box.clientHeight;
      if (!w || !h) return;
      svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
      while (svg.firstChild) svg.removeChild(svg.firstChild);
      const rc = rough.svg(svg);
      const INK = "#1c1917"; // the only colour — black ink
      const T = Math.max(26, Math.min(46, w * 0.034)); // trunk thickness
      const seed = 42;

      // 1) Outer + inner outlines of the log frame — pure ink, NO fill. Corners
      //    are jittered and edges bow so it reads hand-drawn, never a clean rect.
      const outer: [number, number][] = [
        [8, 12],
        [w - 11, 5],
        [w - 5, h - 9],
        [13, h - 4],
      ];
      const inner: [number, number][] = [
        [T + 4, T + 10],
        [w - T - 9, T + 5],
        [w - T - 4, h - T - 11],
        [T + 9, h - T - 4],
      ];
      svg.appendChild(
        rc.polygon(outer, {
          roughness: 2.9,
          bowing: 2.4,
          stroke: INK,
          strokeWidth: 2.6,
          seed,
        }),
      );
      svg.appendChild(
        rc.polygon(inner, {
          roughness: 2.6,
          bowing: 2.2,
          stroke: INK,
          strokeWidth: 1.5,
          seed: seed + 1,
        }),
      );

      // 2) DENSE long-grain — many fine wavy strands running each side's length,
      //    like the grain of a sawn log.
      const grain = (x1: number, y1: number, x2: number, y2: number, s: number) =>
        svg.appendChild(
          rc.line(x1, y1, x2, y2, {
            roughness: 3.4,
            bowing: 3.4,
            stroke: INK,
            strokeWidth: 0.55,
            seed: s,
          }),
        );
      const fracs = [0.24, 0.4, 0.56, 0.72];
      fracs.forEach((f, i) => {
        grain(T, 6 + T * f, w - T, 6 + T * f, seed + i); // top
        grain(T, h - 6 - T * f, w - T, h - 6 - T * f, seed + 10 + i); // bottom
        grain(6 + T * f, T, 6 + T * f, h - T, seed + 20 + i); // left
        grain(w - 6 - T * f, T, w - 6 - T * f, h - T, seed + 30 + i); // right
      });

      // 3) END-GRAIN RINGS — concentric tree-rings at each corner, where the logs
      //    are cut (the sawn-end look from the reference).
      const ring = (cx: number, cy: number, r: number, s: number) => {
        for (let k = 0; k < 5; k++) {
          const rr = r * (1 - k * 0.19);
          svg.appendChild(
            rc.ellipse(cx, cy, rr * 2, rr * 1.72, {
              roughness: 1.5,
              bowing: 1,
              stroke: INK,
              strokeWidth: k === 0 ? 1.5 : 0.8,
              seed: s + k,
            }),
          );
        }
        svg.appendChild(
          rc.ellipse(cx, cy, 3.4, 3, {
            roughness: 1,
            stroke: INK,
            strokeWidth: 1.1,
            seed: s + 9,
          }),
        );
      };
      const cornerR = T * 0.44;
      ring(T * 0.58, T * 0.62, cornerR, seed + 50); // TL
      ring(w - T * 0.58, T * 0.62, cornerR, seed + 60); // TR
      ring(w - T * 0.58, h - T * 0.62, cornerR, seed + 70); // BR
      ring(T * 0.58, h - T * 0.62, cornerR, seed + 80); // BL

      // 4) A couple of oval knots on the long runs (the small marks on the log).
      const knot = (cx: number, cy: number, s: number) =>
        svg.appendChild(
          rc.ellipse(cx, cy, 13, 7, {
            roughness: 1.8,
            stroke: INK,
            strokeWidth: 1,
            seed: s,
          }),
        );
      knot(w * 0.5, T * 0.5, seed + 90); // top run
      knot(w * 0.5, h - T * 0.5, seed + 91); // bottom run
    };
    const schedule = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(draw);
    };
    schedule();
    const ro = new ResizeObserver(schedule);
    ro.observe(box);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  return (
    <div
      ref={boxRef}
      className={`pdash-sketch${variant ? ` pdash-sketch--${variant}` : ""}`}
    >
      <svg ref={svgRef} className="pdash-sketch-svg" aria-hidden="true" />
      <div className="pdash-sketch-inner">{children}</div>
    </div>
  );
}

// An ink sprig — a curving branch with leaves + a small flower — sketched into a
// corner. One drawing, mirrored per corner via CSS. Purely decorative.
function FloraCorner({ corner }: { corner: "tl" | "tr" | "bl" | "br" }) {
  return (
    <svg
      className={`pdash-flora pdash-flora--${corner}`}
      viewBox="0 0 120 120"
      aria-hidden="true"
      fill="none"
      stroke="#1c1917"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {/* branch */}
      <path d="M6 8 C 30 22, 44 40, 58 60 S 82 92, 104 110" />
      {/* leaves along the branch */}
      <path d="M30 27 q 12 -8 20 -2 q -6 10 -20 2 Z" />
      <path d="M46 45 q 13 -6 21 1 q -7 9 -21 -1 Z" />
      <path d="M60 66 q -10 6 -18 -1 q 6 -9 18 1 Z" />
      {/* five-petal flower at the branch end */}
      <g transform="translate(104 108)">
        <ellipse cx="0" cy="-9" rx="4.5" ry="9" />
        <ellipse cx="0" cy="-9" rx="4.5" ry="9" transform="rotate(72)" />
        <ellipse cx="0" cy="-9" rx="4.5" ry="9" transform="rotate(144)" />
        <ellipse cx="0" cy="-9" rx="4.5" ry="9" transform="rotate(216)" />
        <ellipse cx="0" cy="-9" rx="4.5" ry="9" transform="rotate(288)" />
        <circle cx="0" cy="0" r="3.2" />
      </g>
    </svg>
  );
}

// A sketch board with an optional hand-lettered title + a key-point note.
function Plank({
  title,
  badge,
  children,
}: {
  title?: string;
  badge?: string;
  children: React.ReactNode;
}) {
  return (
    <SketchBoard variant="wide">
      {(title || badge) && (
        <div className="pdash-plank-head">
          {title && <h2 className="pdash-plank-title">{title}</h2>}
          {badge && <span className="pdash-keypoint">{badge}</span>}
        </div>
      )}
      {children}
    </SketchBoard>
  );
}

// The opening board — the child's name, hand-lettered.
function Nameplate({ name }: { name: string }) {
  return (
    <SketchBoard variant="cover">
      <div className="pdash-nameplate-eyebrow">A progress portfolio</div>
      <div className="pdash-nameplate-name">{name}</div>
      <p className="pdash-cover-sub">Scroll to turn the page ↓</p>
    </SketchBoard>
  );
}

// The narration board — Olórin's opening word (kept to ~three lines) types out,
// with the effort tally (questions answered · skipped · time) merged in beneath.
// This is slide 2 — the old standalone closing slide folds into here.
function NarrationPlank({
  dash,
  name,
  reduced,
}: {
  dash: Dashboard;
  name: string;
  reduced: boolean;
}) {
  const text = copy("olorin.cover", { name });
  const { visible, done } = useTypewriter(text, !reduced, 20);
  const metrics = dash.metrics;
  const minutes = Math.round(metrics.totalTimeMs / 60000);
  return (
    <SketchBoard variant="narration">
      <div className="pdash-narration-eyebrow">A word from Olórin</div>
      <p className="pdash-narration-text">
        {visible}
        {!done && <span className="pdash-olorin-caret" />}
      </p>
      <div className={`pdash-hero-sign${done ? " is-in" : ""}`}>— Olórin</div>
      <div className="par-metrics pdash-narration-metrics">
        <MiniStat
          label="Questions answered"
          value={String(metrics.questionsAnswered)}
        />
        <MiniStat label="Skipped" value={String(metrics.questionsSkipped)} />
        <MiniStat
          label="Time practising"
          value={minutes >= 1 ? `${minutes} min` : "< 1 min"}
        />
      </div>
    </SketchBoard>
  );
}

// A fixed "Who is Olórin?" pill on the deck. Clicking reveals the guide — the
// Gandalf sketch, a one-line role blurb, and a coming-soon note about chatting
// with him directly. Olórin is the single narrating voice across the report.
function WhoIsOlorin({ name }: { name: string }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);
  return (
    <>
      <button className="pdash-who-pill" onClick={() => setOpen(true)}>
        ✦ Who is Olórin?
      </button>
      <AnimatePresence>
        {open && (
          <div className="pdash-who-layer">
            <motion.div
              className="pdash-who-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setOpen(false)}
            />
            <motion.div
              className="pdash-who-card"
              initial={{ opacity: 0, y: 24, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 24, scale: 0.96 }}
              transition={{ type: "spring", stiffness: 260, damping: 26 }}
            >
              <button
                className="pdash-who-close"
                onClick={() => setOpen(false)}
                aria-label="Close"
              >
                ✕
              </button>
              <img
                className="pdash-who-art"
                src={gandalfSketch}
                alt="A sketch of Olórin"
              />
              <div className="pdash-who-body">
                <div className="pdash-who-eyebrow">Your guide</div>
                <h3 className="pdash-who-name">Olórin</h3>
                <p className="pdash-who-role">
                  I watch over {name}'s whole journey — every subject, every
                  practice session, and every plan their tutors set — and keep this
                  portfolio up to date for you.
                </p>
                <div className="pdash-who-soon">
                  <span className="pdash-who-soon-tag">Coming soon</span>
                  You'll be able to speak with me directly, right here, to ask
                  anything about your child's progress.
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}

// ══ ADD ANOTHER CHILD (S168) ═════════════════════════════════════════════════
// The bottom-LEFT anchor of the dock — a + in a circle (founder's shape), opening
// a small form that files a link request for a SECOND child.
//
// It reuses `parentLink.request` / `parentLink.myRequests` exactly as the
// signed-out waiting room does (AccessPending.tsx): a board-less
// `sessionProcedure`, idempotent per (parent, identifier, pending). No backend
// work was needed for this — the same request an unlinked parent files is the
// one a linked parent files for their next child, and an admin confirms both in
// the /admin Requests tab.
//
// TWO deliberate differences from the waiting-room copy of this form:
//  1. NO referral field. That offer lives in the Refer & earn pill beside it;
//     asking for a code again here would be the same ask in two places.
//  2. NO short-circuit on a `linked` request. The waiting room replaces its whole
//     form once anything is linked (that parent's errand is finished). Here, a
//     linked request is HISTORY — this parent already has a dashboard, and
//     blocking the form on it would mean a third child could never be added.
//
// FAIL-OPEN like ReferEarn (D-AVAIL-1): if the request list can't load, the pill
// still renders and the form still submits. A parent's view of the child they
// already have must not depend on this.
function AddChild() {
  const [open, setOpen] = useState(false);
  const [requests, setRequests] = useState<LinkRequest[] | null>(null);
  const [identifier, setIdentifier] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justFiled, setJustFiled] = useState(false);

  function load() {
    trpc.parentLink.myRequests
      .query()
      .then(setRequests)
      .catch(() => setRequests([])); // fail-open: an empty list, never a dead card
  }
  useEffect(() => {
    if (open) load();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const id = identifier.trim();
    if (!id || busy) return;
    setBusy(true);
    setError(null);
    try {
      await trpc.parentLink.request.mutate({ identifier: id });
      setIdentifier("");
      setJustFiled(true);
      load();
    } catch (err: any) {
      setError(String(err?.message ?? err));
    } finally {
      setBusy(false);
    }
  }

  // A request an admin has since linked means there is a child on this account
  // the CURRENT page hasn't loaded — the dashboard fetched its children on mount.
  // Offer the reload rather than silently showing a stale roster.
  const hasFreshLink = (requests ?? []).some((r) => r.status === "linked");

  return (
    <>
      <button
        className="pdash-add-pill"
        onClick={() => setOpen(true)}
        aria-label="Add another child"
        title="Add another child"
      >
        <span className="pdash-add-pill-glyph" aria-hidden>
          +
        </span>
      </button>

      <AnimatePresence>
        {open && (
          <div className="pdash-who-layer">
            <motion.div
              className="pdash-who-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setOpen(false)}
            />
            <motion.div
              className="pdash-who-card pdash-ref-card"
              initial={{ opacity: 0, y: 24, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 24, scale: 0.96 }}
              transition={{ type: "spring", stiffness: 260, damping: 26 }}
            >
              <button
                className="pdash-who-close"
                onClick={() => setOpen(false)}
                aria-label="Close"
              >
                ✕
              </button>

              <div className="pdash-add-body">
                <div className="pdash-who-eyebrow">Your family</div>
                <h3 className="pdash-add-head">Add another child</h3>
                <p className="pdash-add-sub">
                  Enter the email or phone number on your other child's account.
                  We'll match it and connect them to this dashboard — you'll see
                  them here once it's confirmed.
                </p>

                <form className="pdash-add-form" onSubmit={onSubmit}>
                  <input
                    className="pdash-add-input"
                    type="text"
                    inputMode="email"
                    autoComplete="off"
                    placeholder="Child's email or phone"
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    disabled={busy}
                    aria-label="Your other child's email or phone number"
                  />
                  <button className="pdash-add-btn" disabled={busy || !identifier.trim()}>
                    {busy ? "Sending…" : "Connect"}
                  </button>
                </form>

                {error && <p className="pdash-add-err">{error}</p>}
                {justFiled && !error && (
                  <p className="pdash-add-sub">
                    Sent. We'll match it and connect them shortly.
                  </p>
                )}

                {(requests ?? []).length > 0 && (
                  <ul className="pdash-add-list">
                    {(requests ?? []).map((r) => (
                      <li key={r.id} className="pdash-add-row">
                        <span className="pdash-add-who">{r.enteredIdentifier}</span>
                        <span className={`pdash-add-status is-${r.status}`}>
                          {r.status === "pending"
                            ? "waiting to match"
                            : r.status === "linked"
                              ? "connected"
                              : "couldn't match"}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}

                {hasFreshLink && (
                  <button
                    className="pdash-add-refresh"
                    onClick={() => window.location.reload()}
                  >
                    Reload to see them
                  </button>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}

// ══ REFER & EARN (Slice REFERRAL-1, S166) ════════════════════════════════════
// A second floating pill beside "Who is Olórin?", opening the parent's own
// referral code, a way to share it, and what they have earned so far.
//
// FAIL-OPEN, deliberately (the `onboarding.getState` discipline, D-AVAIL-1): if
// the card's query throws for ANY reason the pill simply does not render. A
// growth feature must never be able to take down a parent's view of their
// child's progress — the dashboard is the product, this is an offer on top of it.
//
// Strings live here rather than in @b2c/kernel/parent-copy: that module is
// Olórin's NARRATION (one line per portfolio section, shared with the read
// path), and commercial copy is neither narrated nor server-rendered.

type ReferralCard = Awaited<ReturnType<typeof trpc.referral.myCard.query>>;

/**
 * The two links that go out in a share (founder ask, S166).
 *
 * ⚠️ `NADI_APP` is the LIVE app host. The founder asked for "olorin.com", which
 * is not a domain this project has ever deployed to — the app has always been at
 * olorin.nadilearning.com. Using the address that actually resolves, because a
 * referral message whose link 404s fails at the one job it has. If olorin.com is
 * owned and pointed here, this constant is the only edit needed.
 */
const NADI_SITE = "nadilearning.com";
const NADI_APP = "olorin.nadilearning.com";

/**
 * The message that auto-populates in WhatsApp / iMessage / the share sheet.
 *
 * Written to survive being forwarded: it opens with the reason a parent would
 * care, states the offer plainly, and puts the code on its own line so it can be
 * read off a screen. The offer numbers come from the kernel constant rather than
 * being retyped here, so the copy cannot drift from what the server writes into
 * the ledger.
 */
function buildShareMessage(code: string): string {
  const { percentOff, months } = REFERRAL_OFFER.referred;
  return [
    `I've been using Nadi for my child's exam prep and it's genuinely worth a look — it shows you chapter by chapter where they're solid and where they're stuck, not just marks.`,
    ``,
    `Use my referral code when you sign up and you'll get ${percentOff}% off your first ${months} months:`,
    ``,
    `    ${code}`,
    ``,
    `About Nadi: https://${NADI_SITE}`,
    `Sign up here: https://${NADI_APP}`,
  ].join("\n");
}

function ReferEarn() {
  const [card, setCard] = useState<ReferralCard | null>(null);
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let alive = true;
    trpc.referral.myCard
      .query()
      .then((c) => alive && setCard(c))
      .catch(() => {}); // fail-open: no pill, no error, dashboard unaffected
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // A card with no code cannot be shared, so there is nothing to offer — a
  // legacy profile minted before referral codes existed (schema: the column is
  // nullable for exactly that reason).
  if (!card?.code) return null;

  const code = card.code;
  const shareUrl = window.location.origin;
  const shareText = buildShareMessage(code);

  async function onCopy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard is permission-gated and absent over plain http — the code is
      // rendered selectable, so a failed copy is a non-event, not an error.
    }
  }

  function onWhatsApp() {
    window.open(`https://wa.me/?text=${encodeURIComponent(shareText)}`, "_blank", "noopener");
  }

  function onMessages() {
    // iMessage/SMS prefill. The separator before `body` is genuinely
    // platform-dependent and there is no single form that works everywhere:
    // iOS wants `sms:&body=`, Android wants `sms:?body=`. Getting it wrong opens
    // Messages with an EMPTY draft — the one failure this feature cannot afford,
    // since the whole point is that the parent doesn't have to type anything.
    const isApple = /iPhone|iPad|iPod|Macintosh/.test(navigator.userAgent);
    const sep = isApple ? "&" : "?";
    window.location.href = `sms:${sep}body=${encodeURIComponent(shareText)}`;
  }

  function onNativeShare() {
    // The OS share sheet — the best path on a phone, because it reaches
    // whatever the parent actually uses. Absent on desktop browsers, so the
    // explicit WhatsApp/Messages buttons above it are not a fallback, they are
    // the primary route for anyone on a laptop.
    navigator.share?.({ title: "Nadi", text: shareText }).catch(() => {});
  }

  const joined = card.referred.length;
  // Only rewards owed to them AS THE REFERRER are "earned by sharing" — their
  // own 25% welcome discount is shown separately, as a thing they received.
  const earned = card.rewards.filter((r) => r.side === "referrer" && r.status !== "void");
  const redeemed = earned.filter((r) => r.status === "redeemed").length;

  return (
    <>
      <button className="pdash-ref-pill" onClick={() => setOpen(true)}>
        <span aria-hidden>🎁</span> Refer &amp; earn
        {joined > 0 && <span className="pdash-ref-pill-count">{joined}</span>}
      </button>

      <AnimatePresence>
        {open && (
          <div className="pdash-who-layer">
            <motion.div
              className="pdash-who-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setOpen(false)}
            />
            <motion.div
              className="pdash-who-card pdash-ref-card"
              initial={{ opacity: 0, y: 24, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 24, scale: 0.96 }}
              transition={{ type: "spring", stiffness: 260, damping: 26 }}
            >
              <button
                className="pdash-who-close"
                onClick={() => setOpen(false)}
                aria-label="Close"
              >
                ✕
              </button>

              <div className="pdash-ref-body">
                <div className="pdash-who-eyebrow">Refer &amp; earn</div>
                <h3 className="pdash-ref-head">Give 25%, get 50%</h3>
                <p className="pdash-ref-sub">
                  Share your code with another parent. They get{" "}
                  <strong>25% off their first 3 months</strong> — and once they
                  book their first month, you get <strong>50% off a month</strong>.
                </p>

                <div className="pdash-ref-codebox">
                  <span className="pdash-ref-code">{code}</span>
                  <button className="pdash-ref-copy" onClick={onCopy}>
                    {copied ? "Copied" : "Copy"}
                  </button>
                </div>

                {/* The message is NOT previewed here (founder, S166): it lands
                    prefilled in WhatsApp/Messages where the sender reads and
                    edits it anyway, so showing it twice is just clutter in a
                    card whose job is the code and the button. */}
                <div className="pdash-ref-share-row">
                  <button
                    className="pdash-ref-share pdash-ref-share--wa"
                    onClick={onWhatsApp}
                  >
                    WhatsApp
                  </button>
                  <button className="pdash-ref-share" onClick={onMessages}>
                    Messages
                  </button>
                </div>

                {/* Only where the OS actually provides a sheet — rendering a
                    dead "More" button on a desktop browser would be a button
                    that does nothing, which is worse than one fewer option. */}
                {typeof navigator !== "undefined" && !!navigator.share && (
                  <button
                    className="pdash-ref-share pdash-ref-share--ghost"
                    onClick={onNativeShare}
                  >
                    More sharing options…
                  </button>
                )}

                {/* What sharing has produced so far. Hidden entirely at zero —
                    an empty "0 joined / 0 earned" scoreboard reads as failure on
                    a card whose whole job is to invite a first share. */}
                {joined > 0 && (
                  <div className="pdash-ref-stats">
                    <div className="pdash-ref-stat">
                      <span className="pdash-ref-stat-n">{joined}</span>
                      <span className="pdash-ref-stat-l">
                        {joined === 1 ? "parent joined" : "parents joined"}
                      </span>
                    </div>
                    <div className="pdash-ref-stat">
                      <span className="pdash-ref-stat-n">{earned.length}</span>
                      <span className="pdash-ref-stat-l">
                        {redeemed > 0 ? `rewards (${redeemed} used)` : "rewards pending"}
                      </span>
                    </div>
                  </div>
                )}

                {joined > 0 && (
                  <ul className="pdash-ref-list">
                    {card.referred.map((r, i) => (
                      <li key={i} className="pdash-ref-item">
                        <span className="pdash-ref-item-who">{r.name ?? r.email}</span>
                        {/* The parent-facing words for the ledger states. They
                            never see "qualified"/"void" — those are ops terms. */}
                        <span
                          className={`pdash-ref-item-state${
                            r.status === "qualified" ? " is-on" : ""
                          }`}
                        >
                          {r.status === "qualified"
                            ? "reward unlocked"
                            : r.status === "void"
                              ? "not counted"
                              : "waiting on their first month"}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}

                {card.referredBy && (
                  <p className="pdash-ref-inbound">
                    You joined through{" "}
                    <strong>{card.referredBy.name ?? "another parent"}</strong> —{" "}
                    {card.referredBy.percentOff}% off your first{" "}
                    {card.referredBy.months} months is on your account.
                  </p>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}

// ══ PROGRESS MAP — a clean, full-screen chapter-by-chapter overview ═══════════
// A calm dashboard a parent can read at a glance: one section per subject, each
// chapter a tile coloured by how secure she is (the same gray/red/yellow/green
// progress rule as the map slide), with an "X of Y secure" count and a progress
// bar. No sketch styling — this view is meant to be trusted, not decorative.

const PM_STATES: BoxState[] = ["green", "yellow", "red", "gray"];

function RealmMapControl({
  subjects,
  name,
}: {
  subjects: SubjectPanel[];
  name: string;
}) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);
  return (
    <>
      <button className="pdash-pm-pill" onClick={() => setOpen(true)}>
        <span className="pdash-pm-pill-grid" aria-hidden>
          <i />
          <i />
          <i />
          <i />
        </span>
        Progress map
      </button>
      <AnimatePresence>
        {open && (
          <div className="pdash-pm-layer">
            <motion.div
              className="pdash-pm-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setOpen(false)}
            />
            <motion.div
              className="pdash-pm-sheet"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 16 }}
              transition={{ type: "spring", stiffness: 240, damping: 28 }}
            >
              <button
                className="pdash-pm-close"
                onClick={() => setOpen(false)}
                aria-label="Close"
              >
                ✕
              </button>
              <header className="pdash-pm-head">
                <h2 className="pdash-pm-title">Progress across the syllabus</h2>
                <p className="pdash-pm-sub">
                  Every chapter {name} is studying, coloured by how secure {name} is.
                </p>
              </header>
              <div className="pdash-pm-legend">
                {PM_STATES.map((st) => (
                  <span key={st} className="pdash-pm-key">
                    <span className={`pdash-pm-dot is-${st}`} />
                    {copy(`map.over.${st}` as ParentCopyKey)}
                  </span>
                ))}
              </div>
              {subjects.length === 0 ? (
                <p className="par-muted">Nothing covered yet.</p>
              ) : (
                <div className="pdash-pm-body">
                  {subjects.map((s) => (
                    <SubjectTrack key={s.subjectId} subject={s} />
                  ))}
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}

function SubjectTrack({ subject }: { subject: SubjectPanel }) {
  const n = subject.chapters.length;
  const secure = subject.chapters.filter(
    (ch) => chapterBoxState(ch) === "green",
  ).length;
  return (
    <section className="pdash-pm-subject">
      <div className="pdash-pm-subject-head">
        <h3 className="pdash-pm-subject-name">{subject.subjectName}</h3>
        <span className="pdash-pm-subject-sum">
          {secure} of {n} chapters secure
        </span>
      </div>
      <div className="pdash-pm-grid">
        {subject.chapters.map((ch) => (
          <ChapterTile key={ch.chapterId} chapter={ch} />
        ))}
      </div>
    </section>
  );
}

function ChapterTile({
  chapter,
}: {
  chapter: SubjectPanel["chapters"][number];
}) {
  const state = chapterBoxState(chapter);
  // Denominator is the chapter's BUDGET, not its carved cells (S170) — a
  // chapter we have only half carved must still read against what it is worth,
  // or these tiles sum to a different number than the headline above them.
  const outOf = chapter.budget || chapter.total;
  const pct = outOf ? Math.round((chapter.solid / outOf) * 100) : 0;
  return (
    <div className={`pdash-pm-tile is-${state}`}>
      <div className="pdash-pm-tile-name">{chapter.chapterName}</div>
      <div className="pdash-pm-tile-meta">
        <span className="pdash-pm-tile-state">
          {copy(`map.over.${state}` as ParentCopyKey)}
        </span>
        {state !== "gray" && (
          <span className="pdash-pm-tile-count">
            {chapter.solid}/{outOf} secure
          </span>
        )}
      </div>
      <div className="pdash-pm-tile-bar">
        <span className="pdash-pm-tile-fill" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

// ── Act 1 — the vapour splash. The name resolves in, holds, then dissolves
// upward (blur + drift + fade) as we cross into the canvas. ──
function VaporSplash({
  name,
  reduced,
  onDone,
}: {
  name: string;
  reduced: boolean;
  onDone: () => void;
}) {
  useEffect(() => {
    const t = setTimeout(onDone, reduced ? 250 : 1900);
    return () => clearTimeout(t);
  }, [reduced, onDone]);
  return (
    <motion.div
      className="pdash-splash graph-paper"
      initial={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.6 }}
    >
      <motion.div
        className="pdash-splash-eyebrow"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.8 }}
      >
        A progress portfolio for
      </motion.div>
      <motion.h1
        className="pdash-splash-name"
        initial={
          reduced
            ? { opacity: 1 }
            : { opacity: 0, scale: 0.94, filter: "blur(10px)" }
        }
        animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
        exit={
          reduced
            ? { opacity: 0 }
            : { opacity: 0, scale: 1.12, filter: "blur(18px)", y: -40 }
        }
        transition={{ duration: 0.9, ease: "easeOut" }}
      >
        {name}
      </motion.h1>
    </motion.div>
  );
}

// ── Act 3 — the metric grid. Four key numbers as tiles; a tile morphs open
// (framer-motion shared layout) into its full insight. The selected tile is
// swapped for a ghost so exactly one element owns each layoutId at a time. ──
type Tile = {
  key: SectionKey;
  eyebrow: string;
  value: string;
  caption: string;
  span: 1 | 2;
  detail: React.ReactNode;
};

function buildTiles(dash: Dashboard, name: string): Tile[] {
  const t = dash.totals;
  const tiles: Tile[] = [];

  tiles.push({
    key: "map",
    eyebrow: "Progress",
    value: `${t.solidNow} / ${t.totalNow}`,
    caption:
      t.solidPrior !== null
        ? `solid — was ${t.solidPrior} last month`
        : "topics solid so far",
    span: 2,
    detail: (
      <>
        <MapSection name={name} subjects={dash.subjects} totals={t} />
        <MetersSection name={name} subjects={dash.subjects} />
      </>
    ),
  });

  tiles.push({
    key: "month",
    eyebrow: "This month",
    value: String(dash.story.topicsPracticed),
    caption:
      dash.story.topicsPracticed === 1 ? "topic worked on" : "topics worked on",
    span: 1,
    detail: <MonthStory name={name} story={dash.story} />,
  });

  if (dash.calibration.shown) {
    tiles.push({
      key: "calibration",
      eyebrow: "Knowing herself",
      value: String(dash.calibration.over + dash.calibration.under),
      caption: "moments to calibrate",
      span: 1,
      detail: <CalibrationSection name={name} calibration={dash.calibration} />,
    });
  }

  const minutes = Math.round(dash.metrics.totalTimeMs / 60000);
  tiles.push({
    key: "closing",
    eyebrow: "Effort",
    value: String(dash.metrics.questionsAnswered),
    caption:
      minutes >= 1
        ? `answered · ${minutes} min practising`
        : "questions answered",
    span: dash.calibration.shown ? 2 : 1,
    detail: <ClosingSection name={name} metrics={dash.metrics} />,
  });

  return tiles;
}

function MetricGrid({ dash, name }: { dash: Dashboard; name: string }) {
  const tiles = buildTiles(dash, name);
  const [selected, setSelected] = useState<Tile | null>(null);

  useEffect(() => {
    if (!selected) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSelected(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected]);

  return (
    <div className="pdash-grid-wrap">
      <div className="pdash-grid">
        {tiles.map((tile) =>
          selected?.key === tile.key ? (
            <div
              key={tile.key}
              className={`pdash-tile pdash-tile--span${tile.span} pdash-tile--ghost`}
            />
          ) : (
            <motion.button
              key={tile.key}
              layoutId={`tile-${tile.key}`}
              className={`pdash-tile pdash-tile--span${tile.span}`}
              onClick={() => setSelected(tile)}
              whileHover={{ y: -4 }}
              whileTap={{ scale: 0.98 }}
            >
              <span className="pdash-tile-expand" aria-hidden="true">
                ⤢
              </span>
              <motion.span
                layoutId={`tile-eyebrow-${tile.key}`}
                className="pdash-tile-eyebrow"
              >
                {tile.eyebrow}
              </motion.span>
              <motion.span
                layoutId={`tile-value-${tile.key}`}
                className="pdash-tile-value"
              >
                {tile.value}
              </motion.span>
              <span className="pdash-tile-caption">{tile.caption}</span>
              <span className="pdash-tile-hint">Tap to expand ↗</span>
            </motion.button>
          ),
        )}
      </div>

      <AnimatePresence>
        {selected && (
          <div className="pdash-modal-layer">
            <motion.div
              className="pdash-modal-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelected(null)}
            />
            <motion.div
              layoutId={`tile-${selected.key}`}
              className="pdash-tile-open"
            >
              <div className="pdash-tile-open-head">
                <div className="pdash-tile-open-heading">
                  <motion.span
                    layoutId={`tile-eyebrow-${selected.key}`}
                    className="pdash-tile-eyebrow"
                  >
                    {selected.eyebrow}
                  </motion.span>
                  <motion.span
                    layoutId={`tile-value-${selected.key}`}
                    className="pdash-tile-value pdash-tile-value--lg"
                  >
                    {selected.value}
                  </motion.span>
                </div>
                <button
                  className="pdash-tile-close"
                  onClick={() => setSelected(null)}
                  aria-label="Close"
                >
                  ✕
                </button>
              </div>
              <motion.div
                className="pdash-tile-detail"
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.18, duration: 0.3 }}
              >
                {selected.detail}
              </motion.div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

// A titled band. `section` doubles as the scroll-spy anchor + Olórin copy key.
function Band({
  section,
  title,
  lead,
  children,
}: {
  section: SectionKey;
  title: string;
  lead?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="pdash-band" data-section={section}>
      <h2 className="pdash-band-title">{title}</h2>
      {lead && <p className="pdash-band-lead">{lead}</p>}
      {children}
    </section>
  );
}

// ── 2. This month (the CLOCK-1 story) ───────────────────────────────────────
function MonthStory({
  name,
  story,
}: {
  name: string;
  story: Dashboard["story"];
}) {
  const lines: string[] = [];
  if (story.topicsPracticed > 0)
    lines.push(copy("story.topics", { name, topics: story.topicsPracticed }));
  if (story.retentionTopics.length > 0)
    lines.push(copy("story.retention", { name, topic: story.retentionTopics[0]! }));
  if (story.selfDirectedCount > 0)
    lines.push(copy("story.self_directed", { name, count: story.selfDirectedCount }));

  return (
    <Band section="month" title={copy("section.month.title")}>
      {lines.length === 0 ? (
        <p className="par-muted">
          No practice recorded this period yet — it will show here as {name}{" "}
          works.
        </p>
      ) : (
        <div className="pdash-story">
          {lines.map((l, i) => (
            <p key={i} className="pdash-story-line">
              {l}
            </p>
          ))}
        </div>
      )}
    </Band>
  );
}

// ── 3. Map — what she's covered (D-PDASH-1, 3 colours) ──────────────────────
const MAP_STATE_CLASS: Record<string, string> = {
  green: "is-green",
  yellow: "is-yellow",
  red: "is-red",
  gray: "is-gray",
};

// Bird's-eye chapter colour: roll a chapter's sub-topic cells into ONE state by
// progress % (green sub-topics ÷ every sub-topic in the chapter). gray = nothing
// started (no observed cell); otherwise red <34% · yellow 34–79% · green ≥80%.
// A practised-but-0-green chapter reads red (progress made, none secure), never
// gray. Denominator is the whole chapter — this is "how far through", not "of
// what she's touched" (which is what the §4 meters answer instead).
type BoxState = "gray" | "red" | "yellow" | "green";
function chapterBoxState(ch: SubjectPanel["chapters"][number]): BoxState {
  const started = ch.cells.some((c) => c.state !== "gray");
  if (!started || ch.total === 0) return "gray";
  const pct = ch.solid / ch.total;
  if (pct >= 0.8) return "green";
  if (pct >= 0.34) return "yellow";
  return "red";
}

function MapSection({
  name,
  subjects,
  totals,
}: {
  name: string;
  subjects: SubjectPanel[];
  totals: Dashboard["totals"];
}) {
  const [view, setView] = useState<"detail" | "overview">("detail");
  const lead =
    totals.solidPrior !== null && totals.priorPeriod
      ? `${totals.solidNow} of ${totals.totalNow} ${copy(
          "map.green",
        )} now — ${copy("headline.was", { prior: totals.solidPrior })}.`
      : undefined;
  return (
    <Band section="map" title={copy("section.map.title", { name })} lead={lead}>
      <div className="pdash-mapview">
        <button
          type="button"
          className={`pdash-mapview-tab ${view === "detail" ? "is-active" : ""}`}
          onClick={() => setView("detail")}
        >
          {copy("map.view.detail")}
        </button>
        <button
          type="button"
          className={`pdash-mapview-tab ${
            view === "overview" ? "is-active" : ""
          }`}
          onClick={() => setView("overview")}
        >
          {copy("map.view.overview")}
        </button>
      </div>

      {view === "detail" ? (
        <div className="pdash-legend">
          <LegendDot state="green" label={copy("map.green")} />
          <LegendDot state="yellow" label={copy("map.yellow")} />
          <LegendDot state="gray" label={copy("map.gray")} />
        </div>
      ) : (
        <div className="pdash-legend">
          <LegendDot state="green" label={copy("map.over.green")} />
          <LegendDot state="yellow" label={copy("map.over.yellow")} />
          <LegendDot state="red" label={copy("map.over.red")} />
          <LegendDot state="gray" label={copy("map.over.gray")} />
        </div>
      )}

      {subjects.length === 0 && (
        <p className="par-muted">Nothing covered yet.</p>
      )}

      {view === "detail"
        ? subjects.map((s) => (
            <div key={s.subjectId} className="pdash-subject">
              <h3 className="pdash-subject-name">{s.subjectName}</h3>
              {s.chapters.map((ch) => (
                <div key={ch.chapterId} className="pdash-chapter">
                  <div className="pdash-chapter-head">
                    <span className="pdash-chapter-name">{ch.chapterName}</span>
                    <span className="pdash-chapter-count">
                      {ch.solid} / {ch.budget || ch.total} {copy("map.green")}
                    </span>
                  </div>
                  <div className="pdash-cells">
                    {ch.cells.map((c) => (
                      <span
                        key={c.subTopicId}
                        className={`pdash-cell ${MAP_STATE_CLASS[c.state]}`}
                        title={`${c.subTopicName} — ${copy(
                          `map.${c.state}` as ParentCopyKey,
                        )}`}
                      />
                    ))}
                  </div>
                </div>
              ))}
              <TopicDetail cards={s.mastery} />
            </div>
          ))
        : subjects.map((s) => (
            <div key={s.subjectId} className="pdash-subject">
              <h3 className="pdash-subject-name">{s.subjectName}</h3>
              <div className="pdash-chapmap">
                {s.chapters.map((ch) => {
                  const st = chapterBoxState(ch);
                  return (
                    <div
                      key={ch.chapterId}
                      className={`pdash-chapbox ${MAP_STATE_CLASS[st]}`}
                      title={`${ch.chapterName} — ${copy(
                        `map.over.${st}` as ParentCopyKey,
                      )} (${ch.solid}/${ch.budget || ch.total} ${copy("map.green")})`}
                    >
                      <span className="pdash-chapbox-name">
                        {ch.chapterName}
                      </span>
                      <span className="pdash-chapbox-tag">
                        {copy(`map.over.${st}` as ParentCopyKey)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
    </Band>
  );
}

function LegendDot({ state, label }: { state: string; label: string }) {
  return (
    <span className="pdash-legend-item">
      <span className={`pdash-cell ${MAP_STATE_CLASS[state]}`} />
      {label}
    </span>
  );
}

// D-DASH-1 — the certified per-topic detail, BUCKETED (never raw n/5). Collapsed
// by default so the map stays the hero.
function levelBucket(level: number | null): string | null {
  if (level == null) return null;
  if (level >= 5) return copy("bucket.secure");
  if (level >= 4) return copy("bucket.strong");
  if (level >= 3) return copy("bucket.developing");
  return copy("bucket.emerging");
}

function TopicDetail({ cards }: { cards: MasteryCard[] }) {
  if (cards.length === 0) return null;
  return (
    <details className="pdash-detail">
      <summary className="pdash-detail-summary">
        Topic-by-topic detail ({cards.length})
      </summary>
      <div className="pdash-detail-grid">
        {cards.map((m) => (
          <div key={m.subTopicId} className="pdash-detail-card">
            <div className="pdash-detail-crumb">
              {m.chapterName} · {m.topicName}
            </div>
            <div className="pdash-detail-st">{m.subTopicName}</div>
            <div className="pdash-detail-buckets">
              <BucketPill
                label={copy("axis.conceptual.label")}
                bucket={levelBucket(m.conceptualLevel)}
              />
              <BucketPill
                label={copy("axis.procedural.label")}
                bucket={levelBucket(m.proceduralLevel)}
              />
            </div>
            {m.description && (
              <p className="pdash-detail-desc">{m.description}</p>
            )}
          </div>
        ))}
      </div>
    </details>
  );
}

function BucketPill({
  label,
  bucket,
}: {
  label: string;
  bucket: string | null;
}) {
  return (
    <span className="pdash-bucket">
      <span className="pdash-bucket-label">{label}</span>
      <span
        className={`pdash-bucket-val${bucket ? "" : " is-none"}`}
      >
        {bucket ?? "not yet assessed"}
      </span>
    </span>
  );
}

// ── 4. Meters — what she can do now (D-PDASH-2, count-aggregated) ────────────
function MetersSection({ name, subjects }: { name: string; subjects: SubjectPanel[] }) {
  return (
    <Band section="meters" title={copy("section.meters.title", { name })}>
      {subjects.length === 0 && (
        <p className="par-muted">Nothing to show yet.</p>
      )}
      <div className="pdash-meters-grid">
        {subjects.map((s) => (
          <div key={s.subjectId} className="pdash-meter-card">
            <h3 className="pdash-subject-name">{s.subjectName}</h3>
            <Meter
              label={copy("axis.conceptual.label")}
              meter={s.meters.conceptual}
            />
            <Meter
              label={copy("axis.procedural.label")}
              meter={s.meters.procedural}
            />
          </div>
        ))}
      </div>
    </Band>
  );
}

function Meter({
  label,
  meter,
}: {
  label: string;
  meter: SubjectPanel["meters"]["conceptual"];
}) {
  const pct =
    meter.covered > 0 ? Math.round((meter.green / meter.covered) * 100) : 0;
  return (
    <div className="pdash-meter">
      <div className="pdash-meter-head">
        <span className="pdash-meter-label">{label}</span>
        <span className="pdash-meter-count">
          {meter.covered > 0
            ? `${meter.green} / ${meter.covered} ${copy("map.green")}`
            : "not yet observed"}
        </span>
      </div>
      <div className="pdash-meter-track">
        <div className="pdash-meter-fill" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

// ── 5. Calibration — how well she knows herself (element 8) ──────────────────
function CalibrationSection({
  name,
  calibration,
}: {
  name: string;
  calibration: Dashboard["calibration"];
}) {
  const c = calibration;
  return (
    <Band
      section="calibration"
      title={copy("section.calibration.title", { name })}
      lead={copy("smallprint.calibration", { name, answered: c.answered })}
    >
      <div className="pdash-calib">
        <CalibStat
          n={c.over}
          label="sure, but not right"
          tone="over"
        />
        <CalibStat
          n={c.under}
          label="unsure, but right"
          tone="under"
        />
      </div>
      {c.locations.length > 0 && (
        <p className="pdash-calib-where">
          Mostly around: {c.locations.join(", ")}.
        </p>
      )}
    </Band>
  );
}

function CalibStat({
  n,
  label,
  tone,
}: {
  n: number;
  label: string;
  tone: "over" | "under";
}) {
  return (
    <div className={`pdash-calib-stat pdash-calib-stat--${tone}`}>
      <div className="pdash-calib-num">{n}</div>
      <div className="pdash-calib-label">{label}</div>
    </div>
  );
}

// ── Pace — intended time per chapter vs where she actually is (Slice PACE) ───
type PaceSubject = Dashboard["pace"][number];

const PACE_STATUS: Record<
  string,
  { label: string; tone: "good" | "warn" | "bad" }
> = {
  completed: { label: "Done", tone: "good" },
  on_time: { label: "On track", tone: "good" },
  delay_risk: { label: "A touch behind", tone: "warn" },
  amber: { label: "Behind", tone: "warn" },
  red: { label: "Well behind", tone: "bad" },
};
const PACE_PREP: Record<string, string> = {
  strong: "strong",
  on_track: "on track",
  needs_work: "needs work",
  not_started: "not started",
};
function fmtPaceDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
  });
}

const BEHIND = new Set(["delay_risk", "amber", "red"]);

function PaceSection({ pace, name }: { pace: PaceSubject[]; name: string }) {
  const [filter, setFilter] = useState<string | null>(null); // subjectId | null=all

  if (pace.length === 0) {
    return (
      <p className="par-muted">
        No pace plan yet — it appears here once {name} sets a target for a
        subject.
      </p>
    );
  }

  // Summary over every chapter across subjects (independent of the filter).
  const allChapters = pace.flatMap((s) => (s.needsSetup ? [] : s.chapters));
  const done = allChapters.filter((c) => c.completed).length;
  const behind = allChapters.filter(
    (c) => c.status && BEHIND.has(c.status),
  ).length;
  const onTrack = allChapters.filter((c) => c.status === "on_time").length;
  const summaryParts = [
    done ? `${done} done` : null,
    onTrack ? `${onTrack} on track` : null,
    behind ? `${behind} behind` : null,
  ].filter(Boolean);
  const summaryTone: "good" | "warn" = behind > 0 ? "warn" : "good";

  const shown = filter ? pace.filter((s) => s.subjectId === filter) : pace;

  return (
    <div className="pdash-pace">
      <div className="pdash-pace-bar">
        {summaryParts.length > 0 && (
          <span className={`pdash-pace-summary is-${summaryTone}`}>
            {summaryParts.join(" · ")}
          </span>
        )}
        {pace.length > 1 && (
          <div className="pdash-pace-filters">
            <button
              className={`pdash-pace-filter${filter === null ? " is-active" : ""}`}
              onClick={() => setFilter(null)}
            >
              All
            </button>
            {pace.map((s) => (
              <button
                key={s.subjectId}
                className={`pdash-pace-filter${filter === s.subjectId ? " is-active" : ""}`}
                onClick={() => setFilter(s.subjectId)}
              >
                {s.subjectName}
              </button>
            ))}
          </div>
        )}
      </div>
      {shown.map((s) => {
        const subjStatus = s.subjectStatus ? PACE_STATUS[s.subjectStatus] : null;
        return (
          <div key={s.subjectId} className="pdash-pace-subject">
            <div className="pdash-pace-subhead">
              <h3 className="pdash-subject-name">{s.subjectName}</h3>
              {subjStatus && (
                <span className={`pdash-pace-pill is-${subjStatus.tone}`}>
                  {subjStatus.label}
                </span>
              )}
            </div>
            {s.needsSetup ? (
              <p className="par-muted">
                No target date set yet — the pace check turns on once {name}{" "}
                picks a deadline for this subject.
              </p>
            ) : (
              <div className="pdash-pace-rows">
                {s.chapters.map((ch, i) => {
                  const st = ch.status ? PACE_STATUS[ch.status] : null;
                  return (
                    <div key={i} className="pdash-pace-row">
                      <span className="pdash-pace-ch">{ch.name}</span>
                      <span className="pdash-pace-intended">
                        planned ~{ch.recommendedWeeks}{" "}
                        {ch.recommendedWeeks === 1 ? "week" : "weeks"}
                      </span>
                      <span className="pdash-pace-actual">
                        {ch.completed
                          ? "finished"
                          : ch.projectedEndDate
                            ? `due ${fmtPaceDate(ch.projectedEndDate)}`
                            : ""}
                      </span>
                      {/* S169: the status and preparedness cells are ALWAYS
                          rendered, empty when there is nothing to say. The row is
                          a fixed grid now, so a missing cell would pull every
                          later field left and break the column the eye is
                          scanning down — the whole point of the change. */}
                      <span className="pdash-pace-status">
                        {st && (
                          <span className={`pdash-pace-pill is-${st.tone}`}>
                            {st.label}
                            {ch.daysOver && ch.daysOver > 0
                              ? ` · ${ch.daysOver}d over`
                              : ""}
                          </span>
                        )}
                      </span>
                      <span className="pdash-pace-prep">
                        {ch.preparedness && ch.preparedness !== "not_started"
                          ? PACE_PREP[ch.preparedness]
                          : ""}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── 6. Weakness + plan (CLOCK-3) ────────────────────────────────────────────
function WeaknessSection({
  name,
  weaknesses,
}: {
  name: string;
  weaknesses: Dashboard["weaknesses"];
}) {
  return (
    <Band section="weakness" title={copy("section.weakness.title", { name })}>
      {weaknesses.length === 0 ? (
        <p className="par-muted">Nothing flagged right now.</p>
      ) : (
        <div className="pdash-weak-list">
          {weaknesses.map((w, i) => (
            <div key={i} className="pdash-weak-card">
              <div className="pdash-weak-note">
                {w.fromSubTopicName && (
                  <span className="pdash-weak-where">{w.fromSubTopicName}</span>
                )}
                {w.note}
              </div>
              <div
                className={`pdash-plan${w.planAuthored ? " is-authored" : ""}`}
              >
                <div className="pdash-plan-label">
                  {w.planAuthored ? "The plan" : "On the worklist"}
                </div>
                <p className="pdash-plan-text">{w.planText}</p>
                {w.planAuthored && w.planUpdatedAt && (
                  <div className="pdash-plan-by">
                    — Olórin, relaying the tutor's plan ·{" "}
                    {new Date(w.planUpdatedAt).toLocaleDateString()}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </Band>
  );
}

// ── 7. Horizontals — skills that carry across subjects (D-PDASH-5) ──────────
type HGroup = {
  slug: string;
  label: string;
  gloss: string;
  /** This child's authored sentence, when a tutor wrote one. Beats the gloss. */
  prose: string;
  subjects: string[];
  level: number | null;
};

function groupHorizontals(subjects: SubjectPanel[]): HGroup[] {
  const map = new Map<string, HGroup>();
  for (const s of subjects) {
    for (const h of s.horizontals as Horizontal[]) {
      const g = map.get(h.slug);
      if (!g) {
        map.set(h.slug, {
          slug: h.slug,
          label: h.label,
          gloss: h.gloss,
          prose: h.prose ?? "",
          subjects: [h.subjectName],
          level: h.level,
        });
      } else {
        if (!g.subjects.includes(h.subjectName)) g.subjects.push(h.subjectName);
        // Keep the highest observed level across subjects.
        if (h.level !== null && (g.level === null || h.level > g.level))
          g.level = h.level;
        if (!g.prose && h.prose) g.prose = h.prose;
      }
    }
  }
  return [...map.values()];
}

// A cross-subject skill is a coarser claim than a topic level — three words, not
// the four mastery buckets. See the `hz.*` note in parent-copy.ts.
function horizontalBucket(level: number | null): string {
  if (level == null) return "not yet observed";
  if (level >= 4) return copy("hz.strong");
  if (level >= 3) return copy("hz.mixed");
  return copy("hz.needswork");
}

function HorizontalsSection({ name, subjects }: { name: string; subjects: SubjectPanel[] }) {
  const groups = groupHorizontals(subjects);
  return (
    <Band section="horizontals" title={copy("section.horizontals.title")}>
      {groups.length === 0 ? (
        <p className="par-muted">No cross-subject skills observed yet.</p>
      ) : (
        <div className="pdash-hz-grid">
          {groups.map((g) => (
            <div key={g.slug} className="pdash-hz-card">
              <div className="pdash-hz-top">
                <span className="pdash-hz-label">{g.label}</span>
                <span
                  className={`pdash-hz-level${
                    g.level === null ? " is-none" : ""
                  }`}
                >
                  {horizontalBucket(g.level)}
                </span>
              </div>
              {/* The child's own authored sentence when a tutor wrote one; the
                  generic meaning of the skill otherwise. Before S170 the prose
                  was carried in the payload and never rendered, so an authored
                  observation about a real child reached the page and stopped. */}
              <p className="pdash-hz-gloss">{g.prose || g.gloss}</p>
              <div className="pdash-hz-subjects">{g.subjects.join(" · ")}</div>
            </div>
          ))}
        </div>
      )}
    </Band>
  );
}

// ── 8. Closing ──────────────────────────────────────────────────────────────
function ClosingSection({ name, metrics }: { name: string; metrics: Dashboard["metrics"] }) {
  const minutes = Math.round(metrics.totalTimeMs / 60000);
  return (
    <Band section="closing" title={copy("section.closing.title")}>
      <div className="par-metrics">
        <MiniStat
          label="Questions answered"
          value={String(metrics.questionsAnswered)}
        />
        <MiniStat label="Skipped" value={String(metrics.questionsSkipped)} />
        <MiniStat
          label="Time practising"
          value={minutes >= 1 ? `${minutes} min` : "< 1 min"}
        />
      </div>
    </Band>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="par-stat">
      <div className="par-stat-value">{value}</div>
      <div className="par-stat-label">{label}</div>
    </div>
  );
}

