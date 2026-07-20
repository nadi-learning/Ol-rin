/**
 * Slice L walk (S119) — the pronoun stickers + the closed pet set, in a real
 * browser (M37).
 *
 * Why a walk and not just the probe: probe_echo_guard asserts the RULES (the
 * row is a sticker row, both chips carry art, the aside commits, the slot is
 * height-driven). None of that can answer the questions this slice rests on:
 *
 *   1. 🔴 CAN A STUDENT WHO PICKS THE OPT-OUT ACTUALLY FINISH? The pronoun row
 *      now has THREE controls writing ONE value across TWO render branches. If
 *      the aside fails to commit, the CTA never enables and that child is stuck
 *      in onboarding forever — with every probe leg green, because the data and
 *      the markup are both correct. This is the slice's worst failure mode and
 *      it is only observable by clicking.
 *   2. Are the three controls MUTUALLY EXCLUSIVE? Same key, two branches: it is
 *      entirely possible to render "he" and "just Ravi" both pressed, which
 *      tells the student they answered twice.
 *   3. Does the art DECODE, and does it LAND? S117 shipped art that was green
 *      on every assertion and rendered as a dark rectangle; M69 is the reason
 *      `decoded` is naturalWidth > 0 and not "is there an <img>".
 *   4. 🔑 Do the two stickers share a BASELINE? That is the entire job of
 *      height-driven + `object-fit: contain` (M63/S114 — a fixed WIDTH renders
 *      the 0.46-aspect owl at 287px and the 1.40 direwolf at 94px). The
 *      placeholders are both 0.79, so this leg is MEASURED and not merely
 *      inspected — it is what will still be true when the real art lands at
 *      whatever aspect it happens to have.
 *   5. Is the pet hatch gone from the rendered DOM, not just the source?
 *
 * ⚠️ The two sticker PNGs are PLACEHOLDERS (D-L2). This walk proves the SLOT,
 * not the art. The founder must eyeball the shots again after the real
 * sketches drop in — S118 (M75) is the standing reminder that a fully green
 * walk and correct-looking art are different claims.
 *
 *   node scratchpad/slice-l-walk.mjs <outDir> <w> <h>
 *
 * Walks a BRAND-NEW identity (fresh signup, member of nothing) because
 * about_you is a first-run beat; prints its teardown command at the end.
 */
import { chromium } from "playwright-core";
import { mkdirSync } from "fs";

const OUT = process.argv[2] || "./scratchpad/slice-l-shots";
const W = Number(process.argv[3] || 1440);
const H = Number(process.argv[4] || 900);
mkdirSync(OUT, { recursive: true });

const FE = "http://localhost:5174";
const BE = "http://localhost:3010";
const TAG = Date.now();
const EMAIL = `lwalk-${TAG}@example.com`;
const PASS = "dev-password-123";

let pass = 0,
  fail = 0;
const check = (name, ok, detail) => {
  if (ok) {
    pass++;
    console.log(`  ✓ ${name}`);
  } else {
    fail++;
    console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
};

let n = 0;
const shot = async (page, name) => {
  await page.mouse.move(4, 4).catch(() => {});
  await settle(page);
  const f = `${OUT}/${String(++n).padStart(2, "0")}-${name}.png`;
  await page.screenshot({ path: f });
  console.log(`  📸 ${f}`);
};

// Verbatim from board-pick-walk.mjs — the caret-detached signal, not a guessed
// sleep (M46). Reading inside a transition returns the PRE-change value and
// looks exactly like a bug.
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

const clickText = async (page, name) => {
  const rx = new RegExp(`^\\s*${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`, "i");
  let el = page.getByRole("button", { name: rx }).first();
  if (!(await el.count())) el = page.getByRole("button", { name: new RegExp(name, "i") }).first();
  await el.waitFor({ state: "visible", timeout: 8000 });
  await el.click();
};

/**
 * The pronoun row, read as STRUCTURE rather than as a list of buttons — the
 * stickers and the aside are different branches and every claim below needs to
 * know which one it is judging (M71).
 *
 * `decoded` is naturalWidth > 0, never "an <img> exists": a 404'd src still has
 * a bounding box, so a box check alone passes on a hole (M69).
 */
const readPronoun = (page) =>
  page.evaluate(() => {
    const row = [...document.querySelectorAll(".onb-duo-row")].find((r) =>
      (r.querySelector(".onb-duo-label")?.textContent ?? "").toLowerCase().includes("tutor"),
    );
    if (!row) return null;
    const read = (b) => {
      const img = b.querySelector(".onb-choice-img");
      const ir = img?.getBoundingClientRect();
      const br = b.getBoundingClientRect();
      return {
        text: b.textContent.trim(),
        pressed: b.getAttribute("aria-pressed") === "true",
        x: Math.round(br.left),
        y: Math.round(br.top),
        w: Math.round(br.width),
        h: Math.round(br.height),
        hasImg: Boolean(img),
        src: img?.getAttribute("src") ?? null,
        decoded: img ? img.complete && img.naturalWidth > 0 : false,
        artTop: ir ? Math.round(ir.top) : 0,
        artH: ir ? Math.round(ir.height) : 0,
        artW: ir ? Math.round(ir.width) : 0,
        fit: img ? getComputedStyle(img).objectFit : null,
      };
    };
    return {
      label: row.querySelector(".onb-duo-label")?.textContent?.trim() ?? "",
      isStickerRow: row.classList.contains("is-sticker"),
      stickers: [...row.querySelectorAll(".onb-duo-sticker")].map(read),
      aside: row.querySelector(".onb-duo-aside") ? read(row.querySelector(".onb-duo-aside")) : null,
    };
  });

const readRow = (page, labelStart) =>
  page.evaluate((start) => {
    const row = [...document.querySelectorAll(".onb-duo-row")].find((r) =>
      (r.querySelector(".onb-duo-label")?.textContent ?? "").trim().toLowerCase().startsWith(start),
    );
    if (!row) return null;
    const btns = [...row.querySelectorAll("button")];
    return {
      options: btns.map((b) => b.textContent.trim()),
      picked: btns.filter((b) => b.getAttribute("aria-pressed") === "true").map((b) => b.textContent.trim()),
      empty: row.querySelector(".onb-duo-empty")?.textContent?.trim() ?? null,
    };
  }, labelStart.toLowerCase());

async function signUp(ctx, email) {
  const res = await fetch(`${BE}/api/auth/sign-up/email`, {
    method: "POST",
    // Better Auth enforces trusted origins — without this it 403s and every
    // shot below is silently the LOGIN page rather than the flow.
    headers: { "content-type": "application/json", origin: FE },
    body: JSON.stringify({ email, password: PASS, name: "Ravi Walker" }),
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

console.log(`\n── Slice L (${EMAIL}) @ ${W}×${H} ──`);
const ctx = await browser.newContext({
  viewport: { width: W, height: H },
  deviceScaleFactor: 2,
  reducedMotion: "reduce",
});
const up = await signUp(ctx, EMAIL);
check(`fresh sign-up returned a session (status ${up.status}, ${up.cookies} cookies)`, up.cookies > 0);

const page = await ctx.newPage();
const errors = [];
page.on("console", (m) => {
  if (m.type() === "error" && !m.text().startsWith("Failed to load resource")) errors.push(m.text());
});

await page.goto(FE, { waitUntil: "domcontentloaded" });
// Wait for the card rather than asserting on the frame that happens to be up
// at domcontentloaded — the first version read BEFORE the app mounted and
// reported "member-less student lands in onboarding" red on a flow that then
// walked perfectly. An absence is an environment claim first (M70).
await page.locator(".onb-card").waitFor({ state: "visible", timeout: 15000 }).catch(() => {});
check("member-less student lands in onboarding", await page.locator(".onb-card").isVisible());
await clickText(page, "Let's go");
await settle(page);
await shot(page, `about-you-${W}`);

// ── PART 1 — the row renders as stickers ──────────────────────────────────
const p0 = await readPronoun(page);
check("the pronoun row is on screen", p0 !== null);
check("it is marked as a sticker row", p0?.isStickerRow === true);
check("it renders exactly TWO stickers", p0?.stickers.length === 2, `got ${p0?.stickers.length}`);
check("the two stickers are he and she", p0?.stickers.map((s) => s.text).join(",") === "he,she", p0?.stickers.map((s) => s.text).join(","));
check("the aside renders", p0?.aside !== null);
check(
  "the aside carries the student's OWN first name, not a placeholder",
  p0?.aside?.text === "just Ravi",
  p0?.aside?.text,
);
// The aside must NOT be a sticker — that is the whole of D-L1.
check("the aside carries no art (it is the quiet control, not a third card)", p0?.aside?.hasImg === false);

// ── PART 2 — the ART. S117/M69: green assertions, dark rectangle. ─────────
for (const s of p0.stickers) {
  check(`${s.text}: has an <img>`, s.hasImg, s.src ?? "no src");
  check(`${s.text}: art DECODED (naturalWidth > 0, not merely present)`, s.decoded, s.src ?? "no src");
  check(`${s.text}: art has real size on screen`, s.artH > 20 && s.artW > 20, `${s.artW}×${s.artH}`);
  check(`${s.text}: object-fit is contain, so nothing is cropped`, s.fit === "contain", String(s.fit));
}
// 🔑 THE BASELINE LEG (M63/S114). Height-driven + contain means every sticker
// occupies the SAME box whatever its aspect — that is what stops the labels
// dancing when the real art arrives at two different shapes. Measured, not
// asserted: this is the leg that survives the placeholder swap.
if (p0.stickers.length === 2) {
  const [a, b] = p0.stickers;
  check(
    `both stickers' art is the same height (${a.artH} vs ${b.artH})`,
    a.artH === b.artH,
    `${a.artH} vs ${b.artH}`,
  );
  check(
    `both stickers' art sits on the same top baseline (${a.artTop} vs ${b.artTop})`,
    Math.abs(a.artTop - b.artTop) <= 1,
    `${a.artTop} vs ${b.artTop}`,
  );
  check(`both cards are the same height (${a.h} vs ${b.h})`, Math.abs(a.h - b.h) <= 1, `${a.h} vs ${b.h}`);
  // They must be two cards, not one on top of the other or one off-screen.
  check(`the two stickers are side by side, not stacked`, a.y === b.y && a.x !== b.x, `a=(${a.x},${a.y}) b=(${b.x},${b.y})`);
  check(`neither sticker overflows the viewport`, a.x >= 0 && b.x + b.w <= W, `a.x=${a.x} b.right=${b.x + b.w}`);
  // The aside must sit BELOW the stickers, which is the layout D-L1 chose.
  check(
    `the aside sits under the stickers, not beside them`,
    p0.aside.y > a.y + a.h - 4,
    `aside.y=${p0.aside.y} sticker bottom=${a.y + a.h}`,
  );
}

// ── PART 3 — the three controls write ONE value ──────────────────────────
// Answer the other two rows first so the CTA's only remaining blocker is the
// pronoun; otherwise "CTA still disabled" proves nothing about this row.
const boardRow = await readRow(page, "i'm studying");
if (boardRow && boardRow.options.length) {
  await clickText(page, boardRow.options[0]);
  await settle(page);
}
const gradeRow = await readRow(page, "i'm in class");
check("grades loaded so the walk can isolate the pronoun", (gradeRow?.options.length ?? 0) > 0);
await clickText(page, gradeRow.options[0]);
await settle(page);

const ctaDisabled = () => page.locator(".onb-duo-cta").isDisabled();
check("🔴 CTA is disabled with board + class but NO pronoun", await ctaDisabled());

// pick a STICKER
await page.locator(".onb-duo-sticker").first().click();
await settle(page);
const p1 = await readPronoun(page);
check("picking 'he' marks it pressed", p1.stickers[0].pressed);
check("…and 'she' is NOT pressed", !p1.stickers[1].pressed);
check("…and the aside is NOT pressed (one value, three controls)", !p1.aside.pressed);
check("CTA enables from a sticker pick", !(await ctaDisabled()));
await shot(page, `pronoun-sticker-picked-${W}`);

// switch to the OTHER sticker
await page.locator(".onb-duo-sticker").nth(1).click();
await settle(page);
const p2 = await readPronoun(page);
check("picking 'she' moves the pressed state off 'he'", p2.stickers[1].pressed && !p2.stickers[0].pressed);

// 🔴 THE LEG THIS WALK EXISTS FOR — the opt-out must COMMIT.
await page.locator(".onb-duo-aside").click();
await settle(page);
const p3 = await readPronoun(page);
check("🔴 the aside becomes pressed when clicked", p3.aside.pressed);
check("🔴 …and BOTH stickers release (mutually exclusive)", !p3.stickers[0].pressed && !p3.stickers[1].pressed);
check("🔴 the CTA is still enabled — an opt-out student can FINISH", !(await ctaDisabled()));
await shot(page, `pronoun-optout-picked-${W}`);

// and back again, because a control that commits once and then sticks is its
// own bug (the aside and the stickers are different branches).
await page.locator(".onb-duo-sticker").first().click();
await settle(page);
const p4 = await readPronoun(page);
check("picking a sticker again releases the aside", p4.stickers[0].pressed && !p4.aside.pressed);

// ── PART 4 — commit on the OPT-OUT path, end to end ──────────────────────
// Deliberately finishing as the opt-out student: that is the path with the new
// render branch under it, so it is the one that must survive a real save.
await page.locator(".onb-duo-aside").click();
await settle(page);
await clickText(page, "That's me");
await settle(page);
check("🔴 the opt-out student advanced past about_you", !(await page.locator(".onb-duo").isVisible().catch(() => false)));
await shot(page, `advanced-past-about-you-${W}`);

// ── PART 5 — the pet beat has no hatch (Slice L, in the DOM) ─────────────
await clickText(page, "Show me everyone").catch(() => {});
await clickText(page, "Naruto").catch(() => console.log("  ⚠️ hero pick missed"));
await page.locator(".onb-page").waitFor({ state: "visible", timeout: 10000 }).catch(() => {});
await clickText(page, "Next").catch(() => {});
await settle(page);
await shot(page, `pet-beat-${W}`);

const petBeat = await page.evaluate(() => ({
  cards: [...document.querySelectorAll(".onb-choice")].map((b) => b.textContent.trim()),
  otherRow: document.querySelectorAll(".onb-other-row").length,
  otherBtn: [...document.querySelectorAll("button")].map((b) => b.textContent.trim()).filter((t) => /something else/i.test(t)).length,
  textField: document.querySelectorAll(".onb-field").length,
}));
check("the pet beat is on screen", petBeat.cards.length > 0, JSON.stringify(petBeat.cards));
check("🔴 no 'Something else' control anywhere in the DOM", petBeat.otherBtn === 0);
check("🔴 no text field on the pet beat — the set is closed", petBeat.textField === 0);
check("every pet card offered is one of the seven", petBeat.cards.length === 7, `got ${petBeat.cards.length}`);

// finish, so the walk proves the closed set actually saves
await clickText(page, "Kurama").catch(() => console.log("  ⚠️ pet pick missed"));
await settle(page);
check("a closed-set pet committed and the flow advanced", !(await page.locator(".onb-choice").first().isVisible().catch(() => false)));
await shot(page, `after-pet-${W}`);

check("no uncaught console errors during the walk", errors.length === 0, errors.join(" | "));

await ctx.close();
await browser.close();

console.log(`\n${pass} passed, ${fail} failed`);
console.log(`\n⚠️ CLEANUP: throwaway identity ${EMAIL} — run:`);
console.log(`   WALK_EMAIL=${EMAIL} bun scratchpad/walk_teardown.ts`);
process.exit(fail === 0 ? 0 : 1);
