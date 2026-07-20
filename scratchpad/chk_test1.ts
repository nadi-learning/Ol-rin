import { db } from "../src/db/client";
import { sql } from "drizzle-orm";
const r = await db.execute(sql`
  select u.id, u.email, u.name, m.role, b.slug as board,
         o.status as onb_status, o.current_step
  from users u
  left join membership m on m.user_id = u.id
  left join board b on b.id = m.board_id
  left join onboarding o on o.user_id = u.id
  where u.email = 'test1@example.com'`);
console.log(JSON.stringify(r.rows ?? r, null, 2));
process.exit(0);
