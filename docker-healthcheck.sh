#!/bin/sh
set -e

# Read basePath from environment
BASE_PATH="${basePath:-}"

# Normalize basePath: strip leading/trailing slashes, then add single leading slash
if [ -n "$BASE_PATH" ] && [ "$BASE_PATH" != "/" ]; then
  # Remove all leading and trailing slashes
  BASE_PATH="$(echo "$BASE_PATH" | sed 's:^/*::' | sed 's:/*$::')"
  # Add leading slash if we still have content
  if [ -n "$BASE_PATH" ]; then
    BASE_PATH="/${BASE_PATH}"
  fi
else
  BASE_PATH=""
fi

# Read listenPort from environment (default to 3003)
# listenPort: internal port the server binds to
# port: external port for webhook URL generation (not used here)
LISTEN_PORT="${listenPort:-3003}"

# Construct health check URL
# Note: Use 127.0.0.1 to avoid IPv6 issues
HEALTH_URL="http://127.0.0.1:${LISTEN_PORT}${BASE_PATH}/health"

# Perform health check
wget --no-verbose --tries=1 --spider "$HEALTH_URL" || exit 1
