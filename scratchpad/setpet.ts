/**
 * Slice G walk helper (S114) — sets a student's onboarding `pet` answer.
 *
 * The companion is the ONE input that decides what every Slice G surface
 * renders, and the seven pets span 0.46 to 1.40 aspect ratio. Driving the real
 * value through the DB (rather than stubbing a prop) is what makes the walk a
 * walk: App reads it from `onboarding.getState`, exactly as it will in prod.
 *
 *   bun scratchpad/setpet.ts <email> <pet>
 *
 * ⚠️ Writes through withBoard — `onboarding` is FORCE-RLS'd, so an unscoped
 * update silently matches ZERO rows and reports success (M29/M61).
 */
import { eq, and } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { appUser, board, membership, onboarding } from "@b2c/kernel/schema";
import { db, queryClient } from "../src/db/client";
import { withBoard } from "../src/db/with-board";

const email = process.argv[2];
const pet = process.argv[3];
if (!email || !pet) {
  console.error("usage: bun scratchpad/setpet.ts <email> <pet>");
  process.exit(1);
}

const [u] = await db.select().from(appUser).where(eq(appUser.email, email));
if (!u) throw new Error(`no app_user for ${email}`);

// Which board is this student on? membership is RLS'd, so ask each board.
const boards = await db.select().from(board);
let found: { boardId: string; slug: string } | null = null;
for (const b of boards) {
  const rows = await withBoard(b.id, (tx) =>
    tx.select().from(membership).where(and(eq(membership.userId, u.id), eq(membership.boardId, b.id))),
  );
  if (rows.length) {
    found = { boardId: b.id, slug: b.slug };
    break;
  }
}
if (!found) throw new Error(`${email} belongs to no board`);

const res = await withBoard(found.boardId, (tx) =>
  tx
    .update(onboarding)
    .set({ pet })
    .where(and(eq(onboarding.userId, u.id), eq(onboarding.boardId, found!.boardId)))
    .returning(),
);

// Assert the write LANDED. A zero-row update is the exact shape RLS produces
// when the claim is wrong, and it exits 0 unless something checks (M29).
if (res.length !== 1) throw new Error(`expected 1 onboarding row updated, got ${res.length}`);
console.log(`${email} (${found.slug}) → pet=${res[0]!.pet}`);
await queryClient.end();
