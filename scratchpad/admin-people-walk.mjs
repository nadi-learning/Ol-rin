/**
 * admin-people-walk — Slice D M37 gate. Renders the NEW admin People surface and
 * drives it through the real UI (M64: a probe that shares the code's assumptions
 * passes while the real button does nothing).
 *
 * Signs in as admin@example.com, opens the People tab, and asserts the two
 * refusals are legible BEFORE submit (self-row disabled, never-signed-in row
 * disabled), then does a REAL role change and a REAL link/unlink through the UI.
 * 1440 and 390. Screenshots to scratchpad/admin-walk-shots.
 */
import { chromium } from "playwright-core";
import { mkdirSync } from "fs";

const OUT = "/Users/mab/Desktop/nadi/b2c-rewrite/scratchpad/admin-walk-shots";
mkdirSync(OUT, { recursive: true });

const FE = "http://localhost:5174";
const BE = "http://localhost:3010";
const EMAIL = "admin@example.com";
const PASS = "dev-password-123";

let n = 0;
let fails = 0;
const shot = async (page, name) => {
  const f = `${OUT}/${String(++n).padStart(2, "0")}-${name}.png`;
  await page.screenshot({ path: f, fullPage: true });
  console.log(`  📸 ${f}`);
};
const check = (name, ok) => {
  if (ok) console.log(`  ✓ ${name}`);
  else {
    fails++;
    console.error(`  ✗ ${name}`);
  }
};

const browser = await chromium.launch({
  executablePath:
    "/Users/mab/Library/Caches/ms-playwright/chromium-1223/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing",
});

const res = await fetch(`${BE}/api/auth/sign-in/email`, {
  method: "POST",
  headers: { "content-type": "application/json", origin: FE },
  body: JSON.stringify({ email: EMAIL, password: PASS }),
});
console.log(`sign-in: ${res.status}`);
const raw = res.headers.getSetCookie?.() ?? [];
const cookies = raw.map((c) => {
  const [pair] = c.split(";");
  const i = pair.indexOf("=");
  return { name: pair.slice(0, i), value: pair.slice(i + 1), domain: "localhost", path: "/" };
});

async function walk(width, height, label) {
  const ctx = await browser.newContext({ viewport: { width, height } });
  if (cookies.length) await ctx.addCookies(cookies);
  const page = await ctx.newPage();
  page.on("console", (m) => {
    if (m.type() === "error") console.log(`    [console.error] ${m.text()}`);
  });

  await page.goto(FE, { waitUntil: "networkidle" });
  await page.waitForSelector(".adm-root", { timeout: 15000 });
  await shot(page, `${label}-content-tab`);
  check(`${label}: lands on the admin surface`, await page.locator(".adm-root").isVisible());
  check(`${label}: tab strip rendered`, (await page.locator(".adm-tabs .adm-tab").count()) === 2);

  // → People
  await page.getByRole("button", { name: "People", exact: true }).click();
  await page.waitForSelector(".adm-table", { timeout: 10000 });
  await page.waitForTimeout(600);
  await shot(page, `${label}-people-tab`);

  const rows = page.locator(".adm-table tbody tr");
  check(`${label}: people list rendered (${await rows.count()} rows)`, (await rows.count()) > 0);

  // the SELF row — must be marked and locked
  const selfRow = rows.filter({ hasText: EMAIL });
  check(`${label}: own row carries the "you" badge`, (await selfRow.locator(".adm-you").count()) === 1);
  check(
    `${label}: own row's role select is DISABLED (no self-lockout)`,
    await selfRow.locator("select").isDisabled(),
  );
  check(
    `${label}: own row states the reason inline`,
    (await selfRow.locator(".adm-blocked").innerText()).includes("your own role"),
  );

  // the GHOST row — signed-in gate must be legible before submit
  const ghostRow = rows.filter({ hasText: "walk-ghost@example.com" });
  check(`${label}: never-signed-in person IS listed (LEFT join)`, (await ghostRow.count()) === 1);
  check(
    `${label}: ghost row's select is DISABLED`,
    await ghostRow.locator("select").isDisabled(),
  );
  check(
    `${label}: ghost row explains why`,
    (await ghostRow.locator(".adm-blocked").innerText()).includes("signed in"),
  );

  // a grantable row is NOT blocked
  const realRow = rows.filter({ hasText: "walk-real@example.com" });
  check(
    `${label}: signed-in person's select is ENABLED`,
    await realRow.locator("select").isEnabled(),
  );

  if (label === "1440") {
    // ── a REAL role change through the UI ──
    await realRow.locator("select").selectOption("tutor");
    await realRow.getByRole("button", { name: "Save" }).click();
    await page.waitForSelector(".adm-ok", { timeout: 10000 });
    await page.waitForTimeout(800);
    await shot(page, `${label}-role-changed`);
    check(
      "role change reports success",
      (await page.locator(".adm-ok").innerText()).includes("now a tutor"),
    );
    const reRow = page.locator(".adm-table tbody tr").filter({ hasText: "walk-real@example.com" });
    check(
      "…and the list RELOADED showing the new role",
      (await reRow.locator("select").inputValue()) === "tutor",
    );

    // ── find-by-email: someone not on this board ──
    await page.locator(".adm-panel").first().locator(".adm-input").fill("smoke@example.com");
    await page.getByRole("button", { name: "Find", exact: true }).click();
    await page.waitForSelector(".adm-found", { timeout: 10000 });
    await shot(page, `${label}-found`);
    check("findByEmail renders a result card", await page.locator(".adm-found").isVisible());

    // ── a REAL link, then unlink ──
    const linkPanel = page.locator(".adm-panel").nth(1);
    await linkPanel.locator(".adm-input").first().fill("walk-real@example.com");
    await linkPanel.locator(".adm-input").nth(1).fill("demo@example.com");
    await linkPanel.getByRole("button", { name: "Link", exact: true }).click();
    await page.waitForSelector(".adm-links li", { timeout: 10000 });
    await page.waitForTimeout(600);
    await shot(page, `${label}-linked`);
    check("link created and listed", (await page.locator(".adm-links li").count()) >= 1);

    await page.locator(".adm-links li").first().getByRole("button", { name: "Remove" }).click();
    await page.waitForTimeout(1200);
    await shot(page, `${label}-unlinked`);
    check(
      "unlink reported success",
      (await page.locator(".adm-ok").innerText()).includes("Unlinked"),
    );

    // put them back so the walk is repeatable
    await page
      .locator(".adm-table tbody tr")
      .filter({ hasText: "walk-real@example.com" })
      .locator("select")
      .selectOption("student");
    await page
      .locator(".adm-table tbody tr")
      .filter({ hasText: "walk-real@example.com" })
      .getByRole("button", { name: "Save" })
      .click();
    await page.waitForTimeout(1000);
  }

  await ctx.close();
}

await walk(1440, 1000, "1440");
await walk(390, 844, "390");

await browser.close();
console.log(`\nadmin-people-walk: ${fails} failed`);
process.exit(fails === 0 ? 0 : 1);
