/**
 * merge_subtopics — collapse duplicate sub-topics INSIDE one chapter, moving all
 * evidence onto the surviving row.
 *
 * ── Why this is separate from `merge:spine` (S170) ───────────────────────────
 * `merge_spine_duplicates` deliberately never merges sub-topics: each one can
 * carry its own certified mastery, and collapsing two by name similarity would
 * silently destroy a tutor's sign-off. That caution is right as a default and
 * wrong as an absolute — after the S170 spine copy, prod's Electricity holds
 * TWO lineages of the same curriculum:
 *
 *   PROD-authored  18 sub-topics · 0 certified mastery · 7 questions
 *   hand-off        8 sub-topics · 16 certified mastery · 16 questions
 *
 * so a parent sees the same concept twice and the chapter reads far emptier than
 * the child actually is. The pairs are not guessed from prose — they line up
 * EXACTLY on (topic ordinal, sub-topic ordinal), 8 for 8.
 *
 * ── The rules ────────────────────────────────────────────────────────────────
 *  · Pairs are given EXPLICITLY, by id. No name distance, no heuristic. If a
 *    mapping is wrong here it is wrong because a human wrote it wrong, which is
 *    a mistake you can find in review.
 *  · The referencing-column list is derived from `pg_constraint` at run time,
 *    never hand-written (M94 — two scripts died on a hand-built list).
 *  · `mastery_state` and `scheduling_state` are UNIQUE (student_id, sub_topic_id).
 *    A student holding a row on BOTH twins would collide on re-point, so those
 *    two are resolved explicitly: the row with real content wins, the other is
 *    dropped. Every such decision is printed.
 *  · Dry run by default; prod needs `--target-prod` and a typed hostname.
 *
 *   bun run subtopic:merge -- --pairs <file.json> [--target-prod] [--execute]
 *
 * The pairs file is `[{ "loser": "<uuid>", "winner": "<uuid>" }, …]`.
 */
import { eq, sql } from "drizzle-orm";
import { board } from "@b2c/kernel/schema";
import { db, queryClient } from "../src/db/client";
import { withBoard } from "../src/db/with-board";
import { assertTarget } from "./prod_guard";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";

const argv = process.argv.slice(2);
const EXECUTE = argv.includes("--execute");
const pairsArg = argv[argv.indexOf("--pairs") + 1];
const PAIRS_FILE = (argv.includes("--pairs") && pairsArg ? pairsArg : "").replace(/^~/, homedir());
const boardArg = argv[argv.indexOf("--board") + 1];
const BOARD = argv.includes("--board") && boardArg ? boardArg : "cbse";

type Pair = { loser: string; winner: string };

/** Tables that hold a UNIQUE (student_id, sub_topic_id) — need conflict handling. */
const PER_STUDENT_UNIQUE = new Set(["mastery_state", "scheduling_state"]);

async function main() {
  if (!PAIRS_FILE) {
    console.error("usage: merge_subtopics.ts --pairs <file.json> [--target-prod] [--execute]");
    process.exit(1);
  }
  const pairs = JSON.parse(readFileSync(PAIRS_FILE, "utf8")) as Pair[];
  if (!pairs.length) throw new Error("no pairs");
  if (pairs.some((p) => p.loser === p.winner)) throw new Error("a pair merges a row into itself");

  // 🔴 EVERY read and write below runs inside `withBoard`. `sub_topic` and its
  // referrers are RLS'd + FORCEd, so a board-less query matches NOTHING and
  // returns silently — the first version of this script reported "sub_topic
  // <uuid> does not exist" about a row sitting right there (the M80 family).
  const [b] = await db.select().from(board).where(eq(board.slug, BOARD));
  if (!b) throw new Error(`no board '${BOARD}'`);
  const run = <T>(fn: (tx: any) => Promise<T>) => withBoard(b.id, fn);

  // Resolve names first so the confirmation banner says what is actually moving.
  const ids = pairs.flatMap((p) => [p.loser, p.winner]);
  const named = await run((tx) =>
    tx.execute(
      sql`select st.id, st.name, t.name as topic from sub_topic st
          join topic t on t.id = st.topic_id
          where st.id in (${sql.join(ids.map((i) => sql`${i}::uuid`), sql`, `)})`,
    ),
  );
  const nameOf = new Map((named as any[]).map((r: any) => [r.id, `${r.topic} › ${r.name}`]));
  for (const p of pairs) {
    for (const id of [p.loser, p.winner]) {
      if (!nameOf.has(id)) throw new Error(`sub_topic ${id} does not exist on this database`);
    }
  }

  await assertTarget({
    argv,
    what: `merge ${pairs.length} duplicate sub-topics — evidence moves to the survivor, the duplicate row is deleted`,
    affects: pairs.map((p) => `${nameOf.get(p.loser)}  →  ${nameOf.get(p.winner)}`),
  });

  // M94: ask the DATABASE which columns reference sub_topic. Never a hand list.
  const fks = (await run((tx) => tx.execute(sql`
    SELECT c.conrelid::regclass::text AS tbl, a.attname AS col
    FROM pg_constraint c
    JOIN unnest(c.conkey) WITH ORDINALITY k(attnum, ord) ON true
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.attnum
    WHERE c.contype = 'f' AND c.confrelid = 'sub_topic'::regclass
    ORDER BY 1, 2`))) as unknown as Array<{ tbl: string; col: string }>;
  console.log(`\nreferencing columns (from pg_constraint): ${fks.length}`);

  let moved = 0;
  let dropped = 0;
  for (const p of pairs) {
    console.log(`\n▸ ${nameOf.get(p.loser)}\n   → ${nameOf.get(p.winner)}`);
    for (const { tbl, col } of fks) {
      const ident = sql.raw(`"${tbl}"."${col}"`);
      const table = sql.raw(`"${tbl}"`);
      const column = sql.raw(`"${col}"`);
      const nRows = (await run((tx) =>
        tx.execute(sql`select count(*)::int as n from ${table} where ${column} = ${p.loser}::uuid`),
      )) as unknown as Array<{ n: number }>;
      const n = Number(nRows[0]?.n ?? 0);
      if (!n) continue;

      if (PER_STUDENT_UNIQUE.has(tbl)) {
        // Would any row collide with one the survivor already has for that student?
        const clashRows = (await run((tx) =>
          tx.execute(sql`select count(*)::int as c from ${table} l
              where l.${column} = ${p.loser}::uuid
                and exists (select 1 from ${table} w
                            where w.${column} = ${p.winner}::uuid and w.student_id = l.student_id)`),
        )) as unknown as Array<{ c: number }>;
        const clash = Number(clashRows[0]?.c ?? 0);
        if (clash) {
          // The survivor already holds a row for that student. The loser's row
          // is the imported one; the survivor's is live. Live wins (KEEP_LIVE).
          console.log(`   ${tbl}.${col}: ${n} rows — ${clash} COLLIDE, dropping the imported copy`);
          if (EXECUTE) {
            await run((tx) => tx.execute(
              sql`delete from ${table} l where l.${column} = ${p.loser}::uuid
                  and exists (select 1 from ${table} w
                              where w.${column} = ${p.winner}::uuid and w.student_id = l.student_id)`),
            );
          }
          dropped += clash;
        }
      }
      const remaining = n;
      console.log(`   ${tbl}.${col}: re-pointing ${remaining} row(s)`);
      if (EXECUTE) {
        await run((tx) => tx.execute(
          sql`update ${table} set ${column} = ${p.winner}::uuid where ${column} = ${p.loser}::uuid`,
        ));
      }
      moved += remaining;
      void ident;
    }
    if (EXECUTE) {
      await run((tx) => tx.execute(sql`delete from sub_topic where id = ${p.loser}::uuid`));
    }
  }

  // Topics left with no sub-topics at all are the shell of a merged-away lineage.
  const empties = (await run((tx) => tx.execute(sql`
    select t.id, t.name from topic t
    where not exists (select 1 from sub_topic st where st.topic_id = t.id)
      and t.chapter_id in (select chapter_id from topic where id in (
        ${sql.join(pairs.map((p) => sql`(select topic_id from sub_topic where id = ${p.winner}::uuid)`), sql`, `)}
      ))`))) as unknown as Array<{ id: string; name: string }>;
  if (empties.length) {
    console.log(`\nempty topics left behind in the affected chapters: ${empties.length}`);
    for (const e of empties) console.log(`   − ${e.name}`);
    if (EXECUTE) {
      await run((tx) => tx.execute(
        sql`delete from topic where id in (${sql.join(empties.map((e) => sql`${e.id}::uuid`), sql`, `)})`,
      ));
    }
  }

  console.log(
    `\n${"─".repeat(60)}\n  ${pairs.length} pairs · ${moved} rows re-pointed · ${dropped} colliding imported rows dropped\n${"─".repeat(60)}`,
  );
  if (!EXECUTE) console.log(`\n  DRY RUN — nothing written. Re-run with --execute.\n`);
}

main()
  .then(() => queryClient.end())
  .catch(async (e) => {
    console.error(e instanceof Error ? e.message : e);
    await queryClient.end();
    process.exit(1);
  });
