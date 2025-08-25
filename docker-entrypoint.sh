#!/bin/sh
set -eu
# Enable pipefail only when supported
( set -o pipefail ) 2>/dev/null && set -o pipefail

# Run migrations
echo "Running database migrations..."
npm run migrate

# Start the application
echo "Starting application..."
echo "Logging controlled by environment variables:"
echo "  enableConsoleOutput: ${enableConsoleOutput:-true}"
echo "  enableRequestLogging: ${enableRequestLogging:-true}"
exec node dist/server.js "$@"