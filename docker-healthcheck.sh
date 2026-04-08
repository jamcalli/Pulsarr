#!/bin/sh
set -e

BASE_PATH="${basePath:-}"

# Normalize basePath: strip leading/trailing slashes, add single leading slash
if [ -n "$BASE_PATH" ] && [ "$BASE_PATH" != "/" ]; then
  BASE_PATH="$(echo "$BASE_PATH" | sed 's:^/*::' | sed 's:/*$::')"
  if [ -n "$BASE_PATH" ]; then
    BASE_PATH="/${BASE_PATH}"
  fi
else
  BASE_PATH=""
fi

# listenPort is the internal port (default 3003), not the external webhook port
LISTEN_PORT="${listenPort:-3003}"

# Use 127.0.0.1 to avoid IPv6 issues
HEALTH_URL="http://127.0.0.1:${LISTEN_PORT}${BASE_PATH}/health"

wget --no-verbose --tries=1 --spider "$HEALTH_URL" || exit 1
