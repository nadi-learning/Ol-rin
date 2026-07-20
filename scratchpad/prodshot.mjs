import { chromium } from "playwright-core";
const b = await chromium.launch({ executablePath:"/Users/mab/Library/Caches/ms-playwright/chromium-1223/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing" });
const ctx = await b.newContext({ viewport:{width:1440,height:900} });
const p = await ctx.newPage();
const errs=[]; p.on("console",m=>{if(m.type()==="error")errs.push(m.text())});
await p.goto("https://olorin.nadilearning.com", { waitUntil:"networkidle" });
await p.waitForTimeout(6000);
await p.screenshot({ path:"/tmp/prod-landing.png" });
const s = await p.evaluate(()=>({
  google: !!document.querySelector(".or-gbtn"),
  devForm: !!document.querySelector(".or-dev-input, .or-dev-btn"),
  cards: document.querySelectorAll(".or-card, [class*=persona]").length,
  title: document.title,
}));
console.log(JSON.stringify(s));
console.log("console errors:", errs.length ? errs.slice(0,5) : "none");
await b.close();
