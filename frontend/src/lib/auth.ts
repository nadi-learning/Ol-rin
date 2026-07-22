import { createAuthClient } from "better-auth/react";

// Where the Better Auth server lives, resolved at BUILD time.
//
// 🔴 In PROD the FE and BE are the SAME ORIGIN (nginx proxies /api/auth to the BE
// on :3010), so the auth client MUST target the served origin. It used to hard-
// fall-back to "http://localhost:3010" whenever VITE_API_BASE was unset — which
// silently shipped a prod bundle whose `signIn.social` called the USER'S OWN
// localhost:3010 (Google sign-in dead) any time the FE was built without the env
// var set. That is exactly what a box `vite build` without VITE_API_BASE did.
// Defaulting to `window.location.origin` in prod removes that footgun: a prod
// build is correct with no env var, and the localhost fallback is DEV-only. In
// dev the FE (:5174) calls the BE (:3010) cross-origin (BE CORS covers it).
// `import.meta.env.PROD` is a compile-time literal, so the dead branch (and the
// localhost string) is eliminated from the production bundle.
// PROD is the primary switch (a compile-time literal), so the whole dev branch —
// including the "http://localhost:3010" string — is dead-code-eliminated from the
// production bundle: no stray localhost literal to mislead a bundle grep, and no
// way for a prod build to ship it as a live base.
const API_BASE = import.meta.env.PROD
  ? import.meta.env.VITE_API_BASE ?? window.location.origin
  : import.meta.env.VITE_API_BASE ?? "http://localhost:3010";

export const authClient = createAuthClient({ baseURL: API_BASE });
export const { useSession, signIn, signUp, signOut } = authClient;

/**
 * Dev-only login bypass (mirrors the Python app's SKIP_AUTH_FOR_TESTING). Email
 * + a fixed dev password — no Google. Sign up on first use, sign in after.
 * Backed by Better Auth's email/password, which is enabled on the BE only when
 * NODE_ENV !== production. `me` then succeeds for anyone who signs in — there is
 * no invite gate (Slice C / S110); resolveMembership creates the membership at
 * 'student' on first login.
 */
const DEV_PASSWORD = "dev-password-123";
export async function devLogin(email: string) {
  const name = email.split("@")[0] ?? email;
  const res = await signUp.email({ email, password: DEV_PASSWORD, name });
  if (res.error) {
    // Already registered (or sign-up disabled) → fall back to sign in.
    await signIn.email({ email, password: DEV_PASSWORD });
  }
}
