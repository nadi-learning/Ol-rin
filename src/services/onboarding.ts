/**
 * Onboarding — the conversational welcome, rebuilt on the profile model (ID-3,
 * S127 redesign).
 *
 * 🔑 THE MODEL SHIFT. Onboarding used to store every answer as a COLUMN on a
 * board-scoped `onboarding` row. It no longer does. In the new identity model:
 *   - `onboarding` is a GLOBAL state-machine HEADER — `state` (the resume beat),
 *     `status`, `endAt` — keyed by the student's `app_user` profile id. One row
 *     per student, no board_id, no RLS. `onboarding_flow_log` is its append-only
 *     transition trail.
 *   - The ANSWERS land where they belong: class/pronoun/hero/pet on the STUDENT
 *     row (board-scoped, RLS), phone on `app_user`. hero/pet are per-student
 *     INSTANCES created here.
 *   - 🔑 `about_you` is where the OPERATIONAL `student` row is BORN (board_id +
 *     class + pronoun). Before it, a student is a board-less profile SHELL — which
 *     is exactly why onboarding runs on `authedProcedure`, NOT `protectedProcedure`:
 *     `requireMembership` now THROWS for a student with no `student` row, so the
 *     surface that CREATES that row cannot sit behind the gate that demands it.
 *
 * Runs on first LOGIN, not signup. Nobody is gated (S110): anyone who signs in
 * gets a student profile shell from `session.enter`, and onboarding turns that
 * shell into an operational student. It is a welcome, not a registration — it
 * can only ask, never reject.
 *
 * Load-bearing decisions kept from ONB-1:
 *  - D-ONB-1  WRITE-PER-ANSWER. Each beat commits + advances `state`, so closing
 *             the tab at beat N resumes at beat N.
 *  - FAIL-OPEN. getState never throws a student out of the product (router catch).
 *  - Tutors/parents/admins are EXEMPT, not forbidden (needsOnboarding:false).
 *
 * M11: the SET side a probe drives is the SET side the app drives — the beats
 * write through these functions, never a direct table insert in a probe.
 */
import { and, eq, sql } from "drizzle-orm";
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
import { appUser, hero, onboarding, onboardingFlowLog, pet, student } from "@b2c/kernel/schema";
import { ensureProfile } from "./membership";

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
const EMPTY_ANSWERS: OnboardingState["answers"] = {
  grade: null,
  pronoun: null,
  favCharacter: null,
  pet: null,
  phone: null,
};

/** The beat after `step`; `done` is terminal and is its own successor. */
export function nextStep(step: OnboardingStep): OnboardingStep {
  const i = ONBOARDING_STEPS.indexOf(step);
  if (i < 0) throw new OnboardingValidationError(`unknown step: ${step}`);
  return ONBOARDING_STEPS[Math.min(i + 1, ONBOARDING_STEPS.length - 1)]!;
}

/**
 * 🔑 Slice M (founder) — THE GRADES WE SUPPORT, not the grades the catalogue
 * happens to hold. A constant has no empty case, so no board can strand a student
 * on "— no classes set up yet —" with a button that never enables. The VALUES are
 * plain numbers ("9"), written to `student.class` and read back against
 * `subject.grade` where cbse's rows already say "9"/"10" — prettifying to
 * "Class 9" would silently unjoin every student from their subjects.
 */
export const SUPPORTED_GRADES: readonly string[] = ["8", "9", "10", "11"];

export async function listGradeOptions(_tx: Tx): Promise<string[]> {
  return [...SUPPORTED_GRADES];
}

/**
 * The student's `app_user` profile id, READ-ONLY (a tRPC query must not write).
 * Null if no student profile exists yet — treated by getState as "fresh start".
 */
async function readStudentProfileId(tx: Tx, email: string): Promise<string | null> {
  const [p] = await tx
    .select({ id: appUser.id })
    .from(appUser)
    .where(and(eq(appUser.email, email), eq(appUser.userType, "student")))
    .limit(1);
  return p?.id ?? null;
}

/**
 * Read-only. Assembles the flow state from the GLOBAL onboarding header + the
 * answers scattered across student / hero / pet / app_user. No row yet =
 * "needs it, start at the top" — nothing is provisioned by a read.
 *
 * `role` is the request's `x-profile`: a tutor/parent/admin is EXEMPT (a student
 * surface, so a no-op for them, not a 403). The student row is read under the
 * board-scoped tx, so its answers appear only for the board being onboarded into.
 */
export async function getState(
  tx: Tx,
  args: { email: string; boardId: string; role: string },
): Promise<OnboardingState> {
  // Exempt, not forbidden.
  if (args.role !== "student") {
    return { needsOnboarding: false, status: "completed", currentStep: "done", answers: EMPTY_ANSWERS };
  }

  const userId = await readStudentProfileId(tx, args.email);
  if (!userId) {
    return { needsOnboarding: true, status: "in_progress", currentStep: FIRST_STEP, answers: EMPTY_ANSWERS };
  }

  const [head] = await tx
    .select({ status: onboarding.status, state: onboarding.state })
    .from(onboarding)
    .where(eq(onboarding.userId, userId))
    .limit(1);

  const answers = await readAnswers(tx, userId);

  if (!head) {
    // A profile shell with no header: onboarding not started. (A seeded student
    // row with no header still reads "needs it" — seeds that want a done student
    // create the header too; that is a fixture, not the product's path.)
    return { needsOnboarding: true, status: "in_progress", currentStep: FIRST_STEP, answers };
  }

  return {
    needsOnboarding: head.status !== "completed",
    status: head.status as "in_progress" | "completed",
    // Resolve, don't cast: real rows can hold a retired step id (`pikachu`,
    // `lore`); a bare cast would hand the client a beat no copy answers to and
    // skip the student straight out of the story. Retired steps map forward.
    currentStep: resolveOnboardingStep(head.state),
    answers,
  };
}

/** The current answers, gathered from the tables they now live on. */
async function readAnswers(tx: Tx, userId: string): Promise<OnboardingState["answers"]> {
  const [s] = await tx
    .select({ class: student.class, pronoun: student.pronoun, heroId: student.heroId, petId: student.petId })
    .from(student)
    .where(eq(student.userId, userId))
    .limit(1);

  const [u] = await tx
    .select({ phone: appUser.phone })
    .from(appUser)
    .where(eq(appUser.id, userId))
    .limit(1);

  let favCharacter: string | null = null;
  if (s?.heroId) {
    const [h] = await tx.select({ type: hero.heroType }).from(hero).where(eq(hero.heroId, s.heroId)).limit(1);
    favCharacter = h?.type ?? null;
  }
  let petType: string | null = null;
  if (s?.petId) {
    const [pt] = await tx.select({ type: pet.petType }).from(pet).where(eq(pet.petId, s.petId)).limit(1);
    petType = pt?.type ?? null;
  }

  return {
    grade: s?.class ?? null,
    pronoun: s?.pronoun ?? null,
    favCharacter,
    pet: petType,
    phone: u?.phone ?? null,
  };
}

/**
 * Advance the header to `state` (upsert on the student profile) and append a
 * flow-log row. `onboarding` is GLOBAL, so this runs fine under the board tx.
 * On completion, `endAt` is stamped once and kept (COALESCE) — re-completing
 * must not rewrite when the student actually finished.
 */
async function advance(
  tx: Tx,
  userId: string,
  state: OnboardingStep,
  opts?: { status?: "in_progress" | "completed"; end?: boolean },
): Promise<void> {
  const status = opts?.status ?? "in_progress";
  const [row] = await tx
    .insert(onboarding)
    .values({ userId, state, status, ...(opts?.end ? { endAt: sql`now()` } : {}) })
    .onConflictDoUpdate({
      target: onboarding.userId,
      set: {
        state,
        status,
        ...(opts?.end ? { endAt: sql`COALESCE(${onboarding.endAt}, now())` } : {}),
      },
    })
    .returning({ id: onboarding.id });

  await tx.insert(onboardingFlowLog).values({ onboardingId: row!.id, state, status });
}

/**
 * The `about_you` beat: class + pronoun, committed together (one screen). 🔑 THIS
 * is where the operational `student` row is minted (board_id + class + pronoun) —
 * the profile shell becomes an enrolled student. Both fields are required + closed
 * sets. Idempotent (upsert on student.userId + one header per profile).
 */
export async function saveAboutYou(
  tx: Tx,
  args: { email: string; boardId: string; grade: string | null; pronoun: string | null },
): Promise<OnboardingState> {
  const { email, boardId } = args;
  const grade = args.grade?.trim() || null;
  const pronoun = args.pronoun?.trim() || null;

  if (!grade) throw new OnboardingValidationError("grade is required");
  const options = await listGradeOptions(tx);
  if (!options.includes(grade)) {
    throw new OnboardingValidationError(
      `grade '${grade}' is not a supported class (${options.join(", ") || "none"})`,
    );
  }
  if (!pronoun) throw new OnboardingValidationError("pronoun is required");
  if (!(PRONOUNS as readonly string[]).includes(pronoun)) {
    throw new OnboardingValidationError(`pronoun must be one of: ${PRONOUNS.join(", ")}`);
  }

  const { id: userId } = await ensureProfile(tx, { email, name: null, userType: "student" });

  // Mint (or update) the operational student row. board_id + class are notNull;
  // on re-answer keep the board and overwrite class/pronoun.
  await tx
    .insert(student)
    .values({ userId, boardId, class: grade, pronoun })
    .onConflictDoUpdate({ target: student.userId, set: { class: grade, pronoun } });

  await advance(tx, userId, nextStep("about_you"));
  return getState(tx, { email, boardId, role: "student" });
}

/**
 * Commit ONE beat and advance (D-ONB-1). `value` is null for a talk-only beat
 * (greet). fav_character → a per-student `hero` instance; pet → a per-student
 * `pet` instance; phone → `app_user.phone`. Idempotent: re-saving a beat updates
 * the same instance rather than creating a second.
 */
export async function saveStep(
  tx: Tx,
  args: { email: string; boardId: string; step: OnboardingStep; value: string | null },
): Promise<OnboardingState> {
  const { email, boardId, step } = args;
  const value = args.value?.trim() ? args.value.trim() : null;

  const takesAnswer = step in ONBOARDING_ANSWER_COLUMNS;
  if (!takesAnswer && value !== null) {
    throw new OnboardingValidationError(`step '${step}' does not take an answer`);
  }

  if (step === "about_you") {
    throw new OnboardingValidationError("use saveAboutYou() for the 'about_you' beat");
  }
  if (step === "done") {
    throw new OnboardingValidationError("use complete() to finish onboarding");
  }

  // Closed-set validation (chips). fav_character/pet: reject anything off-list so
  // a hand-rolled request can't introduce a pick Olórin has no line/art for.
  if (step === "fav_character") {
    if (!value) throw new OnboardingValidationError("fav_character is required");
    if (!(FAV_CHARACTERS as readonly string[]).includes(value)) {
      throw new OnboardingValidationError(`fav_character must be one of: ${FAV_CHARACTERS.join(", ")}`);
    }
  }
  if (step === "pet") {
    if (!value) throw new OnboardingValidationError("pet is required");
    if (!(PETS as readonly string[]).includes(value)) {
      throw new OnboardingValidationError(`pet must be one of: ${PETS.join(", ")}`);
    }
  }
  if (step === "phone") {
    if (!value) throw new OnboardingValidationError("phone is required");
    if (!isValidPhone(value)) {
      throw new OnboardingValidationError(
        "phone must be a 10-digit Indian mobile number starting with 6, 7, 8 or 9",
      );
    }
  }

  const { id: userId } = await ensureProfile(tx, { email, name: null, userType: "student" });

  // The answer-bearing beats all need the operational student row (born at
  // about_you). If it is absent the flow ran out of order — refuse loudly rather
  // than write a hero/pet nothing can own.
  if (step === "fav_character" || step === "pet") {
    const [s] = await tx
      .select({ heroId: student.heroId, petId: student.petId })
      .from(student)
      .where(eq(student.userId, userId))
      .limit(1);
    if (!s) throw new OnboardingValidationError("finish the about-you step first");

    if (step === "fav_character") {
      if (s.heroId) {
        await tx.update(hero).set({ heroType: value }).where(eq(hero.heroId, s.heroId));
      } else {
        const [h] = await tx
          .insert(hero)
          .values({ heroType: value, status: "active" })
          .returning({ heroId: hero.heroId });
        await tx.update(student).set({ heroId: h!.heroId }).where(eq(student.userId, userId));
      }
    } else {
      if (s.petId) {
        await tx.update(pet).set({ petType: value }).where(eq(pet.petId, s.petId));
      } else {
        const [pt] = await tx
          .insert(pet)
          .values({ petType: value, status: "active" })
          .returning({ petId: pet.petId });
        await tx.update(student).set({ petId: pt!.petId }).where(eq(student.userId, userId));
      }
    }
  } else if (step === "phone") {
    // phone → the student profile. app_user is global; the (email,phone,type)
    // unique cannot conflict here (it is the same row being updated).
    await tx.update(appUser).set({ phone: value }).where(eq(appUser.id, userId));
  }
  // greet: talk-only, nothing to write beyond the advance.

  await advance(tx, userId, nextStep(step));
  return getState(tx, { email, boardId, role: "student" });
}

/**
 * Finish. Flips the header to completed (the flag the FE gates on) and stamps
 * `endAt` once. Idempotent — completing twice keeps the first `endAt`.
 */
export async function complete(
  tx: Tx,
  args: { email: string; boardId: string },
): Promise<OnboardingState> {
  const { email, boardId } = args;
  const { id: userId } = await ensureProfile(tx, { email, name: null, userType: "student" });
  await advance(tx, userId, "done", { status: "completed", end: true });
  return getState(tx, { email, boardId, role: "student" });
}
