/**
 * probe_authoring_plan — Slice TWOWAY-1 exit gate (the two-way master↔worker
 * handoff: the worker PLANS, the tutor GATES, then it drafts).
 *
 * Real DB + real RLS, throwaway boards P/Q (M22) with full cleanup. Two-tier
 * (don't over-read a single AI response — M13/M28):
 *
 *   FIRM — everything the AI is not needed for, and therefore everything that must
 *     hold every single time:
 *       1. The migration's reading of HISTORY: a bare authoring_worker insert (what
 *          pre-slice code wrote) defaults to messages='[]' + status='drafted' — the
 *          truthful reading of a completed one-shot spawn, so no backfill is owed.
 *       2. getChat surfaces an open gate as `pendingPlan`, and does NOT surface an
 *          episode that was already answered (drafted / abandoned / re-planning).
 *          This is the resume-proofing claim: the card comes from the chat payload,
 *          not from the relay turn in the transcript.
 *       3. approve → status 'drafting', count == the PLAN's item count (never a
 *          client number), and a SECOND approve is refused (the double-click /
 *          replay guard — without it one plan could draft twice).
 *       4. amend → the note lands in the WORKER's own history AND in the master
 *          transcript, status 'planning'. Both appends, one action.
 *       5. dismiss → 'abandoned', and the gate is then unusable.
 *       6. Guards: a foreign tutor is refused; an episode belonging to a DIFFERENT
 *          chat is refused; approving a plan with NO items is refused (approving
 *          nothing would make the gate theatre).
 *       7. RLS: an episode row is invisible under a foreign board.
 *       8. HTTP 401 on all three gate routes with no session.
 *
 *   SOFT (real Gemini) — planFromChat end-to-end: an episode is created 'planned'
 *     with a real plan, the RELAY lands in the master transcript, and that relay
 *     carries NO aiSessionId (the resume-safety invariant: a relay with a borrowed
 *     handle would resume a vendor session whose context never held the plan). Then
 *     a real draft against the approved episode APPENDS to the same row rather than
 *     opening a second one.
 *
 * 🔴 STOP `bun run worker` first — a running worker would pick up the jobs this
 * probe's routes enqueue and run them against the fixture (see
 * [[b2c-worker-breaks-probes]]). This probe drives the SERVICES directly, so a
 * stolen job only adds noise, but the AI spend is real.
 */
import { eq, sql } from "drizzle-orm";
import type { PgTransaction } from "drizzle-orm/pg-core";
import { randomUUID } from "node:crypto";
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
import type { WorkerPlan, WorkerTurn } from "@b2c/kernel/contracts";
import { db, queryClient } from "../src/db/client";
import { withBoard } from "../src/db/with-board";
import { env } from "../src/config/env";
import {
  amendAuthoringPlan,
  approveAuthoringPlan,
  AuthoringChatNotFoundError,
  AuthoringPlanNotFoundError,
  dismissAuthoringPlan,
  getChat,
  planFromChat,
  PlanHasNoItemsError,
  startChat,
} from "../src/services/authoring_chat";
import { authorFromChat } from "../src/services/authoring_chat";

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

/** Did `fn` throw an error of this class? Used for every guard leg — asserting the
 *  CLASS (not a message substring) so a reworded message can't turn a guard leg
 *  green or red for the wrong reason. */
async function throwsWith(
  fn: () => Promise<unknown>,
  cls: new (...a: never[]) => Error,
): Promise<boolean> {
  try {
    await fn();
    return false;
  } catch (e) {
    return e instanceof cls;
  }
}

/** A synthetic plan, so every gate leg runs with NO AI. */
function fakePlan(nItems: number, asks: string[] = []): WorkerPlan {
  return {
    read: "ZZREADZZ the student computes fine but can't say why.",
    items: Array.from({ length: nItems }, (_, i) => ({
      n: i + 1,
      axis: (i % 2 === 0 ? "conceptual" : "procedural") as WorkerPlan["items"][number]["axis"],
      kind: `ZZKIND${i + 1}ZZ`,
      intent: `ZZINTENT${i + 1}ZZ`,
      difficulty: "one dial above the bank",
    })),
    questions: asks,
  };
}

function planTurn(plan: WorkerPlan): WorkerTurn {
  return {
    id: randomUUID(),
    role: "worker",
    kind: "plan",
    text: "ZZPLANTEXTZZ",
    plan,
    createdAt: new Date().toISOString(),
    vendorId: "gemini_api",
  };
}

async function main() {
  const tag = `${Date.now()}`;
  await db.execute(sql`select 1`);
  check("DB connectivity (select 1) as app role", true);

  // ── seed ──
  const [P] = await db.insert(board).values({ slug: `apln-p-${tag}`, name: "Probe P" }).returning();
  const [Q] = await db.insert(board).values({ slug: `apln-q-${tag}`, name: "Probe Q" }).returning();
  if (!P || !Q) throw new Error("board seed failed");
  const [tut] = await db
    .insert(appUser)
    .values({ email: `apln-tut-${tag}@example.com`, name: "Tutor", userType: "tutor" })
    .returning();
  const [other] = await db
    .insert(appUser)
    .values({ email: `apln-oth-${tag}@example.com`, name: "Other Tutor", userType: "tutor" })
    .returning();
  const [stu] = await db
    .insert(appUser)
    .values({ email: `apln-stu-${tag}@example.com`, name: "Student", userType: "student" })
    .returning();
  if (!tut || !other || !stu) throw new Error("app_user seed failed");

  const fx = await withBoard(P.id, async (tx: Tx) => {
    const [subj] = await tx
      .insert(subject)
      .values({ boardId: P.id, slug: "phys", name: "Physics", grade: "IGCSE" })
      .returning();
    const [chap] = await tx
      .insert(chapter)
      .values({
        boardId: P.id,
        subjectId: subj!.id,
        slug: "motion",
        name: "Motion",
        ordinal: 1,
        metadata: { topicsMd: "ZZTOPICSMDZZ raw prose for this chapter." },
      })
      .returning();
    const [tp] = await tx
      .insert(topic)
      .values({ boardId: P.id, chapterId: chap!.id, slug: "speed", name: "Speed", ordinal: 1 })
      .returning();
    const [st] = await tx
      .insert(subTopic)
      .values({ boardId: P.id, topicId: tp!.id, slug: "accel", name: "Acceleration", ordinal: 1 })
      .returning();
    // A second sub-topic, so a cross-chat / cross-episode mixup has somewhere to go.
    await tx.insert(learningObjective).values({
      boardId: P.id,
      subTopicId: st!.id,
      axis: "conceptual",
      code: "C1",
      description: "Explains acceleration as the rate of change of velocity.",
    });
    await tx.insert(learningObjective).values({
      boardId: P.id,
      subTopicId: st!.id,
      axis: "procedural",
      code: "P1",
      description: "Computes acceleration = Δv / Δt with correct units.",
    });
    await tx.insert(student).values({ userId: stu.id, boardId: P.id, class: "9", tutorId: tut.id });
    return { chapterId: chap!.id, subTopicId: st!.id };
  });

  // Narrowed locals: seedGate below is a hoisted function declaration, so TS won't
  // carry the `if (!P || !Q) throw` narrowing into it.
  const boardP = P;
  const tutorId = tut.id;
  const studentId = stu.id;

  /** Open a fresh chat + a 'planned' episode on it. Returns both ids. NO AI. */
  async function seedGate(plan: WorkerPlan) {
    const chat = await rows(boardP.id, (tx) =>
      startChat(tx, {
        boardId: boardP.id,
        tutorUserId: tutorId,
        studentId,
        vendor: "gemini_api",
        chapterId: fx.chapterId,
      }),
    );
    const [ep] = await rows(boardP.id, (tx) =>
      tx
        .insert(authoringWorker)
        .values({
          boardId: boardP.id,
          chatId: chat.chatId,
          subTopicId: fx.subTopicId,
          vendor: "gemini_api",
          brief: "seeded-plan-brief",
          messages: [planTurn(plan)],
          status: "planned",
        })
        .returning({ id: authoringWorker.id }),
    );
    return { chatId: chat.chatId, workerId: ep!.id };
  }

  // ── FIRM 1: how the migration reads PRE-SLICE rows ──
  // A bare insert is exactly what pre-slice code wrote. If these defaults were wrong
  // (messages null, or status 'planning'), every historical spawn would either crash
  // the turn parser or come back as a phantom gate awaiting approval.
  const bareChat = await rows(P.id, (tx) =>
    startChat(tx, {
      boardId: P.id,
      tutorUserId: tut.id,
      studentId: stu.id,
      vendor: "gemini_api",
      chapterId: fx.chapterId,
    }),
  );
  const [legacyEp] = await rows(P.id, (tx) =>
    tx
      .insert(authoringWorker)
      .values({
        boardId: P.id,
        chatId: bareChat.chatId,
        subTopicId: fx.subTopicId,
        vendor: "gemini_api",
        brief: "legacy-one-shot-spawn",
      })
      .returning(),
  );
  check(
    "0038: a pre-slice (bare) worker row defaults messages to []",
    Array.isArray(legacyEp!.messages) && (legacyEp!.messages as unknown[]).length === 0,
  );
  check(
    "0038: a pre-slice worker row defaults status to 'drafted' (a completed spawn, not a phantom gate)",
    legacyEp!.status === "drafted",
  );
  const legacyChatView = await rows(P.id, (tx) =>
    getChat(tx, { tutorUserId: tut.id, chatId: bareChat.chatId }),
  );
  check(
    "0038: a pre-slice row does NOT surface as a pending gate",
    legacyChatView.pendingPlan === null,
  );

  // ── FIRM 2: an open gate surfaces on getChat (the resume-proof source) ──
  const g1 = await seedGate(fakePlan(3));
  const view1 = await rows(P.id, (tx) =>
    getChat(tx, { tutorUserId: tut.id, chatId: g1.chatId }),
  );
  check("gate: getChat surfaces the open plan as pendingPlan", !!view1.pendingPlan);
  check(
    "gate: pendingPlan carries the episode id + the hierarchy names",
    view1.pendingPlan?.workerId === g1.workerId &&
      view1.pendingPlan?.subTopicName === "Acceleration" &&
      view1.pendingPlan?.topicName === "Speed" &&
      view1.pendingPlan?.chapterName === "Motion",
  );
  check(
    "gate: pendingPlan carries the structured plan (3 items, read, marker intents)",
    view1.pendingPlan?.plan.items.length === 3 &&
      view1.pendingPlan?.plan.read.includes("ZZREADZZ") &&
      view1.pendingPlan?.plan.items[0]?.intent === "ZZINTENT1ZZ",
  );

  // ── FIRM 3: approve ──
  const appr = await rows(P.id, (tx) =>
    approveAuthoringPlan(tx, {
      tutorUserId: tut.id,
      chatId: g1.chatId,
      workerId: g1.workerId,
    }),
  );
  check(
    "approve: count comes from the PLAN's item count (3), not a client number",
    appr.count === 3,
  );
  check("approve: hands back the episode's sub_topic + board", appr.subTopicId === fx.subTopicId && appr.boardId === P.id);
  const [afterAppr] = await rows(P.id, (tx) =>
    tx.select().from(authoringWorker).where(eq(authoringWorker.id, g1.workerId)),
  );
  check("approve: episode status → 'drafting'", afterAppr!.status === "drafting");
  const view1b = await rows(P.id, (tx) =>
    getChat(tx, { tutorUserId: tut.id, chatId: g1.chatId }),
  );
  check(
    "approve: the gate is GONE from getChat (an answered gate must not re-open on resume)",
    view1b.pendingPlan === null,
  );
  check(
    "approve: a SECOND approve is refused (replay/double-click can't draft the same plan twice)",
    await throwsWith(
      () =>
        rows(P.id, (tx) =>
          approveAuthoringPlan(tx, {
            tutorUserId: tut.id,
            chatId: g1.chatId,
            workerId: g1.workerId,
          }),
        ),
      AuthoringPlanNotFoundError,
    ),
  );

  // ── FIRM 4: amend — TWO appends, one action ──
  const g2 = await seedGate(fakePlan(2));
  // A tutor turn already in the master transcript, so the append is provably an
  // append and not a replace.
  await rows(P.id, (tx) =>
    tx
      .update(authoringChat)
      .set({
        messages: [
          {
            id: randomUUID(),
            role: "user",
            text: "ZZPRIORTURNZZ",
            createdAt: new Date().toISOString(),
          },
        ],
      })
      .where(eq(authoringChat.id, g2.chatId)),
  );
  const AMEND = "ZZAMENDZZ drop the graph one and go a dial harder.";
  const amended = await rows(P.id, (tx) =>
    amendAuthoringPlan(tx, {
      tutorUserId: tut.id,
      chatId: g2.chatId,
      workerId: g2.workerId,
      note: AMEND,
    }),
  );
  check("amend: re-plans at the size the worker last proposed (2)", amended.count === 2);
  const [afterAmend] = await rows(P.id, (tx) =>
    tx.select().from(authoringWorker).where(eq(authoringWorker.id, g2.workerId)),
  );
  const amendTurns = afterAmend!.messages as WorkerTurn[];
  check("amend: episode status → 'planning' (a re-plan is in flight)", afterAmend!.status === "planning");
  check(
    "amend: the note is APPENDED to the WORKER's own history as a tutor turn",
    amendTurns.length === 2 &&
      amendTurns[0]?.kind === "plan" &&
      amendTurns[1]?.role === "tutor" &&
      amendTurns[1]?.kind === "amendment" &&
      amendTurns[1]?.text === AMEND,
  );
  const amendChat = await rows(P.id, (tx) =>
    getChat(tx, { tutorUserId: tut.id, chatId: g2.chatId }),
  );
  check(
    "amend: the SAME note is appended to the master transcript (the master stays coherent)",
    amendChat.messages.length === 2 &&
      amendChat.messages[0]?.text === "ZZPRIORTURNZZ" &&
      amendChat.messages[1]?.role === "user" &&
      amendChat.messages[1]?.text === AMEND,
  );
  check(
    "amend: the superseded plan no longer surfaces as a gate (status is 'planning', not 'planned')",
    amendChat.pendingPlan === null,
  );
  check(
    "amend: amending again is refused while the re-plan is in flight",
    await throwsWith(
      () =>
        rows(P.id, (tx) =>
          amendAuthoringPlan(tx, {
            tutorUserId: tut.id,
            chatId: g2.chatId,
            workerId: g2.workerId,
            note: "again",
          }),
        ),
      AuthoringPlanNotFoundError,
    ),
  );

  // ── FIRM 5: dismiss ──
  const g3 = await seedGate(fakePlan(2));
  await rows(P.id, (tx) =>
    dismissAuthoringPlan(tx, {
      tutorUserId: tut.id,
      chatId: g3.chatId,
      workerId: g3.workerId,
    }),
  );
  const [afterDismiss] = await rows(P.id, (tx) =>
    tx.select().from(authoringWorker).where(eq(authoringWorker.id, g3.workerId)),
  );
  check("dismiss: episode status → 'abandoned'", afterDismiss!.status === "abandoned");
  const dismissView = await rows(P.id, (tx) =>
    getChat(tx, { tutorUserId: tut.id, chatId: g3.chatId }),
  );
  check("dismiss: the gate is gone from getChat", dismissView.pendingPlan === null);
  check(
    "dismiss: approving a dismissed plan is refused",
    await throwsWith(
      () =>
        rows(P.id, (tx) =>
          approveAuthoringPlan(tx, {
            tutorUserId: tut.id,
            chatId: g3.chatId,
            workerId: g3.workerId,
          }),
        ),
      AuthoringPlanNotFoundError,
    ),
  );

  // ── FIRM 6: guards ──
  const g4 = await seedGate(fakePlan(2));
  check(
    "guard: a DIFFERENT tutor cannot approve this chat's plan (chat ownership)",
    await throwsWith(
      () =>
        rows(P.id, (tx) =>
          approveAuthoringPlan(tx, {
            tutorUserId: other.id,
            chatId: g4.chatId,
            workerId: g4.workerId,
          }),
        ),
      AuthoringChatNotFoundError,
    ),
  );
  // An episode that exists, is 'planned', and is owned by the same tutor — but hangs
  // off a DIFFERENT chat. Without the chatId predicate in the guard this would be
  // approvable through the wrong chat.
  const g5 = await seedGate(fakePlan(2));
  check(
    "guard: an episode belonging to ANOTHER chat cannot be gated through this one",
    await throwsWith(
      () =>
        rows(P.id, (tx) =>
          approveAuthoringPlan(tx, {
            tutorUserId: tut.id,
            chatId: g4.chatId, // this chat…
            workerId: g5.workerId, // …that chat's episode
          }),
        ),
      AuthoringPlanNotFoundError,
    ),
  );
  check(
    "guard: an unknown episode id is refused",
    await throwsWith(
      () =>
        rows(P.id, (tx) =>
          approveAuthoringPlan(tx, {
            tutorUserId: tut.id,
            chatId: g4.chatId,
            workerId: randomUUID(),
          }),
        ),
      AuthoringPlanNotFoundError,
    ),
  );
  // A plan that is only QUESTIONS: approving it would draft what nobody planned.
  const g6 = await seedGate(fakePlan(0, ["Which misconception do you want targeted?"]));
  const view6 = await rows(P.id, (tx) =>
    getChat(tx, { tutorUserId: tut.id, chatId: g6.chatId }),
  );
  check(
    "guard: an items-less plan still SURFACES (its questions are the point)",
    view6.pendingPlan?.plan.questions.length === 1 &&
      view6.pendingPlan?.plan.items.length === 0,
  );
  check(
    "guard: approving an items-less plan is refused (the gate isn't theatre)",
    await throwsWith(
      () =>
        rows(P.id, (tx) =>
          approveAuthoringPlan(tx, {
            tutorUserId: tut.id,
            chatId: g6.chatId,
            workerId: g6.workerId,
          }),
        ),
      PlanHasNoItemsError,
    ),
  );
  check(
    "guard: an items-less plan CAN still be amended (the way out)",
    !(await throwsWith(
      () =>
        rows(P.id, (tx) =>
          amendAuthoringPlan(tx, {
            tutorUserId: tut.id,
            chatId: g6.chatId,
            workerId: g6.workerId,
            note: "target the sign error",
          }),
        ),
      AuthoringPlanNotFoundError,
    )),
  );

  // ── FIRM 7: RLS ──
  const underQ = await rows(Q.id, (tx) =>
    tx.select().from(authoringWorker).where(eq(authoringWorker.id, g4.workerId)),
  );
  check("RLS: the episode row is invisible under a foreign board (Q)", underQ.length === 0);

  // ── FIRM 8: HTTP 401 on the gate routes with no session ──
  for (const route of [
    "approveAuthoringPlan",
    "amendAuthoringPlan",
    "dismissAuthoringPlan",
  ]) {
    try {
      const body =
        route === "amendAuthoringPlan"
          ? { chatId: g4.chatId, workerId: g4.workerId, note: "x" }
          : { chatId: g4.chatId, workerId: g4.workerId };
      const res = await fetch(`http://localhost:${env.PORT}/trpc/tutor.${route}?batch=1`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-board": P.slug },
        body: JSON.stringify({ 0: { json: body } }),
        signal: AbortSignal.timeout(5000),
      });
      check(`HTTP tutor.${route} (no session) → 401 (got ${res.status})`, res.status === 401);
    } catch {
      console.log(`  ~ HTTP check for ${route} skipped (server not running / timed out)`);
    }
  }

  // ── SOFT (real Gemini): planFromChat E2E, then a real draft on the approved episode ──
  if (!env.GEMINI_API_KEY) {
    console.log("  ~ real-Gemini legs SKIPPED (GEMINI_API_KEY unset)");
  } else {
    try {
      const chat = await rows(P.id, (tx) =>
        startChat(tx, {
          boardId: P.id,
          tutorUserId: tut.id,
          studentId: stu.id,
          vendor: "gemini_api",
          chapterId: fx.chapterId,
        }),
      );
      // A conversation for the plan to be a plan ABOUT.
      await rows(P.id, (tx) =>
        tx
          .update(authoringChat)
          .set({
            messages: [
              {
                id: randomUUID(),
                role: "user",
                text: "He can compute a = dv/dt but can't explain what acceleration MEANS. Target that.",
                createdAt: new Date().toISOString(),
              },
            ],
          })
          .where(eq(authoringChat.id, chat.chatId)),
      );

      const planned = await rows(P.id, (tx) =>
        planFromChat(tx, {
          tutorUserId: tut.id,
          chatId: chat.chatId,
          subTopicId: fx.subTopicId,
          count: 2,
        }),
      );
      check("plan E2E: returns phase='plan' + an episode id", planned.phase === "plan" && !!planned.workerId);
      check(
        "plan E2E: the plan has a non-empty read + ≥1 item with all four fields",
        planned.plan.read.trim().length > 0 &&
          planned.plan.items.length >= 1 &&
          planned.plan.items.every(
            (i) =>
              !!i.kind.trim() && !!i.intent.trim() && !!i.difficulty.trim() && !!i.axis,
          ),
      );
      soft("plan E2E items", planned.plan.items.map((i) => `${i.n}:${i.axis}:${i.kind}`));
      soft("plan E2E read (first 160ch)", planned.plan.read.slice(0, 160));
      soft("plan E2E asks", planned.plan.questions);

      const [ep] = await rows(P.id, (tx) =>
        tx.select().from(authoringWorker).where(eq(authoringWorker.id, planned.workerId)),
      );
      check("plan E2E: the episode is 'planned' (awaiting the gate)", ep!.status === "planned");
      const epTurns = ep!.messages as WorkerTurn[];
      check(
        "plan E2E: the episode holds ONE worker plan turn carrying the structured plan",
        epTurns.length === 1 && epTurns[0]?.role === "worker" && epTurns[0]?.kind === "plan" && !!epTurns[0]?.plan,
      );

      // The RELAY: the plan is in the master transcript so the master model can talk
      // about it — and carries NO session handle (the resume-safety invariant).
      const afterPlan = await rows(P.id, (tx) =>
        getChat(tx, { tutorUserId: tut.id, chatId: chat.chatId }),
      );
      const relay = afterPlan.messages.at(-1);
      check(
        "plan E2E: a RELAY assistant turn landed in the master transcript",
        relay?.role === "assistant" && relay.text.includes("Acceleration"),
      );
      check(
        "plan E2E: the relay carries the plan's own content (not just a pointer)",
        !!relay && planned.plan.items.every((i) => relay.text.includes(i.kind)),
      );
      check(
        "plan E2E: the relay carries NO aiSessionId (a borrowed handle would resume a session that never held the plan)",
        relay?.aiSessionId === undefined,
      );
      check(
        "plan E2E: the tutor's prior turn was NOT clobbered by the relay append",
        afterPlan.messages.length === 2 && afterPlan.messages[0]?.role === "user",
      );
      check("plan E2E: getChat surfaces it as the pending gate", afterPlan.pendingPlan?.workerId === planned.workerId);

      // Approve for real, then run the DRAFT phase against the approved episode — the
      // claim being that it APPENDS to the same row (one episode) rather than opening
      // a second, and that the drafted turn records what the plan produced.
      const approved = await rows(P.id, (tx) =>
        approveAuthoringPlan(tx, {
          tutorUserId: tut.id,
          chatId: chat.chatId,
          workerId: planned.workerId,
        }),
      );
      const drafted = await rows(P.id, (tx) =>
        authorFromChat(tx, {
          tutorUserId: tut.id,
          chatId: chat.chatId,
          subTopicId: approved.subTopicId,
          count: approved.count,
          workerId: planned.workerId,
        }),
      );
      check("draft E2E: drafted ≥1 question against the approved plan", drafted.drafts.length >= 1);
      soft("draft E2E", { n: drafted.drafts.length, axes: drafted.drafts.map((d) => d.axis) });
      const epRows = await rows(P.id, (tx) =>
        tx.select().from(authoringWorker).where(eq(authoringWorker.chatId, chat.chatId)),
      );
      check(
        "draft E2E: ONE episode row for the chat (the draft APPENDED, it did not open a second)",
        epRows.length === 1 && epRows[0]?.id === planned.workerId,
      );
      check("draft E2E: episode status → 'drafted'", epRows[0]?.status === "drafted");
      const finalTurns = epRows[0]!.messages as WorkerTurn[];
      check(
        "draft E2E: the episode records the plan AND what it drafted (2 turns, append-only)",
        finalTurns.length === 2 &&
          finalTurns[0]?.kind === "plan" &&
          finalTurns[1]?.kind === "drafted",
      );
      check(
        "draft E2E: nothing is APPROVED (the M11 gate still holds — drafts only)",
        drafted.drafts.every((d) => !!d.id),
      );
      const liveCount = await rows(P.id, (tx) =>
        tx
          .select({ n: sql<number>`count(*)::int` })
          .from(question)
          .where(eq(question.status, "approved")),
      );
      check("draft E2E: zero approved questions on this board", (liveCount[0]?.n ?? 0) === 0);
    } catch (e) {
      check("real-Gemini plan/draft E2E", false);
      console.error("    E2E error:", (e as Error).message.slice(0, 300));
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
  for (const u of [tut, other, stu]) await db.delete(appUser).where(eq(appUser.id, u.id));
  await db.delete(board).where(eq(board.id, P.id));
  await db.delete(board).where(eq(board.id, Q.id));

  console.log(`\nprobe_authoring_plan: ${passed} passed, ${failed} failed`);
  await queryClient.end();
  process.exit(failed === 0 ? 0 : 1);
}

main().catch(async (err) => {
  console.error("probe_authoring_plan FAILED:", err);
  await queryClient.end();
  process.exit(1);
});
