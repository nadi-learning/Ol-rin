import puppeteer from "puppeteer-core";
const CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const b=await puppeteer.launch({executablePath:CHROME,headless:"new",args:["--no-sandbox"]});
const p=await b.newPage(); await p.setViewport({width:1440,height:1000});
p.on("response", async r=>{ if(/trpc|auth/.test(r.url())&&r.status()>=400){let t="";try{t=(await r.text()).slice(0,200);}catch{}; console.log(`[HTTP ${r.status()}]`, r.url().split("/").pop().slice(0,50), t);}});
await p.goto("https://olorin.nadilearning.com/",{waitUntil:"networkidle2"});
await p.waitForSelector(".or-col",{timeout:25000});
// click the TUTOR persona
await p.evaluate(()=>document.querySelector('.or-col[data-p="tutor"]').click());
await p.waitForSelector(".or-dev-input",{visible:true,timeout:15000});
console.log("email prefilled as:", await p.$eval(".or-dev-input", e=>e.value));
await p.click(".or-dev-btn");
await new Promise(r=>setTimeout(r,9000));
const s=await p.evaluate(()=>({
  onboarding: !!document.querySelector(".onb-root"),
  tutor: !!document.querySelector(".tut-root"),
  rail: !!document.querySelector(".nav-rail"),
  parent: !!document.querySelector(".par-root"),
  text: document.body.innerText.slice(0,180),
}));
console.log(JSON.stringify(s,null,2));
await p.screenshot({path:"scratchpad/batch1-shots/prod-tutor.png"});
await b.close();
