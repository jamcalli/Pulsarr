---
sidebar_position: 6
---

# Architecture

Pulsarr is a modern full-stack TypeScript application built for reliability and performance in self-hosted media environments.

## Backend

| Technology | Purpose |
|------------|---------|
| **Bun** | JavaScript/TypeScript runtime |
| **Fastify** | High-performance HTTP server with plugin ecosystem |
| **TypeScript** | Full type safety across server and client |
| **Knex.js** | Query builder and migrations for SQLite/PostgreSQL |
| **Toad Scheduler** | Background job processing |

### Core Services

| Service | Purpose |
|---------|---------|
| **Content Router** | Predicate-based routing to Sonarr/Radarr instances |
| **Webhook Processor** | Real-time import detection and notification triggers |
| **Queue Manager** | Async processing for notifications and batch operations |
| **Session Monitor** | Plex playback tracking for auto-search |

## Frontend

| Technology | Purpose |
|------------|---------|
| **React 19** | Single-page application |
| **TypeScript** | Shared types with server |
| **TanStack Query** | Server state management and caching |
| **Zustand** | Client-side state management |
| **Tailwind CSS v4** | Utility-first styling |
| **Radix UI** | Accessible component primitives |
| **Vite** | Build tooling and dev server |

## Database

| Feature | Description |
|---------|-------------|
| **SQLite** | Default lightweight file-based storage |
| **PostgreSQL** | Enterprise support for high-scale deployments |
| **Migrations** | Version-controlled schema with cross-database compatibility |
| **Data Migration** | Built-in SQLite-to-PostgreSQL transfer utility |

### Data Models

| Model | Purpose |
|-------|---------|
| **Users** | Plex user management, permissions, quotas |
| **Watchlists** | Content tracking with status and metadata |
| **Instances** | Sonarr/Radarr configuration and sync relationships |
| **Approvals** | Request workflow with expiration handling |
| **Notifications** | Delivery tracking and user preferences |

## Integrations

### Media Stack

| Integration | Purpose |
|-------------|---------|
| **Plex API** | Watchlist monitoring (RSS, GraphQL, REST) |
| **Sonarr/Radarr APIs** | Content management across instances |
| **TMDB API** | Metadata and artwork |

### Notifications

| Channel | Purpose |
|---------|---------|
| **Native Webhooks** | Direct HTTP callbacks to external services |
| **Discord Bot** | Interactive commands, approvals, user DMs |
| **Discord Webhooks** | Channel notifications and announcements |
| **Plex Mobile** | Native Plex mobile app push notifications |
| **Apprise** | 80+ services (Telegram, Slack, email, etc.) |

## API

| Feature | Description |
|---------|-------------|
| **OpenAPI Spec** | Auto-generated documentation |
| **Scalar Docs** | Interactive API explorer at `/api/docs` |
| **Typed Routes** | End-to-end type safety |
| **Rate Limiting** | Configurable request throttling |
| **SSE** | Live UI updates for progress and status |

### Authentication

| Mode | Description |
|------|-------------|
| **Required** | Cookie-based session authentication |
| **Local Bypass** | Skip auth for private network requests |
| **Disabled** | No authentication required |

## Data Flow

### Content Processing

1. Watchlist detection (RSS or polling)
2. User permission and quota validation
3. Content router rule evaluation
4. Instance selection and approval workflow
5. Sonarr/Radarr API calls
6. Webhook-based import detection
7. User notification delivery

### Notification Flow

1. Webhook received from Sonarr/Radarr
2. Content matched to requesting users
3. Smart batching (episode grouping, spam prevention)
4. Multi-channel parallel delivery
5. Delivery tracking and retry logic

## Deployment

| Feature | Description |
|---------|-------------|
| **Docker** | Official multi-arch images (amd64, arm64) |
| **Docker Compose** | Sample configurations included |
| **Reverse Proxy** | Nginx, Traefik, and other proxies |
| **Webhook Endpoints** | External accessibility for Arr callbacks |

### Scaling

| Consideration | Solution |
|---------------|----------|
| **High-scale** | PostgreSQL with connection pooling |
| **Concurrency** | Configurable limits for API calls |
| **Logging** | Structured JSON output with rotation |

## Performance

| Feature | Description |
|---------|-------------|
| **Caching** | Metadata caching to reduce API calls |
| **Batch Operations** | Grouped API calls for multi-instance sync |
| **Background Processing** | Async queues for non-blocking operations |
| **Health Checks** | Endpoints for container orchestration |