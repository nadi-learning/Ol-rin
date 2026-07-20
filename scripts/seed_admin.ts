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
 * For a live eyeball: log in as admin@example.com (dev login) → pick a chapter
 * (cbse already has "Exploring Mixtures…" from seed:ch5 + others from
 * seed:registry) → paste that chapter's topics.md → Extract → Confirm.
 *
 * Usage: bun scripts/seed_admin.ts
 */
import { eq } from "drizzle-orm";
import type { PgTransaction } from "drizzle-orm/pg-core";
import { board } from "@b2c/kernel/schema";
import { db, queryClient } from "../src/db/client";
import { withBoard } from "../src/db/with-board";
import { grantRole } from "../src/services/membership";

type Tx = PgTransaction<any, any, any>;

const BOARD_SLUG = "cbse";
const ADMIN_EMAIL = "admin@example.com";
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
