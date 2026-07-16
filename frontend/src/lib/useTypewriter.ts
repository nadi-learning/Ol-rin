import { useEffect, useState } from "react";

// Extracted verbatim from RevisionLanding (REV-LAND, S81) when Onboarding
// (ONB-1) needed the same effect. Shared because two typewriters that drift
// apart is two different voices for the same product — the greeting on the
// Revision landing and Olórin's beats in the welcome should feel like one
// character typing.
//
// Behaviour is UNCHANGED from the original: callers pass `animate:false` for
// the instant path (a return visit, or prefers-reduced-motion), and the hook
// renders the full string immediately rather than typing it out.

/** Typewriter over `text`; instant when `animate` is false. */
export function useTypewriter(text: string, animate: boolean, speedMs: number) {
  const [shown, setShown] = useState(animate ? 0 : text.length);
  useEffect(() => {
    if (!animate) {
      setShown(text.length);
      return;
    }
    setShown(0);
    let i = 0;
    const t = setInterval(() => {
      i += 1;
      setShown(i);
      if (i >= text.length) clearInterval(t);
    }, speedMs);
    return () => clearInterval(t);
  }, [text, animate, speedMs]);
  return { visible: text.slice(0, shown), done: shown >= text.length };
}
