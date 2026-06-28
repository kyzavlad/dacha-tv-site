#!/usr/bin/env bash
# Smoke timing for the public hot paths. Verifies pages return 200 fast and that
# the availability API degrades gracefully (always 200, even when the DB is slow).
#
# Usage:
#   scripts/smoke-timing.sh                       # against production
#   BASE=http://localhost:3000 scripts/smoke-timing.sh
#
# Pass targets (after deploy):
#   /lavender       → HTTP 200, TTFB < 2s
#   /api/bookings/availability → HTTP 200, total < 4s (degraded OK)
set -u

BASE="${BASE:-https://www.dachatv.com}"

# Tomorrow (UTC) — a realistic availability query date.
DATE="$(date -u -d '+1 day' +%F 2>/dev/null || date -u -v+1d +%F)"

PATHS=(
  "/"
  "/lavender"
  "/services"
  "/catalog"
  "/api/bookings/availability?type=lavender&date=${DATE}"
)

printf '%-55s %-7s %-12s %-12s\n' "URL" "HTTP" "TTFB(s)" "TOTAL(s)"
printf '%.0s-' {1..90}; printf '\n'

for p in "${PATHS[@]}"; do
  url="${BASE}${p}"
  # %{time_starttransfer} = TTFB, %{time_total} = full response.
  read -r code ttfb total < <(curl -s -o /dev/null \
    -w '%{http_code} %{time_starttransfer} %{time_total}' \
    --max-time 30 "$url")
  printf '%-55s %-7s %-12s %-12s\n' "$p" "${code:-ERR}" "${ttfb:-?}" "${total:-?}"
done

echo
echo "Pass criteria:"
echo "  /lavender                  → 200, TTFB < 2.0s"
echo "  /api/bookings/availability → 200, TOTAL < 4.0s (may return degraded:true)"
echo
echo "Inspect the availability payload directly:"
echo "  curl -s '${BASE}/api/bookings/availability?type=lavender&date=${DATE}' | head -c 300"
