#!/bin/sh
set -eu
# Enable pipefail only when supported
( set -o pipefail ) 2>/dev/null && set -o pipefail

# Run migrations
echo "Running database migrations..."
npm run migrate

# Start the application with arguments
echo "Starting application with args: ${NODE_ARGS:-}"
if [ -n "${NODE_ARGS:-}" ]; then
  # Intentionally allow word-splitting to pass multiple args correctly
  # shellcheck disable=SC2086
  set -- $NODE_ARGS
  exec node dist/server.js "$@"
else
  exec node dist/server.js
fi