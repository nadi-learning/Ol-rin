/**
 * batch1-walk — the three shipped changes, driven as a student would meet them.
 *
 *   1. phone: no Skip, invalid rejected, valid accepted, +91 normalised
 *   2. Journal: the typed explainer
 *   3. Crew: rail "soon" sticker + the hero/pet role lines
 *
 * Harness rules, all of them paid for in earlier sessions:
 *   - wait on SELECTORS, never on durations (M70)
 *   - guard every read; `page.$eval` THROWS on a missing selector and kills the
 *     run mid-way, which under-reports as a pass (M76)
 *   - never match /continue/i on the landing page — it hits "Continue with
 *     Google" and screenshots an OAuth error page (S120)
 *   - set the email AFTER the persona click; selectRole overwrites it (S120)
 */
import puppeteer from "puppeteer-core";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const FE = "http://localhost:5174";
const WIDTH = Number(process.argv[2] ?? 1440);
const SHOTS = `scratchpad/batch1-shots/${WIDTH}`;

let pass = 0,
  fail = 0;
const check = (name, ok, detail) => {
  if (ok) {
    pass++;
    console.log(`  ✓ ${name}`);
  } else {
    fail++;
    console.log(`  ✗ ${name}${detail === undefined ? "" : `  [${detail}]`}`);
  }
};

// Every read goes through here. Returns a sentinel instead of throwing, so a
// missing element reddens ONE leg rather than aborting the walk.
const read = async (p, sel, fn) => {
  try {
    const el = await p.$(sel);
    if (!el) return null;
    return await p.$eval(sel, fn);
  } catch {
    return null;
  }
};
const count = async (p, sel) => {
  try {
    return (await p.$$(sel)).length;
  } catch {
    return -1;
  }
};
// A wait that REDDENS instead of throwing. An unguarded waitForSelector aborts
// the whole run on its first miss, and a run that dies half-way reports fewer
// failures than it found — it looks better than a real red (M76).
const waitOr = async (p, sel, why, timeout = 25000) => {
  try {
    await p.waitForSelector(sel, { visible: true, timeout });
    return true;
  } catch {
    check(`REACHED: ${why}`, false, `never saw ${sel}`);
    return false;
  }
};

/**
 * Advance to `targetSel`, clicking through any story pages in the way.
 *
 * The beats are separated by narrative pages carrying a single "Next" — so a
 * walk that picks a hero and then waits for the phone field waits forever, with
 * the flow sitting one click away the whole time. Polls for the target rather
 * than assuming a fixed number of pages, because the page COUNT is copy and
 * copy changes.
 */
const advanceTo = async (p, targetSel, why, tries = 10) => {
  for (let i = 0; i < tries; i++) {
    if (await p.$(targetSel)) return true;
    await p.evaluate(() => {
      const n = [...document.querySelectorAll("button")].find((x) =>
        /^(next|continue)$/i.test(x.textContent.trim()),
      );
      if (n) n.click();
    });
    await new Promise((r) => setTimeout(r, 1500));
  }
  const ok = Boolean(await p.$(targetSel));
  if (!ok) check(`REACHED: ${why}`, false, `never saw ${targetSel} after ${tries} advances`);
  return ok;
};

const setInput = (p, sel, v) =>
  p.evaluate(
    (s, val) => {
      const el = document.querySelector(s);
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(el, val);
      el.dispatchEvent(new Event("input", { bubbles: true }));
    },
    sel,
    v,
  );
const clickText = (p, sel, re) =>
  p.evaluate(
    (s, r) => {
      const b = [...document.querySelectorAll(s)].find((x) => new RegExp(r, "i").test(x.textContent));
      if (b) b.click();
      return Boolean(b);
    },
    sel,
    re.source ?? re,
  );

const b = await puppeteer.launch({
  executablePath: CHROME,
  headless: "new",
  args: ["--no-sandbox"],
});
const p = await b.newPage();
await p.setViewport({ width: WIDTH, height: WIDTH < 500 ? 780 : 1000 });
p.on("pageerror", (e) => console.log(`  [pageerror] ${String(e).slice(0, 160)}`));

const email = `b1walk-${Date.now()}@example.com`;
console.log(`\n=== batch1 walk @ ${WIDTH}px — ${email} ===\n`);

// ── sign in as a brand-new student ────────────────────────────────────────
await p.goto(FE, { waitUntil: "networkidle2" });
await p.waitForSelector(".or-col", { timeout: 20000 });
await p.evaluate(() => document.querySelector('.or-col[data-p="student"]').click());
await p.waitForSelector(".or-dev-input", { visible: true, timeout: 15000 });
await setInput(p, ".or-dev-input", email); // AFTER the persona click
await p.click(".or-dev-btn");

// ── onboarding ────────────────────────────────────────────────────────────
console.log("1. onboarding → the phone step");
// `.onb-root` IS the root. The first run's timeout here was a WEDGED BACKEND
// (two `bun --hot` servers on :3010, sign-in hanging forever), not a bad
// selector — I changed the selector first and was wrong. Measure before
// editing; a timeout says "did not appear", never "does not exist".
await waitOr(p, ".onb-root", "onboarding never rendered after sign-in");
// greet: a talk-only beat with a single CTA. Scoped to .onb-btn so it can
// never reach the landing page's Google button.
await waitOr(p, ".onb-btn", "greet CTA");
await clickText(p, ".onb-btn", /let's go|shall we|begin/);

// about_you — board, then grade, then pronoun sticker
await waitOr(p, ".onb-board", "board chips");
await p.evaluate(() => {
  const cbse = [...document.querySelectorAll(".onb-board")].find((x) => /cbse/i.test(x.textContent));
  (cbse ?? document.querySelector(".onb-board")).click();
});
// ⚠️ Grade chips are ALSO `.onb-board` — both rows use `row.style === "board"`,
// so there is no `.onb-chip` in this flow at all. Selected by exact text so it
// can never re-click an exam board.
await new Promise((r) => setTimeout(r, 900));
const gradePicked = await p.evaluate(() => {
  const g = [...document.querySelectorAll(".onb-board")].find((x) =>
    ["9", "10"].includes(x.textContent.trim()),
  );
  if (g) g.click();
  return Boolean(g);
});
check("about_you: a grade chip is offered after the board is picked", gradePicked);
await waitOr(p, ".onb-duo-sticker", "pronoun stickers");
await p.evaluate(() => document.querySelector(".onb-duo-sticker").click());
await p.waitForSelector(".onb-duo-cta:not([disabled])", { timeout: 20000 });
await p.evaluate(() => document.querySelector(".onb-duo-cta").click());

// fav_character — reached through the story page(s) after about_you.
await advanceTo(p, ".onb-choice", "the hero picker");
await p.evaluate(() => document.querySelector(".onb-choice")?.click());

// pet — same again. `.onb-choice` is still on screen mid-transition, so wait
// for it to be REPLACED (the prompt changes) rather than re-clicking the hero.
await new Promise((r) => setTimeout(r, 2200));
await advanceTo(p, ".onb-choice", "the pet picker");
await p.evaluate(() => document.querySelector(".onb-choice")?.click());
await new Promise((r) => setTimeout(r, 2200));

// ── the phone beat ────────────────────────────────────────────────────────
const atPhone = await advanceTo(p, ".onb-field", "the phone beat");
await p.screenshot({ path: `${SHOTS}/1-phone-empty.png` });

check("phone: the Skip button is GONE", (await count(p, ".onb-skip")) === 0);
check(
  "phone: input is type=tel (numeric keypad on a phone)",
  (await read(p, ".onb-field", (e) => e.getAttribute("type"))) === "tel",
);
check(
  "phone: placeholder states the rule",
  /10.digit/i.test((await read(p, ".onb-field", (e) => e.placeholder)) ?? ""),
);
check("phone: Send is disabled on an empty field", await read(p, ".onb-btn", (e) => e.disabled));
check("phone: no hint shown before typing (don't scold an untouched field)", (await count(p, ".onb-field-hint")) === 0);

// invalid — a landline-shaped number
await setInput(p, ".onb-field", "1234567890");
await p.waitForSelector(".onb-field-hint", { visible: true, timeout: 8000 }).catch(() => {});
check("phone: 10 digits starting 1 is REJECTED (Send stays disabled)", await read(p, ".onb-btn", (e) => e.disabled));
check("phone: and the hint appears", (await count(p, ".onb-field-hint")) === 1);
check(
  "phone: the hint names the actual rule",
  /6, 7, 8 or 9/.test((await read(p, ".onb-field-hint", (e) => e.textContent)) ?? ""),
);
check(
  "phone: the field is marked invalid for a screen reader",
  (await read(p, ".onb-field", (e) => e.getAttribute("aria-invalid"))) === "true",
);
await p.screenshot({ path: `${SHOTS}/2-phone-invalid.png` });

// too short
await setInput(p, ".onb-field", "987654321");
check("phone: nine digits is REJECTED", await read(p, ".onb-btn", (e) => e.disabled));

// valid, entered in the messy real-world form
await setInput(p, ".onb-field", "+91 98765 43210");
await new Promise((r) => setTimeout(r, 250));
check(
  "🔑 phone: '+91 98765 43210' is ACCEPTED (normalised, not rejected)",
  (await read(p, ".onb-btn", (e) => e.disabled)) === false,
);
check("phone: the hint clears once valid", (await count(p, ".onb-field-hint")) === 0);
await p.screenshot({ path: `${SHOTS}/3-phone-valid.png` });

await p.evaluate(() => document.querySelector(".onb-btn").click());

// ── the app ───────────────────────────────────────────────────────────────
console.log("\n2. into the app");
await p.waitForSelector(".nav-rail, .bottom-nav", { timeout: 60000 });
await new Promise((r) => setTimeout(r, 1200));
check("🔑 the student reached the app (phone did not trap them)", (await count(p, ".nav-rail")) > 0);
await p.screenshot({ path: `${SHOTS}/4-dashboard.png` });

// ── the rail sticker ──────────────────────────────────────────────────────
console.log("\n3. the Crew rail sticker");
check("rail: a 'soon' sticker is rendered", (await count(p, ".nav-soon")) === 1);
check(
  "rail: it reads 'soon'",
  /soon/i.test((await read(p, ".nav-soon", (e) => e.textContent)) ?? ""),
);
check(
  "rail: it is VISIBLE, not merely present (M69's shape)",
  await read(p, ".nav-soon", (e) => {
    const r = e.getBoundingClientRect();
    const s = getComputedStyle(e);
    return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.opacity !== "0";
  }),
);
check(
  "rail: 'coming soon' reaches a screen reader through the button name",
  /coming soon/i.test(
    (await read(p, ".nav-soon", (e) => e.closest("button")?.getAttribute("aria-label"))) ?? "",
  ),
);
check(
  "rail: the sticker sits ON the Crew item, not some other one",
  (await read(p, ".nav-soon", (e) => e.closest("button")?.getAttribute("aria-label"))) ===
    "Crew - coming soon",
);

// ── Journal ───────────────────────────────────────────────────────────────
console.log("\n4. Journal — the typed explainer");
await p.evaluate(() => {
  const j = [...document.querySelectorAll("button")].find((x) =>
    /journal/i.test(x.getAttribute("aria-label") ?? ""),
  );
  if (j) j.click();
});
await p.waitForSelector(".jrnl-sub", { timeout: 20000 });
// Mid-type: the caret should be alive and the text still growing.
const early = (await read(p, ".jrnl-sub", (e) => e.textContent)) ?? "";
await p.screenshot({ path: `${SHOTS}/5-journal-typing.png` });
check("journal: a caret is showing while it types", (await count(p, ".jrnl-caret")) === 1);

// Let it finish.
await p.waitForFunction(() => !document.querySelector(".jrnl-caret"), { timeout: 25000 }).catch(() => {});
const full = (await read(p, ".jrnl-sub", (e) => e.textContent)) ?? "";
check("🔑 journal: the text GREW — it is typed, not pasted", full.length > early.length, `${early.length}→${full.length}`);
check("journal: the caret is gone when finished", (await count(p, ".jrnl-caret")) === 0);
check("journal: it explains what a journal IS", /journal is where you tell me/i.test(full));
check("journal: it says who else can read it", /nobody else reads it/i.test(full));
check(
  "journal: it renders as THREE lines, not one run-on paragraph",
  (await read(p, ".jrnl-sub", (e) => getComputedStyle(e).whiteSpace)) === "pre-line",
);
check(
  "journal: the full text is in the a11y tree from the start (not typed at a screen reader)",
  /nobody else reads it/i.test((await read(p, ".jrnl-sub", (e) => e.getAttribute("aria-label"))) ?? ""),
);
check(
  "journal: the explainer does not overflow its column",
  await read(p, ".jrnl-sub", (e) => e.scrollWidth <= e.clientWidth + 1),
);
await p.screenshot({ path: `${SHOTS}/6-journal-done.png` });

// ── Crew ──────────────────────────────────────────────────────────────────
console.log("\n5. Crew — the hero/pet roles");
await p.evaluate(() => {
  const c = [...document.querySelectorAll("button")].find((x) =>
    /^Crew/.test(x.getAttribute("aria-label") ?? ""),
  );
  if (c) c.click();
});
await p.waitForSelector(".crew-role", { timeout: 20000 });
await new Promise((r) => setTimeout(r, 2600)); // the title types first
const roles = await p.$$eval(".crew-role", (els) => els.map((e) => e.textContent.trim()));
check("crew: both columns name a role", roles.length === 2, JSON.stringify(roles));
check(
  "🔑 crew: the roles say what each one DOES, not just that they exist",
  roles.some((r) => /explains things/i.test(r)) && roles.some((r) => /keeps you company/i.test(r)),
  JSON.stringify(roles),
);
check(
  "crew: the two roles are actually different",
  roles.length === 2 && roles[0] !== roles[1],
);
// The art must be decoded, not a broken box (M69 / S117 / S118 — three sessions
// where a green probe shipped a hole or a page scene into a small slot).
const art = await p.$$eval(".crew-art", (els) =>
  els.map((e) => ({ w: e.naturalWidth, h: e.naturalHeight })),
);
check("crew: every character image DECODED", art.length > 0 && art.every((a) => a.w > 0), JSON.stringify(art));
await p.screenshot({ path: `${SHOTS}/7-crew.png`, fullPage: true });

console.log(`\n${pass} passed, ${fail} failed  (${WIDTH}px)\n`);
await b.close();
process.exit(fail ? 1 : 0);
