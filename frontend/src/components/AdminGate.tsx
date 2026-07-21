import { useEffect, useRef } from "react";
import { signIn } from "../lib/auth";
import "./admin-gate.css";

// S125 — THE ADMIN FRONT DOOR (founder). Rendered by App.tsx only at `/admin`
// and only while signed OUT. Deliberately NOT linked from the public role picker
// (LandingPage) — reachable by typing the URL and no other way, so it does not
// announce itself to a student browsing the front door.
//
// 🔴 THIS CARD GRANTS NOTHING. It is a styled sign-in button. The real locks are
// server-side and unchanged: `adminProcedure` (isAdminEmail whitelist + an admin
// membership row). A non-whitelisted account that signs in here lands on the
// same not-found page every other non-admin gets at `/admin`.
//
// Visually it MIRRORS the student lane (founder's call): the same flowing wave
// canvas and the same two-part phrase — quote pinned top, bold title pinned
// bottom — but in the Loki emerald the founder picked for admin. The wave math
// is ported verbatim from LandingPage's per-lane flow, run over a single canvas
// with a green ramp.
export function AdminGate() {
  const flowRef = useRef<HTMLCanvasElement>(null);
  const heroRef = useRef<HTMLDivElement>(null);

  const onGoogle = () => {
    // callbackURL stays on `/admin` on purpose: the trpc `x-profile: admin`
    // override (trpc.ts) only fires while the URL is `/admin`, so the post
    // sign-in `me` must resolve THERE. A default callback to `/` would land the
    // admin on the student surface for a frame before the redirect corrects it.
    signIn.social({
      provider: "google",
      callbackURL: window.location.origin + "/admin",
    });
  };

  // The silky wave backdrop — one canvas, green ramp. Ported from LandingPage's
  // `.or-flow` effect (same draw/step/loop, single lane instead of three) and
  // torn down fully on unmount (StrictMode double-invokes effects in dev).
  useEffect(() => {
    const canvas = flowRef.current;
    const hero = heroRef.current;
    if (!canvas || !hero) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // Bottom → top: deep emerald to light mint (the Loki green mirror of the
    // student lane's blue ramp).
    const ramp: number[][] = [
      [8, 58, 42],
      [17, 120, 86],
      [56, 168, 124],
      [200, 232, 216],
    ];
    const lerp = (a: number, b: number, f: number) => a + (b - a) * f;
    const rampColor = (t: number) => {
      const segs = ramp.length - 1;
      const s = Math.min(segs - 1e-6, Math.max(0, t) * segs);
      const i = Math.floor(s), f = s - i, a = ramp[i]!, b = ramp[i + 1]!;
      return `${Math.round(lerp(a[0]!, b[0]!, f))},${Math.round(lerp(a[1]!, b[1]!, f))},${Math.round(lerp(a[2]!, b[2]!, f))}`;
    };

    let W = 0, H = 0;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const N = 15;
    let phase = 4.2; // fixed seed (Math.random is unavailable / avoided) — one lane, no need to vary
    // 🔴 MEASURE THE HERO, NOT THE CANVAS. resize() sets an explicit pixel size
    // on the canvas, so reading the canvas's own clientWidth back would freeze it
    // at whatever it was first measured at (a 300×150 default before layout) and
    // a ResizeObserver on the canvas would never see the parent grow — it would
    // be watching the very size we just pinned. The hero is the sized element;
    // the absolutely-positioned canvas only ever mirrors it. (LandingPage dodges
    // this by observing the parent `.or-col`.)
    const resize = () => {
      const w = hero.clientWidth, h = hero.clientHeight;
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
        ctx.fillStyle = `rgba(${rampColor(t)},0.62)`;
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

    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(() => { resize(); if (reduced) draw(); });
      ro.observe(hero);
    }

    let running = true, last = 0, acc = 0, raf = 0;
    const FRAME = 1 / 30;
    const loop = (ts: number) => {
      if (!running) return;
      const dt = last ? Math.min(0.05, (ts - last) / 1000) : 0.016;
      last = ts;
      acc += dt;
      if (acc >= FRAME) { phase += acc * 0.5; draw(); acc = 0; }
      raf = requestAnimationFrame(loop);
    };
    if (reduced) draw();
    else raf = requestAnimationFrame(loop);

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      ro?.disconnect();
    };
  }, []);

  return (
    <div className="ag-root">
      <div className="ag-hero" ref={heroRef}>
        <canvas className="ag-flow" ref={flowRef} aria-hidden="true" />

        {/* TOP — quote, mirroring the student lane's `.or-phrase` */}
        <div className="ag-phrase">
          <div className="ag-belt" aria-hidden="true">
            <i />
            <i />
            <i />
          </div>
          <p className="ag-quote">Keep the sky in order.</p>
          <span className="ag-sign">— Olórin</span>
        </div>

        {/* BOTTOM — bold title, mirroring the student lane's `.or-textblock` */}
        <div className="ag-textblock">
          <span className="ag-eyebrow">For admins</span>
          <h2 className="ag-title">Manage &amp; maintain</h2>
          <p className="ag-pitch">
            Ingest curriculum, publish content, and keep access in order.
          </p>
        </div>
      </div>

      <aside className="ag-panel">
        <div className="ag-panel-inner">
          <div className="ag-brand">
            <span>Olórin</span>
          </div>
          <h1 className="ag-welcome">
            Continue as <b>Admin</b>
          </h1>
          <p className="ag-sub">
            Sign in with an authorised account to manage content and people.
          </p>
          <button className="ag-gbtn" type="button" onClick={onGoogle}>
            Continue with Google
          </button>
          <p className="ag-note">
            Restricted access · only whitelisted accounts can enter.
          </p>
        </div>
      </aside>
    </div>
  );
}
