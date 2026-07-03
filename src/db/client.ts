import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@b2c/kernel/schema";
import { env } from "../config/env";

// The app connects as the NON-superuser role in DATABASE_URL so Postgres RLS
// actually filters rows. Migrations use the owner role (see migrate.ts).
const queryClient = postgres(env.DATABASE_URL, {
  max: 10,
  idle_timeout: 20,
  prepare: false,
});

export const db = drizzle(queryClient, { schema, casing: "snake_case" });
export type DB = typeof db;
export { queryClient };
