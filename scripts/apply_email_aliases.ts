/**
 * apply_email_aliases — re-point ALREADY-LOADED student profiles at the address
 * the child actually signs in with (S169, founder call).
 *
 * `backfill_aliases.ts` makes the WRITER target the right address from now on.
 * This script fixes the rows a PREVIOUS run already wrote under the hand-off
 * address — locally, Avani Purwar was loaded as `priyapurwar12@gmail.com` before
 * we knew she practises on prod as `purwaravani@gmail.com`.
 *
 * A rename, deliberately, NOT a delete-and-reload: the profile id is what the
 * five months of imported mastery, the snapshots and the parent link all hang
 * off. Renaming keeps every one of them attached; reloading would strand them.
 *
 *   bun run alias:apply              # dry run — prints what it would change
 *   bun run alias:apply -- --execute # applies
 *
 * ── refusals ────────────────────────────────────────────────────────────────
 * If the TARGET address already exists for the same user_type, this stops and
 * changes nothing. That is not a rename any more, it is a MERGE: two profiles
 * both carrying evidence, and picking a survivor is a judgement call about real
 * children's data, not something a script should decide. Identity here is
 * `email × phone × user_type`, so the rename would also violate that uniqueness.
 */
import { and, eq } from "drizzle-orm";
import { appUser } from "@b2c/kernel/schema";
import { db, queryClient } from "../src/db/client";
import { EMAIL_ALIASES } from "./backfill_aliases";

const EXECUTE = process.argv.slice(2).includes("--execute");

async function main() {
  console.log(`apply_email_aliases ${EXECUTE ? "(EXECUTE)" : "(dry run)"}\n`);
  let changed = 0;
  let blocked = 0;

  for (const [from, to] of Object.entries(EMAIL_ALIASES)) {
    // app_user is GLOBAL (non-RLS), so no board claim is needed here.
    const [stale] = await db
      .select({ id: appUser.id, name: appUser.name })
      .from(appUser)
      .where(and(eq(appUser.email, from), eq(appUser.userType, "student")));

    if (!stale) {
      console.log(`· ${from} — no student profile under this address, nothing to do`);
      continue;
    }

    const [collision] = await db
      .select({ id: appUser.id })
      .from(appUser)
      .where(and(eq(appUser.email, to), eq(appUser.userType, "student")));

    if (collision) {
      blocked++;
      console.log(
        `✗ ${from} → ${to}\n` +
          `    BOTH profiles exist (${stale.id} and ${collision.id}). That is a MERGE,\n` +
          `    not a rename — two sets of evidence, and which one survives is a call\n` +
          `    about a real child's data. Nothing changed. Resolve by hand.`,
      );
      continue;
    }

    console.log(`✔ ${stale.name ?? "?"}: ${from} → ${to}  (profile ${stale.id})`);
    if (EXECUTE) {
      await db.update(appUser).set({ email: to }).where(eq(appUser.id, stale.id));
    }
    changed++;
  }

  console.log(
    `\n${changed} profile(s) ${EXECUTE ? "renamed" : "would be renamed"}` +
      (blocked ? `, ${blocked} BLOCKED (see above)` : ""),
  );
  if (!EXECUTE && changed) console.log("DRY RUN — nothing written. Re-run with --execute.");
  await queryClient.end();
  process.exit(blocked > 0 ? 1 : 0);
}

main().catch(async (err) => {
  console.error("apply_email_aliases FAILED:", err);
  await queryClient.end();
  process.exit(1);
});
