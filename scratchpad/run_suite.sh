#!/usr/bin/env bash
# Exit-code-keyed suite runner (M42: a missing script must NOT render as a pass).
# Recreated S111. Results stream LINE BY LINE to scratchpad/suite.log — never pipe
# this through `tail`, or a hang costs you every result collected so far.
#
# ⚠️ NO `timeout` ON macOS (GNU coreutils only) — an earlier revision used it and
# every probe came back EXIT=127, reading as 44 reds. The watchdog below is
# portable bash: run in background, poll, kill on overrun.
#
# EXCLUDED by default (FULL=1 to include): probes with legs that make UNCAPPED
# real-Gemini authoring calls. probe_fig_auth §9 hung >13 min in S111. Declared,
# not silent — the excluded names print every run.
cd "$(dirname "$0")/.." || exit 1
LIMIT=${LIMIT:-300}
# ⚠️ probe:set is `probe_authoring_set.ts` — an AUTHORING probe despite its alias
# not starting with "authoring". Matching on the alias missed it and it timed out.
# Match on the SCRIPT name, not the alias, if this list is ever regenerated.
SLOW_AI="probe:figauth probe:authoring probe:authoringchat probe:authoringtool probe:chatlist probe:set probe:voice probe:voicerelay probe:image probe:imageverify probe:imageread probe:pipecatstart"
ALL=$(grep -oE '"probe:[a-z0-9]+"' package.json | tr -d '"' | sort -u)
LOG=scratchpad/suite.log; : > "$LOG"
if [ "$FULL" = "1" ]; then PROBES="$ALL"; echo "FULL run — nothing excluded" | tee -a "$LOG";
else
  PROBES=$(for p in $ALL; do echo "$SLOW_AI" | grep -qw "$p" || echo "$p"; done)
  echo "EXCLUDED (uncapped-AI, FULL=1 to include):$SLOW_AI" | tee -a "$LOG"
fi

run_with_limit() { # $1=probe  → writes /tmp/suite_out, returns code (124 = overrun)
  bun run "$1" > /tmp/suite_out 2>&1 &
  local pid=$! waited=0
  while kill -0 $pid 2>/dev/null; do
    [ $waited -ge $LIMIT ] && { kill -9 $pid 2>/dev/null; wait $pid 2>/dev/null; return 124; }
    sleep 2; waited=$((waited+2))
  done
  wait $pid; return $?
}

pass=0; fail=0; failed=""
for p in $PROBES; do
  run_with_limit "$p"; code=$?
  out=$(cat /tmp/suite_out)
  tally=$(echo "$out" | grep -oE '[0-9]+ passed, [0-9]+ failed' | tail -1)
  if [ $code -eq 0 ]; then
    pass=$((pass+1)); printf "  ✓ %-26s %s\n" "$p" "$tally" | tee -a "$LOG"
  elif [ $code -eq 124 ]; then
    fail=$((fail+1)); failed="$failed $p(TIMEOUT)"
    printf "  ⏱ %-26s TIMED OUT at %ss\n" "$p" "$LIMIT" | tee -a "$LOG"
  else
    fail=$((fail+1)); failed="$failed $p"
    printf "  ✗ %-26s EXIT=%s %s\n" "$p" "$code" "$tally" | tee -a "$LOG"
    echo "$out" | grep -E '✗|Error|error:' | head -8 >> "$LOG"
  fi
done
{ echo ""; echo "SUITE: $pass green, $fail red"; [ -n "$failed" ] && echo "RED:$failed"; } | tee -a "$LOG"
exit $([ $fail -eq 0 ] && echo 0 || echo 1)
