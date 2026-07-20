import { useEffect, useState } from "react";
import { trpc } from "../trpc";

// Slice D — the admin PEOPLE surface. Replaces the operational capability the
// whitelist provided: with the gate open (Slice C) everyone who signs in is a
// student, and this panel is the only way anyone becomes a tutor, parent or
// admin. Lives in its own file so AdminPage doesn't double in size; all classes
// stay `.adm-`-prefixed (the global revision-shell.css landmine).
//
// Two rules the UI must make legible, because both are refusals the admin will
// otherwise read as bugs:
//   - a person must have SIGNED IN ONCE before a role can be granted (no
//     pre-invite — the founder's call). Never-signed-in members are shown, and
//     their Save is disabled with the reason stated inline rather than failing
//     on submit.
//   - an admin cannot change their OWN role (lockout). Same treatment.

type Person = Awaited<ReturnType<typeof trpc.admin.listPeople.query>>[number];
type Link = Awaited<ReturnType<typeof trpc.admin.listLinks.query>>[number];
type Found = Awaited<ReturnType<typeof trpc.admin.findByEmail.query>>;

const ROLES = ["student", "tutor", "parent", "admin"] as const;
type Role = (typeof ROLES)[number];

export function AdminPeoplePanel({ adminEmail }: { adminEmail: string }) {
  const [people, setPeople] = useState<Person[] | null>(null);
  const [links, setLinks] = useState<Link[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  // find-by-email
  const [lookup, setLookup] = useState("");
  const [found, setFound] = useState<Found | "none" | null>(null);
  const [foundRole, setFoundRole] = useState<Role>("tutor");

  // link builder
  const [linkKind, setLinkKind] = useState<"tutor" | "parent">("tutor");
  const [adultEmail, setAdultEmail] = useState("");
  const [studentEmail, setStudentEmail] = useState("");

  function load() {
    trpc.admin.listPeople
      .query()
      .then(setPeople)
      .catch((e) => setError(String(e?.message ?? e)));
    trpc.admin.listLinks
      .query()
      .then(setLinks)
      .catch((e) => setError(String(e?.message ?? e)));
  }
  useEffect(load, []);

  // Every mutation funnels through here so the error/ok/busy handling and the
  // reload cannot drift between the four call sites.
  async function run(key: string, fn: () => Promise<string>) {
    setError(null);
    setOk(null);
    setBusy(key);
    try {
      setOk(await fn());
      load();
    } catch (e: any) {
      setError(humanError(String(e?.message ?? e)));
    } finally {
      setBusy(null);
    }
  }

  async function onSetRole(email: string, role: Role) {
    await run(`role:${email}`, async () => {
      await trpc.admin.setRole.mutate({ email, role });
      return `${email} is now a ${role}.`;
    });
  }

  async function onLookup() {
    setError(null);
    setOk(null);
    setFound(null);
    setBusy("lookup");
    try {
      const r = await trpc.admin.findByEmail.query({ email: lookup.trim() });
      setFound(r ?? "none");
    } catch (e: any) {
      setError(humanError(String(e?.message ?? e)));
    } finally {
      setBusy(null);
    }
  }

  async function onLink() {
    await run("link", async () => {
      await trpc.admin.linkStudent.mutate({
        kind: linkKind,
        adultEmail: adultEmail.trim(),
        studentEmail: studentEmail.trim(),
      });
      setAdultEmail("");
      setStudentEmail("");
      return `Linked ${adultEmail.trim()} to ${studentEmail.trim()}.`;
    });
  }

  async function onUnlink(l: Link) {
    await run(`unlink:${l.adultUserId}:${l.studentUserId}`, async () => {
      await trpc.admin.unlinkStudent.mutate({
        kind: l.kind,
        adultUserId: l.adultUserId,
        studentUserId: l.studentUserId,
      });
      return `Unlinked ${l.adultEmail} from ${l.studentEmail}.`;
    });
  }

  return (
    <>
      {error && <p className="adm-error">{error}</p>}
      {ok && <p className="adm-ok">{ok}</p>}

      <div className="adm-grid">
        <section className="adm-panel">
          <label className="adm-label">People on this board</label>
          {people === null ? (
            <p className="adm-muted">Loading…</p>
          ) : people.length === 0 ? (
            <p className="adm-muted">Nobody has signed in yet.</p>
          ) : (
            <table className="adm-table">
              <thead>
                <tr>
                  <th>Person</th>
                  <th>Role</th>
                </tr>
              </thead>
              <tbody>
                {people.map((p) => (
                  <PersonRow
                    key={p.userId}
                    person={p}
                    isSelf={p.email.toLowerCase() === adminEmail.toLowerCase()}
                    busy={busy === `role:${p.email}`}
                    onSetRole={onSetRole}
                  />
                ))}
              </tbody>
            </table>
          )}

          <label className="adm-label" style={{ marginTop: 14 }}>
            Find someone by email
          </label>
          <p className="adm-hint">
            Someone who signed up on another board won't appear above. Look them up by
            their exact address to grant a role here.
          </p>
          <div className="adm-row">
            <input
              className="adm-input"
              placeholder="person@example.com"
              value={lookup}
              onChange={(e) => setLookup(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && lookup.trim()) onLookup();
              }}
            />
            <button className="adm-btn" disabled={!lookup.trim() || busy !== null} onClick={onLookup}>
              {busy === "lookup" ? "Looking…" : "Find"}
            </button>
          </div>
          {found === "none" && (
            <p className="adm-muted">
              No account for that address. They need to sign in once before a role can be
              granted.
            </p>
          )}
          {found && found !== "none" && (
            <div className="adm-found">
              <div>
                <b>{found.name ?? found.email}</b>
                <span className="adm-found-email">{found.email}</span>
              </div>
              <div className="adm-found-state">
                {found.role
                  ? `Currently a ${found.role} on this board.`
                  : "Not on this board yet."}
              </div>
              {!found.hasSignedIn ? (
                <p className="adm-muted">Has never signed in — a role can't be granted yet.</p>
              ) : (
                <div className="adm-row">
                  <select
                    className="adm-select"
                    value={foundRole}
                    onChange={(e) => setFoundRole(e.target.value as Role)}
                  >
                    {ROLES.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                  <button
                    className="adm-btn"
                    disabled={busy !== null}
                    onClick={() => onSetRole(found.email, foundRole)}
                  >
                    Grant
                  </button>
                </div>
              )}
            </div>
          )}
        </section>

        <section className="adm-panel">
          <label className="adm-label">Link a tutor or parent to a student</label>
          <p className="adm-hint">
            Both people need a role on this board first. A tutor link lets them see that
            student's work; a parent link lets them see the reports.
          </p>
          <div className="adm-row">
            <select
              className="adm-select"
              value={linkKind}
              onChange={(e) => setLinkKind(e.target.value as "tutor" | "parent")}
            >
              <option value="tutor">Tutor</option>
              <option value="parent">Parent</option>
            </select>
            <input
              className="adm-input"
              placeholder={linkKind === "tutor" ? "tutor@example.com" : "parent@example.com"}
              value={adultEmail}
              onChange={(e) => setAdultEmail(e.target.value)}
            />
          </div>
          <input
            className="adm-input"
            placeholder="student@example.com"
            value={studentEmail}
            onChange={(e) => setStudentEmail(e.target.value)}
          />
          <button
            className="adm-btn"
            disabled={!adultEmail.trim() || !studentEmail.trim() || busy !== null}
            onClick={onLink}
          >
            {busy === "link" ? "Linking…" : "Link"}
          </button>

          <label className="adm-label" style={{ marginTop: 14 }}>
            Existing links
          </label>
          {links === null ? (
            <p className="adm-muted">Loading…</p>
          ) : links.length === 0 ? (
            <p className="adm-muted">No links yet.</p>
          ) : (
            <ul className="adm-links">
              {links.map((l) => (
                <li key={`${l.kind}:${l.adultUserId}:${l.studentUserId}`}>
                  <span className={`adm-kind adm-kind-${l.kind}`}>{l.kind}</span>
                  <span className="adm-link-people">
                    {l.adultName ?? l.adultEmail} → {l.studentName ?? l.studentEmail}
                  </span>
                  <button
                    className="adm-unlink"
                    disabled={busy !== null}
                    onClick={() => onUnlink(l)}
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}

function PersonRow({
  person,
  isSelf,
  busy,
  onSetRole,
}: {
  person: Person;
  isSelf: boolean;
  busy: boolean;
  onSetRole: (email: string, role: Role) => void;
}) {
  const [role, setRole] = useState<Role>(person.role as Role);
  // The list reloads after every mutation; re-sync so the select reflects the
  // server rather than a stale local pick.
  useEffect(() => setRole(person.role as Role), [person.role]);

  // Both blocks are refusals the SERVER also enforces. Stating them here means
  // the admin reads a reason instead of an error.
  const blocked = isSelf
    ? "You can't change your own role."
    : !person.hasSignedIn
      ? "Hasn't signed in yet."
      : null;

  return (
    <tr>
      <td>
        <div className="adm-person-name">
          {person.name ?? person.email}
          {isSelf && <span className="adm-you">you</span>}
        </div>
        <div className="adm-person-email">{person.email}</div>
        {blocked && <div className="adm-blocked">{blocked}</div>}
      </td>
      <td>
        <div className="adm-row">
          <select
            className="adm-select"
            value={role}
            disabled={Boolean(blocked)}
            onChange={(e) => setRole(e.target.value as Role)}
          >
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
          <button
            className="adm-btn"
            disabled={Boolean(blocked) || role === person.role || busy}
            onClick={() => onSetRole(person.email, role)}
          >
            {busy ? "Saving…" : "Save"}
          </button>
        </div>
      </td>
    </tr>
  );
}

/** tRPC surfaces the server's error CODE; turn the two expected ones into English. */
function humanError(raw: string): string {
  if (raw.includes("USER_NOT_FOUND")) {
    return "That person has never signed in. Ask them to sign in once, then grant the role.";
  }
  if (raw.includes("CANNOT_CHANGE_OWN_ROLE")) {
    return "You can't change your own role.";
  }
  return raw;
}
