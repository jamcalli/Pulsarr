#!/bin/sh
set -eu
# Enable pipefail only when supported
( set -o pipefail ) 2>/dev/null && set -o pipefail

PUID=${PUID:-1000}
PGID=${PGID:-1000}

deluser pulsarr 2>/dev/null || true
delgroup pulsarr 2>/dev/null || true

# Some GIDs are pre-allocated in Alpine (e.g. 100 is "users")
EXISTING_GROUP=$(getent group "$PGID" 2>/dev/null | cut -d: -f1 || true)
if [ -n "$EXISTING_GROUP" ]; then
  APP_GROUP="$EXISTING_GROUP"
else
  addgroup -g "$PGID" -S pulsarr
  APP_GROUP="pulsarr"
fi

EXISTING_USER=$(getent passwd "$PUID" 2>/dev/null | cut -d: -f1 || true)
if [ -n "$EXISTING_USER" ]; then
  APP_USER="$EXISTING_USER"
else
  adduser -u "$PUID" -G "$APP_GROUP" -D -H -s /sbin/nologin pulsarr
  APP_USER="pulsarr"
fi

# Ensure writable directories exist and fix ownership (only files with wrong owner)
mkdir -p /app/data/db /app/data/logs /app/build-cache
find /app/data /app/build-cache ! \( -user "$PUID" -group "$PGID" \) -exec chown "$APP_USER:$APP_GROUP" {} + 2>/dev/null || true

echo "Starting Pulsarr as uid=$PUID, gid=$PGID"

echo "Running database migrations..."
su-exec "$APP_USER:$APP_GROUP" ./node_modules/.bin/tsx migrations/migrate.ts

echo "Starting application..."
exec su-exec "$APP_USER:$APP_GROUP" node dist/server.js "$@"
