import { useEffect, useState } from "react";
import { trpc } from "../trpc";
import "./access-pending.css";

// The waiting room — founder's ask this session.
//
// Who lands here: anyone who claimed `parent` or `tutor` on the way in and has
// not been switched on by an admin (`membership.enabled`, migration 0035). The
// claim is real and recorded; the capability is not granted yet.
//
// Why it is a SIGNBOARD and not an error page: the person did nothing wrong and
// nothing is broken. For a TUTOR there is exactly one thing to do — call us — so
// the page is that number, at a size you can read across a room, and little else.
//
// S165 — the PARENT case is no longer a dead phone number. A parent can now
// self-serve: they tell us the email/phone on their child's account and it lands
// as a pending request for an admin to match + link (parentLink.request, the
// board-less sessionProcedure). So the parent branch grows an inline form +
// their request statuses, with the phone kept as a fallback. The tutor branch is
// unchanged — there is still no self-serve tutor onboarding.
//
// All classes are `.shire-`-scoped (the revision-shell.css global-leak
// discipline, same as .par-/.tut-/.crew-).

/** The number on the board. One definition — it is the entire point of the page. */
const PHONE = "+91 79046 23449";

/** How a role reads in "Continue as …". Lower case: it sits mid-sentence. */
const ROLE_WORD: Record<string, string> = {
  student: "student",
  tutor: "tutor",
  parent: "parent",
  admin: "admin",
};

export function AccessPending({
  name,
  role,
  onSignOut,
  heldRoles = [],
  onUseProfile,
}: {
  name: string;
  /** Shown back to them so the page explains WHY they are here, not just that they are. */
  role: string;
  onSignOut: () => void;
  /**
   * S124 — the profiles this identity ACTUALLY holds, so a stale claim is not a
   * dead end. Empty for the genuine waiting-room case (a real tutor awaiting
   * approval holds nothing else), which is why it defaults to `[]` and the
   * escape simply does not render — the page is unchanged for the people it was
   * originally built for.
   */
  heldRoles?: string[];
  onUseProfile?: (role: string) => void;
}) {
  // Never offer the role they are already waiting on: "Continue as tutor" on the
  // tutor waiting-room page would be a button that returns you to the page you
  // are on. Only genuinely different, genuinely held profiles are a way out.
  const alternatives = heldRoles.filter((r) => r !== role);
  const canSwitch = Boolean(onUseProfile) && alternatives.length > 0;

  return (
    <div className="shire-root graph-paper">
      <header className="shire-top">
        <span className="shire-who">{name}</span>
        <button className="shire-signout" onClick={onSignOut}>
          Sign out
        </button>
      </header>

      <main className="shire-stage">
        {/* S122 (founder) — THE BOARD IS NOW A FINGERPOST, after their own
            Middle-earth signpost sketch: one buried post with hand-lettered
            planks nailed across it at angles, each pointing somewhere.
            It replaces a single flat slab, and the shape is the message —
            a fingerpost is what you meet at the edge of a place you cannot
            enter yet, and it tells you which way to go.

            Built in CSS, not as an image, for the reason the old comment gave
            and which still holds: this page must not depend on an asset that
            may never arrive. The planks are real text on real elements, so the
            number stays selectable, dialable and screen-reader-legible — which
            a picture of a signpost would not be.

            `role="note"`: an aside about the account, not the page's subject. */}
        <section className="shire-board" role="note" aria-labelledby="shire-head">
          {/* The mast is scoped to THIS wrapper, not the whole board. First cut
              had it span everything, so the post ran straight down through the
              body copy — wood grain behind prose, unreadable. The post belongs
              to the signs; the note stands clear of it on the paper. */}
          <div className="shire-signs">
            {/* The post the planks are nailed to. Decorative — hidden from the
                a11y tree so a screen reader gets the message, not the scenery. */}
            <span className="shire-mast" aria-hidden="true" />

            {/* Each plank leans a different way, as in the sketch — no two signs
                on a real fingerpost sit parallel. Angles are per-plank rather
                than nth-child so the tilt survives reordering the copy. */}
            <p className="shire-plank shire-plank--eyebrow">
              {role === "tutor" ? "Tutor account" : "Parent account"}
            </p>

            <h1 className="shire-plank shire-plank--head" id="shire-head">
              Not quite open yet
            </h1>

            {/* The number is the page, so it gets the biggest plank and the
                arrow end — it is the one direction actually being pointed in.
                A tel: link so a phone dials it, large enough to read without one. */}
            <a
              className="shire-plank shire-plank--number"
              href={`tel:${PHONE.replace(/\s/g, "")}`}
            >
              {PHONE}
            </a>
          </div>

          {/* Prose stays OFF the planks and on the paper. Two sentences set at
              an angle on wood is a poster, not a sign — the sketch's planks
              carry two or three words each, and that is why they read. */}
          <div className="shire-note">
            {/* Role-specific, because one sentence cannot serve both without
                going vague. A parent is linked to a child; a tutor is given
                students. Saying "children" to a tutor reads as a mistake. */}
            <p className="shire-body">
              {role === "tutor"
                ? "We set tutor accounts up by hand, so you're matched with the right students before you start."
                : "You're one step from your child's progress. Tell us the email or phone on their account and we'll connect you."}
            </p>

            {/* S165 — parent self-serve linking. Tutors keep the call-us flow. */}
            {role === "parent" && <ParentLinkRequest />}

            <p className="shire-foot">
              {role === "tutor"
                ? "Give us a ring on the number above and we'll switch this on for you."
                : "Prefer to sort it out by phone? Give us a ring on the number above."}
            </p>

            {/* 🔑 S124 — THE WAY BACK. Only rendered when this identity holds a
                profile that WOULD work, which is the stale-claim case: the
                browser remembers a "tutor" click from some earlier visit and
                has been showing this page to a perfectly good student ever
                since. For a real applicant `alternatives` is empty and none of
                this appears — the signboard stays the quiet single-purpose page
                it was designed as.

                Phrased as an offer, not an error, because from their side
                nothing went wrong: they have two accounts and we picked the one
                that isn't ready. */}
            {canSwitch && (
              <p className="shire-switch">
                <span className="shire-switch-lead">Came here by mistake?</span>{" "}
                {alternatives.map((r) => (
                  <button
                    key={r}
                    className="shire-switch-btn"
                    onClick={() => onUseProfile!(r)}
                  >
                    Continue as {ROLE_WORD[r] ?? r}
                  </button>
                ))}
              </p>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}

type LinkRequest = Awaited<ReturnType<typeof trpc.parentLink.myRequests.query>>[number];
type RedeemOutcome = Awaited<
  ReturnType<typeof trpc.parentLink.request.mutate>
>["referral"];

/**
 * S166 — what to say about the referral code they typed.
 *
 * Each refusal gets its OWN sentence rather than a shared "invalid code": the
 * four states are genuinely different problems for the person reading them, and
 * only one of them ("we don't recognise that") is worth retyping the code over.
 * `none` returns null — saying nothing about a field they left blank is correct.
 */
function referralNote(r: RedeemOutcome): { ok: boolean; text: string } | null {
  switch (r.state) {
    case "applied":
      return {
        ok: true,
        text: `Code applied — ${r.percentOff}% off your first ${r.months} months is on your account.`,
      };
    case "unknown_code":
      return { ok: false, text: "We don't recognise that code — check it and try again." };
    case "self":
      return { ok: false, text: "That's your own code — share it with someone else instead." };
    case "already_referred":
      return { ok: false, text: "A referral code is already on your account." };
    case "none":
      return null;
  }
}

/**
 * S165 — the parent's self-serve link-request form, shown in the waiting room.
 *
 * The parent is board-LESS here (no linked child yet), so this rides
 * `parentLink.*` — the board-less `sessionProcedure` namespace. Submitting files
 * a `pending` row against the raw email/phone; an admin matches it to a student
 * on their board and links, at which point a reload boots the parent into their
 * real dashboard (whoami now derives the board from the linked child).
 *
 * The submit is idempotent server-side (re-sending the same identifier while
 * pending returns the existing row), so a double-tap can't stack duplicates.
 */
function ParentLinkRequest() {
  const [requests, setRequests] = useState<LinkRequest[] | null>(null);
  const [identifier, setIdentifier] = useState("");
  // S166 — the optional referral code, captured in the SAME form (founder:
  // "alongside student email/phone"). This is the one moment a brand-new parent
  // is in front of us, so it is the only place a code can be entered.
  const [code, setCode] = useState("");
  const [codeNote, setCodeNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function load() {
    trpc.parentLink.myRequests
      .query()
      .then(setRequests)
      .catch((e) => setError(String(e?.message ?? e)));
  }
  useEffect(load, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const id = identifier.trim();
    if (!id || busy) return;
    setBusy(true);
    setError(null);
    setCodeNote(null);
    try {
      const res = await trpc.parentLink.request.mutate({
        identifier: id,
        referralCode: code.trim() || undefined,
      });
      setIdentifier("");
      // The code NEVER fails the request (services/referral.ts) — the server
      // reports what happened to it separately, so say so rather than leaving a
      // parent to wonder whether their 25% landed.
      setCodeNote(referralNote(res.referral));
      if (res.referral.state === "applied") setCode("");
      load();
    } catch (err: any) {
      setError(String(err?.message ?? err));
    } finally {
      setBusy(false);
    }
  }

  // Once an admin links a request, a reload re-boots into the real parent
  // surface — so a `linked` request short-circuits the whole form into a
  // "you're connected, refresh" card rather than inviting another request.
  const linked = requests?.find((r) => r.status === "linked");
  if (linked) {
    return (
      <div className="shire-link shire-link--done" role="status">
        <p className="shire-link-done-head">You're connected.</p>
        <p className="shire-link-done-sub">
          We've matched you to your child's account.
        </p>
        <button className="shire-link-btn" onClick={() => window.location.reload()}>
          Open the dashboard
        </button>
      </div>
    );
  }

  const pending = (requests ?? []).filter((r) => r.status === "pending");
  const rejected = (requests ?? []).filter((r) => r.status === "rejected");

  return (
    <div className="shire-link">
      <form className="shire-link-form" onSubmit={onSubmit}>
        <input
          className="shire-link-input"
          type="text"
          inputMode="email"
          autoComplete="off"
          placeholder="Child's email or phone"
          value={identifier}
          onChange={(e) => setIdentifier(e.target.value)}
          disabled={busy}
          aria-label="Your child's email or phone number"
        />
        {/* S166 — optional, and it LOOKS optional: a quieter field below the one
            that matters, with the offer stated so the label is a reason rather
            than a demand. `autoCapitalize`/`spellCheck` off because codes are
            upper-case 7-char tokens a phone keyboard would otherwise mangle
            (the server normalizes anyway — this just avoids the surprise). */}
        <input
          className="shire-link-input shire-link-input--code"
          type="text"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          placeholder="Referral code (optional)"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          disabled={busy}
          aria-label="Referral code, if someone gave you one"
        />
        <button
          className="shire-link-btn"
          type="submit"
          disabled={!identifier.trim() || busy}
        >
          {busy ? "Sending…" : "Connect"}
        </button>
      </form>

      <p className="shire-link-hint">
        Got a code from another parent? Enter it for 25% off your first 3 months.
      </p>

      {codeNote && (
        <p
          className={`shire-link-code-note${codeNote.ok ? " is-ok" : ""}`}
          role="status"
        >
          {codeNote.text}
        </p>
      )}

      {error && <p className="shire-link-error">{error}</p>}

      {pending.length > 0 && (
        <ul className="shire-link-list">
          {pending.map((r) => (
            <li key={r.id} className="shire-link-item">
              <span className="shire-link-dot shire-link-dot--wait" aria-hidden="true" />
              <span className="shire-link-id">{r.enteredIdentifier}</span>
              <span className="shire-link-state">waiting for us to match this</span>
            </li>
          ))}
        </ul>
      )}

      {rejected.length > 0 && (
        <ul className="shire-link-list">
          {rejected.map((r) => (
            <li key={r.id} className="shire-link-item shire-link-item--off">
              <span className="shire-link-dot shire-link-dot--off" aria-hidden="true" />
              <span className="shire-link-id">{r.enteredIdentifier}</span>
              <span className="shire-link-state">
                we couldn't match this — check it and try again
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
