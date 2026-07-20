/**
 * S123 — does the restored DEV LOGIN actually work, and does one email really
 * reach all three profiles?
 *
 * Drives the real form (type an email, click the button) rather than POSTing to
 * the auth route, because the route was never the thing in doubt — the form is
 * newly restored and could be wired to nothing at all. A button that looks right
 * and does nothing is the silent no-op this codebase has designed out twice.
 *
 *   node scratchpad/devlogin-check.mjs
 */
import { chromium } from "playwright-core";
import { mkdirSync } from "fs";

const OUT = "./scratchpad/devlogin-shots";
mkdirSync(OUT, { recursive: true });
const FE = "http://localhost:5174";
const EMAIL = "one@example.com";

let pass = 0,
  fail = 0;
const check = (n, ok, note = "") => {
  if (ok) { pass++; console.log(`  ✓ ${n}`); }
  else { fail++; console.error(`  ✗ ${n}${note ? ` — ${note}` : ""}`); }
};

const browser = await chromium.launch({
  executablePath:
    "/Users/mab/Library/Caches/ms-playwright/chromium-1223/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing",
});

const surfaceOf = (page) =>
  page.evaluate(() => {
    if (document.querySelector(".shire-root")) return "waiting-room";
    if (document.querySelector(".tut-root")) return "tutor";
    if (document.querySelector(".parent-root, .par-root")) return "parent";
    if (document.querySelector(".dash")) return "student";
    if (document.querySelector(".onb-stage, .onb-duo-row")) return "onboarding";
    return "unknown";
  });

for (const persona of ["student", "tutor", "parent"]) {
  // A FRESH context per persona — this is the sign-out cycle a human does, and
  // reusing one context would silently test "switch profile mid-session", which
  // is not a thing the app offers.
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(FE);
  await page.waitForTimeout(1500);

  // Splash covers the rail on first visit (S122 traced this) — wait it out.
  await page.locator(".or-splash").waitFor({ state: "detached", timeout: 12000 }).catch(() => {});

  const card = page.getByRole("button", { name: new RegExp(persona, "i") }).first();
  if (await card.count()) {
    await card.click();
    await page.waitForTimeout(700);
  }

  const input = page.locator(".or-dev-input").first();
  const ok = await input.count();
  check(`[${persona}] the dev-login form is present in the DEV build`, ok > 0);
  if (!ok) { await ctx.close(); continue; }

  await input.fill(EMAIL);
  await page.locator(".or-dev-btn").first().click();
  await page.waitForTimeout(3500);
  await page.waitForLoadState("networkidle").catch(() => {});

  const surface = await surfaceOf(page);
  await page.screenshot({ path: `${OUT}/${persona}.png` });
  console.log(`  [${persona}] → ${surface}`);
  check(
    `[${persona}] dev login signs in and routes to the ${persona} surface`,
    surface === persona || (persona === "student" && surface === "onboarding"),
    surface,
  );
  await ctx.close();
}

console.log(`\ndevlogin-check: ${pass} passed, ${fail} failed`);
await browser.close();
process.exit(fail ? 1 : 0);
