import "./profile.css";

// The student Profile surface. Reached from the rail avatar, which used to sign
// you out on a single click — a destructive, unconfirmed action sitting on the
// control every other app uses for "show me my account". Sign-out now lives
// here, named and deliberate.
//
// Read-only by design: it renders what `me` already returns (identity + board +
// role). No new backend surface, and no settings controls that don't yet do
// anything. `.prof-`-scoped CSS (the standing global-leak hygiene, S23).

type Props = {
  name: string;
  email: string;
  role: string;
  boardSlug: string;
  onSignOut: () => void;
};

export function ProfilePage({ name, email, role, boardSlug, onSignOut }: Props) {
  const initials = name.trim().slice(0, 1).toUpperCase() || "?";

  return (
    <div className="prof-page">
      <header className="prof-head">
        <div className="prof-avatar">{initials}</div>
        <div className="prof-id">
          <h1 className="prof-name">{name}</h1>
          <p className="prof-email">{email}</p>
        </div>
      </header>

      <section className="prof-card">
        <h2 className="prof-card-title">Account</h2>
        <dl className="prof-rows">
          <div className="prof-row">
            <dt>Board</dt>
            <dd>{boardSlug}</dd>
          </div>
          <div className="prof-row">
            <dt>Role</dt>
            <dd>{role}</dd>
          </div>
        </dl>
      </section>

      <section className="prof-card">
        <h2 className="prof-card-title">Session</h2>
        <p className="prof-note">
          Signing out ends this session on this device. Your progress is saved.
        </p>
        <button className="prof-signout" onClick={onSignOut}>
          Sign out
        </button>
      </section>
    </div>
  );
}
