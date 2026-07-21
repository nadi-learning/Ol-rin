#!/usr/bin/env bash
# READ-ONLY discovery v2 — enumerate FK children of app_user via pg_catalog
# (reliable, unlike information_schema). Count spranav rows per child, per board.
set -euo pipefail
cd /opt/olorin
DBURL="$(grep -E '^DATABASE_URL=' .env | head -1 | cut -d= -f2-)"
psql "$DBURL" <<'SQL'
DO $$
DECLARE x uuid; u uuid; b RECORD; fk RECORD; cnt bigint;
BEGIN
  SELECT id INTO x FROM app_user WHERE lower(email)=lower('spranav.iitkgp@gmail.com');
  SELECT id INTO u FROM users    WHERE lower(email)=lower('spranav.iitkgp@gmail.com');
  RAISE NOTICE 'app_user id = % | users id = %', x, u;

  -- Loop every board so RLS-scoped child rows on ANY board are visible.
  FOR b IN SELECT id, slug FROM board ORDER BY slug LOOP
    PERFORM set_config('app.board', b.id::text, false);
    FOR fk IN
      SELECT c.conrelid::regclass::text AS t, a.attname AS col
      FROM pg_constraint c
      JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY(c.conkey)
      WHERE c.contype='f' AND c.confrelid = 'app_user'::regclass
    LOOP
      EXECUTE format('SELECT count(*) FROM %I WHERE %I = $1', fk.t, fk.col) INTO cnt USING x;
      IF cnt > 0 THEN RAISE NOTICE 'HAS ROWS [board=%]: %(%) = %', b.slug, fk.t, fk.col, cnt; END IF;
    END LOOP;
  END LOOP;

  RAISE NOTICE '--- better-auth ---';
  EXECUTE 'SELECT count(*) FROM sessions WHERE user_id=$1' INTO cnt USING u; RAISE NOTICE 'sessions = %', cnt;
  EXECUTE 'SELECT count(*) FROM accounts WHERE user_id=$1' INTO cnt USING u; RAISE NOTICE 'accounts = %', cnt;
END $$;

-- What ARE the 2 accounts? (provider only — no secrets)
\echo '--- accounts detail (provider_id) ---'
SELECT a.provider_id, a.created_at
FROM accounts a JOIN users us ON us.id = a.user_id
WHERE lower(us.email)=lower('spranav.iitkgp@gmail.com');
SQL
