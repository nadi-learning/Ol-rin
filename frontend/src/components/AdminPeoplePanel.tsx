import { useEffect, useMemo, useState } from "react";
import { trpc } from "../trpc";

// ID-2 — the admin PEOPLE + ASSIGNMENTS surface on the profile model. Two jobs:
//   - People: every profile (global, one row per app_user), grant a role.
//   - Link: attach a tutor/parent to a student. Both fields are PICKERS by id —
//     never a typed email — so the same-email ambiguity that produced the
//     "spranav is admin not tutor" bug is structurally impossible. The student
//     picker only offers UNLINKED students; a re-link is a CHANGE from the
//     assignments list (which fires the tutor handover snapshot server-side).
//
// All classes stay `.adm-`-prefixed (the global revision-shell.css landmine).
// Two refusals the UI makes legible, because both read as bugs otherwise:
//   - a person must have SIGNED IN ONCE before a role can be granted (no
//     pre-invite). Never-signed-in profiles show, Save disabled + reason inline.
//   - an admin cannot change their OWN role (lockout). Same treatment.

type Person = Awaited<ReturnType<typeof trpc.admin.listPeople.query>>[number];
type Link = Awaited<ReturnType<typeof trpc.admin.listLinks.query>>[number];
type Candidates = Awaited<ReturnType<typeof trpc.admin.listLinkCandidates.query>>;

/** One tutor (or parent) with the students linked to them, for the grouped view. */
type AssignGroup = {
  kind: "tutor" | "parent";
  adultUserId: string;
  adultEmail: string;
  adultName: string | null;
  students: Link[];
};

const ROLES = ["student", "tutor", "parent", "admin"] as const;
type Role = (typeof ROLES)[number];

export function AdminPeoplePanel({ adminEmail }: { adminEmail: string }) {
  const [people, setPeople] = useState<Person[] | null>(null);
  const [links, setLinks] = useState<Link[] | null>(null);
  const [candidates, setCandidates] = useState<Candidates | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  // link builder — everything is a PICKER (a profile id), not a typed email.
  const [linkKind, setLinkKind] = useState<"tutor" | "parent">("tutor");
  const [adultUserId, setAdultUserId] = useState("");
  const [studentUserId, setStudentUserId] = useState("");

  function load() {
    trpc.admin.listPeople
      .query()
      .then(setPeople)
      .catch((e) => setError(String(e?.message ?? e)));
    trpc.admin.listLinks
      .query()
      .then(setLinks)
      .catch((e) => setError(String(e?.message ?? e)));
    trpc.admin.listLinkCandidates
      .query()
      .then(setCandidates)
      .catch((e) => setError(String(e?.message ?? e)));
  }
  useEffect(load, []);

  // Every mutation funnels through here so the error/ok/busy handling and the
  // reload cannot drift between the call sites.
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

  async function onLink() {
    await run("link", async () => {
      await trpc.admin.linkStudent.mutate({ kind: linkKind, adultUserId, studentUserId });
      setAdultUserId("");
      setStudentUserId("");
      return `Linked.`;
    });
  }

  async function onUnlink(l: Link) {
    await run(`unlink:${l.kind}:${l.studentUserId}`, async () => {
      await trpc.admin.unlinkStudent.mutate({ kind: l.kind, studentUserId: l.studentUserId });
      return `Unlinked ${l.adultEmail} from ${l.studentEmail}.`;
    });
  }

  // The two adult/student picker sets for the current link kind.
  const adults = useMemo<Candidates["tutors"]>(() => {
    if (!candidates) return [];
    return linkKind === "tutor" ? candidates.tutors : candidates.parents;
  }, [candidates, linkKind]);
  const students = useMemo<Candidates["unlinkedForTutor"]>(() => {
    if (!candidates) return [];
    return linkKind === "tutor" ? candidates.unlinkedForTutor : candidates.unlinkedForParent;
  }, [candidates, linkKind]);

  // Group the flat link list BY the adult so the admin reads "who has how many
  // students". Tutors/parents with ZERO students are seeded from the CANDIDATES
  // (the board's active tutors + parents), not from the global people list, so a
  // teacher's count shows even at 0 without dragging in other boards' profiles.
  const groups = useMemo<AssignGroup[]>(() => {
    const map = new Map<string, AssignGroup>();
    const keyOf = (kind: string, id: string) => `${kind}:${id}`;

    if (candidates) {
      for (const t of candidates.tutors) {
        map.set(keyOf("tutor", t.userId), {
          kind: "tutor",
          adultUserId: t.userId,
          adultEmail: t.email,
          adultName: t.name,
          students: [],
        });
      }
      for (const p of candidates.parents) {
        map.set(keyOf("parent", p.userId), {
          kind: "parent",
          adultUserId: p.userId,
          adultEmail: p.email,
          adultName: p.name,
          students: [],
        });
      }
    }

    for (const l of links ?? []) {
      const k = keyOf(l.kind, l.adultUserId);
      let g = map.get(k);
      if (!g) {
        g = {
          kind: l.kind,
          adultUserId: l.adultUserId,
          adultEmail: l.adultEmail,
          adultName: l.adultName,
          students: [],
        };
        map.set(k, g);
      }
      g.students.push(l);
    }

    const arr = [...map.values()];
    arr.sort((a, b) =>
      a.kind === b.kind ? a.adultEmail.localeCompare(b.adultEmail) : a.kind === "tutor" ? -1 : 1,
    );
    for (const g of arr) g.students.sort((a, b) => a.studentEmail.localeCompare(b.studentEmail));
    return arr;
  }, [candidates, links]);

  return (
    <>
      {error && <p className="adm-error">{error}</p>}
      {ok && <p className="adm-ok">{ok}</p>}

      <div className="adm-grid">
        <section className="adm-panel">
          <label className="adm-label">People</label>
          <p className="adm-hint">
            Every profile across the app. Grant someone a role — they must have signed in
            once or completed onboarding first.
          </p>
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
                    // One person's email holds up to four profiles, each its own
                    // id + user_type; key on userId or React collapses distinct
                    // profiles and a control silently vanishes.
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
        </section>

        <section className="adm-panel">
          <label className="adm-label">Link a tutor or parent to a student</label>
          <p className="adm-hint">
            Pick from the people on this board. A tutor link lets them see that student's
            work; a parent link lets them see the reports. Only unlinked students are shown —
            to move a student, remove their current link below first.
          </p>
          <div className="adm-row">
            <select
              className="adm-select"
              value={linkKind}
              onChange={(e) => {
                setLinkKind(e.target.value as "tutor" | "parent");
                setAdultUserId("");
                setStudentUserId("");
              }}
            >
              <option value="tutor">Tutor</option>
              <option value="parent">Parent</option>
            </select>
            <select
              className="adm-select"
              value={adultUserId}
              onChange={(e) => setAdultUserId(e.target.value)}
            >
              <option value="">
                {adults.length === 0
                  ? `— no ${linkKind}s on this board —`
                  : `— pick a ${linkKind} —`}
              </option>
              {adults.map((a) => (
                <option key={a.userId} value={a.userId}>
                  {a.name ?? a.email} ({a.email})
                </option>
              ))}
            </select>
          </div>
          <select
            className="adm-select"
            value={studentUserId}
            onChange={(e) => setStudentUserId(e.target.value)}
          >
            <option value="">
              {students.length === 0 ? "— no unlinked students —" : "— pick a student —"}
            </option>
            {students.map((s) => (
              <option key={s.userId} value={s.userId}>
                {s.name ?? s.email} · class {s.class} ({s.email})
              </option>
            ))}
          </select>
          <button
            className="adm-btn"
            disabled={!adultUserId || !studentUserId || busy !== null}
            onClick={onLink}
          >
            {busy === "link" ? "Linking…" : "Link"}
          </button>

          <label className="adm-label" style={{ marginTop: 14 }}>
            Assignments by tutor / parent
          </label>
          {links === null || candidates === null ? (
            <p className="adm-muted">Loading…</p>
          ) : groups.length === 0 ? (
            <p className="adm-muted">No tutors or parents yet.</p>
          ) : (
            <div className="adm-groups">
              {groups.map((g) => (
                <div className="adm-group" key={`${g.kind}:${g.adultUserId}`}>
                  <div className="adm-group-head">
                    <span className={`adm-kind adm-kind-${g.kind}`}>{g.kind}</span>
                    <span className="adm-group-name">{g.adultName ?? g.adultEmail}</span>
                    <span className="adm-group-count">{countLabel(g)}</span>
                  </div>
                  {g.adultName && <div className="adm-group-email">{g.adultEmail}</div>}
                  {g.students.length === 0 ? (
                    <p className="adm-muted adm-group-empty">
                      No {g.kind === "tutor" ? "students" : "children"} assigned yet.
                    </p>
                  ) : (
                    <ul className="adm-links">
                      {g.students.map((l) => (
                        <li key={l.studentUserId}>
                          <span className="adm-link-people">
                            {l.studentName ?? l.studentEmail}
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
                </div>
              ))}
            </div>
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
  // Onboarded users are actionable even without a Better Auth row yet (their auth
  // row is minted on next sign-in). Only a profile that is NEITHER signed in NOR
  // onboarded is a true never-seen shell the server would refuse (USER_NOT_FOUND).
  const blocked = isSelf
    ? "You can't change your own role."
    : !person.hasSignedIn && !person.onboarded
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

/** "4 students" / "1 child" — the per-teacher count the admin manages. */
function countLabel(g: AssignGroup): string {
  const n = g.students.length;
  const noun = g.kind === "tutor" ? "student" : "child";
  const plural = g.kind === "tutor" ? "students" : "children";
  return `${n} ${n === 1 ? noun : plural}`;
}

/** tRPC surfaces the server's error CODE; turn the expected ones into English. */
function humanError(raw: string): string {
  if (raw.includes("USER_NOT_FOUND")) {
    return "That person has never signed in. Ask them to sign in once, then grant the role.";
  }
  if (raw.includes("CANNOT_CHANGE_OWN_ROLE")) {
    return "You can't change your own role.";
  }
  return raw;
}
