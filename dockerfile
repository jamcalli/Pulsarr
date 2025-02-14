FROM node:23.6.0-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY .nvmrc ./

# Install dependencies
RUN npm ci

# Copy source code
COPY . .

# Build application
RUN npm run build

FROM node:23.6.0-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install production dependencies only
RUN npm ci --production

# Copy built application from builder stage
COPY --from=builder /app/dist ./dist
# Add this line to copy vite config
COPY --from=builder /app/vite.config.js ./

# Copy migrations
COPY migrations ./migrations

# Copy data directory structure (will be mounted over)
COPY data ./data

# Copy and set up startup script
COPY docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh

# Declare volume
VOLUME /app/data

# Expose port
EXPOSE 3003

# Use the startup script as entrypoint
CMD ["./docker-entrypoint.sh"]