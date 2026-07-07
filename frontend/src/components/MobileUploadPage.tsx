import { useEffect, useState } from "react";
import "./upload.css";

// Cross-Device Upload — the UNAUTHENTICATED phone page (Slice Q3-3, Option B).
//
// The student scans the desktop QR → lands here at `/u/:token` (rendered by
// main.tsx OUTSIDE the App tree: no auth, no tRPC, no AppShell). The token in
// the path is the whole credential. This page talks ONLY to the backend's
// unauth JSON API at `/upload/:token` (GET stem, POST photos) — same-origin
// through the vite `/upload` proxy in dev, nginx `/upload`→BE in prod.
//
// HEIC handling: iPhones shoot HEIC. Gemini reads HEIC directly (D-Q3-3), so we
// upload the ORIGINAL bytes untouched; heic2any is used ONLY to render a JPEG
// preview thumbnail (browsers can't <img> HEIC reliably). All classes `.up-`.

type PhoneView = {
  status: string;
  stem: string;
  photoCount: number;
  expiresAt: string;
};
type Phase = "loading" | "ready" | "uploading" | "done" | "error";

const TERMINAL = new Set([
  "TOKEN_NOT_FOUND",
  "TOKEN_EXPIRED",
  "ALREADY_UPLOADED",
]);

const FALLBACK = "Something went wrong. Try again.";
const COPY: Record<string, string> = {
  TOKEN_NOT_FOUND: "This upload link is invalid.",
  TOKEN_EXPIRED: "This link has expired. Generate a fresh QR on your computer.",
  ALREADY_UPLOADED: "A photo was already uploaded for this question.",
  NO_FILES: "Pick at least one photo first.",
  TOO_MANY_FILES: "Too many photos — 10 max.",
  NOT_AN_IMAGE: "One of those files isn’t an image.",
  NETWORK: "Network error — check your connection and try again.",
};
const copy = (code: string | null): string =>
  (code ? COPY[code] : undefined) ?? FALLBACK;

export function MobileUploadPage({ token }: { token: string }) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [view, setView] = useState<PhoneView | null>(null);
  const [errCode, setErrCode] = useState<string | null>(null);
  const [inlineErr, setInlineErr] = useState<string | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);

  // Validate the token + fetch the question stem on load.
  useEffect(() => {
    let alive = true;
    fetch(`/upload/${token}`)
      .then(async (r) => {
        const body = await r.json().catch(() => ({}));
        if (!alive) return;
        if (!r.ok) {
          setErrCode(body?.error ?? "ERROR");
          setPhase("error");
          return;
        }
        setView(body);
        if (body.status !== "pending") {
          setErrCode("ALREADY_UPLOADED");
          setPhase("error");
          return;
        }
        setPhase("ready");
      })
      .catch(() => {
        if (!alive) return;
        setErrCode("NETWORK");
        setPhase("error");
      });
    return () => {
      alive = false;
    };
  }, [token]);

  // Revoke preview object URLs on unmount.
  useEffect(() => () => previews.forEach((u) => u && URL.revokeObjectURL(u)), [previews]);

  async function onPick(list: FileList | null) {
    setInlineErr(null);
    previews.forEach((u) => u && URL.revokeObjectURL(u));
    const picked = list ? Array.from(list).slice(0, 10) : [];
    setFiles(picked);
    // Build display previews. HEIC → JPEG for the thumbnail ONLY; the file we
    // upload is the untouched original (Gemini reads HEIC).
    const urls: string[] = [];
    for (const f of picked) {
      const isHeic = /heic|heif/i.test(f.type) || /\.hei[cf]$/i.test(f.name);
      if (isHeic) {
        try {
          const heic2any = (await import("heic2any")).default as (
            o: { blob: Blob; toType?: string; quality?: number },
          ) => Promise<Blob | Blob[]>;
          const jpg = await heic2any({ blob: f, toType: "image/jpeg", quality: 0.7 });
          urls.push(URL.createObjectURL(Array.isArray(jpg) ? jpg[0]! : jpg));
        } catch {
          urls.push(""); // preview failed — the original still uploads fine
        }
      } else {
        urls.push(URL.createObjectURL(f));
      }
    }
    setPreviews(urls);
  }

  async function upload() {
    if (files.length === 0) {
      setInlineErr(copy("NO_FILES"));
      return;
    }
    setPhase("uploading");
    setInlineErr(null);
    const fd = new FormData();
    for (const f of files) fd.append("answer_image", f, f.name); // original bytes
    try {
      // No explicit content-type — the browser sets multipart boundary (M7).
      const r = await fetch(`/upload/${token}`, { method: "POST", body: fd });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) {
        const code = body?.error ?? "ERROR";
        if (TERMINAL.has(code)) {
          setErrCode(code);
          setPhase("error");
        } else {
          setInlineErr(copy(code));
          setPhase("ready");
        }
        return;
      }
      setPhase("done");
    } catch {
      setInlineErr(copy("NETWORK"));
      setPhase("ready");
    }
  }

  return (
    <div className="up-root">
      <div className="up-card">
        <div className="up-brand">Olórin</div>

        {phase === "loading" && <p className="up-muted">Loading…</p>}

        {phase === "error" && (
          <div className="up-state">
            <div className="up-emoji">{errCode === "ALREADY_UPLOADED" ? "✓" : "⚠️"}</div>
            <p className="up-state-msg">{copy(errCode)}</p>
          </div>
        )}

        {phase === "done" && (
          <div className="up-state">
            <div className="up-emoji up-ok">✓</div>
            <p className="up-state-msg">Photo uploaded.</p>
            <p className="up-muted">Return to your computer — it’ll pick this up automatically.</p>
          </div>
        )}

        {(phase === "ready" || phase === "uploading") && view && (
          <>
            <p className="up-eyebrow">Upload your answer</p>
            <p className="up-stem">{view.stem}</p>

            <label className="up-pick">
              <input
                type="file"
                accept="image/*"
                capture="environment"
                multiple
                disabled={phase === "uploading"}
                onChange={(e) => onPick(e.target.files)}
              />
              <span className="up-pick-face">
                📷 {files.length === 0 ? "Take / choose photo" : "Retake / add more"}
              </span>
            </label>

            {previews.length > 0 && (
              <div className="up-thumbs">
                {previews.map((u, i) =>
                  u ? (
                    <img key={i} className="up-thumb" src={u} alt={`Answer photo ${i + 1}`} />
                  ) : (
                    <div key={i} className="up-thumb up-thumb-fallback">
                      📄
                    </div>
                  ),
                )}
              </div>
            )}

            {inlineErr && <p className="up-err">{inlineErr}</p>}

            <button
              className="up-btn"
              onClick={upload}
              disabled={phase === "uploading" || files.length === 0}
            >
              {phase === "uploading"
                ? "Uploading…"
                : `Upload ${files.length || ""} photo${files.length === 1 ? "" : "s"}`}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
