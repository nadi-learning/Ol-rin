/**
 * probe_pace_plan — Slice PACE-1 exit gate (student Pace Plan).
 *
 * Real DB + real RLS, THROWAWAY boards P/Q per run (M22), cleans up after itself.
 * The clock is INJECTED (getPlan's `today` arg) so pace-status thresholds are
 * asserted deterministically without depending on the real date.
 *
 * Fixture (board P, subject S): 3 chapters with different topic counts →
 *   chA: 2 topics → 2 weeks → 14 days
 *   chB: 3 topics → 3 weeks → 21 days
 *   chC: 0 topics → flat fallback 2 weeks → 14 days (D-PACE-2)
 * Plan window start 2026-01-01, order [chA, chB, chC] → projected ends
 *   chA 2026-01-15 · chB 2026-02-05 · chC 2026-02-19 (laid end-to-end).
 *
 * Coverage: needs-setup view · recommended-weeks proxy + fallback · projection
 * math · all pace thresholds (on_time/delay_risk/amber/red) · complete flag +
 * subject roll-up · budget (under/over) · reorder shifts ranges · estimate
 * OVERRIDE (override wins over proxy, dates/budget recompute, bounds validation,
 * survives a carrying reorder, resets to proxy — PACE-1.1/D-PACE-10) · validation
 * (bad dates / bad chapter) · OWNERSHIP (a bystander's plan never bleeds in,
 * D-L-5) · cross-board RLS · HTTP 401.
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
  whitelist,
} from "@b2c/kernel/schema";
import { db, queryClient } from "../src/db/client";
import { withBoard } from "../src/db/with-board";
import { resolveMembership } from "../src/services/membership";
import {
  getPlan,
  listSubjects,
  PaceSubjectNotFoundError,
  PaceValidationError,
  setupPlan,
  updatePlan,
} from "../src/services/pace";
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
async function expectThrow(name: string, fn: () => Promise<unknown>, isExpected: (e: unknown) => boolean) {
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

  const [P] = await db.insert(board).values({ slug: `pace-p-${tag}`, name: "Probe P" }).returning();
  const [Q] = await db.insert(board).values({ slug: `pace-q-${tag}`, name: "Probe Q" }).returning();
  if (!P || !Q) throw new Error("board seed failed");

  // Fixture under P: subject S + 3 chapters (chA 2 topics, chB 3 topics, chC 0).
  const fx = await withBoard(P.id, async (tx: Tx) => {
    const [subj] = await tx
      .insert(subject)
      .values({ boardId: P.id, slug: "sci", name: "Science", grade: "9" })
      .returning();
    const mk = async (slug: string, name: string, ordinal: number, topicCount: number) => {
      const [c] = await tx
        .insert(chapter)
        .values({ boardId: P.id, subjectId: subj!.id, slug, name, ordinal })
        .returning();
      for (let i = 0; i < topicCount; i++) {
        await tx
          .insert(topic)
          .values({ boardId: P.id, chapterId: c!.id, slug: `${slug}-t${i}`, name: `T${i}`, ordinal: i + 1 });
      }
      return c!.id;
    };
    const chA = await mk("cha", "Chapter A", 1, 2); // 2 weeks
    const chB = await mk("chb", "Chapter B", 2, 3); // 3 weeks
    const chC = await mk("chc", "Chapter C", 3, 0); // 0 topics → fallback 2 weeks
    return { subjectId: subj!.id, chA, chB, chC };
  });

  // members: W (caller) + X (bystander).
  const emailW = `pace-w-${tag}@example.com`;
  const emailX = `pace-x-${tag}@example.com`;
  await withBoard(P.id, async (tx: Tx) => {
    for (const email of [emailW, emailX])
      await tx.insert(whitelist).values({ boardId: P.id, email, role: "student" });
  });
  const W = await withBoard(P.id, (tx) => resolveMembership(tx, { email: emailW, name: "W", board: P }));
  const X = await withBoard(P.id, (tx) => resolveMembership(tx, { email: emailX, name: "X", board: P }));
  const userW = W.user.id;
  const userX = X.user.id;
  // self ChildSummary drives getPlan's plan lookup + the PACE-2 preparedness read.
  const selfW = { studentId: userW, name: "W", email: emailW };
  const selfX = { studentId: userX, name: "X", email: emailX };

  // 1. listSubjects sees S
  const subs = await withBoard(P.id, (tx) => listSubjects(tx));
  check("listSubjects includes S", subs.some((s) => s.id === fx.subjectId));

  // 2. needs-setup view (no plan yet): registry order + recommended weeks, no dates
  const pre = await withBoard(P.id, (tx) => getPlan(tx, { self: selfW, subjectId: fx.subjectId, today: "2026-01-01" }));
  check("needsSetup === true (no plan yet)", pre.needsSetup === true);
  if (pre.needsSetup) {
    check("needs-setup: 3 chapters in ordinal order (A,B,C)", pre.chapters.map((c) => c.chapterId).join() === [fx.chA, fx.chB, fx.chC].join());
    check("recommended weeks proxy: chA=2, chB=3", pre.chapters[0]!.recommendedWeeks === 2 && pre.chapters[1]!.recommendedWeeks === 3);
    check("recommended weeks FALLBACK: chC (0 topics) = 2", pre.chapters[2]!.recommendedWeeks === 2);
    check("needs-setup rows carry NO projected dates", pre.chapters.every((c) => c.projectedEndDate === undefined && c.paceStatus === undefined));
    check("defaultStartDate present", typeof pre.defaultStartDate === "string");
  }

  // 3. setup the plan: start 2026-01-01, order [A,B,C], generous deadline
  await withBoard(P.id, (tx) => setupPlan(tx, { boardId: P.id, appUserId: userW, subjectId: fx.subjectId, startDate: "2026-01-01", endDate: "2026-12-31", chapterOrder: [fx.chA, fx.chB, fx.chC] }));

  // 4. projection math (today far before everything → all on_time)
  const v = await withBoard(P.id, (tx) => getPlan(tx, { self: selfW, subjectId: fx.subjectId, today: "2026-01-01" }));
  check("needsSetup === false after setup", v.needsSetup === false);
  if (!v.needsSetup) {
    const [a, b, c] = v.chapters;
    check("chA projected 2026-01-01 → 2026-01-15", a!.projectedStartDate === "2026-01-01" && a!.projectedEndDate === "2026-01-15");
    check("chB projected 2026-01-15 → 2026-02-05 (end-to-end)", b!.projectedStartDate === "2026-01-15" && b!.projectedEndDate === "2026-02-05");
    check("chC projected 2026-02-05 → 2026-02-19", c!.projectedStartDate === "2026-02-05" && c!.projectedEndDate === "2026-02-19");
    check("budget: total 49d < available 364d → under", v.summary.totalRecommendedDays === 49 && v.summary.budgetStatus === "under");
    check("all on_time (today before all ends) → subjectStatus on_time", a!.paceStatus === "on_time" && v.summary.subjectStatus === "on_time");
    // PACE-2 baseline: no mastery seeded yet → every chapter reads not_started.
    check(
      "preparedness: all chapters not_started (no certified mastery yet)",
      v.chapters.every(
        (ch) => ch.preparedness?.label === "not_started" && ch.preparedness?.value === null && ch.preparedness?.certifiedSubTopics === 0,
      ),
    );
  }

  // 5. pace thresholds — one call at today = chB.end + 10 exercises red/amber/on_time
  const v2 = await withBoard(P.id, (tx) => getPlan(tx, { self: selfW, subjectId: fx.subjectId, today: "2026-02-15" }));
  if (!v2.needsSetup) {
    const [a, b, c] = v2.chapters;
    check("chA (31d past) → red", a!.paceStatus === "red");
    check("chB (10d past) → amber", b!.paceStatus === "amber");
    check("chC (4d before) → on_time", c!.paceStatus === "on_time");
    check("subjectStatus = worst non-completed = red", v2.summary.subjectStatus === "red");
  }
  // delay_risk band (chA.end + 3 days)
  const v3 = await withBoard(P.id, (tx) => getPlan(tx, { self: selfW, subjectId: fx.subjectId, today: "2026-01-18" }));
  check("chA (3d past) → delay_risk", !v3.needsSetup && v3.chapters[0]!.paceStatus === "delay_risk");

  // 6. mark chA complete → its status is 'completed'; roll-up ignores it
  await withBoard(P.id, (tx) => updatePlan(tx, { appUserId: userW, subjectId: fx.subjectId, chapters: [{ chapterId: fx.chA, completed: true }, { chapterId: fx.chB, completed: false }, { chapterId: fx.chC, completed: false }] }));
  const v4 = await withBoard(P.id, (tx) => getPlan(tx, { self: selfW, subjectId: fx.subjectId, today: "2026-02-15" }));
  if (!v4.needsSetup) {
    check("chA marked complete → paceStatus 'completed'", v4.chapters[0]!.paceStatus === "completed" && v4.chapters[0]!.completed === true);
    check("subjectStatus = worst NON-completed (amber, not red)", v4.summary.subjectStatus === "amber");
  }

  // 7. budget OVER when the window is tighter than the plan
  await withBoard(P.id, (tx) => updatePlan(tx, { appUserId: userW, subjectId: fx.subjectId, endDate: "2026-01-20" }));
  const v5 = await withBoard(P.id, (tx) => getPlan(tx, { self: selfW, subjectId: fx.subjectId, today: "2026-01-01" }));
  check("budget OVER: 49d plan > 19d window", !v5.needsSetup && v5.summary.budgetStatus === "over");

  // 8. reorder [C, A, B] → chC now starts at the window start
  await withBoard(P.id, (tx) => updatePlan(tx, { appUserId: userW, subjectId: fx.subjectId, chapters: [{ chapterId: fx.chC, completed: false }, { chapterId: fx.chA, completed: false }, { chapterId: fx.chB, completed: false }] }));
  const v6 = await withBoard(P.id, (tx) => getPlan(tx, { self: selfW, subjectId: fx.subjectId, today: "2026-01-01" }));
  if (!v6.needsSetup) {
    check("reorder: chC now order 0, starts 2026-01-01", v6.chapters[0]!.chapterId === fx.chC && v6.chapters[0]!.order === 0 && v6.chapters[0]!.projectedStartDate === "2026-01-01");
  }

  // 8b. ESTIMATE OVERRIDE (PACE-1.1, D-PACE-10): student sets chB to 5 weeks.
  // Reset to clean order [A,B,C] + generous deadline in the same write.
  await withBoard(P.id, (tx) => updatePlan(tx, { appUserId: userW, subjectId: fx.subjectId, startDate: "2026-01-01", endDate: "2026-12-31", chapters: [{ chapterId: fx.chA, completed: false }, { chapterId: fx.chB, completed: false, weeksOverride: 5 }, { chapterId: fx.chC, completed: false }] }));
  const ov = await withBoard(P.id, (tx) => getPlan(tx, { self: selfW, subjectId: fx.subjectId, today: "2026-01-01" }));
  if (!ov.needsSetup) {
    const [a, b, c] = ov.chapters;
    check("override: chB effective weeks = 5 (override wins over proxy 3), suggested still 3", b!.recommendedWeeks === 5 && b!.suggestedWeeks === 3 && b!.weeksOverride === 5);
    check("override: chA untouched (proxy 2, no override)", a!.recommendedWeeks === 2 && a!.suggestedWeeks === 2 && a!.weeksOverride === undefined);
    check("override: dates recompute (chB 35d → end 2026-02-19; chC 02-19→03-05)", b!.projectedEndDate === "2026-02-19" && c!.projectedStartDate === "2026-02-19" && c!.projectedEndDate === "2026-03-05");
    check("override: budget total recomputes 14+35+14 = 63d", ov.summary.totalRecommendedDays === 63);
  }

  // 8c. override validation bounds (0.5–52) — rejected writes leave the stored value intact
  await expectThrow("override > 52 weeks → PaceValidationError", () => withBoard(P.id, (tx) => updatePlan(tx, { appUserId: userW, subjectId: fx.subjectId, chapters: [{ chapterId: fx.chA, completed: false }, { chapterId: fx.chB, completed: false, weeksOverride: 100 }, { chapterId: fx.chC, completed: false }] })), (e) => e instanceof PaceValidationError);
  await expectThrow("override < 0.5 weeks → PaceValidationError", () => withBoard(P.id, (tx) => updatePlan(tx, { appUserId: userW, subjectId: fx.subjectId, chapters: [{ chapterId: fx.chA, completed: false }, { chapterId: fx.chB, completed: false, weeksOverride: 0 }, { chapterId: fx.chC, completed: false }] })), (e) => e instanceof PaceValidationError);
  const ovStill = await withBoard(P.id, (tx) => getPlan(tx, { self: selfW, subjectId: fx.subjectId, today: "2026-01-01" }));
  check("override survives rejected out-of-bound writes (chB still 5)", !ovStill.needsSetup && ovStill.chapters[1]!.weeksOverride === 5);

  // 8d. a reorder that CARRIES the override (the FE toList behaviour) preserves it
  await withBoard(P.id, (tx) => updatePlan(tx, { appUserId: userW, subjectId: fx.subjectId, chapters: [{ chapterId: fx.chB, completed: false, weeksOverride: 5 }, { chapterId: fx.chA, completed: false }, { chapterId: fx.chC, completed: false }] }));
  const ovReord = await withBoard(P.id, (tx) => getPlan(tx, { self: selfW, subjectId: fx.subjectId, today: "2026-01-01" }));
  check("override survives a reorder carrying it (chB now order 0, weeks 5)", !ovReord.needsSetup && ovReord.chapters[0]!.chapterId === fx.chB && ovReord.chapters[0]!.weeksOverride === 5);

  // 8e. RESET: sending chB WITHOUT weeksOverride clears it → back to proxy 3
  await withBoard(P.id, (tx) => updatePlan(tx, { appUserId: userW, subjectId: fx.subjectId, chapters: [{ chapterId: fx.chA, completed: false }, { chapterId: fx.chB, completed: false }, { chapterId: fx.chC, completed: false }] }));
  const ovReset = await withBoard(P.id, (tx) => getPlan(tx, { self: selfW, subjectId: fx.subjectId, today: "2026-01-01" }));
  check("reset: chB falls back to proxy (weeks 3, no override)", !ovReset.needsSetup && ovReset.chapters[1]!.recommendedWeeks === 3 && ovReset.chapters[1]!.weeksOverride === undefined);

  // 8f. PREPAREDNESS (PACE-2, D-PACE-4/11): roll certified two-axis mastery into a
  // per-chapter pill. Attach sub_topics to EXISTING topics (don't add topics — that
  // would change the recommended-weeks counts asserted above). chA gets 2 certified
  // sub_topics, chB gets 1, chC none. Bystander X also gets mastery on chA to prove
  // it never bleeds into W's roll-up (per-student scoping).
  await withBoard(P.id, async (tx: Tx) => {
    const [tA] = await tx.select({ id: topic.id }).from(topic).where(eq(topic.chapterId, fx.chA)).limit(1);
    const [tB] = await tx.select({ id: topic.id }).from(topic).where(eq(topic.chapterId, fx.chB)).limit(1);
    const mkSt = async (topicId: string, slug: string, ordinal: number) => {
      const [st] = await tx
        .insert(subTopic)
        .values({ boardId: P.id, topicId, slug, name: slug, ordinal })
        .returning();
      return st!.id;
    };
    const stA1 = await mkSt(tA!.id, "cha-st1", 1);
    const stA2 = await mkSt(tA!.id, "cha-st2", 2);
    const stB1 = await mkSt(tB!.id, "chb-st1", 1);
    const mkM = async (studentId: string, subTopicId: string, c: number, p: number) =>
      tx.insert(masteryState).values({
        boardId: P.id,
        studentId,
        subTopicId,
        conceptualLevel: c,
        proceduralLevel: p,
        description: "d",
        log: "internal",
      });
    // W: chA → mean(4,2)=3 and mean(4,4)=4 → chapter avg 3.5 (on_track);
    //    chB → mean(5,5)=5 (strong).
    await mkM(userW, stA1, 4, 2);
    await mkM(userW, stA2, 4, 4);
    await mkM(userW, stB1, 5, 5);
    // X: a HIGH mastery on chA's st1 — must NOT affect W's roll-up.
    await mkM(userX, stA1, 5, 5);
    // Touch the ids so the fixture reads self-documenting; nothing consumes them.
    void [stA1, stA2, stB1];
  });

  const pv = await withBoard(P.id, (tx) => getPlan(tx, { self: selfW, subjectId: fx.subjectId, today: "2026-01-01" }));
  if (!pv.needsSetup) {
    const byId = new Map(pv.chapters.map((ch) => [ch.chapterId, ch]));
    const pA = byId.get(fx.chA)!.preparedness!;
    const pB = byId.get(fx.chB)!.preparedness!;
    const pC = byId.get(fx.chC)!.preparedness!;
    check(
      "preparedness chA: avg of two-axis means (3 & 4) = 3.5 → on_track, 2 certified",
      pA.label === "on_track" && pA.value === 3.5 && pA.certifiedSubTopics === 2,
    );
    check(
      "preparedness chB: single sub_topic mean(5,5)=5 → strong, 1 certified",
      pB.label === "strong" && pB.value === 5 && pB.certifiedSubTopics === 1,
    );
    check(
      "preparedness chC: no certified sub_topics → not_started (null value)",
      pC.label === "not_started" && pC.value === null && pC.certifiedSubTopics === 0,
    );
    check(
      "preparedness NO BLEED: X's high chA mastery never inflates W's chA (still 3.5/2)",
      pA.value === 3.5 && pA.certifiedSubTopics === 2,
    );
  }

  // 9. validation
  await expectThrow("setup with endDate <= startDate → PaceValidationError", () => withBoard(P.id, (tx) => setupPlan(tx, { boardId: P.id, appUserId: userW, subjectId: fx.subjectId, startDate: "2026-05-01", endDate: "2026-05-01", chapterOrder: [fx.chA] })), (e) => e instanceof PaceValidationError);
  await expectThrow("setup with a chapter not in subject → PaceValidationError", () => withBoard(P.id, (tx) => setupPlan(tx, { boardId: P.id, appUserId: userW, subjectId: fx.subjectId, endDate: "2026-06-01", chapterOrder: [crypto.randomUUID()] })), (e) => e instanceof PaceValidationError);

  // 10. OWNERSHIP (D-L-5): bystander X has NO plan for S — W's plan is invisible
  const xView = await withBoard(P.id, (tx) => getPlan(tx, { self: selfX, subjectId: fx.subjectId, today: "2026-01-01" }));
  check("OWNERSHIP: bystander X sees needsSetup (W's plan never bleeds in)", xView.needsSetup === true);
  // and W's plan is unchanged by X existing
  const wStill = await withBoard(P.id, (tx) => getPlan(tx, { self: selfW, subjectId: fx.subjectId, today: "2026-01-01" }));
  check("OWNERSHIP: W's plan still set up", wStill.needsSetup === false);

  // 11. cross-board RLS: the P subject is invisible under a Q claim → NOT_FOUND
  await expectThrow("RLS: getPlan under board Q → PaceSubjectNotFoundError", () => withBoard(Q.id, (tx) => getPlan(tx, { self: selfW, subjectId: fx.subjectId, today: "2026-01-01" })), (e) => e instanceof PaceSubjectNotFoundError);

  // 12. HTTP no-session → 401 (soft)
  try {
    const res = await fetch(`http://localhost:${env.PORT}/trpc/pace.listSubjects`, { headers: { "x-board": P.slug } });
    check(`HTTP pace.listSubjects (no session) → 401 (got ${res.status})`, res.status === 401);
  } catch {
    console.log("  ~ HTTP pace.listSubjects skipped (server not running)");
  }

  // ── cleanup (FK-safe order) ──
  await withBoard(P.id, async (tx: Tx) => {
    await tx.delete(pacePlan).where(eq(pacePlan.boardId, P.id));
    await tx.delete(masteryState).where(eq(masteryState.boardId, P.id));
    await tx.delete(subTopic).where(eq(subTopic.boardId, P.id));
    await tx.delete(topic).where(eq(topic.boardId, P.id));
    await tx.delete(chapter).where(eq(chapter.boardId, P.id));
    await tx.delete(subject).where(eq(subject.boardId, P.id));
    await tx.delete(membership).where(eq(membership.boardId, P.id));
    await tx.delete(whitelist).where(eq(whitelist.boardId, P.id));
  });
  for (const email of [emailW, emailX]) await db.delete(appUser).where(eq(appUser.email, email));
  await db.delete(board).where(eq(board.id, P.id));
  await db.delete(board).where(eq(board.id, Q.id));

  console.log(`\nprobe_pace_plan: ${passed} passed, ${failed} failed`);
  await queryClient.end();
  process.exit(failed === 0 ? 0 : 1);
}

main().catch(async (err) => {
  console.error("probe_pace_plan FAILED:", err);
  await queryClient.end();
  process.exit(1);
});
