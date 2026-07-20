/** Temp people for the Slice D walk — one signed-in, one ghost. Cleaned up after. */
import { eq, sql } from "drizzle-orm";
import { appUser, board, membership, users } from "@b2c/kernel/schema";
import { db, queryClient } from "../src/db/client";
import { withBoard } from "../src/db/with-board";
import { grantRole } from "../src/services/membership";

const MODE = process.argv[2];
const REAL = "walk-real@example.com";
const GHOST = "walk-ghost@example.com";
const [cbse] = await db.select().from(board).where(eq(board.slug, "cbse"));
if (!cbse) throw new Error("no cbse board");

if (MODE === "up") {
  await withBoard(cbse.id, (tx) => grantRole(tx, { email: REAL, name: "Walk Real", board: cbse, role: "student" }));
  await withBoard(cbse.id, (tx) => grantRole(tx, { email: GHOST, name: "Walk Ghost", board: cbse, role: "student" }));
  // only REAL gets a Better Auth identity
  await db.insert(users).values({ email: REAL, name: "Walk Real", emailVerified: true }).onConflictDoNothing();
  console.log("seeded: walk-real (signed in) + walk-ghost (never signed in)");
} else {
  await withBoard(cbse.id, (tx) => tx.execute(sql`
    delete from membership where user_id in (select id from app_user where email in (${REAL}, ${GHOST}))
  `));
  for (const e of [REAL, GHOST]) {
    await db.delete(appUser).where(eq(appUser.email, e));
    await db.delete(users).where(eq(users.email, e));
  }
  console.log("cleaned up walk users");
}
await queryClient.end();
