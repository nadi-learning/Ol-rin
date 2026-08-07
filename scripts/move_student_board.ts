/**
 * move_student_board — move ONE student, and the content authored exclusively
 * for them, from one board to another.
 *
 *   bun scripts/move_student_board.ts --student <name|email|uuid> --to <slug>
 *                                     --subject '<subject name>' [--apply]
 *
 * Default is a DRY RUN. `--apply` commits.
 *
 * ── WHY ONLY board_id CHANGES ───────────────────────────────────────────────
 * The naive framing is "re-key the student's data onto the target board's
 * content". That is only needed when the target already has its own copy and the
 * ids therefore differ. When the content was authored FOR this student and
 * nobody else references it, the content itself can move — and then every id
 * stays valid:
 *
 *   sub_topic ids unchanged → mastery_state · scheduling_state · observation …
 *   question ids unchanged  → attempt · upload_token
 *   frozen ARRAYS unchanged → assignment.sub_topic_ids · assessment_session
 *                             .sub_topic_ids · practice_session.question_ids
 *
 * Those arrays are why this matters more than it looks: they hold FK-like uuids
 * that NO foreign key protects. A re-keying migration that missed one would
 * leave rows pointing at dead content, and nothing would error — the tutor's
 * assignment would simply render empty. Preserving ids deletes that whole
 * failure class instead of defending against it.
 *
 * The exclusivity guard (§4) is what buys the right to MOVE content rather than
 * clone it, so it is re-asserted at execution time rather than trusted from
 * whenever someone last ran the query by hand.
 *
 * ── WHY IT NEEDS THE MASTER ROLE ────────────────────────────────────────────
 * Every table here is FORCE ROW LEVEL SECURITY, which binds the table OWNER too
 * — only BYPASSRLS/superuser sees two boards at once. Under the app role every
 * SELECT returns 0 rows and every UPDATE reports success having touched nothing,
 * which is indistinguishable from a clean run (ai-build-miss M29/M36: a
 * surprising zero from a tenant table is a scoping bug until proven otherwise).
 * §1 PROVES the role can bypass RLS and refuses to run if it cannot.
 *
 * ── WHY DRY RUN IS THE REAL STATEMENTS, ROLLED BACK ─────────────────────────
 * A preview built from hand-written COUNT queries is a second implementation of
 * the WHERE clauses, and the two drift. Here the dry run executes the actual
 * UPDATEs, reports the actual row counts, then raises to force a ROLLBACK. What
 * you see previewed is what --apply does, by construction.
 */
import postgres, { type TransactionSql } from "postgres";
import { env } from "../src/config/env";

type Sql = ReturnType<typeof postgres>;
/* `begin` is overloaded, so Parameters<> on it collapses to `never`. postgres
   exports the handle's real type — use it rather than casting the pool type,
   which TS correctly refuses (a transaction has no END/CLOSE). */
type Tx = TransactionSql<{}>;

const args = process.argv.slice(2);
const flag = (n: string) => args.includes(n);
const opt = (n: string) => {
  const i = args.indexOf(n);
  return i >= 0 ? args[i + 1] : undefined;
};
const opts = (n: string) =>
  args.reduce<string[]>((a, v, i) => (args[i - 1] === n ? [...a, v] : a), []);

const ROLLBACK_SENTINEL = "__dry_run_rollback__";

/* ── §1. connection + proof it can see across boards ─────────────────────── */
async function connectAsMaster(): Promise<Sql> {
  const url = env.MIGRATE_DATABASE_URL ?? env.DATABASE_URL;
  const sql = postgres(url, { max: 1 });
  const [role] = await sql`
    SELECT current_user AS who, current_database() AS db,
           inet_server_addr()::text AS host, rolsuper, rolbypassrls
      FROM pg_roles WHERE rolname = current_user`;
  /* EMPIRICAL, not by role attribute. On this RDS the master reads and writes
     every board with `app.board` unset while reporting rolsuper=false AND
     rolbypassrls=false — not even inherited (checked across its whole role
     graph, incl. rds_superuser / pg_read_all_data). The attribute check
     therefore refuses the one role that actually works.
     What matters is not "does it hold a flag" but "can this connection see more
     than one board", so that is what gets asked: if the DB has several boards
     and content is visible in only one of them, we are board-pinned and every
     count below would be a lie. */
  const [vis] = await sql`
    SELECT (SELECT count(*)::int FROM board)                       AS boards,
           (SELECT count(DISTINCT board_id)::int FROM sub_topic)   AS boards_seen,
           (SELECT count(*)::int FROM student)                     AS students_seen`;
  const boards = Number(vis?.boards ?? 0);
  const seen = Number(vis?.boards_seen ?? 0);
  const bypasses =
    Number(vis?.students_seen ?? 0) > 0 && (boards < 2 || seen >= 2);
  /* The DATABASE is printed, not just the role. A URL pointing at the right
     host with the right master but the WRONG database authenticates perfectly
     and then finds nothing — which the script would report as "no subject on
     the source board", sending you to look at the data instead of the URL.
     (Caught exactly this on 2026-08-06: a prod URL ending /nadi, not /b2c.) */
  console.log(
    `connected  db=${role?.db}  user=${role?.who}  host=${role?.host ?? "local"}  ` +
      `sees ${seen}/${boards} boards, ${vis?.students_seen} students`,
  );
  if (!bypasses) {
    await sql.end();
    throw new Error(
      `ABORT: this connection is RLS-scoped — it sees ${seen} of ${boards} boards ` +
        `and ${vis?.students_seen} students. Under FORCE RLS it would read 0 rows and ` +
        `update 0 rows while reporting success. Point MIGRATE_DATABASE_URL at the master.`,
    );
  }
  return sql;
}

/* ── §2. resolve student + boards ────────────────────────────────────────── */
async function resolve(sql: Sql, who: string, toSlug: string) {
  const rows = await sql`
    SELECT au.id, au.name, au.email, s.board_id, b.slug AS board_slug
      FROM app_user au
      JOIN student s ON s.user_id = au.id
      JOIN board b   ON b.id = s.board_id
     WHERE au.user_type = 'student'
       AND (au.id::text = ${who} OR au.email = ${who} OR au.name ILIKE ${`%${who}%`})`;
  if (rows.length !== 1)
    throw new Error(
      `ABORT: --student "${who}" matched ${rows.length}` +
        (rows.length ? `: ${rows.map((r: any) => r.name).join(", ")}` : "") +
        ". Pass a uuid or exact email.",
    );
  const student = rows[0]! as any;
  const [target] = await sql`SELECT id, slug FROM board WHERE slug = ${toSlug}`;
  if (!target) throw new Error(`ABORT: no board with slug "${toSlug}"`);
  if (target.id === student.board_id)
    throw new Error(`ABORT: ${student.name} is already on ${toSlug}`);
  return { student, target: target as any };
}

/* ── §3. the content tree, resolved DOWNWARD from the named subjects ─────── */
async function contentIds(sql: Sql, boardId: string, subjects: string[], subjectIds: string[]) {
  /* --subject-id is the precise form and should be preferred. `Custom Assessment`
     exists FOUR times on this board (one per grade), so selecting by NAME quietly
     scooped up three subjects Kian has never touched — 17 sub_topics where he has
     12. A name is not an identifier. */
  const subj = subjectIds.length
    ? await sql`SELECT id, name FROM subject WHERE board_id = ${boardId} AND id = ANY(${subjectIds})`
    : await sql`SELECT id, name FROM subject WHERE board_id = ${boardId} AND name = ANY(${subjects})`;
  if (!subj.length)
    throw new Error(`ABORT: no subject ${JSON.stringify(subjectIds.length ? subjectIds : subjects)} on the source board`);
  const resolvedSubjectIds = subj.map((r: any) => r.id);
  const chapterIds = (
    await sql`SELECT id FROM chapter WHERE subject_id = ANY(${resolvedSubjectIds})`
  ).map((r: any) => r.id);
  const topicIds = chapterIds.length
    ? (await sql`SELECT id FROM topic WHERE chapter_id = ANY(${chapterIds})`).map((r: any) => r.id)
    : [];
  const subTopicIds = topicIds.length
    ? (await sql`SELECT id FROM sub_topic WHERE topic_id = ANY(${topicIds})`).map((r: any) => r.id)
    : [];
  const questionIds = subTopicIds.length
    ? (await sql`SELECT id FROM question WHERE sub_topic_id = ANY(${subTopicIds})`).map((r: any) => r.id)
    : [];
  return {
    subjectIds: resolvedSubjectIds,
    chapterIds, topicIds, subTopicIds, questionIds,
    names: subj.map((r: any) => r.name),
  };
}
type Content = Awaited<ReturnType<typeof contentIds>>;

/* ── §4. THE GUARD — content may only MOVE if it is this student's alone ──── */
async function assertExclusive(sql: Sql, c: Content, studentId: string) {
  if (!c.subTopicIds.length) return;
  const others = await sql`
      SELECT DISTINCT au.name, 'mastery_state' AS via
        FROM mastery_state m JOIN app_user au ON au.id = m.student_id
       WHERE m.sub_topic_id = ANY(${c.subTopicIds}) AND m.student_id <> ${studentId}
    UNION
      SELECT DISTINCT au.name, 'observation'
        FROM observation o JOIN app_user au ON au.id = o.student_id
       WHERE o.sub_topic_id = ANY(${c.subTopicIds}) AND o.student_id <> ${studentId}
    UNION
      SELECT DISTINCT au.name, 'practice_session'
        FROM practice_session ps JOIN app_user au ON au.id = ps.app_user_id
       WHERE ps.sub_topic_id = ANY(${c.subTopicIds}) AND ps.app_user_id <> ${studentId}`;
  if (others.length)
    throw new Error(
      `ABORT: content is NOT exclusive — ${others
        .map((o: any) => `${o.name} (${o.via})`)
        .join(", ")}. Moving it would break them; clone instead.`,
    );
}

/* ── §4b. MERGE MODE — re-point chapters onto an existing target subject ─────
   When the destination board already has its own copy of the container (here:
   cambridge seeds `custom-assessment` per grade, empty), the subject row must
   NOT move — it would collide on UNIQUE(board_id, slug, grade) and would also
   strand any other student still using the source subject. Instead the CHAPTERS
   are re-pointed onto the target subject.
   That hits a second unique constraint, UNIQUE(subject_id, slug): the target
   subject may already hold a same-slug chapter. Where that chapter is an EMPTY,
   UNREFERENCED shell it is deleted, which lets the incoming chapter keep its own
   id — and keeping the id is the whole point, because chapter_id is referenced
   directly by student_chapter_insight / assignment / authoring_chat /
   student_authoring_preference / chapter_budget. Merging the other way round
   would mean re-keying all five. */
async function collisions(sql: Sql, chapterIds: string[], intoSubject: string) {
  if (!chapterIds.length) return [];
  const rows = await sql`
    SELECT tgt.id, tgt.slug,
           (SELECT count(*)::int FROM topic WHERE chapter_id = tgt.id)                          AS topics,
           (SELECT count(*)::int FROM chapter_budget WHERE chapter_id = tgt.id)                 AS budgets,
           (SELECT count(*)::int FROM student_chapter_insight WHERE chapter_id = tgt.id)        AS insights,
           (SELECT count(*)::int FROM assignment WHERE chapter_id = tgt.id)                     AS assignments,
           (SELECT count(*)::int FROM authoring_chat WHERE chapter_id = tgt.id)                 AS chats,
           (SELECT count(*)::int FROM student_authoring_preference WHERE chapter_id = tgt.id)   AS prefs,
           (SELECT count(*)::int FROM content_unit WHERE chapter_id = tgt.id)                   AS units,
           (SELECT count(*)::int FROM horizontal_skill WHERE chapter_id = tgt.id)               AS hskills
      FROM chapter tgt
     WHERE tgt.subject_id = ${intoSubject}
       AND tgt.slug IN (SELECT slug FROM chapter WHERE id = ANY(${chapterIds}))`;
  for (const r of rows as any[]) {
    const refs = ["topics","budgets","insights","assignments","chats","prefs","units","hskills"]
      .filter((k) => Number(r[k]) > 0);
    if (refs.length)
      throw new Error(
        `ABORT: target chapter ${r.slug} (${r.id}) collides and is NOT an empty shell — ` +
          `referenced by ${refs.join(", ")}. Deleting it would destroy real rows.`,
      );
  }
  return (rows as any[]).map((r) => ({ id: r.id as string, slug: r.slug as string }));
}

/* ── §5. the moves. board_id only — no key, no array, no ordering concern ─── */
function moves(c: Content, S: string, F: string, into: string | undefined, shells: { id: string }[]) {
  const A = (ids: string[]) => (ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]);
  const head: any[] = into
    ? [
        ["drop empty shell chapters", (tx: Tx) => tx`DELETE FROM chapter WHERE id = ANY(${A(shells.map((x) => x.id))})`],
        ["chapter → target subject", (tx: Tx) => tx`UPDATE chapter SET subject_id=${into} WHERE id = ANY(${A(c.chapterIds)})`],
      ]
    : [["subject", (tx: Tx, B: string) => tx`UPDATE subject SET board_id=${B} WHERE id = ANY(${A(c.subjectIds)})`]];
  return [
    ...head,
    ["chapter", (tx: Tx, B: string) => tx`UPDATE chapter SET board_id=${B} WHERE id = ANY(${A(c.chapterIds)})`],
    ["topic", (tx: Tx, B: string) => tx`UPDATE topic SET board_id=${B} WHERE id = ANY(${A(c.topicIds)})`],
    ["sub_topic", (tx: Tx, B: string) => tx`UPDATE sub_topic SET board_id=${B} WHERE id = ANY(${A(c.subTopicIds)})`],
    ["learning_objective", (tx: Tx, B: string) => tx`UPDATE learning_objective SET board_id=${B} WHERE sub_topic_id = ANY(${A(c.subTopicIds)})`],
    ["content_unit", (tx: Tx, B: string) => tx`UPDATE content_unit SET board_id=${B} WHERE sub_topic_id = ANY(${A(c.subTopicIds)})`],
    ["question", (tx: Tx, B: string) => tx`UPDATE question SET board_id=${B} WHERE id = ANY(${A(c.questionIds)})`],
    ["question_image", (tx: Tx, B: string) => tx`UPDATE question_image SET board_id=${B} WHERE question_id = ANY(${A(c.questionIds)})`],
    ["chapter_budget", (tx: Tx, B: string) => tx`UPDATE chapter_budget SET board_id=${B} WHERE chapter_id = ANY(${A(c.chapterIds)})`],
    ["horizontal_skill", (tx: Tx, B: string) => tx`UPDATE horizontal_skill SET board_id=${B} WHERE subject_id = ANY(${A(c.subjectIds)})`],
    ["authoring_worker", (tx: Tx, B: string) => tx`UPDATE authoring_worker SET board_id=${B} WHERE sub_topic_id = ANY(${A(c.subTopicIds)})`],

    ["student", (tx: Tx, B: string) => tx`UPDATE student SET board_id=${B} WHERE user_id=${S}`],
    ["tutor_assignment", (tx: Tx, B: string) => tx`UPDATE tutor_assignment SET board_id=${B} WHERE student_id=${S} AND board_id=${F}`],
    ["event_log", (tx: Tx, B: string) => tx`UPDATE event_log SET board_id=${B} WHERE student_id=${S} AND board_id=${F}`],
    ["transcript", (tx: Tx, B: string) => tx`UPDATE transcript SET board_id=${B} WHERE student_id=${S} AND board_id=${F}`],
    ["observation", (tx: Tx, B: string) => tx`UPDATE observation SET board_id=${B} WHERE student_id=${S} AND board_id=${F}`],
    ["cross_concept_flag", (tx: Tx, B: string) => tx`UPDATE cross_concept_flag SET board_id=${B} WHERE student_id=${S} AND board_id=${F}`],
    ["mastery_state", (tx: Tx, B: string) => tx`UPDATE mastery_state SET board_id=${B} WHERE student_id=${S} AND board_id=${F}`],
    ["mastery_history", (tx: Tx, B: string) => tx`UPDATE mastery_history SET board_id=${B} WHERE student_id=${S} AND board_id=${F}`],
    ["mastery_snapshot", (tx: Tx, B: string) => tx`UPDATE mastery_snapshot SET board_id=${B} WHERE student_id=${S} AND board_id=${F}`],
    ["horizontal_skill_state", (tx: Tx, B: string) => tx`UPDATE horizontal_skill_state SET board_id=${B} WHERE student_id=${S} AND board_id=${F}`],
    ["student_chapter_insight", (tx: Tx, B: string) => tx`UPDATE student_chapter_insight SET board_id=${B} WHERE student_id=${S} AND board_id=${F}`],
    ["student_subject_insight", (tx: Tx, B: string) => tx`UPDATE student_subject_insight SET board_id=${B} WHERE student_id=${S} AND board_id=${F}`],
    ["student_authoring_preference", (tx: Tx, B: string) => tx`UPDATE student_authoring_preference SET board_id=${B} WHERE student_id=${S} AND board_id=${F}`],
    /* student_id is NULLABLE here — a NULL row is the BOARD's default parent copy,
       shared by every family on it. Scoping to this student keeps the source
       board's defaults where they belong. */
    ["parent_copy", (tx: Tx, B: string) => tx`UPDATE parent_copy SET board_id=${B} WHERE student_id=${S} AND board_id=${F}`],
    ["scheduling_state", (tx: Tx, B: string) => tx`UPDATE scheduling_state SET board_id=${B} WHERE student_id=${S} AND board_id=${F}`],
    ["practice_session", (tx: Tx, B: string) => tx`UPDATE practice_session SET board_id=${B} WHERE app_user_id=${S} AND board_id=${F}`],
    ["attempt", (tx: Tx, B: string) => tx`UPDATE attempt SET board_id=${B} WHERE app_user_id=${S} AND board_id=${F}`],
    /* attempt_image has no owner column — it hangs off the attempt. */
    ["attempt_image", (tx: Tx, B: string) => tx`UPDATE attempt_image SET board_id=${B} WHERE attempt_id IN (SELECT id FROM attempt WHERE app_user_id=${S})`],
    ["assignment", (tx: Tx, B: string) => tx`UPDATE assignment SET board_id=${B} WHERE student_id=${S} AND board_id=${F}`],
    ["assessment_session", (tx: Tx, B: string) => tx`UPDATE assessment_session SET board_id=${B} WHERE student_id=${S} AND board_id=${F}`],
    ["report", (tx: Tx, B: string) => tx`UPDATE report SET board_id=${B} WHERE student_id=${S} AND board_id=${F}`],
    ["authoring_chat", (tx: Tx, B: string) => tx`UPDATE authoring_chat SET board_id=${B} WHERE student_id=${S} AND board_id=${F}`],
    ["pace_plan", (tx: Tx, B: string) => tx`UPDATE pace_plan SET board_id=${B} WHERE app_user_id=${S} AND board_id=${F}`],
    ["voice_session", (tx: Tx, B: string) => tx`UPDATE voice_session SET board_id=${B} WHERE student_id=${S} AND board_id=${F}`],
    ["upload_token", (tx: Tx, B: string) => tx`UPDATE upload_token SET board_id=${B} WHERE app_user_id=${S} AND board_id=${F}`],
  ] as const;
}

/* ── §6. what must be TRUE afterwards, checked inside the same tx ─────────── */
async function verify(tx: Tx, c: Content, S: string, F: string, B: string) {
  const A = (ids: string[]) => (ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]);
  const [left] = await tx`
    SELECT (SELECT count(*) FROM sub_topic     WHERE id = ANY(${A(c.subTopicIds)}) AND board_id=${F}) AS content_left,
           (SELECT count(*) FROM question      WHERE id = ANY(${A(c.questionIds)}) AND board_id=${F}) AS questions_left,
           (SELECT count(*) FROM mastery_state WHERE student_id=${S} AND board_id=${F})               AS mastery_left,
           (SELECT count(*) FROM attempt       WHERE app_user_id=${S} AND board_id=${F})              AS attempts_left,
           (SELECT count(*) FROM student       WHERE user_id=${S} AND board_id=${B})                  AS student_on_target`;
  /* The cross-board tell: a student row whose mastery points at a sub_topic on
     a DIFFERENT board. Invisible to both boards under RLS, so it can never be
     found by a normal read — check it here, while we can still roll back. */
  const [split] = await tx`
    SELECT count(*) AS mismatched
      FROM mastery_state m JOIN sub_topic st ON st.id = m.sub_topic_id
     WHERE m.student_id = ${S} AND m.board_id <> st.board_id`;
  return { ...left, ...split } as Record<string, number>;
}

async function main() {
  const sql = await connectAsMaster();
  const apply = flag("--apply");
  try {
    const who = opt("--student");
    const toSlug = opt("--to");
    const subjects = opts("--subject");
    const subjectIds = opts("--subject-id");
    const into = opt("--into-subject");
    if (!who || !toSlug || !(subjects.length || subjectIds.length))
      throw new Error(
        "usage: --student <name|email|uuid> --to <slug> " +
          "(--subject '<name>' | --subject-id <uuid>) [--into-subject <uuid>] [--apply]",
      );

    const { student, target } = await resolve(sql, who, toSlug);
    console.log(`\n${student.name} <${student.email}>   ${student.board_slug} → ${target.slug}`);

    const c = await contentIds(sql, student.board_id, subjects, subjectIds);
    console.log(
      `content: ${c.names.join(", ")} — ${c.chapterIds.length} chapters, ` +
        `${c.subTopicIds.length} sub_topics, ${c.questionIds.length} questions`,
    );
    await assertExclusive(sql, c, student.id);
    console.log("✓ exclusivity guard — no other student references this content");
    const shells = into ? await collisions(sql, c.chapterIds, into) : [];
    if (into)
      console.log(
        `merge mode → subject ${into}; ${shells.length} empty shell chapter(s) to drop` +
          (shells.length ? `: ${shells.map((s2) => s2.slug).join(", ")}` : ""),
      );
    console.log("");

    const rows: { table: string; moved: number }[] = [];
    let checks: Record<string, number> = {};
    let bad = 0;
    const WANT: [string, number][] = [
      ["content_left", 0], ["questions_left", 0], ["mastery_left", 0],
      ["attempts_left", 0], ["student_on_target", 1], ["mismatched", 0],
    ];
    try {
      await sql.begin(async (tx) => {
        for (const [table, run] of moves(c, student.id, student.board_id, into, shells)) {
          const res: any = await run(tx, target.id);
          rows.push({ table, moved: res.count ?? 0 });
        }
        checks = await verify(tx, c, student.id, student.board_id, target.id);
        /* The assertions GATE the commit — they are evaluated here, inside the
           transaction, so a half-correct move rolls back instead of shipping.
           Reporting them after COMMIT would make them a postmortem, not a gate. */
        bad = WANT.filter(([k, want]) => Number(checks[k] ?? -1) !== want).length;
        if (!apply || bad) throw new Error(ROLLBACK_SENTINEL);
      });
    } catch (e: any) {
      if (e?.message !== ROLLBACK_SENTINEL) throw e;
    }

    console.table(rows.filter((r) => r.moved > 0));
    const total = rows.reduce((a, r) => a + r.moved, 0);
    const skipped = rows.filter((r) => r.moved === 0).map((r) => r.table);
    console.log(`${total} rows across ${rows.length - skipped.length} tables` +
      (skipped.length ? `  (${skipped.length} tables had nothing)` : ""));

    console.log("\npost-move assertions (evaluated inside the transaction):");
    for (const [k, expect] of WANT) {
      const got = Number(checks[k] ?? -1);
      console.log(`  ${got === expect ? "✓" : "✗"} ${k} = ${got} (expected ${expect})`);
    }

    if (bad) console.log(`\n🔴 ${bad} assertion(s) failed — ROLLED BACK, nothing written.`);
    else if (!apply) console.log("\nDRY RUN — rolled back. Re-run with --apply to commit.");
    else console.log("\n✅ committed.");
    process.exit(bad === 0 ? 0 : 1);
  } finally {
    await sql.end();
  }
}

main().catch((e) => {
  console.error(String(e?.message ?? e));
  process.exit(1);
});
