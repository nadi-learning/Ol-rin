import { useEffect, useState } from "react";
import { trpc } from "../trpc";
import "./insights.css";

// Slice INS — the student's OWN progress surface. Effort metrics (always there)
// + per-topic certified mastery shown as SOFT BUCKETS (never raw 1–5 numbers —
// the server drops them, D-INS-1) with the user-visible description + a movement
// trend. Mastery cards only appear once a tutor finalises Stage-2 (the only thing
// that writes mastery_state), so the empty state is the common day-one view.
//
// Data: insights.getMySummary (the caller's own report, self-scoped server-side).
// Topic cards deep-link back into Revision via onOpenLesson (revisit the lesson).
//
// All classes `.ins-`-scoped — the standing revision-shell.css global-leak hygiene.

type Summary = Awaited<ReturnType<typeof trpc.insights.getMySummary.query>>;
type Topic = Summary["topics"][number];
type Bucket = NonNullable<Topic["conceptual"]>; // null (never observed) is handled separately
type Trend = Topic["trend"];

export function InsightsPage({
  onOpenLesson,
}: {
  /** Revisit a topic's lesson (the Revision deep-link). */
  onOpenLesson: (subTopicId: string) => void;
}) {
  const [data, setData] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    trpc.insights.getMySummary
      .query()
      .then(setData)
      .catch((e) => setError(String(e?.message ?? e)));
  }, []);

  const t = formatTime(data?.metrics.totalTimeMs ?? 0);

  return (
    <div className="ins">
      <header className="ins-head">
        <p className="ins-hello">Your progress</p>
        <h1 className="ins-title">How you’re doing</h1>
      </header>

      {/* Effort metrics — always present, even before any certification. */}
      <section className="ins-metrics" aria-label="Practice effort">
        <Metric value={data ? String(data.metrics.questionsAnswered) : "—"} label="Questions answered" />
        <Metric value={data ? t.value : "—"} label={data ? `${t.unit} practised` : "Time practised"} />
        <Metric value={data ? String(data.metrics.questionsSkipped) : "—"} label="Skipped" />
      </section>

      <section className="ins-list" aria-label="Topic progress">
        <h2 className="ins-section-title">Topics assessed by your tutor</h2>
        {error && <p className="ins-error">{error}</p>}
        {!error && !data && <p className="ins-muted">Loading your progress…</p>}

        {!error && data && data.topics.length === 0 && (
          <div className="ins-empty">
            <p className="ins-empty-title">No topics certified yet</p>
            <p className="ins-muted">
              As you practise, your tutor reviews your work and certifies how
              you’re doing on each topic. Keep practising — your progress will
              show up here.
            </p>
          </div>
        )}

        {data?.topics.map((tp) => (
          <article className="ins-card" key={tp.subTopicId}>
            <div className="ins-card-head">
              <div className="ins-card-titles">
                <p className="ins-card-crumb">
                  {tp.chapterName} · {tp.topicName}
                </p>
                <h3 className="ins-card-name">{tp.subTopicName}</h3>
              </div>
              <TrendPill trend={tp.trend} />
            </div>

            <div className="ins-chips">
              <BucketChip axis="Understanding" bucket={tp.conceptual} />
              <BucketChip axis="Method" bucket={tp.procedural} />
            </div>

            {tp.description && <p className="ins-card-desc">{tp.description}</p>}

            <button className="ins-revisit" onClick={() => onOpenLesson(tp.subTopicId)}>
              Revisit lesson →
            </button>
          </article>
        ))}
      </section>
    </div>
  );
}

function Metric({ value, label }: { value: string; label: string }) {
  return (
    <div className="ins-metric">
      <span className="ins-metric-num">{value}</span>
      <span className="ins-metric-label">{label}</span>
    </div>
  );
}

const BUCKET_LABEL: Record<Bucket, string> = {
  "getting-started": "Getting started",
  practising: "Practising",
  strong: "Strong",
  mastered: "Mastered",
};

function BucketChip({ axis, bucket }: { axis: string; bucket: Bucket | null }) {
  // null = never observed on this axis. Not a low bucket — a gap in what we asked.
  if (bucket == null) {
    return (
      <span className="ins-chip ins-chip--unassessed">
        <span className="ins-chip-axis">{axis}</span>
        <span className="ins-chip-level">Not yet assessed</span>
      </span>
    );
  }
  return (
    <span className={`ins-chip ins-chip--${bucket}`}>
      <span className="ins-chip-axis">{axis}</span>
      <span className="ins-chip-level">{BUCKET_LABEL[bucket]}</span>
    </span>
  );
}

const TREND_LABEL: Record<Trend, string> = {
  up: "Improving",
  down: "Needs review",
  flat: "Steady",
  new: "Newly assessed",
};

function TrendPill({ trend }: { trend: Trend }) {
  return <span className={`ins-trend ins-trend--${trend}`}>{TREND_LABEL[trend]}</span>;
}

/** ms → a friendly {value, unit}: minutes under an hour, else hours (1 dp). */
function formatTime(ms: number): { value: string; unit: string } {
  const minutes = Math.round(ms / 60000);
  if (minutes < 60) return { value: String(minutes), unit: minutes === 1 ? "Minute" : "Minutes" };
  const hours = Math.round((minutes / 60) * 10) / 10;
  return { value: String(hours), unit: hours === 1 ? "Hour" : "Hours" };
}
