import { defineConfig } from "drizzle-kit";

// Schema source of truth is the shared kernel package (the spine). drizzle-kit
// reads it to emit table DDL; RLS policies are applied separately by
// src/db/migrate.ts (drizzle-kit 0.28 does not emit RLS). Generate/migrate run
// as the OWNER role (MIGRATE_DATABASE_URL) — the app connects as a
// non-superuser role so RLS actually binds. See src/db/rls.sql.
export default defineConfig({
  schema: "./packages/kernel/src/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  casing: "snake_case",
  dbCredentials: {
    url:
      process.env.MIGRATE_DATABASE_URL ??
      "postgresql://b2c:b2c@localhost:5435/b2c",
  },
  strict: true,
  verbose: true,
});
