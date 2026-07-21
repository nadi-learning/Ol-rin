/**
 * prod_grant_admin — founder-authorised (S124 deploy gate).
 *
 * Prod's only admin is `admin@example.com`, which the incoming whitelist does
 * not admit. This gives the founder's whitelisted address an admin membership so
 * the portal has a working key the moment the deploy lands.
 *
 * 🔑 DRIVES `grantRole`, NEVER A DIRECT INSERT (M11). Same path admin.setRole and
 * every seed uses, so app_user/membership stay consistent and the single write
 * path keeps its meaning.
 *
 * 🔑 ADDITIVE, NOT DESTRUCTIVE. Since S123 grantRole ADDS a profile beside the
 * existing ones rather than overwriting, so the founder's student membership is
 * untouched. It also leaves `admin@example.com` in place: that row can no longer
 * open anything after the deploy, but deleting it is a separate decision and
 * nobody asked for a delete.
 *
 * Idempotent — re-running finds the existing row.
 *
 * ⚠️ Whitelist inlined: the box's kernel is pre-deploy and has no ADMIN_EMAILS.
 */
import { eq } from "drizzle-orm";
import { appUser, board, membership } from "@b2c/kernel/schema";
import { db, queryClient } from "./src/db/client";
import { withBoard } from "./src/db/with-board";
import { grantRole } from "./src/services/membership";

const TARGET = "xxxx51263@gmail.com";
const BOARD_SLUG = "cbse";

const [b] = await db.select().from(board).where(eq(board.slug, BOARD_SLUG)).limit(1);
if (!b) {
  console.error(`board ${BOARD_SLUG} not found`);
  await queryClient.end();
  process.exit(1);
}

await withBoard(b.id, async (tx) => {
  const before = await tx
    .select({ email: appUser.email, role: membership.role, enabled: membership.enabled })
    .from(membership)
    .innerJoin(appUser, eq(appUser.id, membership.userId))
    .where(eq(appUser.email, TARGET));
  console.log(`before: ${before.map((r) => `${r.role}(enabled=${r.enabled})`).join(", ") || "no memberships"}`);

  const m = await grantRole(tx, {
    email: TARGET,
    name: "Amarnath",
    board: { id: b.id, slug: b.slug },
    role: "admin",
  });
  console.log(`granted: ${TARGET} → role=${m.role} on ${BOARD_SLUG}`);

  const after = await tx
    .select({ email: appUser.email, role: membership.role, enabled: membership.enabled })
    .from(membership)
    .innerJoin(appUser, eq(appUser.id, membership.userId))
    .where(eq(appUser.email, TARGET));
  console.log(`after:  ${after.map((r) => `${r.role}(enabled=${r.enabled})`).join(", ")}`);

  // The guarantee the deploy actually rests on.
  const adminRow = after.find((r) => r.role === "admin");
  if (!adminRow) throw new Error("REFUSING: no admin row after grant");
  if (!adminRow.enabled) throw new Error("REFUSING: admin row is not enabled");
  console.log("✅ a whitelisted, enabled admin now exists on cbse");
});

await queryClient.end();
