/**
 * One-variable control for the 390px `IndexSizeError: ellipse ... radius (-1.5)`
 * seen in the Slice H walk.
 *
 * The question is ONLY: is this Slice H's, or does the revision slide surface
 * throw it at 390 regardless? So this drives demo@ — an ALREADY-STARTED student,
 * for whom the first-run tour does not render at all — through the same
 * navigation at the same width. If it still throws, the tour is not the cause.
 *
 *   node scratchpad/ellipse-control.mjs
 */
import { chromium } from "playwright-core";

const FE = "http://localhost:5174";
const BE = "http://localhost:3010";
const EMAIL = "demo@example.com";
const PASS = "dev-password-123";

const browser = await chromium.launch({
  executablePath:
    "/Users/mab/Library/Caches/ms-playwright/chromium-1223/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing",
});
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });

const res = await fetch(`${BE}/api/auth/sign-in/email`, {
  method: "POST",
  headers: { "content-type": "application/json", origin: FE },
  body: JSON.stringify({ email: EMAIL, password: PASS }),
});
const cookies = (res.headers.getSetCookie?.() ?? []).map((c) => {
  const [pair] = c.split(";");
  const i = pair.indexOf("=");
  return { name: pair.slice(0, i), value: pair.slice(i + 1), domain: "localhost", path: "/" };
});
await ctx.addCookies(cookies);

const errs = [];
const page = await ctx.newPage();
page.on("pageerror", (e) => errs.push(String(e).slice(0, 160)));

await page.goto(FE, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(3000);
console.log("tour present for demo@ (expect 0):", await page.locator(".dash-tour").count());

await page.screenshot({ path: "./scratchpad/ellipse-control-dash-390.png" });
console.log(
  "buttons on the dashboard:",
  JSON.stringify(
    (await page.locator("button").allTextContents()).map((t) => t.trim().slice(0, 30)).filter(Boolean),
  ),
);

// Open the SAME chapter the tour's CTA opened ("Exploring Mixtures…"), so the
// only variable between this run and the walk is whether the tour exists.
// A returning student's rows say "Continue lesson", not "Start lesson".
await page
  .locator(".dash-lesson-row", { hasText: "Exploring Mixtures" })
  .getByRole("button", { name: /Continue lesson/i })
  .first()
  .click();
await page.waitForTimeout(4000);
await page.screenshot({ path: "./scratchpad/ellipse-control-390.png" });

console.log("pageerrors:", errs.length);
for (const e of errs) console.log("  •", e);
console.log(
  errs.some((e) => /ellipse/i.test(e))
    ? "\n⇒ REPRODUCES WITHOUT THE TOUR — pre-existing, not Slice H."
    : "\n⇒ did NOT reproduce here; needs more digging before blaming either side.",
);
await browser.close();
