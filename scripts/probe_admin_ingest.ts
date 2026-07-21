/**
 * probe_admin_ingest — Slice QA3-b exit gate (the admin topics.md ingest tool).
 *
 * Real DB + real RLS, throwaway boards A/B (M22), self-cleaning. The AI extract
 * leg is SOFT (real Gemini, skipped without a key); everything load-bearing
 * (validation, commit, refuse-if-dependent, RLS, the admin gate) is FIRM and
 * driven by a deterministic hand-built `extracted` fixture so it never depends on
 * the model.
 *
 *   1. DB connectivity.
 *   2. admin gate both sides (M11): assertAdmin('admin') ok · non-admin → throws;
 *      the REAL grantRole(role='admin') flow yields role 'admin'.
 *   3. validateExtracted (O8, pure): valid passes; empty-topics / a sub-topic with
 *      no LOs / no sub-topics each fail with a clear reason.
 *   4. commitTopicsMd: upserts the spine (topics/sub_topics/LOs) + stores the raw
 *      topics.md VERBATIM in chapter.metadata.topicsMd (D-QA3-5).
 *   5. idempotent: a second commit → same counts, NO duplicate rows.
 *   6. refuse-if-dependent (D-QA3-b-3): seed a question on a created sub_topic →
 *      commit → ChapterHasDependentDataError (never orphan).
 *   7. ChapterNotFound: commit a random chapterId → ChapterNotFoundError.
 *   8. RLS: commit A's chapter under board B's claim → ChapterNotFoundError.
 *   9. TopicsMdInvalid: commit an invalid payload → TopicsMdInvalidError.
 *  10. SOFT: extractTopicsMd on a real (topic-less) topics.md → >=1 synthesized
 *      topic, >=2 sub_topics, every LO axis-tagged, validation.ok.
 *  11. HTTP: admin.listChapters unauth → 401 (soft).
 */
import { and, eq, inArray, sql } from "drizzle-orm";
import type { PgTransaction } from "drizzle-orm/pg-core";
import {
  appUser,
  board,
  chapter,
  learningObjective,
  student,
  question,
  subTopic,
  subject,
  topic,
} from "@b2c/kernel/schema";
import { db, queryClient } from "../src/db/client";
import { withBoard } from "../src/db/with-board";
import { grantRole } from "../src/services/membership";
import {
  assertAdmin,
  AdminOnlyError,
  ChapterHasDependentDataError,
  ChapterNotFoundError,
  commitTopicsMd,
  extractTopicsMd,
  TopicsMdInvalidError,
  validateExtracted,
  type ExtractedTopicsMd,
} from "../src/services/admin_ingest";
import { AiNotConfiguredError } from "../src/services/ai/gemini";
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

const RAW_MD = `# Sample Chapter (topics.md)

## Sub-topic 1 — What a mixture is
**Conceptual LOs.**
- **C1.** Explain that a mixture keeps its parts' own properties.
**Procedural LOs.**
- **P1.** Classify a sample as a mixture or a pure substance.

## Sub-topic 2 — Separating mixtures
**Procedural LOs.**
- **P1.** Choose filtration vs evaporation for a given mixture.
`;

// Deterministic reviewed skeleton — drives the FIRM commit/guard checks.
const FIX: ExtractedTopicsMd = {
  topics: [
    {
      name: "Foundations",
      subTopics: [
        {
          name: "Mixture vs Compound",
          learningObjectives: [
            { axis: "conceptual", code: "C1", description: "Contrast a mixture and a compound." },
            { axis: "procedural", code: "P1", description: "Classify samples as mixture or compound." },
          ],
        },
        {
          name: "Types of Mixtures",
          learningObjectives: [
            { axis: "conceptual", code: null, description: "Distinguish homogeneous vs heterogeneous." },
          ],
        },
      ],
    },
  ],
  thresholds: [{ name: "T1", description: "Matter is particulate." }],
};

async function main() {
  const tag = `${Date.now()}`;
  await db.execute(sql`select 1`);
  check("DB connectivity (select 1) as app role", true);

  const [A] = await db.insert(board).values({ slug: `qa3b-a-${tag}`, name: "Probe A" }).returning();
  const [B] = await db.insert(board).values({ slug: `qa3b-b-${tag}`, name: "Probe B" }).returning();
  if (!A || !B) throw new Error("board seed failed");

  // fixture chapter under A (no spine yet)
  const fx = await withBoard(A.id, async (tx: Tx) => {
    const [subj] = await tx.insert(subject).values({ boardId: A.id, slug: "chem", name: "Chemistry", grade: "9" }).returning();
    const [ch] = await tx.insert(chapter).values({ boardId: A.id, subjectId: subj!.id, slug: "ch-target", name: "Target Ch", ordinal: 1 }).returning();
    return { chapterId: ch!.id };
  });

  // 2. admin gate — both sides (M11)
  let nonAdminThrows = false;
  try {
    assertAdmin("student");
  } catch (e) {
    nonAdminThrows = e instanceof AdminOnlyError;
  }
  check("assertAdmin('student') → AdminOnlyError (check side)", nonAdminThrows);
  let adminOk = true;
  try {
    assertAdmin("admin");
  } catch {
    adminOk = false;
  }
  check("assertAdmin('admin') → passes", adminOk);
  // real SET side: grantRole(role='admin') → role 'admin' (M27: lowercase)
  const adminEmail = `qa3b-admin-${tag}@example.com`;
  const adminM = await withBoard(A.id, (tx) => grantRole(tx, { email: adminEmail, name: "Adm", board: A, role: "admin" }));
  check("real flow grantRole(admin) yields role 'admin'", adminM.role === "admin");

  // 3. validateExtracted (O8, pure)
  check("validateExtracted(FIX) → ok", validateExtracted(FIX).ok);
  check("validate empty-topics → not ok", !validateExtracted({ topics: [], thresholds: [] }).ok);
  const noLo: ExtractedTopicsMd = { topics: [{ name: "T", subTopics: [{ name: "S", learningObjectives: [] }] }], thresholds: [] };
  const noLoV = validateExtracted(noLo);
  check("validate sub-topic-with-no-LOs → not ok + reasoned", !noLoV.ok && noLoV.errors.some((e) => e.includes("no learning objectives")));
  const noSub: ExtractedTopicsMd = { topics: [{ name: "T", subTopics: [] }], thresholds: [] };
  check("validate no-sub-topics → not ok", !validateExtracted(noSub).ok);

  // 4. commit → upsert spine + store blob verbatim
  const c1 = await withBoard(A.id, (tx) => commitTopicsMd(tx, { boardId: A.id, chapterId: fx.chapterId, rawMd: RAW_MD, extracted: FIX }));
  check("commit → counts {topics:1, subTopics:2, los:3}", c1.topics === 1 && c1.subTopics === 2 && c1.los === 3);

  const spine = await withBoard(A.id, async (tx) => {
    const tops = await tx.select().from(topic).where(eq(topic.chapterId, fx.chapterId));
    const stIds = (await tx.select({ id: subTopic.id }).from(subTopic).innerJoin(topic, eq(subTopic.topicId, topic.id)).where(eq(topic.chapterId, fx.chapterId))).map((r) => r.id);
    const los = stIds.length ? await tx.select().from(learningObjective).where(inArray(learningObjective.subTopicId, stIds)) : [];
    const ch = (await tx.select().from(chapter).where(eq(chapter.id, fx.chapterId)))[0];
    return { topics: tops.length, subTopics: stIds.length, los: los.length, blob: (ch?.metadata as any)?.topicsMd, thresholds: (ch?.metadata as any)?.thresholds };
  });
  check("spine persisted (1 topic, 2 sub_topics, 3 LOs)", spine.topics === 1 && spine.subTopics === 2 && spine.los === 3);
  check("raw topics.md stored VERBATIM in chapter.metadata.topicsMd (D-QA3-5)", spine.blob === RAW_MD);
  check("thresholds stored in chapter.metadata", Array.isArray(spine.thresholds) && spine.thresholds.length === 1);

  // 5. idempotent
  const c2 = await withBoard(A.id, (tx) => commitTopicsMd(tx, { boardId: A.id, chapterId: fx.chapterId, rawMd: RAW_MD, extracted: FIX }));
  const spine2 = await withBoard(A.id, async (tx) => {
    const stIds = (await tx.select({ id: subTopic.id }).from(subTopic).innerJoin(topic, eq(subTopic.topicId, topic.id)).where(eq(topic.chapterId, fx.chapterId))).map((r) => r.id);
    const los = stIds.length ? await tx.select().from(learningObjective).where(inArray(learningObjective.subTopicId, stIds)) : [];
    return { subTopics: stIds.length, los: los.length };
  });
  check("idempotent: re-commit → same counts, no dupes", c2.subTopics === 2 && spine2.subTopics === 2 && spine2.los === 3);

  // 6. refuse-if-dependent — seed a question on a created sub_topic, then re-commit
  const someSt = await withBoard(A.id, (tx) => tx.select({ id: subTopic.id }).from(subTopic).innerJoin(topic, eq(subTopic.topicId, topic.id)).where(eq(topic.chapterId, fx.chapterId)));
  await withBoard(A.id, (tx) => tx.insert(question).values({ boardId: A.id, subTopicId: someSt[0]!.id, axis: "conceptual", kind: "subjective", stem: "Q", referenceAnswer: "R", ordinal: 1, source: "b2c_authoring" }));
  let refused = false;
  try {
    await withBoard(A.id, (tx) => commitTopicsMd(tx, { boardId: A.id, chapterId: fx.chapterId, rawMd: RAW_MD, extracted: FIX }));
  } catch (e) {
    refused = e instanceof ChapterHasDependentDataError;
  }
  check("refuse-if-dependent: question present → ChapterHasDependentDataError", refused);

  // 7. ChapterNotFound (random id, same board)
  let notFound = false;
  try {
    await withBoard(A.id, (tx) => commitTopicsMd(tx, { boardId: A.id, chapterId: "00000000-0000-0000-0000-000000000000", rawMd: RAW_MD, extracted: FIX }));
  } catch (e) {
    notFound = e instanceof ChapterNotFoundError;
  }
  check("commit unknown chapterId → ChapterNotFoundError", notFound);

  // 8. RLS: A's chapter is invisible under board B's claim
  let rlsHidden = false;
  try {
    await withBoard(B.id, (tx) => commitTopicsMd(tx, { boardId: B.id, chapterId: fx.chapterId, rawMd: RAW_MD, extracted: FIX }));
  } catch (e) {
    rlsHidden = e instanceof ChapterNotFoundError;
  }
  check("RLS: commit A's chapter under board B → ChapterNotFoundError", rlsHidden);

  // 9. TopicsMdInvalid at commit (defense)
  let invalid = false;
  try {
    await withBoard(A.id, (tx) => commitTopicsMd(tx, { boardId: A.id, chapterId: fx.chapterId, rawMd: RAW_MD, extracted: { topics: [], thresholds: [] } }));
  } catch (e) {
    invalid = e instanceof TopicsMdInvalidError;
  }
  check("commit invalid extracted (empty topics) → TopicsMdInvalidError", invalid);

  // 10. SOFT — real Gemini extraction on a topic-less topics.md
  if (env.GEMINI_API_KEY) {
    try {
      const { extracted, validation } = await extractTopicsMd(RAW_MD);
      const subCount = extracted.topics.reduce((n, t) => n + t.subTopics.length, 0);
      const allAxis = extracted.topics.every((t) => t.subTopics.every((s) => s.learningObjectives.every((lo) => lo.axis === "conceptual" || lo.axis === "procedural")));
      check(`SOFT extract: >=1 synthesized topic (got ${extracted.topics.length})`, extracted.topics.length >= 1);
      check(`SOFT extract: >=2 sub_topics (got ${subCount})`, subCount >= 2);
      check("SOFT extract: every LO axis-tagged", allAxis);
      check("SOFT extract: validation.ok", validation.ok);
    } catch (e) {
      if (e instanceof AiNotConfiguredError) console.log("  ~ SOFT extract skipped (AI not configured)");
      else throw e;
    }
  } else {
    console.log("  ~ SOFT extract skipped (no GEMINI_API_KEY)");
  }

  // 11. HTTP unauth → 401 (soft)
  try {
    const res = await fetch(`http://localhost:${env.PORT}/trpc/admin.listChapters`, { headers: { "x-board": A.slug } });
    check(`HTTP admin.listChapters (unauth) → 401 (got ${res.status})`, res.status === 401);
  } catch {
    console.log("  ~ HTTP admin.listChapters skipped (server not running)");
  }

  // ── cleanup (FK-safe) ──
  await withBoard(A.id, async (tx: Tx) => {
    await tx.delete(question).where(eq(question.boardId, A.id));
    await tx.delete(learningObjective).where(eq(learningObjective.boardId, A.id));
    await tx.delete(subTopic).where(eq(subTopic.boardId, A.id));
    await tx.delete(topic).where(eq(topic.boardId, A.id));
    await tx.delete(chapter).where(eq(chapter.boardId, A.id));
    await tx.delete(subject).where(eq(subject.boardId, A.id));
    await tx.delete(student).where(eq(student.boardId, A.id));
  });
  await db.delete(appUser).where(eq(appUser.email, adminEmail));
  await db.delete(board).where(eq(board.id, A.id));
  await db.delete(board).where(eq(board.id, B.id));

  console.log(`\nprobe_admin_ingest: ${passed} passed, ${failed} failed`);
  await queryClient.end();
  process.exit(failed === 0 ? 0 : 1);
}

main().catch(async (err) => {
  console.error("probe_admin_ingest FAILED:", err);
  await queryClient.end();
  process.exit(1);
});
