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
 *   7. THE CENSUS (S113, Slice F): TENANT_SCOPED_TABLES reconciled against
 *      pg_class in BOTH directions — no listed table is missing from the DB
 *      (which would hard-fail migrate.ts and every later migration), and no
 *      board_id table is missing from the list (M34 — RLS silently OFF).
 *
 * This is only meaningful because the app connects as a NON-superuser role
 * (DATABASE_URL → b2c_app); a superuser would bypass RLS and pass vacuously
 * (cf. ai-build-miss M11 — a probe whose precondition can't fail proves nothing).
 */
import { eq } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { board, subject, TENANT_SCOPED_TABLES } from "@b2c/kernel/schema";
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

  // ── 7. THE CENSUS — TENANT_SCOPED_TABLES reconciled against pg_class. ──
  // The list is hand-maintained and the toolchain checks NEITHER direction:
  //
  //   list ⊄ db  — an entry whose table does not exist makes migrate.ts
  //                hard-fail on `ALTER TABLE <gone>`, breaking not just that
  //                run but EVERY later migration. This is the trap Slice F
  //                (S113, DROP TABLE whitelist) walked into deliberately.
  //   db ⊄ list  — a board_id table missing from the list ships with RLS OFF
  //                while the migration still prints success (M34). That is a
  //                cross-tenant leak, the highest-severity bug class here.
  //
  // Read from pg_class, never from the migrate log — a success message is not
  // a security check (M34). pg_class is the catalog, so unlike a row read it
  // is not itself RLS-filtered (M29/M61): a zero here means zero.
  const census = (await db.execute(sql`
    select c.relname, c.relrowsecurity, c.relforcerowsecurity
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r'
  `)) as unknown as Array<{
    relname: string;
    relrowsecurity: boolean;
    relforcerowsecurity: boolean;
  }>;
  const byName = new Map(census.map((r) => [r.relname, r]));

  const missing = TENANT_SCOPED_TABLES.filter((t) => !byName.has(t));
  check(
    `list ⊆ db: every TENANT_SCOPED_TABLES entry exists${missing.length ? ` (missing: ${missing.join(", ")})` : ""}`,
    missing.length === 0,
  );

  const unprotected = TENANT_SCOPED_TABLES.filter(
    (t) => byName.has(t) && !(byName.get(t)!.relrowsecurity && byName.get(t)!.relforcerowsecurity),
  );
  check(
    `every listed table has RLS ENABLED + FORCED${unprotected.length ? ` (open: ${unprotected.join(", ")})` : ""}`,
    unprotected.length === 0,
  );

  // The M34 direction: a table carrying board_id that nobody added to the list.
  // Derived from the catalog, so a new table is caught the day it lands.
  const boardIdTables = (await db.execute(sql`
    select table_name from information_schema.columns
    where table_schema = 'public' and column_name = 'board_id'
  `)) as unknown as Array<{ table_name: string }>;
  const listed = new Set<string>(TENANT_SCOPED_TABLES);
  // upload_token + ai_call_log carry board_id but are DELIBERATELY global —
  // they are read without a board claim (see their comments in schema.ts).
  const EXEMPT = new Set(["upload_token", "ai_call_log"]);
  const unlisted = boardIdTables
    .map((r) => r.table_name)
    .filter((t) => !listed.has(t) && !EXEMPT.has(t));
  check(
    `db ⊆ list: no board_id table is missing from TENANT_SCOPED_TABLES${unlisted.length ? ` (unlisted: ${unlisted.join(", ")})` : ""}`,
    unlisted.length === 0,
  );

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
