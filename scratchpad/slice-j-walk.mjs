/**
 * Slice J walk (S117) — the Journal page in a real browser (M37).
 *
 * Why a walk and not just the probe: probe_echo_guard asserts the RULES (the
 * rail navigates, the blur is >=5px, the front is height-driven, the mock is
 * off the a11y tree). None of that can tell you whether the page LOOKS like a
 * deliberate preview or like a broken render — which is the slice's entire risk,
 * because the whole design rests on a blur reading as intentional.
 *
 * The three things only a browser can answer:
 *   1. Does the soon panel sit READABLE over the blur, or does the blurred art
 *      bleed through the type? (It carries its own surface; that is a claim.)
 *   2. Does the front art land at a sane size across characters whose aspect
 *      ratios do not match — the M63 failure, MEASURED not asserted?
 *   3. Does the FALLBACK actually render a pet, or a hole? Three populations
 *      reach it (skipped, legacy free-text, and a real hero), and only one of
 *      them is the happy path.
 *
 *   node scratchpad/slice-j-walk.mjs <outDir> <w> <h>
 *
 * Drives demo@example.com and RESTORES their original hero at the end, so the
 * walk leaves no trace on a student row.
 *
 * M71 — every check names WHICH character it is judging. A detector that cannot
 * say what it was looking at reported "0/5 dead" on rows that opened perfectly.
 */
import { chromium } from "playwright-core";
import { mkdirSync } from "fs";
import { execFileSync } from "child_process";

const OUT = process.argv[2] || "./scratchpad/slice-j-shots";
const W = Number(process.argv[3] || 1440);
const H = Number(process.argv[4] || 900);
mkdirSync(OUT, { recursive: true });

const FE = "http://localhost:5174";
const BE = "http://localhost:3010";
const EMAIL = "demo@example.com";
const PASS = "dev-password-123";

// The three populations that reach this page, not three flavours of one.
//   iron_man — a real hero whose art is a WIDE codex page (the M63 stress case)
//   harry_potter — a real hero, portrait-shaped (the other extreme)
//   NULL — skipped the beat            → must fall back to the pet
//   Interstellar - Cooper — a PRE-S91 row → must ALSO fall back to the pet
const CASES = [
  { hero: "iron_man", expectFallback: false },
  { hero: "harry_potter", expectFallback: false },
  { hero: "NULL", expectFallback: true },
  { hero: "Interstellar - Cooper", expectFallback: true },
];

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

const setHero = (h) =>
  execFileSync("bun", ["scratchpad/sethero.ts", EMAIL, h], { encoding: "utf8" }).trim();

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
let original = "NULL";
try {
  original =
    execFileSync(
      "bun",
      [
        "-e",
        `
    import { eq, and } from "drizzle-orm";
    import { appUser, board, membership, onboarding } from "@b2c/kernel/schema";
    import { db, queryClient } from "./src/db/client";
    import { withBoard } from "./src/db/with-board";
    const [u] = await db.select().from(appUser).where(eq(appUser.email, "${EMAIL}"));
    for (const b of await db.select().from(board)) {
      const r = await withBoard(b.id, (tx) => tx.select().from(onboarding).where(and(eq(onboarding.userId, u.id), eq(onboarding.boardId, b.id))));
      if (r.length) { console.log(r[0].favCharacter ?? "NULL"); break; }
    }
    await queryClient.end();
  `,
      ],
      { encoding: "utf8" },
    ).trim() || "NULL";
} catch {}
console.log(`(original hero: ${original})`);

const measured = {};

for (const { hero, expectFallback } of CASES) {
  const tag = hero === "NULL" ? "skipped" : hero;
  setHero(hero);

  await page.goto(FE, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1400);

  // ── D-J1: the RAIL is how a student gets here. A real click, not a URL —
  // the app has no routing, so the rail IS the only path (besides the tile).
  const rail = await page.$('button[aria-label="Journal"]');
  check(`${tag}: the rail item is labelled "Journal" (not "(coming soon)")`, Boolean(rail),
    "an aria-label of 'Journal (coming soon)' means `soon` is still set");
  if (!rail) continue;
  await rail.click();
  // Settle BEFORE measuring — M46: reading getComputedStyle mid-transition is
  // how a working layout gets diagnosed as broken.
  await page.waitForTimeout(900);

  const onPage = await page.$(".jrnl");
  check(`${tag}: the Journal page rendered after the rail click`, Boolean(onPage));
  if (!onPage) continue;

  // ── the front art: WHICH character, and at what size (M63, measured) ──
  const front = await page.$(".jrnl-front");
  if (!front) {
    check(`${tag}: the front character rendered`, false, ".jrnl-front not found");
  } else {
    const box = await front.boundingBox();
    const src = await front.getAttribute("src");
    const alt = await front.getAttribute("alt");
    // Did the IMAGE actually decode? A 404'd src still has a bounding box, so a
    // box check alone would pass on a hole (M69 — a missing element wore a code
    // bug's clothes when it was really content).
    const decoded = await front.evaluate((el) => el.complete && el.naturalWidth > 0);
    measured[tag] = { box, src, alt, decoded };

    check(`${tag}: the front art DECODED (not a broken-image box)`, decoded, src ?? "no src");
    check(
      `${tag}: rendered at a sane height (${box ? Math.round(box.height) : "?"}px, want 100-200)`,
      Boolean(box && box.height >= 100 && box.height <= 200),
      JSON.stringify(box),
    );
    check(
      `${tag}: does not overhang its cap (${box ? Math.round(box.width) : "?"}px ≤ 190)`,
      Boolean(box && box.width <= 191),
      JSON.stringify(box),
    );
    // 🔑 D-J3 — the fallback is the PET, never Olórin, and it must actually be
    // the pet rather than an empty slot. Judged on the SRC, which names the art.
    if (expectFallback) {
      check(
        `${tag}: falls back to the PET (src=${src?.split("/").pop()})`,
        Boolean(src && !/olorin|gandalf/i.test(src)) && Boolean(decoded),
        src ?? "no src",
      );
    } else {
      check(
        `${tag}: fronts with THIS hero's own art (src names it)`,
        Boolean(src && src.toLowerCase().includes(hero.split("_")[0])),
        src ?? "no src",
      );
    }
  }

  // ── D-J2: the blur is applied, and the panel is READABLE over it ──
  const preview = await page.$(".jrnl-preview");
  if (preview) {
    const filter = await preview.evaluate((el) => getComputedStyle(el).filter);
    check(`${tag}: the preview is actually blurred at render (${filter})`, /blur\(/.test(filter), filter);
  } else {
    check(`${tag}: the blurred preview rendered`, false, ".jrnl-preview not found");
  }

  const soon = await page.$(".jrnl-soon");
  if (soon) {
    const sb = await soon.boundingBox();
    // The panel sits IN the blurred cell, so it must carry its own opaque
    // surface or the art bleeds through the type. Measured, not assumed.
    const bg = await soon.evaluate((el) => getComputedStyle(el).backgroundColor);
    const transparent = bg === "rgba(0, 0, 0, 0)" || bg === "transparent";
    check(`${tag}: the soon panel has its own surface (bg=${bg})`, !transparent, bg);
    check(
      `${tag}: the soon panel is inside the viewport (not spilling at ${W}px)`,
      Boolean(sb && sb.x >= 0 && sb.x + sb.width <= W + 1),
      JSON.stringify(sb),
    );
    // It must sit OVER the preview, not beside it — that is the whole comp.
    const pb = preview ? await preview.boundingBox() : null;
    check(
      `${tag}: the panel overlaps the preview it explains`,
      Boolean(sb && pb && sb.y < pb.y + pb.height && sb.y + sb.height > pb.y),
      JSON.stringify({ soon: sb, preview: pb }),
    );
  } else {
    check(`${tag}: the soon panel rendered`, false, ".jrnl-soon not found");
  }

  // ── the mock is off the a11y tree. Asserted in the BROWSER, not by grep:
  // the probe checks the attribute is written, this checks it took effect.
  const mockNames = await page.evaluate(() => {
    const p = document.querySelector(".jrnl-preview");
    return p ? p.closest("[aria-hidden='true']") !== null : null;
  });
  check(`${tag}: the mock is aria-hidden in the live DOM`, mockNames === true);

  await page.screenshot({ path: `${OUT}/journal-${tag.replace(/\W+/g, "-")}.png`, fullPage: true });
}

// ── the OTHER way in: the dashboard tour tile (Slice H's five tiles). It used
// to be a dead div; if it silently no-ops the page is only half-reachable.
setHero("iron_man");
await page.goto(FE, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(1400);
const tile = await page.$$('button.dash-tour-tile');
if (tile.length) {
  const labels = await Promise.all(tile.map((t) => t.innerText()));
  const jIdx = labels.findIndex((l) => /Journal/i.test(l));
  check(`the Journal tile is a BUTTON now (was a dead div)`, jIdx >= 0, labels.join(" | "));
  check(`no tile still wears a "soon" pill`, !labels.some((l) => /soon/i.test(l)), labels.join(" | "));
  if (jIdx >= 0) {
    await tile[jIdx].click();
    await page.waitForTimeout(900);
    check(`the Journal tile navigates to the page`, Boolean(await page.$(".jrnl")));
    await page.screenshot({ path: `${OUT}/journal-via-tile.png`, fullPage: true });
  }
} else {
  // Not a failure of Slice J: demo@ has started a lesson, so the first-run tour
  // does not render for them. Say so rather than reporting a red (M71).
  console.log("  (no first-run tour for this student — tile path not exercised here)");
}

check(`no console errors across the walk`, errors.length === 0, errors.join(" ⏐ "));

// Restore.
setHero(original);
console.log(`(restored hero: ${original})`);

await ctx.close();
await browser.close();

console.log(`\n${pass} passed, ${fail} failed  →  ${OUT}`);
console.log(JSON.stringify(measured, null, 1));
process.exit(fail === 0 ? 0 : 1);
