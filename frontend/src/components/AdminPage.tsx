import { useEffect, useState } from "react";
import { getAdminBoard, setAdminBoard, trpc } from "../trpc";
import { AdminPeoplePanel } from "./AdminPeoplePanel";
import { AdminChaptersPanel } from "./AdminChaptersPanel";
import "./admin.css";

type BoardOption = Awaited<ReturnType<typeof trpc.session.listBoards.query>>[number];

// Slice QA3-b — the ADMIN topics.md ingest tool (D-QA3-6): the sole prod write
// path for a chapter's curriculum spine + raw topics.md. Flow (D-QA3-b-1):
// pick a chapter → paste topics.md → Extract (one AI call → normalized preview)
// → review → Confirm (commit: refuse-if-dependent → upsert spine + store blob).
// Role-routed from App.tsx when me.role === 'admin'. All classes `.adm-`-scoped
// to dodge the global revision-shell.css landmine (same discipline as .par-/.tut-).

type Chapter = Awaited<ReturnType<typeof trpc.admin.listChapters.query>>[number];
// AIJOB-1: extraction is async now — the mutation returns a job id and the
// result arrives via getExtractJob's `completed` state, so the shape the UI
// renders is that job's `result`, not the mutation's return.
type ExtractJobStatus = Awaited<ReturnType<typeof trpc.admin.getExtractJob.query>>;
type Extraction = Extract<ExtractJobStatus, { state: "completed" }>["result"];

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
  const [tab, setTab] = useState<"ingest" | "chapters" | "people">("ingest");

  // ADM-CH — the admin's board. Every admin.* call is board-scoped (x-board),
  // but the founder is admin-only with no student board to borrow → without this
  // switcher every content call fails "no board". Defaults to the first offered
  // board on mount so all three tabs work immediately.
  const [boards, setBoards] = useState<BoardOption[] | null>(null);
  const [board, setBoardState] = useState<string | null>(getAdminBoard());

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

  // Load the offered boards once; default the switcher to the first if unset.
  useEffect(() => {
    trpc.session.listBoards
      .query()
      .then((bs) => {
        setBoards(bs);
        if (!getAdminBoard() && bs[0]) {
          setAdminBoard(bs[0].slug);
          setBoardState(bs[0].slug);
        }
      })
      .catch((e) => setError(String(e?.message ?? e)));
  }, []);

  function onPickBoard(slug: string) {
    setAdminBoard(slug);
    setBoardState(slug);
    setError(null);
    setCommitted(null);
  }

  function loadChapters() {
    if (!board) return; // no board → the call would 400 "no board"; wait for the switcher
    trpc.admin.listChapters
      .query()
      .then(setChapters)
      .catch((e) => setError(String(e?.message ?? e)));
  }
  // Re-fetch on board change — chapters are board-scoped.
  useEffect(loadChapters, [board]);

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
      // AIJOB-1: enqueue → poll. The worker runs the (150–260s) extraction OFF
      // the request path, so the request returns a job id in ms and we poll for
      // the result instead of holding a POST open (which used to 120s-timeout).
      // `busy === "extract"` keeps the elapsed-seconds timer ticking the whole
      // time — that IS the "in progress" the admin sees.
      const { jobId } = await trpc.admin.extractTopicsMd.mutate({ rawMd });
      // Ceiling: 320 × 2.5s = ~13 min, comfortably over the worker's 600s leash
      // so a real result is never cut off; only a truly wedged job trips it.
      for (let i = 0; i < 320; i++) {
        await new Promise((r) => setTimeout(r, 2500));
        const s = await trpc.admin.getExtractJob.query({ jobId });
        if (s.state === "completed") {
          setExtraction(s.result);
          return;
        }
        if (s.state === "failed") {
          setError(s.error);
          return;
        }
        if (s.state === "unknown") {
          setError("Extraction job not found (it may have expired). Please retry.");
          return;
        }
        // waiting / active → still running; keep polling.
      }
      setError("Extraction is taking unusually long — it may still finish. Reload to check, or retry.");
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
            Admin · {tab === "ingest" ? "topics.md ingest" : tab === "chapters" ? "add chapters" : "people"}
          </div>
          <h1 className="adm-title">{adminName}</h1>
        </div>
        <div className="adm-header-right">
          <label className="adm-board-switch">
            <span>Board</span>
            <select
              className="adm-select adm-board-select"
              value={board ?? ""}
              onChange={(e) => onPickBoard(e.target.value)}
            >
              {board === null && <option value="">- board -</option>}
              {(boards ?? []).map((b) => (
                <option key={b.slug} value={b.slug}>
                  {b.name}
                </option>
              ))}
            </select>
          </label>
          <button className="adm-signout" onClick={onSignOut}>
            Sign out
          </button>
        </div>
      </header>

      <nav className="adm-tabs">
        <button
          className={`adm-tab${tab === "ingest" ? " adm-tab-on" : ""}`}
          onClick={() => setTab("ingest")}
        >
          Content
        </button>
        <button
          className={`adm-tab${tab === "chapters" ? " adm-tab-on" : ""}`}
          onClick={() => setTab("chapters")}
        >
          Chapters
        </button>
        <button
          className={`adm-tab${tab === "people" ? " adm-tab-on" : ""}`}
          onClick={() => setTab("people")}
        >
          People
        </button>
      </nav>

      {tab === "people" ? (
        <AdminPeoplePanel adminEmail={adminEmail} />
      ) : tab === "chapters" ? (
        board ? (
          <AdminChaptersPanel board={board} />
        ) : (
          <p className="adm-muted">Pick a board to add chapters.</p>
        )
      ) : (
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
