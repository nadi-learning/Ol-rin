#!/usr/bin/env bash
# SAFE. Full logical backup of prod DB before any destructive cleanup.
# Requires a v17 pg_dump (RDS is 17.x). Install once with:
#   sudo dnf install -y postgresql17
set -euo pipefail
cd /opt/olorin
DBURL="$(grep -E '^DATABASE_URL=' .env | head -1 | cut -d= -f2-)"

VER="$(pg_dump --version | grep -oE '[0-9]+' | head -1)"
if [[ "$VER" -lt 17 ]]; then
  echo "ERROR: pg_dump is v$VER but RDS is v17. Run: sudo dnf install -y postgresql17"
  exit 1
fi

TS="$(date +%Y%m%d_%H%M%S)"
OUT="/opt/olorin/prod_backup_${TS}.dump"
pg_dump "$DBURL" -Fc --no-owner --no-acl -f "$OUT"
ls -lh "$OUT"
echo "BACKUP OK -> $OUT"
echo "Restore to a scratch DB with: pg_restore -d <scratch_dburl> --no-owner --no-acl $OUT"
