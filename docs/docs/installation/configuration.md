---
sidebar_position: 2
---

# Configuration

Pulsarr uses a hybrid configuration approach. Core application settings (like port, URL, logging) must be defined in a `.env` file, while application-specific settings are configured through the web UI after installation.

The `.env` file is required for the initial setup and contains essential configuration values. Any values set in the `.env` file will override settings stored in the database, giving you flexibility to customize your deployment.

:::warning Environment Variable Override Behavior
Environment variables in `.env` override web UI settings **on app restart**. If you configure a setting in both the `.env` file and web UI:
- Web UI changes work during the current session
- On app restart, the `.env` values will override any database changes
- Remove the environment variable from `.env` to persist web UI configuration changes permanently
:::

:::note About Apprise
If you're using the Apprise integration, additional configuration values like `appriseUrl` should be included in your `.env` file. These values are only needed if you're running the Apprise container alongside Pulsarr.
:::

## Core Configuration

<div style={{overflowX: 'auto'}}>

| Variable | Description | Required? | Default |
|----------|-------------|-----------|---------|
| `baseUrl` | Base URL where Pulsarr can be reached by Sonarr/Radarr (e.g., `http://pulsarr` for Docker network or `http://your-server-ip`) | Yes | `http://localhost` |
| `port` | Port where Pulsarr is accessible - works with baseUrl to form complete address | Yes | `3003` |
| `TZ` | Your local timezone (e.g., America/New_York, Europe/London) | Yes | `UTC` |
| `logLevel` | Logging level (silent, error, warn, info, debug, trace) | Recommended | `silent` |
| `enableConsoleOutput` | Show logs in terminal (default: true) | No | `true` |
| `enableRequestLogging` | Enable HTTP request logging (default: true) | No | `true` |
| `cookieSecured` | Set to true ONLY if serving UI over HTTPS | No | `false` |
| `appriseUrl` | URL for the Apprise server (only if using Apprise) | No* | None |

</div>

*Required only if you're using the Apprise integration.

## Database Configuration

Pulsarr supports both SQLite (default) and PostgreSQL databases:

### SQLite (Default)

<div style={{overflowX: 'auto'}}>

| Variable | Description | Required? | Default |
|----------|-------------|-----------|---------|
| `dbPath` | Path to SQLite database file | No | `./data/db/pulsarr.db` |

</div>

### PostgreSQL

:::note Migration Available
PostgreSQL is supported for both new installations and migrations from existing SQLite databases. If you're already using Pulsarr with SQLite, see the [PostgreSQL Migration Guide](./postgres-migration) for step-by-step instructions on migrating your data.
:::

:::note Database Setup Required
Before configuring Pulsarr with PostgreSQL, ensure you have:
- A PostgreSQL server running
- Created a database for Pulsarr (e.g., `CREATE DATABASE pulsarr;`)
- Created a user with appropriate permissions (e.g., `CREATE USER pulsarr WITH PASSWORD 'your_password';`)
- Granted database access (e.g., `GRANT ALL PRIVILEGES ON DATABASE pulsarr TO pulsarr;`)
:::

<div style={{overflowX: 'auto'}}>

| Variable | Description | Required? | Default |
|----------|-------------|-----------|---------|
| `dbType` | Database type - set to `postgres` to enable PostgreSQL | Yes (for PostgreSQL) | `sqlite` |
| `dbHost` | PostgreSQL server hostname or IP | Yes (for PostgreSQL) | `localhost` |
| `dbPort` | PostgreSQL server port | No | `5432` |
| `dbName` | PostgreSQL database name | Yes (for PostgreSQL) | `pulsarr` |
| `dbUser` | PostgreSQL username | Yes (for PostgreSQL) | `postgres` |
| `dbPassword` | PostgreSQL password | Yes (for PostgreSQL) | `pulsarrpostgrespw` |
| `dbConnectionString` | Full PostgreSQL connection string (takes priority over individual settings) | No | `` |

</div>

## Example .env File

Here is how your .env should look:

### SQLite Configuration (Default)
```env
baseUrl=http://your-server-ip   # Address where Pulsarr can be reached
port=3003                       # Port where Pulsarr is accessible
TZ=America/Los_Angeles          # Set to your local timezone

# Logging Configuration
logLevel=info                   # Log level (default: info)
                                # Accepts: fatal | error | warn | info | debug | trace | silent

enableConsoleOutput=true        # Console logging (default: true)
                                # Any value other than "false" enables terminal output
                                # Logs are always written to ./data/logs/ regardless of this setting

enableRequestLogging=true       # HTTP request logging (default: true)
                                # Logs HTTP method, URL, host, remote IP/port, response codes, response times
                                # Sensitive query parameters (token, apiKey, password) are automatically redacted

# Optional settings
cookieSecured=false             # Set to 'true' ONLY if serving UI over HTTPS
dbPath=./data/db/pulsarr.db     # SQLite database path (optional, this is default)

# Only needed if using Apprise
# appriseUrl=http://apprise:8000  # URL to your Apprise container
```

### PostgreSQL Configuration
```env
baseUrl=http://your-server-ip   # Address where Pulsarr can be reached
port=3003                       # Port where Pulsarr is accessible
TZ=America/Los_Angeles          # Set to your local timezone

# Logging Configuration
logLevel=info                   # Log level (default: info)
                                # Accepts: fatal | error | warn | info | debug | trace | silent

enableConsoleOutput=true        # Console logging (default: true)
                                # Any value other than "false" enables terminal output
                                # Logs are always written to ./data/logs/ regardless of this setting

enableRequestLogging=true       # HTTP request logging (default: true)
                                # Logs HTTP method, URL, host, remote IP/port, response codes, response times
                                # Sensitive query parameters (token, apiKey, password) are automatically redacted

# PostgreSQL Database Configuration
dbType=postgres                 # Enable PostgreSQL support
dbHost=your-postgres-host       # PostgreSQL server hostname or IP
dbPort=5432                     # PostgreSQL server port (optional, defaults to 5432)
dbName=pulsarr                  # PostgreSQL database name
dbUser=pulsarr                  # PostgreSQL username
dbPassword=your-secure-password # PostgreSQL password
# dbConnectionString=postgresql://user:pass@host:port/database  # Alternative: connection string (takes priority)

# Optional settings
cookieSecured=false             # Set to 'true' ONLY if serving UI over HTTPS

# Only needed if using Apprise
# appriseUrl=http://apprise:8000  # URL to your Apprise container
```

:::info Logging Configuration
Pulsarr provides comprehensive logging configuration through environment variables:

**Log Levels** (`logLevel`)
- **Default**: `info`
- **Options**: `fatal`, `error`, `warn`, `info`, `debug`, `trace`, `silent`
- Controls the minimum log level displayed and recorded

**Console Output** (`enableConsoleOutput`)
- **Default**: `true`
- **Behavior**: Any value other than `"false"` enables terminal output
- When disabled, logs are only written to files

**Request Logging** (`enableRequestLogging`)
- **Default**: `true`
- **Logs**: HTTP method, URL, host, remote IP/port, response codes, response times
- **Security**: Sensitive query parameters (`token`, `apiKey`, `password`) are automatically redacted

**File Logging**
- **Always enabled** - Cannot be disabled
- **Location**: `./data/logs/` directory
- **Format**: `pulsarr-YYYY-MM-DD.log` (with `pulsarr-current.log` for active file)
- Console and file logging operate independently
:::

## Authentication Configuration

Pulsarr supports configurable authentication options. Set `authenticationMethod` in your `.env` file:

- `required` - Authentication always required (default)
- `requiredExceptLocal` - Skip authentication for local/private network connections
- `disabled` - Authentication completely disabled

:::info Local Network Details
For details on which IP ranges are considered "local" when using `requiredExceptLocal`, see the [Authentication Configuration Details](../development/environment-variables#authentication-configuration-details) in the development documentation.
:::

:::warning Restart Required
After changing this setting in your `.env` file, you need to restart the container for it to take effect.
:::

## Security Configuration

### Iframe Support (Dashboard Integration)

<div style={{overflowX: 'auto'}}>

| Variable | Description | Required? | Default |
|----------|-------------|-----------|---------|
| `allowIframes` | Allow Pulsarr to be embedded in iframes (required for dashboard apps like Organizr) | No | `false` |

</div>

Pulsarr can be embedded in dashboard applications like Organizr, Heimdall, or other iframe-based frontends by setting:

```env
allowIframes=true
```

:::note Security Consideration
When `allowIframes=true`, Pulsarr will disable the X-Frame-Options security header, allowing the application to be embedded in iframes from any domain. This is necessary for dashboard applications but slightly reduces security. Only enable this if you need iframe embedding.
:::

:::warning Restart Required
After changing this setting in your `.env` file, you need to restart the container for it to take effect.
:::

:::info Complete Variable Reference
For a comprehensive list of all environment variables including development and advanced options, see the [Environment Variables Reference](../development/environment-variables).
:::