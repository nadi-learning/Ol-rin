import puppeteer from "puppeteer-core";
const CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const b=await puppeteer.launch({executablePath:CHROME,headless:"new",args:["--no-sandbox"]});
const p=await b.newPage(); await p.setViewport({width:1440,height:1000});
await p.goto("https://olorin.nadilearning.com/",{waitUntil:"networkidle2"});
await p.waitForSelector(".or-col",{timeout:25000});
await p.evaluate(()=>document.querySelector('.or-col[data-p="student"]').click());
await p.waitForSelector(".or-dev-input",{visible:true,timeout:15000});
await p.click(".or-dev-btn");
await new Promise(r=>setTimeout(r,9000));
const s=await p.evaluate(()=>({
  rail: !!document.querySelector(".nav-rail"),
  onboarding: !!document.querySelector(".onb-root"),
  soonSticker: !!document.querySelector(".nav-soon"),
  text: document.body.innerText.slice(0,150),
}));
console.log("STUDENT:", JSON.stringify(s,null,2));
await p.screenshot({path:"scratchpad/batch1-shots/prod-student.png"});
await b.close();
