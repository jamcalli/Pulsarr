FROM oven/bun:1.3.11-alpine@sha256:7ed9f74c326d1c260abe247ac423ccbf5ac92af62bb442d515d1f92f21e8ea9b AS base
WORKDIR /app

# Install production dependencies in a temp directory (cached independently)
FROM base AS install
COPY package.json bun.lock ./
COPY packages ./packages
RUN mkdir -p /temp/prod && \
    cp package.json bun.lock /temp/prod/ && \
    cp -r packages /temp/prod/packages && \
    cd /temp/prod && \
    bun install --frozen-lockfile --production --ignore-scripts && \
    rm -rf node_modules/vite node_modules/rollup node_modules/esbuild \
           node_modules/@rollup node_modules/@esbuild \
           node_modules/rolldown node_modules/@rolldown

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

# tini for proper PID 1 zombie reaping, wget for healthcheck, su-exec for privilege drop
RUN apk add --no-cache tini wget su-exec

ENV CACHE_DIR=/app/build-cache

# Remove bun user from base image (occupies UID 1000) and create pulsarr user
RUN deluser --remove-home bun && \
    delgroup bun; \
    addgroup -g 1000 -S pulsarr && \
    adduser -u 1000 -G pulsarr -D -H -s /sbin/nologin pulsarr

# Copy package files
COPY package.json bun.lock ./
COPY packages ./packages
# Production-only dependencies from the install stage
COPY --from=install /temp/prod/node_modules ./node_modules

# Create necessary directories with correct ownership
RUN mkdir -p /app/data/db && \
    mkdir -p /app/data/logs && \
    mkdir -p ${CACHE_DIR} && \
    chown -R pulsarr:pulsarr /app/data /app/build-cache

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

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["./docker-entrypoint.sh"]
