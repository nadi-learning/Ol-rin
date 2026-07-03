// QuickCheck (Slice A) — in-slide MCQs, SERVER-CHECKED.
//
// Ported from prod `frontend/src/components/revision/QuestionsPanel.jsx`, but
// wired to the rewrite's two tRPC procedures instead of the prod REST routes:
//   - revision.getQuestions({subTopicId})  → one random question per slot, with
//     NO answer key (the key never reaches the client until a check)
//   - revision.checkAnswer({subTopicId, questionId, answer}) → server grades it
//     and only then returns correctAnswer + explanation.
//
// One question at a time (stepper): select an option → "Check answer" → feedback
// → "Next". Each check is RECORDED server-side to event_log (D-A-1 closure /
// D-MCQ-1) — record-only, no scoring; the FE just supplies the time-on-question.
//
// All class names are scoped under `.qc-root` (see quick-check.css) so they
// can't collide with the verbatim Starkhorn `revision-shell.css` globals.

import { useCallback, useEffect, useRef, useState } from "react";
import { trpc } from "../trpc";
import "./quick-check.css";

type Question = Awaited<
  ReturnType<typeof trpc.revision.getQuestions.query>
>["questions"][number];
type Verdict = Awaited<ReturnType<typeof trpc.revision.checkAnswer.mutate>>;

export function QuickCheck({ subTopicId }: { subTopicId: string }) {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(false);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [results, setResults] = useState<Record<string, Verdict>>({});
  const [submitting, setSubmitting] = useState<Record<string, boolean>>({});
  const [currentIdx, setCurrentIdx] = useState(0);

  // when the visible question started (for the time-on-question evidence signal);
  // a ref so reading it at submit doesn't re-bind the submit callback.
  const shownAtRef = useRef<number>(Date.now());
  useEffect(() => {
    shownAtRef.current = Date.now();
  }, [currentIdx]);

  // (re)load whenever the sub-topic changes
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setQuestions([]);
    setAnswers({});
    setResults({});
    setSubmitting({});
    setCurrentIdx(0);
    shownAtRef.current = Date.now();

    trpc.revision.getQuestions
      .query({ subTopicId })
      .then((data) => {
        if (cancelled) return;
        setQuestions(data.questions);
      })
      .catch(() => {
        if (!cancelled) setQuestions([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [subTopicId]);

  const handleSelect = useCallback(
    (questionId: string, label: string) => {
      if (results[questionId]) return; // locked once checked
      setAnswers((prev) => ({ ...prev, [questionId]: label }));
    },
    [results],
  );

  const handleSubmit = useCallback(
    async (questionId: string) => {
      const selected = answers[questionId];
      if (!selected || results[questionId]) return;
      setSubmitting((prev) => ({ ...prev, [questionId]: true }));
      try {
        const verdict = await trpc.revision.checkAnswer.mutate({
          subTopicId,
          questionId,
          answer: selected,
          timeMs: Math.max(0, Date.now() - shownAtRef.current),
        });
        setResults((prev) => ({ ...prev, [questionId]: verdict }));
      } catch {
        // silent — the student can retry
      } finally {
        setSubmitting((prev) => ({ ...prev, [questionId]: false }));
      }
    },
    [answers, results, subTopicId],
  );

  if (!loading && questions.length === 0) return null;

  const remaining = questions.filter((qu) => !results[qu.id]).length;
  const q = questions[currentIdx];
  const selected = q ? answers[q.id] : undefined;
  const result = q ? results[q.id] : undefined;
  const isSubmitting = q ? submitting[q.id] : false;

  const nextUnanswered = () => {
    for (let i = currentIdx + 1; i < questions.length; i++) {
      if (!results[questions[i]!.id]) return i;
    }
    return -1;
  };
  const next = nextUnanswered();

  const optionClass = (label: string) => {
    let cls = "qc-option";
    if (result) {
      if (label === result.correctAnswer) cls += " is-correct";
      else if (label === selected) cls += " is-incorrect";
    } else if (label === selected) {
      cls += " is-selected";
    }
    return cls;
  };

  return (
    <div className="qc-root">
      {loading ? (
        <p className="qc-loading">Loading Quick Check…</p>
      ) : q ? (
        <div className="qc-card">
          {questions.length > 1 && (
            <div className="qc-progress">
              {questions.map((qu, i) => {
                const r = results[qu.id];
                let tone = "idle";
                if (r) tone = r.isCorrect ? "correct" : "incorrect";
                else if (i === currentIdx) tone = "current";
                return <div key={qu.id} className={`qc-seg qc-seg--${tone}`} />;
              })}
            </div>
          )}

          <div className="qc-header">
            <span className="qc-label">Quick Check</span>
            <span className="qc-count">{remaining} remaining</span>
          </div>
          <p className="qc-question">{q.question}</p>

          <div className="qc-options">
            {q.options.map((opt) => (
              <button
                key={opt.label}
                className={optionClass(opt.label)}
                onClick={() => handleSelect(q.id, opt.label)}
                disabled={!!result}
              >
                <span className="qc-option-letter">{opt.label}</span>
                <span>{opt.text}</span>
              </button>
            ))}
          </div>

          {selected && !result && (
            <button
              className="qc-check-btn"
              onClick={() => handleSubmit(q.id)}
              disabled={isSubmitting}
            >
              {isSubmitting ? "Checking…" : "Check answer"}
            </button>
          )}

          {result && (
            <div className={`qc-feedback qc-feedback--${result.isCorrect ? "correct" : "incorrect"}`}>
              <p className="qc-feedback-title">
                {result.isCorrect
                  ? `Correct! +${result.marksAwarded} mark${result.marksMax !== 1 ? "s" : ""}`
                  : "Not quite"}
              </p>
              {result.explanation && <p className="qc-feedback-text">{result.explanation}</p>}
              <div className="qc-feedback-foot">
                {next !== -1 ? (
                  <button className="qc-next-btn" onClick={() => setCurrentIdx(next)}>
                    Next question
                  </button>
                ) : (
                  <p className="qc-done">All done!</p>
                )}
              </div>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
