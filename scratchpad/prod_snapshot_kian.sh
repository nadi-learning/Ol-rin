#!/usr/bin/env bash
# READ-ONLY. Pre-0037 snapshot of Kian's onboarding ANSWERS (grade/pronoun/school/
# fav_character/pet) before migration 0037 drops those columns. Nothing is
# modified. onboarding is RLS'd on OLD prod, so we loop boards + set app.board.
# Run this BEFORE deploying 0037, via !-SSH. Paste the output back (esp. pronoun).
set -euo pipefail
cd /opt/olorin
DBURL="$(grep -E '^DATABASE_URL=' .env | head -1 | cut -d= -f2-)"

KIAN='kianjibo500@gmail.com'
PRANAV='spranav.iitkgp@gmail.com'

echo "############ KIAN onboarding answers (pre-0037) ############"
psql "$DBURL" <<SQL
DO \$\$
DECLARE b RECORD; r RECORD;
BEGIN
  FOR b IN SELECT id, slug FROM board LOOP
    PERFORM set_config('app.board', b.id::text, true);
    FOR r IN
      SELECT o.status, o.current_step, o.grade, o.pronoun, o.school,
             o.fav_character, o.pet, o.completed_at
      FROM onboarding o
      JOIN app_user u ON u.id = o.user_id
      WHERE lower(u.email) = lower('$KIAN')
    LOOP
      RAISE NOTICE 'board=% status=% step=% grade=% pronoun=% school=% fav_character=% pet=% completed_at=%',
        b.slug, r.status, r.current_step, r.grade, coalesce(r.pronoun,'∅'),
        coalesce(r.school,'∅'), r.fav_character, r.pet, r.completed_at;
    END LOOP;
  END LOOP;
END \$\$;
SQL

echo
echo "############ Identity ids (stable across cutover) ############"
psql "$DBURL" -tAc "SELECT 'kian   '||id FROM app_user WHERE lower(email)=lower('$KIAN');"
psql "$DBURL" -tAc "SELECT 'pranav '||id FROM app_user WHERE lower(email)=lower('$PRANAV');"

echo
echo "############ Sanity: Kian's cbse content chain still present ############"
psql "$DBURL" <<SQL
DO \$\$
DECLARE bid uuid; kid uuid; q int; o int; a int;
BEGIN
  SELECT id INTO bid FROM board WHERE slug='cbse';
  PERFORM set_config('app.board', bid::text, true);
  SELECT id INTO kid FROM app_user WHERE lower(email)=lower('$KIAN');
  SELECT count(*) INTO q FROM question WHERE target_student_id = kid;
  SELECT count(*) INTO o FROM observation WHERE student_id = kid;
  SELECT count(*) INTO a FROM assignment WHERE student_id = kid;
  RAISE NOTICE 'cbse: questions=% observations=% assignments=%', q, o, a;
END \$\$;
SQL
