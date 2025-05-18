#!/bin/sh

# Replace placeholder base path in built files
if [ -n "$basePath" ]; then
    echo "Configuring base path: $basePath"
    # Replace in index.html
    find /app/dist/client -name "index.html" -exec sed -i "s|__PULSARR_BASE_PATH__|${basePath}|g" {} \;
    # Replace in JS files
    find /app/dist/client -name "*.js" -exec sed -i "s|__PULSARR_BASE_PATH__|${basePath}|g" {} \;
else
    echo "No base path configured, replacing with empty string"
    # Replace with empty string if no base path
    find /app/dist/client -name "index.html" -exec sed -i "s|__PULSARR_BASE_PATH__||g" {} \;
    find /app/dist/client -name "*.js" -exec sed -i "s|__PULSARR_BASE_PATH__||g" {} \;
fi

# Run migrations
echo "Running database migrations..."
npm run migrate

# Start the application with arguments
echo "Starting application with args: ${NODE_ARGS:-}"
exec node dist/server.js ${NODE_ARGS:-}