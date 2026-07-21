/**
 * cutover_identity — the ID-0 clean-cutover tool (S128 identity redesign).
 *
 * WHAT: reshape the live DB from the OLD identity model into the NEW one by
 * throwing away the disposable test cohort and preserving ONLY the founder's
 * admin identity. Verified safe by S127's prod read: 7 real people (all <3 days
 * old), trivial cbse test evidence (~42 attempts / 2 mastery), the rest probe
 * litter → there is NO production student cohort to migrate. The 6 non-founder
 * testers re-onboard into the new shape; their evidence is dropped (accepted,
 * founder's call). CONTENT (chapters/questions/taxonomy) is PRESERVED — it is
 * the launch content, not test telemetry.
 *
 * WHEN: the destructive `--execute` runs ONCE, at slice ID-5, against a FRESH
 * prod backup, in the SAME deploy that ships the ID-1..ID-4 service rewrites (a
 * half-cut identity layer is the S121 breakage). Until then this runs DRY by
 * default and only reports what it WOULD do.
 *
 * 🔴 CONNECTS AS THE OWNER (MIGRATE_DATABASE_URL). That role BYPASSES RLS — the
 * whole point here: a cutover is a cross-tenant admin op, and per-board scoping
 * (withBoard) would hide exactly the rows we must clear. This is the ONE place
 * bypassing RLS is correct; every app path stays scoped. (Inverse of M29/M61 —
 * there a raw read fabricated a false zero; here we deliberately want the
 * global view.)
 *
 * Usage:
 *   bun scripts/cutover_identity.ts                 # DRY RUN (default) — counts only
 *   bun scripts/cutover_identity.ts --execute --yes-delete-nonfounder
 *                                                   # DESTRUCTIVE — ID-5 only
 */
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { generateReferralCode } from "@b2c/kernel/contracts";
import { env } from "../src/config/env";

// The founder — the ONE identity preserved. Distinct from spranav (S126-deleted,
// still on ADMIN_EMAILS pending a separate removal). Hard-coded on purpose: a
// cutover's preserve-set must not be reconfigurable by ambient context (M9).
const FOUNDER_EMAIL = "xxxx51263@gmail.com";

// Pure student-generated telemetry + authoring — ALL rows dropped (test data).
// NOT content. Order irrelevant: cleared as one owner-role statement set.
const EVIDENCE_WIPE = [
  "attempt_image",
  "attempt",
  "observation",
  "cross_concept_flag",
  "mastery_state",
  "mastery_history",
  "horizontal_skill_state",
  "student_chapter_insight",
  "student_subject_insight",
  "scheduling_state",
  "event_log",
  "transcript",
  "practice_session",
  "assessment_session",
  "assignment",
  "report",
  "pace_plan",
  "voice_session",
  "upload_token",
  "ai_call_log",
  "authoring_worker",
  "authoring_chat",
  "tutor_assignment",
  "onboarding_flow_log",
] as const;

// Identity — every row EXCEPT the founder's is dropped.
const IDENTITY_WIPE_NONFOUNDER = ["student", "tutor", "parent", "onboarding"] as const;

// Content — PRESERVED. Listed only to make the "what survives" set explicit in
// the dry-run report; never touched. `question.target_student_id` (private
// student questions) is the one content row that points at a student — those
// private rows are dropped (below); shared content (NULL target) survives.
const CONTENT_PRESERVE = [
  "board",
  "subject",
  "chapter",
  "topic",
  "sub_topic",
  "learning_objective",
  "content_unit",
  "content_version",
  "question",
  "horizontal_skill",
] as const;

const EXECUTE = process.argv.includes("--execute");
const CONFIRMED = process.argv.includes("--yes-delete-nonfounder");

const ownerUrl = env.MIGRATE_DATABASE_URL ?? env.DATABASE_URL;
const client = postgres(ownerUrl, { max: 1, prepare: false, onnotice: () => {} });
const db = drizzle(client);

async function count(table: string, where = ""): Promise<number> {
  const rows = (await db.execute(
    sql.raw(`SELECT count(*)::int AS n FROM "${table}" ${where}`),
  )) as unknown as Array<{ n: number }>;
  return rows[0]?.n ?? 0;
}

async function main() {
  console.log(
    `[cutover] owner conn: ${ownerUrl.replace(/:[^:@]+@/, ":***@")} (bypasses RLS — intentional)`,
  );
  console.log(`[cutover] mode: ${EXECUTE ? "🔴 EXECUTE (destructive)" : "DRY RUN (read-only)"}`);
  console.log(`[cutover] preserving founder: ${FOUNDER_EMAIL}\n`);

  // Who is the founder, in BOTH tables (app_user profile + better-auth user)?
  const founderProfiles = (await db.execute(sql`
    SELECT id, user_type, referral_code FROM app_user WHERE lower(email) = lower(${FOUNDER_EMAIL})
  `)) as unknown as Array<{ id: string; user_type: string; referral_code: string | null }>;
  const founderAuth = (await db.execute(sql`
    SELECT id FROM users WHERE lower(email) = lower(${FOUNDER_EMAIL})
  `)) as unknown as Array<{ id: string }>;

  console.log(`── FOUNDER (preserved) ──`);
  console.log(`  app_user profiles: ${founderProfiles.length}`);
  for (const p of founderProfiles) {
    console.log(`    · ${p.id}  user_type=${p.user_type}  referral=${p.referral_code ?? "∅"}`);
  }
  console.log(`  better-auth users: ${founderAuth.length}`);
  if (founderProfiles.length === 0) {
    console.log(
      `  ⚠️ NO founder app_user on this DB — expected on LOCAL (seed data). On PROD this must be ≥1 or the cutover would lock the founder out; --execute refuses if 0.`,
    );
  }

  // What would be wiped?
  console.log(`\n── EVIDENCE (ALL rows dropped — test telemetry) ──`);
  let evidenceTotal = 0;
  for (const t of EVIDENCE_WIPE) {
    const n = await count(t);
    evidenceTotal += n;
    if (n) console.log(`  ${t}: ${n}`);
  }
  console.log(`  evidence rows total: ${evidenceTotal}`);

  console.log(`\n── IDENTITY (non-founder rows dropped) ──`);
  const nonFounderProfiles = await count(
    "app_user",
    `WHERE lower(email) <> lower('${FOUNDER_EMAIL}')`,
  );
  const nonFounderAuth = await count("users", `WHERE lower(email) <> lower('${FOUNDER_EMAIL}')`);
  console.log(`  app_user (non-founder): ${nonFounderProfiles}`);
  console.log(`  users/better-auth (non-founder): ${nonFounderAuth}`);
  for (const t of IDENTITY_WIPE_NONFOUNDER) console.log(`  ${t} (all): ${await count(t)}`);
  const privateQ = await count("question", `WHERE target_student_id IS NOT NULL`);
  console.log(`  question WHERE target_student_id NOT NULL (private, dropped): ${privateQ}`);

  console.log(`\n── CONTENT (preserved) ──`);
  for (const t of CONTENT_PRESERVE) console.log(`  ${t}: ${await count(t)}`);

  if (!EXECUTE) {
    console.log(`\n[cutover] DRY RUN complete — nothing changed. Re-run with`);
    console.log(`  --execute --yes-delete-nonfounder   (ID-5, against a FRESH prod backup)`);
    await client.end();
    return;
  }

  // ── DESTRUCTIVE PATH (ID-5) ──────────────────────────────────────────────
  if (!CONFIRMED) {
    console.error(`\n🔴 --execute requires --yes-delete-nonfounder. Refusing.`);
    await client.end();
    process.exit(1);
  }
  if (founderProfiles.length === 0 || founderAuth.length === 0) {
    console.error(
      `\n🔴 Founder has no app_user OR no better-auth user on this DB — a cutover here would lock them out. Refusing. (Run on the box where the founder actually exists — i.e. PROD.)`,
    );
    await client.end();
    process.exit(1);
  }

  console.log(`\n[cutover] 🔴 EXECUTING in one transaction…`);
  await db.transaction(async (tx) => {
    // 1. All student-generated evidence + authoring (test telemetry).
    for (const t of EVIDENCE_WIPE) await tx.execute(sql.raw(`DELETE FROM "${t}"`));
    // 2. Private student questions (shared content — NULL target — survives).
    await tx.execute(sql`DELETE FROM question WHERE target_student_id IS NOT NULL`);
    // 3. Non-founder identity role rows (student/tutor/parent) + onboarding.
    //    These CASCADE from app_user, but delete explicitly so the counts are
    //    auditable and order-independent.
    for (const t of IDENTITY_WIPE_NONFOUNDER) {
      await tx.execute(
        sql.raw(
          `DELETE FROM "${t}" WHERE user_id IN (SELECT id FROM app_user WHERE lower(email) <> lower('${FOUNDER_EMAIL}'))`,
        ),
      );
    }
    // 4. Non-founder profiles, then non-founder better-auth identities (cascades
    //    accounts/sessions via their own FKs).
    await tx.execute(sql`DELETE FROM app_user WHERE lower(email) <> lower(${FOUNDER_EMAIL})`);
    await tx.execute(sql`DELETE FROM users WHERE lower(email) <> lower(${FOUNDER_EMAIL})`);
    // 5. Make the founder an ADMIN profile with a referral code (the new model's
    //    "DB role AND whitelist" gate). If they hold multiple profiles, promote
    //    the one row; extra non-admin founder profiles are left as-is (the
    //    founder legitimately re-onboards as a student later).
    await tx.execute(
      sql`UPDATE app_user SET user_type = 'admin' WHERE lower(email) = lower(${FOUNDER_EMAIL}) AND user_type <> 'admin' AND id = (SELECT id FROM app_user WHERE lower(email) = lower(${FOUNDER_EMAIL}) ORDER BY created_at LIMIT 1)`,
    );
    await tx.execute(
      sql`UPDATE app_user SET referral_code = ${generateReferralCode()} WHERE lower(email) = lower(${FOUNDER_EMAIL}) AND referral_code IS NULL`,
    );
  });

  // Verify: only the founder survives, content intact.
  const survivors = await count("app_user");
  const founderAdmin = await count(
    "app_user",
    `WHERE lower(email) = lower('${FOUNDER_EMAIL}') AND user_type = 'admin'`,
  );
  console.log(`\n[cutover] ✅ done. app_user rows now: ${survivors} · founder admin rows: ${founderAdmin}`);
  await client.end();
}

main().catch(async (err) => {
  console.error("[cutover] FAILED:", err);
  await client.end();
  process.exit(1);
});
