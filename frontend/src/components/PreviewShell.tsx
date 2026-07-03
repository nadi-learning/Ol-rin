// PreviewShell (ported from Starkhorn nadi-frontend) — loads a published module
// bundle and renders one slide inside the revision host.
//
// LOAD-ORDER INVARIANT (don't break this): the bundle reads
// window.__REVISION_REACT__ at module-eval time. We MUST set that global BEFORE
// the dynamic import() resolves — done synchronously at the top of the effect,
// before import() is kicked off.
//
// The bundle shape (b2c seed / Starkhorn slide_bundle.ts):
//   export default { contractVersion, components: { [slideKey]: Component } }
// where each component takes { studentName, onEvent, onReady? }.
//
// b2c difference from Starkhorn: the bundle URL is the membership-gated
// /content/bundle/:versionId?board=… handed back by revision.getSlide (not
// /api/preview/bundle/:slideId).
//
// SLIDE DESIGN FIDELITY (D-S4-3 reversed): the slide bundle injects ZERO CSS of
// its own — it relies entirely on the revision design context it was authored
// against. We render it inside `.revision-shell-host` (Starkhorn's verbatim
// `revision-shell.css`, byte-identical tokens to current b2c prod) + the
// `interactive-frame` chrome (`.nadi-iframe__*`). Both are scoped to their host
// class, so they CANNOT leak into the TAITOR app shell. The content team owns
// this design; we copy it verbatim and never fork it.

import {
  useEffect,
  useRef,
  useState,
  type ComponentType,
  type ReactNode,
} from "react";
import * as React from "react";

import "../styles/revision-shell.css";
import "../styles/interactive-frame.css";

interface SlideComponentProps {
  studentName: string;
  onEvent: (type: string, payload: Record<string, unknown>) => void;
  onReady?: (ready: boolean) => void;
}
type SlideComponent = ComponentType<SlideComponentProps>;
interface SlideModule {
  default: { contractVersion: unknown; components: Record<string, SlideComponent> };
}

interface Props {
  /** Full membership-gated bundle URL from revision.getSlide (carries ?board=). */
  bundleUrl: string;
  /** The bundle's components-map key (revision.getSlide → slideId). */
  slideKey: string;
  studentName?: string;
  onEvent?: (type: string, payload: Record<string, unknown>) => void;
  /**
   * Optional in-slide Quick Check. Rendered INSIDE the `.revision-slide` grid as
   * `.revision-questions-wrap` (grid-column 2 / row 2) — the right column, under
   * the interactive panel — matching prod/Starkhorn. Only shown once the slide is
   * loaded. Pass null/undefined for slides with no Quick Check.
   */
  questions?: ReactNode;
}

type LoadState =
  | { kind: "loading" }
  | { kind: "not_found" }
  | { kind: "error"; message: string }
  | { kind: "ready"; Component: SlideComponent };

export function PreviewShell({
  bundleUrl,
  slideKey,
  studentName = "there",
  onEvent = () => {},
  questions = null,
}: Props) {
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const cacheBuster = useRef(0);

  useEffect(() => {
    // STEP 1 — expose host React on window BEFORE the import. Idempotent. The
    // bundle reads it back via its shim, guaranteeing a single React instance.
    if (typeof window !== "undefined") {
      (window as unknown as { __REVISION_REACT__?: typeof React }).__REVISION_REACT__ =
        React;
    }

    let cancelled = false;
    setState({ kind: "loading" });

    // STEP 2 — kick the dynamic import. Cache-bust so a re-publish (v2) is
    // picked up on reload without a stale module from the HTTP cache.
    cacheBuster.current += 1;
    const sep = bundleUrl.includes("?") ? "&" : "?";
    const url = `${bundleUrl}${sep}t=${cacheBuster.current}`;

    import(/* @vite-ignore */ url)
      .then((mod: SlideModule) => {
        if (cancelled) return;
        const Comp = mod?.default?.components?.[slideKey];
        if (!Comp) {
          setState({
            kind: "error",
            message: `Bundle loaded but has no component for '${slideKey}'.`,
          });
          return;
        }
        setState({ kind: "ready", Component: Comp });
      })
      .catch(async (err: unknown) => {
        if (cancelled) return;
        // Disambiguate "gated/missing" (4xx) from a real parse/network error.
        try {
          const resp = await fetch(url, { method: "GET", credentials: "include" });
          if (resp.status === 404) return setState({ kind: "not_found" });
          if (resp.status === 401 || resp.status === 403) {
            return setState({ kind: "error", message: "Not authorised for this slide." });
          }
        } catch {
          /* fall through to the raw error */
        }
        setState({
          kind: "error",
          message: err instanceof Error ? err.message : String(err ?? "unknown error"),
        });
      });

    return () => {
      cancelled = true;
    };
  }, [bundleUrl, slideKey]);

  if (state.kind === "loading") {
    return <HostMessage>Loading slide…</HostMessage>;
  }
  if (state.kind === "not_found") {
    return <HostMessage>No slide published for this sub-topic yet.</HostMessage>;
  }
  if (state.kind === "error") {
    return (
      <HostMessage tone="error">
        Couldn’t load the slide
        <pre
          style={{
            margin: "12px 0 0",
            maxWidth: 560,
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            fontSize: 12,
            textAlign: "left",
            background: "#fef3f2",
            border: "1px solid #fecdca",
            borderRadius: 10,
            padding: "10px 12px",
            color: "#b42318",
          }}
        >
          {state.message}
        </pre>
      </HostMessage>
    );
  }

  const Component = state.Component;
  // Faithful Starkhorn wrapper: `.revision-shell-host` provides the scoped
  // design context (tokens, fonts, reset); `.revision-slide slide-visible` is
  // the two-panel grid the slide's .slide-left/.slide-right render into.
  return (
    <div
      className="revision-shell-host"
      data-rev-theme="light"
      style={{ overflow: "auto", height: "100%" }}
    >
      <div className="revision-slide slide-visible">
        <Component studentName={studentName} onEvent={onEvent} onReady={() => {}} />
        {/* In-slide Quick Check — a grid sibling of the slide so the verbatim
            revision-shell rule (.revision-questions-wrap → grid-column 2 / row 2)
            lands it in the right column under the interactive (prod layout). */}
        {questions != null && (
          <div className="revision-questions-wrap">{questions}</div>
        )}
      </div>
    </div>
  );
}

// Host-level chrome (loading / not-found / error) — NOT slide content, so it
// gets self-contained inline styles rather than the (retired) revision-host.css.
// Rendered inside `.revision-shell-host` so it picks up the same fonts/colors.
function HostMessage({
  children,
  tone = "info",
}: {
  children: React.ReactNode;
  tone?: "info" | "error";
}) {
  return (
    <div
      className="revision-shell-host"
      data-rev-theme="light"
      style={{
        display: "grid",
        placeItems: "center",
        minHeight: 160,
        padding: 32,
        textAlign: "center",
        fontSize: 15,
        color: tone === "error" ? "#b42318" : "var(--text-muted)",
      }}
    >
      <div>{children}</div>
    </div>
  );
}
