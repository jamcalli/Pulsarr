#!/bin/sh
set -eu
# Enable pipefail only when supported
( set -o pipefail ) 2>/dev/null && set -o pipefail

# Run migrations
echo "Running database migrations..."
bun run --bun migrations/migrate.ts

# Start the application
echo "Starting application..."
exec bun run --bun dist/server.js "$@"
