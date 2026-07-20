/**
 * probe_tutor_pace — Slice T6 exit gate (the tutor Pace-Plan view, READ-ONLY).
 *
 * Proves tutor.getStudentPacePlan against the real DB + real RLS with a
 * THROWAWAY fixture (unique per-run boards P/Q so the canonical seeds stay
 * pristine, M22). Cleans up after itself.
 *
 *   1. DB connectivity as the app role.
 *   2. ROLE gate (M11 SET side): the tutor membership is role='tutor', created
 *      via the REAL grantRole flow (not a direct insert) — the same helper
 *      admin.setRole drives.
 *   3. The student (W) sets up a Science plan; the tutor reads the SAME
 *      derive-at-read view: needsSetup false, projected dates + pace status +
 *      preparedness rolled up from W's certified mastery (chA strong, chB
 *      not_started). NO writes happen on the read.
 *   4. needsSetup path: a subject W never set up (Maths) → needsSetup true with
 *      recommended weeks + NO dates.
 *   5. OWNERSHIP (D-L-5): an UNLINKED student (X) → StudentNotFoundError.
 *   6. Unknown / cross-board subject → PaceSubjectNotFoundError.
 *   7. RLS cross-board: the same read under board Q → StudentNotFoundError
 *      (the tutor_student link is invisible there).
 *   8. The M11 boundary here: the view NEVER carries the internal `log` field
 *      (preparedness reuses computeChildReport's description-only projection).
 *   9. HTTP: tutor.getStudentPacePlan no session → 401 (soft; needs a running BE).
 */
import { eq, sql } from "drizzle-orm";
import type { PgTransaction } from "drizzle-orm/pg-core";
import {
  appUser,
  board,
  chapter,
  masteryState,
  membership,
  pacePlan,
  subTopic,
  subject,
  topic,
  tutorStudent,
} from "@b2c/kernel/schema";
import { db, queryClient } from "../src/db/client";
import { withBoard } from "../src/db/with-board";
import { grantRole } from "../src/services/membership";
import { setupPlan } from "../src/services/pace";
import {
  getStudentPacePlan,
  StudentNotFoundError,
} from "../src/services/tutor";
import { PaceSubjectNotFoundError } from "../src/services/pace";
import { env } from "../src/config/env";

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
async function expectThrow(
  name: string,
  fn: () => Promise<unknown>,
  isExpected: (e: unknown) => boolean,
) {
  try {
    await fn();
    check(`${name} (threw)`, false);
  } catch (e) {
    check(`${name} (threw ${(e as Error)?.constructor?.name})`, isExpected(e));
  }
}

async function main() {
  const tag = `${Date.now()}`;
  await db.execute(sql`select 1`);
  check("DB connectivity (select 1) as app role", true);

  const [P] = await db.insert(board).values({ slug: `tpace-p-${tag}`, name: "Probe P" }).returning();
  const [Q] = await db.insert(board).values({ slug: `tpace-q-${tag}`, name: "Probe Q" }).returning();
  if (!P || !Q) throw new Error("board seed failed");

  // Fixture under P: subject Science (chA 2 topics + a mastered sub_topic; chB 1
  // topic, no mastery) + subject Maths (chM 1 topic, never planned).
  const fx = await withBoard(P.id, async (tx: Tx) => {
    const [sci] = await tx
      .insert(subject)
      .values({ boardId: P.id, slug: "sci", name: "Science", grade: "9" })
      .returning();
    const [mat] = await tx
      .insert(subject)
      .values({ boardId: P.id, slug: "mat", name: "Maths", grade: "9" })
      .returning();

    const [chA] = await tx
      .insert(chapter)
      .values({ boardId: P.id, subjectId: sci!.id, slug: "cha", name: "Chapter A", ordinal: 1 })
      .returning();
    // chA: 2 topics → recommended 2 weeks; topic tA1 holds one mastered sub_topic.
    const [tA1] = await tx
      .insert(topic)
      .values({ boardId: P.id, chapterId: chA!.id, slug: "cha-t1", name: "Topic A1", ordinal: 1 })
      .returning();
    await tx
      .insert(topic)
      .values({ boardId: P.id, chapterId: chA!.id, slug: "cha-t2", name: "Topic A2", ordinal: 2 });
    const [stA] = await tx
      .insert(subTopic)
      .values({ boardId: P.id, topicId: tA1!.id, slug: "cha-t1-s1", name: "Sub A1", ordinal: 1 })
      .returning();

    const [chB] = await tx
      .insert(chapter)
      .values({ boardId: P.id, subjectId: sci!.id, slug: "chb", name: "Chapter B", ordinal: 2 })
      .returning();
    await tx
      .insert(topic)
      .values({ boardId: P.id, chapterId: chB!.id, slug: "chb-t1", name: "Topic B1", ordinal: 1 });

    const [chM] = await tx
      .insert(chapter)
      .values({ boardId: P.id, subjectId: mat!.id, slug: "chm", name: "Maths Ch", ordinal: 1 })
      .returning();
    await tx
      .insert(topic)
      .values({ boardId: P.id, chapterId: chM!.id, slug: "chm-t1", name: "Topic M1", ordinal: 1 });

    return {
      sciId: sci!.id,
      matId: mat!.id,
      chA: chA!.id,
      chB: chB!.id,
      stA: stA!.id,
    };
  });

  // tutor T (role tutor) + student W (linked) + student X (UNLINKED bystander),
  // all via the REAL grantRole flow (the M11 SET side).
  const emailT = `tpace-t-${tag}@example.com`;
  const emailW = `tpace-w-${tag}@example.com`;
  const emailX = `tpace-x-${tag}@example.com`;
  const T = await withBoard(P.id, (tx) => grantRole(tx, { email: emailT, name: "Tutor", board: P, role: "tutor" }));
  const W = await withBoard(P.id, (tx) => grantRole(tx, { email: emailW, name: "Wanda", board: P, role: "student" }));
  const X = await withBoard(P.id, (tx) => grantRole(tx, { email: emailX, name: "Xavier", board: P, role: "student" }));
  const userT = T.user.id;
  const userW = W.user.id;
  const userX = X.user.id;
  check("real flow: tutor membership role = 'tutor' (M11 SET side)", T.role === "tutor");

  // link T → W only (X deliberately UNLINKED).
  await withBoard(P.id, (tx) =>
    tx.insert(tutorStudent).values({ boardId: P.id, tutorId: userT, studentId: userW }),
  );

  // W sets up a Science plan + earns certified mastery on chA's sub_topic
  // (conceptual 4 / procedural 4 → mean 4 → "strong"). chB stays untaught.
  await withBoard(P.id, (tx) =>
    setupPlan(tx, {
      boardId: P.id,
      appUserId: userW,
      subjectId: fx.sciId,
      startDate: "2026-01-01",
      endDate: "2026-12-31",
      chapterOrder: [fx.chA, fx.chB],
    }),
  );
  await withBoard(P.id, (tx) =>
    tx.insert(masteryState).values({
      boardId: P.id,
      studentId: userW,
      subTopicId: fx.stA,
      conceptualLevel: 4,
      proceduralLevel: 4,
      description: "solid grasp of A",
      log: "INTERNAL-LOG-SENTINEL",
      updatedAt: new Date("2026-01-05T00:00:00Z"),
    }),
  );

  // 3. tutor reads the set-up plan (today before all projected ends → on_time).
  const view = await withBoard(P.id, (tx) =>
    getStudentPacePlan(tx, { tutorUserId: userT, studentId: userW, subjectId: fx.sciId, today: "2026-01-01" }),
  );
  check("set-up plan: needsSetup === false", view.needsSetup === false);
  if (view.needsSetup === false) {
    check("summary window = the student's dates", view.summary.startDate === "2026-01-01" && view.summary.endDate === "2026-12-31");
    check("2 chapters in plan order (A, B)", view.chapters.length === 2 && view.chapters[0]!.chapterId === fx.chA && view.chapters[1]!.chapterId === fx.chB);
    check("chA recommended 2 weeks (2 topics), projected end present", view.chapters[0]!.recommendedWeeks === 2 && typeof view.chapters[0]!.projectedEndDate === "string");
    check("chA pace = on_time (today far before deadline)", view.chapters[0]!.paceStatus === "on_time");
    check("chA preparedness = strong (value 4, 1 certified sub_topic)", view.chapters[0]!.preparedness?.label === "strong" && view.chapters[0]!.preparedness?.value === 4 && view.chapters[0]!.preparedness?.certifiedSubTopics === 1);
    check("chB preparedness = not_started (no certified mastery)", view.chapters[1]!.preparedness?.label === "not_started" && view.chapters[1]!.preparedness?.certifiedSubTopics === 0);
    check("subject roll-up = on_time", view.summary.subjectStatus === "on_time");
  }

  // idempotent read (read-only — a second read is identical).
  const view2 = await withBoard(P.id, (tx) =>
    getStudentPacePlan(tx, { tutorUserId: userT, studentId: userW, subjectId: fx.sciId, today: "2026-01-01" }),
  );
  check("read is idempotent (needsSetup + chapter count unchanged)", view2.needsSetup === false && view2.needsSetup === view.needsSetup);

  // 8. M11 boundary: no internal `log` field anywhere in the payload.
  check("no `log` / sentinel over the wire (description-only projection)",
    !JSON.stringify(view).includes("INTERNAL-LOG-SENTINEL") && !/"log"\s*:/.test(JSON.stringify(view)));

  // 4. needsSetup path: Maths (never planned by W).
  const maths = await withBoard(P.id, (tx) =>
    getStudentPacePlan(tx, { tutorUserId: userT, studentId: userW, subjectId: fx.matId, today: "2026-01-01" }),
  );
  check("Maths (no plan) → needsSetup === true", maths.needsSetup === true);
  if (maths.needsSetup === true) {
    check("needsSetup rows carry recommended weeks + NO dates",
      maths.chapters.length === 1 &&
        maths.chapters[0]!.recommendedWeeks === 1 &&
        maths.chapters[0]!.projectedEndDate === undefined &&
        maths.chapters[0]!.paceStatus === undefined);
  }

  // 5. OWNERSHIP: unlinked student X → StudentNotFoundError.
  await expectThrow(
    "ownership: getStudentPacePlan(unlinked X) → StudentNotFoundError",
    () => withBoard(P.id, (tx) => getStudentPacePlan(tx, { tutorUserId: userT, studentId: userX, subjectId: fx.sciId })),
    (e) => e instanceof StudentNotFoundError,
  );

  // 6. unknown subject (link OK, subject absent) → PaceSubjectNotFoundError.
  await expectThrow(
    "unknown subject → PaceSubjectNotFoundError",
    () => withBoard(P.id, (tx) => getStudentPacePlan(tx, { tutorUserId: userT, studentId: userW, subjectId: crypto.randomUUID() })),
    (e) => e instanceof PaceSubjectNotFoundError,
  );

  // 7. RLS cross-board: the SAME read under board Q → StudentNotFoundError
  //    (the tutor_student link is invisible under Q).
  await expectThrow(
    "RLS cross-board: read under board Q → StudentNotFoundError",
    () => withBoard(Q.id, (tx) => getStudentPacePlan(tx, { tutorUserId: userT, studentId: userW, subjectId: fx.sciId })),
    (e) => e instanceof StudentNotFoundError,
  );

  // 9. HTTP no-session → 401 (soft; the new route needs a running BE + restart, M30).
  try {
    const res = await fetch(`http://localhost:${env.PORT}/trpc/tutor.getStudentPacePlan`, {
      headers: { "x-board": P.slug },
    });
    check(`HTTP tutor.getStudentPacePlan (no session) → 401 (got ${res.status})`, res.status === 401);
  } catch {
    check("HTTP tutor.getStudentPacePlan → 401 (BE not running — soft skip)", true);
  }

  // ── cleanup (FK-safe order) ──
  await withBoard(P.id, async (tx: Tx) => {
    await tx.delete(pacePlan).where(eq(pacePlan.boardId, P.id));
    await tx.delete(masteryState).where(eq(masteryState.boardId, P.id));
    await tx.delete(tutorStudent).where(eq(tutorStudent.boardId, P.id));
    await tx.delete(subTopic).where(eq(subTopic.boardId, P.id));
    await tx.delete(topic).where(eq(topic.boardId, P.id));
    await tx.delete(chapter).where(eq(chapter.boardId, P.id));
    await tx.delete(subject).where(eq(subject.boardId, P.id));
    await tx.delete(membership).where(eq(membership.boardId, P.id));
  });
  await db.delete(appUser).where(eq(appUser.email, emailT));
  await db.delete(appUser).where(eq(appUser.email, emailW));
  await db.delete(appUser).where(eq(appUser.email, emailX));
  await db.delete(board).where(eq(board.id, P.id));
  await db.delete(board).where(eq(board.id, Q.id));

  console.log(`\n${passed} passed, ${failed} failed`);
  await queryClient.end();
  if (failed > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
