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
  // S122 — THIS IS THE RESCUE, and it is the reason the dev-login closure is
  // one change rather than three.
  //
  // Until now there was deliberately no accountLinking config: Better Auth's
  // default trustedProviders is [] and the Google callback never passes
  // isTrustedProvider, so Google could NOT link onto a pre-existing user row.
  // The old note excused that with "no such account is meant to survive".
  // Prod's data said otherwise. Measured 2026-07-20, as b2c_app, before the
  // flip: 12 users — 1 google (the founder) and 11 credential, of which TEN are
  // @example.com probe rows and ONE is spranav.iitkgp@gmail.com, a real student
  // holding the only completed onboarding on prod. Turning email/password off
  // without this block strands that student with no way back in.
  //
  // trustedProviders alone is NOT sufficient: requireLocalEmailVerified
  // defaults true and is checked independently, so the rescued row also needs
  // users.email_verified = true. Both halves ship together or neither works.
  account: {
    accountLinking: {
      enabled: true,
      trustedProviders: ["google"],
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
