#!/usr/bin/env bash
# READ-ONLY. Finds real (non-@example.com) prod users whose onboarding row is
# MISSING or not 'completed' — i.e. the users whose onboarding data was
# accidentally deleted. Nothing is modified. membership + onboarding are RLS'd,
# so we loop boards and set app.board to see each board's rows.
set -euo pipefail
cd /opt/olorin
DBURL="$(grep -E '^DATABASE_URL=' .env | head -1 | cut -d= -f2-)"

echo "############ BOARDS ############"
psql "$DBURL" -tAc "select slug||'  '||id from board order by slug;"

echo
echo "############ REAL members per board — has completed onboarding? ############"
echo "board | email | role | onboarding_row | status | grade | fav_char | pet"
psql "$DBURL" <<'SQL'
DO $$
DECLARE b RECORD;
BEGIN
  FOR b IN SELECT id, slug FROM board ORDER BY slug LOOP
    PERFORM set_config('app.board', b.id::text, true);
    FOR b IN
      SELECT b.slug AS board, u.email,
             m.role,
             (o.id IS NOT NULL) AS has_onb,
             coalesce(o.status,'(none)') AS status,
             coalesce(o.grade,'-') AS grade,
             coalesce(o.fav_character,'-') AS fav,
             coalesce(o.pet,'-') AS pet
      FROM membership m
      JOIN app_user u ON u.id = m.user_id
      LEFT JOIN onboarding o ON o.user_id = u.id AND o.board_id = m.board_id
      WHERE u.email NOT LIKE '%@example.com'
      ORDER BY u.email
    LOOP
      RAISE NOTICE '% | % | % | % | % | % | % | %',
        b.board, b.email, b.role, b.has_onb, b.status, b.grade, b.fav, b.pet;
    END LOOP;
  END LOOP;
END $$;
SQL

echo
echo "############ SUMMARY — real users MISSING a completed onboarding ############"
echo "(these are the repair candidates: member of a board, but no 'completed' onboarding row on it)"
psql "$DBURL" <<'SQL'
DO $$
DECLARE b RECORD; n INT := 0;
BEGIN
  FOR b IN SELECT id FROM board LOOP
    PERFORM set_config('app.board', b.id::text, true);
    FOR b IN
      SELECT u.email
      FROM membership m
      JOIN app_user u ON u.id = m.user_id
      LEFT JOIN onboarding o ON o.user_id = u.id AND o.board_id = m.board_id
      WHERE u.email NOT LIKE '%@example.com'
        AND (o.id IS NULL OR o.status <> 'completed')
    LOOP
      n := n + 1;
      RAISE NOTICE 'MISSING: %', b.email;
    END LOOP;
  END LOOP;
  RAISE NOTICE 'total repair candidates: %', n;
END $$;
SQL
