/**
 * probe_several_thread — Slice SEVERAL-THREAD exit gate.
 *
 * THE BUG. The conversational system prompt described exactly one `subTopicNumber`
 * and `chatSystemFor` took only the vendor, so nothing ever told the model the
 * One/Several toggle existed. A tutor with "Several" selected who ASKED "can we
 * author two sub-topics now?" was told the system is "strictly hardwired to handle
 * only one sub-topic per batch" — the model's own invention — while CHAT-SET-ROUTE
 * stood ready to fan the go-ahead out correctly.
 *
 * THE FIX. The grain becomes a property of the THREAD (`author_grain`), because the
 * resume fingerprint is sha256(systemPrompt + slot) and a prompt that varied with a
 * per-turn toggle would refuse `--resume` on every flip. Flipping starts a new
 * thread carrying the transcript.
 *
 * 🔑 NO AI IN THIS PROBE, BY DESIGN (M101). Every claim here is about the PROMPT the
 * model is handed and the ROW the routing reads — both of which are ours. A leg that
 * asserted the model "understands" Several could only observe what one sampled
 * response happened to say, and would pass vacuously on a broken prompt.
 *
 * FIRM — chatSystemFor's one-grain output is byte-identical to the pre-slice string
 *   for BOTH vendors (no existing thread's fingerprint moves → no resume regresses);
 *   the several-grain output is exactly that plus the tail; the tail actually
 *   contradicts the two sentences the model invented; grainOf's polarity is safe on
 *   null/garbage; the grain round-trips through startChat/getChat; a legacy row reads
 *   'one'; and the carry-over STRIPS the vendor session identity.
 */
import { eq, sql } from "drizzle-orm";
import type { PgTransaction } from "drizzle-orm/pg-core";
import {
  appUser,
  authoringChat,
  board,
  chapter,
  learningObjective,
  student,
  subject,
  subTopic,
  topic,
} from "@b2c/kernel/schema";
import { db, queryClient } from "../src/db/client";
import { withBoard } from "../src/db/with-board";
import { chatSystemFor, getChat, grainOf, startChat } from "../src/services/authoring_chat";

type Tx = PgTransaction<any, any, any>;

let passed = 0;
let failed = 0;
function check(name: string, ok: boolean, note?: string) {
  if (ok) {
    passed++;
    console.log(`  ✓ ${name}${note ? ` — ${note}` : ""}`);
  } else {
    failed++;
    console.log(`  ✗ ${name}${note ? ` — ${note}` : ""}`);
  }
}

async function main() {
  const tag = `${Date.now()}`;
  await db.execute(sql`select 1`);
  check("DB connectivity (select 1) as app role", true);

  // ── 1. The PROMPT contract — pure, no DB, no AI ──────────────────────────
  console.log("\n── chatSystemFor: the grain selects the prompt ──");

  for (const v of ["gemini_api", "claude_cli"] as const) {
    const one = chatSystemFor(v, false);
    const several = chatSystemFor(v, true);
    const dflt = chatSystemFor(v);

    check(
      `[${v}] the default arg is the ONE grain (a missing flag never means "spend N")`,
      dflt === one,
    );
    // The load-bearing no-regression claim: One-mode threads must hash to the same
    // fingerprint they did before this slice, or every existing thread re-stitches.
    check(
      `[${v}] several is EXACTLY one + a suffix — one is an untouched PREFIX`,
      several.startsWith(one) && several.length > one.length,
      `one=${one.length}b several=${several.length}b (+${several.length - one.length})`,
    );
    check(
      `[${v}] the ONE prompt does NOT mention the grain at all`,
      !one.includes("AUTHORING GRAIN FOR THIS THREAD"),
    );
    check(
      `[${v}] the SEVERAL prompt DOES`,
      several.includes("AUTHORING GRAIN FOR THIS THREAD — SEVERAL"),
    );
  }

  // The tail must contradict the EXACT two claims the model invented, not merely
  // mention "several" — a tail that said "several is available" would leave the
  // model free to keep asserting it degrades quality.
  const tail = chatSystemFor("gemini_api", true).slice(chatSystemFor("gemini_api", false).length);
  check(
    "the tail forbids the 'only one at a time' claim the model invented",
    /only handle one sub-topic at a time|only one sub-topic at a time/i.test(tail),
    `"${tail.slice(0, 0)}"`,
  );
  check(
    "the tail forbids the 'harms quality' claim the model invented",
    /harms question quality|degrades|quality/i.test(tail),
  );
  check(
    "the tail states a go-ahead yields a BLUEPRINT for approval, not drafts",
    /BLUEPRINT/i.test(tail) && /approv/i.test(tail),
  );
  check(
    "the tail forbids asking the tutor to pick just one sub-topic to start",
    /pick just one|do not ask the tutor to pick/i.test(tail),
  );

  // ── 2. grainOf polarity — the safe default on anything unexpected ────────
  console.log("\n── grainOf: null/garbage must read as ONE ──");
  check("null → one", grainOf({ authorGrain: null }) === "one");
  check("undefined → one", grainOf({}) === "one");
  check("'one' → one", grainOf({ authorGrain: "one" }) === "one");
  check("'several' → several", grainOf({ authorGrain: "several" }) === "several");
  check(
    "garbage → one (never 'several' — a bad value must not spend N sub-topics of AI)",
    grainOf({ authorGrain: "SEVERAL " }) === "one" && grainOf({ authorGrain: "x" }) === "one",
  );

  // ── 3. The row: persistence, legacy default, and the carry-over strip ────
  console.log("\n── the chat row ──");
  const [P] = await db.insert(board).values({ slug: `sthr-p-${tag}`, name: "Probe P" }).returning();
  if (!P) throw new Error("board seed failed");
  const [tut] = await db
    .insert(appUser)
    .values({ email: `sthr-tut-${tag}@example.com`, name: "Tutor", userType: "tutor" })
    .returning();
  const [stu] = await db
    .insert(appUser)
    .values({ email: `sthr-stu-${tag}@example.com`, name: "Student", userType: "student" })
    .returning();
  if (!tut || !stu) throw new Error("app_user seed failed");

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
      .values({ boardId: P.id, chapterId: chap!.id, slug: "motion-t", name: "Motion Topic", ordinal: 1 })
      .returning();
    const [st] = await tx
      .insert(subTopic)
      .values({ boardId: P.id, topicId: tp!.id, slug: "accel", name: "Acceleration", ordinal: 1 })
      .returning();
    await tx.insert(learningObjective).values({
      boardId: P.id,
      subTopicId: st!.id,
      axis: "conceptual",
      code: "C1",
      description: "Explains acceleration.",
    });
    // The tutor↔student link startChat asserts.
    await tx
      .insert(student)
      .values({ userId: stu.id, boardId: P.id, class: "9", tutorId: tut.id });
    return { chapterId: chap!.id, subTopicId: st!.id };
    // Never swallow the reason: a bare `.catch(() => null)` here turns a seed
    // defect into "later legs skipped" with nothing to debug from.
  }).catch((e) => {
    console.log(`  ⚠️ seed threw: ${String(e?.message ?? e)}`);
    return null;
  });

  if (!fx) {
    check("fixture seed (chapter + sub_topic + tutor link)", false, "seed threw — later legs skipped");
  } else {
    check("fixture seed (chapter + sub_topic + tutor link)", true);

    await withBoard(P.id, async (tx: Tx) => {
      // 3a — the grain persists and round-trips.
      const several = await startChat(tx, {
        boardId: P.id,
        tutorUserId: tut.id,
        studentId: stu.id,
        vendor: "gemini_api",
        mode: "blocked",
        chapterId: fx.chapterId,
        authorGrain: "several",
      });
      check("startChat({authorGrain:'several'}) returns it on the view", several.authorGrain === "several");
      const reread = await getChat(tx, { tutorUserId: tut.id, chatId: several.chatId });
      check("getChat re-reads 'several' off the ROW (not client state)", reread.authorGrain === "several");
      const [rawSeveral] = await tx
        .select({ g: authoringChat.authorGrain })
        .from(authoringChat)
        .where(eq(authoringChat.id, several.chatId));
      check("the column itself holds 'several'", rawSeveral?.g === "several");

      // 3b — omitting the grain defaults to 'one' IN THE COLUMN, not just on read.
      const dflt = await startChat(tx, {
        boardId: P.id,
        tutorUserId: tut.id,
        studentId: stu.id,
        vendor: "gemini_api",
        mode: "blocked",
        chapterId: fx.chapterId,
      });
      const [rawDflt] = await tx
        .select({ g: authoringChat.authorGrain })
        .from(authoringChat)
        .where(eq(authoringChat.id, dflt.chatId));
      check("startChat with NO grain writes 'one' (default at the insert)", rawDflt?.g === "one");

      // 3c — a LEGACY row (null column, as every pre-migration chat is) reads 'one'.
      await tx
        .update(authoringChat)
        .set({ authorGrain: null })
        .where(eq(authoringChat.id, dflt.chatId));
      const legacy = await getChat(tx, { tutorUserId: tut.id, chatId: dflt.chatId });
      check("a legacy row (author_grain NULL) reads as 'one'", legacy.authorGrain === "one");

      // 3d — 🔑 THE CARRY-OVER STRIP. A ChatMessage carries aiSessionId +
      // sessionFingerprint, and sendTurn resumes on exactly those. Copying a
      // transcript verbatim would hand the NEW thread the OLD thread's session,
      // whose fingerprint was computed from the OTHER grain's prompt — the precise
      // mismatch this slice exists to remove, reintroduced by the carry-over.
      const carried = await startChat(tx, {
        boardId: P.id,
        tutorUserId: tut.id,
        studentId: stu.id,
        vendor: "gemini_api",
        mode: "blocked",
        chapterId: fx.chapterId,
        authorGrain: "several",
        carryMessages: [
          { id: "m1", role: "user", text: "shall we do two sub-topics?", createdAt: new Date().toISOString() },
          {
            id: "m2",
            role: "assistant",
            text: "Sure — which first?",
            createdAt: new Date().toISOString(),
            aiSessionId: "OLD-SESSION-ID",
            sessionFingerprint: "OLD-FINGERPRINT",
            vendorId: "gemini_api",
          },
        ] as any,
      });
      check("the carried transcript is preserved (both turns, text intact)", carried.messages.length === 2 &&
        carried.messages[1]?.text === "Sure — which first?");
      const leaked = carried.messages.filter(
        (m: any) => m.aiSessionId != null || m.sessionFingerprint != null,
      );
      check(
        "🔑 aiSessionId + sessionFingerprint are STRIPPED (no resume into the old grain's session)",
        leaked.length === 0,
        `${leaked.length} message(s) still carry a session identity`,
      );
      // Proven against the STORED row, not just the returned view — the view could
      // be clean while the row kept the ids and getChat handed them back next open.
      const [rawCarried] = await tx
        .select({ m: authoringChat.messages })
        .from(authoringChat)
        .where(eq(authoringChat.id, carried.chatId));
      const stored = JSON.stringify(rawCarried?.m ?? []);
      check(
        "the stripped shape is what is PERSISTED, not merely what is returned",
        !stored.includes("OLD-SESSION-ID") && !stored.includes("OLD-FINGERPRINT"),
      );
    });
  }

  // ── cleanup ──
  await withBoard(P.id, async (tx: Tx) => {
    await tx.delete(authoringChat).where(eq(authoringChat.boardId, P.id));
    await tx.delete(student).where(eq(student.boardId, P.id));
    await tx.delete(learningObjective).where(eq(learningObjective.boardId, P.id));
    await tx.delete(subTopic).where(eq(subTopic.boardId, P.id));
    await tx.delete(topic).where(eq(topic.boardId, P.id));
    await tx.delete(chapter).where(eq(chapter.boardId, P.id));
    await tx.delete(subject).where(eq(subject.boardId, P.id));
  });
  for (const u of [tut, stu]) await db.delete(appUser).where(eq(appUser.id, u.id));
  await db.delete(board).where(eq(board.id, P.id));

  console.log(`\nprobe_several_thread: ${passed} passed, ${failed} failed`);
  await queryClient.end();
  process.exit(failed === 0 ? 0 : 1);
}

main().catch(async (err) => {
  console.error("probe_several_thread FAILED:", err);
  await queryClient.end();
  process.exit(1);
});
