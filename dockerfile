FROM node:23.6.0-alpine AS builder

WORKDIR /app

# Set cache dir
ENV CACHE_DIR=/app/build-cache

# Copy build essentials
COPY package*.json ./
COPY src ./src
COPY vite.config.js ./
COPY tsconfig.json ./
COPY tailwind.config.ts ./
COPY postcss.config.mjs ./

# Install dependencies
RUN npm ci

# Build with placeholder base path that can be replaced at runtime
ENV basePath=__PULSARR_BASE_PATH__
RUN npm run build

# Ensure cache dir
RUN mkdir -p ${CACHE_DIR}

FROM node:23.6.0-alpine

WORKDIR /app

# cache dir in final
ENV CACHE_DIR=/app/build-cache

# Copy package files and install dependencies
COPY package*.json ./
RUN npm ci

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

# Set production environment
ENV NODE_ENV=production

# Make volumes
VOLUME ${CACHE_DIR}
VOLUME /app/data
EXPOSE 3003

CMD ["./docker-entrypoint.sh"]