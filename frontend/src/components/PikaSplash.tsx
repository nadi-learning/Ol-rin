import { useEffect, useRef, useState, type CSSProperties, type RefObject } from "react";
import pikachuPeeker from "../assets/pikachu-peeker.png";
import pikachuWave from "../assets/pikachu-wave.png";
import pikachuSit from "../assets/pikachu-sit.png";
import "./pika-splash.css";

// Full-page Pikachu splash — opened by tapping the nav-rail logo. A playful
// easter-egg surface: stickers FLOW across a breathing dark gradient (drop from
// top, rise from the bottom, drift left↔right, and a hero that pops in center).
// Dark backdrop so the yellow pops; a warm glow breathes in and out over it.
//
// TUNING: everything is data-driven from FLOW below. Each item picks a `cls`
// (the travel animation) and a `style` (where it sits + size + timing). Add /
// remove entries freely; reuse the three imported stickers as you like.
type Item = { img: string; cls: string; style: CSSProperties };

const HERO = "clamp(240px, 32vw, 420px)";

const FLOW: Item[] = [
  // hero — pops in and out, dead center
  {
    img: pikachuWave,
    cls: "fl fl-pop",
    style: { top: "16%", left: "50%", width: HERO, marginLeft: `calc(${HERO} * -0.5)`, animationDuration: "4.6s" },
  },
  // droppers (fall from the top)
  { img: pikachuPeeker, cls: "fl fl-drop", style: { top: 0, left: "9%", width: "150px", animationDuration: "7s", animationDelay: "0s" } },
  { img: pikachuSit, cls: "fl fl-drop", style: { top: 0, left: "82%", width: "128px", animationDuration: "6s", animationDelay: "2.6s" } },
  // risers (float up from the bottom)
  { img: pikachuSit, cls: "fl fl-rise", style: { top: 0, left: "26%", width: "132px", animationDuration: "8s", animationDelay: "1.1s" } },
  { img: pikachuPeeker, cls: "fl fl-rise", style: { top: 0, left: "68%", width: "112px", animationDuration: "9s", animationDelay: "3.4s" } },
  // crossers (drift across)
  { img: pikachuPeeker, cls: "fl fl-cross", style: { top: "24%", left: 0, width: "128px", animationDuration: "11s", animationDelay: "0.6s" } },
  { img: pikachuSit, cls: "fl fl-cross-rev", style: { top: "72%", left: 0, width: "120px", animationDuration: "13s", animationDelay: "4s" } },
];

const MINIMIZE_MS = 500;

export function PikaSplash({
  onClose,
  logoRef,
}: {
  onClose: () => void;
  logoRef?: RefObject<HTMLElement | null>;
}) {
  // Two-step close: play the shrink-into-the-logo animation, THEN tell the parent
  // to unmount (which resumes the screen the user was on). A ref guards against a
  // double trigger (X + Esc, or a second click mid-animation).
  const [minTarget, setMinTarget] = useState<CSSProperties | null>(null);
  const closingRef = useRef(false);

  const beginClose = () => {
    if (closingRef.current) return;
    closingRef.current = true;
    // Aim the collapse at the logo's live position (fallback: top-left corner).
    const rect = logoRef?.current?.getBoundingClientRect();
    const x = rect ? rect.left + rect.width / 2 : 32;
    const y = rect ? rect.top + rect.height / 2 : 32;
    setMinTarget({ ["--min-x" as string]: `${x}px`, ["--min-y" as string]: `${y}px` } as CSSProperties);
    window.setTimeout(onClose, MINIMIZE_MS);
  };

  // Esc triggers the same minimize; lock body scroll while open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") beginClose();
    };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      className={`pika-splash${minTarget ? " is-minimizing" : ""}`}
      style={minTarget ?? undefined}
      role="dialog"
      aria-modal="true"
      aria-label="Pikachu"
      onClick={beginClose}
    >
      <button className="pika-splash-close" onClick={beginClose} aria-label="Close">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>

      {FLOW.map((p, i) => (
        <img key={i} className={p.cls} style={p.style} src={p.img} alt="" draggable={false} />
      ))}
    </div>
  );
}
