import puppeteer from "puppeteer-core";
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const b = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"] });
const p = await b.newPage();
p.on("response", async (r) => {
  const u = r.url();
  if (/auth|trpc/.test(u) && r.status() >= 400) {
    let body = ""; try { body = (await r.text()).slice(0,200); } catch {}
    console.log(`[HTTP ${r.status()}] ${u.slice(0,90)} ${body}`);
  }
});
await p.goto("http://localhost:5174", { waitUntil: "networkidle2" });
await p.waitForSelector(".or-col", { timeout: 20000 });
await p.evaluate(() => document.querySelector('.or-col[data-p="student"]').click());
await p.waitForSelector(".or-dev-input", { visible: true, timeout: 15000 });
await p.evaluate((e) => {
  const el = document.querySelector(".or-dev-input");
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value").set.call(el, e);
  el.dispatchEvent(new Event("input", { bubbles: true }));
}, `dbg2-${Date.now()}@example.com`);
await p.click(".or-dev-btn");
await new Promise(r => setTimeout(r, 7000));
console.log("error el:", await p.evaluate(() => document.querySelector(".or-err,.or-error")?.textContent ?? "(none)"));
console.log("btn text:", await p.evaluate(() => document.querySelector(".or-dev-btn")?.textContent));
await b.close();
