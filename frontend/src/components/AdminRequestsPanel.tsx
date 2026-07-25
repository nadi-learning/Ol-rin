import { useEffect, useState } from "react";
import { trpc } from "../trpc";

// S165 — the ADMIN half of the parent self-serve link leg (backend S164).
//
// A parent who signed up board-less filed a request against their child's raw
// email/phone (parentLink.request → `pending`). This panel is where the admin
// closes it: for each pending request the server has already resolved the
// students on THIS board matching that identifier (candidate resolution is
// RLS-scoped in listPendingParentLinkRequests, so cross-board matches never
// appear here). The admin picks the right student and Links, or Rejects.
//
// Board-scoped: candidates depend on the admin's current board, so the `board`
// prop is a dependency — switching the board re-fetches (a request whose child
// is on another board shows zero candidates until the admin switches to it).
//
// All classes stay `.adm-`-prefixed (the global revision-shell.css landmine),
// with a few `.adm-req-` additions for this panel.

type PendingRequest = Awaited<
  ReturnType<typeof trpc.admin.listParentLinkRequests.query>
>[number];

export function AdminRequestsPanel({
  board,
  onResolved,
}: {
  /** The admin's current board — candidate resolution is scoped to it. */
  board: string;
  /** Fired after any resolve so the parent can refresh the tab's pending badge. */
  onResolved?: () => void;
}) {
  const [requests, setRequests] = useState<PendingRequest[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  // Per-request chosen student (defaults to the first candidate on load).
  const [picked, setPicked] = useState<Record<string, string>>({});

  function load() {
    trpc.admin.listParentLinkRequests
      .query()
      .then((rs) => {
        setRequests(rs);
        // Seed each picker to its first LINKABLE candidate so a one-candidate
        // request is one click. Skip candidates already linked (to this parent
        // or another) — linking those is a no-op or a move, not the default.
        setPicked((prev) => {
          const next = { ...prev };
          for (const r of rs) {
            if (next[r.id]) continue;
            const first = r.candidates.find(
              (c) => !c.alreadyLinkedToThisParent && !c.alreadyLinkedToAnother,
            );
            if (first) next[r.id] = first.studentUserId;
          }
          return next;
        });
      })
      .catch((e) => setError(String(e?.message ?? e)));
  }
  // Re-fetch on board change — candidates are board-scoped.
  useEffect(load, [board]);

  async function run(key: string, fn: () => Promise<string>) {
    setError(null);
    setOk(null);
    setBusy(key);
    try {
      setOk(await fn());
      load();
      onResolved?.();
    } catch (e: any) {
      setError(humanError(String(e?.message ?? e)));
    } finally {
      setBusy(null);
    }
  }

  async function onLink(r: PendingRequest) {
    const studentUserId = picked[r.id];
    if (!studentUserId) return;
    const student = r.candidates.find((c) => c.studentUserId === studentUserId);
    await run(`link:${r.id}`, async () => {
      await trpc.admin.resolveParentLinkRequest.mutate({
        requestId: r.id,
        action: "link",
        studentUserId,
      });
      const who = student?.name ?? student?.email ?? "the student";
      return `Linked ${r.parent.name ?? r.parent.email} to ${who}.`;
    });
  }

  async function onReject(r: PendingRequest) {
    await run(`reject:${r.id}`, async () => {
      await trpc.admin.resolveParentLinkRequest.mutate({
        requestId: r.id,
        action: "reject",
      });
      return `Dismissed the request from ${r.parent.name ?? r.parent.email}.`;
    });
  }

  return (
    <>
      {error && <p className="adm-error">{error}</p>}
      {ok && <p className="adm-ok">{ok}</p>}

      <section className="adm-panel">
        <label className="adm-label">Parent link requests</label>
        <p className="adm-hint">
          Parents who signed up and gave us their child's email or phone. Match each
          one to the right student on this board and Link, or Dismiss it. Only
          students on <b>this board</b> show as matches — switch boards above if the
          child is on another one.
        </p>

        {requests === null ? (
          <p className="adm-muted">Loading…</p>
        ) : requests.length === 0 ? (
          <p className="adm-muted">No pending requests.</p>
        ) : (
          <div className="adm-req-list">
            {requests.map((r) => {
              const linkable = r.candidates.filter(
                (c) => !c.alreadyLinkedToThisParent && !c.alreadyLinkedToAnother,
              );
              const chosen = picked[r.id] ?? "";
              return (
                <div className="adm-req" key={r.id}>
                  <div className="adm-req-head">
                    <span className="adm-kind adm-kind-parent">parent</span>
                    <span className="adm-req-name">
                      {r.parent.name ?? r.parent.email}
                    </span>
                    {r.parent.name && (
                      <span className="adm-req-email">{r.parent.email}</span>
                    )}
                  </div>

                  <div className="adm-req-identifier">
                    Gave us: <b>{r.enteredIdentifier}</b>
                  </div>

                  {r.candidates.length === 0 ? (
                    <p className="adm-muted adm-req-empty">
                      No student on this board matches that email or phone. The child
                      may be on another board, or hasn't signed up yet — Dismiss, or
                      switch boards to check.
                    </p>
                  ) : (
                    <>
                      <div className="adm-req-candidates">
                        {r.candidates.map((c) => {
                          const flag = c.alreadyLinkedToThisParent
                            ? "already linked to this parent"
                            : c.alreadyLinkedToAnother
                              ? "linked to another parent"
                              : null;
                          const disabled = Boolean(flag);
                          return (
                            <label
                              key={c.studentUserId}
                              className={`adm-req-cand${disabled ? " adm-req-cand-off" : ""}`}
                            >
                              <input
                                type="radio"
                                name={`cand:${r.id}`}
                                value={c.studentUserId}
                                checked={chosen === c.studentUserId}
                                disabled={disabled}
                                onChange={() =>
                                  setPicked((p) => ({ ...p, [r.id]: c.studentUserId }))
                                }
                              />
                              <span className="adm-req-cand-body">
                                <span className="adm-req-cand-name">
                                  {c.name ?? c.email}
                                  <span className="adm-req-cand-class">
                                    class {c.class}
                                  </span>
                                </span>
                                <span className="adm-req-cand-email">{c.email}</span>
                                {flag && (
                                  <span className="adm-req-cand-flag">{flag}</span>
                                )}
                              </span>
                            </label>
                          );
                        })}
                      </div>
                      {linkable.length === 0 && (
                        <p className="adm-req-note">
                          Every match is already linked — nothing to do but Dismiss.
                        </p>
                      )}
                    </>
                  )}

                  <div className="adm-req-actions">
                    <button
                      className="adm-btn"
                      disabled={!chosen || busy !== null}
                      onClick={() => onLink(r)}
                    >
                      {busy === `link:${r.id}` ? "Linking…" : "Link"}
                    </button>
                    <button
                      className="adm-unlink"
                      disabled={busy !== null}
                      onClick={() => onReject(r)}
                    >
                      {busy === `reject:${r.id}` ? "Dismissing…" : "Dismiss"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </>
  );
}

/** tRPC surfaces the server's error message/code; soften the expected ones. */
function humanError(raw: string): string {
  if (raw.includes("REQUEST_NOT_PENDING")) {
    return "That request was already handled (maybe in another tab). Reloading…";
  }
  if (raw.includes("MISSING_STUDENT")) {
    return "Pick a student to link before pressing Link.";
  }
  if (raw.includes("student is not on this board") || raw.includes("InvalidLink")) {
    return "That student isn't on this board. Switch to their board, then link.";
  }
  return raw;
}
