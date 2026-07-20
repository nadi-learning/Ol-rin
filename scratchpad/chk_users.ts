import { db } from "../src/db/client";
import { sql } from "drizzle-orm";
const r = await db.execute(sql`
  select u.email, m.role, b.slug as board, o.status, o.current_step, u.created_at
  from users u
  left join membership m on m.user_id = u.id
  left join board b on b.id = m.board_id
  left join onboarding o on o.user_id = u.id
  order by u.created_at desc limit 15`);
console.log(JSON.stringify(r.rows ?? r, null, 2));
process.exit(0);
