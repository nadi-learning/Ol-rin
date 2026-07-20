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

export function AccessPending({
  name,
  role,
  onSignOut,
}: {
  name: string;
  /** Shown back to them so the page explains WHY they are here, not just that they are. */
  role: string;
  onSignOut: () => void;
}) {
  return (
    <div className="shire-root graph-paper">
      <header className="shire-top">
        <span className="shire-who">{name}</span>
        <button className="shire-signout" onClick={onSignOut}>
          Sign out
        </button>
      </header>

      <main className="shire-stage">
        {/* The board itself. `role="note"` rather than a heading-only block:
            this is an aside about the account, not the page's subject. */}
        <section className="shire-board" role="note" aria-labelledby="shire-head">
          {/* The two posts the board hangs from. Purely decorative — hidden
              from the a11y tree so a screen reader gets the message, not the
              scenery. */}
          <span className="shire-post shire-post--l" aria-hidden="true" />
          <span className="shire-post shire-post--r" aria-hidden="true" />

          <div className="shire-plank">
            <p className="shire-eyebrow">
              {role === "tutor" ? "Tutor account" : "Parent account"}
            </p>
            <h1 className="shire-head" id="shire-head">
              Not quite open yet
            </h1>
            <p className="shire-body">
              We set {role === "tutor" ? "tutor" : "parent"} accounts up by hand, so
              that the right children end up on the right side of it.
            </p>

            {/* The number is the page. A tel: link so a phone dials it, and
                large enough to read without one. */}
            <p className="shire-call">Please reach out to</p>
            <a className="shire-number" href={`tel:${PHONE.replace(/\s/g, "")}`}>
              {PHONE}
            </a>
            <p className="shire-foot">and we'll switch this on for you.</p>
          </div>
        </section>
      </main>
    </div>
  );
}
