/**
 * probe_authoring_set — Slice QA3-e-2 exit gate (interleaved multi-sub-topic
 * parallel spawn: master proposes a SET across the interleaved chapters → fan out
 * one worker per sub_topic → collect into a multi-target review).
 *
 * Real DB + real RLS + REAL Gemini, throwaway boards P/Q (M22) with full cleanup.
 * Two-tier (don't over-read a single AI response — M13/M28):
 *   FIRM — the plumbing we control: the pre-flight scope guard is FAIL-FAST and
 *     ALL-OR-NOTHING (an out-of-scope target rejects the whole call BEFORE any AI
 *     spend, authoring nothing); a runtime worker failure is ISOLATED (allSettled →
 *     the `failures` contract), never sinks the batch; authoring_worker rows are
 *     RLS-isolated; HTTP 401 on both new procedures.
 *   SOFT — real Gemini proposes a valid in-allowlist SET spanning ≥2 chapters; the
 *     fan-out authors drafts across MULTIPLE distinct sub_topics, one worker row
 *     each, all persisted status='draft' + private, failures empty, wall-time ~ a
 *     single worker (parallel, not summed).
 *
 * COVERAGE-1 extends it to the SECOND intent — several sub-topics of ONE chapter
 * authored in parallel from a BLOCKED chat:
 *   FIRM — the blocked chat's single-chapter scope guard rejects a target from
 *     another chapter (the fan-out from blocked mode is a genuinely new path);
 *     and the FE gate is off the toggle, not the chat mode (M43: a server-side
 *     probe went green once while the client broke the very rule it proved).
 *   SOFT — intent:"cover" proposes only sub-topics of the ONE chapter, with counts
 *     in 1..8 (blocked mode's range) where intent:"discriminate" stays 1..4; the
 *     fan-out from a BLOCKED chat authors across several of its sub-topics.
 */
import { and, eq, inArray, sql } from "drizzle-orm";
import type { PgTransaction } from "drizzle-orm/pg-core";
import {
  appUser,
  authoringChat,
  authoringWorker,
  board,
  chapter,
  learningObjective,
  question,
  student,
  subject,
  subTopic,
  topic,
} from "@b2c/kernel/schema";
import { db, queryClient } from "../src/db/client";
import { withBoard } from "../src/db/with-board";
import { env } from "../src/config/env";
import {
  authorSetFromChat,
  clampSetCount,
  proposeTargetSet,
  startChat,
  SubTopicNotFoundError,
} from "../src/services/authoring_chat";

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
function soft(name: string, value: unknown) {
  console.log(`  ~ [soft] ${name}: ${JSON.stringify(value)}`);
}
const rows = <T>(boardId: string, fn: (tx: Tx) => Promise<T>) => withBoard(boardId, fn);

async function main() {
  const tag = `${Date.now()}`;
  await db.execute(sql`select 1`);
  check("DB connectivity (select 1) as app role", true);

  // ── seed: board P with TWO in-scope chapters (chA, chB, 2 sub_topics each) +
  //    ONE out-of-scope chapter (chC). The interleaved chat spans [chA, chB]. ──
  const [P] = await db.insert(board).values({ slug: `aset-p-${tag}`, name: "Probe P" }).returning();
  const [Q] = await db.insert(board).values({ slug: `aset-q-${tag}`, name: "Probe Q" }).returning();
  if (!P || !Q) throw new Error("board seed failed");
  const [tut] = await db.insert(appUser).values({ email: `aset-tut-${tag}@example.com`, name: "Tutor", userType: "tutor" }).returning();
  const [stu] = await db.insert(appUser).values({ email: `aset-stu-${tag}@example.com`, name: "Student", userType: "student" }).returning();
  if (!tut || !stu) throw new Error("app_user seed failed");

  async function seedChapter(
    tx: Tx,
    subjId: string,
    slug: string,
    name: string,
    ordinal: number,
    subNames: string[],
  ) {
    const [chap] = await tx
      .insert(chapter)
      .values({ boardId: P!.id, subjectId: subjId, slug, name, ordinal, metadata: { topicsMd: `Raw prose for ${name}.` } })
      .returning();
    const [tp] = await tx.insert(topic).values({ boardId: P!.id, chapterId: chap!.id, slug: `${slug}-t`, name: `${name} Topic`, ordinal: 1 }).returning();
    const subIds: string[] = [];
    for (let i = 0; i < subNames.length; i++) {
      const [st] = await tx
        .insert(subTopic)
        .values({ boardId: P!.id, topicId: tp!.id, slug: `${slug}-s${i}`, name: subNames[i]!, ordinal: i + 1 })
        .returning();
      await tx.insert(learningObjective).values({ boardId: P!.id, subTopicId: st!.id, axis: "conceptual", code: `C${i}`, description: `Explains ${subNames[i]}.` });
      await tx.insert(learningObjective).values({ boardId: P!.id, subTopicId: st!.id, axis: "procedural", code: `Pp${i}`, description: `Computes ${subNames[i]}.` });
      subIds.push(st!.id);
    }
    return { chapterId: chap!.id, subIds };
  }

  const fx = await withBoard(P.id, async (tx: Tx) => {
    const [subj] = await tx.insert(subject).values({ boardId: P.id, slug: "phys", name: "Physics", grade: "IGCSE" }).returning();
    const chA = await seedChapter(tx, subj!.id, "motion", "Motion", 1, ["Acceleration", "Velocity-time graphs"]);
    const chB = await seedChapter(tx, subj!.id, "forces", "Forces", 2, ["Newton's second law", "Friction"]);
    const chC = await seedChapter(tx, subj!.id, "energy", "Energy", 3, ["Work done"]); // OUT of the chat scope
    await tx.insert(student).values({ userId: stu.id, boardId: P.id, class: "9", tutorId: tut.id });
    return { chA, chB, chC };
  });

  // The interleaved chat over [chA, chB] — the fan-out's scope.
  const chat = await rows(P.id, (tx) =>
    startChat(tx, {
      boardId: P.id,
      tutorUserId: tut.id,
      studentId: stu.id,
      vendor: "gemini_api",
      mode: "interleaved",
      chapterIds: [fx.chA.chapterId, fx.chB.chapterId],
    }),
  );
  check("interleaved chat spans both chapters", chat.chapterIds.length === 2 && chat.mode === "interleaved");

  // ── FIRM 1: pre-flight scope guard is FAIL-FAST + ALL-OR-NOTHING ──
  // A set mixing one in-scope + one out-of-scope target must REJECT the whole call
  // BEFORE any AI spend, authoring nothing (no worker rows, no drafts).
  let guardThrew = false;
  try {
    await rows(P.id, (tx) =>
      authorSetFromChat(tx, {
        boardId: P.id,
        tutorUserId: tut.id,
        chatId: chat.chatId,
        targets: [
          { subTopicId: fx.chA.subIds[0]!, count: 1 },
          { subTopicId: fx.chC.subIds[0]!, count: 1 }, // out of scope
        ],
      }),
    );
  } catch (e) {
    guardThrew = e instanceof SubTopicNotFoundError;
  }
  check("scope guard: an out-of-scope target rejects the whole set (fail-fast)", guardThrew);
  const afterGuard = await rows(P.id, (tx) =>
    tx.select().from(authoringWorker).where(eq(authoringWorker.chatId, chat.chatId)),
  );
  check("scope guard: NOTHING authored on rejection (no worker rows)", afterGuard.length === 0);
  const draftsAfterGuard = await rows(P.id, (tx) =>
    tx.select().from(question).where(and(eq(question.boardId, P.id), eq(question.status, "draft"))),
  );
  check("scope guard: NOTHING authored on rejection (no draft rows)", draftsAfterGuard.length === 0);

  // ── FIRM 2: authoring_worker RLS isolation (deterministic, no AI) ──
  const [rlsWorker] = await rows(P.id, (tx) =>
    tx.insert(authoringWorker).values({ boardId: P.id, chatId: chat.chatId, subTopicId: fx.chA.subIds[0]!, vendor: "gemini_api", brief: "rls-probe" }).returning({ id: authoringWorker.id }),
  );
  const rlsUnderQ = await rows(Q.id, (tx) => tx.select().from(authoringWorker).where(eq(authoringWorker.id, rlsWorker!.id)));
  const rlsUnderP = await rows(P.id, (tx) => tx.select().from(authoringWorker).where(eq(authoringWorker.id, rlsWorker!.id)));
  check("RLS: authoring_worker invisible under a foreign board (Q)", rlsUnderQ.length === 0);
  check("RLS: authoring_worker visible under its own board (P)", rlsUnderP.length === 1);
  await rows(P.id, (tx) => tx.delete(authoringWorker).where(eq(authoringWorker.id, rlsWorker!.id))); // clear the manual row

  // ── COVERAGE-1 · the BLOCKED chat (one chapter) that now also fans out ──
  const blocked = await rows(P.id, (tx) =>
    startChat(tx, {
      boardId: P.id,
      tutorUserId: tut.id,
      studentId: stu.id,
      vendor: "gemini_api",
      mode: "blocked",
      chapterIds: [fx.chA.chapterId],
    }),
  );
  check(
    "COVERAGE-1: blocked chat is scoped to exactly ONE chapter",
    blocked.mode === "blocked" && blocked.chapterIds.length === 1,
  );

  // FIRM 3: the scope guard holds from BLOCKED mode too — chB is a real, valid
  // sub_topic on this board, just not in THIS chat's chapter. Fail-fast, nothing
  // authored. (The interleaved guard above proves the multi-chapter case; this is
  // the one-chapter case the coverage flow actually runs in.)
  let blockedGuardThrew = false;
  try {
    await rows(P.id, (tx) =>
      authorSetFromChat(tx, {
        boardId: P.id,
        tutorUserId: tut.id,
        chatId: blocked.chatId,
        targets: [
          { subTopicId: fx.chA.subIds[0]!, count: 1 },
          { subTopicId: fx.chB.subIds[0]!, count: 1 }, // valid sub_topic, wrong chapter
        ],
      }),
    );
  } catch (e) {
    blockedGuardThrew = e instanceof SubTopicNotFoundError;
  }
  check(
    "COVERAGE-1: blocked scope guard rejects a target from another chapter",
    blockedGuardThrew,
  );
  const afterBlockedGuard = await rows(P.id, (tx) =>
    tx.select().from(authoringWorker).where(eq(authoringWorker.chatId, blocked.chatId)),
  );
  check(
    "COVERAGE-1: blocked scope guard authored NOTHING on rejection",
    afterBlockedGuard.length === 0,
  );

  // ── FIRM 4: the count rule, deterministically (no AI) ──────────────────────
  // The soft legs below can only observe whatever the model proposed; when that
  // is a small number they pass under EITHER rule. This asserts the rule itself,
  // both halves together, so widening coverage cannot silently widen interleaved
  // and a revert to the old flat clamp goes red here first.
  check(
    "COVERAGE-1: count rule — cover keeps 6, discriminate cuts 6→4",
    clampSetCount(6, "cover") === 6 && clampSetCount(6, "discriminate") === 4,
  );
  check(
    "COVERAGE-1: count rule — ceilings are 8 (cover) / 4 (discriminate), floor 1 for both",
    clampSetCount(99, "cover") === 8 &&
      clampSetCount(99, "discriminate") === 4 &&
      clampSetCount(0, "cover") === 1 &&
      clampSetCount(-3, "discriminate") === 1,
  );
  check(
    "COVERAGE-1: count rule — the DEFAULT intent is the unchanged interleaved one",
    clampSetCount(6) === 4,
  );

  // ── FIRM 5: the CLIENT gate (M43) ──────────────────────────────────────────
  // The whole ask is that the set entry stops being interleaved-only. A service
  // probe cannot see that: the gate lives in the FE. Assert the source directly —
  // the old gate LINE is gone and the toggle gate is present. The old gate is
  // matched as a full JSX line (`{chat.mode === "interleaved" && (`) so the mode
  // ternaries that legitimately remain — button copy, card heading, the intent
  // sent to the endpoint — can't hold this leg green (M79: a prefix match is not
  // an existence proof).
  const tutorPageSrc = await Bun.file(
    new URL("../frontend/src/components/TutorPage.tsx", import.meta.url).pathname,
  ).text();
  check(
    "COVERAGE-1 (FE): the set entry is NO LONGER gated on `chat.mode === \"interleaved\"`",
    !tutorPageSrc.includes('{chat.mode === "interleaved" && ('),
  );
  check(
    "COVERAGE-1 (FE): the set entry IS gated on the toggle (`{setModeOn && (`)",
    tutorPageSrc.includes("{setModeOn && ("),
  );
  check(
    "COVERAGE-1 (FE): a blocked chat sends intent 'cover' to the proposer",
    /intent:\s*chat\.mode === "interleaved" \? "discriminate" : "cover"/.test(tutorPageSrc),
  );

  const geminiConfigured = !!env.GEMINI_API_KEY;
  if (!geminiConfigured) console.log("  ~ real-Gemini legs SKIPPED (GEMINI_API_KEY unset)");

  // ── SOFT (real Gemini): proposeTargetSet → a valid in-allowlist mix ──
  let proposed: Awaited<ReturnType<typeof proposeTargetSet>> | null = null;
  if (geminiConfigured) {
    proposed = await rows(P.id, (tx) => proposeTargetSet(tx, { tutorUserId: tut.id, chatId: chat.chatId }));
    const allIds = new Set([...fx.chA.subIds, ...fx.chB.subIds]);
    check("proposeSet: ≥1 pick", proposed.picks.length >= 1);
    check("proposeSet: every pick is IN the interleaved allowlist", proposed.picks.every((p) => allIds.has(p.subTopicId)));
    check("proposeSet: no duplicate sub_topic in the set", new Set(proposed.picks.map((p) => p.subTopicId)).size === proposed.picks.length);
    // Intent-specific (COVERAGE-1): the interleaved MIX stays deliberately short
    // per sub-topic. Its coverage counterpart (1..8) is asserted further down —
    // these two legs are a pair; changing one without the other is the bug.
    check("proposeSet[discriminate]: every count in 1..4", proposed.picks.every((p) => p.count >= 1 && p.count <= 4));
    const chapters = new Set(proposed.picks.map((p) => p.chapterName));
    soft("proposeSet picks", { n: proposed.picks.length, chapters: [...chapters], counts: proposed.picks.map((p) => p.count) });
    check("proposeSet: set size respects the cap (≤5)", proposed.picks.length <= 5);
  }

  // ── SOFT (real Gemini): authorSetFromChat fans out across MULTIPLE sub_topics ──
  if (geminiConfigured) {
    // A fixed 2-target set spanning BOTH chapters (deterministic targets — don't
    // depend on the proposer's choice for the fan-out assertions).
    const targets = [
      { subTopicId: fx.chA.subIds[0]!, count: 1 },
      { subTopicId: fx.chB.subIds[0]!, count: 1 },
    ];
    const t0 = Date.now();
    const res = await rows(P.id, (tx) =>
      authorSetFromChat(tx, { boardId: P.id, tutorUserId: tut.id, chatId: chat.chatId, targets }),
    );
    const elapsed = Date.now() - t0;
    soft("fan-out wall-time ms (parallel — ~one worker, not summed)", elapsed);

    check("fan-out: a group per target succeeded", res.groups.length === targets.length);
    check("fan-out: no failures on a clean run", res.failures.length === 0);
    check("fan-out: groups span BOTH distinct sub_topics", new Set(res.groups.map((g) => g.subTopicId)).size === targets.length);
    check("fan-out: every group returned ≥1 draft", res.groups.every((g) => g.drafts.length >= 1));
    check(
      "fan-out: every draft valid (id + stem + reference answer)",
      res.groups.every((g) => g.drafts.every((d) => !!d.id && d.stem.trim().length > 0 && d.referenceAnswer.trim().length > 0)),
    );

    // One authoring_worker row per target sub_topic (D-QA3-8), each logged under P.
    const workerRows = await rows(P.id, (tx) =>
      tx.select().from(authoringWorker).where(and(eq(authoringWorker.chatId, chat.chatId), inArray(authoringWorker.subTopicId, targets.map((t) => t.subTopicId)))),
    );
    check("fan-out: one authoring_worker row per sub_topic (D-QA3-8)", workerRows.length === targets.length);

    // Drafts persisted status='draft', private, none approved — across BOTH sub_topics.
    const drafts = await rows(P.id, (tx) =>
      tx.select().from(question).where(and(eq(question.boardId, P.id), eq(question.source, "b2c_authoring"), eq(question.status, "draft"))),
    );
    check("fan-out: drafts persisted as status='draft'", drafts.length >= targets.length);
    check("fan-out: drafts private to the student", drafts.every((d) => d.targetStudentId === stu.id));
    check("fan-out: drafts span BOTH sub_topics (multi-target review)", new Set(drafts.map((d) => d.subTopicId)).size === targets.length);
    check("fan-out: NONE approved (no question reaches a student)", drafts.every((d) => d.status === "draft"));
  }

  // ── SOFT (real Gemini) · COVERAGE-1: intent:"cover" from the BLOCKED chat ──
  if (geminiConfigured) {
    const covered = await rows(P.id, (tx) =>
      proposeTargetSet(tx, { tutorUserId: tut.id, chatId: blocked.chatId, intent: "cover" }),
    );
    const chAIds = new Set(fx.chA.subIds);
    soft("coverage picks", {
      n: covered.picks.length,
      chapters: [...new Set(covered.picks.map((p) => p.chapterName))],
      counts: covered.picks.map((p) => p.count),
    });
    check("proposeSet[cover]: ≥1 pick", covered.picks.length >= 1);
    check(
      "proposeSet[cover]: every pick is a sub-topic of the ONE chapter in scope",
      covered.picks.every((p) => chAIds.has(p.subTopicId)),
    );
    check(
      "proposeSet[cover]: no duplicate sub_topic",
      new Set(covered.picks.map((p) => p.subTopicId)).size === covered.picks.length,
    );
    // The pair to the 1..4 leg above: coverage takes blocked mode's OWN range.
    // A regression to the flat clamp shows up here as a count that can never
    // exceed 4 — so this leg is only meaningful alongside a soft print of the
    // actual counts (above), which is why both are here.
    check(
      "proposeSet[cover]: every count in 1..8 (blocked mode's range, not the interleaved 1..4)",
      covered.picks.every((p) => p.count >= 1 && p.count <= 8),
    );
    check("proposeSet[cover]: set size respects the cap (≤5, unchanged)", covered.picks.length <= 5);
  }

  // ── SOFT (real Gemini) · COVERAGE-1: the fan-out FROM A BLOCKED CHAT ──
  // The actual ask — several sub-topics of one chapter, authored in parallel, in
  // the normal blocked flow. This path had never been exercised: every prior
  // fan-out ran from an interleaved chat.
  if (geminiConfigured) {
    const covTargets = [
      { subTopicId: fx.chA.subIds[0]!, count: 1 },
      { subTopicId: fx.chA.subIds[1]!, count: 1 },
    ];
    const res = await rows(P.id, (tx) =>
      authorSetFromChat(tx, {
        boardId: P.id,
        tutorUserId: tut.id,
        chatId: blocked.chatId,
        targets: covTargets,
      }),
    );
    check("coverage fan-out: a group per target succeeded", res.groups.length === covTargets.length);
    check("coverage fan-out: no failures on a clean run", res.failures.length === 0);
    check(
      "coverage fan-out: groups span BOTH sub_topics of the chapter",
      new Set(res.groups.map((g) => g.subTopicId)).size === covTargets.length,
    );
    check(
      "coverage fan-out: every group is in the SAME chapter",
      new Set(res.groups.map((g) => g.chapterName)).size === 1,
    );
    check("coverage fan-out: every group returned ≥1 draft", res.groups.every((g) => g.drafts.length >= 1));

    // chA.subIds[1] is touched by NO earlier leg — drafts there prove the blocked
    // fan-out really persisted, rather than the assertion reading the interleaved
    // run's rows.
    const freshDrafts = await rows(P.id, (tx) =>
      tx
        .select()
        .from(question)
        .where(and(eq(question.boardId, P.id), eq(question.subTopicId, fx.chA.subIds[1]!), eq(question.status, "draft"))),
    );
    check("coverage fan-out: drafts persisted on a sub_topic no other leg authored", freshDrafts.length >= 1);
    check("coverage fan-out: those drafts are private to the student", freshDrafts.every((d) => d.targetStudentId === stu.id));

    const covWorkers = await rows(P.id, (tx) =>
      tx.select().from(authoringWorker).where(eq(authoringWorker.chatId, blocked.chatId)),
    );
    check(
      "coverage fan-out: one authoring_worker row per sub_topic, under the BLOCKED chat",
      covWorkers.length === covTargets.length,
    );
  }

  // ── HTTP: both new procedures require a session → 401 ──
  for (const [name, proc, body] of [
    ["authorSetFromChat", "tutor.authorSetFromChat", { chatId: "00000000-0000-0000-0000-000000000000", targets: [{ subTopicId: fx.chA.subIds[0]!, count: 1 }] }],
    ["proposeAuthoringSet", "tutor.proposeAuthoringSet", { chatId: "00000000-0000-0000-0000-000000000000" }],
  ] as const) {
    try {
      const res = await fetch(`http://localhost:${env.PORT}/trpc/${proc}?batch=1`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-board": P.slug },
        body: JSON.stringify({ 0: { json: body } }),
      });
      check(`HTTP ${name} (no session) → 401 (got ${res.status})`, res.status === 401);
    } catch {
      console.log(`  ~ HTTP ${name} check skipped (server not running)`);
    }
  }

  // ── cleanup (FK-safe: worker → chat → question → spine) ──
  await withBoard(P.id, async (tx: Tx) => {
    await tx.delete(authoringWorker).where(eq(authoringWorker.boardId, P.id));
    await tx.delete(authoringChat).where(eq(authoringChat.boardId, P.id));
    await tx.delete(question).where(eq(question.boardId, P.id));
    await tx.delete(student).where(eq(student.boardId, P.id));
    await tx.delete(learningObjective).where(eq(learningObjective.boardId, P.id));
    await tx.delete(subTopic).where(eq(subTopic.boardId, P.id));
    await tx.delete(topic).where(eq(topic.boardId, P.id));
    await tx.delete(chapter).where(eq(chapter.boardId, P.id));
    await tx.delete(subject).where(eq(subject.boardId, P.id));
  });
  for (const u of [tut, stu]) await db.delete(appUser).where(eq(appUser.id, u.id));
  await db.delete(board).where(eq(board.id, P.id));
  await db.delete(board).where(eq(board.id, Q.id));

  console.log(`\nprobe_authoring_set: ${passed} passed, ${failed} failed`);
  await queryClient.end();
  process.exit(failed === 0 ? 0 : 1);
}

main().catch(async (err) => {
  console.error("probe_authoring_set FAILED:", err);
  await queryClient.end();
  process.exit(1);
});
