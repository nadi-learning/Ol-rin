// S125 — screenshot the signed-out /admin front door at desktop + mobile.
// No session, no DB: App renders AdminGate on `!session` alone.
import { chromium } from "playwright-core";
import { mkdirSync } from "fs";

const FE = "http://localhost:5174";
const OUT = "/Users/mab/Desktop/nadi/b2c-rewrite/scratchpad/admin-gate-shots";
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  executablePath:
    "/Users/mab/Library/Caches/ms-playwright/chromium-1223/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing",
});

for (const [w, h, tag] of [
  [1440, 810, "1440"],
  [390, 844, "390"],
]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } });
  const page = await ctx.newPage();
  await page.goto(`${FE}/admin`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1200); // let the wave canvas paint a few frames
  const hasGate = await page.locator(".ag-root").count();
  const welcome = (await page.locator(".ag-welcome").textContent().catch(() => "")) ?? "";
  console.log(`@${tag}: .ag-root=${hasGate} welcome="${welcome.trim()}"`);
  await page.screenshot({ path: `${OUT}/admin-gate-${tag}.png` });
  await ctx.close();
}

await browser.close();
console.log("shots →", OUT);
