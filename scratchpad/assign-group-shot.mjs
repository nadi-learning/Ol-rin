/**
 * assign-group-shot — screenshot the NEW grouped "Assignments by tutor / parent"
 * view on the admin People tab, at 1440 and 390, against real cbse data
 * (6 tutors, 34 links). Signs in as the whitelisted admin via dev-login.
 */
import { chromium } from "playwright-core";
import { mkdirSync } from "fs";

const OUT = "/Users/mab/Desktop/nadi/b2c-rewrite/scratchpad/assign-shots";
mkdirSync(OUT, { recursive: true });

const FE = "http://localhost:5174";
const BE = "http://localhost:3010";
const EMAIL = "xxxx51263@gmail.com";
const PASS = "dev-password-123";

// dev-login: try sign-up (new) then fall back to sign-in (exists).
async function auth() {
  const name = EMAIL.split("@")[0];
  let r = await fetch(`${BE}/api/auth/sign-up/email`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: FE },
    body: JSON.stringify({ email: EMAIL, password: PASS, name }),
  });
  if (!r.ok || !(r.headers.getSetCookie?.() ?? []).length) {
    r = await fetch(`${BE}/api/auth/sign-in/email`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: FE },
      body: JSON.stringify({ email: EMAIL, password: PASS }),
    });
  }
  console.log(`auth: ${r.status}`);
  const raw = r.headers.getSetCookie?.() ?? [];
  return raw.map((c) => {
    const [pair] = c.split(";");
    const i = pair.indexOf("=");
    return { name: pair.slice(0, i), value: pair.slice(i + 1), domain: "localhost", path: "/" };
  });
}

const cookies = await auth();
if (!cookies.length) {
  console.error("no session cookie — cannot proceed");
  process.exit(2);
}

const browser = await chromium.launch({
  executablePath:
    "/Users/mab/Library/Caches/ms-playwright/chromium-1223/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing",
});

let fails = 0;
const check = (name, ok) => {
  console[ok ? "log" : "error"](`  ${ok ? "✓" : "✗"} ${name}`);
  if (!ok) fails++;
};

async function walk(width, height, label) {
  const ctx = await browser.newContext({ viewport: { width, height } });
  await ctx.addCookies(cookies);
  const page = await ctx.newPage();
  page.on("console", (m) => {
    if (m.type() === "error") console.log(`    [console.error] ${m.text()}`);
  });

  await page.goto(`${FE}/admin`, { waitUntil: "networkidle" });
  await page.waitForSelector(".adm-root", { timeout: 15000 });
  check(`${label}: reached the admin surface`, await page.locator(".adm-root").isVisible());

  await page.getByRole("button", { name: "People", exact: true }).click();
  // The grouped view lives under the "Assignments by tutor / parent" label.
  await page.waitForSelector(".adm-groups", { timeout: 10000 });
  await page.waitForTimeout(700);

  const groups = page.locator(".adm-group");
  const nGroups = await groups.count();
  check(`${label}: grouped by adult (${nGroups} groups)`, nGroups > 0);

  const counts = await page.locator(".adm-group-count").allInnerTexts();
  console.log(`    counts: ${counts.join(" | ")}`);
  check(`${label}: every group shows a count badge`, counts.length === nGroups);
  check(
    `${label}: at least one tutor has students`,
    counts.some((c) => /[1-9]\d* student/.test(c)),
  );

  await page.locator(".adm-groups").scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${OUT}/${label}-assignments.png`, fullPage: true });
  console.log(`  📸 ${OUT}/${label}-assignments.png`);

  await ctx.close();
}

await walk(1440, 1000, "1440");
await walk(390, 844, "390");
await browser.close();
console.log(`\nassign-group-shot: ${fails} failed`);
process.exit(fails === 0 ? 0 : 1);
