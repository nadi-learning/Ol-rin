/**
 * seed_s2 — one real-shaped published slide MODULE, anchored to a seeded
 * curriculum spine. The manual stand-in for the Starkhorn pull (D-WS2): for
 * the walking skeleton we hand-write what the real pull will later fetch from
 * Starkhorn's DB. Only the SOURCE of the bundle bytes changes when the pull
 * lands — the shape S3/S4 read stays identical.
 *
 * Seeds (idempotent, re-runnable) under board `cambridge`:
 *   subject Physics/IGCSE → chapter Forces and Motion → topic Speed, Velocity
 *   and Acceleration → 2 sub_topics (speed-and-velocity, acceleration) + 2 LOs
 *   each (one conceptual, one procedural)
 *   → content_unit (type slide_module, chapter-grained, source starkhorn)
 *   → content_version v1, body { contractVersion, manifest, bundle }
 *   → content_unit.current_version_id = v1.id  (app-enforced pointer; D-S0-4)
 *
 * The manifest maps sub_topic SLUG → slideId (slug is the cross-system key, F1
 * — Starkhorn doesn't know b2c's uuids). The bundle is a minimal but
 * contract-faithful module source (D-WS1: default-exports
 * { contractVersion, components: { [slideId]: Component } }); stored now,
 * executed by the ported PreviewShell in S4.
 *
 * Usage: bun scripts/seed_s2.ts
 */
import { and, eq, isNull } from "drizzle-orm";
import type { PgTransaction } from "drizzle-orm/pg-core";
import {
  board,
  chapter,
  contentUnit,
  contentVersion,
  learningObjective,
  subTopic,
  subject,
  topic,
} from "@b2c/kernel/schema";
import { db, queryClient } from "../src/db/client";
import { withBoard } from "../src/db/with-board";

type Tx = PgTransaction<any, any, any>;

const BOARD_SLUG = "cambridge";

// The two slides the module exposes, keyed by the manifest. slideId is the
// stable handle inside the bundle (manifest slug → slideId → components[slideId]).
const SLIDES = {
  "speed-and-velocity": "slide-speed-velocity",
  acceleration: "slide-acceleration",
} as const;

// A minimal but contract-faithful module bundle (D-WS1). React is injected by
// the host (PreviewShell sets window.__REVISION_REACT__) — the bundle never
// imports React itself. Stored as a string now; dynamic-import()'d in S4.
const BUNDLE_SOURCE = `const React = window.__REVISION_REACT__;
function makeSlide(title) {
  return function Slide({ studentName, onReady }) {
    if (onReady) onReady();
    return React.createElement(
      "div",
      { className: "slide" },
      React.createElement("h1", null, title),
      React.createElement("p", null, "Hi " + (studentName || "there") + " — let's work on " + title + ".")
    );
  };
}
export default {
  contractVersion: "1",
  components: {
    "slide-speed-velocity": makeSlide("Speed and Velocity"),
    "slide-acceleration": makeSlide("Acceleration"),
  },
};
`;

async function upsertBoard(slug: string, name: string) {
  const [row] = await db
    .insert(board)
    .values({ slug, name })
    .onConflictDoUpdate({ target: board.slug, set: { name } })
    .returning();
  return row!;
}

async function main() {
  const targetBoard = await upsertBoard(BOARD_SLUG, "Cambridge");
  // ensure cbse exists too (used as the "other board" in the RLS probe)
  await upsertBoard("cbse", "CBSE");

  await withBoard(targetBoard.id, async (tx: Tx) => {
    const boardId = targetBoard.id;

    // ── curriculum spine (each step idempotent via its unique key) ──
    const subj = await getOrCreate(
      tx,
      subject,
      and(
        eq(subject.boardId, boardId),
        eq(subject.slug, "physics"),
        eq(subject.grade, "IGCSE"),
      ),
      { boardId, slug: "physics", name: "Physics", grade: "IGCSE" },
    );

    const chap = await getOrCreate(
      tx,
      chapter,
      and(eq(chapter.subjectId, subj.id), eq(chapter.slug, "forces-and-motion")),
      {
        boardId,
        subjectId: subj.id,
        slug: "forces-and-motion",
        name: "Forces and Motion",
        ordinal: 1,
      },
    );

    const top = await getOrCreate(
      tx,
      topic,
      and(
        eq(topic.chapterId, chap.id),
        eq(topic.slug, "speed-velocity-acceleration"),
      ),
      {
        boardId,
        chapterId: chap.id,
        slug: "speed-velocity-acceleration",
        name: "Speed, Velocity and Acceleration",
        ordinal: 1,
      },
    );

    const subSpeed = await getOrCreate(
      tx,
      subTopic,
      and(eq(subTopic.topicId, top.id), eq(subTopic.slug, "speed-and-velocity")),
      {
        boardId,
        topicId: top.id,
        slug: "speed-and-velocity",
        name: "Speed and Velocity",
        ordinal: 1,
      },
    );

    const subAccel = await getOrCreate(
      tx,
      subTopic,
      and(eq(subTopic.topicId, top.id), eq(subTopic.slug, "acceleration")),
      {
        boardId,
        topicId: top.id,
        slug: "acceleration",
        name: "Acceleration",
        ordinal: 2,
      },
    );

    // ── learning objectives (one per axis per sub_topic) ──
    await seedLO(tx, boardId, subSpeed.id, "conceptual", "SV-C1", "Distinguish speed (scalar) from velocity (vector).");
    await seedLO(tx, boardId, subSpeed.id, "procedural", "SV-P1", "Calculate speed from distance and time.");
    await seedLO(tx, boardId, subAccel.id, "conceptual", "AC-C1", "Explain acceleration as the rate of change of velocity.");
    await seedLO(tx, boardId, subAccel.id, "procedural", "AC-P1", "Calculate acceleration from change in velocity and time.");

    // ── the slide MODULE content_unit (chapter-grained, D-S2-1) ──
    let unit = (
      await tx
        .select()
        .from(contentUnit)
        .where(
          and(
            eq(contentUnit.boardId, boardId),
            eq(contentUnit.type, "slide_module"),
            eq(contentUnit.chapterId, chap.id),
            isNull(contentUnit.subTopicId),
          ),
        )
    )[0];
    if (!unit) {
      unit = (
        await tx
          .insert(contentUnit)
          .values({
            boardId,
            type: "slide_module",
            chapterId: chap.id,
            subTopicId: null,
            source: "starkhorn",
          })
          .returning()
      )[0]!;
    }

    // ── content_version v1 (immutable; insert-if-absent on (unit, versionNo)) ──
    const manifest = {
      moduleSlug: chap.slug,
      chapterSlug: chap.slug,
      contractVersion: "1",
      slides: { ...SLIDES }, // sub_topic slug → slideId
    };
    const body = { contractVersion: "1", manifest, bundle: BUNDLE_SOURCE };

    await tx
      .insert(contentVersion)
      .values({
        contentUnitId: unit.id,
        versionNo: 1,
        body,
        publishedAt: new Date(),
      })
      .onConflictDoNothing({
        target: [contentVersion.contentUnitId, contentVersion.versionNo],
      });

    const v1 = (
      await tx
        .select()
        .from(contentVersion)
        .where(
          and(
            eq(contentVersion.contentUnitId, unit.id),
            eq(contentVersion.versionNo, 1),
          ),
        )
    )[0]!;

    // ── advance the live pointer (app-enforced; cycle break) ──
    if (unit.currentVersionId !== v1.id) {
      await tx
        .update(contentUnit)
        .set({ currentVersionId: v1.id })
        .where(eq(contentUnit.id, unit.id));
    }

    console.log(`[seed:s2] cambridge / Physics IGCSE / Forces and Motion`);
    console.log(`[seed:s2]   sub_topics: speed-and-velocity, acceleration (+4 LOs)`);
    console.log(`[seed:s2]   slide_module ${unit.id} → version v1 ${v1.id} (current)`);
  });

  await queryClient.end();
}

/** select-by-predicate, insert-if-absent, return the row (idempotent). */
async function getOrCreate(tx: Tx, table: any, where: any, values: any) {
  const existing = (await tx.select().from(table).where(where))[0];
  if (existing) return existing;
  return (await tx.insert(table).values(values).returning())[0];
}

/** LO has no natural unique key → match on (sub_topic, axis, code). */
async function seedLO(
  tx: Tx,
  boardId: string,
  subTopicId: string,
  axis: "conceptual" | "procedural",
  code: string,
  description: string,
) {
  const existing = (
    await tx
      .select()
      .from(learningObjective)
      .where(
        and(
          eq(learningObjective.subTopicId, subTopicId),
          eq(learningObjective.axis, axis),
          eq(learningObjective.code, code),
        ),
      )
  )[0];
  if (existing) return existing;
  return (
    await tx
      .insert(learningObjective)
      .values({ boardId, subTopicId, axis, code, description })
      .returning()
  )[0];
}

main().catch(async (err) => {
  console.error("[seed:s2] FAILED:", err);
  await queryClient.end();
  process.exit(1);
});
