import { useEffect, useState } from "react";
import { trpc } from "../trpc";
import type { AppView } from "./AppShell";
import "./explore.css";

// Slice MOBILE-1 — EXPLORE, the mobile-only fifth surface.
//
// The phone's bottom bar carries four tabs (Home, Practice, Revision, Explore).
// Everything the rail used to hold and the bar can't — Insights, Pace plan,
// Journal, Crew — is reachable from here. Explore has no rail slot and no
// desktop entry point ON PURPOSE: above 720px the rail shows all eight surfaces
// directly, so an Explore screen there would be a menu in front of a menu.
//
// 🔑 The cards carry LIVE VALUES, not just labels (founder, S172, against a
// fintech reference where every card showed a real number). A card that only
// says "Insights" is a link with extra steps; one that says "142 answered" is
// worth the glance on its own and is why the screen earns a tab.
//
// Two of the four have nothing to show, and say so rather than inventing a
// number: Journal and Crew are both coming-soon shells with no data behind them
// (`JournalPage.tsx`, `CrewPage.tsx` — neither makes a tRPC call). Their cards
// read "Soon", which is the same honest-empty-state rule the weakness section on
// the parent dashboard runs on.
//
// All classes `.exp-`-scoped — the standing revision-shell.css leak hygiene.

type Summary = Awaited<ReturnType<typeof trpc.insights.getMySummary.query>>;
type Plan = Awaited<ReturnType<typeof trpc.pace.getPlan.query>>;

/** What the pace card says when the plan is set up. */
const PACE_PHRASE: Record<string, string> = {
  completed: "All chapters done",
  on_time: "On time",
  delay_risk: "Slipping a little",
  amber: "Behind",
  red: "Well behind",
};

export function ExplorePage({ onNavigate }: { onNavigate: (v: AppView) => void }) {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [plan, setPlan] = useState<Plan | null>(null);
  // Neither read is load-bearing for the screen: a card whose fetch fails falls
  // back to its label and stays tappable. Explore's job is to get you to the
  // page — it must never become the thing standing between you and it.
  const [paceFailed, setPaceFailed] = useState(false);

  useEffect(() => {
    trpc.insights.getMySummary.query().then(setSummary).catch(() => setSummary(null));
  }, []);

  // Pace is PER-SUBJECT — there is no cross-subject roll-up on the server, so
  // the card speaks for the first subject rather than inventing an aggregate the
  // backend can't stand behind. A real "next up across all subjects" would be a
  // new read path; flagged, not faked.
  useEffect(() => {
    trpc.pace.listSubjects
      .query()
      .then((subjects) => {
        const first = subjects[0];
        if (!first) {
          setPaceFailed(true);
          return;
        }
        return trpc.pace.getPlan.query({ subjectId: first.id }).then(setPlan);
      })
      .catch(() => setPaceFailed(true));
  }, []);

  const answered = summary?.metrics.questionsAnswered ?? null;

  let paceValue = "Pace plan";
  let paceSub = "Plan your chapters";
  if (plan && plan.needsSetup) {
    paceValue = "Not set up";
    paceSub = plan.subject.name;
  } else if (plan && !plan.needsSetup) {
    const current = plan.chapters.find((c) => !c.completed);
    paceValue = current?.name ?? "All done";
    paceSub = PACE_PHRASE[plan.summary.subjectStatus] ?? plan.subject.name;
  } else if (paceFailed) {
    paceSub = "Open your plan";
  }

  return (
    <div className="exp">
      <h1 className="exp-title">Explore</h1>

      <div className="exp-grid">
        <ExploreCard
          eyebrow="Your effort"
          value={answered == null ? "Insights" : String(answered)}
          sub={answered == null ? "What's landed, what hasn't" : "questions answered"}
          tall
          art={<ChartArt />}
          onClick={() => onNavigate("insights")}
        />
        <ExploreCard
          eyebrow="Pace plan"
          value={paceValue}
          sub={paceSub}
          tall
          art={<PathArt />}
          onClick={() => onNavigate("pace")}
        />
        <ExploreCard
          eyebrow="Journal"
          value="Soon"
          sub="Your day, in your words"
          onClick={() => onNavigate("journal")}
        />
        <ExploreCard
          eyebrow="Crew"
          value="Soon"
          sub="Who walks with you"
          onClick={() => onNavigate("crew")}
        />
      </div>
    </div>
  );
}

/**
 * One card: small-caps eyebrow → large value → quiet sub-line, with optional
 * ink art in the corner. The shape is lifted from the founder's reference; the
 * finish deliberately is not — no gradients, no white-on-flat. It uses the
 * app's own tokens so Explore reads as the same product as Home and Practice
 * (founder ruled: reference supplies STRUCTURE only).
 */
function ExploreCard({
  eyebrow,
  value,
  sub,
  tall = false,
  art,
  onClick,
}: {
  eyebrow: string;
  value: string;
  sub: string;
  tall?: boolean;
  art?: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button className={`exp-card${tall ? " exp-card--tall" : ""}`} onClick={onClick}>
      <span className="exp-eyebrow">{eyebrow}</span>
      <span className="exp-value">{value}</span>
      <span className="exp-sub">{sub}</span>
      {art && (
        <span className="exp-art" aria-hidden>
          {art}
        </span>
      )}
    </button>
  );
}

// Ink-sketch corner marks — the app's idiom (mono strokes, currentColor), not
// the reference's gradient blobs.
function ChartArt() {
  return (
    <svg width="58" height="58" viewBox="0 0 58 58" fill="none" aria-hidden>
      <path
        d="M8 46V20M20 46V10M32 46V28M44 46V16"
        stroke="currentColor"
        strokeWidth="3.2"
        strokeLinecap="round"
      />
      <path d="M4 52h50" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.5" />
    </svg>
  );
}
function PathArt() {
  return (
    <svg width="58" height="58" viewBox="0 0 58 58" fill="none" aria-hidden>
      <path
        d="M8 48c10 0 8-16 18-16s8-18 20-18"
        stroke="currentColor"
        strokeWidth="3.2"
        strokeLinecap="round"
      />
      <circle cx="46" cy="14" r="5" fill="currentColor" />
    </svg>
  );
}
