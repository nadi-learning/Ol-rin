/**
 * probe_authoring_chat — Slice AUTH-v2 Stage-1 exit gate (student-grounded
 * conversational authoring; the chat plumbing ported verbatim from Starkhorn).
 *
 * Real DB + real RLS + REAL vendors (claude_cli AND gemini_api), throwaway boards
 * P/Q (M22) with full cleanup. Two-tier (don't over-read a single AI response):
 *   FIRM — the plumbing we control: ownership guards, chat persistence (user +
 *     assistant turns, assistant carries vendorId + aiSessionId + fingerprint),
 *     multi-turn growth, the structured authoring call returns a valid draft set,
 *     PRIVATE save (target_student_id) + PRIVATE DELIVERY (the target student sees
 *     them, another student sees only canonical), cross-board RLS, HTTP 401 (soft).
 *   SOFT — the conversation's prose + the drafted question quality (logged).
 *
 * Exercises BOTH vendors: the full flow (chat → author → save → deliver) on
 * claude_cli, plus a chat-turn + author smoke on gemini_api.
 */
import { and, asc, eq, sql } from "drizzle-orm";
import type { PgTransaction } from "drizzle-orm/pg-core";
import {
  appUser,
  assessmentSession,
  authoringChat,
  authoringWorker,
  board,
  chapter,
  eventLog,
  horizontalSkillState,
  learningObjective,
  masteryState,
  observation,
  studentAuthoringPreference,
  studentChapterInsight,
  studentSubjectInsight,
  practiceSession,
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
  assembleGrounding,
  authorFromChat,
  AuthoringChatNotFoundError,
  getChat,
  parseAuthorMarker,
  proposeTarget,
  ProposeTargetError,
  renderInsightBlocks,
  reviseDraft,
  sendTurn,
  startChat,
  stripAuthorMarker,
  hasAuthorSentinel,
  stripAuthorSentinel,
  SubTopicNotFoundError,
} from "../src/services/authoring_chat";
import {
  getChapterPreferences,
  getSessionChapterPreferences,
  setChapterPreference,
  ChapterNotOnBoardError,
} from "../src/services/tutor";
import { approveDrafts } from "../src/services/authoring";
import { startSession } from "../src/services/practice";
import { StudentNotFoundError } from "../src/services/tutor";
import type { VendorChoice } from "@b2c/kernel/contracts";

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

// FIG-AUTH: drafts are now PERSISTED (PersistedDraft) — id + editable fields; the
// intent/rubric are folded into pedagogical_note at persist time.
const validDraft = (d: {
  id: string;
  axis: string;
  stem: string;
  referenceAnswer: string;
}) =>
  !!d.id &&
  ["conceptual", "procedural", "both"].includes(d.axis) &&
  d.stem.trim().length > 0 &&
  d.referenceAnswer.trim().length > 0;

async function main() {
  const tag = `${Date.now()}`;
  await db.execute(sql`select 1`);
  check("DB connectivity (select 1) as app role", true);

  const [P] = await db.insert(board).values({ slug: `achat-p-${tag}`, name: "Probe P" }).returning();
  const [Q] = await db.insert(board).values({ slug: `achat-q-${tag}`, name: "Probe Q" }).returning();
  if (!P || !Q) throw new Error("board seed failed");

  const [tut] = await db.insert(appUser).values({ email: `achat-tut-${tag}@example.com`, name: "Tutor", userType: "tutor" }).returning();
  const [tut2] = await db.insert(appUser).values({ email: `achat-tut2-${tag}@example.com`, name: "Other Tutor", userType: "tutor" }).returning();
  const [stuA] = await db.insert(appUser).values({ email: `achat-a-${tag}@example.com`, name: "Student A", userType: "student" }).returning();
  const [stuB] = await db.insert(appUser).values({ email: `achat-b-${tag}@example.com`, name: "Student B", userType: "student" }).returning();
  const [stuC] = await db.insert(appUser).values({ email: `achat-c-${tag}@example.com`, name: "Student C (unlinked)", userType: "student" }).returning();
  if (!tut || !tut2 || !stuA || !stuB || !stuC) throw new Error("app_user seed failed");

  // Fixture under P: spine + 2 LOs + tutor_student links (A,B linked; C NOT) +
  // ONE canonical question (target null) at ordinal 0 + a mastery_state &
  // observation for A (grounding has real content). A sub_topic on Q for RLS.
  const fx = await withBoard(P.id, async (tx: Tx) => {
    const [subj] = await tx.insert(subject).values({ boardId: P.id, slug: "phys", name: "Physics", grade: "IGCSE" }).returning();
    // Chapter under test (Motion) with TWO sub_topics → proposeTarget's allowlist
    // has real choice; plus a SECOND chapter (Forces) whose sub_topic is
    // out-of-scope for the chapter-guard test.
    const [chap] = await tx.insert(chapter).values({ boardId: P.id, subjectId: subj!.id, slug: "motion", name: "Motion", ordinal: 1 }).returning();
    const [tp] = await tx.insert(topic).values({ boardId: P.id, chapterId: chap!.id, slug: "speed", name: "Speed", ordinal: 1 }).returning();
    const [st] = await tx.insert(subTopic).values({ boardId: P.id, topicId: tp!.id, slug: "accel", name: "Acceleration", ordinal: 1 }).returning();
    const [st2] = await tx.insert(subTopic).values({ boardId: P.id, topicId: tp!.id, slug: "vtgraph", name: "Velocity-time graphs", ordinal: 2 }).returning();
    await tx.insert(learningObjective).values({ boardId: P.id, subTopicId: st!.id, axis: "conceptual", code: "C1", description: "Explains acceleration as the rate of change of velocity and reasons about what changes it." });
    await tx.insert(learningObjective).values({ boardId: P.id, subTopicId: st!.id, axis: "procedural", code: "P1", description: "Computes acceleration = Δv / Δt with correct units." });
    // out-of-chapter sub_topic (different chapter) for the chapter-scope guard.
    const [chap2] = await tx.insert(chapter).values({ boardId: P.id, subjectId: subj!.id, slug: "forces", name: "Forces", ordinal: 2 }).returning();
    const [tp2] = await tx.insert(topic).values({ boardId: P.id, chapterId: chap2!.id, slug: "newton", name: "Newton's Laws", ordinal: 1 }).returning();
    const [st3] = await tx.insert(subTopic).values({ boardId: P.id, topicId: tp2!.id, slug: "n2", name: "F = ma", ordinal: 1 }).returning();
    await tx.insert(student).values({ userId: stuA.id, boardId: P.id, class: "9", tutorId: tut.id });
    await tx.insert(student).values({ userId: stuB.id, boardId: P.id, class: "9", tutorId: tut.id });
    // canonical (shared) question — target null.
    await tx.insert(question).values({ boardId: P.id, subTopicId: st!.id, axis: "conceptual", kind: "subjective", stem: "Canonical Q", referenceAnswer: "ref", ordinal: 0, source: "seed" });
    await tx.insert(masteryState).values({ boardId: P.id, studentId: stuA.id, subTopicId: st!.id, conceptualLevel: 3, proceduralLevel: 2, description: "Solid on the idea of rate-of-change; shaky converting units under time pressure.", log: "internal" });
    await tx.insert(observation).values({ boardId: P.id, studentId: stuA.id, subTopicId: st!.id, axis: "procedural", observationLevel: 2, reasoning: "Set up Δv/Δt correctly but dropped the unit conversion s→ms.", source: "stage1_scorer", calibrationFlag: "over" });
    // Slice AUTHOR-PREF — a SECOND SUBJECT, so "this subject's note, not that
    // one's" is a claim that can actually fail. Subject + chapter only: no topic
    // and no sub_topic, so nothing that walks the spine (target allowlists,
    // chapter coverage) sees new material and the existing legs are untouched.
    const [subj2] = await tx.insert(subject).values({ boardId: P.id, slug: "chem", name: "Chemistry", grade: "IGCSE" }).returning();
    const [chap3] = await tx.insert(chapter).values({ boardId: P.id, subjectId: subj2!.id, slug: "acids", name: "Acids and Bases", ordinal: 1 }).returning();
    return {
      subjectId: subj!.id,
      subject2Id: subj2!.id,
      chapterId: chap!.id,
      chapter2Id: chap2!.id,
      // Chemistry's only chapter — the OTHER SUBJECT's note lives here, so
      // "a sibling chapter's note carries, another subject's does not" is one
      // claim about chapter_id and one about the subject filter, not a guess.
      chapter3Id: chap3!.id,
      subTopicId: st!.id,
      allowedSubTopicIds: [st!.id, st2!.id],
      outOfChapterSubTopicId: st3!.id,
    };
  });

  const fxQ = await withBoard(Q.id, async (tx: Tx) => {
    const [subj] = await tx.insert(subject).values({ boardId: Q.id, slug: "phys", name: "Physics", grade: "IGCSE" }).returning();
    const [chap] = await tx.insert(chapter).values({ boardId: Q.id, subjectId: subj!.id, slug: "motion", name: "Motion", ordinal: 1 }).returning();
    const [tp] = await tx.insert(topic).values({ boardId: Q.id, chapterId: chap!.id, slug: "speed", name: "Speed", ordinal: 1 }).returning();
    const [st] = await tx.insert(subTopic).values({ boardId: Q.id, topicId: tp!.id, slug: "accel", name: "Acceleration", ordinal: 1 }).returning();
    return { subTopicId: st!.id, subjectId: subj!.id, chapterId: chap!.id };
  });

  // ─────────── Slice ASSESS-SEE — item 12 ───────────
  // `assembleGrounding` builds the student picture the authoring AI writes the
  // student's NEXT questions from. It read `observation.observationLevel` raw —
  // the MACHINE's number — while Stage-2, synthesis, assignment and the assess
  // chat all count `tutorLevel ?? observationLevel`. So a tutor could overrule
  // the scorer, watch Stage-2 respect it, and have the surface generating the
  // next questions still ground on the level they explicitly rejected.
  //
  // Deterministic — this drives the grounding assembler directly, with NO AI in
  // the loop, so no model response can make it pass or fail (M101).
  const groundFx = await withBoard(P.id, async (tx: Tx) => {
    // A read the tutor OVERRULED: the scorer said 2, the tutor says 4.
    const [ov] = await tx.insert(observation).values({
      boardId: P.id, studentId: stuA.id, subTopicId: fx.subTopicId, axis: "conceptual",
      observationLevel: 2, tutorLevel: 4,
      reasoning: "GROUND_CORRECTED: dismissed as listing, but she does link the two ideas.",
      source: "stage1_scorer",
    }).returning();
    return { ovId: ov!.id };
  });
  const grounding = await withBoard(P.id, (tx) =>
    assembleGrounding(tx, { tutorUserId: tut.id, studentId: stuA.id, chapterIds: [fx.chapterId] }),
  );
  const corrLine = grounding.split("\n").find((l) => l.includes("GROUND_CORRECTED")) ?? "";
  const rawLine = grounding.split("\n").find((l) => l.includes("dropped the unit conversion")) ?? "";
  // #1 is the scenario the feature exists for (M97).
  check("ASSESS-SEE §12: authoring grounds on the TUTOR's level, not the machine's",
    corrLine.includes("L4") && corrLine.includes("(tutor-corrected)"));
  // The negative control — without it, relabelling every line "L4" would pass #1.
  check("ASSESS-SEE §12: the overruled machine level (L2) is NOT what authoring reads",
    corrLine !== "" && !corrLine.includes("L2"));
  // …and an UNCORRECTED read must still show its machine level, unmarked.
  check("ASSESS-SEE §12: an uncorrected observation still reads its machine level, no marker",
    rawLine.includes("L2") && !rawLine.includes("(tutor-corrected)"));
  await withBoard(P.id, (tx) => tx.delete(observation).where(eq(observation.id, groundFx.ovId)));

  // ─────────── Slice INSIGHT-GROUND — walkthrough item 11 ───────────
  // Everything the tutor records ABOVE sub-topic grain (chapter view, subject
  // view, subject-wide horizontal skills — all written by Stage-2b synthesis at
  // finalize) was read by nobody when authoring the student's next questions.
  //
  // ⚠️ These tables are EMPTY in every local dataset (0 chapter-insight rows, 0
  // subject-insight rows at build time) — so without this fixture the new read
  // would only ever exercise its no-rows branch and go green having proved
  // nothing (M52/M104). The fixture is the point of the leg, not setup for it.
  //
  // Part A — the RULE, pure, no DB and no AI in the loop (M101).
  const pureBlocks = renderInsightBlocks({
    chapters: [{ chapterName: "Motion", insight: "PURE_CHAPTER_TEXT" }],
    subjects: [{ subjectName: "Physics", insight: "PURE_SUBJECT_TEXT" }],
    horizontals: [
      { subjectName: "Physics", slug: "unit_discipline", level: 3, prose: "PURE_L3_PROSE" },
      { subjectName: "Physics", slug: "causal_reasoning", level: null, prose: "PURE_NULL_PROSE" },
    ],
    preferences: [],
    multiSubject: false,
  });
  const pureText = pureBlocks.join("\n");
  const nullLine = pureText.split("\n").find((l) => l.includes("causal_reasoning")) ?? "";
  const l3Line = pureText.split("\n").find((l) => l.includes("unit_discipline")) ?? "";
  // BOTH arms in ONE leg: a null level must read "not yet observed" and must NOT
  // read L1, while a real level still reads its number. Asserted together so
  // collapsing one into the other cannot pass (M101's corollary).
  check(
    "INSIGHT-GROUND: a NULL horizontal reads 'not yet observed', never L1 — and a real level still reads L3",
    nullLine.includes("not yet observed") &&
      !nullLine.includes("L1") &&
      l3Line.includes("L3") &&
      !l3Line.includes("not yet observed"),
  );
  // A student with no insight layer must get the prompt UNCHANGED — no empty
  // headers, no "(none yet)" filler inviting the model to comment on absence.
  check(
    "INSIGHT-GROUND: no insight rows → no sections emitted at all (prompt unchanged)",
    renderInsightBlocks({ chapters: [], subjects: [], horizontals: [], preferences: [], multiSubject: false }).length === 0,
  );

  // ─────────── Slice AUTHOR-PREF — walkthrough item 10 ───────────
  // The tutor's own "how to teach this student" note, per subject — the FOURTH
  // grounding input item 11 left a socket for, and the only one written by a
  // human rather than by synthesis.
  //
  // Part A — the RULE, pure, no DB and no AI (M101).
  //
  // The load-bearing call is the null-vs-empty one: an unwritten subject emits
  // NO block. A stored "" would render a headed but empty section, which reads
  // to the author as "the tutor had nothing to say about her" rather than
  // "nobody has written this yet" — so the service deletes instead of storing "".
  // BOTH arms in ONE leg so collapsing either into the other cannot pass.
  const prefOn = renderInsightBlocks({
    chapters: [], subjects: [], horizontals: [],
    preferences: [
      { subjectName: "Physics", chapterName: "PURE_CHAP_NAME", preference: "PURE_PREF_TEXT" },
    ],
    multiSubject: false,
  }).join("\n");
  const prefOff = renderInsightBlocks({
    chapters: [{ chapterName: "Motion", insight: "PURE_CHAPTER_TEXT" }],
    subjects: [], horizontals: [], preferences: [], multiSubject: false,
  }).join("\n");
  check(
    "AUTHOR-PREF: a written note emits the HOW TO TEACH block; NO note emits no block at all — while a sibling block still renders",
    prefOn.includes("HOW TO TEACH THIS STUDENT") &&
      prefOn.includes("PURE_PREF_TEXT") &&
      !prefOff.includes("HOW TO TEACH THIS STUDENT") &&
      prefOff.includes("PURE_CHAPTER_TEXT"),
  );
  // The note is an instruction about FORM, not about what to test — the framing
  // that stops a preference talking the author out of an under-covered sub-topic.
  check(
    "AUTHOR-PREF: the block is framed as the TUTOR's instruction, and says it does not decide what to test",
    prefOn.includes("BY THE TUTOR") && prefOn.includes("does NOT change WHAT to test"),
  );
  // D-CHAPTER-PREF: the CHAPTER name is unconditional, the SUBJECT name is not.
  // Asserted as one leg because the two are easy to collapse into each other,
  // and collapsing them is the actual danger: drop the chapter name and a note
  // about Forces reads as a note about the chapter being authored.
  const prefMulti = renderInsightBlocks({
    chapters: [], subjects: [], horizontals: [],
    preferences: [
      { subjectName: "Physics", chapterName: "Motion", preference: "PURE_PHYS_PREF" },
      { subjectName: "Chemistry", chapterName: "Acids", preference: "PURE_CHEM_PREF" },
    ],
    multiSubject: true,
  }).join("\n");
  check(
    "D-CHAPTER-PREF: every line names its CHAPTER always, and its SUBJECT only when the chat spans several",
    prefMulti.includes("Physics · Motion: PURE_PHYS_PREF") &&
      prefMulti.includes("Chemistry · Acids: PURE_CHEM_PREF") &&
      prefOn.includes("PURE_CHAP_NAME: PURE_PREF_TEXT") &&
      !prefOn.includes("Physics"),
  );

  // Part B — the real read, against real rows under real RLS.
  await withBoard(P.id, async (tx: Tx) => {
    await tx.insert(studentChapterInsight).values({
      boardId: P.id, studentId: stuA.id, chapterId: fx.chapterId,
      insight: "INS_CHAPTER_MOTION: reaches for a formula before asking what is changing.",
    });
    // OUT of this chat's chapter scope — the founder's natural-grain ruling made
    // checkable: chapter insight follows the chat's chapters, nothing wider.
    await tx.insert(studentChapterInsight).values({
      boardId: P.id, studentId: stuA.id, chapterId: fx.chapter2Id,
      insight: "INS_CHAPTER_FORCES: should not appear in a Motion-only chat.",
    });
    await tx.insert(studentSubjectInsight).values({
      boardId: P.id, studentId: stuA.id, subjectId: fx.subjectId,
      insight: "INS_SUBJECT_PHYS: reads the question too fast; strong once she slows down.",
    });
    await tx.insert(horizontalSkillState).values({
      boardId: P.id, studentId: stuA.id, subjectId: fx.subjectId,
      slug: "unit_discipline", level: 2, prose: "INS_HZ_LEVELLED: drops units mid-derivation.",
    });
    await tx.insert(horizontalSkillState).values({
      boardId: P.id, studentId: stuA.id, subjectId: fx.subjectId,
      slug: "causal_reasoning", level: null, prose: "INS_HZ_NULL: never asked to explain a mechanism.",
    });
  });
  const gIns = await withBoard(P.id, (tx) =>
    assembleGrounding(tx, { tutorUserId: tut.id, studentId: stuA.id, chapterIds: [fx.chapterId] }),
  );
  check(
    "INSIGHT-GROUND: all three insight blocks reach the authoring grounding",
    gIns.includes("INS_CHAPTER_MOTION") &&
      gIns.includes("INS_SUBJECT_PHYS") &&
      gIns.includes("INS_HZ_LEVELLED") &&
      gIns.includes("INS_HZ_NULL"),
  );
  // The scope control. Requires the IN-scope text to be present, so a grounding
  // that failed to build cannot pass this by being empty (M104).
  check(
    "INSIGHT-GROUND: an OUT-of-scope chapter's insight is excluded, while the same subject's insight IS carried",
    gIns.includes("INS_CHAPTER_MOTION") &&
      gIns.includes("INS_SUBJECT_PHYS") &&
      !gIns.includes("INS_CHAPTER_FORCES"),
  );
  // Chapter order, not insert order — chapterIds passed deliberately REVERSED.
  const gOrder = await withBoard(P.id, (tx) =>
    assembleGrounding(tx, {
      tutorUserId: tut.id, studentId: stuA.id, chapterIds: [fx.chapter2Id, fx.chapterId],
    }),
  );
  const iMotion = gOrder.indexOf("INS_CHAPTER_MOTION");
  const iForces = gOrder.indexOf("INS_CHAPTER_FORCES");
  check(
    "INSIGHT-GROUND: with both chapters in scope both render, in CHAPTER ordinal order",
    iMotion >= 0 && iForces >= 0 && iMotion < iForces,
  );
  // The insight layer describes WHO you are authoring for, so it must sit with
  // the student picture — ahead of the curriculum map, not buried after it.
  check(
    "INSIGHT-GROUND: the blocks sit after the observations and before CHAPTER COVERAGE",
    gIns.indexOf("RECENT STAGE-1 OBSERVATIONS") < gIns.indexOf("STUDENT INSIGHT — CHAPTER VIEW") &&
      gIns.indexOf("STUDENT INSIGHT — CHAPTER VIEW") < gIns.indexOf("CHAPTER COVERAGE"),
  );
  await withBoard(P.id, async (tx: Tx) => {
    await tx.delete(studentChapterInsight).where(eq(studentChapterInsight.studentId, stuA.id));
    await tx.delete(studentSubjectInsight).where(eq(studentSubjectInsight.studentId, stuA.id));
    await tx.delete(horizontalSkillState).where(eq(horizontalSkillState.studentId, stuA.id));
  });
  // …and with the rows gone the grounding must be clean again — proves the
  // sections are driven by the rows, not by something latched at module load.
  const gAfter = await withBoard(P.id, (tx) =>
    assembleGrounding(tx, { tutorUserId: tut.id, studentId: stuA.id, chapterIds: [fx.chapterId] }),
  );
  check(
    "INSIGHT-GROUND: rows removed → the insight sections disappear (grounding still builds)",
    gAfter.length > 0 &&
      gAfter.includes("CERTIFIED TWO-AXIS MASTERY") &&
      !gAfter.includes("STUDENT INSIGHT"),
  );

  // Part B — AUTHOR-PREF through the REAL write path. Every write below goes
  // through `setChapterPreference`, never a raw insert: the seam under test is
  // service → table → grounding, and a probe that inserts the row itself proves
  // only that the reader reads (M40/M64).
  //
  // ── D-CHAPTER-PREF (S185) — the grain moved subject → CHAPTER ───────────────
  // Write at chapter, READ across the whole subject. Leg #1 below is the exact
  // scenario the founder's shape was invented for, and it is the one that would
  // have silently failed under a naive chapter-grain read (M97):
  //
  //   the tutor annotates FORCES; the chat is about MOTION; Motion has no note
  //   of its own — and the note must STILL reach the authoring grounding.
  //
  // Without that, chapter grain collapses coverage from "the note always
  // applies" to "usually empty" — the objection the founder overruled by
  // splitting the grains, so it is the claim this probe owes.
  // Named once and reused at every write AND every assertion below. The last
  // leg compares stored values for EXACT equality, and writing the literal twice
  // is how that leg went red twice: the assertion held the sentinel prefix while
  // the row held the whole sentence.
  const NOTE_SIBLING = "PREF_SIBLING: diagram-first questions land; long worded stems lose her.";
  const NOTE_CHEM = "PREF_CHEM: should not appear in a Physics chat.";
  await rows(P.id, (tx) =>
    setChapterPreference(tx, {
      tutorUserId: tut.id, studentId: stuA.id, chapterId: fx.chapter2Id,
      preference: NOTE_SIBLING,
    }),
  );
  await rows(P.id, (tx) =>
    setChapterPreference(tx, {
      tutorUserId: tut.id, studentId: stuA.id, chapterId: fx.chapter3Id,
      preference: NOTE_CHEM,
    }),
  );
  const gPref = await rows(P.id, (tx) =>
    assembleGrounding(tx, { tutorUserId: tut.id, studentId: stuA.id, chapterIds: [fx.chapterId] }),
  );
  const prefLine = gPref.split("\n").find((l) => l.includes("PREF_SIBLING")) ?? "";
  check(
    "D-CHAPTER-PREF #1: a note on a SIBLING chapter (Forces) reaches a chat about a chapter with NO note of its own (Motion) — the read spans the subject",
    gPref.includes("HOW TO TEACH THIS STUDENT") && prefLine !== "",
  );
  // The consequence the founder named: a note from a chapter the chat is NOT
  // about must say so, or the author reads it as being about Motion.
  check(
    "D-CHAPTER-PREF: the note carries the CHAPTER it was written against (Forces), so a sibling note can't pose as one about this chapter",
    prefLine.includes("Forces") && !prefLine.includes("Motion"),
  );
  // Subject scope. Requires the IN-scope note PRESENT, so a grounding that
  // failed to build cannot pass this by being empty (M104).
  check(
    "D-CHAPTER-PREF: the read stops at the SUBJECT boundary — another subject's chapter note is excluded",
    prefLine !== "" && !gPref.includes("PREF_CHEM"),
  );
  // The LEFT JOIN direction is the design call: reading FROM `chapter` is what
  // lets a tutor write the FIRST note for a chapter. A preference-first read
  // would never return the row that does not exist yet, so the drill-down would
  // have nothing to render and the feature would be unreachable for every
  // un-annotated chapter — which, at 74 CBSE chapters, is nearly all of them.
  const prefsB4 = await rows(P.id, (tx) =>
    getChapterPreferences(tx, { tutorUserId: tut.id, studentId: stuB.id }),
  );
  check(
    "D-CHAPTER-PREF: a student with NO notes still gets every board CHAPTER back, each with preference null",
    prefsB4.length === 3 &&
      prefsB4.every((p) => p.preference === null) &&
      prefsB4.some((p) => p.chapterId === fx.chapterId) &&
      prefsB4.some((p) => p.chapterId === fx.chapter2Id) &&
      prefsB4.some((p) => p.chapterId === fx.chapter3Id),
  );
  // The drill-down groups by subject and labels each with its GRADE — every row
  // must carry both, or the FE cannot draw the tree from this one read (and
  // Physics-9 vs Physics-10 draw as two identical rows, S184 §3's finding).
  check(
    "D-CHAPTER-PREF: every chapter row carries its subject + grade, so the drill-down needs no second read",
    prefsB4.every((p) => !!p.subjectId && !!p.subjectName && !!p.grade) &&
      prefsB4.filter((p) => p.subjectId === fx.subjectId).length === 2 &&
      prefsB4.filter((p) => p.subjectId === fx.subject2Id).length === 1,
  );
  // Clearing. A whitespace-only save must DELETE, not store "" — the null-vs-empty
  // rule Part A gated purely, here proven against the real table.
  await rows(P.id, (tx) =>
    setChapterPreference(tx, {
      tutorUserId: tut.id, studentId: stuA.id, chapterId: fx.chapter2Id, preference: "   ",
    }),
  );
  const [prefRowAfterClear] = await rows(P.id, (tx) =>
    tx.select().from(studentAuthoringPreference).where(
      and(
        eq(studentAuthoringPreference.studentId, stuA.id),
        eq(studentAuthoringPreference.chapterId, fx.chapter2Id),
      ),
    ),
  );
  const gCleared = await rows(P.id, (tx) =>
    assembleGrounding(tx, { tutorUserId: tut.id, studentId: stuA.id, chapterIds: [fx.chapterId] }),
  );
  check(
    "D-CHAPTER-PREF: a whitespace save DELETES the row (never stores \"\") and the block leaves the grounding, which still builds",
    prefRowAfterClear === undefined &&
      gCleared.length > 0 &&
      gCleared.includes("CERTIFIED TWO-AXIS MASTERY") &&
      !gCleared.includes("HOW TO TEACH THIS STUDENT"),
  );
  // The sitting's editor (the founder's second write surface) sees ONLY the
  // chapter(s) that sitting spans — not every chapter on the board. Its
  // sub_topic resolves to Motion, so Forces and Acids must both be absent.
  const [sitting] = await rows(P.id, (tx) =>
    tx.insert(assessmentSession).values({
      boardId: P.id, studentId: stuA.id, tutorId: tut.id,
      subTopicIds: [fx.subTopicId], drafts: {}, messages: [],
    }).returning(),
  );
  const sessPrefs = await rows(P.id, (tx) =>
    getSessionChapterPreferences(tx, { tutorUserId: tut.id, sessionId: sitting!.id }),
  );
  check(
    "D-CHAPTER-PREF: the sitting's editor is narrowed to the CHAPTER(s) that sitting spans, not the whole board",
    sessPrefs.length === 1 &&
      sessPrefs[0]?.chapterId === fx.chapterId &&
      prefsB4.length === 3,
  );
  // Ownership, both directions. stuC is deliberately UNLINKED from this tutor.
  let prefRead403 = false;
  await rows(P.id, (tx) => getChapterPreferences(tx, { tutorUserId: tut.id, studentId: stuC.id }))
    .catch((e) => { prefRead403 = e instanceof StudentNotFoundError; return null; });
  let prefWrite403 = false;
  await rows(P.id, (tx) =>
    setChapterPreference(tx, {
      tutorUserId: tut.id, studentId: stuC.id, chapterId: fx.chapterId, preference: "PREF_LEAK",
    }),
  ).catch((e) => { prefWrite403 = e instanceof StudentNotFoundError; return null; });
  check(
    "D-CHAPTER-PREF: an unlinked student is refused on BOTH the read and the write (no existence leak)",
    prefRead403 && prefWrite403,
  );
  // A chapter from ANOTHER board must be refused rather than written: FK checks
  // bypass RLS, so without this guard the insert would succeed and manufacture
  // exactly the cross-board row M61 created by accident.
  let crossBoard = false;
  await rows(P.id, (tx) =>
    setChapterPreference(tx, {
      tutorUserId: tut.id, studentId: stuA.id, chapterId: fxQ.chapterId, preference: "PREF_CROSS",
    }),
  ).catch((e) => { crossBoard = e instanceof ChapterNotOnBoardError; return null; });
  check(
    "D-CHAPTER-PREF: a chapter from another board is refused, not written cross-board",
    crossBoard,
  );
  // The unique key moved with the grain: a second write to the SAME chapter must
  // update in place (single note per chapter, the founder's Q1 ruling), while a
  // write to a DIFFERENT chapter of the same subject adds a row rather than
  // overwriting — the two halves of `unique(student_id, chapter_id)`.
  const NOTE_ONE = "PREF_ONE: the first note, which must be overwritten.";
  const NOTE_TWO = "PREF_TWO: the second note, which must replace it in place.";
  const NOTE_OTHER = "PREF_OTHER: a different chapter, which must get its own row.";
  await rows(P.id, (tx) =>
    setChapterPreference(tx, {
      tutorUserId: tut.id, studentId: stuA.id, chapterId: fx.chapterId, preference: NOTE_ONE,
    }),
  );
  await rows(P.id, (tx) =>
    setChapterPreference(tx, {
      tutorUserId: tut.id, studentId: stuA.id, chapterId: fx.chapterId, preference: NOTE_TWO,
    }),
  );
  await rows(P.id, (tx) =>
    setChapterPreference(tx, {
      tutorUserId: tut.id, studentId: stuA.id, chapterId: fx.chapter2Id, preference: NOTE_OTHER,
    }),
  );
  const afterUpsert = await rows(P.id, (tx) =>
    tx.select().from(studentAuthoringPreference).where(eq(studentAuthoringPreference.studentId, stuA.id)),
  );
  const noteOn = (chapterId: string) =>
    afterUpsert.filter((r) => r.chapterId === chapterId).map((r) => r.preference);
  const upsertOk =
    // Exactly one row per chapter, each holding what was LAST written there.
    // Chemistry is named explicitly rather than left to a total count: it was
    // written earlier and never cleared, so asserting the whole set proves the
    // upsert touched ONLY its own key.
    afterUpsert.length === 3 &&
    JSON.stringify(noteOn(fx.chapterId)) === JSON.stringify([NOTE_TWO]) &&
    JSON.stringify(noteOn(fx.chapter2Id)) === JSON.stringify([NOTE_OTHER]) &&
    JSON.stringify(noteOn(fx.chapter3Id)) === JSON.stringify([NOTE_CHEM]) &&
    !afterUpsert.some((r) => r.preference === NOTE_ONE);
  // A red here is worth reading, not re-guessing: print what the table actually
  // held. (This leg went red twice on a wrong EXPECTATION, not a wrong table.)
  if (!upsertOk) {
    console.error(
      `    ↳ actual rows: ${JSON.stringify(
        afterUpsert.map((r) => ({ chapter: r.chapterId, pref: r.preference })),
        null,
        0,
      )}`,
    );
  }
  check(
    "D-CHAPTER-PREF: one note per chapter — a re-save UPDATES in place, while another chapter of the same subject gets its OWN row",
    upsertOk,
  );
  await rows(P.id, async (tx: Tx) => {
    await tx.delete(assessmentSession).where(eq(assessmentSession.id, sitting!.id));
    await tx.delete(studentAuthoringPreference).where(eq(studentAuthoringPreference.studentId, stuA.id));
  });

  // 2. ownership: startChat for an UNLINKED student → STUDENT_NOT_FOUND.
  let nf = false;
  try {
    await rows(P.id, (tx) => startChat(tx, { boardId: P.id, tutorUserId: tut.id, studentId: stuC.id, vendor: "claude_cli" }));
  } catch (e) {
    nf = e instanceof StudentNotFoundError;
  }
  check("startChat: unlinked student → STUDENT_NOT_FOUND (ownership)", nf);

  // ─────────── claude_cli full flow ───────────
  const chat = await rows(P.id, (tx) => startChat(tx, { boardId: P.id, tutorUserId: tut.id, studentId: stuA.id, vendor: "claude_cli", chapterId: fx.chapterId }));
  check("startChat: row created, vendor=claude_cli, chapter scoped, no messages", chat.vendor === "claude_cli" && chat.chapterId === fx.chapterId && chat.subTopicId === null && chat.messages.length === 0 && !!chat.chatId);

  // 3. getChat ownership: a different tutor → NOT_FOUND.
  let chatNf = false;
  try {
    await rows(P.id, (tx) => getChat(tx, { tutorUserId: tut2.id, chatId: chat.chatId }));
  } catch (e) {
    chatNf = e instanceof AuthoringChatNotFoundError;
  }
  check("getChat: non-owner tutor → AUTHORING_CHAT_NOT_FOUND (ownership)", chatNf);

  // 4. sendTurn (REAL claude_cli) — turn 1.
  const t1 = await rows(P.id, (tx) => sendTurn(tx, { tutorUserId: tut.id, chatId: chat.chatId, text: "Where is this student weakest — what should I drill?" }));
  const a1 = t1.messages[t1.messages.length - 1]!;
  check("claude turn1: messages grew to 2 (user+assistant)", t1.messages.length === 2 && t1.messages[0]!.role === "user" && a1.role === "assistant");
  check("claude turn1: assistant text non-empty", a1.text.trim().length > 0);
  check("claude turn1: assistant tagged vendorId=claude_cli", a1.vendorId === "claude_cli");
  check("claude turn1: assistant carries aiSessionId + fingerprint", !!a1.aiSessionId && !!a1.sessionFingerprint);
  soft("claude turn1 reply (first 160ch)", a1.text.slice(0, 160));

  // 5. sendTurn turn 2 (resume-or-stitch).
  const t2 = await rows(P.id, (tx) => sendTurn(tx, { tutorUserId: tut.id, chatId: chat.chatId, text: "Good. Focus on the unit-conversion slip then." }));
  check("claude turn2: messages grew to 4", t2.messages.length === 4);
  check("claude turn2: assistant text non-empty", t2.messages[3]!.text.trim().length > 0);

  // 5b. proposeTarget (REAL claude_cli) — consent-in-chat target resolution.
  // FIRM: the chosen sub_topic is ALWAYS inside the chapter allowlist (index-based,
  // can't escape); count clamped to [1,8]; the focus is persisted on the chat.
  // SOFT: WHICH sub_topic + count the model picked.
  const prop = await rows(P.id, (tx) => proposeTarget(tx, { tutorUserId: tut.id, chatId: chat.chatId }));
  check("proposeTarget: chosen sub_topic ∈ chapter allowlist (anchor bounded)", fx.allowedSubTopicIds.includes(prop.subTopicId));
  check("proposeTarget: count clamped to 1–8", prop.count >= 1 && prop.count <= 8);
  const afterProp = await rows(P.id, (tx) => getChat(tx, { tutorUserId: tut.id, chatId: chat.chatId }));
  check("proposeTarget: persisted the resolved focus on the chat", afterProp.subTopicId === prop.subTopicId);
  soft("proposeTarget choice", { subTopic: prop.subTopicName, count: prop.count, why: prop.rationale.slice(0, 120) });

  // 6. authorFromChat (REAL claude_cli) — off the in-chapter target (fx.subTopicId).
  const COUNT = 3;
  const ares = await rows(P.id, (tx) => authorFromChat(tx, { tutorUserId: tut.id, chatId: chat.chatId, subTopicId: fx.subTopicId, count: COUNT }));
  check(`claude author: returned exactly ${COUNT} drafts`, ares.drafts.length === COUNT);
  check("claude author: every draft valid (axis/stem/ref/intent/rubric)", ares.drafts.every(validDraft));
  check("claude author: nextOrdinal = canonical max (0) + 1 = 1", ares.nextOrdinal === 1);
  check("claude author: studentId threaded through", ares.studentId === stuA.id);
  soft("claude draft axes", ares.drafts.map((d) => d.axis));

  // 6b. chapter-scope guard: authoring an OUT-OF-CHAPTER sub_topic → NOT_FOUND.
  let outOfScope = false;
  try {
    await rows(P.id, (tx) => authorFromChat(tx, { tutorUserId: tut.id, chatId: chat.chatId, subTopicId: fx.outOfChapterSubTopicId, count: 1 }));
  } catch (e) {
    outOfScope = e instanceof SubTopicNotFoundError;
  }
  check("authorFromChat: out-of-chapter sub_topic → SUB_TOPIC_NOT_FOUND (scope guard)", outOfScope);

  // 6b(persist). authorFromChat now PERSISTS drafts (status='draft') with ids.
  check("author: drafts persisted with ids (FIG-AUTH)", ares.drafts.every((d) => !!d.id));

  // 6c. reviseDraft (REAL claude_cli) — per-question mini-chat on ONE persisted draft.
  const revised = await rows(P.id, (tx) => reviseDraft(tx, { tutorUserId: tut.id, chatId: chat.chatId, questionId: ares.drafts[0]!.id, refinementNote: "Make this noticeably harder and force the student to justify the unit conversion in words." }));
  check("reviseDraft: returns the updated draft (same id, valid)", validDraft(revised) && revised.id === ares.drafts[0]!.id);
  soft("reviseDraft stem changed?", { was: ares.drafts[0]!.stem.slice(0, 80), now: revised.stem.slice(0, 80) });

  // 7. Drafts persisted but NOT yet servable — the M11 gate. BEFORE approve,
  // student A must NOT see them (only the 1 canonical).
  const draftIds = ares.drafts.map((d) => d.id);
  const savedPriv = await rows(P.id, (tx) =>
    tx.select().from(question).where(and(eq(question.subTopicId, fx.subTopicId), eq(question.source, "b2c_authoring"))).orderBy(asc(question.ordinal)),
  );
  check("persist: all carry target_student_id = A", savedPriv.length === COUNT && savedPriv.every((q) => q.targetStudentId === stuA.id));
  check("persist: all status='draft' before approve", savedPriv.every((q) => (q as { status: string }).status === "draft"));
  check("persist: consecutive ordinals after canonical max → 1,2,3", JSON.stringify(savedPriv.map((q) => q.ordinal)) === JSON.stringify([1, 2, 3]));
  // M11 gate BEFORE approve — assert via the servable set (a startSession here
  // would FREEZE + later RESUME A's session per D-L-6, masking the approve).
  const servableBefore = await rows(P.id, (tx) =>
    tx.select().from(question).where(and(eq(question.subTopicId, fx.subTopicId), eq(question.status, "approved"))),
  );
  check("M11 gate: only the 1 canonical is servable before approve (drafts hidden)", servableBefore.length === 1);

  // 7b. approveDrafts → the ENABLEMENT side. Now A sees them.
  const appr = await rows(P.id, (tx) => approveDrafts(tx, { tutorUserId: tut.id, questionIds: draftIds }));
  check(`approve: ${COUNT} ids approved`, appr.approvedIds.length === COUNT);

  // 8. PRIVATE DELIVERY — the load-bearing isolation test (post-approve).
  const sessA = await rows(P.id, (tx) => startSession(tx, { boardId: P.id, appUserId: stuA.id, subTopicId: fx.subTopicId }));
  const sessB = await rows(P.id, (tx) => startSession(tx, { boardId: P.id, appUserId: stuB.id, subTopicId: fx.subTopicId }));
  check("delivery: student A sees canonical + 3 approved private = 4 questions", sessA.total === 4);
  check("delivery: student B sees ONLY the 1 canonical (private invisible)", sessB.total === 1);

  // 8b. proposeTarget precondition: a chat with NO chapter scope → NO_CHAPTER
  // (the FE surfaces this as "pick a chapter first", not an error).
  const noChapChat = await rows(P.id, (tx) => startChat(tx, { boardId: P.id, tutorUserId: tut.id, studentId: stuA.id, vendor: "gemini_api" }));
  let noChap = false;
  try {
    await rows(P.id, (tx) => proposeTarget(tx, { tutorUserId: tut.id, chatId: noChapChat.chatId }));
  } catch (e) {
    noChap = e instanceof ProposeTargetError && e.code === "NO_CHAPTER";
  }
  check("proposeTarget: chat without a chapter → NO_CHAPTER", noChap);

  // 9. RLS: chat row + private questions invisible under board Q.
  const chatUnderQ = await rows(Q.id, (tx) => tx.select().from(authoringChat).where(eq(authoringChat.id, chat.chatId)));
  const privUnderQ = await rows(Q.id, (tx) => tx.select().from(question).where(eq(question.subTopicId, fx.subTopicId)));
  check("RLS: authoring_chat invisible under board Q", chatUnderQ.length === 0);
  check("RLS: P's private questions invisible under board Q", privUnderQ.length === 0);

  // ─────────── Claude IN-CHAT authoring via the fenced marker (parity) ───────────
  // FIRM (deterministic): the marker parser/stripper — the load-bearing logic we
  // control, independent of any model. Valid → parsed; malformed/absent → null.
  {
    const good =
      'On it — drafting now.\n```author_questions\n{"subTopicNumber": 2, "count": 3}\n```\nDone.';
    const p = parseAuthorMarker(good);
    check("marker parse: valid fenced block → {subTopicNumber:2, count:3}", p?.subTopicNumber === 2 && p?.count === 3);
    const stripped = stripAuthorMarker(good);
    check("marker strip: fence removed, prose kept", !/author_questions/.test(stripped) && /drafting now/.test(stripped) && /Done\./.test(stripped));
    check("marker parse: same-line JSON tolerated", parseAuthorMarker('```author_questions {"subTopicNumber":1,"count":1}```')?.count === 1);
    check("marker parse: no marker → null (inert)", parseAuthorMarker("let's discuss acceleration first, no rush") === null);
    check("marker parse: fenced but missing keys → null (inert)", parseAuthorMarker('```author_questions\n{"foo":1}\n```') === null);
    check("marker parse: wrong fence tag → null (inert)", parseAuthorMarker('```json\n{"subTopicNumber":1,"count":1}\n```') === null);
  }

  // ─────────── Gemini [[AUTHOR_NOW]] sentinel detect/strip (Slice AUTH-fix B) ───────────
  // FIRM (deterministic): the sentinel is Gemini's author trigger, REPLACING the
  // native function-call that 400'd. The detect/strip logic is model-independent.
  {
    const goAhead = "On it — drafting 3 on the discriminant now.\n[[AUTHOR_NOW]]";
    check("sentinel detect: reply with [[AUTHOR_NOW]] → true", hasAuthorSentinel(goAhead));
    check("sentinel detect: plain discussion → false (inert)", !hasAuthorSentinel("Let's discuss the discriminant first — no rush."));
    check("sentinel detect: tolerant of inner spaces [[ AUTHOR_NOW ]]", hasAuthorSentinel("ok\n[[ AUTHOR_NOW ]]"));
    check("sentinel detect: null/empty → false", !hasAuthorSentinel(null) && !hasAuthorSentinel(""));
    const strippedSent = stripAuthorSentinel(goAhead);
    check("sentinel strip: token removed, prose kept", !/AUTHOR_NOW/.test(strippedSent) && /drafting 3/.test(strippedSent));
    check("sentinel strip: no token → unchanged prose", stripAuthorSentinel("just discussing") === "just discussing");
  }

  // FIRM (real Claude, AI-dependent — one retry to absorb model nondeterminism):
  // a plain discussion turn does NOT author; an explicit go-ahead DOES fire the
  // in-chat marker. Fresh chat so it can't disturb the flow above.
  //
  // 🔴 THIS BLOCK WAS RED FOR SIX SESSIONS AND NOBODY SAW IT. It asserted
  // `go.draft` — the SYNCHRONOUS in-chat draft payload. Slice AUTHOR-ASYNC (S146,
  // `6e409f2`) moved drafting onto a background job and stopped populating `.draft`
  // ENTIRELY (`ChatView.draft` says so in as many words), but it never updated this
  // file — so `authored` became permanently false and this leg has failed on every
  // run since. The sibling probe that DID get updated (probe_authoring_tool) went on
  // passing, which is exactly how the red one stayed invisible: nobody reads a suite
  // that is already known to be non-zero. Fixed here to the CURRENT contract
  // (TWOWAY-1: a go-ahead enqueues a PLAN job), with the retry keyed off the same
  // field it asserts, so the leg can never again pass or fail for a stale reason.
  {
    const icChat = await rows(P.id, (tx) => startChat(tx, { boardId: P.id, tutorUserId: tut.id, studentId: stuA.id, vendor: "claude_cli", chapterId: fx.chapterId }));
    const disc = await rows(P.id, (tx) => sendTurn(tx, { tutorUserId: tut.id, chatId: icChat.chatId, text: "Before we author — in one line, what's the single biggest gap for this student?" }));
    check(
      "claude in-chat: discussion turn (no go-ahead) does NOT author (no plan job, no draft job)",
      disc.planJobId === undefined && disc.draftJobId === undefined,
    );

    let go = await rows(P.id, (tx) => sendTurn(tx, { tutorUserId: tut.id, chatId: icChat.chatId, text: "Yes — go ahead and author 2 questions on sub-topic 1 now." }));
    if (!go.planJobId) {
      // one more explicit nudge (model nondeterminism, not a logic failure)
      go = await rows(P.id, (tx) => sendTurn(tx, { tutorUserId: tut.id, chatId: icChat.chatId, text: "Author 2 questions on sub-topic 1 now — emit the author_questions block." }));
    }
    check("claude in-chat: go-ahead ENQUEUED a plan job (marker fired, ≤2 tries)", !!go.planJobId);
    check("claude in-chat: nothing drafted synchronously (AUTHOR-ASYNC + the TWOWAY-1 gate)", go.draft === undefined && go.draftJobId === undefined);
    if (go.planJobId) {
      check("claude in-chat: target pinned ∈ chapter allowlist (anchor bounded)", !!go.subTopicId && fx.allowedSubTopicIds.includes(go.subTopicId));
      check("claude in-chat: shown wrap-up has no raw author_questions marker leak", !/```\s*author_questions/.test(go.messages[go.messages.length - 1]!.text));
      soft("claude in-chat planned", { jobId: go.planJobId.slice(0, 12), sub: go.subTopicId });
    } else {
      soft("claude in-chat: marker did NOT fire after 2 tries (inspect / re-run)", go.messages[go.messages.length - 1]!.text.slice(0, 200));
    }
  }

  // ─────────── gemini_api smoke (both vendors) ───────────
  try {
    const gchat = await rows(P.id, (tx) => startChat(tx, { boardId: P.id, tutorUserId: tut.id, studentId: stuA.id, vendor: "gemini_api", chapterId: fx.chapterId }));
    const g1 = await rows(P.id, (tx) => sendTurn(tx, { tutorUserId: tut.id, chatId: gchat.chatId, text: "Same student — give me one transfer question idea for the rate-of-change concept." }));
    const ga = g1.messages[g1.messages.length - 1]!;
    check("gemini turn1: assistant text non-empty + vendorId=gemini_api", ga.text.trim().length > 0 && ga.vendorId === "gemini_api");
    check("gemini turn1: assistant carries aiSessionId (interaction id)", !!ga.aiSessionId);
    soft("gemini turn1 reply (first 160ch)", ga.text.slice(0, 160));

    const gauthor = await rows(P.id, (tx) => authorFromChat(tx, { tutorUserId: tut.id, chatId: gchat.chatId, subTopicId: fx.subTopicId, count: 2 }));
    check("gemini author: 2 valid drafts (responseSchema path)", gauthor.drafts.length === 2 && gauthor.drafts.every(validDraft));
    soft("gemini draft axes", gauthor.drafts.map((d) => d.axis));
  } catch (e) {
    check("gemini_api vendor smoke (chat + author)", false);
    console.error("    gemini smoke error:", (e as Error).message);
  }

  // 10. HTTP no-session → 401 (soft).
  try {
    const res = await fetch(`http://localhost:${env.PORT}/trpc/tutor.startAuthoringChat?batch=1`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-board": P.slug },
      body: JSON.stringify({ 0: { json: { studentId: stuA.id, vendor: "claude_cli" } } }),
    });
    check(`HTTP startAuthoringChat (no session) → 401 (got ${res.status})`, res.status === 401);
  } catch {
    console.log("  ~ HTTP startAuthoringChat skipped (server not running)");
  }

  // ─────────── DRAFT-SCOPE: getChat's review form is scoped to THIS chat's chapter(s) ───────────
  // A draft is student-private, not chat-scoped, so an unscoped listDrafts hydrated
  // a chat's review form with the SAME student's drafts from OTHER chapters (a
  // Physics form under a Maths conversation — the founder's "resistance questions in
  // the Quadratics preview"). getChat now passes the chat's chapterIds. Deterministic
  // (no AI): plant one draft in chapter 1 (Motion) and one in chapter 2 (Forces) for
  // stuA, then assert each chat sees only its own scope, and an unscoped (no-chapter)
  // chat sees both.
  {
    const AUTH_SRC = "b2c_authoring"; // AUTHORING_SOURCE (module-private in authoring.ts)
    const [motionDraft] = await rows(P.id, (tx) =>
      tx.insert(question).values({ boardId: P.id, subTopicId: fx.subTopicId, axis: "conceptual", kind: "subjective", stem: "SCOPE motion draft", referenceAnswer: "ref", ordinal: 90, source: AUTH_SRC, status: "draft", targetStudentId: stuA.id }).returning(),
    );
    const [forcesDraft] = await rows(P.id, (tx) =>
      tx.insert(question).values({ boardId: P.id, subTopicId: fx.outOfChapterSubTopicId, axis: "conceptual", kind: "subjective", stem: "SCOPE forces draft", referenceAnswer: "ref", ordinal: 90, source: AUTH_SRC, status: "draft", targetStudentId: stuA.id }).returning(),
    );

    // `chat` is Motion-scoped (chapter 1). Its review form must include the Motion
    // draft and EXCLUDE the Forces draft — the exact bug.
    const motionView = await rows(P.id, (tx) => getChat(tx, { tutorUserId: tut.id, chatId: chat.chatId }));
    const motionIds = new Set((motionView.pendingDrafts ?? []).map((d) => d.id));
    check("DRAFT-SCOPE: Motion-scoped chat SEES its own chapter's draft", motionIds.has(motionDraft!.id));
    check("DRAFT-SCOPE: Motion-scoped chat HIDES another chapter's draft (the bug)", !motionIds.has(forcesDraft!.id));

    // A chat scoped to chapter 2 (Forces) is the mirror: sees Forces, not Motion.
    const forcesChat = await rows(P.id, (tx) => startChat(tx, { boardId: P.id, tutorUserId: tut.id, studentId: stuA.id, vendor: "claude_cli", chapterId: fx.chapter2Id }));
    const forcesView = await rows(P.id, (tx) => getChat(tx, { tutorUserId: tut.id, chatId: forcesChat.chatId }));
    const forcesIds = new Set((forcesView.pendingDrafts ?? []).map((d) => d.id));
    check("DRAFT-SCOPE: Forces-scoped chat SEES the Forces draft, HIDES the Motion draft", forcesIds.has(forcesDraft!.id) && !forcesIds.has(motionDraft!.id));

    // Legacy fallback: a chat with NO chapter scope reads UNSCOPED (student-wide) —
    // preserves pre-scope behaviour, never hides a draft from a chapterless chat.
    const unscopedView = await rows(P.id, (tx) => getChat(tx, { tutorUserId: tut.id, chatId: noChapChat.chatId }));
    const unscopedIds = new Set((unscopedView.pendingDrafts ?? []).map((d) => d.id));
    check("DRAFT-SCOPE: no-chapter chat reads UNSCOPED (sees both drafts)", unscopedIds.has(motionDraft!.id) && unscopedIds.has(forcesDraft!.id));
  }

  // ── cleanup (FK-safe) ──
  await withBoard(P.id, async (tx: Tx) => {
    await tx.delete(practiceSession).where(eq(practiceSession.boardId, P.id));
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
  await withBoard(Q.id, async (tx: Tx) => {
    await tx.delete(subTopic).where(eq(subTopic.boardId, Q.id));
    await tx.delete(topic).where(eq(topic.boardId, Q.id));
    await tx.delete(chapter).where(eq(chapter.boardId, Q.id));
    await tx.delete(subject).where(eq(subject.boardId, Q.id));
  });
  void fxQ;
  for (const u of [tut, tut2, stuA, stuB, stuC]) await db.delete(appUser).where(eq(appUser.id, u.id));
  await db.delete(board).where(eq(board.id, P.id));
  await db.delete(board).where(eq(board.id, Q.id));

  console.log(`\nprobe_authoring_chat: ${passed} passed, ${failed} failed`);
  await queryClient.end();
  process.exit(failed === 0 ? 0 : 1);
}

main().catch(async (err) => {
  console.error("probe_authoring_chat FAILED:", err);
  await queryClient.end();
  process.exit(1);
});
