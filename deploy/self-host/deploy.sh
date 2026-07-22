#!/usr/bin/env bash
set -euo pipefail

# Full deploy: install a build artifact as a new release, then atomically
# switch to it (with automatic rollback on health-check failure). This is the
# single command an operator runs after uploading a fresh artifact to the
# server. Never echoes environment values.
#
# Usage: deploy.sh <archive.tar.gz> <release-id>
#   release-id is required here (unlike install-release.sh, where it's
#   optional) so this script can reliably chain install -> switch against the
#   exact same release directory.
#
# Example:
#   deploy.sh dacha-tv-standalone-linux-x64.tar.gz "$(date -u +%Y%m%d%H%M%S)"

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

log() { printf '[deploy] %s\n' "$*"; }
die() { printf '[deploy] ERROR: %s\n' "$*" >&2; exit 1; }

[ "$#" -ge 2 ] || die "usage: $0 <archive.tar.gz> <release-id>"
ARCHIVE="$1"
RELEASE_ID="$2"

log "step 1/2: install-release.sh"
"$DIR/install-release.sh" "$ARCHIVE" "$RELEASE_ID"

log "step 2/2: switch-release.sh (health-checked, auto-rollback on failure)"
"$DIR/switch-release.sh" "$RELEASE_ID"

log "deploy complete: $RELEASE_ID"
