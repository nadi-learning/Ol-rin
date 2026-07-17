import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { trpc, BOARD } from "../trpc";
import { MathText } from "./MathText";
import "./tutor.css";

// Slice T — the Tutor READ surface. A tutor inspects a linked student's
// certified mastery + the Stage-1 observations waiting to be certified. NO
// mastery move (Slice S2 adds the draft + finalize action). Role-routed from
// App.tsx when me.role === 'tutor'. All classes are `.tut-`-scoped to dodge the
// global revision-shell.css landmine (same discipline as .qc-/.rev-/.prac-).

type Student = Awaited<ReturnType<typeof trpc.tutor.listStudents.query>>[number];
type ProgressChapterView = Awaited<
  ReturnType<typeof trpc.tutor.getProgressTree.query>
>[number];
type AxisRollupView = ProgressChapterView["conceptual"];
// Slice S2R-2 — the tutor's unit is the SITTING, not a per-sub_topic worklist.
type PendingAssessment = Awaited<
  ReturnType<typeof trpc.tutor.listPendingAssessments.query>
>[number];
type AssessmentSessionView = Awaited<
  ReturnType<typeof trpc.tutor.openAssessmentSession.mutate>
>;
type ObservationView = Awaited<
  ReturnType<typeof trpc.tutor.getObservations.query>
>[number];
// A correction returns the read fields only (no recall context) — merged onto the row.
type ObservationCorrection = Awaited<
  ReturnType<typeof trpc.tutor.overrideObservation.mutate>
>;
// Assign-tab question preview (stem + authoring "why").
type AssignQuestionView = Awaited<
  ReturnType<typeof trpc.tutor.getSubTopicQuestions.query>
>[number];
type Stage2DraftResult = AssessmentSessionView["drafts"][string];
type Stage2Draft = Stage2DraftResult["draft"];
type CrossConceptFlagView = Awaited<
  ReturnType<typeof trpc.tutor.getCrossConceptFlags.query>
>[number];
type DueGroup = Awaited<
  ReturnType<typeof trpc.tutor.getDueQueue.query>
>[number];
type DueItem = DueGroup["items"][number];
type AssignmentView = Awaited<
  ReturnType<typeof trpc.tutor.listAssignments.query>
>[number];
type Nav = Awaited<ReturnType<typeof trpc.revision.getChapterNav.query>>;
type ReportSummary = Awaited<
  ReturnType<typeof trpc.tutor.listReports.query>
>[number];
type ReportDetail = Awaited<ReturnType<typeof trpc.tutor.assembleReport.mutate>>;

export function TutorPage({
  tutorName,
  onSignOut,
}: {
  tutorName: string;
  onSignOut: () => void;
}) {
  const [students, setStudents] = useState<Student[] | null>(null);
  const [selected, setSelected] = useState<Student | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    trpc.tutor.listStudents
      .query()
      .then((r) => setStudents(r))
      .catch((e) => setError(String(e?.message ?? e)));
  }, []);

  return (
    <div className="tut-root graph-paper">
      <header className="tut-header">
        <div>
          <div className="tut-eyebrow">Tutor</div>
          <h1 className="tut-title">{tutorName}</h1>
        </div>
        <div className="tut-header-actions">
          <button className="tut-signout" onClick={onSignOut}>
            Sign out
          </button>
        </div>
      </header>

      {error && <p className="tut-error">{error}</p>}

      {!selected ? (
        <StudentList students={students} onPick={(s) => setSelected(s)} />
      ) : (
        <StudentDetail student={selected} onBack={() => setSelected(null)} />
      )}
    </div>
  );
}

function StudentList({
  students,
  onPick,
}: {
  students: Student[] | null;
  onPick: (s: Student) => void;
}) {
  if (students === null) return <p className="tut-muted">Loading students…</p>;
  if (students.length === 0)
    return <p className="tut-muted">No students linked to you yet.</p>;
  return (
    <section className="tut-section">
      <h2 className="tut-section-title">Your students</h2>
      <div className="tut-student-grid">
        {students.map((s) => (
          <button
            key={s.studentId}
            className="tut-student-card"
            onClick={() => onPick(s)}
          >
            <span className="tut-avatar">
              {(s.name ?? s.email).trim().slice(0, 1).toUpperCase()}
            </span>
            <span className="tut-student-meta">
              <span className="tut-student-name">{s.name ?? s.email}</span>
              <span className="tut-student-email">{s.email}</span>
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}

function StudentDetail({
  student,
  onBack,
}: {
  student: Student;
  onBack: () => void;
}) {
  const [pending, setPending] = useState<PendingAssessment[] | null>(null);
  const [due, setDue] = useState<DueGroup[] | null>(null);
  const [assignments, setAssignments] = useState<AssignmentView[] | null>(null);
  const [nav, setNav] = useState<Nav | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<TutorTab>("assess");

  const reload = useCallback(() => {
    setError(null);
    Promise.all([
      trpc.tutor.listPendingAssessments.query({ studentId: student.studentId }),
      trpc.tutor.getDueQueue.query({ studentId: student.studentId }),
      trpc.tutor.listAssignments.query({ studentId: student.studentId }),
    ])
      .then(([p, d, a]) => {
        setPending(p);
        setDue(d);
        setAssignments(a);
      })
      .catch((e) => setError(String(e?.message ?? e)));
  }, [student.studentId]);

  useEffect(() => {
    setPending(null);
    setDue(null);
    setAssignments(null);
    setTab("assess"); // land on the act-now tab for each student
    reload();
    // chapter tree for the blocked composer (board-scoped; tutor has membership).
    trpc.revision.getChapterNav.query().then(setNav).catch(() => setNav([]));
  }, [reload]);

  // Badge counts on the time-pressured tabs (so urgency shows without entering).
  const pendingCount = pending?.length ?? 0;
  const dueCount = (due ?? []).reduce((n, g) => n + g.items.length, 0);

  // 2A — sub_topics with outstanding assigned work (their session isn't yet
  // completed). The composers mark these "assigned" + disable them so the tutor
  // can't create a duplicate; a sub_topic whose work IS done drops out and is
  // re-assignable (a fresh spiral round). Derived from listAssignments (already
  // loaded) — no extra read needed.
  const assignedOpen = useMemo(() => {
    const s = new Set<string>();
    for (const a of assignments ?? [])
      for (const st of a.subTopics)
        if (st.sessionStatus !== "completed") s.add(st.subTopicId);
    return s;
  }, [assignments]);

  return (
    <div>
      <button className="tut-back" onClick={onBack}>
        ← All students
      </button>
      <h2 className="tut-student-heading">{student.name ?? student.email}</h2>

      {error && <p className="tut-error">{error}</p>}

      <nav className="tut-tabs" role="tablist">
        <TutorTabButton id="assess" tab={tab} onPick={setTab} label="Assess" badge={pendingCount} />
        <TutorTabButton id="assign" tab={tab} onPick={setTab} label="Assign" badge={dueCount} />
        <TutorTabButton id="pace" tab={tab} onPick={setTab} label="Pace" />
        <TutorTabButton id="reports" tab={tab} onPick={setTab} label="Reports" />
        <TutorTabButton id="author" tab={tab} onPick={setTab} label="Author" />
      </nav>

      {tab === "assess" && (
        <section className="tut-section">
          <h3 className="tut-section-title">Waiting to assess</h3>
          <PendingList student={student} pending={pending} onFinalized={reload} />
        </section>
      )}

      {tab === "assign" && (
        <>
          <section className="tut-section">
            <h3 className="tut-section-title">Due to re-practise (spiral)</h3>
            <DueQueue
              due={due}
              studentId={student.studentId}
              assignedOpen={assignedOpen}
              onAssigned={reload}
              onError={setError}
            />
          </section>

          <section className="tut-section">
            <h3 className="tut-section-title">Focused (blocked) assignment</h3>
            <BlockedComposer
              nav={nav}
              studentId={student.studentId}
              assignedOpen={assignedOpen}
              onAssigned={reload}
              onError={setError}
            />
          </section>

          <section className="tut-section">
            <h3 className="tut-section-title">Assigned work</h3>
            <AssignmentList assignments={assignments} />
          </section>
        </>
      )}

      {tab === "pace" && (
        <section className="tut-section">
          <h3 className="tut-section-title">Pace plan</h3>
          <TutorPacePanel student={student} />
        </section>
      )}

      {tab === "reports" && (
        <section className="tut-section">
          <h3 className="tut-section-title">Progress reports (parent sign-off)</h3>
          <ReportPanel student={student} onError={setError} />
        </section>
      )}

      {tab === "author" && <AuthorTab student={student} nav={nav} />}
    </div>
  );
}

// ── Slice T6: the tutor Pace-Plan view (read-only) ─────────────────────────
// The SAME derive-at-read Pace Plan the student sees (tutor.getStudentPacePlan),
// rendered read-only: no setup form, no reorder / mark-complete, no estimate or
// date editors. The tutor picks a subject and reads the timeline. All numbers
// come from the backend (D-PACE-5). `.tut-pace-`-scoped (global-leak hygiene).

type TutorPlan = Awaited<ReturnType<typeof trpc.tutor.getStudentPacePlan.query>>;
type TutorPlanSubject = Awaited<
  ReturnType<typeof trpc.tutor.listSubjects.query>
>[number];
type TutorPlanChapter = Extract<TutorPlan, { needsSetup: false }>["chapters"][number];

const PACE_STATUS_LABEL: Record<string, string> = {
  completed: "Completed",
  on_time: "On track",
  delay_risk: "Slightly behind",
  amber: "Behind",
  red: "Well behind",
};
const PREP_LABEL: Record<string, string> = {
  strong: "Strong",
  on_track: "On track",
  needs_work: "Needs work",
  not_started: "Not started",
};

function fmtPaceDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}
function paceWeeks(days: number): number {
  return Math.round(days / 7);
}

function TutorPacePanel({ student }: { student: Student }) {
  const [subjects, setSubjects] = useState<TutorPlanSubject[] | null>(null);
  const [subjectId, setSubjectId] = useState<string | null>(null);
  const [plan, setPlan] = useState<TutorPlan | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    trpc.tutor.listSubjects
      .query()
      .then((subs) => {
        setSubjects(subs);
        setSubjectId((cur) => cur ?? subs[0]?.id ?? null);
      })
      .catch((e) => setError(String(e?.message ?? e)));
  }, []);

  useEffect(() => {
    if (!subjectId) return;
    setPlan(null);
    setError(null);
    trpc.tutor.getStudentPacePlan
      .query({ studentId: student.studentId, subjectId })
      .then(setPlan)
      .catch((e) => setError(String(e?.message ?? e)));
  }, [subjectId, student.studentId]);

  return (
    <div className="tut-pace">
      {subjects && subjects.length > 1 && (
        <select
          className="tut-pace-subject"
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

      {error && <p className="tut-error">{error}</p>}
      {!error && !plan && <p className="tut-muted">Loading pace plan…</p>}

      {plan?.needsSetup && (
        <div className="tut-pace-empty">
          <p className="tut-muted">
            {student.name ?? student.email} hasn’t set up a pace plan for{" "}
            <b>{plan.subject.name}</b> yet.
          </p>
          <p className="tut-pace-empty-sub">Suggested order &amp; effort:</p>
          <ol className="tut-pace-list">
            {plan.chapters.map((c, i) => (
              <li className="tut-pace-row" key={c.chapterId}>
                <span className="tut-pace-num">{i + 1}</span>
                <span className="tut-pace-name">{c.name}</span>
                <span className="tut-pace-weeks">
                  ~{c.recommendedWeeks} {c.recommendedWeeks === 1 ? "wk" : "wks"}
                </span>
              </li>
            ))}
          </ol>
        </div>
      )}

      {plan && !plan.needsSetup && <TutorPaceTimeline plan={plan} />}
    </div>
  );
}

function TutorPaceTimeline({
  plan,
}: {
  plan: Extract<TutorPlan, { needsSetup: false }>;
}) {
  const { summary, chapters } = plan;
  const over = summary.totalRecommendedDays - summary.availableDays;
  return (
    <div className="tut-pace-timeline">
      <div className="tut-pace-summary">
        <span className="tut-pace-summary-label">Overall</span>
        <PacePillTut status={summary.subjectStatus} />
        <span className="tut-pace-window">
          {fmtPaceDate(summary.startDate)} → {fmtPaceDate(summary.endDate)}
        </span>
      </div>

      {summary.budgetStatus === "over" && (
        <p className="tut-pace-banner tut-pace-banner--over">
          <b>~{paceWeeks(over)} weeks over the deadline.</b> Plan needs about{" "}
          {paceWeeks(summary.totalRecommendedDays)} weeks; {paceWeeks(summary.availableDays)}{" "}
          allowed.
        </p>
      )}
      {summary.budgetStatus === "under" && (
        <p className="tut-pace-banner tut-pace-banner--under">
          ~{paceWeeks(-over)} weeks of buffer - the plan fits inside the deadline.
        </p>
      )}

      <ol className="tut-pace-list">
        {chapters.map((c: TutorPlanChapter, i) => (
          <li className={`tut-pace-row tut-pace-row--${c.paceStatus}`} key={c.chapterId}>
            <span className="tut-pace-num">{i + 1}</span>
            <span className="tut-pace-body">
              <span className="tut-pace-name">{c.name}</span>
              <span className="tut-pace-meta">
                ~{c.recommendedWeeks} {c.recommendedWeeks === 1 ? "wk" : "wks"}
                {c.projectedEndDate && (
                  <> · should be done by <b>{fmtPaceDate(c.projectedEndDate)}</b></>
                )}
              </span>
            </span>
            <span className="tut-pace-signals">
              {c.paceStatus && <PacePillTut status={c.paceStatus} />}
              {c.preparedness && (
                <span
                  className={`tut-pace-prep tut-pace-prep--${c.preparedness.label}`}
                  title={
                    c.preparedness.label === "not_started"
                      ? "No certified mastery yet for this chapter"
                      : `Rolled up from ${c.preparedness.certifiedSubTopics} assessed sub-topic${c.preparedness.certifiedSubTopics === 1 ? "" : "s"}`
                  }
                >
                  {PREP_LABEL[c.preparedness.label] ?? c.preparedness.label}
                </span>
              )}
              {c.completed && <span className="tut-pace-done">Done</span>}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function PacePillTut({ status }: { status: string }) {
  return (
    <span className={`tut-pace-pill tut-pace-pill--${status}`}>
      {PACE_STATUS_LABEL[status] ?? status}
    </span>
  );
}

type TutorTab = "assess" | "assign" | "pace" | "reports" | "author";

// Slice QA3-c: the Author tab is PROGRESS-FIRST (D-QA3-1), a two-level drill-down
// (eyeball feedback): (1) chapter list — each chapter + its two-axis rollup;
// (2) click a chapter → detail (topics → sub-topics) with a Start-authoring CTA
// that opens the chat PRE-SCOPED to that chapter (no global "author anything").
function AuthorTab({ student, nav }: { student: Student; nav: Nav | null }) {
  const [tree, setTree] = useState<ProgressChapterView[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openChapterId, setOpenChapterId] = useState<string | null>(null);
  const [authorChapterId, setAuthorChapterId] = useState<string | null>(null);
  // QA3-d: the L0 launcher (model → mode → chapter(s)) and the launched chat scope.
  const [launcherOpen, setLauncherOpen] = useState(false);
  const [launch, setLaunch] = useState<LaunchConfig | null>(null);
  // A past chat the tutor chose to resume straight from the landing (no new launch).
  const [resumeChatId, setResumeChatId] = useState<string | null>(null);

  useEffect(() => {
    setTree(null);
    setError(null);
    setOpenChapterId(null);
    setAuthorChapterId(null);
    setLauncherOpen(false);
    setLaunch(null);
    setResumeChatId(null);
    trpc.tutor.getProgressTree
      .query({ studentId: student.studentId })
      .then(setTree)
      .catch((e) => setError(String(e?.message ?? e)));
  }, [student.studentId]);

  // (0a) resume a past chat picked from the landing history dropdown.
  if (resumeChatId) {
    return (
      <div className="tut-authwrap">
        <button className="tut-back" onClick={() => setResumeChatId(null)}>
          ← Back to progress
        </button>
        <AuthorChat student={student} nav={nav} resumeChatId={resumeChatId} />
      </div>
    );
  }

  // (0) a launched chat (QA3-d) — scoped to {model, mode, chapters} from the modal.
  if (launch) {
    return (
      <div className="tut-authwrap">
        <button className="tut-back" onClick={() => setLaunch(null)}>
          ← Back to progress
        </button>
        <AuthorChat student={student} nav={nav} launch={launch} />
      </div>
    );
  }

  // (3) authoring, scoped to the chapter the tutor drilled into (fast path = blocked)
  if (authorChapterId) {
    return (
      <div className="tut-authwrap">
        <button className="tut-back" onClick={() => setAuthorChapterId(null)}>
          ← Back to progress
        </button>
        <AuthorChat student={student} nav={nav} initialChapterId={authorChapterId} />
      </div>
    );
  }

  // (2) chapter detail
  if (openChapterId) {
    const ch = tree?.find((c) => c.chapterId === openChapterId) ?? null;
    return (
      <ChapterDetail
        studentName={student.name ?? "the student"}
        chapter={ch}
        onBack={() => setOpenChapterId(null)}
        onAuthor={() => setAuthorChapterId(openChapterId)}
      />
    );
  }

  // (1) chapter list + the L0 "Author questions" launcher (multi-chapter / mode)
  return (
    <section className="tut-section">
      <div className="tut-author-head">
        <div>
          <h3 className="tut-section-title">Where is {student.name ?? "the student"}?</h3>
          <p className="tut-muted">
            Pick a chapter to drill in, or launch an authoring session across one or
            more chapters.
          </p>
        </div>
        <div className="tut-author-head-actions">
          <HistoryPicker
            studentId={student.studentId}
            activeChatId={null}
            onResume={(chatId) => setResumeChatId(chatId)}
          />
          <button
            className="tut-btn-primary"
            onClick={() => setLauncherOpen(true)}
            disabled={nav === null || nav.length === 0}
          >
            Author questions →
          </button>
        </div>
      </div>
      <ChapterList tree={tree} error={error} onOpen={setOpenChapterId} />
      {launcherOpen && (
        <AuthorLauncher
          chapters={nav ?? []}
          onClose={() => setLauncherOpen(false)}
          onConfirm={(cfg) => {
            setLauncherOpen(false);
            setLaunch(cfg);
          }}
        />
      )}
    </section>
  );
}

// QA3-d launcher config: the {model, mode, chapters} the modal collects → seeds a
// scoped AuthorChat.
type LaunchConfig = {
  vendor: VendorChoice;
  mode: "blocked" | "interleaved";
  chapterIds: string[];
};

// The L0 "Author questions" modal (QA3-d): model → mode → chapter(s). Blocked =
// single-select (one chapter); interleaved = multi-select (grounded across the set).
function AuthorLauncher({
  chapters,
  onClose,
  onConfirm,
}: {
  chapters: Nav;
  onClose: () => void;
  onConfirm: (cfg: LaunchConfig) => void;
}) {
  const [vendor, setVendor] = useState<VendorChoice>("gemini_api");
  const [mode, setMode] = useState<"blocked" | "interleaved">("blocked");
  const [picked, setPicked] = useState<string[]>([]);
  // Chapter picker is now a searchable dropdown: `ddOpen` toggles the panel,
  // `query` filters the option list by chapter name.
  const [ddOpen, setDdOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ddRef = useRef<HTMLDivElement>(null);

  // Switching to blocked collapses any multi-selection to at most one chapter.
  function selectMode(m: "blocked" | "interleaved") {
    setMode(m);
    if (m === "blocked") setPicked((p) => (p.length > 1 ? [p[0]!] : p));
  }
  function toggleChapter(id: string) {
    if (mode === "blocked") {
      setPicked([id]);
      // Blocked = single pick → close the dropdown once chosen.
      setDdOpen(false);
      setQuery("");
    } else {
      setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
    }
  }

  // Close the dropdown on outside-click / Escape (without closing the modal).
  useEffect(() => {
    if (!ddOpen) return;
    function onDoc(e: MouseEvent) {
      if (ddRef.current && !ddRef.current.contains(e.target as Node)) setDdOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setDdOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [ddOpen]);

  const q = query.trim().toLowerCase();
  const filteredChapters = q
    ? chapters.filter((c) => c.name.toLowerCase().includes(q))
    : chapters;
  const pickedNames = chapters.filter((c) => picked.includes(c.id)).map((c) => c.name);
  const ddSummary =
    picked.length === 0
      ? mode === "blocked"
        ? "Select a chapter"
        : "Select chapters"
      : mode === "blocked"
        ? pickedNames[0]
        : `${picked.length} chapter${picked.length > 1 ? "s" : ""} selected`;

  const ready = picked.length >= 1 && (mode === "blocked" ? picked.length === 1 : true);

  return (
    <div className="tut-launch-overlay" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="tut-launch-modal" onClick={(e) => e.stopPropagation()}>
        <div className="tut-launch-head">
          <h4 className="tut-launch-title">Author questions</h4>
          <button className="tut-launch-x" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <div className="tut-launch-field">
          <span className="tut-chat-vendorlabel">Model</span>
          <div className="tut-chat-vendortoggle" role="tablist">
            {(["gemini_api", "claude_cli"] as VendorChoice[]).map((v) => (
              <button
                key={v}
                role="tab"
                aria-selected={vendor === v}
                className={`tut-chat-vendoropt${vendor === v ? " is-on" : ""}`}
                onClick={() => setVendor(v)}
              >
                {VENDOR_LABEL[v]}
              </button>
            ))}
          </div>
        </div>

        <div className="tut-launch-field">
          <span className="tut-chat-vendorlabel">Mode</span>
          <div className="tut-chat-vendortoggle" role="tablist">
            {(
              [
                ["blocked", "Blocked"],
                ["interleaved", "Interleaved"],
              ] as const
            ).map(([m, label]) => (
              <button
                key={m}
                role="tab"
                aria-selected={mode === m}
                className={`tut-chat-vendoropt${mode === m ? " is-on" : ""}`}
                onClick={() => selectMode(m)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="tut-launch-field">
          <span className="tut-chat-vendorlabel">
            {mode === "blocked" ? "Chapter" : "Chapters"}
          </span>
          <div className="tut-launch-dd" ref={ddRef}>
            <button
              type="button"
              className={`tut-launch-dd-trigger${ddOpen ? " is-open" : ""}`}
              aria-expanded={ddOpen}
              onClick={() => setDdOpen((o) => !o)}
            >
              <span
                className={`tut-launch-dd-value${picked.length === 0 ? " is-placeholder" : ""}`}
              >
                {ddSummary}
              </span>
              <span className="tut-launch-dd-caret" aria-hidden>
                ▾
              </span>
            </button>
            {mode === "interleaved" && picked.length > 0 && (
              <div className="tut-launch-dd-chips">
                {chapters
                  .filter((c) => picked.includes(c.id))
                  .map((c) => (
                    <span key={c.id} className="tut-launch-dd-chip">
                      {c.name}
                      <button
                        type="button"
                        className="tut-launch-dd-chip-x"
                        aria-label={`Remove ${c.name}`}
                        onClick={() => toggleChapter(c.id)}
                      >
                        ×
                      </button>
                    </span>
                  ))}
              </div>
            )}
            {ddOpen && (
              <div className="tut-launch-dd-panel">
                <input
                  className="tut-launch-dd-search"
                  type="text"
                  placeholder="Search chapters…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  autoFocus
                />
                <div className="tut-launch-chlist">
                  {filteredChapters.length === 0 ? (
                    <div className="tut-launch-dd-empty">No chapters match</div>
                  ) : (
                    filteredChapters.map((c) => {
                      const on = picked.includes(c.id);
                      return (
                        <button
                          key={c.id}
                          type="button"
                          className={`tut-launch-chopt${on ? " is-on" : ""}`}
                          onClick={() => toggleChapter(c.id)}
                        >
                          <span className="tut-launch-chmark" aria-hidden>
                            {on ? (mode === "blocked" ? "●" : "✓") : ""}
                          </span>
                          {c.name}
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="tut-launch-actions">
          <button className="tut-back" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn-solid"
            disabled={!ready}
            onClick={() => onConfirm({ vendor, mode, chapterIds: picked })}
          >
            Start authoring →
          </button>
        </div>
      </div>
    </div>
  );
}

function TutorTabButton({
  id,
  tab,
  onPick,
  label,
  badge,
}: {
  id: TutorTab;
  tab: TutorTab;
  onPick: (t: TutorTab) => void;
  label: string;
  badge?: number;
}) {
  const active = tab === id;
  return (
    <button
      role="tab"
      aria-selected={active}
      className={`tut-tab${active ? " is-active" : ""}`}
      onClick={() => onPick(id)}
    >
      {label}
      {badge ? <span className="tut-tab-badge">{badge}</span> : null}
    </button>
  );
}

// Slice SCH — the spiral due-queue (#3): which taught sub-topics are due to
// re-practise, grouped by subject, most-overdue-first, with the suggested
// interleaved bundle (≥3 both axes) vs blocked (served alone) split.
// Slice ASG adds the consumer: each subject's eligible interleaved set can be
// composed → assigned (intent §5/§7 one-click-assign, tutor edits first).
function DueQueue({
  due,
  studentId,
  assignedOpen,
  onAssigned,
  onError,
}: {
  due: DueGroup[] | null;
  studentId: string;
  assignedOpen: Set<string>;
  onAssigned: () => void;
  onError: (m: string) => void;
}) {
  if (due === null) return <p className="tut-muted">Loading…</p>;
  if (due.length === 0)
    return <p className="tut-muted">Nothing due - the spiral is clear.</p>;
  return (
    <div className="tut-sch-groups">
      {due.map((g) => {
        const nameOf = new Map(g.items.map((i) => [i.subTopicId, i.subTopicName]));
        return (
          <div key={g.subjectId} className="tut-sch-group">
            <div className="tut-sch-subject">{g.subjectName}</div>
            {g.interleaved.length > 0 && (
              <InterleaveAssign
                group={g}
                nameOf={nameOf}
                studentId={studentId}
                assignedOpen={assignedOpen}
                onAssigned={onAssigned}
                onError={onError}
              />
            )}
            {g.blocked.length > 0 && (
              <div className="tut-sch-suggest tut-sch-suggest-blocked">
                <span className="tut-sch-suggest-label">Re-check alone (blocked)</span>
                <span className="tut-sch-suggest-list">
                  {g.blocked.map((id) => nameOf.get(id)).join("  ·  ")}
                </span>
              </div>
            )}
            <div className="tut-sch-items">
              {g.items.map((it) => (
                <DueRow key={it.subTopicId} it={it} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// The interleaved compose→assign control: the engine pre-fills the eligible set;
// the tutor drops any before assigning (intent §5 "tutor stays in control").
function InterleaveAssign({
  group,
  nameOf,
  studentId,
  assignedOpen,
  onAssigned,
  onError,
}: {
  group: DueGroup;
  nameOf: Map<string, string>;
  studentId: string;
  assignedOpen: Set<string>;
  onAssigned: () => void;
  onError: (m: string) => void;
}) {
  // 2A — pre-fill the suggestion minus any sub_topic that already has open
  // assigned work (those can't be re-added until that work completes).
  const [picked, setPicked] = useState<string[]>(
    group.interleaved.filter((id) => !assignedOpen.has(id)),
  );
  const [busy, setBusy] = useState(false);

  const toggle = (id: string) => {
    if (assignedOpen.has(id)) return;
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  };

  const assign = () => {
    if (picked.length === 0) return;
    setBusy(true);
    trpc.tutor.createAssignment
      .mutate({
        studentId,
        mode: "interleaved",
        subjectId: group.subjectId,
        subTopicIds: picked,
      })
      .then(() => onAssigned())
      .catch((e) => onError(String(e?.message ?? e)))
      .finally(() => setBusy(false));
  };

  return (
    <div className="tut-sch-suggest tut-asg-compose">
      <span className="tut-sch-suggest-label">Interleave as one set</span>
      <div className="tut-asg-chips">
        {group.interleaved.map((id) => {
          const taken = assignedOpen.has(id);
          return (
            <button
              key={id}
              className={`tut-asg-chip${picked.includes(id) ? " is-on" : ""}${taken ? " is-assigned" : ""}`}
              onClick={() => toggle(id)}
              disabled={busy || taken}
              title={taken ? "Already in an open assignment" : undefined}
            >
              {nameOf.get(id)}
              {taken && <span className="tut-asg-chip-badge">assigned</span>}
            </button>
          );
        })}
      </div>
      <button
        className="tut-asg-btn"
        onClick={assign}
        disabled={busy || picked.length === 0}
      >
        {busy ? "Assigning…" : `Assign ${picked.length} as interleaved set →`}
      </button>
      <div className="tut-asg-previews">
        {group.interleaved.map((id) => (
          <SubTopicPreview key={id} subTopicId={id} name={nameOf.get(id) ?? ""} />
        ))}
      </div>
    </div>
  );
}

// Per-sub_topic question preview in the Assign composer: expand to see the
// approved questions the student would get, each with a minimized "why"
// (pedagogical_note). Lazy-loaded on first expand; collapsed by default.
function SubTopicPreview({ subTopicId, name }: { subTopicId: string; name: string }) {
  const [open, setOpen] = useState(false);
  const [qs, setQs] = useState<AssignQuestionView[] | null>(null);
  useEffect(() => {
    if (!open || qs) return;
    trpc.tutor.getSubTopicQuestions
      .query({ subTopicId })
      .then(setQs)
      .catch(() => setQs([]));
  }, [open, qs, subTopicId]);
  return (
    <div className="tut-asg-preview">
      <button
        type="button"
        className="tut-asg-preview-toggle"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        {open ? "▾" : "▸"} {name}
        <span className="tut-asg-preview-hint">
          {open ? " — hide questions" : " — preview questions"}
        </span>
      </button>
      {open && (
        <div className="tut-asg-preview-body">
          {qs === null ? (
            <p className="tut-muted">Loading questions…</p>
          ) : qs.length === 0 ? (
            <p className="tut-muted">No approved questions yet.</p>
          ) : (
            qs.map((q, i) => <AssignQuestionRow key={q.id} q={q} n={i + 1} />)
          )}
        </div>
      )}
    </div>
  );
}

// One question in the Assign preview: stem + a minimized, light-background "why"
// (the authoring pedagogical_note), expandable per question.
function AssignQuestionRow({ q, n }: { q: AssignQuestionView; n: number }) {
  const [whyOpen, setWhyOpen] = useState(false);
  return (
    <div className="tut-asg-q">
      <p className="tut-asg-q-stem">
        <span className="tut-asg-q-num">{n}.</span> <MathText text={q.stem} />
      </p>
      {q.pedagogicalNote && (
        <div className="tut-asg-why">
          <button
            type="button"
            className="tut-asg-why-toggle"
            onClick={() => setWhyOpen((v) => !v)}
            aria-expanded={whyOpen}
          >
            {whyOpen ? "▾" : "▸"} Why this question
          </button>
          {whyOpen && <p className="tut-asg-why-text">{q.pedagogicalNote}</p>}
        </div>
      )}
    </div>
  );
}

// The blocked composer (intent §5): tutor picks sub_topics within ONE chapter.
function BlockedComposer({
  nav,
  studentId,
  assignedOpen,
  onAssigned,
  onError,
}: {
  nav: Nav | null;
  studentId: string;
  assignedOpen: Set<string>;
  onAssigned: () => void;
  onError: (m: string) => void;
}) {
  const [chapterId, setChapterId] = useState<string>("");
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  if (nav === null) return <p className="tut-muted">Loading chapters…</p>;
  const chapters = nav;
  if (chapters.length === 0)
    return <p className="tut-muted">No chapters available.</p>;

  const chapter = chapters.find((c) => c.id === chapterId) ?? null;
  const subTopics =
    chapter?.topics.flatMap((t) =>
      t.subTopics.map((s) => ({ id: s.id, name: s.name, topicName: t.name })),
    ) ?? [];

  const toggle = (id: string) => {
    if (assignedOpen.has(id)) return;
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  };

  const assign = () => {
    if (!chapterId || picked.length === 0) return;
    setBusy(true);
    trpc.tutor.createAssignment
      .mutate({ studentId, mode: "blocked", chapterId, subTopicIds: picked })
      .then(() => {
        setPicked([]);
        onAssigned();
      })
      .catch((e) => onError(String(e?.message ?? e)))
      .finally(() => setBusy(false));
  };

  return (
    <div className="tut-asg-blocked">
      <select
        className="tut-asg-select"
        value={chapterId}
        onChange={(e) => {
          setChapterId(e.target.value);
          setPicked([]);
        }}
        disabled={busy}
      >
        <option value="">Pick a chapter…</option>
        {chapters.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>

      {chapterId && (
        <>
          <div className="tut-asg-chips">
            {subTopics.length === 0 && (
              <span className="tut-muted">No sub-topics in this chapter.</span>
            )}
            {subTopics.map((st) => {
              const taken = assignedOpen.has(st.id);
              return (
                <button
                  key={st.id}
                  className={`tut-asg-chip${picked.includes(st.id) ? " is-on" : ""}${taken ? " is-assigned" : ""}`}
                  onClick={() => toggle(st.id)}
                  disabled={busy || taken}
                  title={taken ? "Already in an open assignment" : st.topicName}
                >
                  {st.name}
                  {taken && <span className="tut-asg-chip-badge">assigned</span>}
                </button>
              );
            })}
          </div>
          <button
            className="tut-asg-btn"
            onClick={assign}
            disabled={busy || picked.length === 0}
          >
            {busy ? "Assigning…" : `Assign ${picked.length} (blocked) →`}
          </button>
          <div className="tut-asg-previews">
            {subTopics.map((st) => (
              <SubTopicPreview key={st.id} subTopicId={st.id} name={st.name} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// Slice ASG — the tutor's read-back of what they've assigned, with progress
// (completedCount / total derived from the linked practice_sessions, D-ASG-3).
function AssignmentList({
  assignments,
}: {
  assignments: AssignmentView[] | null;
}) {
  if (assignments === null) return <p className="tut-muted">Loading…</p>;
  if (assignments.length === 0)
    return <p className="tut-muted">Nothing assigned yet.</p>;
  return (
    <div className="tut-asg-list">
      {assignments.map((a) => (
        <div key={a.id} className="tut-asg-card">
          <div className="tut-asg-card-head">
            <span className={`tut-asg-mode tut-asg-mode--${a.mode}`}>
              {a.mode}
            </span>
            <span className="tut-asg-scope">
              {a.subjectName ?? a.chapterName ?? ""}
            </span>
            <span
              className={`tut-asg-progress${a.completed ? " is-done" : ""}`}
            >
              {a.completed ? "✓ complete" : `${a.completedCount} / ${a.total} done`}
            </span>
          </div>
          <div className="tut-asg-card-sts">
            {a.subTopics.map((st) => (
              <span
                key={st.subTopicId}
                className={`tut-asg-sttag tut-asg-sttag--${st.sessionStatus}`}
              >
                {st.subTopicName}
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function DueRow({ it }: { it: DueItem }) {
  const overdue = it.overdueDays > 0;
  const dueLabel =
    it.overdueDays === 0 ? "due today" : `${it.overdueDays}d overdue`;
  return (
    <div className={`tut-sch-item${overdue ? " tut-sch-overdue" : ""}`}>
      <span
        className={`tut-sch-due-badge${overdue ? " tut-sch-due-badge-loud" : ""}`}
      >
        {dueLabel}
      </span>
      <span className="tut-sch-item-name">
        <span className="tut-crumb">
          {it.chapterName} › {it.topicName}
        </span>
        <span className="tut-sch-st">{it.subTopicName}</span>
      </span>
      <span className="tut-sch-levels">
        C{it.conceptualLevel ?? "–"} · P{it.proceduralLevel ?? "–"}
      </span>
      <span
        className={`tut-sch-serve ${it.interleaveEligible ? "tut-sch-serve-mix" : "tut-sch-serve-block"}`}
      >
        {it.interleaveEligible ? "interleave" : "blocked"}
      </span>
    </div>
  );
}

// ASSESS-FIX-4 — weak prerequisites spotted while the student was working on
// something ELSE ("ran the trig fine, couldn't rationalise the denominator").
// These carry NO level and count toward NO mastery — by design: the rule that
// creates them forbids denting the sub-topic being assessed. They are a worklist.
function CrossConceptFlags({ studentId }: { studentId: string }) {
  const [flags, setFlags] = useState<CrossConceptFlagView[] | null>(null);
  const load = useCallback(() => {
    trpc.tutor.getCrossConceptFlags
      .query({ studentId })
      .then(setFlags)
      .catch(() => setFlags([]));
  }, [studentId]);
  useEffect(load, [load]);

  if (!flags || flags.length === 0) return null; // silent when there's nothing
  return (
    <div className="tut-ccf">
      <div className="tut-ccf-head">
        Other skills that tripped them up
        <span className="tut-ccf-sub">
          spotted while working on something else - these don't affect any mastery level
        </span>
      </div>
      {flags.map((f) => (
        <div key={f.id} className="tut-ccf-row">
          <span className="tut-ccf-note">{f.note}</span>
          {/* A synthesis item (S2R-3) is a pattern read across a whole sitting, so
              it has no originating sub_topic — "seen in <blank>" would be worse
              than saying where it actually came from. Keyed off the provenance
              column, not off the null, so the two origins can never blur. */}
          <span className="tut-ccf-from">
            {f.origin === "stage2_synthesis"
              ? "seen across the whole assessment"
              : `seen in ${f.fromSubTopicName ?? "an earlier session"}`}{" "}
            · {new Date(f.createdAt).toLocaleDateString()}
          </span>
          <button
            type="button"
            className="tut-obs-editbtn"
            onClick={() =>
              trpc.tutor.setCrossConceptFlagAddressed
                .mutate({ flagId: f.id, addressed: true })
                .then(load)
                .catch(() => {})
            }
          >
            Mark handled
          </button>
        </div>
      ))}
    </div>
  );
}

// Slice S2R-2 — the Assess tab lists SITTINGS, not sub_topics. One entry per
// completed assignment, plus the catch-all for evidence that has no assignment
// (self-serve practice, teach-back) so the hard cut can't strand it (D-S2R-7).
function PendingList({
  student,
  pending,
  onFinalized,
}: {
  student: Student;
  pending: PendingAssessment[] | null;
  onFinalized: () => void;
}) {
  const [open, setOpen] = useState<string | null>(null);
  if (pending === null) return <p className="tut-muted">Loading…</p>;
  if (pending.length === 0)
    return (
      <>
        <CrossConceptFlags studentId={student.studentId} />
        <p className="tut-muted">
          Nothing waiting - no new practice evidence since the last assessment.
        </p>
      </>
    );
  return (
    <div className="tut-pending-list">
      <CrossConceptFlags studentId={student.studentId} />
      {pending.map((p) => {
        const key = p.assignmentId ?? "catch_all";
        return (
          <div key={key} className="tut-pending">
            <button
              className="tut-pending-head"
              onClick={() => setOpen(open === key ? null : key)}
            >
              <span className="tut-pending-name">
                <span className="tut-crumb">
                  {p.kind === "catch_all"
                    ? "Practice with no assignment"
                    : p.label}
                </span>
                <span className="tut-pending-st">
                  {p.subTopicNames.join(" · ")}
                </span>
              </span>
              <span className="tut-badge">{p.pendingCount} new</span>
            </button>
            {open === key && (
              <AssessmentSitting
                student={student}
                entry={p}
                onFinalized={onFinalized}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

// One sitting: open it (N drafts in parallel, the tutor waits once for all of
// them), review each sub_topic, then ONE atomic finalize (D-S2R-1). Accept-all
// is the primary action — the tutor edits only what they disagree with
// (D-S2R-2), and anything untouched commits exactly as drafted.
function AssessmentSitting({
  student,
  entry,
  onFinalized,
}: {
  student: Student;
  entry: PendingAssessment;
  onFinalized: () => void;
}) {
  const [phase, setPhase] = useState<"idle" | "drafting" | "review" | "saving" | "done">("idle");
  const [session, setSession] = useState<AssessmentSessionView | null>(null);
  // subTopicId → the tutor's edited values. Absent = accept as drafted.
  const [edits, setEdits] = useState<Record<string, {
    conceptualLevel: number | null;
    proceduralLevel: number | null;
    description: string;
  }>>({});
  const [error, setError] = useState<string | null>(null);

  function openSitting() {
    setError(null);
    setPhase("drafting");
    trpc.tutor.openAssessmentSession
      .mutate({ studentId: student.studentId, assignmentId: entry.assignmentId })
      .then((s) => {
        setSession(s);
        setPhase("review");
      })
      .catch((e) => {
        setError(String(e?.message ?? e));
        setPhase("idle");
      });
  }

  function finalize() {
    if (!session) return;
    setError(null);
    setPhase("saving");
    // Send ONLY what the tutor actually changed. An empty list is the accept-all
    // fast path — the server commits every draft as proposed.
    const items = Object.entries(edits).map(([subTopicId, final]) => ({
      subTopicId,
      final,
    }));
    trpc.tutor.finalizeAssessmentSession
      .mutate({ sessionId: session.id, items: items.length ? items : undefined })
      .then(() => {
        setPhase("done");
        onFinalized();
      })
      .catch((e) => {
        setError(String(e?.message ?? e));
        setPhase("review");
      });
  }

  if (phase === "done")
    return (
      <div className="tut-pending-body">
        <p className="tut-s2-done">
          ✓ Certified {entry.subTopicNames.length} sub-topic
          {entry.subTopicNames.length === 1 ? "" : "s"} in one go.
        </p>
      </div>
    );

  if (phase === "idle")
    return (
      <div className="tut-pending-body">
        <div className="tut-s2-cta">
          {error && <p className="tut-error">{error}</p>}
          <button className="tut-assess-btn" onClick={openSitting}>
            Assess {entry.subTopicNames.length} sub-topic
            {entry.subTopicNames.length === 1 ? "" : "s"} →
          </button>
          <span className="tut-hint">
            {entry.kind === "catch_all"
              ? "Practice the student did outside an assignment"
              : "Reads the whole assignment together"}
          </span>
        </div>
      </div>
    );

  if (phase === "drafting")
    return (
      <div className="tut-pending-body">
        <p className="tut-muted tut-s2-drafting">
          Reading the evidence for {entry.subTopicNames.length} sub-topics… (all
          at once, ~10s)
        </p>
      </div>
    );

  const saving = phase === "saving";
  const edited = Object.keys(edits).length;
  return (
    <div className="tut-pending-body">
      {error && <p className="tut-error">{error}</p>}
      {session!.subTopicIds.map((stId) => {
        const d = session!.drafts[stId];
        if (!d) return null;
        return (
          <div key={stId} className="tut-sitting-item">
            <h4 className="tut-sitting-st">{d.subTopicName}</h4>
            <Observations studentId={student.studentId} subTopicId={stId} />
            <Stage2Panel
              result={d}
              disabled={saving}
              onEdit={(final) =>
                setEdits((prev) => ({ ...prev, [stId]: final }))
              }
            />
          </div>
        );
      })}
      <div className="tut-s2-actions tut-sitting-actions">
        <button className="tut-assess-btn" onClick={finalize} disabled={saving}>
          {saving
            ? "Saving…"
            : edited
              ? `Finalize all - ${edited} edited`
              : "Accept all & finalize"}
        </button>
        <span className="tut-hint">
          Commits every sub-topic together, or none.
        </span>
      </div>
    </div>
  );
}

/** A level, or the honest absence of one. null is NOT a low level — no item
 *  exposed that axis, which is a coverage gap, not a weak student. */
function levelText(level: number | null): string {
  return level == null ? "not observed" : `Level ${level}`;
}

/** 1–5 plus a first-class "Not yet observed" — the tutor must be able to say
 *  "we never tested this axis" instead of being forced to pick a number. */
function LevelSelect({
  value,
  onChange,
  disabled,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
  disabled?: boolean;
}) {
  return (
    <select
      className="tut-s2-select"
      value={value ?? ""}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
    >
      <option value="">Not yet observed</option>
      {[1, 2, 3, 4, 5].map((n) => (
        <option key={n} value={n}>
          Level {n}
        </option>
      ))}
    </select>
  );
}

// Slice S2R-2 — one sub_topic's review card inside a sitting. The AI call and
// the commit both moved UP to AssessmentSitting (all N drafted together, then
// ONE atomic finalize), so this is now a controlled component: it shows the
// proposal and reports edits. The tutor edits the pair + description (§6's
// editable set); log/dates/reasoning/flags stay AI-authored + read-only.
//
// Untouched = accept as drafted. It only reports an edit when the tutor actually
// changes something, which is what makes accept-all mean "the model's numbers",
// not "whatever the form happened to be holding".
function Stage2Panel({
  result,
  disabled,
  onEdit,
}: {
  result: Stage2DraftResult;
  disabled: boolean;
  onEdit: (final: {
    conceptualLevel: number | null;
    proceduralLevel: number | null;
    description: string;
  }) => void;
}) {
  const d = result.draft;
  const cur = result.current;
  // null = "not yet observed" — a real, selectable value, not a missing one.
  const [conceptual, setConceptual] = useState<number | null>(d.conceptualLevel);
  const [procedural, setProcedural] = useState<number | null>(d.proceduralLevel);
  const [description, setDescription] = useState(d.description);
  const saving = disabled;

  function edit(next: Partial<{
    conceptualLevel: number | null;
    proceduralLevel: number | null;
    description: string;
  }>) {
    const merged = {
      conceptualLevel: next.conceptualLevel !== undefined ? next.conceptualLevel : conceptual,
      proceduralLevel: next.proceduralLevel !== undefined ? next.proceduralLevel : procedural,
      description: next.description !== undefined ? next.description : description,
    };
    setConceptual(merged.conceptualLevel);
    setProcedural(merged.proceduralLevel);
    setDescription(merged.description);
    onEdit(merged);
  }

  return (
    <div className="tut-s2">
      {/* The AI's reasoning + flags sit ABOVE the level selects on purpose. The
          rung is frequently CAPPED below what the raw observations read (a
          spacing gap holds 7×L4 at Level 3), so a tutor who meets the selects
          first sees a contradiction and "corrects" it — silently defeating the
          spacing rule. The justification must arrive before the control that
          can override it. */}
      <div className="tut-s2-readonly tut-s2-why">
        <div className="tut-s2-ro-row">
          <span className="tut-s2-ro-key">AI reasoning</span>
          <span className="tut-s2-ro-val">{d.reasoning}</span>
        </div>
        {d.flags.length > 0 && (
          <div className="tut-s2-ro-row">
            <span className="tut-s2-ro-key">Flags</span>
            <span className="tut-s2-ro-val">
              {d.flags.map((f, i) => (
                <span key={i} className="tut-s2-flag">
                  {f}
                </span>
              ))}
            </span>
          </div>
        )}
      </div>

      <div className="tut-s2-grid">
        <label className="tut-s2-field">
          <span className="tut-s2-label">
            Conceptual
            {cur && <span className="tut-s2-was"> was {levelText(cur.conceptualLevel)}</span>}
            <span className="tut-s2-proposed"> · AI proposes {levelText(d.conceptualLevel)}</span>
          </span>
          <LevelSelect
            value={conceptual}
            onChange={(v) => edit({ conceptualLevel: v })}
            disabled={saving}
          />
        </label>
        <label className="tut-s2-field">
          <span className="tut-s2-label">
            Procedural
            {cur && <span className="tut-s2-was"> was {levelText(cur.proceduralLevel)}</span>}
            <span className="tut-s2-proposed"> · AI proposes {levelText(d.proceduralLevel)}</span>
          </span>
          <LevelSelect
            value={procedural}
            onChange={(v) => edit({ proceduralLevel: v })}
            disabled={saving}
          />
        </label>
      </div>

      <label className="tut-s2-field">
        <span className="tut-s2-label">Description (shown to the student)</span>
        <textarea
          className="tut-s2-textarea"
          value={description}
          disabled={saving}
          rows={4}
          onChange={(e) => edit({ description: e.target.value })}
        />
      </label>

      <div className="tut-s2-readonly">
        <div className="tut-s2-ro-row">
          <span className="tut-s2-ro-key">Climb re-check</span>
          <span className="tut-s2-ro-val">
            {d.climbNextDue ?? "- (nothing to climb)"}
            <span className="tut-s2-ro-note">
              {" "}
              · the anti-fade retention check is derived from the procedural level and
              shown in the due queue
            </span>
          </span>
        </div>
        {/* Spec §6: the working log is tutor-visible, not internal-only — the
            tutor is the consumer of this reasoning, and hiding it defeats the
            point of asking the model for it. */}
        <details className="tut-s2-log">
          <summary>Working log ({result.observationCount} observations)</summary>
          <p className="tut-s2-ro-val">{d.log}</p>
        </details>
      </div>
    </div>
  );
}

function Observations({
  studentId,
  subTopicId,
}: {
  studentId: string;
  subTopicId: string;
}) {
  const [obs, setObs] = useState<ObservationView[] | null>(null);
  useEffect(() => {
    trpc.tutor.getObservations
      .query({ studentId, subTopicId })
      .then((r) => setObs(r))
      .catch(() => setObs([]));
  }, [studentId, subTopicId]);

  if (obs === null) return <p className="tut-muted tut-obs-loading">Loading reads…</p>;
  if (obs.length === 0) return <p className="tut-muted tut-obs-loading">No reads.</p>;
  return (
    <div className="tut-obs-list">
      {obs.map((o) => (
        <ObservationRow
          key={o.id}
          o={o}
          onChanged={(next) =>
            // Merge — the correction carries only the read fields; the recall
            // context (question + answer) on the existing row is invariant to it.
            setObs(
              (prev) =>
                prev?.map((x) => (x.id === next.id ? { ...x, ...next } : x)) ?? null,
            )
          }
        />
      ))}
    </div>
  );
}

// ASSESS-FIX-2 — one Stage-1 read, correctable. The machine's level and the
// tutor's correction are shown SIDE BY SIDE (never silently replaced): the pair
// is the labeled judgment, and the tutor should always see what they overruled.
// Slice UPLOAD-UX recall panel — the question the student answered + their own
// answer, collapsed by default so the tutor can expand it to recall context while
// certifying a read. Only rendered when there is something to show.
function ObsRecall({ o }: { o: ObservationView }) {
  const [open, setOpen] = useState(false);
  const hasAnswer =
    !!o.answerText || o.answerPhotoIds.length > 0 || o.answerConfidence != null;
  if (!o.questionStem && !hasAnswer) return null;
  return (
    <div className="tut-recall">
      <button
        type="button"
        className="tut-recall-toggle"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        {open ? "▾" : "▸"} Question &amp; answer
      </button>
      {open && (
        <div className="tut-recall-body">
          {o.questionStem && (
            <div className="tut-recall-block">
              <p className="tut-recall-label">Question</p>
              <p className="tut-recall-stem">
                <MathText text={o.questionStem} />
              </p>
            </div>
          )}
          <div className="tut-recall-block">
            <p className="tut-recall-label">
              Student&apos;s answer
              {o.answerConfidence != null && (
                <span className="tut-recall-conf">
                  {" "}
                  · confidence {o.answerConfidence}/5
                </span>
              )}
            </p>
            {o.answerText ? (
              <p className="tut-recall-answer">
                <MathText text={o.answerText} />
              </p>
            ) : o.answerPhotoIds.length > 0 ? (
              <div className="tut-recall-photos">
                {o.answerPhotoIds.map((id) => (
                  <TutorPhotoThumb key={id} imageId={id} />
                ))}
              </div>
            ) : (
              <p className="tut-recall-answer tut-recall-muted">
                No written answer (skipped or teach-back).
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// A minimized answer-photo thumbnail (tutor-scoped byte route) that expands to a
// full-screen lightbox on click — mirrors the student-side PhotoThumb.
function TutorPhotoThumb({ imageId }: { imageId: string }) {
  const [open, setOpen] = useState(false);
  const src = `/practice/tutor-answer-photo/${imageId}?board=${BOARD}`;
  return (
    <>
      <button
        type="button"
        className="tut-recall-thumb"
        onClick={() => setOpen(true)}
        title="Tap to enlarge"
      >
        <img src={src} alt="Student's uploaded answer" loading="lazy" />
      </button>
      {open && (
        <div
          className="tut-recall-lightbox"
          onClick={() => setOpen(false)}
          role="dialog"
          aria-label="Student's uploaded answer"
        >
          <img src={src} alt="Student's uploaded answer" />
          <button
            className="tut-recall-lightbox-close"
            onClick={() => setOpen(false)}
          >
            ✕
          </button>
        </div>
      )}
    </>
  );
}

function ObservationRow({
  o,
  onChanged,
}: {
  o: ObservationView;
  onChanged: (next: ObservationCorrection) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [level, setLevel] = useState<number>(o.effectiveLevel);
  const [reason, setReason] = useState(o.overrideReason ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const corrected = o.tutorLevel !== null;

  function save(nextLevel: number | null) {
    setSaving(true);
    setError(null);
    trpc.tutor.overrideObservation
      .mutate({
        observationId: o.id,
        level: nextLevel,
        reason: nextLevel === null ? null : reason.trim() || null,
      })
      .then((next) => {
        onChanged(next);
        setEditing(false);
      })
      .catch((e) => setError(String(e?.message ?? e)))
      .finally(() => setSaving(false));
  }

  return (
    <div className={`tut-obs${corrected ? " tut-obs--corrected" : ""}`}>
      <div className="tut-obs-top">
        <span className={`tut-axis tut-axis--${o.axis}`}>{o.axis}</span>
        {corrected ? (
          <>
            <span className="tut-level tut-level--machine" title="the Stage-1 scorer's read">
              AI L{o.observationLevel}
            </span>
            <span className="tut-level tut-level--tutor" title="your correction - this is what counts">
              you L{o.tutorLevel}
            </span>
          </>
        ) : (
          <span className="tut-level">L{o.observationLevel}</span>
        )}
        {o.calibrationFlag && (
          <span className="tut-calib">calibration: {o.calibrationFlag}</span>
        )}
        <span className="tut-obs-date">
          {new Date(o.createdAt).toLocaleDateString()}
        </span>
        {!editing && (
          <button
            type="button"
            className="tut-obs-editbtn"
            onClick={() => {
              setLevel(o.effectiveLevel);
              setReason(o.overrideReason ?? "");
              setEditing(true);
            }}
          >
            {corrected ? "Re-correct" : "Correct this read"}
          </button>
        )}
      </div>

      <p className="tut-obs-reasoning">{o.reasoning}</p>

      <ObsRecall o={o} />

      {corrected && !editing && o.overrideReason && (
        <p className="tut-obs-overridereason">Your reason: {o.overrideReason}</p>
      )}

      {editing && (
        <div className="tut-obs-edit">
          {error && <p className="tut-error">{error}</p>}
          <label className="tut-obs-editrow">
            <span className="tut-s2-label">Level this answer actually shows</span>
            <select
              className="tut-s2-select"
              value={level}
              disabled={saving}
              onChange={(e) => setLevel(Number(e.target.value))}
            >
              {[1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>
                  Level {n}
                </option>
              ))}
            </select>
          </label>
          <label className="tut-obs-editrow">
            <span className="tut-s2-label">Why the AI's read was wrong</span>
            <textarea
              className="tut-s2-textarea"
              rows={2}
              value={reason}
              disabled={saving}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. they did connect the two ideas - the scorer missed the 'so' in line 3."
            />
          </label>
          <div className="tut-obs-editactions">
            <button type="button" className="tut-btn" disabled={saving} onClick={() => save(level)}>
              {saving ? "Saving…" : "Save correction"}
            </button>
            {corrected && (
              <button
                type="button"
                className="tut-btn tut-btn--ghost"
                disabled={saving}
                onClick={() => save(null)}
              >
                Revert to AI read
              </button>
            )}
            <button
              type="button"
              className="tut-btn tut-btn--ghost"
              disabled={saving}
              onClick={() => setEditing(false)}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Slice QA3-c: progress-first two-axis view (D-QA3-1/2), two-level drill-down.
// Derived nodes show the WEAKEST-LINK (min of descendant sub_topic levels) as the
// headline chip + a spread bar. All `.tut-pt-`-scoped.
function ProgressLegend() {
  return (
    <div className="tut-pt-legend">
      <span className="tut-pt-legend-scale">
        <span className="tut-pt-legend-cap">C</span>onceptual ·{" "}
        <span className="tut-pt-legend-cap">P</span>rocedural · level
        {[0, 1, 2, 3, 4, 5].map((n) => (
          <span key={n} className={`tut-pt-chip tut-lvl-${n} tut-pt-legend-lvl`}>
            {n}
          </span>
        ))}
      </span>
      <span className="tut-pt-legend-note">
        headline = weakest sub-topic · bar = spread across levels 0–5
      </span>
    </div>
  );
}

// (1) master view — one row per chapter with its two-axis rollup; click → detail.
function ChapterList({
  tree,
  error,
  onOpen,
}: {
  tree: ProgressChapterView[] | null;
  error: string | null;
  onOpen: (chapterId: string) => void;
}) {
  if (error) return <p className="tut-error">{error}</p>;
  if (tree === null) return <p className="tut-muted">Loading…</p>;
  if (tree.length === 0)
    return <p className="tut-muted">No chapters for this board yet.</p>;
  return (
    <div className="tut-pt">
      <ProgressLegend />
      <div className="tut-pt-chlist">
        {tree.map((ch) => (
          <button
            key={ch.chapterId}
            className="tut-pt-chrow"
            onClick={() => onOpen(ch.chapterId)}
          >
            <span className="tut-pt-name">{ch.name}</span>
            <AxisPair conceptual={ch.conceptual} procedural={ch.procedural} />
            <span className="tut-pt-chev" aria-hidden>
              ›
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

// (2) detail view — one chapter's topics → sub-topics + the Start-authoring CTA.
function ChapterDetail({
  studentName,
  chapter,
  onBack,
  onAuthor,
}: {
  studentName: string;
  chapter: ProgressChapterView | null;
  onBack: () => void;
  onAuthor: () => void;
}) {
  if (!chapter) {
    return (
      <div>
        <button className="tut-back" onClick={onBack}>
          ← All chapters
        </button>
        <p className="tut-muted">Chapter not found.</p>
      </div>
    );
  }
  return (
    <section className="tut-section">
      <button className="tut-back" onClick={onBack}>
        ← All chapters
      </button>
      <div className="tut-author-head">
        <div>
          <h3 className="tut-section-title">{chapter.name}</h3>
          <p className="tut-muted">
            {studentName}&rsquo;s topic breakdown - pick the weak spots, then author.
          </p>
          <div className="tut-pt-detailrollup">
            <AxisPair conceptual={chapter.conceptual} procedural={chapter.procedural} />
          </div>
        </div>
        <button className="tut-btn-primary" onClick={onAuthor}>
          Start authoring →
        </button>
      </div>
      <ProgressLegend />
      <div className="tut-pt">
        {chapter.topics.map((tp) => (
          <div key={tp.topicId} className="tut-pt-node tut-pt-topic-block">
            <div className="tut-pt-row tut-pt-toprow">
              <span className="tut-pt-name">{tp.name}</span>
              <AxisPair conceptual={tp.conceptual} procedural={tp.procedural} />
            </div>
            <div className="tut-pt-leaves">
              {tp.subTopics.map((st) => (
                <div
                  key={st.subTopicId}
                  className={`tut-pt-leaf${st.hasMastery ? "" : " tut-pt-untaught"}`}
                >
                  <div className="tut-pt-leaf-head">
                    <span className="tut-pt-name">{st.name}</span>
                    {st.hasMastery ? (
                      <span className="tut-pt-leaf-levels">
                        <LevelChip axis="c" level={st.conceptualLevel} />
                        <LevelChip axis="p" level={st.proceduralLevel} />
                      </span>
                    ) : (
                      <span className="tut-pt-tag">untaught</span>
                    )}
                  </div>
                  {st.description && <p className="tut-pt-desc">{st.description}</p>}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function AxisPair({
  conceptual,
  procedural,
}: {
  conceptual: AxisRollupView;
  procedural: AxisRollupView;
}) {
  return (
    <span className="tut-pt-axes">
      <AxisRollupBadge axis="c" roll={conceptual} />
      <AxisRollupBadge axis="p" roll={procedural} />
    </span>
  );
}

function AxisRollupBadge({ axis, roll }: { axis: "c" | "p"; roll: AxisRollupView }) {
  return (
    <span className="tut-pt-badge">
      <LevelChip axis={axis} level={roll.level} weak />
      <span
        className="tut-pt-spread"
        title={`spread ${roll.spread.join("/")} (levels 0–5, left→right)`}
      >
        {roll.spread.map((n, i) => (
          <span
            key={i}
            className={`tut-pt-seg tut-pt-seg-${i}`}
            style={{ flexGrow: n, display: n ? undefined : "none" }}
          />
        ))}
      </span>
    </span>
  );
}

function LevelChip({
  axis,
  level,
  weak,
}: {
  axis: "c" | "p";
  level: number;
  weak?: boolean;
}) {
  // Both axes score 0–5. Colour the pill by level (grey→red→orange→yellow→lime→
  // green, matching the spread-bar palette); the C/P letter still marks the axis.
  const lvl = Math.max(0, Math.min(5, Math.round(level ?? 0)));
  return (
    <span
      className={`tut-pt-chip tut-lvl-${lvl}`}
      title={weak ? "weakest sub-topic (min of children)" : undefined}
    >
      {axis === "c" ? "C" : "P"} {lvl}
    </span>
  );
}

// Slice Report-Signoff — the tutor SIGN-OFF surface (D-P-1 deferred half). The
// tutor assembles a FROZEN snapshot of the child's progress (a draft), reviews
// it, adds a note, and signs it off → published to the parent. Drafts stay
// private until published. All `.tut-rpt-`-scoped (landmine-safe).
function ReportPanel({
  student,
  onError,
}: {
  student: Student;
  onError: (m: string) => void;
}) {
  const [reports, setReports] = useState<ReportSummary[] | null>(null);
  const [draft, setDraft] = useState<ReportDetail | null>(null); // the one being reviewed
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    trpc.tutor.listReports
      .query({ studentId: student.studentId })
      .then(setReports)
      .catch((e) => onError(String(e?.message ?? e)));
  }, [student.studentId, onError]);

  useEffect(() => {
    setReports(null);
    setDraft(null);
    setNote("");
    load();
  }, [load]);

  function assemble() {
    setBusy(true);
    trpc.tutor.assembleReport
      .mutate({ studentId: student.studentId })
      .then((d) => {
        setDraft(d);
        setNote("");
        load();
      })
      .catch((e) => onError(String(e?.message ?? e)))
      .finally(() => setBusy(false));
  }

  function openDraft(reportId: string) {
    trpc.tutor.getReport
      .query({ reportId })
      .then((d) => {
        setDraft(d);
        setNote(d.tutorNote ?? "");
      })
      .catch((e) => onError(String(e?.message ?? e)));
  }

  function publish() {
    if (!draft) return;
    setBusy(true);
    trpc.tutor.publishReport
      .mutate({ reportId: draft.id, tutorNote: note.trim() || undefined })
      .then(() => {
        setDraft(null);
        setNote("");
        load();
      })
      .catch((e) => onError(String(e?.message ?? e)))
      .finally(() => setBusy(false));
  }

  // Review screen for a draft → sign off, or read-only for a published one.
  if (draft) {
    const isDraft = draft.status === "draft";
    return (
      <div className="tut-rpt-review">
        <button className="tut-back" onClick={() => setDraft(null)}>
          ← All reports
        </button>
        <div className="tut-rpt-reviewhead">
          <span className={`tut-rpt-badge tut-rpt-badge--${draft.status}`}>
            {draft.status}
          </span>
          <span className="tut-rpt-frozen">
            Snapshot frozen at assembly - the parent sees exactly this.
          </span>
        </div>

        <div className="tut-rpt-metrics">
          <ReportStat label="Answered" value={String(draft.snapshot.metrics.questionsAnswered)} />
          <ReportStat label="Skipped" value={String(draft.snapshot.metrics.questionsSkipped)} />
          <ReportStat
            label="Time"
            value={`${Math.max(1, Math.round(draft.snapshot.metrics.totalTimeMs / 60000))} min`}
          />
        </div>

        {draft.snapshot.mastery.length === 0 ? (
          <p className="tut-muted">No certified mastery yet for this student.</p>
        ) : (
          <div className="tut-rpt-cards">
            {draft.snapshot.mastery.map((m) => (
              <div key={m.subTopicId} className="tut-rpt-card">
                <div className="tut-crumb">
                  {m.chapterName} · {m.topicName}
                </div>
                <div className="tut-mastery-st">{m.subTopicName}</div>
                <div className="tut-levels">
                  <span className="tut-axislevel">
                    <span className="tut-axislabel">Conceptual</span>
                    <span className="tut-axisnum">{m.conceptualLevel ?? "–"}</span>
                  </span>
                  <span className="tut-axislevel">
                    <span className="tut-axislabel">Procedural</span>
                    <span className="tut-axisnum">{m.proceduralLevel ?? "–"}</span>
                  </span>
                </div>
                <p className="tut-desc">{m.description}</p>
              </div>
            ))}
          </div>
        )}

        {isDraft ? (
          <div className="tut-rpt-signoff">
            <label className="tut-rpt-notelabel">
              Note to parent (optional)
              <textarea
                className="tut-rpt-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="A short message for the parent…"
                rows={3}
              />
            </label>
            <button className="tut-rpt-publish" onClick={publish} disabled={busy}>
              {busy ? "Signing off…" : "Sign off & publish to parent"}
            </button>
          </div>
        ) : (
          <div className="tut-rpt-published">
            {draft.tutorNote && <p className="tut-desc">“{draft.tutorNote}”</p>}
            <p className="tut-muted">
              Published{draft.publishedAt ? ` · ${new Date(draft.publishedAt).toLocaleDateString()}` : ""}.
            </p>
          </div>
        )}
      </div>
    );
  }

  // List view
  return (
    <div className="tut-rpt-list">
      <button className="tut-rpt-assemble" onClick={assemble} disabled={busy}>
        {busy ? "Assembling…" : "+ Assemble new report"}
      </button>
      {reports === null ? (
        <p className="tut-muted">Loading…</p>
      ) : reports.length === 0 ? (
        <p className="tut-muted">
          No reports yet. Assemble one to snapshot this student's progress and
          sign it off to the parent.
        </p>
      ) : (
        <ul className="tut-rpt-rows">
          {reports.map((r) => (
            <li key={r.id}>
              <button className="tut-rpt-row" onClick={() => openDraft(r.id)}>
                <span className={`tut-rpt-badge tut-rpt-badge--${r.status}`}>
                  {r.status}
                </span>
                <span className="tut-rpt-rowdate">
                  {r.status === "published" && r.publishedAt
                    ? `Published ${new Date(r.publishedAt).toLocaleDateString()}`
                    : `Drafted ${new Date(r.createdAt).toLocaleDateString()}`}
                </span>
                <span className="tut-rpt-rowgo">→</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ReportStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="tut-rpt-stat">
      <div className="tut-rpt-statval">{value}</div>
      <div className="tut-rpt-statlabel">{label}</div>
    </div>
  );
}

// ───────────── Slice AUTH v2 — student-grounded conversational authoring ─────────────
// The tutor opens a CHAT (Gemini or Claude, picked at start then locked) that
// arrives grounded in THIS student's two-axis mastery + Stage-1 observations,
// converses to shape intent, then authors N subjective questions PRIVATE to the
// student (target_student_id). Replaces the v1 one-shot form. TAITOR look: bubbles
// on a soft canvas + a floating bottom input bar + an inline "Author" panel.
// `.tut-chat-`-scoped + reuses `.tut-auth-` for the draft-review cards.
// Backend proven by probe:authoringchat 25/25; request-response v0 (no SSE yet).

type VendorChoice = "claude_cli" | "gemini_api";
type ChatView = Awaited<ReturnType<typeof trpc.tutor.getAuthoringChat.query>>;
type ChatTurn = ChatView["messages"][number];
type AuthorDraft = Awaited<ReturnType<typeof trpc.tutor.authorFromChat.mutate>>;
type AuthorDraftItem = AuthorDraft["drafts"][number];
type ProposeResult = Awaited<
  ReturnType<typeof trpc.tutor.proposeAuthoringTarget.mutate>
>;
// QA3-e-2: the interleaved set proposal + the fan-out result.
type ProposeSetResult = Awaited<
  ReturnType<typeof trpc.tutor.proposeAuthoringSet.mutate>
>;
type AuthorSetResult = Awaited<
  ReturnType<typeof trpc.tutor.authorSetFromChat.mutate>
>;
type AuthoredQuestion = Awaited<
  ReturnType<typeof trpc.tutor.listAuthoredQuestions.query>
>[number];
type ChatSummary = Awaited<
  ReturnType<typeof trpc.tutor.listAuthoringChats.query>
>[number];
// FIG-AUTH: drafts are now SERVER-PERSISTED question rows (status='draft') with
// ids — not FE-ephemeral copies. A DraftCard mirrors the persisted row; edits
// autosave via tutor.updateDraft, and a figure renders on-demand against the id.
type ImageSpec = NonNullable<AuthorDraftItem["image"]>;
type DraftCard = {
  id: string;
  // QA3-e-2: each card carries its sub_topic so a multi-target (interleaved fan-out)
  // review can group cards under a per-sub_topic header. Single-target flows pass
  // the one target's identity; the fan-out passes each group's.
  subTopicId: string;
  subTopicName: string;
  axis: "conceptual" | "procedural" | "both";
  stem: string;
  referenceAnswer: string;
  explanation: string;
  image: ImageSpec | null;
  imageId: string | null;
  verifierLabel: string | null;
};
const toCard = (
  d: AuthorDraftItem,
  subTopicId: string,
  subTopicName: string,
): DraftCard => ({
  id: d.id,
  subTopicId,
  subTopicName,
  axis: d.axis as DraftCard["axis"],
  stem: d.stem,
  referenceAnswer: d.referenceAnswer,
  explanation: d.explanation ?? "",
  image: d.image,
  imageId: d.imageId,
  verifierLabel: d.verifierLabel,
});
// The confirmed authoring target (from a proposal the tutor accepted). Carried
// so save() has the sub_topic without re-deriving it from a picker.
type Target = { subTopicId: string; subTopicName: string; nextOrdinal: number };

const VENDOR_LABEL: Record<VendorChoice, string> = {
  gemini_api: "Gemini",
  claude_cli: "Claude",
};

// Per-student active-chat handle (Slice AUTH-v2.1 rehydrate): TutorPage has no
// routing, so a refresh drops the selected student/tab AND the in-memory chatId.
// We persist the active chatId per student in localStorage and rehydrate it via
// getAuthoringChat when the tutor returns to this student's Author tab — the chat
// survives a refresh (item #4). Full SPA routing stays out of scope.
const CHAT_STORE_KEY = (studentId: string) => `b2c.authchat.${studentId}`;

// Slice AUTH-v2.1 — chat-ONLY authoring. The v1/S26 top picker (chapter/sub-topic/
// how-many selects + "Author questions →" CTA) is GONE. The flow is now: pick a
// vendor + chapter → chat (grounded in the student) → the AI PROPOSES a target
// (consent-in-chat, tutor go-ahead fires authoring) → drafts → per-question
// mini-chat + edit → save (private to the student). Model/chapter switch = New chat.
function AuthorChat({
  student,
  nav,
  initialChapterId,
  launch,
  resumeChatId,
}: {
  student: Student;
  nav: Nav | null;
  initialChapterId?: string;
  // QA3-d: when set, auto-start a chat scoped to {model, mode, chapters} and skip
  // both localStorage rehydrate and the internal single-chapter start gate.
  launch?: LaunchConfig;
  // When set, open directly onto this existing chat (resumed from the landing
  // history dropdown) — skips the launch auto-start, the localStorage rehydrate,
  // and the internal start gate.
  resumeChatId?: string;
}) {
  // Claude is the default author (hybrid model): Claude uses the button→propose→
  // form flow; Gemini additionally authors in-chat via the author_questions tool.
  const [vendor, setVendor] = useState<VendorChoice>("claude_cli");
  // Pre-scoped to the chapter the tutor drilled into on the progress view
  // (QA3-c) — no re-picking; the picker stays editable if they change their mind.
  const [startChapterId, setStartChapterId] = useState(initialChapterId ?? "");
  const [chat, setChat] = useState<ChatView | null>(null);
  const [rehydrating, setRehydrating] = useState(true);
  const [starting, setStarting] = useState(false);
  const [sending, setSending] = useState(false);
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Auto-scroll the conversation to the latest turn (on resume + after each turn
  // + while the AI is thinking) — Eyeball feedback #3a. The canvas is its own
  // scroll container (input bar sits OUTSIDE it), so we scroll the container to
  // its bottom rather than an anchor into view — no sticky bar to clear
  // (D-AUTHUI-2).
  const canvasRef = useRef<HTMLDivElement | null>(null);

  // Consent-in-chat: the AI's proposed target (sub_topic + count + rationale),
  // awaiting the tutor's go-ahead. The count stays editable before confirming.
  const [proposal, setProposal] = useState<ProposeResult | null>(null);
  const [proposeCount, setProposeCount] = useState(3);
  const [proposing, setProposing] = useState(false);

  // QA3-e-2: the interleaved SET proposal (a mix of sub-topics + per-sub-topic
  // counts), awaiting the tutor's go-ahead. Counts stay editable before confirm.
  // `setFailures` surfaces any sub-topic whose worker failed in the fan-out (loud,
  // never silently dropped). Interleaved mode only.
  const [proposalSet, setProposalSet] = useState<ProposeSetResult | null>(null);
  const [setCounts, setSetCounts] = useState<Record<string, number>>({});
  const [proposingSet, setProposingSet] = useState(false);
  const [authoringSet, setAuthoringSet] = useState(false);
  const [setFailures, setSetFailures] = useState<
    AuthorSetResult["failures"] | null
  >(null);

  // Drafts (the structured authoring output the tutor edits + saves).
  const [target, setTarget] = useState<Target | null>(null);
  const [authoring, setAuthoring] = useState(false);
  const [cards, setCards] = useState<DraftCard[] | null>(null);
  // Mirror of `cards` so onBlur autosave (commit) reads the latest field values
  // without threading them through the child or capturing a stale closure.
  const cardsRef = useRef<DraftCard[] | null>(null);
  useEffect(() => {
    cardsRef.current = cards;
  }, [cards]);
  const [revisingIdx, setRevisingIdx] = useState<number | null>(null);
  // The authored-question preview is a left pane shown side-by-side with the chat
  // once drafts exist; the tutor can collapse it back to full-width chat without
  // discarding the drafts (re-open via the topbar chip) — D-AUTHUI-1.
  const [previewMinimized, setPreviewMinimized] = useState(false);
  // ASG-AUTO: on approve, also push the questions to the student as an assignment
  // (find-and-extend, split per chapter/subject). Default ON — the founder's call.
  const [assignOnApprove, setAssignOnApprove] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  // Bumped after every save so the "Saved questions" review panel re-queries.
  const [savedReload, setSavedReload] = useState(0);

  // Chat | Saved segmented view + the lifted saved-questions fetch (so the tab
  // can show a live count). Fetched regardless of the active view.
  const [authTab, setAuthTab] = useState<"chat" | "saved">("chat");
  const [savedRows, setSavedRows] = useState<AuthoredQuestion[] | null>(null);
  const [savedLoading, setSavedLoading] = useState(true);
  const [savedError, setSavedError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    setSavedLoading(true);
    setSavedError(null);
    trpc.tutor.listAuthoredQuestions
      .query({ studentId: student.studentId })
      .then((r) => {
        if (live) setSavedRows(r);
      })
      .catch((e) => {
        if (live) setSavedError(String(e?.message ?? e));
      })
      .finally(() => {
        if (live) setSavedLoading(false);
      });
    return () => {
      live = false;
    };
  }, [student.studentId, savedReload]);

  const chapters = nav ?? [];

  function resetAll() {
    setChat(null);
    setProposal(null);
    setProposing(false);
    setProposalSet(null);
    setSetCounts({});
    setProposingSet(false);
    setSetFailures(null);
    setTarget(null);
    setCards(null);
    setPreviewMinimized(false);
    setRevisingIdx(null);
    setSaved(null);
    setError(null);
    setInput("");
  }

  // Re-hydrate the review form from a RESUMED chat's still-unapproved drafts.
  // getChat now returns them (pendingDrafts), so every resume entry point — the
  // landing history picker AND a plain remount — restores identically; no path
  // can silently drop a mid-review form. No-op when there's nothing pending.
  function restoreDrafts(c: ChatView) {
    const drafts = c.pendingDrafts ?? [];
    if (drafts.length === 0) return;
    setCards(drafts.map((d) => toCard(d, d.subTopicId, d.subTopicName)));
    setPreviewMinimized(false);
    const first = drafts[0]!;
    setTarget({
      subTopicId: first.subTopicId,
      subTopicName: first.subTopicName,
      nextOrdinal: first.ordinal,
    });
  }

  // Rehydrate the active chat for this student on mount / student change. In launch
  // mode (QA3-d) the tutor explicitly chose a fresh scope in the modal, so we ignore
  // any stored handle and auto-start with the launch params instead.
  useEffect(() => {
    resetAll();
    if (launch) {
      setRehydrating(false);
      doStart({
        vendor: launch.vendor,
        mode: launch.mode,
        chapterIds: launch.chapterIds,
      });
      return;
    }
    // Resume-from-landing: load the chosen chat directly, ignoring any stored handle.
    if (resumeChatId) {
      setRehydrating(true);
      let alive = true;
      trpc.tutor.getAuthoringChat
        .query({ chatId: resumeChatId })
        .then((c) => {
          if (!alive) return;
          setChat(c);
          restoreDrafts(c);
          localStorage.setItem(CHAT_STORE_KEY(student.studentId), c.chatId);
        })
        .catch((e) => {
          if (alive) setError(String(e?.message ?? e));
        })
        .finally(() => {
          if (alive) setRehydrating(false);
        });
      return () => {
        alive = false;
      };
    }
    setRehydrating(true);
    const saved = localStorage.getItem(CHAT_STORE_KEY(student.studentId));
    if (!saved) {
      setRehydrating(false);
      return;
    }
    let live = true;
    trpc.tutor.getAuthoringChat
      .query({ chatId: saved })
      .then((c) => {
        if (!live) return;
        setChat(c);
        // Restore any un-approved drafts so a refresh mid-review doesn't lose them
        // (now carried on the chat payload — same path as the landing resume).
        restoreDrafts(c);
      })
      .catch(() => {
        // Chat gone (cleared / different board) → drop the stale handle, show gate.
        localStorage.removeItem(CHAT_STORE_KEY(student.studentId));
      })
      .finally(() => {
        if (live) setRehydrating(false);
      });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [student.studentId, launch, resumeChatId]);

  // Keep the newest turn in view: on resume/load, after every turn, and while the
  // AI is thinking or a consent card appears (Eyeball feedback #3a / D-AUTHUI-2).
  // The canvas scrolls internally and the input bar is a sibling below it, so
  // driving scrollTop to the bottom leaves the newest bubble fully visible.
  // (Drafts now live in the left preview pane, so they no longer affect this.)
  useEffect(() => {
    const el = canvasRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [chat?.chatId, chat?.messages.length, sending, proposal, proposalSet, authTab]);

  // The one start path — used by the internal gate (blocked, one chapter) and the
  // QA3-d launch auto-start (blocked or interleaved, one or many chapters).
  function doStart(params: {
    vendor: VendorChoice;
    mode?: "blocked" | "interleaved";
    chapterId?: string;
    chapterIds?: string[];
  }) {
    setError(null);
    setStarting(true);
    trpc.tutor.startAuthoringChat
      .mutate({ studentId: student.studentId, ...params })
      .then((c) => {
        setChat(c);
        localStorage.setItem(CHAT_STORE_KEY(student.studentId), c.chatId);
      })
      .catch((e) => setError(String(e?.message ?? e)))
      .finally(() => setStarting(false));
  }

  function startChat() {
    if (!startChapterId) return;
    doStart({ vendor, mode: "blocked", chapterId: startChapterId });
  }

  // New chat = the ONLY way to switch model/chapter (vendor is thread-locked;
  // D-AUTH2-1). Clears the stored handle. In launch mode it re-starts a fresh chat
  // with the SAME launched scope; otherwise it returns to the internal start gate.
  function newChat() {
    localStorage.removeItem(CHAT_STORE_KEY(student.studentId));
    resetAll();
    if (launch) {
      doStart({
        vendor: launch.vendor,
        mode: launch.mode,
        chapterIds: launch.chapterIds,
      });
    } else {
      setStartChapterId("");
    }
  }

  // Resume a past chat from the history picker (Eyeball-#2 item #3).
  function resumeChat(chatId: string) {
    setError(null);
    trpc.tutor.getAuthoringChat
      .query({ chatId })
      .then((c) => {
        resetAll();
        setChat(c);
        // Restore any un-approved drafts so opening a mid-review chat from the
        // history picker doesn't drop the preview — parity with the landing +
        // localStorage resume paths (the missing call that lost the form).
        restoreDrafts(c);
        localStorage.setItem(CHAT_STORE_KEY(student.studentId), c.chatId);
        setAuthTab("chat");
      })
      .catch((e) => setError(String(e?.message ?? e)));
  }

  function send() {
    const text = input.trim();
    if (!chat || !text || sending) return;
    setError(null);
    setSending(true);
    setInput("");
    // Optimistic: show the tutor's turn immediately (the mutation only returns
    // once the AI has also replied, so without this the message wouldn't appear
    // until the whole round-trip completes — Eyeball feedback #3b).
    const prevChat = chat;
    const optimistic: ChatTurn = {
      id: `optimistic-${Date.now()}`,
      role: "user",
      text,
      createdAt: new Date().toISOString(),
    };
    setChat({ ...chat, messages: [...chat.messages, optimistic] });
    trpc.tutor.sendAuthoringChatTurn
      .mutate({ chatId: chat.chatId, text })
      .then((c) => {
        setChat(c); // authoritative list replaces the optimistic turn
        // Gemini authored in-chat via the author_questions tool → route its
        // drafts into the SAME review form the button flow uses (decision 2b).
        if (c.draft) {
          const d = c.draft;
          setSaved(null);
          setProposal(null);
          setTarget({
            subTopicId: d.subTopicId,
            subTopicName: d.subTopicName,
            nextOrdinal: d.nextOrdinal,
          });
          setCards(d.drafts.map((x) => toCard(x, d.subTopicId, d.subTopicName)));
          setPreviewMinimized(false);
        }
      })
      .catch((e) => {
        setError(String(e?.message ?? e));
        setChat(prevChat); // roll back the optimistic turn
        setInput(text); // restore the unsent message
      })
      .finally(() => setSending(false));
  }

  // Consent-in-chat: ask the AI to propose ONE target (sub_topic + count) from the
  // conversation + grounding, scoped to the chat's chapter. The tutor confirms.
  function propose() {
    if (!chat || proposing) return;
    setError(null);
    setSaved(null);
    setProposing(true);
    trpc.tutor.proposeAuthoringTarget
      .mutate({ chatId: chat.chatId })
      .then((p) => {
        setProposal(p);
        setProposeCount(p.count);
      })
      .catch((e) => {
        const msg = String(e?.message ?? e);
        // PRECONDITION_FAILED codes come through as the code string.
        if (/NO_SUBTOPICS/.test(msg))
          setError("This chapter has no sub-topics to author for.");
        else setError(msg);
      })
      .finally(() => setProposing(false));
  }

  // The tutor accepted the proposal → author the questions for that target.
  function authorConfirmed() {
    if (!chat || !proposal) return;
    const p = proposal;
    setError(null);
    setSaved(null);
    setProposal(null);
    setAuthoring(true);
    trpc.tutor.authorFromChat
      .mutate({
        chatId: chat.chatId,
        subTopicId: p.subTopicId,
        count: proposeCount,
      })
      .then((r) => {
        setTarget({
          subTopicId: r.subTopicId,
          subTopicName: r.subTopicName,
          nextOrdinal: r.nextOrdinal,
        });
        setCards(r.drafts.map((x) => toCard(x, r.subTopicId, r.subTopicName)));
        setPreviewMinimized(false);
      })
      .catch((e) => setError(String(e?.message ?? e)))
      .finally(() => setAuthoring(false));
  }

  // QA3-e-2: ask the AI to propose an INTERLEAVED SET (a mix of sub-topics + counts)
  // from the conversation + grounding. Interleaved mode only. The tutor confirms.
  function proposeSet() {
    if (!chat || proposingSet) return;
    setError(null);
    setSaved(null);
    setProposingSet(true);
    trpc.tutor.proposeAuthoringSet
      .mutate({ chatId: chat.chatId })
      .then((p) => {
        setProposalSet(p);
        setSetCounts(
          Object.fromEntries(p.picks.map((pk) => [pk.subTopicId, pk.count])),
        );
      })
      .catch((e) => {
        const msg = String(e?.message ?? e);
        if (/NO_SUBTOPICS/.test(msg))
          setError("These chapters have no sub-topics to author for.");
        else setError(msg);
      })
      .finally(() => setProposingSet(false));
  }

  // The tutor accepted the set → fan out one worker PER sub-topic (parallel, server
  // side). Drafts across all sub-topics land in the SAME review, grouped. Any
  // sub-topic whose worker failed is surfaced (setFailures), not silently dropped.
  function authorSetConfirmed() {
    if (!chat || !proposalSet) return;
    const picks = proposalSet.picks;
    setError(null);
    setSaved(null);
    setProposalSet(null);
    setSetFailures(null);
    setAuthoringSet(true);
    trpc.tutor.authorSetFromChat
      .mutate({
        chatId: chat.chatId,
        targets: picks.map((p) => ({
          subTopicId: p.subTopicId,
          count: Math.max(1, Math.min(8, setCounts[p.subTopicId] ?? p.count)),
        })),
      })
      .then((r) => {
        const cs = r.groups.flatMap((g) =>
          g.drafts.map((d) => toCard(d, g.subTopicId, g.subTopicName)),
        );
        if (cs.length > 0) {
          const first = r.groups[0]!;
          setTarget({
            subTopicId: first.subTopicId,
            subTopicName: first.subTopicName,
            nextOrdinal: first.nextOrdinal,
          });
          setCards(cs);
          setPreviewMinimized(false);
        }
        setSetFailures(r.failures.length > 0 ? r.failures : null);
        if (cs.length === 0 && r.failures.length > 0) {
          setError(
            `Authoring failed for all ${r.failures.length} sub-topic${r.failures.length === 1 ? "" : "s"}. Try again.`,
          );
        }
      })
      .catch((e) => setError(String(e?.message ?? e)))
      .finally(() => setAuthoringSet(false));
  }

  const patch = (i: number, p: Partial<DraftCard>) =>
    setCards((cs) => (cs ? cs.map((c, n) => (n === i ? { ...c, ...p } : c)) : cs));

  // Autosave one draft's editable fields to the server (onBlur / on select-change /
  // after a spec edit). Drafts persist server-side now, so approve reads the saved
  // state — a fire-and-forget commit keeps them in sync. An empty-description spec
  // is normalized to null (imageSpecSchema requires a description when present).
  function commit(i: number): Promise<void> {
    const c = cardsRef.current?.[i];
    if (!c) return Promise.resolve();
    const image = c.image && c.image.description.trim() ? c.image : null;
    return trpc.tutor.updateDraft
      .mutate({
        questionId: c.id,
        patch: {
          axis: c.axis,
          stem: c.stem,
          referenceAnswer: c.referenceAnswer,
          explanation: c.explanation.trim() ? c.explanation : null,
          image,
        },
      })
      .then(() => {})
      .catch((e) => setError(String(e?.message ?? e)));
  }

  // Discard one persisted draft (+ any rendered figures) and drop its card.
  function discardCard(i: number) {
    const c = cardsRef.current?.[i];
    if (!c) return;
    setError(null);
    trpc.tutor.discardDraft
      .mutate({ questionId: c.id })
      .then(() =>
        setCards((cs) => {
          const next = cs ? cs.filter((_, n) => n !== i) : cs;
          return next && next.length > 0 ? next : null;
        }),
      )
      .catch((e) => setError(String(e?.message ?? e)));
  }

  // Per-question mini-chat: revise ONE draft in place per a tutor instruction.
  function revise(i: number, note: string) {
    if (!chat || !cards) return;
    const card = cards[i];
    if (!card) return;
    setError(null);
    setRevisingIdx(i);
    commit(i)
      .then(() =>
        trpc.tutor.reviseDraftQuestion.mutate({
          chatId: chat.chatId,
          questionId: card.id,
          refinementNote: note,
        }),
      )
      .then((d) => patch(i, toCard(d, card.subTopicId, card.subTopicName)))
      .catch((e) => setError(String(e?.message ?? e)))
      .finally(() => setRevisingIdx(null));
  }

  // Approve = the M11 ENABLEMENT side: flip the reviewed drafts to status='approved'
  // so they go live to the student (replaces the old saveAuthoredQuestions call,
  // now removed — drafts are already persisted; approve just enables them).
  async function approve() {
    if (!target || !cards || cards.length === 0) return;
    const ids = cards.map((c) => c.id);
    const n = ids.length;
    setSaving(true);
    setError(null);
    try {
      // Flush any un-committed edits first, then enable (M11 enablement).
      await Promise.all(cards.map((_, i) => commit(i)));
      const assign = assignOnApprove && !!chat;
      const res = await trpc.tutor.approveDrafts.mutate({
        questionIds: ids,
        assign,
        mode: chat?.mode,
      });
      const who = student.name ?? student.email;
      const assigned = assign && (res.assignments?.length ?? 0) > 0;
      setSaved(
        `Approved ${n} question${n === 1 ? "" : "s"} for ${who}` +
          (assigned
            ? " - now live and assigned to them. Keep chatting to author more."
            : " - now live to them. Keep chatting to author more."),
      );
      setCards(null);
      setTarget(null);
      setSetFailures(null);
      setSavedReload((k) => k + 1); // refresh the review panel
    } catch (e) {
      setError(String((e as { message?: string })?.message ?? e));
    } finally {
      setSaving(false);
    }
  }

  const savedCount = savedRows?.length ?? 0;
  const segmented = (
    <nav className="tut-auth-modes" role="tablist">
      <button
        role="tab"
        aria-selected={authTab === "chat"}
        className={`tut-auth-mode${authTab === "chat" ? " is-on" : ""}`}
        onClick={() => setAuthTab("chat")}
      >
        Chat
      </button>
      <button
        role="tab"
        aria-selected={authTab === "saved"}
        className={`tut-auth-mode${authTab === "saved" ? " is-on" : ""}`}
        onClick={() => setAuthTab("saved")}
      >
        Authored questions
        <span className="tut-auth-mode-count">{savedLoading ? "…" : savedCount}</span>
      </button>
    </nav>
  );

  if (rehydrating)
    return (
      <div className="tut-authwrap">
        {segmented}
        <p className="tut-muted">Restoring chat…</p>
      </div>
    );

  // AUTHORED view — per-student chapter nav → collapsible topic → sub-topic →
  // question tree (D-AUTHUI-3).
  if (authTab === "saved") {
    return (
      <div className="tut-authwrap">
        {segmented}
        <AuthoredQuestionsList
          rows={savedRows}
          loading={savedLoading}
          error={savedError}
          studentLabel={student.name ?? student.email}
        />
      </div>
    );
  }

  // Launch mode (QA3-d): the scope was chosen in the modal — never show the internal
  // single-chapter gate; show a starting placeholder until the auto-started chat lands.
  if (launch && !chat) {
    return (
      <div className="tut-authwrap">
        {segmented}
        {error ? (
          <p className="tut-error">{error}</p>
        ) : (
          <p className="tut-muted">Starting chat…</p>
        )}
      </div>
    );
  }

  // Start gate — pick a vendor + a chapter, then start (both lock for the thread).
  if (!chat) {
    return (
      <div className="tut-authwrap">
        {segmented}
        <div className="tut-chat-start">
        <div className="tut-chat-start-hist">
          <HistoryPicker
            studentId={student.studentId}
            activeChatId={null}
            onResume={resumeChat}
          />
        </div>
        <p className="tut-muted">
          Start a chat about {student.name ?? student.email}. The AI arrives already
          knowing their mastery and recent reads - talk through what to work on, and it
          will propose questions aimed at their weak spots (private to this student).
        </p>
        {error && <p className="tut-error">{error}</p>}
        <div className="tut-chat-vendorpick">
          <span className="tut-chat-vendorlabel">Model</span>
          <div className="tut-chat-vendortoggle" role="tablist">
            {(["gemini_api", "claude_cli"] as VendorChoice[]).map((v) => (
              <button
                key={v}
                role="tab"
                aria-selected={vendor === v}
                className={`tut-chat-vendoropt${vendor === v ? " is-on" : ""}`}
                onClick={() => setVendor(v)}
                disabled={starting}
              >
                {VENDOR_LABEL[v]}
              </button>
            ))}
          </div>
        </div>
        <label className="tut-chat-chapterpick">
          <span className="tut-chat-vendorlabel">Chapter</span>
          <select
            className="tut-asg-select"
            value={startChapterId}
            onChange={(e) => setStartChapterId(e.target.value)}
            disabled={starting || nav === null}
          >
            <option value="">Pick a chapter…</option>
            {chapters.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <button
          className="btn-solid tut-chat-startbtn"
          onClick={startChat}
          disabled={starting || !startChapterId}
        >
          {starting ? "Starting…" : "Start chat →"}
        </button>
        </div>
      </div>
    );
  }

  const chapterName = chapters.find((c) => c.id === chat.chapterId)?.name ?? null;

  return (
    <div className="tut-authwrap">
    {segmented}
    <div className="tut-chat">
      {error && <p className="tut-error">{error}</p>}

      {/* TOP: a slim context strip — vendor + chapter scope + New chat (the only
          way to switch model/chapter). No picker; authoring runs through the chat. */}
      <div className="tut-chat-topbar">
        <div className="tut-chat-scope">
          <span className="tut-chat-vendorchip">
            {VENDOR_LABEL[chat.vendor as VendorChoice]}
          </span>
          {chapterName && <span className="tut-chat-scopechap">{chapterName}</span>}
        </div>
        <div className="tut-chat-actions">
          {cards && cards.length > 0 && previewMinimized && (
            <button
              className="tut-chat-preview-chip"
              onClick={() => setPreviewMinimized(false)}
              title="Re-open the drafted questions"
            >
              Preview ({cards.length})
            </button>
          )}
          <HistoryPicker
            studentId={student.studentId}
            activeChatId={chat.chatId}
            onResume={resumeChat}
          />
          <button className="tut-chat-newbtn" onClick={newChat} disabled={saving || authoring}>
            + New chat
          </button>
        </div>
      </div>
      {saved && <p className="tut-auth-saved tut-chat-authmeta">{saved}</p>}

      {/* MIDDLE: a two-column split — LEFT the authored-question preview (only
          once drafts exist, minimizeable → full-width chat, D-AUTHUI-1), RIGHT
          the conversation (canvas scrolls internally) + the input bar. */}
      <div className={`tut-chat-split${cards && target && !previewMinimized ? " is-split" : ""}`}>

        {/* Kept MOUNTED when minimized (hidden via CSS, not unmounted) so an
            in-flight figure generate/poll + any in-progress edits survive a
            minimize → re-expand (D-AUTHUI-1). */}
        {cards && target && (() => {
          // QA3-e-2: group the flat card list by sub_topic (first-seen order),
          // preserving each card's ORIGINAL index so patch/commit/revise/discard
          // still address the flat array. A single-target review has one group
          // (renders exactly as before); a fan-out review has several.
          const groups: { subTopicId: string; subTopicName: string; entries: { card: DraftCard; i: number }[] }[] = [];
          cards.forEach((card, i) => {
            let g = groups.find((x) => x.subTopicId === card.subTopicId);
            if (!g) {
              g = { subTopicId: card.subTopicId, subTopicName: card.subTopicName, entries: [] };
              groups.push(g);
            }
            g.entries.push({ card, i });
          });
          const multi = groups.length > 1;
          return (
          <div className={`tut-chat-preview${previewMinimized ? " is-hidden" : ""}`}>
            <div className="tut-chat-preview-head">
              <div className="tut-chat-preview-title">
                {multi ? (
                  <>
                    Drafted {cards.length} question{cards.length === 1 ? "" : "s"} across{" "}
                    {groups.length} sub-topics - review, edit, add figures, then approve
                    (private to {student.name ?? student.email}).
                  </>
                ) : (
                  <>
                    Drafted {cards.length} question{cards.length === 1 ? "" : "s"} for{" "}
                    {target.subTopicName} - review, edit, add a figure, then approve
                    (private to {student.name ?? student.email}; slotting at #
                    {target.nextOrdinal + 1}).
                  </>
                )}
              </div>
              <button
                className="tut-chat-preview-min"
                onClick={() => setPreviewMinimized(true)}
                title="Minimize - keeps the drafts, back to full-width chat"
              >
                Minimize ⟨
              </button>
            </div>
            {setFailures && setFailures.length > 0 && (
              <p className="tut-chat-set-failures">
                ⚠ Couldn't author {setFailures.map((f) => f.subTopicName).join(", ")}
                {" "}- the drafts above are for the sub-topics that succeeded. Retry the set to try again.
              </p>
            )}
            <div className="tut-auth-cards">
              {groups.map((g) => (
                <div key={g.subTopicId} className="tut-auth-group">
                  {multi && (
                    <div className="tut-auth-group-head">
                      {g.subTopicName}
                      <span className="tut-auth-group-count">
                        {g.entries.length}
                      </span>
                    </div>
                  )}
                  {g.entries.map(({ card, i }, n) => (
                    <AuthorCardForm
                      key={card.id}
                      n={multi ? n + 1 : i + 1}
                      card={card}
                      onPatch={(p) => patch(i, p)}
                      onCommit={() => commit(i)}
                      onRevise={(note) => revise(i, note)}
                      onDiscard={() => discardCard(i)}
                      revising={revisingIdx === i}
                      disabled={saving || revisingIdx !== null}
                    />
                  ))}
                </div>
              ))}
            </div>
            <div className="tut-auth-savebar">
              <label className="tut-auth-assign">
                <input
                  type="checkbox"
                  checked={assignOnApprove}
                  onChange={(e) => setAssignOnApprove(e.target.checked)}
                  disabled={saving}
                />
                Assign to {student.name ?? student.email}
              </label>
              <button
                className="btn-solid"
                onClick={approve}
                disabled={saving || authoring || authoringSet || revisingIdx !== null}
              >
                {saving
                  ? "Approving…"
                  : `Approve ${cards.length} question${cards.length === 1 ? "" : "s"}`}
              </button>
            </div>
          </div>
          );
        })()}

        <div className="tut-chat-main">
      <div className="tut-chat-canvas" ref={canvasRef}>
        {chat.messages.length === 0 && !sending && !cards && !proposal && (
          <p className="tut-chat-hint">
            Say hi, or tell the AI what you'd like to focus on. It already has{" "}
            {student.name ?? "the student"}'s mastery + Stage-1 reads. When you're
            ready, hit “Suggest what to work on”.
          </p>
        )}
        {chat.messages.map((m: ChatTurn) => (
          <div
            key={m.id}
            className={`tut-chat-row tut-chat-row--${m.role === "user" ? "tutor" : "ai"}`}
          >
            <div className={`tut-chat-bubble tut-chat-bubble--${m.role === "user" ? "tutor" : "ai"}`}>
              {m.role === "user" ? (
                m.text
              ) : (
                <div className="tut-chat-md">
                  {/* remark-math + rehype-katex: the master chat embeds draft
                      stems with $...$ TeX — render it, not raw dollars. */}
                  <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
                    {m.text}
                  </ReactMarkdown>
                </div>
              )}
            </div>
          </div>
        ))}
        {sending && (
          <div className="tut-chat-row tut-chat-row--ai">
            <div className="tut-chat-bubble tut-chat-bubble--ai tut-chat-typing">
              Thinking…
            </div>
          </div>
        )}

        {/* Consent card — the AI proposes ONE target; the tutor confirms (or not). */}
        {proposal && (
          <div className="tut-chat-consent">
            <div className="tut-chat-consent-head">Suggested target</div>
            <div className="tut-chat-consent-target">
              {proposal.topicName} › {proposal.subTopicName}
            </div>
            <p className="tut-chat-consent-why">{proposal.rationale}</p>
            <div className="tut-chat-consent-actions">
              <label className="tut-chat-consent-count">
                <span>How many</span>
                <input
                  type="number"
                  min={1}
                  max={8}
                  value={proposeCount}
                  onChange={(e) =>
                    setProposeCount(Math.max(1, Math.min(8, Number(e.target.value) || 1)))
                  }
                  disabled={authoring}
                />
              </label>
              <button
                className="btn-solid"
                onClick={authorConfirmed}
                disabled={authoring}
              >
                {authoring ? "Authoring…" : `Author ${proposeCount} →`}
              </button>
              <button
                className="tut-chat-consent-dismiss"
                onClick={() => setProposal(null)}
                disabled={authoring}
              >
                Not yet
              </button>
            </div>
          </div>
        )}

        {/* Consent card — the AI proposes an interleaved SET (QA3-e-2); the tutor
            edits per-sub-topic counts + confirms, then a parallel fan-out authors. */}
        {proposalSet && (
          <div className="tut-chat-consent tut-chat-consent--set">
            <div className="tut-chat-consent-head">
              Suggested interleaved set ({proposalSet.picks.length} sub-topics)
            </div>
            <p className="tut-chat-consent-why">{proposalSet.rationale}</p>
            <div className="tut-chat-set-picks">
              {proposalSet.picks.map((pk) => (
                <div key={pk.subTopicId} className="tut-chat-set-pick">
                  <span className="tut-chat-set-pick-name">
                    {pk.chapterName} › {pk.subTopicName}
                  </span>
                  <label className="tut-chat-consent-count">
                    <span>×</span>
                    <input
                      type="number"
                      min={1}
                      max={8}
                      value={setCounts[pk.subTopicId] ?? pk.count}
                      onChange={(e) =>
                        setSetCounts((m) => ({
                          ...m,
                          [pk.subTopicId]: Math.max(1, Math.min(8, Number(e.target.value) || 1)),
                        }))
                      }
                      disabled={authoringSet}
                    />
                  </label>
                </div>
              ))}
            </div>
            <div className="tut-chat-consent-actions">
              <button
                className="btn-solid"
                onClick={authorSetConfirmed}
                disabled={authoringSet}
              >
                {authoringSet
                  ? "Authoring the set…"
                  : `Author set (${proposalSet.picks.reduce((n, p) => n + (setCounts[p.subTopicId] ?? p.count), 0)} questions) →`}
              </button>
              <button
                className="tut-chat-consent-dismiss"
                onClick={() => setProposalSet(null)}
                disabled={authoringSet}
              >
                Not yet
              </button>
            </div>
          </div>
        )}

        {authoring && !proposal && (
          <p className="tut-muted tut-chat-authmeta">Authoring the questions… (~10–30s)</p>
        )}
        {authoringSet && !proposalSet && (
          <p className="tut-muted tut-chat-authmeta">
            Authoring the set in parallel - one worker per sub-topic… (~20–40s)
          </p>
        )}
      </div>

      {/* BOTTOM of the chat column: the input + the consent trigger. Now a normal
          flex sibling below the scrolling canvas (no longer sticky) — the newest
          bubble can't hide behind it (D-AUTHUI-2). */}
      <div className="tut-chat-inputbar">
        <textarea
          className="tut-chat-input"
          rows={1}
          placeholder="Type your message…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
        />
        <button
          className="tut-chat-suggest"
          onClick={propose}
          disabled={proposing || authoring || !!proposal}
          title="Ask the AI to propose a sub-topic + count to author for"
        >
          {proposing ? "Thinking…" : "Suggest what to work on"}
        </button>
        {/* QA3-e-2: the interleaved fan-out entry — only in interleaved mode (a set
            spans the chat's chosen chapters). Blocked chats keep the single flow. */}
        {chat.mode === "interleaved" && (
          <button
            className="tut-chat-suggest"
            onClick={proposeSet}
            disabled={proposingSet || authoringSet || !!proposalSet}
            title="Ask the AI to propose an interleaved MIX of sub-topics to author across the chosen chapters"
          >
            {proposingSet ? "Thinking…" : "Suggest an interleaved set"}
          </button>
        )}
        <button
          className="tut-chat-send"
          onClick={send}
          disabled={sending || !input.trim()}
          aria-label="Send"
        >
          ➤
        </button>
      </div>
        </div>
      </div>
    </div>
    </div>
  );
}

// Review surface (Slice AUTH-v2.1 item #2): every question authored PRIVATE to
// this student, grouped by topic › sub-topic. Reached via the "Saved questions"
// segmented tab (parent owns the fetch so the tab can show a live count). This is
// a TUTOR-only read, so the reference answer + intent are shown.
// Verifier badge for an authored figure (Slice IMG Stage-3). imageId null =
// render not done yet (RENDERING); label null = rendered-but-unverified
// (VERIFYING); PASS/FAIL/ERROR = the vision verdict. Tutor-only — the author
// sees FAIL/ERROR here to decide whether to regenerate (students never see a
// non-PASS figure, D-IMG-13).
function VerifierBadge({
  imageId,
  label,
}: {
  imageId: string | null;
  label: string | null;
}) {
  let tone: string;
  let text: string;
  if (!imageId) {
    tone = "pending";
    text = "Rendering…";
  } else if (label === "PASS") {
    tone = "pass";
    text = "✓ Verified";
  } else if (label === "FAIL") {
    tone = "fail";
    text = "✗ Failed check";
  } else if (label === "ERROR") {
    tone = "error";
    text = "⚠ Render error";
  } else {
    tone = "pending";
    text = "Verifying…";
  }
  return <span className={`tut-saved-badge tut-saved-badge--${tone}`}>{text}</span>;
}

// One authored-question card (tags + figure + collapsible reference answer).
function AuthoredQuestionCard({ q }: { q: AuthoredQuestion }) {
  return (
    <div className="tut-saved-q">
      <div className="tut-saved-qhead">
        <span className="tut-saved-axis">{q.axis}</span>
        {q.hasImage && <span className="tut-saved-fig">figure</span>}
        {q.hasImage && <VerifierBadge imageId={q.imageId} label={q.verifierLabel} />}
      </div>
      <p className="tut-saved-stem">
        <MathText text={q.stem} />
      </p>
      {q.imageId && (
        <img
          className="tut-saved-thumb"
          src={`/content/image/${q.imageId}?board=${BOARD}`}
          alt="Question figure"
          loading="lazy"
        />
      )}
      <details className="tut-saved-ref">
        <summary>Reference answer</summary>
        <p>
          <MathText text={q.referenceAnswer} />
        </p>
        {q.explanation && (
          <p className="tut-saved-expl">
            <MathText text={q.explanation} />
          </p>
        )}
      </details>
    </div>
  );
}

// AUTHORED-questions view (D-AUTHUI-3): per-student, chapter-wise. A left vertical
// chapter nav (chapters that have authored questions for this student, with a
// count) → click a chapter → its topics as collapsible rows (ALL collapsed by
// default) → sub-topic sub-headers → question cards. Rows arrive chapter/topic/
// sub-topic/ordinal-sorted from the backend, so grouping preserves order.
function AuthoredQuestionsList({
  rows,
  loading,
  error,
  studentLabel,
}: {
  rows: AuthoredQuestion[] | null;
  loading: boolean;
  error: string | null;
  studentLabel: string;
}) {
  const count = rows?.length ?? 0;

  // Nested grouping chapter → topic → sub-topic, order-preserving.
  type SubGroup = { name: string; items: AuthoredQuestion[] };
  type TopicGroup = { name: string; subs: SubGroup[]; count: number };
  type ChapterGroup = { id: string; name: string; topics: TopicGroup[]; count: number };
  const chapters: ChapterGroup[] = [];
  for (const q of rows ?? []) {
    let ch = chapters.find((c) => c.id === q.chapterId);
    if (!ch) {
      ch = { id: q.chapterId, name: q.chapterName, topics: [], count: 0 };
      chapters.push(ch);
    }
    ch.count++;
    let tp = ch.topics.find((t) => t.name === q.topicName);
    if (!tp) {
      tp = { name: q.topicName, subs: [], count: 0 };
      ch.topics.push(tp);
    }
    tp.count++;
    let sub = tp.subs.find((s) => s.name === q.subTopicName);
    if (!sub) {
      sub = { name: q.subTopicName, items: [] };
      tp.subs.push(sub);
    }
    sub.items.push(q);
  }

  const [activeChapter, setActiveChapter] = useState<string | null>(null);
  // Auto-select the first chapter once rows land / when the selection falls away.
  useEffect(() => {
    if (chapters.length === 0) {
      if (activeChapter !== null) setActiveChapter(null);
      return;
    }
    if (!activeChapter || !chapters.some((c) => c.id === activeChapter)) {
      setActiveChapter(chapters[0]!.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows]);

  if (error) return <p className="tut-error">{error}</p>;
  if (loading) return <p className="tut-muted tut-saved-empty">Loading…</p>;
  if (count === 0)
    return (
      <p className="tut-muted tut-saved-empty">
        No questions authored for {studentLabel} yet. Head to the Chat tab and author
        some - they'll show up here.
      </p>
    );

  const active = chapters.find((c) => c.id === activeChapter) ?? chapters[0]!;

  return (
    <section className="tut-authored">
      <p className="tut-saved-lede">
        {count} question{count === 1 ? "" : "s"} authored for {studentLabel} across{" "}
        {chapters.length} chapter{chapters.length === 1 ? "" : "s"} (private to them).
      </p>
      <div className="tut-authored-split">
        {/* LEFT: vertical chapter nav */}
        <nav className="tut-authored-nav" aria-label="Chapters">
          {chapters.map((c) => (
            <button
              key={c.id}
              className={`tut-authored-navitem${c.id === active.id ? " is-on" : ""}`}
              onClick={() => setActiveChapter(c.id)}
            >
              <span className="tut-authored-navname">{c.name}</span>
              <span className="tut-authored-navcount">{c.count}</span>
            </button>
          ))}
        </nav>

        {/* RIGHT: the active chapter's topics, collapsed by default */}
        <div className="tut-authored-detail">
          <h3 className="tut-authored-chaptitle">{active.name}</h3>
          {active.topics.map((tp) => (
            <details key={tp.name} className="tut-authored-topic">
              <summary className="tut-authored-topichead">
                <span className="tut-authored-topicname">{tp.name}</span>
                <span className="tut-authored-topiccount">
                  {tp.count} question{tp.count === 1 ? "" : "s"}
                </span>
              </summary>
              <div className="tut-authored-topicbody">
                {tp.subs.map((sub) => (
                  <div key={sub.name} className="tut-authored-sub">
                    <div className="tut-authored-subhead">{sub.name}</div>
                    {sub.items.map((q) => (
                      <AuthoredQuestionCard key={q.id} q={q} />
                    ))}
                  </div>
                ))}
              </div>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

// Past-chats picker (Eyeball-#2 item #3): a dropdown of the student's prior
// authoring chats → resume any of them. Refreshes when opened and when the
// active chat changes (so counts/order stay fresh). `.tut-hist-` scoped.
const VENDOR_SHORT: Record<string, string> = {
  gemini_api: "Gemini",
  claude_cli: "Claude",
};
function HistoryPicker({
  studentId,
  activeChatId,
  onResume,
}: {
  studentId: string;
  activeChatId: string | null;
  onResume: (chatId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<ChatSummary[] | null>(null);
  const [loading, setLoading] = useState(false);

  function load() {
    setLoading(true);
    trpc.tutor.listAuthoringChats
      .query({ studentId })
      .then(setRows)
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }
  // (Re)load when the menu opens or the active chat changes while open.
  useEffect(() => {
    if (open) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, activeChatId, studentId]);

  const count = rows?.length ?? 0;

  return (
    <div className="tut-hist">
      <button
        className="tut-hist-btn"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        title="Previous chats for this student"
      >
        <span className="tut-hist-icon" aria-hidden>
          🕘
        </span>
        Past chats
      </button>
      {open && (
        <>
          <div className="tut-hist-scrim" onClick={() => setOpen(false)} />
          <div className="tut-hist-menu" role="menu">
            {loading && <p className="tut-hist-empty">Loading…</p>}
            {!loading && count === 0 && (
              <p className="tut-hist-empty">No previous chats yet.</p>
            )}
            {(rows ?? []).map((c) => (
              <button
                key={c.chatId}
                className={`tut-hist-row${c.chatId === activeChatId ? " is-active" : ""}`}
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  if (c.chatId !== activeChatId) onResume(c.chatId);
                }}
              >
                <div className="tut-hist-row-top">
                  <span className="tut-hist-vendor">
                    {VENDOR_SHORT[c.vendor] ?? c.vendor}
                  </span>
                  <span className="tut-hist-chap">{c.chapterName ?? "No chapter"}</span>
                  {c.chatId === activeChatId && (
                    <span className="tut-hist-current">current</span>
                  )}
                </div>
                <div className="tut-hist-row-meta">
                  {c.messageCount} message{c.messageCount === 1 ? "" : "s"} ·{" "}
                  {new Date(c.updatedAt).toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                  })}
                </div>
                {c.lastPreview && <div className="tut-hist-preview">{c.lastPreview}</div>}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// Live LaTeX preview shown beneath an editable draft field (1B): the AI emits
// inline `$...$` math in the stem/answer, so the raw textarea alone reads as
// source. Rendered only when there's math to render (a `$` present) — a plain-text
// field needs no echo. `.tut-`-scoped to dodge the global revision-shell.css leak.
function FieldPreview({ text }: { text: string }) {
  if (!text || !text.includes("$")) return null;
  return (
    <div className="tut-auth-preview" aria-hidden>
      <span className="tut-auth-preview-tag">Preview</span>
      <div className="tut-auth-preview-body">
        <MathText text={text} />
      </div>
    </div>
  );
}

function AuthorCardForm({
  n,
  card,
  onPatch,
  onCommit,
  onRevise,
  onDiscard,
  revising,
  disabled,
}: {
  n: number;
  card: DraftCard;
  onPatch: (p: Partial<DraftCard>) => void;
  onCommit: () => Promise<void>;
  onRevise: (note: string) => void;
  onDiscard: () => void;
  revising: boolean;
  disabled: boolean;
}) {
  const [note, setNote] = useState("");
  const busy = disabled || revising;

  function submitRevision() {
    const t = note.trim();
    if (!t || busy) return;
    setNote("");
    onRevise(t);
  }

  return (
    <div className="tut-auth-card">
      <div className="tut-auth-cardhead">
        <span className="tut-auth-num-badge">Q{n}</span>
        <select
          className="tut-asg-select tut-auth-axis"
          value={card.axis}
          onChange={(e) => onPatch({ axis: e.target.value as DraftCard["axis"] })}
          onBlur={() => onCommit()}
          disabled={busy}
        >
          <option value="conceptual">Conceptual</option>
          <option value="procedural">Procedural</option>
          <option value="both">Both</option>
        </select>
        <button
          className="tut-auth-discard"
          onClick={onDiscard}
          disabled={busy}
          title="Discard this draft"
        >
          Discard
        </button>
      </div>

      <label className="tut-auth-cardfield">
        <span>Question</span>
        <textarea
          className="tut-auth-ta"
          rows={3}
          value={card.stem}
          onChange={(e) => onPatch({ stem: e.target.value })}
          onBlur={() => onCommit()}
          disabled={busy}
        />
        <FieldPreview text={card.stem} />
      </label>

      <label className="tut-auth-cardfield">
        <span>Reference answer</span>
        <textarea
          className="tut-auth-ta"
          rows={3}
          value={card.referenceAnswer}
          onChange={(e) => onPatch({ referenceAnswer: e.target.value })}
          onBlur={() => onCommit()}
          disabled={busy}
        />
        <FieldPreview text={card.referenceAnswer} />
      </label>

      <label className="tut-auth-cardfield">
        <span>Explanation (optional)</span>
        <textarea
          className="tut-auth-ta"
          rows={2}
          value={card.explanation}
          onChange={(e) => onPatch({ explanation: e.target.value })}
          onBlur={() => onCommit()}
          disabled={busy}
        />
        <FieldPreview text={card.explanation} />
      </label>

      {/* Figure spec + on-demand render/verify (Slice FIG-AUTH Stage-2). */}
      <DraftFigureSection
        card={card}
        onPatch={onPatch}
        onCommit={onCommit}
        disabled={busy}
      />

      {/* Per-question mini-chat — "make this harder", "swap the context", etc. */}
      <div className="tut-auth-minichat">
        <input
          className="tut-auth-minichat-input"
          placeholder="Revise this question… (e.g. make it harder, change the context)"
          value={note}
          disabled={busy}
          onChange={(e) => setNote(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              submitRevision();
            }
          }}
        />
        <button
          className="tut-auth-minichat-btn"
          onClick={submitRevision}
          disabled={busy || !note.trim()}
        >
          {revising ? "Revising…" : "Revise"}
        </button>
      </div>
    </div>
  );
}

// The figure spec editor + on-demand render/verify for one draft (Slice FIG-AUTH
// Stage-2, ported in SHAPE from Starkhorn's QuestionImageSection). The tutor edits
// the spec (what to show / must-show / must-not-show), hits Generate → Gemini writes
// a matplotlib script → nadi-pyrender → PNG → the vision verifier stamps PASS/FAIL.
// We poll getQuestionImage until the verdict lands (renders are SLOW — minutes).
// `.tut-auth-fig-` scoped (the revision-shell.css global landmine, S23 discipline).
function DraftFigureSection({
  card,
  onPatch,
  onCommit,
  disabled,
}: {
  card: DraftCard;
  onPatch: (p: Partial<DraftCard>) => void;
  onCommit: () => Promise<void>;
  disabled: boolean;
}) {
  const [open, setOpen] = useState<boolean>(!!card.image);
  const [generating, setGenerating] = useState(false);
  const [showRegen, setShowRegen] = useState(false);
  const [refine, setRefine] = useState("");
  const [reverifying, setReverifying] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // Current rendered figure (id + verdict), seeded from the card, kept fresh by the
  // poll after a generate + re-seeded when a revise replaces the draft's figure.
  const [img, setImg] = useState<{ imageId: string | null; verifierLabel: string | null }>({
    imageId: card.imageId,
    verifierLabel: card.verifierLabel,
  });
  useEffect(() => {
    setImg({ imageId: card.imageId, verifierLabel: card.verifierLabel });
  }, [card.id, card.imageId, card.verifierLabel]);

  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const jobRef = useRef<string | null>(null);
  useEffect(
    () => () => {
      if (pollRef.current) clearTimeout(pollRef.current);
    },
    [],
  );

  // Every tutor-facing message here is plain English — no server/exception text
  // reaches the UI. The worker's technical detail stays in the logs.
  const GEN_FAILED_MSG =
    "We couldn't create this diagram. Please try again - if it keeps failing, simplify the description.";
  const GEN_SLOW_MSG =
    "The diagram is taking longer than usual. Leave this open, or try Generate again in a moment.";

  const spec = card.image;
  const description = spec?.description ?? "";
  const shows = (spec?.shows ?? []).join("\n");
  const hides = (spec?.hides ?? []).join("\n");
  const hasSpec = !!description.trim();

  function setSpec(next: { description?: string; shows?: string[]; hides?: string[] }) {
    const base = spec ?? { description: "", shows: [] as string[], hides: [] as string[] };
    const merged = { ...base, ...next };
    const empty =
      !merged.description.trim() && merged.shows.length === 0 && merged.hides.length === 0;
    onPatch({ image: empty ? null : merged });
  }
  const toLines = (v: string) => v.split("\n").map((s) => s.trim()).filter(Boolean);

  async function generate(refinementNote?: string) {
    if (!hasSpec || generating) return;
    setErr(null);
    setGenerating(true);
    setShowRegen(false);
    setRefine("");
    try {
      // The worker reads question.image from the DB → persist the spec first.
      await onCommit();
      const { jobId } = await trpc.tutor.generateQuestionImage.mutate({
        questionId: card.id,
        refinementNote: refinementNote?.trim() || undefined,
      });
      jobRef.current = jobId;
      poll(0);
    } catch {
      setGenerating(false);
      setErr(GEN_FAILED_MSG);
    }
  }

  // Poll until a verdict lands (verifierLabel non-null) or the render JOB fails
  // (surfaced fast so the tutor isn't left waiting out the cap on a job that will
  // never write an image row). Give up after ~6 min → a friendly "taking longer".
  function poll(tries: number) {
    if (tries > 120) {
      setGenerating(false);
      setErr(GEN_SLOW_MSG);
      return;
    }
    trpc.tutor.getQuestionImage
      .query({ questionId: card.id })
      .then(async (cur) => {
        if (cur) setImg({ imageId: cur.imageId, verifierLabel: cur.verifierLabel });
        if (cur && cur.verifierLabel) {
          setGenerating(false); // terminal — PASS / FAIL / ERROR
          return;
        }
        // No image yet: check whether the render job has already failed.
        const jobId = jobRef.current;
        if (jobId) {
          const { state } = await trpc.tutor.getImageJobStatus.query({ jobId });
          if (state === "failed") {
            setGenerating(false);
            setErr(GEN_FAILED_MSG);
            return;
          }
        }
        pollRef.current = setTimeout(() => poll(tries + 1), 3000);
      })
      .catch(() => {
        setGenerating(false);
        setErr(GEN_FAILED_MSG);
      });
  }

  function reverify() {
    if (!img.imageId || reverifying) return;
    setReverifying(true);
    setErr(null);
    trpc.tutor.reverifyQuestionImage
      .mutate({ questionId: card.id, imageId: img.imageId })
      .then(() => trpc.tutor.getQuestionImage.query({ questionId: card.id }))
      .then((cur) => {
        if (cur) setImg({ imageId: cur.imageId, verifierLabel: cur.verifierLabel });
      })
      .catch(() => setErr("We couldn't re-check this diagram. Please try again."))
      .finally(() => setReverifying(false));
  }

  if (!open) {
    return (
      <div className="tut-auth-fig">
        <button
          className="tut-auth-fig-add"
          onClick={() => setOpen(true)}
          disabled={disabled}
        >
          + Add a figure
        </button>
      </div>
    );
  }

  return (
    <div className="tut-auth-fig">
      <div className="tut-auth-fig-head">
        <span>Figure</span>
        {img.imageId && <VerifierBadge imageId={img.imageId} label={img.verifierLabel} />}
        {generating && !img.imageId && (
          <span className="tut-auth-fig-gen">Generating… (~1–4 min)</span>
        )}
      </div>

      <div className="tut-auth-fig-spec">
        <label className="tut-auth-fig-field">
          <span>What the diagram shows</span>
          <textarea
            className="tut-auth-ta"
            rows={2}
            value={description}
            placeholder="e.g. a right-angled triangle with sides 3, 4, 5 labelled"
            onChange={(e) => setSpec({ description: e.target.value })}
            onBlur={() => onCommit()}
            disabled={disabled || generating}
          />
        </label>
        <div className="tut-auth-fig-cols">
          <label className="tut-auth-fig-field">
            <span>Must show (one per line)</span>
            <textarea
              className="tut-auth-ta"
              rows={2}
              value={shows}
              onChange={(e) => setSpec({ shows: toLines(e.target.value) })}
              onBlur={() => onCommit()}
              disabled={disabled || generating}
            />
          </label>
          <label className="tut-auth-fig-field">
            <span>Must NOT show (one per line)</span>
            <textarea
              className="tut-auth-ta"
              rows={2}
              value={hides}
              onChange={(e) => setSpec({ hides: toLines(e.target.value) })}
              onBlur={() => onCommit()}
              disabled={disabled || generating}
            />
          </label>
        </div>
      </div>

      {img.imageId && (
        <div className="tut-auth-fig-preview">
          <img
            src={`/content/image/${img.imageId}?board=${BOARD}`}
            alt={description || "Question figure"}
            loading="lazy"
          />
        </div>
      )}

      {err && <p className="tut-error tut-auth-fig-err">{err}</p>}

      <div className="tut-auth-fig-actions">
        {!img.imageId ? (
          <button
            className="tut-auth-fig-btn"
            onClick={() => generate()}
            disabled={disabled || generating || !hasSpec}
            title={hasSpec ? "" : "Describe the figure first"}
          >
            {generating ? "Generating…" : "Generate diagram"}
          </button>
        ) : (
          <>
            <button
              className="tut-auth-fig-link"
              onClick={() => setShowRegen((v) => !v)}
              disabled={disabled || generating}
            >
              {generating ? "Regenerating…" : "Regenerate"}
            </button>
            <button
              className="tut-auth-fig-link"
              onClick={reverify}
              disabled={disabled || reverifying || generating}
            >
              {reverifying ? "Verifying…" : "Re-verify"}
            </button>
          </>
        )}
      </div>

      {showRegen && img.imageId && (
        <div className="tut-auth-fig-regen">
          <textarea
            className="tut-auth-ta"
            rows={2}
            value={refine}
            placeholder="Optional - what to change (e.g. 'thicker lines', 'label the right angle')"
            onChange={(e) => setRefine(e.target.value)}
            disabled={generating}
          />
          <div className="tut-auth-fig-actions">
            <button
              className="tut-auth-fig-btn"
              onClick={() => generate(refine)}
              disabled={generating}
            >
              Regenerate
            </button>
            <button
              className="tut-auth-fig-link"
              onClick={() => {
                setShowRegen(false);
                setRefine("");
              }}
              disabled={generating}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
