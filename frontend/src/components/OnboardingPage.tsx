import { useEffect, useMemo, useRef, useState } from "react";
import {
  ONBOARDING_ANSWER_COLUMNS,
  ONBOARDING_STEPS,
  type OnboardingStep,
} from "@b2c/kernel/contracts";
import { trpc } from "../trpc";
import { useTypewriter } from "../lib/useTypewriter";
import {
  BEAT_BY_ID,
  EPILOGUE_PAGES,
  EPILOGUE_TOTAL_MS,
  HEROES,
  ROTATE_MS,
  companionFor,
  firstName,
  heroesFor,
  loaderPetAlt,
  loaderPetImg,
  petWink,
} from "./onboarding.copy";
import type { Beat, BeatCtx, ChipOption, Scene, StoryPage } from "./onboarding.copy";
import "./onboarding.css";

// Slice ONB-5 (S96) — the STORY onboarding. First LOGIN (not signup; the
// platform is whitelist-gated, so we already know who this is).
// Slice ONB-6 (S103) — the JOURNEY rework: beats can end in Next-gated STORY
// PAGES (hero/pet payoff, the three-page reveal), scenes can be collages, the
// hero/pet speaks one printed line, and the close is a ~45s read-along
// epilogue. All of it client-side — the server's step list is unchanged.
//
// This component is a DUMB WALKER over onboarding.copy.ts. It owns no words and
// no image names — a beat's `scene` tells it what to hang on the wall. The
// ORDER comes from the server (ONBOARDING_STEPS) via `currentStep`, so a
// resumed student lands on the beat the server thinks they're on. Story pages
// add NO steps: a refresh mid-pages resumes at the next beat (payoff skipped,
// never stuck).
//
// D-ONB-1 write-per-answer: every beat commits before the next one renders, so
// closing the tab at beat 4 resumes at beat 4.
//
// 🔴 NO TRANSCRIPT (S90, founder call). One question on screen at a time.

type Phase = "typing" | "input" | "reacting" | "pages";

const TYPE_MS = 45;
const REACTION_HOLD_MS = 1800;
const LEAD_IN_MS = 500;

/**
 * S96 — the art layer. Sits BEHIND the words at low opacity (see onboarding.css)
 * and is `aria-hidden` throughout: it is atmosphere, and a screen reader
 * announcing "sketch of a wizard" between a question and its answer would be
 * noise. The images that carry meaning (the companion sticker, the fellowship
 * trio) are real <img>s with alt text in the card, not here.
 *
 * ⚠️ Every image is sized by CSS `aspect-ratio` + object-fit, NOT height:auto.
 * M44: an un-sized image contributes ZERO height until it decodes, which
 * silently corrupts any layout measured while it loads — and the reveal pair is
 * positioned relative to the stage.
 */
function SceneLayer({
  scene,
  rotateIdx,
  settledImg,
  variant,
}: {
  scene: Scene | undefined;
  rotateIdx: number;
  settledImg?: string;
  /**
   * S103 — how the art must behave on THIS beat, decided by the beat's
   * controls rather than by its art:
   *  - `picker`  the cards are opaque plates in the middle, so the art has to
   *              be spent before the column (founder: "instead of overlapping
   *              the sketch of arya stark and pet keep one image of arya").
   *  - `sticker` the image is a cut-out PNG, not a 3:4 scan, so it must not
   *              take the scan's full-height 3:4 box or its multiply.
   */
  variant?: "picker" | "sticker";
}) {
  if (!scene) return null;
  const v = variant ? ` is-${variant}` : "";

  if (scene.kind === "corners") {
    return (
      <div className={`onb-scene onb-scene-corners${v}`} aria-hidden="true">
        {scene.imgs.slice(0, 4).map((img, i) => (
          <img key={i} src={img} alt="" className={`onb-corner onb-corner-${i + 1}`} />
        ))}
      </div>
    );
  }

  if (scene.kind === "collage") {
    // ONB-6 — the comic page: an optional big main sketch plus slotted corner
    // and mid-edge sketches. Same mask/multiply compositing as the other kinds
    // (S101/S102 — do not re-litigate it), staggered entrances so the page
    // assembles rather than pops.
    return (
      <div className={`onb-scene onb-scene-collage${v}`} aria-hidden="true">
        {scene.main && (
          <img
            src={scene.main.img}
            alt=""
            className={`onb-scene-img onb-main-img ${scene.main.side === "left" ? "is-left" : "is-right"}`}
          />
        )}
        {scene.items.map((it, i) => (
          <img
            key={`${it.slot}-${i}`}
            src={it.img}
            alt=""
            className={`onb-cslot onb-cslot-${it.slot}`}
            style={{ animationDelay: `${0.12 * (i + 1)}s` }}
          />
        ))}
      </div>
    );
  }

  if (scene.kind === "pair") {
    // The reveal: young LEFT, old RIGHT, both at once — the whole point is that
    // they are the same person, so they must share the frame.
    return (
      <div className={`onb-scene onb-scene-pair${v}`} aria-hidden="true">
        <img src={scene.left} alt="" className="onb-pair-img is-left" />
        <img src={scene.right} alt="" className="onb-pair-img is-right" />
        {scene.items?.map((it, i) => (
          <img
            key={`${it.slot}-${i}`}
            src={it.img}
            alt=""
            className={`onb-cslot onb-cslot-${it.slot}`}
            style={{ animationDelay: `${0.5 + 0.12 * i}s` }}
          />
        ))}
      </div>
    );
  }

  if (scene.kind === "rotate") {
    // The hero carousel (founder: 5s a piece until they pick). Once a hero is
    // picked, `settledImg` freezes it — the settle IS the reward.
    const heroes = Object.values(HEROES);
    const img = settledImg ?? heroes[rotateIdx % heroes.length]?.img;
    if (!img) return null;
    return (
      <div className={`onb-scene onb-scene-single is-right${v}`} aria-hidden="true">
        {/* key on the src so each hero re-mounts and re-plays its fade — a
            plain src swap would cross-cut with no transition at all. */}
        <img key={img} src={img} alt="" className="onb-scene-img is-rotating" />
      </div>
    );
  }

  return (
    <div
      className={`onb-scene onb-scene-single ${scene.side === "left" ? "is-left" : "is-right"}${v}`}
      aria-hidden="true"
    >
      <img key={scene.img} src={scene.img} alt="" className="onb-scene-img" />
    </div>
  );
}

/**
 * ONB-6 — one Next-gated story page. The title lands instantly (it is short),
 * the body TYPES at the same pace as everything else (founder: "i want the
 * user to have enough time to follow along - keep it current typewriter"),
 * the bubble/sticker/trio arrive once the typing settles, and the CTA gates
 * the advance — nothing on this screen can vanish unread.
 */
function StoryPageView({
  page,
  reducedMotion,
  onNext,
}: {
  page: StoryPage;
  reducedMotion: boolean;
  onNext: () => void;
}) {
  const { visible: typedText, done: textDone } = useTypewriter(
    page.text,
    !reducedMotion,
    TYPE_MS,
  );
  const settled = reducedMotion || textDone;

  return (
    <div className="onb-page">
      {page.title && <div className="onb-page-title">{page.title}</div>}
      <div className="onb-page-text">
        {typedText}
        {!settled && <span className="onb-caret" />}
      </div>

      {page.sticker && settled && (
        <div className="onb-page-sticker">
          <img src={page.sticker.img} alt={page.sticker.label} />
        </div>
      )}

      {page.trio && settled && (
        <div className="onb-trio">
          {page.trio.heroImg && (
            <figure className="onb-trio-fig">
              <img src={page.trio.heroImg} alt={page.trio.heroLabel} className="onb-trio-art" />
              <figcaption>{page.trio.heroLabel}</figcaption>
            </figure>
          )}
          <figure className="onb-trio-fig is-pet">
            <img src={page.trio.petImg} alt={page.trio.petLabel} className="onb-trio-sticker" />
            <figcaption>{page.trio.petLabel}</figcaption>
          </figure>
          <figure className="onb-trio-fig">
            <img src={page.trio.olorinImg} alt="Olórin" className="onb-trio-art" />
            <figcaption>Olórin</figcaption>
          </figure>
        </div>
      )}

      {page.bubble && settled && (
        <div className="onb-bubble-row">
          <span className="onb-bubble">
            {page.bubble.text}
            <span className="onb-bubble-by">— {page.bubble.by}</span>
          </span>
        </div>
      )}

      {settled && (
        <div className="onb-page-cta">
          <button className="onb-btn" onClick={onNext}>
            {page.cta}
          </button>
        </div>
      )}
    </div>
  );
}

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

  const [stepId, setStepId] = useState<OnboardingStep>(initialStep);
  const [phase, setPhase] = useState<Phase>("typing");
  const [draft, setDraft] = useState("");
  const [grades, setGrades] = useState<string[]>([]);
  const [answers, setAnswers] = useState(initialAnswers);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reaction, setReaction] = useState("");
  const [otherOpen, setOtherOpen] = useState(false);
  // ONB-6 — the story pages: the beat's payoff, walked by Next. `pendingStep`
  // holds the server's answer until the last page is read — the server already
  // advanced (D-ONB-1), the STORY hasn't yet.
  const [pages, setPages] = useState<StoryPage[] | null>(null);
  const [pageIdx, setPageIdx] = useState(0);
  const [pendingStep, setPendingStep] = useState<OnboardingStep | null>(null);
  // S96 — the hero beat's "more heroes" reveal. Local, not a step: it only
  // decides which chips are on screen, and abandoning it loses nothing.
  const [moreHeroes, setMoreHeroes] = useState(false);
  const [duo, setDuo] = useState<{ grade: string | null; pronoun: string | null }>({
    grade: null,
    pronoun: null,
  });

  const beat: Beat | undefined = BEAT_BY_ID[stepId];
  const name = useMemo(() => firstName(studentName), [studentName]);

  useEffect(() => {
    trpc.onboarding.listGradeOptions
      .query()
      .then(setGrades)
      .catch(() => setGrades([]));
  }, []);

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

  // S96 — the hero carousel. Runs ONLY while the hero beat is unanswered and
  // motion is allowed; reduced-motion holds on the first hero (the content is
  // the same, it simply doesn't cycle — the picker below is the real control,
  // so nothing is lost).
  const [rotateIdx, setRotateIdx] = useState(0);
  const rotating = stepId === "fav_character" && !answers.favCharacter && !reducedMotion;
  useEffect(() => {
    if (!rotating) return;
    const t = setInterval(() => setRotateIdx((i) => i + 1), ROTATE_MS);
    return () => clearInterval(t);
  }, [rotating]);

  const ctx: BeatCtx = { name, answers };
  const promptText = beat
    ? (typeof beat.prompt === "function" ? beat.prompt(ctx) : beat.prompt).replace("{name}", name)
    : "";
  const subText = beat?.sub
    ? (typeof beat.sub === "function" ? beat.sub(ctx) : beat.sub).replace("{name}", name)
    : "";
  const beatScene: Scene | undefined = beat
    ? typeof beat.scene === "function"
      ? beat.scene(ctx)
      : beat.scene
    : undefined;
  // The stage wears the current PAGE's scene while the pages walk (ONB-6).
  const activePage = phase === "pages" && pages ? pages[pageIdx] : undefined;
  const scene = activePage ? activePage.scene : beatScene;
  // S103 — the art's manners are decided by what is ON the beat, not by the
  // art: card plates need clearance, a cut-out sticker is not a scan. A story
  // page has neither, so it always gets the plain treatment.
  const sceneVariant: "picker" | "sticker" | undefined = activePage
    ? undefined
    : beat?.input.kind === "chips" && beat.input.cards === true
      ? "picker"
      : beat?.id === "phone"
        ? "sticker"
        : undefined;

  const { visible: typedPrompt, done: typedDone } = useTypewriter(
    begun || reducedMotion ? promptText : "",
    !reducedMotion && phase === "typing",
    TYPE_MS,
  );
  const promptDone = (begun || reducedMotion) && typedDone;

  useEffect(() => {
    if (phase === "typing" && promptDone) setPhase("input");
  }, [phase, promptDone]);

  if (stepId === "done") {
    return <OnboardingLoader ctx={ctx} onDone={onDone} />;
  }

  if (!beat) {
    // A step the copy file doesn't know (contracts gained a beat, copy didn't).
    // Never trap the student in a broken welcome — let them through (G3).
    onDone();
    return null;
  }

  /**
   * The shared choreography once a beat's answer is in. ONB-6: a beat that
   * earns story pages walks them Next-gated (nothing vanishes unread); a beat
   * without pages keeps the S96 timed reaction. Both commit paths land here so
   * there is exactly one place that decides how a beat ends.
   */
  function land(
    next: { currentStep: OnboardingStep; answers: BeatCtx["answers"] },
    said: string,
    story?: StoryPage[],
  ) {
    setAnswers(next.answers);
    setDraft("");
    setOtherOpen(false);
    setMoreHeroes(false);

    if (story && story.length > 0) {
      setPages(story);
      setPageIdx(0);
      setPendingStep(next.currentStep);
      setPhase("pages");
      return;
    }

    if (said) {
      setReaction(said);
      setPhase("reacting");
      setTimeout(() => {
        setReaction("");
        setStepId(next.currentStep);
        setPhase("typing");
      }, REACTION_HOLD_MS);
    } else {
      setStepId(next.currentStep);
      setPhase("typing");
    }
  }

  /** Walk the story pages; the last CTA applies the held server step. */
  function advancePages() {
    if (pages && pageIdx < pages.length - 1) {
      setPageIdx((i) => i + 1);
      return;
    }
    setPages(null);
    setPageIdx(0);
    setPhase("typing");
    if (pendingStep) {
      setStepId(pendingStep);
      setPendingStep(null);
    }
  }

  async function commitAboutYou() {
    if (!beat || saving || !duo.grade || !duo.pronoun) return;
    setSaving(true);
    setError(null);
    try {
      const next = await trpc.onboarding.saveAboutYou.mutate(duo);
      land(next, beat.reaction(duo.grade, ctx));
    } catch (e: any) {
      setError(String(e?.message ?? e).replace(/^BAD_REQUEST:\s*/, ""));
    } finally {
      setSaving(false);
    }
  }

  async function commit(value: string | null) {
    if (!beat || saving) return;
    setSaving(true);
    setError(null);
    try {
      // A talk-only beat (greet/lore) must POST a NULL value even when the
      // student tapped a chip. `lore`'s Yes/No is THEATRE — both paths land the
      // same reveal and nothing is stored — but sending "No" made the server
      // reject the step and the flow dead-ended, unfinishable (M43).
      //
      // Keyed off ONBOARDING_ANSWER_COLUMNS — the SAME contract the server
      // validates against — so a new beat can't drift the two apart.
      const persists = Boolean(
        (ONBOARDING_ANSWER_COLUMNS as Record<string, string | undefined>)[beat.id],
      );
      const next = await trpc.onboarding.saveStep.mutate({
        step: beat.id,
        value: persists ? value : null,
      });
      // The reaction/pages read the value that was TAPPED — for the talk-only
      // lore beat that is what picks the reveal's opening line.
      land(next, beat.reaction(value, ctx), beat.pages?.(value, ctx));
    } catch (e: any) {
      // saveStep deliberately does NOT fail open — a dropped answer would make
      // the flow lie about having saved. So surface it and let them retry.
      setError(String(e?.message ?? e).replace(/^BAD_REQUEST:\s*/, ""));
    } finally {
      setSaving(false);
    }
  }

  // S96 — the hero beat's chips are pronoun-aware (a DEFAULT, never a gate: the
  // rest are one tap away, and the server accepts any of them).
  const heroSets = beat.id === "fav_character" ? heroesFor(answers.pronoun) : null;

  const chips: ChipOption[] =
    beat.input.kind === "chips"
      ? heroSets
        ? moreHeroes
          ? [...heroSets.primary, ...heroSets.rest]
          : heroSets.primary
        : beat.input.source === "grades"
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
      : beat.id === "lore"
        ? "onb-chips is-lore" // inked answers, not generic pills (founder)
        : "onb-chips";

  // S96 — the companion the hero brought, pre-selected on the pet beat. It is a
  // DEFAULT with a wink, not a lock (founder, agreed): the pet is the flow's
  // only gift, and a gift you cannot choose is an assignment.
  const companion = beat.id === "pet" ? companionFor(answers.favCharacter) : undefined;

  return (
    <div className="onb-root">
      <SceneLayer
        scene={scene}
        rotateIdx={rotateIdx}
        settledImg={
          beat.id === "fav_character" && answers.favCharacter
            ? HEROES[answers.favCharacter]?.img
            : undefined
        }
        variant={sceneVariant}
      />
      <div className="onb-card">
        <div className="onb-stagewrap">
          {phase === "pages" && activePage && (
            // Keyed by page index so each page re-mounts: the typewriter, the
            // rise animations and the scene fade all replay per page.
            <StoryPageView
              key={pageIdx}
              page={activePage}
              reducedMotion={reducedMotion}
              onNext={advancePages}
            />
          )}

          {phase !== "reacting" && phase !== "pages" && (
            <div key={stepId} className="onb-stage">
              <div className="onb-stage-prompt">
                {phase === "typing" ? typedPrompt : promptText}
                {phase === "typing" && !promptDone && <span className="onb-caret" />}
              </div>

              {subText && promptDone && <div className="onb-sub">{subText}</div>}
            </div>
          )}

          {phase === "reacting" && reaction && (
            <div className="onb-reactwrap">
              <div className="onb-react">{reaction}</div>
            </div>
          )}
        </div>

        {phase === "input" && (
          <div className="onb-input">
            {error && <div className="onb-error">{error}</div>}

            {beat.input.kind === "none" && (
              <button className="onb-btn" disabled={saving} onClick={() => commit(null)}>
                {beat.input.cta}
              </button>
            )}

            {beat.input.kind === "duo" && (
              <div className="onb-duo">
                {beat.input.rows.map((row) => {
                  const opts: ChipOption[] =
                    row.chips === null ? grades.map((g) => ({ value: g, label: g })) : row.chips;
                  const label = (typeof row.label === "function" ? row.label(ctx) : row.label)
                    .replace("{name}", name);
                  return (
                    <div key={row.key} className="onb-duo-row">
                      <span className="onb-duo-label">{label}</span>
                      <div className="onb-duo-opts">
                        {opts.length === 0 && row.key === "grade" ? (
                          <span className="onb-duo-empty">— no classes set up yet —</span>
                        ) : (
                          opts.map((o) => (
                            <button
                              key={o.value}
                              className={
                                (row.style === "board" ? "onb-board" : "onb-chip") +
                                (duo[row.key] === o.value ? " is-picked" : "")
                              }
                              disabled={saving}
                              aria-pressed={duo[row.key] === o.value}
                              onClick={() => setDuo((d) => ({ ...d, [row.key]: o.value }))}
                            >
                              {o.label.replace("{name}", name)}
                            </button>
                          ))
                        )}
                      </div>
                    </div>
                  );
                })}
                <button
                  className="onb-btn onb-duo-cta"
                  disabled={saving || !duo.grade || !duo.pronoun}
                  onClick={commitAboutYou}
                >
                  {saving ? "…" : beat.input.cta}
                </button>
              </div>
            )}

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
                  // CANNOT go through commit(): grade is required server-side
                  // (D-ONB-2), so a null would be rejected and the student would
                  // be stuck on an unanswerable beat. The successor is read from
                  // ONBOARDING_STEPS — the SAME ordered contract the server
                  // advances by; a hardcoded next step is a drift waiting to
                  // happen (it used to name "school", which S90 deleted).
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
                    {chips.map((c) => {
                      // The wink: only on the pet the student's own hero brought.
                      const wink = beat.id === "pet" ? petWink(c.value, answers.favCharacter) : undefined;
                      const isCompanion = beat.id === "pet" && companion === c.value;
                      return (
                        <button
                          key={c.value}
                          className={
                            (bigChips || cardChips ? "onb-choice" : "onb-chip") +
                            (isCompanion ? " is-companion" : "")
                          }
                          disabled={saving}
                          onClick={() => commit(c.value)}
                        >
                          {c.img && <img src={c.img} alt="" className="onb-choice-img" />}
                          <span className="onb-choice-label">{c.label}</span>
                          {wink && <span className="onb-choice-wink">{wink}</span>}
                          {c.hint && <span className="onb-choice-hint">{c.hint}</span>}
                        </button>
                      );
                    })}
                  </>
                )}
              </div>
            )}

            {/* S96 — "more heroes". The pronoun list is a default, not a cage:
                a girl who wants Iron Man taps here and gets him, and the server
                accepts it. Hidden once opened — there is no way back because
                there is nothing to go back to: the list only grows. */}
            {beat.id === "fav_character" && !moreHeroes && heroSets && heroSets.rest.length > 0 && (
              <div className="onb-other-row">
                <button className="onb-other" disabled={saving} onClick={() => setMoreHeroes(true)}>
                  Show me everyone
                </button>
              </div>
            )}

            {/* The hatch is NOT another pet, so it doesn't wear a pet card — as
                one it wrapped onto a row of its own and read as a layout
                accident. A quieter control under the row says what it is. */}
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
                <button
                  className="onb-btn"
                  type="submit"
                  disabled={saving || (!draft.trim() && !beat.optional)}
                >
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
 * The close — ONB-6: the EPILOGUE. Five slow pages of the world being made
 * ready (~45s total, founder's number), each typed at story pace, with an
 * HONEST progress bar filling underneath. Page one is the companion handover —
 * the moment the gift arrives — so it leads with the sticker.
 *
 * Every word lives in the copy file (EPILOGUE_PAGES). This component only
 * decides WHEN: pages advance on an even split of EPILOGUE_TOTAL_MS, the
 * server finalize fires immediately, and the door opens when BOTH the clock
 * and the server are done — never before, so the bar never lies twice.
 */
function OnboardingLoader({ ctx, onDone }: { ctx: BeatCtx; onDone: () => void }) {
  const reducedMotion = useRef(
    typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches,
  ).current;
  const [idx, setIdx] = useState(0);
  const perPage = EPILOGUE_TOTAL_MS / EPILOGUE_PAGES.length;

  useEffect(() => {
    let clockDone = false;
    let serverDone = false;
    let gone = false;
    const open = () => {
      if (gone) return;
      if (clockDone && serverDone) {
        gone = true;
        onDone();
      }
    };

    const pager = setInterval(
      () => setIdx((i) => Math.min(i + 1, EPILOGUE_PAGES.length - 1)),
      perPage,
    );
    const clock = setTimeout(() => {
      clockDone = true;
      open();
    }, EPILOGUE_TOTAL_MS);

    trpc.onboarding.complete
      .mutate()
      .catch(() => {
        // Never strand a student on the epilogue because the final flip failed —
        // every answer is already committed (D-ONB-1), so the worst case is
        // seeing the welcome once more.
      })
      .finally(() => {
        serverDone = true;
        open();
      });

    return () => {
      clearInterval(pager);
      clearTimeout(clock);
    };
  }, [onDone, perPage]);

  const page = EPILOGUE_PAGES[idx]!;
  const say = (typeof page.say === "function" ? page.say(ctx) : page.say).replace(
    "{name}",
    ctx.name,
  );
  const img = typeof page.img === "function" ? page.img(ctx) : page.img;
  const epScene = typeof page.scene === "function" ? page.scene(ctx) : page.scene;

  const { visible: typedSay, done: sayDone } = useTypewriter(say, !reducedMotion, TYPE_MS);

  return (
    <div className="onb-root">
      {/* keyed by page so each epilogue page's art fades in on its own */}
      <SceneLayer key={`sc-${idx}`} scene={epScene} rotateIdx={0} />
      <div className="onb-card onb-card-loader">
        {/* Keyed by page so the art and type replay their entrances. */}
        <div key={idx} className="onb-epi">
          {page.sticker ? (
            <div className="onb-delivery">
              <img
                src={loaderPetImg(ctx.answers.pet)}
                alt={loaderPetAlt(ctx.answers.pet)}
                className="onb-delivery-pet"
              />
            </div>
          ) : (
            img && <img src={img} alt="" aria-hidden="true" className="onb-epi-art" />
          )}
          <div className="onb-epi-say">
            {typedSay}
            {!sayDone && !reducedMotion && <span className="onb-caret" />}
          </div>
        </div>
        <div className="onb-loader-bar is-epi">
          <span style={{ animationDuration: `${EPILOGUE_TOTAL_MS}ms` }} />
        </div>
      </div>
    </div>
  );
}
