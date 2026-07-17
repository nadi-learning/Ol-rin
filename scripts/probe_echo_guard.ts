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
import { FAV_CHARACTERS, HERO_COMPANION, PETS } from "@b2c/kernel/contracts";
import { canEcho, looksLikeRefusal } from "../frontend/src/lib/safeEcho";
import type { BeatCtx } from "../frontend/src/components/onboarding.copy";
import {
  BEAT_BY_ID,
  EPILOGUE_PAGES,
  EPILOGUE_TOTAL_MS,
  HEROES,
  HEROES_BY_PRONOUN,
  PET_COPY,
  companionFor,
  heroesFor,
  loaderSay,
  petWink,
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

// ── 7. the reactions actually BRANCH on it ─────────────────────────────────
// The guard existing is not the fix; the copy calling it is. These assert the
// two surfaces where free text still reaches a reaction.
console.log("\n7. the copy uses the guard");
const petReaction = BEAT_BY_ID["pet"]!.reaction;
check(
  "a refused pet is NOT praised or repeated",
  !petReaction("no", ctx()).includes("no?") && petReaction("no", ctx()).includes("owl"),
  petReaction("no", ctx()),
);
check("a real custom pet IS taken seriously", petReaction("llama", ctx()).includes("llama"), petReaction("llama", ctx()));
check("a blocked pet is never repeated", !petReaction("fuck you", ctx()).includes("fuck"), petReaction("fuck you", ctx()));

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
// four originals: a card renders `img`, the loader speaks `spoken`, and the
// payoff page prints `story` + `bubble`. A half-filled row is a broken card,
// not a missing word.
check(
  "every pet has label + spoken + art + reaction + story + bubble",
  PETS.every((p) => {
    const c = PET_COPY[p];
    return Boolean(c?.label && c?.spoken && c?.img && c?.reaction && c?.story && c?.bubble?.text && c?.bubble?.by);
  }),
);

const phoneReaction = BEAT_BY_ID["phone"]!.reaction;
check(
  "typing 'no' at phone takes the SKIP voice, not 'Got it!'",
  phoneReaction("no", ctx()).includes("Skipped"),
  phoneReaction("no", ctx()),
);
check("a real number is accepted", phoneReaction("9876543210", ctx()).includes("Got it"), phoneReaction("9876543210", ctx()));

// ── 7b. the reveal is now PAGES (ONB-6) ────────────────────────────────────
// The founder's video verdict on the S96 reveal: "a para comes all of a sudden
// and it vanishes before someone read it". The reveal is now three Next-gated
// story pages, so the claims moved: the reaction is only the G3 fallback, and
// the hero/pet naming lives on page two.
console.log("\n7b. the three-page reveal");
const lorePages = BEAT_BY_ID["lore"]!.pages!;
const revealNo = lorePages("No", ctx({ favCharacter: "jon_snow", pet: "direwolf" }))!;
const revealYes = lorePages("Yes", ctx({ favCharacter: "thor", pet: "groot" }))!;
check("the reveal is THREE pages", revealNo.length === 3, String(revealNo.length));
check("every page is Next-gated (has a CTA)", revealNo.every((p) => p.cta.length > 0));
check("page 1 tells the Gandalf story in the FIRST person", revealNo[0]!.text.includes("Gandalf") && revealNo[0]!.text.includes("my name"));
check("page 1 wears the young/old pair", revealNo[0]!.scene?.kind === "pair");
check("'Yes' gets credit for knowing", revealYes[0]!.text.includes("already know"));
check(
  "page 2 places all three: hero, pet, Olórin-when-impossible",
  revealNo[1]!.text.includes("Jon Snow") && revealNo[1]!.text.includes("direwolf") && revealNo[1]!.text.includes("impossible"),
  revealNo[1]!.text,
);
check("page 2 still reads if the hero is somehow absent", lorePages("Yes", ctx())![1]!.text.includes("your hero"));
check("page 3 is the fellowship trio", Boolean(revealNo[2]!.trio?.petImg && revealNo[2]!.trio?.olorinImg));
check("page 3 names the student", revealNo[2]!.title?.includes("Ravi") === true, revealNo[2]!.title);
check("the last CTA turns the page", revealNo[2]!.cta === "Turn the page");
// The G3 fallback reaction survives for unknown-step walkers.
const loreReaction = BEAT_BY_ID["lore"]!.reaction;
check("the fallback reaction still exists", loreReaction("No", ctx()).includes("Gandalf"));
// D-ONB-14 — the promise is bound to PRESENCE. Onboarding may not offer
// conversation; that feature does not exist and a child who tries on day 2
// learns the story lied. Swept across EVERY surface the rework added: hero
// stories, hero bubbles, pet stories, pet bubbles, all reveal pages.
const PROMISE_BOUND = /\b(talk to|chat|message|ask (him|her|them)|tell (him|her|them))\b/i;
check(
  "no reveal page promises conversation (D-ONB-14)",
  [...revealNo, ...revealYes].every((p) => !PROMISE_BOUND.test(p.text) && !PROMISE_BOUND.test(p.title ?? "")),
);
check(
  "no hero story or bubble promises conversation (D-ONB-14)",
  FAV_CHARACTERS.every((id) => !PROMISE_BOUND.test(HEROES[id]!.story) && !PROMISE_BOUND.test(HEROES[id]!.bubble.text)),
);
check(
  "no pet story or bubble promises conversation (D-ONB-14)",
  PETS.every((p) => !PROMISE_BOUND.test(PET_COPY[p]!.story) && !PROMISE_BOUND.test(PET_COPY[p]!.bubble.text)),
);

// ── 7c. the payoff pages (ONB-6) ───────────────────────────────────────────
// The founder: "we are not explaining who and why the hero is here… we need to
// explain everything about pet and hero". Every hero pick must earn a complete
// comic page; every KNOWN pet likewise; the guarded custom path must NOT get a
// page (its value is free text — the quick reply already goes through the
// guard, and a page would print it larger and longer).
console.log("\n7c. the payoff pages");
const heroPagesFn = BEAT_BY_ID["fav_character"]!.pages!;
check(
  "every hero gets one complete page: quip title + story + bubble + collage",
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
const petPagesFn = BEAT_BY_ID["pet"]!.pages!;
check(
  "every known pet gets one page with the sticker + story + bubble",
  PETS.every((p) => {
    const pg = petPagesFn(p, ctx({ favCharacter: "harry_potter" }));
    return pg?.length === 1 && Boolean(pg[0]!.sticker?.img) && pg[0]!.text === PET_COPY[p]!.story && Boolean(pg[0]!.bubble);
  }),
);
check("a custom pet gets NO page (free text stays on the guarded path)", petPagesFn("llama", ctx()) === undefined);
check("a refused pet gets NO page", petPagesFn("no", ctx()) === undefined);

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
check("a custom pet gets the 2-3 dayssss gag", loaderSay("llama").includes("2-3 dayssss"));
check("...and the owl covers, so nobody leaves petless", loaderSay("llama").includes("owl"));
check("a refused pet is never repeated in the gag", !loaderSay("no").includes("One no"), loaderSay("no"));
check("a blocked pet is never repeated in the gag", !loaderSay("fuck you").includes("fuck"), loaderSay("fuck you"));
// Every one of the seven pets must have a speakable delivery — the epilogue's
// first page is the payoff screen, and "one undefined" is the failure mode.
check(
  "every pet has a real delivery line",
  PETS.every((p) => loaderSay(p).includes(PET_COPY[p]!.spoken)),
);

// ── 9. the epilogue (ONB-6) ────────────────────────────────────────────────
// The founder: "the loader setting up is also like 5 sec make it 45 sec". The
// close is now five read-along pages; the number is the founder's, so a drift
// from it is a probe failure, not a tuning choice.
console.log("\n9. the epilogue");
check("the total is the founder's 45 seconds", EPILOGUE_TOTAL_MS === 45_000, String(EPILOGUE_TOTAL_MS));
check("five pages", EPILOGUE_PAGES.length === 5, String(EPILOGUE_PAGES.length));
check("page one is the handover (leads with the sticker)", EPILOGUE_PAGES[0]!.sticker === true);
const epCtx = ctx({ favCharacter: "naruto", pet: "kurama", grade: "10" });
const epSays = EPILOGUE_PAGES.map((p) => (typeof p.say === "function" ? p.say(epCtx) : p.say));
check("every page has words for a real student", epSays.every((s) => s.length > 0), JSON.stringify(epSays));
check("the handover speaks the picked pet", epSays[0]!.includes("Kurama"), epSays[0]);
check("the hero page names the picked hero", epSays.some((s) => s.includes("Naruto")));
check("the last page sends the student off by name", epSays[EPILOGUE_PAGES.length - 1]!.includes("Ravi"));
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

// ── 10. the founder's ONB-6 asks, as claims (S103) ─────────────────────────
// Each of these is a note the founder made on a rendered page. They are cheap
// to satisfy and easy to undo by accident in a copy pass, which is exactly
// what a probe is for.
console.log("\n10. the S103 feedback holds");
const greet = BEAT_BY_ID["greet"]!;
const greetPrompt = typeof greet.prompt === "function" ? greet.prompt(ctx()) : greet.prompt;
check("greet welcomes them to Olórin's home", /welcome to the home of Ol/i.test(greetPrompt), greetPrompt);
check(
  "greet's CTA is not the old 'Start my story'",
  greet.input.kind === "none" && greet.input.cta !== "Start my story",
  greet.input.kind === "none" ? greet.input.cta : "(not a cta beat)",
);
const about = BEAT_BY_ID["about_you"]!;
const aboutPrompt = typeof about.prompt === "function" ? about.prompt(ctx()) : about.prompt;
check("about_you frames the ask as understanding them first", /before your story begins/i.test(aboutPrompt), aboutPrompt);
const heroBeat = BEAT_BY_ID["fav_character"]!;
const heroSub = typeof heroBeat.sub === "function" ? heroBeat.sub(ctx()) : heroBeat.sub ?? "";
check("the hero ask says it's Olórin's favourite part", /my favourite part/i.test(
  (typeof heroBeat.prompt === "function" ? heroBeat.prompt(ctx()) : heroBeat.prompt) + heroSub,
));
check("...and says the pick is the student's own", /pick the one you want|entirely yours/i.test(heroSub), heroSub);
const phoneBeat = BEAT_BY_ID["phone"]!;
const phoneSub = typeof phoneBeat.sub === "function" ? phoneBeat.sub(ctx()) : phoneBeat.sub ?? "";
check("the phone ask gives the REASON: staying in touch beyond the app", /stay in touch outside/i.test(phoneSub), phoneSub);
// Every hero + pet story must address the student directly — the founder's
// "the copy should speak to the user" on both payoff pages. A story that never
// says "you" is a Wikipedia entry with art behind it.
check(
  "every hero story speaks TO the student",
  FAV_CHARACTERS.every((id) => /\byou\b|\byour\b/i.test(HEROES[id]!.story)),
);
check(
  "every pet story speaks TO the student",
  PETS.every((p) => /\byou\b|\byour\b/i.test(PET_COPY[p]!.story)),
);
// "more sketches in the page" — the pages that carry art must actually carry
// several, or the note comes back next session.
check(
  "every hero payoff page hangs at least 3 sketches",
  FAV_CHARACTERS.every((id) => {
    const sc = BEAT_BY_ID["fav_character"]!.pages!(id, ctx())![0]!.scene;
    return sc?.kind === "collage" && Boolean(sc.main) && sc.items.length >= 3;
  }),
);
check(
  "every pet payoff page hangs at least 3 sketches",
  PETS.every((p) => {
    const sc = BEAT_BY_ID["pet"]!.pages!(p, ctx({ favCharacter: "harry_potter" }))![0]!.scene;
    return sc?.kind === "collage" && sc.items.length >= 3;
  }),
);
check(
  "every pet has its OWN universe art (not a shared stock sketch)",
  PETS.every((p) => PET_COPY[p]!.pages.length >= 2),
);
check("the lore ask carries Middle-earth in its corners", (() => {
  const sc = BEAT_BY_ID["lore"]!.scene;
  const scene = typeof sc === "function" ? sc(ctx()) : sc;
  return scene?.kind === "pair" && (scene.items?.length ?? 0) >= 2;
})());
check(
  "the fellowship page names the class they're about to conquer",
  BEAT_BY_ID["lore"]!.pages!("Yes", ctx({ favCharacter: "thor", pet: "groot", grade: "10" }))![2]!
    .title!.includes("class 10"),
);
check(
  "...and still reads for a student with no grade on file",
  Boolean(BEAT_BY_ID["lore"]!.pages!("Yes", ctx({ favCharacter: "thor", pet: "groot" }))![2]!.title),
);
check("every epilogue page is drawn on scenery, not an empty grid", EPILOGUE_PAGES.every((p) => Boolean(p.scene)));

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
