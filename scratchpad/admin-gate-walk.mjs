/**
 * admin-gate-walk — S124 browser gate.
 *
 * Probes cannot see this slice's actual claim. `probe_admin_gate` tests the RULE
 * (assertAdminAccess) and the SOURCE (the route exists, the auto-route is gone),
 * but neither proves that visiting /admin in a browser renders the portal for one
 * person and a not-found page for another — which is the whole feature.
 *
 * Four identities, chosen so every leg has its opposite:
 *   - xxxx51263@gmail.com  admin role + WHITELISTED  → the portal
 *   - admin@example.com    admin role + OFF-LIST     → not found  (the 2nd lock)
 *   - test@example.com     student                   → not found  (the 1st lock)
 *   - test@example.com + a stale "tutor" persona     → the signboard + escape
 *
 * 🔴 The off-list admin is the leg that matters. Without it "not found" could be
 * coming from the ROLE check alone and the email whitelist would be untested in
 * the browser — a walk that passes on a build where the second lock does nothing.
 */
import { chromium } from "playwright-core";
import { mkdirSync } from "fs";

const OUT = "/Users/mab/Desktop/nadi/b2c-rewrite/scratchpad/admin-gate-shots";
mkdirSync(OUT, { recursive: true });

const FE = "http://localhost:5174";
const BE = "http://localhost:3010";
const PASS = "dev-password-123";

const ADMIN_OK = "xxxx51263@gmail.com";
const ADMIN_OFFLIST = "admin@example.com";
const STUDENT = "test@example.com";

let n = 0;
let fails = 0;
let legs = 0;
const check = (name, ok, detail) => {
  legs++;
  if (ok) console.log(`  ✓ ${name}`);
  else {
    fails++;
    console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
};
const shot = async (page, name) => {
  const f = `${OUT}/${String(++n).padStart(2, "0")}-${name}.png`;
  await page.screenshot({ path: f, fullPage: true });
  console.log(`  📸 ${name}`);
};

const browser = await chromium.launch({
  executablePath:
    "/Users/mab/Library/Caches/ms-playwright/chromium-1223/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing",
});

/** Ensure a dev credential login exists (local only — prod has these disabled). */
async function ensureAccount(email) {
  const up = await fetch(`${BE}/api/auth/sign-up/email`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: FE },
    body: JSON.stringify({ email, password: PASS, name: email.split("@")[0] }),
  });
  if (up.ok) return "created";
  const inn = await fetch(`${BE}/api/auth/sign-in/email`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: FE },
    body: JSON.stringify({ email, password: PASS }),
  });
  return inn.ok ? "exists" : `FAILED ${up.status}/${inn.status}`;
}

async function cookiesFor(email) {
  const res = await fetch(`${BE}/api/auth/sign-in/email`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: FE },
    body: JSON.stringify({ email, password: PASS }),
  });
  if (!res.ok) throw new Error(`sign-in ${email} → ${res.status}`);
  return (res.headers.getSetCookie?.() ?? []).map((c) => {
    const [pair] = c.split(";");
    const i = pair.indexOf("=");
    return { name: pair.slice(0, i), value: pair.slice(i + 1), domain: "localhost", path: "/" };
  });
}

/** A fresh context per identity — a leaked session is how a walk lies about who it is. */
async function as(email, persona, fn) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.addCookies(await cookiesFor(email));
  const page = await ctx.newPage();
  // Seed localStorage before the app boots: the persona is read at first render.
  await page.goto(`${FE}/`, { waitUntil: "domcontentloaded" });
  await page.evaluate(
    ([b, p]) => {
      localStorage.setItem("b2c.board", b);
      if (p) localStorage.setItem("b2c.persona", p);
      else localStorage.removeItem("b2c.persona");
    },
    ["cbse", persona],
  );
  await fn(page);
  await ctx.close();
}

/**
 * Settle on whichever TERMINAL surface this identity reaches.
 *
 * 🔴 THE FIRST CUT OF THIS WAITED ON `.gate-card`, AND THAT IS THE BUG THIS
 * COMMENT EXISTS TO PREVENT. `.gate-card` is the "Loading…" gate AND the
 * not-found card AND the error card — one selector for a TRANSIENT state and a
 * TERMINAL one. So every leg resolved the instant the spinner painted, read
 * "Loading…", and the whole walk reported 8/14 against an app that was working
 * perfectly. Worse, the legs AFTER the failed one passed, because a page with no
 * signboard also has no signboard-specific thing to contradict them (M83).
 *
 * Terminal surfaces only, and `.gate-card` is matched ONLY via its not-found
 * text. `settled` is returned so callers can refuse to judge a page that never
 * arrived — a leg on an unsettled page is not a fail, it is a non-observation.
 */
async function land(page, path) {
  await page.goto(`${FE}${path}`, { waitUntil: "domcontentloaded" });
  const settled = await page
    .waitForFunction(
      () => {
        const t = document.body?.innerText ?? "";
        return Boolean(
          document.querySelector(".adm-root") ||
            document.querySelector(".shire-root") ||
            document.querySelector(".shell-root, .canvas, .dash-root, .onb-root") ||
            t.includes("Nothing here"),
        );
      },
      { timeout: 20000 },
    )
    .then(() => true)
    .catch(() => false);
  return {
    settled,
    admin: (await page.locator(".adm-root").count()) > 0,
    signboard: (await page.locator(".shire-root").count()) > 0,
    notFound: (await page.getByText("Nothing here").count()) > 0,
    url: page.url(),
    body: (await page.locator("body").innerText()).slice(0, 160).replace(/\s+/g, " "),
  };
}

/** A leg that refuses to render a verdict on a page that never finished loading. */
const checkOn = (r, name, ok, detail) => {
  if (!r.settled) {
    legs++;
    fails++;
    console.error(`  ✗ ${name} — PAGE NEVER SETTLED (not a verdict): ${r.body}`);
    return;
  }
  check(name, ok, detail ?? r.body);
};

console.log("\n── admin-gate-walk (S124) @1440 ──\n");

console.log(`setup: ${ADMIN_OK} → ${await ensureAccount(ADMIN_OK)}`);
console.log(`setup: ${ADMIN_OFFLIST} → ${await ensureAccount(ADMIN_OFFLIST)}`);
console.log(`setup: ${STUDENT} → ${await ensureAccount(STUDENT)}\n`);

// ── 1. the whitelisted admin ──
console.log("1. admin role + whitelisted email");
await as(ADMIN_OK, "admin", async (page) => {
  const r = await land(page, "/admin");
  checkOn(r, "/admin renders the portal", r.admin);
  await shot(page, "admin-ok-portal");

  const home = await land(page, "/");
  checkOn(home, "/ redirects the admin to /admin", home.url.endsWith("/admin"), home.url);
  checkOn(home, "…and the portal is what renders there", home.admin);
});

// ── 2. the OFF-LIST admin — the second lock, in the browser ──
console.log("\n2. admin role + OFF-LIST email (the whitelist doing its job)");
await as(ADMIN_OFFLIST, "admin", async (page) => {
  const r = await land(page, "/admin");
  checkOn(r, "/admin does NOT render the portal", !r.admin);
  checkOn(r, "/admin renders not-found instead", r.notFound);
  await shot(page, "admin-offlist-404");

  const home = await land(page, "/");
  checkOn(home, "/ does NOT render the portal either (no auto-route left)", !home.admin);
  checkOn(home, "/ does NOT bounce them to /admin (they would be stranded)", !home.url.endsWith("/admin"), home.url);
});

// ── 3. a student ──
console.log("\n3. student");
await as(STUDENT, null, async (page) => {
  const r = await land(page, "/admin");
  checkOn(r, "/admin renders not-found for a student", r.notFound && !r.admin);
  await shot(page, "student-404");

  // M79 in URL form: the route must be an EXACT match, not a prefix.
  const near = await land(page, "/administrator");
  checkOn(near, "/administrator is NOT treated as the admin route", !near.admin && !near.notFound, near.url);
  const deep = await land(page, "/admin/secrets");
  checkOn(deep, "/admin/secrets is NOT treated as the admin route", !deep.admin, deep.url);
});

// ── 4. the stale persona, and the way out ──
console.log("\n4. stale persona → signboard → escape");
await as(STUDENT, "tutor", async (page) => {
  const r = await land(page, "/");
  checkOn(r, "a stale 'tutor' claim on a student lands on the signboard", r.signboard);
  await shot(page, "stale-persona-signboard");

  const btn = page.getByRole("button", { name: /Continue as student/i });
  check("the signboard offers the profile they DO hold", (await btn.count()) > 0, r.body);

  await btn.first().click();
  await page
    .waitForFunction(() => !document.querySelector(".shire-root"), { timeout: 15000 })
    .catch(() => {});
  const after = await land(page, "/");
  check("clicking it leaves the signboard for good", !after.signboard, after.body);
  check("…and the claim was rewritten, not merely hidden",
    (await page.evaluate(() => localStorage.getItem("b2c.persona"))) === "student");
  await shot(page, "stale-persona-escaped");
});

// ── 5. CONTROL: a REAL applicant must NOT get an escape hatch ──
// Without this the feature could be offering "Continue as …" to everyone, which
// would hand a genuine pending tutor a way to wander off into a student app.
console.log("\n5. control — a real pending tutor keeps the plain signboard");
await as("claim-tu-1784552102150@example.com", "tutor", async (page) => {
  const r = await land(page, "/");
  if (!r.signboard) {
    console.log("  ~ SKIPPED (that identity no longer reaches the signboard)");
  } else {
    check("a disabled tutor still sees the signboard", r.signboard);
    check(
      "…with NO 'Continue as' escape (they hold nothing else)",
      (await page.getByRole("button", { name: /Continue as/i }).count()) === 0,
    );
    await shot(page, "real-applicant-no-escape");
  }
});

await browser.close();
console.log(`\n── ${legs - fails}/${legs} legs green ──\n`);
process.exit(fails === 0 ? 0 : 1);
