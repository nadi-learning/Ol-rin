import puppeteer from "puppeteer-core";
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const FE = "http://localhost:5174";
let pass = 0, fail = 0;
const check = (n, ok, d) =>
  ok ? (pass++, console.log("  ✓ " + n)) : (fail++, console.log(`  ✗ ${n}${d === undefined ? "" : "  [" + d + "]"}`));
const b = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"] });

// ── 1. splash shows once, then never again ──────────────────────────────
console.log("1. splash once per browser");
const p = await b.newPage();
await p.setViewport({ width: 1440, height: 1000 });
await p.goto(FE, { waitUntil: "networkidle2" });
const firstVisible = await p.evaluate(() => {
  const s = document.querySelector(".or-splash");
  return s ? getComputedStyle(s).display !== "none" : false;
});
check("first visit SHOWS the splash", firstVisible);
await p
  .waitForFunction(() => { const s = document.querySelector(".or-splash"); return !s || getComputedStyle(s).display === "none"; }, { timeout: 15000 })
  .catch(() => {});
check("it finishes and hides itself", await p.evaluate(() => { const s = document.querySelector(".or-splash"); return !s || getComputedStyle(s).display === "none"; }));
check("the flag is persisted", await p.evaluate(() => localStorage.getItem("b2c.splashSeen") === "1"));
await p.reload({ waitUntil: "networkidle2" });
await new Promise((r) => setTimeout(r, 400));
check("🔑 RELOAD does NOT replay the splash", await p.evaluate(() => { const s = document.querySelector(".or-splash"); return !s || getComputedStyle(s).display === "none"; }));
check("and the columns are live immediately", await p.evaluate(() => !!document.querySelector(".or-cols.is-live")));

// ── 2. tutor persona + fresh signup → NOT student onboarding ────────────
console.log("\n2. tutor persona routes away from student onboarding");
await p.evaluate(() => localStorage.clear());
await p.goto(FE, { waitUntil: "networkidle2" });
await p.waitForSelector(".or-col", { timeout: 20000 });
await p.evaluate(() => document.querySelector('.or-col[data-p="tutor"]').click());
check("persona stored as a claim", await p.evaluate(() => localStorage.getItem("b2c.persona") === "tutor"));
await p.waitForSelector(".or-dev-input", { visible: true, timeout: 15000 });
const email = `claim-tu-${Date.now()}@example.com`;
await p.evaluate((e) => {
  const el = document.querySelector(".or-dev-input");
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(el, e);
  el.dispatchEvent(new Event("input", { bubbles: true }));
}, email);
await p.click(".or-dev-btn");
await new Promise((r) => setTimeout(r, 10000));
const s = await p.evaluate(() => ({
  onboarding: !!document.querySelector(".onb-root"),
  shire: !!document.querySelector(".shire-root"),
  number: document.querySelector(".shire-number")?.textContent?.trim(),
  eyebrow: document.querySelector(".shire-eyebrow")?.textContent?.trim(),
  persona: localStorage.getItem("b2c.persona"),
  body: document.body.innerText.slice(0, 120),
}));
check("🔑 a claimed TUTOR does NOT land in student onboarding", s.onboarding === false, s.body);
check("🔑 they land on the Shire signboard", s.shire === true, s.body);
check("the board shows the phone number", s.number === "+91 79046 23449", String(s.number));
check("and names the account type", s.eyebrow === "Tutor account", String(s.eyebrow));
check("the claim is cleared once spent", s.persona === null, String(s.persona));
await p.screenshot({ path: "scratchpad/batch1-shots/claim-tutor.png" });
console.log(`\n${pass} passed, ${fail} failed`);
await b.close();
process.exit(fail ? 1 : 0);
