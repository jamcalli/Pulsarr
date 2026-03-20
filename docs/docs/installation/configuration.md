---
sidebar_position: 3
---

# Configuration

Pulsarr uses a hybrid configuration approach. Most settings are configured through the web UI, while infrastructure settings (timezone, database, HTTPS) are defined in a `.env` file.

:::warning Environment Variables Override Web UI
Environment variables override web UI settings **on app restart**. Remove a variable from `.env` to let web UI changes persist.
:::

## Core Configuration

<div style={{overflowX: 'auto'}}>

| Variable | Description | Required? | Default |
|----------|-------------|-----------|---------|
| `TZ` | Timezone (e.g., America/New_York) | Recommended | `UTC` |
| `cookieSecured` | Set true ONLY if serving UI over HTTPS | No | `false` |
| `listenPort` | Internal port the server binds to | No | `3003` |
| `basePath` | URL path prefix for subfolder reverse proxy (e.g., `/pulsarr`) | No | None |
| `enableRequestLogging` | Log HTTP requests (sensitive params redacted) | No | `false` |
| `appriseUrl` | Apprise server URL (if using Apprise) | No | None |

</div>

:::tip Network Settings
The `baseUrl` and `port` are configured through the **web UI**. Pulsarr will prompt you to set the correct address when you test your Sonarr/Radarr connections. You can also set them via `.env` if you prefer, but it's not required.
:::

:::tip Subfolder Reverse Proxy (basePath)
To run Pulsarr at a subfolder like `https://domain.com/pulsarr/`, set `basePath=/pulsarr` in your `.env`. Configure `baseUrl` through the web UI. All routes are registered under the basePath prefix. Your reverse proxy should forward requests to Pulsarr with the path intact.
:::

:::tip Reverse Proxy IP Detection
Pulsarr automatically trusts `X-Forwarded-For` headers from private network ranges, so `request.ip` resolves to the real client IP behind reverse proxies. No configuration needed.
:::

## Docker User Configuration

<div style={{overflowX: 'auto'}}>

| Variable | Description | Required? | Default |
|----------|-------------|-----------|---------|
| `PUID` | User ID the container runs as | No | `1000` |
| `PGID` | Group ID the container runs as | No | `1000` |

</div>

Controls which user/group owns files in the mounted volumes.

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
# Recommended
TZ=America/Los_Angeles

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
