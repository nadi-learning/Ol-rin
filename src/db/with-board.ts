import { sql } from "drizzle-orm";
import type { PgTransaction } from "drizzle-orm/pg-core";
import { db } from "./client";

/**
 * Run a unit of work scoped to a board. Opens a transaction, sets the
 * transaction-local `app.board` claim (read by every RLS policy:
 * `board_id = current_setting('app.board', true)::uuid`), and runs `fn`
 * against the scoped transaction. Outside this helper no claim is set, so
 * RLS-protected tables read empty — fail-closed.
 *
 * `set_config(name, value, is_local=true)` is the parameterizable form of
 * `SET LOCAL` — the claim evaporates when the transaction ends.
 */
export async function withBoard<T>(
  boardId: string,
  fn: (tx: PgTransaction<any, any, any>) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.board', ${boardId}, true)`);
    return fn(tx as PgTransaction<any, any, any>);
  });
}
