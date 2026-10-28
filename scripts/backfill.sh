#!/usr/bin/env bash
# Backfill past weeks politely: one week per run (<= 5 requests per eTrition
# district; per SchoolCafe one, a weekly call per meal type + <= maxDetails
# + <= 1 daily call),
# oldest first, GAP_SECONDS apart (default 10 min). Stops at the first failed run.
# Usage: scripts/backfill.sh FIRST_MONDAY STOP_MONDAY [NCES_ID]   (STOP week not
# fetched; with an id, only that district)
# SchoolCafe served menus only from Oct 1 when asked on 2026-10-09 and 2026-10-20,
# so backfilling a SchoolCafe district further back returns empty weeks.
# ponytail: macOS `date -j -v`; GNU date needs `date -d "$week + 7 days"`.
set -euo pipefail
week="$1"
stop="$2"
gap="${GAP_SECONDS:-600}"
cd "$(dirname "$0")/.."
while [[ "$week" < "$stop" ]]; do
  echo "== week of $week, $(date +%H:%M:%S)"
  node src/run.ts "$week" ${3:+"$3"}
  week="$(date -j -v+7d -f %F "$week" +%F)"
  if [[ "$week" < "$stop" ]]; then sleep "$gap"; fi
done
echo "== backfill done, $(date +%H:%M:%S)"
