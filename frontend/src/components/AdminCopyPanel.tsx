/**
 * AdminCopyPanel (S168, student scope added S169) — edit the parent-dashboard
 * COPY for the selected board, or for ONE named child on it. The UI half of
 * D-PDASH-3's DB override: the founder retunes the voice a parent reads without
 * a deploy.
 *
 * Board-scoped, like Chapters and Requests: `admin.listParentCopy` /
 * `admin.setParentCopy` run inside the admin's selected board, so an edit here
 * changes THIS board's page and no other's.
 *
 * TWO SCOPES (D-PDASH-8). The left rail picks one:
 *
 *     code default  →  board override  →  student override
 *
 * Editing the board changes what EVERY parent on it reads. Editing a student
 * changes one child's page and nothing else, and clearing that row drops the
 * child back to the board's voice rather than to the code default — which is why
 * the field below the box says "reverts to" and not "default" when a student is
 * selected: those are different strings, and picking the wrong one is how an
 * editor reverts further than they meant to.
 *
 * Three things the UI has to make obvious, because getting them wrong is how a
 * parent ends up looking at a broken page:
 *
 *  1. WHICH PLACEHOLDERS ARE AVAILABLE. The call sites supply a fixed set of
 *     tokens per string, and `fillCopy` throws on any other — during RENDER,
 *     which means a blank dashboard, not a blank string. The server refuses such
 *     a save (`UnsafeCopyTokensError`); this panel shows the allowed tokens up
 *     front so the refusal is rare rather than the discovery mechanism.
 *  2. WHAT IT FALLS BACK TO. Always visible under the field, so "revert" is a
 *     decision you can make with the alternative in front of you.
 *  3. THAT EMPTY MEANS REVERT, not "blank heading". D-PDASH-3 forbids a blank
 *     render outright, so clearing the box deletes the override.
 */
import { useEffect, useState } from "react";
import { trpc } from "../trpc";

type Entry = Awaited<ReturnType<typeof trpc.admin.listParentCopy.query>>[number];
type CopyStudent = Awaited<ReturnType<typeof trpc.admin.listParentCopyStudents.query>>[number];

/** null = the board's default voice; a uuid = that one child's page. */
type Scope = string | null;

export function AdminCopyPanel({ board }: { board: string }) {
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [students, setStudents] = useState<CopyStudent[] | null>(null);
  const [scope, setScope] = useState<Scope>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [filter, setFilter] = useState("");

  function load(forScope: Scope) {
    setError(null);
    trpc.admin.listParentCopy
      .query({ studentId: forScope })
      .then((rows) => {
        setEntries(rows);
        // Seed each box with the CURRENT text — this scope's override if set,
        // else what it inherits — so an editor edits what they can see rather
        // than an empty field whose meaning ("revert") is the opposite of what
        // typing into it does.
        setDrafts(Object.fromEntries(rows.map((r) => [r.key, r.override ?? r.inherited])));
      })
      .catch((e) => setError(String(e?.message ?? e)));
  }

  /** The picker feed is board-level; it only reloads when the board does. */
  function loadStudents() {
    trpc.admin.listParentCopyStudents
      .query()
      .then(setStudents)
      .catch(() => setStudents([])); // a broken picker must not hide the board editor
  }

  // A board switch invalidates BOTH the roster and the selected student — the
  // student belongs to the old board and would 404 on the next read.
  useEffect(() => {
    setScope(null);
    setEntries(null);
    loadStudents();
    load(null);
  }, [board]);

  function pick(next: Scope) {
    setScope(next);
    setEntries(null);
    setSaved(null);
    setFilter("");
    load(next);
  }

  async function save(entry: Entry, value: string | null) {
    setBusy(entry.key);
    setError(null);
    setSaved(null);
    try {
      await trpc.admin.setParentCopy.mutate({ key: entry.key, studentId: scope, value });
      setSaved(entry.key);
      load(scope);
      loadStudents(); // the per-student override counts in the rail just moved
    } catch (e: any) {
      setError(String(e?.message ?? e));
    } finally {
      setBusy(null);
    }
  }

  const selected = students?.find((s) => s.studentId === scope) ?? null;
  const rows = (entries ?? []).filter(
    (e) =>
      !filter.trim() ||
      e.key.toLowerCase().includes(filter.toLowerCase()) ||
      e.default.toLowerCase().includes(filter.toLowerCase()) ||
      (e.override ?? "").toLowerCase().includes(filter.toLowerCase()),
  );
  const overridden = (entries ?? []).filter((e) => e.override !== null).length;

  return (
    <section className="adm-panel adm-copy">
      <div className="adm-copy-layout">
        <aside className="adm-copy-rail">
          <h3 className="adm-copy-rail-title">Whose page</h3>

          <button
            className={`adm-copy-scope${scope === null ? " is-active" : ""}`}
            onClick={() => pick(null)}
          >
            <span className="adm-copy-scope-name">Board default</span>
            <span className="adm-copy-scope-sub">every parent on this board</span>
          </button>

          <div className="adm-copy-rail-label">Students</div>
          {students === null && <p className="adm-muted adm-copy-rail-empty">Loading…</p>}
          {students?.length === 0 && (
            <p className="adm-muted adm-copy-rail-empty">No students on this board yet.</p>
          )}
          {students?.map((s) => (
            <button
              key={s.studentId}
              className={`adm-copy-scope${scope === s.studentId ? " is-active" : ""}`}
              onClick={() => pick(s.studentId)}
            >
              <span className="adm-copy-scope-name">
                {s.name ?? s.email}
                {s.overrides > 0 && <span className="adm-copy-count">{s.overrides}</span>}
              </span>
              <span className="adm-copy-scope-sub">
                Class {s.class}
                {!s.hasParent && " · no parent linked"}
              </span>
            </button>
          ))}
        </aside>

        <div className="adm-copy-main">
          <div className="adm-copy-head">
            <div>
              <h2 className="adm-copy-title">
                {selected ? `Copy for ${selected.name ?? selected.email}` : "Parent dashboard copy"}
              </h2>
              <p className="adm-copy-sub">
                {selected ? (
                  <>
                    Only this child's page. Anything left alone reads the board's
                    wording; clear a box and save to go back to it.{" "}
                    {!selected.hasParent && (
                      <em>No parent is linked to this student yet, so nobody reads it. </em>
                    )}
                    <strong>
                      {overridden} of {entries?.length ?? 0} set for this student
                    </strong>
                    .
                  </>
                ) : (
                  <>
                    Every line a parent reads on this board. Edit and save to
                    override; clear the box and save to go back to the default.{" "}
                    <strong>
                      {overridden} of {entries?.length ?? 0} overridden
                    </strong>
                    .
                  </>
                )}
              </p>
            </div>
            <input
              className="adm-input adm-copy-filter"
              placeholder="Filter…"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
          </div>

          {error && <p className="adm-error">{error}</p>}
          {entries === null && !error && <p className="adm-muted">Loading copy…</p>}

          <div className="adm-copy-list">
            {rows.map((e) => {
              const draft = drafts[e.key] ?? "";
              const current = e.override ?? e.inherited;
              const dirty = draft.trim() !== current.trim();
              return (
                <div key={e.key} className={`adm-copy-row${e.override ? " is-overridden" : ""}`}>
                  <div className="adm-copy-key">
                    <code>{e.key}</code>
                    {e.override && (
                      <span className="adm-copy-badge">
                        {scope ? "set for this student" : "overridden"}
                      </span>
                    )}
                    {/* Editing a student, a board override is context they need:
                        it is what this box reverts TO, and it is already not the
                        code default. */}
                    {scope && !e.override && e.boardOverride && (
                      <span className="adm-copy-badge adm-copy-badge--board">from board</span>
                    )}
                  </div>

                  <textarea
                    className="adm-copy-input"
                    rows={2}
                    value={draft}
                    disabled={busy === e.key}
                    onChange={(ev) => setDrafts((d) => ({ ...d, [e.key]: ev.target.value }))}
                  />

                  <div className="adm-copy-meta">
                    {e.tokens.length > 0 ? (
                      <span className="adm-copy-tokens">
                        available:{" "}
                        {e.tokens.map((t) => (
                          <code key={t}>{`{${t}}`}</code>
                        ))}
                      </span>
                    ) : (
                      <span className="adm-copy-tokens adm-copy-tokens--none">no placeholders</span>
                    )}
                    <span className="adm-copy-default">
                      {scope ? "reverts to" : "default"}: {e.inherited}
                    </span>
                  </div>

                  <div className="adm-copy-actions">
                    <button
                      className="adm-btn adm-copy-save"
                      disabled={!dirty || busy === e.key}
                      onClick={() => save(e, drafts[e.key] ?? "")}
                    >
                      {busy === e.key ? "Saving…" : saved === e.key && !dirty ? "Saved" : "Save"}
                    </button>
                    {e.override && (
                      <button
                        className="adm-btn adm-copy-revert"
                        disabled={busy === e.key}
                        onClick={() => save(e, null)}
                      >
                        Revert
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
            {entries !== null && rows.length === 0 && (
              <p className="adm-muted">Nothing matches that filter.</p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
