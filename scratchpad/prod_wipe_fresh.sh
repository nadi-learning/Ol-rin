#!/usr/bin/env bash
# DESTRUCTIVE (founder-authorised). Fresh-start wipe of prod:
#   - KEEP exactly the 8 allow-listed identities (their app_user + better-auth
#     users + sessions/accounts + membership rows). Everything else identity-wise
#     is deleted (all @example.com litter AND any non-listed real login, incl varnika).
#   - WIPE ALL content on EVERY board incl. cbse (subject/chapter/topic/sub_topic/
#     LO/content_unit/content_version/question + images).
#   - WIPE ALL evidence/progress for everyone (attempts, events, observations,
#     mastery, onboarding, ...) and the relationship tables (parent_child, tutor_student).
#   - KEEP all board rows.
# Net: the 8 people keep only login + membership (enrolled, empty curriculum).
#
# Runs as b2c_app. Tenant tables are FORCE-RLS'd, so we loop every board and set
# app.board; global tables delete directly. ONE transaction: any FK surprise rolls
# the WHOLE thing back.
#
# DRY RUN by default (does the deletes, prints counts + survivors, then ROLLBACK).
# Pass --execute to COMMIT for real.
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
  b RECORD; tbl TEXT; n BIGINT; total BIGINT; keep_mem BIGINT;
  gone_au BIGINT; gone_u BIGINT; keep_au BIGINT; keep_u BIGINT;
  keep_lower TEXT[];
  keep_emails TEXT[] := ARRAY[
    'xxxx51263@gmail.com','ambhakat1999@gmail.com',
    'spranav.iitkgp@gmail.com','spranav.iitkg@gmail.com',
    'avanikishore29@gmail.com','purwaravani@gmail.com',
    'sharanyasd2010@gmail.com','shagunb11gmail.com@gmail.com'];
  -- every tenant-scoped table EXCEPT membership, child -> parent order
  del_tables TEXT[] := ARRAY[
    'attempt_image','question_image','cross_concept_flag','mastery_history',
    'horizontal_skill_state','student_chapter_insight','student_subject_insight',
    'pace_plan','voice_session','observation','attempt','assessment_session',
    'assignment','report','scheduling_state','mastery_state','event_log',
    'transcript','practice_session','onboarding','authoring_worker','authoring_chat',
    'horizontal_skill','question','content_unit','learning_objective',
    'parent_child','tutor_student','sub_topic','topic','chapter','subject'];
BEGIN
  SELECT array_agg(lower(e)) INTO keep_lower FROM unnest(keep_emails) e;

  SELECT count(*) INTO gone_au FROM app_user WHERE lower(email) <> ALL(keep_lower);
  SELECT count(*) INTO gone_u  FROM users    WHERE lower(email) <> ALL(keep_lower);
  RAISE NOTICE 'to delete: % non-kept app_user, % non-kept users', gone_au, gone_u;

  -- GLOBAL children that reference tenant rows: delete BEFORE the board loop
  DELETE FROM content_version;   -- child of content_unit
  DELETE FROM upload_token;      -- child of practice_session/question
  DELETE FROM ai_call_log;       -- forensics; set-null refs

  -- Per-board wipe of ALL content + ALL evidence + non-kept memberships
  FOR b IN SELECT id, slug FROM board LOOP
    PERFORM set_config('app.board', b.id::text, false);
    FOREACH tbl IN ARRAY del_tables LOOP
      EXECUTE format('DELETE FROM %I', tbl);
    END LOOP;
    -- keep ONLY the allow-listed users' memberships
    DELETE FROM membership
      WHERE user_id NOT IN (SELECT id FROM app_user WHERE lower(email) = ANY(keep_lower));
  END LOOP;

  -- GLOBAL identity: everyone NOT in the allow-list (children now gone)
  DELETE FROM app_user WHERE lower(email) <> ALL(keep_lower);
  DELETE FROM users    WHERE lower(email) <> ALL(keep_lower);  -- cascades sessions+accounts

  -- ================= VERIFICATION (inside txn) =================
  IF EXISTS (SELECT 1 FROM app_user WHERE lower(email) <> ALL(keep_lower)) THEN
    RAISE EXCEPTION 'ABORT: non-kept app_user rows remain'; END IF;
  IF EXISTS (SELECT 1 FROM users WHERE lower(email) <> ALL(keep_lower)) THEN
    RAISE EXCEPTION 'ABORT: non-kept users rows remain'; END IF;
  IF NOT EXISTS (SELECT 1 FROM app_user WHERE lower(email)='xxxx51263@gmail.com') THEN
    RAISE EXCEPTION 'ABORT: founder app_user (xxxx51263@gmail.com) missing!'; END IF;

  SELECT count(*) INTO keep_au FROM app_user;
  SELECT count(*) INTO keep_u  FROM users;
  RAISE NOTICE 'KEPT: % app_user, % users (expect 8 and 8)', keep_au, keep_u;
  IF keep_au <> 8 THEN RAISE EXCEPTION 'ABORT: expected 8 surviving app_user, got %', keep_au; END IF;

  -- remaining content+evidence across ALL boards must be 0; count kept memberships
  total := 0; keep_mem := 0;
  FOR b IN SELECT id FROM board LOOP
    PERFORM set_config('app.board', b.id::text, false);
    FOREACH tbl IN ARRAY del_tables LOOP
      EXECUTE format('SELECT count(*) FROM %I', tbl) INTO n; total := total + n;
    END LOOP;
    EXECUTE 'SELECT count(*) FROM membership' INTO n; keep_mem := keep_mem + n;
  END LOOP;
  RAISE NOTICE 'remaining content+evidence rows (all boards) = % (expect 0)', total;
  RAISE NOTICE 'KEPT: % membership rows (allow-listed users, all boards)', keep_mem;
  IF total <> 0 THEN RAISE EXCEPTION 'ABORT: % content/evidence rows survived', total; END IF;
END \$\$;

-- Show the survivors so the founder can eyeball the keep-set before committing
\echo '--- surviving app_user (must be exactly the 8) ---'
SELECT to_char(created_at,'YYYY-MM-DD') AS created, email, coalesce(name,'(none)') AS name
FROM app_user ORDER BY created_at;
\echo '--- surviving users (better-auth logins) ---'
SELECT to_char(created_at,'YYYY-MM-DD') AS created, email, coalesce(name,'(none)') AS name
FROM users ORDER BY created_at;

$FINISH;
SQL
echo "### DONE — mode: $FINISH ###"
