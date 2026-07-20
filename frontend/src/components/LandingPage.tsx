import { useCallback, useEffect, useRef, useState } from "react";
// `devLogin` is imported unconditionally but referenced ONLY inside an
// `import.meta.env.DEV` branch, so Vite drops both the call and the import from
// production builds (verified by bundle grep, S123).
import { signIn, devLogin } from "../lib/auth";
import { setPersona } from "../trpc";
import "./landing.css";

// Orion persona-select front door (logged-out). Ported from design artifact
// 0f84478e. Google is now the only way in: S122 closed the dev bypass at both
// layers (this form, and the backend's NODE_ENV gate in src/auth/auth.ts).
// The persona picked is a CLAIM carried into signup (D-121-1/2), no longer an
// email preset — `ROLE_EMAIL` went with the form that consumed it.
type Persona = "student" | "parent" | "tutor";
const SUB: Record<Persona, string> = {
  student: "Sign in to open your lessons, practice, and progress.",
  parent: "Sign in to see your child's reports and pace.",
  tutor: "Sign in to author, assess, and guide your students.",
};
const ACCENT: Record<Persona, string> = { student: "#2563eb", parent: "#96856b", tutor: "#e87b35" };
const QUOTE: Record<Persona, string> = {
  student: "Chart your own sky.",
  parent: "Watch them find their way.",
  tutor: "Be the star they steer by.",
};
const COLS: { p: Persona; eyebrow: string; title: string; pitch: string }[] = [
  { p: "student", eyebrow: "For students", title: "Learn & practise", pitch: "Revision slides, practice, and a clear view of what you've mastered." },
  { p: "parent", eyebrow: "For parents", title: "Follow along", pitch: "Signed-off progress reports and how your child is pacing toward exams." },
  { p: "tutor", eyebrow: "For tutors", title: "Teach & assess", pitch: "Author questions, certify two-axis mastery, and guide every student." },
];

/**
 * Has this browser already been welcomed?
 *
 * localStorage, not sessionStorage: the founder's ask is "only once when the
 * user opens the url", and sessionStorage would replay the whole intro in every
 * new tab. Wrapped in try/catch for private mode and blocked storage — the same
 * discipline as `getBoard` in trpc.ts, and the failure mode is the OLD
 * behaviour (splash every load), never a crash on the login page.
 */
const SPLASH_KEY = "b2c.splashSeen";

function splashSeen(): boolean {
  try {
    return localStorage.getItem(SPLASH_KEY) === "1";
  } catch {
    return false;
  }
}

function markSplashSeen(): void {
  try {
    localStorage.setItem(SPLASH_KEY, "1");
  } catch {
    /* see splashSeen */
  }
}

const EnterArrow = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 12h14M13 6l6 6-6 6" />
  </svg>
);

export function LandingPage() {
  const rootRef = useRef<HTMLDivElement>(null);
  const wordRef = useRef<HTMLDivElement>(null);
  // Seeded from storage: a returning visitor has already met the splash, so
  // `doneRef` starts true and the intro sequence below bails before its first
  // flip. Set here rather than in an effect so the splash never paints for one
  // frame on a return visit.
  const doneRef = useRef(splashSeen());
  const [revealed, setRevealed] = useState(splashSeen);
  const [chosen, setChosen] = useState<Persona | null>(null);
  // S122 — `email` and `busy` went with the dev-login form. `err` stays: the
  // Google path still has failures worth showing.
  const [err, setErr] = useState<string | null>(null);

  const reveal = useCallback(() => {
    doneRef.current = true;
    // Founder: the splash is a WELCOME, not a loading screen — it belongs on
    // the first visit and nowhere else. It used to replay on every page load,
    // which during testing (or for a student who refreshes) reads as an intro
    // that will not stop. Marked here rather than at the end of the sequence so
    // that skipping it also counts as having seen it: someone who clicks past
    // it has made the same decision, more emphatically.
    markSplashSeen();
    setRevealed(true);
  }, []);

  const selectRole = (p: Persona) => {
    setChosen(p);
    setErr(null);
    // 🔑 Founder, this session — the persona STOPS being cosmetic. It used to
    // prefill a dev-login email and nothing else, so a parent signing up became
    // a student (DEFAULT_ROLE) and was walked through picking a hero and a pet.
    // Recorded at the click rather than at submit because the Google path
    // leaves the page entirely and comes back on a fresh load.
    //
    // It is a CLAIM, not a grant — see `setPersona` for why that is safe.
    setPersona(p);
  };

  const onGoogle = () => {
    signIn.social({ provider: "google", callbackURL: window.location.origin });
  };

  // ── S123 — DEV LOGIN, RESTORED FOR LOCAL ONLY ─────────────────────────────
  //
  // 🔴 THE ENTIRE SAFETY OF THIS RESTS ON `import.meta.env.DEV`, AND NOT ON
  // ANYONE REMEMBERING ANYTHING. S122 deleted this form as half of closing the
  // production bypass; putting it back unguarded would re-open that bypass on
  // the very next deploy, silently, months after the decision that closed it.
  //
  // `import.meta.env.DEV` is replaced by the literal `false` at BUILD time, so
  // Vite's dead-code elimination removes the branch, the handler and the
  // imports from the production bundle outright. This is a compile-time
  // guarantee, not a runtime check that could be flipped by an env var or a
  // misread NODE_ENV — the bundle physically does not contain the form.
  // Verified by grepping the built bundle (see build-state S123).
  //
  // ⚠️ THE UI WAS NEVER THE GATE, and this comment must keep saying so. The
  // real lock is the backend's `NODE_ENV !== "production"` check in auth.ts,
  // which is what makes `POST /api/auth/sign-in/email` 400 on the box. This
  // form is a convenience on top of a route that is already open locally; it
  // grants nothing that curl could not.
  // ⚠️ The seed goes through the SAME `import.meta.env.DEV` fold. The hook
  // itself lives outside the dev branch (hooks cannot be conditional), so a
  // bare `useState("one@example.com")` left that literal sitting in the
  // production bundle — caught by the bundle grep, which flagged it while every
  // other dev-login string was correctly gone. Nothing was exploitable about a
  // stray email, but a prod artefact containing a test account is exactly the
  // kind of residue that makes a later reader think the form is still there.
  const [devEmail, setDevEmail] = useState(import.meta.env.DEV ? "one@example.com" : "");
  const [devBusy, setDevBusy] = useState(false);
  const onDevSignIn = async () => {
    setErr(null);
    setDevBusy(true);
    try {
      await devLogin(devEmail.trim());
      // No explicit navigation: `useSession` picks the new session up and App
      // re-routes on it, the same path Google sign-in takes.
    } catch (e: any) {
      setErr(String(e?.message ?? e));
    } finally {
      setDevBusy(false);
    }
  };

  // Splash intro sequence + the per-lane generative canvas flow. Ported ~verbatim
  // from the artifact; scoped to the component root and fully torn down on unmount
  // (React StrictMode double-invokes effects in dev).
  useEffect(() => {
    const root = rootRef.current;
    const word = wordRef.current;
    if (!root || !word) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const RAMPS: Record<string, number[][]> = {
      student: [[27, 52, 120], [37, 99, 235], [123, 166, 246], [214, 228, 251]],
      parent: [[58, 50, 40], [150, 133, 107], [205, 191, 168], [240, 232, 218]],
      tutor: [[46, 54, 66], [194, 56, 29], [232, 123, 53], [247, 208, 170]],
    };
    const lerp = (a: number, b: number, f: number) => a + (b - a) * f;
    const rampColor = (r: number[][], t: number) => {
      const segs = r.length - 1;
      const s = Math.min(segs - 1e-6, Math.max(0, t) * segs);
      const i = Math.floor(s), f = s - i, a = r[i]!, b = r[i + 1]!;
      return `${Math.round(lerp(a[0]!, b[0]!, f))},${Math.round(lerp(a[1]!, b[1]!, f))},${Math.round(lerp(a[2]!, b[2]!, f))}`;
    };

    type Flow = { resize: () => void; draw: () => void; step: (dt: number) => void };
    const flows: Flow[] = [];
    const observers: ResizeObserver[] = [];

    root.querySelectorAll<HTMLElement>(".or-col").forEach((col) => {
      const canvas = col.querySelector<HTMLCanvasElement>(".or-flow");
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const ramp = RAMPS[col.getAttribute("data-p") || "student"]!;
      let W = 0, H = 0;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const N = 15;
      let phase = Math.random() * 10;
      const resize = () => {
        const w = col.clientWidth, h = col.clientHeight;
        if (!w || !h) return;
        W = w; H = h;
        canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
        canvas.style.width = w + "px"; canvas.style.height = h + "px";
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      };
      const draw = () => {
        if (!W || !H) return;
        ctx.clearRect(0, 0, W, H);
        const freq = (Math.PI * 2) / (W * 1.15);
        for (let i = N - 1; i >= 0; i--) {
          const t = i / (N - 1);
          const baseY = H * (0.82 - t * 0.66) + Math.sin(phase * 0.6 + i * 0.35) * H * 0.014;
          const amp = H * 0.045 * (0.55 + 0.6 * t);
          const ph = phase + i * 0.5;
          ctx.beginPath(); ctx.moveTo(0, H);
          for (let x = 0; x <= W; x += W / 26) ctx.lineTo(x, baseY + Math.sin(x * freq + ph) * amp);
          ctx.lineTo(W, H); ctx.closePath();
          ctx.fillStyle = `rgba(${rampColor(ramp, t)},0.62)`;
          ctx.fill();
          ctx.lineWidth = 1.1; ctx.strokeStyle = `rgba(255,255,255,${0.1 + 0.06 * t})`;
          ctx.beginPath();
          for (let x2 = 0; x2 <= W; x2 += W / 26) {
            const y2 = baseY + Math.sin(x2 * freq + ph) * amp;
            x2 === 0 ? ctx.moveTo(x2, y2) : ctx.lineTo(x2, y2);
          }
          ctx.stroke();
        }
      };
      resize();
      if (typeof ResizeObserver !== "undefined") {
        const ro = new ResizeObserver(() => { resize(); if (reduced) draw(); });
        ro.observe(col);
        observers.push(ro);
      }
      flows.push({ resize, draw, step: (dt: number) => { phase += dt * 0.5; } });
    });

    let running = false, last = 0, acc = 0, raf = 0;
    const FRAME = 1 / 30; // cap redraws at ~30fps — the slow drift is imperceptible vs 60
    const loop = (ts: number) => {
      if (!running) return;
      const dt = last ? Math.min(0.05, (ts - last) / 1000) : 0.016;
      last = ts;
      acc += dt;
      if (acc >= FRAME) {
        for (const fl of flows) { fl.step(acc); fl.draw(); }
        acc = 0;
      }
      raf = requestAnimationFrame(loop);
    };
    for (const fl of flows) fl.resize();
    if (reduced) { for (const fl of flows) fl.draw(); }
    else { running = true; last = 0; raf = requestAnimationFrame(loop); }

    const onResize = () => { for (const fl of flows) { fl.resize(); if (reduced) fl.draw(); } };
    window.addEventListener("resize", onResize);

    // Intro word-flip sequence, then reveal the columns.
    const timers: ReturnType<typeof setTimeout>[] = [];
    const wait = (ms: number) => new Promise<void>((r) => { timers.push(setTimeout(r, ms)); });
    const SEQ: { role: Persona; label: string }[] = [
      { role: "student", label: "Student" },
      { role: "parent", label: "Parent" },
      { role: "tutor", label: "Tutor" },
    ];
    const flipTo = (label: string, role?: Persona) =>
      new Promise<void>((res) => {
        word.classList.add("flipping");
        timers.push(setTimeout(() => {
          word.textContent = label;
          if (role) word.setAttribute("data-role", role);
          else word.removeAttribute("data-role");
          word.classList.remove("flipping");
          res();
        }, 340));
      });
    (async () => {
      // Already welcomed — skip the whole sequence. Without this the loop still
      // idles through its 1150ms lead-in before finding `doneRef` set, which is
      // harmless but leaves a timer pending on a screen that is already live.
      if (doneRef.current) return;
      if (reduced) { await wait(500); if (!doneRef.current) reveal(); return; }
      await wait(1150);
      for (const s of SEQ) {
        if (doneRef.current) return;
        await flipTo(s.label, s.role);
        await wait(620);
      }
      await wait(320);
      if (!doneRef.current) reveal();
    })();

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      observers.forEach((o) => o.disconnect());
      timers.forEach((t) => clearTimeout(t));
      window.removeEventListener("resize", onResize);
    };
  }, [reveal]);

  const colsClass = `or-cols${revealed ? " is-live" : ""}${chosen ? " is-selected" : ""}`;

  return (
    <div id="or-root" ref={rootRef}>
      {/* ===== SPLASH ===== */}
      <div
        className={`or-splash${revealed ? " is-gone" : ""}`}
        role="button"
        tabIndex={0}
        aria-label="Enter Olórin"
        onClick={reveal}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); reveal(); } }}
        style={revealed ? { display: "none" } : undefined}
      >
        <div className="or-lockup">
          <div className="or-word-wrap"><div className="or-word" ref={wordRef}>Olórin</div></div>
        </div>
        <div className="or-skip">Click to skip</div>
      </div>

      {/* ===== COLUMNS ===== */}
      <div className={colsClass} aria-hidden={!revealed}>
        {COLS.map((c) => (
          <button
            key={c.p}
            className={`or-col${chosen === c.p ? " chosen" : ""}`}
            data-p={c.p}
            type="button"
            onClick={() => selectRole(c.p)}
          >
            <canvas className="or-flow" aria-hidden="true" />
            <div className="or-phrase">
              <div className="or-belt-mini" aria-hidden="true"><i /><i /><i /></div>
              <p className="or-quote">{QUOTE[c.p]}</p>
              <span className="or-sign">- Olórin</span>
            </div>
            <div className="or-textblock">
              <span className="or-eyebrow">{c.eyebrow}</span>
              <h2 className="or-title">{c.title}</h2>
              <p className="or-pitch">{c.pitch}</p>
              <span className="or-enter">Enter <EnterArrow /></span>
            </div>
          </button>
        ))}

        {/* ===== LOGIN RAIL (1/4) ===== */}
        <aside
          className="or-login"
          aria-hidden={!chosen}
          style={chosen ? ({ ["--login-accent" as string]: ACCENT[chosen] } as React.CSSProperties) : undefined}
        >
          <div className="or-login-inner">
            <div className="or-login-brand"><span>Olórin</span></div>
            <h2 className="or-welcome">Continue as <b>{chosen ?? "student"}</b></h2>
            <p className="or-sub">{SUB[chosen ?? "student"]}</p>
            <button className="or-gbtn" type="button" onClick={onGoogle}>Continue with Google</button>
            {/* S122 — THE DEV-LOGIN BLOCK IS GONE. It shipped to production on
                purpose from S93 until now, because prod ran NODE_ENV=development
                and every prod account was email/password: hiding the form would
                have removed the only login prod had.
                Both halves of that reason are now closed in the same change —
                auth.ts trusts Google for linking, the real student's row is
                verified, and the box runs NODE_ENV=production. Deleting this
                markup is the COSMETIC half; the live gate has always been the
                backend's NODE_ENV !== "production" check in auth.ts. Removing
                the UI alone would have left the endpoint open, and anyone could
                still POST /api/auth/sign-in/email as any student.
                probe_auth_hardening §4 asserted this block WAS in the bundle;
                that leg is inverted in this same edit — a probe whose subject
                you delete must change direction with it, or it silently guards
                nothing (M77). */}
            {/* S123 — dev sign-in, LOCAL BUILDS ONLY. See `onDevSignIn` above
                for why this is `import.meta.env.DEV` and not a runtime flag:
                the branch is compiled OUT of the production bundle entirely.
                Labelled loudly on purpose — if this ever appears on a deployed
                site, that is the bug, and it should be unmistakable. */}
            {import.meta.env.DEV && (
              <div className="or-dev">
                {/* `.or-dev-label` / `.or-dev-row`, NOT invented class names —
                    S122 deleted this markup but left its stylesheet intact, so
                    the restored form reuses the rules that were already there
                    rather than adding a second set beside them. */}
                <p className="or-dev-label">local dev only — not in production builds</p>
                <div className="or-dev-row">
                  <input
                    className="or-dev-input"
                    type="email"
                    value={devEmail}
                    onChange={(e) => setDevEmail(e.target.value)}
                    placeholder="you@example.com"
                    aria-label="Dev sign-in email"
                  />
                  <button
                    className="or-dev-btn"
                    type="button"
                    onClick={onDevSignIn}
                    disabled={devBusy || !devEmail.trim()}
                  >
                    {devBusy ? "Signing in…" : "Dev sign in"}
                  </button>
                </div>
              </div>
            )}
            {err && <p className="or-err">{err}</p>}
            <button className="or-back" type="button" onClick={() => setChosen(null)}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M11 6l-6 6 6 6" /></svg> Choose a different role
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
}
