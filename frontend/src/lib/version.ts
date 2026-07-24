/**
 * Slice TWOWAY-FIX — staleness detection for a tab left open across a deploy.
 *
 * The incident that motivated this: a tutor's tab kept running a pre-TWOWAY-1 bundle
 * after the deploy. It had no plan-gate card, so the gate the server kept opening was
 * invisible, and every go-ahead re-triggered work the tab could not display. An hour
 * of "the AI is broken" that a single refresh would have fixed.
 *
 * The mechanism is deliberately dumb and backend-free: the build bakes an id into the
 * bundle AND writes the same id to `/version.json` beside it (see vite.config.ts).
 * If the file on the server no longer matches what this bundle was built with, the
 * server is offering a different app than the one running here.
 *
 * Checked on mount, whenever the tab is re-focused (the moment a user comes back to a
 * long-idle tab — precisely the incident's shape), and on a slow interval for a tab
 * that is watched but never re-focused.
 */
import { useEffect, useState } from "react";

declare const __BUILD_ID__: string;

/** Slow on purpose. Focus is the signal that matters; this is the backstop for a tab
 *  sitting open and visible for hours, and it must never look like a heartbeat. */
const POLL_MS = 15 * 60 * 1000;

export function useAppVersion(): { stale: boolean } {
  const [stale, setStale] = useState(false);

  useEffect(() => {
    // Once stale, stop asking — the answer cannot change back, and a tab that has
    // been told to refresh should not keep polling forever.
    if (stale) return;
    let alive = true;

    async function check() {
      try {
        // Cache-busted twice over: `no-store` for well-behaved caches, and a unique
        // query for anything between here and the origin that ignores it. Getting a
        // CACHED version.json would defeat the entire point of the file.
        const res = await fetch(`/version.json?t=${Date.now()}`, {
          cache: "no-store",
        });
        if (!res.ok) return; // dev (no dist), a blip, or an old deploy with no stamp
        const body = (await res.json()) as { build?: unknown };
        if (!alive) return;
        // Only a CONFIRMED difference counts. A missing/!string field means the file
        // isn't what we think it is — treat that as "no information", never as stale:
        // a false "please refresh" spends the user's trust on nothing.
        if (typeof body.build === "string" && body.build !== __BUILD_ID__) {
          setStale(true);
        }
      } catch {
        // Offline, or the server is mid-deploy. Silence is correct — this check must
        // never surface an error of its own.
      }
    }

    void check();
    const onFocus = () => {
      if (document.visibilityState === "visible") void check();
    };
    document.addEventListener("visibilitychange", onFocus);
    window.addEventListener("focus", onFocus);
    const timer = setInterval(check, POLL_MS);
    return () => {
      alive = false;
      document.removeEventListener("visibilitychange", onFocus);
      window.removeEventListener("focus", onFocus);
      clearInterval(timer);
    };
  }, [stale]);

  return { stale };
}
