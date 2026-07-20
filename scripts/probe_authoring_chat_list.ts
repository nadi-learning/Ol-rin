/**
 * probe_authoring_chat_list — Eyeball-#2 item #3 (past-chats history).
 *
 * Proves tutor.listAuthoringChats against the real DB + RLS with a THROWAWAY
 * fixture (boards P/Q, M22). NO AI — chats are seeded directly as rows.
 *
 *   1. DB connectivity.
 *   2. FILTER + ownership: tutor T's student S1 has 2 chats (2 chapters/vendors);
 *      S2 (unlinked) has 1. listAuthoringChats(S1) → exactly S1's 2, never S2's.
 *   3. ORDER: newest-updated first.
 *   4. DERIVED: messageCount + lastPreview (from the messages jsonb) + chapterName
 *      (join) + vendor carried.
 *   5. OWNERSHIP: listAuthoringChats(unlinked S2) → StudentNotFoundError.
 *   6. RLS cross-board: under board Q → StudentNotFoundError.
 *   7. HTTP no-session → 401 (soft).
 */
import { eq, sql } from "drizzle-orm";
import type { PgTransaction } from "drizzle-orm/pg-core";
import {
  appUser,
  authoringChat,
  board,
  chapter,
  membership,
  subject,
  tutorStudent,
} from "@b2c/kernel/schema";
import { db, queryClient } from "../src/db/client";
import { withBoard } from "../src/db/with-board";
import { grantRole } from "../src/services/membership";
import { listAuthoringChats } from "../src/services/authoring_chat";
import { StudentNotFoundError } from "../src/services/tutor";
import { env } from "../src/config/env";

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

const msg = (role: "user" | "assistant", text: string) => ({
  id: `${role}-${Math.round(performance.now() * 1000)}-${text.length}`,
  role,
  text,
  createdAt: new Date().toISOString(),
});

async function main() {
  const tag = `${Date.now()}`;
  const base = Date.now();
  const at = (offsetMs: number) => new Date(base + offsetMs);

  await db.execute(sql`select 1`);
  check("DB connectivity (select 1) as app role", true);

  const [P] = await db.insert(board).values({ slug: `pcl-p-${tag}`, name: "Probe P" }).returning();
  const [Q] = await db.insert(board).values({ slug: `pcl-q-${tag}`, name: "Probe Q" }).returning();
  if (!P || !Q) throw new Error("board seed failed");

  // Fixture: 2 chapters under one subject.
  const fx = await withBoard(P.id, async (tx: Tx) => {
    const [subj] = await tx.insert(subject).values({ boardId: P.id, slug: "chem", name: "Chemistry", grade: "IGCSE" }).returning();
    const [ch1] = await tx.insert(chapter).values({ boardId: P.id, subjectId: subj!.id, slug: "ch1", name: "Mixtures", ordinal: 1 }).returning();
    const [ch2] = await tx.insert(chapter).values({ boardId: P.id, subjectId: subj!.id, slug: "ch2", name: "Atoms", ordinal: 2 }).returning();
    return { ch1: ch1!.id, ch2: ch2!.id };
  });

  // tutor T + students S1 (linked), S2 (unlinked) via the REAL flow.
  const emailT = `pcl-t-${tag}@example.com`;
  const emailS1 = `pcl-s1-${tag}@example.com`;
  const emailS2 = `pcl-s2-${tag}@example.com`;
  const T = await withBoard(P.id, (tx) => grantRole(tx, { email: emailT, name: "Tutor", board: P, role: "tutor" }));
  const S1 = await withBoard(P.id, (tx) => grantRole(tx, { email: emailS1, name: "Stu One", board: P, role: "student" }));
  const S2 = await withBoard(P.id, (tx) => grantRole(tx, { email: emailS2, name: "Stu Two", board: P, role: "student" }));
  const userT = T.user.id, userS1 = S1.user.id, userS2 = S2.user.id;

  await withBoard(P.id, (tx) =>
    tx.insert(tutorStudent).values({ boardId: P.id, tutorId: userT, studentId: userS1 }),
  );

  // Seed chats: S1 has an OLDER Gemini/Mixtures chat + a NEWER Claude/Atoms chat;
  // S2 has one chat (must never surface in S1's list).
  await withBoard(P.id, async (tx: Tx) => {
    await tx.insert(authoringChat).values({
      boardId: P.id, tutorId: userT, studentId: userS1, chapterId: fx.ch1,
      vendor: "gemini_api",
      messages: [msg("user", "hi"), msg("assistant", "Here is my read of the student.")],
      updatedAt: at(1000),
    });
    await tx.insert(authoringChat).values({
      boardId: P.id, tutorId: userT, studentId: userS1, chapterId: fx.ch2,
      vendor: "claude_cli",
      messages: [
        msg("user", "let's do atoms"),
        msg("assistant", "Good — the student is weak on isotopes and relative mass."),
        msg("user", "agreed"),
      ],
      updatedAt: at(3000),
    });
    await tx.insert(authoringChat).values({
      boardId: P.id, tutorId: userT, studentId: userS2, chapterId: fx.ch1,
      vendor: "gemini_api",
      messages: [msg("user", "S2 chat")],
      updatedAt: at(2000),
    });
  });

  // 2. FILTER + ownership
  const list = await withBoard(P.id, (tx) => listAuthoringChats(tx, { tutorUserId: userT, studentId: userS1 }));
  check("listAuthoringChats(S1) → exactly 2 (S1's chats only)", list.length === 2);
  check("filter: S2's chat never appears", !list.some((c) => c.messageCount === 1 && c.chapterName === "Mixtures"));

  // 3. ORDER newest-updated first
  check("order: newest-updated first (Atoms/Claude before Mixtures/Gemini)",
    list[0]!.chapterName === "Atoms" && list[1]!.chapterName === "Mixtures");

  // 4. DERIVED fields
  const atoms = list[0]!;
  check("derived: messageCount from jsonb (Atoms → 3)", atoms.messageCount === 3);
  check("derived: lastPreview = latest turn text", atoms.lastPreview === "agreed");
  check("derived: chapterName joined + vendor carried", atoms.chapterName === "Atoms" && atoms.vendor === "claude_cli");
  const mixtures = list[1]!;
  check("derived: Mixtures → 2 msgs, preview = assistant's read, vendor gemini",
    mixtures.messageCount === 2 && mixtures.lastPreview === "Here is my read of the student." && mixtures.vendor === "gemini_api");

  // 5. OWNERSHIP: unlinked S2 → StudentNotFoundError
  const ownerFail = async (fn: () => Promise<unknown>) => {
    try { await fn(); return false; } catch (e) { return e instanceof StudentNotFoundError; }
  };
  check("ownership: listAuthoringChats(unlinked S2) → StudentNotFoundError",
    await ownerFail(() => withBoard(P.id, (tx) => listAuthoringChats(tx, { tutorUserId: userT, studentId: userS2 }))));

  // 6. RLS cross-board
  check("RLS: listAuthoringChats under another board → StudentNotFoundError",
    await ownerFail(() => withBoard(Q.id, (tx) => listAuthoringChats(tx, { tutorUserId: userT, studentId: userS1 }))));

  // 7. HTTP no-session → 401 (soft)
  try {
    const res = await fetch(`http://localhost:${env.PORT}/trpc/tutor.listAuthoringChats?input=${encodeURIComponent(JSON.stringify({ json: { studentId: userS1 } }))}`, { headers: { "x-board": P.slug } });
    check(`HTTP tutor.listAuthoringChats (no session) → 401 (got ${res.status})`, res.status === 401);
  } catch {
    console.log("  ~ HTTP tutor.listAuthoringChats skipped (server not running)");
  }

  // ── cleanup ──
  await withBoard(P.id, async (tx: Tx) => {
    await tx.delete(authoringChat).where(eq(authoringChat.boardId, P.id));
    await tx.delete(tutorStudent).where(eq(tutorStudent.boardId, P.id));
    await tx.delete(chapter).where(eq(chapter.boardId, P.id));
    await tx.delete(subject).where(eq(subject.boardId, P.id));
    await tx.delete(membership).where(eq(membership.boardId, P.id));
  });
  await db.delete(appUser).where(eq(appUser.email, emailT));
  await db.delete(appUser).where(eq(appUser.email, emailS1));
  await db.delete(appUser).where(eq(appUser.email, emailS2));
  await db.delete(board).where(eq(board.id, P.id));
  await db.delete(board).where(eq(board.id, Q.id));

  console.log(`\nprobe_authoring_chat_list: ${passed} passed, ${failed} failed`);
  await queryClient.end();
  process.exit(failed === 0 ? 0 : 1);
}

main().catch(async (err) => {
  console.error("probe_authoring_chat_list FAILED:", err);
  await queryClient.end();
  process.exit(1);
});
