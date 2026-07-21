import { useEffect, useState, type ReactNode } from "react";
import { useSession, signOut } from "./lib/auth";
import { trpc, clearBoard, setBoard, getPersona, setPersona } from "./trpc";
import { isAdminEmail, isSelfAssignableRole } from "@b2c/kernel/contracts";
import { AppShell, type AppView } from "./components/AppShell";
import { LandingPage } from "./components/LandingPage";
import { AdminGate } from "./components/AdminGate";
import { DashboardPage } from "./components/DashboardPage";
import { JournalPage } from "./components/JournalPage";
import { CrewPage } from "./components/CrewPage";
import { RevisionPage } from "./components/RevisionPage";
import { PracticePage } from "./components/PracticePage";
import { InsightsPage } from "./components/InsightsPage";
import { PacePlanPage } from "./components/PacePlanPage";
import { ProfilePage } from "./components/ProfilePage";
import { TutorPage } from "./components/TutorPage";
import { ParentPage } from "./components/ParentPage";
import { AccessPending } from "./components/AccessPending";
import { AdminPage } from "./components/AdminPage";
import { OnboardingPage } from "./components/OnboardingPage";
import "./theme/tokens.css";
import "./components/app-shell.css";
import "./components/gate.css";

// S4 — a student logs in (b2c auth) → the TAITOR app shell → the Revision
// surface renders a live Starkhorn-shaped slide. Closes the walking skeleton.
// There is no invite gate: Slice C (S110) opened signup and Slice F (S113)
// dropped the whitelist table outright. Anyone who signs in is a student and
// picks their board (session.chooseBoard, S112).
type Me = Awaited<ReturnType<typeof trpc.me.query>>;
type Onb = Awaited<ReturnType<typeof trpc.onboarding.getState.query>>;

/**
 * ID-1 — WHERE BOOT SENDS THIS IDENTITY. One resolved destination replaces the
 * pile of booleans the pre-ID-1 boot juggled (`needsBoard`/`missingProfile`/
 * `deniedAdmin`/`me.enabled`), because the model underneath changed shape:
 *
 *   - `whoami` now carries the operational flag ITSELF (per profile), so the
 *     waiting-room decision is made from whoami, not from a later `me.enabled`
 *     (which, under the new `requireMembership`, is ALWAYS true — a non-
 *     operational profile throws rather than returning false).
 *   - a person is a set of `app_user` PROFILES (one per user_type); the browser's
 *     landing persona (`x-profile`) names which one this session means.
 *   - `me` is board-scoped and only the STUDENT shell needs it; tutor/parent/
 *     admin surfaces need nothing but name+email, both on the auth session.
 */
type Dest =
  | { kind: "onboard" } //         student shell, no board yet → onboarding (pre-board)
  | { kind: "student"; board: string } // operational student → `me` + welcome + shell
  | { kind: "waiting"; role: string; held: string[] } // tutor/parent shell, not set up
  | { kind: "tutor" } //           operational tutor → their read surface
  | { kind: "parent" } //          operational parent → their read surface
  | { kind: "admin" } //           /admin, holds an admin profile + on the whitelist
  | { kind: "deniedAdmin" } //     /admin, does not → the same NotFound a stranger gets
  | { kind: "error"; message: string };

/**
 * S124 — the admin portal's one and only URL.
 *
 * Read at module scope, not in the component: nothing in this app pushes
 * history (there is no router — `/u/:token` in main.tsx is the only other path
 * branch), and the one navigation to it is a `location.replace`, which reloads.
 * So the pathname genuinely cannot change under a mounted App, and re-reading it
 * every render would imply otherwise.
 *
 * Trailing slash tolerated because browsers and humans both add one; the match
 * is otherwise exact, so `/administrator` and `/admin/secrets` are NOT the admin
 * route. A prefix match here would be the M79 mistake wearing a URL.
 */
const ADMIN_PATH = "/admin";
const isAdminRoute = window.location.pathname.replace(/\/+$/, "") === ADMIN_PATH;

export function App() {
  const { data: session, isPending } = useSession();
  // ID-1 — ONE resolved destination for the whole signed-in boot. undefined =
  // boot still in flight (the loading gate); every other state is a place to be.
  const [dest, setDest] = useState<Dest | undefined>(undefined);
  // The board-scoped student payload. Fetched ONLY on the student path (the one
  // surface that needs a board); tutor/parent/admin never touch it. null until
  // that fetch lands.
  const [me, setMe] = useState<Me | null>(null);
  const [view, setView] = useState<AppView>("dashboard");
  // ONB-1 — the first-login welcome. A SEPARATE query, deliberately not folded
  // into `me` (D-AVAIL-1's reasoning: additive + fault-isolated).
  //   undefined = still loading · null = not needed / read failed (FAIL OPEN)
  // Fetched in parallel with `me`, so it costs a student no extra wait.
  const [onb, setOnb] = useState<Onb | null | undefined>(undefined);
  // Bumped to re-run boot without a page reload — e.g. a waiting-room visitor
  // switches to a profile they DO hold, or a fresh student finishes onboarding.
  // The session object is unchanged, so it cannot be the trigger.
  const [bootNonce, setBootNonce] = useState(0);
  // Deep-link target for "Continue lesson" — the sub_topic the dashboard wants
  // Revision to open at. Cleared (null) means Revision opens at its default.
  const [revisionTarget, setRevisionTarget] = useState<string | null>(null);

  const openLesson = (subTopicId: string) => {
    setRevisionTarget(subTopicId);
    setView("revision");
  };

  // The landing persona — SAMPLED, and as of S123 that is finally safe.
  //
  // 🔑 THE LATCH IS GONE, AND ITS REASON WITH IT. Two sessions running, this was
  // a `useRef` latch, and it caused a production bug in BOTH directions:
  //   - first-non-null (M78) let a stale abandoned "tutor" claim outrank the
  //     card actually clicked, and locked the founder out of their own app.
  //   - latest-non-null (M79) fixed that, and was still a latch — it existed
  //     only because `ClaimMint` cleared the persona mid-flight, so a plain
  //     read could flip to null underneath its own request.
  //
  // S123 deleted ClaimMint (a click no longer mints anything), and nothing else
  // has ever called `clearPersona`. The persona is now written once on the
  // landing page and simply persists as the active profile.
  //
  // 🔴 The rule that keeps it honest: it never routes on its own. Boot resolves
  // it against `whoami` (the real profiles) before deciding anything. A latch
  // tried to make a localStorage string trustworthy by freezing it; checking it
  // against the database is the thing that actually works.
  const claimedRole = getPersona();

  useEffect(() => {
    if (!session) {
      setMe(null);
      setOnb(undefined);
      setDest(undefined);
      return;
    }
    let cancelled = false;

    async function boot() {
      // 🔑 ID-1 — THE ADMIN DOOR IS A PURE READ, RESOLVED FIRST AND WITHOUT A
      // SHELL-MINT. `/admin` forces `x-profile: admin` (trpc.ts), but `whoami`
      // ignores the profile header — it reports EVERY profile this identity
      // holds — so it is the right call here. `session.enter` would be WRONG:
      // admin is not self-assignable, so `enter` would fall back and mint a
      // STUDENT shell for anyone who merely typed `/admin`. The URL is a
      // selector, never an enrolment.
      if (isAdminRoute) {
        const who = await trpc.session.whoami.query();
        if (cancelled) return;
        // Both locks, exactly as the render used to: a real admin PROFILE row
        // AND the email whitelist. The whitelist here is only door-vs-404 (the
        // enforcing check is `adminProcedure`, server-side, on every admin.*
        // call); an off-list holder and a plain stranger get the identical
        // NotFound so the surface never confirms there is something to enter.
        const holdsAdmin = who.memberships.some((m) => m.role === "admin");
        setMe(null);
        setDest(
          holdsAdmin && isAdminEmail(session!.user.email)
            ? { kind: "admin" }
            : { kind: "deniedAdmin" },
        );
        return;
      }

      // 🔑 ID-1 — LOGIN MINTS THE PROFILE SHELL, THEN ROUTES OFF WHOAMI. `enter`
      // upserts the board-less `app_user` shell for the claimed persona and
      // returns the fresh whoami in one round-trip. A shell is NOT an enrolment
      // (no board, no role-detail row), so it cannot resurrect the "a read
      // enrolled the student on cbse" bug — that bug wrote a board-scoped row;
      // this writes none.
      const who = await trpc.session.enter.mutate();
      if (cancelled) return;

      // The ACTIVE profile = the persona this browser claimed, defaulted EXACTLY
      // as `enter` defaults it (a non-self-assignable or absent persona → the
      // student shell it just minted). So the entry we look up below is
      // guaranteed to exist.
      const active: string = isSelfAssignableRole(claimedRole) ? claimedRole : "student";
      const entries = who.memberships.filter((m) => m.role === active);

      // The profiles this identity can actually switch INTO — the OPERATIONAL
      // ones — offered as escapes from a waiting room (S124's dead-end fix). A
      // set: a multi-board tutor has several entries under one role.
      const held = [
        ...new Set(who.memberships.filter((m) => m.enabled).map((m) => m.role)),
      ].sort();

      if (active === "student") {
        // Operational student = an enabled entry WITH a board (whoami RESOLVED it
        // by iterating boards under RLS, so the slug is real, not localStorage).
        const student = entries.find((m) => m.enabled && m.slug);
        if (!student) {
          // Shell only, no `student` row anywhere → onboarding runs pre-board and
          // does the picking. No board header to send, so clear any stale one.
          clearBoard();
          setMe(null);
          setDest({ kind: "onboard" });
          return;
        }
        // whoami already proved the student belongs on this board, so `me` under
        // it cannot NO_MEMBERSHIP — the pre-ID-1 stale-board self-heal is gone
        // with the localStorage board it healed.
        setBoard(student.slug!);
        const r = await trpc.me.query();
        if (cancelled) return;
        setMe(r);
        setDest({ kind: "student", board: student.slug! });
        // FAIL-OPEN welcome read, in parallel (G3): a welcome that can't be read
        // must never keep a student out of the product.
        trpc.onboarding.getState
          .query()
          .then((s) => !cancelled && setOnb(s))
          .catch(() => !cancelled && setOnb(null));
        return;
      }

      // active is tutor or parent. Operational = the role-detail row exists
      // (whoami's `enabled`); a tutor's is board-scoped, a parent's is not, so we
      // ask `enabled` rather than `slug` (a parent's slug is always null).
      const enabled = entries.some((m) => m.enabled);
      setMe(null);
      setDest(
        enabled
          ? { kind: active as "tutor" | "parent" }
          : // Shell exists (enter minted it) but no detail row → the waiting room,
            // rendered straight from whoami. A board-less profile can't call `me`,
            // and there is nobody to wait on but the admin who grants the row.
            { kind: "waiting", role: active, held },
      );
    }

    boot().catch(
      (e) => !cancelled && setDest({ kind: "error", message: String(e?.message ?? e) }),
    );
    return () => {
      cancelled = true;
    };
    // `claimedRole` joins the deps: boot routes off it, so a re-pick that changes
    // the persona must re-run boot against the new claim. Leaving it out would
    // route the OLD claim — the stale read that caused M78/M79 in this file.
  }, [session, bootNonce, claimedRole]);

  if (isPending) return <Gate>Checking…</Gate>;

  // S125 — the admin front door, signed-out. Only at `/admin`, and reachable no
  // other way (nothing links to it). A student at `/` gets the persona picker;
  // only someone who typed `/admin` sees this. Above the general `!session`
  // branch so the admin URL never falls through to the public landing page.
  if (isAdminRoute && !session) {
    return <AdminGate />;
  }

  if (!session) {
    return <LandingPage />;
  }

  // Boot still resolving the one destination. Held rather than rendered-and-
  // replaced: the alternative is flashing a picker at someone who already has a
  // place to be.
  if (dest === undefined) {
    return <Gate>Loading…</Gate>;
  }

  // The name for every NON-student surface — read off the AUTH session, because
  // none of these fetch the spine `me` (they need only name+email, and a board-
  // less profile could not call `me` anyway).
  const sessionName = session.user.name ?? session.user.email.split("@")[0] ?? "there";

  // A genuine fault in boot (not a routing decision) — surfaced, not laundered.
  if (dest.kind === "error") {
    return (
      <Gate>
        <p className="gate-error">{dest.message}</p>
      </Gate>
    );
  }

  // ── `/admin` IS THE ONLY DOOR TO THE ADMIN PORTAL (founder, S124). ──
  //
  // Boot already made the two-lock decision (a real admin PROFILE row AND the
  // email whitelist), so the render just obeys it. A tutor, a parent, a student
  // and an off-list admin all resolved to `deniedAdmin` and get the identical
  // NotFound — the surface does not announce itself to anyone who cannot use it.
  //
  // 🔴 THE WHITELIST IS ENFORCED SERVER-SIDE, NOT HERE. boot's `isAdminEmail`
  // check only chooses door-vs-404; the enforcement that matters is
  // `adminProcedure` (trpc/init.ts), which re-runs it on every admin.* call. If
  // you ever find yourself relying on THIS branch for safety, the server-side
  // one has been removed and that is the bug.
  if (dest.kind === "deniedAdmin") {
    return <NotFound onSignOut={() => signOut()} />;
  }
  if (dest.kind === "admin") {
    // AdminPage needs only name+email, both on the auth session — no board-scoped
    // `me`. (An admin profile is board-agnostic; there is no board to fetch under.)
    return (
      <AdminPage
        adminName={sessionName}
        adminEmail={session.user.email}
        onSignOut={() => signOut()}
      />
    );
  }

  // 🔑 THE WAITING ROOM — a tutor/parent whose profile SHELL exists (login minted
  // it) but whose role-DETAIL row does not. Under ID-1 this is decided by whoami's
  // `enabled`, in boot, NOT by a later `me.enabled`: a board-less profile can't
  // call `me` at all, and `requireMembership` now THROWS for a non-operational
  // profile rather than returning `enabled:false`. So the claim-vs-grant line
  // S123 drew is now drawn here, from the server's answer.
  //
  // `held` offers the OPERATIONAL profiles this identity actually holds as a way
  // out of the dead end (S124): someone who clicked "Tutor" but is really a
  // student gets a "Continue as student" button instead of a sign-out round-trip.
  if (dest.kind === "waiting") {
    return (
      <AccessPending
        name={sessionName}
        role={dest.role}
        onSignOut={() => signOut()}
        heldRoles={dest.held}
        onUseProfile={(role) => {
          // Re-boot against the new claim rather than patch state: `setPersona`
          // rewrites the localStorage persona, which `claimedRole` reads at render
          // and the boot effect depends on, so bumping the nonce re-runs the whole
          // resolution. Back to the loading gate meanwhile (dest = undefined).
          setPersona(role);
          setDest(undefined);
          setBootNonce((n) => n + 1);
        }}
      />
    );
  }

  // Belongs to no board yet — onboarding runs PRE-BOARD (its about_you beat grows
  // the board row and, at ID-3, mints the student). The name comes from the auth
  // session; there is no spine identity to read yet, which is exactly this state.
  //
  // 🔑 A CLAIMED PARENT/TUTOR NEVER REACHES HERE. Boot routes them to the waiting
  // room above off their persona, so this branch is only ever a real student-to-be
  // — the guarantee the founder's Parent/Tutor-card bug needed (a claimed parent
  // must never be walked through a student's class/pronoun/hero/pet).
  if (dest.kind === "onboard") {
    return (
      <OnboardingPage
        studentName={sessionName}
        initialStep="greet"
        initialAnswers={{
          grade: null,
          pronoun: null,
          favCharacter: null,
          pet: null,
          phone: null,
        }}
        needsBoard
        // A full re-boot, not `setOnb(null)`: this student's `me` and onboarding
        // state have never been fetched, so there is nothing to merely clear.
        onDone={() => {
          setDest(undefined);
          setBootNonce((n) => n + 1);
        }}
      />
    );
  }

  // Slice T / P — tutor and parent read surfaces, routed entirely separately from
  // the student shell. Like admin, both need only name+email, so they render from
  // the auth session with no board-scoped `me`.
  if (dest.kind === "tutor") {
    return <TutorPage tutorName={sessionName} onSignOut={() => signOut()} />;
  }
  if (dest.kind === "parent") {
    return <ParentPage parentName={sessionName} onSignOut={() => signOut()} />;
  }

  // 🔴 NO ADMIN AUTO-ROUTE AT `/`, BY CONSTRUCTION. The pre-ID-1 boot could
  // resolve `me.role === "admin"` on the normal route and redirect to `/admin`;
  // now the active profile off `/admin` is the landing persona, which is only ever
  // student/tutor/parent (admin is not self-assignable), so `dest` is never
  // "admin" here. An admin at `/` is treated by their persona — the founder is a
  // student at `/` and an admin only at the door they typed. This IS the "one
  // door" rule; do not reinstate a role-only route that quietly re-opens the
  // portal at `/` and bypasses the whitelist.

  // dest.kind === "student" — the board-scoped shell. `me` was fetched in boot,
  // under the board whoami RESOLVED, so this gate is a formality that only shows
  // if a re-render races ahead of the paired setMe (they batch, so it does not).
  if (!me) return <Gate>Loading…</Gate>;

  const studentName = me.user.name ?? me.user.email.split("@")[0] ?? "there";

  // ── Slice G — THE COMPANION, LIFTED ONCE. ──
  // The student's pet was built in onboarding and then only ever appeared
  // there. It now stands in for the dev-placeholder Pikachu on every student
  // surface, so the character they chose is the one that keeps showing up.
  //
  // Lifted here and prop-drilled rather than put behind a context: this app has
  // no context anywhere (`grep createContext` returns nothing), `onb` is already
  // held at this level, and there are exactly two consumers. A provider would be
  // new machinery for a value that is one string.
  //
  // What travels is the RAW answer, not a resolved image — each surface needs a
  // different projection of it (the art, the alt text, the name inside a
  // sentence) and `onboarding.copy.ts` already owns all three. Passing the key
  // keeps the owl fallback in ONE place instead of once per consumer, so no
  // site can accidentally render a hole, and none can mix up alt with spoken.
  //
  // ALWAYS resolvable: every helper falls back to the owl stand-in, so a
  // skipped pet, a custom pet, a failed onboarding read (`onb === null`, which
  // fails OPEN by design) and a pre-onboarding student all get a companion.
  const pet = onb?.answers.pet ?? null;

  // Slice J — THE HERO, LIFTED THE SAME WAY. Journal is hero-led, so the second
  // half of the cast the onboarding built now travels too. Identical shape to
  // `pet` above and for identical reasons: the RAW answer, not a resolved image
  // (each surface needs a different projection, and `onboarding.copy.ts` owns
  // all of them), prop-drilled rather than put behind a context.
  //
  // NOT always resolvable, and that is the difference from `pet`: `heroImg()`
  // returns undefined for a skipped hero and for a pre-S96 row holding a retired
  // id, where `loaderPetImg()` always lands on the owl. The consumer owns the
  // fallback (JournalPage.frontOf) because the fallback is the PET — which only
  // a site holding both can pick.
  const hero = onb?.answers.favCharacter ?? null;

  // ONB-1 — students only, and only ahead of the shell. Tutors/parents/admins
  // returned above, so they never wait on this read at all (the server also
  // reports needsOnboarding:false for them — exempt, not forbidden).
  //
  // Held here rather than rendered-then-replaced: popping the welcome over an
  // already-painted dashboard would flash the product before the greeting.
  if (onb === undefined) return <Gate>Loading…</Gate>;

  if (onb?.needsOnboarding) {
    return (
      <OnboardingPage
        studentName={studentName}
        initialStep={onb.currentStep}
        initialAnswers={onb.answers}
        // Let them straight through — do NOT re-read to confirm. If complete()
        // failed, getState still says needsOnboarding ⇒ re-reading would bounce
        // them back into the loader, which retries complete(), forever. Every
        // answer is already committed (D-ONB-1), so the worst case of trusting
        // this is seeing the welcome once more on the next login — where it
        // resumes at `done` and retries the flip. Self-healing; never a trap.
        //
        // Slice G — KEEP THE ANSWERS, don't discard them. `setOnb(null)` was
        // harmless while only this component read them; now the companion is
        // lifted from `onb`, and nulling it would hand a student who just chose
        // a dragon the OWL stand-in for the rest of their session. The flow
        // hands its answers back precisely so this costs no re-read — which the
        // comment above forbids.
        onDone={(answers) =>
          // The shape the server WOULD return for this student now, built from
          // what the flow just committed — not a re-read (forbidden above) and
          // not a partial: a hand-made object that drifts from the contract is
          // how a later reader gets a field that is quietly wrong.
          setOnb({
            needsOnboarding: false,
            status: "completed",
            currentStep: "done",
            answers,
          })
        }
      />
    );
  }

  // REV-LAND: a manual nav to Revision opens the LANDING — clear any stale
  // dashboard deep-link so it can't skip it forever after. Named and shared
  // (Slice H) because the first-run tour's tiles navigate too: two copies of
  // this handler would mean the tile silently skipped the landing while the rail
  // honoured it, and the bug would only show on a student's very first visit.
  const navigate = (v: AppView) => {
    if (v === "revision") setRevisionTarget(null);
    setView(v);
  };

  return (
    <AppShell
      userName={studentName}
      view={view}
      onNavigate={navigate}
      wide={view === "revision"}
      // Slice M — for the Crew rail item's hover reveal only.
      hero={hero}
    >
      {view === "dashboard" ? (
        <DashboardPage
          studentName={studentName}
          onOpenLesson={openLesson}
          onOpenPace={() => setView("pace")}
          onNavigate={navigate}
        />
      ) : view === "revision" ? (
        <RevisionPage
          studentName={studentName}
          initialSubTopicId={revisionTarget}
          onOpenPace={() => setView("pace")}
          pet={pet}
        />
      ) : view === "journal" ? (
        <JournalPage studentName={studentName} hero={hero} pet={pet} />
      ) : view === "crew" ? (
        // Slice K — the second consumer of the lifted cast, and the first that
        // needs BOTH halves as peers rather than one covering for the other.
        // No `studentName`: Crew is about them, not about the student.
        <CrewPage hero={hero} pet={pet} />
      ) : view === "insights" ? (
        <InsightsPage onOpenLesson={openLesson} />
      ) : view === "pace" ? (
        <PacePlanPage />
      ) : view === "profile" ? (
        <ProfilePage
          name={studentName}
          email={me.user.email}
          role={me.role}
          boardSlug={me.board.slug}
          onSignOut={() => signOut()}
        />
      ) : (
        <PracticePage pet={pet} />
      )}
    </AppShell>
  );
}

function Gate({ children }: { children: ReactNode }) {
  return (
    <div className="gate graph-paper">
      <div className="gate-card">{children}</div>
    </div>
  );
}

/**
 * S124 — what everyone who is not an admin sees at `/admin`.
 *
 * Says nothing about what lives here or why they were refused: a page that
 * distinguishes "no such route" from "you may not enter" tells whoever is
 * probing that there IS something to enter. A student who mistypes and an
 * off-list visitor get the identical page.
 *
 * 🔴 IT CARRIES A SIGN-OUT, and that is not decoration. The only people who
 * reach it are signed in, and for an off-list admin this is a page with no
 * onward link at all — without a way out they would be stuck looking at it.
 * (The same dead-end reasoning as the signboard's `heldRoles` escape.)
 */
function NotFound({ onSignOut }: { onSignOut: () => void }) {
  return (
    <Gate>
      {/* `h2` and `.gate-sub` are what gate.css already styles — the card has
          no h1 rule, so inventing one here would render unstyled. */}
      <h2>Nothing here</h2>
      <p className="gate-sub">That page doesn’t exist.</p>
      <p>
        <a className="gate-link" href="/">
          Back to Olórin
        </a>
        {" · "}
        <button className="gate-link" onClick={onSignOut}>
          Sign out
        </button>
      </p>
    </Gate>
  );
}
