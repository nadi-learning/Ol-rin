import { useEffect, useState } from "react";
import { trpc } from "../trpc";

// S166 — the REFERRAL LEDGER, the ops half of Slice REFERRAL-1.
//
// A referral is captured automatically when a new parent types someone's code in
// the waiting-room form; both halves of the offer are written `pending` right
// then. Nothing after that can happen automatically, because the trigger the
// offer names — "once the referred books month 1" — is a BILLING event and this
// codebase has no billing. So this panel is where a human asserts it:
//
//   Qualify → the referred parent did book month 1; both rewards become claimable
//   Redeem  → this half's discount was actually given (gated on Qualify)
//   Void    → withdraw the referral; still-pending rewards go with it
//
// 🔑 Deliberately NOT board-scoped, unlike every sibling admin panel. A referral
// has no board — it is captured before the parent has one, and its two ends may
// sit on different boards. A board-filtered ledger would be silently partial with
// no way for the admin to know. Hence no `board` prop and no re-fetch on switch.
// (The service header explains why that is safe: adminProcedure takes two locks.)
//
// All classes `.adm-`-prefixed (the global revision-shell.css landmine), with
// `.adm-ref-` additions for this panel.

type Referral = Awaited<ReturnType<typeof trpc.admin.listReferrals.query>>[number];
type Reward = Referral["rewards"][number];

/** Ops-facing wording for a reward row: which side, what they get. */
function rewardLabel(w: Reward): string {
  const who = w.side === "referrer" ? "Referrer" : "Referred";
  return `${who} · ${w.percentOff}% off ${w.months} ${w.months === 1 ? "month" : "months"}`;
}

function humanError(msg: string): string {
  if (msg.includes("REWARD_NOT_QUALIFIED")) {
    return "Qualify the referral first — the reward is only earned once the referred parent books month 1.";
  }
  if (msg.includes("REFERRAL_NOT_FOUND") || msg.includes("REWARD_NOT_FOUND")) {
    return "That row is gone — refreshing the list.";
  }
  return msg;
}

export function AdminReferralsPanel() {
  const [rows, setRows] = useState<Referral[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  function load() {
    trpc.admin.listReferrals
      .query()
      .then(setRows)
      .catch((e) => setError(String(e?.message ?? e)));
  }
  useEffect(load, []);

  async function act(key: string, fn: () => Promise<unknown>, done: string) {
    if (busy) return;
    setBusy(key);
    setError(null);
    setOk(null);
    try {
      await fn();
      setOk(done);
      load();
    } catch (e: any) {
      setError(humanError(String(e?.message ?? e)));
      load(); // a NOT_FOUND means our list is stale — re-read rather than sit on it
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      {error && <p className="adm-error">{error}</p>}
      {ok && <p className="adm-ok">{ok}</p>}

      <section className="adm-panel">
        <label className="adm-label">Referrals</label>
        <p className="adm-hint">
          Every code redeemed, <b>across all boards</b> — a referral has no board,
          so this list is not filtered by the picker above. Qualify one once the
          referred parent books their first month; that is what makes both rewards
          claimable. Mark a reward redeemed when the discount is actually given.
        </p>

        {rows === null ? (
          <p className="adm-muted">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="adm-muted">
            No referrals yet. They appear the moment a new parent signs up with
            someone's code.
          </p>
        ) : (
          <div className="adm-ref-list">
            {rows.map((r) => (
          <article key={r.id} className="adm-ref-row">
            <header className="adm-ref-top">
              <div className="adm-ref-pair">
                <span className="adm-ref-name">{r.referrer.name ?? r.referrer.email}</span>
                <span className="adm-ref-kind">{r.referrer.userType}</span>
                <span className="adm-ref-arrow" aria-label="referred">
                  →
                </span>
                <span className="adm-ref-name">{r.referred.name ?? r.referred.email}</span>
              </div>
              <span className={`adm-ref-status adm-ref-status--${r.status}`}>
                {r.status}
              </span>
            </header>

            <div className="adm-ref-meta">
              <code className="adm-ref-code">{r.codeUsed}</code>
              <span>{r.referrer.email}</span>
              <span aria-hidden>·</span>
              <span>{r.referred.email}</span>
              <span aria-hidden>·</span>
              <span>{new Date(r.createdAt).toLocaleDateString()}</span>
            </div>

            <ul className="adm-ref-rewards">
              {r.rewards.map((w) => (
                <li key={w.id} className="adm-ref-reward">
                  <span className="adm-ref-reward-l">{rewardLabel(w)}</span>
                  <span className={`adm-ref-chip adm-ref-chip--${w.status}`}>
                    {w.status}
                  </span>
                  {w.status === "pending" && (
                    <>
                      <button
                        className="adm-btn adm-btn-sm"
                        disabled={busy !== null}
                        onClick={() =>
                          act(
                            `rw-${w.id}`,
                            () =>
                              trpc.admin.setRewardStatus.mutate({
                                rewardId: w.id,
                                status: "redeemed",
                              }),
                            "Reward marked redeemed.",
                          )
                        }
                      >
                        {busy === `rw-${w.id}` ? "…" : "Mark redeemed"}
                      </button>
                      <button
                        className="adm-btn adm-btn-sm adm-btn-ghost"
                        disabled={busy !== null}
                        onClick={() =>
                          act(
                            `rv-${w.id}`,
                            () =>
                              trpc.admin.setRewardStatus.mutate({
                                rewardId: w.id,
                                status: "void",
                              }),
                            "Reward voided.",
                          )
                        }
                      >
                        Void
                      </button>
                    </>
                  )}
                  {w.status === "redeemed" && w.redeemedAt && (
                    <span className="adm-muted adm-ref-when">
                      {new Date(w.redeemedAt).toLocaleDateString()}
                    </span>
                  )}
                </li>
              ))}
            </ul>

            {/* Referral-level actions only while it is still open. A qualified or
                voided referral is terminal — its rewards remain individually
                actionable above, which is the only thing still in flight. */}
            {r.status === "pending" && (
              <footer className="adm-ref-actions">
                <button
                  className="adm-btn"
                  disabled={busy !== null}
                  onClick={() =>
                    act(
                      `q-${r.id}`,
                      () =>
                        trpc.admin.setReferralStatus.mutate({
                          referralId: r.id,
                          status: "qualified",
                        }),
                      "Referral qualified — both rewards are now claimable.",
                    )
                  }
                >
                  {busy === `q-${r.id}` ? "Qualifying…" : "Qualify (month 1 booked)"}
                </button>
                <button
                  className="adm-btn adm-btn-ghost"
                  disabled={busy !== null}
                  onClick={() =>
                    act(
                      `v-${r.id}`,
                      () =>
                        trpc.admin.setReferralStatus.mutate({
                          referralId: r.id,
                          status: "void",
                        }),
                      "Referral voided.",
                    )
                  }
                >
                  Void
                </button>
              </footer>
            )}
          </article>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
