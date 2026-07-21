/**
 * probe_admin_chapters — Slice ADM-CH exit gate (admin curriculum seeding:
 * create/pick a subject, append chapter shells before any topics.md ingest).
 *
 * Real DB + real RLS, throwaway boards A/B (M22), self-cleaning. Everything is
 * FIRM (no AI). Covers:
 *   1. DB connectivity.
 *   2. listSubjectsForAdmin: empty on a fresh board.
 *   3. createSubjectForAdmin: creates (slug from name); idempotent by
 *      (board, slug, grade); same name + DIFFERENT grade → distinct subject;
 *      blank/symbol-only name → AdminInputError.
 *   4. addChaptersForAdmin: appends with sequential ordinals after the current
 *      max; blank lines ignored; returns created list.
 *   5. idempotent-by-slug: re-adding the same names → all skipped, no dupes;
 *      a mix of new + existing → only the new ones created, ordinals continue.
 *   6. listSubjectsForAdmin reflects the chapter counts.
 *   7. RLS: addChapters to A's subject under board B → SubjectNotFoundError.
 */
import { eq, sql } from "drizzle-orm";
import type { PgTransaction } from "drizzle-orm/pg-core";
import { board, chapter, subject } from "@b2c/kernel/schema";
import { db, queryClient } from "../src/db/client";
import { withBoard } from "../src/db/with-board";
import {
  addChaptersForAdmin,
  AdminInputError,
  createSubjectForAdmin,
  listSubjectsForAdmin,
  SubjectNotFoundError,
} from "../src/services/admin_ingest";

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

async function main() {
  const tag = `${Date.now()}`;
  await db.execute(sql`select 1`);
  check("DB connectivity (select 1) as app role", true);

  const [A] = await db.insert(board).values({ slug: `admch-a-${tag}`, name: "Probe A" }).returning();
  const [B] = await db.insert(board).values({ slug: `admch-b-${tag}`, name: "Probe B" }).returning();
  if (!A || !B) throw new Error("board seed failed");

  // 2. fresh board → no subjects
  const s0 = await withBoard(A.id, (tx: Tx) => listSubjectsForAdmin(tx));
  check("listSubjects on a fresh board → empty", s0.length === 0);

  // 3. createSubject — slug from name, idempotent, grade-distinct, input guard
  const phys10 = await withBoard(A.id, (tx) => createSubjectForAdmin(tx, { boardId: A.id, name: "Physics", grade: "10" }));
  check("createSubject → slug from name ('physics')", phys10.slug === "physics" && phys10.name === "Physics" && phys10.grade === "10");

  const phys10Again = await withBoard(A.id, (tx) => createSubjectForAdmin(tx, { boardId: A.id, name: "Physics", grade: "10" }));
  check("createSubject idempotent by (board, slug, grade) → same id", phys10Again.subjectId === phys10.subjectId);

  const phys11 = await withBoard(A.id, (tx) => createSubjectForAdmin(tx, { boardId: A.id, name: "Physics", grade: "11" }));
  check("createSubject same name + different grade → distinct subject", phys11.subjectId !== phys10.subjectId);

  let badName = false;
  try {
    await withBoard(A.id, (tx) => createSubjectForAdmin(tx, { boardId: A.id, name: "!!!", grade: "10" }));
  } catch (e) {
    badName = e instanceof AdminInputError;
  }
  check("createSubject symbol-only name → AdminInputError", badName);

  // 4. addChapters — append with sequential ordinals, blank lines ignored
  const add1 = await withBoard(A.id, (tx) =>
    addChaptersForAdmin(tx, { boardId: A.id, subjectId: phys10.subjectId, names: ["Motion", "", "  ", "Force and Laws of Motion", "Gravitation"] }),
  );
  check("addChapters → 3 created (blank lines skipped)", add1.created.length === 3 && add1.skipped.length === 0);
  const ord1 = await withBoard(A.id, (tx) =>
    tx.select({ name: chapter.name, ordinal: chapter.ordinal, slug: chapter.slug }).from(chapter).where(eq(chapter.subjectId, phys10.subjectId)).orderBy(chapter.ordinal),
  );
  check("addChapters → ordinals 1,2,3 in order", ord1.map((c) => c.ordinal).join(",") === "1,2,3");
  check("addChapters → slug from name ('force-and-laws-of-motion')", ord1.some((c) => c.slug === "force-and-laws-of-motion"));

  // 5. idempotent-by-slug: re-add same → all skipped; mix → only new created, ordinals continue
  const add2 = await withBoard(A.id, (tx) =>
    addChaptersForAdmin(tx, { boardId: A.id, subjectId: phys10.subjectId, names: ["Motion", "Gravitation"] }),
  );
  check("re-add existing names → all skipped, none created", add2.created.length === 0 && add2.skipped.length === 2);

  const add3 = await withBoard(A.id, (tx) =>
    addChaptersForAdmin(tx, { boardId: A.id, subjectId: phys10.subjectId, names: ["Motion", "Work and Energy"] }),
  );
  check("mixed re-add → only the new one created", add3.created.length === 1 && add3.skipped.length === 1);
  const ord2 = await withBoard(A.id, (tx) =>
    tx.select({ ordinal: chapter.ordinal }).from(chapter).where(eq(chapter.subjectId, phys10.subjectId)).orderBy(chapter.ordinal),
  );
  check("ordinals continue after max (1..4, no dupes)", ord2.map((c) => c.ordinal).join(",") === "1,2,3,4");

  // 6. listSubjects reflects chapter counts
  const s1 = await withBoard(A.id, (tx) => listSubjectsForAdmin(tx));
  const phys10Row = s1.find((s) => s.subjectId === phys10.subjectId);
  const phys11Row = s1.find((s) => s.subjectId === phys11.subjectId);
  check("listSubjects → Physics/10 shows 4 chapters", phys10Row?.chapterCount === 4);
  check("listSubjects → Physics/11 shows 0 chapters", phys11Row?.chapterCount === 0);

  // 7. RLS: A's subject is invisible under board B → SubjectNotFoundError
  let rlsHidden = false;
  try {
    await withBoard(B.id, (tx) => addChaptersForAdmin(tx, { boardId: B.id, subjectId: phys10.subjectId, names: ["Sneaky"] }));
  } catch (e) {
    rlsHidden = e instanceof SubjectNotFoundError;
  }
  check("RLS: addChapters to A's subject under board B → SubjectNotFoundError", rlsHidden);

  // ── cleanup (FK-safe) ──
  await withBoard(A.id, async (tx: Tx) => {
    await tx.delete(chapter).where(eq(chapter.boardId, A.id));
    await tx.delete(subject).where(eq(subject.boardId, A.id));
  });
  await db.delete(board).where(eq(board.id, A.id));
  await db.delete(board).where(eq(board.id, B.id));

  console.log(`\nprobe_admin_chapters: ${passed} passed, ${failed} failed`);
  await queryClient.end();
  process.exit(failed === 0 ? 0 : 1);
}

main().catch(async (err) => {
  console.error("probe_admin_chapters FAILED:", err);
  await queryClient.end();
  process.exit(1);
});
