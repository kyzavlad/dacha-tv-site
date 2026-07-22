#!/usr/bin/env bash
set -euo pipefail

# Atomically switches the `current` symlink to a release already installed by
# install-release.sh, (re)starts it under PM2, health-checks it, and
# AUTOMATICALLY rolls back to the previous release if the health check fails.
# Prunes old release directories afterward — keeps the latest 3, and never
# deletes whatever `current` points to (even if that falls outside the
# newest-3 window, e.g. right after a rollback). Never echoes environment
# values.
#
# Usage: switch-release.sh <release-id>

BASE_DIR="/var/www/dacha-tv"
RELEASES_DIR="$BASE_DIR/releases"
CURRENT_LINK="$BASE_DIR/current"
SHARED_ENV="$BASE_DIR/shared/.env.production"
APP_NAME="dacha-tv"
HEALTH_URL="http://127.0.0.1:3030/api/health"
HEALTH_RETRIES=10
HEALTH_DELAY_S=2
KEEP_RELEASES=3

log() { printf '[switch-release] %s\n' "$*"; }
die() { printf '[switch-release] ERROR: %s\n' "$*" >&2; exit 1; }

[ "$#" -ge 1 ] || die "usage: $0 <release-id>"
RELEASE_ID="$1"
NEW_RELEASE="$RELEASES_DIR/$RELEASE_ID"

[ -d "$NEW_RELEASE" ] || die "release not found: $NEW_RELEASE (run install-release.sh first)"
[ -f "$SHARED_ENV" ] || die "missing required env file: $SHARED_ENV — refusing to switch to a release with no runtime config"

PREVIOUS_RELEASE=""
if [ -L "$CURRENT_LINK" ]; then
  PREVIOUS_RELEASE="$(readlink -f "$CURRENT_LINK" || true)"
fi

health_check() {
  local i
  for i in $(seq 1 "$HEALTH_RETRIES"); do
    if curl -fsS --max-time 3 "$HEALTH_URL" >/dev/null 2>&1; then
      return 0
    fi
    sleep "$HEALTH_DELAY_S"
  done
  return 1
}

# `mv -T` onto an existing symlink target is atomic on the same filesystem —
# there is never a moment where `current` points nowhere.
switch_symlink() {
  local target="$1"
  local tmp_link
  tmp_link="$(mktemp -u "$BASE_DIR/current.XXXXXX")"
  ln -s "$target" "$tmp_link"
  mv -Tf "$tmp_link" "$CURRENT_LINK"
}

log "switching current -> $NEW_RELEASE"
switch_symlink "$NEW_RELEASE"

log "starting/reloading PM2 process ($APP_NAME)"
if pm2 describe "$APP_NAME" >/dev/null 2>&1; then
  pm2 reload "$APP_NAME" --update-env
else
  pm2 start "$NEW_RELEASE/deploy/self-host/ecosystem.config.js" --update-env
fi

log "health-checking $HEALTH_URL (up to $((HEALTH_RETRIES * HEALTH_DELAY_S))s)"
if health_check; then
  log "health check passed — release $RELEASE_ID is live"
else
  log "health check FAILED for $RELEASE_ID — rolling back"
  if [ -n "$PREVIOUS_RELEASE" ] && [ -d "$PREVIOUS_RELEASE" ]; then
    switch_symlink "$PREVIOUS_RELEASE"
    pm2 reload "$APP_NAME" --update-env || pm2 restart "$APP_NAME"
    if health_check; then
      log "rolled back to previous release: $PREVIOUS_RELEASE"
    else
      die "rollback target ALSO failed its health check — manual intervention required. current -> $PREVIOUS_RELEASE; check 'pm2 logs $APP_NAME'."
    fi
  else
    die "no previous release to roll back to — manual intervention required. Check 'pm2 logs $APP_NAME'."
  fi
  die "deploy of $RELEASE_ID failed its health check and was rolled back to $(basename "$PREVIOUS_RELEASE")"
fi

log "pruning old releases (keeping the newest $KEEP_RELEASES, plus whatever is currently active)"
CURRENT_TARGET="$(readlink -f "$CURRENT_LINK")"
CURRENT_NAME="$(basename "$CURRENT_TARGET")"

mapfile -t ALL_RELEASES < <(cd "$RELEASES_DIR" && ls -1t)

declare -A KEEP=()
KEEP["$CURRENT_NAME"]=1
count=0
for r in "${ALL_RELEASES[@]}"; do
  if [ "$count" -lt "$KEEP_RELEASES" ]; then
    KEEP["$r"]=1
  fi
  count=$((count + 1))
done

for r in "${ALL_RELEASES[@]}"; do
  if [ -z "${KEEP[$r]:-}" ]; then
    log "removing old release: $r"
    rm -rf --one-file-system "${RELEASES_DIR:?}/${r:?}"
  fi
done

log "done"
