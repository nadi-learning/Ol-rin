/**
 * DEV FIXTURE (not a probe, not a seed the app needs) — puts the DEMO student
 * into the one state Slice ASG-FOCUS is about: an assignment that is OPEN, i.e.
 * not derived-complete.
 *
 * Local holds exactly one assignment and it already derives `completed`, so
 * `hasAssigned` is false everywhere and the new branch would never render. Made
 * through the SERVICE (createAssignment), not raw SQL, so the row is shaped
 * exactly as the app makes it.
 *
 * Picks sub_topics that genuinely HAVE questions and share one chapter (blocked
 * mode requires it), so the assigned box is actionable rather than a second dead
 * end.
 *
 * Run: bun scripts/fixture_open_assignment.ts
 */
import { eq, inArray } from "drizzle-orm";
import { appUser, board, question, student, subTopic, topic } from "@b2c/kernel/schema";
import { db, queryClient } from "../src/db/client";
import { withBoard } from "../src/db/with-board";
import { createAssignment } from "../src/services/assignment";

const STUDENT_EMAIL = process.env.FIXTURE_STUDENT ?? "demo@example.com";
const TUTOR_EMAIL = process.env.FIXTURE_TUTOR ?? "tutor@example.com";

const [B] = await db.select().from(board).where(eq(board.slug, "cbse")).limit(1);
if (!B) throw new Error("no cbse board");

await withBoard(B.id, async (tx: any) => {
  const [su] = await tx
    .select({ id: appUser.id })
    .from(appUser)
    .where(eq(appUser.email, STUDENT_EMAIL))
    .limit(1);
  if (!su) throw new Error(`no user ${STUDENT_EMAIL}`);

  // The tutor→student link is the single pointer `student.tutor_id` (ID-4), and
  // createAssignment refuses without it. Several demo accounts lost their student
  // row to a `reset:students`, so establish the link rather than assume it.
  const [tu] = await tx
    .select({ id: appUser.id })
    .from(appUser)
    .where(eq(appUser.email, TUTOR_EMAIL))
    .limit(1);
  if (!tu) throw new Error(`no tutor ${TUTOR_EMAIL}`);

  const [existing] = await tx
    .select({ tutorId: student.tutorId })
    .from(student)
    .where(eq(student.userId, su.id))
    .limit(1);

  if (!existing) {
    await tx.insert(student).values({ userId: su.id, boardId: B.id, class: "9", tutorId: tu.id });
    console.log(`  linked: created student row for ${STUDENT_EMAIL} → ${TUTOR_EMAIL}`);
  } else if (!existing.tutorId) {
    await tx.update(student).set({ tutorId: tu.id }).where(eq(student.userId, su.id));
    console.log(`  linked: pointed ${STUDENT_EMAIL} at ${TUTOR_EMAIL}`);
  }
  const srow = { tutorId: tu.id };

  const qSubs = await tx
    .select({ s: question.subTopicId })
    .from(question)
    .where(eq(question.status, "approved"));
  const ids = [...new Set(qSubs.map((r: any) => r.s).filter(Boolean))] as string[];
  if (ids.length === 0) throw new Error("no approved questions anywhere");

  // sub_topic has NO chapter_id — it hangs off topic, which hangs off chapter.
  const cand = await tx
    .select({ id: subTopic.id, chapterId: topic.chapterId, name: subTopic.name })
    .from(subTopic)
    .innerJoin(topic, eq(topic.id, subTopic.topicId))
    .where(inArray(subTopic.id, ids));

  const byChapter = new Map<string, { id: string; name: string }[]>();
  for (const c of cand) {
    const list = byChapter.get(c.chapterId) ?? [];
    list.push({ id: c.id, name: c.name });
    byChapter.set(c.chapterId, list);
  }
  let pick: { id: string; name: string }[] | null = null;
  for (const [, list] of byChapter) {
    if (list.length >= 2) {
      pick = list.slice(0, 2);
      break;
    }
  }
  if (!pick) {
    const first = [...byChapter.values()][0];
    if (!first) throw new Error("no sub_topic with questions");
    pick = first.slice(0, 1);
  }

  const view: any = await createAssignment(tx, {
    boardId: B.id,
    tutorUserId: srow.tutorId,
    studentId: su.id,
    mode: "blocked",
    subTopicIds: pick.map((p) => p.id),
  });

  console.log("created assignment", view.id);
  console.log("  student   :", STUDENT_EMAIL);
  console.log("  sub_topics:", pick.map((p) => p.name).join(" | "));
  console.log("  completed :", view.completed, "(must be false for the walk)");
});

await queryClient.end();
