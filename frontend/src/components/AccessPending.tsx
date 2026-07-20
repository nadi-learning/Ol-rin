import "./access-pending.css";

// The waiting room — founder's ask this session.
//
// Who lands here: anyone who claimed `parent` or `tutor` on the way in and has
// not been switched on by an admin (`membership.enabled`, migration 0035). The
// claim is real and recorded; the capability is not granted yet.
//
// Why it is a SIGNBOARD and not an error page: the person did nothing wrong and
// nothing is broken. There is exactly one thing for them to do — call us — so
// the page is that number, at a size you can read across a room, and almost
// nothing else. A "request access" button would be a lie: there is no queue on
// the other end of it, only a phone.
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
                : "We set parent accounts up by hand, so you're linked to your own child and nobody else's."}
            </p>
            <p className="shire-foot">
              Give us a ring on the number above and we'll switch this on for you.
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
