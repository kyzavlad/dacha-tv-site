#!/usr/bin/env bash
set -euo pipefail

ENV_FILE="/var/www/dacha-tv/shared/.env.production"

if [ ! -r "$ENV_FILE" ]; then
  echo "[dacha-tv] required environment file is missing or unreadable" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

export NODE_ENV="${NODE_ENV:-production}"
export HOSTNAME="${HOSTNAME:-127.0.0.1}"
export PORT="${PORT:-3030}"

exec node server.js
