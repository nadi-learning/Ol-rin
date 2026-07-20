import { db } from "../src/db/client";
import { sql } from "drizzle-orm";
const c = await db.execute(sql`select
  (select count(*) from membership) as memberships,
  (select count(*) from onboarding) as onboardings,
  current_user as who,
  (select rolbypassrls from pg_roles where rolname = current_user) as bypass`);
console.log("counts (no board set):", JSON.stringify((c.rows??c)[0]));
for (const slug of ["cbse","cambridge","igcse"]) {
  const b = await db.execute(sql`select id from board where slug = ${slug}`);
  const row = (b.rows ?? b)[0] as any;
  if (!row) { console.log(slug, "-> NO BOARD ROW"); continue; }
  await db.execute(sql.raw(`set local app.board = '${row.id}'`));
  const r = await db.execute(sql`
    select au.email, m.role, o.status, o.current_step
    from membership m
    join app_user au on au.id = m.user_id
    left join onboarding o on o.user_id = au.id
    order by m.created_at desc limit 6`);
  console.log(`\n=== ${slug} ===`);
  console.log(JSON.stringify(r.rows ?? r, null, 2));
}
process.exit(0);
