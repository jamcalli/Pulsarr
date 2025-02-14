FROM node:23.6.0-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY .nvmrc ./

# Install ALL dependencies (including dev deps needed for build)
RUN npm ci

# Copy source code
COPY . .

# Build application
RUN npm run build
# Verify build output
RUN ls -la dist && ls -la dist/client

FROM node:23.6.0-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install ALL dependencies (since Vite is needed in prod)
RUN npm ci

# Copy the entire dist directory structure
COPY --from=builder /app/dist ./dist
# Copy vite config from root
COPY --from=builder /app/vite.config.js ./

# Copy migrations
COPY migrations ./migrations

# Copy data directory structure
COPY data ./data

# Copy and set up startup script
COPY docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh

# Verify final structure
RUN ls -la && ls -la dist && ls -la dist/client

VOLUME /app/data
EXPOSE 3003
CMD ["./docker-entrypoint.sh"]