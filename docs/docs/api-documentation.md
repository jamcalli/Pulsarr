---
sidebar_position: 10
---

# API Documentation

Pulsarr provides a comprehensive REST API for integrating with external applications and services. The API is fully documented using OpenAPI 3.0 specification.

## Docusaurus API Reference (This Site)

This documentation site includes **interactive API documentation** with auto-generated pages for every endpoint:

**[View Complete API Reference →](./api/pulsarr-api)**

### API Categories

The API is organized into the following categories:

- **[API Keys](./api/api-keys)** - Create and manage API keys for programmatic access
- **[Approval](./api/approval)** - Manage content approval requests and workflows
- **[Authentication](./api/authentication)** - Login, logout, and session management
- **[Config](./api/config)** - Application settings and configuration
- **[Content Router](./api/content-router)** - Routing rules and content distribution
- **[Labels](./api/labels)** - Plex label synchronization and management
- **[Logs](./api/logs)** - Stream application logs
- **[Metadata](./api/metadata)** - Refresh and manage content metadata
- **[Notifications](./api/notifications)** - Discord bot and webhook management
- **[Plex](./api/plex)** - User management, watchlist synchronization, server discovery
- **[Progress](./api/progress)** - Real-time workflow progress tracking
- **[Quota](./api/quota)** - User quota management and usage tracking
- **[Radarr](./api/radarr)** - Instance configuration and movie management
- **[Scheduler](./api/scheduler)** - Job scheduling and execution
- **[Session Monitoring](./api/session-monitoring)** - Plex session tracking
- **[Sonarr](./api/sonarr)** - Instance configuration and series management
- **[Statistics](./api/statistics)** - Dashboard statistics and analytics
- **[Sync](./api/sync)** - Sync operations for Sonarr/Radarr instances
- **[Tags](./api/tags)** - User tagging configuration and synchronization
- **[TMDB](./api/tmdb)** - TMDB metadata and streaming provider data
- **[Users](./api/users)** - User management and watchlist access
- **[Watchlist Workflow](./api/watchlist-workflow)** - Start, stop, and monitor the main workflow

**Benefits:**
- Organized by feature category
- Detailed descriptions and examples
- Great for browsing and learning the API
- No authentication required to view

---

## Scalar API Docs (Your Instance)

Every Pulsarr instance also ships with **Scalar interactive documentation** at `/api/docs`:

```
http://your-server:3003/api/docs
```

**Benefits:**
- **Live testing against YOUR instance** - Execute real API requests
- **Uses your session** - If you're logged into the web UI, requests use your session token
- **Always in sync** - Reflects your exact running version
- **OpenAPI spec download** - Download JSON/YAML from the Scalar interface

**Use Scalar when:**
- You need to test API calls against your running instance
- You want to verify authentication and permissions
- You're debugging API integration issues

---

## Getting Started

### Base URL

All API endpoints use the following base URL:

```
http://your-server:3003/v1
```

### Authentication

Most endpoints require authentication. You can authenticate using:

- Session cookies (web UI login)
- API keys (recommended for external integrations)

To create an API key, navigate to **Utilities → API Keys** in the web UI.
