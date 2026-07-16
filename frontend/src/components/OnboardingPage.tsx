import { useEffect, useMemo, useRef, useState } from "react";
import {
  ONBOARDING_ANSWER_COLUMNS,
  ONBOARDING_STEPS,
  type OnboardingStep,
} from "@b2c/kernel/contracts";
import { trpc } from "../trpc";
import { useTypewriter } from "../lib/useTypewriter";
import pikachuWave from "../assets/pikachu-wave.png";
import {
  BEAT_BY_ID,
  LOADER_LINES,
  LOADER_MIN_MS,
  firstName,
  loaderPetEmoji,
  loaderPikaSay,
  loaderTitle,
  pikachuLine,
} from "./onboarding.copy";
import type { Beat, BeatCtx, ChipOption } from "./onboarding.copy";
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
//
// 🔴 NO TRANSCRIPT (S90, founder call). One question is on screen at a time:
// ask → answer → Olórin's reply, alone → next ask. The scrolling chat log this
// replaced buried the live question under history that nobody re-reads, and it
// grew until the thing you were meant to answer sat below the fold. Nothing
// here is lost by forgetting it — every answer is already committed server-side
// the moment it's given.

type Phase = "typing" | "input" | "reacting";

// S90: retuned to the Revision-landing feel (founder feedback) — 45ms is the
// landing hero's exact speed; the hold grew because the reaction is now the
// only thing on screen, not a bubble in a stream. LEAD_IN_MS holds the first
// beat until the student is actually looking: after the login redirect the
// greet used to start typing immediately and was fully settled by the time
// their eyes landed on the tab — theatre without an audience.
const TYPE_MS = 45;
const REACTION_HOLD_MS = 1800;
const LEAD_IN_MS = 500;

export function OnboardingPage({
  studentName,
  initialStep,
  initialAnswers,
  onDone,
}: {
  studentName: string;
  initialStep: OnboardingStep;
  initialAnswers: BeatCtx["answers"];
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
  const [draft, setDraft] = useState("");
  const [grades, setGrades] = useState<string[]>([]);
  const [answers, setAnswers] = useState(initialAnswers);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reaction, setReaction] = useState("");
  // S91 — the "something else" hatch on a chip beat. Local, not a step: tapping
  // it swaps the chips for a text field in place. Nothing commits until they
  // send, so abandoning here resumes on the chips with nothing lost — which is
  // why this doesn't need to exist on the server.
  const [otherOpen, setOtherOpen] = useState(false);

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

  // `begun` gates the FIRST keystroke on (a) the tab being visible and (b) a
  // short lead-in. Without it the greet types during the login redirect — in a
  // background tab, or before the student has even looked — and what they see
  // is a fully-settled screen with no typing at all (S90, founder feedback).
  const [begun, setBegun] = useState(false);
  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | undefined;
    const arm = () => {
      t = setTimeout(() => setBegun(true), LEAD_IN_MS);
    };
    if (document.visibilityState === "visible") {
      arm();
    } else {
      const onVis = () => {
        if (document.visibilityState === "visible") {
          document.removeEventListener("visibilitychange", onVis);
          arm();
        }
      };
      document.addEventListener("visibilitychange", onVis);
      return () => {
        document.removeEventListener("visibilitychange", onVis);
        if (t) clearTimeout(t);
      };
    }
    return () => {
      if (t) clearTimeout(t);
    };
  }, []);

  const ctx: BeatCtx = { name, answers };
  const promptText = beat
    ? (typeof beat.prompt === "function" ? beat.prompt(ctx) : beat.prompt).replace("{name}", name)
    : "";
  const subText = beat?.sub
    ? (typeof beat.sub === "function" ? beat.sub(ctx) : beat.sub).replace("{name}", name)
    : "";

  // Empty text until `begun`: the hook treats animate=false as "render it all
  // instantly", so holding the TEXT back (not the animate flag) is what keeps
  // the stage blank-with-caret during the lead-in. Reduced motion skips the
  // wait — instant is that path's contract.
  const { visible: typedPrompt, done: typedDone } = useTypewriter(
    begun || reducedMotion ? promptText : "",
    !reducedMotion && phase === "typing",
    TYPE_MS,
  );
  const promptDone = (begun || reducedMotion) && typedDone;

  useEffect(() => {
    if (phase === "typing" && promptDone) setPhase("input");
  }, [phase, promptDone]);

  // The loader beat. A minimum dwell (LOADER_MIN_MS) so finishing reads as
  // deliberate rather than as a hang — and so a fast complete() doesn't flash.
  // S91: it needs the pet, because the close IS the pet arriving.
  if (stepId === "done") {
    return <OnboardingLoader pet={answers.pet} onDone={onDone} />;
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
      // value still drives the reaction; it just isn't persisted.
      const persists = Boolean(
        (ONBOARDING_ANSWER_COLUMNS as Record<string, string | undefined>)[beat.id],
      );
      const next = await trpc.onboarding.saveStep.mutate({
        step: beat.id,
        value: persists ? value : null,
      });
      setAnswers(next.answers);
      setDraft("");
      // The hatch belongs to the beat we're leaving, not the next one.
      setOtherOpen(false);

      const said = beat.reaction(value);

      if (said) {
        setReaction(said);
        setPhase("reacting");
        // Let the reaction land before the next ask — this pause is what makes
        // it read as a reply rather than a form advancing. It is the only thing
        // on screen now, so it holds longer than it did as a chat bubble.
        setTimeout(() => {
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

  // Grade chips arrive as bare strings from the server; literal chips are
  // authored as {value,label} because what persists and what's readable are
  // not the same thing (fav_character stores 'iron_man', shows "Iron Man").
  const chips: ChipOption[] =
    beat.input.kind === "chips"
      ? beat.input.source === "grades"
        ? grades.map((g) => ({ value: g, label: g }))
        : (beat.input.chips ?? [])
      : [];
  const bigChips = beat.input.kind === "chips" && beat.input.big === true;
  const cardChips = beat.input.kind === "chips" && beat.input.cards === true;
  const other = beat.input.kind === "chips" ? beat.input.other : undefined;
  const chipsClass = cardChips
    ? "onb-chips is-cards"
    : bigChips
      ? "onb-chips is-big"
      : "onb-chips";

  return (
    <div className="onb-root">
      <div className="onb-card">
        <div className="onb-stagewrap">
          {/* The live beat, alone. `key={stepId}` replays the settle animation
              per beat: a new beat is a new mount. */}
          {phase !== "reacting" && (
            <div key={stepId} className="onb-stage">
              <div className="onb-stage-prompt">
                {phase === "typing" ? typedPrompt : promptText}
                {phase === "typing" && !promptDone && <span className="onb-caret" />}
              </div>

              {subText && promptDone && <div className="onb-sub">{subText}</div>}

              {beat.id === "pikachu" && promptDone && (
                <div className="onb-pika">
                  <img src={pikachuWave} alt="" className="onb-pika-img" />
                  <div className="onb-pika-say">{pikachuLine(answers.favCharacter)}</div>
                </div>
              )}
            </div>
          )}

          {reaction && <div className="onb-react">{reaction}</div>}
        </div>

        {phase === "input" && (
          <div className="onb-input">
            {error && <div className="onb-error">{error}</div>}

            {beat.input.kind === "none" && (
              <button className="onb-btn" disabled={saving} onClick={() => commit(null)}>
                {beat.input.cta}
              </button>
            )}

            {/* S91 — the "something else" hatch, once tapped, replaces the
                chips with a text field for THIS beat. Same commit path: the
                typed value is the answer. `back` is not optional politeness —
                without it a mis-tap traps a student on a text field for a
                question that was always meant to be a pick. */}
            {beat.input.kind === "chips" && otherOpen && other && (
              <form
                className="onb-form"
                onSubmit={(ev) => {
                  ev.preventDefault();
                  if (draft.trim()) commit(draft.trim());
                }}
              >
                <input
                  className="onb-field"
                  value={draft}
                  autoFocus
                  placeholder={other.placeholder}
                  onChange={(ev) => setDraft(ev.target.value)}
                  disabled={saving}
                />
                <button className="onb-btn" type="submit" disabled={saving || !draft.trim()}>
                  {saving ? "…" : "Send"}
                </button>
                <button
                  type="button"
                  className="onb-skip"
                  disabled={saving}
                  onClick={() => {
                    setOtherOpen(false);
                    setDraft("");
                  }}
                >
                  {other.back}
                </button>
              </form>
            )}

            {beat.input.kind === "chips" && !otherOpen && (
              <div className={chipsClass}>
                {chips.length === 0 && beat.input.source === "grades" ? (
                  // No grades on the board = nothing truthful to offer. Let them
                  // past rather than trap them behind an empty chip row.
                  //
                  // This CANNOT go through commit(): grade is required
                  // server-side (D-ONB-2), so a null would be rejected and the
                  // student would be stuck on an unanswerable beat. So it walks
                  // the client past it without persisting — the grade stays
                  // NULL, complete() still finishes the flow, and a refresh
                  // simply lands back here (an empty-catalogue board is broken
                  // configuration, not a state we can resume out of).
                  //
                  // The successor is read from ONBOARDING_STEPS — the SAME
                  // ordered contract the server advances by. It used to be the
                  // literal "school", which S90 deleted: a hardcoded next step
                  // is a drift waiting to happen.
                  <button
                    className="onb-btn"
                    disabled={saving}
                    onClick={() => {
                      const after = ONBOARDING_STEPS[ONBOARDING_STEPS.indexOf(beat.id) + 1];
                      if (after) {
                        setStepId(after);
                        setPhase("typing");
                      }
                    }}
                  >
                    Skip
                  </button>
                ) : (
                  <>
                    {chips.map((c) => (
                      <button
                        key={c.value}
                        className={bigChips || cardChips ? "onb-choice" : "onb-chip"}
                        disabled={saving}
                        onClick={() => commit(c.value)}
                      >
                        {c.emoji && (
                          <span className="onb-choice-emoji" aria-hidden="true">
                            {c.emoji}
                          </span>
                        )}
                        <span className="onb-choice-label">{c.label}</span>
                        {c.hint && <span className="onb-choice-hint">{c.hint}</span>}
                      </button>
                    ))}
                  </>
                )}
              </div>
            )}

            {/* The hatch is NOT a fifth pet, so it doesn't wear a pet card —
                as one it wrapped onto a row of its own and read as a layout
                accident. A quieter control under the row says what it is: the
                way out of the list. */}
            {beat.input.kind === "chips" && !otherOpen && other && chips.length > 0 && (
              <div className="onb-other-row">
                <button className="onb-other" disabled={saving} onClick={() => setOtherOpen(true)}>
                  {other.emoji && <span aria-hidden="true">{other.emoji} </span>}
                  {other.label}
                </button>
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
 * The close — S91: no longer a spinner with a mascot, but the moment the PET
 * ARRIVES. Pikachu hands it over while complete() commits underneath, with a
 * minimum dwell so a fast commit doesn't flash the delivery past.
 *
 * Every word (including the "2-3 dayssss" line for a pet we have to "arrange")
 * lives in the copy file's loader* helpers. This component only decides WHEN.
 */
function OnboardingLoader({ pet, onDone }: { pet: string | null; onDone: () => void }) {
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
        {/* The pet leads — it is the thing being handed over. Pikachu is the
            courier, so he stands next to it, not in front of it. */}
        <div className="onb-delivery">
          <span className="onb-delivery-pet" aria-hidden="true">
            {loaderPetEmoji(pet)}
          </span>
          <img src={pikachuWave} alt="" className="onb-loader-img" />
        </div>
        <div className="onb-pika-say onb-delivery-say">{loaderPikaSay(pet)}</div>
        <div className="onb-loader-title">{loaderTitle(pet)}</div>
        <div className="onb-loader-line">{LOADER_LINES[line]}</div>
        <div className="onb-loader-bar">
          <span />
        </div>
      </div>
    </div>
  );
}
