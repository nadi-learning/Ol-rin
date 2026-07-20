/**
 * 🔴 RLS-AWARE. `onboarding` is tenant-scoped, so a plain `db.select()` runs
 * with NO board claim and returns ZERO ROWS — a confident, wrong "nobody has
 * this value". Must sweep board by board inside withBoard.
 */
import { sql } from "drizzle-orm";
import { board as boardTable } from "@b2c/kernel/schema";
import { db, queryClient } from "../src/db/client";
import { withBoard } from "../src/db/with-board";

const boards = await db.select({ id: boardTable.id, slug: boardTable.slug }).from(boardTable);
console.log(`sweeping ${boards.length} boards (RLS-scoped)…`);
let total = 0;
for (const b of boards) {
  const rows: any = await withBoard(b.id, (tx) =>
    tx.execute(sql`select pronoun, count(*)::int as n from onboarding group by pronoun order by n desc`),
  );
  const arr = Array.from(rows as any);
  if (arr.length) console.log(`  ${b.slug}:`, arr);
  for (const r of arr as any[]) total += Number(r.n);
}
console.log(`total onboarding rows across boards: ${total}`);
await queryClient.end();
