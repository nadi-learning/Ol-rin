/**
 * prod_scan_roster — READ-ONLY. Reports the current post-cutover state of every
 * roster email so we know the delta before running backfill_restore.ts.
 *
 * Context: the S138 window preserved only {founder→admin, Kian→student,
 * Pranav→tutor} and DROPPED the other 8 app_users. The founder then began
 * restoring the remaining real students (session dropped mid-restore). This scan
 * tells us who is already back and in what state, so the restore only completes
 * whoever's left. Pure SELECTs — writes NOTHING.
 *
 * Source of truth for the intended target is the pre-cutover dump
 * (prod-backups/prod_pre_id5_2026-07-21.dump), inspected 2026-07-21:
 *   REAL onboarding data present → shyam (cambridge/10/jon_snow/direwolf/he),
 *                                  varnika (cambridge/11/mulan/owl/she)
 *   answers already deleted → sharanya, avani, purwa  (default harry_potter/owl)
 *   already preserved → founder(admin), kian(student), pranav(tutor)
 *   tutor to re-grant → ambhakat1999 (cbse)
 *   junk (stay dropped) → spranav.iitkg (dupe), shagunb11gmail.com@gmail.com
 *
 * 🔴 OWNER conn (bypasses RLS — student.board_id is RLS-forced; a scoped role
 * would see only its own board). Run from LOCAL against prod RDS:
 *   MIGRATE_DATABASE_URL='postgresql://nadi:<master-pw>@<rds-host>:5432/<db>' \
 *     bun scripts/prod_scan_roster.ts
 */
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "../src/config/env";

const ROSTER = [
  "xxxx51263@gmail.com", // founder → admin (preserved)
  "kianjibo500@gmail.com", // student (preserved)
  "spranav.iitkgp@gmail.com", // tutor (preserved)
  "shyam.anand3128@gmail.com", // student — restore (real data)
  "varnika.karamcheti@gmail.com", // student — restore (real data)
  "sharanyasd2010@gmail.com", // student — restore (default HP/owl)
  "avanikishore29@gmail.com", // student — restore (default HP/owl)
  "purwaravani@gmail.com", // student — restore (default HP/owl)
  "ambhakat1999@gmail.com", // tutor — re-grant
  "spranav.iitkg@gmail.com", // JUNK — should be absent
  "shagunb11gmail.com@gmail.com", // JUNK — should be absent
];

const ownerUrl = env.MIGRATE_DATABASE_URL ?? env.DATABASE_URL;
const client = postgres(ownerUrl, { max: 1, prepare: false, onnotice: () => {} });
const db = drizzle(client);

async function rows<T = Record<string, unknown>>(q: ReturnType<typeof sql>): Promise<T[]> {
  return (await db.execute(q)) as unknown as T[];
}
async function one<T = Record<string, unknown>>(q: ReturnType<typeof sql>): Promise<T | null> {
  return (await rows<T>(q))[0] ?? null;
}

async function main() {
  console.log(`[scan] owner conn: ${ownerUrl.replace(/:[^:@]+@/, ":***@")}`);
  console.log(`[scan] READ-ONLY — writes nothing.\n`);

  // ---- PREFLIGHT: where do the b2c tables actually live? ------------------
  const where = await one<{ db: string; schema: string; sp: string }>(
    sql`SELECT current_database() AS db, current_schema() AS schema, current_setting('search_path') AS sp`,
  );
  console.log(`── PREFLIGHT ──`);
  console.log(`  database=${where?.db}  current_schema=${where?.schema}  search_path=${where?.sp}`);
  const loc = await rows<{ table_schema: string }>(sql`SELECT table_schema FROM information_schema.tables WHERE table_name = 'app_user'`);
  if (loc.length === 0) {
    console.log(`  ❌ 'app_user' is NOT in database '${where?.db}'.`);
    const dbs = await rows<{ datname: string }>(sql`SELECT datname FROM pg_database WHERE datistemplate = false ORDER BY datname`);
    const schemas = await rows<{ nspname: string }>(sql`SELECT nspname FROM pg_namespace WHERE nspname NOT LIKE 'pg_%' AND nspname <> 'information_schema' ORDER BY nspname`);
    console.log(`  databases on this instance: ${dbs.map((d) => d.datname).join(", ")}`);
    console.log(`  schemas in this database:   ${schemas.map((s) => s.nspname).join(", ")}`);
    console.log(`\n  → Point MIGRATE_DATABASE_URL at the database/schema that actually holds b2c's app_user, then re-run.`);
    await client.end();
    process.exit(2);
  }
  const schema = loc[0]!.table_schema;
  if (schema !== "public") {
    console.log(`  ↳ 'app_user' found in schema '${schema}' (not public) — setting search_path and continuing.`);
    await db.execute(sql.raw(`SET search_path TO "${schema}", public`));
  } else {
    console.log(`  ✓ 'app_user' in public.`);
  }
  console.log(``);

  for (const email of ROSTER) {
    const au = (await rows<{ id: string; user_type: string; phone: string | null }>(
      sql`SELECT id, user_type, phone FROM app_user WHERE lower(email) = lower(${email})`,
    ));
    if (au.length === 0) {
      console.log(`❌ ${email.padEnd(30)} — NO app_user (dropped / never restored)`);
      continue;
    }
    for (const u of au) {
      const s = (await rows<{ board: string | null; class: string | null; pronoun: string | null; tutor: string | null; hero: string | null; pet: string | null; status: string | null }>(
        sql`SELECT b.slug AS board, s.class, s.pronoun, s.tutor_id AS tutor,
                   h.hero_type AS hero, p.pet_type AS pet, s.status
            FROM student s
            LEFT JOIN board b ON b.id = s.board_id
            LEFT JOIN hero h ON h.hero_id = s.hero_id
            LEFT JOIN pet  p ON p.pet_id  = s.pet_id
            WHERE s.user_id = ${u.id}`,
      ))[0];
      const onb = (await rows<{ status: string; state: string }>(sql`SELECT status, state FROM onboarding WHERE user_id = ${u.id}`))[0];
      const tut = (await rows<{ boards: unknown }>(sql`SELECT boards FROM tutor WHERE user_id = ${u.id}`))[0];
      const detail = u.user_type === "student"
        ? (s ? `student[${s.board}/${s.class}/${s.hero}/${s.pet}/${s.pronoun ?? "∅"} tutor=${s.tutor ?? "∅"} onb=${onb ? `${onb.status}/${onb.state}` : "MISSING"}]` : `⚠️ NO student row (onb=${onb ? `${onb.status}/${onb.state}` : "none"})`)
        : u.user_type === "tutor"
          ? `tutor[boards=${JSON.stringify(tut?.boards ?? null)}]`
          : `${u.user_type}`;
      console.log(`✅ ${email.padEnd(30)} ${u.user_type.padEnd(8)} ${detail}`);
    }
  }
  console.log(`\n[scan] done. Paste this back — I'll diff it against the target and write the restore for whoever's missing.`);
  await client.end();
}

main().catch(async (err) => {
  console.error("[scan] FAILED:", err);
  await client.end();
  process.exit(1);
});
