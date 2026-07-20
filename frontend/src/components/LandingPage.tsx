import { useCallback, useEffect, useRef, useState } from "react";
import { signIn, devLogin } from "../lib/auth";
import { setPersona } from "../trpc";
import "./landing.css";

// Orion persona-select front door (logged-out). Ported from design artifact
// 0f84478e. Each persona routes dev-login to its seed user; role is resolved by
// membership on the BE (the persona picked is just the email preset).
type Persona = "student" | "parent" | "tutor";

const ROLE_EMAIL: Record<Persona, string> = {
  student: "smoke@example.com",
  parent: "parent@example.com",
  tutor: "tutor@example.com",
};
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

const EnterArrow = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 12h14M13 6l6 6-6 6" />
  </svg>
);

export function LandingPage() {
  const rootRef = useRef<HTMLDivElement>(null);
  const wordRef = useRef<HTMLDivElement>(null);
  const doneRef = useRef(false);
  const [revealed, setRevealed] = useState(false);
  const [chosen, setChosen] = useState<Persona | null>(null);
  const [email, setEmail] = useState(ROLE_EMAIL.student);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const reveal = useCallback(() => {
    doneRef.current = true;
    setRevealed(true);
  }, []);

  const selectRole = (p: Persona) => {
    setChosen(p);
    setEmail(ROLE_EMAIL[p]);
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

  const onDevSignIn = async () => {
    setBusy(true);
    setErr(null);
    try {
      await devLogin(email);
    } catch (e) {
      setErr(String((e as Error)?.message ?? e));
      setBusy(false);
    }
    // On success the session flips and App swaps this screen out; no reset needed.
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
            {/* This block ships to production ON PURPOSE, and must keep shipping
                until a real Google sign-in is proven end-to-end. Every prod account
                is email/password, and Google cannot link onto a pre-existing user
                (see the note in src/auth/auth.ts) — so gating this on
                import.meta.env.DEV, which Vite inlines as false at build time,
                removes the only login prod actually has.
                The live gate is the BACKEND's NODE_ENV !== "production" check in
                auth.ts, which prod does not currently trip. Closing that is the
                fix; hiding the form is not. */}
            <div className="or-dev">
              <span className="or-dev-label">dev login (bypass)</span>
              <div className="or-dev-row">
                <input
                  className="or-dev-input"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  aria-label="Dev email"
                />
                <button className="or-dev-btn" type="button" onClick={onDevSignIn} disabled={busy}>
                  {busy ? "Signing in…" : "Dev sign in"}
                </button>
              </div>
              {err && <p className="or-err">{err}</p>}
            </div>
            <button className="or-back" type="button" onClick={() => setChosen(null)}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M11 6l-6 6 6 6" /></svg> Choose a different role
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
}
