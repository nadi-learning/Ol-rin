/**
 * probe_echo_guard — Slice ONB-1 / S90, the echo guard (lib/safeEcho.ts).
 *
 * Onboarding repeats what a child types back at them in 52px display type, and
 * Pikachu shouts their favourite character. This asserts the guard that decides
 * when NOT to.
 *
 * The shape that matters here is a POSITIVE control (M39). A blocklist test
 * made only of "normal text still echoes" claims passes just as green with an
 * EMPTY list — it proves nothing about blocking. So both directions are
 * asserted:
 *   - it FIRES   → the founder's own example ("FUCK YOU") is refused
 *   - it DOESN'T over-fire → "I am in class 10" still echoes (the Scunthorpe
 *     trap: substring matching would block "class", "assignment", "Cooper")
 *
 * No DB, no network — safeEcho is pure. It imports FE modules directly because
 * that is where the guard lives and a copy in scripts/ would drift.
 */
import { canEcho, looksLikeRefusal } from "../frontend/src/lib/safeEcho";
import { BEAT_BY_ID, loaderPikaSay, pikachuLine } from "../frontend/src/components/onboarding.copy";

let passed = 0;
let failed = 0;
function check(name: string, ok: boolean, detail?: string) {
  if (ok) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

console.log("\nprobe_echo_guard\n");

// ── 1. it must NOT over-fire ────────────────────────────────────────────────
// If these break, the guard is eating the feature it protects.
console.log("1. clean answers still echo");
check("a real favourite character", canEcho("Interstellar - Cooper"));
check("a real fun fact", canEcho("Ravi can solve a cube in 40s"));
check("'class' is not blocked (it contains a blocked word)", canEcho("I am in class 10"));
check("'assignment' is not blocked", canEcho("assignment"));
check("a name is not blocked", canEcho("Cooper"));

// ── 2. it must FIRE ────────────────────────────────────────────────────────
// The load-bearing half. An empty blocklist passes section 1 perfectly.
console.log("\n2. the guard actually fires");
check("the founder's own example", !canEcho("FUCK YOU"));
check("case does not matter", !canEcho("fuck you"));
check("mid-sentence, not just standalone", !canEcho("my school is shit"));
check("a slur", !canEcho("nigger"));
check("hinglish, not just english", !canEcho("chutiya"));

// ── 3. nothing is not echoable ─────────────────────────────────────────────
console.log("\n3. empty is not echoable");
check("blank string", !canEcho("   "));
check("null", !canEcho(null));
check("undefined", !canEcho(undefined));

// ── 4. Pikachu — the loudest echo in the flow ──────────────────────────────
console.log("\n4. Pikachu");
check("REPEATS a clean character (by LABEL, from the chip id)", pikachuLine("iron_man").includes("Iron Man"));
check("tolerates a pre-S91 row (typed text, not an id)", pikachuLine("Interstellar - Cooper").includes("Interstellar"));
check(
  "REFUSES a blocked one (falls back, does not repeat)",
  pikachuLine("fuck you") === "Pika! …Pika-pi?",
  pikachuLine("fuck you"),
);
check("falls back on a skip", pikachuLine(null) === "Pika! …Pika-pi?");

// ── 5. the refusal guard (S91) ─────────────────────────────────────────────
// The bug this exists for is the founder's own walkthrough: they typed "No
// movie" and the flow PRAISED it. Same positive-control shape as section 2 —
// asserting only "real answers aren't refusals" would pass with an empty list.
console.log("\n5. refusals are recognised");
check("the founder's own answer: 'No movie'", looksLikeRefusal("No movie"));
check("bare 'no'", looksLikeRefusal("no"));
check("'nope'", looksLikeRefusal("nope"));
check("'nothing'", looksLikeRefusal("nothing"));
check("'idk'", looksLikeRefusal("idk"));
check("\"i don't know\"", looksLikeRefusal("I don't know"));
check("punctuation doesn't hide it: 'no!!'", looksLikeRefusal("no!!"));
check("'No friend' (the second one they typed)", looksLikeRefusal("No friend"));

// ── 6. and must NOT eat real answers ───────────────────────────────────────
// The load-bearing control. A refusal detector that fires on "No Country for
// Old Men" would be a worse bug than the one it fixes.
console.log("\n6. real answers are not refusals");
check("'No Country for Old Men - Anton' is somebody's actual favourite", !looksLikeRefusal("No Country for Old Men - Anton"));
check("'Nothing Compares 2 U' is a real title", !looksLikeRefusal("Nothing Compares 2 U"));
check("a normal pet", !looksLikeRefusal("llama"));
check("a normal phone number", !looksLikeRefusal("9876543210"));
check("'Naruto'", !looksLikeRefusal("Naruto"));

// ── 7. the reactions actually BRANCH on it ─────────────────────────────────
// The guard existing is not the fix; the copy calling it is. These assert the
// two surfaces where free text still reaches a reaction.
console.log("\n7. the copy uses the guard");
const petReaction = BEAT_BY_ID["pet"]!.reaction;
check(
  "a refused pet is NOT praised or repeated",
  !petReaction("no").includes("no?") && petReaction("no").includes("owl"),
  petReaction("no"),
);
check("a real custom pet IS taken seriously", petReaction("llama").includes("llama"), petReaction("llama"));
check("a known pet gets its own line", petReaction("dragon").includes("scorch"), petReaction("dragon"));
check("a blocked pet is never repeated", !petReaction("fuck you").includes("fuck"), petReaction("fuck you"));

const phoneReaction = BEAT_BY_ID["phone"]!.reaction;
check(
  "typing 'no' at phone takes the SKIP voice, not 'Got it!'",
  phoneReaction("no").includes("Skipped"),
  phoneReaction("no"),
);
check("a real number is accepted", phoneReaction("9876543210").includes("Got it"), phoneReaction("9876543210"));

// ── 8. Pikachu's delivery line (S91) ───────────────────────────────────────
console.log("\n8. the pet delivery");
check("a known pet arrives now, no promise made", loaderPikaSay("owl").includes("owl") && !loaderPikaSay("owl").includes("2-3"));
check("a custom pet gets the 2-3 dayssss gag", loaderPikaSay("llama").includes("2-3 dayssss"));
check("...and the owl covers, so nobody leaves petless", loaderPikaSay("llama").includes("owl"));
check("a refused pet is never repeated in the gag", !loaderPikaSay("no").includes("One no"), loaderPikaSay("no"));
check("a blocked pet is never repeated in the gag", !loaderPikaSay("fuck you").includes("fuck"), loaderPikaSay("fuck you"));

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
