/**
 * seed_boards — make sure every board the picker OFFERS actually EXISTS.
 *
 * 🔑 Slice M (founder). The board picker used to be derived: `listBoards`
 * returned every board row that had ≥1 published chapter, which on every real
 * database is exactly `cbse` and `cambridge`. The founder's call is that the
 * picker shows a fixed three — CBSE, IGCSE, Cambridge — whether or not content
 * exists behind them yet.
 *
 * 🔴 WHY THIS SCRIPT IS NOT OPTIONAL. A hardcoded chip is a promise the
 * DATABASE has to keep. `chooseBoard` resolves the picked slug against the
 * `board` table and throws `BoardNotFound` ("no board with slug igcse") when it
 * misses, and `membership.board_id` is a real foreign key. So shipping the
 * third chip without this row does not give the student an empty product — it
 * gives them a crash on the first tap, at the exact moment they are handing us
 * their first answer. The chip and the row travel together, always.
 *
 * ⚠️ `igcse` deliberately has NO subjects, NO chapters and NO published slides.
 * That is the point: it is the first board that exists purely so the student
 * can get IN and be told, honestly, that we are still setting it up. Do not
 * "fix" it by seeding placeholder content.
 *
 * ⚠️ IGCSE IS ALSO A GRADE. `subject.grade` holds the literal string 'IGCSE'
 * under the cambridge board, and that is a DIFFERENT thing from this board row
 * — same word, two axes. Nothing joins them and nothing should; if that ever
 * stops being true, this comment is where the confusion will start.
 *
 * Idempotent: upsert on the unique `slug`, so re-running is the edit path and
 * running it against a database that already has cbse/cambridge is a no-op on
 * those two.
 *
 * Usage: bun run seed:boards
 */
import { board } from "@b2c/kernel/schema";
import { db, queryClient } from "../src/db/client";

// The boards the picker offers, in the order the picker shows them. This list
// is the sibling of SUPPORTED_BOARDS in `src/services/session_boards.ts` — one
// concept, and if they ever disagree the picker offers a chip that cannot save.
const BOARDS: Array<{ slug: string; name: string }> = [
  { slug: "cbse", name: "CBSE" },
  { slug: "igcse", name: "IGCSE" },
  { slug: "cambridge", name: "Cambridge" },
];

async function main() {
  for (const b of BOARDS) {
    // `board` is the tenant table itself, so it is NOT RLS-scoped and needs no
    // withBoard wrapper — there is no board to be inside of while creating one.
    await db
      .insert(board)
      .values({ slug: b.slug, name: b.name })
      // Name only. NEVER touch `config`, and never delete-and-recreate: the id
      // is what every membership, subject and content_unit points at, so a new
      // uuid for an existing slug would orphan an entire board's data.
      .onConflictDoUpdate({ target: board.slug, set: { name: b.name } });
    console.log(`[seed:boards] ok  ${b.slug} (${b.name})`);
  }

  const rows = await db.select({ slug: board.slug, name: board.name }).from(board);
  const have = new Set(rows.map((r) => r.slug));
  const missing = BOARDS.filter((b) => !have.has(b.slug));
  if (missing.length > 0) {
    throw new Error(`[seed:boards] FAILED to create: ${missing.map((m) => m.slug).join(", ")}`);
  }
  console.log(`[seed:boards] done — ${BOARDS.length} offered, ${rows.length} rows total`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => queryClient.end());
