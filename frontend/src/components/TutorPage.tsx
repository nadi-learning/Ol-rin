import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { trpc, getBoard, setBoard } from "../trpc";
import { confidenceLabel } from "../lib/confidence";
import {
  RUBRIC,
  RUBRIC_GATES,
  RUBRIC_NULL_NOTE,
  type RubricAxis,
} from "../lib/rubric";
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
// Attempts with no Stage-1 read (skips + abstained answers) — shown as context,
// never mastery evidence (TUT-ASSESS-ROSTER).
type UnassessedAttemptView = Awaited<
  ReturnType<typeof trpc.tutor.getUnassessedAttempts.query>
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
// Slice S2R-4 — the 2b advisory chat + the above-sub-topic stores (S2R-3),
// finally rendered.
type StudentInsightsView = Awaited<
  ReturnType<typeof trpc.tutor.getStudentInsights.query>
>;
// Slice AUTHOR-PREF — walkthrough item 10, re-grained by D-CHAPTER-PREF (S185).
// One row per CHAPTER, carrying its subject + grade so the drill-down draws the
// whole tree from one read; `preference` null means nobody has written one yet,
// which is the normal state for nearly every chapter.
type ChapterPreferenceRow = Awaited<
  ReturnType<typeof trpc.tutor.getChapterPreferences.query>
>[number];
type SessionChatMessage = AssessmentSessionView["messages"][number];
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

// A board this tutor serves — the switchable set. Derived from `whoami`, which
// (session_boards.ts) already yields one entry per board in the tutor's
// `boards[]`. Both fields are non-null for an enabled tutor entry.
type TutorBoard = { slug: string; name: string };

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
  // The boards this tutor serves + the one currently active. null activeBoard =
  // whoami hasn't resolved the board yet, so listStudents must WAIT (a fetch
  // before the header is pinned would read the stale localStorage board).
  const [boards, setBoards] = useState<TutorBoard[] | null>(null);
  const [activeBoard, setActiveBoard] = useState<string | null>(null);

  // Resolve the tutor's switchable boards once, and pin the active board BEFORE
  // any student read fires. The tutor boot path (App.tsx) never sets `x-board`,
  // so `getBoard()` here can be stale (a board they don't serve) or unset — in
  // which case default to their first board, else nothing would load.
  useEffect(() => {
    trpc.session.whoami
      .query()
      .then((who) => {
        const seen = new Set<string>();
        const tb: TutorBoard[] = [];
        for (const m of who.memberships) {
          if (m.role !== "tutor" || !m.enabled || !m.slug || !m.name) continue;
          if (seen.has(m.slug)) continue;
          seen.add(m.slug);
          tb.push({ slug: m.slug, name: m.name });
        }
        setBoards(tb);
        const stored = getBoard();
        const active =
          stored && tb.some((b) => b.slug === stored) ? stored : tb[0]?.slug ?? null;
        if (active) setBoard(active);
        setActiveBoard(active);
      })
      .catch((e) => setError(String(e?.message ?? e)));
  }, []);

  // Student list is keyed on the active board: switching boards re-scopes every
  // tutor read (all board-scoped via RLS), so a re-fetch here is the whole switch.
  useEffect(() => {
    if (!activeBoard) return;
    setStudents(null);
    trpc.tutor.listStudents
      .query()
      .then((r) => setStudents(r))
      .catch((e) => setError(String(e?.message ?? e)));
  }, [activeBoard]);

  function switchBoard(slug: string) {
    if (slug === activeBoard) return;
    setBoard(slug); // the x-board header every tutor read reads per-request
    setSelected(null); // the open student belongs to the old board
    setError(null);
    setActiveBoard(slug); // re-runs the listStudents effect above
  }

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

      {/* Board switcher — only when the tutor serves more than one board. A
          single-board tutor never sees it. Centered row under the header. */}
      {boards && boards.length > 1 && activeBoard && (
        <div className="tut-boardswitch-row">
          <div className="tut-boardswitch" role="tablist" aria-label="Board">
            {boards.map((b) => (
              <button
                key={b.slug}
                role="tab"
                aria-selected={b.slug === activeBoard}
                className={`tut-boardswitch-opt${b.slug === activeBoard ? " is-on" : ""}`}
                onClick={() => switchBoard(b.slug)}
              >
                {b.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {error && <p className="tut-error">{error}</p>}

      {!selected ? (
        <StudentList
          students={students}
          onPick={(s) => {
            // Pin the active board to THIS student before any student-scoped read
            // fires. The global x-board key can have drifted (cross-tab/persona, or
            // a boot that defaulted to the tutor's FIRST board) away from the board
            // the student is actually on — which RLS-hides their chat/drafts and
            // 404s the whole thread. Selecting them makes their board authoritative.
            setBoard(s.board);
            setSelected(s);
          }}
        />
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
  const [insights, setInsights] = useState<StudentInsightsView | null>(null);
  const [nav, setNav] = useState<Nav | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<TutorTab>("assess");
  // Slice ASG-READ: which assignment's read-only work panel is open (null = none).
  const [openWork, setOpenWork] = useState<AssignmentView | null>(null);

  // Keep the active board pinned to THIS student for the whole time their detail
  // (assess / author / etc.) is open — every read here is student-scoped and RLS
  // reads the per-request `x-board`, so a global board that drifts out from under
  // an open student (cross-tab/persona) would 404 their thread. Re-pinning on the
  // student keeps their board authoritative regardless of the shared global key.
  useEffect(() => {
    setBoard(student.board);
  }, [student.board]);

  const reload = useCallback(() => {
    setError(null);
    Promise.all([
      trpc.tutor.listPendingAssessments.query({ studentId: student.studentId }),
      trpc.tutor.getDueQueue.query({ studentId: student.studentId }),
      trpc.tutor.listAssignments.query({ studentId: student.studentId }),
      // S2R-4: synthesis's stores ride the same reload so a finalize (which
      // writes them) refreshes what this screen shows of them.
      trpc.tutor.getStudentInsights.query({ studentId: student.studentId }),
    ])
      .then(([p, d, a, ins]) => {
        setPending(p);
        setDue(d);
        setAssignments(a);
        setInsights(ins);
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
        {/* No badge, deliberately. The only countable thing here is open
            cross-concept flags, and nothing clears them on its own — a count
            would sit there permanently beside two badges that mean "act now". */}
        <TutorTabButton id="notes" tab={tab} onPick={setTab} label="Notes" />
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

      {tab === "notes" && (
        <>
          <StudentInsights insights={insights} />
          <StudentAuthoringPreferences studentId={student.studentId} />
          {/* Machine-written, and the only one of the three carrying an action
              ("Mark handled"). It lives here rather than in Assess because
              handling a flag certifies nothing — it closes a worklist item that
              by design touches no mastery level (schema.ts cross_concept_flag).
              Rendered BARE, no section wrapper: it carries its own head and
              returns null when empty, so a wrapper would strand a heading. */}
          <CrossConceptFlags studentId={student.studentId} />
        </>
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
            <AssignmentList assignments={assignments} onOpen={setOpenWork} />
          </section>
        </>
      )}

      {openWork && (
        <AssignmentWorkPanel
          studentId={student.studentId}
          studentName={student.name}
          assignment={openWork}
          onClose={() => setOpenWork(null)}
        />
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

// Slice NOTES-TAB — "notes" splits OUT of "assess". Assess had accreted four
// unrelated surfaces (insights, the teaching-note drill-down, the cross-concept
// worklist, the sittings); only the last is something the tutor goes there to DO.
// The split is by verb, not by subject: Assess = act on it now, Notes = what is
// written about this student. S185's drill-down landing above "Waiting to assess"
// is what made the pile legible (S184 §3).
type TutorTab = "assess" | "notes" | "assign" | "pace" | "reports" | "author";

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
  // SEVERAL-THREAD: the third thread-locked setting, chosen here beside model and
  // chapter for the same reason those are — it selects the conversational system
  // prompt, and the resume fingerprint is derived from that prompt.
  authorGrain: "one" | "several";
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
  const [authorGrain, setAuthorGrain] = useState<"one" | "several">("one");
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

        {/* SEVERAL-THREAD — the grain, beside model and mode because it locks for
            the thread exactly as they do. Reusing the vendor-toggle markup, no new
            component kind (the founder's standing "don't want to see new UI kinds"
            on this modal). */}
        <div className="tut-launch-field">
          <span className="tut-chat-vendorlabel">Author</span>
          <div className="tut-chat-vendortoggle" role="tablist">
            {(
              [
                ["one", "One"],
                ["several", "Several"],
              ] as const
            ).map(([g, label]) => (
              <button
                key={g}
                role="tab"
                aria-selected={authorGrain === g}
                className={`tut-chat-vendoropt${authorGrain === g ? " is-on" : ""}`}
                onClick={() => setAuthorGrain(g)}
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
            onClick={() => onConfirm({ vendor, mode, chapterIds: picked, authorGrain })}
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
  onOpen,
}: {
  assignments: AssignmentView[] | null;
  onOpen: (a: AssignmentView) => void;
}) {
  if (assignments === null) return <p className="tut-muted">Loading…</p>;
  if (assignments.length === 0)
    return <p className="tut-muted">Nothing assigned yet.</p>;
  return (
    <div className="tut-asg-list">
      {assignments.map((a) => (
        // role=button (not <button>): the card's content is block-level, which
        // a real <button> may not legally contain. Keyboard parity is explicit.
        <div
          key={a.id}
          className="tut-asg-card is-openable"
          role="button"
          tabIndex={0}
          aria-label={`Open assigned work: ${a.subjectName ?? a.chapterName ?? "assignment"}`}
          onClick={() => onOpen(a)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              onOpen(a);
            }
          }}
        >
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

// ── Slice ASG-READ: the read-only assignment work panel ────────────────────
// Full-screen over the tutor page. Strictly inert — this is where the tutor
// READS what the student did; marking still happens in the Assess tab. Every
// number is backend-derived (tutor.getAssignmentWork); nothing here is computed
// from a guess about what the student "probably" saw.

type AssignmentWork = Awaited<
  ReturnType<typeof trpc.tutor.getAssignmentWork.query>
>;
type WorkSubTopic = AssignmentWork["subTopics"][number];
type WorkQuestion = WorkSubTopic["questions"][number];

const WORK_STATE_LABEL: Record<WorkQuestion["state"], string> = {
  answered: "Answered",
  skipped: "Skipped",
  not_reached: "Not reached",
};

function AssignmentWorkPanel({
  studentId,
  studentName,
  assignment,
  onClose,
}: {
  studentId: string;
  studentName: string | null;
  assignment: AssignmentView;
  onClose: () => void;
}) {
  const [work, setWork] = useState<AssignmentWork | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    trpc.tutor.getAssignmentWork
      .query({ studentId, assignmentId: assignment.id })
      .then((w) => alive && setWork(w))
      .catch((e) => alive && setError(e?.message ?? "Could not load this work."));
    return () => {
      alive = false;
    };
  }, [studentId, assignment.id]);

  // Esc closes — matches the authoring fullscreen's exit affordance.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const scope = assignment.subjectName ?? assignment.chapterName ?? "Assignment";

  return (
    <div
      className="tut-work"
      role="dialog"
      aria-modal="true"
      aria-label={studentName ? `${studentName}'s assigned work` : "Assigned work"}
    >
      <header className="tut-work-bar">
        <div className="tut-work-bar-id">
          <span className={`tut-asg-mode tut-asg-mode--${assignment.mode}`}>
            {assignment.mode}
          </span>
          <h3 className="tut-work-title">{scope}</h3>
          <span className="tut-work-sub">
            {studentName ? `${studentName} · ` : ""}read-only
          </span>
        </div>
        <button className="tut-work-close" onClick={onClose} aria-label="Close">
          ✕
        </button>
      </header>

      <div className="tut-work-body">
        {error && <p className="tut-error">{error}</p>}
        {!work && !error && <p className="tut-muted">Loading…</p>}
        {work?.subTopics.map((st) => (
          <WorkSubTopicBlock key={st.subTopicId} st={st} />
        ))}
      </div>
    </div>
  );
}

function WorkSubTopicBlock({ st }: { st: WorkSubTopic }) {
  return (
    <section className="tut-work-st">
      <div className="tut-work-st-head">
        <h4 className="tut-work-st-name">{st.subTopicName}</h4>
        <span className={`tut-work-st-status is-${st.sessionStatus}`}>
          {st.sessionStatus === "not_started"
            ? "Not started"
            : st.sessionStatus === "completed"
              ? "Completed"
              : "In progress"}
        </span>
        {st.total > 0 && (
          <span className="tut-work-st-count">
            {st.answeredCount} answered
            {st.skippedCount > 0 ? ` · ${st.skippedCount} skipped` : ""} · {st.total} set
          </span>
        )}
      </div>
      {/* A never-started sub_topic has NO session, so there is no served set to
          show. We say so rather than substituting the canonical bank — what the
          student WOULD get is not what they DID get. */}
      {st.total === 0 ? (
        <p className="tut-muted tut-work-empty">
          Not started — the student hasn’t opened this yet, so there’s nothing to show.
        </p>
      ) : (
        <ol className="tut-work-qs">
          {st.questions.map((q) => (
            <WorkQuestionRow key={q.questionId} q={q} />
          ))}
        </ol>
      )}
    </section>
  );
}

function WorkQuestionRow({ q }: { q: WorkQuestion }) {
  return (
    <li className={`tut-work-q is-${q.state}`}>
      <div className="tut-work-q-head">
        <span className="tut-work-q-n">{q.ordinal}</span>
        <span className={`tut-work-q-state is-${q.state}`}>
          {WORK_STATE_LABEL[q.state]}
        </span>
        {q.axis && <span className="tut-work-q-axis">{q.axis}</span>}
        {q.marksAwarded != null && q.marksMax != null && (
          <span className="tut-work-q-marks">
            {q.marksAwarded}/{q.marksMax}
          </span>
        )}
        {q.marks.map((m) => (
          <span
            key={m.axis}
            className={`tut-work-q-level is-${m.source}`}
            title={
              m.source === "tutor"
                ? "Tutor-corrected level"
                : "Stage-1 (AI) level"
            }
          >
            {m.axis.slice(0, 1).toUpperCase()}
            {m.level}
            {m.source === "tutor" ? " ✎" : ""}
          </span>
        ))}
      </div>

      <p className="tut-work-q-stem">
        {q.stem ? <MathText text={q.stem} /> : <em>Question no longer available.</em>}
      </p>

      {q.state === "answered" && (
        <div className="tut-work-a">
          {q.answerText ? (
            <p className="tut-work-a-text">
              <MathText text={q.answerText} />
            </p>
          ) : q.answerPhotoIds.length > 0 ? (
            <div className="tut-recall-photos">
              {q.answerPhotoIds.map((id) => (
                <TutorPhotoThumb key={id} imageId={id} />
              ))}
            </div>
          ) : (
            <p className="tut-work-a-text tut-muted">
              Answered with no written text (teach-back or blank).
            </p>
          )}
          <p className="tut-work-a-meta">
            {q.answerConfidence != null && `confidence ${q.answerConfidence}/5`}
            {/* Absence of a Stage-1 read is stated, never shown as a zero. */}
            {q.marks.length === 0 && (
              <span className="tut-work-unassessed"> · not assessed yet</span>
            )}
          </p>
        </div>
      )}

      {q.state === "skipped" && (
        <p className="tut-work-a-text tut-muted">
          Skipped{q.skipReason ? ` — ${q.skipReason}` : ""}.
        </p>
      )}
    </li>
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

/** `language_precision` → `language precision` — the slug is the identity, the
 *  underscores are storage. */
function prettySlug(slug: string): string {
  return slug.replace(/_/g, " ");
}

// Slice S2R-4 — what synthesis knows about this student ABOVE the sub-topic
// (S2R-3's stores, finally rendered): subject/chapter insight text + the
// horizontal-skill levels with their evidence prose. Written only by finalized
// sittings, so absent rows are the normal state for a student who has never
// been through one — render nothing rather than an empty shell.
function StudentInsights({ insights }: { insights: StudentInsightsView | null }) {
  if (!insights) return null;
  if (
    insights.subjects.length === 0 &&
    insights.chapters.length === 0 &&
    insights.horizontals.length === 0
  ) {
    return null;
  }
  return (
    <section className="tut-section">
      <h3 className="tut-section-title">Student insights</h3>
      <div className="tut-insights">
        {insights.subjects.map((s) => (
          <div key={s.subjectId} className="tut-insight-card">
            <div className="tut-insight-head">
              {s.subjectName}
              <span className="tut-insight-kind">whole subject</span>
            </div>
            <p className="tut-insight-text">{s.insight}</p>
          </div>
        ))}
        {insights.chapters.map((c) => (
          <div key={c.chapterId} className="tut-insight-card">
            <div className="tut-insight-head">
              {c.chapterName}
              <span className="tut-insight-kind">chapter · {c.subjectName}</span>
            </div>
            <p className="tut-insight-text">{c.insight}</p>
          </div>
        ))}
        {insights.horizontals.length > 0 && (
          <div className="tut-insight-card">
            <div className="tut-insight-head">
              Cross-cutting skills
              <span className="tut-insight-kind">
                read across sub-topics · 1–5
              </span>
            </div>
            {insights.horizontals.map((h) => (
              <div key={`${h.subjectId}:${h.slug}`} className="tut-hz-row">
                {/* null level = "seen, not yet readable" (D-S2R-9's bound) — a
                    first-class state, never rendered as a low score. */}
                <span className={`tut-hz-level${h.level == null ? " is-unread" : ""}`}>
                  {h.level == null ? "seen" : `L${h.level}`}
                </span>
                <span className="tut-hz-meta">
                  <span className="tut-hz-slug">
                    {prettySlug(h.slug)} · {h.subjectName}
                  </span>
                  <span className="tut-hz-prose">{h.prose}</span>
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

// ─────────── Slice AUTHOR-PREF — walkthrough item 10 ───────────
//
// "How to teach this student", per subject — the tutor's own instruction to the
// question author. Rendered in TWO places from ONE contract: the student's page
// (every subject on the board) and a finalized sitting's done phase (only the
// subject(s) that sitting spans). Both call the same mutation.
//
// Deliberately NOT seeded from the prop on every render. The textarea holds the
// tutor's in-progress typing, so a parent refetch must not overwrite it
// mid-sentence; instead the canonical value is taken from the MUTATION's own
// response after a save (M103: `useState(prop)` binds once at mount, so a
// component that must resync does it explicitly rather than hoping for a remount).
function AuthoringPreferenceCard({
  studentId,
  row,
  onSaved,
}: {
  studentId: string;
  row: ChapterPreferenceRow;
  onSaved: (rows: ChapterPreferenceRow[]) => void;
}) {
  const [text, setText] = useState(row.preference ?? "");
  const [saved, setSaved] = useState(row.preference ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const dirty = text.trim() !== saved.trim();

  function save() {
    setBusy(true);
    setErr(null);
    trpc.tutor.setChapterPreference
      .mutate({ studentId, chapterId: row.chapterId, preference: text })
      .then((rows) => {
        // Resync from the SERVER's answer, not from what was typed: a
        // whitespace-only save clears the row, and the box must then read empty
        // rather than keeping the spaces that deleted it.
        const mine = rows.find((r) => r.chapterId === row.chapterId);
        setText(mine?.preference ?? "");
        setSaved(mine?.preference ?? "");
        onSaved(rows);
      })
      .catch((e) => setErr(String(e?.message ?? e)))
      .finally(() => setBusy(false));
  }

  return (
    <div className="tut-pref-card">
      <div className="tut-pref-head">
        <span className="tut-pref-title">How to teach this student — {row.chapterName}</span>
        <span className="tut-pref-optional">optional</span>
      </div>
      <textarea
        className="tut-pref-text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="e.g. diagram-first questions land better than long worded ones — more of those."
        rows={3}
      />
      <div className="tut-pref-foot">
        <span className="tut-pref-note">
          Tutor-owned · read when authoring anywhere in {row.subjectName}, not just this chapter ·
          never rewritten by the assessment
        </span>
        <button
          type="button"
          className="tut-pref-save"
          onClick={save}
          disabled={busy || !dirty}
        >
          {busy ? "Saving…" : saved && !text.trim() ? "Clear" : "Save"}
        </button>
      </div>
      {err && <p className="tut-error">{err}</p>}
      {row.updatedAt && !dirty && saved && (
        <p className="tut-pref-stamp">
          Last written {new Date(row.updatedAt).toLocaleDateString()}
        </p>
      )}
    </div>
  );
}

/**
 * Write surface 1 — the student's page, as a SUBJECT → CHAPTER drill-down
 * (D-CHAPTER-PREF, S185).
 *
 * Two things this shape fixes, both found by rendering S184's flat version:
 *   · 16 near-identical editors stacked above "Waiting to assess", so the tutor
 *     scrolled past the whole board's subjects to reach the queue they opened
 *     the tab for. Collapsed, this is one row per subject.
 *   · Two cards both read "Chemistry" because the title rendered `subjectName`
 *     alone while `grade` has drifted into four formats — so the GRADE now
 *     renders beside the name. That does NOT fix the underlying data split
 *     (owed separately); it stops the surface lying about it.
 *
 * The note editor is deliberately unreachable until the tutor is INSIDE a
 * chapter — the founder's rule, and why there is no subject-level editor here.
 * Reading is wider than writing: a note written on one chapter reaches authoring
 * across the whole subject (see the service comment).
 *
 * An UNWRITTEN chapter still lists and still opens a writable editor. That is
 * the point of the surface: an editor that only appeared once a note existed
 * could never be used to write the first one.
 */
function StudentAuthoringPreferences({ studentId }: { studentId: string }) {
  const [rows, setRows] = useState<ChapterPreferenceRow[] | null>(null);
  const [openSubject, setOpenSubject] = useState<string | null>(null);
  const [openChapter, setOpenChapter] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    trpc.tutor.getChapterPreferences
      .query({ studentId })
      .then((r) => live && setRows(r))
      .catch(() => live && setRows([]));
    return () => {
      live = false;
    };
  }, [studentId]);

  // One row per subject, chapters nested. The read already returns them ordered
  // (subject name, grade, chapter ordinal), so Map insertion order IS the render
  // order — no second sort, and no second query for the note counts.
  const subjects = useMemo(() => {
    const bySubject = new Map<
      string,
      { subjectId: string; subjectName: string; grade: string; chapters: ChapterPreferenceRow[] }
    >();
    for (const r of rows ?? []) {
      let s = bySubject.get(r.subjectId);
      if (!s) {
        s = { subjectId: r.subjectId, subjectName: r.subjectName, grade: r.grade, chapters: [] };
        bySubject.set(r.subjectId, s);
      }
      s.chapters.push(r);
    }
    return [...bySubject.values()];
  }, [rows]);

  if (!rows || rows.length === 0) return null;
  return (
    <section className="tut-section">
      <h3 className="tut-section-title">How to teach this student</h3>
      <p className="tut-pref-lede">
        Your own note to the question author — what lands, what to avoid. It shapes the
        FORM of what gets authored, not what gets tested. Written on a chapter; read
        when authoring anywhere in that subject.
      </p>
      <div className="tut-drill">
        {subjects.map((s) => {
          const noted = s.chapters.filter((c) => c.preference != null).length;
          const isOpen = openSubject === s.subjectId;
          return (
            <div className="tut-drill-subject" key={s.subjectId}>
              <button
                type="button"
                className="tut-drill-row tut-drill-row--subject"
                aria-expanded={isOpen}
                onClick={() => {
                  setOpenSubject(isOpen ? null : s.subjectId);
                  setOpenChapter(null); // collapsing a subject must not leave its chapter's editor open
                }}
              >
                <span className="tut-drill-caret">{isOpen ? "▾" : "▸"}</span>
                {/* Grade beside the name — Physics-9 and Physics-10 are different
                    subjects, and the name alone draws them as two identical rows. */}
                <span className="tut-drill-name">
                  {s.subjectName} <span className="tut-drill-grade">{s.grade}</span>
                </span>
                <span className="tut-drill-count">
                  {s.chapters.length} chapter{s.chapters.length === 1 ? "" : "s"}
                  {noted > 0 && <span className="tut-drill-noted"> · {noted} noted</span>}
                </span>
              </button>

              {isOpen && (
                <div className="tut-drill-chapters">
                  {s.chapters.map((c) => {
                    const chapOpen = openChapter === c.chapterId;
                    return (
                      <div className="tut-drill-chapter" key={c.chapterId}>
                        <button
                          type="button"
                          className="tut-drill-row tut-drill-row--chapter"
                          aria-expanded={chapOpen}
                          onClick={() => setOpenChapter(chapOpen ? null : c.chapterId)}
                        >
                          <span className="tut-drill-name">{c.chapterName}</span>
                          {/* Without this the list looks identical annotated or
                              blank, and the tutor has to open all 74 to find
                              their own note. */}
                          <span
                            className={
                              c.preference != null
                                ? "tut-drill-dot tut-drill-dot--on"
                                : "tut-drill-dot"
                            }
                          >
                            {c.preference != null ? "● note" : ""}
                          </span>
                        </button>
                        {chapOpen && (
                          <div className="tut-drill-note">
                            {/* Keyed on the chapter: the card seeds its textarea
                                from the prop at MOUNT, so without a changing key
                                React reconciles it in place and the previous
                                chapter's text stays on screen (M103). */}
                            <AuthoringPreferenceCard
                              key={c.chapterId}
                              studentId={studentId}
                              row={c}
                              onSaved={setRows}
                            />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

/**
 * Write surface 2 — a finalized sitting's done phase, narrowed to the chapter(s)
 * that sitting actually spans (a catch-all sitting can cross chapters, so this
 * is a list, not a single card).
 *
 * No drill-down here: a sitting names its chapters, so the tutor is already
 * "inside" them and the editors render directly.
 */
function SessionAuthoringPreferences({
  sessionId,
  studentId,
}: {
  sessionId: string;
  studentId: string;
}) {
  const [rows, setRows] = useState<ChapterPreferenceRow[] | null>(null);
  useEffect(() => {
    let live = true;
    trpc.tutor.getSessionChapterPreferences
      .query({ sessionId })
      .then((r) => live && setRows(r))
      .catch(() => live && setRows([]));
    return () => {
      live = false;
    };
  }, [sessionId]);

  if (!rows || rows.length === 0) return null;
  return (
    <div className="tut-prefs tut-prefs--sitting">
      {rows.map((r) => (
        <AuthoringPreferenceCard
          key={r.chapterId}
          studentId={studentId}
          row={r}
          onSaved={setRows}
        />
      ))}
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
  // NOTES-TAB: the cross-concept worklist used to render above this in BOTH
  // branches. It moved to the Notes tab, so an empty Assess tab is now just this
  // one sentence — which is the honest reading of "nothing waiting to assess".
  if (pending.length === 0)
    return (
      <p className="tut-muted">
        Nothing waiting - no new practice evidence since the last assessment.
      </p>
    );
  return (
    <div className="tut-pending-list">
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
  // REDRAFT-1 (item 5) — which sub-topic is mid-redraft (disables its card), and a
  // per-sub-topic nonce bumped on each redraft. The nonce is in the Stage2Panel's
  // React key: the panel seeds its edit state from `result.draft` at MOUNT and
  // never re-syncs, so swapping the draft in `session` alone would leave the old
  // numbers on screen. Bumping the key remounts JUST that panel with the new draft.
  const [redrafting, setRedrafting] = useState<string | null>(null);
  const [redraftNonce, setRedraftNonce] = useState<Record<string, number>>({});

  function redraft(stId: string, subTopicName: string) {
    if (!session) return;
    // The tutor's edits for THIS sub-topic were made against the OLD draft; a
    // redraft replaces it, so those edits are about to be discarded. Warn only
    // when there is actually something to lose (item 5: warn OR clear — we do
    // both: confirm here, clear on success).
    if (
      edits[stId] &&
      !window.confirm(
        `Re-draft “${subTopicName}” from the current reads?\n\nThis asks the AI for a fresh proposal and will discard your unsaved edits to this sub-topic. Your other sub-topics are untouched.`,
      )
    ) {
      return;
    }
    setError(null);
    setRedrafting(stId);
    // BOARD-PIN — same drift guard as open/finalize (the shared x-board global can
    // move under an open sitting); re-assert this student's board before the write.
    setBoard(student.board);
    trpc.tutor.redraftSubTopic
      .mutate({ sessionId: session.id, subTopicId: stId })
      .then((updated) => {
        setSession(updated);
        // Drop this sub-topic's stale edits, and remount its panel onto the new draft.
        setEdits((prev) => {
          const next = { ...prev };
          delete next[stId];
          return next;
        });
        setRedraftNonce((prev) => ({ ...prev, [stId]: (prev[stId] ?? 0) + 1 }));
      })
      .catch((e) => setError(String(e?.message ?? e)))
      .finally(() => setRedrafting(null));
  }

  function openSitting() {
    setError(null);
    setPhase("drafting");
    // BOARD-PIN — re-assert THIS student's board on the shared global x-board key
    // immediately before the write. The key is a single localStorage value shared
    // across tabs (and mutated by the board switcher / a second tab on another
    // board), so it can drift out from under an open sitting between mount and this
    // click. A drifted x-board RLS-hides the sitting → ASSESSMENT_SESSION_NOT_FOUND.
    // Re-pinning synchronously here guarantees the request carries the right board.
    setBoard(student.board);
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
    // BOARD-PIN (see openSitting) — the shared x-board global can have drifted
    // since the sitting was drafted; re-assert this student's board so finalize
    // (and its getAssessmentSession re-read below) hit the right tenant instead of
    // 404ing with ASSESSMENT_SESSION_NOT_FOUND. This is the exact fault that lost
    // a real finalize (Kian/cbse sitting submitted under a drifted x-board:cambridge).
    setBoard(student.board);
    trpc.tutor.finalizeAssessmentSession
      .mutate({ sessionId: session.id, items: items.length ? items : undefined })
      .then(async () => {
        // S2R-4: the payoff — re-read the sitting for what synthesis wrote
        // (spec §6: the reasoning survives finalize). Best-effort: the commit
        // already happened, so a failed re-read must not read as a failed
        // finalize. onFinalized() is deferred to the Done click so the summary
        // doesn't unmount the moment it appears (reload drops this entry from
        // the pending list).
        const final = await trpc.tutor.getAssessmentSession
          .query({ sessionId: session.id })
          .catch(() => null);
        if (final) setSession(final);
        setPhase("done");
      })
      .catch((e) => {
        setError(String(e?.message ?? e));
        setPhase("review");
      });
  }

  if (phase === "done") {
    const syn = session?.synthesis ?? null;
    return (
      <div className="tut-pending-body">
        <p className="tut-s2-done">
          ✓ Certified {entry.subTopicNames.length} sub-topic
          {entry.subTopicNames.length === 1 ? "" : "s"} in one go.
        </p>
        {syn && (
          <div className="tut-syn">
            <div className="tut-syn-head">Read across the whole sitting</div>
            <p className="tut-syn-reasoning">{syn.reasoning}</p>
            {syn.horizontals.length > 0 && (
              <div className="tut-syn-block">
                {syn.horizontals.map((h) => (
                  <div key={`${h.subjectKey}:${h.slug}`} className="tut-hz-row">
                    <span className={`tut-hz-level${h.level == null ? " is-unread" : ""}`}>
                      {h.level == null ? "seen" : `L${h.level}`}
                    </span>
                    <span className="tut-hz-meta">
                      <span className="tut-hz-slug">{prettySlug(h.slug)}</span>
                      <span className="tut-hz-prose">{h.prose}</span>
                    </span>
                  </div>
                ))}
              </div>
            )}
            {syn.worklistItems.length > 0 && (
              <div className="tut-syn-block">
                <div className="tut-syn-sub">Added to the worklist</div>
                <ul className="tut-syn-list">
                  {syn.worklistItems.map((w, i) => (
                    <li key={i}>{w.note}</li>
                  ))}
                </ul>
              </div>
            )}
            {(syn.chapterInsights.length > 0 || syn.subjectInsights.length > 0) && (
              <p className="tut-syn-note">
                Updated {syn.chapterInsights.length} chapter and{" "}
                {syn.subjectInsights.length} subject insight view
                {syn.chapterInsights.length + syn.subjectInsights.length === 1 ? "" : "s"} —
                shown under “Student insights”.
              </p>
            )}
          </div>
        )}
        {/* Write surface 2 (founder ruling) — the moment the tutor has just read
            the synthesis is the moment "how should we teach them next" is live.
            Narrowed to the subject(s) THIS sitting spans. Optional: skipping it
            and pressing Done is the ordinary path, and nothing here blocks it. */}
        {session && <SessionAuthoringPreferences sessionId={session.id} studentId={session.studentId} />}
        <button className="tut-assess-btn" onClick={onFinalized}>
          Done
        </button>
      </div>
    );
  }

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
              // REDRAFT-1: the nonce remounts this panel onto the fresh draft.
              key={`${stId}:${redraftNonce[stId] ?? 0}`}
              result={d}
              disabled={saving || redrafting === stId}
              redrafting={redrafting === stId}
              onRedraft={() => redraft(stId, d.subTopicName)}
              onEdit={(final) =>
                setEdits((prev) => ({ ...prev, [stId]: final }))
              }
            />
          </div>
        );
      })}
      <SittingChat
        sessionId={session!.id}
        board={student.board}
        initial={session!.messages}
        disabled={saving}
      />
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

// Slice S2R-4 — the Stage-2b ADVISORY chat on an open sitting (D-S2R-10). It
// discusses the proposals and the evidence; it never commits — any change the
// conversation convinces the tutor of happens in the form above, by hand. The
// transcript persists on the sitting and rides into synthesis at finalize
// (D-S2R-11), so context the tutor states here ("he was ill that week") is not
// lost at the one moment the system reasons across the sitting.
function SittingChat({
  sessionId,
  board,
  initial,
  disabled,
}: {
  sessionId: string;
  board: string;
  initial: SessionChatMessage[];
  disabled: boolean;
}) {
  const [messages, setMessages] = useState<SessionChatMessage[]>(initial);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);

  // Follow the newest turn. Text-only bubbles — nothing un-sized in the box
  // (M44), so scrollHeight is trustworthy here.
  useEffect(() => {
    const el = canvasRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, busy]);

  function send() {
    const text = draft.trim();
    if (!text || busy) return;
    setBusy(true);
    setError(null);
    setDraft("");
    setBoard(board); // BOARD-PIN (see openSitting) — this sitting's tenant, defended against a drifted global
    trpc.tutor.sendAssessmentChat
      .mutate({ sessionId, text })
      .then((r) => setMessages(r.messages))
      .catch((e) => {
        setError(String(e?.message ?? e));
        setDraft(text); // don't eat the tutor's words on a failed send
      })
      .finally(() => setBusy(false));
  }

  return (
    <div className="tut-sitchat">
      <div className="tut-sitchat-head">
        Talk it through
        <span className="tut-ccf-sub">
          advisory - any change still happens in the form above
        </span>
      </div>
      <div className="tut-sitchat-canvas" ref={canvasRef}>
        {messages.length === 0 && !busy && (
          <p className="tut-sitchat-hint">
            Ask why a level was proposed, test a doubt against the evidence, or
            add context only you know - it feeds the final synthesis.
          </p>
        )}
        {messages.map((m) => (
          <div
            key={m.id}
            className={`tut-chat-row tut-chat-row--${m.role === "user" ? "tutor" : "ai"}`}
          >
            <div
              className={`tut-chat-bubble tut-chat-bubble--${m.role === "user" ? "tutor" : "ai"}`}
            >
              {m.role === "assistant" ? (
                <ReactMarkdown
                  remarkPlugins={[remarkMath]}
                  rehypePlugins={[rehypeKatex]}
                >
                  {m.text}
                </ReactMarkdown>
              ) : (
                m.text
              )}
            </div>
          </div>
        ))}
        {busy && <p className="tut-chat-typing">thinking…</p>}
      </div>
      {error && <p className="tut-error">{error}</p>}
      <div className="tut-sitchat-inputbar">
        <textarea
          className="tut-sitchat-input"
          rows={2}
          placeholder="Ask about these proposals…"
          value={draft}
          disabled={disabled || busy}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
        />
        <button
          className="tut-assess-btn"
          onClick={send}
          disabled={disabled || busy || !draft.trim()}
        >
          Send
        </button>
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
  redrafting,
  onRedraft,
  onEdit,
}: {
  result: Stage2DraftResult;
  disabled: boolean;
  // REDRAFT-1 (item 5) — the sub-topic is re-drafting (its card is locked).
  redrafting: boolean;
  onRedraft: () => void;
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

      {/* REDRAFT-1 (item 5) — refresh THIS proposal from the current reads. The
          tutor presses it after correcting Stage-1 reads above, so the model
          re-proposes against the effective levels rather than the tutor
          hand-editing the numbers the model would now produce itself. One AI
          call, this sub-topic only. */}
      <div className="tut-s2-redraft">
        <button
          type="button"
          className="tut-s2-redraft-btn"
          onClick={onRedraft}
          disabled={disabled}
        >
          {redrafting ? "Re-drafting…" : "↻ Re-draft from current reads"}
        </button>
        <span className="tut-s2-redraft-hint">
          Re-asks the AI for this sub-topic after you&apos;ve corrected its reads.
        </span>
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
          <RubricNote axis="conceptual" nullSelectable />
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
          <RubricNote axis="procedural" nullSelectable />
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
  const [unassessed, setUnassessed] = useState<UnassessedAttemptView[] | null>(null);
  useEffect(() => {
    trpc.tutor.getObservations
      .query({ studentId, subTopicId })
      .then((r) => setObs(r))
      .catch(() => setObs([]));
    trpc.tutor.getUnassessedAttempts
      .query({ studentId, subTopicId })
      .then((r) => setUnassessed(r))
      .catch(() => setUnassessed([]));
  }, [studentId, subTopicId]);

  if (obs === null) return <p className="tut-muted tut-obs-loading">Loading reads…</p>;
  return (
    <div className="tut-obs-list">
      {obs.length === 0 ? (
        <p className="tut-muted tut-obs-loading">No reads.</p>
      ) : (
        obs.map((o) => (
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
        ))
      )}
      {unassessed && unassessed.length > 0 && (
        <UnassessedAttempts rows={unassessed} />
      )}
    </div>
  );
}

// TUT-ASSESS-ROSTER — the attempts the student made that the Stage-1 scorer never
// turned into a read (a skip, or a bare answer it abstained on). Shown so the
// tutor sees the FULL roster of what happened, clearly marked NOT counted toward
// mastery — never to be mistaken for a scored, certifiable read.
function UnassessedAttempts({ rows }: { rows: UnassessedAttemptView[] }) {
  return (
    <div className="tut-unassessed">
      <p className="tut-unassessed-head">Attempted · not counted toward mastery</p>
      {rows.map((r) => (
        <div key={r.attemptId} className="tut-unassessed-row">
          <span
            className={`tut-tag ${r.status === "skipped" ? "tut-tag-skip" : "tut-tag-unread"}`}
          >
            {r.status === "skipped" ? "Skipped" : "Answered · not assessed"}
          </span>
          {r.marksAwarded != null && r.marksMax != null && (
            <span
              className="tut-marks"
              title="marks the student earned on this answer (what they saw at practice)"
            >
              {r.marksAwarded}/{r.marksMax} marks
            </span>
          )}
          {r.questionStem && (
            <span className="tut-unassessed-stem">{r.questionStem}</span>
          )}
          {r.status === "skipped"
            ? r.skipReason && (
                <span className="tut-unassessed-ans">Reason: {r.skipReason}</span>
              )
            : r.answerText
              ? <span className="tut-unassessed-ans">“{r.answerText}”</span>
              : r.answerPhotoIds.length > 0
                ? (
                  <span className="tut-unassessed-ans">
                    {r.answerPhotoIds.length} photo answer
                    {r.answerPhotoIds.length === 1 ? "" : "s"}
                  </span>
                )
                : null}
          {/* Item 2 on the roster: Stage-1 declined to score these, so the
              student-facing evaluation is the ONLY read of them that exists. */}
          <EvaluationBlock
            ev={r.evaluation}
            marksAwarded={null}
            marksMax={null}
          />
        </div>
      ))}
    </div>
  );
}

// ─────────────── Slice ASSESS-SEE — what the machine saw ───────────────
// Four things were in the system and invisible on this screen: the rubric being
// scored against (8), the evaluation the student read (2), the author's intent
// (7), and the confidence label the student picked (1). The tutor was being asked
// to check the machine's work without being shown the machine's inputs.

// Item 8 — the ladder for ONE axis, next to the control that overrides it.
// Collapsed by default: it must be available at the moment of the decision
// without taking permanent space. `nullSelectable` is passed only where null is
// an actual option (the Stage-2 card) — that is the only place the null≠1 trap
// can be sprung, and elsewhere the warning would be noise.
function RubricNote({
  axis,
  nullSelectable = false,
}: {
  axis: RubricAxis;
  nullSelectable?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="tut-rubric">
      <button
        type="button"
        className="tut-rubric-toggle"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        {open ? "▾" : "▸"} What the {axis} levels mean
      </button>
      {open && (
        <div className="tut-rubric-body">
          {nullSelectable && (
            <p className="tut-rubric-warn">{RUBRIC_NULL_NOTE}</p>
          )}
          <ol className="tut-rubric-rungs">
            {RUBRIC[axis].map((r) => (
              <li key={r.level} className="tut-rubric-rung">
                <span className="tut-rubric-num">{r.level}</span>
                <span>
                  <strong className="tut-rubric-title">{r.title}</strong> —{" "}
                  {r.body}
                  {r.aside && (
                    <em className="tut-rubric-aside"> {r.aside}</em>
                  )}
                </span>
              </li>
            ))}
          </ol>
          <ul className="tut-rubric-gates">
            {RUBRIC_GATES[axis].map((g, i) => (
              <li key={i}>{g}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// Item 7 — the author's stated intent for the question. Already on the payload
// (`getObservations` selects `pedagogical_comment`, copied onto the observation
// at scoring time); the client simply dropped it. Same collapsed-expander shape
// as the Assign tab's "Why this question".
function PedagogyWhy({ note }: { note: string | null }) {
  const [open, setOpen] = useState(false);
  if (!note) return null;
  return (
    <div className="tut-obs-why">
      <button
        type="button"
        className="tut-obs-why-toggle"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        {open ? "▾" : "▸"} Why this question was asked
      </button>
      {open && <p className="tut-obs-why-text">{note}</p>}
    </div>
  );
}

// Item 2 — the evaluation the STUDENT read, shown to the tutor unchanged.
//
// The axis reasoning answers "what does this say about mastery". This answers
// "what did they actually get wrong" — and it was the only account of that in
// the system the tutor could not see. Expanded by default (unlike the rubric and
// the intent): it is evidence about THIS answer, not reference material, and the
// tutor is here to weigh exactly this.
//
// Renders nothing when absent, which is the common case on migrated sittings —
// the old-b2c backfill imported answers without the student-facing read.
function EvaluationBlock({
  ev,
  marksAwarded,
  marksMax,
}: {
  ev: {
    verdict: string;
    feedback: string;
    strengths: string[];
    improvements: string[];
  } | null;
  marksAwarded: number | null;
  marksMax: number | null;
}) {
  if (!ev) return null;
  return (
    <div className="tut-recall-block tut-eval">
      <p className="tut-recall-label">
        What the student was shown
        {marksAwarded != null && marksMax != null && (
          <span className="tut-eval-marks">
            {" "}
            · {marksAwarded}/{marksMax} marks
          </span>
        )}
        {ev.verdict && (
          <span className={`tut-eval-verdict tut-eval-verdict--${ev.verdict}`}>
            {ev.verdict.replace("_", " ")}
          </span>
        )}
      </p>
      <p className="tut-eval-prose">
        <MathText text={ev.feedback} />
      </p>
      {ev.improvements.length > 0 && (
        <div className="tut-eval-list tut-eval-list--gap">
          <p className="tut-eval-list-head">Where it fell short</p>
          <ul>
            {ev.improvements.map((s, i) => (
              <li key={i}>
                <MathText text={s} />
              </li>
            ))}
          </ul>
        </div>
      )}
      {ev.strengths.length > 0 && (
        <div className="tut-eval-list">
          <p className="tut-eval-list-head">What worked</p>
          <ul>
            {ev.strengths.map((s, i) => (
              <li key={i}>
                <MathText text={s} />
              </li>
            ))}
          </ul>
        </div>
      )}
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
    !!o.answerText ||
    o.answerPhotoIds.length > 0 ||
    o.answerConfidence != null ||
    !!o.evaluation;
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
                  ·{" "}
                  {/* Item 1 — the label they picked, then the number. Both, always:
                      the label is what the student saw, the number is what the
                      calibration flag was computed from, and migrated attempts
                      have no label at all (confidenceLabel → null). */}
                  {confidenceLabel(o.answerConfidence) && (
                    <span className="tut-recall-conf-label">
                      {confidenceLabel(o.answerConfidence)}
                    </span>
                  )}{" "}
                  confidence {o.answerConfidence}/5
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
          <EvaluationBlock
            ev={o.evaluation}
            marksAwarded={o.marksAwarded}
            marksMax={o.marksMax}
          />
        </div>
      )}
    </div>
  );
}

// A minimized answer-photo thumbnail (tutor-scoped byte route) that expands to a
// full-screen lightbox on click — mirrors the student-side PhotoThumb.
function TutorPhotoThumb({ imageId }: { imageId: string }) {
  const [open, setOpen] = useState(false);
  // Slice ROTATE-1 (view-only): students photograph exercise books sideways, so
  // the tutor otherwise reads a 90°-turned page. Deliberately NOT persisted —
  // this is a viewing aid, it does not alter the stored image. It also does NOT
  // change what the model read: Stage-1 (assessment.ts) and the student-facing
  // feedback (answer_feedback.ts) already read these bytes at their original
  // orientation, so straightening here helps the human, not the machine.
  //
  // Kept on the component rather than reset on close, so re-opening the same
  // photo during one sitting doesn't make the tutor re-straighten it.
  const [deg, setDeg] = useState(0);
  const src = `/practice/tutor-answer-photo/${imageId}?board=${getBoard() ?? ""}`;
  const turn = (by: number) => setDeg((d) => (d + by + 360) % 360);
  const quarter = deg === 90 || deg === 270;
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
          <img
            src={src}
            alt="Student's uploaded answer"
            // A quarter turn swaps the image's effective width and height, but
            // the transform does NOT change its layout box — so the vw/vh caps
            // must swap too or a rotated portrait page overflows the viewport.
            className={quarter ? "is-quarter" : undefined}
            style={{ transform: `rotate(${deg}deg)` }}
          />
          {/* Every click in here must stopPropagation: the backdrop closes the
              lightbox, so an un-stopped rotate click would rotate and instantly
              close. */}
          <div
            className="tut-recall-lightbox-tools"
            onClick={(e) => e.stopPropagation()}
          >
            <button onClick={() => turn(-90)} title="Rotate left" aria-label="Rotate left">
              ↺
            </button>
            <button onClick={() => turn(90)} title="Rotate right" aria-label="Rotate right">
              ↻
            </button>
            {deg !== 0 && (
              <button onClick={() => setDeg(0)} className="tut-recall-reset" title="Reset rotation">
                Reset
              </button>
            )}
          </div>
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
        {o.marksAwarded != null && o.marksMax != null && (
          <span
            className="tut-marks"
            title="marks the student earned on this answer (what they saw at practice)"
          >
            {o.marksAwarded}/{o.marksMax} marks
          </span>
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

      <PedagogyWhy note={o.pedagogicalComment} />

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
          {/* Item 8 — the ladder for THIS observation's axis, at the control that
              overrides it. No null option here (an override always names a
              level), so the null≠1 warning is not shown. */}
          <RubricNote axis={o.axis as RubricAxis} />
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
// Slice AUTHOR-ASYNC: authorFromChat now returns { jobId } (the draft is authored
// off the request path); the review-form payload is the completed job's `result`.
type AuthorJobStatus = Awaited<ReturnType<typeof trpc.tutor.getAuthoringJobStatus.query>>;
// Slice TWOWAY-1: the completed job's `result` is a UNION over the phase — a plan to
// gate, or drafts to review. Narrowing on `phase` (rather than widening the type) is
// what makes handing a plan to the review form a compile error.
type AuthorJobResult = Extract<AuthorJobStatus, { state: "completed" }>["result"];
type AuthorDraft = Extract<AuthorJobResult, { phase: "draft" }>;
type AuthorPlan = Extract<AuthorJobResult, { phase: "plan" }>;
// Slice SET-ASYNC: the parallel fan-out is a JOB now, so its {groups, failures} is
// the third member of the same union — no longer the mutation's return value.
type AuthorSet = Extract<AuthorJobResult, { phase: "set" }>;
type AuthorDraftItem = AuthorDraft["drafts"][number];
// The plan awaiting a gate, as carried on getChat (the resume-proof source) — the
// same shape the plan card renders from however it arrived.
type PendingPlan = NonNullable<ChatView["pendingPlan"]>;
type PlanItem = PendingPlan["plan"]["items"][number];
type ProposeResult = Awaited<
  ReturnType<typeof trpc.tutor.proposeAuthoringTarget.mutate>
>;
// QA3-e-2: the interleaved set proposal + the fan-out result.
type ProposeSetResult = Awaited<
  ReturnType<typeof trpc.tutor.proposeAuthoringSet.mutate>
>;
// Slice SET-ASYNC: authorSetFromChat now returns { jobId } — the fan-out's payload
// arrives via the job poll, so this alias is sourced from the job union (AuthorSet),
// not from the mutation. Left as a name because the failures list is rendered from
// it in several places.
type AuthorSetResult = AuthorSet;
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
  // Author's intent + self-rubric — shown read-only above the question so the
  // tutor can recall WHY this question exists (founder call 2026-07-18).
  pedagogicalNote: string | null;
  image: ImageSpec | null;
  imageId: string | null;
  verifierLabel: string | null;
  verifierModel: string | null; // "tutor_override" → "✓ Verified (tutor)" badge
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
  pedagogicalNote: d.pedagogicalNote ?? null,
  image: d.image,
  imageId: d.imageId,
  verifierLabel: d.verifierLabel,
  verifierModel: d.verifierModel ?? null,
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
//
// 🔴 CHAT-SCOPE (S151) — THE KEY IS NOW SCOPED BY CHAPTER on the drill-in path.
// It used to be student-only, so a student had exactly ONE remembered chat no
// matter which chapter the tutor opened. Drilling into Circles for a student whose
// last chat was Atoms re-opened THE ATOMS CHAT: the rehydrate effect below runs
// before the start gate and `initialChapterId` only ever seeded the gate's
// dropdown, so a chapter the tutor had never authored for still resumed some other
// chapter's conversation instead of starting fresh.
//
// Chapter-scoped keys give the expected behaviour in both directions: a first
// visit to Circles finds no handle → fresh start gate; returning to Atoms still
// resumes the Atoms chat. The unscoped key is retained for the scopes that have no
// single chapter — the QA3-d launcher (which may be interleaved across many) and
// a history-picker resume.
const CHAT_STORE_KEY = (studentId: string, chapterId?: string) =>
  chapterId
    ? `b2c.authchat.${studentId}.${chapterId}`
    : `b2c.authchat.${studentId}`;

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
  // CHAT-SCOPE — the remembered-chat key for THIS mount. Chapter-scoped on the
  // drill-in path (`initialChapterId`), unscoped for the launcher / history resume,
  // which have no single chapter. Every read, write and clear in this component
  // goes through it so the two paths can never key differently by accident.
  const storeKey = CHAT_STORE_KEY(student.studentId, initialChapterId);

  // BOARD-PIN (S151) — re-assert THIS student's board immediately before every
  // authoring call. `x-board` is read per-request from storage (trpc.ts), and it
  // can drift out from under an open chat WITHIN a tab: the tutor board switcher
  // writes it, and so does selecting a different student. A drifted board makes the
  // chat row RLS-invisible and the call fails AUTHORING_CHAT_NOT_FOUND on a chat
  // that plainly exists. BOARD-TAB (trpc.ts) killed the cross-TAB half of this
  // fault; this closes the within-tab half. Same defence the assessment sitting
  // already carries (openSitting / finalize).
  //
  // It also makes the errors trustworthy: with the board pinned first, a NOT_FOUND
  // now genuinely means gone, which is what the rehydrate handler below relies on
  // before it drops a stored handle.
  const pinBoard = () => setBoard(student.board);

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
  const [proposingSet, setProposingSet] = useState(false);
  const [authoringSet, setAuthoringSet] = useState(false);
  const [setFailures, setSetFailures] = useState<
    AuthorSetResult["failures"] | null
  >(null);
  // Slice SET-ASYNC: the fan-out is a background job, so its loader is durable in the
  // same shape as the draft/plan loaders — jobId + timer as REFS (survive re-render),
  // and it resumes across a refresh via getActiveAuthoringJob. `authoringSet` stays
  // the rendered flag; the refs are what make it survive.
  const setJobRef = useRef<string | null>(null);
  const setPollRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (setPollRef.current) clearTimeout(setPollRef.current);
    },
    [],
  );
  const SET_FAILED_MSG =
    "We couldn't author this set. Please try again — if it keeps failing, ask for fewer sub-topics at a time.";
  const SET_SLOW_MSG =
    "Authoring the set is taking longer than usual. Leave this open — the questions will appear here when they're ready.";

  // COVERAGE-1: does this chat author ONE sub-topic at a time, or SEVERAL in
  // parallel? A toggle, not conversational intent-detection (founder, 2026-07-29:
  // "lets not make it complicate in chat give a toggle option") — the tutor says
  // what they want with a control, not by phrasing.
  //
  // ⚠️ SEVERAL-THREAD REVERSES COVERAGE-1's "not a property of the chat".
  //
  // It was a per-sitting toggle, re-derived from `mode` on every open. That is what
  // made it invisible to the model: the conversational system prompt is fixed when
  // the thread is created, so a per-turn toggle could never be in it — and the model,
  // told only about a single `subTopicNumber`, confidently told a tutor with Several
  // selected that the system "can only handle one sub-topic per batch" while the
  // routing stood ready to fan out. The prompt cannot be made per-turn either: the
  // resume fingerprint is sha256(systemPrompt + slot).
  //
  // So the grain is now a property OF THE CHAT (`author_grain`), read here rather
  // than held in local state, and flipping it starts a new thread — the same
  // contract vendor and chapter have always had.
  const chatGrain: "one" | "several" = chat?.authorGrain === "several" ? "several" : "one";
  const setModeOn = chatGrain === "several";
  // Which grain the tutor asked to switch TO, awaiting their confirm (null = none).
  const [grainConfirm, setGrainConfirm] = useState<"one" | "several" | null>(null);

  // COMPOSER-1: the actions + the plan-first preference now live in a menu rather
  // than side by side in the bar (founder, 2026-07-29) — four controls in one row
  // had stopped being readable once COVERAGE-1 added the fourth.
  const [optsOpen, setOptsOpen] = useState(false);
  const optsRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!optsOpen) return;
    function onDoc(e: MouseEvent) {
      if (optsRef.current && !optsRef.current.contains(e.target as Node)) setOptsOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOptsOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [optsOpen]);

  // COMPOSER-1: the input grows with the message up to FOUR lines, then holds that
  // height and scrolls inside itself. Measured from the element's own computed
  // line-height rather than a hardcoded row height, so it stays correct if the
  // type scale changes; `height:auto` first, or scrollHeight reports the CURRENT
  // height and the box can only ever grow.
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    const cs = getComputedStyle(el);
    // `line-height: normal` parses to NaN — the CSS sets an explicit one, and this
    // falls back rather than collapsing the box to zero if that ever changes.
    const lineHeight = parseFloat(cs.lineHeight) || 20;
    const chrome =
      parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom) +
      parseFloat(cs.borderTopWidth) + parseFloat(cs.borderBottomWidth);
    const max = lineHeight * 4 + chrome;
    el.style.height = `${Math.min(el.scrollHeight, max)}px`;
    el.style.overflowY = el.scrollHeight > max ? "auto" : "hidden";
  }, [input]);

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
  // REVISE-ASYNC: a revise is a background job now, so its loader is durable. The
  // jobId + poll timer are refs (survive re-renders); the loader is resumed across
  // a page refresh by scanning for a live revise job in restoreDrafts.
  const reviseJobRef = useRef<string | null>(null);
  const revisePollRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (revisePollRef.current) clearTimeout(revisePollRef.current);
    },
    [],
  );
  const REVISE_FAILED_MSG =
    "We couldn't revise this question. Please try again — if it keeps failing, simplify the instruction.";
  const REVISE_SLOW_MSG =
    "This revision is taking longer than usual. Leave this open — it'll appear here when it's done.";
  // AUTHOR-ASYNC: drafting the questions is a background job now (the worker used to
  // hang the request up to 524s). Its "Drafting…" loader is durable — the jobId +
  // poll timer are refs (survive re-renders), and the loader resumes across a page
  // refresh by scanning for a live authoring job for this chat (resumeDrafting).
  const [drafting, setDrafting] = useState(false);
  const draftJobRef = useRef<string | null>(null);
  const draftPollRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (draftPollRef.current) clearTimeout(draftPollRef.current);
    },
    [],
  );
  const DRAFT_FAILED_MSG =
    "We couldn't draft these questions. Please try again — if it keeps failing, ask for fewer at a time.";
  const DRAFT_SLOW_MSG =
    "Drafting is taking longer than usual. Leave this open — the questions will appear here when they're ready.";

  // TWOWAY-1: the PLAN phase. A go-ahead now asks the worker what it intends to
  // write; that plan lands here as a gate the tutor approves or amends, and nothing
  // is drafted until they do.
  //
  // `planFirst` is the tutor's per-chat preference and defaults ON — the gate is the
  // behaviour unless they deliberately skip it. Component state, so a refresh
  // returns to the safe default rather than silently remembering a skip.
  const [planFirst, setPlanFirst] = useState(true);
  // The plan awaiting the gate. Sourced from getChat's `pendingPlan` on every resume
  // path AND from a completed plan poll — one piece of state, so the card can't
  // differ between "just planned" and "came back to it".
  const [plan, setPlan] = useState<PendingPlan | null>(null);
  const [planning, setPlanning] = useState(false);
  const [gating, setGating] = useState(false); // an approve/amend/dismiss in flight
  const [amending, setAmending] = useState(false); // the amendment box is open
  const [amendNote, setAmendNote] = useState("");
  const planJobRef = useRef<string | null>(null);
  const planPollRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (planPollRef.current) clearTimeout(planPollRef.current);
    },
    [],
  );
  const PLAN_FAILED_MSG =
    "We couldn't work out a plan for this. Please try again, or skip the plan and draft directly.";
  const PLAN_SLOW_MSG =
    "This is taking longer than usual. Leave this open — the plan will appear here when it's ready.";
  // The authored-question preview is a left pane shown side-by-side with the chat
  // once drafts exist; the tutor can collapse it back to full-width chat without
  // discarding the drafts (re-open via the topbar chip) — D-AUTHUI-1.
  const [previewMinimized, setPreviewMinimized] = useState(false);
  // AUTHUI-FS: maximize the whole authoring workspace (context strip + preview +
  // chat) into a viewport overlay, hiding the student header / tabs / board switcher
  // so the tutor can focus on drafting. Distinct from previewMinimized (which just
  // collapses the left pane to widen the chat). Esc exits; reset on chat switch.
  const [fullscreen, setFullscreen] = useState(false);
  // ASG-AUTO: on approve, also push the questions to the student as an assignment
  // (find-and-extend, split per chapter/subject). Default ON — the founder's call.
  const [assignOnApprove, setAssignOnApprove] = useState(true);
  // Slice MIXED, item 13 — false = merge this batch's sub_topics into ONE mixed
  // assignment (today's behaviour, and the founder-chosen default); true = one
  // assignment per sub_topic. Only offered for a BLOCKED batch spanning >1
  // sub_topic; interleaved always stays mixed.
  const [assignSeparate, setAssignSeparate] = useState(false);
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
    setProposingSet(false);
    setSetFailures(null);
    setTarget(null);
    setCards(null);
    setPreviewMinimized(false);
    setRevisingIdx(null);
    // Stop any in-flight revise poll from a prior student/chat (the job keeps
    // running server-side; this session just stops tracking it).
    if (revisePollRef.current) clearTimeout(revisePollRef.current);
    revisePollRef.current = null;
    reviseJobRef.current = null;
    // Same for an in-flight authoring (drafting) poll.
    setDrafting(false);
    if (draftPollRef.current) clearTimeout(draftPollRef.current);
    draftPollRef.current = null;
    draftJobRef.current = null;
    // TWOWAY-1: and the plan phase. `planFirst` is deliberately NOT reset — it is
    // the tutor's preference for this sitting, not per-chat state.
    setPlan(null);
    setPlanning(false);
    setGating(false);
    setAmending(false);
    setAmendNote("");
    if (planPollRef.current) clearTimeout(planPollRef.current);
    planPollRef.current = null;
    planJobRef.current = null;
    // SET-ASYNC: and the fan-out poll. Same semantics as the two above — the JOB
    // keeps running server-side, this session just stops tracking it; re-opening the
    // chat re-attaches via getActiveAuthoringJob.
    setAuthoringSet(false);
    if (setPollRef.current) clearTimeout(setPollRef.current);
    setPollRef.current = null;
    setJobRef.current = null;
    setSetFailures(null);
    setSaved(null);
    setError(null);
    setInput("");
  }

  // AUTHUI-FS: Esc exits the maximized workspace (the overlay is scoped to this
  // component, so leaving the Author tab unmounts it — this only guards the
  // in-tab "stuck fullscreen" case). Bound only while maximized.
  useEffect(() => {
    if (!fullscreen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFullscreen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fullscreen]);

  // Re-hydrate the review form from a RESUMED chat's still-unapproved drafts.
  // getChat now returns them (pendingDrafts), so every resume entry point — the
  // landing history picker AND a plain remount — restores identically; no path
  // can silently drop a mid-review form. No-op when there's nothing pending.
  function restoreDrafts(c: ChatView) {
    // TWOWAY-1: restore an open GATE first. It is carried on the chat payload (not
    // derived from the transcript's relay turn), so every resume path — refresh,
    // history picker, remount — restores the same card, and a gate that was already
    // answered cannot re-open.
    setPlan(c.pendingPlan ?? null);

    // AUTHOR-ASYNC: resume the loader if authoring work is still running for this
    // chat (durable across a refresh / close-reopen). The output doesn't exist yet,
    // so this scan runs BEFORE the pendingDrafts short-circuit below. One authoring
    // job runs at a time per chat.
    //
    // TWOWAY-1: the handle carries the PHASE, so a plan in flight resumes as
    // "Planning…" and its poll expects a plan. Guessing here would restore the wrong
    // loader and then feed the review form a payload it can't open.
    //
    // SET-ASYNC: 'set' is the third phase. It is ONE job per chat like the others —
    // the fan-out happens inside it — so this scan still finds exactly one handle and
    // needs no N-way change. That is precisely why the fan-out was NOT split into N
    // queued jobs: activeJobIdForChat matches the FIRST job for the chat, so N of
    // them would resume an arbitrary member's loader.
    if (!draftJobRef.current && !planJobRef.current && !setJobRef.current) {
      void (async () => {
        pinBoard(); // BOARD-PIN
        const live = await trpc.tutor.getActiveAuthoringJob
          .query({ chatId: c.chatId })
          .catch(() => null);
        if (!live) return;
        if (live.phase === "plan") {
          if (!planJobRef.current) startPlanningPoll(live.jobId);
        } else if (live.phase === "set") {
          if (!setJobRef.current) startSetPoll(live.jobId);
        } else if (!draftJobRef.current) {
          startDraftingPoll(live.jobId);
        }
      })();
    }

    const drafts = c.pendingDrafts ?? [];
    // No pending drafts for THIS chat → CLEAR the review form rather than
    // early-returning. Early-return left a prior render's cards/target on screen,
    // so a chat with nothing to review could still show another chat's form (the
    // review-form render guards on `cards && target`). Idempotent — the plan +
    // job-loader restores above already ran; this only clears the review triple.
    if (drafts.length === 0) {
      setCards(null);
      setTarget(null);
      setPreviewMinimized(false);
      return;
    }
    setCards(drafts.map((d) => toCard(d, d.subTopicId, d.subTopicName)));
    setPreviewMinimized(false);
    const first = drafts[0]!;
    setTarget({
      subTopicId: first.subTopicId,
      subTopicName: first.subTopicName,
      nextOrdinal: first.ordinal,
    });
    // REVISE-ASYNC: re-attach the "Revising…" loader if a revise is still running
    // for one of these drafts (durable across a page refresh / close-reopen). Only
    // one revise runs at a time (the UI blocks others), so resume the first live one.
    if (reviseJobRef.current) return;
    void (async () => {
      for (let i = 0; i < drafts.length; i++) {
        pinBoard(); // BOARD-PIN
        const { jobId } = await trpc.tutor.getActiveReviseJob
          .query({ questionId: drafts[i]!.id })
          .catch(() => ({ jobId: null as string | null }));
        if (jobId) {
          reviseJobRef.current = jobId;
          setRevisingIdx(i);
          pollRevise(i, jobId, 0);
          return;
        }
      }
    })();
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
        authorGrain: launch.authorGrain,
      });
      return;
    }
    // Resume-from-landing: load the chosen chat directly, ignoring any stored handle.
    if (resumeChatId) {
      setRehydrating(true);
      let alive = true;
      pinBoard(); // BOARD-PIN
      trpc.tutor.getAuthoringChat
        .query({ chatId: resumeChatId })
        .then((c) => {
          if (!alive) return;
          setChat(c);
          restoreDrafts(c);
          localStorage.setItem(storeKey, c.chatId);
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
    const saved = localStorage.getItem(storeKey);
    if (!saved) {
      setRehydrating(false);
      return;
    }
    let live = true;
    pinBoard(); // BOARD-PIN — before the read, so a NOT_FOUND below is trustworthy
    trpc.tutor.getAuthoringChat
      .query({ chatId: saved })
      .then((c) => {
        if (!live) return;
        // CHAT-SCOPE guard — belt-and-braces over the chapter-scoped key. A handle
        // must only resume a chat whose scope IS the chapter the tutor drilled
        // into; anything else (a legacy unscoped handle written before this fix, a
        // chat since re-scoped) falls through to the start gate and a fresh chat
        // rather than silently opening another chapter's conversation.
        if (initialChapterId) {
          const scope = c.chapterIds ?? [];
          const matches = scope.length === 1 && scope[0] === initialChapterId;
          if (!matches) {
            // Do NOT clear the handle: that other chat is still someone's active
            // chat under its own key. Just decline to resume it here.
            return;
          }
        }
        setChat(c);
        // Restore any un-approved drafts so a refresh mid-review doesn't lose them
        // (now carried on the chat payload — same path as the landing resume).
        restoreDrafts(c);
      })
      .catch(() => {
        // Chat genuinely gone (deleted / never existed) → drop the stale handle,
        // show the gate. Safe to conclude "gone" because pinBoard() above ruled out
        // the board-drift NOT_FOUND that used to reach here and destroy a live
        // chat's handle (S148/S151 board fault).
        localStorage.removeItem(storeKey);
      })
      .finally(() => {
        if (live) setRehydrating(false);
      });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [student.studentId, launch, resumeChatId, initialChapterId]);

  // Keep the newest turn in view: on resume/load, after every turn, and while the
  // AI is thinking or a consent card appears (Eyeball feedback #3a / D-AUTHUI-2).
  // The canvas scrolls internally and the input bar is a sibling below it, so
  // driving scrollTop to the bottom leaves the newest bubble fully visible.
  // (Drafts now live in the left preview pane, so they no longer affect this.)
  useEffect(() => {
    const el = canvasRef.current;
    if (el) el.scrollTop = el.scrollHeight;
    // TWOWAY-1: the plan gate card + its loader are new things that appear at the
    // bottom of the canvas, so they belong in the deps — a card that arrives below
    // the fold is a card the tutor doesn't know to answer.
  }, [
    chat?.chatId,
    chat?.messages.length,
    sending,
    proposal,
    proposalSet,
    authTab,
    plan,
    planning,
  ]);

  // The one start path — used by the internal gate (blocked, one chapter) and the
  // QA3-d launch auto-start (blocked or interleaved, one or many chapters).
  function doStart(params: {
    vendor: VendorChoice;
    mode?: "blocked" | "interleaved";
    chapterId?: string;
    chapterIds?: string[];
    authorGrain?: "one" | "several";
    carryFromChatId?: string;
  }) {
    setError(null);
    setStarting(true);
    pinBoard(); // BOARD-PIN
    trpc.tutor.startAuthoringChat
      .mutate({ studentId: student.studentId, ...params })
      .then((c) => {
        setChat(c);
        localStorage.setItem(storeKey, c.chatId);
      })
      .catch((e) => setError(String(e?.message ?? e)))
      .finally(() => setStarting(false));
  }

  function startChat() {
    if (!startChapterId) return;
    doStart({ vendor, mode: "blocked", chapterId: startChapterId });
  }

  // ── SEVERAL-THREAD — flipping the grain starts a NEW thread ──────────────
  //
  // The grain picks the conversational system prompt, and the resume fingerprint
  // is sha256(systemPrompt + slot) — so a thread cannot change grain in place
  // without refusing `--resume` on the very next turn. Rather than eat that, the
  // grain joins vendor and chapter as thread-locked, and flipping it does what
  // switching model already does: starts a new chat.
  //
  // The transcript carries over so the tutor doesn't lose the conversation that
  // led them to want several in the first place — but the SERVER copies it from
  // the source chat (the client sends only an id), and it strips the vendor
  // session identity, so the new thread stitches its history as text under the
  // new grain's prompt instead of resuming a session built under the old one.
  function applyGrainSwitch(next: "one" | "several") {
    setGrainConfirm(null);
    if (!chat) return;
    const carryFromChatId = chat.chatId;
    localStorage.removeItem(storeKey);
    resetAll();
    doStart({
      // Everything else about the thread is preserved — only the grain moves.
      vendor: chat.vendor,
      mode: chat.mode,
      chapterIds: chat.chapterIds,
      authorGrain: next,
      carryFromChatId,
    });
  }

  // New chat = the ONLY way to switch model/chapter (vendor is thread-locked;
  // D-AUTH2-1). Clears the stored handle. In launch mode it re-starts a fresh chat
  // with the SAME launched scope; otherwise it returns to the internal start gate.
  function newChat() {
    localStorage.removeItem(storeKey);
    resetAll();
    if (launch) {
      doStart({
        vendor: launch.vendor,
        mode: launch.mode,
        chapterIds: launch.chapterIds,
        // SEVERAL-THREAD: New chat re-starts the LAUNCHED scope, so the grain
        // chosen at the launcher rides along with model and chapters.
        authorGrain: launch.authorGrain,
      });
    } else {
      setStartChapterId("");
    }
  }

  // Resume a past chat from the history picker (Eyeball-#2 item #3).
  function resumeChat(chatId: string) {
    setError(null);
    pinBoard(); // BOARD-PIN
    trpc.tutor.getAuthoringChat
      .query({ chatId })
      .then((c) => {
        resetAll();
        setChat(c);
        // Restore any un-approved drafts so opening a mid-review chat from the
        // history picker doesn't drop the preview — parity with the landing +
        // localStorage resume paths (the missing call that lost the form).
        restoreDrafts(c);
        localStorage.setItem(storeKey, c.chatId);
        setAuthTab("chat");
      })
      .catch((e) => setError(String(e?.message ?? e)));
  }

  function send() {
    const text = input.trim();
    // Block a new turn while authoring work is in flight — one job at a time (the
    // durable loaders each track a single job). TWOWAY-1 adds the plan phase, and
    // also blocks while a gate is OPEN: a go-ahead typed under an unanswered plan
    // card would start a second episode for the same target.
    if (!chat || !text || sending || drafting || planning || plan) return;
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
    pinBoard(); // BOARD-PIN — this is the call the founder saw fail as "thread not found"
    trpc.tutor.sendAuthoringChatTurn
      // SEVERAL-THREAD: `setMode` is no longer sent. The grain is a property of the
      // thread now (`author_grain`), so the server reads it off the row — which is
      // what guarantees the routing and the system prompt agree. The server still
      // ACCEPTS the old field and ignores it, for bundles older than this one.
      .mutate({ chatId: chat.chatId, text, planFirst })
      .then((c) => {
        setChat(c); // authoritative list replaces the optimistic turn
        // TWOWAY-FIX: the server refused to start new work because a gate is already
        // open, and handed the plan back. Reachable on a CURRENT bundle only when this
        // tab's `plan` state is stale — a second tab, or a gate opened elsewhere — since
        // the guard above blocks the composer whenever this tab knows about the card.
        // Adopting it here means the tab self-corrects on the very next thing the tutor
        // types, instead of waiting for a reload.
        if (c.pendingPlan) {
          setPlan(c.pendingPlan);
          return; // nothing was enqueued, so there is no job to poll
        }
        // CHAT-SET-ROUTE: the go-ahead fired with "Several" on, so the server resolved
        // a SET and handed back the blueprint proposal instead of enqueueing anything.
        // Drop it into the SAME state the menu's "Suggest sub-topics" button fills, so
        // the existing card renders it and the existing approve path fans out — the
        // chat route reaches the fan-out through the tutor's approval, never directly.
        if (c.proposedSet) {
          setProposalSet(c.proposedSet);
          return; // nothing was enqueued, so there is no job to poll
        }
        // AUTHOR-ASYNC: an in-chat author fired (Gemini sentinel / Claude marker) →
        // the work runs off the request path. TWOWAY-1: which loader depends on the
        // phase the server chose — plan-first (the default) returns planJobId and
        // ends at a gate card; the skip returns draftJobId and goes straight to the
        // review form. Exactly one is ever set.
        if (c.planJobId) startPlanningPoll(c.planJobId);
        else if (c.draftJobId) startDraftingPoll(c.draftJobId);
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
    if (!chat || proposing || drafting) return;
    setError(null);
    setSaved(null);
    setProposing(true);
    pinBoard(); // BOARD-PIN
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
    if (!chat || !proposal || drafting) return;
    const p = proposal;
    setError(null);
    setSaved(null);
    setProposal(null);
    setAuthoring(true);
    pinBoard(); // BOARD-PIN
    trpc.tutor.authorFromChat
      .mutate({
        chatId: chat.chatId,
        subTopicId: p.subTopicId,
        count: proposeCount,
        planFirst,
      })
      // AUTHOR-ASYNC: returns a jobId (the work runs off the request path). TWOWAY-1:
      // the reply says which PHASE was enqueued — plan-first ends at a gate card, the
      // skip goes straight to the review form. Branch on the server's answer rather
      // than on the local toggle, so the two can never disagree.
      .then(({ jobId, phase }) =>
        phase === "plan" ? startPlanningPoll(jobId) : startDraftingPoll(jobId),
      )
      .catch((e) => setError(String(e?.message ?? e)))
      .finally(() => setAuthoring(false));
  }

  // QA3-e-2: ask the AI to propose a SET of sub-topics + counts from the
  // conversation + grounding. The tutor confirms. COVERAGE-1: the chat's MODE
  // picks the intent — interleaved asks for a confusable mix to discriminate
  // between, blocked asks for coverage across the one chapter it's grounded in.
  // The toggle decides one-vs-many; the mode decides which many.
  function proposeSet() {
    if (!chat || proposingSet) return;
    setError(null);
    setSaved(null);
    setProposingSet(true);
    pinBoard(); // BOARD-PIN
    trpc.tutor.proposeAuthoringSet
      .mutate({
        chatId: chat.chatId,
        intent: chat.mode === "interleaved" ? "discriminate" : "cover",
      })
      .then((p) => {
        setProposalSet(p);
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
    pinBoard(); // BOARD-PIN
    trpc.tutor.authorSetFromChat
      .mutate({
        chatId: chat.chatId,
        // SET-PLAN-GATE: the count is now DERIVED from the approved blueprint (not
        // tutor-editable — approving N items IS the gate). Hand the plan back so the
        // drafter writes exactly it; a blueprint-less pick (degenerate fallback)
        // sends no plan and self-derives.
        targets: picks.map((p) => ({
          subTopicId: p.subTopicId,
          count: Math.max(1, Math.min(8, p.count)),
          ...(p.items.length > 0
            ? { plan: { read: "", items: p.items, questions: [] } }
            : {}),
        })),
      })
      // Slice SET-ASYNC: this returns a jobId now, not the fan-out. The loader stays
      // up until the POLL resolves — so `finally(() => setAuthoringSet(false))` would
      // be wrong here: it would clear the spinner the instant the job was queued.
      .then((r) => startSetPoll(r.jobId))
      .catch((e) => {
        setAuthoringSet(false);
        setError(String(e?.message ?? e));
      });
  }

  /** Apply a completed fan-out to the review form. Shared by the fresh poll and the
   *  resumed one, so a set opened after a refresh renders identically. */
  function applySetResult(r: AuthorSet) {
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
  }

  // Poll a SET job until the fan-out lands. Mirrors pollAuthoring, including treating
  // 'unknown' as still-working (a transient Redis blip inside the poll window, never
  // the 1h age-out). The cap is the DRAFT cap — a set is N drafts in parallel, so its
  // wall-clock is the slowest member, not the sum (200 × 3s ≈ 10min).
  function pollAuthoringSet(jobId: string, tries: number) {
    if (tries > 200) {
      setJobRef.current = null;
      setAuthoringSet(false);
      setError(SET_SLOW_MSG);
      return;
    }
    pinBoard(); // BOARD-PIN — re-pinned on EVERY tick; a long fan-out spans drift
    trpc.tutor.getAuthoringJobStatus
      .query({ jobId })
      .then((s) => {
        if (s.state === "completed") {
          setJobRef.current = null;
          setAuthoringSet(false);
          // Symmetric to the draft/plan polls' cross-phase guards: never hand a
          // non-set payload to the set applier. A plan reaching here means the
          // loaders crossed — gate it rather than drop it; a draft opens the form.
          if (s.result.phase === "plan") {
            setPlan(planFromJob(s.result));
            return;
          }
          if (s.result.phase === "draft") {
            openReviewForm(s.result);
            return;
          }
          applySetResult(s.result);
          return;
        }
        if (s.state === "failed") {
          setJobRef.current = null;
          setAuthoringSet(false);
          setError(SET_FAILED_MSG);
          return;
        }
        setPollRef.current = setTimeout(() => pollAuthoringSet(jobId, tries + 1), 3000);
      })
      .catch(() => {
        setJobRef.current = null;
        setAuthoringSet(false);
        setError(SET_FAILED_MSG);
      });
  }

  /** Start (or resume) the durable "Authoring the set…" loader + poll for a job id. */
  function startSetPoll(jobId: string) {
    setJobRef.current = jobId;
    setAuthoringSet(true);
    pollAuthoringSet(jobId, 0);
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
    pinBoard(); // BOARD-PIN
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
    pinBoard(); // BOARD-PIN
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

  // Open the review form from an authored-draft result (the completed job's
  // payload). Shared by the async poll for BOTH the in-chat author and the button,
  // so the review form opens identically however drafting was triggered.
  function openReviewForm(d: AuthorDraft) {
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

  // Poll an authoring job until the drafts land (AUTHOR-ASYNC). On completion the
  // job carries the AuthorFromChatResult → open the review form. 'unknown' is
  // treated as still-working (a transient Redis blip inside our poll window, never
  // the 1h age-out) so a hiccup doesn't drop the loader. Mirrors pollRevise; the
  // cap (200 × 3s ≈ 10min) covers a per-question set of up to 8 questions.
  function pollAuthoring(jobId: string, tries: number) {
    if (tries > 200) {
      draftJobRef.current = null;
      setDrafting(false);
      setError(DRAFT_SLOW_MSG);
      return;
    }
    pinBoard(); // BOARD-PIN — re-pinned on EVERY poll tick; a long draft spans drift
    trpc.tutor.getAuthoringJobStatus
      .query({ jobId })
      .then((s) => {
        if (s.state === "completed") {
          draftJobRef.current = null;
          setDrafting(false);
          // TWOWAY-1: a draft poll must only ever open the review form on a DRAFT
          // result. A plan arriving here means the loaders crossed (e.g. a resume
          // mislabelled the phase) — hand it to the gate instead of opening an empty
          // review form, and never silently drop it.
          if (s.result.phase === "plan") {
            setPlan(planFromJob(s.result));
            return;
          }
          // SET-ASYNC: same rule for a fan-out payload — its cards live under
          // {groups}, so openReviewForm cannot read it. Route, don't drop.
          if (s.result.phase === "set") {
            applySetResult(s.result);
            return;
          }
          openReviewForm(s.result);
          return;
        }
        if (s.state === "failed") {
          draftJobRef.current = null;
          setDrafting(false);
          setError(DRAFT_FAILED_MSG);
          return;
        }
        // waiting / active / unknown → keep polling.
        draftPollRef.current = setTimeout(() => pollAuthoring(jobId, tries + 1), 3000);
      })
      .catch(() => {
        draftJobRef.current = null;
        setDrafting(false);
        setError(DRAFT_FAILED_MSG);
      });
  }

  // Start (or resume) the durable "Drafting…" loader + poll for a job id.
  function startDraftingPoll(jobId: string) {
    draftJobRef.current = jobId;
    setDrafting(true);
    pollAuthoring(jobId, 0);
  }

  // ── TWOWAY-1: the PLAN phase ────────────────────────────────────────────────

  /** A completed plan JOB result, in the same shape getChat's `pendingPlan` uses, so
   *  the card has exactly ONE source shape to render regardless of how the plan
   *  arrived (fresh poll vs. resumed chat). */
  function planFromJob(r: AuthorPlan): PendingPlan {
    return {
      workerId: r.workerId,
      subTopicId: r.subTopicId,
      subTopicName: r.subTopicName,
      topicName: r.topicName,
      chapterName: r.chapterName,
      plan: r.plan,
      createdAt: new Date().toISOString(),
    };
  }

  // Poll a plan job until the plan lands. Mirrors pollAuthoring, including treating
  // 'unknown' as still-working (a transient Redis blip inside the poll window, never
  // the 1h age-out) so a hiccup doesn't drop the loader. A plan is one call on a
  // small output, so the cap is shorter than the draft's.
  function pollPlanning(jobId: string, tries: number) {
    if (tries > 120) {
      planJobRef.current = null;
      setPlanning(false);
      setError(PLAN_SLOW_MSG);
      return;
    }
    pinBoard(); // BOARD-PIN — re-pinned on EVERY tick; a long plan spans board drift
    trpc.tutor.getAuthoringJobStatus
      .query({ jobId })
      .then((s) => {
        if (s.state === "completed") {
          planJobRef.current = null;
          setPlanning(false);
          // Symmetric to the draft poll's guard: if a DRAFT result lands on the plan
          // poll, open the review form rather than dropping the drafts on the floor.
          if (s.result.phase === "draft") {
            openReviewForm(s.result);
            return;
          }
          if (s.result.phase === "set") {
            applySetResult(s.result);
            return;
          }
          setPlan(planFromJob(s.result));
          setAmending(false);
          setAmendNote("");
          return;
        }
        if (s.state === "failed") {
          planJobRef.current = null;
          setPlanning(false);
          setError(PLAN_FAILED_MSG);
          return;
        }
        planPollRef.current = setTimeout(() => pollPlanning(jobId, tries + 1), 3000);
      })
      .catch(() => {
        planJobRef.current = null;
        setPlanning(false);
        setError(PLAN_FAILED_MSG);
      });
  }

  /** Start (or resume) the durable "Planning…" loader + poll. */
  function startPlanningPoll(jobId: string) {
    planJobRef.current = jobId;
    setPlanning(true);
    pollPlanning(jobId, 0);
  }

  // The tutor APPROVED the plan → the worker drafts exactly what was approved. The
  // count is the server's (the plan's item count), never re-sent from here.
  function approvePlan() {
    if (!chat || !plan || gating || drafting) return;
    setError(null);
    setGating(true);
    pinBoard(); // BOARD-PIN
    trpc.tutor.approveAuthoringPlan
      .mutate({ chatId: chat.chatId, workerId: plan.workerId })
      .then(({ jobId }) => {
        // The gate is answered — clear it BEFORE the drafting loader opens so the
        // card can't linger and be double-approved.
        setPlan(null);
        startDraftingPoll(jobId);
      })
      .catch((e) => setError(planGateError(e)))
      .finally(() => setGating(false));
  }

  // The tutor AMENDED → their words go into the worker's own history and it re-plans
  // on the same episode (so the next plan is a revision, not a fresh guess).
  function submitAmendment() {
    const note = amendNote.trim();
    if (!chat || !plan || !note || gating) return;
    setError(null);
    setGating(true);
    pinBoard(); // BOARD-PIN
    trpc.tutor.amendAuthoringPlan
      .mutate({ chatId: chat.chatId, workerId: plan.workerId, note })
      .then(({ jobId }) => {
        setPlan(null); // the old plan is superseded; the re-plan replaces it
        setAmending(false);
        setAmendNote("");
        // Mirror the amendment into the visible transcript immediately. The server
        // already appended it, but the tutor should see their words land now rather
        // than after the next full chat read.
        setChat((c) =>
          c
            ? {
                ...c,
                messages: [
                  ...c.messages,
                  {
                    id: `amend-${Date.now()}`,
                    role: "user" as const,
                    text: note,
                    createdAt: new Date().toISOString(),
                  },
                ],
              }
            : c,
        );
        startPlanningPoll(jobId);
      })
      .catch((e) => setError(planGateError(e)))
      .finally(() => setGating(false));
  }

  // The tutor dismissed the plan without drafting. The episode is closed server-side
  // so it can't come back as a live gate.
  function dismissPlan() {
    if (!chat || !plan || gating) return;
    const workerId = plan.workerId;
    setError(null);
    setGating(true);
    setPlan(null); // optimistic — the card is gone either way
    pinBoard(); // BOARD-PIN
    trpc.tutor.dismissAuthoringPlan
      .mutate({ chatId: chat.chatId, workerId })
      .catch((e) => setError(planGateError(e)))
      .finally(() => setGating(false));
  }

  /** Translate a gate failure into something a tutor can act on. All three guard
   *  failures collapse to one server code, and the honest reading of it is "this
   *  plan is no longer the live one" — which a reload fixes. */
  function planGateError(e: unknown): string {
    const msg = String((e as { message?: string })?.message ?? e);
    if (/AUTHORING_PLAN_NOT_FOUND/.test(msg)) {
      return "This plan is no longer the current one — it was already answered or replaced. Reopen the chat to see where it got to.";
    }
    if (/PLAN_HAS_NO_ITEMS/.test(msg)) {
      return "There's nothing to draft yet — answer the question above with “Amend” and it'll plan again.";
    }
    return msg;
  }

  // Poll a revise job until the revised draft lands (REVISE-ASYNC). On completion
  // the job carries the already-persisted draft → patch the card in place. Reads
  // the card fresh from cardsRef so a slow revise still patches the right row.
  // 'unknown' is treated as still-working (a transient Redis blip inside our ~6-min
  // window, never the 1h age-out) so a hiccup doesn't drop the loader.
  function pollRevise(i: number, jobId: string, tries: number) {
    if (tries > 120) {
      reviseJobRef.current = null;
      setRevisingIdx(null);
      setError(REVISE_SLOW_MSG);
      return;
    }
    trpc.tutor.getReviseJobStatus
      .query({ jobId })
      .then((s) => {
        if (s.state === "completed") {
          const card = cardsRef.current?.[i];
          if (card) patch(i, toCard(s.result, card.subTopicId, card.subTopicName));
          reviseJobRef.current = null;
          setRevisingIdx(null);
          return;
        }
        if (s.state === "failed") {
          reviseJobRef.current = null;
          setRevisingIdx(null);
          setError(REVISE_FAILED_MSG);
          return;
        }
        // waiting / active / unknown → keep polling.
        revisePollRef.current = setTimeout(() => pollRevise(i, jobId, tries + 1), 3000);
      })
      .catch(() => {
        reviseJobRef.current = null;
        setRevisingIdx(null);
        setError(REVISE_FAILED_MSG);
      });
  }

  // Per-question mini-chat: revise ONE draft in place per a tutor instruction.
  // REVISE-ASYNC: enqueues the revise off the request path and polls the job so
  // the "Revising…" loader is durable (survives a refresh; resumed in restoreDrafts).
  function revise(i: number, note: string) {
    if (!chat || !cards) return;
    const card = cards[i];
    if (!card) return;
    setError(null);
    setRevisingIdx(i);
    pinBoard(); // BOARD-PIN
    commit(i)
      .then(() =>
        trpc.tutor.reviseDraftQuestion.mutate({
          chatId: chat.chatId,
          questionId: card.id,
          refinementNote: note,
        }),
      )
      .then(({ jobId }) => {
        reviseJobRef.current = jobId;
        pollRevise(i, jobId, 0);
      })
      .catch((e) => {
        setRevisingIdx(null);
        setError(String(e?.message ?? e));
      });
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
      pinBoard(); // BOARD-PIN
      const res = await trpc.tutor.approveDrafts.mutate({
        questionIds: ids,
        assign,
        mode: chat?.mode,
        // Item 13 — ignored by the BE unless mode is 'blocked'.
        separate: assignSeparate,
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
    <div className={`tut-authwrap${fullscreen ? " is-fullscreen" : ""}`}>
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
          {/* SEVERAL-THREAD: the grain is thread-locked like the vendor beside it,
              so it belongs in the same read-only strip. Shown only for "several" —
              "one" is the default every thread has always had, and a chip saying so
              on every chat would be noise. */}
          {chatGrain === "several" && (
            <span className="tut-chat-vendorchip" title="This thread authors several sub-topics at once">
              Several
            </span>
          )}
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
          {/* AUTHUI-FS: maximize just this workspace (chat + preview) to the whole
              viewport, over the student header / tabs / board switcher. */}
          <button
            className="tut-chat-fsbtn"
            onClick={() => setFullscreen((v) => !v)}
            title={fullscreen ? "Exit full screen (Esc)" : "Full screen — focus on authoring"}
            aria-pressed={fullscreen}
          >
            {fullscreen ? "⤡ Exit full screen" : "⤢ Full screen"}
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
              {/* Slice MIXED, item 13 — several sub_topics of ONE chapter authored
                  together: do they go out as one mixed assignment or one each?
                  Only asked for BLOCKED; interleaved is always mixed (splitting it
                  per sub_topic is just blocked practice). The answer IS the
                  composition — 'separate' creates N single-sub_topic assignments,
                  and an assignment with >1 sub_topic is what the student meets as
                  a mixed run. Nothing extra is stored. */}
              {assignOnApprove && multi && chat.mode === "blocked" && (
                <div className="tut-auth-split" role="radiogroup">
                  <label className="tut-auth-split-opt">
                    <input
                      type="radio"
                      name="assign-split"
                      checked={!assignSeparate}
                      onChange={() => setAssignSeparate(false)}
                      disabled={saving}
                    />
                    One mixed assignment
                  </label>
                  <label className="tut-auth-split-opt">
                    <input
                      type="radio"
                      name="assign-split"
                      checked={assignSeparate}
                      onChange={() => setAssignSeparate(true)}
                      disabled={saving}
                    />
                    One per sub-topic
                  </label>
                </div>
              )}
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
        {chat.messages.length === 0 && !sending && !cards && !proposal && !plan && (
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

        {/* Consent card — the AI proposes a SET (QA3-e-2); SET-PLAN-GATE enriches it
            into the PLAN GATE for the fan-out: each pick now shows the exact items
            the worker will write (axis · intent · difficulty), and approving the
            proposal IS approving that blueprint (the drafter writes exactly it). The
            count is DERIVED from the blueprint and no longer editable — changing
            volume means re-proposing (mirrors single-mode's approve rule). Never
            gated on mode: it renders off `proposalSet`, so COVERAGE-1 reuses it in
            blocked chats with only its heading changed. */}
        {proposalSet && (
          <div className="tut-chat-consent tut-chat-consent--set">
            <div className="tut-chat-consent-head">
              {chat.mode === "interleaved"
                ? "Suggested interleaved set"
                : "Suggested sub-topics to author"}{" "}
              ({proposalSet.picks.length} sub-topics)
            </div>
            <p className="tut-chat-consent-why">{proposalSet.rationale}</p>
            <div className="tut-chat-set-picks">
              {proposalSet.picks.map((pk) => (
                <div key={pk.subTopicId} className="tut-chat-set-pick">
                  <div className="tut-chat-set-pick-head">
                    <span className="tut-chat-set-pick-name">
                      {pk.chapterName} › {pk.subTopicName}
                    </span>
                    <span className="tut-chat-set-pick-count">
                      {pk.count} question{pk.count === 1 ? "" : "s"}
                    </span>
                  </div>
                  {pk.items.length > 0 ? (
                    <ol className="tut-chat-set-pick-items">
                      {pk.items.map((it) => (
                        <li key={it.n} className="tut-chat-set-pick-item">
                          <span className={`tut-axis tut-axis--${it.axis}`}>
                            {it.axis}
                          </span>
                          <span className="tut-chat-item-intent">{it.intent}</span>
                          <span className="tut-chat-item-diff">{it.difficulty}</span>
                        </li>
                      ))}
                    </ol>
                  ) : (
                    <p className="tut-chat-set-pick-noplan">
                      The worker will plan this one as it drafts.
                    </p>
                  )}
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
                  : `Author set (${proposalSet.picks.reduce((n, p) => n + p.count, 0)} questions) →`}
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

        {/* TWOWAY-1 — THE PLAN GATE. The worker says what it intends to write; the
            tutor approves it or tells it what to change. Rendered from `plan`, which
            getChat re-supplies on every resume path, so this card survives a refresh
            and can't re-open once answered. */}
        {plan && (
          // TWOWAY-FIX: the gate reads as a MESSAGE in the conversation (AI side,
          // tinted), not as a wide bordered card. Founder call — the plan is the
          // worker talking, so it should look like the worker talking.
          <div className="tut-chat-row tut-chat-row--ai">
            <div className="tut-chat-plan">
              <div className="tut-chat-plan-head">
                Plan — {plan.topicName} › {plan.subTopicName}
              </div>
              <p className="tut-chat-plan-read">{plan.plan.read}</p>
              {plan.plan.items.length > 0 && (
                <ol className="tut-chat-plan-items">
                  {plan.plan.items.map((it: PlanItem, i: number) => (
                    // STACKED, not columnar. Every field here is free prose by
                    // contract — `difficulty` especially ("the dial catalogs are
                    // prose, not a scale"). The old 4-column grid gave the dial
                    // `white-space: nowrap`, so one long dial string demanded a
                    // column wider than the card, squeezed `kind` and `intent` to
                    // one word per line, and ran off the right edge.
                    <li key={`${it.n}-${i}`} className="tut-chat-plan-item">
                      <div className="tut-chat-plan-item-head">
                        <span className="tut-chat-plan-n">{it.n}</span>
                        <span
                          className={`tut-chat-plan-axis tut-chat-plan-axis--${it.axis}`}
                        >
                          {it.axis === "both" ? "C+P" : it.axis === "conceptual" ? "C" : "P"}
                        </span>
                        <span className="tut-chat-plan-kind">{it.kind}</span>
                      </div>
                      {it.intent && <p className="tut-chat-plan-intent">{it.intent}</p>}
                      {it.difficulty && (
                        <p className="tut-chat-plan-dial">{it.difficulty}</p>
                      )}
                    </li>
                  ))}
                </ol>
              )}
            {plan.plan.questions.length > 0 && (
              <div className="tut-chat-plan-asks">
                <div className="tut-chat-plan-asks-head">It needs to know:</div>
                <ul>
                  {plan.plan.questions.map((q: string, i: number) => (
                    <li key={i}>{q}</li>
                  ))}
                </ul>
              </div>
            )}
            {amending ? (
              <div className="tut-chat-plan-amend">
                <textarea
                  className="tut-chat-plan-amendbox"
                  rows={3}
                  autoFocus
                  placeholder="What should it change? (e.g. “drop the graph one, make Q2 about a real context, go one dial harder”)"
                  value={amendNote}
                  onChange={(e) => setAmendNote(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      submitAmendment();
                    }
                  }}
                  disabled={gating}
                />
                <div className="tut-chat-consent-actions">
                  <button
                    className="btn-solid"
                    onClick={submitAmendment}
                    disabled={gating || !amendNote.trim()}
                  >
                    {gating ? "Sending…" : "Send to the worker →"}
                  </button>
                  <button
                    className="tut-chat-consent-dismiss"
                    onClick={() => {
                      setAmending(false);
                      setAmendNote("");
                    }}
                    disabled={gating}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="tut-chat-consent-actions">
                <button
                  className="btn-solid"
                  onClick={approvePlan}
                  disabled={gating || plan.plan.items.length === 0}
                  title={
                    plan.plan.items.length === 0
                      ? "Nothing planned yet — answer its question with Amend"
                      : "Draft exactly these questions"
                  }
                >
                  {gating
                    ? "Starting…"
                    : `Draft ${plan.plan.items.length} question${plan.plan.items.length === 1 ? "" : "s"} →`}
                </button>
                <button
                  className="tut-chat-suggest"
                  onClick={() => setAmending(true)}
                  disabled={gating}
                  title="Tell the worker what to change, and it will re-plan"
                >
                  Amend
                </button>
                <button
                  className="tut-chat-consent-dismiss"
                  onClick={dismissPlan}
                  disabled={gating}
                >
                  Not yet
                </button>
              </div>
            )}
            </div>
          </div>
        )}

        {/* TWOWAY-1: the durable "Planning…" loader (survives a refresh; resumed via
            getActiveAuthoringJob, which carries the phase). */}
        {planning && (
          <p className="tut-muted tut-chat-authmeta tut-chat-drafting">
            Working out a plan… it'll show you what it intends to write before writing
            anything. You can leave this open.
          </p>
        )}

        {authoring && !proposal && (
          <p className="tut-muted tut-chat-authmeta">
            {planFirst ? "Working out a plan…" : "Authoring the questions… (~10–30s)"}
          </p>
        )}
        {/* SET-ASYNC: the fan-out is a background job now, so this loader is durable
            — say so, exactly as the drafting loader does. Before this slice the
            request was held open and closing the tab lost the work; now it doesn't. */}
        {authoringSet && !proposalSet && (
          <p className="tut-muted tut-chat-authmeta">
            Authoring the set in parallel - one worker per sub-topic… You can leave
            this open.
          </p>
        )}
        {/* AUTHOR-ASYNC: the durable drafting loader (survives a refresh; resumed
            via getActiveAuthoringJob). Shown for both the in-chat author and the
            button — both hand off to the same background job. */}
        {drafting && (
          <p className="tut-muted tut-chat-authmeta tut-chat-drafting">
            Drafting the questions… this can take a minute — you can leave this open
            and the questions will appear below when they're ready.
          </p>
        )}
      </div>

      {/* BOTTOM of the chat column: the input + the consent trigger. Now a normal
          flex sibling below the scrolling canvas (no longer sticky) — the newest
          bubble can't hide behind it (D-AUTHUI-2). */}
      <div className="tut-chat-inputbar">
        <textarea
          ref={inputRef}
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
        {/* COMPOSER-1: the controls row, beneath the input rather than beside it.
            LEFT — the one-vs-several segmented toggle, the only control kept in
            plain sight because it changes what the other controls MEAN.
            RIGHT — everything else, behind one menu. */}
        <div className="tut-chat-controls">
          {/* COVERAGE-1: one-at-a-time vs several-in-parallel. Reuses the existing
              vendor-toggle markup — no new component kind (founder: "don't want to
              introduce new component as check box an dall"). Locked while a set is
              in flight so the label can't contradict what's actually running. */}
          <div
            className="tut-chat-vendortoggle tut-chat-settoggle"
            role="tablist"
            aria-label="How many sub-topics to author at once"
            title={
              chat.mode === "interleaved"
                ? "One sub-topic at a time, or a mix of several authored in parallel."
                : "One sub-topic at a time, or several sub-topics of this chapter authored in parallel."
            }
          >
            {(
              [
                [false, "One"],
                [true, "Several"],
              ] as const
            ).map(([on, label]) => (
              <button
                key={label}
                role="tab"
                aria-selected={setModeOn === on}
                className={`tut-chat-vendoropt${setModeOn === on ? " is-on" : ""}`}
                // SEVERAL-THREAD: the grain is thread-locked, so this no longer
                // flips a local flag — it ASKS, and a confirm starts a new thread
                // carrying the transcript. Clicking the grain you're already in is
                // a no-op rather than a pointless confirm.
                onClick={() => {
                  const next = on ? "several" : "one";
                  if (next !== chatGrain) setGrainConfirm(next);
                }}
                disabled={proposingSet || authoringSet || !!proposalSet || starting}
              >
                {label}
              </button>
            ))}
          </div>

          {/* SEVERAL-THREAD — the confirm. Says what is actually about to happen:
              a NEW thread, with this conversation carried over. Both facts matter —
              "new thread" alone reads as "you're about to lose this". */}
          {grainConfirm && (
            <div className="tut-grain-confirm" role="dialog" aria-modal="true">
              <div className="tut-grain-confirm-box">
                <div className="tut-grain-confirm-title">
                  Switch to {grainConfirm === "several" ? "Several" : "One"}?
                </div>
                <p className="tut-grain-confirm-body">
                  {grainConfirm === "several"
                    ? "Authoring several sub-topics at once needs a new thread, so the assistant knows about it from the start."
                    : "Going back to one sub-topic at a time needs a new thread, so the assistant knows about it from the start."}{" "}
                  This conversation carries over as context.
                </p>
                <div className="tut-grain-confirm-actions">
                  <button className="tut-back" onClick={() => setGrainConfirm(null)}>
                    Cancel
                  </button>
                  <button
                    className="btn-solid"
                    onClick={() => applyGrainSwitch(grainConfirm)}
                  >
                    OK, start it
                  </button>
                </div>
              </div>
            </div>
          )}

          <div className="tut-chat-spacer" />

          {/* The options menu: the two suggest ACTIONS, then the plan-first
              PREFERENCE below a divider. Grouped, not mixed — they answer
              different questions ("do this now" vs "keep doing this"). */}
          <div className="tut-chat-opts" ref={optsRef}>
            <button
              type="button"
              className={`tut-chat-opts-trigger${optsOpen ? " is-open" : ""}`}
              aria-expanded={optsOpen}
              aria-haspopup="menu"
              onClick={() => setOptsOpen((o) => !o)}
              disabled={proposing || proposingSet}
              title="Suggestions and authoring preferences"
            >
              <span>{proposing || proposingSet ? "Thinking…" : "Options"}</span>
              <span className="tut-chat-opts-caret" aria-hidden>
                ⌄
              </span>
            </button>
            {optsOpen && (
              <div className="tut-chat-opts-menu" role="menu">
                <button
                  type="button"
                  role="menuitem"
                  className="tut-chat-opts-item"
                  onClick={() => {
                    setOptsOpen(false);
                    propose();
                  }}
                  disabled={
                    proposing || authoring || drafting || planning || !!proposal || !!plan
                  }
                >
                  <span className="tut-chat-opts-label">Suggest what to work on</span>
                  <span className="tut-chat-opts-sub">
                    One sub-topic + a count, picked from this student's grounding
                  </span>
                </button>
                {/* QA3-e-2 → COVERAGE-1: the fan-out entry. Was gated on the chat's
                    mode; now on the toggle, so a BLOCKED chat can author several
                    sub-topics of its one chapter. The mode still decides WHICH set. */}
                {setModeOn && (
                  <button
                    type="button"
                    role="menuitem"
                    className="tut-chat-opts-item"
                    onClick={() => {
                      setOptsOpen(false);
                      proposeSet();
                    }}
                    disabled={proposingSet || authoringSet || !!proposalSet}
                  >
                    <span className="tut-chat-opts-label">
                      {chat.mode === "interleaved"
                        ? "Suggest an interleaved set"
                        : "Suggest sub-topics to cover"}
                    </span>
                    <span className="tut-chat-opts-sub">
                      {chat.mode === "interleaved"
                        ? "A confusable MIX across the chosen chapters, authored in parallel"
                        : "Several sub-topics of this chapter, authored in parallel"}
                    </span>
                  </button>
                )}

                <div className="tut-chat-opts-divider" role="separator" />

                {/* TWOWAY-1 — the SKIP, now a menu row. Plan-first is the default:
                    a go-ahead makes the worker state its intent and wait. Turning
                    it off restores the pre-slice behaviour (straight to drafting).
                    Resets to ON on a refresh — a skip should be a decision each
                    time, not a sticky mode.
                    LOCKED ON under "Several" (SET-PLAN-GATE): a set ALWAYS gates —
                    the proposal card carries the per-sub-topic blueprint, and the
                    fan-out fires only on approval. That is a DIFFERENT gate from
                    this one (per-proposal before spawn, not the worker's own plan
                    phase — the set path runs no plan phase), but the tutor-facing
                    promise is identical: nothing is written until you approve. So
                    it reads ✓ and not-clickable. It previously read UNCHECKED with
                    "a set drafts straight away", which claimed the opposite of what
                    the code does. Presentation only — sendTurn branches on setMode
                    (:1355/:1447) before planFirst is consumed (:1396/:1481), so the
                    flag is already ignored on this path. */}
                <button
                  type="button"
                  role="menuitemcheckbox"
                  aria-checked={setModeOn || planFirst}
                  className="tut-chat-opts-item"
                  onClick={() => setPlanFirst(!planFirst)}
                  disabled={planning || drafting || !!plan || setModeOn}
                >
                  <span className="tut-chat-opts-label">Plan first</span>
                  <span className="tut-chat-opts-sub">
                    {setModeOn
                      ? "You approve the blueprint before any question is written"
                      : "The worker states what it intends to write, and waits for your go-ahead"}
                  </span>
                  {(setModeOn || planFirst) && (
                    <span className="tut-chat-opts-check" aria-hidden>
                      ✓
                    </span>
                  )}
                </button>
              </div>
            )}
          </div>

          <button
            className="tut-chat-send"
            onClick={send}
            disabled={sending || !input.trim() || planning || drafting || !!plan}
            aria-label="Send"
            title={
              plan
                ? "Answer the plan above first — approve it, amend it, or dismiss it"
                : "Send"
            }
          >
            ➤
          </button>
        </div>
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
  model,
}: {
  imageId: string | null;
  label: string | null;
  // verifier_model — "tutor_override" marks a manual tutor verification, badged
  // distinctly so a later reviewer can see WHO vouched for the figure.
  model?: string | null;
}) {
  let tone: string;
  let text: string;
  if (!imageId) {
    tone = "pending";
    text = "Rendering…";
  } else if (label === "PASS") {
    tone = "pass";
    text = model === "tutor_override" ? "✓ Verified (tutor)" : "✓ Verified";
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
// The verifier badge carries the manual-override action here too (founder call
// 2026-07-18): a FAIL/ERROR on an already-approved question can be overruled
// without re-opening the draft flow. Local img state so the card updates in place.
function AuthoredQuestionCard({ q }: { q: AuthoredQuestion }) {
  const [img, setImg] = useState<{ verifierLabel: string | null; verifierModel: string | null }>({
    verifierLabel: q.verifierLabel,
    verifierModel: q.verifierModel,
  });
  const [overriding, setOverriding] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    setImg({ verifierLabel: q.verifierLabel, verifierModel: q.verifierModel });
  }, [q.id, q.verifierLabel, q.verifierModel]);

  function overrideVerdict() {
    if (!q.imageId || overriding) return;
    setOverriding(true);
    setErr(null);
    trpc.tutor.overrideQuestionImage
      .mutate({ questionId: q.id, imageId: q.imageId })
      .then((r) => setImg({ verifierLabel: r.label, verifierModel: r.model }))
      .catch(() => setErr("We couldn't mark this diagram as verified. Please try again."))
      .finally(() => setOverriding(false));
  }

  return (
    <div className="tut-saved-q">
      <div className="tut-saved-qhead">
        <span className="tut-saved-axis">{q.axis}</span>
        {q.hasImage && <span className="tut-saved-fig">figure</span>}
        {q.hasImage && (
          <VerifierBadge imageId={q.imageId} label={img.verifierLabel} model={img.verifierModel} />
        )}
        {q.imageId && (img.verifierLabel === "FAIL" || img.verifierLabel === "ERROR") && (
          <button
            className="tut-auth-fig-link tut-auth-fig-override"
            onClick={overrideVerdict}
            disabled={overriding}
            title="Overrule the automatic check — the figure will be shown to the student"
          >
            {overriding ? "Marking…" : "Mark as correct"}
          </button>
        )}
      </div>
      <p className="tut-saved-stem">
        <MathText text={q.stem} />
      </p>
      {q.imageId && (
        <img
          className="tut-saved-thumb"
          src={`/content/image/${q.imageId}?board=${getBoard() ?? ""}`}
          alt="Question figure"
          loading="lazy"
        />
      )}
      {err && <p className="tut-error">{err}</p>}
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

// The author's intent + 5-axis self-rubric for a draft, read-only ABOVE the
// question in the preview (founder call 2026-07-18: "the pedagogy of the question
// visible to the tutor so it's easy to recall"). pedagogical_note is composed as
// "<intent>\n\n[Author rubric — …]" (composePedagogicalNote, D-AUTH-5) — split it
// so the intent reads as prose and the rubric as a muted metadata line.
function PedagogyNote({ note }: { note: string }) {
  const cut = note.indexOf("\n\n[Author rubric");
  const intent = (cut === -1 ? note : note.slice(0, cut)).trim();
  const rubric =
    cut === -1 ? null : note.slice(cut).trim().replace(/^\[/, "").replace(/\]$/, "");
  if (!intent && !rubric) return null;
  return (
    <div className="tut-auth-pedagogy">
      <span className="tut-auth-pedagogy-tag">Pedagogy</span>
      {intent && <p className="tut-auth-pedagogy-intent">{intent}</p>}
      {rubric && <p className="tut-auth-pedagogy-rubric">{rubric}</p>}
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

      {card.pedagogicalNote && <PedagogyNote note={card.pedagogicalNote} />}

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
  const [overriding, setOverriding] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // Current rendered figure (id + verdict), seeded from the card, kept fresh by the
  // poll after a generate + re-seeded when a revise replaces the draft's figure.
  const [img, setImg] = useState<{
    imageId: string | null;
    verifierLabel: string | null;
    verifierModel: string | null;
  }>({
    imageId: card.imageId,
    verifierLabel: card.verifierLabel,
    verifierModel: card.verifierModel,
  });
  useEffect(() => {
    setImg({
      imageId: card.imageId,
      verifierLabel: card.verifierLabel,
      verifierModel: card.verifierModel,
    });
  }, [card.id, card.imageId, card.verifierLabel, card.verifierModel]);

  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const jobRef = useRef<string | null>(null);
  useEffect(
    () => () => {
      if (pollRef.current) clearTimeout(pollRef.current);
    },
    [],
  );

  // Resume a render that is still in progress across a page refresh / close-reopen.
  // The loader state is local (lost on reload), but the render job lives in Redis,
  // so on mount we ask the server "is a render still running for this draft?" and,
  // if so, re-attach the poll — the "Regenerating…" loader comes back and tracks to
  // completion instead of the tutor having to refresh to discover the result.
  useEffect(() => {
    let alive = true;
    trpc.tutor.getActiveImageJob
      .query({ questionId: card.id })
      .then(({ jobId }) => {
        // Skip if a user-initiated generate already started (jobRef set) — don't
        // clobber a live poll with the resume.
        if (!alive || !jobId || jobRef.current) return;
        jobRef.current = jobId;
        setGenerating(true);
        poll(0);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [card.id]);

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
        if (cur)
          setImg({
            imageId: cur.imageId,
            verifierLabel: cur.verifierLabel,
            verifierModel: cur.verifierModel,
          });
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
        if (cur)
          setImg({
            imageId: cur.imageId,
            verifierLabel: cur.verifierLabel,
            verifierModel: cur.verifierModel,
          });
      })
      .catch(() => setErr("We couldn't re-check this diagram. Please try again."))
      .finally(() => setReverifying(false));
  }

  // Manual override (founder call 2026-07-18): the tutor overrules a FAIL/ERROR
  // verdict. This PUBLISHES the figure to the student (PASS gates D-IMG-13);
  // Re-verify is the undo (a fresh AI verdict overwrites the override).
  function overrideVerdict() {
    if (!img.imageId || overriding) return;
    setOverriding(true);
    setErr(null);
    trpc.tutor.overrideQuestionImage
      .mutate({ questionId: card.id, imageId: img.imageId })
      .then((r) =>
        setImg({ imageId: r.imageId, verifierLabel: r.label, verifierModel: r.model }),
      )
      .catch(() => setErr("We couldn't mark this diagram as verified. Please try again."))
      .finally(() => setOverriding(false));
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
        {img.imageId && (
          <VerifierBadge imageId={img.imageId} label={img.verifierLabel} model={img.verifierModel} />
        )}
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
            src={`/content/image/${img.imageId}?board=${getBoard() ?? ""}`}
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
            {(img.verifierLabel === "FAIL" || img.verifierLabel === "ERROR") && (
              <button
                className="tut-auth-fig-link tut-auth-fig-override"
                onClick={overrideVerdict}
                disabled={disabled || overriding || reverifying || generating}
                title="Overrule the automatic check — the figure will be shown to the student"
              >
                {overriding ? "Marking…" : "Mark as correct"}
              </button>
            )}
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
