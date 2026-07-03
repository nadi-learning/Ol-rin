/**
 * Better Auth server — b2c-owned identity (PF3 revised 2026-06-29: NOT shared
 * with Starkhorn). Google OAuth only (creds copied from current b2c prod).
 *
 * The auth tables (users/sessions/accounts/verifications) are vanilla Better
 * Auth, GLOBAL (not RLS-scoped). They link to the spine by EMAIL: see
 * services/membership.ts (resolve app_user by users.email on login).
 *
 * generateId:false → Postgres generates the uuid PK (BA's CUID-like string is
 * rejected by a uuid column). usePlural:true → schema-map keys are plural.
 */
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import * as schema from "@b2c/kernel/schema";
import { db } from "../db/client";
import { env } from "../config/env";

export const auth = betterAuth({
  logger: { level: env.NODE_ENV === "production" ? "warn" : "debug" },
  database: drizzleAdapter(db, {
    provider: "pg",
    usePlural: true,
    schema: {
      users: schema.users,
      sessions: schema.sessions,
      accounts: schema.accounts,
      verifications: schema.verifications,
    },
  }),
  baseURL: env.BETTER_AUTH_URL,
  secret: env.BETTER_AUTH_SECRET,
  // Google is the only production provider. Email/password is enabled in
  // DEV ONLY — a local auth bypass mirroring the Python app's
  // SKIP_AUTH_FOR_TESTING, so login → me can be smoked locally without a real
  // Google round-trip (localhost is not whitelisted in the prod Google client).
  emailAndPassword: {
    enabled: env.NODE_ENV !== "production",
    autoSignIn: true,
  },
  socialProviders: {
    google: {
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
    },
  },
  trustedOrigins: [env.FRONTEND_URL],
  session: {
    expiresIn: 60 * 60 * 24 * 30,
    updateAge: 60 * 60 * 24,
    cookieCache: { enabled: true, maxAge: 60 * 5 },
  },
  advanced: {
    defaultCookieAttributes: {
      sameSite: "lax",
      secure: env.NODE_ENV === "production",
    },
    database: { generateId: false },
  },
});

export type Auth = typeof auth;
