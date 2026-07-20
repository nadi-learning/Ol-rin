/**
 * Slice H walk (S115) — the FIRST-RUN DASHBOARD, in a real browser (M37).
 *
 * Why a walk and not just a probe: everything this slice is made of is invisible
 * to a service test. The tour is a typed sentence, a staggered rise-in, a
 * once-per-session rule that only exists across a NAVIGATION, and a retirement
 * condition that fires on a real event write. `probe_echo_guard` can assert the
 * source and the CSS rules; only a browser can tell you the tour actually
 * appeared, actually settled, and actually went away.
 *
 * The two rules this exists to prove, both of which a green probe would miss:
 *
 *   D-H1  the tour ANIMATES ONCE PER SESSION. Bouncing dashboard → practice →
 *         dashboard must show the tour ALREADY SETTLED (no caret, tiles up), not
 *         re-typed and not absent.
 *   M64   the tour RETIRES on real activity. `hasStarted` is generous — it counts
 *         revision_visit events, which `recordVisit` writes only when a SUB-TOPIC
 *         opens. So the Revision TILE must NOT retire it (landing writes nothing)
 *         and opening a LESSON must. M64 is in the log because this exact flag was
 *         once defined from an assumed data model and shipped 18/18 green while it
 *         never flipped — so both directions are asserted here against a real DB.
 *
 *   node scratchpad/tour-walk.mjs <outDir> <w> <h>
 *
 * Drives a BRAND-NEW identity through real signup + real onboarding, because
 * first-run is the only state in which this surface exists at all.
 * Cleanup: prints the throwaway email. `scratchpad/walk_teardown.ts` removes it.
 */
import { chromium } from "playwright-core";
import { mkdirSync } from "fs";
import { execFileSync } from "child_process";

const OUT = process.argv[2] || "./scratchpad/tour-walk-shots";
const W = Number(process.argv[3] || 1440);
const H = Number(process.argv[4] || 900);
mkdirSync(OUT, { recursive: true });

const FE = "http://localhost:5174";
const BE = "http://localhost:3010";
const TAG = Date.now();
const EMAIL = `tourwalk-${TAG}@example.com`;
const PASS = "dev-password-123";

let pass = 0,
  fail = 0;
const check = (name, ok) => {
  if (ok) {
    pass++;
    console.log(`  ✓ ${name}`);
  } else {
    fail++;
    console.error(`  ✗ ${name}`);
  }
};

let n = 0;
const shot = async (page, name) => {
  await page.mouse.move(4, 4).catch(() => {});
  const f = `${OUT}/${String(++n).padStart(2, "0")}-${name}.png`;
  await page.screenshot({ path: f });
  console.log(`  📸 ${f}`);
};

// The caret-detached signal, not a guessed sleep (M46) — reading inside a
// transition returns the PRE-change value and looks exactly like a bug.
async function settle(page, quietMs = 350) {
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.locator(".onb-reactwrap").waitFor({ state: "attached", timeout: 2500 }).catch(() => {});
  await page.locator(".onb-reactwrap").waitFor({ state: "detached", timeout: 20000 }).catch(() => {});
  await page.locator(".onb-caret").waitFor({ state: "detached", timeout: 15000 }).catch(() => {});
  await page
    .evaluate(async () => {
      await Promise.all((document.getAnimations?.() ?? []).map((a) => a.finished.catch(() => {})));
    })
    .catch(() => {});
  await page
    .evaluate(async () => {
      await Promise.all(
        [...document.images].filter((i) => !i.complete).map((i) => i.decode().catch(() => {})),
      );
    })
    .catch(() => {});
  await page.waitForTimeout(quietMs);
}

/** Wait for the tour to finish typing + finish raising its tiles. */
async function tourSettled(page) {
  await page.locator(".dash-tour").waitFor({ state: "visible", timeout: 15000 });
  await page.locator(".dash-tour-caret").waitFor({ state: "detached", timeout: 15000 }).catch(() => {});
  // The tiles are a CSS transition with a per-tile delay; wait for the real
  // animations rather than sleeping past them (M46).
  await page
    .evaluate(async () => {
      await Promise.all((document.getAnimations?.() ?? []).map((a) => a.finished.catch(() => {})));
    })
    .catch(() => {});
  await page.waitForTimeout(250);
}

/** Ask the DATABASE for hasStarted, never infer it from the DOM (M64). */
const flag = (label) => {
  const out = execFileSync("bun", ["scratchpad/hasstarted.ts", EMAIL], { encoding: "utf8" }).trim();
  console.log(`     ⟨${label}⟩ ${out}`);
  return out.startsWith("hasStarted=true");
};

const clickText = async (page, name) => {
  const rx = new RegExp(`^\\s*${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`, "i");
  let el = page.getByRole("button", { name: rx }).first();
  if (!(await el.count())) el = page.getByRole("button", { name: new RegExp(name, "i") }).first();
  await el.waitFor({ state: "visible", timeout: 8000 });
  await el.click();
};

const readRow = (page, labelStart) =>
  page.evaluate((start) => {
    const rows = [...document.querySelectorAll(".onb-duo-row")];
    const row = rows.find((r) =>
      (r.querySelector(".onb-duo-label")?.textContent ?? "").trim().toLowerCase().startsWith(start),
    );
    if (!row) return null;
    const btns = [...row.querySelectorAll("button")];
    return { options: btns.map((b) => b.textContent.trim()) };
  }, labelStart.toLowerCase());

async function signUp(ctx, email) {
  const res = await fetch(`${BE}/api/auth/sign-up/email`, {
    method: "POST",
    // Better Auth enforces trusted origins — without this it 403s and every
    // shot below is silently the LOGIN page rather than the flow.
    headers: { "content-type": "application/json", origin: FE },
    body: JSON.stringify({ email, password: PASS, name: "Tour Walk" }),
  });
  const raw = res.headers.getSetCookie?.() ?? [];
  const cookies = raw.map((c) => {
    const [pair] = c.split(";");
    const i = pair.indexOf("=");
    return { name: pair.slice(0, i), value: pair.slice(i + 1), domain: "localhost", path: "/" };
  });
  if (cookies.length) await ctx.addCookies(cookies);
  return { status: res.status, cookies: cookies.length };
}

const browser = await chromium.launch({
  executablePath:
    "/Users/mab/Library/Caches/ms-playwright/chromium-1223/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing",
});

const errors = [];
const slideMisses = [];
const preExisting = [];
async function newPage(ctx) {
  const page = await ctx.newPage();
  page.on("console", (m) => {
    if (m.type() !== "error") return;
    const t = m.text();
    if (t.startsWith("Failed to load resource")) return;
    errors.push(t.slice(0, 200));
    console.log("  🔴 console:", t.slice(0, 160));
  });
  page.on("response", (r) => {
    if (r.status() < 400) return;
    const url = r.url();
    if (new URL(url).pathname === "/favicon.ico") return;
    // 🔴 CONTENT, NOT CODE (M69) — `revision.getSlide` 404s because the target
    // sub_topic has no published slide. `firstChapter` filters on `hasContent`,
    // which is a CHAPTER-level flag: the chapter qualifies while its first
    // sub_topic still has nothing to render. This is the 1-of-24 CBSE coverage
    // blocker wearing a code bug's clothes, and it is the SAME class of miss as
    // Slice G's. Attributed by name and REPORTED rather than silently dropped —
    // it means the tour's primary CTA dead-ends for a real new student, which is
    // a founder-facing product fact, not a passing test detail.
    if (url.includes("revision.getSlide")) {
      slideMisses.push(url);
      console.log(`  ⚠️ getSlide 404 — CONTENT coverage, not Slice H (see comment)`);
      return;
    }
    errors.push(`${r.status()} ${url}`);
    console.log(`  🔴 ${r.status()} ${url}`);
  });
  page.on("pageerror", (e) => {
    const t = String(e);
    // ⚠️ PRE-EXISTING, and PROVEN so rather than assumed: the slide surface
    // throws this at 390 from a canvas `ellipse()` with a negative radius. There
    // is no canvas in our source (the only "ellipse" in frontend/src is a CSS
    // radial-gradient), and `scratchpad/ellipse-control.mjs` reproduces it as
    // demo@ — an already-started student for whom the tour never renders — via
    // the SAME chapter at the SAME width. One variable changed: the tour. It
    // still threw. Attributed BY NAME so this leg keeps its teeth for anything
    // else, and reported at the end rather than silently swallowed.
    if (/IndexSizeError.*ellipse/i.test(t)) {
      preExisting.push(t.slice(0, 120));
      console.log("  ⚠️ canvas ellipse IndexSizeError — PRE-EXISTING at 390 (see ellipse-control.mjs)");
      return;
    }
    errors.push(t.slice(0, 200));
    console.log("  🔴 pageerror:", t.slice(0, 160));
  });
  return page;
}

console.log(`\n── Slice H tour: new student ${EMAIL} @ ${W}×${H} ──`);
const ctx = await browser.newContext({
  viewport: { width: W, height: H },
  deviceScaleFactor: 2,
  // NOT reducedMotion:"reduce" — the other walks use it, but this slice IS the
  // animation. Reducing motion here would take the instant path and the walk
  // would assert nothing about the behaviour it exists to prove.
  reducedMotion: "no-preference",
});
const up = await signUp(ctx, EMAIL);
check(`fresh sign-up returned a session (status ${up.status})`, up.cookies > 0);

const page = await newPage(ctx);
await page.goto(FE, { waitUntil: "domcontentloaded" });
await settle(page);

// ── onboarding, driven to the dashboard ────────────────────────────────────
await clickText(page, "Let's go");
// The about_you rows type in — reading before they settle returns null and
// looks exactly like "the row is missing" (M46).
await settle(page);
const boardRow = await readRow(page, "i'm studying");
if (!boardRow) {
  await shot(page, "DEBUG-no-board-row");
  throw new Error("about_you board row never rendered — see the DEBUG shot");
}
await clickText(page, boardRow.options[0]);
await settle(page);
const gradeRow = await readRow(page, "i'm in class");
await clickText(page, gradeRow.options[0]);
await clickText(page, "she");
await clickText(page, "That's me");
await settle(page);
await clickText(page, "Show me everyone").catch(() => {});
await clickText(page, "Arya Stark").catch(() => console.log("  ⚠️ hero pick missed"));
await page.locator(".onb-page").waitFor({ state: "visible", timeout: 10000 }).catch(() => {});
await clickText(page, "Next").catch(() => {});
await settle(page);
await clickText(page, "Direwolf").catch(() => console.log("  ⚠️ pet pick missed"));
await settle(page);
await clickText(page, "Skip").catch(() => {});
// The epilogue is a ~10s timed close — plain waits, never settle().
await page.locator(".onb-epi").first().waitFor({ state: "visible", timeout: 12000 }).catch(() => {});
await page.waitForTimeout(11500);

// ── PART 1 — the tour exists, and it is the PET who speaks ─────────────────
check("a brand-new student has NOT started (the tour's precondition)", !flag("after onboarding"));
await tourSettled(page);
await shot(page, `tour-settled-${W}`);

check("🔑 the first-run TOUR renders", await page.locator(".dash-tour").isVisible());
check(
  "🔴 the retired DASH-FR welcome card is gone (no .dash-welcome anywhere)",
  (await page.locator(".dash-welcome").count()) === 0,
);
check(
  "🔴 Olórin's signature line is gone — the pet is the speaker now",
  !(await page.getByText("— Olórin").first().isVisible().catch(() => false)),
);

const line = (await page.locator(".dash-tour-line").textContent()) ?? "";
check(`the line greets the student by FIRST name ("${line.trim()}")`, /Welcome Tour —/i.test(line));
check(
  "…and NOT by their full name (a bank-letter greeting, and it wrapped to 4 lines at 390)",
  !/Tour Walk/i.test(line),
);
check("…and the sentence is COMPLETE (the typewriter finished)", /let's explore\./i.test(line));

const petSrc = (await page.locator(".dash-tour-pet").getAttribute("src")) ?? "";
check(`the sticker is the pet the student CHOSE (direwolf) — src ${petSrc.split("/").pop()}`, /direwolf/i.test(petSrc));
const petAlt = (await page.locator(".dash-tour-pet").getAttribute("alt")) ?? "";
check(`…and it carries real alt text ("${petAlt}")`, petAlt.length > 0);

// ── PART 2 — the tiles ─────────────────────────────────────────────────────
const tiles = await page.evaluate(() =>
  [...document.querySelectorAll(".dash-tour-tile")].map((t) => ({
    label: t.querySelector(".dash-tour-tile-label")?.textContent?.trim() ?? "",
    tag: t.tagName,
    soon: t.classList.contains("dash-tour-tile--soon"),
    opacity: Number(getComputedStyle(t.parentElement).opacity),
  })),
);
console.log(`     tiles: ${tiles.map((t) => t.label).join(" · ")}`);
check(`five section tiles rendered (${tiles.length})`, tiles.length === 5);
check("every tile has RISEN IN (opacity 1 — the stagger completed)", tiles.every((t) => t.opacity === 1));
check(
  "🔑 no tile is left mid-transition with a lingering transform (M60)",
  await page.evaluate(() =>
    [...document.querySelectorAll(".dash-tour-tile-wrap")].every(
      (w) => getComputedStyle(w).transform === "none",
    ),
  ),
);
// The orphan check (M63's cousin — measure the layout, don't reason about it).
// Distinct `top` values = rows. Five tiles at 4-across left Journal alone beside
// a run of dead space; the expectation is width-dependent, so it is stated per
// width rather than as one number.
const rows = await page.evaluate(() => {
  const tops = [...document.querySelectorAll(".dash-tour-tile")].map((t) =>
    Math.round(t.getBoundingClientRect().top),
  );
  return [...new Set(tops)].length;
});
const perRow = await page.evaluate(() => {
  const els = [...document.querySelectorAll(".dash-tour-tile")];
  const first = Math.round(els[0].getBoundingClientRect().top);
  return els.filter((t) => Math.round(t.getBoundingClientRect().top) === first).length;
});
console.log(`     tile layout: ${rows} row(s), ${perRow} on the first row`);
check(
  `🔑 the five tiles do not orphan one alone (${rows} row(s), ${perRow} first)`,
  // Acceptable: one row of 5 (desktop), 3+2, or a single column (phone).
  rows === 1 || perRow === 3 || perRow === 1,
);

check("Journal wears a 'soon' state", tiles.some((t) => /Journal/.test(t.label) && t.soon));
check(
  "🔑 the 'soon' tile is NOT a button — it navigates nowhere, so it must not look pressable",
  tiles.find((t) => t.soon)?.tag !== "BUTTON",
);
check(
  "…and every NON-soon tile IS a real button",
  tiles.filter((t) => !t.soon).every((t) => t.tag === "BUTTON"),
);

// The CTA and the "Start here" chip are both derived from `firstChapter`, so a
// disagreement between them would mean the student is pointed at two different
// places on their first screen. Cheap to assert, and it is the kind of coherence
// bug that only shows on a first-run surface nobody revisits.
const coherence = await page.evaluate(() => {
  const row = document.querySelector(".dash-lesson--starthere");
  return {
    chip: row?.querySelector(".dash-starthere")?.textContent?.trim() ?? null,
    chapter: row?.querySelector(".dash-lesson-name")?.textContent?.trim() ?? row?.textContent?.trim()?.slice(0, 40) ?? null,
    cta: document.querySelector(".dash-tour-cta")?.textContent?.trim() ?? "",
  };
});
console.log(`     start-here chapter: ${coherence.chapter} | CTA: "${coherence.cta}"`);
check("exactly one chapter is marked 'Start here'", coherence.chip !== null);
check(
  "🔑 the CTA and the 'Start here' chip point at the SAME chapter",
  // The CTA names the chapter only when it is short enough to fit the button;
  // past ~24 chars it falls back to "Start this lesson", which is still coherent.
  coherence.cta.startsWith("Start this lesson") ||
    (coherence.chapter !== null && coherence.cta.includes(coherence.chapter.split("\n")[0])),
);

// D-H2 — the lesson CTA survived the redesign and is the primary action.
const cta = page.locator(".dash-tour-cta");
check("🔑 D-H2: the Start-lesson CTA is present above the tiles", await cta.isVisible());
const ctaBox = await cta.boundingBox();
const tilesBox = await page.locator(".dash-tour-tiles").boundingBox();
check("…and it sits ABOVE them, not buried below", ctaBox.y < tilesBox.y);

// ── PART 3 — D-H1: animate once per session ────────────────────────────────
// Navigate away via a TILE (which also proves tile navigation works at all),
// then come back and demand the tour is present but NOT re-typing.
await page.locator(".dash-tour-tile", { hasText: "Practice" }).click();
await page.waitForTimeout(600);
check("the Practice tile writes NO activity (the tour must survive a look-around)", !flag("after Practice tile"));
check("🔑 a tile actually NAVIGATES (Practice opened)", (await page.locator(".dash-tour").count()) === 0);
await shot(page, `tile-navigated-practice-${W}`);

await page.getByRole("button", { name: /^Home$/i }).first().click();
// Deliberately NO tourSettled() here — that would wait out an animation and
// hide the very thing being asserted. Read immediately.
await page.locator(".dash-tour").waitFor({ state: "visible", timeout: 10000 });
const onReturn = await page.evaluate(() => ({
  caret: document.querySelectorAll(".dash-tour-caret").length,
  line: document.querySelector(".dash-tour-line")?.textContent?.trim() ?? "",
  risen: [...document.querySelectorAll(".dash-tour-tile-wrap")].every(
    (w) => Number(getComputedStyle(w).opacity) === 1,
  ),
}));
check("🔑 D-H1: the tour is STILL THERE on return (not hidden)", onReturn.line.length > 0);
check("🔑 D-H1: it is ALREADY SETTLED — no typing caret on return", onReturn.caret === 0);
check("🔑 D-H1: the sentence is whole immediately, not re-typed", /let's explore\./i.test(onReturn.line));
check("🔑 D-H1: the tiles are up immediately, not re-staggered", onReturn.risen);
await shot(page, `returned-already-settled-${W}`);

// ── PART 4 — the sizing axis (M63), measured across the aspect extremes ────
// Runs BEFORE retirement, which is one-way: once hasStarted flips there is no
// honest way to render this element again for this student.
// Same rule as every other companion slot (Slice G): height pinned, width free
// and merely capped, object-fit contain. Pinning WIDTH instead renders the owl
// ~2.4x taller than the direwolf. MEASURED, not asserted from the stylesheet.
const sizes = {};
for (const pet of ["owl", "direwolf", "jarvis"]) {
  execFileSync("bun", ["scratchpad/setpet.ts", EMAIL, pet], { stdio: "pipe" });
  await page.reload({ waitUntil: "domcontentloaded" });
  await tourSettled(page);
  sizes[pet] = await page.evaluate(() => {
    const el = document.querySelector(".dash-tour-pet");
    const r = el.getBoundingClientRect();
    return {
      w: Math.round(r.width),
      h: Math.round(r.height),
      fit: getComputedStyle(el).objectFit,
      src: el.getAttribute("src").split("/").pop(),
    };
  });
  check(`${pet}: the sticker re-renders as the chosen pet`, new RegExp(pet, "i").test(sizes[pet].src));
}
console.log("\n  rendered sticker boxes:");
for (const [p, s] of Object.entries(sizes)) console.log(`    ${p.padEnd(9)} ${s.w}x${s.h}  object-fit:${s.fit}`);

const hs = Object.values(sizes).map((s) => s.h);
const ws = Object.values(sizes).map((s) => s.w);
check(`🔑 M63: every companion renders the SAME height (${hs.join("/")})`, new Set(hs).size === 1);
check(
  `🔑 M63: widths VARY with the art, so nothing is squashed (${ws.join("/")})`,
  new Set(ws).size > 1,
);
check("…and no companion overhangs its 96px cap", ws.every((w) => w <= 96));
check("…object-fit is contain, so no art is cropped", Object.values(sizes).every((s) => s.fit === "contain"));
await shot(page, `sizing-last-pet-${W}`);

// ── PART 5 — M64: the tour RETIRES on real activity, both directions ───────
// Direction A: the Revision TILE must NOT retire it. recordVisit needs a
// sub_topic, and the landing opens none — so hasStarted must stay false.
check("still not started, immediately BEFORE the Revision tile", !flag("before Revision tile"));
await page.locator(".dash-tour-tile", { hasText: "Revision" }).click();
await page.waitForTimeout(1800);
await shot(page, `revision-landing-${W}`);
const afterRevisionTile = flag("after Revision tile");
await page.getByRole("button", { name: /^Home$/i }).first().click();
await page.locator(".dash-tour, .dash-stats").first().waitFor({ state: "visible", timeout: 10000 });
const tourCount = await page.locator(".dash-tour").count();
check(
  `🔑 M64-A: the Revision LANDING writes no revision_visit (no sub_topic opened)`,
  !afterRevisionTile,
);
check(`…so the tour survives the round trip (found ${tourCount} tour)`, tourCount === 1);

// Direction B: opening a real lesson writes revision_visit ⇒ hasStarted flips.
await page.locator(".dash-tour-cta").click();
await page.waitForTimeout(2500);
await shot(page, `lesson-opened-${W}`);
check("🔑 M64-B: opening a lesson DOES write activity", flag("after lesson open"));
await page.getByRole("button", { name: /^Home$/i }).first().click();
await page.waitForTimeout(1500);
await page.locator(".dash-tour, .dash-stats").first().waitFor({ state: "visible", timeout: 10000 });
const retired = (await page.locator(".dash-tour").count()) === 0;
const statsBack = (await page.locator(".dash-stats").count()) === 1;
check("🔑 M64-B: opening a LESSON retires the tour", retired);
check("…and the stat cards take its place", statsBack);
await shot(page, `retired-stats-back-${W}`);

await ctx.close();
await browser.close();

check("no console/page errors during the walk", errors.length === 0);
console.log(`\ntour walk @${W}x${H}: ${pass} passed, ${fail} failed`);
if (preExisting.length) {
  console.log(
    `\n⚠️ PRE-EXISTING (proven by scratchpad/ellipse-control.mjs, not this slice):\n` +
      `   ${preExisting.length} canvas ellipse IndexSizeError on the slide surface at ${W}px.`,
  );
}
if (slideMisses.length) {
  console.log(
    `\n⚠️ CONTENT (not this slice): ${slideMisses.length} getSlide 404 — the tour's\n` +
      `   "Start this lesson" CTA lands on a sub_topic with no published slide.\n` +
      `   A real new CBSE student hits this. Needs content publishing, not code.`,
  );
}
console.log(`\n⚠️ CLEANUP: throwaway identity ${EMAIL} — run:`);
console.log(`   WALK_EMAIL=${EMAIL} bun scratchpad/walk_teardown.ts`);
process.exit(fail === 0 ? 0 : 1);
