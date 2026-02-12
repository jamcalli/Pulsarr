FROM oven/bun:1.3.9-alpine@sha256:9028ee7a60a04777190f0c3129ce49c73384d3fc918f3e5c75f5af188e431981 AS base
WORKDIR /app

# Install production dependencies in a temp directory (cached independently)
FROM base AS install
COPY package.json bun.lock ./
COPY packages ./packages
RUN mkdir -p /temp/prod && \
    cp package.json bun.lock /temp/prod/ && \
    cp -r packages /temp/prod/packages && \
    cd /temp/prod && \
    bun install --frozen-lockfile --production --ignore-scripts

# Build stage: full install + compile
FROM base AS builder
ARG TMDBAPIKEY
ENV tmdbApiKey=${TMDBAPIKEY}

COPY package.json bun.lock ./
COPY packages ./packages

RUN --mount=type=cache,target=/root/.bun/install/cache \
    bun install --frozen-lockfile

COPY vite.config.js tsconfig.json postcss.config.mjs ./
COPY src ./src

RUN --mount=type=cache,target=/app/node_modules/.vite \
    bun run build

# Final runtime image
FROM base

# wget for healthcheck
RUN apk add --no-cache wget

ENV CACHE_DIR=/app/build-cache

# Copy package files
COPY package.json bun.lock ./
COPY packages ./packages
# Production-only dependencies from the install stage
COPY --from=install /temp/prod/node_modules ./node_modules

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
