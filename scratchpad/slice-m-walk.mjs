/**
 * slice-m-walk — drive Slice M through the real UI and SCREENSHOT it.
 *
 * 🔴 The screenshots are the POINT of this script, not a by-product. Slice M
 * changes art presentation on the Crew page (bigger, no card, `heroImg` instead
 * of the curated `throneImg`, and `mix-blend-mode` DELETED because the founder's
 * revolve holds a permanent transform — M60). S117 and S118 are two consecutive
 * sessions where a fully green walk shipped visibly broken art on this exact
 * asset, so every assertion below is secondary to looking at the PNGs.
 *
 * Usage: bun scratchpad/slice-m-walk.mjs
 */
import puppeteer from "puppeteer-core";
import { mkdirSync } from "node:fs";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const FE = "http://localhost:5174";
const SHOTS = "scratchpad/slice-m-shots";

let pass = 0;
let fail = 0;
const ok = (name, cond, detail = "") => {
  if (cond) {
    pass++;
    console.log(`  ✅ ${name}`);
  } else {
    fail++;
    console.log(`  ❌ ${name} ${detail}`);
  }
};

const email = `mwalk-${Date.now()}@example.com`;

async function main() {
  mkdirSync(SHOTS, { recursive: true });
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: "new",
    args: ["--no-sandbox", "--window-size=1440,1000"],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 1000 });
  page.on("console", (m) => {
    if (m.type() === "error") console.log(`   [console.error] ${m.text().slice(0, 160)}`);
  });

  // ── sign up fresh, so we walk onboarding from `greet` ────────────────────
  await page.goto(FE, { waitUntil: "networkidle2" });

  // 🔴 THE LANDING IS A TWO-STAGE GATE, and the first version of this script
  // did not know it. The login rail only exists once a PERSONA column is
  // chosen, so a blind "click the button matching /continue/i" found
  // "Continue with Google" and navigated the whole walk to Google's OAuth
  // error page — where every later screenshot was silently taken. Seven
  // identical 45k PNGs, and the assertions never got far enough to redden.
  // Hence: exact selectors (`.or-col`, `.or-dev-input`, `.or-dev-btn`), never
  // a text regex that can match a neighbouring control. (M69/M70 family — an
  // absence is an environment hypothesis first.)
  console.log(`\n── landing → persona → dev-login as ${email} ──`);
  await page.waitForSelector(".or-col", { timeout: 20000 });

  // 🔴 SECOND MISS, same family. `page.click` hit the intro overlay rather than
  // the column (the reveal animation still owned the pointer), so the fallback
  // fired and chose TUTOR — and the walk then asserted a student flow against a
  // tutor login. Dispatching the click on the resolved element sidesteps the
  // overlay entirely, and the persona is now asserted rather than assumed.
  const chose = await page.evaluate(() => {
    const el = document.querySelector('.or-col[data-p="student"]');
    if (!el) return false;
    el.click();
    return true;
  });
  ok("student persona column found and clicked", chose);
  await page.waitForSelector(".or-dev-input", { visible: true, timeout: 15000 });
  const persona = await page.$eval(".or-col.chosen", (e) => e.dataset.p).catch(() => null);
  ok("persona really is STUDENT", persona === "student", `got ${persona}`);

  // 🔴 ORDER IS LOAD-BEARING: `selectRole` calls setEmail(ROLE_EMAIL[p]), so a
  // value typed BEFORE the persona click is silently replaced by the persona's
  // default. The first run typed first and submitted `tutor@example.com`
  // without noticing. Type after, then PROVE the field holds what we meant.
  const typed = await page.evaluate((e) => {
    const em = document.querySelector(".or-dev-input");
    if (!em) return false;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
    setter.call(em, e);
    em.dispatchEvent(new Event("input", { bubbles: true }));
    return true;
  }, email);
  ok("dev email field found", typed);
  const fieldValue = await page.$eval(".or-dev-input", (e) => e.value);
  ok("the field holds OUR email, not the persona default",
     fieldValue === email, `got ${fieldValue}`);

  await page.click(".or-dev-btn");
  // devLogin signs UP first for a fresh address, so this is a real account
  // creation round-trip, not just a sign-in.
  await new Promise((r) => setTimeout(r, 4000));
  // 🔴 Prove we actually LEFT the landing. This is the leg whose absence let
  // the previous run screenshot Google's error page and call it a Crew page.
  const stillLanding = await page.$(".or-dev-input");
  ok("left the landing page (dev login worked)", !stillLanding,
     `url=${page.url()}`);
  ok("did NOT navigate off-origin (no OAuth detour)", page.url().startsWith(FE),
     `url=${page.url()}`);
  await page.screenshot({ path: `${SHOTS}/01-after-login.png` });

  // ── walk onboarding to reach the pronoun row ─────────────────────────────
  console.log(`\n── onboarding ──`);
  const clickText = async (re) =>
    page.evaluate((src) => {
      const rx = new RegExp(src, "i");
      const b = [...document.querySelectorAll("button")].find((x) => rx.test(x.textContent));
      if (b && !b.disabled) {
        b.click();
        return true;
      }
      return false;
    }, re.source);

  await clickText(/let's go|shall we/);
  // 🔴 M70, AND MY OWN WALK PROVED IT AGAIN. The first run asserted the board
  // chips 1.8s after the click and found NONE — then reported three reds that
  // looked exactly like "the founder's chips never shipped". The screenshot
  // showed the beat's prompt still TYPING ("your board, your cl|"): the chips
  // had not rendered yet. An absence is an environment hypothesis before it is
  // a logic one, so wait for the thing itself rather than for a duration.
  await page.waitForSelector(".onb-board", { visible: true, timeout: 20000 });
  await new Promise((r) => setTimeout(r, 900));
  await page.screenshot({ path: `${SHOTS}/02-about-you.png`, fullPage: true });

  // 🔑 THE BOARD ROW — the founder's three chips.
  const boards = await page.$$eval(".onb-board", (els) =>
    els.map((e) => e.textContent.trim()).filter(Boolean),
  );
  console.log(`   boards offered: ${JSON.stringify(boards)}`);
  ok("CBSE offered", boards.some((b) => /cbse/i.test(b)));
  ok("IGCSE offered", boards.some((b) => /igcse/i.test(b)), `got ${JSON.stringify(boards)}`);
  ok("Cambridge offered", boards.some((b) => /cambridge/i.test(b)));

  // Pick CBSE so the flow can finish against real content.
  await page.evaluate(() => {
    const b = [...document.querySelectorAll(".onb-board")].find((x) => /cbse/i.test(x.textContent));
    if (b) b.click();
  });
  await new Promise((r) => setTimeout(r, 1200));

  // 🔑 THE GRADE ROW — Class 9 and 10 only.
  const grades = await page.evaluate(() => {
    const rows = [...document.querySelectorAll(".onb-duo-row")];
    const gr = rows.find((r) => /class/i.test(r.querySelector(".onb-duo-label")?.textContent ?? ""));
    return [...(gr?.querySelectorAll(".onb-board") ?? [])].map((e) => e.textContent.trim());
  });
  console.log(`   grades offered: ${JSON.stringify(grades)}`);
  ok("exactly two grades", grades.length === 2, `got ${JSON.stringify(grades)}`);
  ok("grade 9 offered", grades.includes("9"), `got ${JSON.stringify(grades)}`);
  ok("grade 10 offered", grades.includes("10"), `got ${JSON.stringify(grades)}`);
  ok("no IGCSE/Grade8 in grades", !grades.some((g) => /igcse|grade8/i.test(g)));

  await page.evaluate(() => {
    const rows = [...document.querySelectorAll(".onb-duo-row")];
    const gr = rows.find((r) => /class/i.test(r.querySelector(".onb-duo-label")?.textContent ?? ""));
    const b = [...(gr?.querySelectorAll(".onb-board") ?? [])].find((x) => x.textContent.trim() === "9");
    if (b) b.click();
  });
  await new Promise((r) => setTimeout(r, 600));

  // 🔑 THE PRONOUN STICKERS — picture only, smaller, side by side.
  await page.screenshot({ path: `${SHOTS}/03-pronoun-row.png`, fullPage: true });
  const stickers = await page.$$eval(".onb-duo-sticker", (els) =>
    els.map((e) => {
      const r = e.getBoundingClientRect();
      const img = e.querySelector("img");
      return {
        w: Math.round(r.width),
        h: Math.round(r.height),
        top: Math.round(r.top),
        text: e.textContent.trim(),
        imgAlt: img?.getAttribute("alt") ?? null,
        imgW: img?.naturalWidth ?? 0,
        imgH: img?.naturalHeight ?? 0,
      };
    }),
  );
  console.log(`   stickers: ${JSON.stringify(stickers)}`);
  ok("two stickers", stickers.length === 2);
  // 🔴 The load-bearing art leg: DECODED, not merely present (M69). A 404 gives
  // naturalWidth 0 and every layout assertion below would still pass.
  ok("both sticker images DECODED", stickers.every((s) => s.imgW > 0 && s.imgH > 0),
     JSON.stringify(stickers.map((s) => [s.imgW, s.imgH])));
  // The founder's art is full-body portrait; the placeholders were near-square.
  ok("art is PORTRAIT (the real sketches, not the placeholders)",
     stickers.every((s) => s.imgH > s.imgW), JSON.stringify(stickers.map((s) => [s.imgW, s.imgH])));
  ok("NO he/she text printed", stickers.every((s) => s.text === ""), JSON.stringify(stickers.map((s) => s.text)));
  ok("stickers side by side, not stacked", stickers.length === 2 && stickers[0].top === stickers[1].top,
     JSON.stringify(stickers.map((s) => s.top)));
  ok("stickers are SMALLER than the old 128px basis", stickers.every((s) => s.w <= 112),
     JSON.stringify(stickers.map((s) => s.w)));
  // The alt is now the accessible name — it was "" while a visible label existed.
  ok("alt carries the accessible name", stickers.every((s) => s.imgAlt && s.imgAlt.length > 0),
     JSON.stringify(stickers.map((s) => s.imgAlt)));

  // finish about_you
  await page.evaluate(() => {
    const b = [...document.querySelectorAll(".onb-duo-sticker")][0];
    if (b) b.click();
  });
  await new Promise((r) => setTimeout(r, 500));
  await clickText(/that's me/);
  await new Promise((r) => setTimeout(r, 2200));

  await page.screenshot({ path: `${SHOTS}/04-hero-beat.png`, fullPage: true });

  // 🔴 THE CTA TEXT IS NOT GUESSABLE, and guessing it stalled the previous run
  // on the pet beat forever (every later Crew assertion then reported against
  // an onboarding screen). The beats' CTAs are authored copy that changes per
  // slice — "That's me", "Let's go", the epilogue's own line — so matching on a
  // regex of remembered words is a bet against the copy file.
  // Instead: pick an answer if one is offered, then press whatever enabled
  // button is NOT an answer. Drive to a CONDITION (the app shell's rail), not
  // for a fixed number of rounds.
  const advance = async () =>
    page.evaluate(() => {
      const answered = document.querySelector(
        ".onb-choice.is-picked, .onb-board.is-picked, .onb-duo-sticker.is-picked",
      );
      if (!answered) {
        const pick = document.querySelector(".onb-choice, .onb-board");
        if (pick) {
          pick.click();
          return "picked";
        }
      }
      const cta = [...document.querySelectorAll("button")].find(
        (b) =>
          !b.disabled &&
          // 🔴 EXCLUDE THE OPTIONS, NOT THE PREFIX. The first cut excluded any
          // class containing "onb-duo" — which swallowed `onb-duo-cta`, the
          // "That's me" button itself. The loop then spun 40 times finding
          // "no CTA" on a screen whose CTA was enabled and two pixels away,
          // and reported it as "an IGCSE student cannot finish onboarding" —
          // a product-shaped red for a harness-shaped bug (M47/M66 family).
          !b.className.includes("onb-choice") &&
          !b.className.includes("onb-board") &&
          !b.className.includes("onb-duo-sticker") &&
          !b.className.includes("onb-duo-aside") &&
          !b.className.includes("nav-") &&
          b.offsetParent !== null,
      );
      if (cta) {
        cta.click();
        return `cta:${cta.textContent.trim().slice(0, 24)}`;
      }
      return "none";
    });

  let reachedShell = false;
  for (let i = 0; i < 40; i++) {
    if (await page.$(".nav-item")) {
      reachedShell = true;
      break;
    }
    const what = await advance();
    if (i % 5 === 0) console.log(`   advance[${i}] → ${what}`);
    await new Promise((r) => setTimeout(r, 1100));
  }
  ok("onboarding completed — reached the app shell", reachedShell);
  await new Promise((r) => setTimeout(r, 1500));
  await page.screenshot({ path: `${SHOTS}/05-post-onboarding.png`, fullPage: true });

  // ── THE CREW PAGE ────────────────────────────────────────────────────────
  console.log(`\n── crew ──`);
  const wentCrew = await page.evaluate(() => {
    const b = [...document.querySelectorAll(".nav-item")].find(
      (x) => x.getAttribute("aria-label") === "Crew",
    );
    if (b) {
      b.click();
      return true;
    }
    return false;
  });
  ok("Crew rail item reachable", wentCrew);
  await new Promise((r) => setTimeout(r, 900));

  // the typed title mid-write, then finished
  await page.screenshot({ path: `${SHOTS}/06-crew-title-typing.png` });
  await new Promise((r) => setTimeout(r, 2600));
  await page.screenshot({ path: `${SHOTS}/07-crew-full.png`, fullPage: true });

  // 🔴 M76 — `$eval` THROWS on a missing selector, and a throwing walk kills
  // every leg after it while reporting a SMALLER pass count rather than an
  // honest red. That is exactly what the previous run did at `.crew-head`.
  // Every read below is now guarded and degrades to a red.
  const title = (await page.$(".crew-head"))
    ? await page.$eval(".crew-head", (e) => ({
        aria: e.getAttribute("aria-label"),
        text: e.textContent.trim(),
      }))
    : null;
  ok("crew page rendered (.crew-head present)", !!title);
  if (!title) {
    console.log(`\n${pass} passed, ${fail} failed — ABORTED before the art legs`);
    await browser.close();
    process.exitCode = 1;
    return;
  }
  ok("title typed to completion", title.text === title.aria, JSON.stringify(title));
  ok("title has an accessible name", !!title.aria && title.aria.length > 0);

  const art = await page.$$eval(".crew-art", (els) =>
    els.map((e) => {
      const cs = getComputedStyle(e);
      const r = e.getBoundingClientRect();
      return {
        h: Math.round(r.height),
        w: Math.round(r.width),
        natW: e.naturalWidth,
        natH: e.naturalHeight,
        blend: cs.mixBlendMode,
        anim: cs.animationName,
        mask: cs.maskImage !== "none",
        src: e.getAttribute("src").split("/").pop(),
      };
    }),
  );
  console.log(`   art: ${JSON.stringify(art, null, 1)}`);
  ok("crew art present", art.length >= 1);
  ok("crew art DECODED", art.every((a) => a.natW > 0 && a.natH > 0));
  ok("crew art is BIGGER than the old 190px", art.every((a) => a.h > 190),
     JSON.stringify(art.map((a) => a.h)));
  // 🔴 M60 — the revolve and the blend cannot coexist. Assert the blend is GONE
  // rather than trusting the comment: a stale `multiply` here would be dead CSS
  // that reads as a live guard.
  ok("mix-blend-mode is OFF (M60 — the revolve holds a transform)",
     art.every((a) => a.blend === "normal"), JSON.stringify(art.map((a) => a.blend)));
  ok("the feather mask is doing the edge work instead", art.every((a) => a.mask));
  ok("the revolve animation is attached", art.every((a) => /crew-revolve/.test(a.anim)),
     JSON.stringify(art.map((a) => a.anim)));

  // 🔴 The leg the SCREENSHOT bought. Everything above was green on the run
  // whose picture showed the two columns' names and cards sitting at different
  // heights — because the hero's art is taller and, with the card removed,
  // nothing aligned them any more. Measuring the name baselines is what turns
  // "I looked at it once" into something that stays true.
  const names = await page.$$eval(".crew-name", (els) =>
    els.map((e) => Math.round(e.getBoundingClientRect().top)),
  );
  ok("both columns' names share a baseline", names.length < 2 || names[0] === names[1],
     JSON.stringify(names));

  // the card is gone
  const pickBg = await page.$$eval(".crew-pick", (els) =>
    els.map((e) => {
      const cs = getComputedStyle(e);
      return { bg: cs.backgroundColor, shadow: cs.boxShadow };
    }),
  );
  ok("no background card behind the character",
     pickBg.every((p) => p.bg === "rgba(0, 0, 0, 0)" || p.bg === "transparent"),
     JSON.stringify(pickBg.map((p) => p.bg)));
  ok("no card shadow either", pickBg.every((p) => p.shadow === "none"),
     JSON.stringify(pickBg.map((p) => p.shadow)));

  // sparkle rail + hover reveal
  const sparkle = await page.evaluate(() => {
    const b = [...document.querySelectorAll(".nav-item")].find(
      (x) => x.getAttribute("aria-label") === "Crew",
    );
    return { hasSvg: !!b?.querySelector("svg"), tipArt: !!b?.querySelector(".nav-tip-art") };
  });
  ok("Crew rail item still has an accessible name", wentCrew);
  ok("rail item renders an icon", sparkle.hasSvg);
  ok("rail item carries hover art", sparkle.tipArt);

  await page.hover('.nav-item[aria-label="Crew"]');
  await new Promise((r) => setTimeout(r, 700));
  await page.screenshot({ path: `${SHOTS}/08-rail-hover-hero.png` });
  const tip = (await page.$(".nav-tip-art"))
    ? await page.$eval(".nav-tip-art", (e) => ({
        natW: e.naturalWidth,
        h: Math.round(e.getBoundingClientRect().height),
        vis: getComputedStyle(e.closest(".nav-tip")).opacity,
      }))
    : null;
  ok("hover hero art present", !!tip);
  ok("hover hero art DECODED", !!tip && tip.natW > 0, JSON.stringify(tip));
  ok("hover tip is visible on hover", !!tip && Number(tip.vis) > 0.5, JSON.stringify(tip));

  // ── 390 phone ────────────────────────────────────────────────────────────
  console.log(`\n── 390 phone ──`);
  await page.setViewport({ width: 390, height: 844 });
  await new Promise((r) => setTimeout(r, 1200));
  await page.screenshot({ path: `${SHOTS}/09-crew-390.png`, fullPage: true });
  const art390 = await page.$$eval(".crew-art", (els) =>
    els.map((e) => Math.round(e.getBoundingClientRect().height)),
  );
  ok("art re-based for phone (fits the viewport)", art390.every((h) => h <= 260),
     JSON.stringify(art390));

  // ── the IGCSE student: an offered board with NOTHING behind it ───────────
  //
  // 🔴 THE LOAD-BEARING POPULATION OF THIS SLICE. Hardcoding a third chip is
  // only safe if picking it (a) does not crash on a missing board row and (b)
  // lands somewhere honest. Both halves are asserted here, on a SECOND fresh
  // identity, because the first one committed to cbse and a board is a
  // one-way door in onboarding.
  console.log(`\n── igcse: an empty board must still let a student IN ──`);
  await page.setViewport({ width: 1440, height: 1000 });
  const email2 = `mwalk-igcse-${Date.now()}@example.com`;
  const ctx2 = await browser.createBrowserContext();
  const p2 = await ctx2.newPage();
  await p2.setViewport({ width: 1440, height: 1000 });
  await p2.goto(FE, { waitUntil: "networkidle2" });
  await p2.waitForSelector(".or-col", { timeout: 20000 });
  await p2.evaluate(() => document.querySelector('.or-col[data-p="student"]').click());
  await p2.waitForSelector(".or-dev-input", { visible: true, timeout: 15000 });
  await p2.evaluate((e) => {
    const em = document.querySelector(".or-dev-input");
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
    setter.call(em, e);
    em.dispatchEvent(new Event("input", { bubbles: true }));
  }, email2);
  await p2.click(".or-dev-btn");
  await new Promise((r) => setTimeout(r, 4000));

  await p2.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((x) => /let's go|shall we/i.test(x.textContent));
    if (b) b.click();
  });
  await p2.waitForSelector(".onb-board", { visible: true, timeout: 20000 });
  await new Promise((r) => setTimeout(r, 800));

  const pickedIgcse = await p2.evaluate(() => {
    const b = [...document.querySelectorAll(".onb-board")].find((x) => /igcse/i.test(x.textContent));
    if (!b) return false;
    b.click();
    return true;
  });
  ok("IGCSE is pickable", pickedIgcse);
  await new Promise((r) => setTimeout(r, 1500));
  await p2.screenshot({ path: `${SHOTS}/10-igcse-picked.png`, fullPage: true });

  // 🔴 The crash guard. Without the `board` row, chooseBoard throws
  // BoardNotFound and the student is stuck here with an error.
  const errText = await p2.evaluate(() => document.querySelector(".onb-err")?.textContent ?? "");
  ok("no BOARD_NOT_FOUND error on picking IGCSE", !/not found|no board|error/i.test(errText),
     `got "${errText}"`);

  // Class 9/10 must be offered on a board with NO subjects at all — this is the
  // whole reason grade became a constant instead of a filtered catalogue read.
  const g2 = await p2.evaluate(() => {
    const rows = [...document.querySelectorAll(".onb-duo-row")];
    const gr = rows.find((r) => /class/i.test(r.querySelector(".onb-duo-label")?.textContent ?? ""));
    return [...(gr?.querySelectorAll(".onb-board") ?? [])].map((e) => e.textContent.trim());
  });
  ok("grades still offered on a contentless board (no trap)", g2.length === 2,
     JSON.stringify(g2));

  // drive to the shell
  let shell2 = false;
  for (let i = 0; i < 40; i++) {
    if (await p2.$(".nav-item")) {
      shell2 = true;
      break;
    }
    await p2.evaluate(() => {
      const answered = document.querySelector(
        ".onb-choice.is-picked, .onb-board.is-picked, .onb-duo-sticker.is-picked",
      );
      const rows = [...document.querySelectorAll(".onb-duo-row")];
      for (const r of rows) {
        if (!r.querySelector(".is-picked")) {
          const o = r.querySelector(".onb-board, .onb-duo-sticker");
          if (o) {
            o.click();
            return;
          }
        }
      }
      if (!answered) {
        const pick = document.querySelector(".onb-choice");
        if (pick) {
          pick.click();
          return;
        }
      }
      const cta = [...document.querySelectorAll("button")].find(
        (b) =>
          !b.disabled &&
          // 🔴 EXCLUDE THE OPTIONS, NOT THE PREFIX. The first cut excluded any
          // class containing "onb-duo" — which swallowed `onb-duo-cta`, the
          // "That's me" button itself. The loop then spun 40 times finding
          // "no CTA" on a screen whose CTA was enabled and two pixels away,
          // and reported it as "an IGCSE student cannot finish onboarding" —
          // a product-shaped red for a harness-shaped bug (M47/M66 family).
          !b.className.includes("onb-choice") &&
          !b.className.includes("onb-board") &&
          !b.className.includes("onb-duo-sticker") &&
          !b.className.includes("onb-duo-aside") &&
          !b.className.includes("nav-") &&
          b.offsetParent !== null,
      );
      if (cta) cta.click();
    });
    await new Promise((r) => setTimeout(r, 1100));
  }
  // 🔴 THIS is the assertion the founder's whole board decision rests on: an
  // IGCSE student is not trapped in onboarding.
  ok("an IGCSE student can FINISH onboarding and reach the app", shell2);
  await new Promise((r) => setTimeout(r, 2000));
  await p2.screenshot({ path: `${SHOTS}/11-igcse-dashboard.png`, fullPage: true });

  const bsu = await p2.evaluate(() => {
    const el = document.querySelector(".bsu");
    return el ? el.textContent : null;
  });
  ok("the 'Olórin is still setting this up' panel is shown", !!bsu, `got ${bsu}`);
  ok("it does NOT say 'Nothing matches'", !/nothing matches/i.test(bsu ?? ""), `got ${bsu}`);

  // and on the Revision landing, which is where the `Nothing matches ""` bug was
  await p2.evaluate(() => {
    const b = [...document.querySelectorAll(".nav-item")].find(
      (x) => x.getAttribute("aria-label") === "Revision",
    );
    if (b) b.click();
  });
  await new Promise((r) => setTimeout(r, 2500));
  await p2.screenshot({ path: `${SHOTS}/12-igcse-revision.png`, fullPage: true });
  const revText = await p2.evaluate(() => document.body.innerText);
  ok("revision landing shows the setting-up panel too", /setting this up/i.test(revText));
  ok("revision landing does NOT show the empty-query search lie",
     !/nothing matches ""/i.test(revText));

  console.log(`\n${pass} passed, ${fail} failed`);
  console.log(`shots → ${SHOTS}/`);
  await browser.close();
  process.exitCode = fail > 0 ? 1 : 0;
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
