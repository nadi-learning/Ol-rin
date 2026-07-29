/**
 * backfill_dashboard — load a REAL student's parent dashboard from the hand-off
 * file described by `scripts/backfill-parent-dashboard.md`. LOCAL ONLY.
 *
 * Input: the `{ subTopicIndex, students[] }` JSON produced from the old b2c
 * system (five months of real work — attempts, sessions, certified mastery,
 * calibration flags, pace plans). Everything it can't source is either derived
 * from what it CAN source, or deliberately left empty; nothing is invented.
 *
 * Run `scripts/topup_spine_cbse.ts` FIRST — it makes every `subTopicRef` in the
 * file resolvable. This script refuses to write if any ref is still unknown
 * (contract §0: a ref that doesn't exist is silently dropped evidence).
 *
 * ── What is REAL, what is DERIVED, what is EMPTY ─────────────────────────────
 * REAL (straight from the file):
 *   identity · mastery levels + descriptions + certification dates · sessions
 *   (dispatch reason, origin, date) · attempts (confidence, engaged time, date)
 *   · calibration flags · pace plan windows and chapter completion
 * DERIVED (computed here from the above, never guessed):
 *   monthly snapshots — see §snapshots · horizontal skills — a roll-up of the
 *   per-subject certified levels (contract §8's prescribed derivation)
 * EMPTY on purpose:
 *   `weaknesses` — the file ships none ("not yet authored"). A named weakness
 *   plus "the tutor's plan" is a clinical claim attributed to a human, about a
 *   real child, shown to their real parent. It renders as "Nothing flagged right
 *   now", which is TRUE, and loads the moment the authoring side sends them.
 *
 * ── §snapshots — why the file's own numbers are not used ─────────────────────
 * The file carries `snapshots[].solid`, all zeros, computed under the OLD green
 * rule (both axes >= 4). D-PDASH-7 replaced that rule, so those numbers are
 * stale by construction — and a frozen month row computed on one rule sitting
 * under a live total computed on another draws a chart that argues with itself.
 * So each month is recomputed here from `mastery[].updatedAt` + `isSolid`, the
 * SAME predicate the live row uses.
 *   Honest limitation: the file gives one CURRENT level per topic, not a level
 *   history, so a topic is dated by when it was certified and its current level
 *   is applied backwards. Early months therefore read slightly better than they
 *   truly were, and the growth curve is flatter than reality. There is no other
 *   option available from this data, and it is stated on the record here.
 * Also dropped: any month whose recomputed `covered` is 0 (an empty bar reads as
 * a rendering fault) and the CURRENT month (contract §3e — buildTrend replaces
 * it with the live point).
 *
 *   bun scripts/backfill_dashboard.ts --file ~/Downloads/dashboard.json [--execute]
 *
 * Dry-run by default: resolves everything, prints the full plan + the exact
 * numbers the dashboard will show, and writes nothing.
 *
 * IDEMPOTENT: a student's evidence is WIPED and rebuilt on every run (the demo
 * seeder's discipline) — re-runnable safely, and the only way to stay consistent
 * when the upstream file is re-sent.
 */
import { and, eq, inArray, like, sql } from "drizzle-orm";
import {
  appUser,
  attempt,
  board,
  chapter,
  crossConceptFlag,
  horizontalSkill,
  horizontalSkillState,
  masteryHistory,
  masterySnapshot,
  masteryState,
  observation,
  onboarding,
  pacePlan,
  practiceSession,
  question,
  student,
  subTopic,
  subject,
  topic,
} from "@b2c/kernel/schema";
import { isSolid } from "@b2c/kernel/mastery";
import { db, queryClient } from "../src/db/client";
import { withBoard } from "../src/db/with-board";
import { ensureProfile, grantRole } from "../src/services/membership";
// Hand-off email → the address that already exists in our DB. Shared with the
// probe (which matches children back to the file by address) — see the module.
import { resolveEmail } from "./backfill_aliases";
import { assertTarget } from "./prod_guard";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";

// ───────────────────────────── args + guard ─────────────────────────────

const argv = process.argv.slice(2);
const EXECUTE = argv.includes("--execute");
/**
 * KEEP the student's live evidence (S169). ON unless `--replace` is passed.
 *
 * This script imports HISTORY. On prod the students it targets are practising
 * right now, and the default before this flag existed was to delete everything
 * they had done. `--replace` restores that, for a local database being rebuilt.
 */
const KEEP_LIVE = !argv.includes("--replace");
/** Provenance prefix on every mastery row this script writes — see the wipe. */
const BACKFILL_STAMP = "backfilled from old-b2c extraction";
const fileArg = argv[argv.indexOf("--file") + 1];
const FILE = (argv.includes("--file") && fileArg ? fileArg : "~/Downloads/dashboard.json")
  .replace(/^~/, homedir());

/**
 * Targeting production is opt-in and must be typed out — see `prod_guard.ts`.
 * `--replace` is refused there outright: it is the pre-S169 wipe, and the only
 * database it is ever correct on is one being rebuilt from scratch.
 */
const TARGET_PROD = argv.includes("--target-prod");

// ───────────────────────────── the hand-off shape ─────────────────────────────

type IndexEntry = { subject: string; chapter: string; number: string; name: string };
type Mastery = {
  subTopicRef: string;
  conceptual: number | null;
  procedural: number | null;
  description: string;
  updatedAt: string;
};
type Session = {
  subTopicRef: string;
  dispatchReason: string | null;
  origin: string;
  at: string;
};
type Attempt = {
  subTopicRef: string;
  answered: boolean;
  confidence: number | null;
  timeMs: number | null;
  skipReason?: string | null;
  at: string;
};
type Observation = {
  subTopicRef: string;
  axis: string;
  calibrationFlag: string | null;
  at?: string;
};
type Pace = {
  subjectRef: string;
  startDate: string;
  endDate: string;
  chapters: Array<{ chapterRef: string; completed: boolean }>;
};
type StudentIn = {
  email: string;
  name: string;
  board: string;
  class: string;
  pronoun?: string | null;
  onboardingCompleted?: boolean;
  mastery: Mastery[];
  snapshots: Array<{ period: string; covered: number; solid: number }>;
  sessions: Session[];
  attempts: Attempt[];
  observations: Observation[];
  weaknesses: WeaknessIn[];
  horizontals: HorizontalIn[];
  pace: Pace[];
};

/**
 * A TUTOR-AUTHORED weakness (S170) — the §6 "Where {name} is stuck — and what's
 * being done" card, both halves, written by a human for a parent to read.
 *
 * Written as `origin: 'tutor_authored'`, which is the ONLY origin the parent
 * dashboard renders. The machine kinds (`stage1_cross_concept`,
 * `stage2_synthesis`) stay internal — S168 left this array empty on the
 * principle that "a named weakness plus the tutor's plan about a real child is
 * the one thing not to invent", and that still holds: nothing here is derived.
 */
type WeaknessIn = {
  /** What the child is working through. Renders as the note. */
  note: string;
  /**
   * What is being done about it. Renders as "The plan", dated.
   *
   * NULL when no human has written one yet (S174) — the card then shows the
   * note alone and the plan block does not render at all. Deliberately NOT a
   * placeholder string: a placeholder is a sentence a parent reads.
   */
  plan: string | null;
};

/**
 * An AUTHORED horizontal skill (contract §8). When a student carries any, they
 * REPLACE the derived roll-up for that student entirely — a tutor's sentence and
 * a computed mean must not sit on the same slide claiming the same authority.
 */
type HorizontalIn = {
  subjectRef: string;
  slug: string;
  /** 1–5, or null for "not yet observed". */
  level: number | null;
  /** The parent-facing sentence about THIS child. Renders on the card. */
  prose: string;
  /** Taxonomy description. Optional — `parent-copy.ts` carries the generic gloss. */
  definition?: string | null;
};
type HandOff = { subTopicIndex: Record<string, IndexEntry>; students: StudentIn[] };

/** Ours to set (contract §1) — the pace slide needs a tutor on the student. */
const TUTOR_EMAIL = "tutor@example.com";
/** Founder ask: both real students hang off the same local demo parent. */
const PARENT_EMAIL = "parent@example.com";


/** Hand-off subject names → our (slug, grade). Unmapped ⇒ throw, never skip. */
/**
 * Hand-off `subjectRef` → the slugs it may live under, in preference order.
 *
 * TWO slugs, not one (S170): the hand-off writes `mathematics` and `merge:spine`
 * collapses that into prod's `maths`. A single-slug lookup therefore works on a
 * FIRST load and throws on every re-run after a merge — which is exactly the
 * KEEP_LIVE idempotent re-run this script exists to support, and exactly the
 * order prod will be in once its duplicates are merged. Try each; first hit wins.
 */
const SUBJECT_MAP: Record<string, { slugs: string[]; grade: string }> = {
  "Maths 10": { slugs: ["maths", "mathematics"], grade: "10" },
  "Physics 10": { slugs: ["physics"], grade: "10" },
};

/**
 * Derived horizontals (contract §8): two per subject, one reading each axis, so
 * the pair says something the map doesn't. Slugs are chosen from the four the
 * parent copy map already labels (parent-copy.ts) — an unmapped slug would fall
 * back to a prettified label, which reads like a database key to a parent.
 */
const HORIZONTALS: Record<string, Array<{ slug: string; axis: "c" | "p"; definition: string }>> = {
  mathematics: [
    { slug: "algebraic_fluency", axis: "p", definition: "Manipulates and simplifies expressions accurately and without slips." },
    { slug: "notation_discipline", axis: "c", definition: "Keeps every line a true equation — no dropped signs or misused equals." },
  ],
  physics: [
    { slug: "causal_reasoning", axis: "c", definition: "Reasons from a principle to a result, rather than pattern-matching an answer." },
    { slug: "language_precision", axis: "p", definition: "States definitions in full and shows complete working, not shortcuts." },
  ],
};

// ───────────────────────────── helpers ─────────────────────────────

/** See topup_spine_cbse.ts — the hand-off's hyphens are not our em dashes. */
function norm(s: string): string {
  return s.normalize("NFC").trim().toLowerCase().replace(/[—–]/g, "-").replace(/\s+/g, " ");
}
const monthOf = (isoDate: string) => isoDate.slice(0, 7);
const firstOfMonth = (ym: string) => `${ym}-01`;
const atNoon = (isoDate: string) => new Date(`${isoDate}T12:00:00.000Z`);

type Resolved = {
  subTopicId: string;
  subjectId: string;
  subjectSlug: string;
  subjectName: string;
  chapterId: string;
  subTopicName: string;
};

// ───────────────────────────── main ─────────────────────────────

async function main() {
  const raw = JSON.parse(readFileSync(FILE, "utf8")) as HandOff;

  if (TARGET_PROD && !KEEP_LIVE) {
    console.error(
      `REFUSING: --replace against production.\n` +
        `  --replace is the pre-S169 wipe: it deletes every attempt, session,\n` +
        `  observation and certified mastery row the student has. On prod that is\n` +
        `  live work and a tutor's sign-off. It is only ever correct on a local\n` +
        `  database being rebuilt from scratch.`,
    );
    process.exit(1);
  }
  await assertTarget({
    argv,
    what: "load old-b2c history onto these students' dashboards (KEEP_LIVE — existing evidence is preserved)",
    affects: raw.students.map((s) => `${s.name} <${resolveEmail(s.email)}>`),
  });

  console.log(`hand-off: ${FILE}\n`);

  const [cbse] = await db.select().from(board).where(eq(board.slug, "cbse"));
  if (!cbse) throw new Error("board 'cbse' not found");

  // ── resolve every ref up front; abort before any write if one is unknown ──
  const spine = await withBoard(cbse.id, (tx) =>
    tx
      .select({
        subTopicId: subTopic.id,
        subTopicName: subTopic.name,
        subOrdinal: subTopic.ordinal,
        topicOrdinal: topic.ordinal,
        chapterId: chapter.id,
        chapterName: chapter.name,
        subjectId: subject.id,
        subjectSlug: subject.slug,
        subjectName: subject.name,
        grade: subject.grade,
      })
      .from(subTopic)
      .innerJoin(topic, eq(topic.id, subTopic.topicId))
      .innerJoin(chapter, eq(chapter.id, topic.chapterId))
      .innerJoin(subject, eq(subject.id, chapter.subjectId)),
  );
  const spineByKey = new Map<string, (typeof spine)[number]>();
  for (const r of spine) {
    spineByKey.set(`${norm(r.chapterName)}::${r.topicOrdinal}.${r.subOrdinal}::${norm(r.subTopicName)}`, r);
  }

  const refToSpine = new Map<string, Resolved>();
  const unresolved: string[] = [];
  for (const [ref, e] of Object.entries(raw.subTopicIndex)) {
    const hit = spineByKey.get(`${norm(e.chapter)}::${e.number}::${norm(e.name)}`);
    if (!hit) {
      unresolved.push(ref);
      continue;
    }
    refToSpine.set(ref, {
      subTopicId: hit.subTopicId,
      subjectId: hit.subjectId,
      subjectSlug: hit.subjectSlug,
      subjectName: hit.subjectName,
      chapterId: hit.chapterId,
      subTopicName: hit.subTopicName,
    });
  }
  if (unresolved.length) {
    console.error(`ABORT — ${unresolved.length} refs do not resolve on cbse. Run topup_spine_cbse.ts first:`);
    for (const u of unresolved) console.error(`  ! ${u}`);
    process.exit(1);
  }
  console.log(`refs: ${refToSpine.size}/${Object.keys(raw.subTopicIndex).length} resolved\n`);

  // Budget per subject — what the growth bar's fixed scale will be.
  const budget = new Map<string, number>();
  for (const r of spine) budget.set(r.subjectId, (budget.get(r.subjectId) ?? 0) + 1);

  for (const s of raw.students) {
    await loadStudent(cbse, s, refToSpine, budget, raw.subTopicIndex);
  }

  if (!EXECUTE) console.log(`\nDRY RUN — nothing written. Re-run with --execute.`);
}

async function loadStudent(
  boardRow: { id: string; slug: string },
  s: StudentIn,
  refToSpine: Map<string, Resolved>,
  budget: Map<string, number>,
  /** The file's own index — the only place a ref's SOURCE subject name lives. */
  subTopicIndex: Record<string, IndexEntry>,
) {
  console.log(`═══ ${s.name}  <${s.email}>  class ${s.class} ═══`);
  if (s.board !== boardRow.slug) throw new Error(`student board ${s.board} != ${boardRow.slug}`);

  // Resolved ONCE, here, so the dry-run prints the address it would actually
  // write — the alias must not be a surprise that only shows up under --execute.
  const email = resolveEmail(s.email);
  if (email !== s.email) {
    console.log(`  ↪ email alias: ${s.email} → ${email} (same child, existing profile)`);
  }

  const R = (ref: string) => {
    const r = refToSpine.get(ref);
    if (!r) throw new Error(`unresolved ref reached the writer: ${ref}`);
    return r;
  };

  // ── the numbers this will produce, computed BEFORE writing ──
  const solidRows = s.mastery.filter((m) => isSolid(m.conceptual, m.procedural));
  const subjectIds = new Set(s.mastery.map((m) => R(m.subTopicRef).subjectId));
  const totalBudget = [...subjectIds].reduce((n, id) => n + (budget.get(id) ?? 0), 0);

  // Monthly recompute — see the §snapshots note in the header.
  const currentMonth = monthOf(new Date().toISOString().slice(0, 10));
  const months = [...new Set(s.mastery.map((m) => monthOf(m.updatedAt)))].sort();
  const allMonths: string[] = [];
  if (months.length) {
    const [y0, m0] = months[0]!.split("-").map(Number);
    const cur = new Date(Date.UTC(y0!, m0! - 1, 1));
    const end = new Date(`${currentMonth}-01T00:00:00Z`);
    while (cur < end) {
      allMonths.push(cur.toISOString().slice(0, 7));
      cur.setUTCMonth(cur.getUTCMonth() + 1);
    }
  }
  const snapshots = allMonths
    .map((ym) => ({
      period: firstOfMonth(ym),
      covered: s.mastery.filter((m) => monthOf(m.updatedAt) <= ym).length,
      solid: solidRows.filter((m) => monthOf(m.updatedAt) <= ym).length,
    }))
    .filter((r) => r.covered > 0);

  console.log(
    `  mastery ${s.mastery.length} rows · solid ${solidRows.length} · budget ${totalBudget}` +
      ` → bar: ${solidRows.length} solid / ${s.mastery.length - solidRows.length} practising / ${totalBudget - s.mastery.length} not started`,
  );
  for (const sn of snapshots) console.log(`    ${sn.period}  covered ${sn.covered}  solid ${sn.solid}`);
  const last = snapshots[snapshots.length - 1];
  if (last && (last.covered >= s.mastery.length || last.solid > solidRows.length)) {
    // Contract §3d — the newest bar must sit strictly INSIDE the live total, or
    // the chart draws a month wider than the row above it and reads as broken.
    console.error(`  ✗ newest snapshot is not below the live row — refusing`);
    process.exit(1);
  }

  // ── attempt/session/observation binding, all resolved before writing ──
  const sessionKey = (ref: string, at: string) => `${ref}|${at}`;
  const sessionsWanted = new Map<string, Session>();
  for (const sess of s.sessions) sessionsWanted.set(sessionKey(sess.subTopicRef, sess.at), sess);
  // An attempt whose (ref, date) has no session in the file still happened — it
  // gets a minted session so its REAL date survives into the heatmap rather than
  // being pulled onto some other day's session.
  let minted = 0;
  for (const a of s.attempts) {
    const k = sessionKey(a.subTopicRef, a.at);
    if (!sessionsWanted.has(k)) {
      sessionsWanted.set(k, { subTopicRef: a.subTopicRef, dispatchReason: null, origin: "tutor_assigned", at: a.at });
      minted++;
    }
  }
  console.log(`  sessions ${s.sessions.length} from file + ${minted} minted for orphan attempt dates`);

  // Observations bind to a confidence-bearing attempt on the same (ref, date):
  // readCalibration INNER JOINs observation → attempt and requires a non-null
  // confidence, so an unbound flag is invisible rather than wrong.
  const confAttemptAt = new Set(
    s.attempts.filter((a) => a.confidence != null).map((a) => sessionKey(a.subTopicRef, a.at)),
  );
  const bindable = s.observations.filter((o) => o.at && confAttemptAt.has(sessionKey(o.subTopicRef, o.at)));
  const dropped = s.observations.length - bindable.length;
  console.log(
    `  observations ${s.observations.length} → ${bindable.length} bound` +
      (dropped ? ` · ${dropped} DROPPED (no confidence-rated answer on that sub-topic/date)` : ""),
  );

  const answered = s.attempts.filter((a) => a.answered).length;
  const withConf = s.attempts.filter((a) => a.answered && a.confidence != null).length;
  console.log(
    `  attempts ${s.attempts.length} (${answered} answered, ${withConf} confidence-rated)` +
      ` → calibration ${withConf >= 10 ? "SHOWN" : "HIDDEN (<10)"}`,
  );

  if (!EXECUTE) {
    console.log(`  weaknesses: ${s.weaknesses.length} in file → section stays empty (see header)`);
    console.log();
    return;
  }

  // ───────────────────────────── write ─────────────────────────────
  const b = boardRow;
  // Only the STUDENT identity is resolved up front. The demo tutor and demo
  // parent are created lazily on the insert branch below — see B6 in the
  // prod-seed runbook: resolving them here minted `tutor@example.com` and
  // `parent@example.com` as real profiles on whatever database this ran against,
  // whether or not anything ended up pointing at them.
  const studentUserId = await withBoard(b.id, async (tx) => {
    const stu = await grantRole(tx, { email, name: s.name, board: b, role: "student" });
    return stu.user.id;
  });

  // The student's REAL tutor, captured for `plan_by` on any authored weakness —
  // attribution must name the human who wrote it, never the importer.
  let tutorForWeakness: string | null = null;
  await withBoard(b.id, async (tx) => {
    const [existing] = await tx
      .select({ userId: student.userId, tutorId: student.tutorId, parentId: student.parentId })
      .from(student)
      .where(eq(student.userId, studentUserId));
    tutorForWeakness = existing?.tutorId ?? null;
    // Facts about the child that the hand-off legitimately owns.
    const values = {
      class: s.class,
      pronoun: s.pronoun ?? "they",
      status: "active" as const,
      onboardingAt: s.onboardingCompleted === false ? null : new Date(),
    };

    if (existing) {
      // 🔴 tutorId / parentId are NOT in `values` and must never be (B6). This
      // script imports HISTORY; who teaches a child and who their parent is are
      // RELATIONSHIPS the live system owns. Setting them here repointed both
      // real students from their actual tutor to "Demo Tutor" — the human whose
      // sign-off is the only certified mastery on this system. KEEP_LIVE already
      // says the past must not overwrite the present for evidence; identity is
      // the same rule one level up.
      await tx.update(student).set(values).where(eq(student.userId, studentUserId));
      console.log(
        `  identity PRESERVED — tutor ${existing.tutorId ?? "(none)"}, parent ${existing.parentId ?? "(none)"}`,
      );
    } else {
      // A student this database has never seen. The pace slide needs a tutor, so
      // local seeding attaches the demo pair. On prod that would be inventing
      // both a teacher and a parent for a real child — refuse and let a human
      // create the student properly first.
      if (TARGET_PROD) {
        throw new Error(
          `${email} does not exist on this database. Refusing to create a student ` +
            `and attach a demo tutor/parent to them on production — create the ` +
            `student and their tutor link first, then re-run.`,
        );
      }
      const tut = await grantRole(tx, { email: TUTOR_EMAIL, name: "Demo Tutor", board: b, role: "tutor" });
      const par = await ensureProfile(tx, { email: PARENT_EMAIL, name: "Demo Parent", userType: "parent" });
      await tx.insert(student).values({
        userId: studentUserId,
        boardId: b.id,
        ...values,
        tutorId: tut.user.id,
        parentId: par.id,
      });
    }
    // The app gates on a completed onboarding row, not just student.onboarding_at.
    const ob = await tx.select().from(onboarding).where(eq(onboarding.userId, studentUserId));
    if (!ob.length) {
      await tx.insert(onboarding).values({ userId: studentUserId, status: "completed", state: "done" });
    } else {
      await tx
        .update(onboarding)
        .set({ status: "completed", state: "done" })
        .where(eq(onboarding.userId, studentUserId));
    }
  });

  // ── WIPE this student's evidence, child-first (FKs are restrict, not cascade) ──
  //
  // 🔴 S169, found by rehearsing this script against REAL PROD ROWS. Two faults,
  // both invisible against the S168 local data and both fatal on prod:
  //
  //  1. ORDER. `cross_concept_flag.source_observation_id` → observation, so the
  //     flags must go FIRST. Locally there were never any flags (the hand-off
  //     leaves weaknesses empty), so deleting observations first always worked.
  //     Prod's Stage-1 has produced flags, and the delete ABORTED on the FK.
  //
  //  2. SCOPE. This deletes everything the student has ever done — on prod that
  //     is live work: 23 attempts, 29 observations and 7 sessions for one child,
  //     logged this week. A history import must not destroy the present. Hence
  //     KEEP_LIVE (default ON): the imported mastery is still replaced, because
  //     re-running must not double it, but nothing a student actually DID is
  //     touched. Pass `--replace` for the old behaviour, which is only ever
  //     right on a local database you are rebuilding from scratch.
  await withBoard(b.id, async (tx) => {
    if (!KEEP_LIVE) {
      const sessionIds = (
        await tx
          .select({ id: practiceSession.id })
          .from(practiceSession)
          .where(eq(practiceSession.appUserId, studentUserId))
      ).map((r) => r.id);
      await tx.delete(crossConceptFlag).where(eq(crossConceptFlag.studentId, studentUserId));
      await tx.delete(observation).where(eq(observation.studentId, studentUserId));
      await tx.delete(attempt).where(eq(attempt.appUserId, studentUserId));
      if (sessionIds.length) await tx.delete(practiceSession).where(inArray(practiceSession.id, sessionIds));
    }
    await tx.delete(masteryHistory).where(eq(masteryHistory.studentId, studentUserId));
    // Mastery is replaced so a re-run cannot double it — but under KEEP_LIVE only
    // the rows THIS script wrote. `log` carries the provenance stamp set below,
    // and it is the only way to tell an imported row from one a tutor certified
    // in a real Stage-2 sitting. Deleting the latter would throw away the only
    // mastery on this system that a human actually signed off.
    await tx
      .delete(masteryState)
      .where(
        KEEP_LIVE
          ? and(eq(masteryState.studentId, studentUserId), like(masteryState.log, `${BACKFILL_STAMP}%`))
          : eq(masteryState.studentId, studentUserId),
      );
    // Snapshots are FROZEN monthly rows (first-capture-wins, D-CLK-2). Under
    // KEEP_LIVE the ones the monthly job already captured on prod stay put and
    // the recompute below skips their periods — a frozen number that later moves
    // is exactly what that decision exists to prevent.
    if (!KEEP_LIVE) {
      await tx.delete(masterySnapshot).where(eq(masterySnapshot.studentId, studentUserId));
    }
    await tx.delete(horizontalSkillState).where(eq(horizontalSkillState.studentId, studentUserId));
    await tx.delete(pacePlan).where(eq(pacePlan.appUserId, studentUserId));
  });

  // MASTERY
  await withBoard(b.id, async (tx) => {
    for (const m of s.mastery) {
      await tx.insert(masteryState).values({
        boardId: b.id,
        studentId: studentUserId,
        subTopicId: R(m.subTopicRef).subTopicId,
        conceptualLevel: m.conceptual,
        proceduralLevel: m.procedural,
        description: m.description,
        // `log` is the INTERNAL agent blob and is never shown to a parent (M11).
        // There is no upstream source for it; say so rather than echoing the
        // parent-facing description into a field that means something else.
        log: `${BACKFILL_STAMP} ${m.updatedAt}; no agent log exists for this row`,
        updatedAt: atNoon(m.updatedAt),
      })
        // S169: a LIVE row for this sub_topic wins. `mastery_state` is unique on
        // (student, sub_topic), and a live row got there through a tutor's real
        // Stage-2 finalize — a judgement about this child, made here, by a human.
        // An import of a level from the previous system does not overrule it.
        // Under `--replace` there is nothing left to conflict with.
        .onConflictDoNothing();
    }
  });

  // SNAPSHOTS (recomputed — see header)
  await withBoard(b.id, async (tx) => {
    for (const sn of snapshots) {
      const perSubject = [...subjectIds].map((sid) => {
        const rows = s.mastery.filter((m) => R(m.subTopicRef).subjectId === sid && monthOf(m.updatedAt) <= sn.period.slice(0, 7));
        return {
          subjectId: sid,
          subjectName: s.mastery.map((m) => R(m.subTopicRef)).find((r) => r.subjectId === sid)?.subjectName ?? "",
          covered: rows.length,
          solid: rows.filter((m) => isSolid(m.conceptual, m.procedural)).length,
        };
      });
      await tx
        .insert(masterySnapshot)
        .values({
          boardId: b.id,
          studentId: studentUserId,
          period: sn.period,
          coveredCount: sn.covered,
          solidCount: sn.solid,
          metrics: { perSubject }, // NOT NULL jsonb (contract §3e)
        })
        // S169: FIRST CAPTURE WINS (D-CLK-2). Under KEEP_LIVE the monthly job may
        // already have frozen this period on prod; that row is the number a
        // parent was shown, and overwriting it makes a "was N last month" line
        // change retroactively — the precise thing D-CLK-2 exists to forbid.
        .onConflictDoNothing();
    }
  });

  // QUESTIONS — one synthetic stand-in per sub_topic. `attempt.question_id` is
  // NOT NULL; the old system's question text is not in the hand-off and is never
  // rendered on the parent surface, so a per-topic stand-in carries the FK
  // without pretending to be the item the child actually saw.
  const qBySubTopic = new Map<string, string>();
  await withBoard(b.id, async (tx) => {
    for (const ref of new Set(s.attempts.map((a) => a.subTopicRef))) {
      const r = R(ref);
      const [q] = await tx
        .insert(question)
        .values({
          boardId: b.id,
          subTopicId: r.subTopicId,
          axis: "both",
          kind: "subjective",
          stem: `Backfilled practice item — ${r.subTopicName}`,
          referenceAnswer: "(not carried by the old-b2c extraction)",
          pedagogicalNote: "backfill stand-in: satisfies attempt.question_id, never rendered",
          ordinal: 1,
          source: "b2c_authoring",
          targetStudentId: studentUserId, // private — keeps it out of the shared bank
        })
        .returning();
      qBySubTopic.set(ref, q!.id);
    }
  });

  // SESSIONS + ATTEMPTS + OBSERVATIONS
  const sessionIdByKey = new Map<string, string>();
  await withBoard(b.id, async (tx) => {
    for (const [k, sess] of sessionsWanted) {
      const r = R(sess.subTopicRef);
      const qid = qBySubTopic.get(sess.subTopicRef);
      const [ps] = await tx
        .insert(practiceSession)
        .values({
          boardId: b.id,
          appUserId: studentUserId,
          subTopicId: r.subTopicId,
          questionIds: qid ? [qid] : [],
          currentIndex: qid ? 1 : 0,
          status: "completed",
          origin: sess.origin,
          dispatchReason: sess.dispatchReason,
          createdAt: atNoon(sess.at),
        })
        .returning();
      sessionIdByKey.set(k, ps!.id);
    }
  });

  const attemptIdByKey = new Map<string, string>(); // first attempt per (ref,date) w/ confidence
  await withBoard(b.id, async (tx) => {
    for (const a of s.attempts) {
      const k = sessionKey(a.subTopicRef, a.at);
      const [row] = await tx
        .insert(attempt)
        .values({
          boardId: b.id,
          practiceSessionId: sessionIdByKey.get(k)!,
          questionId: qBySubTopic.get(a.subTopicRef)!,
          appUserId: studentUserId,
          answerText: a.answered ? "(answer text not carried by the old-b2c extraction)" : null,
          confidence: a.answered ? a.confidence : null,
          timeMs: a.answered ? a.timeMs : null,
          skipReason: a.answered ? null : (a.skipReason ?? "unspecified"),
          submittedAt: atNoon(a.at),
        })
        .returning();
      if (a.confidence != null && !attemptIdByKey.has(k)) attemptIdByKey.set(k, row!.id);
    }
  });

  await withBoard(b.id, async (tx) => {
    for (const o of bindable) {
      const k = sessionKey(o.subTopicRef, o.at!);
      await tx.insert(observation).values({
        boardId: b.id,
        studentId: studentUserId,
        subTopicId: R(o.subTopicRef).subTopicId,
        questionId: qBySubTopic.get(o.subTopicRef) ?? null,
        attemptId: attemptIdByKey.get(k)!,
        axis: o.axis,
        // NOT NULL and with no upstream source. The parent surface reads only the
        // calibration flag off this row — `observationLevel`/`reasoning` never
        // leave the server (M11) — so they carry provenance, not a fabricated read.
        observationLevel: 3,
        reasoning: "backfilled from old-b2c calibration flag; no Stage-1 reasoning exists",
        calibrationFlag: o.calibrationFlag,
        source: "stage1_scorer",
        createdAt: atNoon(o.at!),
      });
    }
  });

  // WEAKNESSES — tutor-authored only. Nothing is derived here and nothing is
  // inferred: if the file carries none, the section renders "Nothing flagged
  // right now", which is TRUE, and stays that way until a human writes one.
  const authoredW = Array.isArray(s.weaknesses) ? s.weaknesses : [];
  if (authoredW.length) {
    await withBoard(b.id, async (tx) => {
      // Replace THIS importer's own rows first (S174). Under KEEP_LIVE — the
      // only mode prod allows — the bulk wipe above is skipped, so without this
      // a re-run APPENDS and the parent sees the same weakness twice. That is
      // the exact double the KEEP_LIVE comment says must not happen; mastery was
      // covered, weaknesses were not.
      //
      // Scoped to `tutor_authored` on purpose: the machine origins
      // (`stage1_cross_concept`, `stage2_synthesis`) are staff's Stage-1/2
      // output, never rendered to a parent, and not this script's to delete.
      const removed = await tx
        .delete(crossConceptFlag)
        .where(
          and(
            eq(crossConceptFlag.studentId, studentUserId),
            eq(crossConceptFlag.origin, "tutor_authored"),
          ),
        )
        .returning({ id: crossConceptFlag.id });
      if (removed.length) console.log(`  weaknesses: replaced ${removed.length} prior authored row(s)`);
      for (const w of authoredW) {
        await tx.insert(crossConceptFlag).values({
          boardId: b.id,
          studentId: studentUserId,
          origin: "tutor_authored",
          note: w.note,
          plan: w.plan,
          planUpdatedAt: new Date(),
          planBy: tutorForWeakness,
        });
      }
      console.log(`  weaknesses: ${authoredW.length} AUTHORED`);
    });
  }

  // HORIZONTALS — AUTHORED when the file carries any, else the derived roll-up
  // (contract §8). Authored wins for the WHOLE student, never per-slug: mixing a
  // tutor's observation with a computed mean on one slide gives the average the
  // same voice as the judgement, and a parent cannot tell which is which.
  const authoredH = Array.isArray(s.horizontals) ? s.horizontals : [];
  if (authoredH.length) {
    await withBoard(b.id, async (tx) => {
      for (const h of authoredH) {
        // Resolve the subject THROUGH THE CHILD'S OWN MASTERY, not through
        // SUBJECT_MAP. The map holds the hand-off's slugs (`mathematics`), and
        // `merge:spine` collapses those into prod's (`maths`) — so a slug lookup
        // works on a fresh load and throws on any re-run after a merge. The
        // mastery refs always point at wherever the spine actually is, and this
        // also guarantees the skill lands on a subject the child really studies.
        const anchor = s.mastery
          .map((x) => ({ ref: x.subTopicRef, r: R(x.subTopicRef) }))
          .find(({ ref }) => subTopicIndex[ref]?.subject === h.subjectRef)?.r;
        if (!anchor) {
          // No mastery in that subject ⇒ no subject panel at read time ⇒ the card
          // would never render. Refuse rather than write an invisible row.
          throw new Error(
            `horizontal ${h.slug}: no certified mastery in ${h.subjectRef}, so the card could never render`,
          );
        }
        const subj = { id: anchor.subjectId };
        if (!subjectIds.has(subj.id)) {
          console.log(`  ⚠️ horizontal ${h.slug}: ${h.subjectRef} is not an in-scope subject — it will NOT render`);
        }
        await tx
          .insert(horizontalSkill)
          .values({
            boardId: b.id,
            subjectId: subj.id,
            chapterId: anchor.chapterId,
            slug: h.slug,
            description: h.definition ?? h.prose,
          })
          .onConflictDoNothing();
        await tx.insert(horizontalSkillState).values({
          boardId: b.id,
          studentId: studentUserId,
          subjectId: subj.id,
          slug: h.slug,
          level: h.level,
          prose: h.prose,
        });
      }
      console.log(`  horizontals: ${authoredH.length} AUTHORED (derived roll-up skipped)`);
    });
  } else await withBoard(b.id, async (tx) => {
    for (const sid of subjectIds) {
      const rows = s.mastery.filter((m) => R(m.subTopicRef).subjectId === sid);
      const anyRef = rows[0]!;
      const meta = R(anyRef.subTopicRef);
      const specs = HORIZONTALS[meta.subjectSlug];
      if (!specs) continue;
      for (const spec of specs) {
        const levels = rows
          .map((m) => (spec.axis === "c" ? m.conceptual : m.procedural))
          .filter((l): l is number => l != null);
        if (!levels.length) continue;
        const mean = levels.reduce((n, l) => n + l, 0) / levels.length;
        const level = Math.max(1, Math.min(5, Math.round(mean)));
        const [skill] = await tx
          .insert(horizontalSkill)
          .values({
            boardId: b.id,
            subjectId: sid,
            chapterId: meta.chapterId, // taxonomy anchor (contract §8)
            slug: spec.slug,
            description: spec.definition,
          })
          .onConflictDoNothing()
          .returning();
        void skill;
        await tx.insert(horizontalSkillState).values({
          boardId: b.id,
          studentId: studentUserId,
          subjectId: sid,
          slug: spec.slug,
          level,
          prose: `Rolled up from the ${spec.axis === "c" ? "conceptual" : "procedural"} level of ${levels.length} certified ${meta.subjectName} topics (mean ${mean.toFixed(1)} of 5).`,
        });
      }
    }
  });

  // PACE — chapters that don't exist locally are DROPPED, loudly.
  await withBoard(b.id, async (tx) => {
    for (const p of s.pace) {
      const m = SUBJECT_MAP[p.subjectRef];
      if (!m) throw new Error(`unmapped subjectRef ${p.subjectRef}`);
      const [subj] = await tx
        .select({ id: subject.id })
        .from(subject)
        .where(and(inArray(subject.slug, m.slugs), eq(subject.grade, m.grade)));
      if (!subj) throw new Error(`subject ${m.slugs.join("|")} g${m.grade} missing`);
      const chapters = await tx
        .select({ id: chapter.id, name: chapter.name })
        .from(chapter)
        .where(eq(chapter.subjectId, subj.id));
      const byName = new Map(chapters.map((c) => [norm(c.name), c.id]));
      const kept: Array<{ chapterId: string; completed: boolean }> = [];
      const missing: string[] = [];
      for (const c of p.chapters) {
        const id = byName.get(norm(c.chapterRef));
        if (!id) missing.push(c.chapterRef);
        else kept.push({ chapterId: id, completed: c.completed });
      }
      if (missing.length) console.log(`  ⚠️ pace ${p.subjectRef}: dropped ${missing.length} unknown chapters: ${missing.join(", ")}`);
      await tx.insert(pacePlan).values({
        boardId: b.id,
        appUserId: studentUserId,
        subjectId: subj.id,
        startDate: p.startDate,
        endDate: p.endDate,
        chapters: kept,
        setupCompletedAt: new Date(),
      });
      console.log(`  pace ${p.subjectRef}: ${kept.length} chapters, ${p.startDate} → ${p.endDate}`);
    }
  });

  console.log(`  ✓ written\n`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => queryClient.end());
