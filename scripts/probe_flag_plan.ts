/**
 * probe_flag_plan — Slice CLOCK-3 exit gate (the tutor's "what's being done" plan).
 *
 * CLOCK-3 (parent dashboard, element 6) rides the EXISTING addressed-toggle: the
 * one mutation `setCrossConceptFlagAddressed` gains an optional `plan`. The whole
 * point of the clock is that authored history accrues from when it is switched on,
 * so what must be proven now is the WRITE PATH and its tri-state semantics — not a
 * page. Real DB + real RLS on a THROWAWAY board (M22); cleans up after itself.
 *
 *  1. DB connectivity as the app role.
 *  2. set a plan on an OPEN flag (addressed:false) → plan stored, plan_updated_at +
 *     plan_by stamped, and `addressed` stays open (the two are independent).
 *  3. the view (getCrossConceptFlags) surfaces plan + planUpdatedAt.
 *  4. TRI-STATE: toggle `addressed` with plan OMITTED (undefined) → plan PRESERVED
 *     (an unrelated toggle must never wipe an authored sentence).
 *  5. overwrite the plan with new text → text changes, plan_updated_at not-before.
 *  6. clear with "" → plan/plan_updated_at/plan_by all NULL (page reverts to default).
 *  7. clear with null → same NULL clear.
 *  8. whitespace-only "   " → trimmed to a clear, not stored as blank text.
 *  9. set addressed:true AND plan together → both move in one call.
 * 10. persistence: the plan is on the ROW itself (raw select), not just the view.
 * 11. ownership: a tutor who doesn't tutor the student → STUDENT_NOT_FOUND, no write.
 * 12. RLS cross-board: under another board the flag is invisible → FLAG_NOT_FOUND.
 */
import { and, eq, sql } from "drizzle-orm";
import type { PgTransaction } from "drizzle-orm/pg-core";
import {
  appUser,
  board,
  chapter,
  crossConceptFlag,
  observation,
  student,
  subTopic,
  subject,
  topic,
} from "@b2c/kernel/schema";
import { db, queryClient } from "../src/db/client";
import { withBoard } from "../src/db/with-board";
import {
  FlagNotFoundError,
  getCrossConceptFlags,
  setCrossConceptFlagAddressed,
  StudentNotFoundError,
} from "../src/services/tutor";

type Tx = PgTransaction<any, any, any>;

let passed = 0;
let failed = 0;
function check(name: string, ok: boolean) {
  if (ok) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.error(`  ✗ ${name}`);
  }
}

const rows = <T>(boardId: string, fn: (tx: Tx) => Promise<T>) => withBoard(boardId, fn);
const rawFlag = (boardId: string, flagId: string) =>
  rows(boardId, (tx) =>
    tx.select().from(crossConceptFlag).where(eq(crossConceptFlag.id, flagId)),
  ).then((r) => r[0]!);

async function main() {
  const tag = `${Date.now()}`;

  // 1. connectivity
  await db.execute(sql`select 1`);
  check("1. DB connectivity (select 1) as app role", true);

  const [P] = await db.insert(board).values({ slug: `fp-p-${tag}`, name: "Probe P" }).returning();
  const [Q] = await db.insert(board).values({ slug: `fp-q-${tag}`, name: "Probe Q" }).returning();
  if (!P || !Q) throw new Error("board seed failed");

  // global identities: the student's tutor, plus a stranger tutor (ownership).
  const tutEmail = `fp-tut-${tag}@example.com`;
  const stuEmail = `fp-stu-${tag}@example.com`;
  const strangerEmail = `fp-str-${tag}@example.com`;
  const [tut] = await db.insert(appUser).values({ email: tutEmail, name: "Tutor", userType: "tutor" }).returning();
  const [stu] = await db.insert(appUser).values({ email: stuEmail, name: "Stu", userType: "student" }).returning();
  const [stranger] = await db.insert(appUser).values({ email: strangerEmail, name: "Stranger", userType: "tutor" }).returning();
  if (!tut || !stu || !stranger) throw new Error("app_user seed failed");

  // fixture under P: spine + tutor↔student link + one stage1 cross-concept flag
  // (origin='stage1_cross_concept' needs from_sub_topic_id + source_observation_id
  // non-null, per the table's provenance check).
  const flagId = await withBoard(P.id, async (tx: Tx) => {
    const [subj] = await tx.insert(subject).values({ boardId: P.id, slug: "phys", name: "Physics", grade: "IGCSE" }).returning();
    const [chap] = await tx.insert(chapter).values({ boardId: P.id, subjectId: subj!.id, slug: "motion", name: "Motion", ordinal: 1 }).returning();
    const [tp] = await tx.insert(topic).values({ boardId: P.id, chapterId: chap!.id, slug: "speed", name: "Speed", ordinal: 1 }).returning();
    const [st] = await tx.insert(subTopic).values({ boardId: P.id, topicId: tp!.id, slug: "accel", name: "Acceleration", ordinal: 1 }).returning();
    await tx.insert(student).values({ userId: stu.id, boardId: P.id, class: "9", tutorId: tut.id });
    const [obs] = await tx
      .insert(observation)
      .values({
        boardId: P.id,
        studentId: stu.id,
        subTopicId: st!.id,
        axis: "procedural",
        observationLevel: 4,
        reasoning: "Ran the acceleration procedure cleanly.",
        signals: {},
        source: "stage1_scorer",
      })
      .returning();
    const [flag] = await tx
      .insert(crossConceptFlag)
      .values({
        boardId: P.id,
        studentId: stu.id,
        origin: "stage1_cross_concept",
        fromSubTopicId: st!.id,
        sourceObservationId: obs!.id,
        note: "procedural issue in rationalising the denominator — left the surd in the answer",
      })
      .returning();
    return flag!.id;
  });

  // 2. set a plan on the OPEN flag (addressed:false).
  const v2 = await rows(P.id, (tx) =>
    setCrossConceptFlagAddressed(tx, {
      tutorUserId: tut.id,
      flagId,
      addressed: false,
      plan: "Re-teaching surd rationalisation Thursday; then two spaced retrievals.",
    }),
  );
  const row2 = await rawFlag(P.id, flagId);
  check("2a. plan stored on the flag", v2.plan === "Re-teaching surd rationalisation Thursday; then two spaced retrievals.");
  check("2b. plan_updated_at stamped", v2.planUpdatedAt instanceof Date);
  check("2c. plan_by = the authoring tutor", row2.planBy === tut.id);
  check("2d. addressed stays OPEN (independent of plan)", v2.addressedAt === null && row2.addressedAt === null);

  // 3. the view surfaces plan + planUpdatedAt (flag still open → default view shows it).
  const view3 = await rows(P.id, (tx) => getCrossConceptFlags(tx, { tutorUserId: tut.id, studentId: stu.id }));
  const f3 = view3.find((f) => f.id === flagId);
  check("3. getCrossConceptFlags view carries plan + planUpdatedAt", !!f3 && f3.plan === v2.plan && f3.planUpdatedAt instanceof Date);

  // 4. TRI-STATE — toggle addressed with plan OMITTED must NOT wipe the plan.
  const firstStampedAt = row2.planUpdatedAt!;
  const v4 = await rows(P.id, (tx) =>
    setCrossConceptFlagAddressed(tx, { tutorUserId: tut.id, flagId, addressed: true }),
  );
  const row4 = await rawFlag(P.id, flagId);
  check("4a. addressed flips to closed", v4.addressedAt instanceof Date && row4.addressedAt instanceof Date);
  check("4b. plan PRESERVED across the toggle (undefined = leave)", v4.plan === v2.plan && row4.planBy === tut.id);
  check("4c. plan_updated_at unchanged by an unrelated toggle", row4.planUpdatedAt!.getTime() === firstStampedAt.getTime());

  // 5. overwrite the plan with new text.
  const v5 = await rows(P.id, (tx) =>
    setCrossConceptFlagAddressed(tx, {
      tutorUserId: tut.id,
      flagId,
      addressed: true,
      plan: "Update: surds solid now; watching it holds under mixed practice.",
    }),
  );
  const row5 = await rawFlag(P.id, flagId);
  check("5a. plan text overwritten", v5.plan === "Update: surds solid now; watching it holds under mixed practice.");
  check("5b. plan_updated_at not-before the previous stamp", row5.planUpdatedAt!.getTime() >= firstStampedAt.getTime());

  // 6. clear with "" → all three plan columns NULL.
  await rows(P.id, (tx) => setCrossConceptFlagAddressed(tx, { tutorUserId: tut.id, flagId, addressed: true, plan: "" }));
  const row6 = await rawFlag(P.id, flagId);
  check("6. clear with \"\" → plan/plan_updated_at/plan_by all NULL", row6.plan === null && row6.planUpdatedAt === null && row6.planBy === null);

  // 7. re-set then clear with null.
  await rows(P.id, (tx) => setCrossConceptFlagAddressed(tx, { tutorUserId: tut.id, flagId, addressed: true, plan: "temp" }));
  await rows(P.id, (tx) => setCrossConceptFlagAddressed(tx, { tutorUserId: tut.id, flagId, addressed: true, plan: null }));
  const row7 = await rawFlag(P.id, flagId);
  check("7. clear with null → plan NULL", row7.plan === null && row7.planBy === null);

  // 8. whitespace-only is a clear, never stored as blank text.
  await rows(P.id, (tx) => setCrossConceptFlagAddressed(tx, { tutorUserId: tut.id, flagId, addressed: true, plan: "back to real text" }));
  await rows(P.id, (tx) => setCrossConceptFlagAddressed(tx, { tutorUserId: tut.id, flagId, addressed: true, plan: "   " }));
  const row8 = await rawFlag(P.id, flagId);
  check("8. whitespace-only plan trims to a clear (NULL, not blank)", row8.plan === null);

  // 9. addressed AND plan move together in one call (re-open + author).
  const v9 = await rows(P.id, (tx) =>
    setCrossConceptFlagAddressed(tx, { tutorUserId: tut.id, flagId, addressed: false, plan: "Reopened: needs another look." }),
  );
  check("9. addressed:false + plan set together", v9.addressedAt === null && v9.plan === "Reopened: needs another look.");

  // 10. persistence proof — the plan is on the ROW, read straight from the table.
  const row10 = await rawFlag(P.id, flagId);
  check("10. plan persisted on the row itself (raw select)", row10.plan === "Reopened: needs another look." && row10.planBy === tut.id);

  // 11. ownership — the stranger tutor does not tutor this student → no write.
  let owned = false;
  try {
    await rows(P.id, (tx) => setCrossConceptFlagAddressed(tx, { tutorUserId: stranger.id, flagId, addressed: true, plan: "malicious" }));
  } catch (e) {
    owned = e instanceof StudentNotFoundError;
  }
  const row11 = await rawFlag(P.id, flagId);
  check("11a. unlinked tutor → STUDENT_NOT_FOUND", owned);
  check("11b. the plan was NOT overwritten by the rejected caller", row11.plan === "Reopened: needs another look.");

  // 12. RLS cross-board — under board Q the flag row is invisible → FLAG_NOT_FOUND.
  let rls = false;
  try {
    await rows(Q.id, (tx) => setCrossConceptFlagAddressed(tx, { tutorUserId: tut.id, flagId, addressed: true, plan: "x" }));
  } catch (e) {
    rls = e instanceof FlagNotFoundError;
  }
  check("12. RLS: flag invisible under another board → FLAG_NOT_FOUND", rls);

  // ── cleanup (FK-safe order) ──
  await withBoard(P.id, async (tx: Tx) => {
    await tx.delete(crossConceptFlag).where(eq(crossConceptFlag.boardId, P.id));
    await tx.delete(observation).where(eq(observation.boardId, P.id));
    await tx.delete(subTopic).where(eq(subTopic.boardId, P.id));
    await tx.delete(topic).where(eq(topic.boardId, P.id));
    await tx.delete(chapter).where(eq(chapter.boardId, P.id));
    await tx.delete(subject).where(eq(subject.boardId, P.id));
    await tx.delete(student).where(eq(student.boardId, P.id));
  });
  for (const email of [tutEmail, stuEmail, strangerEmail]) {
    await db.delete(appUser).where(eq(appUser.email, email));
  }
  await db.delete(board).where(eq(board.id, P.id));
  await db.delete(board).where(eq(board.id, Q.id));

  console.log(`\nprobe_flag_plan: ${passed} passed, ${failed} failed`);
  await queryClient.end();
  process.exit(failed === 0 ? 0 : 1);
}

main().catch(async (err) => {
  console.error("probe_flag_plan FAILED:", err);
  await queryClient.end();
  process.exit(1);
});
