#!/usr/bin/env bash
# ADDITIVE + IDEMPOTENT (founder-authorised). Seed a `custom_assessment`
# placeholder chapter for each board x grade, so the /admin topics.md ingest
# picker has a target after the S130 content wipe.
#
# For each board in {cbse, cambridge} x grade in {8,9,10,11}:
#   - upsert a `Custom Assessment` subject (slug custom-assessment) with the
#     BARE-NUMBER grade ("9", not "Class_9") so it matches what onboarding writes
#     to student_onboarding.grade and stays student-discoverable.
#   - insert one empty `custom_assessment` chapter under it (metadata NULL =
#     no topics.md yet; ready for the admin ingest to fill).
# = 2 boards x 4 grades = 8 subjects + 8 chapters.
#
# subject/chapter are FORCE-RLS'd, so we loop boards and set app.board; INSERT's
# WITH CHECK (board_id = app.board) passes because we insert board_id = that board.
# ON CONFLICT DO NOTHING on the natural uniques → re-runs are no-ops.
#
# DRY RUN by default (inserts, reports, then ROLLBACK). Pass --execute to COMMIT.
set -euo pipefail
cd /opt/olorin
DBURL="$(grep -E '^DATABASE_URL=' .env | head -1 | cut -d= -f2-)"

FINISH="ROLLBACK"
BANNER="DRY RUN (no changes committed — pass --execute to commit)"
if [[ "${1:-}" == "--execute" ]]; then FINISH="COMMIT"; BANNER="*** EXECUTE: COMMITTING FOR REAL ***"; fi
echo "### $BANNER ###"

psql "$DBURL" -v ON_ERROR_STOP=1 <<SQL
BEGIN;
DO \$\$
DECLARE
  b RECORD; g TEXT; sid uuid;
  grades TEXT[] := ARRAY['8','9','10','11'];
  boards TEXT[] := ARRAY['cbse','cambridge'];
  new_subj INT := 0; new_chap INT := 0; rc INT;
BEGIN
  FOR b IN SELECT id, slug FROM board WHERE slug = ANY(boards) ORDER BY slug LOOP
    PERFORM set_config('app.board', b.id::text, false);
    FOREACH g IN ARRAY grades LOOP
      INSERT INTO subject (board_id, slug, name, grade)
        VALUES (b.id, 'custom-assessment', 'Custom Assessment', g)
        ON CONFLICT (board_id, slug, grade) DO NOTHING;
      GET DIAGNOSTICS rc = ROW_COUNT; new_subj := new_subj + rc;

      SELECT id INTO sid FROM subject
        WHERE board_id = b.id AND slug = 'custom-assessment' AND grade = g LIMIT 1;

      INSERT INTO chapter (board_id, subject_id, slug, name, ordinal)
        VALUES (b.id, sid, 'custom_assessment', 'Custom Assessment', 1)
        ON CONFLICT (subject_id, slug) DO NOTHING;
      GET DIAGNOSTICS rc = ROW_COUNT; new_chap := new_chap + rc;
    END LOOP;
  END LOOP;
  RAISE NOTICE 'created % new subject rows, % new chapter rows (0/0 on a re-run)', new_subj, new_chap;

  -- Verify: exactly one custom_assessment chapter per board x grade should exist now.
  RAISE NOTICE '--- what the /admin ingest picker will now show (board | grade | subject | chapter | hasTopicsMd) ---';
  FOR b IN SELECT id, slug FROM board WHERE slug = ANY(boards) ORDER BY slug LOOP
    PERFORM set_config('app.board', b.id::text, false);
    FOR sid IN
      SELECT c.id FROM chapter c JOIN subject s ON s.id = c.subject_id
      WHERE c.slug = 'custom_assessment' ORDER BY s.grade
    LOOP
      RAISE NOTICE '  % | % | % | % | %',
        b.slug,
        (SELECT s.grade FROM chapter c JOIN subject s ON s.id=c.subject_id WHERE c.id=sid),
        (SELECT s.name  FROM chapter c JOIN subject s ON s.id=c.subject_id WHERE c.id=sid),
        (SELECT c.name  FROM chapter c WHERE c.id=sid),
        (SELECT (c.metadata->>'topicsMd') IS NOT NULL FROM chapter c WHERE c.id=sid);
    END LOOP;
  END LOOP;
END \$\$;
$FINISH;
SQL
echo "### DONE — mode: $FINISH ###"
