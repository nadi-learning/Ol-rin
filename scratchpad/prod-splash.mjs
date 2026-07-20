import puppeteer from "puppeteer-core";
const CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const b=await puppeteer.launch({executablePath:CHROME,headless:"new",args:["--no-sandbox"]});
const p=await b.newPage(); await p.setViewport({width:1440,height:1000});
let renders=0;
p.on("console",m=>{ if(/mount|render/i.test(m.text())) console.log("[c]",m.text().slice(0,80)); });
p.on("response", r=>{ const u=r.url(); if(/get-session|trpc/.test(u)) renders++; });
await p.goto("https://olorin.nadilearning.com/",{waitUntil:"networkidle2"});
console.log("sampling .or-word every 1.5s for 30s...");
const seen=[];
for(let i=0;i<20;i++){
  const s=await p.evaluate(()=>({
    word: document.querySelector(".or-word")?.textContent?.trim(),
    splashGone: !!document.querySelector(".or-splash.is-gone"),
    splashDisplay: document.querySelector(".or-splash") ? getComputedStyle(document.querySelector(".or-splash")).display : "absent",
  }));
  seen.push(`${(i*1.5).toFixed(1)}s ${s.word ?? "-"} gone=${s.splashGone} disp=${s.splashDisplay}`);
  await new Promise(r=>setTimeout(r,1500));
}
seen.forEach(x=>console.log("  ",x));
console.log("session/trpc requests during 30s:", renders);
await b.close();
