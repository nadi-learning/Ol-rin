#!/usr/bin/env bash
set -euo pipefail
cd /opt/olorin
DBURL="$(grep -E '^DATABASE_URL=' .env | head -1 | cut -d= -f2-)"
psql "$DBURL" <<'SQL'
DO $$
DECLARE b RECORD; m RECORD;
BEGIN
  FOR b IN SELECT id, slug FROM board ORDER BY slug LOOP
    PERFORM set_config('app.board', b.id::text, false);
    FOR m IN
      SELECT mm.id, mm.role, mm.enabled, mm.created_at
      FROM membership mm JOIN app_user au ON au.id = mm.user_id
      WHERE lower(au.email)=lower('spranav.iitkgp@gmail.com')
      ORDER BY mm.created_at
    LOOP
      RAISE NOTICE 'board=% | role=% | enabled=% | id=% | created=%', b.slug, m.role, m.enabled, m.id, m.created_at;
    END LOOP;
  END LOOP;
END $$;
SQL
