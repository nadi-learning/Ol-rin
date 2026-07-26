/**
 * prod_guard — the one place a seeding script is allowed to target production.
 *
 * ── Why this exists (S170) ───────────────────────────────────────────────────
 * `backfill_dashboard`, `topup_spine_cbse` and `merge_spine_duplicates` each
 * carried their own `assertLocal()`: refuse unless DATABASE_URL points at
 * localhost. That guard was not paranoia — the pre-S169 backfill would have
 * deleted a real student's live attempts and her tutor's certified mastery, and
 * it was only ever exercised against a database where the hand-off load was the
 * only thing present.
 *
 * But prod is an RDS host, so "localhost only" means these scripts can never do
 * the job they were written for. The answer is not to delete the guard; it is to
 * make targeting prod a thing you can only do ON PURPOSE, out loud, once.
 *
 * ── The contract ─────────────────────────────────────────────────────────────
 *   · no `--target-prod`  → localhost or refuse. Unchanged behaviour.
 *   · `--target-prod` on a LOCALHOST url → refuse. Passing it by habit and then
 *     wondering which database you hit is the failure this prevents.
 *   · `--target-prod` without `--execute` → allowed, no prompt. A dry run reads.
 *   · `--target-prod --execute` → print the resolved host, database and exactly
 *     what is about to be touched, then require the operator to RETYPE the host.
 *     Typing is the point: a y/n is muscle memory, a hostname is a decision.
 *
 * Callers add their own extra refusals (the backfill forbids `--replace` here).
 * Nothing in this module writes; it only decides whether the caller may.
 */
import { createInterface } from "node:readline/promises";

/** Host + database of the current DATABASE_URL, with the password stripped. */
export function describeTarget(): { host: string; database: string; isLocal: boolean } {
  const url = process.env.DATABASE_URL ?? "";
  let host = "<unparseable>";
  let database = "<unparseable>";
  try {
    const u = new URL(url);
    host = u.hostname;
    database = u.pathname.replace(/^\//, "");
  } catch {
    /* fall through — an unparseable url is never local */
  }
  return { host, database, isLocal: /^(localhost|127\.0\.0\.1)$/.test(host) };
}

export type TargetOpts = {
  argv: string[];
  /** What this script does, in one line. Shown in the confirmation banner. */
  what: string;
  /** The specific rows about to be touched — students, subjects, chapters. */
  affects: string[];
};

/**
 * Decide whether this run may proceed against the configured database.
 * Resolves when it may; calls `process.exit(1)` when it may not.
 */
export async function assertTarget(opts: TargetOpts): Promise<{ targetProd: boolean }> {
  const { argv, what, affects } = opts;
  const targetProd = argv.includes("--target-prod");
  const execute = argv.includes("--execute");
  const { host, database, isLocal } = describeTarget();

  if (!targetProd) {
    if (!isLocal) {
      console.error(
        `REFUSING: DATABASE_URL points at ${host}, not localhost.\n` +
          `  ${what}\n` +
          `  If you really mean production, pass --target-prod and read what it prints.`,
      );
      process.exit(1);
    }
    return { targetProd: false };
  }

  if (isLocal) {
    // Refusing this is not pedantry: a --target-prod that silently ran against
    // localhost would teach the operator the flag is harmless.
    console.error(
      `REFUSING: --target-prod was passed but DATABASE_URL is ${host} (local).\n` +
        `  Point DATABASE_URL at prod, or drop the flag.`,
    );
    process.exit(1);
  }

  console.log(
    `\n${"═".repeat(70)}\n` +
      `  ⚠️  TARGETING PRODUCTION\n` +
      `${"═".repeat(70)}\n` +
      `  host      ${host}\n` +
      `  database  ${database}\n` +
      `  action    ${what}\n` +
      `  affects   ${affects.length ? affects.join("\n            ") : "(nothing declared)"}\n` +
      `  mode      ${execute ? "EXECUTE — this WILL write" : "dry run — nothing will be written"}\n` +
      `${"═".repeat(70)}\n`,
  );

  if (!execute) return { targetProd: true };

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const typed = (await rl.question(`  Retype the host to proceed (${host}): `)).trim();
  rl.close();
  if (typed !== host) {
    console.error(`\n  ABORTED — got "${typed}", expected "${host}". Nothing was written.\n`);
    process.exit(1);
  }
  console.log("  confirmed.\n");
  return { targetProd: true };
}
