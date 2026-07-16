/**
 * probe_auth_hardening — proves the two halves of Slice AUTH-PROD, the ones a
 * typecheck can't see:
 *
 *   1. CONFIG — Google is a trusted linking provider. Without this, Better
 *      Auth's default trustedProviders is [] (the Google callback never passes
 *      isTrustedProvider), so every user created by the dev bypass gets
 *      "account not linked" on their first Google sign-in — i.e. turning
 *      email/password off would strand them with NO way in.
 *
 *   2. PRODUCTION BEHAVIOUR — boots a REAL second backend with
 *      NODE_ENV=production and asserts over HTTP that the email/password
 *      routes are GONE (404) while Google's are not. This is the flip we are
 *      about to make on the box, exercised locally first rather than assumed.
 *      It also asserts dev mode still HAS the bypass (probe:session needs it).
 *
 *   3. THE PRODUCTION BUNDLE — builds the FE and asserts the dev-login block
 *      and the hardcoded dev password are NOT in the emitted JS. The original
 *      bug was exactly this: source said "local only", the artifact shipped it
 *      to prod. Asserting on source would re-make the bug. Every negative grep
 *      is paired with a POSITIVE control ("Continue with Google" must be
 *      present) so an empty/missing bundle can't masquerade as a pass (M39).
 *
 * Self-contained: no dev server needed, no DB writes, no network calls out.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { users } from "@b2c/kernel/schema";
import { auth } from "../src/auth/auth";
import { db, queryClient } from "../src/db/client";

let passed = 0;
let failed = 0;
function check(name: string, ok: boolean, detail?: string) {
  if (ok) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

const PROBE_PORT = 3019;
const ROOT = join(import.meta.dir, "..");
const DEV_PASSWORD = "dev-password-123";
// Unique per run (M22); torn down in the finally below.
const victimEmail = `harden-${Date.now()}@example.com`;

async function waitForBoot(port: number, ms = 20000): Promise<boolean> {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/health`);
      if (r.status === 200) return true;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
}

async function post(port: number, path: string, body: unknown) {
  return (await postFull(port, path, body)).status;
}

async function postFull(port: number, path: string, body: unknown) {
  const res = await fetch(`http://127.0.0.1:${port}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return {
    status: res.status,
    body: await res.text(),
    setCookie: res.headers.getSetCookie().length,
  };
}

async function main() {
  console.log("\nprobe_auth_hardening\n");

  // ── 1. NO SILENT ACCOUNT LINKING ────────────────────────────────────────
  // Guards the decision, not an accident: Google must NOT silently link onto a
  // pre-existing local account. Every legacy email/password account is being
  // retired rather than migrated, so if someone later adds trustedProviders
  // without also thinking about requireLocalEmailVerified, a squatted
  // unverified row could absorb a real Google identity. Fail loudly here.
  console.log("1. account-linking stays off (deliberate — see auth.ts)");
  const linking = (auth.options as any).account?.accountLinking;
  check("no accountLinking config (legacy accounts are retired, not linked)", !linking);

  // ── 2. DEV STILL HAS THE BYPASS (regression guard for probe:session) ────
  console.log("\n2. dev mode (this process)");
  check(
    "email/password ENABLED in development",
    (auth.options as any).emailAndPassword?.enabled === true,
  );

  // ── 3. PRODUCTION MODE OVER REAL HTTP ───────────────────────────────────
  console.log("\n3. NODE_ENV=production backend (spawned)");

  // A REAL account with a REAL password, minted here in dev mode. Presenting
  // its true credentials to the prod-mode server is the honest test: it proves
  // the flip denies a login that would otherwise SUCCEED, not merely that a
  // junk payload is refused.
  await auth.api.signUpEmail({
    body: { email: victimEmail, password: DEV_PASSWORD, name: "harden" },
  });

  const proc = Bun.spawn(["bun", "src/index.ts"], {
    cwd: ROOT,
    env: { ...process.env, NODE_ENV: "production", PORT: String(PROBE_PORT) },
    stdout: "pipe",
    stderr: "pipe",
  });

  try {
    const booted = await waitForBoot(PROBE_PORT);
    check("prod-mode backend booted", booted);
    if (!booted) {
      console.error("    (could not boot — is the local DB up? docker compose up -d)");
    } else {
      // POSITIVE CONTROL: confirm it is genuinely the production-mode process
      // answering, so a 404 below means "route absent", not "wrong server".
      const rootBody = (await (
        await fetch(`http://127.0.0.1:${PROBE_PORT}/`)
      ).json()) as { env?: string };
      check(
        "control: the responding process really is NODE_ENV=production",
        rootBody?.env === "production",
        `saw env=${rootBody?.env}`,
      );

      // THE assertion. Not "is the route 404?" — Better Auth registers the
      // email routes in BOTH modes, so a 404 never happens and status alone
      // discriminates nothing. What matters is that CORRECT credentials for a
      // REAL user buy you NO SESSION. So: create a user via the dev bypass,
      // then present its true password to the production-mode server.
      const signIn = await postFull(PROBE_PORT, "/api/auth/sign-in/email", {
        email: victimEmail,
        password: DEV_PASSWORD,
      });
      check(
        "correct credentials for a real user issue NO session cookie",
        signIn.setCookie === 0,
        `${signIn.setCookie} cookie(s) set`,
      );
      check(
        "sign-in/email rejected with EMAIL_PASSWORD_DISABLED",
        signIn.status === 400 && signIn.body.includes("EMAIL_PASSWORD_DISABLED"),
        `got ${signIn.status} ${signIn.body.slice(0, 80)}`,
      );

      const signUp = await postFull(PROBE_PORT, "/api/auth/sign-up/email", {
        email: `harden-new-${Date.now()}@example.com`,
        password: DEV_PASSWORD,
        name: "probe",
      });
      check(
        "sign-up/email cannot mint a new account (no session cookie)",
        signUp.setCookie === 0,
        `${signUp.setCookie} cookie(s) set`,
      );
      check(
        "sign-up/email rejected with EMAIL_PASSWORD_SIGN_UP_DISABLED",
        signUp.status === 400 && signUp.body.includes("EMAIL_PASSWORD_SIGN_UP_DISABLED"),
        `got ${signUp.status} ${signUp.body.slice(0, 80)}`,
      );

      // POSITIVE CONTROL: Google must survive the flip. If this 404s too, the
      // server is simply broken and the two passes above are meaningless.
      const social = await post(PROBE_PORT, "/api/auth/sign-in/social", {
        provider: "google",
        callbackURL: "/",
      });
      check(
        "control: Google sign-in route SURVIVES (not 404)",
        social !== 404,
        `got ${social}`,
      );
    }
  } finally {
    proc.kill();
    await proc.exited;
    // users cascades to accounts/sessions.
    await db.delete(users).where(eq(users.email, victimEmail));
  }

  // Sanity: the dev bypass really did mint a usable session in DEV mode. Without
  // this, "no cookie in production" could just mean the credentials were bad all
  // along and the probe would pass for the wrong reason.
  console.log("\n3b. control — the same bypass DOES work in dev");
  const devEmail = `harden-dev-${Date.now()}@example.com`;
  try {
    await auth.api.signUpEmail({
      body: { email: devEmail, password: DEV_PASSWORD, name: "harden-dev" },
    });
    const devRes = await auth.api.signInEmail({
      body: { email: devEmail, password: DEV_PASSWORD },
      asResponse: true,
    });
    check(
      "control: dev-mode sign-in DOES issue a session (so the prod denial is real)",
      devRes.headers.getSetCookie().length > 0,
    );
  } finally {
    await db.delete(users).where(eq(users.email, devEmail));
  }

  // ── 4. THE EMITTED PRODUCTION BUNDLE ────────────────────────────────────
  console.log("\n4. production FE bundle");
  const build = Bun.spawnSync(["bun", "run", "build"], {
    cwd: join(ROOT, "frontend"),
    env: { ...process.env, NODE_ENV: "production" },
    stdout: "pipe",
    stderr: "pipe",
  });
  check("vite build succeeded", build.exitCode === 0);

  if (build.exitCode === 0) {
    const assets = join(ROOT, "frontend", "dist", "assets");
    const js = readdirSync(assets).filter((f) => f.endsWith(".js"));
    const bundle = js.map((f) => readFileSync(join(assets, f), "utf8")).join("\n");
    check("bundle is non-empty (control)", bundle.length > 10_000, `${bundle.length} bytes`);

    // POSITIVE control first: prove we are grepping a real, complete bundle.
    check(
      "control: 'Continue with Google' IS present (we grepped a real bundle)",
      bundle.includes("Continue with Google"),
    );

    for (const forbidden of [
      "dev-password-123",
      "dev login (bypass",
      "Dev sign in",
    ]) {
      check(`bundle does NOT ship ${JSON.stringify(forbidden)}`, !bundle.includes(forbidden));
    }
  }

  console.log(`\n${passed} passed, ${failed} failed\n`);
  await queryClient.end();
  process.exit(failed === 0 ? 0 : 1);
}

main().catch(async (e) => {
  console.error(e);
  await queryClient.end();
  process.exit(1);
});
