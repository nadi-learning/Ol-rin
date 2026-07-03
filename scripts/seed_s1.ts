/**
 * seed_s1 — minimal data so the S1 login flow works in a browser smoke.
 *   - upsert boards: cbse, cambridge (global table)
 *   - whitelist one email on cbse as 'student' (RLS-scoped → withBoard)
 *
 * Usage: bun scripts/seed_s1.ts [email] [board-slug]
 *   email       defaults to the prod admin (CLAUDE.md). Pass YOUR Google email
 *               to smoke the real login (the email Google returns must be
 *               whitelisted, else `me` → FORBIDDEN / "not invited").
 *   board-slug  defaults to cbse.
 */
import { and, eq } from "drizzle-orm";
import { board, whitelist } from "@b2c/kernel/schema";
import { db, queryClient } from "../src/db/client";
import { withBoard } from "../src/db/with-board";

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

  await withBoard(targetBoard.id, async (tx) => {
    const existing = await tx
      .select()
      .from(whitelist)
      .where(and(eq(whitelist.boardId, targetBoard.id), eq(whitelist.email, email)));
    if (existing.length === 0) {
      await tx
        .insert(whitelist)
        .values({ boardId: targetBoard.id, email, role: "student" });
    }
  });
  console.log(`[seed] whitelisted ${email} on board ${target} as student`);

  await queryClient.end();
}

main().catch(async (err) => {
  console.error("[seed] FAILED:", err);
  await queryClient.end();
  process.exit(1);
});
