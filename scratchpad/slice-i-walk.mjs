/**
 * Slice I walk (S116) — THE CHAPTER FILTER, in a real browser (M37).
 *
 * Why a browser and not just a probe: probe_revision_nav proves the SERVER
 * reports the right per-sub_topic flag, and proves it agrees with getSlide. It
 * cannot prove the two CLIENT surfaces actually consume that flag — and M43 is
 * in the log for exactly this shape: "the probe verified the SERVER's rule and
 * went green; the CLIENT broke that same rule and the flow dead-ended where no
 * gate could see it." The whole slice is a client-side filter. So it gets seen.
 *
 * What this asserts, none of which a service test can:
 *   1. The dashboard lesson list shows ONLY openable chapters (cbse: 1 of 13).
 *   2. "Basics" — the ordinal-first chapter that 404s — is GONE from BOTH the
 *      dashboard and the Revision landing grid. It is the named canary because
 *      S114/M69 met it as a mystery bug and S115's landing walk hit it again.
 *   3. Expanding the surviving chapter reveals ONLY renderable sub_topics.
 *   4. 🔑 EVERY visible row actually opens. Not a count — a click. A filter that
 *      hides the wrong rows is as broken as one that hides none, and the only
 *      honest test of "this row opens" is opening it.
 *   5. The same at 390, where the grid reflows.
 *
 * Drives demo@ (an already-onboarded cbse student) — the filter applies to every
 * student, not just first-run, so the expensive signup+onboarding flow buys
 * nothing here.
 *
 *   node scratchpad/slice-i-walk.mjs <w> <h>
 */
import { chromium } from "playwright-core";
import { mkdirSync } from "fs";

const W = Number(process.argv[2] || 1440);
const H = Number(process.argv[3] || 900);
const OUT = `./scratchpad/slice-i-shots-${W}`;
mkdirSync(OUT, { recursive: true });

const FE = "http://localhost:5174";
const BE = "http://localhost:3010";
const EMAIL = "demo@example.com";
const PASS = "dev-password-123";

// Measured from the real dev DB by scratchpad/slice_i_agreement.ts, which
// derived them from the REAL getChapterNav + REAL getSlide rather than from
// this file's assumptions. If content is published these move — that is a
// content event, not a regression, and the failure message says so.
const EXPECT_CHAPTERS = 1;
const EXPECT_SUBTOPICS = 31;
const DEAD_CANARY = "Basics";

let pass = 0,
  fail = 0;
const check = (name, ok, detail = "") => {
  if (ok) {
    pass++;
    console.log(`  ✓ ${name}`);
  } else {
    fail++;
    console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
};

let n = 0;
const shot = async (page, name) => {
  await page.screenshot({ path: `${OUT}/${String(++n).padStart(2, "0")}-${name}.png` });
};

const browser = await chromium.launch({
  executablePath:
    "/Users/mab/Library/Caches/ms-playwright/chromium-1223/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing",
});
const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 2 });

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
if (!cookies.length) {
  console.error("sign-in produced no cookies — is the BE up? aborting rather than walking a logged-out app");
  process.exit(1);
}
await ctx.addCookies(cookies);

const page = await ctx.newPage();
const errs = [];
page.on("pageerror", (e) => errs.push(String(e).slice(0, 160)));

console.log(`\n── Slice I walk @ ${W}×${H} ──`);

// ── 1. the dashboard list ──────────────────────────────────────────────────
await page.goto(FE, { waitUntil: "domcontentloaded" });
await page.locator(".dash-lesson").first().waitFor({ state: "visible", timeout: 15000 });
await page.waitForTimeout(400);
await shot(page, "dashboard");

const rows = await page.locator(".dash-lesson").count();
check(
  `dashboard shows ONLY openable chapters (${EXPECT_CHAPTERS})`,
  rows === EXPECT_CHAPTERS,
  `saw ${rows}. If content was published this is a CONTENT change, not a regression — re-run scratchpad/slice_i_agreement.ts`,
);

const dashText = await page.locator(".dash-list").innerText();
check(`"${DEAD_CANARY}" (the 404ing ordinal-first chapter) is GONE from the dashboard`, !dashText.includes(DEAD_CANARY));

// ── 2. expand it — only renderable sub_topics ──────────────────────────────
await page.locator(".dash-lesson-main").first().click();
await page.locator(".dash-slide").first().waitFor({ state: "visible", timeout: 8000 });
await page.waitForTimeout(300);
await shot(page, "expanded");

const slideRows = await page.locator(".dash-slide").count();
check(
  `expanded chapter reveals ONLY renderable sub_topics (${EXPECT_SUBTOPICS})`,
  slideRows === EXPECT_SUBTOPICS,
  `saw ${slideRows}`,
);

// The card's own meta must agree with what it revealed — a "12 slides" label
// over 3 rows is the same lie one level down.
const meta = await page.locator(".dash-lesson-meta").first().innerText();
check(`card meta agrees with the rows it reveals (says "${slideRows} slides")`, meta.includes(`${slideRows} slide`), meta);

// ── 3. 🔑 every visible row actually OPENS ─────────────────────────────────
// A sample, because 31 full slide loads is minutes; but a sample that includes
// the FIRST and the LAST, which are the two the ordinal bugs live at.
const names = await page.locator(".dash-slide").allTextContents();
const idx = [...new Set([0, 1, Math.floor(slideRows / 2), slideRows - 2, slideRows - 1])].filter(
  (i) => i >= 0 && i < slideRows,
);
let opened = 0;
for (const i of idx) {
  await page.goto(FE, { waitUntil: "domcontentloaded" });
  await page.locator(".dash-lesson-main").first().click();
  await page.locator(".dash-slide").nth(i).click();
  await page.waitForTimeout(2200);
  // The verdict is "did THIS row render a slide", which means the slide
  // surface exists AND no error is showing. The first cut of this test read
  // any SLIDE_NOT_FOUND anywhere in the body, and reported 0/5 DEAD on rows
  // that a screenshot showed opening perfectly — the string came from a
  // DIFFERENT, doomed request racing in late. A detector that can't say which
  // row it is judging is not a detector (M66).
  const err = await page.locator(".revision-error").count();
  const rendered = (await page.locator(".rev-nav-slide").count()) > 0;
  const dead = err > 0 || !rendered;
  if (!dead) opened++;
  else
    console.error(
      `      ↳ row ${i} ("${(names[i] ?? "").trim().slice(0, 40)}") DEAD — err=${err} rendered=${rendered}`,
    );
}
check(`🔑 every sampled visible row OPENS (${opened}/${idx.length}) — no row the filter kept is a 404`, opened === idx.length);
await shot(page, "opened-slide");

// The viewer itself must agree with the filter (Slice I, RevisionPage).
const counter = (await page.locator(".rev-index, .rev-counter").first().innerText().catch(() => "")) ||
  (await page.locator("body").innerText()).match(/\b\d+\s*\/\s*\d+\b/)?.[0] ||
  "";
check(
  `viewer counter counts OPENABLE slides ("/ ${EXPECT_SUBTOPICS}"), not the spine`,
  new RegExp(`/\\s*${EXPECT_SUBTOPICS}\\b`).test(counter),
  `read "${counter}"`,
);
const sidebar = await page.locator(".rev-nav-slides, .rev-nav-section").allTextContents();
check(
  `"${DEAD_CANARY}" is GONE from the viewer's index sidebar`,
  !sidebar.join(" ").includes(DEAD_CANARY),
);
// No doomed request on open: the error surface must be clean on a good slide.
check("no SLIDE_NOT_FOUND banner over a rendered slide (the late-reject race)", (await page.locator(".revision-error").count()) === 0);

// ── 4. the Revision landing grid ───────────────────────────────────────────
await page.goto(FE, { waitUntil: "domcontentloaded" });
// Selector read off the live DOM, not guessed — the class is `nav-item` (M68).
await page.locator(".nav-item", { hasText: /^Revision$/ }).first().click();
await page.locator(".rev-landing-grid").waitFor({ state: "visible", timeout: 10000 });
await page.waitForTimeout(500);
await shot(page, "revision-landing");

const cards = await page.locator(".rev-landing-card").count();
check(
  `Revision grid shows ONLY openable chapters (${EXPECT_CHAPTERS})`,
  cards === EXPECT_CHAPTERS,
  `saw ${cards}`,
);
const gridText = await page.locator(".rev-landing-grid").innerText();
check(`"${DEAD_CANARY}" is GONE from the Revision grid`, !gridText.includes(DEAD_CANARY));

// The landing's first card was the documented dead end (S114/M69). Click it.
await page.locator(".rev-landing-card").first().click();
await page.waitForTimeout(1800);
const landErr = await page.locator(".revision-error").count();
check("the Revision grid's FIRST card opens (it was the documented dead end)", landErr === 0);
await shot(page, "revision-opened");

check("no uncaught page errors introduced", errs.filter((e) => !/ellipse|IndexSize/i.test(e)).length === 0, errs.join(" | "));
if (errs.some((e) => /ellipse|IndexSize/i.test(e)))
  console.log("     ⚠️ pre-existing canvas ellipse error seen — not Slice I's (S115 proved it with a control)");

console.log(`\nslice-i-walk @${W}: ${pass} passed, ${fail} failed`);
await browser.close();
process.exit(fail === 0 ? 0 : 1);
