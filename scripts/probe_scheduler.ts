/**
 * probe_scheduler — Slice SCH exit gate (the spiral due-queue, #3; PURE CODE).
 *
 * Proves getDueQueue against the real DB + real RLS, using a THROWAWAY fixture
 * (unique per-run boards P/Q) so the canonical seeds stay pristine (M22). Cleans
 * up after itself. Dates are seeded relative to a FIXED asOf for determinism.
 *
 *  1. DB connectivity as the app role.
 *  2. computeRetentionDue (unit): anchor + ladder by procedural; null below L2.
 *  3. OWNERSHIP: getDueQueue for an UNLINKED student → StudentNotFoundError.
 *  4. ASSESS-FIX-3 — retention is DERIVED here (code owns the ladder);
 *     scheduling_state.retention_next_due is GONE (migration 0021).
 *  4b. THE ANCHOR — retention counts from the student's LAST PRACTICE (latest
 *     Stage-1 observation), not the Stage-2 finalize. H: certified 2 days ago but
 *     last practised 20 days ago → due (overdue 13). Finalize-anchored it would be
 *     asOf+5 and absent. A late-certifying tutor must not postpone anti-fade.
 *  5. min-reconcile (§6): B's effectiveDue = retention (earlier than climb);
 *     C's effectiveDue = climb (earlier than retention).
 *  6. DUE filter + most-overdue-first sort: subject S1 → [A(7), B(6), C(1)].
 *  7. Exclusions: D (not due — both dates future), E (taughtAt null — never
 *     taught), F (procedural 1, no climb — below retention floor, no due date).
 *  8. ≥3 SERVING gate: B/C interleave-eligible; A below (proc 2) → blocked.
 *     S1.interleaved = [B,C], S1.blocked = [A].
 *  9. SUBJECT scope (§6): S2's G/H are in their OWN group; they never join S1's
 *     bundle — composition never crosses subjects.
 * 10. RLS cross-board: getDueQueue under board Q → StudentNotFoundError (the
 *     tutor_student link is invisible there).
 * 11. HTTP: tutor.getDueQueue no session → 401 (soft).
 */
import { eq, sql } from "drizzle-orm";
import type { PgTransaction } from "drizzle-orm/pg-core";
import {
  appUser,
  observation,
  board,
  chapter,
  masteryState,
  membership,
  schedulingState,
  subTopic,
  subject,
  topic,
  tutorStudent,
} from "@b2c/kernel/schema";
import { db, queryClient } from "../src/db/client";
import { withBoard } from "../src/db/with-board";
import { grantRole } from "../src/services/membership";
import {
  computeRetentionDue,
  getDueQueue,
  RETENTION_LADDER_DAYS,
} from "../src/services/scheduler";
import { StudentNotFoundError } from "../src/services/tutor";
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

// Fixed reference point so every seeded date is deterministic.
const asOf = new Date("2026-06-15T12:00:00Z");
const DAY = 86_400_000;
const anchorBack = (days: number) => new Date(asOf.getTime() - days * DAY); // mastery.updatedAt
const dayStr = (offsetDays: number) =>
  new Date(asOf.getTime() + offsetDays * DAY).toISOString().slice(0, 10);

async function main() {
  const tag = `${Date.now()}`;

  // 1. connectivity
  await db.execute(sql`select 1`);
  check("DB connectivity (select 1) as app role", true);

  // 2. computeRetentionDue unit checks
  check(
    "computeRetentionDue: proc2 → anchor + 3 days",
    computeRetentionDue(anchorBack(0), 2) === dayStr(3),
  );
  check(
    "computeRetentionDue: proc5 → anchor + 21 days (cap)",
    computeRetentionDue(anchorBack(0), 5) === dayStr(21),
  );
  check("computeRetentionDue: proc1 (below floor) → null", computeRetentionDue(anchorBack(0), 1) === null);
  check("RETENTION_LADDER_DAYS = {2:3,3:7,4:14,5:21}",
    RETENTION_LADDER_DAYS[2] === 3 && RETENTION_LADDER_DAYS[3] === 7 &&
    RETENTION_LADDER_DAYS[4] === 14 && RETENTION_LADDER_DAYS[5] === 21);

  const [P] = await db.insert(board).values({ slug: `psch-p-${tag}`, name: "Probe P" }).returning();
  const [Q] = await db.insert(board).values({ slug: `psch-q-${tag}`, name: "Probe Q" }).returning();
  if (!P || !Q) throw new Error("board seed failed");

  // Spine under P: subject S1 (chapters C1, C2 → cross-chapter) + subject S2 (C3).
  const fx = await withBoard(P.id, async (tx: Tx) => {
    const [s1] = await tx.insert(subject).values({ boardId: P.id, slug: "phys", name: "Physics", grade: "IGCSE" }).returning();
    const [s2] = await tx.insert(subject).values({ boardId: P.id, slug: "bio", name: "Biology", grade: "IGCSE" }).returning();
    const [c1] = await tx.insert(chapter).values({ boardId: P.id, subjectId: s1!.id, slug: "c1", name: "Ch1", ordinal: 1 }).returning();
    const [c2] = await tx.insert(chapter).values({ boardId: P.id, subjectId: s1!.id, slug: "c2", name: "Ch2", ordinal: 2 }).returning();
    const [c3] = await tx.insert(chapter).values({ boardId: P.id, subjectId: s2!.id, slug: "c3", name: "Ch3", ordinal: 1 }).returning();
    const [t1] = await tx.insert(topic).values({ boardId: P.id, chapterId: c1!.id, slug: "t1", name: "T1", ordinal: 1 }).returning();
    const [t2] = await tx.insert(topic).values({ boardId: P.id, chapterId: c2!.id, slug: "t2", name: "T2", ordinal: 1 }).returning();
    const [t3] = await tx.insert(topic).values({ boardId: P.id, chapterId: c3!.id, slug: "t3", name: "T3", ordinal: 1 }).returning();
    const st = async (topicId: string, slug: string, name: string, ordinal: number) =>
      (await tx.insert(subTopic).values({ boardId: P.id, topicId, slug, name, ordinal }).returning())[0]!.id;
    return {
      s1: s1!.id, s2: s2!.id,
      A: await st(t1!.id, "a", "ST A", 1),
      B: await st(t1!.id, "b", "ST B", 2),
      D: await st(t1!.id, "d", "ST D", 3),
      E: await st(t1!.id, "e", "ST E", 4),
      F: await st(t1!.id, "f", "ST F", 5),
      C: await st(t2!.id, "c", "ST C", 1),
      G: await st(t3!.id, "g", "ST G", 1),
      H: await st(t3!.id, "h", "ST H", 2),
    };
  });

  // tutor TU + student ST via the REAL flow (grantRole), linked.
  const emailTU = `psch-tu-${tag}@example.com`;
  const emailST = `psch-st-${tag}@example.com`;
  const TU = await withBoard(P.id, (tx) => grantRole(tx, { email: emailTU, name: "Tutor", board: P, role: "tutor" }));
  const ST = await withBoard(P.id, (tx) => grantRole(tx, { email: emailST, name: "Student", board: P, role: "student" }));
  const tutorUserId = TU.user.id;
  const studentId = ST.user.id;
  check("real flow: tutor role = 'tutor' (M11 SET side)", TU.role === "tutor");
  await withBoard(P.id, (tx) => tx.insert(tutorStudent).values({ boardId: P.id, tutorId: tutorUserId, studentId }));

  // mastery_state + scheduling_state fixtures (see header for the matrix).
  await withBoard(P.id, async (tx: Tx) => {
    const mastery = (subTopicId: string, c: number, p: number, updatedAt: Date) =>
      tx.insert(masteryState).values({
        boardId: P.id, studentId, subTopicId,
        conceptualLevel: c, proceduralLevel: p,
        description: "desc", log: "log", updatedAt,
      });
    const sched = (subTopicId: string, taughtAt: Date | null, climb: string | null) =>
      tx.insert(schedulingState).values({
        boardId: P.id, studentId, subTopicId,
        taughtAt, climbNextDue: climb,
      });

    // A–G carry NO observations → they exercise the FALLBACK anchor
    // (mastery.updatedAt). H below exercises the real one (last practice).
    //
    // A: proc2 → retention anchor(-10)+3 = asOf-7 (overdue 7). climb null. BELOW gate.
    await mastery(fx.A, 2, 2, anchorBack(10));
    await sched(fx.A, anchorBack(10), null);
    // B: 4/4 → retention anchor(-20)+14 = asOf-6 (overdue 6). climb asOf-2. min → retention.
    await mastery(fx.B, 4, 4, anchorBack(20));
    await sched(fx.B, anchorBack(20), dayStr(-2));
    // C: 3/3 (chapter C2) → retention anchor(-2)+7 = asOf+5 (future). climb asOf-1. min → climb (overdue 1).
    await mastery(fx.C, 3, 3, anchorBack(2));
    await sched(fx.C, anchorBack(2), dayStr(-1));
    // D: 3/5 → retention anchor(-2)+21 = asOf+19 (future). climb null. NOT DUE.
    await mastery(fx.D, 3, 5, anchorBack(2));
    await sched(fx.D, anchorBack(2), null);
    // E: taughtAt NULL (never taught) — excluded even though climb is overdue.
    await mastery(fx.E, 3, 3, anchorBack(10));
    await sched(fx.E, null, dayStr(-5));
    // F: proc1 (below retention floor) → retention null. climb null. NO due date.
    await mastery(fx.F, 3, 1, anchorBack(10));
    await sched(fx.F, anchorBack(10), null);
    // G: subject S2, 3/3 → retention anchor(-10)+7 = asOf-3 (overdue 3). eligible.
    await mastery(fx.G, 3, 3, anchorBack(10));
    await sched(fx.G, anchorBack(10), null);

    // H (ASSESS-FIX-3, subject S2): the ANCHOR test. The tutor finalized only 2 days
    // ago (updatedAt = asOf-2) but the student last PRACTISED it 20 days ago — the
    // tutor certified late. 3/3 → ladder 7.
    //   anchored on the FINALIZE  (old, wrong): asOf-2 +7  = asOf+5  → NOT due.
    //   anchored on LAST PRACTICE (correct):    asOf-20 +7 = asOf-13 → OVERDUE 13.
    // H appearing in the queue, overdue 13, is the whole fix. A late-certifying tutor
    // must not silently postpone a student's anti-fade check.
    await mastery(fx.H, 3, 3, anchorBack(2));
    await sched(fx.H, anchorBack(2), null);
    await tx.insert(observation).values({
      boardId: P.id, studentId, subTopicId: fx.H, axis: "procedural",
      observationLevel: 3, reasoning: "last actual practice — 20 days before the tutor got round to certifying",
      source: "stage1_scorer", createdAt: anchorBack(20),
    });
  });

  // 3. OWNERSHIP: an unlinked student → StudentNotFoundError
  let ownerThrew = false;
  try {
    await withBoard(P.id, (tx) => getDueQueue(tx, { tutorUserId, studentId: studentId.replace(/.$/, "0"), asOf }));
  } catch (e) {
    ownerThrew = e instanceof StudentNotFoundError;
  }
  check("ownership: getDueQueue(unlinked student) → StudentNotFoundError", ownerThrew);

  // The queue.
  const groups = await withBoard(P.id, (tx) => getDueQueue(tx, { tutorUserId, studentId, asOf }));
  const byId = new Map(groups.map((g) => [g.subjectId, g]));
  const s1 = byId.get(fx.s1);
  const s2 = byId.get(fx.s2);

  check("2 subject groups (S1, S2)", groups.length === 2 && !!s1 && !!s2);

  // 6. S1 due filter + sort
  const s1ids = (s1?.items ?? []).map((i) => i.subTopicId);
  check("S1 → 3 due items (D/E/F excluded)", s1?.items.length === 3);
  check("S1 most-overdue-first → [A, B, C]",
    s1ids[0] === fx.A && s1ids[1] === fx.B && s1ids[2] === fx.C);
  const itA = s1?.items.find((i) => i.subTopicId === fx.A);
  const itB = s1?.items.find((i) => i.subTopicId === fx.B);
  const itC = s1?.items.find((i) => i.subTopicId === fx.C);
  check("A overdue 7, B overdue 6, C overdue 1",
    itA?.overdueDays === 7 && itB?.overdueDays === 6 && itC?.overdueDays === 1);

  // 4. D-SCH-1 / ASSESS-FIX-3: retention is DERIVED here (code owns the ladder);
  //    scheduling_state.retention_next_due no longer exists (migration 0021).
  check("ASSESS-FIX-3: A.retentionDue = anchor+ladder (asOf-7), derived not stored",
    itA?.retentionDue === dayStr(-7));
  check("ASSESS-FIX-3: no retentionNextDue key anywhere in the queue payload",
    !/retentionNextDue/.test(JSON.stringify(groups)));
  check("A.climbDue null, A.effectiveDue = retention", itA?.climbDue === null && itA?.effectiveDue === dayStr(-7));

  // 5. min-reconcile
  check("min-reconcile: B.effectiveDue = retention (earlier than climb)",
    itB?.effectiveDue === dayStr(-6) && itB?.retentionDue === dayStr(-6) && itB?.climbDue === dayStr(-2));
  check("min-reconcile: C.effectiveDue = climb (earlier than retention)",
    itC?.effectiveDue === dayStr(-1) && itC?.climbDue === dayStr(-1) && itC?.retentionDue === dayStr(5));

  // 7. exclusions
  check("exclusion: D (both dates future) not in queue", !s1ids.includes(fx.D));
  check("exclusion: E (taughtAt null) not in queue", !s1ids.includes(fx.E));
  check("exclusion: F (proc1, no climb → no due date) not in queue", !s1ids.includes(fx.F));

  // 8. ≥3 serving gate + composition
  check("gate: B/C interleave-eligible, A below (proc 2) → blocked",
    itB?.interleaveEligible === true && itC?.interleaveEligible === true && itA?.interleaveEligible === false);
  check("S1.interleaved = [B, C]", JSON.stringify(s1?.interleaved) === JSON.stringify([fx.B, fx.C]));
  check("S1.blocked = [A]", JSON.stringify(s1?.blocked) === JSON.stringify([fx.A]));

  // 9. subject scope — G/H are in S2 only, never bundled into S1
  const itH = s2?.items.find((i) => i.subTopicId === fx.H);
  check("S2 → 2 items, most-overdue-first [H(13), G(3)]",
    s2?.items.length === 2 && s2?.items[0]?.subTopicId === fx.H && s2?.items[1]?.subTopicId === fx.G);
  check("subject scope: G/H not in S1's items/interleaved",
    !s1ids.includes(fx.G) && !s1ids.includes(fx.H) && !(s1?.interleaved ?? []).includes(fx.G));

  // 4b. ASSESS-FIX-3 — THE ANCHOR. H's tutor certified 2 days ago, but the student
  // last practised 20 days ago. Anchored on the finalize, H would be asOf+5 (absent
  // from the queue). Anchored on LAST PRACTICE it is asOf-13 — overdue, as it should be.
  check("ANCHOR: H is DUE at all (finalize-anchored it would be excluded)", !!itH);
  check("ANCHOR: H.retentionDue = lastPractice(-20)+7 = asOf-13, NOT finalize(-2)+7 = asOf+5",
    itH?.retentionDue === dayStr(-13) && itH?.retentionDue !== dayStr(5));
  check("ANCHOR: H overdue 13 days (a late-certifying tutor cannot postpone anti-fade)",
    itH?.overdueDays === 13 && itH?.effectiveDue === dayStr(-13));

  // 10. RLS cross-board
  let crossThrew = false;
  try {
    await withBoard(Q.id, (tx) => getDueQueue(tx, { tutorUserId, studentId, asOf }));
  } catch (e) {
    crossThrew = e instanceof StudentNotFoundError;
  }
  check("RLS: getDueQueue under another board → StudentNotFoundError", crossThrew);

  // 11. HTTP no-session → 401 (soft)
  try {
    const res = await fetch(`http://localhost:${env.PORT}/trpc/tutor.getDueQueue?input=${encodeURIComponent(JSON.stringify({ json: { studentId } }))}`, { headers: { "x-board": P.slug } });
    check(`HTTP tutor.getDueQueue (no session) → 401 (got ${res.status})`, res.status === 401);
  } catch {
    console.log("  ~ HTTP tutor.getDueQueue skipped (server not running)");
  }

  // ── cleanup (FK-safe order) ──
  await withBoard(P.id, async (tx: Tx) => {
    await tx.delete(observation).where(eq(observation.boardId, P.id));
    await tx.delete(schedulingState).where(eq(schedulingState.boardId, P.id));
    await tx.delete(masteryState).where(eq(masteryState.boardId, P.id));
    await tx.delete(tutorStudent).where(eq(tutorStudent.boardId, P.id));
    await tx.delete(subTopic).where(eq(subTopic.boardId, P.id));
    await tx.delete(topic).where(eq(topic.boardId, P.id));
    await tx.delete(chapter).where(eq(chapter.boardId, P.id));
    await tx.delete(subject).where(eq(subject.boardId, P.id));
    await tx.delete(membership).where(eq(membership.boardId, P.id));
  });
  await db.delete(appUser).where(eq(appUser.email, emailTU));
  await db.delete(appUser).where(eq(appUser.email, emailST));
  await db.delete(board).where(eq(board.id, P.id));
  await db.delete(board).where(eq(board.id, Q.id));

  console.log(`\nprobe_scheduler: ${passed} passed, ${failed} failed`);
  await queryClient.end();
  process.exit(failed === 0 ? 0 : 1);
}

main().catch(async (err) => {
  console.error("probe_scheduler FAILED:", err);
  await queryClient.end();
  process.exit(1);
});
