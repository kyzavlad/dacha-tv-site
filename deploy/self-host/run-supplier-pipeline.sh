#!/usr/bin/env bash
# Dacha TV self-host supplier pipeline.
#
# One invocation fully drains each resumable stage before advancing:
#   base products -> categories -> official RRP -> existing catalog refresh
#   -> genuinely-new import finalization -> publish.
# It is safe for cron use: a non-blocking flock prevents overlapping runs, the
# CRON_SECRET is loaded only from the protected server env file, and no secret
# values are printed.
#
# Optional recovery mode:
#   run-supplier-pipeline.sh rrp
# starts at the named stage without replaying earlier completed stages. The
# default remains `products`, so the scheduled cron behavior is unchanged.

set -uo pipefail

ROOT="/var/www/dacha-tv"
ENV_FILE="$ROOT/shared/.env.production"
LOCK_FILE="$ROOT/shared/supplier-pipeline.lock"
APP_ORIGIN="http://127.0.0.1:3030"
START_STAGE="${1:-products}"
# Production feed is currently ~112k rows. Each bounded sync-products request
# processes roughly 7k-11k rows after downloading/parsing the full supplier JSON,
# so the former cap of 6 calls could never drain one full daily cycle. 20 calls
# keeps the runner bounded while leaving headroom for slower per-call progress.
MAX_PRODUCT_CALLS=20
MAX_RRP_CALLS=30
MAX_STAGE_HTTP_FAILURES=3
# 112,535 / 300 = 376 calls in the absolute worst case where every supplier
# row already exists in catalog_products. 400 leaves bounded headroom while the
# endpoint itself stays memory-safe at the production-proven 300-row batch.
MAX_CATALOG_REFRESH_CALLS=400
# After the existing queue is drained, import-products is left only with the
# small genuinely-new-SKU path. 40 remains ample for that bounded batch flow.
MAX_IMPORT_CALLS=40

stamp() { date -u '+%Y-%m-%dT%H:%M:%SZ'; }
log() { printf '[supplier-pipeline] %s %s\n' "$(stamp)" "$*"; }
fail() { log "ERROR: $*"; exit 1; }

stage_rank() {
  case "$1" in
    products) printf '1' ;;
    categories) printf '2' ;;
    rrp) printf '3' ;;
    existing) printf '4' ;;
    import) printf '5' ;;
    publish) printf '6' ;;
    *) return 1 ;;
  esac
}

if ! stage_rank "$START_STAGE" >/dev/null; then
  fail "invalid start stage '$START_STAGE' (expected products|categories|rrp|existing|import|publish)"
fi

should_run_stage() {
  local stage="$1"
  [ "$(stage_rank "$stage")" -ge "$(stage_rank "$START_STAGE")" ]
}

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
  local http_failures=0

  for ((i=1; i<=max_calls; i++)); do
    log "$label call $i/$max_calls"
    if ! body="$(call_api "$path")"; then
      http_failures=$((http_failures + 1))
      if [ "$http_failures" -ge "$MAX_STAGE_HTTP_FAILURES" ]; then
        fail "$label HTTP request failed $http_failures consecutive times"
      fi
      log "WARNING: $label HTTP request failed ($http_failures/$MAX_STAGE_HTTP_FAILURES); retrying from durable cursor"
      sleep $((http_failures * 3))
      continue
    fi
    http_failures=0

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

run_existing_catalog_refresh_stage() {
  local i body ok done processed updated approved

  for ((i=1; i<=MAX_CATALOG_REFRESH_CALLS; i++)); do
    log "existing catalog refresh call $i/$MAX_CATALOG_REFRESH_CALLS"
    if ! body="$(call_api '/api/admin/cron/refresh-catalog-existing')"; then
      fail "existing catalog refresh HTTP request failed"
    fi

    ok="$(printf '%s' "$body" | json_field ok)" || fail "existing catalog refresh returned invalid JSON"
    done="$(printf '%s' "$body" | json_field done)" || fail "existing catalog refresh returned invalid JSON"
    processed="$(printf '%s' "$body" | json_field processed)" || true
    updated="$(printf '%s' "$body" | json_field updated)" || true
    approved="$(printf '%s' "$body" | json_field approved)" || true

    log "existing catalog refresh ok=${ok:-unknown} done=${done:-unknown} processed=${processed:-n/a} updated=${updated:-n/a} approved=${approved:-n/a}"

    [ "$ok" = "true" ] || fail "existing catalog refresh reported ok=$ok"
    if [ "$done" = "true" ]; then
      log "existing catalog refresh drained"
      return 0
    fi

    sleep 1
  done

  fail "existing catalog refresh did not drain after $MAX_CATALOG_REFRESH_CALLS calls"
}

run_import_stage() {
  local i body ok done processed inserted updated remaining

  for ((i=1; i<=MAX_IMPORT_CALLS; i++)); do
    log "new-product import finalization call $i/$MAX_IMPORT_CALLS"
    if ! body="$(call_api '/api/admin/cron/import-products')"; then
      fail "new-product import finalization HTTP request failed"
    fi

    ok="$(printf '%s' "$body" | json_field ok)" || fail "new-product import finalization returned invalid JSON"
    done="$(printf '%s' "$body" | json_field done)" || fail "new-product import finalization returned invalid JSON"
    processed="$(printf '%s' "$body" | json_field processed)" || true
    inserted="$(printf '%s' "$body" | json_field inserted)" || true
    updated="$(printf '%s' "$body" | json_field updated)" || true
    remaining="$(printf '%s' "$body" | json_field remaining)" || true

    log "new-product import finalization ok=${ok:-unknown} done=${done:-unknown} processed=${processed:-n/a} inserted=${inserted:-n/a} updated=${updated:-n/a} remaining=${remaining:-n/a}"

    [ "$ok" = "true" ] || fail "new-product import finalization reported ok=$ok"
    if [ "$done" = "true" ]; then
      log "new-product import finalization drained"
      return 0
    fi

    sleep 1
  done

  fail "new-product import finalization did not drain after $MAX_IMPORT_CALLS calls"
}

log "starting full supplier pipeline"
log "start stage=$START_STAGE"
health_check || fail "pre-flight health check failed"

# 1. Finish the full base-price/stock feed first. This also refreshes
# supplier_categories from the same Personal.cab response.
if should_run_stage "products"; then
  run_resumable_stage "base products" "/api/admin/cron/sync-products" "$MAX_PRODUCT_CALLS"
fi

# 2. Reconcile/publish categories after products, so any categories extracted
# from today's product feed are available to today's catalog import.
if should_run_stage "categories"; then
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
fi

# 3. Only after base cost/stock is current, refresh official retail prices.
if should_run_stage "rrp"; then
  run_resumable_stage "official RRP" "/api/admin/cron/refresh-rrp" "$MAX_RRP_CALLS"
fi

# 4. Drain the large EXISTING supplier -> catalog queue without repeatedly
# invoking the genuinely-new-SKU scanner on every small memory-safe batch.
if should_run_stage "existing"; then
  run_existing_catalog_refresh_stage
fi

# 5. With existing rows already current, finish genuinely-new SKU handling.
# Under the current publication cap this normally terminates in one call; if the
# cap is later raised, the endpoint's own bounded new-insert path can still loop.
if should_run_stage "import"; then
  run_import_stage
fi

if should_run_stage "publish"; then
  log "publish products"
  publish_body="$(call_api '/api/admin/cron/publish-products')" || fail "publish-products HTTP request failed"
  publish_ok="$(printf '%s' "$publish_body" | json_field ok)" || fail "publish-products returned invalid JSON"
  [ "$publish_ok" = "true" ] || fail "publish-products reported ok=$publish_ok"
  log "publish products complete"
fi

health_check || fail "final health check failed"
log "supplier pipeline complete"
