#!/usr/bin/env bash
set -euo pipefail

# Installs a build artifact (produced by
# .github/workflows/build-standalone-linux.yml) into a new, uniquely-named
# release directory under /var/www/dacha-tv/releases/. Does NOT switch
# `current` — run switch-release.sh (or deploy.sh, which does both) to go
# live. Never echoes environment values.
#
# Usage: install-release.sh <path-to-dacha-tv-standalone-linux-x64.tar.gz> [release-id]
#   release-id defaults to the current UTC timestamp (YYYYMMDDHHMMSS).
#   Pass an explicit id (e.g. the git SHA) to make it deterministic/traceable.

BASE_DIR="/var/www/dacha-tv"
RELEASES_DIR="$BASE_DIR/releases"
SHARED_ENV="$BASE_DIR/shared/.env.production"

log() { printf '[install-release] %s\n' "$*"; }
die() { printf '[install-release] ERROR: %s\n' "$*" >&2; exit 1; }

[ "$#" -ge 1 ] || die "usage: $0 <archive.tar.gz> [release-id]"
ARCHIVE="$1"
[ -f "$ARCHIVE" ] || die "archive not found: $ARCHIVE"

# Refuse to install anything without a runtime config already in place — an
# app with no env vars would start in a broken/insecure state.
[ -f "$SHARED_ENV" ] || die "missing required env file: $SHARED_ENV (create it first — see deploy/self-host/README.md)"
PERMS="$(stat -c '%a' "$SHARED_ENV" 2>/dev/null || stat -f '%OLp' "$SHARED_ENV" 2>/dev/null || echo '')"
if [ "$PERMS" != "600" ]; then
  die "$SHARED_ENV must be chmod 600 (found: ${PERMS:-unknown}) — refusing to proceed with a non-private secrets file"
fi

RELEASE_ID="${2:-$(date -u +%Y%m%d%H%M%S)}"
RELEASE_DIR="$RELEASES_DIR/$RELEASE_ID"

[ -e "$RELEASE_DIR" ] && die "release already exists: $RELEASE_DIR (choose a different release id)"

mkdir -p "$RELEASE_DIR"
log "extracting $ARCHIVE -> $RELEASE_DIR"
# The archive's top-level directory is "standalone/" (see the build
# workflow's `tar -czf ... -C .next standalone`) — strip it so RELEASE_DIR
# itself is the app root, matching ecosystem.config.js's expectations
# (server.js directly inside the release directory).
tar -xzf "$ARCHIVE" -C "$RELEASE_DIR" --strip-components=1

log "verifying required release files"
REQUIRED_PATHS=(
  "server.js"
  ".next"
  ".next/static"
  "public"
)
for f in "${REQUIRED_PATHS[@]}"; do
  [ -e "$RELEASE_DIR/$f" ] || die "release is missing required path: $f (incomplete/bad archive — not switching to it, and leaving the broken directory at $RELEASE_DIR for inspection)"
done

# Defense in depth: an .env file should never have been packaged, but refuse
# to go anywhere near "current" if one somehow made it into the archive.
if find "$RELEASE_DIR" -maxdepth 4 -iname '.env*' | grep -q .; then
  die "release archive contains an .env file — refusing to install it. Found: $(find "$RELEASE_DIR" -maxdepth 4 -iname '.env*' | tr '\n' ' ')"
fi

log "release installed: $RELEASE_DIR"
log "next: deploy/self-host/switch-release.sh $RELEASE_ID"
