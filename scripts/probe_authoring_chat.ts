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
  authoringChat,
  authoringWorker,
  board,
  chapter,
  eventLog,
  learningObjective,
  masteryState,
  observation,
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
  authorFromChat,
  AuthoringChatNotFoundError,
  getChat,
  parseAuthorMarker,
  proposeTarget,
  ProposeTargetError,
  reviseDraft,
  sendTurn,
  startChat,
  stripAuthorMarker,
  hasAuthorSentinel,
  stripAuthorSentinel,
  SubTopicNotFoundError,
} from "../src/services/authoring_chat";
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
    return {
      chapterId: chap!.id,
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
    return { subTopicId: st!.id };
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
