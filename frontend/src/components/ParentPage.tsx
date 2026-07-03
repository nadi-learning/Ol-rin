import { useEffect, useState } from "react";
import { trpc } from "../trpc";
import "./parent.css";

// Slice P — the Parent READ surface (read side of Polaris #4). A parent inspects
// a linked child's certified two-axis mastery (levels + the user-visible
// description Stage-2 writes) with a movement trend, plus practice effort
// metrics. NO mastery move, NO AI, NO sign-off workflow (v0). Role-routed from
// App.tsx when me.role === 'parent'. All classes `.par-`-scoped to dodge the
// global revision-shell.css landmine (same discipline as .tut-/.qc-/.rev-).

type Child = Awaited<ReturnType<typeof trpc.parent.listChildren.query>>[number];
type Report = Awaited<ReturnType<typeof trpc.parent.getChildReport.query>>;
type MasteryCard = Report["mastery"][number];
type SignedReport = Awaited<
  ReturnType<typeof trpc.parent.listReports.query>
>[number];
type SignedReportDetail = Awaited<
  ReturnType<typeof trpc.parent.getReport.query>
>;

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
        // Common case is one child — open it straight away.
        if (r.length === 1) setSelected(r[0]!);
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
        <ChildReportView
          child={selected}
          showBack={(children?.length ?? 0) > 1}
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
    return (
      <p className="par-muted">No children linked to your account yet.</p>
    );
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

type ParentTab = "reports" | "mastery";

function ChildReportView({
  child,
  showBack,
  onBack,
}: {
  child: Child;
  showBack: boolean;
  onBack: () => void;
}) {
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<ParentTab>("reports");

  useEffect(() => {
    setReport(null);
    setError(null);
    setTab("reports"); // the vetted (signed-off) view leads on each child
    trpc.parent.getChildReport
      .query({ childId: child.studentId })
      .then((r) => setReport(r))
      .catch((e) => setError(String(e?.message ?? e)));
  }, [child.studentId]);

  return (
    <div>
      {showBack && (
        <button className="par-back" onClick={onBack}>
          ← All children
        </button>
      )}
      <h2 className="par-child-heading">{child.name ?? child.email}</h2>

      {error && <p className="par-error">{error}</p>}
      {report === null && !error && (
        <p className="par-muted">Loading report…</p>
      )}

      {report && (
        <>
          <nav className="par-tabs" role="tablist">
            <ParentTabButton id="reports" tab={tab} onPick={setTab} label="Reports" />
            <ParentTabButton id="mastery" tab={tab} onPick={setTab} label="Mastery" />
          </nav>

          {tab === "reports" && <SignedReports child={child} />}

          {tab === "mastery" && (
            <>
              <Metrics metrics={report.metrics} />
              <section className="par-section">
                <h3 className="par-section-title">Current mastery</h3>
                <MasteryList mastery={report.mastery} />
              </section>
            </>
          )}
        </>
      )}
    </div>
  );
}

function ParentTabButton({
  id,
  tab,
  onPick,
  label,
}: {
  id: ParentTab;
  tab: ParentTab;
  onPick: (t: ParentTab) => void;
  label: string;
}) {
  const active = tab === id;
  return (
    <button
      role="tab"
      aria-selected={active}
      className={`par-tab${active ? " is-active" : ""}`}
      onClick={() => onPick(id)}
    >
      {label}
    </button>
  );
}

// Slice Report-Signoff (parent read side) — the tutor-signed-off progress
// reports. Only PUBLISHED reports appear; each is a frozen snapshot the tutor
// reviewed + signed. Shown ABOVE the live mastery (the vetted view leads).
function SignedReports({ child }: { child: Child }) {
  const [reports, setReports] = useState<SignedReport[] | null>(null);
  const [open, setOpen] = useState<SignedReportDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setReports(null);
    setOpen(null);
    trpc.parent.listReports
      .query({ childId: child.studentId })
      .then(setReports)
      .catch((e) => setError(String(e?.message ?? e)));
  }, [child.studentId]);

  function openReport(reportId: string) {
    trpc.parent.getReport
      .query({ childId: child.studentId, reportId })
      .then(setOpen)
      .catch((e) => setError(String(e?.message ?? e)));
  }

  if (error) return <p className="par-error">{error}</p>;
  if (reports === null) return <p className="par-muted">Loading reports…</p>;
  if (reports.length === 0)
    // A dedicated tab now (not a quiet add-on above mastery) — must say something.
    return (
      <section className="par-section">
        <h3 className="par-section-title">Reports from the tutor</h3>
        <p className="par-muted">
          No progress reports yet — your child's tutor will sign one off here
          when ready.
        </p>
      </section>
    );

  if (open) {
    const minutes = Math.max(1, Math.round(open.snapshot.metrics.totalTimeMs / 60000));
    return (
      <section className="par-section par-rpt-open">
        <button className="par-back" onClick={() => setOpen(null)}>
          ← All reports
        </button>
        <h3 className="par-section-title">
          Report ·{" "}
          {open.publishedAt
            ? new Date(open.publishedAt).toLocaleDateString()
            : ""}
        </h3>
        {open.tutorNote && (
          <p className="par-rpt-note">“{open.tutorNote}”<span className="par-rpt-by"> — your child's tutor</span></p>
        )}
        <Metrics metrics={open.snapshot.metrics} />
        <MasteryList mastery={open.snapshot.mastery} />
      </section>
    );
  }

  return (
    <section className="par-section">
      <h3 className="par-section-title">Reports from the tutor</h3>
      <ul className="par-rpt-rows">
        {reports.map((r) => (
          <li key={r.id}>
            <button className="par-rpt-row" onClick={() => openReport(r.id)}>
              <span className="par-rpt-rowlabel">Progress report</span>
              <span className="par-rpt-rowdate">
                {r.publishedAt
                  ? new Date(r.publishedAt).toLocaleDateString()
                  : ""}
              </span>
              <span className="par-rpt-rowgo">→</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Metrics({ metrics }: { metrics: Report["metrics"] }) {
  const minutes = Math.round(metrics.totalTimeMs / 60000);
  return (
    <div className="par-metrics">
      <Stat label="Questions answered" value={String(metrics.questionsAnswered)} />
      <Stat label="Skipped" value={String(metrics.questionsSkipped)} />
      <Stat
        label="Time practising"
        value={minutes >= 1 ? `${minutes} min` : "< 1 min"}
      />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="par-stat">
      <div className="par-stat-value">{value}</div>
      <div className="par-stat-label">{label}</div>
    </div>
  );
}

const TREND_LABEL: Record<MasteryCard["trend"], string> = {
  up: "▲ Improving",
  down: "▼ Slipped",
  flat: "▬ Steady",
  new: "★ New",
};

function MasteryList({ mastery }: { mastery: MasteryCard[] }) {
  if (mastery.length === 0)
    return (
      <p className="par-muted">
        No mastery recorded yet — once your child practises and a tutor reviews
        their work, their progress shows here.
      </p>
    );
  return (
    <div className="par-mastery-grid">
      {mastery.map((m) => (
        <div key={m.subTopicId} className="par-mastery-card">
          <div className="par-card-top">
            <div className="par-crumb">
              {m.chapterName} · {m.topicName}
            </div>
            <span className={`par-trend par-trend--${m.trend}`}>
              {TREND_LABEL[m.trend]}
            </span>
          </div>
          <div className="par-mastery-st">{m.subTopicName}</div>
          <div className="par-levels">
            <Axis
              label="Understanding"
              level={m.conceptualLevel}
              prior={m.priorConceptualLevel}
            />
            <Axis
              label="Application"
              level={m.proceduralLevel}
              prior={m.priorProceduralLevel}
            />
          </div>
          <p className="par-desc">{m.description}</p>
        </div>
      ))}
    </div>
  );
}

function Axis({
  label,
  level,
  prior,
}: {
  label: string;
  level: number;
  prior: number | null;
}) {
  return (
    <span className="par-axislevel">
      <span className="par-axislabel">{label}</span>
      <span className="par-axisnum">{level}</span>
      <span className="par-axisscale">/5</span>
      {prior !== null && prior !== level && (
        <span className="par-axiswas">was {prior}</span>
      )}
    </span>
  );
}
