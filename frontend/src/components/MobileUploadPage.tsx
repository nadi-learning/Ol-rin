import { useEffect, useRef, useState } from "react";
import { MathText } from "./MathText";
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

/**
 * One picked photo + its display preview. `url` is "" when a HEIC thumbnail
 * failed to render — the ORIGINAL file still uploads fine, so a failed preview
 * must never drop the file (that was the old shape's temptation: two parallel
 * arrays, `files` and `previews`, that could drift out of alignment).
 */
type Pick = { file: File; url: string };

/** Matches the server's MAX_PHOTOS (`src/services/upload.ts:30`). */
const MAX_PHOTOS = 10;

const FALLBACK = "Something went wrong. Try again.";
const COPY: Record<string, string> = {
  TOKEN_NOT_FOUND: "This upload link is invalid.",
  TOKEN_EXPIRED: "This link has expired. Generate a fresh QR on your computer.",
  ALREADY_UPLOADED: "A photo was already uploaded for this question.",
  NO_FILES: "Pick at least one photo first.",
  TOO_MANY_FILES: "Too many photos - 10 max.",
  NOT_AN_IMAGE: "One of those files isn’t an image.",
  NETWORK: "Network error - check your connection and try again.",
};
const copy = (code: string | null): string =>
  (code ? COPY[code] : undefined) ?? FALLBACK;

export function MobileUploadPage({ token }: { token: string }) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [view, setView] = useState<PhoneView | null>(null);
  const [errCode, setErrCode] = useState<string | null>(null);
  const [inlineErr, setInlineErr] = useState<string | null>(null);
  const [items, setItems] = useState<Pick[]>([]);

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
        if (body.status === "pending") {
          setPhase("ready");
        } else if (body.status === "uploaded" || body.status === "consumed") {
          // genuinely already used (a photo landed for this slot)
          setErrCode("ALREADY_UPLOADED");
          setPhase("error");
        } else {
          // missing/unknown status (e.g. a non-JSON body from a mis-proxied
          // request) — surface a real error, NOT a misleading "already uploaded".
          setErrCode("ERROR");
          setPhase("error");
        }
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

  // Revoke preview object URLs on UNMOUNT ONLY. A `[previews]`-keyed cleanup
  // (the old shape) fires on every change, so appending would revoke the URLs
  // of the photos already on screen and blank their thumbnails. The ref keeps
  // the latest list reachable from an unmount-only effect.
  const itemsRef = useRef<Pick[]>([]);
  itemsRef.current = items;
  useEffect(
    () => () => itemsRef.current.forEach((it) => it.url && URL.revokeObjectURL(it.url)),
    [],
  );

  /**
   * Picking APPENDS. It used to replace the whole list, which is why the button
   * labelled "add more" silently discarded the photos already taken — a
   * multi-page written answer could never be uploaded. Each camera round-trip
   * hands back one file, so append is what makes "photograph page 2" work at
   * all.
   */
  async function onPick(list: FileList | null) {
    setInlineErr(null);
    const picked = list ? Array.from(list) : [];
    if (picked.length === 0) return;

    const room = MAX_PHOTOS - items.length;
    if (room <= 0) {
      setInlineErr(copy("TOO_MANY_FILES"));
      return;
    }
    const taking = picked.slice(0, room);
    if (taking.length < picked.length) setInlineErr(copy("TOO_MANY_FILES"));

    // Build display previews for the NEW files only. HEIC → JPEG for the
    // thumbnail ONLY; the file we upload is the untouched original (Gemini
    // reads HEIC).
    const fresh: Pick[] = [];
    for (const f of taking) {
      const isHeic = /heic|heif/i.test(f.type) || /\.hei[cf]$/i.test(f.name);
      if (isHeic) {
        try {
          const heic2any = (await import("heic2any")).default as (
            o: { blob: Blob; toType?: string; quality?: number },
          ) => Promise<Blob | Blob[]>;
          const jpg = await heic2any({ blob: f, toType: "image/jpeg", quality: 0.7 });
          fresh.push({ file: f, url: URL.createObjectURL(Array.isArray(jpg) ? jpg[0]! : jpg) });
        } catch {
          fresh.push({ file: f, url: "" }); // preview failed — original still uploads
        }
      } else {
        fresh.push({ file: f, url: URL.createObjectURL(f) });
      }
    }
    setItems((prev) => [...prev, ...fresh]);
  }

  /** Drop one bad shot without starting the whole batch over. */
  function removeAt(i: number) {
    setInlineErr(null);
    setItems((prev) => {
      const gone = prev[i];
      if (gone?.url) URL.revokeObjectURL(gone.url);
      return prev.filter((_, n) => n !== i);
    });
  }

  async function upload() {
    if (items.length === 0) {
      setInlineErr(copy("NO_FILES"));
      return;
    }
    setPhase("uploading");
    setInlineErr(null);
    // ONE batch, all photos. The token is single-use server-side
    // (`upload.ts:237` — a second POST gets ALREADY_UPLOADED), so everything
    // the student wants attached to this answer has to go up together.
    const fd = new FormData();
    for (const { file } of items) fd.append("answer_image", file, file.name); // original bytes
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
            <p className="up-state-msg">
              {items.length > 1 ? `${items.length} photos uploaded.` : "Photo uploaded."}
            </p>
            <p className="up-muted">Return to your computer - it’ll pick this up automatically.</p>
          </div>
        )}

        {(phase === "ready" || phase === "uploading") && view && (
          <>
            <p className="up-eyebrow">Upload your answer</p>
            <p className="up-stem">
              <MathText text={view.stem} />
            </p>

            {/* 🔑 NO `capture` attribute. It used to be `capture="environment"`,
                which tells the phone to open the CAMERA directly — and a camera
                hands back exactly one frame, so `multiple` was dead on the only
                device this page runs on. Without it, iOS/Android show the picker
                ("Photo Library" — multi-select — / "Take Photo"), which is what
                actually lets a student attach three pages of working. Taking one
                shot at a time still works: each pick appends. */}
            <label className="up-pick">
              <input
                type="file"
                accept="image/*"
                multiple
                disabled={phase === "uploading" || items.length >= MAX_PHOTOS}
                onChange={(e) => {
                  onPick(e.target.files);
                  e.target.value = ""; // re-picking the same file must re-fire
                }}
              />
              <span className="up-pick-face">
                📷 {items.length === 0 ? "Take / choose photos" : "Add another photo"}
              </span>
            </label>

            {items.length > 0 && (
              <>
                <div className="up-thumbs">
                  {items.map((it, i) => (
                    <div key={`${it.file.name}-${i}`} className="up-thumb-wrap">
                      {it.url ? (
                        <img className="up-thumb" src={it.url} alt={`Answer photo ${i + 1}`} />
                      ) : (
                        <div className="up-thumb up-thumb-fallback">📄</div>
                      )}
                      <span className="up-thumb-n">{i + 1}</span>
                      <button
                        type="button"
                        className="up-thumb-x"
                        aria-label={`Remove photo ${i + 1}`}
                        disabled={phase === "uploading"}
                        onClick={() => removeAt(i)}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
                <p className="up-muted up-count">
                  {items.length} of {MAX_PHOTOS} · they upload together, so add every page
                  before you send.
                </p>
              </>
            )}

            {inlineErr && <p className="up-err">{inlineErr}</p>}

            <button
              className="up-btn"
              onClick={upload}
              disabled={phase === "uploading" || items.length === 0}
            >
              {phase === "uploading"
                ? "Uploading…"
                : `Upload ${items.length || ""} photo${items.length === 1 ? "" : "s"}`}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
