import { sql } from "drizzle-orm";
import { board as boardTable } from "@b2c/kernel/schema";
import { db, queryClient } from "../src/db/client";
import { withBoard } from "../src/db/with-board";
const boards = await db.select({ id: boardTable.id, slug: boardTable.slug }).from(boardTable);
for (const b of boards) {
  const rows: any = await withBoard(b.id, (tx) => tx.execute(sql`
    select u.email, o.status from onboarding o
    join app_user u on u.id = o.user_id
    where o.status = 'completed' and u.email like '%@example.com'
    limit 5`));
  const arr = Array.from(rows as any);
  if (arr.length) console.log(b.slug, arr);
}
await queryClient.end();
