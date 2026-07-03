/**
 * seed_assignment_demo — OPTIONAL fixture so the Slice ASG flow can be eyeballed
 * in the browser (the canonical cbse content isn't present in every dev DB).
 * Idempotent. Seeds under board `cbse` (the FE BOARD const):
 *   subject "Physics (demo)" → chapter "Motion (demo)" → topic → 2 sub_topics,
 *   each with 2 subjective practice questions; whitelists + links a tutor and a
 *   student so dev-login works for both roles.
 *
 *   Tutor:   tutor@example.com   (role tutor)
 *   Student: smoke@example.com   (role student)
 *
 * Eyeball: dev-login as the tutor → pick the student → "Focused (blocked)
 * assignment" → pick "Motion (demo)" → check both sub-topics → Assign. Then
 * dev-login as the student → Practice → "Assigned to you" → start a sub-topic.
 *
 * Remove later: everything is tagged with the slug prefix `asgdemo-`; delete the
 * subject/chapter/topic/sub_topics/questions with that prefix + the two
 * whitelist/membership/tutor_student rows (or just leave it — it's inert).
 */
import { and, eq } from "drizzle-orm";
import type { PgTransaction } from "drizzle-orm/pg-core";
import {
  board, chapter, question, subTopic, subject, topic, tutorStudent, whitelist,
} from "@b2c/kernel/schema";
import { db, queryClient } from "../src/db/client";
import { withBoard } from "../src/db/with-board";
import { resolveMembership } from "../src/services/membership";

type Tx = PgTransaction<any, any, any>;
const BOARD = "cbse";
const TUTOR = "tutor@example.com";
const STUDENT = "smoke@example.com";

async function main() {
  const [b] = await db.select().from(board).where(eq(board.slug, BOARD)).limit(1);
  if (!b) throw new Error(`board '${BOARD}' not found — run the auth seed first.`);

  await withBoard(b.id, async (tx: Tx) => {
    let [sub] = await tx.select().from(subject).where(and(eq(subject.boardId, b.id), eq(subject.slug, "asgdemo-phys"))).limit(1);
    if (!sub) [sub] = await tx.insert(subject).values({ boardId: b.id, slug: "asgdemo-phys", name: "Physics (demo)", grade: "Class 9-10" }).returning();
    let [ch] = await tx.select().from(chapter).where(and(eq(chapter.boardId, b.id), eq(chapter.slug, "asgdemo-motion"))).limit(1);
    if (!ch) [ch] = await tx.insert(chapter).values({ boardId: b.id, subjectId: sub!.id, slug: "asgdemo-motion", name: "Motion (demo)", ordinal: 1 }).returning();
    let [tp] = await tx.select().from(topic).where(and(eq(topic.boardId, b.id), eq(topic.slug, "asgdemo-kinematics"))).limit(1);
    if (!tp) [tp] = await tx.insert(topic).values({ boardId: b.id, chapterId: ch!.id, slug: "asgdemo-kinematics", name: "Kinematics", ordinal: 1 }).returning();

    for (const [slug, name, ord] of [["asgdemo-speed", "Speed & velocity", 1], ["asgdemo-accel", "Acceleration", 2]] as const) {
      let [st] = await tx.select().from(subTopic).where(and(eq(subTopic.boardId, b.id), eq(subTopic.slug, slug))).limit(1);
      if (!st) {
        [st] = await tx.insert(subTopic).values({ boardId: b.id, topicId: tp!.id, slug, name, ordinal: ord }).returning();
        await tx.insert(question).values([
          { boardId: b.id, subTopicId: st!.id, axis: "conceptual", kind: "subjective", stem: `Explain ${name.toLowerCase()} in your own words, with an everyday example.`, referenceAnswer: "A clear definition tied to a concrete example.", explanation: null, ordinal: 1, source: "asgdemo" },
          { boardId: b.id, subTopicId: st!.id, axis: "procedural", kind: "subjective", stem: `Work through a numeric problem involving ${name.toLowerCase()} and show each step.`, referenceAnswer: "Correct setup, units, and a checked final value.", explanation: null, ordinal: 2, source: "asgdemo" },
        ]);
      }
    }

    // whitelist (idempotent) + link
    for (const [email, role] of [[TUTOR, "tutor"], [STUDENT, "student"]] as const) {
      const [w] = await tx.select().from(whitelist).where(and(eq(whitelist.boardId, b.id), eq(whitelist.email, email))).limit(1);
      if (!w) await tx.insert(whitelist).values({ boardId: b.id, email, role });
    }
  });

  // resolve memberships (creates app_user + membership) then link.
  const tu = await withBoard(b.id, (tx) => resolveMembership(tx, { email: TUTOR, name: "Demo Tutor", board: b }));
  const st = await withBoard(b.id, (tx) => resolveMembership(tx, { email: STUDENT, name: "Demo Student", board: b }));
  await withBoard(b.id, async (tx: Tx) => {
    const [link] = await tx.select().from(tutorStudent).where(and(eq(tutorStudent.tutorId, tu.user.id), eq(tutorStudent.studentId, st.user.id))).limit(1);
    if (!link) await tx.insert(tutorStudent).values({ boardId: b.id, tutorId: tu.user.id, studentId: st.user.id });
  });

  console.log(`[seed:asgdemo] cbse · tutor=${TUTOR} (tutor) ↔ student=${STUDENT} (student); "Motion (demo)" chapter w/ 2 sub-topics × 2 questions. Dev-login either to eyeball Slice ASG.`);
  await queryClient.end();
}

main().catch(async (e) => { console.error(e); await queryClient.end(); process.exit(1); });
