/**
 * import_prod_students — load a READ-ONLY export of prod's real students into
 * the LOCAL database, so the hand-off seed can be rehearsed against the rows it
 * will actually land on top of (S169, founder ask: "simulate the prod before
 * seed prod db").
 *
 * Input is the JSON produced by the read-only export query (kept OUTSIDE this
 * repo — real children's data), default `~/Downloads/prod_students.json`.
 *
 * ⚠️ LOCAL ONLY, like `reset_students.ts`. It refuses a non-localhost host.
 *
 *   bun run import:prod                    # dry run — reports the plan
 *   bun run import:prod -- --execute
 *
 * ── the one hard problem: two spines, two sets of ids ───────────────────────
 * Prod's content rows and local's are DIFFERENT rows for the same curriculum.
 * Every imported evidence row points at prod ids, so each is remapped through a
 * slug chain — subject (slug, grade) → chapter (subject, slug) → topic (chapter,
 * slug) → sub_topic (topic, slug). Where local already has the row, it is REUSED
 * and its id substituted; where it does not, prod's row is inserted verbatim.
 *
 * Every reuse and every insert is printed, because the mismatches are the whole
 * point of the rehearsal. The first run found one that matters: prod's Maths is
 * `maths`/grade 10 and the hand-off seeder writes `mathematics`/grade 10, so
 * seeding prod would file five months of history under a SECOND Maths subject,
 * separate from the live attempts.
 *
 * `board_id` is rewritten on every row — prod's cbse board uuid is not local's.
 */
import { and, eq, inArray, sql } from "drizzle-orm";
import type { PgTransaction } from "drizzle-orm/pg-core";
import {
  appUser,
  assessmentSession,
  attempt,
  attemptImage,
  board,
  chapter,
  crossConceptFlag,
  masteryState,
  observation,
  onboarding,
  parent as parentTable,
  practiceSession,
  question,
  schedulingState,
  student,
  subTopic,
  subject,
  topic,
  tutor as tutorTable,
} from "@b2c/kernel/schema";
import { db, queryClient } from "../src/db/client";
import { withBoard } from "../src/db/with-board";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";

const argv = process.argv.slice(2);
const EXECUTE = argv.includes("--execute");
const fileArg = argv[argv.indexOf("--file") + 1];
const FILE = (argv.includes("--file") && fileArg ? fileArg : "~/Downloads/prod_students.json").replace(
  /^~/,
  homedir(),
);
/** The local adults the imported children are attached to, so the page is viewable. */
const PARENT_EMAIL = "parent@example.com";
const TUTOR_EMAIL = "tutor@example.com";

type Row = Record<string, any>;
type Export = Record<string, any> & { board: string };

function assertLocal() {
  const url = process.env.DATABASE_URL ?? "";
  const host = url.replace(/^.*@/, "").replace(/[:/].*$/, "");
  if (!["localhost", "127.0.0.1", ""].includes(host)) {
    throw new Error(`refusing to write to a non-local database (host: ${host || "?"})`);
  }
}

const camel = (s: string) => s.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;

/**
 * snake_case JSON row → the camelCase object Drizzle wants, with full ISO
 * timestamps revived as Date. A bare `YYYY-MM-DD` is left as a string: those are
 * `date` columns (mastery_snapshot.period, pace_plan.start_date) and Drizzle
 * takes them as strings — turning them into a Date shifts them by a timezone.
 */
// Returns `any` on purpose: the shape is whatever the export carried, and it is
// checked by the database on insert. A static type here would be a guess.
function toDrizzle(row: Row, overrides: Row = {}): any {
  const out: Row = {};
  for (const [k, v] of Object.entries(row)) {
    out[camel(k)] = typeof v === "string" && ISO.test(v) ? new Date(v) : v;
  }
  return { ...out, ...overrides };
}

async function main() {
  assertLocal();
  const data = JSON.parse(readFileSync(FILE, "utf8")) as Export;
  console.log(`import_prod_students ${EXECUTE ? "(EXECUTE)" : "(dry run)"}`);
  console.log(`file: ${FILE}\n`);

  const [localBoard] = await db.select().from(board).where(eq(board.slug, data.board));
  if (!localBoard) throw new Error(`no local board '${data.board}'`);
  const B = localBoard.id;

  // The local adults. Both must already exist (seed:demoparent creates them).
  const [par] = await db
    .select({ id: appUser.id })
    .from(appUser)
    .where(and(eq(appUser.email, PARENT_EMAIL), eq(appUser.userType, "parent")));
  const [tut] = await db
    .select({ id: appUser.id })
    .from(appUser)
    .where(and(eq(appUser.email, TUTOR_EMAIL), eq(appUser.userType, "tutor")));
  if (!par || !tut) throw new Error(`run seed:demoparent first — need ${PARENT_EMAIL} and ${TUTOR_EMAIL}`);

  const kidIds = new Set<string>((data.appUsers as Row[]).map((u) => u.id));

  // ── content: resolve prod ids onto local rows, or insert prod's ───────────
  const map = { subject: new Map<string, string>(), chapter: new Map<string, string>(), topic: new Map<string, string>(), subTopic: new Map<string, string>() };
  const notes: string[] = [];

  await withBoard(B, async (tx) => {
    const resolve = async (
      kind: keyof typeof map,
      rows: Row[],
      table: any,
      match: (r: Row) => any,
      parentCol: string | null,
      parentKind: keyof typeof map | null,
    ) => {
      for (const r of rows) {
        const parentLocal = parentCol && parentKind ? map[parentKind].get(r[parentCol]) : null;
        if (parentCol && !parentLocal) throw new Error(`${kind}: unmapped parent for ${r.slug}`);
        const [hit] = await tx.select({ id: table.id }).from(table).where(match({ ...r, __parent: parentLocal }));
        if (hit) {
          map[kind].set(r.id, hit.id);
          notes.push(`  reuse  ${kind.padEnd(9)} ${r.slug}`);
        } else {
          map[kind].set(r.id, r.id); // keep prod's id — nothing local claims it
          notes.push(`  INSERT ${kind.padEnd(9)} ${r.slug}   ← not in the local spine`);
          if (EXECUTE) {
            await tx.insert(table).values(
              toDrizzle(r, { boardId: B, ...(parentCol ? { [camel(parentCol)]: parentLocal } : {}) }),
            );
          }
        }
      }
    };

    await resolve("subject", data.subjects, subject, (r) => and(eq(subject.slug, r.slug), eq(subject.grade, r.grade)), null, null);
    await resolve("chapter", data.chapters, chapter, (r) => and(eq(chapter.subjectId, r.__parent), eq(chapter.slug, r.slug)), "subject_id", "subject");
    await resolve("topic", data.topics, topic, (r) => and(eq(topic.chapterId, r.__parent), eq(topic.slug, r.slug)), "chapter_id", "chapter");
    await resolve("subTopic", data.subTopics, subTopic, (r) => and(eq(subTopic.topicId, r.__parent), eq(subTopic.slug, r.slug)), "topic_id", "topic");
  });

  console.log("content resolution:");
  for (const n of notes) console.log(n);

  const ST = (prodId: string | null) => (prodId ? (map.subTopic.get(prodId) ?? null) : null);

  console.log(`\nwould import:`);
  for (const [k, label] of [
    ["appUsers", "student profiles"],
    ["questions", "questions"],
    ["sessions", "practice sessions"],
    ["attempts", "attempts"],
    ["attemptImages", "answer photos (rows only — prod storage keys)"],
    ["observations", "observations"],
    ["masteryState", "certified mastery rows"],
    ["schedulingState", "scheduling rows"],
    ["assessmentSessions", "tutor Stage-2 sittings"],
    ["crossConceptFlags", "cross-concept flags"],
  ] as const) {
    console.log(`  ${String((data[k] as Row[]).length).padStart(5)}  ${label}`);
  }

  if (!EXECUTE) {
    console.log(`\nDRY RUN — nothing written. Re-run with --execute.`);
    await queryClient.end();
    return;
  }

  await withBoard(B, async (tx: PgTransaction<any, any, any>) => {
    // identity — the profile ids are prod's, which keeps every evidence row's
    // app_user_id valid without a second map.
    for (const u of data.appUsers as Row[]) {
      await tx.insert(appUser).values(toDrizzle(u)).onConflictDoNothing();
    }
    for (const o of data.onboarding as Row[]) {
      await tx.insert(onboarding).values(toDrizzle(o)).onConflictDoNothing();
    }
    for (const s of data.students as Row[]) {
      await tx.insert(student).values(
        toDrizzle(s, {
          boardId: B,
          // Local adults, so the parent dashboard is reachable at all. Hero/pet
          // are prod rows we did not export; a dangling FK would fail the insert.
          parentId: par.id,
          tutorId: tut.id,
          heroId: null,
          petId: null,
        }),
      ).onConflictDoNothing();
    }

    // content the evidence points at
    for (const q of data.questions as Row[]) {
      await tx.insert(question).values(
        toDrizzle(q, {
          boardId: B,
          subTopicId: ST(q.sub_topic_id),
          // Authored FOR a named student. Prod has questions targeted at students
          // outside this export (Kian) — keeping that id would break the FK, and
          // inventing a different target would be worse. Null means "not
          // student-specific", which is the honest reading of a question whose
          // owner we did not import.
          targetStudentId: kidIds.has(q.target_student_id) ? q.target_student_id : null,
        }),
      ).onConflictDoNothing();
    }

    for (const s of data.sessions as Row[]) {
      await tx.insert(practiceSession).values(
        toDrizzle(s, { boardId: B, subTopicId: ST(s.sub_topic_id) }),
      ).onConflictDoNothing();
    }
    for (const a of data.attempts as Row[]) {
      await tx.insert(attempt).values(toDrizzle(a, { boardId: B })).onConflictDoNothing();
    }
    for (const ai of data.attemptImages as Row[]) {
      await tx.insert(attemptImage).values(toDrizzle(ai, { boardId: B })).onConflictDoNothing();
    }
    for (const o of data.observations as Row[]) {
      await tx.insert(observation).values(
        toDrizzle(o, { boardId: B, subTopicId: ST(o.sub_topic_id) }),
      ).onConflictDoNothing();
    }
    for (const m of data.masteryState as Row[]) {
      await tx.insert(masteryState).values(
        toDrizzle(m, { boardId: B, subTopicId: ST(m.sub_topic_id) }),
      ).onConflictDoNothing();
    }
    for (const s of data.schedulingState as Row[]) {
      await tx.insert(schedulingState).values(
        toDrizzle(s, { boardId: B, subTopicId: ST(s.sub_topic_id) }),
      ).onConflictDoNothing();
    }
    // The Stage-2 SITTINGS the flags cite. These must land BEFORE the flags:
    // `cross_concept_flag_origin_provenance` requires a stage2_synthesis flag to
    // carry its `source_session_id`, because a synthesis claim without the read
    // it came from is unfalsifiable. Nulling the link is refused by the schema —
    // correctly — so the sittings are part of the import, not optional context.
    for (const a of (data.assessmentSessions ?? []) as Row[]) {
      await tx.insert(assessmentSession).values(
        toDrizzle(a, {
          boardId: B,
          subTopicIds: (a.sub_topic_ids as string[]).map((id) => ST(id)).filter(Boolean),
          // The prod tutor's profile is not imported; the local demo tutor owns
          // the sitting so the row is complete and the FK holds.
          tutorId: tut.id,
          assignmentId: null,
        }),
      ).onConflictDoNothing();
    }
    for (const f of data.crossConceptFlags as Row[]) {
      await tx.insert(crossConceptFlag).values(
        toDrizzle(f, { boardId: B, fromSubTopicId: ST(f.from_sub_topic_id) }),
      ).onConflictDoNothing();
    }
  });

  // The parent/tutor role rows must exist for the link to mean anything.
  await db.insert(parentTable).values({ userId: par.id }).onConflictDoNothing();
  await db.insert(tutorTable).values({ userId: tut.id, boards: [B] }).onConflictDoNothing();

  const n = await withBoard(B, async (tx) =>
    tx
      .select({ n: sql<number>`count(*)` })
      .from(attempt)
      .where(inArray(attempt.appUserId, [...kidIds])),
  );
  console.log(`\nimported. ${Number(n[0]?.n ?? 0)} attempts now local for these students.`);
  await queryClient.end();
}

main().catch(async (err) => {
  console.error("import_prod_students FAILED:", err);
  await queryClient.end();
  process.exit(1);
});
