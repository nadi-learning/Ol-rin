import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { MobileUploadPage } from "./components/MobileUploadPage";
import { UpdateBanner } from "./components/UpdateBanner";

// Cross-Device Upload (Slice Q3-3, Option B): the phone lands at `/u/:token`
// (token = 32 hex chars). Render the standalone unauth capture page OUTSIDE the
// App tree — no auth session check, no tRPC client, no AppShell. Any other path
// is the normal authed SPA.
const uploadMatch = window.location.pathname.match(/^\/u\/([0-9a-f]{32})\/?$/i);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {uploadMatch ? <MobileUploadPage token={uploadMatch[1]!} /> : <App />}
    {/* Slice TWOWAY-FIX: outside the App tree on purpose, so a stale bundle is
        reported on EVERY surface — including the phone upload page and App's
        error/loading gates, which return before any of App's own chrome renders. */}
    <UpdateBanner />
  </StrictMode>,
);
