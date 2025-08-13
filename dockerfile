FROM node:22.18.0-alpine AS builder

WORKDIR /app

# Accept TMDB API key as build argument (GitHub Actions converts to TMDBAPIKEY)
ARG TMDBAPIKEY

# Set cache dir
ENV CACHE_DIR=/app/build-cache

# Set TMDB API key as environment variable in camelCase format
ENV tmdbApiKey=${TMDBAPIKEY}

# Copy package files first (changes less often)
COPY package*.json ./
COPY .npmrc ./

# Install toolchain needed for native modules (builder only)
RUN apk add --no-cache --virtual .build-deps python3 make g++

# Install dependencies with cache mount
RUN --mount=type=cache,target=/root/.npm \
    --mount=type=cache,target=/app/.npm \
    HUSKY=0 npm ci --prefer-offline --no-audit

# Copy build configuration files
COPY vite.config.js tsconfig.json postcss.config.mjs ./

# Copy source code (changes most often)
COPY src ./src

# Build with cache mounts
RUN --mount=type=cache,target=/app/node_modules/.vite \
    npm run build

# Prune dev dependencies to produce production node_modules for runtime image
# and remove the temporary build toolchain
RUN npm prune --omit=dev && apk del .build-deps && mkdir -p ${CACHE_DIR}

FROM node:22.18.0-alpine

WORKDIR /app

# cache dir in final
ENV CACHE_DIR=/app/build-cache

# Copy package files (runtime typically does not need .npmrc)
COPY package*.json ./
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

# Copy license and documentation files for compliance
COPY LICENSE* ./
COPY README.md ./

# Ensure proper ownership and drop root
RUN chown -R node:node /app
USER node

# Pass TMDB API key to runtime (GitHub Actions converts to TMDBAPIKEY)
ARG TMDBAPIKEY

# Set production environment
ENV NODE_ENV=production
ENV tmdbApiKey=${TMDBAPIKEY}

# Make volumes
VOLUME ["/app/build-cache"]
VOLUME ["/app/data"]
EXPOSE 3003

CMD ["./docker-entrypoint.sh"]