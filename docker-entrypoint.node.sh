#!/bin/sh
set -eu
# Enable pipefail only when supported
( set -o pipefail ) 2>/dev/null && set -o pipefail

PUID=${PUID:-1000}
PGID=${PGID:-1000}

# Recreate pulsarr user/group with requested IDs
deluser pulsarr 2>/dev/null || true
delgroup pulsarr 2>/dev/null || true
addgroup -g "$PGID" -S pulsarr
adduser -u "$PUID" -G pulsarr -D -H -s /sbin/nologin pulsarr

# Ensure writable directories exist and fix ownership (only files with wrong owner)
mkdir -p /app/data/db /app/data/logs /app/build-cache
find /app/data /app/build-cache ! \( -user "$PUID" -group "$PGID" \) -exec chown pulsarr:pulsarr {} + 2>/dev/null || true

echo "Starting Pulsarr as uid=$PUID, gid=$PGID"

echo "Running database migrations..."
su-exec pulsarr ./node_modules/.bin/tsx migrations/migrate.ts

echo "Starting application..."
exec su-exec pulsarr node dist/server.js "$@"
