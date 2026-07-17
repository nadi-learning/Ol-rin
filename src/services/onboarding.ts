/**
 * Slice ONB-1 — the conversational welcome.
 *
 * Runs on first LOGIN, not signup. The platform is whitelist-gated
 * (services/membership.ts throws NOT_WHITELISTED for anyone not pre-invited),
 * so by the time a student reaches this flow we already know who they are and
 * which board they belong to. It is a welcome, not a registration — that is
 * why nothing here can reject a user, only ask them things.
 *
 * Load-bearing decisions realized here:
 *  - D-ONB-1  WRITE-PER-ANSWER. Each beat commits on answer and advances
 *             current_step, so closing the tab at beat 4 resumes at beat 4.
 *             A client-side buffer committed once at the end loses everything
 *             to a refresh — for a child on a phone that is the common case.
 *  - D-ONB-2  GRADE IS CHIPS DERIVED FROM REAL subject.grade. Free text yields
 *             "10th" / "X" / "tenth" and the one field with a consumer waiting
 *             becomes unparseable. The options are whatever the BOARD actually
 *             has, so they cannot drift from the catalogue.
 *  - FAIL-OPEN. getState never throws on a missing/º broken row: a student is
 *             never locked out of the product by a broken welcome. Same stance
 *             as D-AVAIL-1's `availIds: null` (G3 spirit).
 *
 * Tutors/parents/admins are EXEMPT, not forbidden — getState reports
 * needsOnboarding:false for them rather than erroring. Onboarding is a student
 * surface; a tutor hitting it should be a no-op, not a 403.
 */
import { and, eq, isNotNull, sql } from "drizzle-orm";
import type { PgTransaction } from "drizzle-orm/pg-core";
import {
  FAV_CHARACTERS,
  ONBOARDING_ANSWER_COLUMNS,
  ONBOARDING_STEPS,
  PRONOUNS,
  resolveOnboardingStep,
  type OnboardingStep,
} from "@b2c/kernel/contracts";
import { onboarding, subject } from "@b2c/kernel/schema";

type Tx = PgTransaction<any, any, any>;

export class OnboardingValidationError extends Error {
  readonly code = "ONBOARDING_INVALID";
  constructor(message: string) {
    super(message);
    this.name = "OnboardingValidationError";
  }
}

export type OnboardingState = {
  needsOnboarding: boolean;
  status: "in_progress" | "completed";
  currentStep: OnboardingStep;
  answers: {
    grade: string | null;
    pronoun: string | null;
    favCharacter: string | null;
    pet: string | null;
    phone: string | null;
  };
};

const FIRST_STEP: OnboardingStep = ONBOARDING_STEPS[0];

/** The beat after `step`; `done` is terminal and is its own successor. */
export function nextStep(step: OnboardingStep): OnboardingStep {
  const i = ONBOARDING_STEPS.indexOf(step);
  if (i < 0) throw new OnboardingValidationError(`unknown step: ${step}`);
  return ONBOARDING_STEPS[Math.min(i + 1, ONBOARDING_STEPS.length - 1)]!;
}

/**
 * The grade chips (D-ONB-2) — the DISTINCT grades this board's catalogue really
 * has. RLS scopes `subject` to the active board, so this is board-correct
 * without a board_id predicate.
 *
 * Sorted in JS, NOT by SQL `order by grade`: the column is TEXT, so Postgres
 * sorts it lexicographically and cbse's real values (9, 10) come back as
 * "10", "9" — a child would read chips counting backwards. A plain numeric sort
 * is not the fix either: grade is not always numeric (cambridge uses "IGCSE").
 * So: numeric grades first, in numeric order; anything else alphabetical after.
 */
export async function listGradeOptions(tx: Tx): Promise<string[]> {
  const rows = await tx.selectDistinct({ grade: subject.grade }).from(subject);
  return rows
    .map((r) => r.grade)
    .filter((g): g is string => Boolean(g))
    .sort((a, b) => {
      const na = Number(a);
      const nb = Number(b);
      const aNum = a.trim() !== "" && Number.isFinite(na);
      const bNum = b.trim() !== "" && Number.isFinite(nb);
      if (aNum && bNum) return na - nb;
      if (aNum) return -1;
      if (bNum) return 1;
      return a.localeCompare(b);
    });
}

/**
 * Read-only (a tRPC query must not write). No row yet = "needs it, start at the
 * top" rather than provisioning one — the row is born on the first ANSWER, so a
 * student who never engages leaves no trace.
 */
export async function getState(
  tx: Tx,
  args: { userId: string; boardId: string; role: string },
): Promise<OnboardingState> {
  // `school` (S90) and the fun-fact pair (S91) are deliberately absent: the
  // columns still exist, but the beats are gone and nothing reads them, so the
  // state stops carrying them. State tracks the FLOW, not the table.
  const empty = {
    grade: null,
    pronoun: null,
    favCharacter: null,
    pet: null,
    phone: null,
  };

  // Exempt, not forbidden.
  if (args.role !== "student") {
    return { needsOnboarding: false, status: "completed", currentStep: "done", answers: empty };
  }

  const [row] = await tx
    .select()
    .from(onboarding)
    .where(and(eq(onboarding.userId, args.userId), eq(onboarding.boardId, args.boardId)))
    .limit(1);

  if (!row) {
    return { needsOnboarding: true, status: "in_progress", currentStep: FIRST_STEP, answers: empty };
  }

  return {
    needsOnboarding: row.status !== "completed",
    status: row.status as "in_progress" | "completed",
    // S96 — resolve, don't cast. Real rows hold `pikachu` (S91–S95 walks) and
    // ONB-5 removed that beat; a bare cast would hand the client a step no beat
    // answers to, which the walker treats as "copy file doesn't know this" and
    // skips the student straight out of onboarding. Retired steps map to their
    // successor instead. The cast lied about a value the DB does not constrain.
    currentStep: resolveOnboardingStep(row.currentStep),
    answers: {
      grade: row.grade,
      pronoun: row.pronoun,
      favCharacter: row.favCharacter,
      pet: row.pet,
      phone: row.phone,
    },
  };
}

/**
 * S92 — the `about_you` beat: class + pronoun, committed together because they
 * are asked on one screen (founder). It gets its own mutation rather than
 * bending saveStep, which is one-step-one-column by design; generalising that
 * to n-columns for a single caller would be machinery nobody else wants.
 *
 * BOTH are required and both are closed sets: grade because it is the one
 * answer with a consumer waiting (D-ONB-2, subject filtering), pronoun because
 * every option — including "just use my name" — is one we authored.
 *
 * It writes both in ONE upsert: a half-written screen (class saved, pronoun
 * not) would resume with the beat already answered and the student unable to
 * finish it.
 */
export async function saveAboutYou(
  tx: Tx,
  args: { userId: string; boardId: string; grade: string | null; pronoun: string | null },
): Promise<OnboardingState> {
  const { userId, boardId } = args;
  const grade = args.grade?.trim() || null;
  const pronoun = args.pronoun?.trim() || null;

  if (!grade) throw new OnboardingValidationError("grade is required");
  const options = await listGradeOptions(tx);
  if (!options.includes(grade)) {
    throw new OnboardingValidationError(
      `grade '${grade}' is not a grade on this board (${options.join(", ") || "none"})`,
    );
  }

  if (!pronoun) throw new OnboardingValidationError("pronoun is required");
  if (!(PRONOUNS as readonly string[]).includes(pronoun)) {
    throw new OnboardingValidationError(`pronoun must be one of: ${PRONOUNS.join(", ")}`);
  }

  const advanced = nextStep("about_you");
  await tx
    .insert(onboarding)
    .values({ userId, boardId, currentStep: advanced, grade, pronoun })
    .onConflictDoUpdate({
      target: [onboarding.userId, onboarding.boardId],
      set: { currentStep: advanced, grade, pronoun },
    });

  return getState(tx, { userId, boardId, role: "student" });
}

/**
 * Commit ONE beat and advance (D-ONB-1). `value` is null for a talk-only beat
 * (greet/pikachu/lore) and for a skipped optional answer — both simply move
 * current_step on.
 *
 * Idempotent: re-saving the same step overwrites its answer rather than
 * inserting a second row (UNIQUE(user_id, board_id) + upsert), so a double-tap
 * or a retried request can't fork the flow.
 */
export async function saveStep(
  tx: Tx,
  args: {
    userId: string;
    boardId: string;
    step: OnboardingStep;
    value: string | null;
  },
): Promise<OnboardingState> {
  const { userId, boardId, step } = args;
  let value = args.value?.trim() ? args.value.trim() : null;

  const column = (ONBOARDING_ANSWER_COLUMNS as Record<string, string | undefined>)[step];

  if (!column && value !== null) {
    throw new OnboardingValidationError(`step '${step}' does not take an answer`);
  }

  // S92 — about_you writes TWO columns, so it cannot come through here: this
  // path would silently drop one of them. Loud rejection, not a partial write.
  if (step === "about_you") {
    throw new OnboardingValidationError("use saveAboutYou() for the 'about_you' beat");
  }

  // S91 — fav_character is chips, so it is closed-set and required. Two
  // reasons, and the second is the load-bearing one:
  //  - every id maps to a reaction we authored; an unknown id would leave
  //    Olórin with nothing to say and Pikachu shouting a raw string;
  //  - it is the flow's loudest echo. Rejecting anything off-list is what makes
  //    "Pikachu can only say something we wrote" true rather than hoped-for.
  // Unreachable from the UI (there is no text input left here) — this fires
  // only on a hand-rolled request, which is precisely when it should.
  if (step === "fav_character") {
    if (!value) throw new OnboardingValidationError("fav_character is required");
    if (!(FAV_CHARACTERS as readonly string[]).includes(value)) {
      throw new OnboardingValidationError(
        `fav_character must be one of: ${FAV_CHARACTERS.join(", ")}`,
      );
    }
  }

  // S91 — pet is required but deliberately NOT closed-set: the "something else"
  // chip opens a text field, and that free text IS the answer (it is what
  // Pikachu promises to arrange). Non-empty is the whole contract; isKnownPet()
  // downstream decides arrives-now vs 2-3-dayssss.
  if (step === "pet" && !value) {
    throw new OnboardingValidationError("pet is required");
  }

  if (step === "done") {
    throw new OnboardingValidationError("use complete() to finish onboarding");
  }

  const advanced = nextStep(step);
  const set: Record<string, unknown> = { currentStep: advanced };
  if (column) set[column] = value;

  await tx
    .insert(onboarding)
    .values({
      userId,
      boardId,
      currentStep: advanced,
      ...(column ? { [column]: value } : {}),
    })
    .onConflictDoUpdate({
      target: [onboarding.userId, onboarding.boardId],
      set,
    });

  return getState(tx, { userId, boardId, role: "student" });
}

/**
 * Finish. Flips the flag the FE gates on; the loader beat covers the latency.
 * Idempotent — completing twice keeps the FIRST completed_at (re-running the
 * flow should not rewrite when the student actually finished).
 */
export async function complete(
  tx: Tx,
  args: { userId: string; boardId: string },
): Promise<OnboardingState> {
  const { userId, boardId } = args;

  await tx
    .insert(onboarding)
    .values({ userId, boardId, currentStep: "done", status: "completed", completedAt: new Date() })
    .onConflictDoUpdate({
      target: [onboarding.userId, onboarding.boardId],
      set: {
        status: "completed",
        currentStep: "done",
        completedAt: sql`COALESCE(${onboarding.completedAt}, now())`,
      },
    });

  return getState(tx, { userId, boardId, role: "student" });
}
