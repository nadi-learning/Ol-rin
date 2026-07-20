/**
 * Slice ONB-1 — the conversational welcome.
 *
 * Runs on first LOGIN, not signup. Nobody is gated (Slice C / S110): anyone who
 * signs in gets an app_user + a membership at 'student' from resolveMembership,
 * so by the time a student reaches this flow we already know who they are and
 * which board they belong to — not because they were pre-invited, but because
 * login itself created that identity. It is a welcome, not a registration —
 * that is why nothing here can reject a user, only ask them things.
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
  PETS,
  PRONOUNS,
  isValidPhone,
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
 * 🔑 Slice M (founder) — THE GRADES WE SUPPORT, NOT THE GRADES THE CATALOGUE
 * HAPPENS TO HOLD. This **supersedes D-ONB-2**, which derived the chips from
 * `selectDistinct(subject.grade)`.
 *
 * Why the derivation had to go, and it is not cosmetic. The founder's call is
 * that the product offers Class 9 and Class 10. Filtering the derived list to
 * those two would have been the small change — and it would have TRAPPED
 * students. Grade is required to finish onboarding on BOTH sides (the CTA at
 * `OnboardingPage.tsx:730` and `saveAboutYou` below, which validates against
 * this very function), and cambridge's catalogue grades are `IGCSE`/`Grade8`.
 * So a filtered derivation returns [] for cambridge, the row renders
 * "— no classes set up yet —", the button never enables, and that student can
 * never enter the app at all — not even to be told we are still setting it up.
 *
 * A constant set has no empty case, so no board can strand anyone. A board with
 * nothing published now behaves the way the founder asked for it to: the
 * student finishes onboarding, gets in, and meets the "still setting this up"
 * screen (`revision-landing.copy.ts`), which is a product state rather than a
 * dead control.
 *
 * ⚠️ THE VALUES ARE "9"/"10", NOT "Class 9". They are written to
 * `student_onboarding.grade` and read back against `subject.grade`, where
 * cbse's real rows already say "9"/"10". Prettifying the stored value would
 * silently unjoin every existing cbse student from their own subjects. The
 * label the child reads is the ROW's ("I'm in class"), so the chip only ever
 * has to carry the number.
 *
 * ⚠️ Pre-existing cambridge students hold `IGCSE` in that column. Nothing
 * re-validates a stored grade — the check below runs on WRITE only — so they
 * are unaffected until they re-answer the beat, at which point they re-pick.
 */
export const SUPPORTED_GRADES: readonly string[] = ["9", "10"];

export async function listGradeOptions(_tx: Tx): Promise<string[]> {
  return [...SUPPORTED_GRADES];
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

  // Slice L — pet is now CLOSED-SET, mirroring fav_character above. It was the
  // last free-text answer in the flow: S91 left it open because the "something
  // else" chip opened a text field and that free text WAS the answer (the
  // "2-3 dayssss" promise). Both are deleted, so an off-list pet can no longer
  // come from the UI — and, exactly as with fav_character, the value of
  // checking here is that a hand-rolled request cannot reintroduce a pet
  // Olórin has no line for and no art to hand over.
  //
  // ⚠️ This validates WRITES only. Rows written before this slice hold free
  // text and are read every day; loaderPetImg/loaderPetAlt/loaderSay fall back
  // to the stand-in owl for them. Do not "clean up" those fallbacks.
  if (step === "pet") {
    if (!value) throw new OnboardingValidationError("pet is required");
    if (!(PETS as readonly string[]).includes(value)) {
      throw new OnboardingValidationError(`pet must be one of: ${PETS.join(", ")}`);
    }
  }

  // Founder, this session — phone is REQUIRED and shaped. Until now it fell
  // through to the generic write below with no check on either side: the client
  // had no pattern and the server had no rule, so `saveStep(phone, "banana")`
  // stored "banana". The Skip button is gone, so a null no longer means "they
  // chose not to" — it means the request did not come from our form.
  //
  // Same closed-set discipline as fav_character/pet above, one layer stricter:
  // those reject values we have no ART for, this rejects values we cannot CALL.
  // `isValidPhone` is the kernel's, shared with the input and its submit button
  // (D-M2's lesson: one definition, or the two rules drift).
  if (step === "phone") {
    if (!value) throw new OnboardingValidationError("phone is required");
    if (!isValidPhone(value)) {
      throw new OnboardingValidationError(
        "phone must be a 10-digit Indian mobile number starting with 6, 7, 8 or 9",
      );
    }
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
