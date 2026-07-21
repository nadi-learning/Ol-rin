/**
 * backfill_restore — finish the S138 cutover's mid-restore. The window preserved
 * only {founder→admin, Kian→student, Pranav→tutor}; the founder then began
 * restoring the remaining REAL students (session dropped mid-restore). This
 * rebuilds each as an already-onboarded profile so they DON'T have to re-onboard:
 * app_user(user_type=student) + student row (board/class/pronoun/hero/pet) +
 * hero/pet instances + onboarding header flipped to completed. Also re-grants
 * ambhakat1999 as a cbse tutor.
 *
 * On next Google sign-in, better-auth re-creates the `users` row and the app
 * resolves the domain app_user by (email, user_type) → they land onboarded.
 *
 * Target (from the pre-cutover dump prod_pre_id5_2026-07-21.dump + founder S137
 * classification + S-resume confirmations):
 *   REAL data (from dump):  shyam    cambridge/10/jon_snow/direwolf/he
 *                           varnika  cambridge/11/mulan/owl/she
 *   default HP/owl:         sharanya cambridge/10/harry_potter/owl/she
 *                           avani    cbse/9/harry_potter/owl/she
 *                           purwa    cbse/10/harry_potter/owl/she
 *   tutor re-grant:         ambhakat1999  cbse
 *   (already done in-window: founder→admin, kian→student, pranav→tutor)
 *   (junk, stay dropped:    spranav.iitkg, shagunb11gmail.com@gmail.com)
 *
 * All 5 students: tutor_id = NULL (only Kian↔Pranav was a real relationship).
 *
 * IDEMPOTENT: every row is check-then-create. Re-running skips whoever's already
 * restored and only completes the rest. Safe to run twice.
 *
 * 🔴 OWNER conn (MIGRATE_DATABASE_URL, bypasses RLS) — writes student.board_id
 * (RLS-forced). Run from LOCAL against prod RDS:
 *   MIGRATE_DATABASE_URL='postgresql://nadi:<master-pw>@<rds-host>:5432/<db>' \
 *     bun scripts/backfill_restore.ts             # DRY RUN (default)
 *   MIGRATE_DATABASE_URL='...' bun scripts/backfill_restore.ts --execute
 */
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "../src/config/env";

type Student = { email: string; name: string; board: string; grade: string; hero: string; pet: string; pronoun: string };
const RESTORE_STUDENTS: Student[] = [
  { email: "shyam.anand3128@gmail.com", name: "Shyam Anand", board: "cambridge", grade: "10", hero: "jon_snow", pet: "direwolf", pronoun: "he" },
  { email: "varnika.karamcheti@gmail.com", name: "Varnika Karamcheti", board: "cambridge", grade: "11", hero: "mulan", pet: "owl", pronoun: "she" },
  { email: "sharanyasd2010@gmail.com", name: "Sharanya", board: "cambridge", grade: "10", hero: "harry_potter", pet: "owl", pronoun: "she" },
  { email: "avanikishore29@gmail.com", name: "Avani Kulkarni", board: "cbse", grade: "9", hero: "harry_potter", pet: "owl", pronoun: "she" },
  { email: "purwaravani@gmail.com", name: "Avani Purwar", board: "cbse", grade: "10", hero: "harry_potter", pet: "owl", pronoun: "she" },
];
const GRANT_TUTORS = [{ email: "ambhakat1999@gmail.com", name: "Amarnath Bhakat", board: "cbse" }];

const EXECUTE = process.argv.includes("--execute");
const ownerUrl = env.MIGRATE_DATABASE_URL ?? env.DATABASE_URL;
const client = postgres(ownerUrl, { max: 1, prepare: false, onnotice: () => {} });
const db = drizzle(client);

type Row = Record<string, unknown>;
async function one<T = Row>(q: ReturnType<typeof sql>): Promise<T | null> {
  const r = (await db.execute(q)) as unknown as T[];
  return r[0] ?? null;
}

async function main() {
  console.log(`[restore] owner conn: ${ownerUrl.replace(/:[^:@]+@/, ":***@")}`);
  console.log(`[restore] mode: ${EXECUTE ? "🔴 EXECUTE (writes)" : "DRY RUN (read-only)"}\n`);

  // ---- PLAN (read-only preview for every target) --------------------------
  const plan: Array<{ kind: "student" | "tutor"; email: string; action: string }> = [];
  for (const s of RESTORE_STUDENTS) {
    const au = await one<{ id: string }>(sql`SELECT id FROM app_user WHERE lower(email) = lower(${s.email}) AND user_type = 'student' LIMIT 1`);
    const st = au ? await one<{ user_id: string }>(sql`SELECT user_id FROM student WHERE user_id = ${au.id} LIMIT 1`) : null;
    const onb = au ? await one<{ status: string }>(sql`SELECT status FROM onboarding WHERE user_id = ${au.id} LIMIT 1`) : null;
    const bits = [
      au ? "app_user✓" : "CREATE app_user",
      st ? "student✓" : `CREATE student ${s.board}/${s.grade}/${s.hero}/${s.pet}/${s.pronoun}`,
      onb?.status === "completed" ? "onboarding✓" : "SET onboarding=completed",
    ];
    plan.push({ kind: "student", email: s.email, action: bits.join(" · ") });
  }
  for (const t of GRANT_TUTORS) {
    const au = await one<{ id: string }>(sql`SELECT id FROM app_user WHERE lower(email) = lower(${t.email}) AND user_type = 'tutor' LIMIT 1`);
    const tr = au ? await one<{ user_id: string }>(sql`SELECT user_id FROM tutor WHERE user_id = ${au.id} LIMIT 1`) : null;
    plan.push({ kind: "tutor", email: t.email, action: [au ? "app_user✓" : "CREATE app_user", tr ? "tutor✓" : `CREATE tutor [${t.board}]`].join(" · ") });
  }
  console.log("── PLAN ──");
  for (const p of plan) console.log(`  [${p.kind}] ${p.email.padEnd(30)} ${p.action}`);

  if (!EXECUTE) {
    console.log(`\n[restore] DRY RUN complete — nothing changed. Re-run with --execute.`);
    await client.end();
    return;
  }

  // ---- resolve board ids up front (read-only; must NOT run inside the tx —
  //      the pool is max:1, so a lookup on the outer `db` while the tx holds
  //      that single connection self-deadlocks) --------------------------------
  const boardIds = new Map<string, string>();
  for (const slug of new Set(RESTORE_STUDENTS.map((s) => s.board))) {
    const b = await one<{ id: string }>(sql`SELECT id FROM board WHERE slug = ${slug} LIMIT 1`);
    if (!b) throw new Error(`board '${slug}' missing`);
    boardIds.set(slug, b.id);
  }

  // ---- EXECUTE (one transaction) ------------------------------------------
  console.log(`\n[restore] 🔴 EXECUTING in one transaction…`);
  await db.transaction(async (tx) => {
    async function ensureAppUser(email: string, name: string, userType: string): Promise<string> {
      const ex = (await tx.execute(sql`SELECT id FROM app_user WHERE lower(email) = lower(${email}) AND user_type = ${userType} LIMIT 1`)) as unknown as Array<{ id: string }>;
      if (ex[0]) return ex[0].id;
      const ins = (await tx.execute(sql`INSERT INTO app_user (email, name, user_type) VALUES (${email}, ${name}, ${userType}) RETURNING id`)) as unknown as Array<{ id: string }>;
      return ins[0]!.id;
    }

    for (const s of RESTORE_STUDENTS) {
      const uid = await ensureAppUser(s.email, s.name, "student");
      const bId = boardIds.get(s.board)!;
      const existing = (await tx.execute(sql`SELECT user_id FROM student WHERE user_id = ${uid} LIMIT 1`)) as unknown as Array<{ user_id: string }>;
      if (!existing[0]) {
        const h = (await tx.execute(sql`INSERT INTO hero (hero_type, status) VALUES (${s.hero}, 'active') RETURNING hero_id`)) as unknown as Array<{ hero_id: string }>;
        const p = (await tx.execute(sql`INSERT INTO pet (pet_type, status) VALUES (${s.pet}, 'active') RETURNING pet_id`)) as unknown as Array<{ pet_id: string }>;
        await tx.execute(sql`
          INSERT INTO student (user_id, board_id, class, pronoun, hero_id, pet_id, tutor_id, status, onboarding_at)
          VALUES (${uid}, ${bId}, ${s.grade}, ${s.pronoun}, ${h[0]!.hero_id}, ${p[0]!.pet_id}, NULL, 'active', now())`);
      }
      // onboarding header → completed (UPDATE if present, else INSERT)
      const onb = (await tx.execute(sql`SELECT id FROM onboarding WHERE user_id = ${uid} LIMIT 1`)) as unknown as Array<{ id: string }>;
      if (onb[0]) await tx.execute(sql`UPDATE onboarding SET status = 'completed', state = 'done', end_at = COALESCE(end_at, now()) WHERE user_id = ${uid}`);
      else await tx.execute(sql`INSERT INTO onboarding (user_id, state, status, end_at) VALUES (${uid}, 'done', 'completed', now())`);
    }

    for (const t of GRANT_TUTORS) {
      const uid = await ensureAppUser(t.email, t.name, "tutor");
      const ex = (await tx.execute(sql`SELECT user_id FROM tutor WHERE user_id = ${uid} LIMIT 1`)) as unknown as Array<{ user_id: string }>;
      if (!ex[0]) await tx.execute(sql`INSERT INTO tutor (user_id, boards, status) VALUES (${uid}, ${JSON.stringify([t.board])}::jsonb, 'active')`);
    }
  });

  // ---- VERIFY -------------------------------------------------------------
  console.log(`\n[restore] ✅ done. Verifying…`);
  for (const s of RESTORE_STUDENTS) {
    const r = await one<{ ut: string; board: string; class: string; hero: string; pet: string; pronoun: string; onb: string }>(sql`
      SELECT au.user_type AS ut, b.slug AS board, st.class, h.hero_type AS hero, p.pet_type AS pet, st.pronoun, o.status AS onb
      FROM app_user au
      LEFT JOIN student st ON st.user_id = au.id
      LEFT JOIN board b ON b.id = st.board_id
      LEFT JOIN hero h ON h.hero_id = st.hero_id
      LEFT JOIN pet  p ON p.pet_id  = st.pet_id
      LEFT JOIN onboarding o ON o.user_id = au.id
      WHERE lower(au.email) = lower(${s.email}) AND au.user_type = 'student'`);
    console.log(`  ${s.email.padEnd(30)} ${r ? `${r.ut} ${r.board}/${r.class}/${r.hero}/${r.pet}/${r.pronoun} onb=${r.onb}` : "❌ MISSING"}`);
  }
  for (const t of GRANT_TUTORS) {
    const r = await one<{ boards: unknown }>(sql`SELECT tu.boards FROM app_user au JOIN tutor tu ON tu.user_id = au.id WHERE lower(au.email) = lower(${t.email}) AND au.user_type = 'tutor'`);
    console.log(`  ${t.email.padEnd(30)} tutor boards=${JSON.stringify(r?.boards ?? null)}`);
  }
  console.log(`\n[restore] NEXT: founder eyeball — one restored student signs in with Google and lands ONBOARDED (no onboarding flow).`);
  await client.end();
}

main().catch(async (err) => {
  console.error("[restore] FAILED:", err);
  await client.end();
  process.exit(1);
});
