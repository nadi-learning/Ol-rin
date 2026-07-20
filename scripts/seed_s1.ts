/**
 * seed_s1 — minimal data so the S1 login flow works in a browser smoke.
 *   - upsert boards: cbse, cambridge (global table)
 *   - grant one email a 'student' membership on the target board (RLS-scoped →
 *     withBoard), via `grantRole` — the M11 SET side, never a direct insert.
 *
 * The platform is NOT gated: anyone who signs in becomes a student on their
 * board automatically. This seed only pre-creates the membership so the row
 * exists before the first login (handy for a scripted smoke).
 *
 * Usage: bun scripts/seed_s1.ts [email] [board-slug]
 *   email       defaults to the prod admin (CLAUDE.md). Pass YOUR Google email
 *               to smoke the real login — the email Google returns is the one
 *               that gets the membership.
 *   board-slug  defaults to cbse.
 */
import { eq } from "drizzle-orm";
import { board } from "@b2c/kernel/schema";
import { db, queryClient } from "../src/db/client";
import { withBoard } from "../src/db/with-board";
import { grantRole } from "../src/services/membership";

const email = process.argv[2] ?? "spranav.iitkgp@gmail.com";
const boardSlug = process.argv[3] ?? "cbse";

async function upsertBoard(slug: string, name: string) {
  const [row] = await db
    .insert(board)
    .values({ slug, name })
    .onConflictDoUpdate({ target: board.slug, set: { name } })
    .returning();
  return row!;
}

async function main() {
  const cbse = await upsertBoard("cbse", "CBSE");
  await upsertBoard("cambridge", "Cambridge");
  console.log(`[seed] boards ready: cbse, cambridge`);

  const target = boardSlug === "cambridge" ? "cambridge" : "cbse";
  const targetBoard =
    target === "cbse"
      ? cbse
      : (await db.select().from(board).where(eq(board.slug, "cambridge")))[0]!;

  const m = await withBoard(targetBoard.id, (tx) =>
    grantRole(tx, {
      email,
      name: null,
      board: { id: targetBoard.id, slug: targetBoard.slug },
      role: "student",
    }),
  );
  console.log(`[seed] ${email} is a student on board ${target} (user=${m.user.id})`);

  await queryClient.end();
}

main().catch(async (err) => {
  console.error("[seed] FAILED:", err);
  await queryClient.end();
  process.exit(1);
});
