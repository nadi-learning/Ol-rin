import { useEffect, useState, type ReactNode } from "react";
import { useSession, signOut } from "./lib/auth";
import { trpc, clearBoard, setBoard } from "./trpc";
import { AppShell, type AppView } from "./components/AppShell";
import { LandingPage } from "./components/LandingPage";
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
  // Deep-link target for "Continue lesson" — the sub_topic the dashboard wants
  // Revision to open at. Cleared (null) means Revision opens at its default.
  const [revisionTarget, setRevisionTarget] = useState<string | null>(null);

  const openLesson = (subTopicId: string) => {
    setRevisionTarget(subTopicId);
    setView("revision");
  };

  // Read once per mount, not on every render: `ClaimMint` CLEARS the persona
  // when it succeeds, and a value re-read after that would flip this to false
  // mid-flight and swap the component out from under its own request.
  const [claimedRole] = useState(() => getPersona());
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

      setBoard(who.preferred!);
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
  }, [session, bootNonce]);

  if (isPending) return <Gate>Checking…</Gate>;

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

  // Slice E — belongs to no board yet. Onboarding runs PRE-BOARD: its
  // `about_you` beat grows the exam-board row, and committing it is what mints
  // the membership (session.chooseBoard). Nothing board-scoped is fetched
  // before that, because nothing board-scoped CAN be.
  //
  // The name comes from the auth session, not `me` — there is no spine identity
  // to read yet, which is precisely the state being handled.
  // 🔑 A CLAIMED PARENT/TUTOR NEVER SEES STUDENT ONBOARDING.
  //
  // Onboarding is what mints the membership (`chooseBoard`, in the about_you
  // beat), so without this branch a self-declared parent would be asked their
  // class, their pronoun, a hero and a pet before the app could discover they
  // are not a student. The flow is written for a child; marching a parent
  // through it to reach a "call us" board is the wrong first impression.
  //
  // So they mint DIRECTLY and land on the waiting room. The board is a
  // placeholder: they are disabled until an admin sets them up by hand, and
  // setting them up is exactly when the right board gets chosen. Picking one
  // here would be asking a question whose answer we are about to overwrite.
  if (needsBoard && isPendingRoleClaim) {
    return <ClaimMint onDone={() => setBootNonce((n) => n + 1)} />;
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

  // Slice QA3-b — admins get the topics.md ingest tool (D-QA3-6), routed
  // separately from the student/tutor/parent shells.
  if (me.role === "admin") {
    return (
      <AdminPage
        adminName={displayName}
        adminEmail={me.user.email}
        onSignOut={() => signOut()}
      />
    );
  }

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
