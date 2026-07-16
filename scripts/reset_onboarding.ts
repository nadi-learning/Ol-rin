/**
 * reset_onboarding (Slice ONB-1 Stage 2) — stand up the welcome's test student
 * and replay the flow from beat 1.
 *
 * Onboarding is a FIRST-LOGIN surface: once you've walked it, it's gone. That
 * makes it the one flow you cannot iterate on without a reset — hence this.
 *
 * Does two things, both idempotent:
 *  1. whitelist(cbse, demo@example.com, role='student') + the membership, made
 *     the REAL way by driving resolveMembership (whitelist → app_user →
 *     membership), never a direct insert (M11 — a seeded precondition that
 *     bypasses the real path proves nothing).
 *  2. DELETEs the student's `onboarding` row, so the next login starts at
 *     `greet` with a clean slate.
 *
 * Emails are lowercase to match what Better Auth stores at signup (M27).
 *
 * Usage:
 *   bun run reset:onboarding          # whitelist + wipe the row
 *   bun run reset:onboarding --keep   # whitelist only, leave progress intact
 *
 * Then: log in at :5174 as demo@example.com / dev-password-123 (dev login).
 */
import { and, eq } from "drizzle-orm";
import type { PgTransaction } from "drizzle-orm/pg-core";
import { board, onboarding, whitelist } from "@b2c/kernel/schema";
import { db, queryClient } from "../src/db/client";
import { withBoard } from "../src/db/with-board";
import { resolveMembership } from "../src/services/membership";

type Tx = PgTransaction<any, any, any>;

const BOARD_SLUG = "cbse";
const DEMO_EMAIL = "demo@example.com";
const DEMO_NAME = "Demo Student";
const keep = process.argv.includes("--keep");

async function main() {
  const [b] = await db.select().from(board).where(eq(board.slug, BOARD_SLUG)).limit(1);
  if (!b) {
    console.error(`[reset:onboarding] board '${BOARD_SLUG}' not found. Run \`bun run seed:ch5\` first.`);
    await queryClient.end();
    process.exit(1);
  }

  await withBoard(b.id, async (tx: Tx) => {
    await tx
      .insert(whitelist)
      .values({ boardId: b.id, email: DEMO_EMAIL, role: "student" })
      .onConflictDoNothing({ target: [whitelist.boardId, whitelist.email] });

    const m = await resolveMembership(tx, {
      email: DEMO_EMAIL,
      name: DEMO_NAME,
      board: { id: b.id, slug: b.slug },
    });

    if (keep) {
      console.log(`[reset:onboarding] whitelist ok, progress KEPT (user=${m.user.id})`);
      return;
    }

    const gone = await tx
      .delete(onboarding)
      .where(and(eq(onboarding.userId, m.user.id), eq(onboarding.boardId, b.id)))
      .returning({ id: onboarding.id });

    console.log(
      `[reset:onboarding] ${BOARD_SLUG} / ${DEMO_EMAIL} (role=${m.role}, user=${m.user.id}) — ` +
        `${gone.length ? "onboarding row DELETED" : "no onboarding row (already clean)"} → next login starts at 'greet'`,
    );
  });

  await queryClient.end();
}

main().catch(async (err) => {
  console.error("[reset:onboarding] FAILED:", err);
  await queryClient.end();
  process.exit(1);
});
