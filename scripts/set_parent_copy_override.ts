/**
 * set_parent_copy_override — apply STUDENT-SCOPED parent-dashboard copy
 * overrides from a file (D-PDASH-8, migration 0045).
 *
 * ── Why a file and not constants (S170's rule, and it is a hard one) ─────────
 * Copy resolves `code default → board override → student override`. The
 * TAXONOMY (what a skill is called, what it generally means) belongs in
 * `packages/kernel/src/parent-copy.ts`, which is a shared, git-tracked package.
 * A sentence about a PARTICULAR CHILD does not: it goes in the database, read
 * from an out-of-repo file. That rule is why `parent-copy.ts` carries zero real
 * children's text today, and this script exists so it stays that way.
 *
 * ⚠️ Two guards inherited from D-PDASH-3, both enforced by `setParentCopy`:
 *   · an EMPTY value DELETES the override — a blank render is forbidden;
 *   · an override may not introduce a `{token}` the default lacks. Call sites
 *     supply a fixed token set, and `fillCopy` THROWS on an unsupplied token —
 *     mid-render, which blanks the whole dashboard rather than one line.
 *
 * File shape:
 *   { "email": "…", "entries": { "olorin.cover": "…", … } }
 *
 *   bun scripts/set_parent_copy_override.ts --file <overrides.json> [--target-prod] [--execute]
 *
 * Dry-run by default.
 */
import { eq, and, sql } from "drizzle-orm";
import { appUser, board, student } from "@b2c/kernel/schema";
import { db, queryClient } from "../src/db/client";
import { withBoard } from "../src/db/with-board";
import { setParentCopy } from "../src/services/parent_copy";
import { assertTarget } from "./prod_guard";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";

const argv = process.argv.slice(2);
const EXECUTE = argv.includes("--execute");
const fileArg = argv[argv.indexOf("--file") + 1];
const FILE = (argv.includes("--file") && fileArg ? fileArg : "").replace(/^~/, homedir());
const BOARD_SLUG = "cbse";

type Overrides = { email: string; entries: Record<string, string> };

async function main() {
  if (!FILE) {
    console.error("REFUSING: --file <overrides.json> is required.");
    process.exit(1);
  }
  const spec = JSON.parse(readFileSync(FILE, "utf8")) as Overrides;
  const keys = Object.keys(spec.entries ?? {});
  if (!keys.length) {
    console.error("REFUSING: no entries in the file.");
    process.exit(1);
  }

  await assertTarget({
    argv,
    what: "write STUDENT-SCOPED parent-dashboard copy overrides (text a parent reads)",
    affects: [`${spec.email} — ${keys.length} key(s): ${keys.join(", ")}`],
  });

  const [b] = await db.select().from(board).where(eq(board.slug, BOARD_SLUG));
  if (!b) throw new Error(`board '${BOARD_SLUG}' not found`);

  // Identity is email x phone x user_type — an unfiltered email lookup finds a
  // parent- or tutor-typed row of the same address and silently targets the
  // wrong profile (the S158 gotcha).
  const [who] = await db
    .select({ id: appUser.id, name: appUser.name })
    .from(appUser)
    .where(and(eq(appUser.email, spec.email), eq(appUser.userType, "student")));
  if (!who) {
    console.error(`✗ no STUDENT profile for ${spec.email}`);
    process.exit(1);
  }

  const [onBoard] = await withBoard(b.id, (tx) =>
    tx.select({ id: student.userId }).from(student).where(eq(student.userId, who.id)),
  );
  if (!onBoard) {
    console.error(`✗ ${spec.email} is not a student on board '${BOARD_SLUG}'`);
    process.exit(1);
  }

  const [actor] = await db.execute(sql`
    select id, email from app_user where user_type = 'admin' order by created_at limit 1`);
  if (!actor) {
    console.error("✗ no admin profile to attribute the override to — refusing.");
    process.exit(1);
  }

  console.log(`student: ${who.name ?? spec.email} <${spec.email}>\n`);

  for (const [key, value] of Object.entries(spec.entries)) {
    const preview = value.length > 90 ? `${value.slice(0, 90)}…` : value;
    if (!EXECUTE) {
      console.log(`  would set ${key}\n      "${preview}"`);
      continue;
    }
    await withBoard(b.id, (tx) =>
      setParentCopy(tx, {
        boardId: b.id,
        studentId: who.id,
        key,
        value,
        actorId: actor.id as string,
      }),
    );
    console.log(`  set ${key}\n      "${preview}"`);
  }

  console.log(`\n${EXECUTE ? "written" : "would write"}: ${keys.length} override(s)`);
  if (!EXECUTE) console.log("DRY RUN — nothing written. Re-run with --execute to apply.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => queryClient.end());
