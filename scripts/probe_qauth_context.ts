/**
 * probe_qauth_context — Slice QAUTH-A exit gate (the question-authoring
 * enhancement pass, items 1+10 / 3 / 4 / 5 / 6 / 8 / 12 + D-QAUTH-4 + D-QAUTH-8).
 *
 * The slice's deliverable is A PROMPT — what the worker and the set planner can
 * SEE. That makes every rule in it observable only through a model's answer
 * unless the gate goes at it directly, and an assertion over a value you do not
 * control passes vacuously the moment that value is unremarkable (M101). So:
 *
 *   TIER 1 — PURE. Every rule this slice adds, asserted as a function, no DB and
 *     no vendor. The kind allowlist, the three served states, the own-chapter
 *     mark, the palette index. Each one self-tested so the checker can say NO.
 *   TIER 2 — REAL DB through the real `buildScopedWorld`, on a throwaway board
 *     (M22) with full cleanup. NO vendor: the prompt is built and read directly.
 *
 * 🔑 THE FIXTURE BUILDS THE UNHEALTHY SHAPE ON PURPOSE (S197 §4's lesson, M97).
 * A bank seeded only with this student's answered canonical questions cannot find
 * a bug about another student's question, an unapproved draft, or an approved
 * question nobody has ever been served. Those four states are what item 3 and
 * D-QAUTH-4 exist for, so all four are in the fixture from the start — and each
 * exclusion carries a one-variable control (the same question DOES reach the
 * other student's prompt), so a leg cannot go green off a typo'd marker (M104).
 */
import { and, eq } from "drizzle-orm";
import type { PgTransaction } from "drizzle-orm/pg-core";
import {
  appUser,
  attempt,
  authoringChat,
  board,
  chapter,
  horizontalSkillState,
  learningObjective,
  masteryState,
  observation,
  practiceSession,
  question,
  student,
  studentAuthoringPreference,
  studentChapterInsight,
  studentSubjectInsight,
  subject,
  subTopic,
  topic,
} from "@b2c/kernel/schema";
import { db, queryClient } from "../src/db/client";
import { withBoard } from "../src/db/with-board";
import { geminiQuestionSchema, geminiSingleQuestionSchema } from "../src/services/authoring";
import { buildScopedWorld, loadMethodPack } from "../src/services/authoring_worker";
import {
  KIND_UNPINNED,
  normalizePlannedKind,
  OWN_CHAPTER_MARK,
  PALETTE_INDEX,
  PALETTE_KINDS,
  renderBankWithHistory,
  renderInsightBlocks,
  renderServedState,
  renderServedSummary,
} from "../src/services/authoring_grounding";
import { clampProposedItems } from "../src/services/authoring_chat";

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

// Distinctive markers. Every one is a string nothing else in the prompt, the
// pack or the schema can produce, so a hit is the fixture's row and not prose.
const M = {
  topicsMd: "ZZTOPICSMDZZ the chapter's own worked example, value 42.",
  loConceptual: "ZZLOCONCEPTZZ explains why acceleration is not velocity.",
  stemAnswered: "ZZSTEMANSWEREDZZ canonical, and this student answered it.",
  stemUnserved: "ZZSTEMUNSERVEDZZ canonical, approved, never served to anyone.",
  stemSkipped: "ZZSTEMSKIPPEDZZ private to MINE, and MINE skipped it.",
  stemOther: "ZZSTEMOTHERZZ private to the OTHER student.",
  stemDraft: "ZZSTEMDRAFTZZ authored but never approved.",
  answerKey: "ZZANSWERKEYZZ the secret reference answer.",
  mastery: "ZZMASTERYZZ reads graphs well, confuses slope with value.",
  chapterInsight: "ZZCHAPINSIGHTZZ needs the diagram before the algebra.",
  subjectInsight: "ZZSUBJINSIGHTZZ strong recall, weak transfer across contexts.",
  horizontalProse: "ZZHORIZONTALZZ has never been given a modelling task.",
  prefOwn: "ZZPREFOWNZZ keep the stems short for this child.",
  prefSibling: "ZZPREFSIBZZ written about a DIFFERENT chapter entirely.",
  stage1: "ZZSTAGE1ZZ used the formula but could not say why it holds.",
  stage1Stale: "ZZSTAGE1STALEZZ an EARLIER conceptual read of the same answer.",
  stage1Proc: "ZZSTAGE1PROCZZ executed cleanly, no hesitation.",
  never: "ZZNEVERZZ this string is seeded nowhere at all.",
};

async function main() {
  const tag = `${Date.now()}`;

  // ════════════════ TIER 1 — PURE RULES (no DB, no AI) ════════════════

  // ── D-QAUTH-8: the kind allowlist ──
  // Asserted as PAIRS wherever the change makes two cases diverge, so widening
  // one cannot silently widen the other (M101's corollary).
  check(
    "kind: a canonical name passes through unchanged",
    normalizePlannedKind("Contrasting Cases") === "Contrasting Cases",
  );
  check(
    "kind: case + punctuation folded ('error analysis' → 'Error Analysis')",
    normalizePlannedKind("error analysis") === "Error Analysis",
  );
  check(
    "kind: the Tn handle resolves ('T10' → 'Justification')",
    normalizePlannedKind("T10") === "Justification",
  );
  check(
    "kind: T1 does NOT swallow T10/T12 (exact alias, never a prefix)",
    normalizePlannedKind("T1") === "Error Analysis" &&
      normalizePlannedKind("T12") === "Particulate / Micro→Macro Reasoning",
  );
  check(
    "kind: named inside prose still resolves",
    normalizePlannedKind("use Multi-Representational Translation here") ===
      "Multi-Representational Translation",
  );
  // 🔴 THE DEFECT D-QAUTH-8 EXISTS FOR. POE is 🔒 LOCKED for want of multi-part
  // support; before this slice the planner could name it, the tutor could approve
  // it, and the worker — which HOLDS the palette saying it is locked — was pinned
  // to "write exactly this one".
  check(
    "kind: POE (LOCKED) is NEUTRALISED, not passed through",
    normalizePlannedKind("POE") === KIND_UNPINNED &&
      normalizePlannedKind("Predict–Observe–Explain") === KIND_UNPINNED &&
      normalizePlannedKind("T3") === KIND_UNPINNED,
  );
  check(
    "kind: an invented kind is NEUTRALISED",
    normalizePlannedKind("Socratic Dialogue") === KIND_UNPINNED,
  );
  check(
    "kind: empty / absent is NEUTRALISED",
    normalizePlannedKind("") === KIND_UNPINNED &&
      normalizePlannedKind(null) === KIND_UNPINNED &&
      normalizePlannedKind(undefined) === KIND_UNPINNED,
  );
  // The self-test: if the matcher could not FAIL, every leg above is decoration.
  check(
    "self-test: the allowlist can say NO (a real kind and a fake one differ)",
    normalizePlannedKind("Justification") !== normalizePlannedKind("Justifiction"),
  );

  // ── D-QAUTH-8: the compressed palette index ──
  const authorable = PALETTE_KINDS.filter((k) => !k.locked);
  check(
    `index: lists every authorable kind (${authorable.length})`,
    authorable.every((k) => PALETTE_INDEX.includes(k.name)),
  );
  check(
    "index: does NOT offer the LOCKED kind as a choice, and says it is locked",
    !PALETTE_INDEX.includes(`  - Predict`) && PALETTE_INDEX.includes("LOCKED"),
  );
  check(
    "index: carries the sanctioned-MCQ rule (never as the closer)",
    PALETTE_INDEX.includes("Misconception Confrontation MCQ is the ONE sanctioned MCQ") &&
      PALETTE_INDEX.includes("NEVER as the closer"),
  );

  // ── D-QAUTH-8 at the PARSE BOUNDARY (clampProposedItems) ──
  const clamped = clampProposedItems(
    [
      { axis: "conceptual", kind: "POE", intent: "i1", difficulty: "d1" },
      { axis: "procedural", kind: "Justification", intent: "i2", difficulty: "d2" },
    ],
    "discriminate",
  );
  check(
    "parse boundary: a LOCKED kind is neutralised AND a valid one survives, in one pass",
    clamped.length === 2 &&
      clamped[0]?.kind === KIND_UNPINNED &&
      clamped[1]?.kind === "Justification",
  );
  check(
    "parse boundary: n still renumbers 1..N (SET-PLAN-GATE rule unbroken)",
    clamped[0]?.n === 1 && clamped[1]?.n === 2,
  );
  check(
    "parse boundary: `lo` is NOT invented for a fan-out item (the D-QAUTH-10 gap, left visible)",
    clamped.every((i) => i.lo === undefined),
  );

  // ── D-QAUTH-4: the three served states ──
  const sAns = renderServedState({ state: "answered", at: "2026-08-01", confidence: 3 });
  const sSkip = renderServedState({ state: "skipped", at: "2026-08-02" });
  const sUn = renderServedState({ state: "unserved" });
  check(
    "served: ANSWERED carries the date and the student's own confidence",
    sAns.includes("ANSWERED 2026-08-01") && sAns.includes("3/5"),
  );
  check(
    "served: SKIPPED and NOT YET SERVED are DISTINCT strings, not one boolean",
    sSkip.includes("SKIPPED") &&
      sUn.includes("NOT YET SERVED") &&
      sSkip !== sUn &&
      !sUn.includes("SKIPPED"),
  );
  check(
    "served: a null confidence prints no confidence clause",
    !renderServedState({ state: "answered", at: "2026-08-01", confidence: null }).includes(
      "confidence",
    ),
  );
  check(
    "served summary (the CHAT's compact copy) counts all three states",
    renderServedSummary({ answered: 2, skipped: 1, unserved: 3 }) ===
      "2 answered, 1 skipped, 3 not yet served",
  );
  check(
    "served summary: a zero state is omitted, not printed as '0 skipped'",
    renderServedSummary({ answered: 2, skipped: 0, unserved: 0 }) === "2 answered",
  );
  const bankRender = renderBankWithHistory([
    {
      stem: "S1",
      axis: "conceptual",
      difficulty: "hard",
      served: { state: "answered", at: "2026-08-01", confidence: 4 },
      stage1: [{ axis: "conceptual", level: 2, reasoning: "R1" }],
    },
    { stem: "S2", axis: "procedural", difficulty: null, served: { state: "unserved" }, stage1: [] },
  ]);
  check(
    "bank render: the Stage-1 read rides with the ANSWERED row only",
    bankRender.includes("Stage-1 read: conceptual L2 — R1") &&
      bankRender.split("S2")[1]?.includes("Stage-1 read") !== true,
  );
  check(
    "bank render: an empty bank says so rather than rendering nothing",
    renderBankWithHistory([]).includes("none authored yet"),
  );

  // ── item 8: the own-chapter mark ──
  const prefRows = [
    { subjectName: "Physics", chapterName: "Motion", preference: "P-MOTION" },
    { subjectName: "Physics", chapterName: "Thermo", preference: "P-THERMO" },
  ];
  const marked = renderInsightBlocks({
    chapters: [],
    subjects: [],
    horizontals: [],
    preferences: prefRows,
    multiSubject: false,
    ownChapterName: "Motion",
  }).join("\n");
  const unmarked = renderInsightBlocks({
    chapters: [],
    subjects: [],
    horizontals: [],
    preferences: prefRows,
    multiSubject: false,
  }).join("\n");
  const motionLine = marked.split("\n").find((l) => l.includes("P-MOTION")) ?? "";
  const thermoLine = marked.split("\n").find((l) => l.includes("P-THERMO")) ?? "";
  check(
    "item 8: the note for THIS chapter is marked, the sibling's is not",
    motionLine.includes(OWN_CHAPTER_MARK) &&
      thermoLine.length > 0 &&
      !thermoLine.includes(OWN_CHAPTER_MARK),
  );
  check(
    "item 8: the sibling note is KEPT, not dropped (D-CHAPTER-PREF preserved)",
    marked.includes("P-THERMO") && marked.includes("Thermo"),
  );
  check(
    "item 8: with no own-chapter (the CHAT's call) NOTHING is marked — back-compat",
    unmarked.includes("P-MOTION") && !unmarked.includes(OWN_CHAPTER_MARK),
  );
  // The pre-existing rule this renderer has always carried, kept as a regression:
  // a null horizontal level is a coverage GAP, never level 1.
  check(
    "regression: a null horizontal renders 'not yet observed', never L1",
    renderInsightBlocks({
      chapters: [],
      subjects: [],
      horizontals: [{ subjectName: "Physics", slug: "modelling", level: null, prose: "p" }],
      preferences: [],
      multiSubject: false,
    })
      .join("\n")
      .includes("not yet observed"),
  );

  // ── D-QAUTH-5 + items 4/5/6/12: the pack carries the new bar ──
  const pack = await loadMethodPack();
  const packHas = (s: string) => pack.includes(s);
  check("self-test: the pack matcher can say NO", !packHas(M.never));
  check(
    "pack §8 (D-QAUTH-5): boundary derivation is present, in craft's own words",
    packHas("DERIVE THE BOUNDARY EACH CONCEPTUAL QUESTION PRESSES") &&
      packHas("the look-alike belief that produces the same answers as real understanding"),
  );
  check(
    "pack §8: FORBIDS ever handing the worker a slice of topics.md",
    packHas("if you are ever handed a slice of `topics.md` instead, say so"),
  );
  check(
    "pack §9 (item 12 / D-QAUTH-7): all THREE of craft §7's bullets",
    packHas("Don't signpost the method, and don't signpost the chapter") &&
      packHas("build the contrast on purpose") &&
      packHas("State the discrimination intent"),
  );
  check(
    "pack §10 (item 4): the source material's numbers and examples are spent",
    packHas("ALREADY SPENT"),
  );
  check(
    "pack §11 (item 5): no part gives another away, and a figure adds no information",
    packHas("A later part must NEVER reveal the answer to an earlier part") &&
      packHas("A figure must carry NO MORE INFORMATION than the question text"),
  );
  check(
    "pack §12 (item 5): the simple-English block, verbatim including its test",
    packHas("The difficulty belongs to the subject. Never to the English.") &&
      packHas("Delete the hardest word in it"),
  );
  check(
    "pack (item 6): the ordered thinking protocol, binding the DRAFT call too",
    packHas("The order of work — do ALL of this BEFORE you write a single stem") &&
      packHas("zone of proximal development") &&
      packHas("steps 1–6 still happen first"),
  );
  // 🔴 THE RUNAWAY GUARD. Item 6's protocol tells the author to think the whole
  // scaffolded sequence through before writing; the Gemini draft path asks for
  // EXACTLY ONE question. Unqualified, that conflict drove a measured 62,348
  // output tokens on a one-question call — twice on the same prompt — truncating
  // at the ceiling into unparseable JSON. Bisected to the pack: identical code on
  // the pre-slice pack ran 350–1020 out.
  check(
    "pack: the protocol is subordinated to the turn's HOW MANY (the runaway fix)",
    packHas("STEPS 1–6 ARE REASONING") &&
      packHas("Return exactly what THIS turn asked for and nothing more") &&
      packHas("the `questions` array has **exactly one element**"),
  );
  // The STRUCTURAL half. A prose guarantee is what failed, so the bound is also
  // in the schema the API enforces — and asserted as a PAIR so bounding the
  // single-question path cannot silently bound the batch path too.
  check(
    "D-QAUTH-A: the single-question schema is BOUNDED to 1, and the batch schema is NOT",
    geminiSingleQuestionSchema.properties.questions.maxItems === "1" &&
      geminiSingleQuestionSchema.properties.questions.minItems === "1" &&
      !("maxItems" in geminiQuestionSchema.properties.questions),
  );
  check(
    "D-QAUTH-A: the bounded schema still carries the batch schema's item shape (derived, cannot drift)",
    geminiSingleQuestionSchema.properties.questions.items ===
      geminiQuestionSchema.properties.questions.items,
  );

  // ════════════════ TIER 2 — REAL DB, real buildScopedWorld ════════════════

  const [P] = await db.insert(board).values({ slug: `qauth-p-${tag}`, name: "Probe P" }).returning();
  if (!P) throw new Error("board seed failed");
  const [tut] = await db
    .insert(appUser)
    .values({ email: `qauth-tut-${tag}@example.com`, name: "Tutor", userType: "tutor" })
    .returning();
  const [mine] = await db
    .insert(appUser)
    .values({ email: `qauth-mine-${tag}@example.com`, name: "Mine", userType: "student" })
    .returning();
  const [other] = await db
    .insert(appUser)
    .values({ email: `qauth-other-${tag}@example.com`, name: "Other", userType: "student" })
    .returning();
  if (!tut || !mine || !other) throw new Error("app_user seed failed");

  const fx = await withBoard(P.id, async (tx: Tx) => {
    const [subj] = await tx
      .insert(subject)
      .values({ boardId: P.id, slug: "phys", name: "Physics", grade: "IGCSE" })
      .returning();
    if (!subj) throw new Error("subject seed failed");
    // TWO chapters in ONE subject — item 8 has nothing to prove with one.
    const [chapOwn] = await tx
      .insert(chapter)
      .values({
        boardId: P.id,
        subjectId: subj.id,
        slug: "motion",
        name: "Motion",
        ordinal: 1,
        metadata: { topicsMd: M.topicsMd },
      })
      .returning();
    const [chapSib] = await tx
      .insert(chapter)
      .values({ boardId: P.id, subjectId: subj.id, slug: "thermo", name: "Thermo", ordinal: 2 })
      .returning();
    if (!chapOwn || !chapSib) throw new Error("chapter seed failed");
    const [tp] = await tx
      .insert(topic)
      .values({ boardId: P.id, chapterId: chapOwn.id, slug: "speed", name: "Speed", ordinal: 1 })
      .returning();
    if (!tp) throw new Error("topic seed failed");
    const [st] = await tx
      .insert(subTopic)
      .values({ boardId: P.id, topicId: tp.id, slug: "accel", name: "Acceleration", ordinal: 1 })
      .returning();
    if (!st) throw new Error("sub_topic seed failed");
    await tx.insert(learningObjective).values({
      boardId: P.id,
      subTopicId: st.id,
      axis: "conceptual",
      code: "C1",
      description: M.loConceptual,
    });

    // ── THE UNHEALTHY BANK. Five questions, four distinct states. ──
    const q = async (v: {
      stem: string;
      ordinal: number;
      status?: string;
      target?: string | null;
    }) => {
      const [row] = await tx
        .insert(question)
        .values({
          boardId: P.id,
          subTopicId: st.id,
          axis: "conceptual",
          kind: "subjective",
          stem: v.stem,
          referenceAnswer: M.answerKey,
          ordinal: v.ordinal,
          source: "seed",
          status: v.status ?? "approved",
          targetStudentId: v.target ?? null,
        })
        .returning({ id: question.id });
      if (!row) throw new Error(`question seed failed: ${v.stem}`);
      return row.id;
    };
    const qAnswered = await q({ stem: M.stemAnswered, ordinal: 0 });
    const qUnserved = await q({ stem: M.stemUnserved, ordinal: 1 });
    const qSkipped = await q({ stem: M.stemSkipped, ordinal: 2, target: mine.id });
    const qOther = await q({ stem: M.stemOther, ordinal: 3, target: other.id });
    const qDraft = await q({ stem: M.stemDraft, ordinal: 4, status: "draft" });

    await tx.insert(student).values({ userId: mine.id, boardId: P.id, class: "9", tutorId: tut.id });
    await tx
      .insert(student)
      .values({ userId: other.id, boardId: P.id, class: "9", tutorId: tut.id });

    // MINE answered one and skipped one — the two halves of "spent" that the
    // serving predicate and the authoring predicate deliberately disagree about.
    const [sess] = await tx
      .insert(practiceSession)
      .values({
        boardId: P.id,
        appUserId: mine.id,
        subTopicId: st.id,
        questionIds: [qAnswered, qSkipped],
      })
      .returning({ id: practiceSession.id });
    if (!sess) throw new Error("practice_session seed failed");
    const [att] = await tx
      .insert(attempt)
      .values({
        boardId: P.id,
        practiceSessionId: sess.id,
        questionId: qAnswered,
        appUserId: mine.id,
        answerText: "an answer",
        confidence: 3,
      })
      .returning({ id: attempt.id });
    if (!att) throw new Error("attempt seed failed");
    await tx.insert(attempt).values({
      boardId: P.id,
      practiceSessionId: sess.id,
      questionId: qSkipped,
      appUserId: mine.id,
      skipReason: "not_now",
    });
    // THREE observations on ONE question — two of them the same axis. This is the
    // shape real data is in (found by reading a live prompt, not by a leg), and a
    // fixture with one clean observation per question cannot see it. The older
    // conceptual read must LOSE to the newer one; the procedural read must survive
    // alongside it.
    await tx.insert(observation).values({
      boardId: P.id,
      studentId: mine.id,
      subTopicId: st.id,
      questionId: qAnswered,
      attemptId: att.id,
      axis: "conceptual",
      observationLevel: 1,
      reasoning: M.stage1Stale,
      source: "stage1_scorer",
    });
    await tx.insert(observation).values({
      boardId: P.id,
      studentId: mine.id,
      subTopicId: st.id,
      questionId: qAnswered,
      attemptId: att.id,
      axis: "conceptual",
      observationLevel: 2,
      reasoning: M.stage1,
      source: "stage1_scorer",
    });
    await tx.insert(observation).values({
      boardId: P.id,
      studentId: mine.id,
      subTopicId: st.id,
      questionId: qAnswered,
      attemptId: att.id,
      axis: "procedural",
      observationLevel: 3,
      reasoning: M.stage1Proc,
      source: "stage1_scorer",
    });

    // ── the student picture ──
    await tx.insert(masteryState).values({
      boardId: P.id,
      studentId: mine.id,
      subTopicId: st.id,
      conceptualLevel: 2,
      proceduralLevel: 3,
      description: M.mastery,
      log: "seed",
    });
    await tx.insert(studentChapterInsight).values({
      boardId: P.id,
      studentId: mine.id,
      chapterId: chapOwn.id,
      insight: M.chapterInsight,
    });
    await tx.insert(studentSubjectInsight).values({
      boardId: P.id,
      studentId: mine.id,
      subjectId: subj.id,
      insight: M.subjectInsight,
    });
    await tx.insert(horizontalSkillState).values({
      boardId: P.id,
      studentId: mine.id,
      subjectId: subj.id,
      slug: "modelling",
      level: null,
      prose: M.horizontalProse,
    });
    // Item 8: one note on the chapter being authored, one on a sibling.
    await tx.insert(studentAuthoringPreference).values({
      boardId: P.id,
      studentId: mine.id,
      chapterId: chapOwn.id,
      preference: M.prefOwn,
    });
    await tx.insert(studentAuthoringPreference).values({
      boardId: P.id,
      studentId: mine.id,
      chapterId: chapSib.id,
      preference: M.prefSibling,
    });

    // Three chats: MINE blocked, MINE interleaved, OTHER blocked (the control).
    const chat = async (studentId: string, mode: string) => {
      const [row] = await tx
        .insert(authoringChat)
        .values({
          boardId: P.id,
          tutorId: tut.id,
          studentId,
          vendor: "gemini_api",
          chapterId: chapOwn.id,
          mode,
          messages: [],
        })
        .returning({ id: authoringChat.id });
      if (!row) throw new Error("authoring_chat seed failed");
      return row.id;
    };
    return {
      subTopicId: st.id,
      chatBlocked: await chat(mine.id, "blocked"),
      chatInterleaved: await chat(mine.id, "interleaved"),
      chatOther: await chat(other.id, "blocked"),
    };
  });

  // ── the real call, no vendor in the loop ──
  const world = await rows(P.id, (tx) =>
    buildScopedWorld(tx, {
      chatId: fx.chatBlocked,
      subTopicId: fx.subTopicId,
      brief: "Push the conceptual axis.",
    }),
  );
  const p = world.basePrompt;
  const has = (s: string) => p.includes(s);
  check("self-test: the prompt matcher can say NO", !has(M.never));
  soft("prompt size (chars)", p.length);

  // D-QAUTH-2 — the student was resolved from the CHAT, with no new argument.
  check("D-QAUTH-2: studentId resolved from chatId inside buildScopedWorld", world.studentId === mine.id);

  // ── item 3 — the bank is SCOPED. The headline of this slice. ──
  check("item 3: this student's canonical answered question IS shown", has(M.stemAnswered));
  check("item 3: this student's own private question IS shown", has(M.stemSkipped));
  check("item 3: 🔴 ANOTHER student's question is GONE", !has(M.stemOther));
  check("item 3: 🔴 an UNAPPROVED draft is GONE", !has(M.stemDraft));
  check("M11 boundary: no reference answer leaks into the prompt", !has(M.answerKey));

  // The draft has no cross-student control to lean on (nobody's prompt should
  // ever show it), so its exclusion is proved against the DB instead: the row
  // must EXIST for "it is gone from the prompt" to mean anything (M104 — a
  // negative control whose subject was never created passes by vacuum).
  const draftRows = await rows(P.id, (tx) =>
    tx
      .select({ id: question.id })
      .from(question)
      .where(and(eq(question.subTopicId, fx.subTopicId), eq(question.status, "draft"))),
  );
  check(
    "control: the draft row really EXISTS in the bank — so its absence above is the status filter, not a missing fixture",
    draftRows.length === 1,
  );
  // A count, not just presence: an over-broad read (5 rows) and an under-broad one
  // (1 row) both look identical to the includes() legs above.
  const bankLines = p.split("\n").filter((l) => /^ {2}\d+\. \[/.test(l));
  check(
    "item 3: the bank block holds EXACTLY the 3 questions this student can see",
    bankLines.length === 3,
  );
  soft("bank rows rendered", bankLines.length);

  // The one-variable control (M104): the same two rows, one student changed. A
  // green exclusion above could otherwise just mean the marker never existed.
  const worldOther = await rows(P.id, (tx) =>
    buildScopedWorld(tx, {
      chatId: fx.chatOther,
      subTopicId: fx.subTopicId,
      brief: "Push the conceptual axis.",
    }),
  );
  const po = worldOther.basePrompt;
  check(
    "control: the OTHER student's prompt DOES carry their own question — so the exclusion above is scoping, not a typo",
    po.includes(M.stemOther) && po.length > 0,
  );
  check(
    "control: and it does NOT carry MINE's private question (exclusion cuts both ways)",
    !po.includes(M.stemSkipped),
  );
  check(
    "control: the shared canonical question reaches BOTH",
    po.includes(M.stemAnswered) && has(M.stemAnswered),
  );

  // ── D-QAUTH-4 — the served history, the half item 3's own fix does not give ──
  check("D-QAUTH-4: the answered question is marked ANSWERED with its date", /ANSWERED \d{4}-\d{2}-\d{2}/.test(p));
  check("D-QAUTH-4: the answered question carries the student's confidence", has("3/5"));
  check("D-QAUTH-4: 🔴 the never-served question is marked NOT YET SERVED", has("NOT YET SERVED"));
  check("D-QAUTH-4: the skipped question is marked SKIPPED", has("SKIPPED"));
  check("D-QAUTH-4: the Stage-1 read rides with the answered row", has(M.stage1));
  // 🔴 The defect the real-data dump found. Both halves in ONE leg: dropping the
  // stale read must not also drop the OTHER axis (M101's pair rule).
  check(
    "D-QAUTH-4: ONE read per axis — the stale conceptual read is dropped, the procedural one survives",
    !has(M.stage1Stale) && has(M.stage1Proc) && has(M.stage1),
  );
  const readLines = p.split("\n").filter((l) => l.includes("Stage-1 read:"));
  check(
    "D-QAUTH-4: exactly 2 Stage-1 lines from 3 observation rows (no duplicate corroboration)",
    readLines.length === 2,
  );
  check(
    "control: all THREE observation rows really exist — so the drop above is the dedupe, not a missing insert",
    (
      await rows(P.id, (tx) =>
        tx
          .select({ id: observation.id })
          .from(observation)
          .where(eq(observation.studentId, mine.id)),
      )
    ).length === 3,
  );
  check(
    "D-QAUTH-4: the prompt says plainly that authored ≠ covered",
    has('"authored" and "covered" are not the same thing'),
  );

  // ── items 1+10 — the student's own picture ──
  check("item 10: two-axis mastery for THIS sub-topic", has(M.mastery) && has("conceptual L2") && has("procedural L3"));
  check("item 1: chapter insight", has(M.chapterInsight));
  check("item 1: subject insight", has(M.subjectInsight));
  check("item 1: horizontal skills, and a null level reads as a GAP not L1", has(M.horizontalProse) && has("not yet observed"));

  // ── item 8 — the per-chapter preference ──
  const ownPrefLine = p.split("\n").find((l) => l.includes(M.prefOwn)) ?? "";
  const sibPrefLine = p.split("\n").find((l) => l.includes(M.prefSibling)) ?? "";
  check("item 8: this chapter's tutor note reaches the worker, MARKED as this chapter", ownPrefLine.includes(OWN_CHAPTER_MARK));
  check("item 8: the sibling chapter's note is present and NOT marked", sibPrefLine.length > 0 && !sibPrefLine.includes(OWN_CHAPTER_MARK));

  // ── items 4 + D-QAUTH-5 — the source material ──
  check("D-QAUTH-5: the chapter's topics.md is carried IN FULL", has(M.topicsMd) && has("topics.md IN FULL"));
  check("item 4: and it is flagged as already spent", has("ALREADY SPENT"));
  check("grounding: the sub-topic's LO is carried", has(M.loConceptual));

  // ── item 12 — the mixed-delivery instruction, both triggers + the negative ──
  check("item 12: a BLOCKED chat gets NO mixed instruction (the negative control)", !has("THIS SET WILL BE SERVED MIXED"));
  const worldMixedByMode = await rows(P.id, (tx) =>
    buildScopedWorld(tx, { chatId: fx.chatInterleaved, subTopicId: fx.subTopicId, brief: "b" }),
  );
  check(
    "item 12: an INTERLEAVED chat gets it",
    worldMixedByMode.basePrompt.includes("THIS SET WILL BE SERVED MIXED"),
  );
  const worldMixedByArg = await rows(P.id, (tx) =>
    buildScopedWorld(tx, { chatId: fx.chatBlocked, subTopicId: fx.subTopicId, brief: "b", mixed: true }),
  );
  check(
    "item 12: a multi-sub_topic FAN-OUT gets it even on a blocked chat (post-Slice-MIXED)",
    worldMixedByArg.basePrompt.includes("THIS SET WILL BE SERVED MIXED"),
  );
  check(
    "item 12: and the instruction names the §9 rules, not just the fact",
    worldMixedByArg.basePrompt.includes("do not signpost the method") &&
      worldMixedByArg.basePrompt.includes("do not name the sub-topic or chapter in the stem"),
  );

  // ── cleanup (FK-safe: observation → attempt → session → chat → question → spine) ──
  await withBoard(P.id, async (tx: Tx) => {
    await tx.delete(observation).where(eq(observation.boardId, P.id));
    await tx.delete(attempt).where(eq(attempt.boardId, P.id));
    await tx.delete(practiceSession).where(eq(practiceSession.boardId, P.id));
    await tx.delete(authoringChat).where(eq(authoringChat.boardId, P.id));
    await tx.delete(masteryState).where(eq(masteryState.boardId, P.id));
    await tx.delete(studentChapterInsight).where(eq(studentChapterInsight.boardId, P.id));
    await tx.delete(studentSubjectInsight).where(eq(studentSubjectInsight.boardId, P.id));
    await tx.delete(horizontalSkillState).where(eq(horizontalSkillState.boardId, P.id));
    await tx
      .delete(studentAuthoringPreference)
      .where(eq(studentAuthoringPreference.boardId, P.id));
    await tx.delete(question).where(eq(question.boardId, P.id));
    await tx.delete(student).where(eq(student.boardId, P.id));
    await tx.delete(learningObjective).where(eq(learningObjective.boardId, P.id));
    await tx.delete(subTopic).where(eq(subTopic.boardId, P.id));
    await tx.delete(topic).where(eq(topic.boardId, P.id));
    await tx.delete(chapter).where(eq(chapter.boardId, P.id));
    await tx.delete(subject).where(eq(subject.boardId, P.id));
  });
  for (const u of [tut, mine, other]) await db.delete(appUser).where(eq(appUser.id, u.id));
  await db.delete(board).where(eq(board.id, P.id));

  console.log(`\nprobe_qauth_context: ${passed} passed, ${failed} failed`);
  await queryClient.end();
  process.exit(failed === 0 ? 0 : 1);
}

main().catch(async (err) => {
  console.error("probe_qauth_context FAILED:", err);
  await queryClient.end();
  process.exit(1);
});
