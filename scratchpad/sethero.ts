/**
 * Slice J walk helper (S117) — sets a student's onboarding `fav_character`.
 *
 * The mirror of `setpet.ts`, and needed for the same reason: the hero is the ONE
 * input that decides what the Journal page fronts with, so driving the real
 * value through the DB (rather than stubbing a prop) is what makes the walk a
 * walk — App reads it from `onboarding.getState`, exactly as it will in prod.
 *
 *   bun scratchpad/sethero.ts <email> <hero|NULL|any-free-text>
 *
 * The three arguments that matter are not all valid ids, on purpose:
 *   - a real id  ("iron_man")            → the hero path
 *   - NULL                               → skipped the beat  → pet fallback
 *   - free text  ("Interstellar-Cooper") → a PRE-S91 row     → pet fallback
 * The last one is not hypothetical: `fav_character`'s own schema comment records
 * that rows written before S91 hold whatever the student typed, and `heroLabel`
 * echoes those back raw — so the name renders while the art is missing. That is
 * the exact state the Journal fallback exists for.
 *
 * ⚠️ Writes through withBoard — `onboarding` is FORCE-RLS'd, so an unscoped
 * update silently matches ZERO rows and reports success (M29/M61).
 */
import { eq, and } from "drizzle-orm";
import { appUser, board, membership, onboarding } from "@b2c/kernel/schema";
import { db, queryClient } from "../src/db/client";
import { withBoard } from "../src/db/with-board";

const email = process.argv[2];
const raw = process.argv[3];
if (!email || raw === undefined) {
  console.error("usage: bun scratchpad/sethero.ts <email> <hero|NULL|free-text>");
  process.exit(1);
}
const hero = raw === "NULL" ? null : raw;

const [u] = await db.select().from(appUser).where(eq(appUser.email, email));
if (!u) throw new Error(`no app_user for ${email}`);

// Which board is this student on? membership is RLS'd, so ask each board.
const boards = await db.select().from(board);
let found: { boardId: string; slug: string } | null = null;
for (const b of boards) {
  const rows = await withBoard(b.id, (tx) =>
    tx
      .select()
      .from(membership)
      .where(and(eq(membership.userId, u.id), eq(membership.boardId, b.id))),
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
    .set({ favCharacter: hero })
    .where(and(eq(onboarding.userId, u.id), eq(onboarding.boardId, found!.boardId)))
    .returning(),
);

// Assert the write LANDED. A zero-row update is the exact shape RLS produces
// when the claim is wrong, and it exits 0 unless something checks (M29).
if (res.length !== 1) throw new Error(`expected 1 onboarding row updated, got ${res.length}`);
console.log(`${email} (${found.slug}) → fav_character=${res[0]!.favCharacter ?? "NULL"}`);
await queryClient.end();
