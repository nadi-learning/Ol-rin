import puppeteer from "puppeteer-core";
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const b = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"] });
const p = await b.newPage();
await p.setViewport({ width: 1440, height: 1000 });
p.on("pageerror", (e) => console.log(`[pageerror] ${String(e).slice(0,200)}`));
p.on("console", (m) => { if (m.type()==="error") console.log(`[console.error] ${m.text().slice(0,200)}`); });
await p.goto("http://localhost:5174", { waitUntil: "networkidle2" });
await p.waitForSelector(".or-col", { timeout: 20000 });
await p.evaluate(() => document.querySelector('.or-col[data-p="student"]').click());
await p.waitForSelector(".or-dev-input", { visible: true, timeout: 15000 });
const email = `dbg-${Date.now()}@example.com`;
await p.evaluate((e) => {
  const el = document.querySelector(".or-dev-input");
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value").set.call(el, e);
  el.dispatchEvent(new Event("input", { bubbles: true }));
}, email);
await p.click(".or-dev-btn");
await new Promise(r => setTimeout(r, 8000));
const s = await p.evaluate(() => ({
  classes: [...new Set([...document.querySelectorAll("[class]")].map(e => e.className).filter(c=>typeof c==="string").flatMap(c=>c.split(" ")))].filter(c=>/^(onb|gate|or-|nav)/.test(c)).slice(0,25),
  text: document.body.innerText.slice(0, 300),
}));
console.log(JSON.stringify(s, null, 2));
await p.screenshot({ path: "scratchpad/batch1-shots/dbg-postlogin.png" });
await b.close();
