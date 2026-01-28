FROM oven/bun:1.3.7-alpine AS builder

WORKDIR /app

# Accept TMDB API key as build argument (GitHub Actions converts to TMDBAPIKEY)
ARG TMDBAPIKEY

# Set cache dir
ENV CACHE_DIR=/app/build-cache

# Set TMDB API key as environment variable in camelCase format
ENV tmdbApiKey=${TMDBAPIKEY}

# Copy package files first (changes less often)
COPY package.json bun.lock ./
COPY packages ./packages

# Install dependencies with cache mount
RUN --mount=type=cache,target=/root/.bun/install/cache \
    bun install --frozen-lockfile

# Copy build configuration files
COPY vite.config.js tsconfig.json postcss.config.mjs ./

# Copy source code (changes most often)
COPY src ./src

# Build with cache mounts
RUN --mount=type=cache,target=/app/node_modules/.vite \
    bun run build

# Install production-only dependencies over full install
RUN bun install --production --frozen-lockfile && mkdir -p ${CACHE_DIR}

FROM oven/bun:1.3.7-alpine

WORKDIR /app

# wget for healthcheck
RUN apk add --no-cache wget

# cache dir in final
ENV CACHE_DIR=/app/build-cache

# Copy package files
COPY package.json bun.lock ./
COPY packages ./packages
# Reuse production dependencies from the builder image
COPY --from=builder /app/node_modules ./node_modules

# Create necessary directories
RUN mkdir -p /app/data/db && \
    mkdir -p /app/data/log && \
    mkdir -p ${CACHE_DIR}

# Copy build artifacts
COPY --from=builder /app/dist ./dist
COPY migrations ./migrations
COPY docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh
COPY docker-healthcheck.sh ./
RUN chmod +x docker-healthcheck.sh

# Copy license and documentation files for compliance
COPY LICENSE* ./
COPY README.md ./

# Pass TMDB API key to runtime (GitHub Actions converts to TMDBAPIKEY)
ARG TMDBAPIKEY

# Set production environment
ENV NODE_ENV=production
ENV tmdbApiKey=${TMDBAPIKEY}

# Make volumes
VOLUME ["/app/build-cache"]
VOLUME ["/app/data"]
EXPOSE 3003

HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD ./docker-healthcheck.sh

CMD ["./docker-entrypoint.sh"]
