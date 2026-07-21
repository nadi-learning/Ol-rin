#!/usr/bin/env bash
# READ-ONLY discovery: every table FK'd to app_user, count spranav's rows.
# Board-scoped tables are RLS'd → set app.board to spranav's board (cbse).
set -euo pipefail
cd /opt/olorin
DBURL="$(grep -E '^DATABASE_URL=' .env | head -1 | cut -d= -f2-)"
psql "$DBURL" <<'SQL'
DO $$
DECLARE x uuid; u uuid; bid uuid; fk RECORD; cnt bigint;
BEGIN
  SELECT id INTO x FROM app_user WHERE lower(email)=lower('spranav.iitkgp@gmail.com');
  SELECT id INTO u FROM users    WHERE lower(email)=lower('spranav.iitkgp@gmail.com');
  RAISE NOTICE 'app_user id = %', x;
  RAISE NOTICE 'users    id = %', u;
  SELECT id INTO bid FROM board WHERE slug='cbse';
  PERFORM set_config('app.board', bid::text, false);
  RAISE NOTICE '--- tables FK->app_user with spranav rows (app.board=cbse) ---';
  FOR fk IN
    SELECT DISTINCT tc.table_name AS t, kcu.column_name AS c
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu ON kcu.constraint_name = tc.constraint_name
    JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name
    WHERE tc.constraint_type='FOREIGN KEY' AND ccu.table_name='app_user'
  LOOP
    EXECUTE format('SELECT count(*) FROM %I WHERE %I = $1', fk.t, fk.c) INTO cnt USING x;
    IF cnt > 0 THEN RAISE NOTICE 'HAS ROWS: %(%) = %', fk.t, fk.c, cnt; END IF;
  END LOOP;
  RAISE NOTICE '--- better-auth (by users.id / email) ---';
  EXECUTE 'SELECT count(*) FROM sessions WHERE user_id=$1' INTO cnt USING u; RAISE NOTICE 'sessions = %', cnt;
  EXECUTE 'SELECT count(*) FROM accounts WHERE user_id=$1' INTO cnt USING u; RAISE NOTICE 'accounts = %', cnt;
  EXECUTE 'SELECT count(*) FROM verifications WHERE lower(identifier)=lower($1)' INTO cnt USING 'spranav.iitkgp@gmail.com'; RAISE NOTICE 'verifications(by email) = %', cnt;
END $$;
SQL
