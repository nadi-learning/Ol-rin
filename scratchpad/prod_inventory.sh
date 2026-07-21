#!/usr/bin/env bash
# READ-ONLY. Full inventory of prod so we can see exactly what to keep vs delete.
# Nothing is modified. app_user/users/board/better-auth are GLOBAL; content +
# evidence are RLS'd, so we loop boards and set app.board to count each.
set -euo pipefail
cd /opt/olorin
DBURL="$(grep -E '^DATABASE_URL=' .env | head -1 | cut -d= -f2-)"

echo "############ BOARDS ############"
psql "$DBURL" -tAc "select slug||'  '||id from board order by slug;"

echo
echo "############ app_user (domain identity) — ALL rows ############"
echo "created_at | email | name | is_example"
psql "$DBURL" -tAc "select to_char(created_at,'YYYY-MM-DD HH24:MI')||' | '||email||' | '||coalesce(name,'(none)')||' | '||(case when lower(email) like '%@example.com' then 'EXAMPLE' else 'real' end) from app_user order by created_at;"

echo
echo "############ users (better-auth) — ALL rows ############"
echo "created_at | email | name | is_example"
psql "$DBURL" -tAc "select to_char(created_at,'YYYY-MM-DD HH24:MI')||' | '||email||' | '||coalesce(name,'(none)')||' | '||(case when lower(email) like '%@example.com' then 'EXAMPLE' else 'real' end) from users order by created_at;"

echo
echo "############ GLOBAL table counts ############"
psql "$DBURL" -tAc "select 'app_user='||count(*) from app_user;"
psql "$DBURL" -tAc "select 'users='||count(*) from users;"
psql "$DBURL" -tAc "select 'sessions='||count(*) from sessions;"
psql "$DBURL" -tAc "select 'accounts='||count(*) from accounts;"
psql "$DBURL" -tAc "select 'verifications='||count(*) from verifications;"
psql "$DBURL" -tAc "select 'content_version='||count(*) from content_version;"
psql "$DBURL" -tAc "select 'ai_call_log='||count(*) from ai_call_log;"
psql "$DBURL" -tAc "select 'upload_token='||count(*) from upload_token;"

echo
echo "############ PER-BOARD counts (RLS-scoped: content + evidence) ############"
psql "$DBURL" <<'SQL'
DO $$
DECLARE b RECORD; t TEXT; cnt BIGINT;
  tbls TEXT[] := ARRAY[
    'membership','subject','chapter','topic','sub_topic','learning_objective',
    'content_unit','question','onboarding','event_log','observation',
    'mastery_state','mastery_history','attempt','practice_session',
    'assessment_session','assignment','report'];
BEGIN
  FOR b IN SELECT id, slug FROM board ORDER BY slug LOOP
    PERFORM set_config('app.board', b.id::text, false);
    RAISE NOTICE '--- board: % ---', b.slug;
    FOREACH t IN ARRAY tbls LOOP
      EXECUTE format('SELECT count(*) FROM %I', t) INTO cnt;
      IF cnt > 0 THEN RAISE NOTICE '  %=%', t, cnt; END IF;
    END LOOP;
  END LOOP;
END $$;
SQL

echo
echo "############ CONTENT / TOPICS detail (the 'topics md upload') ############"
psql "$DBURL" <<'SQL'
DO $$
DECLARE b RECORD; r RECORD;
BEGIN
  FOR b IN SELECT id, slug FROM board ORDER BY slug LOOP
    PERFORM set_config('app.board', b.id::text, false);
    FOR r IN
      SELECT s.name AS subject, count(distinct c.id) AS chapters,
             count(distinct t.id) AS topics, count(distinct st.id) AS subtopics
      FROM subject s
      LEFT JOIN chapter c ON c.subject_id = s.id
      LEFT JOIN topic t ON t.chapter_id = c.id
      LEFT JOIN sub_topic st ON st.topic_id = t.id
      GROUP BY s.name
    LOOP
      RAISE NOTICE 'board=% subject=% chapters=% topics=% subtopics=%',
        b.slug, r.subject, r.chapters, r.topics, r.subtopics;
    END LOOP;
  END LOOP;
END $$;
SQL
echo
echo "############ CAPABILITIES (decides wipe mechanism) ############"
psql "$DBURL" -tAc "select 'current_user='||current_user;"
echo "-- table owner + RLS flags (enabled/forced) for a sample --"
psql "$DBURL" -tAc "select relname||' owner='||pg_get_userbyid(relowner)||' rls_enabled='||relrowsecurity||' rls_forced='||relforcerowsecurity from pg_class where relname in ('attempt','subject','app_user','membership') order by relname;"
echo "-- does the app role have TRUNCATE on the evidence tables? --"
psql "$DBURL" -tAc "select 'truncate_attempt='||has_table_privilege(current_user,'attempt','TRUNCATE')||' delete_attempt='||has_table_privilege(current_user,'attempt','DELETE');"
echo "-- is a master/admin connection string present on the box? (names only) --"
grep -oE '^[A-Z_]*(MASTER|ADMIN|POSTGRES|ROOT)[A-Z_]*=' .env 2>/dev/null || echo "(no master-looking env var in .env)"

echo
echo "INVENTORY DONE (nothing modified)."
