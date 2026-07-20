/**
 * probe_admin_gate — S124 exit gate (the admin EMAIL whitelist + the `/admin` route).
 *
 * The slice's claim is that reaching the admin portal now takes TWO locks: an
 * `admin` membership row AND an address in `ADMIN_EMAILS`. This probe is what
 * makes that claim testable.
 *
 * 🔑 WHY THIS FILE EXISTS AT ALL — and it is the finding of the slice. The two
 * existing admin probes (`probe_admin_ingest`, `probe_admin_people`) look like
 * they cover this surface, and do not: every one of their admin-role legs calls
 * the SERVICE functions directly (`assertAdmin`, `grantRole`, `listPeople(tx)`),
 * and their only HTTP legs are UNAUTHENTICATED 401 checks. Nothing anywhere
 * drove `adminProcedure` as a signed-in admin. So the middleware I changed had
 * no coverage before this file, and changing it broke nothing — which would have
 * read as "the change is safe" when it actually meant "nothing was watching".
 * (M76's question — "what tests this RULE?" — answered honestly for once.)
 *
 *   1. `isAdminEmail` — the list itself, including the normalisation that stops
 *      a capitalised address from 404ing a real admin (the M82 family).
 *   2. `assertAdminAccess` — all four combinations of (role, email). Three of
 *      them must throw, and the two-lock claim is exactly the assertion that
 *      role-alone and email-alone are BOTH insufficient.
 *   3. The refusals are INDISTINGUISHABLE — an off-list admin and an ordinary
 *      student get the same `NOT_AN_ADMIN` code. This is a deliberate
 *      non-disclosure property, so it gets a test rather than a comment.
 *   4. SOURCE: `adminProcedure` calls `assertAdminAccess`, not bare `assertAdmin`.
 *      The realistic regression is someone "simplifying" the middleware back.
 *   5. SOURCE: `App.tsx` no longer auto-routes admins to <AdminPage> from `/`,
 *      and `/admin` is matched EXACTLY.
 *
 * ⚠️ EVERY SOURCE LEG READS COMMENT-STRIPPED TEXT (`code()`), and in this file
 * that is not a precaution — it is load-bearing. The App.tsx block explaining
 * the removed auto-route CONTAINS the literal `me.role === "admin"`, so leg 5
 * greps its own removal notice and passes on prose. That is M77 exactly, third
 * occurrence, authored by the same hand that was writing the fix. Each source
 * leg below therefore carries a NEGATIVE CONTROL asserting the stripped text
 * genuinely lacks the thing — proving the leg reads code, not apology.
 */
import { ADMIN_EMAILS, isAdminEmail } from "@b2c/kernel/contracts";
import { assertAdminAccess, AdminOnlyError } from "../src/services/admin_ingest";

let passed = 0;
let failed = 0;
function check(label: string, ok: boolean, detail?: string) {
  if (ok) {
    passed++;
    console.log(`  ✓ ${label}`);
  } else {
    failed++;
    console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

/** Comment-stripped source (M77). Same shape as probe_echo_guard's helper. */
const code = (s: string) =>
  s
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1")
    .replace(/\n(?:[ \t]*\n)+/g, "\n");

console.log("\n── probe_admin_gate (S124) ──\n");

// ─────────────────────── 1. the list ───────────────────────
console.log("1. ADMIN_EMAILS / isAdminEmail");

check("the whitelist holds exactly 2 addresses", ADMIN_EMAILS.length === 2, `got ${ADMIN_EMAILS.length}`);
for (const e of ADMIN_EMAILS) {
  check(`whitelisted address is admitted: ${e}`, isAdminEmail(e));
}

// 🔴 THE NORMALISATION LEGS. These are the M82 family: the function's trigger is
// the ABSENCE of a match, and "absent" has causes beyond "not on the list". An
// identity provider that hands back a capitalised address would silently lock a
// real admin out of their own portal, and the page would tell them nothing.
check("case is normalised (UPPERCASE admitted)", isAdminEmail(ADMIN_EMAILS[0]!.toUpperCase()));
check("case is normalised (MiXeD admitted)", isAdminEmail("Xxxx51263@Gmail.Com"));
check("surrounding whitespace is trimmed", isAdminEmail(`  ${ADMIN_EMAILS[0]}  `));

// Fails closed, every flavour of nothing.
check("null → refused", !isAdminEmail(null));
check("undefined → refused", !isAdminEmail(undefined));
check("empty string → refused", !isAdminEmail(""));
check("a stranger → refused", !isAdminEmail("someone@example.com"));

// 🔴 NOT A PREFIX / SUFFIX MATCH (M79 — a prefix match is not an existence
// proof). These four are the realistic attacks on a naive `includes`, and each
// one is a real address someone could register.
check("prefix is not a match", !isAdminEmail("xxxx51263@gmail.com.evil.com"));
check("suffix is not a match", !isAdminEmail("evil-xxxx51263@gmail.com"));
check("substring is not a match", !isAdminEmail("xxxx5126@gmail.com"));
check("a plus-tag is not the same address", !isAdminEmail("xxxx51263+admin@gmail.com"));

// ─────────────────── 2. the two-lock rule ───────────────────
console.log("\n2. assertAdminAccess — role AND email");

const LISTED = ADMIN_EMAILS[0]!;
const OFFLIST = "stranger@example.com";

function throwsAdminOnly(role: string, email: string | null): AdminOnlyError | null {
  try {
    assertAdminAccess(role, email);
    return null;
  } catch (e) {
    return e instanceof AdminOnlyError ? e : null;
  }
}

check("admin role + listed email → PASSES", throwsAdminOnly("admin", LISTED) === null);

// The two halves of the claim. If either of these ever goes green-by-passing,
// the surface has one lock and the slice is undone.
check("admin role + OFF-LIST email → refused", throwsAdminOnly("admin", OFFLIST) !== null);
check("student role + listed email → refused", throwsAdminOnly("student", LISTED) !== null);
check("tutor role + listed email → refused", throwsAdminOnly("tutor", LISTED) !== null);
check("parent role + listed email → refused", throwsAdminOnly("parent", LISTED) !== null);
check("student role + off-list email → refused", throwsAdminOnly("student", OFFLIST) !== null);
check("admin role + null email → refused", throwsAdminOnly("admin", null) !== null);

// ────────────── 3. the refusals do not leak ──────────────
console.log("\n3. non-disclosure");

// An off-list admin must be told exactly what a random student is told. A
// distinct code would confirm to whoever is probing that they hold a real admin
// row and only the address is missing — i.e. precisely what to attack next.
const offListAdmin = throwsAdminOnly("admin", OFFLIST);
const plainStudent = throwsAdminOnly("student", OFFLIST);
check(
  "off-list admin and ordinary student get the SAME code",
  offListAdmin?.code === plainStudent?.code,
  `${offListAdmin?.code} vs ${plainStudent?.code}`,
);
check("and that code is NOT_AN_ADMIN", offListAdmin?.code === "NOT_AN_ADMIN", offListAdmin?.code);

// ──────────────── 4. source: the middleware ────────────────
console.log("\n4. source — adminProcedure takes both locks");

const initSrc = code(
  await Bun.file(new URL("../src/trpc/init.ts", import.meta.url)).text(),
);

// Anchored on the CALL (`(`), never the bare identifier (M79) — prose contains
// identifiers, it does not contain syntax.
check("adminProcedure calls assertAdminAccess(", /assertAdminAccess\(/.test(initSrc));
check(
  "the email arrives from the SESSION, not a header or an argument",
  /assertAdminAccess\(\s*ctx\.membership\.role\s*,\s*ctx\.realUser\.email\s*\)/.test(initSrc),
);

// 🔴 NEGATIVE CONTROL — the reason this leg is trustworthy. `assertAdmin(` is a
// PREFIX of `assertAdminAccess(`, so a naive check for the old call would match
// the new one and could never fail. Excluding the longer form is what makes the
// claim real; without this the leg would report a guarantee nobody makes.
const bareAssertAdminCalls = (initSrc.match(/assertAdmin\((?!\s*ctx\.membership\.role\s*,)/g) ?? [])
  .length;
check(
  "the bare assertAdmin( call is GONE from the middleware",
  !/\bassertAdmin\(/.test(initSrc.replace(/assertAdminAccess\(/g, "")),
  `${bareAssertAdminCalls} bare call(s) remain`,
);

// ──────────────── 5. source: the FE route ────────────────
console.log("\n5. source — /admin is the only door");

const appRaw = await Bun.file(
  new URL("../frontend/src/App.tsx", import.meta.url),
).text();
const appSrc = code(appRaw);

check("App.tsx defines ADMIN_PATH", /const ADMIN_PATH\s*=\s*"\/admin"/.test(appSrc));
check("the route is matched EXACTLY, not by prefix", /=== ADMIN_PATH/.test(appSrc));
check("the FE route also checks isAdminEmail(", /isAdminEmail\(/.test(appSrc));
check("<AdminPage renders only inside the isAdminRoute branch", /if \(isAdminRoute\)/.test(appSrc));

// 🔴 THE LEG THIS WHOLE FILE'S HEADER WARNS ABOUT. The removal notice left in
// App.tsx contains the literal `me.role === "admin"`, so this grep run against
// RAW source finds it and passes on prose — a live M77, manufactured while
// fixing M77. The two assertions below are pointed in OPPOSITE directions
// (S123's strengthened rule): the string must be ABSENT from code AND PRESENT
// in the raw file. A single-direction check would pass on a file where the
// comment had also been deleted, proving nothing about either.
const autoRoute = /if \(me\.role === "admin"\) \{\s*return \(\s*<AdminPage/;
check("the `/` auto-route to <AdminPage> is GONE from the code", !autoRoute.test(appSrc));
check(
  "…and the comment explaining its removal survives (control: the strip worked)",
  /me\.role === "admin"/.test(appRaw) && !/me\.role === "admin"\) \{/.test(appSrc),
  "if this fails, either the notice was deleted or code() is not stripping",
);

// ────────── 6. the patterns above CAN fail (controls) ──────────
console.log("\n6. negative controls — every source pattern run against a known-bad fixture");

/**
 * 🔑 WHY FIXTURES AND NOT A HAND-EDIT. The honest way to trust a source-grep leg
 * is to break the thing it watches and see it redden. Doing that by editing the
 * real files means the repository briefly contains a DISABLED SECURITY CHECK —
 * which is exactly as dangerous as it sounds, and is worth refusing on its own
 * (the attempt was blocked here, correctly). It is also a one-off: it proves the
 * leg worked on the day someone remembered to do it.
 *
 * Running each pattern against a synthetic bad string proves the same property,
 * proves it permanently, and never puts an open gate on disk. A leg that passes
 * §4/§5 and ALSO passes here is reading syntax; one that matches the fixture is
 * an M79 prefix bug caught before it can ship a false green.
 */
const FIXTURE_OLD_MIDDLEWARE = `
export const adminProcedure = protectedProcedure.use(async ({ ctx, next }) => {
  try {
    assertAdmin(ctx.membership.role);
  } catch (e) {}
});`;
const FIXTURE_OLD_APP = `
  if (me.role === "admin") {
    return (
      <AdminPage adminName={displayName} />
    );
  }`;

check(
  "the two-lock pattern does NOT match the old single-lock middleware",
  !/assertAdminAccess\(/.test(FIXTURE_OLD_MIDDLEWARE),
);
check(
  "the bare-assertAdmin detector DOES fire on the old middleware",
  /\bassertAdmin\(/.test(FIXTURE_OLD_MIDDLEWARE.replace(/assertAdminAccess\(/g, "")),
);
check("the auto-route detector DOES fire on the old App.tsx", autoRoute.test(FIXTURE_OLD_APP));
check(
  "…and does NOT fire on the shipped App.tsx (the claim itself, restated)",
  !autoRoute.test(appSrc),
);

/**
 * §2 needs no fixture: its legs already control each other. One leg demands a
 * PASS (admin + listed) and six demand a THROW. A degenerate implementation that
 * refused everyone would redden the first; one that admitted everyone would
 * redden the other six. No single wrong implementation satisfies both directions,
 * which is the property a negative control exists to establish.
 */
check(
  "§2 is bidirectional (a pass leg and a throw leg over the same function)",
  throwsAdminOnly("admin", LISTED) === null && throwsAdminOnly("admin", OFFLIST) !== null,
);

// ─────────────────────────── result ───────────────────────────
console.log(`\n── ${passed} passed, ${failed} failed ──\n`);
process.exit(failed === 0 ? 0 : 1);
