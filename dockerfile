FROM node:23.6.0-alpine AS builder

WORKDIR /app

# Copy build essentials
COPY package*.json ./
COPY src ./src
COPY vite.config.js ./
COPY tsconfig.json ./
COPY tailwind.config.ts ./
COPY postcss.config.mjs ./

# Install dependencies
RUN npm ci

# Build
RUN npm run build

# Ensure cache directory exists for build
RUN mkdir -p node_modules/.cache/@fastify/vite

FROM node:23.6.0-alpine

WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm ci

# Create necessary directories
RUN mkdir -p /app/data/db && \
    mkdir -p /app/data/log && \
    mkdir -p node_modules/.cache/@fastify/vite

# Copy build artifacts, config, and cache
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules/.cache/@fastify/vite/vite.config.dist.json ./node_modules/.cache/@fastify/vite/
COPY vite.config.js ./
COPY migrations ./migrations
COPY docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh

# Set production environment
ENV NODE_ENV=production

VOLUME /app/data
EXPOSE 3003

CMD ["./docker-entrypoint.sh"]