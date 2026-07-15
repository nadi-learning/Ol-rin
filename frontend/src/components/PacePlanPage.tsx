import { useCallback, useEffect, useMemo, useState } from "react";
import { trpc } from "../trpc";
import "./pace.css";

// Slice PACE-1 — the student Pace Plan surface. A per-student, per-subject
// timeline: first-visit SETUP (pick a deadline — no default — confirm the chapter
// order), then the TIMELINE (each chapter with its projected deadline + a pace
// pill saying whether the student is behind, reorder, mark-complete) + a
// subject-level roll-up. All numbers derive-at-read on the backend (D-PACE-5);
// this page only renders + sends edits. NO preparedness (that's PACE-2).
//
// `.pace-`-scoped CSS (the standing global-leak hygiene, S23).

type PlanView = Awaited<ReturnType<typeof trpc.pace.getPlan.query>>;
type Subject = Awaited<ReturnType<typeof trpc.pace.listSubjects.query>>[number];
type Chapter = Extract<PlanView, { needsSetup: false }>["chapters"][number];

export function PacePlanPage() {
  const [subjects, setSubjects] = useState<Subject[] | null>(null);
  const [subjectId, setSubjectId] = useState<string | null>(null);
  const [plan, setPlan] = useState<PlanView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Load subjects once; default to the first.
  useEffect(() => {
    trpc.pace.listSubjects
      .query()
      .then((subs) => {
        setSubjects(subs);
        setSubjectId((cur) => cur ?? subs[0]?.id ?? null);
      })
      .catch((e) => setError(String(e?.message ?? e)));
  }, []);

  const load = useCallback((sid: string) => {
    setPlan(null);
    setError(null);
    return trpc.pace.getPlan
      .query({ subjectId: sid })
      .then(setPlan)
      .catch((e) => setError(String(e?.message ?? e)));
  }, []);

  useEffect(() => {
    if (subjectId) void load(subjectId);
  }, [subjectId, load]);

  const refresh = useCallback(async () => {
    if (subjectId) await load(subjectId);
  }, [subjectId, load]);

  // Mutations (each refetches — derive-at-read).
  const runUpdate = useCallback(
    async (patch: Parameters<typeof trpc.pace.updatePlan.mutate>[0]) => {
      if (!subjectId) return;
      setBusy(true);
      try {
        await trpc.pace.updatePlan.mutate(patch);
        await refresh();
      } catch (e) {
        setError(String((e as Error)?.message ?? e));
      } finally {
        setBusy(false);
      }
    },
    [subjectId, refresh],
  );

  return (
    <div className="pace">
      <header className="pace-head">
        <h1 className="pace-title">Pace plan</h1>
        {subjects && subjects.length > 1 && (
          <select
            className="pace-subject-picker"
            value={subjectId ?? ""}
            onChange={(e) => setSubjectId(e.target.value)}
          >
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} · {s.grade}
              </option>
            ))}
          </select>
        )}
      </header>

      {error && <p className="pace-error">{error}</p>}
      {!error && !plan && <p className="pace-muted">Loading your plan…</p>}

      {plan?.needsSetup && subjectId && (
        <SetupFlow
          subjectName={plan.subject.name}
          defaultStartDate={plan.defaultStartDate}
          chapters={plan.chapters}
          onSubmit={async (startDate, endDate, chapterOrder) => {
            setBusy(true);
            try {
              await trpc.pace.setupPlan.mutate({ subjectId, startDate, endDate, chapterOrder });
              await refresh();
            } catch (e) {
              setError(String((e as Error)?.message ?? e));
            } finally {
              setBusy(false);
            }
          }}
        />
      )}

      {plan && !plan.needsSetup && (
        <Timeline plan={plan} busy={busy} onUpdate={runUpdate} />
      )}
    </div>
  );
}

// ───────────────────────── setup flow ─────────────────────────

function SetupFlow({
  subjectName,
  defaultStartDate,
  chapters,
  onSubmit,
}: {
  subjectName: string;
  defaultStartDate: string;
  chapters: Extract<PlanView, { needsSetup: true }>["chapters"];
  onSubmit: (startDate: string, endDate: string, chapterOrder: string[]) => void;
}) {
  const [startDate, setStartDate] = useState(defaultStartDate);
  const [endDate, setEndDate] = useState(""); // NO default — the point (D-PACE-1)
  const [order, setOrder] = useState<string[]>(chapters.map((c) => c.chapterId));

  const byId = useMemo(() => new Map(chapters.map((c) => [c.chapterId, c])), [chapters]);
  const move = (i: number, dir: -1 | 1) =>
    setOrder((prev) => {
      const next = [...prev];
      const j = i + dir;
      if (j < 0 || j >= next.length) return prev;
      [next[i], next[j]] = [next[j]!, next[i]!];
      return next;
    });

  const valid = !!endDate && endDate > startDate;

  return (
    <div className="pace-setup">
      <div className="pace-setup-intro">
        <h2 className="pace-setup-h">Set up your plan for {subjectName}</h2>
        <p className="pace-muted">
          Your plan only means something when it’s measured against a real deadline -
          pick the date you want to be exam-ready.
        </p>
      </div>

      <div className="pace-setup-dates">
        <label className="pace-field">
          <span className="pace-field-label">Start date</span>
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </label>
        <label className="pace-field">
          <span className="pace-field-label">
            Target end date <em className="pace-req">(required)</em>
          </span>
          <input
            type="date"
            value={endDate}
            min={startDate}
            onChange={(e) => setEndDate(e.target.value)}
          />
        </label>
      </div>

      <div className="pace-setup-order">
        <p className="pace-field-label">Confirm your chapter order</p>
        <ol className="pace-order-list">
          {order.map((id, i) => {
            const ch = byId.get(id);
            if (!ch) return null;
            return (
              <li className="pace-order-row" key={id}>
                <span className="pace-order-num">{i + 1}</span>
                <span className="pace-order-name">{ch.name}</span>
                <span className="pace-order-weeks">
                  ~{ch.recommendedWeeks} {ch.recommendedWeeks === 1 ? "wk" : "wks"}
                </span>
                <span className="pace-reorder">
                  <button disabled={i === 0} onClick={() => move(i, -1)} aria-label="Move up">
                    ↑
                  </button>
                  <button
                    disabled={i === order.length - 1}
                    onClick={() => move(i, 1)}
                    aria-label="Move down"
                  >
                    ↓
                  </button>
                </span>
              </li>
            );
          })}
        </ol>
      </div>

      <button
        className="pace-primary"
        disabled={!valid}
        onClick={() => onSubmit(startDate, endDate, order)}
      >
        Create my plan
      </button>
      {!valid && endDate !== "" && (
        <p className="pace-hint">End date must be after the start date.</p>
      )}
    </div>
  );
}

// ───────────────────────── timeline ─────────────────────────

function Timeline({
  plan,
  busy,
  onUpdate,
}: {
  plan: Extract<PlanView, { needsSetup: false }>;
  busy: boolean;
  onUpdate: (patch: Parameters<typeof trpc.pace.updatePlan.mutate>[0]) => void;
}) {
  const [editDates, setEditDates] = useState(false);
  const { summary, chapters, subject } = plan;

  // Rebuild the full ordered list for any structural edit — carry weeksOverride
  // through so a reorder / complete-toggle never wipes a student's estimate.
  const toList = (rows: Chapter[]) =>
    rows.map((c) => ({
      chapterId: c.chapterId,
      completed: c.completed,
      ...(c.weeksOverride !== undefined ? { weeksOverride: c.weeksOverride } : {}),
    }));

  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= chapters.length) return;
    const rows = [...chapters];
    [rows[i], rows[j]] = [rows[j]!, rows[i]!];
    onUpdate({ subjectId: subject.id, chapters: toList(rows) });
  };
  const toggleComplete = (chapterId: string, completed: boolean) => {
    const rows = chapters.map((c) => (c.chapterId === chapterId ? { ...c, completed } : c));
    onUpdate({ subjectId: subject.id, chapters: toList(rows) });
  };
  // Set (or clear, weeks===undefined) one chapter's estimate override. D-PACE-10.
  const setEstimate = (chapterId: string, weeks: number | undefined) => {
    const rows = chapters.map((c) =>
      c.chapterId === chapterId ? { ...c, weeksOverride: weeks } : c,
    );
    onUpdate({ subjectId: subject.id, chapters: toList(rows) });
  };

  return (
    <div className={`pace-timeline${busy ? " pace-timeline--busy" : ""}`}>
      <div className="pace-summary">
        <div className="pace-summary-main">
          <span className="pace-summary-label">Overall</span>
          <PacePill status={summary.subjectStatus} />
        </div>
        <div className="pace-summary-dates">
          {!editDates ? (
            <>
              <span className="pace-window">
                {fmtDate(summary.startDate)} → {fmtDate(summary.endDate)}
              </span>
              <button className="pace-linkbtn" onClick={() => setEditDates(true)}>
                Edit dates
              </button>
            </>
          ) : (
            <DateEditor
              start={summary.startDate}
              end={summary.endDate}
              onSave={(startDate, endDate) => {
                onUpdate({ subjectId: subject.id, startDate, endDate });
                setEditDates(false);
              }}
              onCancel={() => setEditDates(false)}
            />
          )}
        </div>
      </div>

      {summary.budgetStatus === "over" && (
        <p className="pace-banner pace-banner--over">
          <b>~{weeks(summary.totalRecommendedDays - summary.availableDays)} weeks over your
          deadline.</b>{" "}
          Your plan needs about {weeks(summary.totalRecommendedDays)} weeks but you’ve allowed{" "}
          {weeks(summary.availableDays)}. Adjust your estimates below or move your deadline -
          reordering won’t change the total.
        </p>
      )}
      {summary.budgetStatus === "under" && (
        <p className="pace-banner pace-banner--under">
          ~{weeks(summary.availableDays - summary.totalRecommendedDays)} weeks of buffer - your
          plan fits inside your deadline.
        </p>
      )}

      <ol className="pace-chapters">
        {chapters.map((c, i) => (
          <li className={`pace-chapter pace-chapter--${c.paceStatus}`} key={c.chapterId}>
            <span className="pace-chapter-num">{i + 1}</span>
            <span className="pace-chapter-body">
              <span className="pace-chapter-name">{c.name}</span>
              <span className="pace-chapter-meta">
                <EstimateEditor
                  chapter={c}
                  busy={busy}
                  onSet={(w) => setEstimate(c.chapterId, w)}
                />
                {c.projectedEndDate && (
                  <> · should be done by <b>{fmtDate(c.projectedEndDate)}</b></>
                )}
              </span>
            </span>

            {/* Requirement §8: preparedness pill + complete toggle visually adjacent —
                the metacognition tension (marking Done while readiness is low) must
                be legible. */}
            <span className="pace-chapter-signals">
              {c.paceStatus && <PacePill status={c.paceStatus} />}
              {c.preparedness && <PreparednessPill p={c.preparedness} />}
              <label className="pace-complete">
                <input
                  type="checkbox"
                  checked={c.completed}
                  disabled={busy}
                  onChange={(e) => toggleComplete(c.chapterId, e.target.checked)}
                />
                <span>Done</span>
              </label>
            </span>

            <span className="pace-reorder">
              <button disabled={busy || i === 0} onClick={() => move(i, -1)} aria-label="Move up">
                ↑
              </button>
              <button
                disabled={busy || i === chapters.length - 1}
                onClick={() => move(i, 1)}
                aria-label="Move down"
              >
                ↓
              </button>
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function DateEditor({
  start,
  end,
  onSave,
  onCancel,
}: {
  start: string;
  end: string;
  onSave: (start: string, end: string) => void;
  onCancel: () => void;
}) {
  const [s, setS] = useState(start);
  const [e, setE] = useState(end);
  const valid = e > s;
  return (
    <div className="pace-date-editor">
      <input type="date" value={s} onChange={(ev) => setS(ev.target.value)} />
      <span>→</span>
      <input type="date" value={e} min={s} onChange={(ev) => setE(ev.target.value)} />
      <button className="pace-linkbtn" disabled={!valid} onClick={() => onSave(s, e)}>
        Save
      </button>
      <button className="pace-linkbtn pace-linkbtn--muted" onClick={onCancel}>
        Cancel
      </button>
    </div>
  );
}

// Inline per-chapter estimate override (D-PACE-10). Shows the effective weeks as
// a clickable chip → number input; keeps the "suggested ~N" anchor visible when
// overridden (the metacognition guard) + a reset-to-suggested affordance.
function EstimateEditor({
  chapter,
  busy,
  onSet,
}: {
  chapter: Chapter;
  busy: boolean;
  onSet: (weeks: number | undefined) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(String(chapter.recommendedWeeks));
  const overridden = chapter.weeksOverride !== undefined;

  const commit = () => {
    const n = Number(val);
    if (!Number.isNaN(n) && n >= 0.5 && n <= 52) onSet(n);
    setEditing(false);
  };

  if (editing) {
    return (
      <span className="pace-estimate pace-estimate--editing">
        <input
          className="pace-estimate-input"
          type="number"
          min={0.5}
          max={52}
          step={0.5}
          value={val}
          autoFocus
          onChange={(e) => setVal(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            if (e.key === "Escape") setEditing(false);
          }}
          onBlur={commit}
        />
        <span className="pace-estimate-unit">wks</span>
      </span>
    );
  }

  return (
    <span className="pace-estimate">
      <button
        className={`pace-estimate-chip${overridden ? " pace-estimate-chip--overridden" : ""}`}
        disabled={busy}
        onClick={() => {
          setVal(String(chapter.recommendedWeeks));
          setEditing(true);
        }}
        title="Set your own estimate"
      >
        ~{chapter.recommendedWeeks} {chapter.recommendedWeeks === 1 ? "wk" : "wks"}
      </button>
      {overridden && (
        <>
          <span className="pace-estimate-anchor">
            suggested ~{chapter.suggestedWeeks}
          </span>
          <button
            className="pace-linkbtn pace-linkbtn--muted pace-estimate-reset"
            disabled={busy}
            onClick={() => onSet(undefined)}
            title="Use the suggested estimate"
          >
            reset
          </button>
        </>
      )}
    </span>
  );
}

// ───────────────────────── bits ─────────────────────────

const STATUS_LABEL: Record<string, string> = {
  completed: "Completed",
  on_time: "On track",
  delay_risk: "Slightly behind",
  amber: "Behind",
  red: "Well behind",
};

function PacePill({ status }: { status: string }) {
  return <span className={`pace-pill pace-pill--${status}`}>{STATUS_LABEL[status] ?? status}</span>;
}

const PREP_LABEL: Record<string, string> = {
  strong: "Strong",
  on_track: "On track",
  needs_work: "Needs work",
  not_started: "Not started",
};

/** System-measured readiness (PACE-2). Sits by the Done toggle for the §8 tension. */
function PreparednessPill({ p }: { p: { label: string; certifiedSubTopics: number } }) {
  const title =
    p.label === "not_started"
      ? "No certified mastery yet for this chapter"
      : `Rolled up from ${p.certifiedSubTopics} assessed sub-topic${p.certifiedSubTopics === 1 ? "" : "s"}`;
  return (
    <span className={`pace-prep pace-prep--${p.label}`} title={title}>
      {PREP_LABEL[p.label] ?? p.label}
    </span>
  );
}

/** ISO YYYY-MM-DD → "15 May 2026". */
function fmtDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}
function weeks(days: number): number {
  return Math.round(days / 7);
}
