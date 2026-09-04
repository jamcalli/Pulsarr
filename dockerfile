FROM oven/bun:1.4.0-alpine@sha256:07235578f79ef8c6f97d94aee7938e76f5cdba5f21ae5dbfdd3d3d38058437eb AS base
WORKDIR /app

FROM base AS install
COPY package.json bun.lock ./
COPY packages ./packages
RUN mkdir -p /temp/prod && \
    cp package.json bun.lock /temp/prod/ && \
    cp -r packages /temp/prod/packages && \
    cd /temp/prod && \
    bun install --frozen-lockfile --production --ignore-scripts --omit=peer && \
    rm -rf node_modules/@types

FROM base AS builder
ARG TMDBAPIKEY
ENV tmdbApiKey=${TMDBAPIKEY}

COPY package.json bun.lock ./
COPY packages ./packages

RUN --mount=type=cache,target=/root/.bun/install/cache \
    bun install --frozen-lockfile

COPY vite.config.js tsconfig.json tsconfig.base.json postcss.config.mjs ./
COPY src ./src

RUN --mount=type=cache,target=/app/node_modules/.vite \
    bun run build

FROM base

# tini reaps zombies as PID 1, wget serves the healthcheck, su-exec drops privileges in the entrypoint
RUN apk add --no-cache tini wget su-exec

# The base image's bun user holds UID 1000, which pulsarr must own for PUID defaults
RUN deluser --remove-home bun && \
    delgroup bun; \
    addgroup -g 1000 -S pulsarr && \
    adduser -u 1000 -G pulsarr -D -H -s /sbin/nologin pulsarr

COPY package.json bun.lock ./
COPY packages ./packages
COPY --from=install /temp/prod/node_modules ./node_modules

RUN mkdir -p /app/data/db && \
    mkdir -p /app/data/logs && \
    chown -R pulsarr:pulsarr /app/data

COPY --from=builder /app/dist ./dist
COPY migrations ./migrations
COPY docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh
COPY docker-healthcheck.sh ./
RUN chmod +x docker-healthcheck.sh

COPY LICENSE* ./
COPY README.md ./

# CI passes the secret as TMDBAPIKEY; the app reads tmdbApiKey
ARG TMDBAPIKEY

ENV NODE_ENV=production
ENV tmdbApiKey=${TMDBAPIKEY}

VOLUME ["/app/data"]
EXPOSE 3003

HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD ./docker-healthcheck.sh

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["./docker-entrypoint.sh"]
