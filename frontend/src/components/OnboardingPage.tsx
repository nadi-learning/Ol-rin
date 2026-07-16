import { useEffect, useMemo, useRef, useState } from "react";
import { ONBOARDING_ANSWER_COLUMNS, type OnboardingStep } from "@b2c/kernel/contracts";
import { trpc } from "../trpc";
import { useTypewriter } from "../lib/useTypewriter";
import pikachuWave from "../assets/pikachu-wave.png";
import {
  BEATS,
  BEAT_BY_ID,
  LOADER_LINES,
  LOADER_MIN_MS,
  LOADER_TITLE,
  LORE_CLOSER,
  firstName,
  pikachuLine,
} from "./onboarding.copy";
import type { Beat } from "./onboarding.copy";
import "./onboarding.css";

// Slice ONB-1 Stage 2 — the conversational welcome, first LOGIN (not signup;
// the platform is whitelist-gated, so we already know who this is).
//
// This component is a DUMB WALKER over onboarding.copy.ts. It owns no words.
// The ORDER comes from the server (ONBOARDING_STEPS) via `currentStep`, so a
// resumed student lands on the beat the server thinks they're on — never a
// client guess.
//
// D-ONB-1 write-per-answer: every beat commits before the next one renders, so
// closing the tab at beat 4 resumes at beat 4. That is also why there is no
// "submit everything at the end" — a refresh is the common case for a child on
// a phone, and a client-side buffer would lose the lot.

type Phase = "typing" | "input" | "reacting";

type Entry = { who: "olorin" | "student"; text: string };

const TYPE_MS = 26;
const REACTION_HOLD_MS = 900;

export function OnboardingPage({
  studentName,
  initialStep,
  initialAnswers,
  onDone,
}: {
  studentName: string;
  initialStep: OnboardingStep;
  initialAnswers: { grade: string | null; school: string | null; favCharacter: string | null; phone: string | null };
  onDone: () => void;
}) {
  const reducedMotion = useRef(
    typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches,
  ).current;

  // Resume at the server's beat. `done` means the answers are all in but
  // complete() never landed (a tab closed on the loader) — go straight to it.
  const [stepId, setStepId] = useState<OnboardingStep>(initialStep);
  const [phase, setPhase] = useState<Phase>("typing");
  const [transcript, setTranscript] = useState<Entry[]>([]);
  const [draft, setDraft] = useState("");
  const [grades, setGrades] = useState<string[]>([]);
  const [answers, setAnswers] = useState(initialAnswers);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reaction, setReaction] = useState("");
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const beat: Beat | undefined = BEAT_BY_ID[stepId];
  const name = useMemo(() => firstName(studentName), [studentName]);

  // Grade chips are the board's REAL distinct subject.grade values (D-ONB-2) —
  // fetched once, not hardcoded, so they can't drift from the catalogue.
  useEffect(() => {
    trpc.onboarding.listGradeOptions
      .query()
      .then(setGrades)
      .catch(() => setGrades([]));
  }, []);

  const promptText = beat ? beat.prompt.replace("{name}", name) : "";
  const { visible: typedPrompt, done: promptDone } = useTypewriter(
    promptText,
    !reducedMotion && phase === "typing",
    TYPE_MS,
  );

  useEffect(() => {
    if (phase === "typing" && promptDone) setPhase("input");
  }, [phase, promptDone]);

  // `promptDone` is load-bearing here, not incidental: the Pikachu block and
  // every `sub` line only mount once the typewriter finishes. Without it in the
  // deps they render BELOW the fold and the scroll never chases them — the
  // Pikachu payoff, the entire reason that beat exists, was invisible.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [transcript, phase, reaction, promptDone]);

  // The loader beat. A minimum dwell (LOADER_MIN_MS) so finishing reads as
  // deliberate rather than as a hang — and so a fast complete() doesn't flash.
  if (stepId === "done") {
    return <OnboardingLoader onDone={onDone} />;
  }

  if (!beat) {
    // A step the copy file doesn't know (contracts gained a beat, copy didn't).
    // Never trap the student in a broken welcome — let them through (G3).
    onDone();
    return null;
  }

  async function commit(value: string | null) {
    if (!beat || saving) return;
    setSaving(true);
    setError(null);
    try {
      // A talk-only beat (greet/pikachu/lore) must POST a NULL value even when
      // the student tapped a chip. `lore`'s Yes/No is THEATRE — both paths land
      // the same reveal and nothing is stored — but sending "No" made the
      // server reject the step ("step 'lore' does not take an answer") and the
      // flow dead-ended at beat 7, unfinishable.
      //
      // Keyed off ONBOARDING_ANSWER_COLUMNS — the SAME contract the server
      // validates against — so a new beat can't drift the two apart. The tapped
      // value still drives the reaction + the transcript bubble; it just isn't
      // persisted.
      const persists = Boolean(
        (ONBOARDING_ANSWER_COLUMNS as Record<string, string | undefined>)[beat.id],
      );
      const next = await trpc.onboarding.saveStep.mutate({
        step: beat.id,
        value: persists ? value : null,
      });
      setAnswers(next.answers);

      const entries: Entry[] = [{ who: "olorin", text: promptText }];
      if (value) entries.push({ who: "student", text: value });

      const said = beat.reaction(value);
      setTranscript((t) => [...t, ...entries]);
      setDraft("");

      if (said) {
        setReaction(said);
        setPhase("reacting");
        // Let the reaction land before the next ask — this pause is what makes
        // it read as a reply rather than a form advancing.
        setTimeout(() => {
          setTranscript((t) => [
            ...t,
            { who: "olorin", text: said },
            ...(beat.id === "lore" ? [{ who: "olorin" as const, text: LORE_CLOSER }] : []),
          ]);
          setReaction("");
          setStepId(next.currentStep);
          setPhase("typing");
        }, REACTION_HOLD_MS);
      } else {
        setStepId(next.currentStep);
        setPhase("typing");
      }
    } catch (e: any) {
      // saveStep deliberately does NOT fail open — a dropped answer would make
      // the flow lie about having saved. So surface it and let them retry.
      setError(String(e?.message ?? e).replace(/^BAD_REQUEST:\s*/, ""));
    } finally {
      setSaving(false);
    }
  }

  const chips =
    beat.input.kind === "chips"
      ? beat.input.source === "grades"
        ? grades
        : (beat.input.chips ?? [])
      : [];

  return (
    <div className="onb-root">
      <div className="onb-card">
        <div className="onb-scroll" ref={scrollRef}>
          {transcript.map((e, i) => (
            <div key={i} className={e.who === "olorin" ? "onb-line onb-line-olorin" : "onb-line onb-line-student"}>
              {e.text}
            </div>
          ))}

          {phase !== "reacting" && (
            <div className="onb-line onb-line-olorin onb-line-live">
              {phase === "typing" ? typedPrompt : promptText}
              {phase === "typing" && !promptDone && <span className="onb-caret" />}
            </div>
          )}

          {phase !== "reacting" && beat.sub && promptDone && (
            <div className="onb-sub">{beat.sub}</div>
          )}

          {beat.id === "pikachu" && promptDone && phase !== "reacting" && (
            <div className="onb-pika">
              <img src={pikachuWave} alt="" className="onb-pika-img" />
              <div className="onb-pika-say">{pikachuLine(answers.favCharacter)}</div>
            </div>
          )}

          {reaction && <div className="onb-line onb-line-olorin onb-line-live">{reaction}</div>}
        </div>

        {phase === "input" && (
          <div className="onb-input">
            {error && <div className="onb-error">{error}</div>}

            {beat.input.kind === "none" && (
              <button className="onb-btn" disabled={saving} onClick={() => commit(null)}>
                {beat.input.cta}
              </button>
            )}

            {beat.input.kind === "chips" && (
              <div className="onb-chips">
                {chips.length === 0 && beat.input.source === "grades" ? (
                  // No grades on the board = nothing truthful to offer. Let them
                  // past rather than trap them behind an empty chip row.
                  <button className="onb-btn" disabled={saving} onClick={() => setStepId("school")}>
                    Skip
                  </button>
                ) : (
                  chips.map((c) => (
                    <button key={c} className="onb-chip" disabled={saving} onClick={() => commit(c)}>
                      {c}
                    </button>
                  ))
                )}
              </div>
            )}

            {beat.input.kind === "text" && (
              <form
                className="onb-form"
                onSubmit={(ev) => {
                  ev.preventDefault();
                  if (draft.trim() || beat.optional) commit(draft.trim() || null);
                }}
              >
                <input
                  className="onb-field"
                  value={draft}
                  autoFocus
                  placeholder={beat.input.placeholder}
                  onChange={(ev) => setDraft(ev.target.value)}
                  disabled={saving}
                />
                <button className="onb-btn" type="submit" disabled={saving || (!draft.trim() && !beat.optional)}>
                  {saving ? "…" : "Send"}
                </button>
                {beat.optional && (
                  <button
                    type="button"
                    className="onb-skip"
                    disabled={saving}
                    onClick={() => commit(null)}
                  >
                    Skip
                  </button>
                )}
              </form>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * The close. Commits complete() while Pikachu covers the latency, with a
 * minimum dwell so a fast commit doesn't flash past.
 *
 * The fun activity here is deliberately under-specified (founder: "will think
 * about this later") — it is isolated to LOADER_* in the copy file so replacing
 * it never touches this component.
 */
function OnboardingLoader({ onDone }: { onDone: () => void }) {
  const [line, setLine] = useState(0);

  useEffect(() => {
    const started = Date.now();
    const rotate = setInterval(() => setLine((i) => (i + 1) % LOADER_LINES.length), 700);

    trpc.onboarding.complete
      .mutate()
      .catch(() => {
        // Never strand a student on the loader because the final flip failed —
        // every answer is already committed (D-ONB-1), so the worst case is
        // seeing the welcome once more. Landing them in the product beats
        // holding them here.
      })
      .finally(() => {
        const wait = Math.max(0, LOADER_MIN_MS - (Date.now() - started));
        setTimeout(onDone, wait);
      });

    return () => clearInterval(rotate);
  }, [onDone]);

  return (
    <div className="onb-root">
      <div className="onb-card onb-card-loader">
        <img src={pikachuWave} alt="" className="onb-loader-img" />
        <div className="onb-loader-title">{LOADER_TITLE}</div>
        <div className="onb-loader-line">{LOADER_LINES[line]}</div>
        <div className="onb-loader-bar">
          <span />
        </div>
      </div>
    </div>
  );
}
