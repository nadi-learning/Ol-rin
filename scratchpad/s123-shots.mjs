/**
 * S123 visual check — the three founder items that only a SCREENSHOT can judge.
 *
 *   2. the Argonath on EVERY view, at 1440 (the width that hid them before)
 *   3. the pronoun row with no "just {name}" aside
 *   4. Iron Man's new headline art
 *   + the "Hi R.K LAXMAN" → first-name fix
 *
 * This project's journal is unambiguous that a green probe does not mean the
 * pixels are right: S117, S118 and S120 each shipped a composite defect past a
 * green suite, and each was caught here. `.shell-sentinel` existing in the DOM
 * proves nothing about whether a statue is VISIBLE — `display:none` from a
 * media query, a `multiply` blend on the wrong canvas, and a mask that eats the
 * whole image all leave the element present and measurable.
 *
 *   node scratchpad/s123-shots.mjs <outDir> <w> <h>
 */
import { chromium } from "playwright-core";
import { mkdirSync } from "fs";

const OUT = process.argv[2] || "./scratchpad/s123-shots";
const W = Number(process.argv[3] || 1440);
const H = Number(process.argv[4] || 900);
mkdirSync(OUT, { recursive: true });

const FE = "http://localhost:5174";
const BE = "http://localhost:3010";
const EMAIL = process.env.WALK_EMAIL || "demo@example.com";
const PASS = "dev-password-123";

let pass = 0,
  fail = 0;
const check = (name, ok, note = "") => {
  if (ok) {
    pass++;
    console.log(`  ✓ ${name}`);
  } else {
    fail++;
    console.error(`  ✗ ${name}${note ? ` — ${note}` : ""}`);
  }
};

const browser = await chromium.launch({
  executablePath:
    "/Users/mab/Library/Caches/ms-playwright/chromium-1223/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing",
});
const ctx = await browser.newContext({ viewport: { width: W, height: H } });

const res = await fetch(`${BE}/api/auth/sign-in/email`, {
  method: "POST",
  headers: { "content-type": "application/json", origin: FE },
  body: JSON.stringify({ email: EMAIL, password: PASS }),
});
const raw = res.headers.getSetCookie?.() ?? [];
await ctx.addCookies(
  raw.map((c) => {
    const [pair] = c.split(";");
    const i = pair.indexOf("=");
    return { name: pair.slice(0, i), value: pair.slice(i + 1), domain: "localhost", path: "/" };
  }),
);
console.log(`sign-in ${EMAIL}: ${res.status}`);

const page = await ctx.newPage();
await page.goto(FE);
await page.evaluate(() => localStorage.setItem("b2c.persona", "student"));
await page.goto(FE);
await page.waitForLoadState("networkidle").catch(() => {});
await page.waitForTimeout(2000);

/**
 * Is a sentinel ACTUALLY PAINTED? Not "is it in the DOM".
 *
 * 🔴 Every one of these four conditions has produced a false green in this
 * repo: an element that exists but is display:none (the 1600px gate — the
 * founder's original bug), an image that 404s but still lays out, a zero-size
 * box, and art that decodes late and screenshots blank (S122). Checked together.
 */
const sentinelState = () =>
  page.evaluate(() => {
    const els = [...document.querySelectorAll(".shell-sentinel")];
    return els.map((el) => {
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return {
        display: cs.display,
        opacity: Number(cs.opacity),
        w: Math.round(r.width),
        h: Math.round(r.height),
        naturalWidth: el.naturalWidth,
        complete: el.complete,
      };
    });
  });

const shot = async (name) => {
  await page
    .evaluate(async () => {
      await Promise.all(
        [...document.images].filter((i) => !i.complete).map((i) => i.decode().catch(() => {})),
      );
    })
    .catch(() => {});
  await page.waitForTimeout(400);
  const f = `${OUT}/${name}.png`;
  await page.screenshot({ path: f });
  console.log(`  📸 ${f}`);
};

// ── The dashboard, plus a sweep of the other rail views ────────────────────
const views = ["Home", "Journal", "Crew", "Revision", "Practice", "Insights"];
let seenOnAll = true;

await shot(`01-dashboard-${W}`);
{
  const s = await sentinelState();
  console.log(`  dashboard sentinels:`, JSON.stringify(s));
  check(
    `two sentinels PAINTED on the dashboard at ${W}px (the width that hid them)`,
    s.length === 2 &&
      s.every((x) => x.display !== "none" && x.opacity > 0 && x.w > 40 && x.naturalWidth > 0),
    JSON.stringify(s),
  );
}

// 🔴 A SKIPPED VIEW MUST NOT COUNT AS A PASS. The first run of this harness
// found no rail at all (the identity had never finished onboarding, so there
// was no shell), skipped all five views, and then reported "the Argonath stands
// behind EVERY view" — GREEN, having swept nothing. Same family as S122's phone
// legs passing from the greet page. Count what was actually reached and assert
// on the count.
let swept = 0;
let i = 1;
for (const label of views.slice(1)) {
  const btn = page.getByRole("button", { name: new RegExp(`^\\s*${label}\\s*$`, "i") }).first();
  if (!(await btn.count())) {
    console.log(`  (no rail item "${label}" — SKIPPED, not passed)`);
    continue;
  }
  swept++;
  await btn.click();
  await page.waitForTimeout(1200);
  await shot(`${String(++i).padStart(2, "0")}-${label.toLowerCase()}-${W}`);
  const s = await sentinelState();
  const ok =
    s.length === 2 && s.every((x) => x.display !== "none" && x.opacity > 0 && x.naturalWidth > 0);
  if (!ok) seenOnAll = false;
  check(`sentinels present on ${label}`, ok, JSON.stringify(s));
}
check(
  `the Argonath stands behind every view swept — and at least 3 were actually swept (got ${swept})`,
  seenOnAll && swept >= 3,
  `swept=${swept}`,
);

// ── The greeting must be a FIRST name ──────────────────────────────────────
await page.getByRole("button", { name: /^\s*Home\s*$/i }).first().click().catch(() => {});
await page.waitForTimeout(1000);
const hello = await page.locator(".dash-hello").first().textContent().catch(() => null);
console.log(`  greeting: ${JSON.stringify(hello)}`);
check(
  "the greeting uses ONE word, not the full Google name",
  Boolean(hello) && hello.replace(/^Hi\s+|\s*👋\s*$/g, "").trim().split(/\s+/).length === 1,
  String(hello),
);

console.log(`\ns123-shots: ${pass} passed, ${fail} failed`);
await browser.close();
process.exit(fail ? 1 : 0);
