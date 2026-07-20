import { eq, sql } from "drizzle-orm";
import { board } from "@b2c/kernel/schema";
import { db, queryClient } from "../src/db/client";
import { withBoard } from "../src/db/with-board";
const [cbse] = await db.select().from(board).where(eq(board.slug, "cbse"));
const t: any = await withBoard(cbse!.id, (tx: any) => tx.execute(sql`
  select 'tutor' as kind, a.email as adult, s.email as student from tutor_student ts
  join app_user a on a.id=ts.tutor_id join app_user s on s.id=ts.student_id
  union all
  select 'parent', a.email, s.email from parent_child pc
  join app_user a on a.id=pc.parent_id join app_user s on s.id=pc.student_id
`));
console.table(Array.from(t));
await queryClient.end();
