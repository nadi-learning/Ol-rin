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
import { FAV_CHARACTERS, HERO_COMPANION, PETS, PRONOUNS } from "@b2c/kernel/contracts";
import { canEcho, looksLikeRefusal } from "../frontend/src/lib/safeEcho";
import type { BeatCtx } from "../frontend/src/components/onboarding.copy";
import {
  ABOUT_ROWS,
  BEATS,
  BEAT_BY_ID,
  EPILOGUE_PAGES,
  EPILOGUE_TOTAL_MS,
  HEROES,
  HEROES_BY_PRONOUN,
  PET_COPY,
  companionFor,
  heroCompositeImg,
  heroImg,
  heroesFor,
  loaderPetSpoken,
  loaderSay,
  petWink,
  throneClose,
} from "../frontend/src/components/onboarding.copy";

/**
 * A BeatCtx for the pure reaction calls. S96 gave every reaction a second
 * argument (the name + the answers so far) because `lore` now reads the picked
 * hero back. The guard claims below don't depend on it, so they pass a blank —
 * but it must be a REAL shape, not a cast, or the probe stops proving the
 * signature it is calling.
 */
const ctx = (answers: Partial<BeatCtx["answers"]> = {}): BeatCtx => ({
  name: "Ravi",
  answers: { grade: null, pronoun: null, favCharacter: null, pet: null, phone: null, ...answers },
});

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

// ── 4. the hero roster (S96) ───────────────────────────────────────────────
// Pikachu's echo beat is GONE (D-ONB-16), and with it the flow's loudest repeat
// of a free-text value. What replaced it is a CLOSED table, so the claims worth
// making changed shape: not "does it refuse to repeat", but "is the table
// total". A hero with no art renders a broken box; a hero with no reaction gets
// the generic fallback, which is the not-listening bug the chips exist to kill.
console.log("\n4. the hero roster is total");
const heroReaction = BEAT_BY_ID["fav_character"]!.reaction;
for (const id of FAV_CHARACTERS) {
  const h = HEROES[id];
  check(
    `${id}: has copy + art + reaction + story + bubble + page art`,
    Boolean(h?.label && h?.img && h?.reaction && h?.story && h?.bubble?.text && h?.bubble?.by && h?.pages?.length),
  );
}
check(
  "every hero's reaction is the AUTHORED one, never the fallback",
  FAV_CHARACTERS.every((id) => heroReaction(id, ctx()) === HEROES[id]!.reaction),
);
check(
  "and no two heroes share a reaction",
  new Set(FAV_CHARACTERS.map((id) => HEROES[id]!.reaction)).size === FAV_CHARACTERS.length,
);
// The fallback is unreachable from the UI but not from a stored row: pre-S96
// walks hold retired ids ('spider_man', 'gandalf'). It must not crash or print
// the raw id in 52px type.
check("a retired hero id falls back, does not crash", heroReaction("spider_man", ctx()).length > 0);
check("...and does not print the raw id", !heroReaction("spider_man", ctx()).includes("spider_man"));

// ── 4b. the companions (D-ONB-11/12) ───────────────────────────────────────
// The pairing IS the beat. A companion that isn't a real pet is a card that
// cannot render and a default that cannot be honoured.
console.log("\n4b. the companions");
for (const [hero, pet] of Object.entries(HERO_COMPANION)) {
  check(`${hero} → ${pet} is a real pet`, (PETS as readonly string[]).includes(pet!));
  check(`${hero} → ${pet} has a wink`, Boolean(PET_COPY[pet!]?.wink));
}
check("every companion hero is a real hero", Object.keys(HERO_COMPANION).every((h) => (FAV_CHARACTERS as readonly string[]).includes(h)));
// D-ONB-12: a default, never a lock. Wonder Woman and Mulan bring nobody by
// design — `undefined` here means "free pick", and that is not a gap.
check("wonder_woman brings nobody (free pick, by design)", companionFor("wonder_woman") === undefined);
check("mulan brings nobody (no standalone Khan art yet)", companionFor("mulan") === undefined);
check("the wink fires ONLY for the hero's own companion", petWink("direwolf", "jon_snow") !== undefined);
check("...and not for a pet they didn't bring", petWink("dragon", "jon_snow") === undefined);
check("...and not when no hero is picked", petWink("direwolf", null) === undefined);

// ── 4c. the pronoun lists are a DEFAULT, not a gate (D-ONB-13) ─────────────
// The claim that fails the moment someone "helpfully" narrows the roster: every
// hero must be reachable from every pronoun — primary + rest is always the FULL
// set. A list that refused would be the app telling a child who they are.
console.log("\n4c. pronoun lists are a default, not a gate");
for (const pronoun of [...Object.keys(HEROES_BY_PRONOUN), null]) {
  const { primary, rest } = heroesFor(pronoun);
  const all = [...primary, ...rest].map((c) => c.value).sort();
  check(
    `${pronoun ?? "(null)"}: primary + rest === the FULL roster`,
    JSON.stringify(all) === JSON.stringify([...FAV_CHARACTERS].sort()),
    JSON.stringify(all),
  );
  check(`${pronoun ?? "(null)"}: shows something first`, primary.length > 0);
  check(`${pronoun ?? "(null)"}: every card has art`, [...primary, ...rest].every((c) => Boolean(c.img)));
}
check("an unknown pronoun falls back to the mixed list, not empty", heroesFor("xyzzy").primary.length > 0);

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

// ── 7. the pet reaction (Slice L — the branches it guarded are GONE) ───────
// 🔑 These legs are INVERTED by Slice L, not deleted, and the inversion is the
// point. They used to assert that free text reaching this reaction was handled
// safely ("a real custom pet IS taken seriously"); they now assert that free
// text CANNOT reach it at all. Deleting them would have left the strongest
// claim in the slice unwritten — that closing the set is better than guarding
// it — and would have let the hatch grow back silently.
console.log("\n7. the pet reaction is closed-set");
const petReaction = BEAT_BY_ID["pet"]!.reaction;
check(
  "a custom pet is NOT taken seriously any more — it says nothing at all",
  petReaction("llama", ctx()) === "",
  JSON.stringify(petReaction("llama", ctx())),
);
check("a refused pet is never repeated", !petReaction("no", ctx()).includes("no"), petReaction("no", ctx()));
check("a blocked pet is never repeated", !petReaction("fuck you", ctx()).includes("fuck"), petReaction("fuck you", ctx()));
// The structural claim behind all three: there is no longer an INPUT that can
// produce an off-list pet. A reaction that merely handles free text safely is
// one refactor away from handling it unsafely; a beat with no text field is not.
const petInput = BEAT_BY_ID["pet"]!.input;
check("the pet beat is still chips (never a text ask)", petInput.kind === "chips");
check(
  "and it has NO escape hatch — the property is gone from the type, not just unset",
  !("other" in petInput),
  JSON.stringify(Object.keys(petInput)),
);

// Every known pet gets its OWN line — asserted as a PROPERTY, not by grepping
// for a word. The previous version looked for "scorch" in the dragon's reply and
// broke the moment the copy was rewritten, which is a probe failing for a
// non-reason. What actually matters: four pets, four distinct authored lines,
// none of them the generic fallback.
const petLines = PETS.map((p) => petReaction(p, ctx()));
check("every known pet has a line", petLines.every((l) => l.length > 0));
check("and no two pets share one", new Set(petLines).size === PETS.length, JSON.stringify(petLines));
check(
  "each pet's line is the one authored in PET_COPY",
  PETS.every((p) => petReaction(p, ctx()) === PET_COPY[p]!.reaction),
);
// S96 — the three new pets (kurama/jarvis/alfred) must be as complete as the
// four originals: a card renders `img`, the loader speaks `spoken`. (ONB-7 cut
// the pet payoff page, and `story`/`bubble` went with it.)
check(
  "every pet has label + spoken + art + reaction",
  PETS.every((p) => {
    const c = PET_COPY[p];
    return Boolean(c?.label && c?.spoken && c?.img && c?.reaction);
  }),
);

const phoneReaction = BEAT_BY_ID["phone"]!.reaction;
// INVERTED this session — there is no skip to take. The claim S91 was really
// making survives the change and is what is asserted now: a student who types
// "no" is NOT answered with "Got it!", because that is the not-listening bug
// whatever the form allows. Only the consolation changed, not the rule.
check(
  "typing 'no' at phone is still HEARD — not answered with 'Got it!'",
  !phoneReaction("no", ctx()).includes("Got it"),
  phoneReaction("no", ctx()),
);
check(
  "and it says the number is still needed, rather than pretending it was skipped",
  /still need|whenever you're ready/i.test(phoneReaction("no", ctx())),
  phoneReaction("no", ctx()),
);
check("a real number is accepted", phoneReaction("9876543210", ctx()).includes("Got it"), phoneReaction("9876543210", ctx()));

// The beat no longer offers an opt-out — asserted on the DATA, not on the
// rendered button, so a stray re-add in copy reddens here first.
check("no beat in the flow is optional any more", BEATS.every((b) => !b.optional));

// ── 7b. the reveal is GONE from onboarding (ONB-7, founder) ────────────────
// The Gandalf reveal leaves the flow entirely — Olórin introduces himself
// later in the product, at a moment the student is actually stuck. The copy
// file must not quietly grow the beat back.
console.log("\n7b. the reveal is out of the flow");
check("no `lore` beat in the copy file", BEAT_BY_ID["lore"] === undefined);
// D-ONB-14 — the promise is bound to PRESENCE. Onboarding may not offer
// conversation; that feature does not exist and a child who tries on day 2
// learns the story lied. Swept across every surviving surface: hero stories,
// hero bubbles.
const PROMISE_BOUND = /\b(talk to|chat|message|ask (him|her|them)|tell (him|her|them))\b/i;
check(
  "no hero story or bubble promises conversation (D-ONB-14)",
  FAV_CHARACTERS.every((id) => !PROMISE_BOUND.test(HEROES[id]!.story) && !PROMISE_BOUND.test(HEROES[id]!.bubble.text)),
);

// ── 7c. the hero payoff page (ONB-6, kept lean by ONB-7) ───────────────────
// The one payoff page that survived the cut: every hero pick earns ONE short
// comic page (quip + role line + bubble + art). The pet payoff page is GONE —
// the pick lands with its one-line reaction only.
console.log("\n7c. the hero payoff page");
const heroPagesFn = BEAT_BY_ID["fav_character"]!.pages!;
check(
  "every hero gets one complete page: quip title + role line + bubble + collage",
  FAV_CHARACTERS.every((id) => {
    const pg = heroPagesFn(id, ctx());
    const p = pg?.[0];
    return (
      pg?.length === 1 &&
      p!.title === HEROES[id]!.reaction &&
      p!.text === HEROES[id]!.story &&
      p!.bubble?.text === HEROES[id]!.bubble.text &&
      p!.scene?.kind === "collage" &&
      p!.cta.length > 0
    );
  }),
);
check("a retired hero id gets NO page (falls back to the quick reply)", heroPagesFn("spider_man", ctx()) === undefined);
check("the pet beat has NO pages (ONB-7 cut the payoff page)", BEAT_BY_ID["pet"]!.pages === undefined);

// ── 8. the delivery line (S91, Olórin's since S96) ─────────────────────────
// The handover moved from Pikachu to Olórin when Pikachu was cut (D-ONB-16).
// Same job, same guard: this line repeats a free-text value out loud.
console.log("\n8. the pet delivery");
check("a known pet arrives now, no promise made", loaderSay("owl").includes("owl") && !loaderSay("owl").includes("2-3"));

// S92 — the delivery used to lowercase the label, which printed "Getting your
// groot…". Every green gate passed; only looking at the screen caught it. A
// name keeps its capital, a species does not — loaderSay is the line that
// speaks the pet now (loaderTitle died with the spinner).
check("a species is spoken in lower case", loaderSay("owl").includes("one owl"), loaderSay("owl"));
check("a NAME keeps its capital", loaderSay("groot").includes("one Groot"), loaderSay("groot"));
// 🔑 Slice L — INVERTED, same reasoning as §7. The "2-3 dayssss" promise is
// retired: it was hand-fulfillable only at invite-only scale and signup opened
// in S110, so the flow was promising a pet nobody would make.
check("the 2-3 dayssss promise is GONE for everyone", !loaderSay("llama").includes("2-3 dayssss"), loaderSay("llama"));
check("a custom pet is never repeated back at all", !loaderSay("llama").includes("llama"), loaderSay("llama"));
check("a refused pet is never repeated", !loaderSay("no").includes("One no"), loaderSay("no"));
check("a blocked pet is never repeated", !loaderSay("fuck you").includes("fuck"), loaderSay("fuck you"));
// ⚠️ THE LEGACY POPULATION, asserted rather than assumed. A pre-Slice-L row
// holds free text and is read on every resume. The claim is not "it is handled"
// but the specific thing that must be true: they still leave with a companion.
check(
  "a pre-Slice-L free-text row still gets a real line, not an empty one",
  loaderSay("llama").length > 0 && loaderSay("llama").includes("owl"),
  loaderSay("llama"),
);
// Every one of the seven pets must have a speakable delivery — the epilogue's
// first page is the payoff screen, and "one undefined" is the failure mode.
check(
  "every pet has a real delivery line",
  PETS.every((p) => loaderSay(p).includes(PET_COPY[p]!.spoken)),
);

// ── 9. the epilogue (ONB-6; cut to ~10s by ONB-7) ──────────────────────────
// ONB-6 stretched the close to 45s; the first two outside viewers called the
// flow too long and the founder approved ~10s over two pages. The number is a
// decision of record now in the OTHER direction — a drift back up is a probe
// failure, not a tuning choice.
console.log("\n9. the epilogue");
check("the total is the approved ~10 seconds", EPILOGUE_TOTAL_MS === 10_000, String(EPILOGUE_TOTAL_MS));
check("two pages", EPILOGUE_PAGES.length === 2, String(EPILOGUE_PAGES.length));
check("page one is the handover (leads with the sticker)", EPILOGUE_PAGES[0]!.sticker === true);
const epCtx = ctx({ favCharacter: "naruto", pet: "kurama", grade: "10" });
const epSays = EPILOGUE_PAGES.map((p) => (typeof p.say === "function" ? p.say(epCtx) : p.say));
check("every page has words for a real student", epSays.every((s) => s.length > 0), JSON.stringify(epSays));
check("the handover speaks the picked pet", epSays[0]!.includes("Kurama"), epSays[0]);
// ONB-8 — the close is the CORONATION. The hero's name left the sentence on
// purpose: the hero is now IN the picture (throneClose below), and the words
// only crown the student. "names the picked hero" is deliberately replaced by
// the composite claims — this is the slice, not a defused gate (M55).
check("the close is the throne page", EPILOGUE_PAGES[1]!.throne === true);
check("the close names the class", /class 10/i.test(epSays[1]!), epSays[1]);
check("the close sends the student off by name", epSays[1]!.includes("Ravi"), epSays[1]);

// The coronation composite resolves every layer from the student's own picks.
const crown = throneClose(epCtx);
check("the coronation seats a throne and Olórin behind it", Boolean(crown.throne) && Boolean(crown.olorin));
check(
  "the picked hero stands at the throne's side (the CURATED flank scan)",
  crown.hero === (HEROES["naruto"]!.throneImg ?? HEROES["naruto"]!.img),
  crown.hero,
);
// The curation is per-hero and deliberate — every hero must resolve SOME flank
// art, and the curated six must differ from their main art (that was the bug:
// iron_man's main scan is a tiny figure on a codex page).
check(
  "every hero resolves a throne flank",
  FAV_CHARACTERS.every((id) => Boolean(HEROES[id]!.throneImg ?? HEROES[id]!.img)),
);
check(
  "iron_man's flank is not his codex page",
  Boolean(HEROES["iron_man"]!.throneImg) && HEROES["iron_man"]!.throneImg !== HEROES["iron_man"]!.img,
);
check("the picked companion stands at the other side", crown.pet === PET_COPY["kurama"]!.img, crown.pet);
check(
  "the composite narrates itself (it is the payoff, not atmosphere)",
  crown.alt.includes("Naruto") && crown.alt.includes("Kurama") && /ol[óo]rin/i.test(crown.alt),
  crown.alt,
);
// A heroless student with a custom pet still gets a full frame: throne +
// stand-in owl + Olórin. The hero layer alone may be absent.
const bare = throneClose(ctx({ pet: "llama" }));
check("a heroless student still gets the throne + companion", !bare.hero && Boolean(bare.pet) && Boolean(bare.throne));
check("the heroless alt does not name a missing hero", bare.alt.includes("your hero"), bare.alt);
// The silhouette follows the pronoun ANSWER, never a guess from the name.
check("she → the long-haired silhouette", throneClose(ctx({ pronoun: "she" })).longHair === true);
check("he → cropped", throneClose(ctx({ pronoun: "he" })).longHair === false);
check("'just my name' → cropped (no guess)", throneClose(ctx({ pronoun: "name" })).longHair === false);

// ── ONB-9: Olórin SPEAKS on the coronation ─────────────────────────────────
// Founder: "a comment from Olórin should be also there." The narration line
// stays unattributed and stays put; his is a separate, attributed bubble.
const olorinLine = (() => {
  const raw = EPILOGUE_PAGES[1]!.olorinSay;
  return typeof raw === "function" ? raw(epCtx) : (raw ?? "");
})();
check("Olórin comments on the coronation", olorinLine.length > 0, olorinLine);
check(
  "his comment is first person — the platform speaks, it does not narrate",
  /\bI\b|\bI'll\b|\bmy\b/.test(olorinLine),
  olorinLine,
);
check(
  "his comment keeps his ROLE (behind you / with you), the one thing the cut kept",
  /behind you|with you|beside you/i.test(olorinLine),
  olorinLine,
);
check(
  "his comment does not promise conversation (D-ONB-14)",
  !PROMISE_BOUND.test(olorinLine) && !olorinLine.includes("?"),
  olorinLine,
);
check(
  "the narration line survives ALONGSIDE his comment (it was not replaced)",
  epSays[1]!.includes("The seat was always yours") && olorinLine !== epSays[1],
  epSays[1],
);
// The picture must still carry the hero — his line deliberately does NOT name
// them (that trade was made in ONB-8 and ONB-9 must not quietly undo it).
check(
  "his comment does not re-import the hero's name into the words",
  !olorinLine.includes("Naruto"),
  olorinLine,
);

// ── ONB-9: the founder's PROPORTIONS ───────────────────────────────────────
// "size of hero should 1.25x of throne and pet should be 0.5x". These numbers
// live only in CSS, and the coronation has now been sent back twice over
// proportion — so the ratio is held here rather than trusted to a comment.
// The claim is on the calc() EXPRESSION, not a rendered pixel: the point is
// that the flanks stay DERIVED from --throne-h and can't be pinned to a
// literal height that silently stops tracking it.
const coronationCss = await Bun.file(
  new URL("../frontend/src/components/onboarding.css", import.meta.url),
).text();
const cssRule = (selector: string) =>
  coronationCss.slice(coronationCss.indexOf(`.${selector} {`)).split("}")[0] ?? "";
check(
  "the throne declares the ratio base --throne-h",
  /--throne-h:\s*\d/.test(cssRule("onb-throne")),
);
check(
  "the throne's own height IS the base (not a second, drifting number)",
  /height:\s*var\(--throne-h\)/.test(cssRule("onb-throne-seat")),
  cssRule("onb-throne-seat"),
);
check(
  "hero = 1.25x the throne (the founder's number, as math)",
  /height:\s*calc\(var\(--throne-h\)\s*\*\s*1\.25\)/.test(cssRule("onb-throne-hero")),
  cssRule("onb-throne-hero"),
);
check(
  "pet = 0.5x the throne (the founder's number, as math)",
  /height:\s*calc\(var\(--throne-h\)\s*\*\s*0\.5\)/.test(cssRule("onb-throne-pet")),
  cssRule("onb-throne-pet"),
);
// "gandalf should be right behind the throne" — centred, not the old left-2%.
check(
  "Olórin stands centred behind the throne, not off to its left",
  /margin-inline:\s*auto/.test(cssRule("onb-throne-olorin")) &&
    !/left:\s*-/.test(cssRule("onb-throne-olorin")),
  cssRule("onb-throne-olorin"),
);
// Centred + multiply + unmasked = his robes print THROUGH the sword wall.
// The vertical mask that dissolves him below the throne's crest is the fix,
// so it is a claim, not a detail.
check(
  "…and is masked away below the throne's crest (multiply would show him through it)",
  /linear-gradient\(to bottom,\s*black[^)]*transparent/.test(cssRule("onb-throne-olorin")),
  cssRule("onb-throne-olorin"),
);
check(
  "every page still reads for a student with NO hero and a custom pet",
  EPILOGUE_PAGES.map((p) => (typeof p.say === "function" ? p.say(ctx({ pet: "llama" })) : p.say)).every(
    (s) => s.length > 0,
  ),
);
check(
  "no epilogue page promises conversation (D-ONB-14)",
  epSays.every((s) => !PROMISE_BOUND.test(s)),
);
check("every epilogue page is drawn on scenery, not an empty grid", EPILOGUE_PAGES.every((p) => Boolean(p.scene)));

// ── 10. the ONB-7 lean cut holds ───────────────────────────────────────────
// The first two outside viewers, independently: "onboarding is big and a lot
// of english to read". The founder's rule for the cut: keep the student and
// THE ROLE OF EACH CHARACTER, cut everything else. These claims are the
// feedback, encoded — a copy pass that quietly grows the flow back fails here.
console.log("\n10. the ONB-7 lean cut holds");
const words = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;
const beatText = (id: string, c: BeatCtx) => {
  const b = BEAT_BY_ID[id]!;
  const p = typeof b.prompt === "function" ? b.prompt(c) : b.prompt;
  const s = typeof b.sub === "function" ? b.sub(c) : (b.sub ?? "");
  return `${p} ${s}`;
};
// THE WORD BUDGET — the whole point of the slice, as one number. Worst-case
// mandatory reading for one student: every beat's prompt+sub, the longest
// hero payoff page, the longest pet reaction, both epilogue pages.
const budgetCtx = ctx({ favCharacter: "jon_snow", pet: "direwolf", grade: "10" });
const beatWords = ["greet", "about_you", "fav_character", "pet", "phone"]
  .map((id) => words(beatText(id, budgetCtx)))
  .reduce((a, b) => a + b, 0);
const worstHeroPage = Math.max(
  ...FAV_CHARACTERS.map((id) => {
    const p = BEAT_BY_ID["fav_character"]!.pages!(id, ctx())![0]!;
    return words(`${p.title ?? ""} ${p.text} ${p.bubble?.text ?? ""}`);
  }),
);
const worstPetLine = Math.max(...PETS.map((p) => words(PET_COPY[p]!.reaction)));
// ONB-9 — Olórin's coronation comment is MANDATORY reading (it is printed, not
// hovered), so it is charged to the budget like every other line.
const epilogueWords = EPILOGUE_PAGES.map((p) => {
  const say = words(typeof p.say === "function" ? p.say(budgetCtx) : p.say);
  const olorin = p.olorinSay
    ? words(typeof p.olorinSay === "function" ? p.olorinSay(budgetCtx) : p.olorinSay)
    : 0;
  return say + olorin;
}).reduce((a, b) => a + b, 0);
const totalWords = beatWords + worstHeroPage + worstPetLine + epilogueWords;
check(
  `the WHOLE flow's mandatory reading fits the budget (${totalWords} words ≤ 260)`,
  totalWords <= 260,
  `beats=${beatWords} heroPage=${worstHeroPage} petLine=${worstPetLine} epilogue=${epilogueWords}`,
);
// Per-piece caps, so one screen can't hoard the budget.
check(
  "no hero's role line runs past 30 words",
  FAV_CHARACTERS.every((id) => words(HEROES[id]!.story) <= 30),
  JSON.stringify(FAV_CHARACTERS.map((id) => [id, words(HEROES[id]!.story)])),
);
check(
  "no beat's prompt+sub runs past 40 words",
  ["greet", "about_you", "fav_character", "pet", "phone"].every(
    (id) => words(beatText(id, budgetCtx)) <= 40,
  ),
  JSON.stringify(
    ["greet", "about_you", "fav_character", "pet", "phone"].map((id) => [
      id,
      words(beatText(id, budgetCtx)),
    ]),
  ),
);
// THE ROLE OF EACH CHARACTER — the one thing the founder kept. Olórin says
// what he does, the hero ask says what a hero does, the pet ask says what a
// pet does, the phone ask says why it wants the number.
const greet = BEAT_BY_ID["greet"]!;
check("greet states Olórin's role: your guide", /guide/i.test(beatText("greet", ctx())), beatText("greet", ctx()));
check(
  "greet's CTA is not the old 'Start my story'",
  greet.input.kind === "none" && greet.input.cta !== "Start my story",
  greet.input.kind === "none" ? greet.input.cta : "(not a cta beat)",
);
check(
  "the hero ask states the hero's role: beside you as you study",
  /beside you every day you study/i.test(beatText("fav_character", ctx())),
  beatText("fav_character", ctx()),
);
check(
  "the pet ask states the pet's role: grows as you work",
  /grows as you work/i.test(beatText("pet", ctx())) &&
    /grows as you work/i.test(beatText("pet", ctx({ favCharacter: "jon_snow" }))),
);
check(
  "the phone ask gives the reason: a tutor can reach you",
  /reach you/i.test(beatText("phone", ctx())),
  beatText("phone", ctx()),
);
// Every hero's role line must still speak TO the student (founder, S103) —
// lean is not license to go third-person.
check(
  "every hero role line speaks TO the student",
  FAV_CHARACTERS.every((id) => /\byou\b|\byour\b/i.test(HEROES[id]!.story)),
);
// The art survived the cut: the hero payoff still hangs several sketches.
check(
  "every hero payoff page hangs at least 3 sketches",
  FAV_CHARACTERS.every((id) => {
    const sc = BEAT_BY_ID["fav_character"]!.pages!(id, ctx())![0]!.scene;
    return sc?.kind === "collage" && Boolean(sc.main) && sc.items.length >= 3;
  }),
);

// ── Slice G (S114) — THE COMPANION IS EVERYWHERE, AND PIKACHU IS RETIRED. ──
//
// The slice's whole claim is about surfaces OUTSIDE onboarding, so nothing that
// existed in this probe could go red for it — it ran 144/144 both before and
// after the swap. Asserted at SOURCE level for the same reason the coronation
// ratios above are: the fact is "which image this component reaches for", and
// that lives only in the source.
//
// M43 is the reason these are CLIENT claims. There is no server rule to probe
// here — the pet never leaves the browser on these surfaces — so a server-side
// leg would be green while the student looked at a Pikachu.
const src = async (p: string) =>
  await Bun.file(new URL(`../frontend/src/${p}`, import.meta.url)).text();

/**
 * 🔑 M77, and the reason it recurred — SOURCE WITH THE PROSE REMOVED.
 *
 * These files argue with themselves on purpose: their comments explain what was
 * deleted and why, so a grep for a deleted thing finds the explanation and
 * reports it as present. M77 was the worst form of that (a comment kept a probe
 * green after the property it guarded was removed) and its fix was applied to
 * ONE leg — so the very next structural grep inherited the bug. It did: a
 * comment added between `label="Crew"` and its `onClick` pushed them apart and
 * reddened a leg about code that was correct.
 *
 * Hence one helper rather than another per-site `.replace()`. Handles block
 * comments (which covers JSX `{/* … *​/}`) and line comments, with `://` spared
 * so a URL in a string literal is not mistaken for one.
 */
const code = (s: string) =>
  s
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1")
    // Collapse the blank, still-indented lines the two passes above leave
    // behind. Without this a stripped 8-line comment is ~110 characters of
    // whitespace that any proximity grep still has to span — the comment goes
    // on affecting the match after being removed, which is the whole bug.
    // Line STARTS are preserved, so `^`-anchored CSS claims are unaffected.
    .replace(/\n(?:[ \t]*\n)+/g, "\n");

const [voicePanel, practicePage, appShell, appTsx, revisionPage, practiceCss, voiceCss] =
  await Promise.all([
    src("components/VoicePanel.tsx"),
    src("components/PracticePage.tsx"),
    src("components/AppShell.tsx"),
    src("App.tsx"),
    src("components/RevisionPage.tsx"),
    src("components/practice.css"),
    src("components/voice.css"),
  ]);

// 1. The retirement. A grep for "pikachu" over every FE source is the claim
// that would catch the easter egg (or the placeholder avatar) coming back —
// including in a file this probe does not name individually.
const feFiles = new Bun.Glob("**/*.{ts,tsx,css}");
const feRoot = new URL("../frontend/src/", import.meta.url).pathname;
const offenders: string[] = [];
for await (const f of feFiles.scan(feRoot)) {
  const text = await Bun.file(`${feRoot}${f}`).text();
  // safeEcho.ts explains the guard's ORIGIN in prose ("Pikachu shouts their
  // favourite character") — history, not a live reference. Only code that
  // reaches for the art or the component counts as a reintroduction.
  if (/pikachu-\w+\.png|PikaSplash|from "\.\/PikaSplash"/i.test(text)) offenders.push(f);
}
check(
  `no FE source imports Pikachu art or the splash (found: ${offenders.join(", ") || "none"})`,
  offenders.length === 0,
);
check(
  "the three pikachu PNGs are deleted from the asset tree",
  !(await Bun.file(new URL("../frontend/src/assets/pikachu-wave.png", import.meta.url)).exists()),
);
check("PikaSplash.tsx is deleted", !(await Bun.file(new URL("../frontend/src/components/PikaSplash.tsx", import.meta.url)).exists()));
check(
  "the nav logo no longer summons anything (no onClick, no pika state)",
  !/setPikaOpen|pikaOpen/.test(appShell) && !/aria-label="Pikachu"/.test(appShell),
);

// 2. The swap. Each surface must resolve the companion through the SHARED
// helper — a hard-coded pet import would render one child's dragon to everyone.
check(
  "VoicePanel's avatar resolves through loaderPetImg(pet)",
  /loaderPetImg\(pet\)/.test(voicePanel) && /import\s*\{[^}]*loaderPetImg/.test(voicePanel),
);
check(
  "the practice SoonBanner resolves through loaderPetImg(pet)",
  /loaderPetImg\(pet\)/.test(practicePage),
);
check(
  "no surface imports a specific pet PNG directly (that would pin one pet for everyone)",
  ![voicePanel, practicePage, appShell].some((f) => /from "\.\.\/assets\/pets\//.test(f)),
);

// 3. The chain. A prop that App never passes is the failure mode this whole
// lift invites, and it type-checks fine at every level in between.
check("App lifts the pet from the onboarding answers", /const pet = onb\?\.answers\.pet \?\? null/.test(appTsx));
check("App passes pet to PracticePage", /<PracticePage pet=\{pet\}/.test(appTsx));
check("App passes pet to RevisionPage", /pet=\{pet\}/.test(appTsx));
check("RevisionPage forwards pet to VoicePanel", /pet=\{pet\}/.test(revisionPage));

// 4. 🔴 THE ANSWERS SURVIVE THE HANDOVER. `onDone` used to discard them
// (`setOnb(null)`), which was harmless until the companion was lifted from
// `onb` — after which a student who had JUST chosen a dragon would be handed
// the owl stand-in for the rest of the session. Nothing else in the suite
// looks at this, and the bug is invisible on a reload, so it would have been
// found by a founder, not by us.
check(
  "onboarding hands its ANSWERS back on the way out (not a bare onDone())",
  /onDone: \(answers: BeatCtx\["answers"\]\) => void/.test(
    await src("components/OnboardingPage.tsx"),
  ),
);
check(
  "App keeps those answers instead of nulling the onboarding state",
  /onDone=\{\(answers\) =>/.test(appTsx) && /answers,\s*\}\)/.test(appTsx),
);

// 5. 🔑 THE SIZING AXIS (M63). Pikachu was ONE aspect ratio, so `width: Npx`
// pinned his height too. The companions span 0.46 (owl) to 1.40 (direwolf):
// under a fixed width the owl renders ~2.5x the direwolf's height. Both slots
// must therefore drive HEIGHT and cap width. This asserts the RULE, not a
// pixel — a probe on the number would just re-state the CSS.
const rule = (css: string, selector: string) =>
  css.slice(css.indexOf(`.${selector} {`)).split("}")[0] ?? "";
for (const [name, css, sel] of [
  ["practice SoonBanner", practiceCss, "prac-soon-pet"],
  ["voice avatar", voiceCss, "voice-avatar-img"],
] as const) {
  const r = rule(css, sel);
  check(`${name}: sized on HEIGHT, not width (M63)`, /height:\s*\d+px/.test(r), r);
  check(`${name}: width follows the art`, /width:\s*auto/.test(r), r);
  check(`${name}: a wide companion is capped, not allowed to overhang`, /max-width:\s*\d/.test(r), r);
  check(`${name}: object-fit contain, so no aspect is cropped`, /object-fit:\s*contain/.test(r), r);
}
// The carried-banner gag is gone WITH its offsets — leaving them would tuck the
// banner under a paw that no companion has.
check(
  "the SoonBanner no longer pulls under a raised paw",
  !/margin-left:\s*-34px/.test(rule(practiceCss, "prac-soon-banner")),
);

// 6. The copy stopped naming a character the student never chose, and names
// theirs correctly: a SPECIES takes an article, a NAME does not.
check("the voice hint no longer says 'Tap Pikachu'", !/Tap Pikachu/.test(voicePanel));
check("the voice hint names the student's own companion", /loaderPetSpoken\(pet\)/.test(voicePanel));
check("a species reads with an article ('the owl')", loaderPetSpoken("owl") === "the owl");
check("a NAME reads bare ('Groot', not 'the Groot')", loaderPetSpoken("groot") === "Groot");
check("JARVIS keeps its own casing", loaderPetSpoken("jarvis") === "JARVIS");
// The fallback is what makes every `pet` prop above safe to render unguarded.
check("an unknown/custom pet falls back to the owl stand-in", loaderPetSpoken("a robot dog") === "the owl");
check("a skipped pet falls back too", loaderPetSpoken(null) === "the owl");

// ── Slice H (S115) — THE FIRST-RUN DASHBOARD ───────────────────────────────
//
// Same reasoning as Slice G's block: these are CLIENT facts with no server rule
// behind them (M43), so a service-level leg would be green while a student
// looked at the wrong thing. Asserted at source, alongside a browser walk
// (`scratchpad/tour-walk.mjs`) that measures what source cannot — that the tour
// settles, survives a navigation, and goes away on real activity.
const [dashPage, dashCss] = await Promise.all([
  src("components/DashboardPage.tsx"),
  src("components/dashboard.css"),
]);

// 1. The retirement of DASH-FR's card. Olórin's scan leaves the dashboard, and
// his signature goes with it — the pet is the speaker now, and a signature under
// a companion's sentence names the wrong character.
check("Slice H: the Olórin welcome card is gone from the dashboard", !/dash-welcome/.test(dashPage));
check("Slice H: its CSS went with it (no orphaned .dash-welcome rules)", !/\.dash-welcome/.test(dashCss));
check("Slice H: Olórin's scan is no longer imported here", !/sceneOlorin/.test(dashPage));
check("Slice H: the '— Olórin' signature is gone", !/— Olórin/.test(dashPage));
check(
  "Slice H: and the art file is not referenced by any other dashboard rule",
  !/olorin\.jpg/.test(dashPage),
);

// 2. The tour renders the STUDENT'S companion through the shared helper. A
// direct PNG import here would pin one child's dragon onto every child — the
// exact failure Slice G's block guards on the other two surfaces.
check("Slice H: the tour resolves its sticker via the shared helper", /loaderPetImg\(/.test(dashPage));
check(
  "Slice H: it imports no specific pet art (that would pin one pet on everyone)",
  !/assets\/pets?\//.test(dashPage),
);
check("Slice H: the greeting uses FIRST name, not the full name", /firstName\(studentName\)/.test(dashPage));

// 3. D-H1 — animate once per SESSION. The module-scope flag is the whole
// mechanism; a useState/useRef instead would reset on every remount and re-type
// the sentence on every return, which is the behaviour the founder ruled out.
check("Slice H (D-H1): a module-scope flag holds the animate-once rule", /^let tourHasAnimated = false;/m.test(dashPage));
check(
  "Slice H (D-H1): the flag GATES the typewriter, not just the tiles",
  /!tourHasAnimated && !reducedMotion/.test(dashPage),
);
check("Slice H (D-H1): reduced motion takes the same instant path", /reducedMotion/.test(dashPage));

// 4. D-H2 — the lesson CTA survived. Losing it would leave a brand-new student
// with five orienting tiles and no stated place to begin.
check("Slice H (D-H2): the Start-lesson CTA is still rendered", /dash-tour-cta/.test(dashPage));

// 5. The tiles. Slice J REPLACES three claims here rather than deleting them
// (M55/M65 — a claim the next slice deliberately undoes must be restated as the
// new behaviour, never quietly dropped, or the gate silently stops gating).
//   was: "Journal is the one with no view (soon)"
//   was: "the soon tile renders as a div, not a button"
// Journal now HAS a page, so the inverse of each is the claim worth holding.
check("Slice H: five section tiles are declared", (dashPage.match(/\{ view: /g) ?? []).length === 5);
check(
  "Slice J: Journal's tile navigates (it is no longer the viewless one)",
  /\{ view: "journal", label: "Journal"/.test(dashPage) && !/view: null/.test(dashPage),
);
check(
  "Slice J: EVERY tile is a button now — the viewless branch is gone",
  !/dash-tour-tile--soon/.test(dashPage) && !/dash-tour-soon/.test(dashPage),
);
check(
  "Slice J: the tile type forbids a viewless tile (compiler, not comment)",
  /view: AppView;/.test(dashPage) && !/view: AppView \| null;/.test(dashPage),
);
check(
  "Slice H: tile labels match the rail's spelling ('Pace plan')",
  /label: "Pace plan"/.test(dashPage) && !/label: "Pace Plan"/.test(dashPage),
);

// 6. The loading gate. Without it the ternary's ELSE branch rendered while the
// reads were in flight, so a first-run student watched three "-" stat cards
// appear and then get swapped for the tour — the very flash DASH-FR's comment
// claims to prevent. Found by the walk, not by reading the code.
check(
  "Slice H: neither branch renders until BOTH reads are in (no 0/0/0 flash)",
  /\{!summary \|\| !nav \? null : firstRun \?/.test(dashPage),
);

// 7. The sizing axis (M63) — same rule as every other companion slot.
{
  const r = rule(dashCss, "dash-tour-pet");
  check("Slice H sticker: sized on HEIGHT, not width (M63)", /height:\s*\d+px/.test(r), r);
  check("Slice H sticker: width follows the art", /width:\s*auto/.test(r), r);
  check("Slice H sticker: a wide companion is capped", /max-width:\s*\d/.test(r), r);
  check("Slice H sticker: object-fit contain, so no aspect is cropped", /object-fit:\s*contain/.test(r), r);
}

// 8. M60 — the stagger must be a transition-delay, never an @keyframes with
// `animation-fill-mode: both`, which leaves the transform applied forever and
// silently switches off blend modes on the whole subtree.
check(
  "Slice H: the tile stagger is a transition-delay, not a filled animation (M60)",
  /transition-delay:\s*calc\(var\(--i\)/.test(dashCss) && !/dash-tour-tile[\s\S]{0,400}animation-fill-mode/.test(dashCss),
);
check(
  "Slice H: the settled tile state is `transform: none` (nothing lingers)",
  /\.dash-tour-tiles\.is-in \.dash-tour-tile-wrap \{[^}]*transform:\s*none/.test(dashCss),
);

// ── Slice I (S116) — THE CHAPTER FILTER ────────────────────────────────────
//
// The server side of this slice is proven by probe_revision_nav, which asserts
// the per-sub_topic flag AGAINST REAL getSlide calls. What no service test can
// see is whether the three CLIENT surfaces actually consume it — and M43 is in
// the log for precisely that shape: the server rule was verified and green, and
// the client broke the same rule where no gate could see it. Slice I IS a
// client-side filter, so its claims live here.
//
// The rule these legs encode: a surface that picks or lists a sub_topic must
// test that SUB_TOPIC's `hasContent`. Chapter-level `hasContent` is derived and
// says only that SOMETHING under it opens — conflating the two is the exact bug
// this slice removed, and it is the one a future edit will reintroduce.
const [dashI, landI, revI, revSvc] = await Promise.all([
  src("components/DashboardPage.tsx"),
  src("components/RevisionLanding.tsx"),
  src("components/RevisionPage.tsx"),
  Bun.file(new URL("../src/services/revision.ts", import.meta.url)).text(),
]);

// 1. ONE definition of "will this render", shared by the render path and the
// nav that predicts it. Two copies is the bug one level down.
check(
  "Slice I: `publishedSlideId` is the single exported publication test",
  /export function publishedSlideId\(/.test(revSvc),
);
check(
  "Slice I: the render path (resolveSlideContext) CALLS it rather than re-testing",
  /const slideId = publishedSlideId\(/.test(revSvc),
);
check(
  "Slice I: getChapterNav calls it too — the nav predicts with the same rule",
  /hasContent:\s*\n?\s*publishedSlideId\(/.test(revSvc),
);
check(
  "Slice I: chapter hasContent is DERIVED from its sub_topics, not queried apart",
  /ch\.hasContent = ch\.topics\.some\(\(t\) => t\.subTopics\.some\(\(s\) => s\.hasContent\)\)/.test(revSvc),
);

// 2. The dashboard: list filtered, and the CTA aimed at a renderable sub_topic
// searched ACROSS sections (a chapter whose first section is unpublished is
// still openable — assuming topics[0] was half the original bug).
check("Slice I: the dashboard lesson list is filtered to openable chapters", /nav\?\.filter\(\(ch\) => ch\.hasContent\)/.test(dashI));
check(
  "Slice I: its sub_topic pick tests each sub_topic and spans sections",
  /flatMap\(\(t\) => t\.subTopics\)\.filter\(\(s\) => s\.hasContent\)/.test(dashI),
);
check(
  "Slice I (D-I2): NO fallback to an unopenable chapter when nothing is published",
  !/\?\?\s*nav\?\.\[0\]/.test(dashI),
);

// 3. The Revision landing: the grid gate was `slideCount > 0` counting SPINE
// rows, which let every chapter through. It must count openable ones.
check(
  "Slice I: the landing counts openable sub_topics, not spine rows",
  /t\.subTopics\.some\(\(s\) => s\.hasContent\)/.test(landI),
);
check("Slice I: the landing's sub_topic picks go through one openable helper", /firstOpenable/.test(landI));

// 4. The viewer: `flat` drives prev/next AND the "n / total" counter AND the
// index sidebar. Built from the raw nav it fetched a doomed flat[0] on every
// deep-link, walked prev/next through 404s, and counted 159 slides where 31
// exist. One filtered derivation feeds all three.
check(
  "Slice I: the viewer derives a FILTERED nav that every consumer reads",
  /const nav = useMemo<Nav \| null>\(\(\) => \{[\s\S]{0,400}s\.hasContent/.test(revI),
);
check(
  "Slice I: the raw fetched tree is not consumed directly",
  /setRawNav\(tree\)/.test(revI) && !/\bsetNav\(/.test(revI),
);
// 5. The staleness guard. A losing request that lands late must not paint an
// error over a slide that rendered — the walk caught exactly that.
check(
  "Slice I: the slide fetch has a staleness guard (late rejects cannot set error)",
  /let live = true;/.test(revI) && /if \(!live\) return;/.test(revI),
);

// ─────────────────────────────────────────────────────────────────────────
// §Slice J — the Journal page.
//
// A page with no backend can only be probed as CLIENT claims (M43's rule, the
// same reason the companion legs above are client-side): there is no server
// rule to assert, so a server leg would be green while the page rendered wrong.
// The look itself is the walk's job, not this file's — these hold the RULES a
// later edit could break without anyone noticing.
// ⚠️ `onboarding.copy.ts` is deliberately NOT read as text here, even though the
// claim below is about its contents. Reading it with Bun.file() while it is ALSO
// a static import of this probe makes Bun 1.3.8 intermittently try to transpile
// the PNG that file imports, and the probe dies before its first check with
// `Unexpected <PNG>` — no summary, no failing leg, exit 1. It is a coin flip per
// run, which cost this session a long bisect in which every single-run result
// was noise (see the miss log). The claim is asserted as BEHAVIOUR instead,
// which is a better probe anyway — and it is the shape S113/S116's open
// "in-suite only, dies silently" item should be re-examined under.
const [journalPage, journalCss, dashCssJ] = await Promise.all([
  src("components/JournalPage.tsx"),
  src("components/journal.css"),
  src("components/dashboard.css"),
]);

// 1. D-J1 — the rail navigates, and the "soon" lives ONCE, on the page. The
// failure this catches: a rail item still flagged `soon` beside a page that
// opens, i.e. two answers to one question.
check(
  "Slice J (D-J1): the Journal rail item navigates",
  /label="Journal"[\s\S]{0,200}onClick=\{\(\) => onNavigate\("journal"\)\}/.test(appShell),
);
check(
  "Slice J (D-J1): the Journal rail item is no longer inert",
  !/<RailItem label="Journal" icon=\{<JournalIcon \/>\} badge soon \/>/.test(appShell),
);
check(
  "Slice J (D-J1): the badge survived (the draw was never the soon flag)",
  /label="Journal"[\s\S]{0,120}badge/.test(appShell),
);
check("Slice J: 'journal' is a real AppView member", /\| "journal"/.test(appShell));
check(
  "Slice J: App routes the view to the page",
  /view === "journal" \? \(\s*<JournalPage/.test(appTsx),
);

// 2. 🔑 D-J3 — THE FALLBACK IS THE PET, NEVER OLÓRIN. S109's pivot took Olórin
// off every post-onboarding surface; reaching for him to cover a missing hero
// would reopen a closed decision. This is the leg that would catch it, and it
// matters because the fallback fires for a REAL population: a student who
// skipped the hero beat, and every pre-S96 row holding a retired id (which
// `heroLabel` echoes back raw, so the name renders and only the art is missing).
check(
  "Slice J (D-J3): no Olórin art reaches the Journal page",
  !/olorin/i.test(journalPage),
);
check(
  "Slice J (D-J3): a missing hero falls back to the PET, which always resolves",
  /if \(art\) return/.test(journalPage) && /loaderPetImg\(pet\)/.test(journalPage),
);
check(
  "Slice J: the fallback takes art AND name from the same character",
  /heroLabel\(hero\)/.test(journalPage) && /loaderPetSpoken\(pet\)/.test(journalPage),
);

// 3. D-J2 — the mock is a MOCK. Two independent failures live here: a screen
// reader narrating four fabricated messages as the student's own, and a
// keyboard tab landing inside a preview that does nothing.
check(
  "Slice J (D-J2): the blurred preview is off the accessibility tree",
  /className="jrnl-preview" aria-hidden="true"/.test(journalPage),
);
check(
  "Slice J (D-J2): nothing inside the mock is focusable (no buttons/inputs/links)",
  !/<(button|input|a|textarea)\b/.test(
    journalPage.slice(journalPage.indexOf("jrnl-preview"), journalPage.indexOf("jrnl-soon")),
  ),
);
check(
  "Slice J (D-J2): the mock is sized bars, not fake sentences under a blur",
  /style=\{\{ width: "\d+%" \}\}/.test(journalPage),
);
check(
  "Slice J: the waveform is a fixed pattern, not Math.random()",
  !/Math\.random/.test(journalPage),
);
{
  const r = rule(journalCss, "jrnl-preview");
  // A light blur reads as a font that failed to load. The RULE is "unmistakably
  // deliberate", and 5px is the floor where that holds.
  const px = Number(/filter:\s*blur\((\d+)px\)/.exec(r)?.[1] ?? 0);
  check(`Slice J (D-J2): the blur is heavy enough to read as deliberate (${px}px ≥ 5)`, px >= 5, r);
  check("Slice J (D-J2): the mock cannot be moused into", /pointer-events:\s*none/.test(r), r);
}
{
  // The blur bleeds past its own box; without a clipping parent it smears onto
  // the canvas and looks like a broken render rather than a preview.
  const r = rule(journalCss, "jrnl-stage");
  check("Slice J: the stage clips the blur's bleed", /overflow:\s*hidden/.test(r), r);
  check("Slice J: preview and panel share one grid cell, so neither can spill", /display:\s*grid/.test(r), r);
}

// 4. The soon panel — ONCE per page, never per row. The rule this whole family
// inherits from SoonBanner (`practice.css:90`). A per-row "soon" is what made
// AVAIL v1 a wall of 154 grey chips.
check(
  "Slice J: exactly ONE soon panel on the page",
  (journalPage.match(/className="jrnl-soon"/g) ?? []).length === 1,
);

// 5. 🔑 THE SIZING AXIS (M63) — this slot is the WORST case in the app for it:
// eleven heroes plus seven pets as fallback, no shared aspect ratio. Same rule
// as every other character slot, asserted the same way.
{
  const r = rule(journalCss, "jrnl-front");
  check("Slice J front: sized on HEIGHT, not width (M63)", /height:\s*\d+px/.test(r), r);
  check("Slice J front: width follows the art", /width:\s*auto/.test(r), r);
  check("Slice J front: a wide character is capped", /max-width:\s*\d/.test(r), r);
  check("Slice J front: object-fit contain, so no aspect is cropped", /object-fit:\s*contain/.test(r), r);
  // M60 — a transform left applied on this subtree silently switches the blend
  // mode OFF, which is how the onboarding scans grew opaque plates in S101.
  check("Slice J front: composites with multiply (opaque JPEG on graph paper)", /mix-blend-mode:\s*multiply/.test(r), r);
  // 🔑 FOUND BY THE WALK, NOT BY THIS FILE. `multiply` alone kills the plate
  // only for scans with a near-white ground; S102 measured the grounds at
  // 156-255 and most heroes are full-bleed toned drawings, which multiply lands
  // on the paper as a hard rectangle. Harry looked perfect and iron_man looked
  // like a pasted photo under IDENTICAL CSS — which is why the probe has to
  // hold the mask, not just the blend mode.
  check("Slice J front: feathers EVERY edge, not just one axis (S102)", /mask-image:/.test(r), r);
  check(
    "Slice J front: the feather is two axes composited, not a single gradient",
    /mask-composite:\s*intersect/.test(r) && (r.match(/linear-gradient/g) ?? []).length >= 2,
    r,
  );
}
// 🔑 The OTHER half of the same finding: which ART reaches a composite at all.
// iron_man's `img` is a full-bleed codex page — fine at page scale, a dark
// rectangle at 150px beside a card. `throneImg` is the curated per-hero bust.
// One definition, two composites (the coronation and the Journal front).
check(
  "Slice J: the Journal front takes the COMPOSITE art, not the headline art",
  /heroCompositeImg\(hero\)/.test(journalPage) && !/heroImg\(/.test(journalPage),
);
// Asserted as BEHAVIOUR, not as a grep (see the note on the src() batch above).
// This is the stronger claim regardless: a source grep proves the call was
// written, whereas these prove the two composites actually AGREE — which is the
// thing that breaks if someone edits one of them.
check(
  "Slice J: the composite art differs from the headline art where it must",
  // iron_man is the case that drove the fix: a full-bleed codex page as `img`,
  // a curated bust as `throneImg`. If these ever collapse to one value the
  // Journal front silently goes back to rendering a dark rectangle.
  heroCompositeImg("iron_man") !== heroImg("iron_man"),
  `${heroCompositeImg("iron_man")} vs ${heroImg("iron_man")}`,
);
check(
  "Slice J: every hero resolves to SOME composite art (no holes)",
  FAV_CHARACTERS.every((id) => Boolean(heroCompositeImg(id))),
);
check(
  "Slice J: a skipped/legacy hero resolves to nothing, so the pet can take over",
  heroCompositeImg(null) === undefined && heroCompositeImg("Interstellar - Cooper") === undefined,
);
check(
  "Slice J: the coronation and the Journal front share ONE definition of it",
  // throneClose is the coronation's resolver. If it stopped routing through the
  // shared helper, these would drift apart the next time either changed.
  throneClose(ctx({ favCharacter: "iron_man" })).hero === heroCompositeImg("iron_man"),
);

// 6. The dead CSS went with the branch. A rule matching nothing reports no
// failure (M59) — this is the leg that notices.
check(
  "Slice J: the retired soon-tile CSS is deleted, not orphaned",
  !/^\.dash-tour-tile--soon \{/m.test(dashCssJ) && !/^\.dash-tour-soon \{/m.test(dashCssJ),
);

// ─────────────────────────────────────────────────────────────────────────
// §Slice K — the Crew page, and the retirement of the rail's inert variant.
//
// Client claims again (M43), for the same reason as §Slice J: no backend, so a
// server leg would be green while the page rendered wrong. The look is the
// walk's job; these hold the rules an edit could break silently.
// Comment-stripped (see `code`): every claim in this section is STRUCTURAL —
// which element sits where, which prop exists — so prose between two tokens is
// noise that either hides a real break or invents one that isn't there.
const [crewPage, crewCss, appShellK, appTsxK, appShellCss] = (
  await Promise.all([
    src("components/CrewPage.tsx"),
    src("components/crew.css"),
    src("components/AppShell.tsx"),
    src("App.tsx"),
    src("components/app-shell.css"),
  ])
).map(code) as [string, string, string, string, string];

// 1. The page exists and is reachable. Four mechanical edits, four claims —
// any one of them missing gives a rail item that highlights nothing or a view
// that falls through to the Practice default (the `: (` arm of the chain, which
// is why a missing branch renders the WRONG page rather than an error).
check("Slice K: 'crew' is a real AppView member", /\| "crew"/.test(appShellK));
check(
  "Slice K: App routes the view to the page",
  /view === "crew" \? \(\s*(?:\/\/[^\n]*\n\s*)*<CrewPage/.test(appTsxK),
);
check(
  "Slice K (D-K2): the Crew rail item navigates",
  // 200 → 400: this is a PROXIMITY heuristic ("the onClick belongs to this
  // item"), and every prop the item gains eats the window. At 200 it reddened
  // on a correct element that had grown one prop, which is a false red the
  // moment anyone edits the rail — the failure mode this whole section exists
  // to avoid. Still bounded, so it cannot match a DIFFERENT item's onClick:
  // the next RailItem is ~500 characters away.
  /label="Crew"[\s\S]{0,400}onClick=\{\(\) => onNavigate\("crew"\)\}/.test(appShellK),
);
// 🔑 D-K2 is a claim about WHICH GROUP, not merely about presence — and the
// groups are the whole reason the rail reads as two ideas (who walks with you /
// what you study). `nav-spacer` is the divider, so "before it" is the claim.
check(
  "Slice K (D-K2): Crew sits in the companion group, above the spacer",
  appShellK.indexOf('label="Crew"') < appShellK.indexOf("nav-spacer") &&
    appShellK.indexOf('label="Crew"') > appShellK.indexOf('label="Journal"'),
);

// 2. Search is gone — item, icon and all. A component left behind after its
// last call site is deleted matches nothing and reports no failure (M59).
check("Slice K: the Search rail item is gone", !/label="Search"/.test(appShellK));
check("Slice K: its icon went with it, not orphaned", !/function SearchIcon/.test(appShellK));

// 3. 🔑 INVERTED THIS SESSION — the founder reversed Slice K's soon rule.
//
// Slice K asserted the rail could not EXPRESS "soon" at all, on the reasoning
// that a coming-soon belongs once, on the page it describes. That held while
// the only candidate was Search, which pointed NOWHERE — the marker was
// dressing up a dead end. Crew is the opposite case: it navigates, its page is
// real, and what is unbuilt is what the crew will do. A student could not see
// that from the rail and clicked a sparkle expecting a feature.
//
// So the claim changes shape rather than being dropped. What Slice K was really
// protecting is the SECOND leg below — every rail item goes somewhere — and
// that one is untouched and now carries the weight alone. The distinction the
// old leg enforced by absence is enforced here by opposition: a `soon` sticker
// may exist, an INERT item may not.
check(
  "the rail can mark a real page as coming-soon (founder, reversing D-K's soon rule)",
  // ⚠️ Anchored on the DECLARATION (`{`), not the prefix. Caught by this
  // slice's own negative control: renaming the rule to `.nav-soon-NEGCTRL`
  // left `/^\.nav-soon/` matching happily, so the leg reported a style that no
  // longer existed — M77's family again, found only because the control was
  // run. A prefix match is not an existence proof.
  /\bsoon\?: boolean/.test(appShellK) && /^\.nav-soon \{/m.test(appShellCss),
);
check(
  "🔑 but STILL no inert variant — a marked item is not a dead one",
  !/nav-item--soon/.test(appShellK) && !/^\.nav-item--soon/m.test(appShellCss),
);
check(
  "Slice K: every rail item goes somewhere (onClick is required)",
  /onClick: \(\) => void/.test(appShellK),
);
check(
  "the sticker reaches a screen reader through the NAME, not just the pixels",
  /aria-label=\{soon \?/.test(appShellK),
);

// 4. D-K1 — ONE soon panel, and the capability cards are PLAIN. The plan asked
// for a pill on every card; that is the third answer to a question settled in
// Slices I and J, so the panel speaks for all six cards instead.
check(
  "Slice K (D-K1): exactly ONE soon panel on the page",
  (crewPage.match(/className="crew-soon"/g) ?? []).length === 1,
);
{
  // Scoped to the rendered card region, NOT the whole file — the constants at
  // the top explain the decision in prose, and a file-wide grep cannot tell a
  // rule from an explanation of it (M74, three sessions running).
  //
  // The region ends at the list's own closing tag, NOT at the soon panel below
  // it. Ending at the panel swallowed the comment that introduces the panel —
  // which naturally says what the panel is — and reddened this leg on the first
  // run. The region was wrong, not the prose: the claim is about CARDS, so it
  // should stop where the cards do.
  const cards = crewPage.slice(crewPage.indexOf("crew-caps"), crewPage.indexOf("</ul>"));
  check("Slice K (D-K1): no per-card soon pill", !/soon/i.test(cards), cards.slice(0, 80));
  check(
    "Slice K (D-K1): nothing inside a capability card is focusable",
    !/<(button|input|a|textarea)\b/.test(cards),
  );
}

// 5. D-K3 — the rotation. Three separate failures live here, so three legs.
check(
  "Slice K (D-K3): the cycle reuses ROTATE_MS, not a fresh magic number",
  /ROTATE_MS/.test(crewPage) && !/setInterval\([^,]+,\s*\d+\)/.test(crewPage),
);
check(
  "Slice K (D-K3): reduced motion stops the timer before it is ever armed",
  /if \(reducedMotion\) return;[\s\S]{0,120}setInterval/.test(crewPage),
);
check(
  "Slice K (D-K3): an opened column stops cycling and settles on the first card",
  /const capIdx = isOpen \? 0 :/.test(crewPage),
);
check(
  "Slice K (D-K3): ONE timer drives both columns, so they cannot drift apart",
  (crewPage.match(/setInterval/g) ?? []).length === 1,
);

// 6. 🔑 D-K4 — a hero with no art gets NO COLUMN. Asserted as BEHAVIOUR on the
// resolver rather than as a grep, which is the stronger claim and the shape
// that removes the comment-collision class entirely (M74).
check(
  "Slice K (D-K4): every known hero yields art, so their column always renders",
  FAV_CHARACTERS.every((id) => Boolean(heroCompositeImg(id))),
);
check(
  "Slice K (D-K4): a skipped hero and a legacy free-text row both yield nothing",
  heroCompositeImg(null) === undefined && heroCompositeImg("Interstellar - Cooper") === undefined,
);
check(
  "Slice K (D-K4): no Olórin art reaches the Crew page",
  !/olorin/i.test(crewPage),
);
// The pet column is the one that can never be absent — every pet helper lands
// on the owl stand-in — which is what makes "drop the hero column" safe. If
// this stopped holding, a hero-less student would get an EMPTY page.
check(
  "Slice K (D-K4): the pet column is unconditional, so the page is never empty",
  /cols\.push\(\{\s*key: "pet"/.test(crewPage),
);

// 7. 🔑 D-K5 — THE ART DOES NOT CYCLE, AND THIS IS THE LEG THAT WOULD CATCH IT
// COMING BACK.
//
// The slice was built with the art rotating through all of a hero's scans, it
// passed every leg in this file, and it passed an 89/89 browser walk. Only a
// screenshot showed what was actually on screen: a hero has three scans and
// only ONE is composite-grade, so the cycle was feeding the full-bleed page
// scenes — the exact art `throneImg` was curated to keep OUT of composites —
// into a 190px slot two frames in three.
//
// The rule that survives: this slot takes the curated bust and nothing else.
check(
  "Slice K (D-K5): the column art is a single image, not a list to index into",
  /art: string;/.test(crewPage) && !/art\[/.test(crewPage),
);
// 🔑 INVERTED in Slice M. D-K5's "no cycling" half is UNCHANGED and still
// asserted above — that is the part S117 found and S118 re-broke. What flipped
// is WHICH single image: the founder removed the card and made the art the
// largest thing on the page, and `throneImg` was curated for the opposite
// condition (a 190px slot beside a white card, where a full-bleed page scene
// reads as a plate). At full size with no card, the headline art is the right
// framing and the bust is the wrong one.
//
// ⚠️ The leg is kept — not deleted — because "exactly one resolver, called
// once" is the property that stops the cycle coming back a third time. Only the
// name changed, and the negation now guards the OTHER direction.
check(
  "Slice M: the column art comes from the headline resolver, once",
  /heroImg\(hero\)/.test(crewPage) && !/heroCompositeImg\(/.test(crewPage),
);
// Only the CARDS may be indexed by the clock. If a frame index ever reappears
// here, the art is cycling again.
check(
  "Slice K (D-K5): only the cards are driven by the tick",
  (crewPage.match(/tick %/g) ?? []).length === 1 && /capIdx/.test(crewPage),
);
// iron_man is the case that drove both S117's finding and this one: a
// full-bleed codex page as headline art, a curated bust as the composite. If
// those ever collapse to one value the column silently goes back to rendering a
// dark rectangle, and nothing else in this file would notice.
check(
  "Slice K: the composite art still differs from the headline art where it must",
  heroCompositeImg("iron_man") !== heroImg("iron_man"),
  `${heroCompositeImg("iron_man")} vs ${heroImg("iron_man")}`,
);
// NOTE — the retired `heroArtVariants` helper is deleted rather than orphaned
// (M59), but that is NOT asserted here and deliberately so: the only way to
// check it is to read `onboarding.copy.ts` as TEXT, which is the one thing
// §Slice J's header forbids in this file. Reading it with Bun.file() while it
// is also a static import is what made this probe die intermittently on a PNG.
// The claim is worth less than the crash it would risk re-introducing.

// 8. The art slot — the same rules as every other character slot in the app,
// and this is the worst case yet: eleven heroes at three scans EACH plus seven
// pet stickers through one selector.
{
  // 🔴 COMMENTS STRIPPED — AND THIS ONE CAUGHT A LIVE FALSE GREEN.
  //
  // Slice M deleted `mix-blend-mode: multiply` from `.crew-art` (the revolve
  // holds a permanent transform, which would switch the blend off anyway — see
  // the M60 block below). The leg asserting multiply STAYED GREEN, because the
  // comment explaining the deletion contains the literal string
  // `mix-blend-mode: multiply` while saying it is gone.
  //
  // That is worse than the M74 false-RED this file already knows about: prose
  // stood in for a property that no longer exists, so a probe reported a
  // composite guarantee the CSS had stopped making. Every grep over source in
  // this block reads CODE now, never commentary.
  const r = rule(crewCss, "crew-art").replace(/\/\*[\s\S]*?\*\//g, "");
  check("Slice K art: sized on HEIGHT, not width (M63)", /height:\s*\d+px/.test(r), r);
  check("Slice K art: width follows the art", /width:\s*auto/.test(r), r);
  check("Slice K art: object-fit contain, so no aspect is cropped", /object-fit:\s*contain/.test(r), r);
  // 🔑 INVERTED in Slice M — multiply is deliberately ABSENT here, and asserting
  // its absence is what stops someone "restoring" it as a fix. It cannot work on
  // this element: the revolve holds a permanent rotateY, and a transformed
  // element forms a stacking context that switches blending off. Re-adding it
  // would be dead CSS wearing the costume of a live guard.
  check("Slice M art: NO multiply — it cannot survive the revolve (M60)", !/mix-blend-mode/.test(r), r);
  // 🔑 BOTH halves of the composite (S117). This column cycles through art of
  // both kinds — line-art on white AND full-bleed toned scans — so a missing
  // mask would show up and vanish on a timer, which is the worst version of
  // this bug to diagnose.
  check("Slice K art: feathers EVERY edge, not just one axis (S102)", /mask-image:/.test(r), r);
  check(
    "Slice K art: the feather is two axes composited, not a single gradient",
    /mask-composite:\s*intersect/.test(r) && (r.match(/linear-gradient/g) ?? []).length >= 2,
    r,
  );
  // 🔑 M60 — the reason this file cares about a fill mode at all. A retained
  // transform creates a stacking context that silently switches OFF the blend
  // mode above, on art that was composited correctly. That is precisely how the
  // onboarding scans grew opaque plates in ONB-6. Scoped to the DECLARATION so
  // that prose about the rejected keyword cannot redden the rule (M74).
  check(
    "Slice K art: the entrance releases its transform (M60 — never a retained fill)",
    /animation:[^;]*backwards/.test(r) && !/animation:[^;]*\bboth\b/.test(r),
    r,
  );
}
// 🔴 M60, RESTATED FOR A PAGE THAT NOW HOLDS A TRANSFORM ON PURPOSE.
//
// The old leg banned a retained transform outright (`animation-fill-mode: both`)
// because a retained transform creates a stacking context that silently kills
// `mix-blend-mode`. Slice M's revolve is an INFINITE rotateY — a permanent
// transform by design, and no fill-mode keyword is involved — so the old form
// of the rule could not express the risk any more.
//
// The INVARIANT is what actually mattered, and it is unchanged: a transformed
// element and `mix-blend-mode` cannot both work. So the leg now asserts the
// pairing directly — if the art holds a transform, it must NOT declare a blend.
// Re-adding `multiply` here would look like a fix and would be dead CSS.
//
// ⚠️ COMMENTS ARE STRIPPED FIRST (M74, third appearance). The previous form
// tested raw source, and this session's own explanatory comment — which uses
// the words "animation:" and "both" in prose — reddened the rule it was
// describing. A guard that its own documentation can break is a guard nobody
// can safely comment.
const crewCssCode = crewCss.replace(/\/\*[\s\S]*?\*\//g, "");
check(
  "Slice M (M60): the revolving art declares NO mix-blend-mode",
  /crew-revolve/.test(crewCssCode) && !/mix-blend-mode/.test(crewCssCode),
);
check(
  "Slice M (M60): no animation retains its final transform via fill-mode",
  !/animation:[^;]*\bboth\b/.test(crewCssCode),
);
// The mask is now the ONLY thing dissolving the scan's paper edge, so its
// absence is no longer cosmetic — it is the whole composite.
check(
  "Slice M: the feather mask survives the loss of multiply",
  /mask-composite:\s*intersect/.test(crewCssCode),
);

// ── §Slice L — the pronoun stickers, and the closing of the last free set ──
//
// Two independent changes share this block because they share one idea: the
// flow now picks EVERY answer from a set we authored, and picks them by their
// picture. §7 and §8 above already carry the inverted custom-pet claims (the
// behaviour that is GONE); these carry the structure that replaced it.
console.log("\nSlice L — the pronoun stickers + the closed pet set");
const [onbPageL, onbCssL, onbCopyL, onbServiceL] = await Promise.all([
  src("components/OnboardingPage.tsx"),
  src("components/onboarding.css"),
  src("components/onboarding.copy.ts"),
  Bun.file(new URL("../src/services/onboarding.ts", import.meta.url)).text(),
]);

// 1. The row itself. ABOUT_ROWS is imported live rather than grepped, so these
// are claims about the DATA the component walks, not about its source text.
const pronounRow = ABOUT_ROWS.find((r) => r.key === "pronoun")!;
check("Slice L: the pronoun row is a sticker row now, not pills", pronounRow.style === "sticker");
check(
  "Slice L: it offers exactly TWO stickers (D-L1)",
  Array.isArray(pronounRow.chips) && pronounRow.chips.length === 2,
  JSON.stringify(Array.isArray(pronounRow.chips) ? pronounRow.chips.map((c) => c.value) : pronounRow.chips),
);
check(
  "Slice L: both stickers carry art — a sticker row with no picture is just pills",
  Array.isArray(pronounRow.chips) && pronounRow.chips.every((c) => Boolean(c.img)),
);
// 🔑 The claim that actually protects the student, and it SURVIVES S123 intact
// because it was written against the CONTRACT rather than a literal count.
// PRONOUNS is the server's closed set; the UI must offer all of it and nothing
// beyond it. Before S123 that was two stickers + an aside; it is now two
// stickers, and this leg needed no edit to say so — which is the whole reason
// it was written this way.
//
// The `nothing beyond it` half is new and load-bearing: a sticker still
// offering the removed 'name' would be an option the server now REJECTS, i.e. a
// student who picks it is told their own answer is invalid.
const offeredPronouns = Array.isArray(pronounRow.chips)
  ? pronounRow.chips.map((c) => c.value)
  : [];
check(
  "Slice L (D-L1): every pronoun the SERVER accepts is reachable in the UI",
  PRONOUNS.every((p) => offeredPronouns.includes(p)) && offeredPronouns.length === PRONOUNS.length,
  JSON.stringify({ offered: offeredPronouns, contract: PRONOUNS }),
);
// 🔴 S123 INVERTED THESE. They asserted the "just {name}" aside EXISTED, said
// the student's own name, and was not one of the stickers. The founder removed
// the option, so the same three claims now run the other way.
check(
  "S123: the 'just {name}' aside is GONE from the pronoun row",
  // 🔴 Read through a cast, deliberately. `aside` no longer exists on `DuoRow`,
  // so `pronounRow.aside` is a TYPE ERROR — and the probe still has to be able
  // to look for it at RUNTIME, because the regression this guards against is
  // someone putting the field back. Written the typed way, tsc fails and the
  // check cannot exist; written this way it fails loudly the moment an aside
  // reappears in the data, whatever the type says.
  (pronounRow as Record<string, unknown>).aside === undefined,
  JSON.stringify((pronounRow as Record<string, unknown>).aside ?? null),
);
check(
  "S123: no pronoun option offers the removed 'name' value",
  !offeredPronouns.includes("name"),
  JSON.stringify(offeredPronouns),
);
// The other two rows must NOT have quietly become sticker rows — there is no
// art for a class or a board, so the branch would render empty cards. Widened
// from "every row but pronoun" to ALL rows now that no row may carry an aside.
check(
  "S123: no row anywhere carries an aside, and board/grade stay board rows",
  ABOUT_ROWS.every((r) => (r as Record<string, unknown>).aside === undefined) &&
    ABOUT_ROWS.filter((r) => r.key !== "pronoun").every((r) => r.style === "board"),
);

// 2. The component renders both parts. The aside is a real committing control:
// if it rendered without an onClick it would look like an option and do
// nothing — the exact silent no-op D-J4/Slice K designed out of the rail.
check("Slice L: the sticker branch exists in the duo row", /onb-choice onb-duo-sticker/.test(onbPageL));
check("Slice L: it reuses the pet beat's art class, not a second one", /row\.style === "sticker" && o\.img/.test(onbPageL));
// 🔴 S123 INVERTED: the aside's markup must be GONE from the component, not
// merely unreachable. A hidden branch left behind is the thing that comes back.
//
// ⚠️ THESE THREE ARE NEGATIVE GREPS, and a negative grep passes against an
// empty file, a renamed file, or a typo'd path — it is the single easiest false
// green in this probe (S122 logged the same trap on the dev-login greps). The
// positive control below is what proves `onbPageL` actually holds the
// component's source, so these three mean something.
check("S123: the aside markup is gone from the component", !/onb-duo-aside/.test(onbPageL));
check("S123: …and so is its commit handler", !/row\.aside/.test(onbPageL));
check(
  "S123 POSITIVE CONTROL: onbPageL really is OnboardingPage's source",
  /onb-choice onb-duo-sticker/.test(onbPageL) && onbPageL.length > 5000,
  `len=${onbPageL.length}`,
);
// M63/S114 — the axis that binds. The real art is not in the repo yet (D-L2),
// so this asserts the slot is aspect-INDEPENDENT rather than asserting anything
// about the placeholders: height-driven + contain means art of any shape lands
// correctly, and a `width:`-driven slot would silently distort the real
// sketches the day they arrive.
const stickerImgRule = /\.onb-choice-img\s*\{[^}]*\}/.exec(onbCssL)?.[0] ?? "";
check("Slice L art: the sticker slot is height-driven (M63)", /height:\s*\d+px/.test(stickerImgRule), stickerImgRule);
check("Slice L art: object-fit contain, so no aspect is cropped", /object-fit:\s*contain/.test(stickerImgRule));

// 3. The hatch is gone from EVERY layer. Three files, because a leftover in any
// one of them is a different failure: copy = the option comes back, page = a
// dead branch, css = an orphaned rule (M59).
check("Slice L: PET_OTHER is gone from the copy", !/PET_OTHER/.test(onbCopyL));
check("Slice L: the OtherOption TYPE is gone too, not just its instance", !/^export type OtherOption/m.test(onbCopyL));
check("Slice L: the hatch's open/close state is gone from the page", !/otherOpen/.test(onbPageL));
check("Slice L: and its 'back to the list' escape went with it", !/back to the list/.test(onbCopyL));
// ⚠️ M74, fifth appearance — these greps run against files whose COMMENTS
// deliberately explain what was deleted and why. Every claim above is scoped to
// a declaration or an identifier that prose would not contain; `.onb-other` is
// the exception, because it SURVIVES (the aside reuses it) and only the
// hatch-specific styling should be gone.
// 🔴 M77, CAUGHT LIVE IN S123 AND ON THIS EXACT LINE. This leg used to assert
// `/\.onb-duo-aside/.test(onbCssL)` — a BARE IDENTIFIER. When S123 deleted those
// rules it stayed GREEN, because the comment left in their place explains the
// deletion and necessarily names the class. Prose stood in for a rule that no
// longer existed: the probe was reading my apology as a stylesheet.
//
// Both halves are now anchored on a DECLARATION (`\s*\{`), which prose does not
// contain — the same fix M77 forced on `mix-blend-mode: multiply`. And the two
// halves now point OPPOSITE ways, which is the real guard:
//   `.onb-other`     MUST survive — "Show me everyone" still wears it, and the
//                    aside's removal made it LOOK orphaned when it is not.
//   `.onb-duo-aside` MUST be gone — its only user was deleted.
// A single-direction check would have passed on a stylesheet where both were
// deleted, taking a live control's styling with it and telling me it was fine.
check(
  "S123: .onb-other SURVIVES (still used by 'Show me everyone'), .onb-duo-aside is GONE",
  /\.onb-other\s*\{/.test(onbCssL) && !/\.onb-duo-aside[\s.,:]*\{/.test(onbCssL),
);

// 4. The server. The FE closing the set is a convenience; THIS is the rule.
// Scoped to the validation call, not to the word "pet", which appears in prose
// all over this file.
check(
  "Slice L: saveStep validates pet against the closed PETS set",
  /PETS as readonly string\[\]\)\.includes\(value\)/.test(onbServiceL),
);
check(
  "Slice L: and PETS is actually imported there (not a stale reference)",
  /^\s*PETS,$/m.test(onbServiceL),
);
// 🔑 The legacy population, at the layer that decides. saveStep validates
// WRITES; nothing may retro-reject a row that already exists, because those
// students' rows are read on every resume and a throw would lock them out of
// their own dashboard. Asserted as the absence of a read-path check.
check(
  "Slice L: isKnownPet survives for the pre-Slice-L rows that still need it",
  /export function isKnownPet/.test(await Bun.file(new URL("../packages/kernel/src/contracts.ts", import.meta.url)).text()),
);

// 5. The word budget (the plan's ⚠️). The stickers replace two chip LABELS with
// two images, so the row's words go down, not up — but the budget is asserted
// in §10 above against the whole flow, and this is the leg that would catch a
// sticker row that grew a caption.
check(
  "Slice L: the pronoun row's own copy stays a label, not a paragraph",
  words(typeof pronounRow.label === "function" ? pronounRow.label(ctx()) : pronounRow.label) <= 12,
  typeof pronounRow.label === "string" ? pronounRow.label : "(fn)",
);

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);

