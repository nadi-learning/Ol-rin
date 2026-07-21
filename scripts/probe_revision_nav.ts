/**
 * probe_revision_nav — Feature B exit gate (prod-style slide nav source).
 *
 * Proves revision.getChapterNav builds the chapter→section→slide tree in correct
 * ordinal order (not insertion order) against the real DB + real RLS, using a
 * THROWAWAY fixture (boards P/Q) it cleans up (M22). Rows are seeded in DELIBERATE
 * non-ordinal order so the test fails if grouping/ordering regresses.
 *
 *   Fixture under P (one chapter):
 *     topic "Beta"  ordinal 1  → subTopic b1 (ord 1)
 *     topic "Alpha" ordinal 2  → subTopics a2 (ord 1), a1 (ord 2)
 *   Inserted: Alpha before Beta; a1 before a2 → expected tree order Beta→Alpha,
 *   Alpha.subTopics = [a2, a1]; expected FLAT order = [b1, a2, a1].
 *
 *   1. connectivity
 *   2. one chapter, two topics, ordinal-ordered (Beta then Alpha)
 *   3. sub_topics grouped + ordinal-ordered within a topic
 *   4. derived FLAT order matches tree order
 *   5. RLS: getChapterNav under board Q → empty
 *   6. membership gate, both sides (M11)
 *   7. HTTP no-session → 401 (soft)
 */
import { eq, sql } from "drizzle-orm";
import type { PgTransaction } from "drizzle-orm/pg-core";
import {
  board,
  chapter,
  appUser,
  contentUnit,
  contentVersion,
  student,
  subTopic,
  subject,
  topic,
} from "@b2c/kernel/schema";
import { db, queryClient } from "../src/db/client";
import { withBoard } from "../src/db/with-board";
import { getChapterNav, getSlide } from "../src/services/revision";
import {
  NoMembershipError,
  grantRole,
  requireMembership,
} from "../src/services/membership";
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

function flatten(nav: Awaited<ReturnType<typeof getChapterNav>>): string[] {
  const out: string[] = [];
  for (const ch of nav) for (const tp of ch.topics) for (const st of tp.subTopics) out.push(st.name);
  return out;
}

async function main() {
  const tag = `${Date.now()}`;
  await db.execute(sql`select 1`);
  check("DB connectivity (select 1) as app role", true);

  const [P] = await db.insert(board).values({ slug: `prn-p-${tag}`, name: "Probe P" }).returning();
  const [Q] = await db.insert(board).values({ slug: `prn-q-${tag}`, name: "Probe Q" }).returning();
  if (!P || !Q) throw new Error("board seed failed");

  // build the fixture in deliberate non-ordinal insertion order
  await withBoard(P.id, async (tx: Tx) => {
    const [subj] = await tx
      .insert(subject)
      .values({ boardId: P.id, slug: "phys", name: "Physics", grade: "IGCSE" })
      .returning();
    const [chap] = await tx
      .insert(chapter)
      .values({ boardId: P.id, subjectId: subj!.id, slug: "ch", name: "Chapter One", ordinal: 1 })
      .returning();
    // Alpha (ordinal 2) inserted BEFORE Beta (ordinal 1)
    const [alpha] = await tx
      .insert(topic)
      .values({ boardId: P.id, chapterId: chap!.id, slug: "alpha", name: "Alpha", ordinal: 2 })
      .returning();
    const [beta] = await tx
      .insert(topic)
      .values({ boardId: P.id, chapterId: chap!.id, slug: "beta", name: "Beta", ordinal: 1 })
      .returning();
    // a1 (ord 2) inserted BEFORE a2 (ord 1)
    await tx.insert(subTopic).values({ boardId: P.id, topicId: alpha!.id, slug: "a1", name: "a1", ordinal: 2 });
    await tx.insert(subTopic).values({ boardId: P.id, topicId: alpha!.id, slug: "a2", name: "a2", ordinal: 1 });
    await tx.insert(subTopic).values({ boardId: P.id, topicId: beta!.id, slug: "b1", name: "b1", ordinal: 1 });
  });

  // 2 + 3. tree structure + ordering
  const nav = await withBoard(P.id, (tx) => getChapterNav(tx));
  check("one chapter", nav.length === 1);
  check("two topics", nav[0]?.topics.length === 2);
  check("topics ordinal-ordered (Beta before Alpha)", nav[0]?.topics[0]?.name === "Beta" && nav[0]?.topics[1]?.name === "Alpha");
  check("Beta has 1 sub_topic (b1)", nav[0]?.topics[0]?.subTopics.map((s) => s.name).join() === "b1");
  check("Alpha sub_topics ordinal-ordered (a2 before a1)", nav[0]?.topics[1]?.subTopics.map((s) => s.name).join() === "a2,a1");

  // 4. derived flat order
  check("flat order = [b1, a2, a1]", flatten(nav).join() === "b1,a2,a1");

  // 5. RLS cross-board → empty
  const navQ = await withBoard(Q.id, (tx) => getChapterNav(tx));
  check("RLS: getChapterNav under another board → empty", navQ.length === 0);

  // DASH-FR — `hasContent` says whether getSlide will render or 404. The spine
  // lists chapters whether or not slides were ever published for them, and this
  // fixture publishes NOTHING, so the honest answer is false. The dashboard's
  // first-run CTA aims at the first chapter where this is true; if the flag
  // silently defaulted to true it would aim straight back into a 404.
  check(
    "hasContent === false for a chapter with no published slide module",
    nav.every((c) => c.hasContent === false),
  );

  // ── Slice I — per-sub_topic hasContent ────────────────────────────────────
  //
  // The fixture that matters: a chapter that DOES have a published slide_module
  // but whose manifest publishes only ONE of its two sub_topics. Under the old
  // chapter-level flag this chapter read as "has content" wholesale, and the
  // dashboard happily rendered BOTH sub_topics as pressable rows — one of which
  // 404s. This is the exact shape that bug lives in, so it is the shape the
  // probe pins.
  //
  // Uses the REAL path (content_slide_key → manifest.sections[].topics[].id),
  // not the legacy `manifest.slides` fallback, because real content is the one
  // that ships.
  const pub = await withBoard(P.id, async (tx: Tx) => {
    const [subj2] = await tx
      .insert(subject)
      .values({ boardId: P.id, slug: "chem", name: "Chemistry", grade: "IGCSE" })
      .returning();
    const [chap2] = await tx
      .insert(chapter)
      .values({ boardId: P.id, subjectId: subj2!.id, slug: "ch2", name: "Chapter Two", ordinal: 2 })
      .returning();
    const [tp2] = await tx
      .insert(topic)
      .values({ boardId: P.id, chapterId: chap2!.id, slug: "pub", name: "Pub", ordinal: 1 })
      .returning();
    const [sIn] = await tx
      .insert(subTopic)
      .values({ boardId: P.id, topicId: tp2!.id, slug: "s-in", name: "s-in", ordinal: 1, contentSlideKey: "slide-in" })
      .returning();
    const [sOut] = await tx
      .insert(subTopic)
      .values({ boardId: P.id, topicId: tp2!.id, slug: "s-out", name: "s-out", ordinal: 2, contentSlideKey: "slide-out" })
      .returning();
    const [unit] = await tx
      .insert(contentUnit)
      .values({ boardId: P.id, type: "slide_module", chapterId: chap2!.id, subTopicId: null, source: "starkhorn" })
      .returning();
    const [v1] = await tx
      .insert(contentVersion)
      .values({
        contentUnitId: unit!.id,
        versionNo: 1,
        // Only `slide-in` is published. `slide-out` is declared by the spine
        // and absent from the manifest — the whole point of the fixture.
        body: { contractVersion: "1", manifest: { sections: [{ topics: [{ id: "slide-in" }] }] }, bundle: "/* v1 */" },
        publishedAt: new Date(),
      })
      .returning();
    await tx.update(contentUnit).set({ currentVersionId: v1!.id }).where(eq(contentUnit.id, unit!.id));
    return { sIn: sIn!.id, sOut: sOut!.id, chapterId: chap2!.id };
  });

  const nav2 = await withBoard(P.id, (tx) => getChapterNav(tx));
  const ch2 = nav2.find((c) => c.id === pub.chapterId);
  const ch1 = nav2.find((c) => c.id !== pub.chapterId);
  const stIn = ch2?.topics[0]?.subTopics.find((s) => s.id === pub.sIn);
  const stOut = ch2?.topics[0]?.subTopics.find((s) => s.id === pub.sOut);

  check("Slice I: published sub_topic → hasContent true", stIn?.hasContent === true);
  check("Slice I: UNpublished sub_topic under the SAME chapter → hasContent false", stOut?.hasContent === false);
  check("Slice I: chapter hasContent is DERIVED (one renderable sub_topic ⇒ true)", ch2?.hasContent === true);
  check("Slice I: module-less chapter still false", ch1?.hasContent === false);

  // 🔑 THE agreement claim (M64). Everything above tests the nav against my own
  // reading of the rules. This tests it against the ONLY authority that matters
  // — what getSlide actually does — for every sub_topic on the board, in BOTH
  // directions. A nav that hides openable content fails here just as loudly as
  // one that offers a 404.
  let agree = true;
  for (const c of nav2)
    for (const t of c.topics)
      for (const s of t.subTopics) {
        let opens = false;
        try {
          await withBoard(P.id, (tx) => getSlide(tx, { subTopicId: s.id }));
          opens = true;
        } catch {
          opens = false;
        }
        if (opens !== s.hasContent) {
          agree = false;
          console.error(`      ↳ ${c.name}/${s.name}: nav=${s.hasContent} getSlide=${opens}`);
        }
      }
  check("🔑 Slice I: nav.hasContent agrees with real getSlide for EVERY sub_topic", agree);

  // 6. membership gate, both sides (M11)
  const emailW = `prn-w-${tag}@example.com`;
  const emailX = `prn-x-${tag}@example.com`;
  let noMembership = false;
  try {
    await withBoard(P.id, (tx) => requireMembership(tx, { email: emailX, board: P }));
  } catch (e) {
    noMembership = e instanceof NoMembershipError;
  }
  check("gate: non-member → NoMembershipError", noMembership);

  // grantRole mints only the shell (ID-4); the operational student row is what
  // requireMembership('student') now needs, so insert it (onboarding's output).
  const W = await withBoard(P.id, (tx) => grantRole(tx, { email: emailW, name: "Probe W", board: P, role: "student" }));
  await withBoard(P.id, (tx: Tx) => tx.insert(student).values({ userId: W.user.id, boardId: P.id, class: "9" }));
  const gateRole = await withBoard(P.id, (tx) => requireMembership(tx, { email: emailW, board: P }));
  check("gate: member (created by real flow) → role 'student'", gateRole.role === "student");

  // 7. HTTP no-session → 401 (soft)
  try {
    const res = await fetch(`http://localhost:${env.PORT}/trpc/revision.getChapterNav`, {
      headers: { "x-board": P.slug },
    });
    check(`HTTP getChapterNav (no session) → 401 (got ${res.status})`, res.status === 401);
  } catch {
    console.log("  ~ HTTP getChapterNav skipped (server not running)");
  }

  // cleanup
  await withBoard(P.id, async (tx: Tx) => {
    // Slice I's fixture added a module + version. content_version hangs off
    // content_unit, so it goes first or the delete trips the FK.
    const units = await tx
      .select({ id: contentUnit.id })
      .from(contentUnit)
      .where(eq(contentUnit.boardId, P.id));
    for (const u of units) {
      await tx.update(contentUnit).set({ currentVersionId: null }).where(eq(contentUnit.id, u.id));
      await tx.delete(contentVersion).where(eq(contentVersion.contentUnitId, u.id));
    }
    await tx.delete(contentUnit).where(eq(contentUnit.boardId, P.id));
    await tx.delete(subTopic).where(eq(subTopic.boardId, P.id));
    await tx.delete(topic).where(eq(topic.boardId, P.id));
    await tx.delete(chapter).where(eq(chapter.boardId, P.id));
    await tx.delete(subject).where(eq(subject.boardId, P.id));
    await tx.delete(student).where(eq(student.boardId, P.id));
  });
  await db.delete(appUser).where(eq(appUser.email, emailW));
  await db.delete(board).where(eq(board.id, P.id));
  await db.delete(board).where(eq(board.id, Q.id));

  console.log(`\nprobe_revision_nav: ${passed} passed, ${failed} failed`);
  await queryClient.end();
  process.exit(failed === 0 ? 0 : 1);
}

main().catch(async (err) => {
  console.error("probe_revision_nav FAILED:", err);
  await queryClient.end();
  process.exit(1);
});
