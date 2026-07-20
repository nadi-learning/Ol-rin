/**
 * slice-m-dbg — why did the IGCSE student's "That's me" never fire?
 * Measure the DOM instead of reasoning about it (S119's lesson, third time).
 */
import puppeteer from "puppeteer-core";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const FE = "http://localhost:5174";
const email = `mdbg-${Date.now()}@example.com`;

const b = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"] });
const p = await b.newPage();
await p.setViewport({ width: 1440, height: 1000 });
p.on("console", (m) => console.log(`  [console.${m.type()}] ${m.text().slice(0, 200)}`));
p.on("pageerror", (e) => console.log(`  [pageerror] ${String(e).slice(0, 200)}`));

await p.goto(FE, { waitUntil: "networkidle2" });
await p.waitForSelector(".or-col", { timeout: 20000 });
await p.evaluate(() => document.querySelector('.or-col[data-p="student"]').click());
await p.waitForSelector(".or-dev-input", { visible: true, timeout: 15000 });
await p.evaluate((e) => {
  const em = document.querySelector(".or-dev-input");
  const s = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
  s.call(em, e);
  em.dispatchEvent(new Event("input", { bubbles: true }));
}, email);
await p.click(".or-dev-btn");
await new Promise((r) => setTimeout(r, 4000));

await p.evaluate(() => {
  const x = [...document.querySelectorAll("button")].find((y) => /let's go|shall we/i.test(y.textContent));
  if (x) x.click();
});
await p.waitForSelector(".onb-board", { visible: true, timeout: 20000 });
await new Promise((r) => setTimeout(r, 900));

// pick IGCSE, then 9, then a sticker — one at a time, reporting after each.
const step = async (label, fn) => {
  const r = await p.evaluate(fn);
  await new Promise((x) => setTimeout(x, 1200));
  const state = await p.evaluate(() => ({
    rows: [...document.querySelectorAll(".onb-duo-row")].map((r) => ({
      label: r.querySelector(".onb-duo-label")?.textContent?.slice(0, 22),
      picked: [...r.querySelectorAll(".is-picked")].map((e) => e.textContent.trim() || "(art)"),
      opts: r.querySelectorAll(".onb-board, .onb-duo-sticker").length,
    })),
    buttons: [...document.querySelectorAll("button")]
      .filter((x) => x.offsetParent !== null)
      .map((x) => ({
        t: x.textContent.trim().slice(0, 20),
        cls: x.className.slice(0, 40),
        disabled: x.disabled,
      })),
  }));
  console.log(`\n### ${label} → ${r}`);
  console.log(JSON.stringify(state, null, 1));
};

await step("pick IGCSE", () => {
  const x = [...document.querySelectorAll(".onb-board")].find((y) => /igcse/i.test(y.textContent));
  if (!x) return "no igcse chip";
  x.click();
  return "clicked";
});

await step("pick grade 9", () => {
  const rows = [...document.querySelectorAll(".onb-duo-row")];
  const gr = rows.find((r) => /class/i.test(r.querySelector(".onb-duo-label")?.textContent ?? ""));
  const x = [...(gr?.querySelectorAll(".onb-board") ?? [])].find((y) => y.textContent.trim() === "9");
  if (!x) return "no grade 9 chip";
  x.click();
  return "clicked";
});

await step("pick a pronoun sticker", () => {
  const x = document.querySelector(".onb-duo-sticker");
  if (!x) return "no sticker";
  x.click();
  return "clicked";
});

await step("click That's me", () => {
  const x = [...document.querySelectorAll("button")].find((y) => /that's me/i.test(y.textContent));
  if (!x) return "no CTA";
  if (x.disabled) return "CTA DISABLED";
  x.click();
  return "clicked CTA";
});

await new Promise((r) => setTimeout(r, 3000));
const after = await p.evaluate(() => ({
  err: document.querySelector(".onb-err")?.textContent ?? null,
  bodyStart: document.body.innerText.slice(0, 200),
}));
console.log(`\n### after CTA:`);
console.log(JSON.stringify(after, null, 1));

await p.screenshot({ path: "scratchpad/slice-m-dbg.png", fullPage: true });
await b.close();
