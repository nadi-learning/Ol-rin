import puppeteer from "puppeteer-core";
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const b = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"] });
const p = await b.newPage();
await p.setViewport({ width: 1440, height: 1000 });
const dump = async (label) => {
  const s = await p.evaluate(() => [...new Set([...document.querySelectorAll("[class]")]
    .map(e=>e.className).filter(c=>typeof c==="string").flatMap(c=>c.split(" ")))]
    .filter(c=>/^onb/.test(c)).sort());
  console.log(`\n[${label}] onb-* classes:\n  ${s.join(", ")}`);
};
await p.goto("http://localhost:5174", { waitUntil: "networkidle2" });
await p.waitForSelector(".or-col", { timeout: 20000 });
await p.evaluate(() => document.querySelector('.or-col[data-p="student"]').click());
await p.waitForSelector(".or-dev-input", { visible: true, timeout: 15000 });
await p.evaluate((e) => { const el=document.querySelector(".or-dev-input");
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value").set.call(el,e);
  el.dispatchEvent(new Event("input",{bubbles:true})); }, `dbg3-${Date.now()}@example.com`);
await p.click(".or-dev-btn");
await new Promise(r=>setTimeout(r,6000));
await dump("after sign-in (greet)");
await p.evaluate(() => { const x=[...document.querySelectorAll("button")].find(y=>/let's go|shall we|begin/i.test(y.textContent)); if(x)x.click(); });
await new Promise(r=>setTimeout(r,3500));
await dump("about_you");
console.log("  duo rows:", await p.evaluate(()=>[...document.querySelectorAll(".onb-duo-row,.onb-duo-opts")].length));
console.log("  board chips:", await p.evaluate(()=>[...document.querySelectorAll(".onb-board")].map(e=>e.textContent.trim())));
await p.evaluate(() => { const c=[...document.querySelectorAll(".onb-board")].find(x=>/cbse/i.test(x.textContent)); if(c)c.click(); });
await new Promise(r=>setTimeout(r,2500));
await dump("after board pick");
console.log("  all buttons:", await p.evaluate(()=>[...document.querySelectorAll("button")].map(e=>`${e.className}|${e.textContent.trim().slice(0,14)}`).slice(0,22)));
await p.screenshot({ path: "scratchpad/batch1-shots/dbg-aboutyou.png" });
await b.close();
