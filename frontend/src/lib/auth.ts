import { createAuthClient } from "better-auth/react";

// Better Auth lives on the BE origin (:3010); cookies are host-scoped so they
// flow to the FE (:5174) too. Cross-origin calls are covered by BE CORS
// (origin = FRONTEND_URL, credentials: true).
const API_BASE = import.meta.env.VITE_API_BASE ?? "http://localhost:3010";

export const authClient = createAuthClient({ baseURL: API_BASE });
export const { useSession, signIn, signUp, signOut } = authClient;

/**
 * Dev-only login bypass (mirrors the Python app's SKIP_AUTH_FOR_TESTING). Email
 * + a fixed dev password — no Google. Sign up on first use, sign in after.
 * Backed by Better Auth's email/password, which is enabled on the BE only when
 * NODE_ENV !== production. Whether `me` then succeeds still depends on the
 * email being whitelisted for the board.
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
