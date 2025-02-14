#!/bin/sh

# Ensure necessary directories exist
mkdir -p /app/data/db
mkdir -p /app/data/log

# Run migrations
echo "Running database migrations..."
npm run migrate

# Start the application
echo "Starting application..."
npm run start:prod