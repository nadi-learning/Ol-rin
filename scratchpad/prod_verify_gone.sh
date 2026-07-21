#!/usr/bin/env bash
set -euo pipefail
cd /opt/olorin
DBURL="$(grep -E '^DATABASE_URL=' .env | head -1 | cut -d= -f2-)"
N="spranav.iitkgp@gmail.com"
echo -n "app_user: "; psql "$DBURL" -tAc "select count(*) from app_user where lower(email)=lower('$N');"
echo -n "users:    "; psql "$DBURL" -tAc "select count(*) from users where lower(email)=lower('$N');"
echo -n "accounts (by former user id): "; psql "$DBURL" -tAc "select count(*) from accounts where user_id='727db1fe-266f-4640-ae9d-84c27508762e';"
echo -n "sessions (by former user id): "; psql "$DBURL" -tAc "select count(*) from sessions where user_id='727db1fe-266f-4640-ae9d-84c27508762e';"
