import { inArray } from "drizzle-orm";
import { board as boardTable } from "@b2c/kernel/schema";
import { db, queryClient } from "../src/db/client";
const rows = await db.select({ id: boardTable.id, slug: boardTable.slug }).from(boardTable)
  .where(inArray(boardTable.slug, ["cbse", "igcse", "cambridge"]));
for (const r of rows) console.log(`${r.slug.padEnd(10)} ${r.id}`);
await queryClient.end();
