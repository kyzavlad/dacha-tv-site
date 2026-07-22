#!/usr/bin/env bash
set -euo pipefail

# Manually roll back to a specific, already-installed release — or, with no
# argument, to the release just before the currently-active one. This is the
# OPERATOR-triggered rollback (e.g. a bug found after a deploy that still
# passed its health check); switch-release.sh also rolls back AUTOMATICALLY
# whenever a fresh deploy fails its health check.
#
# Usage: rollback.sh [release-id]

BASE_DIR="/var/www/dacha-tv"
RELEASES_DIR="$BASE_DIR/releases"
CURRENT_LINK="$BASE_DIR/current"

log() { printf '[rollback] %s\n' "$*"; }
die() { printf '[rollback] ERROR: %s\n' "$*" >&2; exit 1; }

TARGET="${1:-}"

if [ -z "$TARGET" ]; then
  [ -L "$CURRENT_LINK" ] || die "no current release symlink — cannot infer a rollback target, pass a release-id explicitly"
  CURRENT_NAME="$(basename "$(readlink -f "$CURRENT_LINK")")"
  mapfile -t ALL_RELEASES < <(cd "$RELEASES_DIR" && ls -1t)

  found_current=false
  for r in "${ALL_RELEASES[@]}"; do
    if [ "$found_current" = true ]; then
      TARGET="$r"
      break
    fi
    [ "$r" = "$CURRENT_NAME" ] && found_current=true
  done
  [ -n "$TARGET" ] || die "could not find a release older than the current one ($CURRENT_NAME) — pass a release-id explicitly"
  log "no release-id given — inferred rollback target: $TARGET"
fi

[ -d "$RELEASES_DIR/$TARGET" ] || die "release not found: $RELEASES_DIR/$TARGET"

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec "$DIR/switch-release.sh" "$TARGET"
