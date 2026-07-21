/**
 * smoke_assignment_e2e — Slice ASG end-to-end over the REAL HTTP/superjson wire
 * (not the in-process service): dev-login cookies → tRPC context → withBoard →
 * the new procedures. Proves the tutor compose→assign and the student see→start
 * round-trip through real cookies + x-board + superjson encoding. Throwaway board
 * + content + identities (M22), full cleanup. Server must be up (:PORT).
 */
import { eq, sql } from "drizzle-orm";
import type { PgTransaction } from "drizzle-orm/pg-core";
import {
  appUser, assignment, attempt, board, chapter,
  practiceSession, question, student, subTopic, subject, topic,
} from "@b2c/kernel/schema";
import { db, queryClient } from "../src/db/client";
import { withBoard } from "../src/db/with-board";
import { grantRole } from "../src/services/membership";
import { auth } from "../src/auth/auth";
import { env } from "../src/config/env";

type Tx = PgTransaction<any, any, any>;
const BASE = `http://localhost:${env.PORT}`;
let passed = 0, failed = 0;
const check = (n: string, ok: boolean) => { ok ? (passed++, console.log(`  ✓ ${n}`)) : (failed++, console.error(`  ✗ ${n}`)); };

async function signUpCookie(email: string): Promise<string> {
  const res = await auth.api.signUpEmail({
    body: { email, password: "dev-password-123", name: email.split("@")[0]! },
    asResponse: true,
  });
  return res.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
}

/** Single (non-batch) tRPC call over HTTP with superjson envelopes. */
async function call(
  kind: "query" | "mutation", path: string, cookie: string, slug: string, input?: unknown,
  profile?: string,
): Promise<any> {
  const headers: Record<string, string> = { cookie, "x-board": slug };
  // Multi-profile identity (ID-1): protectedProcedure resolves WHICH profile from
  // x-profile; absent ⇒ student. A tutor's calls must claim the tutor persona.
  if (profile) headers["x-profile"] = profile;
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
  const [Z] = await db.insert(board).values({ slug: `smk-asg-${tag}`, name: "Smoke ASG" }).returning();
  if (!Z) throw new Error("board seed failed");

  const fx = await withBoard(Z.id, async (tx: Tx) => {
    const [s] = await tx.insert(subject).values({ boardId: Z.id, slug: "phys", name: "Physics", grade: "IGCSE" }).returning();
    const [c] = await tx.insert(chapter).values({ boardId: Z.id, subjectId: s!.id, slug: "c1", name: "Forces", ordinal: 1 }).returning();
    const [t] = await tx.insert(topic).values({ boardId: Z.id, chapterId: c!.id, slug: "t1", name: "Motion", ordinal: 1 }).returning();
    const mk = async (slug: string, name: string, ord: number) => {
      const [st] = await tx.insert(subTopic).values({ boardId: Z.id, topicId: t!.id, slug, name, ordinal: ord }).returning();
      for (const q of [1, 2]) await tx.insert(question).values({
        boardId: Z.id, subTopicId: st!.id, axis: "conceptual", kind: "subjective",
        stem: `Q${q} ${name}`, referenceAnswer: "ref", explanation: null, ordinal: q, source: "b2c_authoring",
      });
      return st!.id;
    };
    return { c: c!.id, SA: await mk("sa", "Speed", 1), SB: await mk("sb", "Acceleration", 2) };
  });

  const emailTU = `smkasg-tu-${tag}@example.com`;
  const emailST = `smkasg-st-${tag}@example.com`;
  // Roles are granted up front via `grantRole` (the M11 SET side, the same helper
  // admin.setRole drives): the tutor gets its detail row, the student gets its
  // profile shell. `me` is now a pure read (ID-4) — it no longer mints anything —
  // so the student's OPERATIONAL row (onboarding's output) is a fixture here,
  // minted before its `me` call and linked to the tutor.
  const TU = await withBoard(Z.id, (tx: Tx) =>
    grantRole(tx, { email: emailTU, name: "Tutor", board: Z, role: "tutor" }),
  );
  const S = await withBoard(Z.id, (tx: Tx) =>
    grantRole(tx, { email: emailST, name: "Student", board: Z, role: "student" }),
  );
  await withBoard(Z.id, (tx: Tx) => tx.insert(student).values({ userId: S.user.id, boardId: Z.id, class: "9", tutorId: TU.user.id }));
  const cookieT = await signUpCookie(emailTU);
  const cookieS = await signUpCookie(emailST);
  // `me` over the wire is a pure read: it returns the tutor's role and the now-
  // enrolled student's, and never downgrades either.
  const meT = await call("query", "me", cookieT, Z.slug, {}, "tutor");
  const meS = await call("query", "me", cookieS, Z.slug, {});
  check("tutor me → role tutor (wire)", meT?.role === "tutor");
  check("student me → role student (wire)", meS?.role === "student");

  // tutor: see student, compose→assign (blocked, the chapter, both sub_topics).
  const students = await call("query", "tutor.listStudents", cookieT, Z.slug, undefined, "tutor");
  check("tutor.listStudents → includes the student", Array.isArray(students) && students.some((s: any) => s.studentId === meS.user.id));

  const created = await call("mutation", "tutor.createAssignment", cookieT, Z.slug, {
    studentId: meS.user.id, mode: "blocked", chapterId: fx.c, subTopicIds: [fx.SA, fx.SB],
  }, "tutor");
  check("tutor.createAssignment (blocked) → mode/total/2 not_started (wire)",
    created?.mode === "blocked" && created?.total === 2 && created?.completedCount === 0);

  const tutorList = await call("query", "tutor.listAssignments", cookieT, Z.slug, { studentId: meS.user.id }, "tutor");
  check("tutor.listAssignments → 1 (wire)", Array.isArray(tutorList) && tutorList.length === 1 && tutorList[0].id === created.id);

  // student: the assignment is visible; start the first sub_topic with the link.
  const studentList = await call("query", "practice.listAssignments", cookieS, Z.slug);
  check("student practice.listAssignments → 1 (wire)", Array.isArray(studentList) && studentList.length === 1 && studentList[0].id === created.id);

  const sess = await call("mutation", "practice.startSession", cookieS, Z.slug, { subTopicId: fx.SA, assignmentId: created.id });
  check("student startSession(assignmentId) → active, total 2 (wire; assertAssignedSubTopic passed)",
    sess?.status === "active" && sess?.total === 2);

  // guard over the wire: starting a sub_topic NOT in the assignment → 400 BAD_REQUEST
  // (InvalidAssignmentError). SB is in the assignment, so use a freshly-minted
  // non-member sub_topic id by reusing the chapter's topic via a bogus uuid.
  let guardOk = false;
  try {
    await call("mutation", "practice.startSession", cookieS, Z.slug, {
      subTopicId: fx.SA.replace(/.$/, fx.SA.endsWith("0") ? "1" : "0"), assignmentId: created.id,
    });
  } catch (e) {
    guardOk = String((e as Error).message).includes("400");
  }
  check("wire guard: foreign sub_topic on the assignment → 400 (BAD_REQUEST)", guardOk);

  // cleanup
  await withBoard(Z.id, async (tx: Tx) => {
    await tx.delete(attempt).where(eq(attempt.boardId, Z.id));
    await tx.delete(practiceSession).where(eq(practiceSession.boardId, Z.id));
    await tx.delete(assignment).where(eq(assignment.boardId, Z.id));
    await tx.delete(question).where(eq(question.boardId, Z.id));
    await tx.delete(subTopic).where(eq(subTopic.boardId, Z.id));
    await tx.delete(topic).where(eq(topic.boardId, Z.id));
    await tx.delete(chapter).where(eq(chapter.boardId, Z.id));
    await tx.delete(subject).where(eq(subject.boardId, Z.id));
    await tx.delete(student).where(eq(student.boardId, Z.id));
  });
  await db.delete(appUser).where(eq(appUser.email, emailTU));
  await db.delete(appUser).where(eq(appUser.email, emailST));
  await db.delete(board).where(eq(board.id, Z.id));

  console.log(`\nsmoke_assignment_e2e: ${passed} passed, ${failed} failed`);
  await queryClient.end();
  process.exit(failed === 0 ? 0 : 1);
}

main().catch(async (err) => { console.error("smoke FAILED:", err); await queryClient.end(); process.exit(1); });
