---
sidebar_position: 10
---

# API Documentation

Pulsarr provides a comprehensive REST API for integrating with external applications and services. The API is fully documented using OpenAPI 3.0 specification.

## API Reference

Browse the complete API documentation with interactive examples:

- [Authentication API](./api/authentication) - Login, logout, and session management
- [Plex API](./api/plex) - User management, watchlist synchronization  
- [Sonarr API](./api/sonarr) - Instance configuration, series management
- [Radarr API](./api/radarr) - Instance configuration, movie management
- [Configuration API](./api/config) - Application settings and routing rules
- [Users API](./api/users) - User management endpoints

## Getting Started

All API requests require authentication via session cookies or API keys. The base URL for all endpoints is:

```
http://your-server:3003/api
```

### Authentication

Most endpoints require authentication. You can authenticate using:
- Session cookies (web UI login)
- API keys (coming soon)

### Response Format

All responses are in JSON format with consistent error handling:

```json
{
  "success": true,
  "data": { ... },
  "message": "Optional message"
}
```

## Interactive API Documentation

Pulsarr includes built-in Scalar API documentation served at `/api/docs`:

- **Live API Documentation**: `http://your-server:3003/api/docs` 
- **Features**: Interactive testing, request/response examples, authentication flows
- **Auto-generated**: Always up-to-date with your Pulsarr version
- **Download OpenAPI JSON**: `/openapi.json` for external tools