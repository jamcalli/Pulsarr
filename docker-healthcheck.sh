#!/bin/sh
set -e

# Read basePath from environment (defaults to empty string if not set)
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

# Construct health check URL
HEALTH_URL="http://localhost:3003${BASE_PATH}/health"

# Perform health check
wget --no-verbose --tries=1 --spider "$HEALTH_URL" || exit 1
