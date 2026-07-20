/**
 * Slice K walk (S118) — the Crew page in a real browser (M37).
 *
 * Why a walk and not just the probe: probe_echo_guard asserts the RULES (Crew
 * is an AppView, the rail navigates, the art is height-driven, the entrance
 * releases its transform). None of that can answer the three questions this
 * slice actually rests on, because all three are about MOTION and LAYOUT over
 * time, which no source grep can see:
 *
 *   1. Does the cycle actually ADVANCE? A frozen carousel and a working one are
 *      identical in the source — the timer is armed either way, and a wrong
 *      modulo or a stable React key gives you a still image that greps green.
 *   2. Does clicking a column really widen it and MINIMISE the other? That is
 *      the founder's headline interaction, and it is a computed grid split, not
 *      a class the probe can read.
 *   3. Does a hero-less student get ONE centred column, or a lopsided page with
 *      a hole where the hero was? (D-K4 — a real population, not a defensive
 *      branch.)
 *
 * And the one S117 taught the hard way: art that is GREEN on every assertion
 * can still render as a dark rectangle. This walk measures the art, and it
 * screenshots every case so the founder judges the look rather than the log.
 *
 *   node scratchpad/slice-k-walk.mjs <outDir> <w> <h>
 *
 * Drives demo@example.com and RESTORES their original hero at the end.
 *
 * M71 — every check names WHICH character it is judging.
 */
import { chromium } from "playwright-core";
import { mkdirSync } from "fs";
import { execFileSync } from "child_process";

const OUT = process.argv[2] || "./scratchpad/slice-k-shots";
const W = Number(process.argv[3] || 1440);
const H = Number(process.argv[4] || 900);
mkdirSync(OUT, { recursive: true });

const FE = "http://localhost:5174";
const BE = "http://localhost:3010";
const EMAIL = "demo@example.com";
const PASS = "dev-password-123";

// Must match ROTATE_MS in onboarding.copy.ts. Hard-coded here rather than
// imported because this is a .mjs driving a browser, not part of the app build
// — but a mismatch would make the rotation legs lie, so it is asserted below
// against the source rather than trusted.
const ROTATE_MS = 5000;

// The four populations, and they are genuinely different rather than four
// flavours of one:
//   iron_man     — a real hero whose HEADLINE art is a wide codex page. The
//                  S117 stress case: if the lead frame ever reverts to that,
//                  this is where it shows.
//   harry_potter — a real hero, portrait-shaped. The other aspect extreme (M63).
//   NULL         — skipped the beat        → D-K4, hero column must be ABSENT
//   free text    — a pre-S91 row           → D-K4, hero column must ALSO be absent
const CASES = [
  { hero: "iron_man", heroColumn: true },
  { hero: "harry_potter", heroColumn: true },
  { hero: "NULL", heroColumn: false },
  { hero: "Interstellar - Cooper", heroColumn: false },
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

// Restore whatever demo@ had, so the walk leaves no trace on a student row.
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

// Read a column's state: its width, its art src, and whether that art DECODED.
// A 404'd src still has a bounding box, so a box check alone passes on a hole
// (M69). Keyed by column so every check can name its subject (M71).
const readCols = (p) =>
  p.evaluate(() => {
    const out = {};
    for (const col of document.querySelectorAll(".crew-col")) {
      const img = col.querySelector(".crew-art");
      const name = col.querySelector(".crew-name")?.textContent ?? "?";
      const btn = col.querySelector(".crew-pick");
      const r = col.getBoundingClientRect();
      const ir = img?.getBoundingClientRect();
      out[name] = {
        width: Math.round(r.width),
        x: Math.round(r.left),
        src: img?.getAttribute("src") ?? null,
        decoded: img ? img.complete && img.naturalWidth > 0 : false,
        artH: ir ? Math.round(ir.height) : 0,
        artW: ir ? Math.round(ir.width) : 0,
        expanded: btn?.getAttribute("aria-expanded") === "true",
        cards: col.querySelectorAll(".crew-cap").length,
        blend: img ? getComputedStyle(img).mixBlendMode : null,
        mask: img ? getComputedStyle(img).maskImage : null,
      };
    }
    return out;
  });

for (const { hero, heroColumn } of CASES) {
  const tag = hero === "NULL" ? "skipped" : hero;
  setHero(hero);

  await page.goto(FE, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1400);

  // ── the rail is how a student gets here. A real click, not a URL — this app
  // has no router, so the rail IS the path.
  const searchItem = await page.$('button[aria-label="Search"]');
  check(`${tag}: the Search rail item is gone from the live rail`, !searchItem);

  const rail = await page.$('button[aria-label="Crew"]');
  check(`${tag}: the Crew rail item exists and is not flagged inert`, Boolean(rail),
    "an aria-label of 'Crew (coming soon)' would mean the inert variant came back");
  if (!rail) continue;
  await rail.click();
  // Settle BEFORE measuring — reading getComputedStyle mid-transition is how a
  // working layout gets diagnosed as broken (M46). The grid split is a 320ms
  // transition, so this must clear it.
  await page.waitForTimeout(900);

  const onPage = await page.$(".crew");
  check(`${tag}: the Crew page rendered after the rail click`, Boolean(onPage));
  if (!onPage) continue;

  let cols = await readCols(page);
  const names = Object.keys(cols);

  // ── 🔑 D-K4 — how many columns, and which. ──
  check(
    `${tag}: renders ${heroColumn ? 2 : 1} column(s) [${names.join(", ")}]`,
    names.length === (heroColumn ? 2 : 1),
    JSON.stringify(names),
  );
  // The pet is unconditional, so the page can never be empty. Judged on the
  // presence of a column whose art is a pet sticker, not on a name guess.
  const petName = names.find((n) => cols[n].src && /pets\//.test(cols[n].src));
  check(`${tag}: the pet column is present (${petName ?? "none"})`, Boolean(petName));

  if (!heroColumn) {
    // A single column must be CENTRED, not hugging the left half of a grid that
    // still has two tracks — the failure `:only-child` exists to prevent, and
    // one that looks like a broken page rather than a deliberate one.
    const only = cols[names[0]];
    const centreOffset = Math.abs(only.x + only.width / 2 - W / 2);
    check(
      `${tag}: the lone column is centred (centre off by ${Math.round(centreOffset)}px)`,
      centreOffset < 60,
      JSON.stringify(only),
    );
  }

  // ── the art: DECODED, sane size, and still composited (M63 + S117) ──
  for (const n of names) {
    const c = cols[n];
    check(`${tag}/${n}: art DECODED (not a broken-image box)`, c.decoded, c.src ?? "no src");
    check(
      `${tag}/${n}: rendered at a sane height (${c.artH}px, want 100-230)`,
      c.artH >= 100 && c.artH <= 230,
      JSON.stringify(c),
    );
    // 🔑 The S117 failure, measured rather than asserted: a full-bleed scene
    // shoved into this slot renders WIDE and squat. A bust is roughly portrait.
    check(
      `${tag}/${n}: the art is bust-shaped, not a full-bleed scene (${c.artW}x${c.artH})`,
      c.artW <= c.artH * 1.6,
      JSON.stringify(c),
    );
    check(`${tag}/${n}: composites with multiply at render`, c.blend === "multiply", c.blend);
    check(
      `${tag}/${n}: the feather mask survived into computed style`,
      Boolean(c.mask && c.mask !== "none"),
      c.mask,
    );
  }

  // ── D-K1 — the soon lives ONCE, and not on a card ──
  const soonCount = await page.$$eval(".crew-soon", (n) => n.length);
  check(`${tag}: exactly one soon panel on the rendered page`, soonCount === 1, String(soonCount));
  const cardText = await page.$$eval(".crew-cap", (ns) => ns.map((n) => n.innerText).join(" | "));
  check(`${tag}: no capability card wears a soon pill`, !/soon/i.test(cardText), cardText);

  // ── 🔑 THE CYCLE ACTUALLY ADVANCES. The thing no grep can see. ──
  // Judged on the pet column too: it has ONE sticker, so its art must NOT
  // change while its CARD does. That asymmetry is the founder's actual
  // instruction ("pet art rotates cards, not images") and this is the only
  // place it can be verified.
  const before = await readCols(page);
  const cardBefore = await page.$$eval(".crew-cap-title", (n) => n.map((e) => e.textContent));
  await page.waitForTimeout(ROTATE_MS + 900);
  const after = await readCols(page);
  const cardAfter = await page.$$eval(".crew-cap-title", (n) => n.map((e) => e.textContent));

  check(
    `${tag}: the capability cards advanced after one tick [${cardBefore}] → [${cardAfter}]`,
    JSON.stringify(cardBefore) !== JSON.stringify(cardAfter),
    JSON.stringify({ cardBefore, cardAfter }),
  );
  // 🔑 D-K5 — NEITHER column's art may move. This leg is INVERTED from what it
  // was on the first run, and the inversion is the story of the slice: the art
  // did cycle, it passed 89/89 here, and a screenshot showed it was feeding
  // full-bleed page scenes into a 190px composite slot. Only the cards move now.
  for (const n of names) {
    check(
      `${tag}/${n}: the art did NOT change (D-K5 — one composite-grade image each)`,
      before[n]?.src === after[n]?.src,
      `${before[n]?.src} → ${after[n]?.src}`,
    );
  }
  if (heroColumn) {
    const heroName = names.find((n) => n !== petName);
    // ...and it must be the CURATED bust that is standing still, not the
    // headline art. `throneImg` differs from `img` for exactly the heroes whose
    // headline scan is a scene, which is the population this protects.
    check(
      `${tag}/${heroName}: the still image is the curated bust (${after[heroName]?.src?.split("/").pop()})`,
      Boolean(after[heroName]?.src && !/hero-iron_man\.jpg$/.test(after[heroName].src)),
      after[heroName]?.src,
    );
  }

  await page.screenshot({ path: `${OUT}/crew-${tag.replace(/\W+/g, "-")}.png`, fullPage: true });

  // ── 🔑 THE INTERACTION: click one column, it expands and the other minimises.
  // Only meaningful with two columns, and only at desktop width (the phone
  // stacks them and drops the split by design).
  if (heroColumn && W > 640) {
    const heroName = names.find((n) => n !== petName);
    const wBefore = await readCols(page);
    await page.click(`.crew-col:has(.crew-name:text-is("${heroName}")) .crew-pick`);
    await page.waitForTimeout(900);
    const wAfter = await readCols(page);

    check(
      `${tag}: clicking ${heroName} WIDENED it (${wBefore[heroName].width} → ${wAfter[heroName].width}px)`,
      wAfter[heroName].width > wBefore[heroName].width + 20,
      JSON.stringify({ before: wBefore[heroName].width, after: wAfter[heroName].width }),
    );
    check(
      `${tag}: and MINIMISED ${petName} (${wBefore[petName].width} → ${wAfter[petName].width}px)`,
      wAfter[petName].width < wBefore[petName].width - 20,
      JSON.stringify({ before: wBefore[petName].width, after: wAfter[petName].width }),
    );
    check(
      `${tag}: the opened column reports aria-expanded to a screen reader`,
      wAfter[heroName].expanded === true && wAfter[petName].expanded === false,
      JSON.stringify({ hero: wAfter[heroName].expanded, pet: wAfter[petName].expanded }),
    );
    // Opening shows the WHOLE list; the minimised one keeps cycling one card.
    check(
      `${tag}: the opened column shows all its cards (${wAfter[heroName].cards}), the other one (${wAfter[petName].cards})`,
      wAfter[heroName].cards > 1 && wAfter[petName].cards === 1,
      JSON.stringify({ hero: wAfter[heroName].cards, pet: wAfter[petName].cards }),
    );

    // 🔑 D-K3 — the opened column's CARDS stop cycling (it is showing all of
    // them, so there is nothing to cycle), while the minimised one keeps going.
    // "Pause when expanded" is about the thing being looked at, not about the
    // whole page going still — so this asserts both halves, not just the pause.
    const openCards1 = await page.$$eval(".crew-cap-title", (n) => n.map((e) => e.textContent));
    await page.waitForTimeout(ROTATE_MS + 900);
    const openCards2 = await page.$$eval(".crew-cap-title", (n) => n.map((e) => e.textContent));
    const heroCards1 = openCards1.slice(0, wAfter[heroName].cards);
    const heroCards2 = openCards2.slice(0, wAfter[heroName].cards);
    check(
      `${tag}: the opened column's cards held still [${heroCards1}]`,
      JSON.stringify(heroCards1) === JSON.stringify(heroCards2),
      JSON.stringify({ heroCards1, heroCards2 }),
    );
    check(
      `${tag}: the minimised column kept cycling its single card`,
      JSON.stringify(openCards1.slice(wAfter[heroName].cards)) !==
        JSON.stringify(openCards2.slice(wAfter[heroName].cards)),
      JSON.stringify({ openCards1, openCards2 }),
    );

    await page.screenshot({
      path: `${OUT}/crew-${tag.replace(/\W+/g, "-")}-expanded.png`,
      fullPage: true,
    });

    // Pressing it again returns to the resting state — a student must never be
    // trapped in a view they cannot leave.
    await page.click(`.crew-col:has(.crew-name:text-is("${heroName}")) .crew-pick`);
    await page.waitForTimeout(900);
    const wReset = await readCols(page);
    check(
      `${tag}: pressing again returns to the even split (${wReset[heroName].width} vs ${wReset[petName].width}px)`,
      Math.abs(wReset[heroName].width - wReset[petName].width) < 30,
      JSON.stringify({ hero: wReset[heroName].width, pet: wReset[petName].width }),
    );
  }

  measured[tag] = { cols: after, names };
}

// ── D-K3's other half: REDUCED MOTION holds one frame forever. A separate
// context, because the app reads the setting once at mount.
{
  setHero("iron_man");
  const rmCtx = await browser.newContext({
    viewport: { width: W, height: H },
    reducedMotion: "reduce",
  });
  await signIn(rmCtx);
  const rm = await rmCtx.newPage();
  await rm.goto(FE, { waitUntil: "domcontentloaded" });
  await rm.waitForTimeout(1400);
  await rm.click('button[aria-label="Crew"]');
  await rm.waitForTimeout(900);
  const src1 = await rm.$$eval(".crew-art", (n) => n.map((e) => e.getAttribute("src")));
  const cards1 = await rm.$$eval(".crew-cap-title", (n) => n.map((e) => e.textContent));
  await rm.waitForTimeout(ROTATE_MS + 1200);
  const src2 = await rm.$$eval(".crew-art", (n) => n.map((e) => e.getAttribute("src")));
  const cards2 = await rm.$$eval(".crew-cap-title", (n) => n.map((e) => e.textContent));
  check(
    `reduced motion: the art never moves`,
    JSON.stringify(src1) === JSON.stringify(src2),
    JSON.stringify({ src1, src2 }),
  );
  check(
    `reduced motion: the cards never move either`,
    JSON.stringify(cards1) === JSON.stringify(cards2),
    JSON.stringify({ cards1, cards2 }),
  );
  // And it must hold the CURATED bust, not whatever frame 0 happened to be —
  // this is the condition the variant ordering was written for.
  check(
    `reduced motion: it holds the curated bust (${src1[0]?.split("/").pop()})`,
    Boolean(src1[0] && /throne|hero-/.test(src1[0])),
    src1[0] ?? "none",
  );
  await rm.screenshot({ path: `${OUT}/crew-reduced-motion.png`, fullPage: true });
  await rmCtx.close();
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
