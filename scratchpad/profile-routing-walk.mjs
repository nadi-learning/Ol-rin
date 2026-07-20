/**
 * S123 walk — THE FOUNDER'S REPORT, DRIVEN IN A REAL BROWSER.
 *
 * "check if i am able to login via same email as tutor its taking me to student
 * login only which should not happen; check for all cases in parent and tutor"
 *
 * Why a walk and not just `probe_auth_membership`: the probe proves the SERVICE
 * refuses to substitute a profile (requireMembership with `profile: 'student'`
 * on a tutor-only identity throws). It cannot prove the thing the founder
 * actually saw, which is a RENDER decision in App.tsx — the persona is read
 * from localStorage, validated against `whoami`, and routed. Every bug in this
 * area for three sessions running (M78, M79) lived in that FE latch and went
 * green in every probe.
 *
 * Four identities, because "all cases in parent and tutor" is four cases:
 *   A. student-only email, persona=tutor  → waiting room, NOT the student app
 *   B. student-only email, persona=parent → waiting room, NOT the student app
 *   C. student-only email, persona=student → the student app (the control —
 *      without this the walk would pass if EVERYTHING went to the waiting room)
 *   D. a real tutor, persona=tutor         → the tutor surface (the other
 *      control: the fix must not lock genuine tutors out)
 *
 * C and D are not optional. A walk that only checks the denials passes just as
 * happily on an app that denies everyone.
 *
 *   node scratchpad/profile-routing-walk.mjs <outDir> <w> <h>
 */
import { chromium } from "playwright-core";
import { mkdirSync } from "fs";

const OUT = process.argv[2] || "./scratchpad/profile-walk-shots";
const W = Number(process.argv[3] || 1440);
const H = Number(process.argv[4] || 900);
mkdirSync(OUT, { recursive: true });

const FE = "http://localhost:5174";
const BE = "http://localhost:3010";
const TAG = Date.now();
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
  const f = `${OUT}/${String(++n).padStart(2, "0")}-${name}.png`;
  await page.screenshot({ path: f });
  console.log(`  📸 ${f}`);
};

async function signIn(ctx, email, { signUp }) {
  const path = signUp ? "sign-up/email" : "sign-in/email";
  const body = signUp ? { email, password: PASS, name: "Profile Walk" } : { email, password: PASS };
  const res = await fetch(`${BE}/api/auth/${path}`, {
    method: "POST",
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

/**
 * What surface are we looking at? Read from LANDMARKS, not copy.
 *
 * 🔴 M-lesson from S122: do not gate a walk on prose. The waiting room's text is
 * role-specific and the dashboard's greeting is name-specific, so a regex over
 * either would be asserting the copy generator, not the routing. `.shire-root`
 * (the signboard) and `.dash` (the student dashboard) are structural and
 * mutually exclusive.
 */
const surfaceOf = (page) =>
  page.evaluate(() => {
    if (document.querySelector(".shire-root")) return "waiting-room";
    if (document.querySelector(".dash")) return "student";
    // `.tut-root`, NOT `.tutor-root` — the first cut of this walk guessed the
    // latter and reported the tutor surface as "unknown", i.e. a red that was
    // entirely my own selector. Verified against TutorPage.tsx:81.
    if (document.querySelector(".tut-root")) return "tutor";
    if (document.querySelector(".onb-stage, .onb-duo-row")) return "onboarding";
    const h = document.querySelector("h1,h2")?.textContent?.trim() ?? "";
    return `unknown(${h.slice(0, 40)})`;
  });

const browser = await chromium.launch({
  executablePath:
    "/Users/mab/Library/Caches/ms-playwright/chromium-1223/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing",
});

/** Sign in, plant a persona in localStorage, load the app, report the surface. */
async function visit(email, persona, { signUp = false } = {}) {
  const ctx = await browser.newContext({ viewport: { width: W, height: H } });
  const r = await signIn(ctx, email, { signUp });
  if (r.status >= 400 || !r.cookies) {
    console.error(`  ! sign-in failed for ${email}: ${r.status}`);
    await ctx.close();
    return { surface: "sign-in-failed" };
  }
  const page = await ctx.newPage();
  // Persona must be planted BEFORE the app boots — it is read during the first
  // render and drives the whoami validation. Setting it after load would test a
  // reload path the founder never takes.
  await page.goto(FE);
  await page.evaluate((p) => {
    if (p) localStorage.setItem("b2c.persona", p);
    else localStorage.removeItem("b2c.persona");
  }, persona);
  await page.goto(FE);
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(1200);
  const surface = await surfaceOf(page);
  return { surface, page, ctx };
}

console.log(`\n── S123 profile routing walk @ ${W}x${H} ──\n`);

// ── Identity 1: a fresh student. Onboarding is NOT completed here; what matters
// is that a membership exists, which `chooseBoard` creates. We drive it the
// cheap way: sign up, let onboarding mint the student membership via the app.
const studentEmail = `pwalk-stu-${TAG}@example.com`;
{
  const { surface, page, ctx } = await visit(studentEmail, "student", { signUp: true });
  console.log(`\n[A0] brand-new signup, persona=student → ${surface}`);
  // 🔴 THE REGRESSION GUARD I nearly shipped: a new student holds NO membership
  // yet, so a naive "claimed profile not held → waiting room" check would send
  // every single new signup to the signboard instead of onboarding.
  check("new student with persona=student reaches ONBOARDING (not the waiting room)",
    surface === "onboarding");
  if (page) await shot(page, "A0-new-student-onboarding");
  await ctx?.close();
}

// Give this identity a real student membership without walking all of onboarding.
const { execSync } = await import("child_process");
execSync(
  `bun run scripts/../scratchpad/profile-walk-seed.ts ${studentEmail} student`,
  { cwd: process.cwd(), stdio: "inherit" },
);

// ── Case A: student-only identity, clicks TUTOR
{
  const { surface, page, ctx } = await visit(studentEmail, "tutor");
  console.log(`\n[A] student-only identity, persona=tutor → ${surface}`);
  check("A: a student clicking TUTOR lands in the WAITING ROOM", surface === "waiting-room");
  check("A: …and is NOT silently given the student app (the founder's report)",
    surface !== "student");
  if (page) await shot(page, "A-student-clicks-tutor");
  await ctx?.close();
}

// ── Case B: student-only identity, clicks PARENT
{
  const { surface, page, ctx } = await visit(studentEmail, "parent");
  console.log(`\n[B] student-only identity, persona=parent → ${surface}`);
  check("B: a student clicking PARENT lands in the WAITING ROOM", surface === "waiting-room");
  check("B: …and is NOT silently given the student app", surface !== "student");
  if (page) await shot(page, "B-student-clicks-parent");
  await ctx?.close();
}

// ── Case C (CONTROL): same identity, clicks STUDENT → must still work
{
  const { surface, page, ctx } = await visit(studentEmail, "student");
  console.log(`\n[C] student identity, persona=student → ${surface}`);
  // 🔴 "onboarding" IS the pass here, and reading it as a red was my own
  // mistake. This identity has a student MEMBERSHIP but has never completed
  // onboarding, so onboarding is exactly where their student flow resumes —
  // the dashboard would be wrong. What the control has to prove is that the
  // student side is REACHABLE at all, not which of its two screens shows.
  check(
    "C CONTROL: the student still reaches their own flow (onboarding or dashboard)",
    surface === "student" || surface === "onboarding",
  );
  check("C CONTROL: …and is NOT diverted to the waiting room", surface !== "waiting-room");
  if (page) await shot(page, "C-student-clicks-student");
  await ctx?.close();
}

// ── Case D (CONTROL): a REAL tutor, clicks TUTOR → must reach the tutor surface
const tutorEmail = `pwalk-tut-${TAG}@example.com`;
{
  await fetch(`${BE}/api/auth/sign-up/email`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: FE },
    body: JSON.stringify({ email: tutorEmail, password: PASS, name: "Walk Tutor" }),
  });
  execSync(
    `bun run scripts/../scratchpad/profile-walk-seed.ts ${tutorEmail} tutor`,
    { cwd: process.cwd(), stdio: "inherit" },
  );
  const { surface, page, ctx } = await visit(tutorEmail, "tutor");
  console.log(`\n[D] real tutor, persona=tutor → ${surface}`);
  check("D CONTROL: a genuine tutor still reaches the TUTOR surface (not locked out)",
    surface === "tutor");
  check("D: …and is not dumped in the waiting room", surface !== "waiting-room");
  if (page) await shot(page, "D-tutor-clicks-tutor");
  await ctx?.close();
}

console.log(`\nprofile-routing-walk: ${pass} passed, ${fail} failed`);
console.log(`cleanup: ${studentEmail} ${tutorEmail}`);
await browser.close();
process.exit(fail ? 1 : 0);
