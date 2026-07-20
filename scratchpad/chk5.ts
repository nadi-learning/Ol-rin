import { db } from "../src/db/client";
import { withBoard } from "../src/db/with-board";
import { sql } from "drizzle-orm";
const boards = await db.execute(sql`select id, slug from board order by slug`);
let found = false;
for (const b of (boards.rows ?? boards) as any[]) {
  const rows = await withBoard(b.id, async (tx) => {
    const r = await tx.execute(sql`
      select au.email, m.role, o.status, o.current_step,
             o.grade, o.pronoun, o.fav_character, o.pet
      from membership m
      join app_user au on au.id = m.user_id
      left join onboarding o on o.user_id = au.id
      where au.email in ('test1@example.com','test@example.com')`);
    return r.rows ?? r;
  });
  if ((rows as any[]).length) {
    found = true;
    console.log(`BOARD ${b.slug}:`, JSON.stringify(rows, null, 2));
  }
}
if (!found) console.log("NO MEMBERSHIP on ANY board for test1@example.com / test@example.com");
process.exit(0);
