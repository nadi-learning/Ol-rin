/**
 * cutover_identity — the clean-cutover tool (S128 identity redesign; S137 scoped).
 *
 * WHAT: reshape the live DB from the OLD identity model into the NEW one by
 * dropping the disposable test cohort and preserving a SMALL keep-set:
 *   - the FOUNDER (promoted to admin), and
 *   - the one REAL tutor↔student relationship on prod: KIAN (student) + PRANAV
 *     (tutor), together with Kian's authored-content + assessment chain (the 18
 *     private questions, the blocked assignment, its practice sessions, attempts
 *     and Stage-1 observations — repaired in S136 so Pranav can run Stage-2).
 *
 * Everyone else (probe litter + a couple of junk signups + the other testers who
 * carry no content) is dropped; they re-onboard on the new model by signing in
 * with Google. Their evidence is dropped (accepted — test telemetry). CONTENT
 * (chapters/questions/taxonomy) is PRESERVED.
 *
 * WHY SCOPED (not "preserve founder only"): keeping Kian's content means keeping
 * Kian's + Pranav's identities (his content FKs to them) AND keeping their
 * evidence rows. Evidence tables reference the student with NO onDelete cascade
 * (default `no action` = restrict), so the wipe must be EXPLICIT and CHILD-FIRST,
 * and scoped to rows OWNED BY DROPPED users. A row owned by any preserved user
 * (founder / Kian / Pranav) is never deleted; the final app_user delete then
 * fails LOUDLY (→ restore from the pre-window pg_dump) if any reference was
 * missed — never silent corruption.
 *
 * After this runs, `scripts/backfill_preserved.ts` rebuilds Kian's new-model
 * student/hero/pet rows (+ Pranav's tutor row); the operational role tables that
 * 0037 created empty stay empty until then.
 *
 * WHEN: the destructive `--execute` runs ONCE, at slice ID-5, against a FRESH
 * prod backup, in the SAME deploy that ships the ID-1..ID-4 service rewrites.
 * Until then it runs DRY by default and only reports what it WOULD do.
 *
 * 🔴 CONNECTS AS THE OWNER (MIGRATE_DATABASE_URL). That role BYPASSES RLS — the
 * whole point: a cutover is a cross-tenant admin op, and per-board scoping would
 * hide exactly the rows we must clear. This is the ONE place bypassing RLS is
 * correct; every app path stays scoped.
 *
 * Usage:
 *   bun scripts/cutover_identity.ts                 # DRY RUN (default) — counts only
 *   bun scripts/cutover_identity.ts --execute --yes-delete-nonpreserved
 *                                                   # DESTRUCTIVE — ID-5 only
 */
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { generateReferralCode } from "@b2c/kernel/contracts";
import { env } from "../src/config/env";

// ── The preserve-set (S137, founder-confirmed) ────────────────────────────────
// Hard-coded on purpose: a cutover's keep-set must not be reconfigurable by
// ambient context (M9). All lower-cased; matched case-insensitively.
const FOUNDER_EMAIL = "xxxx51263@gmail.com";
const KIAN_EMAIL = "kianjibo500@gmail.com"; // student (cbse) — content owner
const PRANAV_EMAIL = "spranav.iitkgp@gmail.com"; // tutor (cbse) — authored Kian's set
const PRESERVE_EMAILS = [FOUNDER_EMAIL, KIAN_EMAIL, PRANAV_EMAIL] as const;

// SQL fragment: the app_user ids we KEEP. Every scoped delete removes rows whose
// owning app_user is NOT in this set (NULL owner also removed for NOT-NULL owner
// columns; for NULLABLE owner columns NULL is LEFT ALONE — see note on each — to
// avoid deleting a row a kept child still references).
const EMAIL_LIST = PRESERVE_EMAILS.map((e) => `'${e}'`).join(",");
const PRESERVE_IDS = `(SELECT id FROM app_user WHERE lower(email) IN (${EMAIL_LIST}))`;
// Kian's app_user id as a scalar subquery. EVIDENCE is kept for KIAN ONLY (his
// content chain) — founder is an admin + Pranav a tutor; neither needs student
// telemetry, and keeping theirs only creates dangling actor-refs to dropped users.
const KIAN_ID = `(SELECT id FROM app_user WHERE lower(email) = lower('${KIAN_EMAIL}'))`;

// ── The scoped evidence wipe, in CHILD-FIRST order ────────────────────────────
// Each step deletes rows OWNED BY DROPPED users. Order matters: a table must be
// cleared BEFORE any table it references via a restrict FK. Owner column names
// VARY (student_id vs app_user_id vs a parent join) — do not assume.
//
// NULLABLE-owner tables (transcript, event_log, authoring_chat) use plain
// `NOT IN` so NULL-owner rows are KEPT: a kept Kian child could reference one,
// and a few null-owner litter rows are harmless. ai_call_log is skipped entirely
// (user_id is ON DELETE SET NULL — it never blocks the app_user delete).
// EVIDENCE steps keep KIAN ONLY (`IS DISTINCT FROM ${KIAN_ID}` also drops NULL
// owners). CONTENT steps (question/question_image) keep SHARED (null target) +
// any preserved-user-targeted rows. Child tables join to their parent.
type Step = { table: string; where: string; note?: string };
const SCOPED_DELETES: Step[] = [
  // children of attempt / question first
  { table: "attempt_image", where: `WHERE attempt_id IN (SELECT id FROM attempt WHERE app_user_id IS DISTINCT FROM ${KIAN_ID})` },
  { table: "question_image", where: `WHERE question_id IN (SELECT id FROM question WHERE target_student_id IS NOT NULL AND target_student_id NOT IN ${PRESERVE_IDS})`, note: "keep shared + preserved-targeted" },
  // rows that reference observation / assessment_session
  { table: "cross_concept_flag", where: `WHERE student_id IS DISTINCT FROM ${KIAN_ID}` },
  // observation references attempt + transcript → clear before them
  { table: "observation", where: `WHERE student_id IS DISTINCT FROM ${KIAN_ID}` },
  { table: "voice_session", where: `WHERE student_id IS DISTINCT FROM ${KIAN_ID}`, note: "references transcript" },
  { table: "mastery_history", where: `WHERE student_id IS DISTINCT FROM ${KIAN_ID}`, note: "references event_log" },
  { table: "assessment_session", where: `WHERE student_id IS DISTINCT FROM ${KIAN_ID}`, note: "references assignment" },
  // attempt references practice_session + question → clear before them
  { table: "attempt", where: `WHERE app_user_id IS DISTINCT FROM ${KIAN_ID}` },
  { table: "upload_token", where: `WHERE app_user_id IS DISTINCT FROM ${KIAN_ID}`, note: "references practice_session + question" },
  // leaf-ish student-owned state
  { table: "mastery_state", where: `WHERE student_id IS DISTINCT FROM ${KIAN_ID}` },
  { table: "horizontal_skill_state", where: `WHERE student_id IS DISTINCT FROM ${KIAN_ID}` },
  { table: "student_chapter_insight", where: `WHERE student_id IS DISTINCT FROM ${KIAN_ID}` },
  { table: "student_subject_insight", where: `WHERE student_id IS DISTINCT FROM ${KIAN_ID}` },
  { table: "scheduling_state", where: `WHERE student_id IS DISTINCT FROM ${KIAN_ID}` },
  { table: "report", where: `WHERE student_id IS DISTINCT FROM ${KIAN_ID}` },
  { table: "pace_plan", where: `WHERE app_user_id IS DISTINCT FROM ${KIAN_ID}` },
  // now-unreferenced parents
  { table: "transcript", where: `WHERE student_id IS DISTINCT FROM ${KIAN_ID}` },
  { table: "event_log", where: `WHERE student_id IS DISTINCT FROM ${KIAN_ID}` },
  { table: "practice_session", where: `WHERE app_user_id IS DISTINCT FROM ${KIAN_ID}` },
  { table: "assignment", where: `WHERE student_id IS DISTINCT FROM ${KIAN_ID}` },
  // authoring (not content; keep only Kian's chats — their tutor_id is Pranav, preserved)
  { table: "authoring_worker", where: `WHERE chat_id IN (SELECT id FROM authoring_chat WHERE student_id IS DISTINCT FROM ${KIAN_ID})` },
  { table: "authoring_chat", where: `WHERE student_id IS DISTINCT FROM ${KIAN_ID}` },
  // private questions for non-preserved students (shared/NULL-target survive = content)
  { table: "question", where: `WHERE target_student_id IS NOT NULL AND target_student_id NOT IN ${PRESERVE_IDS}`, note: "keep shared + preserved-targeted" },
  // new-model ledgers 0037 created empty (belt-and-braces if a probe seeded them)
  { table: "tutor_assignment", where: `WHERE student_id IS DISTINCT FROM ${KIAN_ID} OR tutor_id NOT IN ${PRESERVE_IDS}` },
  // new-model role tables — EMPTY on prod at cutover (backfill runs AFTER), but
  // clear non-preserved rows so the app_user delete never trips student.tutor_id
  // etc. (children of app_user; delete before it).
  { table: "student", where: `WHERE user_id NOT IN ${PRESERVE_IDS}` },
  { table: "tutor", where: `WHERE user_id NOT IN ${PRESERVE_IDS}` },
  { table: "parent", where: `WHERE user_id NOT IN ${PRESERVE_IDS}` },
  // onboarding cascades from app_user anyway, but clear explicitly for auditable counts
  { table: "onboarding", where: `WHERE user_id NOT IN ${PRESERVE_IDS}` },
];

// Defensive: NULL any nullable actor-reference on a SURVIVING row that points at
// a to-be-dropped app_user, so the app_user delete can't trip a restrict FK.
// On prod these are ~no-ops (Kian's kept chain references only Kian + Pranav),
// but they make the cutover correct regardless of what testing left behind.
const DEFENSIVE_NULLS: string[] = [
  `UPDATE observation SET overridden_by = NULL WHERE overridden_by IS NOT NULL AND overridden_by NOT IN ${PRESERVE_IDS}`,
  `UPDATE cross_concept_flag SET addressed_by = NULL WHERE addressed_by IS NOT NULL AND addressed_by NOT IN ${PRESERVE_IDS}`,
  `UPDATE event_log SET tutor_id = NULL WHERE tutor_id IS NOT NULL AND tutor_id NOT IN ${PRESERVE_IDS}`,
  `UPDATE student SET tutor_id = NULL WHERE tutor_id IS NOT NULL AND tutor_id NOT IN ${PRESERVE_IDS}`,
  `UPDATE student SET parent_id = NULL WHERE parent_id IS NOT NULL AND parent_id NOT IN ${PRESERVE_IDS}`,
];

// onboarding_flow_log has no app_user owner (keyed to onboarding). It cascades
// when its onboarding row is deleted, so it needs no scoped step. ai_call_log is
// ON DELETE SET NULL → never blocks the app_user delete.

// Content — PRESERVED. Listed only to make "what survives" explicit in the report.
const CONTENT_PRESERVE = [
  "board", "subject", "chapter", "topic", "sub_topic", "learning_objective",
  "content_unit", "content_version", "question", "horizontal_skill",
] as const;

const EXECUTE = process.argv.includes("--execute");
const CONFIRMED = process.argv.includes("--yes-delete-nonpreserved");

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
  console.log(`[cutover] owner conn: ${ownerUrl.replace(/:[^:@]+@/, ":***@")} (bypasses RLS — intentional)`);
  console.log(`[cutover] mode: ${EXECUTE ? "🔴 EXECUTE (destructive)" : "DRY RUN (read-only)"}`);
  console.log(`[cutover] preserve-set: ${PRESERVE_EMAILS.join(", ")}\n`);

  // Resolve the preserved profiles so the founder can eyeball ids before executing.
  const preserved = (await db.execute(sql`
    SELECT id, lower(email) AS email, user_type FROM app_user
    WHERE lower(email) IN (${sql.join(PRESERVE_EMAILS.map((e) => sql`${e}`), sql`, `)})
    ORDER BY email, user_type
  `)) as unknown as Array<{ id: string; email: string; user_type: string }>;
  console.log(`── PRESERVED PROFILES (${preserved.length}) ──`);
  for (const p of preserved) console.log(`    · ${p.email}  ${p.user_type}  ${p.id}`);
  const has = (email: string) => preserved.some((p) => p.email === email);
  for (const e of PRESERVE_EMAILS) {
    if (!has(e)) console.log(`  ⚠️ ${e} has NO app_user on this DB (expected on LOCAL; on PROD this must exist).`);
  }

  // Scoped evidence wipe — per-table DROP vs KEEP counts.
  console.log(`\n── SCOPED WIPE (rows owned by DROPPED users) ──`);
  let dropTotal = 0;
  for (const s of SCOPED_DELETES) {
    const drop = await count(s.table, s.where);
    const total = await count(s.table);
    dropTotal += drop;
    if (total) console.log(`  ${s.table}: drop ${drop} / keep ${total - drop}${s.note ? `   (${s.note})` : ""}`);
  }
  console.log(`  rows to drop total: ${dropTotal}`);

  // Identity.
  console.log(`\n── IDENTITY ──`);
  const dropProfiles = await count("app_user", `WHERE id NOT IN ${PRESERVE_IDS}`);
  const keepProfiles = await count("app_user", `WHERE id IN ${PRESERVE_IDS}`);
  const dropAuth = await count("users", `WHERE lower(email) NOT IN (${EMAIL_LIST})`);
  console.log(`  app_user: drop ${dropProfiles} / keep ${keepProfiles}`);
  console.log(`  users/better-auth: drop ${dropAuth}`);

  console.log(`\n── CONTENT (preserved) ──`);
  for (const t of CONTENT_PRESERVE) console.log(`  ${t}: ${await count(t)}`);

  if (!EXECUTE) {
    console.log(`\n[cutover] DRY RUN complete — nothing changed. Re-run with`);
    console.log(`  --execute --yes-delete-nonpreserved   (ID-5, against a FRESH prod backup)`);
    await client.end();
    return;
  }

  // ── DESTRUCTIVE PATH (ID-5) ──────────────────────────────────────────────
  if (!CONFIRMED) {
    console.error(`\n🔴 --execute requires --yes-delete-nonpreserved. Refusing.`);
    await client.end();
    process.exit(1);
  }
  // Lock-out guard: the founder MUST survive in both tables, else this DB would
  // be left with no admin. (Kian/Pranav absence is a wrong-DB smell too, but the
  // founder guard is the hard one.)
  const founderProfiles = await count("app_user", `WHERE lower(email) = lower('${FOUNDER_EMAIL}')`);
  const founderAuth = await count("users", `WHERE lower(email) = lower('${FOUNDER_EMAIL}')`);
  if (founderProfiles === 0 || founderAuth === 0) {
    console.error(`\n🔴 Founder missing (app_user=${founderProfiles}, users=${founderAuth}) — a cutover here would lock them out. Refusing.`);
    await client.end();
    process.exit(1);
  }

  console.log(`\n[cutover] 🔴 EXECUTING in one transaction…`);
  await db.transaction(async (tx) => {
    // 1. Scoped evidence wipe, child-first (a restrict-FK violation here aborts
    //    the whole tx → safe; fix order and retry against the backup).
    for (const s of SCOPED_DELETES) {
      await tx.execute(sql.raw(`DELETE FROM "${s.table}" ${s.where}`));
    }
    // 1b. NULL surviving actor-refs that point at a dropped app_user.
    for (const u of DEFENSIVE_NULLS) await tx.execute(sql.raw(u));
    // 2. Non-preserved identities. app_user first (cascades the empty
    //    student/tutor/parent + any onboarding), then better-auth users
    //    (cascades sessions/accounts).
    await tx.execute(sql.raw(`DELETE FROM app_user WHERE id NOT IN ${PRESERVE_IDS}`));
    await tx.execute(sql`DELETE FROM users WHERE lower(email) NOT IN (${sql.join(PRESERVE_EMAILS.map((e) => sql`${e}`), sql`, `)})`);
    // 3. Fix user_type on the preserved single-row identities (0037 blanket-set
    //    every app_user to 'student'). Founder → admin; Pranav → tutor; Kian stays
    //    student. Multi-role founder/Pranav re-acquire their other role later
    //    (founder re-onboards as student if wanted; Pranav's admin re-granted via /admin).
    await tx.execute(sql`UPDATE app_user SET user_type = 'admin' WHERE lower(email) = lower(${FOUNDER_EMAIL})`);
    await tx.execute(sql`UPDATE app_user SET user_type = 'tutor' WHERE lower(email) = lower(${PRANAV_EMAIL})`);
    await tx.execute(sql`UPDATE app_user SET user_type = 'student' WHERE lower(email) = lower(${KIAN_EMAIL})`);
    // 4. Referral codes for any preserved profile missing one (the new model gate).
    for (const e of PRESERVE_EMAILS) {
      await tx.execute(sql`UPDATE app_user SET referral_code = ${generateReferralCode()} WHERE lower(email) = lower(${e}) AND referral_code IS NULL`);
    }
  });

  // Verify: only the preserve-set survives; content intact.
  const survivors = await count("app_user");
  const founderAdmin = await count("app_user", `WHERE lower(email) = lower('${FOUNDER_EMAIL}') AND user_type = 'admin'`);
  const pranavTutor = await count("app_user", `WHERE lower(email) = lower('${PRANAV_EMAIL}') AND user_type = 'tutor'`);
  console.log(`\n[cutover] ✅ done. app_user rows now: ${survivors} · founder-admin: ${founderAdmin} · pranav-tutor: ${pranavTutor}`);
  console.log(`[cutover] NEXT: bun scripts/backfill_preserved.ts (dry-run) → --execute to rebuild Kian's student/hero/pet + Pranav's tutor row.`);
  await client.end();
}

main().catch(async (err) => {
  console.error("[cutover] FAILED:", err);
  await client.end();
  process.exit(1);
});
