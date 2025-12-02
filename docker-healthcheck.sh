#!/bin/sh
set -e

# Read basePath from environment (defaults to empty string if not set)
BASE_PATH="${basePath:-}"

# Normalize basePath: strip trailing slash, add leading slash if non-empty
if [ -n "$BASE_PATH" ]; then
  BASE_PATH="$(echo "$BASE_PATH" | sed 's:/*$::')"
  BASE_PATH="/${BASE_PATH#/}"
fi

# Construct health check URL
HEALTH_URL="http://localhost:3003${BASE_PATH}/health"

# Perform health check
wget --no-verbose --tries=1 --spider "$HEALTH_URL" || exit 1
