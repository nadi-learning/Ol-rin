import puppeteer from "puppeteer-core";
const CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const b=await puppeteer.launch({executablePath:CHROME,headless:"new",args:["--no-sandbox"]});
const p=await b.newPage(); await p.setViewport({width:1440,height:1000});
await p.goto("http://localhost:5174",{waitUntil:"networkidle2"});
await p.waitForSelector(".or-col",{timeout:20000});
await p.evaluate(()=>document.querySelector('.or-col[data-p="student"]').click());
await p.waitForSelector(".or-dev-input",{visible:true,timeout:15000});
await p.evaluate((e)=>{const el=document.querySelector(".or-dev-input");
 Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value").set.call(el,e);
 el.dispatchEvent(new Event("input",{bubbles:true}));},`dbg6-${Date.now()}@example.com`);
await p.click(".or-dev-btn");
await p.waitForSelector(".onb-root",{timeout:25000}); await new Promise(r=>setTimeout(r,3000));
await p.evaluate(()=>{const x=[...document.querySelectorAll(".onb-btn")].find(y=>/let's go|shall we|begin/i.test(y.textContent)); if(x)x.click();});
await p.waitForSelector(".onb-board",{visible:true,timeout:20000}); await new Promise(r=>setTimeout(r,1200));
await p.evaluate(()=>{const c=[...document.querySelectorAll(".onb-board")].find(x=>/cbse/i.test(x.textContent)); if(c)c.click();});
await new Promise(r=>setTimeout(r,1500));
await p.evaluate(()=>{const g=[...document.querySelectorAll(".onb-board")].find(x=>["9","10"].includes(x.textContent.trim())); if(g)g.click();});
await new Promise(r=>setTimeout(r,800));
await p.evaluate(()=>{const s=document.querySelector(".onb-duo-sticker"); if(s)s.click();});
await new Promise(r=>setTimeout(r,800));
await p.evaluate(()=>{const c=document.querySelector(".onb-duo-cta"); if(c&&!c.disabled)c.click();});
await new Promise(r=>setTimeout(r,3500));
for(let i=0;i<14;i++){
  const s=await p.evaluate(()=>({
    prompt:document.querySelector(".onb-stage-prompt")?.textContent?.trim().slice(0,48),
    title:document.querySelector(".onb-page-title")?.textContent?.trim().slice(0,40),
    field:!!document.querySelector(".onb-field"),
    choices:[...document.querySelectorAll(".onb-choice")].length,
    btns:[...document.querySelectorAll("button")].map(e=>e.textContent.trim().slice(0,12)).slice(0,7),
  }));
  console.log(`${i}: field=${s.field} choices=${s.choices} prompt="${s.prompt??s.title}" btns=${JSON.stringify(s.btns)}`);
  if(s.field){console.log("REACHED PHONE at step",i);break;}
  await p.evaluate(()=>{
    const c=document.querySelector(".onb-choice"); if(c){c.click();return;}
    const n=[...document.querySelectorAll("button")].find(x=>/^(next|continue)$/i.test(x.textContent.trim())); if(n)n.click();
  });
  await new Promise(r=>setTimeout(r,2000));
}
await b.close();
