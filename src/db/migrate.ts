/**
 * Migration runner. Runs as the OWNER role (MIGRATE_DATABASE_URL) so it can
 * create the app role, run DDL, and own the RLS policies.
 *
 * Steps:
 *   1. Ensure the non-superuser app role exists (so RLS binds for the app).
 *   2. Apply drizzle-generated table migrations (drizzle/).
 *   3. Apply RLS: ENABLE + FORCE + board-claim policy on every tenant-scoped
 *      table, derived from kernel's TENANT_SCOPED_TABLES (one source of truth).
 *   4. GRANT DML on all tables to the app role.
 *
 * RLS application is idempotent (DROP POLICY IF EXISTS; ENABLE is a no-op when
 * already on), so this is safe to re-run.
 */
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { sql } from "drizzle-orm";
import postgres from "postgres";
import { ALL_TABLES, TENANT_SCOPED_TABLES } from "@b2c/kernel/schema";
import { env } from "../config/env";

const APP_ROLE = "b2c_app";
const APP_PASSWORD = "b2c";

const ownerUrl = env.MIGRATE_DATABASE_URL ?? env.DATABASE_URL;
const client = postgres(ownerUrl, { max: 1, prepare: false, onnotice: () => {} });
const db = drizzle(client);

async function ensureAppRole() {
  await client.unsafe(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '${APP_ROLE}') THEN
        CREATE ROLE ${APP_ROLE} LOGIN PASSWORD '${APP_PASSWORD}' NOSUPERUSER;
      END IF;
    END
    $$;
  `);
  console.log(`[migrate] app role ${APP_ROLE} ensured (non-superuser)`);
}

async function applyRls() {
  for (const table of TENANT_SCOPED_TABLES) {
    await client.unsafe(`
      ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY;
      ALTER TABLE ${table} FORCE ROW LEVEL SECURITY;
      DROP POLICY IF EXISTS board_isolation ON ${table};
      CREATE POLICY board_isolation ON ${table}
        USING (board_id = NULLIF(current_setting('app.board', true), '')::uuid)
        WITH CHECK (board_id = NULLIF(current_setting('app.board', true), '')::uuid);
    `);
  }
  console.log(
    `[migrate] RLS enabled + forced on ${TENANT_SCOPED_TABLES.length} tenant-scoped tables`,
  );
}

async function grantAppRole() {
  // board / app_user / content_version are not RLS-scoped but the app still
  // reads/writes them, so grant DML on every table + (any) sequences.
  const grants = ALL_TABLES.map(
    (t) =>
      `GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE ${t} TO ${APP_ROLE};`,
  ).join("\n");
  await client.unsafe(`
    GRANT USAGE ON SCHEMA public TO ${APP_ROLE};
    ${grants}
    GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ${APP_ROLE};
  `);
  console.log(`[migrate] granted DML on ${ALL_TABLES.length} tables to ${APP_ROLE}`);
}

async function main() {
  console.log(`[migrate] connecting as owner: ${ownerUrl.replace(/:[^:@]+@/, ":***@")}`);
  await ensureAppRole();
  await migrate(db, { migrationsFolder: "./drizzle" });
  console.log("[migrate] drizzle table migrations applied");
  await applyRls();
  await grantAppRole();
  await client.end();
  console.log("[migrate] done");
}

main().catch(async (err) => {
  console.error("[migrate] FAILED:", err);
  await client.end();
  process.exit(1);
});
