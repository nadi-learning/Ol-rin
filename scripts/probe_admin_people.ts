/**
 * probe_admin_people — Slice D exit gate (the admin PEOPLE surface).
 *
 * Real DB + real RLS, throwaway boards A/B (M22), self-cleaning. Everything here
 * is FIRM — no AI, no fixtures beyond seeded rows.
 *
 *   1. DB connectivity.
 *   2. The admin gate, BOTH sides (M11) — and a SOURCE-level assertion that all
 *      six procedures are declared on `adminProcedure`. The runtime legs below
 *      can only test the procedures that exist today; the source check is what
 *      catches a SEVENTH being added later on `protectedProcedure` by mistake,
 *      which is the realistic way this surface springs a leak.
 *   3. 🔑 THE TWO-USER-TABLES LEG — the load-bearing one. `app_user` is NOT
 *      proof of signing in (grantRole mints those for any email, as every seed
 *      does). A person with an app_user + membership but NO Better Auth `users`
 *      row must still be refused with USER_NOT_FOUND, or the founder's "no
 *      pre-invite" rule is decorative and the whitelist is quietly rebuilt.
 *   4. CANNOT_CHANGE_OWN_ROLE — an admin cannot demote themselves (lockout).
 *   5. setRole drives grantRole (M11: same path as the seeds) + the single-role
 *      invariant survives (grant tutor then parent → exactly ONE row).
 *   6. listPeople: board-scoped; `hasSignedIn` true/false both represented — a
 *      LEFT join, so a seeded never-logged-in member must NOT vanish.
 *   7. findByEmail: finds a global identity with no membership here (role null);
 *      unknown → null; exact-match only (a prefix must not resolve).
 *   8. linkStudent: role validation both endpoints · no-membership refused ·
 *      happy path · idempotent (double-link → still ONE row).
 *   9. listLinks: resolves both names · RLS — A's links invisible under B.
 *  10. unlinkStudent: removes 1, second call removes 0 (idempotent), and the
 *      MEMBERSHIP survives (unlink must never delete the person).
 *  11. HTTP: all six procedures unauth → 401 (soft, TIMEOUT-GUARDED).
 *
 * ⚠️ The HTTP legs use an AbortSignal timeout deliberately. The rest of the
 * suite uses a bare `fetch` inside a catch that assumes the only failure is
 * connection-refused — true for a DOWN server, false for a WEDGED one, which
 * hangs the whole suite silently (S110b). New code does not add to that debt.
 */
import { and, eq, sql } from "drizzle-orm";
import type { PgTransaction } from "drizzle-orm/pg-core";
import { appUser, board, membership, parentChild, tutorStudent, users } from "@b2c/kernel/schema";
import { db, queryClient } from "../src/db/client";
import { withBoard } from "../src/db/with-board";
import { grantRole } from "../src/services/membership";
import { assertAdmin, AdminOnlyError } from "../src/services/admin_ingest";
import {
  CannotChangeOwnRoleError,
  findByEmail,
  InvalidLinkError,
  linkStudent,
  listLinks,
  listPeople,
  setRole,
  unlinkStudent,
  UserNotFoundError,
  type Link,
} from "../src/services/admin_users";
import { env } from "../src/config/env";

type Tx = PgTransaction<any, any, any>;

let passed = 0;
let failed = 0;
function check(name: string, ok: boolean) {
  if (ok) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.error(`  ✗ ${name}`);
  }
}

/** Give someone a Better Auth identity — i.e. make "they have signed in" true. */
async function seedAuthIdentity(email: string, name: string) {
  await db.insert(users).values({ email, name, emailVerified: true }).onConflictDoNothing();
}

const HTTP_TIMEOUT_MS = 4000;

async function main() {
  const tag = `${Date.now()}`;
  await db.execute(sql`select 1`);
  check("DB connectivity (select 1) as app role", true);

  const [A] = await db.insert(board).values({ slug: `admp-a-${tag}`, name: "Probe P" }).returning();
  const [B] = await db.insert(board).values({ slug: `admp-b-${tag}`, name: "Probe Q" }).returning();
  if (!A || !B) throw new Error("board seed failed");

  const adminEmail = `admp-admin-${tag}@example.com`;
  const studentEmail = `admp-student-${tag}@example.com`;
  const tutorEmail = `admp-tutor-${tag}@example.com`;
  const parentEmail = `admp-parent-${tag}@example.com`;
  const ghostEmail = `admp-ghost-${tag}@example.com`; // membership, but NEVER signed in
  const strangerEmail = `admp-stranger-${tag}@example.com`; // signed in, no membership here

  // ── 2. the admin gate, both sides ──
  let nonAdminThrows = false;
  try {
    assertAdmin("student");
  } catch (e) {
    nonAdminThrows = e instanceof AdminOnlyError;
  }
  check("assertAdmin('student') → AdminOnlyError (check side)", nonAdminThrows);

  const adminM = await withBoard(A.id, (tx) =>
    grantRole(tx, { email: adminEmail, name: "Adm", board: A, role: "admin" }),
  );
  check("real flow grantRole(admin) yields role 'admin' (set side)", adminM.role === "admin");
  await seedAuthIdentity(adminEmail, "Adm");

  // SOURCE-level: every procedure on the people surface is adminProcedure.
  const routerSrc = await Bun.file("src/trpc/router.ts").text();
  const PEOPLE_PROCS = [
    "listPeople",
    "findByEmail",
    "setRole",
    "listLinks",
    "linkStudent",
    "unlinkStudent",
  ];
  const notAdminGated = PEOPLE_PROCS.filter(
    (p) => !new RegExp(`${p}:\\s*adminProcedure`).test(routerSrc),
  );
  check(
    `all 6 people procedures declared on adminProcedure${notAdminGated.length ? ` (leaked: ${notAdminGated.join(", ")})` : ""}`,
    notAdminGated.length === 0,
  );

  // ── 3. 🔑 the two-user-tables leg ──
  // A ghost: real membership + real app_user, but no Better Auth identity —
  // exactly what every seed produces.
  await withBoard(A.id, (tx) =>
    grantRole(tx, { email: ghostEmail, name: "Ghost", board: A, role: "student" }),
  );
  const ghostAppUser = await db
    .select({ id: appUser.id })
    .from(appUser)
    .where(eq(appUser.email, ghostEmail));
  check("ghost HAS an app_user row (so app_user cannot be the test)", ghostAppUser.length === 1);

  let ghostRefused = false;
  let ghostErrCode = "";
  try {
    await withBoard(A.id, (tx) =>
      setRole(tx, {
        board: A,
        actorUserId: adminM.user.id,
        email: ghostEmail,
        role: "tutor",
      }),
    );
  } catch (e) {
    ghostRefused = e instanceof UserNotFoundError;
    ghostErrCode = (e as any)?.code ?? "";
  }
  check(
    `🔑 setRole on a never-signed-in person → USER_NOT_FOUND (got ${ghostErrCode || "no throw"})`,
    ghostRefused,
  );
  const ghostStillStudent = await withBoard(A.id, (tx) =>
    tx
      .select({ role: membership.role })
      .from(membership)
      .innerJoin(appUser, eq(appUser.id, membership.userId))
      .where(eq(appUser.email, ghostEmail)),
  );
  check("…and the refusal WROTE NOTHING (ghost still student)", ghostStillStudent[0]?.role === "student");

  // ── 4. self-demotion refused ──
  let selfRefused = false;
  try {
    await withBoard(A.id, (tx) =>
      setRole(tx, { board: A, actorUserId: adminM.user.id, email: adminEmail, role: "student" }),
    );
  } catch (e) {
    selfRefused = e instanceof CannotChangeOwnRoleError;
  }
  check("setRole on SELF → CANNOT_CHANGE_OWN_ROLE", selfRefused);
  const adminStill = await withBoard(A.id, (tx) =>
    tx
      .select({ role: membership.role })
      .from(membership)
      .innerJoin(appUser, eq(appUser.id, membership.userId))
      .where(eq(appUser.email, adminEmail)),
  );
  check("…and the admin is STILL admin (no lockout)", adminStill[0]?.role === "admin");

  // ── 5. setRole works for real; single-role invariant holds ──
  await seedAuthIdentity(tutorEmail, "Tutor T");
  await seedAuthIdentity(parentEmail, "Parent P");
  await seedAuthIdentity(studentEmail, "Student S");
  await seedAuthIdentity(strangerEmail, "Stranger X");

  const madeTutor = await withBoard(A.id, (tx) =>
    setRole(tx, { board: A, actorUserId: adminM.user.id, email: tutorEmail, role: "tutor" }),
  );
  check("setRole(tutor) on a signed-in person → role 'tutor'", madeTutor.role === "tutor");
  check("…and reports hasSignedIn true", madeTutor.hasSignedIn === true);

  // Granting a role must not RENAME anyone. grantRole upserts app_user.name, so
  // a null Better Auth name would wipe the spine's name if passed through raw.
  const namelessEmail = `admp-nameless-${tag}@example.com`;
  await withBoard(A.id, (tx) =>
    grantRole(tx, { email: namelessEmail, name: "Spine Name", board: A, role: "student" }),
  );
  await db.insert(users).values({ email: namelessEmail, name: null, emailVerified: true });
  const renamed = await withBoard(A.id, (tx) =>
    setRole(tx, { board: A, actorUserId: adminM.user.id, email: namelessEmail, role: "tutor" }),
  );
  check(
    `setRole does NOT wipe an existing name when the auth name is null (got ${JSON.stringify(renamed.name)})`,
    renamed.name === "Spine Name",
  );

  // 🔴 S123 INVERTED THIS LEG. Granting a SECOND role now ACCUMULATES rather
  // than overwriting — the founder's multi-profile construct, where one email
  // holds a student/tutor/parent profile side by side and the active one is
  // named per request (`x-profile`). Before S123 this asserted the opposite
  // (exactly one row, overwritten), which is why it went red on the migration.
  await withBoard(A.id, (tx) =>
    setRole(tx, { board: A, actorUserId: adminM.user.id, email: tutorEmail, role: "parent" }),
  );
  const tutorRows = await withBoard(A.id, (tx) =>
    tx
      .select({ role: membership.role })
      .from(membership)
      .innerJoin(appUser, eq(appUser.id, membership.userId))
      .where(eq(appUser.email, tutorEmail)),
  );
  // M54 still applies: assert the ROLES, not just the count. A count-only check
  // would pass on two rows that both said 'parent' — i.e. on a broken grant.
  check(
    `S123 multi-profile: setRole ADDS a second profile (got ${tutorRows.length}: ${tutorRows
      .map((r) => r.role)
      .sort()
      .join("+")})`,
    tutorRows.length === 2 &&
      new Set(tutorRows.map((r) => r.role)).size === 2 &&
      tutorRows.every((r) => r.role === "tutor" || r.role === "parent"),
  );

  // 🔴 RESTORE BY DELETING, NOT BY RE-GRANTING. The link legs below expect this
  // person to be a tutor and nothing else. Pre-S123 a `setRole(…, "tutor")` put
  // them back because a grant overwrote; now it would simply no-op against the
  // tutor row they still hold and leave the parent profile standing, so the
  // legs would run against a two-profile person and silently mean something
  // different. Removing a profile is a delete — that is the whole point of the
  // new unique.
  await withBoard(A.id, async (tx) => {
    const [u] = await tx
      .select({ id: appUser.id })
      .from(appUser)
      .where(eq(appUser.email, tutorEmail))
      .limit(1);
    await tx
      .delete(membership)
      .where(
        and(
          eq(membership.userId, u!.id),
          eq(membership.boardId, A.id),
          eq(membership.role, "parent"),
        ),
      );
  });
  await withBoard(A.id, (tx) =>
    setRole(tx, { board: A, actorUserId: adminM.user.id, email: parentEmail, role: "parent" }),
  );
  await withBoard(A.id, (tx) =>
    setRole(tx, { board: A, actorUserId: adminM.user.id, email: studentEmail, role: "student" }),
  );

  // ── 6. listPeople ──
  const peopleA = await withBoard(A.id, (tx) => listPeople(tx));
  const emailsA = peopleA.map((p) => p.email);
  check(
    "listPeople returns the board's members (admin/tutor/parent/student/ghost)",
    [adminEmail, tutorEmail, parentEmail, studentEmail, ghostEmail].every((e) =>
      emailsA.includes(e),
    ),
  );
  check(
    "listPeople: the never-signed-in ghost is PRESENT with hasSignedIn=false (LEFT join)",
    peopleA.find((p) => p.email === ghostEmail)?.hasSignedIn === false,
  );
  check(
    "listPeople: a signed-in member reads hasSignedIn=true",
    peopleA.find((p) => p.email === tutorEmail)?.hasSignedIn === true,
  );
  const peopleB = await withBoard(B.id, (tx) => listPeople(tx));
  check(
    `RLS: board B's listPeople does NOT see A's members (got ${peopleB.length})`,
    peopleB.every((p) => !emailsA.includes(p.email)),
  );

  // ── 7. findByEmail ──
  const stranger = await withBoard(A.id, (tx) => findByEmail(tx, strangerEmail));
  check("findByEmail finds a signed-in person with NO membership here", stranger !== null);
  check("…and reports role null (not on this board) + hasSignedIn true", stranger?.role === null && stranger?.hasSignedIn === true);
  const known = await withBoard(A.id, (tx) => findByEmail(tx, tutorEmail));
  check("findByEmail reports the role of someone ON this board", known?.role === "tutor");
  const missing = await withBoard(A.id, (tx) => findByEmail(tx, `nobody-${tag}@example.com`));
  check("findByEmail unknown → null", missing === null);
  const prefix = await withBoard(A.id, (tx) => findByEmail(tx, strangerEmail.slice(0, 10)));
  check("findByEmail is EXACT-match (a prefix does not resolve → no enumeration)", prefix === null);

  // ── 8. linkStudent ──
  let wrongRole = false;
  try {
    await withBoard(A.id, (tx) =>
      linkStudent(tx, {
        boardId: A.id,
        kind: "tutor",
        adultEmail: studentEmail, // a student, not a tutor
        studentEmail,
      }),
    );
  } catch (e) {
    wrongRole = e instanceof InvalidLinkError;
  }
  check("linkStudent with a STUDENT as the tutor → INVALID_LINK", wrongRole);

  let noMembership = false;
  try {
    await withBoard(A.id, (tx) =>
      linkStudent(tx, {
        boardId: A.id,
        kind: "tutor",
        adultEmail: tutorEmail,
        studentEmail: strangerEmail, // signed in, but not on this board
      }),
    );
  } catch (e) {
    noMembership = e instanceof InvalidLinkError;
  }
  check("linkStudent with an off-board student → INVALID_LINK", noMembership);

  await withBoard(A.id, (tx) =>
    linkStudent(tx, { boardId: A.id, kind: "tutor", adultEmail: tutorEmail, studentEmail }),
  );
  await withBoard(A.id, (tx) =>
    linkStudent(tx, { boardId: A.id, kind: "parent", adultEmail: parentEmail, studentEmail }),
  );
  // idempotent — a double-click must not duplicate
  await withBoard(A.id, (tx) =>
    linkStudent(tx, { boardId: A.id, kind: "tutor", adultEmail: tutorEmail, studentEmail }),
  );
  const tsRows = await withBoard(A.id, (tx) =>
    tx.select({ id: tutorStudent.id }).from(tutorStudent).where(eq(tutorStudent.boardId, A.id)),
  );
  check(`linkStudent is idempotent: double-link → ONE row (got ${tsRows.length})`, tsRows.length === 1);

  // ── 9. listLinks ──
  const linksA = await withBoard(A.id, (tx) => listLinks(tx));
  const tutorLink = linksA.find((l) => l.kind === "tutor");
  const parentLink = linksA.find((l) => l.kind === "parent");
  check("listLinks returns both a tutor and a parent link", Boolean(tutorLink && parentLink));
  check(
    "listLinks resolves BOTH sides' emails (the aliased self-join works)",
    tutorLink?.adultEmail === tutorEmail && tutorLink?.studentEmail === studentEmail,
  );
  const linksB = await withBoard(B.id, (tx) => listLinks(tx));
  check(`RLS: board B sees NONE of A's links (got ${linksB.length})`, linksB.length === 0);

  // Deterministic order. "Remove" is a per-row button, so an unordered list can
  // reshuffle between render and click and delete a link the admin never aimed
  // at — found while writing the browser walk, which did exactly that.
  const within = (ls: Link[], kind: "tutor" | "parent") =>
    ls.filter((l) => l.kind === kind).map((l) => l.adultEmail);
  const sorted = (xs: string[]) => xs.every((v, i) => i === 0 || xs[i - 1]! <= v);
  const again = await withBoard(A.id, (tx) => listLinks(tx));
  check(
    "listLinks is ORDERED (stable across calls, sorted within each kind)",
    sorted(within(linksA, "tutor")) &&
      sorted(within(linksA, "parent")) &&
      JSON.stringify(again.map((l) => `${l.kind}:${l.adultEmail}:${l.studentEmail}`)) ===
        JSON.stringify(linksA.map((l) => `${l.kind}:${l.adultEmail}:${l.studentEmail}`)),
  );

  // ── 10. unlinkStudent ──
  const rm1 = await withBoard(A.id, (tx) =>
    unlinkStudent(tx, {
      kind: "tutor",
      adultUserId: tutorLink!.adultUserId,
      studentUserId: tutorLink!.studentUserId,
    }),
  );
  check("unlinkStudent removes the link (removed=1)", rm1.removed === 1);
  const rm2 = await withBoard(A.id, (tx) =>
    unlinkStudent(tx, {
      kind: "tutor",
      adultUserId: tutorLink!.adultUserId,
      studentUserId: tutorLink!.studentUserId,
    }),
  );
  check("unlinkStudent is idempotent (second call removed=0)", rm2.removed === 0);
  const survivors = await withBoard(A.id, (tx) => listPeople(tx));
  check(
    "unlink deleted the LINK only — both people still have memberships",
    survivors.some((p) => p.email === tutorEmail) && survivors.some((p) => p.email === studentEmail),
  );

  // ── 11. HTTP: unauth → 401 on every procedure (soft, timeout-guarded) ──
  // ⚠️ The VERB matters. tRPC answers a GET on a mutation with 405 Method Not
  // Allowed *before* the auth middleware runs — so a GET against setRole returns
  // 405 whether or not the procedure is gated, and asserting 401 over GET would
  // be a test that cannot fail for the reason it claims to. Queries go GET,
  // mutations go POST, and each must reach the gate and be refused.
  const HTTP_LEGS: Array<{ proc: string; method: "GET" | "POST" }> = [
    { proc: "listPeople", method: "GET" },
    { proc: "findByEmail", method: "GET" },
    { proc: "listLinks", method: "GET" },
    { proc: "setRole", method: "POST" },
    { proc: "linkStudent", method: "POST" },
    { proc: "unlinkStudent", method: "POST" },
  ];
  for (const { proc, method } of HTTP_LEGS) {
    try {
      const res = await fetch(`http://localhost:${env.PORT}/trpc/admin.${proc}`, {
        method,
        headers: { "x-board": A.slug, "content-type": "application/json" },
        body: method === "POST" ? "{}" : undefined,
        signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
      });
      check(
        `HTTP ${method} admin.${proc} (unauth) → 401 (got ${res.status})`,
        res.status === 401,
      );
    } catch (e: any) {
      const why = e?.name === "TimeoutError" ? "server WEDGED — not merely down" : "server not running";
      console.log(`  ~ HTTP admin.${proc} skipped (${why})`);
    }
  }

  // ── cleanup (FK-safe) ──
  const allEmails = [
    adminEmail,
    studentEmail,
    tutorEmail,
    parentEmail,
    ghostEmail,
    strangerEmail,
    `admp-nameless-${tag}@example.com`,
  ];
  await withBoard(A.id, async (tx: Tx) => {
    await tx.delete(tutorStudent).where(eq(tutorStudent.boardId, A.id));
    await tx.delete(parentChild).where(eq(parentChild.boardId, A.id));
    await tx.delete(membership).where(eq(membership.boardId, A.id));
  });
  await withBoard(B.id, async (tx: Tx) => {
    await tx.delete(membership).where(eq(membership.boardId, B.id));
  });
  for (const e of allEmails) {
    await db.delete(appUser).where(eq(appUser.email, e));
    await db.delete(users).where(eq(users.email, e));
  }
  await db.delete(board).where(eq(board.id, A.id));
  await db.delete(board).where(eq(board.id, B.id));

  console.log(`\nprobe_admin_people: ${passed} passed, ${failed} failed`);
  await queryClient.end();
  process.exit(failed === 0 ? 0 : 1);
}

main().catch(async (err) => {
  console.error("probe_admin_people FAILED:", err);
  await queryClient.end();
  process.exit(1);
});
