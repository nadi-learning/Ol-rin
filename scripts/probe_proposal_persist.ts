/**
 * probe_proposal_persist — Slice PROPOSAL-PERSIST exit gate.
 *
 * 🔴 THE BUG THIS EXISTS FOR (prod, 2026-08-07, chat c68a747a):
 * A tutor's go-ahead spent 50s of Claude on a 16-question coverage blueprint at
 * 16:42:20. A deploy restarted the backend at 16:46:13. Every remount after it ran
 * `resetAll()` → `getChat`, and `getChat` restored messages + drafts + the plan gate
 * and had NO WAY to return the blueprint. The tutor asked "Show me the plan again?
 * Got lost somewhere." 45 minutes later. Zero workers spawned, zero questions
 * authored; the blueprint survived only in ai_call_log.
 *
 * 🔑 THE LOAD-BEARING LEG IS THE REMOUNT. Every restore assertion here reads the
 * chat through a SEPARATE withBoard() call — a fresh transaction, which is the
 * closest in-process analogue of the tutor switching student and coming back. An
 * assertion made on the same tx that wrote the row would pass against the BUGGY
 * code too, because the bug was never in the write.
 *
 * Real DB + real RLS, throwaway board P (M22) with full cleanup. Split by cost:
 *   NO-VENDOR — the restore/clear/tolerance matrix. This is where the defect lived,
 *     so it is proved exhaustively and cheaply by writing the column directly (what
 *     the producers do) and reading it back through the real getChat.
 *   REAL-VENDOR — that the PRODUCERS actually persist. Two live claude_cli calls
 *     (proposeTarget + proposeTargetSet), each followed by a fresh-tx read. Skipped
 *     with a loud SKIP line when PROBE_NO_VENDOR=1, never silently.
 */
import { eq, sql } from "drizzle-orm";
import type { PgTransaction } from "drizzle-orm/pg-core";
import {
  appUser,
  authoringChat,
  authoringWorker,
  board,
  chapter,
  eventLog,
  learningObjective,
  masteryState,
  observation,
  question,
  student,
  subject,
  subTopic,
  topic,
} from "@b2c/kernel/schema";
import { db, queryClient } from "../src/db/client";
import { withBoard } from "../src/db/with-board";
import {
  clearPendingProposal,
  getChat,
  proposeTarget,
  proposeTargetSet,
  startChat,
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
function skip(name: string) {
  console.log(`  ⊘ SKIPPED (no vendor): ${name}`);
}
const rows = <T>(boardId: string, fn: (tx: Tx) => Promise<T>) => withBoard(boardId, fn);

const NO_VENDOR = process.env.PROBE_NO_VENDOR === "1";

/** Write the column exactly as persistPendingProposal does — the producers' side of
 *  the contract, without paying for an AI call to reach it. */
async function seedProposal(boardId: string, chatId: string, payload: unknown) {
  await withBoard(boardId, async (tx: Tx) => {
    await tx
      .update(authoringChat)
      .set({ pendingProposal: payload as never })
      .where(eq(authoringChat.id, chatId));
  });
}

async function readColumn(boardId: string, chatId: string): Promise<unknown> {
  return withBoard(boardId, async (tx: Tx) => {
    const [r] = await tx
      .select({ p: authoringChat.pendingProposal })
      .from(authoringChat)
      .where(eq(authoringChat.id, chatId))
      .limit(1);
    return r?.p ?? null;
  });
}

async function main() {
  const tag = `${Date.now()}`;
  await db.execute(sql`select 1`);
  check("DB connectivity (select 1) as app role", true);

  const [P] = await db
    .insert(board)
    .values({ slug: `pprop-p-${tag}`, name: "Probe P" })
    .returning();
  if (!P) throw new Error("board seed failed");

  const [tut] = await db
    .insert(appUser)
    .values({ email: `pprop-tut-${tag}@example.com`, name: "Tutor", userType: "tutor" })
    .returning();
  const [tut2] = await db
    .insert(appUser)
    .values({ email: `pprop-tut2-${tag}@example.com`, name: "Other Tutor", userType: "tutor" })
    .returning();
  const [stu] = await db
    .insert(appUser)
    .values({ email: `pprop-stu-${tag}@example.com`, name: "Student A", userType: "student" })
    .returning();
  if (!tut || !tut2 || !stu) throw new Error("app_user seed failed");

  const fx = await withBoard(P.id, async (tx: Tx) => {
    const [subj] = await tx
      .insert(subject)
      .values({ boardId: P.id, slug: "phys", name: "Physics", grade: "IGCSE" })
      .returning();
    const [chap] = await tx
      .insert(chapter)
      .values({ boardId: P.id, subjectId: subj!.id, slug: "motion", name: "Motion", ordinal: 1 })
      .returning();
    const [tp] = await tx
      .insert(topic)
      .values({ boardId: P.id, chapterId: chap!.id, slug: "speed", name: "Speed", ordinal: 1 })
      .returning();
    const [st] = await tx
      .insert(subTopic)
      .values({ boardId: P.id, topicId: tp!.id, slug: "accel", name: "Acceleration", ordinal: 1 })
      .returning();
    const [st2] = await tx
      .insert(subTopic)
      .values({ boardId: P.id, topicId: tp!.id, slug: "vtgraph", name: "Velocity-time graphs", ordinal: 2 })
      .returning();
    await tx.insert(learningObjective).values({
      boardId: P.id,
      subTopicId: st!.id,
      axis: "conceptual",
      code: "C1",
      description: "Explains acceleration as the rate of change of velocity.",
    });
    await tx.insert(learningObjective).values({
      boardId: P.id,
      subTopicId: st2!.id,
      axis: "procedural",
      code: "P1",
      description: "Reads gradient and area off a velocity-time graph.",
    });
    await tx.insert(student).values({ userId: stu.id, boardId: P.id, class: "9", tutorId: tut.id });
    await tx.insert(masteryState).values({
      boardId: P.id,
      studentId: stu.id,
      subTopicId: st!.id,
      conceptualLevel: 3,
      proceduralLevel: 2,
      description: "Solid on rate-of-change; shaky on unit conversion under time pressure.",
      log: "internal",
    });
    await tx.insert(observation).values({
      boardId: P.id,
      studentId: stu.id,
      subTopicId: st!.id,
      axis: "procedural",
      observationLevel: 2,
      reasoning: "Set up Δv/Δt correctly but dropped the s→ms conversion.",
      source: "stage1_scorer",
      calibrationFlag: "over",
    });
    return { chapterId: chap!.id, subTopicId: st!.id, subTopicId2: st2!.id };
  });

  // One chat, reused: every leg reads it through a FRESH tx.
  const chat = await rows(P.id, (tx) =>
    startChat(tx, {
      boardId: P.id,
      tutorUserId: tut.id,
      studentId: stu.id,
      vendor: "claude_cli",
      chapterIds: [fx.chapterId],
    }),
  );
  check("fixture: chat started", !!chat.chatId);

  // ────────────────────────────────────────────────────────────────────────────
  console.log("\n── legacy / empty state ──");
  // ────────────────────────────────────────────────────────────────────────────

  {
    // The pre-slice world and every legacy row: column NULL → no proposal fields.
    // This is the leg that pins "additive and nullable did not change behaviour".
    const v = await rows(P.id, (tx) => getChat(tx, { tutorUserId: tut.id, chatId: chat.chatId }));
    check("legacy row (pending_proposal NULL): getChat returns NO proposedSet", v.proposedSet === undefined);
    check("legacy row: getChat returns NO proposedTarget", v.proposedTarget === undefined);
    check("legacy row: getChat returns NO proposedAt", v.proposedAt === undefined);
    check("legacy row: the chat still OPENS (messages readable)", Array.isArray(v.messages));
  }

  // ────────────────────────────────────────────────────────────────────────────
  console.log("\n── THE REMOUNT: a SET proposal survives a fresh tx ──");
  // ────────────────────────────────────────────────────────────────────────────

  const setMade = "2026-08-07T16:42:20.000Z";
  const setPayload = {
    kind: "set",
    createdAt: setMade,
    set: {
      chatId: chat.chatId,
      studentId: stu.id,
      rationale: "Mix acceleration with v-t graphs so she must discriminate.",
      picks: [
        {
          subTopicId: fx.subTopicId,
          subTopicName: "Acceleration",
          topicName: "Speed",
          chapterName: "Motion",
          count: 2,
          items: [
            { n: 1, lo: "C1", axis: "conceptual", kind: "counterfactual", intent: "probe rate-of-change", difficulty: "medium" },
            { n: 2, lo: "P1", axis: "procedural", kind: "compute", intent: "unit conversion", difficulty: "medium" },
          ],
        },
      ],
    },
  };

  {
    await seedProposal(P.id, chat.chatId, setPayload);
    // FRESH TX = the remount. Against the pre-slice getChat this read returned
    // nothing, which is precisely the prod failure.
    const v = await rows(P.id, (tx) => getChat(tx, { tutorUserId: tut.id, chatId: chat.chatId }));
    check("REMOUNT: getChat RESTORES proposedSet", !!v.proposedSet);
    check("REMOUNT: the blueprint survives intact (picks)", v.proposedSet?.picks.length === 1);
    check(
      "REMOUNT: the ITEMS survive — the expensive part, not just the pick",
      v.proposedSet?.picks[0]?.items.length === 2,
    );
    check(
      "REMOUNT: item fields survive verbatim (axis/kind/intent)",
      v.proposedSet?.picks[0]?.items[0]?.kind === "counterfactual" &&
        v.proposedSet?.picks[0]?.items[0]?.axis === "conceptual",
    );
    check("REMOUNT: rationale survives", (v.proposedSet?.rationale ?? "").includes("discriminate"));
    check("REMOUNT: proposedAt is the moment the AI made it", v.proposedAt === setMade);
    check(
      "REMOUNT: a SET proposal does NOT masquerade as a target",
      v.proposedTarget === undefined,
    );
    // The union discriminates on `kind`, so the sub_topic UUID is what the fan-out
    // will be handed. If this drifted to an index the stored proposal could rot.
    check(
      "the stored pick carries a RESOLVED sub_topic UUID, never an index",
      v.proposedSet?.picks[0]?.subTopicId === fx.subTopicId,
    );
  }

  // ────────────────────────────────────────────────────────────────────────────
  console.log("\n── THE REMOUNT: a TARGET proposal survives a fresh tx ──");
  // ────────────────────────────────────────────────────────────────────────────

  const targetMade = "2026-08-07T15:00:00.000Z";
  const targetPayload = {
    kind: "target",
    createdAt: targetMade,
    target: {
      chatId: chat.chatId,
      studentId: stu.id,
      subTopicId: fx.subTopicId,
      subTopicName: "Acceleration",
      topicName: "Speed",
      chapterName: "Motion",
      count: 3,
      rationale: "Her procedural level trails her conceptual one here.",
    },
  };

  {
    await seedProposal(P.id, chat.chatId, targetPayload);
    const v = await rows(P.id, (tx) => getChat(tx, { tutorUserId: tut.id, chatId: chat.chatId }));
    check("REMOUNT: getChat RESTORES proposedTarget", !!v.proposedTarget);
    check("REMOUNT: the target's sub_topic survives", v.proposedTarget?.subTopicId === fx.subTopicId);
    check("REMOUNT: the target's COUNT survives (what the tutor approves)", v.proposedTarget?.count === 3);
    check("REMOUNT: proposedAt is the target's own timestamp", v.proposedAt === targetMade);
    check(
      "REMOUNT: a TARGET proposal does NOT masquerade as a set",
      v.proposedSet === undefined,
    );
  }

  // ────────────────────────────────────────────────────────────────────────────
  console.log("\n── DISMISS: the escape hatch that keeps the composer usable ──");
  // ────────────────────────────────────────────────────────────────────────────

  {
    // 🔴 Load-bearing. The FE disables the composer while a proposal is open. Before
    // this slice a reload cleared it; now that it survives one, dismiss is the ONLY
    // way out — without it a stored proposal bricks the chat permanently.
    await rows(P.id, (tx) => clearPendingProposal(tx, { tutorUserId: tut.id, chatId: chat.chatId }));
    const col = await readColumn(P.id, chat.chatId);
    check("DISMISS: the column is actually NULL (not just hidden from the view)", col === null);
    const v = await rows(P.id, (tx) => getChat(tx, { tutorUserId: tut.id, chatId: chat.chatId }));
    check("DISMISS: getChat no longer returns a proposal", v.proposedSet === undefined && v.proposedTarget === undefined);
    check("DISMISS: proposedAt goes with it", v.proposedAt === undefined);
  }

  {
    // Idempotent — a double-click or a retry must not fail.
    await rows(P.id, (tx) => clearPendingProposal(tx, { tutorUserId: tut.id, chatId: chat.chatId }));
    const v = await rows(P.id, (tx) => getChat(tx, { tutorUserId: tut.id, chatId: chat.chatId }));
    check("DISMISS: clearing an already-clear proposal is a no-op, not an error", v.proposedSet === undefined);
  }

  {
    // Ownership: clearing runs through ownedChat, so another tutor cannot dismiss
    // this tutor's proposal. Same wall as every other chat mutation.
    await seedProposal(P.id, chat.chatId, setPayload);
    let threw = false;
    try {
      await rows(P.id, (tx) => clearPendingProposal(tx, { tutorUserId: tut2.id, chatId: chat.chatId }));
    } catch {
      threw = true;
    }
    check("DISMISS: a FOREIGN tutor cannot clear this chat's proposal", threw);
    const still = await readColumn(P.id, chat.chatId);
    check("DISMISS: the refused clear left the proposal STANDING", still !== null);
  }

  // ────────────────────────────────────────────────────────────────────────────
  console.log("\n── tolerance: a bad payload must not brick the chat ──");
  // ────────────────────────────────────────────────────────────────────────────

  {
    // Drop-don't-throw, the same rule parseWorkerTurns applies. A chat that cannot
    // be OPENED is strictly worse than one that lost a proposal it can re-run.
    await seedProposal(P.id, chat.chatId, { kind: "set", createdAt: "x" }); // no `set`
    const v = await rows(P.id, (tx) => getChat(tx, { tutorUserId: tut.id, chatId: chat.chatId }));
    check("TOLERANCE: a malformed payload still OPENS the chat", Array.isArray(v.messages));
    check("TOLERANCE: the malformed proposal is DROPPED, not half-rendered", v.proposedSet === undefined);

    await seedProposal(P.id, chat.chatId, { kind: "nonsense", createdAt: "x" });
    const v2 = await rows(P.id, (tx) => getChat(tx, { tutorUserId: tut.id, chatId: chat.chatId }));
    check("TOLERANCE: an unknown `kind` is dropped, chat still opens", Array.isArray(v2.messages) && v2.proposedSet === undefined);

    await seedProposal(P.id, chat.chatId, "not-an-object");
    const v3 = await rows(P.id, (tx) => getChat(tx, { tutorUserId: tut.id, chatId: chat.chatId }));
    check("TOLERANCE: a scalar payload is dropped, chat still opens", Array.isArray(v3.messages) && v3.proposedSet === undefined);
  }

  {
    // NEVER EXPIRES (founder, 2026-08-08). A proposal from long ago still restores —
    // it discloses its age instead of vanishing. This leg exists so a TTL cannot be
    // "tidied" in later without turning a probe red.
    const ancient = { ...setPayload, createdAt: "2020-01-01T00:00:00.000Z" };
    await seedProposal(P.id, chat.chatId, ancient);
    const v = await rows(P.id, (tx) => getChat(tx, { tutorUserId: tut.id, chatId: chat.chatId }));
    check("NEVER EXPIRES: a 6-year-old proposal still restores", !!v.proposedSet);
    check("NEVER EXPIRES: and it reports its true age for the card", v.proposedAt === "2020-01-01T00:00:00.000Z");
  }

  // ────────────────────────────────────────────────────────────────────────────
  console.log("\n── the PRODUCERS persist (real vendor) ──");
  // ────────────────────────────────────────────────────────────────────────────

  if (NO_VENDOR) {
    skip("proposeTarget persists its proposal");
    skip("proposeTargetSet persists its blueprint");
  } else {
    await rows(P.id, (tx) => clearPendingProposal(tx, { tutorUserId: tut.id, chatId: chat.chatId }));
    const t0 = Date.now();
    const made = await rows(P.id, (tx) => proposeTarget(tx, { tutorUserId: tut.id, chatId: chat.chatId }));
    soft("proposeTarget latency ms", Date.now() - t0);
    check("PRODUCER: proposeTarget returned a proposal", !!made.subTopicId);
    // Fresh tx again — proving the write LANDED, not that the return value exists.
    const v = await rows(P.id, (tx) => getChat(tx, { tutorUserId: tut.id, chatId: chat.chatId }));
    check("PRODUCER: proposeTarget's proposal is restorable on a fresh read", v.proposedTarget?.subTopicId === made.subTopicId);
    check("PRODUCER: it carries the count the tutor will approve", v.proposedTarget?.count === made.count);
    check("PRODUCER: proposedAt was stamped", typeof v.proposedAt === "string");

    // The SET producer runs on gemini_api, matching probe_authoring_set's own
    // real-vendor legs. NOT an arbitrary choice:
    //
    // ⚠️ PRE-EXISTING DEFECT, found by this probe and deliberately NOT worked
    // around: proposeTargetSet(intent:"cover") on claude_cli returned unparseable
    // JSON on BOTH attempts here (`finish=stop`, out=1097 then 931 — a COMPLETE
    // response that extractJsonObject could not close), so the call throws before
    // any persistence is reached. It is upstream of this slice — the throw is
    // inside runVendoredJson, and persistPendingProposal runs after it — and prod's
    // own claude coverage calls DO succeed (2026-08-07 16:42:20 and 17:34:16), so
    // it is fixture-sensitive rather than universally broken. Logged, not hidden:
    // pinning the set leg to the vendor that works keeps THIS slice's gate honest
    // without silently absorbing someone else's bug.
    const gchat = await rows(P.id, (tx) =>
      startChat(tx, {
        boardId: P.id,
        tutorUserId: tut.id,
        studentId: stu.id,
        vendor: "gemini_api",
        chapterIds: [fx.chapterId],
      }),
    );
    const t1 = Date.now();
    const madeSet = await rows(P.id, (tx) =>
      proposeTargetSet(tx, { tutorUserId: tut.id, chatId: gchat.chatId, intent: "cover" }),
    );
    soft("proposeTargetSet latency ms", Date.now() - t1);
    soft("proposeTargetSet picks", madeSet.picks.map((p) => `${p.subTopicName}×${p.count}`));
    check("PRODUCER: proposeTargetSet returned a blueprint", madeSet.picks.length > 0);
    const v2 = await rows(P.id, (tx) => getChat(tx, { tutorUserId: tut.id, chatId: gchat.chatId }));
    check("PRODUCER: the blueprint is restorable on a fresh read", (v2.proposedSet?.picks.length ?? 0) === madeSet.picks.length);
    check(
      "PRODUCER: the restored blueprint keeps its ITEMS (the 50s of AI, not a stub)",
      (v2.proposedSet?.picks[0]?.items.length ?? 0) === (madeSet.picks[0]?.items.length ?? -1),
    );
    // Two chats, one student: the proposal is stored PER CHAT, so the claude chat's
    // target proposal must be untouched by the gemini chat's set proposal. A column
    // keyed to the student rather than the chat would fail exactly here.
    const vClaude = await rows(P.id, (tx) => getChat(tx, { tutorUserId: tut.id, chatId: chat.chatId }));
    check("PRODUCER: the proposal is per-CHAT — the other chat's target is untouched", !!vClaude.proposedTarget);
    check("PRODUCER: and that other chat has no set proposal of its own", vClaude.proposedSet === undefined);
  }

  // ── cleanup (FK-safe) ──
  await withBoard(P.id, async (tx: Tx) => {
    await tx.delete(authoringWorker).where(eq(authoringWorker.boardId, P.id));
    await tx.delete(authoringChat).where(eq(authoringChat.boardId, P.id));
    await tx.delete(eventLog).where(eq(eventLog.boardId, P.id));
    await tx.delete(observation).where(eq(observation.boardId, P.id));
    await tx.delete(masteryState).where(eq(masteryState.boardId, P.id));
    await tx.delete(question).where(eq(question.boardId, P.id));
    await tx.delete(student).where(eq(student.boardId, P.id));
    await tx.delete(learningObjective).where(eq(learningObjective.boardId, P.id));
    await tx.delete(subTopic).where(eq(subTopic.boardId, P.id));
    await tx.delete(topic).where(eq(topic.boardId, P.id));
    await tx.delete(chapter).where(eq(chapter.boardId, P.id));
    await tx.delete(subject).where(eq(subject.boardId, P.id));
  });
  for (const u of [tut, tut2, stu]) await db.delete(appUser).where(eq(appUser.id, u.id));
  await db.delete(board).where(eq(board.id, P.id));

  console.log(`\nprobe_proposal_persist: ${passed} passed, ${failed} failed`);
  await queryClient.end();
  process.exit(failed === 0 ? 0 : 1);
}

main().catch(async (err) => {
  console.error("probe_proposal_persist FAILED:", err);
  await queryClient.end();
  process.exit(1);
});
