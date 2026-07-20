import { db } from "../src/db/client";
import { sql } from "drizzle-orm";
const r = await db.execute(sql`
  select au.email, m.role, b.slug as board, o.status, o.current_step, au.created_at
  from app_user au
  left join membership m on m.user_id = au.id
  left join board b on b.id = m.board_id
  left join onboarding o on o.user_id = au.id
  where au.email in ('test1@example.com','test@example.com')
     or au.created_at > now() - interval '2 days'
  order by au.created_at desc limit 12`);
console.log(JSON.stringify(r.rows ?? r, null, 2));
process.exit(0);
