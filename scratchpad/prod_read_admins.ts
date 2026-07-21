/**
 * prod_read_admins — READ ONLY. Founder-authorised (S124 deploy gate).
 *
 * Answers exactly one question: which email(s) hold `role='admin'` on prod, and
 * would each survive the ADMIN_EMAILS whitelist this deploy introduces.
 *
 * 🔴 PER-BOARD VIA withBoard, NOT A BARE SELECT. `membership` is RLS-scoped and
 * fails CLOSED — reading it with no `app.board` claim returns [] BY DESIGN, and
 * that empty result reads exactly like "there are no admins", which is the
 * conclusion that would green-light the deploy that locks everyone out. M80 hit
 * this twice in one session, the second time against this same database.
 *
 * ⚠️ THE WHITELIST IS INLINED, NOT IMPORTED, AND THAT IS DELIBERATE. This script
 * runs on the box BEFORE the deploy, so `@b2c/kernel/contracts` there is still
 * the OLD build with no ADMIN_EMAILS export — importing it would throw, and the
 * failure would look like a DB problem. Kept in sync by hand for one run.
 *
 * Writes nothing.
 */
import { eq } from "drizzle-orm";
import { appUser, board, membership } from "@b2c/kernel/schema";
import { db, queryClient } from "./src/db/client";
import { withBoard } from "./src/db/with-board";

/** Mirrors packages/kernel/src/contracts.ts ADMIN_EMAILS at commit 0ca9bd4. */
const ADMIN_EMAILS = ["xxxx51263@gmail.com", "spranav.iitkgp@gmail.com"];
const isAdminEmail = (e: string | null | undefined) =>
  !!e && ADMIN_EMAILS.some((a) => a.toLowerCase() === e.trim().toLowerCase());

const boards = await db.select().from(board);
console.log(`boards: ${boards.length}`);

let total = 0;
let survivors = 0;

for (const b of boards) {
  await withBoard(b.id, async (tx) => {
    const rows = await tx
      .select({ email: appUser.email, enabled: membership.enabled })
      .from(membership)
      .innerJoin(appUser, eq(appUser.id, membership.userId))
      .where(eq(membership.role, "admin"));
    for (const r of rows) {
      total++;
      const ok = isAdminEmail(r.email);
      if (ok) survivors++;
      console.log(
        `  [${b.slug}] ${r.email}  enabled=${r.enabled}  → ${ok ? "SURVIVES" : "🔴 WOULD BE LOCKED OUT"}`,
      );
    }
  });
}

console.log(`\nadmin rows: ${total} · survive this deploy: ${survivors}`);
if (survivors === 0) {
  console.log("🔴 DO NOT DEPLOY AS-IS — prod would have ZERO working admins.");
} else {
  console.log("✅ At least one admin survives; the portal stays reachable.");
}

await queryClient.end();
