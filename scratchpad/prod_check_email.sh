#!/usr/bin/env bash
# Read prod for an arbitrary email ($1): identity rows + every board/role.
# app_user + users are GLOBAL (no RLS); membership is board-scoped RLS, so we
# loop the boards setting app.board and let the policy scope each read.
set -euo pipefail
EMAIL="${1:?usage: prod_check_email.sh <email>}"
cd /opt/olorin
DBURL="$(grep -E '^DATABASE_URL=' .env | head -1 | cut -d= -f2-)"

echo "=== email: $EMAIL ==="
echo "=== app_user (spine identity — email is UNIQUE) ==="
psql "$DBURL" -tAc "select id||' | '||email||' | '||coalesce(name,'(no name)')||' | '||created_at from app_user where lower(email)=lower('$EMAIL');"

echo "=== users (better-auth identity — proof they signed in) ==="
psql "$DBURL" -tAc "select id||' | '||email||' | '||coalesce(name,'(no name)')||' | '||created_at from users where lower(email)=lower('$EMAIL');"

echo "=== memberships across ALL boards (board | role | enabled | created) ==="
psql "$DBURL" -v em="$EMAIL" <<'SQL'
DO $$
DECLARE b RECORD; m RECORD; found BOOLEAN := false; needle TEXT := lower(:'em');
BEGIN
  FOR b IN SELECT id, slug FROM board ORDER BY slug LOOP
    PERFORM set_config('app.board', b.id::text, false);
    FOR m IN
      SELECT mm.role, mm.enabled, mm.created_at
      FROM membership mm JOIN app_user au ON au.id = mm.user_id
      WHERE lower(au.email) = needle
    LOOP
      found := true;
      RAISE NOTICE 'board=% | role=% | enabled=% | created=%', b.slug, m.role, m.enabled, m.created_at;
    END LOOP;
  END LOOP;
  IF NOT found THEN RAISE NOTICE '(no membership rows on any board — they are in the waiting room / never completed onboarding)'; END IF;
END $$;
SQL
