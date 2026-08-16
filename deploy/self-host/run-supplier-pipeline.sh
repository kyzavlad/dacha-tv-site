#!/usr/bin/env bash
# Dacha TV self-host supplier pipeline.
#
# One invocation fully drains each resumable stage before advancing:
#   base products -> categories -> official RRP -> catalog import -> publish.
# It is safe for cron use: a non-blocking flock prevents overlapping runs, the
# CRON_SECRET is loaded only from the protected server env file, and no secret
# values are printed.

set -uo pipefail

ROOT="/var/www/dacha-tv"
ENV_FILE="$ROOT/shared/.env.production"
LOCK_FILE="$ROOT/shared/supplier-pipeline.lock"
APP_ORIGIN="http://127.0.0.1:3030"
MAX_PRODUCT_CALLS=6
MAX_RRP_CALLS=30
MAX_IMPORT_CALLS=40

stamp() { date -u '+%Y-%m-%dT%H:%M:%SZ'; }
log() { printf '[supplier-pipeline] %s %s\n' "$(stamp)" "$*"; }
fail() { log "ERROR: $*"; exit 1; }

command -v curl >/dev/null 2>&1 || fail "curl is required"
command -v node >/dev/null 2>&1 || fail "node is required"
command -v flock >/dev/null 2>&1 || fail "flock is required"

[ -r "$ENV_FILE" ] || fail "production env is not readable: $ENV_FILE"
set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

[ -n "${CRON_SECRET:-}" ] || fail "CRON_SECRET is missing"
APP_ORIGIN="${INTERNAL_APP_ORIGIN:-$APP_ORIGIN}"
APP_ORIGIN="${APP_ORIGIN%/}"

exec 9>"$LOCK_FILE" || fail "cannot open lock file"
if ! flock -n 9; then
  log "another supplier pipeline run already holds the lock; exiting cleanly"
  exit 0
fi

json_field() {
  local field="$1"
  node -e '
    const fs = require("fs");
    const field = process.argv[1];
    try {
      const obj = JSON.parse(fs.readFileSync(0, "utf8"));
      const value = obj[field];
      if (value === undefined || value === null) process.stdout.write("");
      else process.stdout.write(String(value));
    } catch (_) {
      process.exit(2);
    }
  ' "$field"
}

call_api() {
  local path="$1"
  curl -sS --fail-with-body --max-time 70 \
    -H "Authorization: Bearer ${CRON_SECRET}" \
    -H 'Host: dachatv.com' \
    -H 'X-Forwarded-Proto: https' \
    "${APP_ORIGIN}${path}"
}

health_check() {
  curl -sS --fail --max-time 15 "${APP_ORIGIN}/api/health" >/dev/null
}

run_resumable_stage() {
  local label="$1"
  local path="$2"
  local max_calls="$3"
  local i body ok complete state_saved resumed next processed

  for ((i=1; i<=max_calls; i++)); do
    log "$label call $i/$max_calls"
    if ! body="$(call_api "$path")"; then
      fail "$label HTTP request failed"
    fi

    ok="$(printf '%s' "$body" | json_field ok)" || fail "$label returned invalid JSON"
    complete="$(printf '%s' "$body" | json_field cycleComplete)" || fail "$label returned invalid JSON"
    state_saved="$(printf '%s' "$body" | json_field stateSaved)" || fail "$label returned invalid JSON"
    resumed="$(printf '%s' "$body" | json_field resumedFrom)" || true
    next="$(printf '%s' "$body" | json_field persistedNextOffset)" || true
    processed="$(printf '%s' "$body" | json_field processedThisRun)" || true

    log "$label ok=${ok:-unknown} complete=${complete:-unknown} resumed=${resumed:-n/a} next=${next:-n/a} processed=${processed:-n/a}"

    [ "$ok" = "true" ] || fail "$label reported ok=$ok"
    [ "$state_saved" = "true" ] || fail "$label did not persist its durable cursor"

    if [ "$complete" = "true" ]; then
      log "$label cycle complete"
      return 0
    fi

    sleep 2
  done

  fail "$label did not complete after $max_calls bounded calls"
}

run_import_stage() {
  local i body ok done processed inserted updated remaining

  for ((i=1; i<=MAX_IMPORT_CALLS; i++)); do
    log "catalog import call $i/$MAX_IMPORT_CALLS"
    if ! body="$(call_api '/api/admin/cron/import-products')"; then
      fail "catalog import HTTP request failed"
    fi

    ok="$(printf '%s' "$body" | json_field ok)" || fail "catalog import returned invalid JSON"
    done="$(printf '%s' "$body" | json_field done)" || fail "catalog import returned invalid JSON"
    processed="$(printf '%s' "$body" | json_field processed)" || true
    inserted="$(printf '%s' "$body" | json_field inserted)" || true
    updated="$(printf '%s' "$body" | json_field updated)" || true
    remaining="$(printf '%s' "$body" | json_field remaining)" || true

    log "catalog import ok=${ok:-unknown} done=${done:-unknown} processed=${processed:-n/a} inserted=${inserted:-n/a} updated=${updated:-n/a} remaining=${remaining:-n/a}"

    [ "$ok" = "true" ] || fail "catalog import reported ok=$ok"
    if [ "$done" = "true" ]; then
      log "catalog import drained"
      return 0
    fi

    sleep 1
  done

  fail "catalog import did not drain after $MAX_IMPORT_CALLS calls"
}

log "starting full supplier pipeline"
health_check || fail "pre-flight health check failed"

# 1. Finish the full base-price/stock feed first. This also refreshes
# supplier_categories from the same Personal.cab response.
run_resumable_stage "base products" "/api/admin/cron/sync-products" "$MAX_PRODUCT_CALLS"

# 2. Reconcile/publish categories after products, so any categories extracted
# from today's product feed are available to today's catalog import.
log "categories reconciliation"
if category_body="$(call_api '/api/admin/cron/sync-categories')"; then
  category_ok="$(printf '%s' "$category_body" | json_field ok)" || category_ok="false"
  if [ "$category_ok" = "true" ]; then
    log "categories reconciliation complete"
  else
    # Categories are intentionally non-blocking for price/stock freshness; the
    # endpoint itself isolates its sub-stages. Record the warning and continue.
    log "WARNING: categories reconciliation reported ok=${category_ok:-unknown}; continuing supplier price pipeline"
  fi
else
  log "WARNING: categories reconciliation HTTP request failed; continuing supplier price pipeline"
fi

# 3. Only after base cost/stock is current, refresh official retail prices.
run_resumable_stage "official RRP" "/api/admin/cron/refresh-rrp" "$MAX_RRP_CALLS"

# 4. Drain supplier -> catalog refresh, then publish drafts once all upstream
# product and retail-price data is current.
run_import_stage

log "publish products"
publish_body="$(call_api '/api/admin/cron/publish-products')" || fail "publish-products HTTP request failed"
publish_ok="$(printf '%s' "$publish_body" | json_field ok)" || fail "publish-products returned invalid JSON"
[ "$publish_ok" = "true" ] || fail "publish-products reported ok=$publish_ok"
log "publish products complete"

health_check || fail "final health check failed"
log "supplier pipeline complete"
