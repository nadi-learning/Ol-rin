#!/usr/bin/env bash
# DESTRUCTIVE, founder-authorised: fully remove spranav.iitkgp@gmail.com from prod.
# Single transaction (DO block) — any unexpected FK restrict rolls the WHOLE thing
# back, so a partial delete is impossible. Order: children (membership, onboarding)
# → app_user → users (cascades accounts + sessions). RLS: app.board=cbse (spranav's
# only board) so b2c_app can reach the board-scoped child rows.
set -euo pipefail
cd /opt/olorin
DBURL="$(grep -E '^DATABASE_URL=' .env | head -1 | cut -d= -f2-)"
psql "$DBURL" <<'SQL'
DO $$
DECLARE
  needle text := 'spranav.iitkgp@gmail.com';
  x uuid; u uuid; bid uuid;
  m_del int := 0; o_del int := 0; au_del int := 0; us_del int := 0;
BEGIN
  SELECT id INTO x FROM app_user WHERE lower(email)=lower(needle);
  SELECT id INTO u FROM users    WHERE lower(email)=lower(needle);
  IF x IS NULL AND u IS NULL THEN RAISE NOTICE 'already gone — nothing to delete'; RETURN; END IF;
  RAISE NOTICE 'app_user=% users=%', x, u;

  SELECT id INTO bid FROM board WHERE slug='cbse';
  PERFORM set_config('app.board', bid::text, false);

  IF x IS NOT NULL THEN
    DELETE FROM membership WHERE user_id = x; GET DIAGNOSTICS m_del = ROW_COUNT;
    DELETE FROM onboarding WHERE user_id = x; GET DIAGNOSTICS o_del = ROW_COUNT;
    DELETE FROM app_user   WHERE id = x;      GET DIAGNOSTICS au_del = ROW_COUNT;
  END IF;
  IF u IS NOT NULL THEN
    DELETE FROM users WHERE id = u;           GET DIAGNOSTICS us_del = ROW_COUNT;
  END IF;

  RAISE NOTICE 'deleted -> membership=% onboarding=% app_user=% users=% (accounts+sessions cascade)',
               m_del, o_del, au_del, us_del;

  IF EXISTS (SELECT 1 FROM app_user WHERE lower(email)=lower(needle)) THEN
    RAISE EXCEPTION 'ABORT: app_user still present after delete';
  END IF;
  IF EXISTS (SELECT 1 FROM users WHERE lower(email)=lower(needle)) THEN
    RAISE EXCEPTION 'ABORT: users still present after delete';
  END IF;
  RAISE NOTICE 'CONFIRMED: spranav.iitkgp@gmail.com fully removed from prod';
END $$;
SQL
