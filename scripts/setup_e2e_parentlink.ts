/**
 * setup_e2e_parentlink — put the LOCAL db into the state needed to walk the
 * parent self-serve link-request → admin approve loop (Slice S164/S165) end to
 * end. LOCAL ONLY, idempotent, re-runnable.
 *
 * Run `bun run seed:demoparent` FIRST (it builds the parent/student/tutor trio
 * + the dashboard evidence). Then this script:
 *
 *   1. Seeds `admin@example.com` as an admin on `cbse` (grantRole → an app_user
 *      shell with user_type='admin'), so there is a DEV-LOGIN admin to resolve
 *      the request without borrowing a real admin's Google account. The address
 *      is whitelisted in ADMIN_EMAILS (contracts.ts, see the note there).
 *
 *   2. UNLINKS the demo parent so it lands in the WAITING ROOM (where the new
 *      self-serve form lives), reproducing a fresh signup:
 *        · student@example.com  → student.parent_id = NULL
 *        · parent@example.com   → parent.status = 'inactive'
 *      An *active* parent with no child would route to a board-less (broken)
 *      ParentPage, NOT the waiting room — whoami keys the waiting room off the
 *      parent detail row being inactive/absent (session_boards.ts). Setting it
 *      inactive is reversible: the admin's resolve → grantRole flips it back to
 *      'active' and re-links, so the loop restores the seeded state.
 *
 * THE WALK after running this:
 *   Parent : Landing → pick "Parent" → dev-login `parent@example.com`
 *            → waiting room → enter `student@example.com` → Connect
 *   Admin  : open `/admin` → dev-login `admin@example.com`
 *            → Requests tab (badge shows 1) → pick "Demo Student" → Link
 *   Parent : back on the waiting room → "You're connected" → Open the dashboard
 *
 *   bun scripts/setup_e2e_parentlink.ts
 */
import { and, eq } from "drizzle-orm";
import {
  appUser,
  board,
  parent,
  parentLinkRequest,
  referral,
  student,
} from "@b2c/kernel/schema";
import { db, queryClient } from "../src/db/client";
import { withBoard } from "../src/db/with-board";
import { grantRole } from "../src/services/membership";

const ADMIN_EMAIL = "admin@example.com";
const PARENT_EMAIL = "parent@example.com";
const STUDENT_EMAIL = "student@example.com";
const TUTOR_EMAIL = "tutor@example.com"; // S166 — whose referral code the walk uses

async function main() {
  const [b] = await db
    .select({ id: board.id, slug: board.slug })
    .from(board)
    .where(eq(board.slug, "cbse"));
  if (!b) throw new Error("cbse board not found locally — run `bun run seed:boards` first");

  // ── 0. Clean slate: wipe the request queue for a fresh walk. GLOBAL table, no
  // board scope. (The stray parent-shell cleanup on admin@example.com happens at
  // the END — it can only be deleted AFTER the student that may reference it is
  // unlinked below, or the student.parent_id FK blocks it.) ──
  const cleared = await db.delete(parentLinkRequest).returning({ id: parentLinkRequest.id });
  console.log(`✓ queue   cleared ${cleared.length} parent_link_request row(s)`);

  await withBoard(b.id, async (tx) => {
    // 1. The dev-login admin.
    const admin = await grantRole(tx, {
      email: ADMIN_EMAIL,
      name: "Demo Admin",
      board: b,
      role: "admin",
    });
    console.log(`✓ admin   ${ADMIN_EMAIL} (id ${admin.user.id}) — user_type=admin, whitelisted`);

    // 2a. Unlink the child (RLS-scoped student table → inside withBoard).
    const stu = await tx
      .select({ userId: student.userId, parentId: student.parentId })
      .from(student)
      .innerJoin(appUser, eq(appUser.id, student.userId))
      .where(and(eq(appUser.email, STUDENT_EMAIL), eq(appUser.userType, "student")))
      .limit(1);
    if (stu[0]) {
      await tx
        .update(student)
        .set({ parentId: null })
        .where(eq(student.userId, stu[0].userId));
      console.log(`✓ student ${STUDENT_EMAIL} — parent_id cleared (was ${stu[0].parentId ?? "null"})`);
    } else {
      console.warn(`! student ${STUDENT_EMAIL} not found on cbse — run \`bun run seed:demoparent\` first`);
    }
  });

  // 2b. Deactivate the parent detail row (GLOBAL table, no board scope needed) so
  // whoami routes parent@example.com to the waiting room. Keyed on the parent-type
  // app_user (one email can hold several profiles — filter by user_type).
  const [pu] = await db
    .select({ id: appUser.id })
    .from(appUser)
    .where(and(eq(appUser.email, PARENT_EMAIL), eq(appUser.userType, "parent")))
    .limit(1);
  if (pu) {
    const res = await db
      .update(parent)
      .set({ status: "inactive" })
      .where(eq(parent.userId, pu.id))
      .returning({ userId: parent.userId });
    console.log(
      res.length
        ? `✓ parent  ${PARENT_EMAIL} (id ${pu.id}) — status=inactive → waiting room`
        : `✓ parent  ${PARENT_EMAIL} (id ${pu.id}) — no parent detail row (already a bare shell) → waiting room`,
    );
  } else {
    console.warn(`! parent ${PARENT_EMAIL} not found — run \`bun run seed:demoparent\` first`);
  }

  // ── 3. Remove any accidental parent shell on admin@example.com (minted by
  // submitting the parent form while signed in as admin — it files under
  // admin@example.com). The real admin profile is user_type='admin' and is
  // untouched. Safe now: the student was unlinked above, so nothing references
  // this shell; deleting the app_user cascades its `parent` detail row. ──
  const strayParent = await db
    .delete(appUser)
    .where(and(eq(appUser.email, ADMIN_EMAIL), eq(appUser.userType, "parent")))
    .returning({ id: appUser.id });
  console.log(
    strayParent.length
      ? `✓ cleanup removed stray parent shell on ${ADMIN_EMAIL} (id ${strayParent[0]!.id})`
      : `✓ cleanup no stray parent shell on ${ADMIN_EMAIL} (already clean)`,
  );

  // ── 4. S166 — clear any referral this parent already redeemed, so the code
  // field in the waiting-room form is live again on a re-run. Without this a
  // second walk reports 'already_referred' (a person is referrable ONCE, by DB
  // unique) and the referral leg of the walk silently does nothing. ──
  if (pu) {
    const wiped = await db
      .delete(referral)
      .where(eq(referral.referredUserId, pu.id))
      .returning({ id: referral.id });
    console.log(
      wiped.length
        ? `✓ referral cleared ${wiped.length} prior referral on ${PARENT_EMAIL} (rewards cascade)`
        : `✓ referral none to clear on ${PARENT_EMAIL}`,
    );
  }

  // A code to type in the form. The demo TUTOR's — deliberately not the student's
  // (that identity is about to be linked as this parent's child, and referring
  // your own child reads as a bug even though nothing forbids it).
  const [tut] = await db
    .select({ code: appUser.referralCode, name: appUser.name })
    .from(appUser)
    .where(and(eq(appUser.email, TUTOR_EMAIL), eq(appUser.userType, "tutor")))
    .limit(1);

  console.log("\nsetup_e2e_parentlink: done. Walk:");
  console.log("  Parent → Landing → 'Parent' card → dev-login parent@example.com → enter student@example.com");
  if (tut?.code) {
    console.log(`         ↳ referral code field: type  ${tut.code}  (${tut.name ?? TUTOR_EMAIL}'s)`);
  } else {
    console.log(`         ↳ no referral code on ${TUTOR_EMAIL} — skip the code field`);
  }
  console.log("  Admin  → /admin  → dev-login admin@example.com → Requests tab → Link");
  console.log("  Admin  → /admin  → Referrals tab → Qualify → Mark redeemed");
  console.log("  Parent → dashboard → 'Refer & earn' pill (bottom-right)");
  await queryClient.end();
}

main().catch(async (e) => {
  console.error("setup_e2e_parentlink FAILED:", e);
  await queryClient.end();
  process.exit(1);
});
