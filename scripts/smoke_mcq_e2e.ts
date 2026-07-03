/**
 * smoke_mcq_e2e — Slice MCQ-EV over the REAL HTTP/superjson wire (not the
 * in-process service): dev-login cookie → tRPC context → withBoard → the
 * checkAnswer mutation. Proves the FE's exact call (superjson mutation carrying
 * timeMs) grades against real content AND records the event_log row through the
 * real transport. Throwaway board + slide-module content + identity (M22), full
 * cleanup. Server must be up (:PORT).
 */
import { and, eq } from "drizzle-orm";
import type { PgTransaction } from "drizzle-orm/pg-core";
import {
  appUser, board, chapter, contentUnit, contentVersion, eventLog,
  membership, subTopic, subject, topic, whitelist,
} from "@b2c/kernel/schema";
import { db, queryClient } from "../src/db/client";
import { withBoard } from "../src/db/with-board";
import { MCQ_CHECK_EVENT } from "../src/services/revision";
import { auth } from "../src/auth/auth";
import { env } from "../src/config/env";

type Tx = PgTransaction<any, any, any>;
const BASE = `http://localhost:${env.PORT}`;
let passed = 0, failed = 0;
const check = (n: string, ok: boolean) => { ok ? (passed++, console.log(`  ✓ ${n}`)) : (failed++, console.error(`  ✗ ${n}`)); };

const SLIDE_ID = "slide-q1";
function manifest() {
  return {
    contractVersion: "1",
    sections: [{ id: "sec1", title: "Sec 1", topics: [{ id: SLIDE_ID }] }],
    question_pools: {
      [SLIDE_ID]: [
        {
          slot_id: "slot_1",
          questions: [{
            id: "qa", type: "mcq", marks: 1, question: "Pick A?",
            options: [{ label: "A", text: "a" }, { label: "B", text: "b" }],
            evaluation: { correct_answer: "A", explanation: "because A" },
          }],
        },
      ],
    },
  };
}

async function signUpCookie(email: string): Promise<string> {
  const res = await auth.api.signUpEmail({
    body: { email, password: "dev-password-123", name: email.split("@")[0]! },
    asResponse: true,
  });
  return res.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
}

async function call(kind: "query" | "mutation", path: string, cookie: string, slug: string, input?: unknown): Promise<any> {
  const headers: Record<string, string> = { cookie, "x-board": slug };
  let url = `${BASE}/trpc/${path}`;
  let init: RequestInit = { headers };
  if (kind === "query") {
    if (input !== undefined) url += `?input=${encodeURIComponent(JSON.stringify({ json: input }))}`;
  } else {
    init = { method: "POST", headers: { ...headers, "content-type": "application/json" }, body: JSON.stringify({ json: input }) };
  }
  const res = await fetch(url, init);
  const body: any = await res.json().catch(() => null);
  if (res.status !== 200) throw new Error(`${path} → ${res.status} ${JSON.stringify(body)}`);
  return body?.result?.data?.json;
}

async function main() {
  const h = await fetch(`${BASE}/health`).catch(() => null);
  if (!h || h.status !== 200) { console.error("server not up on", BASE); process.exit(1); }

  const tag = `${Date.now()}`;
  const [Z] = await db.insert(board).values({ slug: `smk-mcq-${tag}`, name: "Smoke MCQ" }).returning();
  if (!Z) throw new Error("board seed failed");

  const fx = await withBoard(Z.id, async (tx: Tx) => {
    const [s] = await tx.insert(subject).values({ boardId: Z.id, slug: "phys", name: "Physics", grade: "IGCSE" }).returning();
    const [c] = await tx.insert(chapter).values({ boardId: Z.id, subjectId: s!.id, slug: "c1", name: "Ch", ordinal: 1, contentModuleKey: "mod" }).returning();
    const [t] = await tx.insert(topic).values({ boardId: Z.id, chapterId: c!.id, slug: "t1", name: "Tp", ordinal: 1 }).returning();
    const [st] = await tx.insert(subTopic).values({ boardId: Z.id, topicId: t!.id, slug: "qst", name: "Qst", ordinal: 1, contentSlideKey: SLIDE_ID }).returning();
    const [u] = await tx.insert(contentUnit).values({ boardId: Z.id, type: "slide_module", chapterId: c!.id, subTopicId: null, source: "starkhorn" }).returning();
    const [v1] = await tx.insert(contentVersion).values({
      contentUnitId: u!.id, versionNo: 1,
      body: { contractVersion: "1", manifest: manifest(), bundle: "/* smoke */" }, publishedAt: new Date(),
    }).returning();
    await tx.update(contentUnit).set({ currentVersionId: v1!.id }).where(eq(contentUnit.id, u!.id));
    return { subTopicId: st!.id, unitId: u!.id };
  });

  const email = `smkmcq-s-${tag}@example.com`;
  await withBoard(Z.id, (tx) => tx.insert(whitelist).values({ boardId: Z.id, email, role: "student" }));
  const cookie = await signUpCookie(email);
  const me = await call("query", "me", cookie, Z.slug, {});
  check("student me → role student (wire)", me?.role === "student");

  const qs = await call("query", "revision.getQuestions", cookie, Z.slug, { subTopicId: fx.subTopicId });
  check("getQuestions (wire) → 1 question, no key leak", qs?.questions?.length === 1 && !JSON.stringify(qs).includes("correct_answer"));

  const verdict = await call("mutation", "revision.checkAnswer", cookie, Z.slug, {
    subTopicId: fx.subTopicId, questionId: "qa", answer: "A", timeMs: 7777,
  });
  check("checkAnswer (wire) → isCorrect true + reveals correctAnswer 'A'", verdict?.isCorrect === true && verdict?.correctAnswer === "A");

  const events = await withBoard(Z.id, (tx) =>
    tx.select().from(eventLog).where(and(eq(eventLog.eventType, MCQ_CHECK_EVENT), eq(eventLog.studentId, me.user.id))),
  );
  const ev: any = events[0];
  check("event recorded over the wire (1 row, student-scoped)", events.length === 1 && ev?.subTopicId === fx.subTopicId);
  check("event payload carried chosen+timeMs through superjson", ev?.payload?.chosen === "A" && ev?.payload?.timeMs === 7777 && ev?.payload?.isCorrect === true);

  // cleanup
  await db.delete(contentVersion).where(eq(contentVersion.contentUnitId, fx.unitId));
  await withBoard(Z.id, async (tx: Tx) => {
    await tx.delete(eventLog).where(eq(eventLog.boardId, Z.id));
    await tx.delete(contentUnit).where(eq(contentUnit.boardId, Z.id));
    await tx.delete(subTopic).where(eq(subTopic.boardId, Z.id));
    await tx.delete(topic).where(eq(topic.boardId, Z.id));
    await tx.delete(chapter).where(eq(chapter.boardId, Z.id));
    await tx.delete(subject).where(eq(subject.boardId, Z.id));
    await tx.delete(membership).where(eq(membership.boardId, Z.id));
    await tx.delete(whitelist).where(eq(whitelist.boardId, Z.id));
  });
  await db.delete(appUser).where(eq(appUser.email, email));
  await db.delete(board).where(eq(board.id, Z.id));

  console.log(`\nsmoke_mcq_e2e: ${passed} passed, ${failed} failed`);
  await queryClient.end();
  process.exit(failed === 0 ? 0 : 1);
}

main().catch(async (err) => { console.error("smoke FAILED:", err); await queryClient.end(); process.exit(1); });
