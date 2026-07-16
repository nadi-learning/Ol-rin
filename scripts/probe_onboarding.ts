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
import {
  complete,
  getState,
  listGradeOptions,
  OnboardingValidationError,
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

  // ── 3. persists + advances ──────────────────────────────────────────────
  console.log("\n3. persists + advances");
  await withBoard(boardA!.id, async (tx) => {
    const st = await saveStep(tx, { ...S, step: "greet", value: null });
    check("talk-only beat advances greet → grade", st.currentStep === "grade", st.currentStep);
    const st2 = await saveStep(tx, { ...S, step: "grade", value: "Class_10" });
    check("grade persisted", st2.answers.grade === "Class_10", String(st2.answers.grade));
    check("advanced grade → school", st2.currentStep === "school", st2.currentStep);
  });

  // ── 4. resume mid-flow ──────────────────────────────────────────────────
  console.log("\n4. resume mid-flow");
  await withBoard(boardA!.id, async (tx) => {
    const st = await getState(tx, S);
    check("a fresh read resumes at the stored beat", st.currentStep === "school", st.currentStep);
    check("and still knows the earlier answer", st.answers.grade === "Class_10");
    check("still needs onboarding (not complete)", st.needsOnboarding === true);
  });

  // ── 5. grade must be a real board grade ─────────────────────────────────
  console.log("\n5. validation");
  await withBoard(boardA!.id, async (tx) => {
    const e = await expectThrow(() => saveStep(tx, { ...S, step: "grade", value: "10th" }));
    check(
      "a free-text grade ('10th') is rejected",
      e instanceof OnboardingValidationError,
      e ? e.message : "did not throw",
    );
    const e2 = await expectThrow(() => saveStep(tx, { ...S, step: "grade", value: null }));
    check("grade cannot be skipped (it is the one field with a consumer)", e2 instanceof OnboardingValidationError);
    const e3 = await expectThrow(() => saveStep(tx, { ...S, step: "greet", value: "hi" }));
    check("a talk-only beat refuses an answer", e3 instanceof OnboardingValidationError);
    const e4 = await expectThrow(() =>
      saveStep(tx, { ...S, step: "done" as any, value: null }),
    );
    check("'done' cannot be reached via saveStep", e4 instanceof OnboardingValidationError);
  });

  // ── 6. skip works ───────────────────────────────────────────────────────
  console.log("\n6. skip");
  await withBoard(boardA!.id, async (tx) => {
    const st = await saveStep(tx, { ...S, step: "school", value: null });
    check("optional beat skips with no answer", st.answers.school === null);
    check("and still advances school → fav_character", st.currentStep === "fav_character", st.currentStep);
    const blank = await saveStep(tx, { ...S, step: "fav_character", value: "   " });
    check("whitespace-only is stored as null, not '   '", blank.answers.favCharacter === null);
  });

  // ── 7. idempotent ───────────────────────────────────────────────────────
  console.log("\n7. idempotent");
  await withBoard(boardA!.id, async (tx) => {
    await saveStep(tx, { ...S, step: "grade", value: "Class_9" });
    await saveStep(tx, { ...S, step: "grade", value: "Class_9" });
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
