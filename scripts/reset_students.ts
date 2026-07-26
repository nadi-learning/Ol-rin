/**
 * reset_students — delete EVERYTHING local for one or more students, so a load
 * can be rehearsed from a known-empty start (S169).
 *
 * Built for the prod rehearsal: wipe the real students loaded from the hand-off,
 * re-import prod's own rows, then run the seed on top and watch what happens —
 * before any of it touches the production database.
 *
 * ⚠️ LOCAL ONLY. It refuses to run against a host that is not localhost. There is
 * no flag to override that: the whole point of this script is to be the thing you
 * can run without thinking, and a "--force-prod" escape hatch is how that stops
 * being true.
 *
 *   bun run reset:students -- --email a@b.com --email c@d.com
 *   bun run reset:students -- --email a@b.com --execute
 *
 * Deletes child-first because the FKs are RESTRICT, not CASCADE. The order below
 * is the FK order; changing it will surface as a foreign-key violation, not as
 * silent partial deletion.
 */
import { and, eq, inArray } from "drizzle-orm";
import { sql } from "drizzle-orm";
import {
  appUser,
  attempt,
  attemptImage,
  board,
  crossConceptFlag,
  masteryHistory,
  masterySnapshot,
  masteryState,
  observation,
  onboarding,
  pacePlan,
  parentCopy,
  practiceSession,
  schedulingState,
  student,
} from "@b2c/kernel/schema";
import { db, queryClient } from "../src/db/client";
import { withBoard } from "../src/db/with-board";

const argv = process.argv.slice(2);
const EXECUTE = argv.includes("--execute");
const EMAILS = argv.reduce<string[]>((acc, a, i) => (a === "--email" && argv[i + 1] ? [...acc, argv[i + 1]!] : acc), []);

/**
 * Every board-scoped (table, column) that points at a student profile, reached
 * by raw SQL because they are peripheral to this rehearsal.
 *
 * ⚠️ This list is NOT hand-written from the schema file — it came from querying
 * `pg_constraint` for every FK into `app_user`. Reading the Drizzle definitions
 * by eye missed `question.target_student_id` (a question authored FOR one named
 * student), and the delete failed on it. If this script ever fails on a foreign
 * key again, re-derive the list the same way rather than adding one line:
 *
 *   SELECT c.conrelid::regclass, a.attname FROM pg_constraint c
 *   JOIN unnest(c.conkey) k(attnum) ON true
 *   JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.attnum
 *   WHERE c.contype='f' AND c.confrelid='app_user'::regclass;
 */
const BOARD_SCOPED_REFS: Array<[table: string, column: string]> = [
  ["assessment_session", "student_id"],
  ["assessment_session", "tutor_id"],
  ["assignment", "student_id"],
  ["assignment", "tutor_id"],
  ["authoring_chat", "student_id"],
  ["authoring_chat", "tutor_id"],
  ["event_log", "student_id"],
  ["event_log", "tutor_id"],
  ["horizontal_skill_state", "student_id"],
  ["question", "target_student_id"],
  ["report", "student_id"],
  ["report", "tutor_id"],
  ["student_chapter_insight", "student_id"],
  ["student_subject_insight", "student_id"],
  ["transcript", "student_id"],
  ["tutor_assignment", "student_id"],
  ["tutor_assignment", "tutor_id"],
  ["voice_session", "student_id"],
];

/** Global (non-RLS) tables that point at a student profile. */
const GLOBAL_REFS: Array<[table: string, column: string]> = [
  ["ai_call_log", "user_id"],
  ["upload_token", "app_user_id"],
  ["parent_link_request", "parent_user_id"],
  ["parent_link_request", "resolved_by"],
  ["parent_link_request", "resolved_student_id"],
  ["referral", "referred_user_id"],
  ["referral", "referrer_user_id"],
  ["referral", "resolved_by"],
  ["referral_reward", "beneficiary_user_id"],
  ["referral_reward", "redeemed_by"],
];

function assertLocal() {
  const url = process.env.DATABASE_URL ?? "";
  const host = url.replace(/^.*@/, "").replace(/[:/].*$/, "");
  if (!["localhost", "127.0.0.1", ""].includes(host)) {
    throw new Error(`refusing to run against a non-local database (host: ${host || "?"})`);
  }
}

async function main() {
  assertLocal();
  if (EMAILS.length === 0) {
    console.error("usage: bun run reset:students -- --email <address> [--email …] [--execute]");
    process.exit(1);
  }
  console.log(`reset_students ${EXECUTE ? "(EXECUTE)" : "(dry run)"}\n`);

  const profiles = await db
    .select({ id: appUser.id, email: appUser.email, name: appUser.name })
    .from(appUser)
    .where(and(inArray(appUser.email, EMAILS), eq(appUser.userType, "student")));

  for (const e of EMAILS) {
    if (!profiles.some((p) => p.email === e)) console.log(`· ${e} — no student profile, nothing to delete`);
  }
  if (profiles.length === 0) {
    console.log("\nnothing to do.");
    await queryClient.end();
    return;
  }

  const ids = profiles.map((p) => p.id);
  const boards = await db.select({ id: board.id, slug: board.slug }).from(board);

  // COUNT FIRST, under each board, so the dry run reports real numbers rather
  // than an intention. RLS means a count outside a board claim reads 0 (M80).
  const counts: Record<string, number> = {};
  for (const b of boards) {
    await withBoard(b.id, async (tx) => {
      const add = async (label: string, n: number) => {
        if (n > 0) counts[label] = (counts[label] ?? 0) + n;
      };
      const one = async (label: string, q: Promise<{ n: unknown }[]>) =>
        add(label, Number((await q)[0]?.n ?? 0));
      await one(
        "attempt",
        tx.select({ n: sql`count(*)` }).from(attempt).where(inArray(attempt.appUserId, ids)),
      );
      await one(
        "practice_session",
        tx.select({ n: sql`count(*)` }).from(practiceSession).where(inArray(practiceSession.appUserId, ids)),
      );
      await one(
        "observation",
        tx.select({ n: sql`count(*)` }).from(observation).where(inArray(observation.studentId, ids)),
      );
      await one(
        "mastery_state",
        tx.select({ n: sql`count(*)` }).from(masteryState).where(inArray(masteryState.studentId, ids)),
      );
      await one(
        "mastery_snapshot",
        tx.select({ n: sql`count(*)` }).from(masterySnapshot).where(inArray(masterySnapshot.studentId, ids)),
      );
      await one(
        "cross_concept_flag",
        tx.select({ n: sql`count(*)` }).from(crossConceptFlag).where(inArray(crossConceptFlag.studentId, ids)),
      );
      await one(
        "pace_plan",
        tx.select({ n: sql`count(*)` }).from(pacePlan).where(inArray(pacePlan.appUserId, ids)),
      );
    });
  }

  console.log("profiles:");
  for (const p of profiles) console.log(`  · ${p.name ?? "?"} <${p.email}>  ${p.id}`);
  console.log("\nrows that will be deleted:");
  for (const [k, v] of Object.entries(counts).sort()) console.log(`  ${k.padEnd(20)} ${v}`);
  if (Object.keys(counts).length === 0) console.log("  (none — profile exists but carries no evidence)");

  if (!EXECUTE) {
    console.log("\nDRY RUN — nothing deleted. Re-run with --execute.");
    await queryClient.end();
    return;
  }

  for (const b of boards) {
    await withBoard(b.id, async (tx) => {
      // attempt_image → attempt is the only two-hop FK here.
      const attemptIds = (
        await tx.select({ id: attempt.id }).from(attempt).where(inArray(attempt.appUserId, ids))
      ).map((r) => r.id);
      if (attemptIds.length) {
        await tx.delete(attemptImage).where(inArray(attemptImage.attemptId, attemptIds));
      }
      // observation → attempt, so observations go before attempts.
      await tx.delete(observation).where(inArray(observation.studentId, ids));
      for (const [table, column] of BOARD_SCOPED_REFS) {
        await tx.execute(sql.raw(`DELETE FROM ${table} WHERE ${column} = ANY('{${ids.join(",")}}'::uuid[])`));
      }
      await tx.delete(attempt).where(inArray(attempt.appUserId, ids));
      await tx.delete(practiceSession).where(inArray(practiceSession.appUserId, ids));
      await tx.delete(crossConceptFlag).where(inArray(crossConceptFlag.studentId, ids));
      await tx.delete(masteryHistory).where(inArray(masteryHistory.studentId, ids));
      await tx.delete(masteryState).where(inArray(masteryState.studentId, ids));
      await tx.delete(masterySnapshot).where(inArray(masterySnapshot.studentId, ids));
      await tx.delete(schedulingState).where(inArray(schedulingState.studentId, ids));
      await tx.delete(pacePlan).where(inArray(pacePlan.appUserId, ids));
      // Any per-student copy override dies with the student it described.
      await tx.delete(parentCopy).where(inArray(parentCopy.studentId, ids));
      await tx.delete(student).where(inArray(student.userId, ids));
    });
  }

  // Global (non-RLS) tables last, then the profile itself.
  for (const [table, column] of GLOBAL_REFS) {
    await db.execute(sql.raw(`DELETE FROM ${table} WHERE ${column} = ANY('{${ids.join(",")}}'::uuid[])`));
  }
  await db.delete(onboarding).where(inArray(onboarding.userId, ids));
  await db.delete(appUser).where(inArray(appUser.id, ids));

  console.log(`\ndeleted ${profiles.length} student profile(s) and everything hanging off them.`);
  await queryClient.end();
}

main().catch(async (err) => {
  console.error("reset_students FAILED:", err);
  await queryClient.end();
  process.exit(1);
});
