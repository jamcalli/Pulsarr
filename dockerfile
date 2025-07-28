FROM node:23.6.0-alpine AS builder

WORKDIR /app

# Accept TMDB API key as build argument (GitHub Actions converts to TMDBAPIKEY)
ARG TMDBAPIKEY

# Set cache dir
ENV CACHE_DIR=/app/build-cache

# Set TMDB API key as environment variable in camelCase format
ENV tmdbApiKey=${TMDBAPIKEY}

# Copy package files first (changes less often)
COPY package*.json ./

# Install dependencies with cache mount
RUN --mount=type=cache,target=/root/.npm \
    --mount=type=cache,target=/app/.npm \
    npm ci --prefer-offline --no-audit

# Copy build configuration files
COPY vite.config.js tsconfig.json postcss.config.mjs ./

# Copy source code (changes most often)
COPY src ./src

# Build with cache mounts
RUN --mount=type=cache,target=/app/.vite \
    --mount=type=cache,target=/app/node_modules/.vite \
    npm run build

# Ensure cache dir
RUN mkdir -p ${CACHE_DIR}

FROM node:23.6.0-alpine

WORKDIR /app

# cache dir in final
ENV CACHE_DIR=/app/build-cache

# Copy package files and install production dependencies with cache
COPY package*.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci --omit=dev --prefer-offline --no-audit --ignore-scripts && \
    npm rebuild better-sqlite3

# Create necessary directories
RUN mkdir -p /app/data/db && \
    mkdir -p /app/data/log && \
    mkdir -p ${CACHE_DIR}

# Copy build artifacts, config, and cache
COPY --from=builder /app/dist ./dist
COPY --from=builder ${CACHE_DIR} ${CACHE_DIR}
COPY vite.config.js ./
COPY migrations ./migrations
COPY docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh

# Pass TMDB API key to runtime (GitHub Actions converts to TMDBAPIKEY)
ARG TMDBAPIKEY

# Set production environment
ENV NODE_ENV=production
ENV tmdbApiKey=${TMDBAPIKEY}

# Make volumes
VOLUME ${CACHE_DIR}
VOLUME /app/data
EXPOSE 3003

CMD ["./docker-entrypoint.sh"]