#!/bin/sh

# Run migrations
echo "Running database migrations..."
npm run migrate

# Start the application
echo "Starting application..."
exec npm run start:prod