---
sidebar_position: 3
---

# Configuration

Pulsarr uses a hybrid configuration approach. Core settings (port, URL, logging) are defined in a `.env` file, while application settings are configured through the web UI.

:::warning Environment Variables Override Web UI
Environment variables override web UI settings **on app restart**. Remove a variable from `.env` to let web UI changes persist.
:::

## Core Configuration

:::warning Critical: baseUrl + port Configuration
The `baseUrl` and `port` create the webhook address for Sonarr/Radarr to reach Pulsarr:

- **Docker Compose (same network)**: `http://pulsarr` (service name)
- **Docker host networking**: `http://localhost`
- **Separate machines**: `http://server-ip`
- **Reverse proxy**: `https://subdomain.domain.com`
:::

<div style={{overflowX: 'auto'}}>

| Variable | Description | Required? | Default |
|----------|-------------|-----------|---------|
| `baseUrl` | Webhook address for Sonarr/Radarr to reach Pulsarr | Yes | `http://localhost` |
| `port` | External port for webhook URLs. Omit for HTTPS on 443 | Yes | `3003` |
| `listenPort` | Internal port the server binds to | No | `3003` |
| `TZ` | Timezone (e.g., America/New_York) | Yes | `UTC` |
| `logLevel` | Log level: silent, error, warn, info, debug, trace | Recommended | `silent` |
| `enableConsoleOutput` | Show logs in terminal | No | `true` |
| `enableRequestLogging` | Log HTTP requests (sensitive params redacted) | No | `false` |
| `cookieSecured` | Set true ONLY if serving UI over HTTPS | No | `false` |
| `basePath` | URL path prefix for subfolder reverse proxy (e.g., `/pulsarr`) | No | None |
| `appriseUrl` | Apprise server URL (if using Apprise) | No | None |

</div>

:::tip Non-Default Port
When using a different port, ensure values align:

**Docker**: Map ports in compose (`8080:3003`), set `port=8080`, keep `listenPort=3003`

**Bare metal**: Set both `port` and `listenPort` to the same value
:::

:::tip Subfolder Reverse Proxy (basePath)
To run Pulsarr at a subfolder like `https://domain.com/pulsarr/`:

```env
baseUrl=https://domain.com
basePath=/pulsarr
```

Pulsarr registers all routes under the basePath prefix. Your reverse proxy should forward requests to Pulsarr with the path intact (e.g., `/pulsarr/api/...`).
:::

## Database Configuration

Pulsarr supports SQLite (default) and PostgreSQL.

<div style={{overflowX: 'auto'}}>

| Variable | Description | Required? | Default |
|----------|-------------|-----------|---------|
| `dbPath` | SQLite database path | No | `./data/db/pulsarr.db` |
| `dbType` | Set to `postgres` for PostgreSQL | For PostgreSQL | `sqlite` |
| `dbHost` | PostgreSQL hostname | For PostgreSQL | `localhost` |
| `dbPort` | PostgreSQL port | No | `5432` |
| `dbName` | PostgreSQL database name | For PostgreSQL | `pulsarr` |
| `dbUser` | PostgreSQL username | For PostgreSQL | `postgres` |
| `dbPassword` | PostgreSQL password | For PostgreSQL | None |
| `dbConnectionString` | Full connection string (overrides above) | No | None |

</div>

:::note PostgreSQL Setup
Before using PostgreSQL, create a database and user with appropriate permissions. See the [PostgreSQL Migration Guide](./postgres-migration) for details.
:::

## Example .env File

```env
# Required
baseUrl=http://your-server-ip
port=3003
TZ=America/Los_Angeles

# Logging
logLevel=info
enableConsoleOutput=true
enableRequestLogging=false

# Security
cookieSecured=false

# Database - SQLite (default, no config needed)
# dbPath=./data/db/pulsarr.db

# Database - PostgreSQL (uncomment to use)
# dbType=postgres
# dbHost=your-postgres-host
# dbPort=5432
# dbName=pulsarr
# dbUser=pulsarr
# dbPassword=your-secure-password

# Apprise (if using)
# appriseUrl=http://apprise:8000
```

## Authentication

Set `authenticationMethod` in `.env`:

| Value | Behavior |
|-------|----------|
| `required` | Always require authentication (default) |
| `requiredExceptLocal` | Skip auth for local/private network |
| `disabled` | No authentication |

:::info Local Network Details
See [Authentication Configuration Details](../development/environment-variables#authentication-configuration-details) for which IP ranges are considered "local".
:::

## Security

### Iframe Support

For dashboard apps like Organizr or Heimdall:

```env
allowIframes=true
```

:::note
This disables X-Frame-Options, allowing iframe embedding from any domain. Only enable if needed.
:::

## Plex Configuration

### Skip Downloads for Existing Content

Configure in **Plex → Configuration** under "Content Availability Check" to prevent duplicate downloads by checking Plex before adding content.

- **Primary Token User**: Checks all accessible servers (owned + shared)
- **Other Users**: Only checks your owned server

:::info Complete Reference
For all environment variables including development options, see [Environment Variables Reference](../development/environment-variables).
:::
