/**
 * probe_qauth_scope — Slice QAUTH-B exit gate (items 9 + 11).
 *
 * TWO changes, and they pull in opposite directions, which is the whole reason
 * this gate exists:
 *
 *   ITEM 9  the CHAT stops carrying every chapter's verbatim topics.md (15k–35k
 *           tokens EACH on the live cbse board, re-sent every turn because Gemini
 *           never resumes) and carries the in-scope sub-topics' LOs + what the
 *           SCHEDULER says is due instead.
 *   ITEM 11 the launcher pre-ticks the due + interleave-eligible sub-topics, and
 *           the tutor's picked set NARROWS what the chat is grounded on.
 *
 * 🔑 THE LOAD-BEARING LEG IS THE ONE THAT ASSERTS WHAT DID *NOT* CHANGE.
 * D-QAUTH-5 is "trim the chat, NEVER the worker" — craft §8 says authoring off a
 * slice of topics.md is precisely what breaks. A trim that leaked into
 * `buildScopedWorld` would look like a win here (smaller prompts everywhere!)
 * and would quietly wreck question quality with no probe to say so. So the same
 * fixture is read through BOTH paths in one run and the marker must be ABSENT
 * from one and PRESENT in the other.
 *
 * Every absence leg is paired with a control that the marker is findable at all
 * (M104) — a typo'd marker makes "it's gone" pass for free.
 */
import { and, eq } from "drizzle-orm";
import type { PgTransaction } from "drizzle-orm/pg-core";
import {
  appUser,
  attempt,
  authoringChat,
  board,
  chapter,
  learningObjective,
  masteryState,
  observation,
  practiceSession,
  question,
  schedulingState,
  student,
  subject,
  subTopic,
  topic,
} from "@b2c/kernel/schema";
import { db, queryClient } from "../src/db/client";
import { withBoard } from "../src/db/with-board";
import { assembleGrounding, getChat, startChat } from "../src/services/authoring_chat";
import { buildScopedWorld } from "../src/services/authoring_worker";

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

// Distinctive markers — nothing else in the prompt can produce these strings, so
// a hit is the fixture's row and never incidental prose.
const M = {
  topicsMdOwn: "ZZTOPICSMDOWNZZ the whole prose map for Motion, worked value 42.",
  topicsMdSib: "ZZTOPICSMDSIBZZ the whole prose map for Thermo.",
  loDue: "ZZLODUEZZ explains why acceleration is not velocity.",
  loQuiet: "ZZLOQUIETZZ explains what a reference frame is.",
  loLow: "ZZLOLOWZZ explains how friction opposes motion.",
};

const DAY = 24 * 60 * 60 * 1000;

async function main() {
  const tag = `${Date.now()}`;

  const [P] = await db
    .insert(board)
    .values({ slug: `qscope-p-${tag}`, name: "Probe P" })
    .returning();
  if (!P) throw new Error("board seed failed");
  const [tut] = await db
    .insert(appUser)
    .values({ email: `qscope-tut-${tag}@example.com`, name: "Tutor", userType: "tutor" })
    .returning();
  const [mine] = await db
    .insert(appUser)
    .values({ email: `qscope-mine-${tag}@example.com`, name: "Mine", userType: "student" })
    .returning();
  if (!tut || !mine) throw new Error("app_user seed failed");

  const fx = await withBoard(P.id, async (tx: Tx) => {
    const [subj] = await tx
      .insert(subject)
      .values({ boardId: P.id, slug: "phys", name: "Physics", grade: "IGCSE" })
      .returning();
    if (!subj) throw new Error("subject seed failed");

    // TWO chapters, BOTH carrying a topics.md — a single chapter cannot show that
    // the removal is per-chapter rather than "this one chapter had none".
    const [chOwn] = await tx
      .insert(chapter)
      .values({
        boardId: P.id,
        subjectId: subj.id,
        slug: "motion",
        name: "Motion",
        ordinal: 1,
        metadata: { topicsMd: M.topicsMdOwn },
      })
      .returning();
    const [chSib] = await tx
      .insert(chapter)
      .values({
        boardId: P.id,
        subjectId: subj.id,
        slug: "thermo",
        name: "Thermo",
        ordinal: 2,
        metadata: { topicsMd: M.topicsMdSib },
      })
      .returning();
    if (!chOwn || !chSib) throw new Error("chapter seed failed");

    const [tpOwn] = await tx
      .insert(topic)
      .values({ boardId: P.id, chapterId: chOwn.id, slug: "kin", name: "Kinematics", ordinal: 1 })
      .returning();
    const [tpSib] = await tx
      .insert(topic)
      .values({ boardId: P.id, chapterId: chSib.id, slug: "heat", name: "Heat", ordinal: 1 })
      .returning();
    if (!tpOwn || !tpSib) throw new Error("topic seed failed");

    const mkSub = async (tpId: string, slug: string, name: string, ordinal: number) => {
      const [row] = await tx
        .insert(subTopic)
        .values({ boardId: P.id, topicId: tpId, slug, name, ordinal })
        .returning();
      if (!row) throw new Error(`sub_topic seed failed: ${slug}`);
      return row;
    };
    // THREE sub-topics in the SAME chapter, built to be three DIFFERENT scheduler
    // answers. A fixture where every sub-topic is due cannot tell "the due block
    // works" from "the due block prints everything" (S197 §4's lesson).
    const stDue = await mkSub(tpOwn.id, "accel", "Acceleration", 1); // due + mixable
    const stLow = await mkSub(tpOwn.id, "friction", "Friction", 2); // due, NOT mixable
    const stQuiet = await mkSub(tpOwn.id, "frames", "Reference frames", 3); // not due
    const stSib = await mkSub(tpSib.id, "conduction", "Conduction", 1); // other chapter

    await tx.insert(learningObjective).values([
      { boardId: P.id, subTopicId: stDue.id, axis: "conceptual", code: "C1", description: M.loDue },
      { boardId: P.id, subTopicId: stLow.id, axis: "conceptual", code: "C1", description: M.loLow },
      {
        boardId: P.id,
        subTopicId: stQuiet.id,
        axis: "conceptual",
        code: "C1",
        description: M.loQuiet,
      },
    ]);

    await tx.insert(student).values({ userId: mine.id, boardId: P.id, class: "9", tutorId: tut.id });

    // ── The scheduler's three answers, built deliberately ──
    // Retention ladder: procedural L3 → 7 days. Anchor = last observation.
    const longAgo = new Date(Date.now() - 30 * DAY);
    const justNow = new Date();

    // stDue — both axes ≥3 (mixable) and last practised 30d ago → overdue.
    await tx.insert(masteryState).values({
      boardId: P.id,
      studentId: mine.id,
      subTopicId: stDue.id,
      conceptualLevel: 4,
      proceduralLevel: 3,
      description: "solid",
      log: "seeded",
    });
    // stLow — conceptual 2 → BELOW the interleave gate, but still due.
    await tx.insert(masteryState).values({
      boardId: P.id,
      studentId: mine.id,
      subTopicId: stLow.id,
      conceptualLevel: 2,
      proceduralLevel: 3,
      description: "shaky",
      log: "seeded",
    });
    // stQuiet — practised TODAY, so its retention date has not arrived.
    await tx.insert(masteryState).values({
      boardId: P.id,
      studentId: mine.id,
      subTopicId: stQuiet.id,
      conceptualLevel: 4,
      proceduralLevel: 4,
      description: "fresh",
      log: "seeded",
    });

    for (const [st, at] of [
      [stDue, longAgo],
      [stLow, longAgo],
      [stQuiet, justNow],
    ] as const) {
      await tx.insert(observation).values({
        boardId: P.id,
        studentId: mine.id,
        subTopicId: st.id,
        axis: "procedural",
        observationLevel: 3,
        reasoning: "seeded",
        signals: {},
        // The grounding filters on this EXACT string (STAGE1_SOURCE). Seeded as
        // "stage1" first and the observations block silently rendered "(none)" —
        // a fixture that misses the filter tests the empty branch by accident.
        source: "stage1_scorer",
        createdAt: at,
      });
      await tx.insert(schedulingState).values({
        boardId: P.id,
        studentId: mine.id,
        subTopicId: st.id,
        taughtAt: at,
      });
    }

    return {
      subjId: subj.id,
      chOwnId: chOwn.id,
      chSibId: chSib.id,
      stDueId: stDue.id,
      stLowId: stLow.id,
      stQuietId: stQuiet.id,
      stSibId: stSib.id,
    };
  });

  // ══════════ ITEM 9 — the chat's grounding, unnarrowed (whole chapters) ══════════

  const gWide = await withBoard(P.id, (tx: Tx) =>
    assembleGrounding(tx, {
      tutorUserId: tut.id,
      studentId: mine.id,
      chapterIds: [fx.chOwnId, fx.chSibId],
    }),
  );

  // THE CONTROL for every absence leg below: the marker really is in the DB and
  // really is findable, so "it's gone from the chat" cannot pass on a typo.
  const chapterRows = await withBoard(P.id, (tx: Tx) =>
    tx.select({ metadata: chapter.metadata }).from(chapter).where(eq(chapter.id, fx.chOwnId)),
  );
  check(
    "control: the chapter really carries the topics.md marker (so absence below means something)",
    JSON.stringify(chapterRows[0]?.metadata ?? {}).includes(M.topicsMdOwn),
  );

  check(
    "item 9: the chat no longer carries chapter 1's verbatim topics.md",
    !gWide.includes(M.topicsMdOwn),
  );
  check(
    "item 9: nor chapter 2's — the removal is per-chapter, not one lucky chapter",
    !gWide.includes(M.topicsMdSib),
  );
  check(
    "item 9: the CHAPTER BREAKDOWN section header is gone entirely",
    !gWide.includes("CHAPTER BREAKDOWN"),
  );
  check(
    "item 9: the LOs of the in-scope sub-topics replaced it",
    gWide.includes("LEARNING OBJECTIVES") &&
      gWide.includes(M.loDue) &&
      gWide.includes(M.loQuiet),
  );
  check(
    "item 9: the LO block says the full breakdown went to the WORKER (so the model does not try to write from LOs alone)",
    gWide.includes("topics.md") && gWide.includes("WORKER"),
  );

  // ── the scheduler block ──
  check("item 9: a DUE NOW section exists", gWide.includes("DUE NOW"));
  check(
    "item 9: the overdue sub-topic is listed and marked safe to mix",
    /Acceleration:.*overdue.*safe to mix/.test(gWide),
  );
  check(
    "item 9: the below-gate sub-topic is listed but marked NOT safe to mix",
    /Friction:.*NOT safe to mix/.test(gWide),
  );
  check(
    "item 9: a sub-topic practised today is NOT in DUE NOW (the block is not just 'print everything')",
    !new RegExp(`Reference frames:.*(overdue|due today)`).test(gWide),
  );
  check(
    "control: that same quiet sub-topic IS present elsewhere in the grounding (coverage + LOs)",
    gWide.includes("Reference frames") && gWide.includes(M.loQuiet),
  );

  // ── the budget, which is item 9's entire point ──
  const mdBytes = M.topicsMdOwn.length + M.topicsMdSib.length;
  soft("grounding bytes (unnarrowed)", gWide.length);
  soft("topics.md bytes this fixture would have added", mdBytes);
  check(
    "item 9: the grounding does not grow by the topics.md it replaced",
    !gWide.includes(M.topicsMdOwn) && !gWide.includes(M.topicsMdSib),
  );

  // ══════════ D-QAUTH-5 — THE WORKER IS *NOT* TRIMMED ══════════
  //
  // Same fixture, same chapter, the other path. This is the leg that catches a
  // future "let's reuse the chat's compact block in the worker too".
  const chatForWorker = await withBoard(P.id, (tx: Tx) =>
    startChat(tx, {
      boardId: P.id,
      tutorUserId: tut.id,
      studentId: mine.id,
      vendor: "gemini_api",
      mode: "blocked",
      chapterId: fx.chOwnId,
    }),
  );
  const world = await withBoard(P.id, (tx: Tx) =>
    buildScopedWorld(tx, {
      chatId: chatForWorker.chatId,
      subTopicId: fx.stDueId,
      brief: "one question",
    }),
  );
  const workerPrompt = (world as { basePrompt?: string }).basePrompt ?? "";
  check(
    "🔑 D-QAUTH-5: the WORKER still receives its chapter's topics.md IN FULL",
    workerPrompt.includes(M.topicsMdOwn),
  );
  check(
    "🔑 D-QAUTH-5: and the chat did NOT — one fixture, both paths, opposite answers",
    workerPrompt.includes(M.topicsMdOwn) && !gWide.includes(M.topicsMdOwn),
  );
  check(
    "D-QAUTH-5: the worker gets its OWN chapter's map, not the sibling's",
    !workerPrompt.includes(M.topicsMdSib),
  );

  // ══════════ ITEM 11 — the picked scope narrows the chat ══════════

  const gNarrow = await withBoard(P.id, (tx: Tx) =>
    assembleGrounding(tx, {
      tutorUserId: tut.id,
      studentId: mine.id,
      chapterIds: [fx.chOwnId, fx.chSibId],
      subTopicIds: [fx.stDueId],
    }),
  );
  if (process.env.QSCOPE_DUMP) {
    await Bun.write(`${process.env.QSCOPE_DUMP}/wide.txt`, gWide);
    await Bun.write(`${process.env.QSCOPE_DUMP}/narrow.txt`, gNarrow);
  }
  check(
    "item 11: the picked sub-topic survives the narrowing",
    gNarrow.includes("Acceleration") && gNarrow.includes(M.loDue),
  );
  // 🔑 The narrowing applies to the CURRICULUM MAP (what there is to author),
  // NOT to the student picture (who you are authoring for). Mastery stays
  // student-wide on purpose — a tutor conversation narrowed to one sub-topic
  // still benefits from the whole picture, and item 9's "mastery on those
  // sub-topics" is satisfied by a superset. Asserted section-by-section rather
  // than over the whole string, because a bare `!includes(name)` conflates the
  // two and fails for the RIGHT behaviour (it did, first run).
  const section = (text: string, header: string) => {
    const i = text.indexOf(header);
    if (i < 0) return "";
    const rest = text.slice(i + header.length);
    const j = rest.search(/\n(?=[A-Z][A-Z ]{6,}|=====)/);
    return j < 0 ? rest : rest.slice(0, j);
  };
  const mapNarrow =
    section(gNarrow, "CHAPTER COVERAGE") + section(gNarrow, "LEARNING OBJECTIVES");
  check(
    "item 11: an UNPICKED sub-topic is dropped from the CURRICULUM MAP (coverage + LOs)",
    !mapNarrow.includes("Reference frames") && !mapNarrow.includes(M.loQuiet),
  );
  check(
    "item 11: …while the STUDENT picture stays whole — mastery is not narrowed",
    section(gNarrow, "CERTIFIED TWO-AXIS MASTERY").includes("Reference frames"),
  );
  check(
    "self-test: the section slicer really isolates (the picked sub-topic IS in the map section)",
    mapNarrow.includes("Acceleration"),
  );
  check(
    "item 11: the narrowing is announced, so the model knows it is not seeing the whole chapter",
    gNarrow.includes("NARROWED TO THE SUB-TOPICS THE TUTOR PICKED"),
  );
  check(
    "item 11: DUE NOW is narrowed too — the below-gate sub-topic is not in scope here",
    !section(gNarrow, "DUE NOW").includes("Friction"),
  );
  check(
    "control: DUE NOW DOES carry that sub-topic when the scope is not narrowed",
    section(gWide, "DUE NOW").includes("Friction"),
  );
  check(
    "item 11 self-test: narrowing genuinely removes content (narrow < wide)",
    gNarrow.length < gWide.length,
  );
  check(
    "item 11: an EMPTY picked set falls back to the whole chapters (legacy + blocked chats)",
    gWide.includes("Reference frames") && gWide.includes("Acceleration"),
  );

  // ── persistence + the out-of-scope drop ──
  const chatPicked = await withBoard(P.id, (tx: Tx) =>
    startChat(tx, {
      boardId: P.id,
      tutorUserId: tut.id,
      studentId: mine.id,
      vendor: "gemini_api",
      mode: "interleaved",
      chapterIds: [fx.chOwnId],
      // stSibId belongs to the OTHER chapter → must be dropped, not stored.
      subTopicIds: [fx.stDueId, fx.stLowId, fx.stSibId],
    }),
  );
  check(
    "item 11: startChat stores the in-chapter picks",
    chatPicked.subTopicIds.includes(fx.stDueId) && chatPicked.subTopicIds.includes(fx.stLowId),
  );
  check(
    "item 11: startChat DROPS a sub-topic outside the chosen chapters",
    !chatPicked.subTopicIds.includes(fx.stSibId) && chatPicked.subTopicIds.length === 2,
  );
  const reread = await withBoard(P.id, (tx: Tx) =>
    getChat(tx, { tutorUserId: tut.id, chatId: chatPicked.chatId }),
  );
  check(
    "item 11: the scope SURVIVES a re-read (it is a column, not request state)",
    reread.subTopicIds.length === 2 && reread.subTopicIds.includes(fx.stDueId),
  );
  check(
    "item 11: a chat started WITHOUT the picker reads as an empty scope, never null",
    Array.isArray(chatForWorker.subTopicIds) && chatForWorker.subTopicIds.length === 0,
  );

  // ── cleanup ──
  await withBoard(P.id, async (tx: Tx) => {
    await tx.delete(observation).where(eq(observation.boardId, P.id));
    await tx.delete(attempt).where(eq(attempt.boardId, P.id));
    await tx.delete(practiceSession).where(eq(practiceSession.boardId, P.id));
    await tx.delete(authoringChat).where(eq(authoringChat.boardId, P.id));
    await tx.delete(schedulingState).where(eq(schedulingState.boardId, P.id));
    await tx.delete(masteryState).where(eq(masteryState.boardId, P.id));
    await tx.delete(question).where(eq(question.boardId, P.id));
    await tx.delete(student).where(eq(student.boardId, P.id));
    await tx.delete(learningObjective).where(eq(learningObjective.boardId, P.id));
    await tx.delete(subTopic).where(eq(subTopic.boardId, P.id));
    await tx.delete(topic).where(eq(topic.boardId, P.id));
    await tx.delete(chapter).where(eq(chapter.boardId, P.id));
    await tx.delete(subject).where(eq(subject.boardId, P.id));
  });
  for (const u of [tut, mine]) await db.delete(appUser).where(eq(appUser.id, u.id));
  await db.delete(board).where(eq(board.id, P.id));

  console.log(`\n${passed} / ${passed + failed} passed`);
  await queryClient.end();
  if (failed > 0) process.exit(1);
}

main().catch(async (e) => {
  console.error(e);
  await queryClient.end();
  process.exit(1);
});
