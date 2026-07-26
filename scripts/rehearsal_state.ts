/**
 * rehearsal_state — what the parent dashboard currently holds for each of the
 * demo parent's children (S169).
 *
 * The instrument for the prod rehearsal: run it before and after the seed, and
 * the diff IS the answer to "what would seeding prod actually do". Reads through
 * the REAL read path (`parent.listChildren` / `getChildDashboard`), not raw
 * counts, so what it prints is what a parent would see.
 *
 *   bun run rehearsal:state
 */
import { and, eq, inArray, sql } from "drizzle-orm";
import { appUser, attempt, board, masteryState, observation, practiceSession } from "@b2c/kernel/schema";
import { db, queryClient } from "../src/db/client";
import { withBoard } from "../src/db/with-board";
import { getChildDashboard, listChildren } from "../src/services/parent";

const PARENT_EMAIL = "parent@example.com";

async function main() {
  const [b] = await db.select().from(board).where(eq(board.slug, "cbse"));
  const [par] = await db
    .select({ id: appUser.id })
    .from(appUser)
    .where(and(eq(appUser.email, PARENT_EMAIL), eq(appUser.userType, "parent")));
  if (!b || !par) throw new Error("need a cbse board and the demo parent");

  const children = await withBoard(b.id, (tx) => listChildren(tx, par.id));
  console.log(`\n${PARENT_EMAIL} — ${children.length} child(ren)\n${"=".repeat(72)}`);

  for (const c of children) {
    const one = async (t: any, col: any) =>
      Number(
        (
          await withBoard(b.id, (tx) =>
            tx.select({ n: sql<number>`count(*)` }).from(t).where(eq(col, c.studentId)),
          )
        )[0]?.n ?? 0,
      );
    const att = await one(attempt, attempt.appUserId);
    const ses = await one(practiceSession, practiceSession.appUserId);
    const obs = await one(observation, observation.studentId);
    const mas = await one(masteryState, masteryState.studentId);

    const d = await withBoard(b.id, (tx) =>
      getChildDashboard(tx, { parentUserId: par.id, childId: c.studentId }),
    );

    console.log(`\n▸ ${c.name ?? "?"}  <${c.email}>`);
    console.log(
      `   raw:  ${att} attempts · ${ses} sessions · ${obs} observations · ${mas} certified mastery rows`,
    );
    console.log(
      `   page: ${d.totals.solidNow} solid / ${d.totals.coveredNow} covered / ${d.totals.totalNow} in scope` +
        `  ·  ${d.subjects.length} subject(s)  ·  ${d.weaknesses.length} weakness(es)`,
    );
    for (const p of d.subjects) {
      const cells = p.chapters.reduce((n, ch) => n + ch.total, 0);
      const green = p.chapters.reduce((n, ch) => n + ch.solid, 0);
      console.log(
        `     · ${p.subjectName.padEnd(16)} ${String(p.chapters.length).padStart(2)} chapter(s), ` +
          `${String(cells).padStart(3)} sub-topics, ${green} solid`,
      );
    }
    // A DUPLICATE subject name is the tell that two spines got merged badly.
    const names = d.subjects.map((p) => p.subjectName);
    const dupes = names.filter((n, i) => names.indexOf(n) !== i);
    if (dupes.length) console.log(`   🔴 DUPLICATE SUBJECT(S): ${[...new Set(dupes)].join(", ")}`);
  }

  console.log(`\n${"=".repeat(72)}`);
  await queryClient.end();
}

main().catch(async (err) => {
  console.error("rehearsal_state FAILED:", err);
  await queryClient.end();
  process.exit(1);
});
