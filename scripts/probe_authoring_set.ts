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
import { and, desc, eq, inArray, sql } from "drizzle-orm";
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
import { randomUUID } from "node:crypto";
import { db, queryClient } from "../src/db/client";
import { withBoard } from "../src/db/with-board";
import { env } from "../src/config/env";
// Slice SET-ASYNC: the fan-out runs as a background job now, so the QUEUE contract
// (the job's data shape + the resume handle's phase) is part of this slice's surface.
import {
  authoringQueue,
  enqueueAuthoring,
  getActiveAuthoringJob,
} from "../src/worker/queue";
import {
  authorSetFromChat,
  clampProposedItems,
  clampSetCount,
  proposeSetResultSchema,
  proposeTargetSet,
  sendTurn,
  setIntentForMode,
  startChat,
  SubTopicNotFoundError,
} from "../src/services/authoring_chat";
import type { WorkerPlan } from "@b2c/kernel/contracts";

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

  // FE source, read once and shared by FIRM 6/7 and the client-gate legs below.
  const tutorPageSrc = await Bun.file(
    new URL("../frontend/src/components/TutorPage.tsx", import.meta.url).pathname,
  ).text();

  // ── FIRM 6: SET-PLAN-GATE — the blueprint→count derivation, deterministically ──
  // The count is now DERIVED from the item blueprint (items.length), capped to the
  // intent's range and renumbered 1..N. Assert the pure helper directly so the
  // "count follows the plan, n is sequential" rule can't pass vacuously on whatever
  // small blueprint the model happened to return (M52's vacuous-green trap).
  const rawItems = Array.from({ length: 10 }, (_, i) => ({
    axis: (i % 2 === 0 ? "conceptual" : "procedural") as
      | "conceptual"
      | "procedural"
      | "both",
    kind: `kind-${i}`,
    intent: `intent-${i}`,
    difficulty: "medium",
  }));
  const capDisc = clampProposedItems(rawItems, "discriminate");
  const capCov = clampProposedItems(rawItems, "cover");
  check(
    "SET-PLAN-GATE: 10 items → capped to 4 (discriminate) / 8 (cover)",
    capDisc.length === 4 && capCov.length === 8,
  );
  check(
    "SET-PLAN-GATE: items renumbered 1..N sequentially regardless of input order",
    capDisc.every((it, i) => it.n === i + 1) &&
      capCov.every((it, i) => it.n === i + 1),
  );
  check(
    "SET-PLAN-GATE: the item fields (axis/kind/intent) are preserved through the cap",
    capDisc[0]!.axis === "conceptual" &&
      capDisc[0]!.kind === "kind-0" &&
      capDisc[0]!.intent === "intent-0",
  );
  check(
    "SET-PLAN-GATE: an empty blueprint yields an empty plan (fallback self-derives)",
    clampProposedItems([], "cover").length === 0,
  );

  // ── FIRM 7: SET-PLAN-GATE (FE) — the proposal card IS the plan gate now ────────
  // Full-token asserts (M79: a prefix match is not an existence proof). The
  // editable count is GONE (the count is derived, non-editable), the item blueprint
  // is rendered, and the approved plan is threaded back on confirm.
  check(
    "SET-PLAN-GATE (FE): the editable per-sub-topic count is removed (no `setCounts`)",
    !tutorPageSrc.includes("setCounts"),
  );
  check(
    "SET-PLAN-GATE (FE): the item blueprint is rendered (`tut-chat-set-pick-items`)",
    tutorPageSrc.includes("tut-chat-set-pick-items"),
  );
  check(
    "SET-PLAN-GATE (FE): the approved plan is threaded back on confirm (`plan: { read: \"\"`)",
    tutorPageSrc.includes('plan: { read: "", items: p.items'),
  );

  // ── FIRM 5: the CLIENT gate (M43) ──────────────────────────────────────────
  // The whole ask is that the set entry stops being interleaved-only. A service
  // probe cannot see that: the gate lives in the FE. Assert the source directly —
  // the old gate LINE is gone and the toggle gate is present. The old gate is
  // matched as a full JSX line (`{chat.mode === "interleaved" && (`) so the mode
  // ternaries that legitimately remain — button copy, card heading, the intent
  // sent to the endpoint — can't hold this leg green (M79: a prefix match is not
  // an existence proof). `tutorPageSrc` is read once above (FIRM 6).
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

  // ══ CHAT-SET-ROUTE — the chat go-ahead is MODE-AWARE ═══════════════════════════
  // S179 §7: both vendor branches routed through resolveTargetAndEnqueue with a
  // SINGLE subTopicNumber and never called the fan-out, so with "Several" selected a
  // go-ahead still authored ONE sub-topic and the toggle was silently ignored — the
  // chat model, lacking any mechanism, invented a "two consecutive briefs" workaround.

  // ── FIRM 8: the intent rule, BOTH arms in ONE leg ──────────────────────────────
  // M101: the moment a change makes two rules diverge, assert them together —
  // separately, one quietly becomes the other's stale sibling.
  check(
    "CHAT-SET-ROUTE: setIntentForMode maps interleaved→discriminate AND blocked→cover",
    setIntentForMode("interleaved") === "discriminate" && setIntentForMode("blocked") === "cover",
  );
  check(
    "CHAT-SET-ROUTE: a legacy null/undefined mode falls to 'cover', never 'discriminate'",
    setIntentForMode(null) === "cover" && setIntentForMode(undefined) === "cover",
  );

  // ── FIRM 9: S179 §8 — one malformed pick must not 500 the whole proposal ───────
  // `items` was `.min(1)` per pick, so a single empty-items pick threw at .parse()
  // and bubbled as a 500 with NO proposal. Deterministic: no AI in this leg.
  const emptyPickParse = proposeSetResultSchema.safeParse({
    picks: [
      { choice: 1 },
      { choice: 2, items: [{ axis: "conceptual", kind: "k", intent: "i", difficulty: "d" }] },
    ],
    rationale: "r",
  });
  check(
    "CHAT-SET-ROUTE (§8): a pick with NO items PARSES instead of throwing (was a 500)",
    emptyPickParse.success && (emptyPickParse.data.picks[0]?.items?.length ?? -1) === 0,
  );
  // The other half of the same fix: an all-empty payload must still parse, so the
  // resolver reaches its own degenerate fallback rather than dying at the boundary.
  check(
    "CHAT-SET-ROUTE (§8): an ALL-empty-items payload parses (resolver handles the fallback)",
    proposeSetResultSchema.safeParse({ picks: [{ choice: 1 }], rationale: "" }).success,
  );

  // ── FIRM 10: the FE wiring, on a COMMENT-STRIPPED source ───────────────────────
  // M77 has recurred THREE times in this repo: a probe that greps raw source is
  // reading a document that argues with itself, and the prose wins as often as the
  // code. Strip comments at the block level before asserting.
  const tutorPageCode = tutorPageSrc
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
  check(
    "CHAT-SET-ROUTE (FE): the toggle is SENT with the turn (`setMode: setModeOn`)",
    /setMode:\s*setModeOn/.test(tutorPageCode),
  );
  check(
    "CHAT-SET-ROUTE (FE): a returned proposal routes into the EXISTING set card",
    /if \(c\.proposedSet\)/.test(tutorPageCode) &&
      /setProposalSet\(c\.proposedSet\)/.test(tutorPageCode),
  );

  // ── SOFT + GATE: a REAL go-ahead in a BLOCKED chat with the toggle on ──────────
  // Deliberately the blocked chat: that is the founder's case and the one `chat.mode`
  // could never have selected (interleaved+One and blocked+Several both exist, which
  // is why the toggle has to travel with the turn). ~2 real Gemini calls.
  let setTurn = await rows(P.id, (tx) =>
    sendTurn(tx, {
      tutorUserId: tut.id,
      chatId: blocked.chatId,
      text: "Go ahead — author across several sub-topics of this chapter now, in parallel.",
      setMode: true,
    }),
  );
  if (!setTurn.proposedSet) {
    // The model didn't emit the go-ahead sentinel on the first ask (a conversational
    // outcome, not a defect). Retry once, blunter — same discipline as
    // probe_authoring_tool's go-ahead legs.
    setTurn = await rows(P.id, (tx) =>
      sendTurn(tx, {
        tutorUserId: tut.id,
        chatId: blocked.chatId,
        text: "This is the go-ahead. Author several sub-topics of this chapter now.",
        setMode: true,
      }),
    );
  }
  soft("set-route picks", setTurn.proposedSet?.picks?.map((p) => p.subTopicName) ?? null);
  check(
    "CHAT-SET-ROUTE: a go-ahead with setMode ON returns a SET PROPOSAL",
    (setTurn.proposedSet?.picks?.length ?? 0) >= 1,
  );
  check(
    "CHAT-SET-ROUTE: the proposal carries the SET-PLAN-GATE blueprint (items, count derived)",
    (setTurn.proposedSet?.picks ?? []).every(
      (p) => (p.items?.length ?? 0) > 0 && p.count === p.items.length,
    ),
  );
  // The gate itself: NOTHING is enqueued on this path. The fan-out must be reachable
  // only through the tutor approving the card (founder, 2026-07-31) — a chat go-ahead
  // that silently spent N sub-topics of AI is the thing this slice must not become.
  check(
    "CHAT-SET-ROUTE (GATE): the set turn enqueued NOTHING (no draftJobId, no planJobId)",
    setTurn.draftJobId === undefined && setTurn.planJobId === undefined,
  );

  // ── NEGATIVE CONTROL: the SAME chat + go-ahead with setMode OFF ────────────────
  // M104: a control whose subject is produced by a fallible live call can pass by the
  // subject never being produced. So this REQUIRES the subject to exist — a job id
  // must actually come back. If the call fails or emits no go-ahead, the leg REDS
  // rather than passing on an absent `proposedSet`.
  const noSetTurn = await rows(P.id, (tx) =>
    sendTurn(tx, {
      tutorUserId: tut.id,
      chatId: blocked.chatId,
      text: "This is the go-ahead. Author 2 questions on sub-topic 1 now.",
      // setMode deliberately OMITTED — proves the default is the single path.
    }),
  );
  const singleJobId = noSetTurn.planJobId ?? noSetTurn.draftJobId ?? "";
  soft("negative control jobId", singleJobId || null);
  check(
    "CHAT-SET-ROUTE (NEG): setMode OMITTED → a real job id came back (subject EXISTS)",
    typeof singleJobId === "string" && singleJobId.length > 0,
  );
  check(
    "CHAT-SET-ROUTE (NEG): that same turn produced NO set proposal",
    noSetTurn.proposedSet === undefined,
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

    // SET-PLAN-GATE (M52): the item blueprint is a NEW field parsed from the vendor
    // response — unproven until a real call fills it. The model cannot decline it
    // (items is required + min 1), so assert every pick carries a real blueprint
    // with populated fields, and that the count is genuinely DERIVED from it.
    soft("proposeSet first pick items", proposed.picks[0]?.items);
    check(
      "SET-PLAN-GATE: every pick carries ≥1 blueprint item (a real call FILLED the field)",
      proposed.picks.every((p) => p.items.length >= 1),
    );
    check(
      "SET-PLAN-GATE: count === items.length (derived, not a separate number)",
      proposed.picks.every((p) => p.count === p.items.length),
    );
    check(
      "SET-PLAN-GATE: every item has a valid axis + non-empty kind/intent/difficulty",
      proposed.picks.every((p) =>
        p.items.every(
          (it) =>
            ["conceptual", "procedural", "both"].includes(it.axis) &&
            it.kind.trim().length > 0 &&
            it.intent.trim().length > 0 &&
            it.difficulty.trim().length > 0,
        ),
      ),
    );
    check(
      "SET-PLAN-GATE: item `n` is 1..N within each pick",
      proposed.picks.every((p) => p.items.every((it, i) => it.n === i + 1)),
    );
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

  // ── SOFT (real Gemini) · SET-PLAN-GATE: the plan REACHES the drafter ──────────
  // The slice's headline claim, and the case the feature exists for (M97): a
  // per-target plan is not display-only — it is threaded into the fan-out so the
  // drafter writes THAT blueprint. Proven end-to-end: author ONE fresh sub-topic
  // WITH a plan carrying a UNIQUE sentinel intent, and assert the persisted drafter
  // prompt (`brief`) contains the sentinel + the "approved plan" marker. The
  // assertion is deterministic (string presence); real Gemini only makes the spawn
  // run. If the wire were disconnected the sentinel would be absent → red (M101).
  //
  // The NEGATIVE CONTROL is the interleaved fan-out's chB[0] brief, authored earlier
  // WITHOUT a plan — a real, already-persisted, guaranteed-non-empty brief. Reusing
  // it (rather than a second live call) makes the control (a) impossible to pass
  // vacuously on a Gemini failure that writes no row, and (b) one fewer flaky call.
  // The two briefs differ by EXACTLY the plan block.
  if (geminiConfigured) {
    const SENTINEL = "PLAN-GATE-SENTINEL-STATIC-VS-KINETIC-FRICTION-7X2Q";
    const MARKER = "THE PLAN THE TUTOR APPROVED";
    const gatePlan: WorkerPlan = {
      read: "",
      items: [
        {
          n: 1,
          axis: "conceptual",
          kind: "misconception-probe",
          intent: SENTINEL,
          difficulty: "medium",
        },
      ],
      questions: [],
    };
    const withPlanSt = fx.chB.subIds[1]!; // Friction — untouched by any earlier leg
    const noPlanSt = fx.chB.subIds[0]!; // authored WITHOUT a plan in the interleaved fan-out
    await rows(P.id, (tx) =>
      authorSetFromChat(tx, {
        boardId: P.id,
        tutorUserId: tut.id,
        chatId: chat.chatId,
        targets: [{ subTopicId: withPlanSt, count: 1, plan: gatePlan }],
      }),
    );
    const latestBrief = async (stId: string): Promise<string> => {
      const [w] = await rows(P.id, (tx) =>
        tx
          .select({ brief: authoringWorker.brief })
          .from(authoringWorker)
          .where(
            and(
              eq(authoringWorker.chatId, chat.chatId),
              eq(authoringWorker.subTopicId, stId),
            ),
          )
          .orderBy(desc(authoringWorker.createdAt))
          .limit(1),
      );
      return w?.brief ?? "";
    };
    const withBrief = await latestBrief(withPlanSt);
    const noBrief = await latestBrief(noPlanSt);
    soft("with-plan brief has sentinel", withBrief.includes(SENTINEL));
    check(
      "SET-PLAN-GATE: the approved item's intent reaches the drafter prompt (the GATE)",
      withBrief.includes(SENTINEL),
    );
    check(
      "SET-PLAN-GATE: the drafter prompt carries the 'approved plan' marker",
      withBrief.includes(MARKER),
    );
    // Negative control: a REAL plan-less brief (non-empty, so this can't pass on a
    // missing row — M101/M52) must carry NEITHER the sentinel NOR the marker.
    check(
      "SET-PLAN-GATE (neg control): the plan-LESS interleaved brief exists and has NO plan block",
      noBrief.length > 0 && !noBrief.includes(SENTINEL) && !noBrief.includes(MARKER),
    );
  }

  // ── SET-ASYNC: the fan-out is a JOB — prove the queue contract (no AI) ────────
  // All deterministic. What is NEW in this slice is not the fan-out (unchanged, and
  // covered by the legs above) but the ENQUEUE: a third job variant that carries
  // `targets` instead of a `subTopicId`, and a resume handle that must report it.
  //
  // A SYNTHETIC chatId is used deliberately. `activeJobIdForChat` matches the FIRST
  // in-flight job for a (board, chat) — and the negative-control turn above already
  // left a single-phase job on `blocked.chatId` that no worker consumes during a
  // probe run. Reusing that chat would make the phase leg read the OLDER job and red
  // for a reason that has nothing to do with this slice.
  const setChatId = randomUUID();
  const setJobPlan: WorkerPlan = {
    read: "",
    items: [
      { n: 1, axis: "conceptual", kind: "misconception-probe", intent: "SET-ASYNC round-trip", difficulty: "medium" },
    ],
    questions: [],
  };
  const setJobId = await enqueueAuthoring({
    boardId: P.id,
    tutorUserId: tut.id,
    chatId: setChatId,
    phase: "set",
    targets: [
      { subTopicId: fx.chA.subIds[0]!, count: 1, plan: setJobPlan },
      { subTopicId: fx.chA.subIds[1]!, count: 2 },
    ],
  });
  check(
    "SET-ASYNC: enqueueAuthoring accepts the 'set' variant and returns a job id",
    typeof setJobId === "string" && setJobId.length > 0,
  );
  // Read it BACK out of Redis — a serialisation round-trip, not the object we passed.
  const setJob = await authoringQueue.getJob(setJobId);
  const setData = setJob?.data;
  check(
    "SET-ASYNC: the job's phase round-trips through Redis as 'set'",
    setData?.phase === "set",
  );
  check(
    "SET-ASYNC: BOTH targets survive the round-trip, with the SET-PLAN-GATE blueprint intact",
    setData?.phase === "set" &&
      setData.targets.length === 2 &&
      setData.targets[0]?.plan?.items?.[0]?.intent === "SET-ASYNC round-trip" &&
      setData.targets[1]?.count === 2,
  );
  // The variant hazard the required `phase` exists to prevent: a set job has no
  // subTopicId, so if its phase were ever lost the `?? "draft"` default would hand
  // the single-job branch an undefined sub-topic.
  check(
    "SET-ASYNC: a set job carries NO subTopicId (it is genuinely the other variant)",
    setData !== undefined && !("subTopicId" in setData),
  );
  const liveSet = await getActiveAuthoringJob(P.id, setChatId);
  check(
    "SET-ASYNC: getActiveAuthoringJob reports phase 'set' → the loader resumes as the fan-out",
    liveSet?.jobId === setJobId && liveSet?.phase === "set",
  );
  // Remove BEFORE the 2s enqueue delay elapses — a probe must not leave a real
  // authoring job for a running daemon to pick up and spend AI on (M106's family).
  await setJob?.remove();

  // NEGATIVE CONTROL (M104 — the subject must EXIST, and the read must discriminate).
  // Same helper, same chat, a SINGLE-variant job: if the phase leg above were reading
  // a constant rather than the job, this would also say "set".
  const ctlChatId = randomUUID();
  const ctlJobId = await enqueueAuthoring({
    boardId: P.id,
    tutorUserId: tut.id,
    chatId: ctlChatId,
    subTopicId: fx.chA.subIds[0]!,
    count: 1,
    phase: "draft",
  });
  const liveCtl = await getActiveAuthoringJob(P.id, ctlChatId);
  check(
    "SET-ASYNC (NEG): a single-variant job on the same helper reports 'draft', not 'set'",
    ctlJobId.length > 0 && liveCtl?.jobId === ctlJobId && liveCtl?.phase === "draft",
  );
  await (await authoringQueue.getJob(ctlJobId))?.remove();
  await authoringQueue.close();

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
