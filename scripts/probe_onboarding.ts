/**
 * probe_onboarding — Slice ONB-1, Stage 1 (the BE + the migration).
 *
 * Drives services/onboarding.ts through withBoard(), i.e. as the NON-superuser
 * app role with a real board claim, so RLS is actually binding (M11: a probe
 * whose precondition can't fail proves nothing — a superuser would pass this
 * vacuously).
 *
 *   1. needs-it            — no row → needsOnboarding, starting at the top
 *   2. persists + advances — an answer is stored AND current_step moves on
 *   3. resume mid-flow     — a fresh read returns the beat we stopped at
 *   4. grade is validated  — only a grade the BOARD really has (D-ONB-2)
 *   5. invalid step        — an unknown/talk-only misuse is rejected
 *   6. skip works          — an optional beat advances with no answer
 *   7. complete            — flips the flag; needsOnboarding goes false
 *   8. tutor/parent exempt — reported not-needed, NOT a 403
 *   9. RLS cross-board     — board A's row is invisible under board B
 *  10. idempotent          — re-saving/-completing can't fork or rewrite
 *
 * Unique per-run fixtures (M22) + full teardown in `finally`.
 */
import { and, eq, inArray } from "drizzle-orm";
import { appUser, board, onboarding, subject } from "@b2c/kernel/schema";
import { FAV_CHARACTERS, ONBOARDING_STEPS, isKnownPet } from "@b2c/kernel/contracts";
import {
  complete,
  getState,
  listGradeOptions,
  OnboardingValidationError,
  saveAboutYou,
  saveStep,
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
  console.log("\nprobe_onboarding\n");

  // ── fixtures: two boards (for the RLS leg), one student, one tutor ──────
  const [boardA] = await db
    .insert(board)
    .values({ slug: `onb-a-${tag}`, name: "Onb A" })
    .returning();
  const [boardB] = await db
    .insert(board)
    .values({ slug: `onb-b-${tag}`, name: "Onb B" })
    .returning();
  boardIds.push(boardA!.id, boardB!.id);

  const [student] = await db
    .insert(appUser)
    .values({ email: `onb-student-${tag}@example.com`, name: "Onb Student" })
    .returning();
  const [tutor] = await db
    .insert(appUser)
    .values({ email: `onb-tutor-${tag}@example.com`, name: "Onb Tutor" })
    .returning();
  userIds.push(student!.id, tutor!.id);

  // Real catalogue grades on board A — the chips must come from THESE.
  await withBoard(boardA!.id, async (tx) => {
    await tx.insert(subject).values([
      { boardId: boardA!.id, slug: `phys-${tag}`, name: "Physics", grade: "Class_10" },
      { boardId: boardA!.id, slug: `chem-${tag}`, name: "Chemistry", grade: "Class_10" },
      { boardId: boardA!.id, slug: `bio-${tag}`, name: "Biology", grade: "Class_9" },
    ]);
  });

  const S = { userId: student!.id, boardId: boardA!.id, role: "student" };

  // ── 1. needs-it ─────────────────────────────────────────────────────────
  console.log("1. needs-it");
  await withBoard(boardA!.id, async (tx) => {
    const st = await getState(tx, S);
    check("no row → needsOnboarding", st.needsOnboarding === true);
    check("starts at the first beat", st.currentStep === "greet", st.currentStep);
    check("read is non-provisioning (still no row)", true);
  });
  const preRows = await db
    .select()
    .from(onboarding)
    .where(eq(onboarding.userId, student!.id));
  check("getState really wrote nothing (a query must not write)", preRows.length === 0);

  // ── 2. grade chips come from the board's REAL subjects (D-ONB-2) ────────
  console.log("\n2. grade chips");
  await withBoard(boardA!.id, async (tx) => {
    const opts = await listGradeOptions(tx);
    check("distinct + sorted from subject.grade", JSON.stringify(opts) === JSON.stringify(["Class_10", "Class_9"]), JSON.stringify(opts));
  });
  await withBoard(boardB!.id, async (tx) => {
    const opts = await listGradeOptions(tx);
    check("control: board B has none of A's grades (RLS scopes the chips)", opts.length === 0, JSON.stringify(opts));
  });

  // ── 3. persists + advances (S92: the duo beat) ──────────────────────────
  console.log("\n3. persists + advances");
  await withBoard(boardA!.id, async (tx) => {
    const st = await saveStep(tx, { ...S, step: "greet", value: null });
    check("talk-only beat advances greet → about_you", st.currentStep === "about_you", st.currentStep);
    const st2 = await saveAboutYou(tx, { ...S, grade: "Class_10", pronoun: "she" });
    check("grade persisted", st2.answers.grade === "Class_10", String(st2.answers.grade));
    check("pronoun persisted in the SAME write", st2.answers.pronoun === "she", String(st2.answers.pronoun));
    check("advanced about_you → fav_character", st2.currentStep === "fav_character", st2.currentStep);
  });

  // ── 4. resume mid-flow ──────────────────────────────────────────────────
  console.log("\n4. resume mid-flow");
  await withBoard(boardA!.id, async (tx) => {
    const st = await getState(tx, S);
    check("a fresh read resumes at the stored beat", st.currentStep === "fav_character", st.currentStep);
    check("and still knows the earlier answer", st.answers.grade === "Class_10");
    check("still needs onboarding (not complete)", st.needsOnboarding === true);
  });

  // ── 5. validation ───────────────────────────────────────────────────────
  console.log("\n5. validation");
  await withBoard(boardA!.id, async (tx) => {
    const e = await expectThrow(() => saveAboutYou(tx, { ...S, grade: "10th", pronoun: "he" }));
    check(
      "a free-text grade ('10th') is rejected",
      e instanceof OnboardingValidationError,
      e ? e.message : "did not throw",
    );
    const e2 = await expectThrow(() => saveAboutYou(tx, { ...S, grade: null, pronoun: "he" }));
    check("grade cannot be skipped (it is the one field with a consumer)", e2 instanceof OnboardingValidationError);

    // S92 — pronoun is closed-set + required. 'name' (use my name) is the
    // dignified way through, so there is no reason to allow a null.
    const eP = await expectThrow(() => saveAboutYou(tx, { ...S, grade: "Class_10", pronoun: null }));
    check("pronoun cannot be skipped ('name' is the opt-out)", eP instanceof OnboardingValidationError);
    const eP2 = await expectThrow(() => saveAboutYou(tx, { ...S, grade: "Class_10", pronoun: "male" }));
    check(
      "pronoun rejects a value outside the contract",
      eP2 instanceof OnboardingValidationError,
      eP2 ? eP2.message : "did not throw",
    );

    // The multi-answer beat must NOT be reachable through the single-answer
    // path — that would write one column and silently drop the other.
    const eDuo = await expectThrow(() =>
      saveStep(tx, { ...S, step: "about_you", value: "Class_10" }),
    );
    check(
      "saveStep('about_you') is rejected — it writes two columns",
      eDuo instanceof OnboardingValidationError,
      eDuo ? eDuo.message : "did not throw",
    );

    const e3 = await expectThrow(() => saveStep(tx, { ...S, step: "greet", value: "hi" }));
    check("a talk-only beat refuses an answer", e3 instanceof OnboardingValidationError);
    const e4 = await expectThrow(() =>
      saveStep(tx, { ...S, step: "done" as any, value: null }),
    );
    check("'done' cannot be reached via saveStep", e4 instanceof OnboardingValidationError);

    // S91 — fav_character is chips now, so it is closed-set. This is the claim
    // that makes "Pikachu can only shout something we wrote" true: the id he
    // echoes cannot be a string a student typed.
    const e5 = await expectThrow(() =>
      saveStep(tx, { ...S, step: "fav_character", value: "No movie" }),
    );
    check(
      "fav_character rejects free text ('No movie' — the S90 bug, at the root)",
      e5 instanceof OnboardingValidationError,
      e5 ? e5.message : "did not throw",
    );
    const e6 = await expectThrow(() =>
      saveStep(tx, { ...S, step: "fav_character", value: null }),
    );
    check("fav_character cannot be skipped (every chip is an answer)", e6 instanceof OnboardingValidationError);

    // S91 — pet is required but NOT closed-set: 'something else' is a real
    // answer. Both halves of that need asserting, or a later tightening
    // silently kills the hatch.
    const e7 = await expectThrow(() => saveStep(tx, { ...S, step: "pet", value: null }));
    check("pet is required", e7 instanceof OnboardingValidationError);
  });

  // ── 5b. the removed beats are really gone (S90, S91) ────────────────────
  // A deletion nobody asserts is a deletion that quietly comes back. These
  // beats must be unreachable as STEPS even though their columns still exist.
  console.log("\n5b. removed beats");
  for (const gone of ["school", "fun_fact_about", "fun_fact", "grade"]) {
    check(`'${gone}' is not in ONBOARDING_STEPS`, !(ONBOARDING_STEPS as readonly string[]).includes(gone));
  }
  await withBoard(boardA!.id, async (tx) => {
    const e = await expectThrow(() => saveStep(tx, { ...S, step: "school" as any, value: "DPS" }));
    check(
      "saveStep('school') is rejected — the beat no longer exists",
      e instanceof OnboardingValidationError,
      e ? e.message : "did not throw",
    );
    const e2 = await expectThrow(() =>
      saveStep(tx, { ...S, step: "fun_fact" as any, value: "Ravi solves cubes" }),
    );
    check(
      "saveStep('fun_fact') is rejected — S91 removed the beat",
      e2 instanceof OnboardingValidationError,
      e2 ? e2.message : "did not throw",
    );
    const e3 = await expectThrow(() =>
      saveStep(tx, { ...S, step: "fun_fact_about" as any, value: "friend" }),
    );
    check("saveStep('fun_fact_about') is rejected — S91 removed the beat", e3 instanceof OnboardingValidationError);
  });

  // ── 5c. the flow's shape (S91) ──────────────────────────────────────────
  // The ORDER is the contract the FE copy is keyed by and the server resumes
  // on. Asserting it here is what stops a reorder from silently teleporting a
  // half-done student.
  console.log("\n5c. the beat order");
  check(
    "ONBOARDING_STEPS is the S91 flow",
    JSON.stringify(ONBOARDING_STEPS) ===
      JSON.stringify(["greet", "about_you", "fav_character", "pikachu", "pet", "phone", "lore", "done"]),
    JSON.stringify(ONBOARDING_STEPS),
  );
  check("every FAV_CHARACTERS id has copy (no chip can be speechless)", FAV_CHARACTERS.length === 6);

  // ── 6. the S91 walk: chips, the pet, and the skip ───────────────────────
  console.log("\n6. chips, pet, skip");
  await withBoard(boardA!.id, async (tx) => {
    // Whitespace-only is now a REJECT, not a null: fav_character is required.
    const blankErr = await expectThrow(() => saveStep(tx, { ...S, step: "fav_character", value: "   " }));
    check("whitespace-only fav_character is rejected, not stored blank", blankErr instanceof OnboardingValidationError);

    const ch = await saveStep(tx, { ...S, step: "fav_character", value: "iron_man" });
    check("a chip id persists", ch.answers.favCharacter === "iron_man", String(ch.answers.favCharacter));
    check("advanced fav_character → pikachu", ch.currentStep === "pikachu", ch.currentStep);

    await saveStep(tx, { ...S, step: "pikachu", value: null });

    // The pet: a known id, then the free-text hatch overwriting it.
    const known = await saveStep(tx, { ...S, step: "pet", value: "owl" });
    check("a known pet persists", known.answers.pet === "owl", String(known.answers.pet));
    check("advanced pet → phone", known.currentStep === "phone", known.currentStep);
    check("isKnownPet('owl') → it arrives now", isKnownPet(known.answers.pet) === true);

    const custom = await saveStep(tx, { ...S, step: "pet", value: "llama" });
    check("a CUSTOM pet is allowed (the 'something else' hatch)", custom.answers.pet === "llama", String(custom.answers.pet));
    check("isKnownPet('llama') → false, so it gets the 2-3 dayssss line", isKnownPet(custom.answers.pet) === false);

    const skipped = await saveStep(tx, { ...S, step: "phone", value: null });
    check("optional phone skips with no answer", skipped.answers.phone === null);
    check("and still advances phone → lore", skipped.currentStep === "lore", skipped.currentStep);
    check("the pet survives the skip", skipped.answers.pet === "llama");
  });

  // ── 7. idempotent ───────────────────────────────────────────────────────
  console.log("\n7. idempotent");
  await withBoard(boardA!.id, async (tx) => {
    await saveAboutYou(tx, { ...S, grade: "Class_9", pronoun: "name" });
    await saveAboutYou(tx, { ...S, grade: "Class_9", pronoun: "name" });
    const rows = await tx
      .select()
      .from(onboarding)
      .where(and(eq(onboarding.userId, student!.id), eq(onboarding.boardId, boardA!.id)));
    check("re-saving overwrites, never forks a second row", rows.length === 1, `${rows.length} rows`);
    check("the overwrite took", rows[0]!.grade === "Class_9");
  });

  // ── 8. RLS cross-board ──────────────────────────────────────────────────
  console.log("\n8. RLS");
  await withBoard(boardB!.id, async (tx) => {
    const rows = await tx
      .select()
      .from(onboarding)
      .where(eq(onboarding.userId, student!.id));
    check("board A's onboarding row is INVISIBLE under board B", rows.length === 0, `${rows.length} rows`);
    const st = await getState(tx, { ...S, boardId: boardB!.id });
    check("→ so board B reports a fresh start, not A's progress", st.currentStep === "greet");
  });

  // ── 9. tutor/parent exempt ──────────────────────────────────────────────
  console.log("\n9. exempt roles");
  await withBoard(boardA!.id, async (tx) => {
    for (const role of ["tutor", "parent", "admin"]) {
      const st = await getState(tx, { userId: tutor!.id, boardId: boardA!.id, role });
      check(`${role} → needsOnboarding false (exempt, not 403)`, st.needsOnboarding === false);
    }
  });

  // ── 10. complete ────────────────────────────────────────────────────────
  console.log("\n10. complete");
  let firstCompletedAt: Date | null = null;
  await withBoard(boardA!.id, async (tx) => {
    const st = await complete(tx, { userId: student!.id, boardId: boardA!.id });
    check("complete flips the flag", st.needsOnboarding === false);
    check("status is completed", st.status === "completed");
    check("current_step lands on 'done'", st.currentStep === "done", st.currentStep);
    check("answers survive completion", st.answers.grade === "Class_9");
    const [row] = await tx
      .select()
      .from(onboarding)
      .where(eq(onboarding.userId, student!.id));
    firstCompletedAt = row!.completedAt;
    check("completed_at is stamped", firstCompletedAt !== null);
  });

  await new Promise((r) => setTimeout(r, 50));
  await withBoard(boardA!.id, async (tx) => {
    await complete(tx, { userId: student!.id, boardId: boardA!.id });
    const [row] = await tx
      .select()
      .from(onboarding)
      .where(eq(onboarding.userId, student!.id));
    check(
      "completing twice keeps the FIRST completed_at",
      row!.completedAt?.getTime() === (firstCompletedAt as Date | null)?.getTime(),
    );
  });
}

main()
  .catch((e) => {
    failed++;
    console.error("\nprobe threw:", e);
  })
  .finally(async () => {
    // teardown (M22) — onboarding/subject first: they reference board + app_user.
    for (const b of boardIds) {
      await withBoard(b, async (tx) => {
        await tx.delete(onboarding).where(eq(onboarding.boardId, b));
        await tx.delete(subject).where(eq(subject.boardId, b));
      });
    }
    if (userIds.length) await db.delete(appUser).where(inArray(appUser.id, userIds));
    if (boardIds.length) await db.delete(board).where(inArray(board.id, boardIds));

    console.log(`\n${passed} passed, ${failed} failed\n`);
    await queryClient.end();
    process.exit(failed === 0 ? 0 : 1);
  });
