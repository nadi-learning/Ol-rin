/**
 * Slice E walk (S112) — drives the BOARD PICK in a real browser (M37).
 *
 * Why a walk and not just the probe: `probe_board_pick` proves the services and
 * the wire, but the slice's riskiest surface is a UI rule no service can hold —
 * changing the board must CLEAR the picked grade, because grade values are not
 * portable between boards ("10" vs "IGCSE") and a stale one fails
 * saveAboutYou's closed-set check AFTER the board has already been committed.
 * S111 is the precedent: the only bug that session found (listLinks with no
 * ORDER BY) was found by clicking a button, not by a probe.
 *
 * It walks a BRAND-NEW identity — signed up fresh, member of nothing — because
 * that is the only state in which the board row exists at all.
 *
 * ⚠️ Lives in the repo scratchpad, not a session one: ESM resolves imports from
 * the SCRIPT's location, and playwright-core is in b2c-rewrite/node_modules.
 *   node scratchpad/board-pick-walk.mjs <outDir> <w> <h>
 *
 * Cleanup: prints the throwaway email it created. `scratchpad/walk_teardown.ts`
 * removes it.
 */
import { chromium } from "playwright-core";
import { mkdirSync } from "fs";

const OUT = process.argv[2] || "./scratchpad/board-walk-shots";
const W = Number(process.argv[3] || 1440);
const H = Number(process.argv[4] || 900);
mkdirSync(OUT, { recursive: true });

const FE = "http://localhost:5174";
const BE = "http://localhost:3010";
const TAG = Date.now();
const EMAIL = `bpwalk-${TAG}@example.com`;
const PASS = "dev-password-123";
const RETURNING = "demo@example.com"; // already has a membership

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
  await settle(page);
  const f = `${OUT}/${String(++n).padStart(2, "0")}-${name}.png`;
  await page.screenshot({ path: f });
  console.log(`  📸 ${f}`);
};

// Verbatim from onb-walk.mjs — the caret-detached signal, not a guessed sleep
// (M46). Reading inside a transition returns the PRE-change value and looks
// exactly like a bug.
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

/** The duo row whose label starts with `labelStart`, as {label, options[], picked}. */
const readRow = (page, labelStart) =>
  page.evaluate((start) => {
    const rows = [...document.querySelectorAll(".onb-duo-row")];
    const row = rows.find((r) =>
      (r.querySelector(".onb-duo-label")?.textContent ?? "").trim().toLowerCase().startsWith(start),
    );
    if (!row) return null;
    const btns = [...row.querySelectorAll("button")];
    return {
      label: row.querySelector(".onb-duo-label")?.textContent?.trim() ?? "",
      options: btns.map((b) => b.textContent.trim()),
      picked: btns.filter((b) => b.getAttribute("aria-pressed") === "true").map((b) => b.textContent.trim()),
      empty: row.querySelector(".onb-duo-empty")?.textContent?.trim() ?? null,
    };
  }, labelStart.toLowerCase());

async function signIn(ctx, email, { signUp }) {
  const path = signUp ? "sign-up/email" : "sign-in/email";
  const body = signUp ? { email, password: PASS, name: "BP Walk" } : { email, password: PASS };
  const res = await fetch(`${BE}/api/auth/${path}`, {
    method: "POST",
    // Better Auth enforces trusted origins — without this it 403s and every
    // shot below is silently the LOGIN page rather than the flow.
    headers: { "content-type": "application/json", origin: FE },
    body: JSON.stringify(body),
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
async function newPage(ctx) {
  const page = await ctx.newPage();
  page.on("console", (m) => {
    if (m.type() !== "error") return;
    const t = m.text();
    // "Failed to load resource: …" carries no URL and is unactionable on its
    // own; every one of them has a matching response event, which DOES name the
    // URL. Judged there instead, so nothing is dropped — just attributed.
    if (t.startsWith("Failed to load resource")) return;
    errors.push(t.slice(0, 200));
    console.log("  🔴 console:", t.slice(0, 160));
  });
  page.on("response", (r) => {
    if (r.status() < 400) return;
    const url = r.url();
    // /favicon.ico 404s on the Vite dev server and always has (verified with
    // curl; nothing in Slice E touches it). Ignored BY NAME and reported, so
    // the leg keeps its teeth instead of being deleted wholesale.
    if (new URL(url).pathname === "/favicon.ico") {
      console.log("  ~ ignored: /favicon.ico 404 (pre-existing dev-server miss)");
      return;
    }
    errors.push(`${r.status()} ${url}`);
    console.log(`  🔴 ${r.status()} ${url}`);
  });
  page.on("pageerror", (e) => {
    errors.push(String(e).slice(0, 200));
    console.log("  🔴 pageerror:", String(e).slice(0, 160));
  });
  return page;
}

// ── PART 1 — the brand-new student who belongs nowhere ─────────────────────
console.log(`\n── new student (${EMAIL}) @ ${W}×${H} ──`);
const ctx1 = await browser.newContext({
  viewport: { width: W, height: H },
  deviceScaleFactor: 2,
  reducedMotion: "reduce",
});
const up = await signIn(ctx1, EMAIL, { signUp: true });
check(`fresh sign-up returned a session (status ${up.status}, ${up.cookies} cookies)`, up.cookies > 0);

const page = await newPage(ctx1);
await page.goto(FE, { waitUntil: "domcontentloaded" });
await shot(page, `greet-${W}`);

// The member-less student must land in ONBOARDING, not on an error gate — the
// old build would have auto-enrolled them on cbse and gone straight to the
// dashboard, which is the whole bug.
check("member-less student lands in onboarding, not a gate", await page.locator(".onb-card").isVisible());
check("no board written to localStorage before the pick", (await page.evaluate(() => localStorage.getItem("b2c.board"))) === null);

// greet advances with NO server call (saveStep is protected and unreachable
// pre-board). If it silently 403'd, this click leaves us on greet.
await clickText(page, "Let's go");
await shot(page, `about-you-preboard-${W}`);

// The prompt must COUNT the rows it is about to show. "Two quick things" over
// three rows is a small lie, and small lies in a child's first two minutes are
// the expensive kind.
const prompt = (await page.locator(".onb-stage-prompt").first().textContent()) ?? "";
check("prompt says THREE quick things for a board-picking student", /three quick things/i.test(prompt));
check("…and names the board first", /your board/i.test(prompt));

const boardRow = await readRow(page, "i'm studying");
check("about_you shows the exam-board row", boardRow !== null);
check("board row offers at least one board", (boardRow?.options.length ?? 0) > 0);
console.log(`     boards offered: ${boardRow?.options.join(", ")}`);

// 🔑 the pre-board grade row must explain itself, not claim missing content.
const gradeRow0 = await readRow(page, "i'm in class");
check("grade row says '— pick your board first —' before a board is picked", gradeRow0?.empty === "— pick your board first —");

// pick the FIRST board → grades load without any membership
const firstBoard = boardRow.options[0];
const secondBoard = boardRow.options[1] ?? null;
await clickText(page, firstBoard);
await settle(page);
const gradeRow1 = await readRow(page, "i'm in class");
check(`grades load for '${firstBoard}' with no membership`, (gradeRow1?.options.length ?? 0) > 0);
console.log(`     grades for ${firstBoard}: ${gradeRow1?.options.join(", ")}`);
await shot(page, `board-picked-${W}`);

// 🔴 THE RULE THIS WALK EXISTS FOR — changing board clears the grade.
if (secondBoard) {
  await clickText(page, gradeRow1.options[0]);
  await settle(page);
  const mid = await readRow(page, "i'm in class");
  check("a grade can be picked", mid.picked.length === 1);

  await clickText(page, secondBoard);
  await settle(page);
  const after = await readRow(page, "i'm in class");
  check("🔴 switching board CLEARS the picked grade", after.picked.length === 0);
  const boardAfter = await readRow(page, "i'm studying");
  check("…and the new board is the picked one", boardAfter.picked[0] === secondBoard);
  console.log(`     grades for ${secondBoard}: ${after.options.join(", ")}`);
  await shot(page, `board-switched-grade-cleared-${W}`);

  // back to the first board so the rest of the walk runs on real content
  await clickText(page, firstBoard);
  await settle(page);
} else {
  console.log("  ~ only one board has a catalogue — switch-clears-grade leg skipped");
}

// the CTA must stay disabled until all three rows are answered
const gradeRow2 = await readRow(page, "i'm in class");
const ctaDisabled = () => page.locator(".onb-duo-cta").isDisabled();
check("CTA is disabled with board only", await ctaDisabled());
await clickText(page, gradeRow2.options[0]);
check("CTA is still disabled without a pronoun", await ctaDisabled());
await clickText(page, "she");
check("CTA enables once board + class + pronoun are answered", !(await ctaDisabled()));
await shot(page, `about-you-answered-${W}`);

// commit: chooseBoard → setBoard → saveAboutYou
await clickText(page, "That's me");
await settle(page);
const storedBoard = await page.evaluate(() => localStorage.getItem("b2c.board"));
check("🔑 the pick committed a board to localStorage", typeof storedBoard === "string" && storedBoard.length > 0);
console.log(`     board committed: ${storedBoard}`);
check("the flow advanced past about_you", !(await page.locator(".onb-duo").isVisible().catch(() => false)));
await shot(page, `advanced-past-about-you-${W}`);

// ── the rest of onboarding must still work (it is all board-scoped now) ────
await clickText(page, "Show me everyone").catch(() => {});
await clickText(page, "Arya Stark").catch(() => console.log("  ⚠️ hero pick missed"));
await page.locator(".onb-page").waitFor({ state: "visible", timeout: 10000 }).catch(() => {});
await clickText(page, "Next").catch(() => {});
await settle(page);
await clickText(page, "Direwolf").catch(() => console.log("  ⚠️ pet pick missed"));
await settle(page);
await clickText(page, "Skip").catch(() => console.log("  ⚠️ no Skip control"));

// epilogue is a ~10s timed close — plain snaps, never settle() (it would sleep
// through the whole thing and shoot the dashboard wearing an epilogue name).
await page.locator(".onb-epi").first().waitFor({ state: "visible", timeout: 12000 }).catch(() => {});
await page.waitForTimeout(11500);
await settle(page);
await shot(page, `dashboard-first-run-${W}`);

// The real end-to-end assertion: a student who owned no board at boot is now
// looking at board-scoped content. `me` had to succeed for this to render.
// Assert on what a STUDENT sees, not a class name: "My Lessons" + at least one
// real chapter row. The first version of this matched on `[class^='dash-']`,
// went red, and the screenshot showed a perfectly rendered dashboard — the
// selector was wrong, not the app. Shooting first is what caught that.
const onDash = await page.getByText(/My Lessons/i).first().isVisible().catch(() => false);
check("🔑 the new student reaches the DASHBOARD (me resolved post-pick)", onDash);
const lessonRows = await page.getByRole("button", { name: /Start lesson/i }).count();
check(`…with board-scoped content on it (${lessonRows} lesson rows)`, lessonRows > 0);

// a reload must not re-ask: whoami now finds the membership
await page.reload({ waitUntil: "domcontentloaded" });
await settle(page);
check("reload does NOT re-ask for a board", !(await page.locator(".onb-duo").isVisible().catch(() => false)));
await shot(page, `after-reload-${W}`);

await ctx1.close();

// ── PART 2 — the returning student must never see the board row ────────────
console.log(`\n── returning student (${RETURNING}) ──`);
const ctx2 = await browser.newContext({
  viewport: { width: W, height: H },
  deviceScaleFactor: 2,
  reducedMotion: "reduce",
});
const inRes = await signIn(ctx2, RETURNING, { signUp: false });
const page2 = await newPage(ctx2);
await page2.goto(FE, { waitUntil: "domcontentloaded" });
await settle(page2);
check(`returning sign-in worked (status ${inRes.status})`, inRes.cookies > 0);
// They resume wherever they were. If that happens to be about_you, the board
// row must be absent; if they are past it, the row is trivially absent — both
// are the same assertion and neither should ever show "I'm studying".
const stray = await page2.getByText(/I'm studying/i).count();
check("🔑 a returning student is NEVER re-asked for a board", stray === 0);
await shot(page2, `returning-student-${W}`);
await ctx2.close();

await browser.close();

check("no console/page errors during the walk", errors.length === 0);
console.log(`\nboard-pick walk: ${pass} passed, ${fail} failed`);
console.log(`\n⚠️ CLEANUP: throwaway identity ${EMAIL} — run:`);
console.log(`   WALK_EMAIL=${EMAIL} bun scratchpad/walk_teardown.ts`);
process.exit(fail === 0 ? 0 : 1);
