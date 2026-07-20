import { db } from "../src/db/client";
import { withBoard } from "../src/db/with-board";
import { sql } from "drizzle-orm";
const boards = await db.execute(sql`select id, slug from board order by slug`);
for (const b of (boards.rows ?? boards) as any[]) {
  const rows = await withBoard(b.id, async (tx) => {
    const r = await tx.execute(sql`
      select au.email, m.role, o.status, o.current_step
      from membership m
      join app_user au on au.id = m.user_id
      left join onboarding o on o.user_id = au.id
      order by m.created_at desc limit 8`);
    return r.rows ?? r;
  });
  console.log(`\n=== ${b.slug} (${(rows as any[]).length}) ===`);
  console.log(JSON.stringify(rows, null, 2));
}
process.exit(0);
