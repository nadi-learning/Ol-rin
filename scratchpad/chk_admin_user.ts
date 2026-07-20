import { eq } from "drizzle-orm";
import { appUser, board, membership, users } from "@b2c/kernel/schema";
import { db, queryClient } from "../src/db/client";
import { withBoard } from "../src/db/with-board";

const boards = await db.select().from(board);
for (const b of boards) {
  await withBoard(b.id, async (tx) => {
    const rows = await tx
      .select({ email: appUser.email, role: membership.role, enabled: membership.enabled })
      .from(membership)
      .innerJoin(appUser, eq(appUser.id, membership.userId));
    const byEmail = new Map<string, string[]>();
    for (const r of rows) {
      byEmail.set(r.email, [...(byEmail.get(r.email) ?? []), `${r.role}${r.enabled ? "" : "(off)"}`]);
    }
    console.log(`\n── board ${b.slug} ──`);
    for (const [email, roles] of byEmail) console.log(`  ${email}: ${roles.join(", ")}`);
  });
}

const authed = new Set((await db.select({ email: users.email }).from(users)).map((r) => r.email));
console.log(`\nhas a Better Auth login: ${[...authed].filter((e) => !e.includes("walk")).join(", ")}`);
await queryClient.end();
