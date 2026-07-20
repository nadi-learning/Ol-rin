/**
 * S123 walk helper — give an identity ONE membership at a named role on cbse.
 *
 * Drives `grantRole`, the real SET side (M11), rather than inserting a
 * membership row directly: a probe or walk that seeds the table by hand proves
 * the surface works against data the app itself can never produce.
 *
 *   bun run scratchpad/profile-walk-seed.ts <email> <role>
 */
import { eq } from "drizzle-orm";
import { board as boardTable } from "@b2c/kernel/schema";
import { db, queryClient } from "../src/db/client";
import { withBoard } from "../src/db/with-board";
import { grantRole } from "../src/services/membership";
import type { Role } from "@b2c/kernel/contracts";

const email = process.argv[2];
const role = process.argv[3] as Role;
if (!email || !role) {
  console.error("usage: profile-walk-seed.ts <email> <role>");
  process.exit(1);
}

const [b] = await db
  .select({ id: boardTable.id, slug: boardTable.slug })
  .from(boardTable)
  .where(eq(boardTable.slug, "cbse"))
  .limit(1);
if (!b) {
  console.error("no cbse board — run: bun run seed:boards");
  process.exit(1);
}

await withBoard(b.id, (tx) =>
  grantRole(tx as any, { email, name: "Profile Walk", board: b, role }),
);
console.log(`  [seed] ${email} → ${role} on ${b.slug}`);
await queryClient.end();
