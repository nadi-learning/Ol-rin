/**
 * probe_onboarding — ID-3 exit gate (onboarding on the profile model).
 *
 * Drives services/onboarding.ts through withBoard(), i.e. as the NON-superuser
 * app role with a real board claim, so RLS is actually binding (M11: a probe
 * whose precondition can't fail proves nothing).
 *
 * 🔑 WHAT CHANGED FROM ONB-1. The answers no longer live as columns on a
 * board-scoped `onboarding` row. `onboarding` is now a GLOBAL state-machine
 * header (state/status/endAt) keyed by the student's app_user profile; the
 * answers land on the STUDENT row (class/pronoun/hero/pet, board-scoped) and
 * app_user (phone). `about_you` is where the operational `student` row is BORN.
 * So the RLS leg moved onto the student row (the real board boundary), and the
 * "does the operational row exist" claim is new.
 *
 *   1. needs-it            — a profile shell with no header → needsOnboarding, top
 *   2. grade chips         — the supported classes, board-independent (anti-trap)
 *   3. about_you BIRTHS    — saveAboutYou mints the operational student row
 *   4. resume mid-flow     — a fresh read returns the beat we stopped at
 *   5. validation          — closed sets + required fields + wrong-path rejects
 *   6. the walk            — hero/pet instances created + linked; phone → app_user
 *   7. idempotent          — re-saving overwrites, never forks
 *   8. RLS                 — the STUDENT row (A's answers) is invisible under B
 *   9. exempt roles        — tutor/parent/admin → not-needed, NOT a 403
 *  10. complete            — flips the flag; endAt stamped once
 *  11. flow log            — transitions are recorded (the header's audit trail)
 *
 * Unique per-run fixtures (M22) + full teardown in `finally`.
 */
import { and, eq, inArray } from "drizzle-orm";
import {
  appUser,
  board,
  hero,
  onboarding,
  onboardingFlowLog,
  pet,
  student,
} from "@b2c/kernel/schema";
import {
  FAV_CHARACTERS,
  ONBOARDING_STEPS,
  PETS,
  RETIRED_ONBOARDING_STEPS,
  isKnownPet,
  resolveOnboardingStep,
} from "@b2c/kernel/contracts";
import {
  complete,
  getState,
  listGradeOptions,
  OnboardingValidationError,
  saveAboutYou,
  saveStep,
  SUPPORTED_GRADES,
} from "../src/services/onboarding";
import { db, queryClient } from "../src/db/client";
import { withBoard } from "../src/db/with-board";

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

async function expectThrow(fn: () => Promise<unknown>): Promise<Error | null> {
  try {
    await fn();
    return null;
  } catch (e) {
    return e as Error;
  }
}

const tag = `${Date.now()}`;
const boardIds: string[] = [];
const userIds: string[] = [];

async function main() {
  console.log("\nprobe_onboarding (ID-3)\n");

  // ── fixtures: two boards + a student profile SHELL + a tutor profile ──────
  const [boardA] = await db.insert(board).values({ slug: `onb-a-${tag}`, name: "Onb A" }).returning();
  const [boardB] = await db.insert(board).values({ slug: `onb-b-${tag}`, name: "Onb B" }).returning();
  boardIds.push(boardA!.id, boardB!.id);

  // The shell `session.enter` would mint — (email, user_type='student'), no row.
  const [studentP] = await db
    .insert(appUser)
    .values({ email: `onb-student-${tag}@example.com`, name: "Onb Student", userType: "student" })
    .returning();
  const [tutorP] = await db
    .insert(appUser)
    .values({ email: `onb-tutor-${tag}@example.com`, name: "Onb Tutor", userType: "tutor" })
    .returning();
  userIds.push(studentP!.id, tutorP!.id);

  const email = studentP!.email;
  const S = { email, boardId: boardA!.id, role: "student" };

  // ── 1. needs-it ───────────────────────────────────────────────────────────
  console.log("1. needs-it");
  await withBoard(boardA!.id, async (tx) => {
    const st = await getState(tx, S);
    check("a shell with no header → needsOnboarding", st.needsOnboarding === true);
    check("starts at the first beat", st.currentStep === "greet", st.currentStep);
    check("no answers yet", st.answers.grade === null && st.answers.phone === null);
  });
  const preHeader = await db.select().from(onboarding).where(eq(onboarding.userId, studentP!.id));
  check("getState wrote nothing (a query must not write)", preHeader.length === 0);

  // ── 2. grade chips are the SUPPORTED classes, board-independent ────────────
  console.log("\n2. grade chips");
  await withBoard(boardA!.id, async (tx) => {
    const opts = await listGradeOptions(tx);
    check("the supported grades, in order", JSON.stringify(opts) === JSON.stringify([...SUPPORTED_GRADES]), JSON.stringify(opts));
  });
  await withBoard(boardB!.id, async (tx) => {
    const opts = await listGradeOptions(tx);
    // A board with NO catalogue still offers the grades — the anti-trap: grade is
    // required to finish, so an empty list would strand its students forever.
    check("a board with NO subjects still offers the grades (anti-trap)", JSON.stringify(opts) === JSON.stringify([...SUPPORTED_GRADES]), JSON.stringify(opts));
  });

  // ── 3. about_you BIRTHS the operational student row ────────────────────────
  console.log("\n3. about_you births the student row");
  await withBoard(boardA!.id, async (tx) => {
    const st0 = await saveStep(tx, { ...S, step: "greet", value: null });
    check("talk-only greet advances → about_you", st0.currentStep === "about_you", st0.currentStep);
    // Before about_you there is a header but NO student row.
    const [rowBefore] = await tx.select({ userId: student.userId }).from(student).where(eq(student.userId, studentP!.id));
    check("no student row before about_you (a board-less shell)", !rowBefore);

    const st = await saveAboutYou(tx, { ...S, grade: "10", pronoun: "she" });
    check("grade persisted (→ student.class)", st.answers.grade === "10", String(st.answers.grade));
    check("pronoun persisted in the SAME write", st.answers.pronoun === "she", String(st.answers.pronoun));
    check("advanced about_you → fav_character", st.currentStep === "fav_character", st.currentStep);

    const [rowAfter] = await tx
      .select({ boardId: student.boardId, class: student.class, pronoun: student.pronoun })
      .from(student)
      .where(eq(student.userId, studentP!.id));
    check("🔑 the operational student row now EXISTS on this board", rowAfter?.boardId === boardA!.id, String(rowAfter?.boardId));
    check("…carrying class + pronoun", rowAfter?.class === "10" && rowAfter?.pronoun === "she");
  });

  // ── 4. resume mid-flow ─────────────────────────────────────────────────────
  console.log("\n4. resume mid-flow");
  await withBoard(boardA!.id, async (tx) => {
    const st = await getState(tx, S);
    check("a fresh read resumes at the stored beat", st.currentStep === "fav_character", st.currentStep);
    check("and still knows the earlier answer", st.answers.grade === "10");
    check("still needs onboarding (not complete)", st.needsOnboarding === true);
  });

  // ── 5. validation ──────────────────────────────────────────────────────────
  console.log("\n5. validation");
  await withBoard(boardA!.id, async (tx) => {
    check("a free-text grade ('10th') is rejected", (await expectThrow(() => saveAboutYou(tx, { ...S, grade: "10th", pronoun: "he" }))) instanceof OnboardingValidationError);
    check("grade cannot be skipped", (await expectThrow(() => saveAboutYou(tx, { ...S, grade: null, pronoun: "he" }))) instanceof OnboardingValidationError);
    check("pronoun cannot be skipped", (await expectThrow(() => saveAboutYou(tx, { ...S, grade: "10", pronoun: null }))) instanceof OnboardingValidationError);
    check("the removed 'just {name}' opt-out is REJECTED (S123)", (await expectThrow(() => saveAboutYou(tx, { ...S, grade: "10", pronoun: "name" }))) instanceof OnboardingValidationError);
    check("pronoun rejects a value outside the contract", (await expectThrow(() => saveAboutYou(tx, { ...S, grade: "10", pronoun: "male" }))) instanceof OnboardingValidationError);
    check("saveStep('about_you') is rejected — it writes two things", (await expectThrow(() => saveStep(tx, { ...S, step: "about_you", value: "10" }))) instanceof OnboardingValidationError);
    check("a talk-only beat refuses an answer", (await expectThrow(() => saveStep(tx, { ...S, step: "greet", value: "hi" }))) instanceof OnboardingValidationError);
    check("'done' cannot be reached via saveStep", (await expectThrow(() => saveStep(tx, { ...S, step: "done" as any, value: null }))) instanceof OnboardingValidationError);
    check("fav_character rejects free text (the S90 bug, at the root)", (await expectThrow(() => saveStep(tx, { ...S, step: "fav_character", value: "No movie" }))) instanceof OnboardingValidationError);
    check("fav_character cannot be skipped", (await expectThrow(() => saveStep(tx, { ...S, step: "fav_character", value: null }))) instanceof OnboardingValidationError);
    check("pet is required", (await expectThrow(() => saveStep(tx, { ...S, step: "pet", value: null }))) instanceof OnboardingValidationError);
  });

  // ── 5b. the removed beats are really gone (S90, S91) ───────────────────────
  console.log("\n5b. removed beats");
  for (const gone of ["school", "fun_fact_about", "fun_fact", "grade"]) {
    check(`'${gone}' is not in ONBOARDING_STEPS`, !(ONBOARDING_STEPS as readonly string[]).includes(gone));
  }
  await withBoard(boardA!.id, async (tx) => {
    check("saveStep('school') is rejected — the beat no longer exists", (await expectThrow(() => saveStep(tx, { ...S, step: "school" as any, value: "DPS" }))) instanceof OnboardingValidationError);
    check("saveStep('fun_fact') is rejected", (await expectThrow(() => saveStep(tx, { ...S, step: "fun_fact" as any, value: "cubes" }))) instanceof OnboardingValidationError);
  });

  // ── 5c. the flow's shape ───────────────────────────────────────────────────
  console.log("\n5c. beat order");
  check(
    "ONBOARDING_STEPS is the ONB-7 flow (pikachu AND lore are GONE)",
    JSON.stringify(ONBOARDING_STEPS) === JSON.stringify(["greet", "about_you", "fav_character", "pet", "phone", "done"]),
    JSON.stringify(ONBOARDING_STEPS),
  );
  check("the roster is the S96 eleven", FAV_CHARACTERS.length === 11, String(FAV_CHARACTERS.length));
  check("the companion set is the S96 seven", PETS.length === 7, String(PETS.length));

  // ── 5d. a RETIRED step still resolves forward ──────────────────────────────
  console.log("\n5d. retired steps resolve forward");
  check("'pikachu' → its successor 'pet'", resolveOnboardingStep("pikachu") === "pet", resolveOnboardingStep("pikachu"));
  check("'grade' → about_you", resolveOnboardingStep("grade") === "about_you");
  check("'lore' → done (ONB-7)", resolveOnboardingStep("lore") === "done");
  check("a LIVE step resolves to itself", resolveOnboardingStep("pet") === "pet");
  check("every retired step lands on a real, live step", Object.values(RETIRED_ONBOARDING_STEPS).every((s) => (ONBOARDING_STEPS as readonly string[]).includes(s)));
  check("garbage falls back to greet, never undefined", resolveOnboardingStep("nonsense") === "greet");
  // The load-bearing version: a REAL stored 'pikachu' header, read through getState.
  await withBoard(boardA!.id, async (tx) => {
    await tx.update(onboarding).set({ state: "pikachu" }).where(eq(onboarding.userId, studentP!.id));
    const st = await getState(tx, S);
    check("a REAL stored 'pikachu' header resumes at pet, through getState", st.currentStep === "pet", st.currentStep);
    check("…and is not silently dropped out of onboarding", st.needsOnboarding === true);
    await tx.update(onboarding).set({ state: "fav_character" }).where(eq(onboarding.userId, studentP!.id));
  });

  // ── 6. the walk: hero + pet instances, phone → app_user ────────────────────
  console.log("\n6. the walk");
  await withBoard(boardA!.id, async (tx) => {
    check("whitespace-only fav_character is rejected", (await expectThrow(() => saveStep(tx, { ...S, step: "fav_character", value: "   " }))) instanceof OnboardingValidationError);

    const ch = await saveStep(tx, { ...S, step: "fav_character", value: "iron_man" });
    check("a chip id persists (→ hero instance)", ch.answers.favCharacter === "iron_man", String(ch.answers.favCharacter));
    check("advanced fav_character → pet", ch.currentStep === "pet", ch.currentStep);
    const [sHero] = await tx.select({ heroId: student.heroId }).from(student).where(eq(student.userId, studentP!.id));
    check("🔑 a per-student HERO instance was created + linked", !!sHero?.heroId);
    if (sHero?.heroId) {
      const [h] = await tx.select({ type: hero.heroType }).from(hero).where(eq(hero.heroId, sHero.heroId));
      check("…storing the picked character", h?.type === "iron_man", String(h?.type));
    }

    // Cross-list: a `he`-list hero for a `she` student is ACCEPTED (the list is a
    // display default, not a gate). Re-saving updates the SAME hero, not a 2nd.
    const heroBefore = sHero?.heroId;
    const crossed = await saveStep(tx, { ...S, step: "fav_character", value: "batman" });
    check("a `he`-list hero is accepted for a `she` student (D-ONB-13)", crossed.answers.favCharacter === "batman");
    const [sHero2] = await tx.select({ heroId: student.heroId }).from(student).where(eq(student.userId, studentP!.id));
    check("re-saving fav_character updates the SAME hero instance", sHero2?.heroId === heroBefore);
    await saveStep(tx, { ...S, step: "fav_character", value: "iron_man" });

    const known = await saveStep(tx, { ...S, step: "pet", value: "owl" });
    check("a known pet persists (→ pet instance)", known.answers.pet === "owl", String(known.answers.pet));
    check("advanced pet → phone", known.currentStep === "phone", known.currentStep);
    check("isKnownPet('owl') → true", isKnownPet(known.answers.pet) === true);
    const [sPet] = await tx.select({ petId: student.petId }).from(student).where(eq(student.userId, studentP!.id));
    check("🔑 a per-student PET instance was created + linked", !!sPet?.petId);

    check("a CUSTOM pet is REFUSED — the set is closed (Slice L)", (await expectThrow(() => saveStep(tx, { ...S, step: "pet", value: "llama" }))) instanceof OnboardingValidationError);
    const after = await getState(tx, S);
    check("the refused write left the known pet intact", after.answers.pet === "owl", String(after.answers.pet));
    check("isKnownPet('llama') → false", isKnownPet("llama") === false);

    check("phone REQUIRED — a null answer is refused", (await expectThrow(() => saveStep(tx, { ...S, step: "phone", value: null }))) instanceof OnboardingValidationError);
    check("phone SHAPED — ten digits starting 1 is refused", (await expectThrow(() => saveStep(tx, { ...S, step: "phone", value: "1234567890" }))) instanceof OnboardingValidationError);
    check("phone SHAPED — nine digits is refused", (await expectThrow(() => saveStep(tx, { ...S, step: "phone", value: "987654321" }))) instanceof OnboardingValidationError);

    const phoned = await saveStep(tx, { ...S, step: "phone", value: "9876543210" });
    check("a real mobile is accepted (→ app_user.phone)", phoned.answers.phone === "9876543210", String(phoned.answers.phone));
    check("and advances phone → done", phoned.currentStep === "done", phoned.currentStep);
    check("the pet survives the phone step", phoned.answers.pet === "owl", String(phoned.answers.pet));
    const [u] = await tx.select({ phone: appUser.phone }).from(appUser).where(eq(appUser.id, studentP!.id));
    check("the phone landed on the app_user profile", u?.phone === "9876543210", String(u?.phone));
  });

  // ── 7. idempotent ──────────────────────────────────────────────────────────
  console.log("\n7. idempotent");
  await withBoard(boardA!.id, async (tx) => {
    await saveAboutYou(tx, { ...S, grade: "9", pronoun: "he" });
    await saveAboutYou(tx, { ...S, grade: "9", pronoun: "he" });
    const rows = await tx.select().from(student).where(eq(student.userId, studentP!.id));
    check("re-saving overwrites, never forks a second student row", rows.length === 1, `${rows.length} rows`);
    check("the overwrite took (class 9)", rows[0]!.class === "9");
    const heads = await db.select().from(onboarding).where(eq(onboarding.userId, studentP!.id));
    check("still exactly ONE onboarding header", heads.length === 1, `${heads.length} rows`);
  });

  // ── 8. RLS — the STUDENT row is the board boundary now ─────────────────────
  console.log("\n8. RLS (the student row)");
  await withBoard(boardB!.id, async (tx) => {
    const rows = await tx.select().from(student).where(eq(student.userId, studentP!.id));
    check("board A's student row is INVISIBLE under board B", rows.length === 0, `${rows.length} rows`);
    // The header is global, but the ANSWERS are board-scoped — so board B sees no
    // grade even though the header exists.
    const st = await getState(tx, { ...S, boardId: boardB!.id });
    check("→ board B reads no board-scoped answers (grade null under B)", st.answers.grade === null, String(st.answers.grade));
  });

  // ── 9. exempt roles ────────────────────────────────────────────────────────
  console.log("\n9. exempt roles");
  await withBoard(boardA!.id, async (tx) => {
    for (const role of ["tutor", "parent", "admin"]) {
      const st = await getState(tx, { email: tutorP!.email, boardId: boardA!.id, role });
      check(`${role} → needsOnboarding false (exempt, not 403)`, st.needsOnboarding === false);
    }
  });

  // ── 10. complete ───────────────────────────────────────────────────────────
  console.log("\n10. complete");
  let firstEndAt: Date | null = null;
  await withBoard(boardA!.id, async (tx) => {
    const st = await complete(tx, { email, boardId: boardA!.id });
    check("complete flips the flag", st.needsOnboarding === false);
    check("status is completed", st.status === "completed");
    check("current_step lands on 'done'", st.currentStep === "done", st.currentStep);
    check("answers survive completion", st.answers.grade === "9");
    const [row] = await tx.select().from(onboarding).where(eq(onboarding.userId, studentP!.id));
    firstEndAt = row!.endAt;
    check("end_at is stamped", firstEndAt !== null);
  });
  await new Promise((r) => setTimeout(r, 50));
  await withBoard(boardA!.id, async (tx) => {
    await complete(tx, { email, boardId: boardA!.id });
    const [row] = await tx.select().from(onboarding).where(eq(onboarding.userId, studentP!.id));
    check("completing twice keeps the FIRST end_at", row!.endAt?.getTime() === (firstEndAt as Date | null)?.getTime());
  });

  // ── 11. flow log — transitions recorded ────────────────────────────────────
  console.log("\n11. flow log");
  const [head] = await db.select({ id: onboarding.id }).from(onboarding).where(eq(onboarding.userId, studentP!.id));
  const logs = await db.select().from(onboardingFlowLog).where(eq(onboardingFlowLog.onboardingId, head!.id));
  check("the flow log recorded the transitions (append-only trail)", logs.length > 0, `${logs.length} rows`);
  check("a completed transition was logged", logs.some((l) => l.status === "completed"));
}

main()
  .catch((e) => {
    failed++;
    console.error("\nprobe threw:", e);
  })
  .finally(async () => {
    // teardown (M22). student rows reference hero/pet + board + app_user; delete
    // them first, then the orphan hero/pet instances, then app_user (which
    // cascades onboarding + flow_log), then boards.
    const heroPetIds: { heroId: string | null; petId: string | null }[] = [];
    for (const b of boardIds) {
      await withBoard(b, async (tx) => {
        const rows = await tx.select({ heroId: student.heroId, petId: student.petId }).from(student).where(eq(student.boardId, b));
        heroPetIds.push(...rows);
        await tx.delete(student).where(eq(student.boardId, b));
      });
    }
    const heroes = heroPetIds.map((r) => r.heroId).filter((x): x is string => !!x);
    const pets = heroPetIds.map((r) => r.petId).filter((x): x is string => !!x);
    if (heroes.length) await db.delete(hero).where(inArray(hero.heroId, heroes));
    if (pets.length) await db.delete(pet).where(inArray(pet.petId, pets));
    if (userIds.length) await db.delete(appUser).where(inArray(appUser.id, userIds)); // cascades onboarding + flow_log
    if (boardIds.length) await db.delete(board).where(inArray(board.id, boardIds));

    console.log(`\n${passed} passed, ${failed} failed\n`);
    await queryClient.end();
    process.exit(failed === 0 ? 0 : 1);
  });
