/**
 * probe_pipecat_start — Slice VOICE-A0 exit gate (Pipecat orchestrator).
 *
 * Proves the D2 → Option A start path: assemble the bot config from the OWNED
 * mode prompts + slide grounding, then create a real session on Pipecat Cloud.
 *
 * Two tiers (probe-driven-dev):
 *   DETERMINISTIC (always): the pure config assembly + prompt template injection
 *   are exact and per-mode — no network. This is the FIRM part.
 *   REAL (when configured): one real POST to Pipecat Cloud → assert 200 + the
 *     {dailyRoom,dailyToken} shape + the persisted voice_session row. This is the
 *     whole point of A0 (de-risk the black-box bot early, M32) and it SPENDS one
 *     billable session on the founder's Pipecat/Daily accounts. If the creds are
 *     absent the kill switch is asserted instead and the real leg is skipped.
 *
 * Throwaway board (M22) so canonical seeds stay pristine; cleans up after itself.
 */
import { eq, sql } from "drizzle-orm";
import type { PgTransaction } from "drizzle-orm/pg-core";
import {
  appUser,
  board,
  chapter,
  contentUnit,
  contentVersion,
  subTopic,
  subject,
  topic,
  voiceSession,
} from "@b2c/kernel/schema";
import { db, queryClient } from "../src/db/client";
import { withBoard } from "../src/db/with-board";
import {
  assembleVoiceConfig,
  buildSystemPrompt,
  startPipecatVoiceSession,
  VoicePipecatNotConfiguredError,
  voicePipecatConfigured,
} from "../src/services/voice_pipecat";
import { VoiceContextMissingError } from "../src/services/voice";
import { SlideNotFoundError } from "../src/services/revision";

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

const SLIDE_ID = "slide_vc_1";
const VC_CONTEXT = "A mixture is two or more substances physically combined.";
const VC_KEYWORDS = ["mixture", "solution", "solute"];

// Real-shape manifest: sections[].topics[].id === content_slide_key. SLIDE_ID
// carries a voice_context (getVoiceGrounding returns non-null). `slide_no_vc` is
// PUBLISHED but has no voice_context → the VoiceContextMissingError gate. A key
// absent from the manifest entirely (`slide_absent`) is a different gate
// (SlideNotFoundError) — the two are distinct and both must hold.
function manifest() {
  return {
    contractVersion: "1",
    sections: [
      {
        id: "sec1",
        title: "Sec 1",
        topics: [
          {
            id: SLIDE_ID,
            title: "Mixtures",
            voice_context: { context: VC_CONTEXT, keywords: VC_KEYWORDS },
          },
          { id: "slide_no_vc", title: "No VC" },
        ],
      },
    ],
  };
}

async function main() {
  await db.execute(sql`select 1`);
  check("DB connectivity (select 1) as app role", true);

  // ── Tier 1: DETERMINISTIC config + prompt assembly (no network) ────────────
  const cfg = assembleVoiceConfig({
    sessionId: "sid-1",
    mode: "overview",
    systemPrompt: "SYS-PROMPT",
    voiceContext: "VC-BLURB",
    keywords: ["k1", "k2"],
    studentName: "Asha",
    webhookDomain: "example.com",
  });
  check("config.session_id is the correlation id", cfg.session_id === "sid-1");
  check("config.system_prompt passed through", cfg.system_prompt === "SYS-PROMPT");
  check(
    "config.context_messages = [{system, voice_context}]",
    cfg.context_messages.length === 1 &&
      cfg.context_messages[0]!.role === "system" &&
      cfg.context_messages[0]!.content === "VC-BLURB",
  );
  check(
    "config.tools = [whiteboard, end_session]",
    JSON.stringify(cfg.tools) === JSON.stringify(["whiteboard", "end_session"]),
  );
  check(
    "config.stt_keywords carries the domain keywords",
    JSON.stringify(cfg.stt_keywords) === JSON.stringify(["k1", "k2"]),
  );
  check(
    "config.webhook_url = https://{domain}/voice/webhook",
    cfg.webhook_url === "https://example.com/voice/webhook",
  );
  check("config.student_name injected", cfg.student_name === "Asha");
  check("config.mode carried", cfg.mode === "overview");
  check("config.idle_timeout = 120 (prod parity)", cfg.idle_timeout === 120);
  check(
    "config.llm_thinking_level = minimal (prod parity)",
    cfg.llm_thinking_level === "minimal",
  );

  // owned prompt files load + inject the three template vars, per mode
  const ov = await buildSystemPrompt("overview", {
    studentName: "Asha",
    topicTitle: "Mixtures",
    voiceContext: "Salt dissolves in water.",
  });
  check("overview prompt: student_name injected", ov.includes("Asha"));
  check("overview prompt: topic_title injected", ov.includes("Mixtures"));
  check("overview prompt: voice_context injected", ov.includes("Salt dissolves in water."));
  check("overview prompt: no unresolved {{ }} placeholders", !ov.includes("{{"));

  const tb = await buildSystemPrompt("teach_back", {
    studentName: "Asha",
    topicTitle: "Mixtures",
    voiceContext: "Salt dissolves in water.",
  });
  check(
    "teach_back prompt: the assessing-not-tutoring opening is present",
    tb.includes("teach me about") && tb.includes("Asha"),
  );
  check("teach_back prompt: no unresolved {{ }} placeholders", !tb.includes("{{"));

  // ── Fixture for the real/gate legs ─────────────────────────────────────────
  const tag = `${Date.now()}`;
  const [P] = await db
    .insert(board)
    .values({ slug: `vpc-p-${tag}`, name: "Probe VPC" })
    .returning();
  if (!P) throw new Error("board seed failed");
  const [student] = await db
    .insert(appUser)
    .values({ email: `vpc-s-${tag}@example.com`, name: "Probe Asha" })
    .returning();
  if (!student) throw new Error("student seed failed");

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
        slug: "ch",
        name: "Ch",
        ordinal: 1,
        contentModuleKey: "mod",
      })
      .returning();
    const [tp] = await tx
      .insert(topic)
      .values({ boardId: P.id, chapterId: chap!.id, slug: "tp", name: "Tp", ordinal: 1 })
      .returning();
    // stA: published slide WITH voice_context. stB: published slide with NO
    // voice_context. stC: content_slide_key not in the manifest at all.
    const [stA] = await tx
      .insert(subTopic)
      .values({ boardId: P.id, topicId: tp!.id, slug: "sta", name: "ST A", ordinal: 1, contentSlideKey: SLIDE_ID })
      .returning();
    const [stB] = await tx
      .insert(subTopic)
      .values({ boardId: P.id, topicId: tp!.id, slug: "stb", name: "ST B", ordinal: 2, contentSlideKey: "slide_no_vc" })
      .returning();
    const [stC] = await tx
      .insert(subTopic)
      .values({ boardId: P.id, topicId: tp!.id, slug: "stc", name: "ST C", ordinal: 3, contentSlideKey: "slide_absent" })
      .returning();
    const [unit] = await tx
      .insert(contentUnit)
      .values({ boardId: P.id, type: "slide_module", chapterId: chap!.id, subTopicId: null, source: "starkhorn" })
      .returning();
    const [v1] = await tx
      .insert(contentVersion)
      .values({
        contentUnitId: unit!.id,
        versionNo: 1,
        body: { contractVersion: "1", manifest: manifest(), bundle: "/* probe */" },
        publishedAt: new Date(),
      })
      .returning();
    await tx.update(contentUnit).set({ currentVersionId: v1!.id }).where(eq(contentUnit.id, unit!.id));
    return { stA: stA!.id, stB: stB!.id, stC: stC!.id, unitId: unit!.id };
  });

  // Gate 1: a published slide with no voice_context → VoiceContextMissingError
  // (prod gated the button on it). Throws BEFORE any Pipecat call.
  let noVcThrew = false;
  try {
    await withBoard(P.id, (tx) =>
      startPipecatVoiceSession(tx, { boardId: P.id, appUserId: student.id, subTopicId: fx.stB, mode: "overview" }),
    );
  } catch (e) {
    noVcThrew = e instanceof VoiceContextMissingError;
  }
  check("published slide, no voice_context → VoiceContextMissingError (BAD_REQUEST gate)", noVcThrew);

  // Gate 2: a content_slide_key absent from the manifest → SlideNotFoundError
  // (a distinct NOT_FOUND gate). Also throws before any Pipecat call.
  let notFoundThrew = false;
  try {
    await withBoard(P.id, (tx) =>
      startPipecatVoiceSession(tx, { boardId: P.id, appUserId: student.id, subTopicId: fx.stC, mode: "overview" }),
    );
  } catch (e) {
    notFoundThrew = e instanceof SlideNotFoundError;
  }
  check("unpublished slide key → SlideNotFoundError (NOT_FOUND gate)", notFoundThrew);

  // ── Tier 2: REAL Pipecat Cloud session (or the kill switch) ────────────────
  if (!voicePipecatConfigured()) {
    console.log("  … Pipecat not configured — asserting the kill switch, skipping the real leg");
    let killed = false;
    try {
      await withBoard(P.id, (tx) =>
        startPipecatVoiceSession(tx, {
          boardId: P.id,
          appUserId: student.id,
          subTopicId: fx.stA,
          mode: "overview",
        }),
      );
    } catch (e) {
      killed = e instanceof VoicePipecatNotConfiguredError;
    }
    check("unconfigured → VoicePipecatNotConfiguredError (kill switch, no boot dependency)", killed);
  } else {
    console.log("  … creating ONE real Pipecat Cloud session (billable — founder accounts)");
    const res = await withBoard(P.id, (tx) =>
      startPipecatVoiceSession(tx, {
        boardId: P.id,
        appUserId: student.id,
        subTopicId: fx.stA,
        mode: "overview",
      }),
    );
    check("real start → roomUrl is an https Daily room", /^https:\/\//.test(res.roomUrl));
    check("real start → token returned (owner join)", res.token.length > 0);
    check("real start → sessionId is a uuid", /^[0-9a-f-]{36}$/i.test(res.sessionId));
    check("real start → mode echoed", res.mode === "overview");

    // the voice_session row persisted under the correlation id (A1 correlates on it)
    const [row] = await withBoard(P.id, (tx) =>
      tx.select().from(voiceSession).where(eq(voiceSession.id, res.sessionId)).limit(1),
    );
    check("voice_session row persisted with the correlation id", !!row && row.id === res.sessionId);
    check("row status = active", row?.status === "active");
    check("row mode = overview", row?.mode === "overview");
    check("row attributed to the caller + slide", row?.studentId === student.id && row?.subTopicId === fx.stA);
  }

  // ── Cleanup (throwaway fixture) ────────────────────────────────────────────
  await withBoard(P.id, async (tx: Tx) => {
    await tx.delete(voiceSession).where(eq(voiceSession.boardId, P.id));
    await tx.delete(contentVersion).where(eq(contentVersion.contentUnitId, fx.unitId));
    await tx.delete(contentUnit).where(eq(contentUnit.boardId, P.id));
    await tx.delete(subTopic).where(eq(subTopic.boardId, P.id));
    await tx.delete(topic).where(eq(topic.boardId, P.id));
    await tx.delete(chapter).where(eq(chapter.boardId, P.id));
    await tx.delete(subject).where(eq(subject.boardId, P.id));
  });
  await db.delete(appUser).where(eq(appUser.id, student.id));
  await db.delete(board).where(eq(board.id, P.id));

  console.log(`\nprobe_pipecat_start: ${passed} passed, ${failed} failed`);
  await queryClient.end();
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
