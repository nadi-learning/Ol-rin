import { sql } from "drizzle-orm";
import { db, queryClient } from "../src/db/client";
import { withBoard } from "../src/db/with-board";
import { board } from "@b2c/kernel/schema";
const boards = await db.select().from(board);
for (const b of boards) {
  const rows: any = await withBoard(b.id, (tx: any) => tx.execute(sql`
    select au.email, m.role,
           (select count(*) from users u where u.email = au.email)::int as has_auth
    from membership m join app_user au on au.id = m.user_id
    order by m.role, au.email
  `));
  const list = Array.from(rows);
  if (list.length) { console.log(`\n=== board ${b.slug} (${b.name}) ===`); console.table(list); }
}
await queryClient.end();
