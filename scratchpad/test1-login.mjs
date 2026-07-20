/** Reproduce: what does test1@example.com land on post-login? */
import puppeteer from "puppeteer-core";
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const FE = "http://localhost:5174";
const EMAIL = "test1@example.com";

const b = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"] });
const p = await b.newPage();
await p.setViewport({ width: 1440, height: 1000 });
p.on("pageerror", (e) => console.log(`  [pageerror] ${String(e).slice(0,200)}`));

await p.goto(FE, { waitUntil: "networkidle2" });
await p.waitForSelector(".or-col", { timeout: 20000 });
await p.evaluate(() => document.querySelector('.or-col[data-p="student"]').click());
await p.waitForSelector(".or-dev-input", { visible: true, timeout: 15000 });
await p.evaluate((e) => {
  const em = document.querySelector(".or-dev-input");
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(em, e);
  em.dispatchEvent(new Event("input", { bubbles: true }));
}, EMAIL);
await p.click(".or-dev-btn");

// wait for ANY post-login surface, then report what it is
await new Promise((r) => setTimeout(r, 6000));
const state = await p.evaluate(() => {
  const cls = (s) => !!document.querySelector(s);
  return {
    url: location.href,
    hasRail: cls(".nav-rail"),
    activeRailItem: document.querySelector(".nav-item--active, .nav-avatar--active")?.getAttribute("aria-label")
      || document.querySelector(".nav-item--active")?.textContent?.trim() || null,
    surfaces: {
      profile: cls(".prof-page"),
      dashboard: cls(".dash-root, .dash-page, [class^='dash-']"),
      firstRunTour: cls(".dash-tour"),
      onboarding: cls(".onb-root, .onb-stage"),
      parent: cls(".par-root"),
      tutor: cls(".tut-root"),
      gate: cls(".gate"),
    },
    h1: [...document.querySelectorAll("h1")].map((h) => h.textContent.trim()).slice(0,4),
    bodyStart: document.body.innerText.slice(0, 400),
  };
});
console.log(JSON.stringify(state, null, 2));
await p.screenshot({ path: "scratchpad/test1-shots/postlogin-1440.png" });
await b.close();
