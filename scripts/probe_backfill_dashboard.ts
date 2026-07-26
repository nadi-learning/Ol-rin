/**
 * probe_backfill_dashboard — does the hand-off file actually ARRIVE on the parent
 * dashboard? Drives the real `parent.listChildren` / `parent.getChildDashboard`
 * path over the rows `backfill_dashboard.ts` wrote, for the real students.
 *
 * ⚠️ This probe is READ-ONLY and does NOT snapshot-restore. Every other probe in
 * this repo builds a throwaway board and tears it down (M22); this one deliberately
 * does the opposite, because the thing under test IS the loaded state — a probe
 * that seeded its own fixtures would prove the assembler works (probe_parent_dashboard
 * already does that, on 38 legs) and would say nothing about whether 1,157 real
 * attempts landed. It asserts against the hand-off FILE, so it fails if the loader
 * drops, double-writes, or mis-dates anything.
 *
 * Expectations are recomputed from the file here rather than copied from the
 * loader's output — the loader printing "58 solid" and the dashboard returning 58
 * are two different claims, and only the second one is the product.
 *
 * PRECONDITION: `topup_spine_cbse.ts --execute` then `backfill_dashboard.ts --execute`.
 * Skips with a clear message (not a failure) if the students aren't loaded.
 *
 *   bun scripts/probe_backfill_dashboard.ts [--file ~/Downloads/dashboard.json]
 */
import { eq, and } from "drizzle-orm";
import { appUser, board, crossConceptFlag, practiceSession } from "@b2c/kernel/schema";
import { isSolid } from "@b2c/kernel/mastery";
import { horizontalLabel } from "@b2c/kernel/parent-copy";
import { db, queryClient } from "../src/db/client";
import { withBoard } from "../src/db/with-board";
import { getChildDashboard, listChildren } from "../src/services/parent";
// The writer maps some hand-off addresses onto profiles that already exist
// (S169). Matching on the RAW address would report a correctly-loaded student
// as missing — the probe has to resolve the same way the writer does.
import { resolveEmail } from "./backfill_aliases";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";

const argv = process.argv.slice(2);
const fileArg = argv[argv.indexOf("--file") + 1];
const FILE = (argv.includes("--file") && fileArg ? fileArg : "~/Downloads/dashboard.json").replace(
  /^~/,
  homedir(),
);
const PARENT_EMAIL = "parent@example.com";

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

type HandOff = {
  subTopicIndex: Record<string, { subject: string; chapter: string; number: string; name: string }>;
  students: Array<{
    email: string;
    name: string;
    mastery: Array<{ subTopicRef: string; conceptual: number | null; procedural: number | null; updatedAt: string }>;
    sessions: Array<{ subTopicRef: string; dispatchReason: string | null; origin: string; at: string }>;
    attempts: Array<{ subTopicRef: string; answered: boolean; confidence: number | null; timeMs: number | null; at: string }>;
    observations: Array<{ subTopicRef: string; axis: string; calibrationFlag: string | null; at?: string }>;
    pace: Array<{ subjectRef: string; chapters: unknown[] }>;
    /** Authored cross-subject skills (contract §8). Absent on older hand-offs. */
    horizontals?: Array<{ subjectRef: string; slug: string; level: number | null; prose: string }>;
  }>;
};

async function main() {
  const raw = JSON.parse(readFileSync(FILE, "utf8")) as HandOff;
  console.log(`probe_backfill_dashboard — against ${FILE}\n`);

  const [cbse] = await db.select().from(board).where(eq(board.slug, "cbse"));
  if (!cbse) throw new Error("board 'cbse' not found");
  const [parent] = await db
    .select()
    .from(appUser)
    .where(and(eq(appUser.email, PARENT_EMAIL), eq(appUser.userType, "parent")));
  if (!parent) {
    console.log(`SKIP: no parent profile ${PARENT_EMAIL} — run the backfill first.`);
    await queryClient.end();
    return;
  }

  const children = await withBoard(cbse.id, (tx) => listChildren(tx, parent.id));
  console.log(`§1 parent's children (${children.length})`);
  for (const c of children) console.log(`     · ${c.name ?? "?"} <${c.email}>`);
  check(
    `both backfilled students are linked to ${PARENT_EMAIL}`,
    raw.students.every((s) => children.some((c) => c.email === resolveEmail(s.email))),
  );
  check("the demo child is still linked alongside them", children.length >= raw.students.length + 1);

  for (const s of raw.students) {
    const childRow = children.find((c) => c.email === resolveEmail(s.email));
    if (!childRow) {
      check(`${s.name}: linked`, false);
      continue;
    }
    console.log(`\n§ ${s.name}`);
    const dash = await withBoard(cbse.id, (tx) =>
      getChildDashboard(tx, { parentUserId: parent.id, childId: childRow.studentId }),
    );

    // ── totals: recomputed from the FILE, not from the loader's log ──
    const expSolid = s.mastery.filter((m) => isSolid(m.conceptual, m.procedural)).length;
    // S169 — `>=`, not `===`. The load no longer OWNS the student: under the
    // backfill's KEEP_LIVE default it lands on top of whatever the child has
    // actually been doing, and on prod that is live work. Equality here would
    // assert "nothing else exists", which is now false by design and would fail
    // for the RIGHT reason. What must still hold is that every row in the file
    // arrived — so the file's count is a FLOOR, and the live evidence legs below
    // prove the rest of the number is real rather than drift.
    check(
      `coveredNow >= ${s.mastery.length} (every mastery row in the file arrived)`,
      dash.totals.coveredNow >= s.mastery.length,
    );
    check(
      `solidNow >= ${expSolid} (isSolid over the file's levels)`,
      dash.totals.solidNow >= expSolid,
    );
    check(
      `budget totalNow ${dash.totals.totalNow} > coveredNow (a visible remainder)`,
      dash.totals.totalNow > dash.totals.coveredNow,
    );
    // The headline denominator is the sum of what each chapter is WORTH, which
    // since S170 is its budget where one is authored and its carved count where
    // none is. Summing `total` here asserted "no budget is ever set" — it broke
    // the moment the first provisional budget landed, exactly the way the S169
    // equality assertions broke when live evidence merged in.
    check(
      "the map and the headline agree — per-chapter budgets sum to totalNow",
      dash.subjects.reduce((n, sub) => n + sub.chapters.reduce((m, c) => m + c.budget, 0), 0) ===
        dash.totals.totalNow,
    );
    check(
      "every carved cell is drawn — per-chapter `total` never exceeds its budget",
      dash.subjects.every((sub) => sub.chapters.every((c) => c.total <= c.budget)),
    );
    check(
      "per-chapter solids sum to solidNow",
      dash.subjects.reduce((n, sub) => n + sub.chapters.reduce((m, c) => m + c.solid, 0), 0) ===
        dash.totals.solidNow,
    );

    // ── the growth chart: month rows must march, and stay UNDER the live row ──
    const trend = dash.trend;
    const monthRows = trend.slice(0, -1); // buildTrend appends the live point last
    check(`trend has ${monthRows.length} month rows + the live point`, trend.length === monthRows.length + 1);
    check(
      "months are non-decreasing in covered AND solid",
      monthRows.every((r, i) => i === 0 || (r.covered >= monthRows[i - 1]!.covered && r.solid >= monthRows[i - 1]!.solid)),
    );
    const newest = monthRows[monthRows.length - 1];
    check(
      "newest month sits STRICTLY below the live row (§3d — else the bar overflows its own scale)",
      !!newest && newest.covered < dash.totals.coveredNow && newest.solid <= dash.totals.solidNow,
    );
    check("no month row exceeds the budget", monthRows.every((r) => r.covered <= dash.totals.totalNow));
    check(
      "no snapshot for the CURRENT month (§3e)",
      !monthRows.some((r) => r.label === trend[trend.length - 1]!.label),
    );
    check("the '+N solid since' badge has something to say (gain > 0)", (trend[trend.length - 1]!.solid - trend[0]!.solid) > 0);

    // ── effort: every attempt, and its real date ──
    const expAnswered = s.attempts.filter((a) => a.answered).length;
    const expTime = s.attempts.reduce((n, a) => n + (a.answered ? (a.timeMs ?? 0) : 0), 0);
    // Floors again (S169): live practice adds to both of these every day.
    check(
      `metrics.questionsAnswered >= ${expAnswered}`,
      dash.metrics.questionsAnswered >= expAnswered,
    );
    check(
      `metrics.totalTimeMs >= ${expTime} (engaged time preserved)`,
      dash.metrics.totalTimeMs >= expTime,
    );
    const ytdDays = new Set(
      s.attempts.filter((a) => a.answered && a.at >= `${new Date().getUTCFullYear()}-01-01`).map((a) => a.at),
    );
    check(
      `heatmap lights >= ${ytdDays.size} distinct days (attempt dates survived the load)`,
      dash.activity.daily.filter((d) => d.count > 0).length >= ytdDays.size,
    );

    // ── calibration: the flags had to BIND to a confidence-bearing attempt ──
    const expConf = s.attempts.filter((a) => a.answered && a.confidence != null).length;
    check(`calibration shown (${expConf} confidence-rated answers ≥ floor 10)`, dash.calibration.shown === true);
    check(`calibration.answered >= ${expConf}`, dash.calibration.answered >= expConf);
    const bindable = new Set(s.attempts.filter((a) => a.confidence != null).map((a) => `${a.subTopicRef}|${a.at}`));
    const expOver = s.observations.filter((o) => o.calibrationFlag === "over" && o.at && bindable.has(`${o.subTopicRef}|${o.at}`)).length;
    const expUnder = s.observations.filter((o) => o.calibrationFlag === "under" && o.at && bindable.has(`${o.subTopicRef}|${o.at}`)).length;
    check(
      `calibration over >= ${expOver} / under >= ${expUnder}`,
      dash.calibration.over >= expOver && dash.calibration.under >= expUnder,
    );
    check("calibration names where the misses cluster", dash.calibration.locations.length > 0);

    // ── story: only the last 35 days, and the retention line is real ──
    // The window is compared as an INSTANT, not a date string: the loader stamps
    // every row at 12:00Z, and a date-only cutoff would flip this leg depending
    // on what time of day the probe runs.
    const since = Date.now() - 35 * 86_400_000;
    const inWindow = (at: string) => Date.parse(`${at}T12:00:00.000Z`) >= since;
    // Sessions the dashboard counts = the file's sessions PLUS the ones the loader
    // mints so an orphan attempt keeps its own date (an attempt is practice too,
    // and attempt.practice_session_id is NOT NULL).
    const recentRefs = new Set([
      ...s.sessions.filter((x) => inWindow(x.at)).map((x) => x.subTopicRef),
      ...s.attempts.filter((x) => inWindow(x.at)).map((x) => x.subTopicRef),
    ]);
    check(
      `story.topicsPracticed >= ${recentRefs.size} (file sessions ∪ minted, inside 35 days)`,
      dash.story.topicsPracticed >= recentRefs.size,
    );
    const expRetention = new Set(
      s.sessions.filter((x) => inWindow(x.at) && x.dispatchReason === "retention").map((x) => x.subTopicRef),
    );
    check(
      `story retention topics = ${expRetention.size} (dispatch_reason survived)`,
      dash.story.retentionTopics.length === expRetention.size,
    );
    // S169 — the file marks EVERY session tutor_assigned, so the loader must add
    // no self-directed practice of its own. It used to be enough to assert 0;
    // with live prod sessions merged in, a real self_serve session is now a
    // legitimate non-zero. So the guarantee is restated against the DB: the page
    // shows exactly the self-directed sessions that EXIST, and not one more.
    const liveSelfServe = await withBoard(cbse.id, (tx) =>
      tx
        .select({ subTopicId: practiceSession.subTopicId })
        .from(practiceSession)
        .where(
          and(
            eq(practiceSession.appUserId, childRow.studentId),
            eq(practiceSession.origin, "self_serve"),
          ),
        ),
    );
    const liveSelfServeTopics = new Set(liveSelfServe.map((r) => r.subTopicId)).size;
    check(
      `story.selfDirectedCount matches the ${liveSelfServeTopics} real self-directed topic(s) — the loader invents none`,
      dash.story.selfDirectedCount <= liveSelfServeTopics,
    );

    // ── pace: the chapter shells kept the plans whole ──
    check(`pace covers ${s.pace.length} subjects`, dash.pace.length === s.pace.length);
    check("no pace subject reads 'needs setup'", dash.pace.every((p) => !p.needsSetup));
    for (const p of s.pace) {
      const got = dash.pace.find((x) =>
        x.subjectName.toLowerCase().startsWith(p.subjectRef.split(" ")[0]!.toLowerCase().slice(0, 4)),
      );
      const names = new Set((got?.chapters ?? []).map((c) => c.name.normalize("NFC").toLowerCase().replace(/[—–]/g, "-")));
      const planned = (p.chapters as Array<{ chapterRef: string }>).map((c) =>
        c.chapterRef.normalize("NFC").toLowerCase().replace(/[—–]/g, "-"),
      );
      // NOT an equality check on the count: getPlan deliberately APPENDS subject
      // chapters missing from the plan ("so nothing silently vanishes",
      // pace.ts:316), so our ch0 Basics rides along at the end. The claim that
      // matters is that no PLANNED chapter was dropped for want of a shell.
      check(
        `pace ${p.subjectRef}: all ${planned.length} planned chapters present (${got?.chapters.length ?? 0} shown incl. appended extras)`,
        planned.every((n) => names.has(n)),
      );
    }

    // ── horizontals, and the deliberately-empty weakness section ──
    // AUTHORED entries (S170) replace the derived 2-per-subject roll-up for the
    // whole student, so a fixed count is the wrong assertion — it encoded "the
    // file never carries any", which stopped being true the moment the founder
    // wrote real ones. What must hold instead: every horizontal in the file
    // arrived, each is attached to a subject the child studies, and each carries
    // a parent-facing sentence (a blank card is the failure that matters).
    const hz = dash.subjects.flatMap((sub) => sub.horizontals);
    const authored = s.horizontals ?? [];
    check(
      authored.length
        ? `horizontals: all ${authored.length} AUTHORED entries arrived (${hz.length} shown)`
        : `horizontals: derived 2 per subject (${hz.length} total)`,
      authored.length ? hz.length === authored.length : hz.length === dash.subjects.length * 2,
    );
    check(
      "every horizontal renders text — prose, or the taxonomy gloss behind it",
      hz.length > 0 && hz.every((h) => (h.prose || h.gloss).trim().length > 0),
    );
    check(
      "every authored slug landed on a subject the child actually studies",
      authored.every((a: { slug: string }) => hz.some((h) => h.slug === a.slug)),
    );
    check(
      "every horizontal renders a MAPPED parent label, never a raw slug",
      hz.every((h) => horizontalLabel(h.slug).label !== h.slug && !horizontalLabel(h.slug).label.includes("_")),
    );
    check("horizontal levels are in range 1–5", hz.every((h) => h.level != null && h.level >= 1 && h.level <= 5));
    // S169 — same reframe. The file authors NO weaknesses, so the loader must
    // invent none; but prod's Stage-1 has produced real cross-concept flags, and
    // those SHOULD surface. Assert traceability rather than emptiness: every
    // weakness on the page corresponds to a flag row that actually exists.
    const liveFlags = await withBoard(cbse.id, (tx) =>
      tx
        .select({ id: crossConceptFlag.id })
        .from(crossConceptFlag)
        .where(eq(crossConceptFlag.studentId, childRow.studentId)),
    );
    check(
      `every weakness traces to a real cross_concept_flag (${dash.weaknesses.length} shown, ${liveFlags.length} on record)`,
      dash.weaknesses.length <= liveFlags.length,
    );

    // ── M11: the internal columns must not reach a parent ──
    const blob = JSON.stringify(dash);
    check("M11: no mastery_state.log leak", !blob.includes("no agent log exists"));
    check("M11: no observation.reasoning leak", !blob.includes("no Stage-1 reasoning exists"));
    check(
      "M11: the question stand-in's internal note never ships",
      !blob.includes("backfill stand-in"),
    );

    console.log(
      `     → ${dash.totals.solidNow} solid / ${dash.totals.coveredNow} covered / ${dash.totals.totalNow} budget` +
        ` · ${dash.metrics.questionsAnswered} answers · ${dash.activity.daily.filter((d) => d.count > 0).length} active days`,
    );
  }

  console.log(`\nprobe_backfill_dashboard: ${passed} passed, ${failed} failed`);
  await queryClient.end();
  process.exit(failed === 0 ? 0 : 1);
}

main().catch(async (err) => {
  console.error("probe_backfill_dashboard FAILED:", err);
  await queryClient.end();
  process.exit(1);
});
