import { useEffect, useMemo, useState } from "react";
import { trpc, BOARD } from "../trpc";
import "./practice.css";

// The Practice surface (Slice L) — self-serve subjective practice capture.
//   pick a sub_topic → start a session → answer each question (text + confidence
//   + timing) → submit → reference answer revealed for self-study → next.
// Every submit/skip persists an `attempt` server-side. NO grade, NO mastery.
// Nav reuses revision.getChapterNav (the board's sub_topic tree); a sub_topic
// with no seeded questions surfaces a gentle empty state (NO_QUESTIONS).
// All classes are `.prac-`-scoped (the revision-shell.css global-leak discipline).

type Nav = Awaited<ReturnType<typeof trpc.revision.getChapterNav.query>>;
type Session = Awaited<ReturnType<typeof trpc.practice.startSession.mutate>>;
type AttemptResult = Awaited<ReturnType<typeof trpc.practice.submitAttempt.mutate>>;
type Assignment = Awaited<
  ReturnType<typeof trpc.practice.listAssignments.query>
>[number];

type Picker = { id: string; name: string; topicName: string };
type Phase = "picking" | "answering" | "revealed" | "completed";

export function PracticePage() {
  const [nav, setNav] = useState<Nav | null>(null);
  const [assignments, setAssignments] = useState<Assignment[] | null>(null);
  const [phase, setPhase] = useState<Phase>("picking");
  const [error, setError] = useState<string | null>(null);

  // active session state
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [idx, setIdx] = useState(0);
  const [question, setQuestion] = useState<Session["question"]>(null);
  const [startedAt, setStartedAt] = useState(0);

  // answer-in-progress
  const [answer, setAnswer] = useState("");
  const [confidence, setConfidence] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  // reveal state (post-submit)
  const [reveal, setReveal] = useState<AttemptResult["reveal"] | null>(null);
  const [pendingNext, setPendingNext] = useState<Session["question"]>(null);
  const [pendingCompleted, setPendingCompleted] = useState(false);

  const subTopics = useMemo<Picker[]>(() => {
    const out: Picker[] = [];
    for (const ch of nav ?? [])
      for (const tp of ch.topics)
        for (const st of tp.subTopics)
          out.push({ id: st.id, name: st.name, topicName: tp.name });
    return out;
  }, [nav]);

  // 1A — drives the loud assigned-vs-browse split: a non-empty open-assignment
  // set makes the browse list subordinate ("Or practice any topic").
  const hasAssigned = useMemo(
    () => (assignments ?? []).some((a) => !a.completed),
    [assignments],
  );

  const loadAssignments = () => {
    trpc.practice.listAssignments
      .query()
      .then(setAssignments)
      .catch(() => setAssignments([]));
  };

  useEffect(() => {
    trpc.revision.getChapterNav
      .query()
      .then(setNav)
      .catch((e) => setError(String(e?.message ?? e)));
    loadAssignments();
  }, []);

  const beginQuestion = (q: Session["question"]) => {
    setQuestion(q);
    setAnswer("");
    setConfidence(null);
    setReveal(null);
    setStartedAt(Date.now());
    setPhase("answering");
  };

  const pick = async (subTopicId: string, assignmentId?: string) => {
    setError(null);
    setBusy(true);
    try {
      const s = await trpc.practice.startSession.mutate({
        subTopicId,
        ...(assignmentId ? { assignmentId } : {}),
      });
      setSessionId(s.sessionId);
      setTotal(s.total);
      setIdx(s.currentIndex);
      if (s.status === "completed" || !s.question) {
        setPhase("completed");
      } else {
        beginQuestion(s.question);
      }
    } catch (e: any) {
      const msg = String(e?.message ?? e);
      setError(msg.includes("NO_QUESTIONS") ? "NO_QUESTIONS" : msg);
    } finally {
      setBusy(false);
    }
  };

  const afterAttempt = (r: AttemptResult) => {
    setReveal(r.reveal);
    setPendingNext(r.next);
    setPendingCompleted(r.completed);
    setIdx(r.currentIndex);
    setPhase("revealed");
  };

  const submit = async () => {
    if (!sessionId || !question || !answer.trim() || confidence == null) return;
    setBusy(true);
    setError(null);
    try {
      const r = await trpc.practice.submitAttempt.mutate({
        sessionId,
        questionId: question.id,
        answerText: answer.trim(),
        confidence,
        timeMs: Math.max(0, Date.now() - startedAt),
      });
      afterAttempt(r);
    } catch (e: any) {
      setError(String(e?.message ?? e));
    } finally {
      setBusy(false);
    }
  };

  const doSkip = async () => {
    if (!sessionId || !question) return;
    setBusy(true);
    setError(null);
    try {
      const r = await trpc.practice.skip.mutate({
        sessionId,
        questionId: question.id,
        reason: null,
      });
      afterAttempt(r);
    } catch (e: any) {
      setError(String(e?.message ?? e));
    } finally {
      setBusy(false);
    }
  };

  const next = () => {
    if (pendingCompleted || !pendingNext) {
      setPhase("completed");
    } else {
      beginQuestion(pendingNext);
    }
  };

  const backToTopics = () => {
    setPhase("picking");
    setSessionId(null);
    setQuestion(null);
    setReveal(null);
    setError(null);
    loadAssignments(); // refresh progress after working through a session
  };

  // ── render ──────────────────────────────────────────────────────────────
  return (
    <div className="prac-wrap">
      <header className="prac-head">
        <p className="prac-eyebrow">Practice</p>
        <h1 className="prac-title">Subjective practice</h1>
        <p className="prac-sub">
          Answer in your own words. There’s no grade — you’ll see a model answer
          after each one to check yourself against.
        </p>
      </header>

      {phase === "picking" && (
        <>
          <AssignedList assignments={assignments} busy={busy} onPick={pick} />
          <PickList
            subTopics={subTopics}
            loading={!nav && !error}
            busy={busy}
            error={error}
            hasAssigned={hasAssigned}
            onPick={(id) => pick(id)}
          />
        </>
      )}

      {phase !== "picking" && (
        <section className="prac-stage">
          <div className="prac-progress">
            <button className="prac-link" onClick={backToTopics}>
              ← Topics
            </button>
            <span className="prac-count">
              {phase === "completed"
                ? `${total} / ${total}`
                : `${Math.min(idx + 1, total)} / ${total}`}
            </span>
          </div>

          {phase === "completed" ? (
            <div className="prac-card prac-done">
              <h2 className="prac-done-title">Practice complete 🎉</h2>
              <p className="prac-sub">
                You worked through all {total} question{total === 1 ? "" : "s"}.
                Your answers are saved.
              </p>
              <button className="prac-btn prac-btn-primary" onClick={backToTopics}>
                Pick another topic
              </button>
            </div>
          ) : (
            question && (
              <div className="prac-card">
                <div className="prac-qhead">
                  <span className={`prac-axis prac-axis--${question.axis}`}>
                    {question.axis}
                  </span>
                </div>
                <p className="prac-stem">{question.stem}</p>
                {question.imageId && (
                  <img
                    className="prac-figure"
                    src={`/content/image/${question.imageId}?board=${BOARD}`}
                    alt="Question figure"
                    loading="lazy"
                  />
                )}

                {phase === "answering" && (
                  <>
                    <textarea
                      className="prac-answer"
                      placeholder="Write your answer…"
                      value={answer}
                      onChange={(e) => setAnswer(e.target.value)}
                      rows={6}
                      autoFocus
                    />
                    <div className="prac-confidence">
                      <span className="prac-conf-label">How sure are you?</span>
                      <div className="prac-conf-scale">
                        {[1, 2, 3, 4, 5].map((n) => (
                          <button
                            key={n}
                            className={`prac-conf-dot${confidence === n ? " is-on" : ""}`}
                            onClick={() => setConfidence(n)}
                            title={`${n}/5`}
                          >
                            {n}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="prac-actions">
                      <button
                        className="prac-btn prac-btn-ghost"
                        onClick={doSkip}
                        disabled={busy}
                      >
                        Skip
                      </button>
                      <button
                        className="prac-btn prac-btn-primary"
                        onClick={submit}
                        disabled={busy || !answer.trim() || confidence == null}
                      >
                        Submit answer
                      </button>
                    </div>
                  </>
                )}

                {phase === "revealed" && reveal && (
                  <div className="prac-reveal">
                    {answer.trim() && (
                      <div className="prac-yours">
                        <p className="prac-reveal-label">Your answer</p>
                        <p className="prac-yours-text">{answer.trim()}</p>
                      </div>
                    )}
                    <div className="prac-model">
                      <p className="prac-reveal-label">Model answer</p>
                      <p className="prac-model-text">{reveal.referenceAnswer}</p>
                      {reveal.explanation && (
                        <p className="prac-explain">{reveal.explanation}</p>
                      )}
                    </div>
                    <div className="prac-actions">
                      <button className="prac-btn prac-btn-primary" onClick={next}>
                        {pendingCompleted ? "Finish" : "Next question"}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          )}

          {error && <p className="prac-error">{error}</p>}
        </section>
      )}
    </div>
  );
}

// Slice ASG — the student's tutor-assigned work, shown above self-serve. Each
// assignment lists its sub_topics with start/complete status; clicking one opens
// the same stepper but stamped with the assignment (origin='tutor_assigned').
function AssignedList({
  assignments,
  busy,
  onPick,
}: {
  assignments: Assignment[] | null;
  busy: boolean;
  onPick: (subTopicId: string, assignmentId: string) => void;
}) {
  if (!assignments || assignments.length === 0) return null;
  const open = assignments.filter((a) => !a.completed);
  if (open.length === 0) return null;
  return (
    <section className="prac-assigned">
      <p className="prac-assigned-eyebrow">From your tutor</p>
      <h2 className="prac-assigned-title">
        Assigned to you
        <span className="prac-assigned-count">{open.length}</span>
      </h2>
      <div className="prac-assigned-list">
        {open.map((a) => (
          <div key={a.id} className="prac-assigned-card">
            <div className="prac-assigned-head">
              <span className={`prac-assigned-mode prac-assigned-mode--${a.mode}`}>
                {a.mode === "interleaved" ? "Mixed set" : "Focused"}
              </span>
              <span className="prac-assigned-scope">
                {a.subjectName ?? a.chapterName ?? ""}
              </span>
              <span className="prac-assigned-progress">
                {a.completedCount} / {a.total} done
              </span>
            </div>
            <ul className="prac-assigned-sts">
              {a.subTopics.map((st) => {
                const done = st.sessionStatus === "completed";
                return (
                  <li key={st.subTopicId}>
                    <button
                      className={`prac-assigned-st${done ? " is-done" : ""}`}
                      onClick={() => onPick(st.subTopicId, a.id)}
                      disabled={busy}
                    >
                      <span className="prac-assigned-st-name">
                        {st.subTopicName}
                        <span className="prac-assigned-st-crumb">{st.chapterName}</span>
                      </span>
                      <span className="prac-assigned-st-status">
                        {done
                          ? "✓ done"
                          : st.sessionStatus === "active"
                            ? "continue →"
                            : "start →"}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}

function PickList({
  subTopics,
  loading,
  busy,
  error,
  hasAssigned,
  onPick,
}: {
  subTopics: Picker[];
  loading: boolean;
  busy: boolean;
  error: string | null;
  hasAssigned: boolean;
  onPick: (id: string) => void;
}) {
  if (loading) return <p className="prac-muted">Loading topics…</p>;
  return (
    <section className="prac-picklist">
      <h2 className="prac-browse-title">
        {hasAssigned ? "Or practice any topic" : "Practice any topic"}
      </h2>
      {error === "NO_QUESTIONS" && (
        <p className="prac-note">
          No practice questions for that topic yet — try another.
        </p>
      )}
      {error && error !== "NO_QUESTIONS" && <p className="prac-error">{error}</p>}
      {subTopics.length === 0 && (
        <p className="prac-muted">No topics available.</p>
      )}
      <ul className="prac-pick-ul">
        {subTopics.map((st) => (
          <li key={st.id}>
            <button
              className="prac-pick"
              onClick={() => onPick(st.id)}
              disabled={busy}
            >
              <span className="prac-pick-name">{st.name}</span>
              <span className="prac-pick-topic">{st.topicName}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
