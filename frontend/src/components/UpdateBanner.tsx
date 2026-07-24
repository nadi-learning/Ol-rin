/**
 * Slice TWOWAY-FIX — "this page is out of date, refresh".
 *
 * Rendered as a SIBLING of <App/> rather than inside it: App has a dozen early
 * returns (loading gate, error gate, waiting room, NotFound, each surface), and a
 * banner that only appears on some of them would miss exactly the long-lived tabs
 * this exists for. Outside the tree, it is unconditional.
 *
 * Deliberately NOT auto-reloading. A tutor mid-sentence in an authoring chat, or a
 * student mid-answer, would lose their unsaved text — and a page that reloads itself
 * without asking is far more alarming than a stale one. The user chooses the moment.
 */
import { useAppVersion } from "../lib/version";
import "./update-banner.css";

export function UpdateBanner() {
  const { stale } = useAppVersion();
  if (!stale) return null;
  return (
    <div className="upd-banner" role="status" aria-live="polite">
      <span className="upd-banner-text">
        A new version of Olórin is available — refresh to get it.
      </span>
      <button
        className="upd-banner-btn"
        onClick={() => window.location.reload()}
      >
        Refresh
      </button>
    </div>
  );
}
