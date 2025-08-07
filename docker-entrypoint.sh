#!/bin/sh
set -e  # Exit immediately if any command fails

# Run migrations
echo "Running database migrations..."
npm run migrate

# Start the application with arguments
echo "Starting application with args: ${NODE_ARGS:-}"
exec node dist/server.js ${NODE_ARGS:-}