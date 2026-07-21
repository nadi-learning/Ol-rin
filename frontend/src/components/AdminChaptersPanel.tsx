import { useEffect, useState } from "react";
import { trpc } from "../trpc";

// Slice ADM-CH — seed a board's curriculum spine. Pick (or create) a subject,
// then paste chapter names one per line; each becomes an empty chapter shell the
// topics.md ingest tool fills later. Board-scoped: every call rides x-board from
// the admin board switcher (AdminPage). All classes `.adm-`-prefixed (the global
// revision-shell.css landmine, same as the other admin panels).

type Subject = Awaited<ReturnType<typeof trpc.admin.listSubjects.query>>[number];
type AddResult = Awaited<ReturnType<typeof trpc.admin.addChapters.mutate>>;

// The grades the product offers (S135: SUPPORTED_GRADES, igcse dropped). A
// subject is (name × grade), so the grade is chosen when a subject is created.
const GRADES = ["8", "9", "10", "11"] as const;

const NEW_SUBJECT = "__new__";

export function AdminChaptersPanel({ board }: { board: string }) {
  const [subjects, setSubjects] = useState<Subject[] | null>(null);
  const [subjectId, setSubjectId] = useState<string>("");
  const [newName, setNewName] = useState<string>("");
  const [newGrade, setNewGrade] = useState<string>(GRADES[0]);
  const [rawNames, setRawNames] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AddResult | null>(null);

  function loadSubjects() {
    trpc.admin.listSubjects
      .query()
      .then(setSubjects)
      .catch((e) => setError(String(e?.message ?? e)));
  }
  // Re-fetch whenever the board switches — subjects are board-scoped.
  useEffect(() => {
    setSubjects(null);
    setSubjectId("");
    setResult(null);
    setError(null);
    loadSubjects();
  }, [board]);

  const creatingSubject = subjectId === NEW_SUBJECT;
  const names = rawNames
    .split("\n")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  const canSubmit =
    !busy &&
    names.length > 0 &&
    (creatingSubject ? newName.trim().length > 0 : subjectId.length > 0);

  async function onSubmit() {
    setError(null);
    setResult(null);
    setBusy(true);
    try {
      // Resolve the target subject: an existing pick, or create one first.
      let targetId = subjectId;
      if (creatingSubject) {
        const subj = await trpc.admin.createSubject.mutate({
          name: newName.trim(),
          grade: newGrade,
        });
        targetId = subj.subjectId;
      }
      const r = await trpc.admin.addChapters.mutate({ subjectId: targetId, names });
      setResult(r);
      setRawNames("");
      if (creatingSubject) {
        setNewName("");
        // Reload so the fresh subject shows, and select it for a follow-up add.
        loadSubjects();
        setSubjectId(targetId);
      } else {
        loadSubjects();
      }
    } catch (e: any) {
      setError(String(e?.message ?? e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="adm-grid">
      <section className="adm-panel">
        {error && <p className="adm-error">{error}</p>}
        {result && (
          <p className="adm-ok">
            Added {result.created.length} chapter{result.created.length === 1 ? "" : "s"}
            {result.skipped.length > 0
              ? ` · skipped ${result.skipped.length} already-present (${result.skipped.join(", ")})`
              : ""}
          </p>
        )}

        <label className="adm-label">Subject</label>
        <select
          className="adm-select"
          value={subjectId}
          onChange={(e) => {
            setSubjectId(e.target.value);
            setResult(null);
          }}
        >
          <option value="">- pick a subject -</option>
          {(subjects ?? []).map((s) => (
            <option key={s.subjectId} value={s.subjectId}>
              {s.name} · grade {s.grade} ({s.chapterCount} chapter{s.chapterCount === 1 ? "" : "s"})
            </option>
          ))}
          <option value={NEW_SUBJECT}>+ New subject…</option>
        </select>

        {creatingSubject && (
          <div className="adm-newsubject">
            <input
              className="adm-input"
              placeholder="Subject name (e.g. Physics)"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
            />
            <select
              className="adm-select"
              value={newGrade}
              onChange={(e) => setNewGrade(e.target.value)}
            >
              {GRADES.map((g) => (
                <option key={g} value={g}>
                  Grade {g}
                </option>
              ))}
            </select>
          </div>
        )}

        <label className="adm-label">Chapters (one per line)</label>
        <textarea
          className="adm-textarea"
          placeholder={"Paste chapter names, one per line…\nMotion\nForce and Laws of Motion\nGravitation"}
          value={rawNames}
          onChange={(e) => setRawNames(e.target.value)}
          spellCheck={false}
        />
        <div className="adm-hint">
          {names.length > 0
            ? `${names.length} chapter${names.length === 1 ? "" : "s"} to add · appended after existing ones`
            : "Each non-empty line becomes a chapter (auto-ordered)."}
        </div>
        <button className="adm-btn" disabled={!canSubmit} onClick={onSubmit}>
          {busy ? "Adding…" : "Add chapters"}
        </button>
      </section>

      <section className="adm-panel">
        <label className="adm-label">Subjects on this board</label>
        {subjects === null ? (
          <p className="adm-muted">Loading…</p>
        ) : subjects.length === 0 ? (
          <p className="adm-muted">No subjects yet — create one to add chapters under it.</p>
        ) : (
          <ul className="adm-subject-list">
            {subjects.map((s) => (
              <li key={s.subjectId} className="adm-subject-row">
                <span className="adm-subject-name">
                  {s.name} · grade {s.grade}
                </span>
                <span className="adm-subject-count">
                  {s.chapterCount} chapter{s.chapterCount === 1 ? "" : "s"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
