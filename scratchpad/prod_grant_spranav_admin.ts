/**
 * prod_grant_spranav_admin — founder-authorised (this turn).
 *
 * Grants spranav.iitkgp@gmail.com an `admin` membership on BOTH active boards
 * (cbse + cambridge). spranav is already on the ADMIN_EMAILS whitelist; this
 * supplies the second half of the gate (the role row) so the portal opens.
 *
 * 🔑 DRIVES `grantRole`, NEVER A DIRECT INSERT (M11) — same path admin.setRole
 * and every seed uses.
 * 🔑 ADDITIVE, NOT DESTRUCTIVE (S123): grantRole ADDS a profile beside existing
 * ones, so spranav's cbse student membership is untouched.
 * Idempotent — re-running finds the existing admin row.
 * Passes the existing display name so the app_user name is not wiped.
 */
import { eq } from "drizzle-orm";
import { appUser, board, membership } from "@b2c/kernel/schema";
import { db, queryClient } from "./src/db/client";
import { withBoard } from "./src/db/with-board";
import { grantRole } from "./src/services/membership";

const TARGET = "spranav.iitkgp@gmail.com";
const NAME = "spranav.iitkgp"; // existing name — grantRole upserts unconditionally
const BOARD_SLUGS = ["cbse", "cambridge"];

for (const slug of BOARD_SLUGS) {
  const [b] = await db.select().from(board).where(eq(board.slug, slug)).limit(1);
  if (!b) {
    console.error(`✗ board ${slug} not found — skipping`);
    continue;
  }

  await withBoard(b.id, async (tx) => {
    const rows = (label: string) =>
      tx
        .select({ email: appUser.email, role: membership.role, enabled: membership.enabled })
        .from(membership)
        .innerJoin(appUser, eq(appUser.id, membership.userId))
        .where(eq(appUser.email, TARGET))
        .then((r) =>
          console.log(`  ${label}: ${r.map((x) => `${x.role}(enabled=${x.enabled})`).join(", ") || "no memberships"}`),
        );

    console.log(`\n=== ${slug} ===`);
    await rows("before");

    const m = await grantRole(tx, {
      email: TARGET,
      name: NAME,
      board: { id: b.id, slug: b.slug },
      role: "admin",
    });
    console.log(`  granted: ${TARGET} → role=${m.role} on ${slug}`);

    await rows("after ");

    // The guarantee: an enabled admin row must exist on this board now.
    const after = await tx
      .select({ role: membership.role, enabled: membership.enabled })
      .from(membership)
      .innerJoin(appUser, eq(appUser.id, membership.userId))
      .where(eq(appUser.email, TARGET));
    const adminRow = after.find((r) => r.role === "admin");
    if (!adminRow) throw new Error(`REFUSING: no admin row after grant on ${slug}`);
    if (!adminRow.enabled) throw new Error(`REFUSING: admin row not enabled on ${slug}`);
    console.log(`  ✅ enabled admin now exists on ${slug}`);
  });
}

await queryClient.end();
console.log("\nDone.");
