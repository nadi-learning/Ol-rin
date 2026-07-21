/**
 * backfill_preserved — the ID-5 companion to cutover_identity.ts (S137).
 *
 * WHAT: after the scoped cutover has dropped the disposable cohort and left the
 * new-model role tables (student/tutor/hero/pet) EMPTY, rebuild the ONE real
 * relationship we preserved:
 *   - KIAN (student, cbse): a `student` row (class = grade, tutor_id → Pranav) +
 *     his `hero`/`pet` instances, and his onboarding header flipped to completed.
 *   - PRANAV (tutor, cbse): a `tutor` row (boards = ['cbse']).
 *
 * Kian's identity + his content/evidence chain (18 questions, assignment, 7
 * practice sessions, 18 attempts, 18 observations) were KEPT by the cutover and
 * still key on Kian's stable app_user id — this script only rebuilds the
 * new-model role/onboarding rows around them, so Pranav can run Stage-2.
 *
 * Kian's onboarding ANSWERS are known from the S136 discovery (grade 9, hero
 * naruto, pet kurama); `pronoun` comes from the pre-0037 snapshot
 * (scripts/../scratchpad/prod_snapshot_kian.sh) — fill KIAN.pronoun below before
 * --execute if you want it preserved (nullable; null is fine).
 *
 * IDEMPOTENT: re-running detects an existing student row and skips the create,
 * only ensuring the onboarding header + tutor row. Safe to run twice.
 *
 * 🔴 OWNER conn (MIGRATE_DATABASE_URL, bypasses RLS) — it writes student.board_id
 * (an RLS-scoped table) for a specific board; a scoped app role couldn't.
 *
 * Usage:
 *   bun scripts/backfill_preserved.ts             # DRY RUN (default)
 *   bun scripts/backfill_preserved.ts --execute   # writes — ID-5 only, AFTER cutover
 */
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "../src/config/env";

const KIAN = {
  email: "kianjibo500@gmail.com",
  board: "cbse",
  grade: "9", // student.class
  hero: "naruto", // hero.hero_type
  pet: "kurama", // pet.pet_type
  pronoun: "he" as string | null, // from prod_snapshot_kian.sh (2026-07-21); old onboarding stored "he"
};
const PRANAV_EMAIL = "spranav.iitkgp@gmail.com";

const EXECUTE = process.argv.includes("--execute");
const ownerUrl = env.MIGRATE_DATABASE_URL ?? env.DATABASE_URL;
const client = postgres(ownerUrl, { max: 1, prepare: false, onnotice: () => {} });
const db = drizzle(client);

async function one<T = Record<string, unknown>>(q: ReturnType<typeof sql>): Promise<T | null> {
  const rows = (await db.execute(q)) as unknown as T[];
  return rows[0] ?? null;
}

async function main() {
  console.log(`[backfill] owner conn: ${ownerUrl.replace(/:[^:@]+@/, ":***@")}`);
  console.log(`[backfill] mode: ${EXECUTE ? "🔴 EXECUTE (writes)" : "DRY RUN (read-only)"}\n`);

  // Resolve the three anchors.
  const kian = await one<{ id: string; user_type: string }>(sql`SELECT id, user_type FROM app_user WHERE lower(email) = lower(${KIAN.email}) LIMIT 1`);
  const pranav = await one<{ id: string; user_type: string }>(sql`SELECT id, user_type FROM app_user WHERE lower(email) = lower(${PRANAV_EMAIL}) LIMIT 1`);
  const board = await one<{ id: string }>(sql`SELECT id FROM board WHERE slug = ${KIAN.board} LIMIT 1`);

  console.log(`── ANCHORS ──`);
  console.log(`  Kian:   ${kian ? `${kian.id} (${kian.user_type})` : "❌ MISSING"}`);
  console.log(`  Pranav: ${pranav ? `${pranav.id} (${pranav.user_type})` : "❌ MISSING"}`);
  console.log(`  board ${KIAN.board}: ${board ? board.id : "❌ MISSING"}`);
  if (!kian || !pranav || !board) {
    console.error(`\n🔴 An anchor is missing — refusing. (Run AFTER the cutover, on the DB where these exist.)`);
    await client.end();
    process.exit(1);
  }

  // What already exists? (idempotency)
  const existingStudent = await one<{ user_id: string; hero_id: string | null; pet_id: string | null; tutor_id: string | null }>(
    sql`SELECT user_id, hero_id, pet_id, tutor_id FROM student WHERE user_id = ${kian.id} LIMIT 1`,
  );
  const existingTutor = await one<{ user_id: string }>(sql`SELECT user_id FROM tutor WHERE user_id = ${pranav.id} LIMIT 1`);
  const onb = await one<{ status: string; state: string }>(sql`SELECT status, state FROM onboarding WHERE user_id = ${kian.id} LIMIT 1`);

  // Preserved content sanity (proves the cutover kept Kian's chain).
  const kianQ = await one<{ n: number }>(sql`SELECT count(*)::int AS n FROM question WHERE target_student_id = ${kian.id}`);
  const kianObs = await one<{ n: number }>(sql`SELECT count(*)::int AS n FROM observation WHERE student_id = ${kian.id}`);
  const kianAsg = await one<{ n: number }>(sql`SELECT count(*)::int AS n FROM assignment WHERE student_id = ${kian.id}`);

  console.log(`\n── PLAN ──`);
  console.log(`  student(${kian.id}): ${existingStudent ? "EXISTS → skip create" : `CREATE board=${KIAN.board} class=${KIAN.grade} pronoun=${KIAN.pronoun ?? "∅"} tutor=Pranav`}`);
  console.log(`  hero:  ${existingStudent?.hero_id ? "EXISTS → skip" : `CREATE hero_type=${KIAN.hero}`}`);
  console.log(`  pet:   ${existingStudent?.pet_id ? "EXISTS → skip" : `CREATE pet_type=${KIAN.pet}`}`);
  console.log(`  onboarding: ${onb ? `${onb.status}/${onb.state}` : "MISSING"} → ensure completed/done`);
  console.log(`  tutor(${pranav.id}): ${existingTutor ? "EXISTS → skip" : "CREATE boards=['cbse']"}`);
  console.log(`  [preserved chain] questions=${kianQ?.n ?? 0} observations=${kianObs?.n ?? 0} assignments=${kianAsg?.n ?? 0}`);
  if (pranav.user_type !== "tutor") console.log(`  ⚠️ Pranav user_type=${pranav.user_type} (cutover should have set 'tutor')`);

  if (!EXECUTE) {
    console.log(`\n[backfill] DRY RUN complete — nothing changed. Re-run with --execute (AFTER the cutover).`);
    await client.end();
    return;
  }

  console.log(`\n[backfill] 🔴 EXECUTING in one transaction…`);
  await db.transaction(async (tx) => {
    let heroId = existingStudent?.hero_id ?? null;
    let petId = existingStudent?.pet_id ?? null;

    if (!existingStudent) {
      if (!heroId) {
        const h = (await tx.execute(sql`INSERT INTO hero (hero_type, status) VALUES (${KIAN.hero}, 'active') RETURNING hero_id`)) as unknown as Array<{ hero_id: string }>;
        heroId = h[0]!.hero_id;
      }
      if (!petId) {
        const p = (await tx.execute(sql`INSERT INTO pet (pet_type, status) VALUES (${KIAN.pet}, 'active') RETURNING pet_id`)) as unknown as Array<{ pet_id: string }>;
        petId = p[0]!.pet_id;
      }
      await tx.execute(sql`
        INSERT INTO student (user_id, board_id, class, pronoun, hero_id, pet_id, tutor_id, status, onboarding_at)
        VALUES (${kian.id}, ${board.id}, ${KIAN.grade}, ${KIAN.pronoun}, ${heroId}, ${petId}, ${pranav.id}, 'active', now())
      `);
    }

    // Onboarding header → completed (Kian's row survived 0037; UPDATE, else INSERT).
    if (onb) {
      await tx.execute(sql`UPDATE onboarding SET status = 'completed', state = 'done', end_at = COALESCE(end_at, now()) WHERE user_id = ${kian.id}`);
    } else {
      await tx.execute(sql`INSERT INTO onboarding (user_id, state, status, end_at) VALUES (${kian.id}, 'done', 'completed', now())`);
    }

    // Pranav tutor row.
    if (!existingTutor) {
      await tx.execute(sql`INSERT INTO tutor (user_id, boards, status) VALUES (${pranav.id}, ${JSON.stringify([KIAN.board])}::jsonb, 'active')`);
    }
  });

  // Verify.
  const s = await one<{ board_id: string; class: string; tutor_id: string; hero_id: string; pet_id: string }>(
    sql`SELECT board_id, class, tutor_id, hero_id, pet_id FROM student WHERE user_id = ${kian.id}`,
  );
  const t = await one<{ boards: unknown }>(sql`SELECT boards FROM tutor WHERE user_id = ${pranav.id}`);
  const o = await one<{ status: string }>(sql`SELECT status FROM onboarding WHERE user_id = ${kian.id}`);
  console.log(`\n[backfill] ✅ done.`);
  console.log(`  student: board=${s?.board_id} class=${s?.class} tutor=${s?.tutor_id} hero=${s?.hero_id} pet=${s?.pet_id}`);
  console.log(`  tutor.boards=${JSON.stringify(t?.boards)} · onboarding=${o?.status}`);
  console.log(`  NEXT: run prod_scan_kian_e2e.sh to confirm the chain is Stage-2-ready.`);
  await client.end();
}

main().catch(async (err) => {
  console.error("[backfill] FAILED:", err);
  await client.end();
  process.exit(1);
});
