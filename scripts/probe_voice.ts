/**
 * probe_voice — Slice VOICE-1 exit gate (voice tutoring backend spine).
 *
 * Real Gemini + real DB + real RLS, throwaway fixture (boards P/Q, M22) with
 * full cleanup. Two-tier (build-discipline: don't over-read one AI response):
 *   FIRM — plumbing we control: grounding resolved into the system prompt,
 *     session row lifecycle, transcript persisted, analysis stamped + event
 *     logged, BLIND (no mastery), ownership guard, no-voice-context reject,
 *     cross-board RLS, unknown session, idempotent re-end.
 *   SOFT — the model's analysis content (summary / topics / student questions):
 *     assert it's structurally valid + LOG it, never fail on the LLM's wording.
 *
 *   1. DB connectivity.
 *   2. startSession(st1) → active row + systemPrompt carries the grounding.
 *   3. the voice_session row exists (status active, mode overview).
 *   4. endSession(st1, canned transcript) → status completed + analysis present.
 *   5. transcript row persisted (kind voice_tutoring, turn count matches).
 *   6. voice_session stamped: completed + transcriptId + analysis + endedAt.
 *   7. event_log 'voice_session' row: student/subTopic/turnCount/analysisPresent.
 *   8. BLIND: no mastery_state row written.
 *   9. OWNERSHIP: student B ending A's session → VOICE_SESSION_NOT_FOUND.
 *  10. no voice_context on the slide → NO_VOICE_CONTEXT.
 *  11. RLS: start on a P sub_topic under board Q → SLIDE_NOT_FOUND.
 *  12. unknown session id → VOICE_SESSION_NOT_FOUND.
 *  13. IDEMPOTENT: re-end a completed session → no second transcript row.
 */
import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import type { PgTransaction } from "drizzle-orm/pg-core";
import {
  appUser,
  board,
  chapter,
  contentUnit,
  contentVersion,
  eventLog,
  masteryState,
  subTopic,
  subject,
  topic,
  transcript,
  voiceSession,
} from "@b2c/kernel/schema";
import { db, queryClient } from "../src/db/client";
import { withBoard } from "../src/db/with-board";
import { __aiConfigured } from "../src/services/ai/gemini";
import { SlideNotFoundError } from "../src/services/revision";
import {
  endVoiceSession,
  startVoiceSession,
  VoiceContextMissingError,
  VoiceSessionNotFoundError,
} from "../src/services/voice";

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

const VOICE_CONTEXT_TEXT =
  "A force is a push or a pull that can change an object's speed, direction, or shape. The newton (N) is the unit of force. Balanced forces produce no change in motion; unbalanced forces cause acceleration in the direction of the resultant force.";

// A realistic overview session: tutor explains the slide, student asks one thing.
const TRANSCRIPT = [
  { role: "tutor" as const, text: "Let's look at forces. A force is just a push or a pull — it can speed something up, slow it down, change its direction, or change its shape. Does that make sense so far?" },
  { role: "student" as const, text: "Yeah. What unit do we measure force in?" },
  { role: "tutor" as const, text: "Great question — force is measured in newtons, written with a capital N. And here's the key idea: if the forces on an object are balanced, its motion doesn't change. If they're unbalanced, the object accelerates in the direction of the bigger force." },
  { role: "student" as const, text: "So balanced forces mean it just stays still or keeps going the same?" },
  { role: "tutor" as const, text: "Exactly right. Balanced means no change in motion. Well done." },
];

async function main() {
  if (!__aiConfigured()) {
    console.error("GEMINI_API_KEY not set — VOICE-1 probe needs the real vendor.");
    await queryClient.end();
    process.exit(1);
  }

  const tag = `${Date.now()}`;
  await db.execute(sql`select 1`);
  check("DB connectivity (select 1) as app role", true);

  const [P] = await db.insert(board).values({ slug: `voice-p-${tag}`, name: "Probe P" }).returning();
  const [Q] = await db.insert(board).values({ slug: `voice-q-${tag}`, name: "Probe Q" }).returning();
  if (!P || !Q) throw new Error("board seed failed");

  const emailA = `voice-a-${tag}@example.com`;
  const emailB = `voice-b-${tag}@example.com`;
  const [stuA] = await db.insert(appUser).values({ email: emailA, name: "Stu A", userType: "student" }).returning();
  const [stuB] = await db.insert(appUser).values({ email: emailB, name: "Stu B", userType: "student" }).returning();
  if (!stuA || !stuB) throw new Error("app_user seed failed");

  // Fixture under P: spine + a slide_module content_version whose manifest has
  // one slide WITH voice_context (slide-1 → st1) and one WITHOUT (slide-2 → st2).
  const fx = await withBoard(P.id, async (tx: Tx) => {
    const [subj] = await tx.insert(subject).values({ boardId: P.id, slug: "phys", name: "Physics", grade: "IGCSE" }).returning();
    const [chap] = await tx.insert(chapter).values({ boardId: P.id, subjectId: subj!.id, slug: "forces", name: "Forces & Motion", ordinal: 1 }).returning();
    const [tp] = await tx.insert(topic).values({ boardId: P.id, chapterId: chap!.id, slug: "forces-basics", name: "Forces basics", ordinal: 1 }).returning();
    const [st1] = await tx.insert(subTopic).values({ boardId: P.id, topicId: tp!.id, slug: "what-is-a-force", name: "What is a force", ordinal: 1, contentSlideKey: "slide-1" }).returning();
    const [st2] = await tx.insert(subTopic).values({ boardId: P.id, topicId: tp!.id, slug: "no-voice-slide", name: "No voice slide", ordinal: 2, contentSlideKey: "slide-2" }).returning();

    const manifest = {
      module_id: "forces_mod",
      sections: [
        {
          id: "sec1",
          topics: [
            { id: "slide-1", title: "What is a force?", voice_context: { context: VOICE_CONTEXT_TEXT, keywords: ["force", "newton", "balanced", "unbalanced", "acceleration"] } },
            { id: "slide-2", title: "A slide with no voice grounding" }, // no voice_context
          ],
        },
      ],
    };

    const [unit] = await tx.insert(contentUnit).values({ boardId: P.id, type: "slide_module", chapterId: chap!.id, subTopicId: null, source: "starkhorn" }).returning();
    const [ver] = await tx.insert(contentVersion).values({ contentUnitId: unit!.id, versionNo: 1, body: { manifest }, publishedAt: new Date() }).returning();
    await tx.update(contentUnit).set({ currentVersionId: ver!.id }).where(eq(contentUnit.id, unit!.id));

    return { st1: st1!.id, st2: st2!.id, unitId: unit!.id };
  });

  // 2 + 3. startSession → grounded prompt + active row
  const started = await withBoard(P.id, (tx: Tx) =>
    startVoiceSession(tx, { boardId: P.id, appUserId: stuA.id, subTopicId: fx.st1, mode: "overview" }),
  );
  check("startSession → status active + mode overview", started.status === "active" && started.mode === "overview");
  check("systemPrompt carries the slide title", started.systemPrompt.includes("What is a force?"));
  check("systemPrompt carries the voice_context grounding text", started.systemPrompt.includes("A force is a push or a pull"));
  check("systemPrompt carries the domain keywords", started.systemPrompt.includes("newton"));

  const rows0 = await withBoard(P.id, (tx: Tx) => tx.select().from(voiceSession).where(eq(voiceSession.id, started.sessionId)));
  check("voice_session row created (active, linked to student + sub_topic)", rows0.length === 1 && rows0[0]!.status === "active" && rows0[0]!.studentId === stuA.id && rows0[0]!.subTopicId === fx.st1);

  // 4. endSession → completed + analysis
  const ended = await withBoard(P.id, (tx: Tx) =>
    endVoiceSession(tx, { boardId: P.id, appUserId: stuA.id, sessionId: started.sessionId, transcript: TRANSCRIPT }),
  );
  check("endSession → status completed", ended.status === "completed");
  const analysis: any = ended.analysis;
  check("analysis present + structurally valid (summary + arrays)", !!analysis && typeof analysis.summary === "string" && Array.isArray(analysis.topicsCovered) && Array.isArray(analysis.studentQuestions));
  soft("analysis.summary", analysis?.summary);
  soft("analysis.topicsCovered", analysis?.topicsCovered);
  soft("analysis.studentQuestions", analysis?.studentQuestions);

  // 5. transcript persisted
  const trs = await withBoard(P.id, (tx: Tx) => tx.select().from(transcript).where(eq(transcript.subTopicId, fx.st1)));
  const voiceTrs = trs.filter((t: any) => t.kind === "voice_tutoring");
  check("transcript row persisted (kind voice_tutoring)", voiceTrs.length === 1);
  check("transcript body.turns matches the session turns", (voiceTrs[0]?.body as any)?.turns?.length === TRANSCRIPT.length);

  // 6. voice_session stamped
  const rows1 = await withBoard(P.id, (tx: Tx) => tx.select().from(voiceSession).where(eq(voiceSession.id, started.sessionId)));
  const vs: any = rows1[0];
  check("voice_session stamped: completed + transcriptId + analysis + endedAt", vs?.status === "completed" && !!vs?.transcriptId && !!vs?.analysis && !!vs?.endedAt);

  // 7. event_log
  const evs = await withBoard(P.id, (tx: Tx) => tx.select().from(eventLog).where(eq(eventLog.subTopicId, fx.st1)));
  const voiceEv: any = evs.find((e: any) => e.eventType === "voice_session");
  check("event_log 'voice_session' row written", !!voiceEv);
  check("event_log payload: student + turnCount + analysisPresent", voiceEv?.studentId === stuA.id && voiceEv?.payload?.turnCount === TRANSCRIPT.length && voiceEv?.payload?.analysisPresent === true);

  // 8. BLIND — no mastery move
  const mastery = await withBoard(P.id, (tx: Tx) => tx.select().from(masteryState).where(eq(masteryState.studentId, stuA.id)));
  check("BLIND: no mastery_state row written by voice", mastery.length === 0);

  // 9. OWNERSHIP — student B ends A's session
  const startedForOwn = await withBoard(P.id, (tx: Tx) =>
    startVoiceSession(tx, { boardId: P.id, appUserId: stuA.id, subTopicId: fx.st1, mode: "overview" }),
  );
  let owned = false;
  try {
    await withBoard(P.id, (tx: Tx) =>
      endVoiceSession(tx, { boardId: P.id, appUserId: stuB.id, sessionId: startedForOwn.sessionId, transcript: TRANSCRIPT }),
    );
  } catch (e) {
    owned = e instanceof VoiceSessionNotFoundError;
  }
  check("OWNERSHIP: student B ending A's session → VOICE_SESSION_NOT_FOUND", owned);

  // 10. no voice_context → NO_VOICE_CONTEXT
  let noVc = false;
  try {
    await withBoard(P.id, (tx: Tx) => startVoiceSession(tx, { boardId: P.id, appUserId: stuA.id, subTopicId: fx.st2 }));
  } catch (e) {
    noVc = e instanceof VoiceContextMissingError;
  }
  check("slide with no voice_context → NO_VOICE_CONTEXT", noVc);

  // 11. RLS cross-board — P sub_topic under Q
  let rls = false;
  try {
    await withBoard(Q.id, (tx: Tx) => startVoiceSession(tx, { boardId: Q.id, appUserId: stuA.id, subTopicId: fx.st1 }));
  } catch (e) {
    rls = e instanceof SlideNotFoundError;
  }
  check("RLS: start on a P sub_topic under board Q → SLIDE_NOT_FOUND", rls);

  // 12. unknown session
  let unknown = false;
  try {
    await withBoard(P.id, (tx: Tx) => endVoiceSession(tx, { boardId: P.id, appUserId: stuA.id, sessionId: randomUUID(), transcript: TRANSCRIPT }));
  } catch (e) {
    unknown = e instanceof VoiceSessionNotFoundError;
  }
  check("unknown session id → VOICE_SESSION_NOT_FOUND", unknown);

  // 13. IDEMPOTENT re-end — the first session is already completed
  const trBefore = (await withBoard(P.id, (tx: Tx) => tx.select().from(transcript).where(eq(transcript.subTopicId, fx.st1)))).length;
  const reEnded = await withBoard(P.id, (tx: Tx) =>
    endVoiceSession(tx, { boardId: P.id, appUserId: stuA.id, sessionId: started.sessionId, transcript: TRANSCRIPT }),
  );
  const trAfter = (await withBoard(P.id, (tx: Tx) => tx.select().from(transcript).where(eq(transcript.subTopicId, fx.st1)))).length;
  check("IDEMPOTENT: re-ending a completed session returns completed", reEnded.status === "completed");
  check(`IDEMPOTENT: no second transcript row (${trBefore}→${trAfter})`, trBefore === trAfter);

  // ── cleanup (FK-safe) ──
  await withBoard(P.id, async (tx: Tx) => {
    await tx.delete(voiceSession).where(eq(voiceSession.boardId, P.id));
    await tx.delete(eventLog).where(eq(eventLog.boardId, P.id));
    await tx.delete(transcript).where(eq(transcript.boardId, P.id));
    await tx.delete(contentVersion).where(eq(contentVersion.contentUnitId, fx.unitId));
    await tx.delete(contentUnit).where(eq(contentUnit.boardId, P.id));
    await tx.delete(subTopic).where(eq(subTopic.boardId, P.id));
    await tx.delete(topic).where(eq(topic.boardId, P.id));
    await tx.delete(chapter).where(eq(chapter.boardId, P.id));
    await tx.delete(subject).where(eq(subject.boardId, P.id));
  });
  await db.delete(appUser).where(eq(appUser.email, emailA));
  await db.delete(appUser).where(eq(appUser.email, emailB));
  await db.delete(board).where(eq(board.id, P.id));
  await db.delete(board).where(eq(board.id, Q.id));

  console.log(`\nprobe_voice: ${passed} passed, ${failed} failed`);
  await queryClient.end();
  process.exit(failed === 0 ? 0 : 1);
}

main().catch(async (err) => {
  console.error("probe_voice FAILED:", err);
  await queryClient.end();
  process.exit(1);
});
