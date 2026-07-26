/**
 * AdminBudgetPanel (S169) — set what each chapter is WORTH in sub-topics.
 *
 * The denominator behind every "N of M" a parent reads, and behind the length of
 * the growth bar. Until now M was derived from how many sub-topics happen to be
 * CARVED, which on prod is 4 chapters out of 24 — so the bar quietly described
 * our publishing progress rather than the child's syllabus.
 *
 * This is an OVERRIDE editor, and the UI has to keep that legible:
 *  · a chapter with no number set shows its carved count in grey and is marked
 *    "derived" — it is not a zero, and it is not a mistake;
 *  · clearing the box restores that, exactly like the Copy tab's revert;
 *  · a budget BELOW the carved count is refused by the server (the chapter would
 *    render as more than fully covered), so the carved figure is shown next to
 *    the input rather than left for the editor to discover through an error.
 */
import { useEffect, useMemo, useState } from "react";
import { trpc } from "../trpc";

type Row = Awaited<ReturnType<typeof trpc.admin.listChapterBudgets.query>>[number];

export function AdminBudgetPanel({ board }: { board: string }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [filter, setFilter] = useState("");

  function load() {
    setError(null);
    trpc.admin.listChapterBudgets
      .query()
      .then((r) => {
        setRows(r);
        // Seed with the EFFECTIVE number — what the dashboard uses today —
        // so an editor adjusts a real figure instead of typing into a void.
        setDrafts(Object.fromEntries(r.map((x) => [x.chapterId, String(x.effective)])));
      })
      .catch((e) => setError(String(e?.message ?? e)));
  }
  useEffect(load, [board]);

  async function save(row: Row, raw: string | null) {
    setBusy(row.chapterId);
    setError(null);
    setSaved(null);
    try {
      const trimmed = (raw ?? "").trim();
      const budget = trimmed === "" ? null : Number(trimmed);
      if (budget !== null && (!Number.isInteger(budget) || budget < 0)) {
        throw new Error("budget must be a whole number, or empty to derive it");
      }
      await trpc.admin.setChapterBudget.mutate({ chapterId: row.chapterId, budget });
      setSaved(row.chapterId);
      load();
    } catch (e: any) {
      setError(String(e?.message ?? e));
    } finally {
      setBusy(null);
    }
  }

  const shown = useMemo(
    () =>
      (rows ?? []).filter(
        (r) =>
          !filter.trim() ||
          r.chapterName.toLowerCase().includes(filter.toLowerCase()) ||
          r.subjectName.toLowerCase().includes(filter.toLowerCase()),
      ),
    [rows, filter],
  );
  const set = (rows ?? []).filter((r) => r.budget !== null).length;
  const total = (rows ?? []).reduce((n, r) => n + r.effective, 0);

  if (rows === null && !error) return <p className="adm-muted">Loading budgets…</p>;

  return (
    <section className="adm-panel adm-copy">
      <div className="adm-copy-head">
        <div>
          <h2 className="adm-copy-title">Chapter budgets</h2>
          <p className="adm-copy-sub">
            How many sub-topics each chapter is worth in full — the denominator a
            parent reads and the length of the growth bar. Leave a box empty to
            derive it from the sub-topics carved so far.{" "}
            <strong>
              {set} of {rows?.length ?? 0} set
            </strong>{" "}
            · board total <strong>{total}</strong>.
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

      <div className="adm-budget-list">
        {shown.map((r) => {
          const draft = drafts[r.chapterId] ?? "";
          const dirty = draft.trim() !== String(r.effective);
          return (
            <div
              key={r.chapterId}
              className={`adm-budget-row${r.budget !== null ? " is-overridden" : ""}`}
            >
              <div className="adm-budget-name">
                <span className="adm-budget-subject">{r.subjectName}</span>
                <span className="adm-budget-chapter">{r.chapterName}</span>
              </div>

              <div className="adm-budget-carved">
                {r.carved} carved
                {r.budget === null && <span className="adm-budget-tag">derived</span>}
              </div>

              <input
                className="adm-input adm-budget-input"
                type="number"
                min={0}
                inputMode="numeric"
                value={draft}
                disabled={busy === r.chapterId}
                onChange={(e) =>
                  setDrafts((d) => ({ ...d, [r.chapterId]: e.target.value }))
                }
              />

              <div className="adm-budget-actions">
                <button
                  className="adm-btn adm-copy-save"
                  disabled={!dirty || busy === r.chapterId}
                  onClick={() => save(r, drafts[r.chapterId] ?? "")}
                >
                  {busy === r.chapterId
                    ? "Saving…"
                    : saved === r.chapterId && !dirty
                      ? "Saved"
                      : "Save"}
                </button>
                {r.budget !== null && (
                  <button
                    className="adm-btn adm-copy-revert"
                    disabled={busy === r.chapterId}
                    onClick={() => save(r, null)}
                  >
                    Derive
                  </button>
                )}
              </div>
            </div>
          );
        })}
        {shown.length === 0 && <p className="adm-muted">Nothing matches that filter.</p>}
      </div>
    </section>
  );
}
