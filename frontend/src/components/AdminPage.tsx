import { useEffect, useState } from "react";
import { trpc } from "../trpc";
import { AdminPeoplePanel } from "./AdminPeoplePanel";
import "./admin.css";

// Slice QA3-b — the ADMIN topics.md ingest tool (D-QA3-6): the sole prod write
// path for a chapter's curriculum spine + raw topics.md. Flow (D-QA3-b-1):
// pick a chapter → paste topics.md → Extract (one AI call → normalized preview)
// → review → Confirm (commit: refuse-if-dependent → upsert spine + store blob).
// Role-routed from App.tsx when me.role === 'admin'. All classes `.adm-`-scoped
// to dodge the global revision-shell.css landmine (same discipline as .par-/.tut-).

type Chapter = Awaited<ReturnType<typeof trpc.admin.listChapters.query>>[number];
type Extraction = Awaited<ReturnType<typeof trpc.admin.extractTopicsMd.mutate>>;

export function AdminPage({
  adminName,
  adminEmail,
  onSignOut,
}: {
  adminName: string;
  adminEmail: string;
  onSignOut: () => void;
}) {
  // Slice D — the admin surface grew a second job (people), so the header gets a
  // tab strip. Ingest stays the default: it is the older tool and the one an
  // admin arrives for; people is the new capability the whitelist's death
  // requires. Local state, not a route — AdminPage is already reached by role
  // routing, not by URL, so a router would be the only URL-aware thing here.
  const [tab, setTab] = useState<"ingest" | "people">("ingest");

  const [chapters, setChapters] = useState<Chapter[] | null>(null);
  const [chapterId, setChapterId] = useState<string>("");
  const [rawMd, setRawMd] = useState<string>("");
  const [extraction, setExtraction] = useState<Extraction | null>(null);
  const [busy, setBusy] = useState<null | "extract" | "commit">(null);
  const [error, setError] = useState<string | null>(null);
  const [committed, setCommitted] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);

  // Tick an elapsed-seconds counter while extracting — the AI call is uncapped
  // and can run a few minutes on a large topics.md, so the bar + timer keep the
  // UI from reading as frozen.
  useEffect(() => {
    if (busy !== "extract") return;
    setElapsed(0);
    const started = Date.now();
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 500);
    return () => clearInterval(id);
  }, [busy]);

  function loadChapters() {
    trpc.admin.listChapters
      .query()
      .then(setChapters)
      .catch((e) => setError(String(e?.message ?? e)));
  }
  useEffect(loadChapters, []);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file
    if (!f) return;
    setError(null);
    setCommitted(null);
    setExtraction(null);
    try {
      setRawMd(await f.text());
      setFileName(f.name);
    } catch (err: any) {
      setError(String(err?.message ?? err));
    }
  }

  async function onExtract() {
    setError(null);
    setCommitted(null);
    setExtraction(null);
    setBusy("extract");
    try {
      setExtraction(await trpc.admin.extractTopicsMd.mutate({ rawMd }));
    } catch (e: any) {
      setError(String(e?.message ?? e));
    } finally {
      setBusy(null);
    }
  }

  async function onCommit() {
    if (!extraction || !chapterId) return;
    setError(null);
    setBusy("commit");
    try {
      const r = await trpc.admin.commitTopicsMd.mutate({
        chapterId,
        rawMd,
        extracted: extraction.extracted,
      });
      setCommitted(`Committed - ${r.topics} topics · ${r.subTopics} sub-topics · ${r.los} LOs`);
      setExtraction(null);
      loadChapters();
    } catch (e: any) {
      setError(String(e?.message ?? e));
    } finally {
      setBusy(null);
    }
  }

  const canExtract = rawMd.trim().length > 0 && busy === null;
  const canCommit = Boolean(extraction?.validation.ok) && chapterId !== "" && busy === null;

  return (
    <div className="adm-root graph-paper">
      <header className="adm-header">
        <div>
          <div className="adm-eyebrow">
            Admin · {tab === "ingest" ? "topics.md ingest" : "people"}
          </div>
          <h1 className="adm-title">{adminName}</h1>
        </div>
        <button className="adm-signout" onClick={onSignOut}>
          Sign out
        </button>
      </header>

      <nav className="adm-tabs">
        <button
          className={`adm-tab${tab === "ingest" ? " adm-tab-on" : ""}`}
          onClick={() => setTab("ingest")}
        >
          Content
        </button>
        <button
          className={`adm-tab${tab === "people" ? " adm-tab-on" : ""}`}
          onClick={() => setTab("people")}
        >
          People
        </button>
      </nav>

      {tab === "people" ? <AdminPeoplePanel adminEmail={adminEmail} /> : (
      <>
      {error && <p className="adm-error">{error}</p>}
      {committed && <p className="adm-ok">{committed}</p>}

      <div className="adm-grid">
        <section className="adm-panel">
          <label className="adm-label">Target chapter</label>
          <select
            className="adm-select"
            value={chapterId}
            onChange={(e) => setChapterId(e.target.value)}
          >
            <option value="">- pick a chapter -</option>
            {(chapters ?? []).map((c) => (
              <option key={c.chapterId} value={c.chapterId}>
                {c.subjectName} {c.grade} · {c.name}
                {c.hasTopicsMd ? " ✓" : ""}
              </option>
            ))}
          </select>

          <div className="adm-label-row">
            <label className="adm-label">topics.md</label>
            <label className="adm-upload">
              Upload .md
              <input
                type="file"
                accept=".md,.markdown,text/markdown,text/plain"
                hidden
                onChange={onFile}
              />
            </label>
          </div>
          {fileName && <div className="adm-filename">Loaded: {fileName}</div>}
          <textarea
            className="adm-textarea"
            placeholder="Upload a .md file or paste the chapter's topics.md here…"
            value={rawMd}
            onChange={(e) => {
              setRawMd(e.target.value);
              if (fileName) setFileName(null);
            }}
            spellCheck={false}
          />
          <button className="adm-btn" disabled={!canExtract} onClick={onExtract}>
            {busy === "extract" ? "Extracting…" : "Extract preview"}
          </button>
          {busy === "extract" && (
            <div className="adm-progress" role="status" aria-live="polite">
              <div className="adm-progress-track">
                <div className="adm-progress-bar" />
              </div>
              <p className="adm-progress-hint">
                Reading the topics.md with AI - this can take a few minutes for a
                large file. Elapsed {elapsed}s
              </p>
            </div>
          )}
        </section>

        <section className="adm-panel">
          <label className="adm-label">Normalized preview</label>
          {!extraction ? (
            <p className="adm-muted">Extract a topics.md to preview its spine.</p>
          ) : (
            <>
              {!extraction.validation.ok && (
                <div className="adm-invalid">
                  <b>Cannot commit - fix these:</b>
                  <ul>
                    {extraction.validation.errors.map((er, i) => (
                      <li key={i}>{er}</li>
                    ))}
                  </ul>
                </div>
              )}
              <Preview extraction={extraction} />
              <button className="adm-btn adm-btn-commit" disabled={!canCommit} onClick={onCommit}>
                {busy === "commit" ? "Committing…" : "Confirm & commit"}
              </button>
            </>
          )}
        </section>
      </div>
      </>
      )}
    </div>
  );
}

function Preview({ extraction }: { extraction: Extraction }) {
  const { topics, thresholds } = extraction.extracted;
  return (
    <div className="adm-preview">
      {topics.map((t, ti) => (
        <div key={ti} className="adm-topic">
          <div className="adm-topic-name">{t.name}</div>
          {t.subTopics.map((s, si) => (
            <div key={si} className="adm-sub">
              <div className="adm-sub-name">{s.name}</div>
              <ul className="adm-los">
                {s.learningObjectives.map((lo, li) => (
                  <li key={li}>
                    <span className={`adm-axis adm-axis-${lo.axis}`}>{lo.axis[0]!.toUpperCase()}</span>
                    {lo.code ? <span className="adm-code">{lo.code}</span> : null}
                    <span className="adm-lo-desc">{lo.description}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      ))}
      {thresholds.length > 0 && (
        <div className="adm-thresholds">
          <b>Thresholds:</b> {thresholds.map((th) => th.name).join(" · ")}
        </div>
      )}
    </div>
  );
}
