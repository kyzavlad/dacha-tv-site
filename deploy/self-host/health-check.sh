#!/usr/bin/env bash
set -euo pipefail

# Standalone health check — usable manually, from cron/monitoring, or from
# switch-release.sh's own retry loop. Exits 0 when healthy, 1 otherwise.
# Prints only the response body / status, never secret values.
#
# Targets the LIGHTWEIGHT liveness route GET /api/health (pure process liveness,
# no Supabase client / no network — safe to poll every few seconds). The bounded
# backend probe lives at GET /api/admin/health/backend (CRON_SECRET protected).
#
# Usage: health-check.sh
#   HEALTH_URL=http://127.0.0.1:3030/api/health health-check.sh   (override)

HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:3030/api/health}"

if curl -fsS --max-time 3 "$HEALTH_URL"; then
  echo
  exit 0
else
  echo "[health-check] FAILED: $HEALTH_URL" >&2
  exit 1
fi
