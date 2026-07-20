/**
 * Slice G walk (S114) — the companion on every student surface, in a real
 * browser (M37).
 *
 * Why a walk and not just the probe: probe_echo_guard asserts the CSS RULE
 * (height-driven, width capped, object-fit contain). It cannot tell you whether
 * seven differently-shaped animals actually look right in a slot that was cut
 * for one. The slice's entire risk is visual, and the aspect span is real:
 *
 *   owl      167x360  = 0.46  ← tallest + narrowest
 *   direwolf 360x257  = 1.40  ← widest + lowest
 *   jarvis   360x346  = 1.04  ← square-ish middle
 *
 * Under the OLD `width: 132px` rule those three render 287px, 94px and 127px
 * tall respectively. This walk measures the rendered box for each, so "they are
 * now the same visual size" is a MEASUREMENT, not a claim (M63 is in this
 * probe's history precisely because a layout was reasoned about rather than
 * measured).
 *
 *   node scratchpad/pet-walk.mjs <outDir> <w> <h>
 *
 * Drives demo@example.com (an existing student, already onboarded) and restores
 * their original pet at the end.
 */
import { chromium } from "playwright-core";
import { mkdirSync } from "fs";
import { execFileSync } from "child_process";

const OUT = process.argv[2] || "./scratchpad/pet-walk-shots";
const W = Number(process.argv[3] || 1440);
const H = Number(process.argv[4] || 900);
mkdirSync(OUT, { recursive: true });

const FE = "http://localhost:5174";
const BE = "http://localhost:3010";
const EMAIL = "demo@example.com";
const PASS = "dev-password-123";

// The aspect-ratio extremes + one name-not-species (for the voice copy rule).
const PETS = ["owl", "direwolf", "jarvis", "groot"];

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

const setPet = (pet) =>
  execFileSync("bun", ["scratchpad/setpet.ts", EMAIL, pet], { encoding: "utf8" }).trim();

async function signIn(ctx) {
  const res = await fetch(`${BE}/api/auth/sign-in/email`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: FE },
    body: JSON.stringify({ email: EMAIL, password: PASS }),
  });
  const raw = res.headers.getSetCookie?.() ?? [];
  const cookies = raw.map((c) => {
    const [pair] = c.split(";");
    const i = pair.indexOf("=");
    return { name: pair.slice(0, i), value: pair.slice(i + 1), domain: "localhost", path: "/" };
  });
  if (cookies.length) await ctx.addCookies(cookies);
  return res.status;
}

const browser = await chromium.launch({
  executablePath:
    "/Users/mab/Library/Caches/ms-playwright/chromium-1223/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing",
});
const ctx = await browser.newContext({ viewport: { width: W, height: H } });
const status = await signIn(ctx);
check(`signed in as ${EMAIL} (${status})`, status === 200);

const page = await ctx.newPage();
const errors = [];
page.on("console", (m) => {
  if (m.type() === "error" && !m.text().startsWith("Failed to load resource")) errors.push(m.text());
});

// Restore whatever demo@ had, so the walk leaves no trace.
let original = "owl";
try {
  original = execFileSync("bun", ["-e", `
    import { eq, and } from "drizzle-orm";
    import { appUser, board, membership, onboarding } from "@b2c/kernel/schema";
    import { db, queryClient } from "./src/db/client";
    import { withBoard } from "./src/db/with-board";
    const [u] = await db.select().from(appUser).where(eq(appUser.email, "${EMAIL}"));
    for (const b of await db.select().from(board)) {
      const r = await withBoard(b.id, (tx) => tx.select().from(onboarding).where(and(eq(onboarding.userId, u.id), eq(onboarding.boardId, b.id))));
      if (r.length) { console.log(r[0].pet ?? ""); break; }
    }
    await queryClient.end();
  `], { encoding: "utf8" }).trim();
} catch {}

const boxes = {};

for (const pet of PETS) {
  setPet(pet);

  // ── Practice: the SoonBanner companion ──
  await page.goto(FE, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1200);
  // Navigate to Practice via the rail (a real click, not a URL — the app has no
  // routing, so the rail IS the only way a student gets there).
  await page.click('button[aria-label="Practice"]');
  await page.waitForTimeout(1800);

  const soon = await page.$(".prac-soon-pet");
  if (soon) {
    const b = await soon.boundingBox();
    const src = await soon.getAttribute("src");
    boxes[pet] = { ...boxes[pet], soon: b, soonSrc: src };
    check(`${pet}: practice banner renders the companion`, Boolean(b && b.height > 0));
    check(
      `${pet}: the art is actually THIS pet (src names it)`,
      Boolean(src && src.includes(pet)),
      src ?? "no src",
    );
  } else {
    check(`${pet}: practice banner companion present`, false, ".prac-soon-pet not found");
  }
  await page.screenshot({ path: `${OUT}/${pet}-practice.png`, fullPage: false });

  // ── Revision: the voice-tutor avatar ──
  await page.click('button[aria-label="Revision"]');
  await page.waitForTimeout(2000);
  // The voice panel only mounts on a SLIDE. Revision opens on a LANDING — a
  // grid of chapter cards with "Start →" — and the index tree (.rev-nav-slide)
  // exists only once you are already inside. Two wrong selectors were guessed
  // before a screenshot showed what the page actually is; the shot settled it
  // in one look, which is the cheaper order of operations.
  //
  // ⚠️ It must be THIS chapter. The panel is gated on `slide.hasVoiceContext`,
  // and voice_context is authored in the slide manifest — which, on this DB,
  // exists for exactly ONE chapter (the 1-of-24 content-coverage blocker).
  // Opening "Basics" (the landing's first card) lands on SLIDE_NOT_FOUND and
  // no avatar renders — which looks exactly like a Slice G bug and is not one.
  // Use a real locator on the card class rather than hand-walking the DOM —
  // two hand-rolled traversals missed it before this, and `.rev-landing-card`
  // IS the button, so there is no parent to climb to in the first place.
  const CHAPTER = "Exploring Mixtures";
  const card = page.locator(".rev-landing-card", { hasText: CHAPTER }).first();
  const opened = (await card.count()) > 0;
  if (opened) await card.click();
  await page.waitForTimeout(3500);

  const avatar = await page.$(".voice-avatar-img");
  if (avatar) {
    const b = await avatar.boundingBox();
    const src = await avatar.getAttribute("src");
    boxes[pet] = { ...boxes[pet], voice: b, voiceSrc: src };
    check(`${pet}: voice avatar renders the companion`, Boolean(b && b.height > 0));
    check(
      `${pet}: the voice avatar is THIS pet`,
      Boolean(src && src.includes(pet)),
      src ?? "no src",
    );
    await page.screenshot({ path: `${OUT}/${pet}-revision.png`, fullPage: false });
  } else {
    check(
      `${pet}: voice avatar present (opened a slide: ${opened})`,
      false,
      ".voice-avatar-img not found",
    );
    await page.screenshot({ path: `${OUT}/${pet}-revision-MISSING.png` });
  }
}

// ── 🔑 THE MEASUREMENT. The point of the whole slice's CSS work. ──
console.log("\n  rendered boxes:");
for (const [pet, v] of Object.entries(boxes)) {
  const f = (b) => (b ? `${Math.round(b.width)}x${Math.round(b.height)}` : "—");
  console.log(`    ${pet.padEnd(9)} soon ${f(v.soon).padEnd(10)} voice ${f(v.voice)}`);
}

for (const slot of ["soon", "voice"]) {
  const hs = Object.values(boxes)
    .map((v) => v[slot]?.height)
    .filter(Boolean);
  const ws = Object.values(boxes)
    .map((v) => v[slot]?.width)
    .filter(Boolean);
  if (hs.length < 2) continue;
  // Heights must agree — that is what "height-driven" MEANS, and it is the
  // whole reason the axis was changed.
  check(
    `${slot}: every companion renders the SAME height (${hs.map(Math.round).join("/")})`,
    Math.max(...hs) - Math.min(...hs) <= 1,
  );
  // Widths must differ — if they were all equal the art would be squashed to a
  // box instead of contained, which is the failure `object-fit: contain`
  // prevents. This is the leg that would catch "fixed both axes" (M63's mirror).
  check(
    `${slot}: widths VARY with the art, so nothing is squashed (${ws.map(Math.round).join("/")})`,
    Math.max(...ws) - Math.min(...ws) > 5,
  );
  check(
    `${slot}: no companion overhangs its cap`,
    Math.max(...ws) <= (slot === "soon" ? 150 : 150) + 1,
  );
}

check(`no console errors (${errors.length})`, errors.length === 0, errors.slice(0, 3).join(" | "));

if (original) setPet(original);
console.log(`\n  restored demo@ pet → ${original}`);
console.log(`\npet-walk @${W}x${H}: ${pass} passed, ${fail} failed  (shots in ${OUT})`);
await browser.close();
process.exit(fail === 0 ? 0 : 1);
