import { useEffect, useState, type ReactNode } from "react";
import { useSession, signOut } from "./lib/auth";
import { trpc, clearBoard, setBoard, getPersona, setPersona } from "./trpc";
import { isAdminEmail } from "@b2c/kernel/contracts";
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
  const [me, setMe] = useState<Me | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<AppView>("dashboard");
  // ONB-1 — the first-login welcome. A SEPARATE query, deliberately not folded
  // into `me` (D-AVAIL-1's reasoning: additive + fault-isolated).
  //   undefined = still loading · null = not needed / read failed (FAIL OPEN)
  // Fetched in parallel with `me`, so it costs a student no extra wait.
  const [onb, setOnb] = useState<Onb | null | undefined>(undefined);
  // Slice E — this identity belongs to no board yet, so it must pick one before
  // anything board-scoped can load. undefined = whoami still in flight.
  const [needsBoard, setNeedsBoard] = useState<boolean | undefined>(undefined);
  // Bumped to re-run boot without a page reload — the pre-board student now HAS
  // a board, so `me` and the onboarding state have to be fetched for the first
  // time. The session object is unchanged, so it cannot be the trigger.
  const [bootNonce, setBootNonce] = useState(0);
  // S123 — the profile this browser asked for, which this identity does NOT
  // hold. Non-null means "show the signboard for this role": they clicked
  // Tutor, they are not a tutor, and the honest answer is the waiting room
  // rather than silently handing them whatever profile they DO have.
  const [missingProfile, setMissingProfile] = useState<string | null>(null);
  // S124 — the profiles this identity ACTUALLY holds, kept so the signboard can
  // offer a way out of a stale claim. See the `heldRoles` block at the
  // AccessPending call site for why a dead end was the bug worth fixing.
  const [heldRoles, setHeldRoles] = useState<string[]>([]);
  // S125 — signed in, standing at `/admin`, holding no admin membership row.
  // Set by boot so App renders the not-found door WITHOUT fetching `me` (which,
  // under the forced `x-profile: admin`, would 403 and trip the stale-board
  // retry). Only ever meaningful when `isAdminRoute` is true.
  const [deniedAdmin, setDeniedAdmin] = useState(false);
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
  // landing page and simply persists as the active profile. There is no
  // mid-flight null to dodge, so there is nothing left for a latch to protect —
  // and a latch with no live hazard is just stale state waiting to lie.
  //
  // 🔴 The rule that replaces it: this value is VALIDATED against real
  // memberships in `boot` before it routes anything. A latch tried to make a
  // localStorage string trustworthy by freezing it; checking it against the
  // database is the thing that actually works.
  const claimedRole = getPersona();
  const isPendingRoleClaim = claimedRole === "parent" || claimedRole === "tutor";

  useEffect(() => {
    if (!session) {
      setMe(null);
      setOnb(undefined);
      setNeedsBoard(undefined);
      setError(null);
      return;
    }
    let cancelled = false;

    // 🔑 SLICE E — BOOT NOW STARTS PRE-BOARD. `session.whoami` is the one read
    // that works with no board at all; it answers "does this identity belong
    // anywhere yet", which decides whether the next call can be board-scoped.
    //
    // Before Slice E the FE opened with `me` under a hard-coded `x-board:
    // cbse`, and `me` CREATED a membership from it — so the answer to "which
    // board is this student on" was manufactured by the question. Now nothing
    // is created until they pick.
    async function boot(retry: boolean) {
      const who = await trpc.session.whoami.query();
      if (cancelled) return;

      // 🔑 S125 — THE ADMIN DOOR IS RESOLVED HERE, ABOVE THE PERSONA MACHINERY.
      // At `/admin` the active profile is not the stored persona but a fixed
      // "admin" (trpc forces `x-profile: admin` while the URL is /admin), so the
      // persona validation below does not apply. whoami already carries the one
      // fact this needs: does the identity hold an admin row at all.
      //
      // 🔴 A NON-ADMIN MUST NOT FALL THROUGH TO THE `me` FETCH. Under the forced
      // admin profile `me` would 403 NO_MEMBERSHIP — indistinguishable from the
      // stale-board case the retry below heals, which would clear a good board
      // and end on an error page instead of a clean door. So a visitor with no
      // admin row is answered right here with `deniedAdmin` (the SAME not-found
      // page an off-list admin gets), and `me` is never called.
      if (isAdminRoute) {
        const adminMembership = who.memberships.find((m) => m.role === "admin");
        if (!adminMembership) {
          setNeedsBoard(false);
          setMe(null);
          setDeniedAdmin(true);
          setError(null);
          return;
        }
        // Holds admin → enter on that board and fetch `me` under the forced admin
        // profile. No retry wrapper: holding the row means the fetch cannot
        // NO_MEMBERSHIP, and any other failure is a real error worth surfacing.
        // An off-list admin still resolves role=admin here and is refused by the
        // whitelist at the render branch below — not by this boot.
        setBoard(adminMembership.slug);
        setNeedsBoard(false);
        setDeniedAdmin(false);
        const r = await trpc.me.query();
        if (cancelled) return;
        setMe(r);
        setError(null);
        return;
      }

      // 🔑 S123 — THE BUG THIS SLICE EXISTS FOR. Validate the claimed profile
      // against the profiles this identity ACTUALLY holds, before `me` is
      // called. The founder's report: signing in through the Tutor card with an
      // email that already had a student membership silently landed on the
      // student app. It happened because the claim was only ever consulted when
      // memberships was EMPTY — hold any membership and the persona was dead
      // code, and `me` answered with whatever single row existed.
      //
      // Done here rather than by letting `me` throw NO_MEMBERSHIP, because that
      // error is indistinguishable from the stale-board case the retry below
      // heals — it would clear a perfectly good board and then show an error
      // page instead of the signboard that explains the situation.
      // 🔴 GATED ON `length > 0`, AND THAT GUARD IS LOAD-BEARING. A brand-new
      // student holds NO memberships yet — their student row is minted by
      // onboarding, further down. Without this guard their perfectly valid
      // "student" claim matches nothing, and EVERY new signup lands in the
      // waiting room instead of onboarding. Zero memberships is "not yet",
      // never "denied"; the branches below already handle it correctly.
      const heldProfiles = new Set(who.memberships.map((m) => m.role));
      const claimUnheld =
        who.memberships.length > 0 && !!claimedRole && !heldProfiles.has(claimedRole);
      if (cancelled) return;
      // S124 — recorded so the signboard can offer the profiles they DO hold.
      // Sorted for a stable button order across boots; a set has no order and
      // the server makes no promise about membership order.
      setHeldRoles([...heldProfiles].sort());
      setMissingProfile(claimUnheld ? claimedRole : null);
      if (claimUnheld) {
        setNeedsBoard(false);
        setMe(null);
        setError(null);
        return;
      }

      if (who.memberships.length === 0) {
        // Belongs nowhere: no board header to send, so `me` and
        // `onboarding.getState` cannot be called at all. Onboarding runs
        // pre-board and does the picking.
        clearBoard();
        setNeedsBoard(true);
        setMe(null);
        setOnb(undefined);
        setError(null);
        return;
      }

      // S123: enter on a board where the ACTIVE PROFILE exists. `preferred` is
      // the oldest membership regardless of role, so a tutor on igcse whose
      // oldest row is a cbse student membership would otherwise be sent to cbse
      // carrying `x-profile: tutor` — a pair that matches nothing, turning a
      // valid tutor into a NO_MEMBERSHIP error. Board and profile have to agree.
      const boardForProfile = claimedRole
        ? (who.memberships.find((m) => m.role === claimedRole)?.slug ?? who.preferred!)
        : who.preferred!;
      setBoard(boardForProfile);
      setNeedsBoard(false);
      try {
        const r = await trpc.me.query();
        if (cancelled) return;
        setMe(r);
        setError(null);
      } catch (e: any) {
        const msg = String(e?.message ?? e);
        // SELF-HEALING against a stale localStorage board: a board this
        // identity no longer belongs to (membership revoked, board renamed,
        // another account on the same browser) makes `me` throw NO_MEMBERSHIP.
        // Drop the board and re-derive it once. Bounded to a single retry — a
        // loop here would be an infinite spinner, which is worse than an error.
        if (!retry && msg.includes("NO_MEMBERSHIP")) {
          clearBoard();
          return boot(true);
        }
        if (!cancelled) setError(msg);
        return;
      }

      // FAIL-OPEN on the client too: a welcome that can't be read must never
      // keep a student out of the product (G3 spirit). The server already fails
      // open; this covers the transport dying, which the server can't.
      trpc.onboarding.getState
        .query()
        .then((s) => !cancelled && setOnb(s))
        .catch(() => !cancelled && setOnb(null));
    }

    boot(false).catch((e) => !cancelled && setError(String(e?.message ?? e)));
    return () => {
      cancelled = true;
    };
    // `claimedRole` joins the deps: boot now branches on it (the S123 profile
    // check), so a re-pick that changes the persona must re-run boot. Leaving it
    // out would validate the OLD claim against the new membership set — a stale
    // read of exactly the kind that caused M78/M79 in this file.
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

  // Slice C (S110): the "Not invited" gate is GONE. The platform no longer
  // gates anyone — a signed-in identity becomes a student on first `me`. <Gate>
  // itself stays (loading + error states below still use it), and so does
  // gate.css.
  // Slice E — whoami still in flight. Held rather than rendered-and-replaced:
  // the alternative is flashing a board picker at a student who already has one.
  if (needsBoard === undefined) {
    return <Gate>{error ? <p className="gate-error">{error}</p> : "Loading…"}</Gate>;
  }

  // S125 — the admin door's deny state (boot: signed in, at `/admin`, no admin
  // row). Rendered before the `me` loading gate below, because boot deliberately
  // skipped the `me` fetch for this visitor — there is nothing to wait for.
  // Identical NotFound to the off-list admin further down, so a plain non-admin
  // and an off-list admin cannot tell their refusals apart (S124's rule: the
  // surface must not confirm to anyone that there is something to enter).
  if (isAdminRoute && deniedAdmin) {
    return <NotFound onSignOut={() => signOut()} />;
  }

  // 🔑 S123 — THE FOUNDER'S REPORT, ANSWERED. They hold memberships, but not the
  // one they asked for: signed in through the Tutor card holding only a student
  // profile. Before this branch existed the claim was ignored and they landed
  // on the student app, which reads as "the login is broken" because from the
  // outside it is.
  //
  // 🔴 THIS MUST SIT ABOVE the `me`-based routing below, and above the loading
  // gate for `me`. `me` is deliberately never fetched in this state (boot
  // returns early), so falling through would render "Loading…" forever.
  if (missingProfile) {
    return (
      <AccessPending
        name={session.user.name ?? session.user.email.split("@")[0] ?? "there"}
        role={missingProfile}
        onSignOut={() => signOut()}
        // 🔑 S124 — THE WAY OUT OF A STALE CLAIM. `b2c.persona` is written once
        // on the landing page and NOTHING has ever cleared it (`clearPersona`
        // has zero call sites), so it outlives the visit that set it. Anyone who
        // once clicked "Tutor" and wandered off carries that claim forever, and
        // on their next sign-in as a student it lands them here — a waiting room
        // for a role they never pursued, in front of an account that works.
        //
        // The escape existed before this (sign out → click the right card), but
        // nobody who hits this page knows that, and from the outside it reads as
        // "the app is broken". Offering the profiles they actually hold turns a
        // dead end into a choice, without a sign-out round-trip.
        //
        // 🔴 NOT FIXED BY CLEARING THE PERSONA ON A GOOD BOOT, which is the
        // obvious move: this value is also the `x-profile` header for the whole
        // session (trpc.ts), so dropping it would break the profile SELECTION
        // that S123 built. The claim is not stale state to purge — it is stale
        // only when it disagrees with the memberships, which is exactly here.
        heldRoles={heldRoles}
        onUseProfile={(role) => {
          setPersona(role);
          // Re-boot rather than patch state: `claimedRole` is read from
          // localStorage at render and is in the boot effect's deps, so bumping
          // the nonce re-runs the whole validation against the new claim. No
          // branch is left holding a value derived from the old one.
          setMissingProfile(null);
          setBootNonce((n) => n + 1);
        }}
      />
    );
  }

  // Slice E — belongs to no board yet. Onboarding runs PRE-BOARD: its
  // `about_you` beat grows the exam-board row, and committing it is what mints
  // the membership (session.chooseBoard). Nothing board-scoped is fetched
  // before that, because nothing board-scoped CAN be.
  //
  // The name comes from the auth session, not `me` — there is no spine identity
  // to read yet, which is precisely the state being handled.
  //
  // 🔑 A CLAIMED PARENT/TUTOR NEVER SEES STUDENT ONBOARDING — and this branch
  // must sit BEFORE the student one below, which is the whole guarantee.
  //
  // Onboarding is what mints the membership (`chooseBoard`, in the about_you
  // beat), so without this a self-declared parent is asked their class, their
  // pronoun, a hero and a pet before the app can discover they are not a
  // student. That is the bug the founder hit signing in through the Parent and
  // Tutor cards: the persona was cosmetic, so every Google signup became a
  // student regardless of which card was clicked.
  //
  // 🔴 S123 — THE CLAIM NO LONGER MINTS ANYTHING. This branch used to render
  // <ClaimMint>, which WROTE a disabled tutor/parent membership from a card
  // click. The founder's call killed that ("there is no construct like self
  // promote"), and the reason is in the journal: a FE latch bug minted a real
  // disabled tutor row and locked the founder out of their own app. A click can
  // no longer create a profile, so it can no longer create that mess.
  //
  // A claimed parent/tutor with no board at all is someone we have never heard
  // of asking for a role only an admin can give. That is the waiting room, and
  // now it is JUST the waiting room — nothing is written on the way in.
  if (needsBoard && isPendingRoleClaim) {
    return (
      <AccessPending
        name={session.user.name ?? session.user.email.split("@")[0] ?? "there"}
        role={claimedRole!}
        onSignOut={() => signOut()}
      />
    );
  }

  if (needsBoard) {
    return (
      <OnboardingPage
        studentName={session.user.name ?? session.user.email.split("@")[0] ?? "there"}
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
          setNeedsBoard(undefined);
          setBootNonce((n) => n + 1);
        }}
      />
    );
  }

  if (!me) {
    return <Gate>{error ? <p className="gate-error">{error}</p> : "Loading…"}</Gate>;
  }

  const displayName = me.user.name ?? me.user.email.split("@")[0] ?? "there";

  // ── S124 — `/admin` IS THE ONLY DOOR TO THE ADMIN PORTAL (founder). ──
  //
  // It sits ABOVE every other route so the URL has exactly two outcomes and
  // they are easy to hold in your head: the portal, or nothing. A tutor, a
  // parent, a student and an off-list admin all get the same not-found page —
  // the surface does not announce itself to anyone who cannot use it.
  //
  // 🔴 THE EMAIL CHECK HERE IS A COURTESY, NOT THE GATE. Anyone can edit a
  // bundle; the enforcement that matters is `adminProcedure` (trpc/init.ts),
  // which runs the same `isAdminEmail` server-side on every admin.* call. This
  // check exists so a wrong-but-honest visitor sees a clean 404 instead of a
  // portal that 403s on every button. If you ever find yourself relying on THIS
  // line for safety, the server-side one has been removed and that is the bug.
  //
  // ⚠️ Known edge: an identity with NO membership yet never reaches this block —
  // the `needsBoard` branch above returns onboarding first. Harmless, because an
  // admin necessarily HAS a membership row; a person without one is not one.
  if (isAdminRoute) {
    if (me.role === "admin" && isAdminEmail(me.user.email)) {
      return (
        <AdminPage
          adminName={displayName}
          adminEmail={me.user.email}
          onSignOut={() => signOut()}
        />
      );
    }
    return <NotFound onSignOut={() => signOut()} />;
  }

  // The other half of "only door": an admin who lands anywhere else is sent to
  // it. Without this an admin-only identity would fall through to the student
  // shell below and meet a dashboard with no student data behind it.
  //
  // `replace`, not `assign`: this is a correction, not a navigation, and it must
  // not put a broken back-button step in their history. It cannot loop — at
  // `/admin` the branch above returns first.
  //
  // 🔴 GUARDED ON THE EMAIL TOO. Sending an OFF-LIST admin here would strand
  // them: they would be redirected to `/admin` and served the not-found page,
  // with `/` bouncing them back every time they tried to leave. An off-list
  // admin instead falls through to the shell below, and the not-found page
  // carries a sign-out for the case where they typed the URL themselves.
  if (me.role === "admin" && isAdminEmail(me.user.email)) {
    window.location.replace(ADMIN_PATH);
    return <Gate>Taking you to the admin portal…</Gate>;
  }

  // 🔑 THE WAITING ROOM (founder, this session) — BEFORE the role routes below,
  // and that order is the whole guarantee.
  //
  // The landing persona now sets the role at signup, so `tutor` is a role anyone
  // can CLAIM. `membership.enabled` is what separates a claim from a grant: a
  // self-assigned tutor lands here, not on the authoring surface. Put this check
  // after the routes and a stranger picking "Tutor" on the login page would be
  // writing questions for real students.
  //
  // Students are never gated — `enabled` is written true for them at mint, so
  // this can never swallow the flow it sits in front of.
  if ((me.role === "tutor" || me.role === "parent") && !me.enabled) {
    return (
      <AccessPending name={displayName} role={me.role} onSignOut={() => signOut()} />
    );
  }

  // Slice T — tutors get their own read surface (different target user), routed
  // entirely separately from the student shell (Revision/Practice).
  if (me.role === "tutor") {
    return <TutorPage tutorName={displayName} onSignOut={() => signOut()} />;
  }

  // Slice P — parents get their own read surface (Polaris #4), also routed
  // separately from the student shell.
  if (me.role === "parent") {
    return <ParentPage parentName={displayName} onSignOut={() => signOut()} />;
  }

  // 🔴 S124 — THE ADMIN AUTO-ROUTE THAT USED TO SIT HERE IS GONE, DELIBERATELY.
  // Slice QA3-b routed `me.role === "admin"` straight to <AdminPage> from `/`,
  // which made the portal reachable without ever naming it. The founder's call
  // is that `/admin` is the only door, so the render moved to the isAdminRoute
  // branch above and the redirect replaced this block. Reinstating a role-only
  // route here would quietly re-open the portal at `/` and bypass the email
  // whitelist on the way — the FE half of the gate is that branch, not this one.
  //
  // Anything falling through to here is a student.

  const studentName = displayName;

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
