/**
 * seed_admin (Slice QA3-b) — establish an admin on board `cbse` so the topics.md
 * ingest tool has a login to eyeball.
 *
 * Creates (idempotent):
 *  - membership(cbse, admin@example.com, role='admin') via `grantRole` — the SET
 *    side of the role gate (M11). Made the REAL way, by driving the same helper
 *    `admin.setRole` drives (app_user → membership), never a direct insert.
 *
 * Emails are lowercase to match what Better Auth stores at signup (M27).
 *
 * For a live eyeball: log in as the seeded admin (dev login) → go to /admin
 * (S124: the portal has no other door) → pick a chapter
 * (cbse already has "Exploring Mixtures…" from seed:ch5 + others from
 * seed:registry) → paste that chapter's topics.md → Extract → Confirm.
 *
 * Usage: bun scripts/seed_admin.ts
 */
import { eq } from "drizzle-orm";
import type { PgTransaction } from "drizzle-orm/pg-core";
import { board } from "@b2c/kernel/schema";
import { ADMIN_EMAILS } from "@b2c/kernel/contracts";
import { db, queryClient } from "../src/db/client";
import { withBoard } from "../src/db/with-board";
import { grantRole } from "../src/services/membership";

type Tx = PgTransaction<any, any, any>;

const BOARD_SLUG = "cbse";

/**
 * 🔴 S124 — THE SEEDED ADMIN MUST BE A WHITELISTED ONE, AND IS READ FROM THE
 * WHITELIST RATHER THAN RETYPED.
 *
 * This used to be `admin@example.com`. Since the admin surface took its second
 * lock (`ADMIN_EMAILS`, kernel), that address grants a role that can no longer
 * open anything: the membership is minted, the login works, and every admin.*
 * call is refused — a seed that appears to succeed and produces an admin who
 * cannot admin. Taking `[0]` from the list instead means the seed cannot drift
 * from the gate, because there is only one list.
 *
 * ⚠️ Consequence worth knowing before you run this against a shared database:
 * it creates a membership for a REAL person's address. That is intended locally
 * (it is the only way to eyeball the portal) and is why the seed names it out
 * loud below.
 */
const ADMIN_EMAIL = ADMIN_EMAILS[0];
const ADMIN_NAME = "Admin One";

async function main() {
  const [b] = await db.select().from(board).where(eq(board.slug, BOARD_SLUG)).limit(1);
  if (!b) {
    console.error(`[seed:admin] board '${BOARD_SLUG}' not found. Run \`bun run seed:ch5\` first.`);
    await queryClient.end();
    process.exit(1);
  }

  await withBoard(b.id, async (tx: Tx) => {
    const admin = await grantRole(tx, {
      email: ADMIN_EMAIL,
      name: ADMIN_NAME,
      board: { id: b.id, slug: b.slug },
      role: "admin",
    });
    console.log(`[seed:admin] cbse / admin=${ADMIN_EMAIL} (role=${admin.role}, user=${admin.user.id})`);
  });

  await queryClient.end();
}

main().catch(async (err) => {
  console.error("[seed:admin] FAILED:", err);
  await queryClient.end();
  process.exit(1);
});
