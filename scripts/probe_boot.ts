/**
 * probe_boot — S0 exit gate.
 *
 * Proves the tenancy guarantee end-to-end BEFORE any real data exists:
 *   1. DB connectivity (select 1) as the app role.
 *   2. HTTP /health 200 (soft — skipped if the server isn't running).
 *   3. RLS isolation: a row inserted under board A is INVISIBLE under board B.
 *   4. RLS visibility: the same row IS visible under board A.
 *   5. Fail-closed read: with NO board claim, the row is invisible.
 *   6. WITH CHECK: inserting a cross-board row (board_id ≠ claim) is rejected.
 *
 * This is only meaningful because the app connects as a NON-superuser role
 * (DATABASE_URL → b2c_app); a superuser would bypass RLS and pass vacuously
 * (cf. ai-build-miss M11 — a probe whose precondition can't fail proves nothing).
 */
import { eq } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { board, subject } from "@b2c/kernel/schema";
import { db, queryClient } from "../src/db/client";
import { withBoard } from "../src/db/with-board";
import { env } from "../src/config/env";

let passed = 0;
let failed = 0;
function check(name: string, ok: boolean) {
  if (ok) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.error(`  ✗ ${name}`);
  }
}

async function main() {
  const tag = `${Date.now()}`;

  // 1. connectivity
  await db.execute(sql`select 1`);
  check("DB connectivity (select 1) as app role", true);

  // 2. HTTP /health (soft)
  try {
    const res = await fetch(`http://localhost:${env.PORT}/health`);
    check(`HTTP /health → 200 (got ${res.status})`, res.status === 200);
  } catch {
    console.log("  ~ HTTP /health skipped (server not running)");
  }

  // seed two boards (board is not RLS-scoped)
  const [boardA] = await db
    .insert(board)
    .values({ slug: `probe-a-${tag}`, name: "Probe A" })
    .returning();
  const [boardB] = await db
    .insert(board)
    .values({ slug: `probe-b-${tag}`, name: "Probe B" })
    .returning();
  if (!boardA || !boardB) throw new Error("board seed failed");

  // insert a subject under board A
  const [subjA] = await withBoard(boardA.id, (tx) =>
    tx
      .insert(subject)
      .values({
        boardId: boardA.id,
        slug: `phys-${tag}`,
        name: "Physics",
        grade: "IGCSE",
      })
      .returning(),
  );
  if (!subjA) throw new Error("subject insert under board A failed");
  check("insert subject under board A (claim A)", true);

  // 3. isolation — invisible under board B
  const underB = await withBoard(boardB.id, (tx) =>
    tx.select().from(subject).where(eq(subject.id, subjA.id)),
  );
  check("RLS isolation: board A's subject invisible under claim B", underB.length === 0);

  // 4. visibility — visible under board A
  const underA = await withBoard(boardA.id, (tx) =>
    tx.select().from(subject).where(eq(subject.id, subjA.id)),
  );
  check("RLS visibility: visible under claim A", underA.length === 1);

  // 5. fail-closed — no claim set → invisible
  const noClaim = await db.select().from(subject).where(eq(subject.id, subjA.id));
  check("Fail-closed: invisible with no board claim", noClaim.length === 0);

  // 6. WITH CHECK — cross-board insert rejected
  let rejected = false;
  try {
    await withBoard(boardA.id, (tx) =>
      tx
        .insert(subject)
        .values({
          boardId: boardB.id, // ≠ claim A → must violate WITH CHECK
          slug: `cross-${tag}`,
          name: "Cross",
          grade: "IGCSE",
        })
        .returning(),
    );
  } catch {
    rejected = true;
  }
  check("WITH CHECK: cross-board insert (board_id ≠ claim) rejected", rejected);

  // cleanup
  await withBoard(boardA.id, (tx) => tx.delete(subject).where(eq(subject.id, subjA.id)));
  await db.delete(board).where(eq(board.id, boardA.id));
  await db.delete(board).where(eq(board.id, boardB.id));

  console.log(`\nprobe_boot: ${passed} passed, ${failed} failed`);
  await queryClient.end();
  process.exit(failed === 0 ? 0 : 1);
}

main().catch(async (err) => {
  console.error("probe_boot FAILED:", err);
  await queryClient.end();
  process.exit(1);
});
