import { useEffect, useState, type ReactNode } from "react";
import { useSession, signOut } from "./lib/auth";
import { trpc, BOARD } from "./trpc";
import { AppShell, type AppView } from "./components/AppShell";
import { LandingPage } from "./components/LandingPage";
import { DashboardPage } from "./components/DashboardPage";
import { RevisionPage } from "./components/RevisionPage";
import { PracticePage } from "./components/PracticePage";
import { InsightsPage } from "./components/InsightsPage";
import { PacePlanPage } from "./components/PacePlanPage";
import { ProfilePage } from "./components/ProfilePage";
import { TutorPage } from "./components/TutorPage";
import { ParentPage } from "./components/ParentPage";
import { AdminPage } from "./components/AdminPage";
import "./theme/tokens.css";
import "./components/app-shell.css";
import "./components/gate.css";

// S4 — a whitelisted student logs in (b2c auth) → the TAITOR app shell → the
// Revision surface renders a live Starkhorn-shaped slide. A non-whitelisted
// email gets the "not invited" gate. Closes the walking skeleton.
type Me = Awaited<ReturnType<typeof trpc.me.query>>;

export function App() {
  const { data: session, isPending } = useSession();
  const [me, setMe] = useState<Me | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<AppView>("dashboard");
  // Deep-link target for "Continue lesson" — the sub_topic the dashboard wants
  // Revision to open at. Cleared (null) means Revision opens at its default.
  const [revisionTarget, setRevisionTarget] = useState<string | null>(null);

  const openLesson = (subTopicId: string) => {
    setRevisionTarget(subTopicId);
    setView("revision");
  };

  useEffect(() => {
    if (!session) {
      setMe(null);
      setError(null);
      return;
    }
    trpc.me
      .query()
      .then((r) => {
        setMe(r);
        setError(null);
      })
      .catch((e) => setError(String(e?.message ?? e)));
  }, [session]);

  if (isPending) return <Gate>Checking…</Gate>;

  if (!session) {
    return <LandingPage />;
  }

  if (error?.includes("NOT_WHITELISTED")) {
    return (
      <Gate>
        <h2>Not invited</h2>
        <p className="gate-sub">
          {session.user.email} isn’t on the whitelist for <b>{BOARD}</b>.
        </p>
        <button className="btn-ghost" onClick={() => signOut()}>
          Sign out
        </button>
      </Gate>
    );
  }

  if (!me) {
    return <Gate>{error ? <p className="gate-error">{error}</p> : "Loading…"}</Gate>;
  }

  const displayName = me.user.name ?? me.user.email.split("@")[0] ?? "there";

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
    return <AdminPage adminName={displayName} onSignOut={() => signOut()} />;
  }

  const studentName = displayName;
  return (
    <AppShell
      userName={studentName}
      view={view}
      onNavigate={(v) => {
        // REV-LAND: a manual nav to Revision opens the LANDING — clear any
        // stale dashboard deep-link so it can't skip it forever after.
        if (v === "revision") setRevisionTarget(null);
        setView(v);
      }}
      wide={view === "revision"}
    >
      {view === "dashboard" ? (
        <DashboardPage
          studentName={studentName}
          onOpenLesson={openLesson}
          onOpenPace={() => setView("pace")}
        />
      ) : view === "revision" ? (
        <RevisionPage
          studentName={studentName}
          initialSubTopicId={revisionTarget}
          onOpenPace={() => setView("pace")}
        />
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
        <PracticePage />
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
