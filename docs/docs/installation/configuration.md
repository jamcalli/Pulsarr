---
sidebar_position: 2
---

# Configuration

Pulsarr uses a hybrid configuration approach. Core application settings (like port, URL, logging) must be defined in a `.env` file, while application-specific settings are configured through the web UI after installation.

The `.env` file is required for the initial setup and contains essential configuration values. Any values set in the `.env` file will override settings stored in the database, giving you flexibility to customize your deployment.

:::note About Apprise
If you're using the Apprise integration, additional configuration values like `appriseUrl` should be included in your `.env` file. These values are only needed if you're running the Apprise container alongside Pulsarr.
:::

## Core Configuration

| Variable | Description | Required? | Default |
|----------|-------------|-----------|---------|
| `baseUrl` | Base URL where Pulsarr can be reached by Sonarr/Radarr (e.g., `http://pulsarr` for Docker network or `http://your-server-ip`) | Yes | `http://localhost` |
| `port` | Port where Pulsarr is accessible - works with baseUrl to form complete address | Yes | `3003` |
| `TZ` | Your local timezone (e.g., America/New_York, Europe/London) | Yes | `UTC` |
| `logLevel` | Logging level (silent, error, warn, info, debug, trace) | Recommended | `silent` |
| `NODE_ARGS` | Logger configuration for Docker (`--log-both` recommended for most users) | Recommended | `--log-file` |
| `cookieSecured` | Set to true ONLY if serving UI over HTTPS | No | `false` |
| `appriseUrl` | URL for the Apprise server (only if using Apprise) | No* | None |

*Required only if you're using the Apprise integration.

## Database Configuration

Pulsarr supports both SQLite (default) and PostgreSQL databases:

### SQLite (Default)
| Variable | Description | Required? | Default |
|----------|-------------|-----------|---------|
| `dbPath` | Path to SQLite database file | No | `./data/db/pulsarr.db` |

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

| Variable | Description | Required? | Default |
|----------|-------------|-----------|---------|
| `dbType` | Database type - set to `postgres` to enable PostgreSQL | Yes (for PostgreSQL) | `sqlite` |
| `dbHost` | PostgreSQL server hostname or IP | Yes (for PostgreSQL) | `localhost` |
| `dbPort` | PostgreSQL server port | No | `5432` |
| `dbName` | PostgreSQL database name | Yes (for PostgreSQL) | `pulsarr` |
| `dbUser` | PostgreSQL username | Yes (for PostgreSQL) | `postgres` |
| `dbPassword` | PostgreSQL password | Yes (for PostgreSQL) | `pulsarrpostgrespw` |
| `dbConnectionString` | Full PostgreSQL connection string (takes priority over individual settings) | No | `` |

## Example .env File

Here is how your .env should look:

### SQLite Configuration (Default)
```env
# Required settings
baseUrl=http://your-server-ip   # Address where Pulsarr can be reached by Sonarr/Radarr
port=3003                       # Port where Pulsarr is accessible
TZ=America/Los_Angeles          # Set to your local timezone

# Recommended settings
logLevel=info                   # Default is 'silent', but 'info' is recommended
NODE_ARGS=--log-both            # Default logs to file only, '--log-both' shows logs in terminal too

# Optional settings
cookieSecured=false             # Set to 'true' ONLY if serving UI over HTTPS
dbPath=./data/db/pulsarr.db     # SQLite database path (optional, this is default)

# Only needed if using Apprise
# appriseUrl=http://apprise:8000  # URL to your Apprise container
```

### PostgreSQL Configuration
```env
# Required settings
baseUrl=http://your-server-ip   # Address where Pulsarr can be reached by Sonarr/Radarr
port=3003                       # Port where Pulsarr is accessible
TZ=America/Los_Angeles          # Set to your local timezone

# Recommended settings
logLevel=info                   # Default is 'silent', but 'info' is recommended
NODE_ARGS=--log-both            # Default logs to file only, '--log-both' shows logs in terminal too

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

:::info NODE_ARGS Options
Controls logging behavior in Docker. Options are:
- `--log-terminal` - Log to terminal only
- `--log-file` - Log to file only (default)
- `--log-both` - Log to both terminal and file
:::

## Authentication Configuration

Pulsarr supports configurable authentication options:

Set the environment variable `authenticationMethod` in your `.env` file to one of these values:

- `required` - Authentication is always required (default)
- `requiredExceptLocal` - Authentication is required except for local addresses
- `disabled` - Authentication is completely disabled

When using `requiredExceptLocal`, connections from the following private IP ranges will bypass authentication:
- 127.0.0.0/8 (localhost)
- 10.0.0.0/8 (private network)
- 172.16.0.0/12 (private network)
- 192.168.0.0/16 (private network)
- 169.254.0.0/16 (link-local)
- ::1/128 (IPv6 localhost)
- fc00::/7 (IPv6 unique local addresses)
- fe80::/10 (IPv6 link-local addresses)
- ::ffff:x.x.x.x (IPv4-mapped IPv6 addresses)

:::warning Restart Required
After changing this setting in your `.env` file, you need to restart the container for it to take effect.
:::

## Security Configuration

### Iframe Support (Dashboard Integration)

| Variable | Description | Required? | Default |
|----------|-------------|-----------|---------|
| `allowIframes` | Allow Pulsarr to be embedded in iframes (required for dashboard apps like Organizr) | No | `false` |

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

## Complete Development Configuration

Below is an example of a complete development environment configuration:

```env
# Server Configuration
baseUrl=http://x.x.x.x                 # Local network address
port=3003                              # Application port
dbPath=./data/db/pulsarr.db            # SQLite database location (only used when dbType is not set)

# PostgreSQL Configuration (optional - uncomment to use PostgreSQL instead of SQLite)
# dbType=postgres                      # Database type: 'postgres' or leave unset for SQLite
# dbHost=your-postgres-host            # PostgreSQL server hostname or IP
# dbPort=5432                          # PostgreSQL server port (optional, defaults to 5432)
# dbName=pulsarr                       # PostgreSQL database name
# dbUser=pulsarr                       # PostgreSQL username
# dbPassword=your-secure-password      # PostgreSQL password
# dbConnectionString=                  # Alternative: PostgreSQL connection string (takes priority over individual settings)
cookieSecret=xxxxxxxxxxxxxxxxxxxxxxxx  # Secret key for cookies (randomly generated by default)
cookieName=pulsarr                     # Name of the cookie
cookieSecured=false                    # Set to true for HTTPS only
allowIframes=false                     # Set to true to allow embedding in dashboard apps like Organizr
logLevel=info                          # Logging level (defaults to silent. Recommended: info)
authenticationMethod=required          # Authentication method (required, requiredExceptLocal, disabled)
closeGraceDelay=10000                  # Shutdown grace period in ms
rateLimitMax=500                       # Max requests per time window
syncIntervalSeconds=10                 # Sync interval in seconds
queueProcessDelaySeconds=60            # Queue processing delay in seconds

# Notification Queue Settings
pendingWebhookRetryInterval=20         # Retry interval for pending notifications in seconds
pendingWebhookMaxAge=10                # Max age for pending notifications in minutes
pendingWebhookCleanupInterval=60       # Cleanup interval for old notifications in minutes

# Discord Configuration
discordWebhookUrl=https://discord.com/api/webhooks/xxxx/xxxx  # Webhook URL(s), separate multiple with commas
discordBotToken=xxxx.xxxx.xxxx                                # Bot token
discordClientId=xxxxxxxxxxxx                                  # Client ID
discordGuildId=xxxxxxxxxxxx                                   # Server ID

# Apprise Configuration
appriseUrl=http://x.x.x.x:8000         # URL for the Apprise server (e.g., http://apprise:8000 for Docker networking)
enableApprise=true                     # This is auto set by Pulsarr based on the availability of the Apprise server
systemAppriseUrl=                      # Apprise URL for system notifications only

# General Notifications
queueWaitTime=120000                   # Queue wait time in ms
newEpisodeThreshold=172800000          # New episode threshold in ms (48h)
upgradeBufferTime=2000                 # Buffer time between upgrades in ms

# Tautulli Configuration
tautulliEnabled=false                  # Enable Tautulli integration (requires Plex Pass)
tautulliUrl=http://x.x.x.x:8181        # Tautulli server URL
tautulliApiKey=xxxxxxxxxxxxxxxxxxxxxxxx # Tautulli API key

# Sonarr Configuration (these will seed a single instance. Needs all the values. Only use in dev.)
sonarrBaseUrl=http://x.x.x.x:8989      # Sonarr instance URL
sonarrApiKey=xxxxxxxxxxxxxxxxxxxxxxxx  # Sonarr API key
sonarrQualityProfile=                  # Quality profile name (empty = default. Also accepts name or number)
sonarrRootFolder=                      # Root folder path (empty = default. Or accepts string of the path url)
sonarrLanguageProfileId=1              # Language profile ID
sonarrBypassIgnored=false              # Bypass ignored setting
sonarrSeasonMonitoring=all             # Season monitoring strategy
sonarrMonitorNewItems=all              # Monitor strategy for new items ('all' or 'none')
sonarrTags=[]                          # Tags as JSON array
sonarrSeriesType=standard              # Series type: 'standard', 'anime', or 'daily'
sonarrCreateSeasonFolders=false        # Create season folders (true/false)

# Radarr Configuration (these will seed a single instance. Needs all the values. Only use in dev.)
radarrBaseUrl=http://x.x.x.x:7878      # Radarr instance URL
radarrApiKey=xxxxxxxxxxxxxxxxxxxxxxxx  # Radarr API key
radarrQualityProfile=                  # Quality profile name (empty = default. Also accepts name or number)
radarrRootFolder=                      # Root folder path (empty = default. Or accepts string of the path url)
radarrLanguageProfileId=1              # Language profile ID
radarrBypassIgnored=false              # Bypass ignored setting
radarrTags=[]                          # Tags as JSON array

# Plex Configuration
plexTokens=["xxxxxxxxxxxxxxxxxxxx"]    # Plex authentication token
skipFriendSync=false                   # Skip syncing Plex friends
enablePlexPlaylistProtection=false     # Enable playlist protection feature
plexProtectionPlaylistName="Do Not Delete"  # Name of protection playlist
plexServerUrl=http://localhost:32400   # Plex server URL (optional, can be auto-detected)

# User Tagging Configuration
tagUsersInSonarr=false                 # Enable automatic user tagging in Sonarr
tagUsersInRadarr=false                 # Enable automatic user tagging in Radarr
tagPrefix=pulsarr:user                 # Prefix for user tags - required alphanumeric, dash, underscore, colon, period only
persistHistoricalTags=true             # DEPRECATED: Use removedTagMode instead (keeps for backward compatibility)
cleanupOrphanedTags=true               # When true, removes tags for deleted users during sync
removedTagMode=remove                  # How to handle tags when content is removed: 'keep', 'remove', or 'prefix'
removedTagPrefix=pulsarr:removed       # Prefix for removal tags when using 'prefix' mode
deletionMode=watchlist                 # Deletion workflow mode: 'watchlist' or 'tag-based'

# Delete Configuration
deleteMovie=false                      # Auto-delete movies setting
deleteEndedShow=false                  # Auto-delete ended shows setting
deleteContinuingShow=false             # Auto-delete continuing shows setting
deleteFiles=true                       # Delete files from disk setting
respectUserSyncSetting=true            # Only delete content from users with sync enabled
deleteSyncNotify=none                  # Notify of delete sync status: 'none' | 'message' | 'webhook' | 'both' | 'all' | 'discord-only' | 'apprise-only'
deleteSyncNotifyOnlyOnDeletion=false   # Only send notifications when items are actually deleted
maxDeletionPrevention=10               # Safeguard to prevent mass deletion. % of total library to allow during delete sync

# Plex Session Monitoring
plexSessionMonitoring='{"enabled":false,"pollingIntervalMinutes":15,"remainingEpisodes":2,"filterUsers":[],"enableAutoReset":true,"inactivityResetDays":7,"autoResetIntervalHours":24,"enableProgressiveCleanup":false}'  # JSON config for session monitoring
# Session monitoring configuration (JSON format):
# - enabled: Enable/disable session monitoring (default: false)
# - pollingIntervalMinutes: How often to check sessions in minutes (default: 15, range: 1-1440)
# - remainingEpisodes: Episodes remaining before triggering search (default: 2, range: 1-10)
# - filterUsers: Array of usernames to monitor, empty for all users (default: [])
# - enableAutoReset: Enable automatic reset of inactive shows (default: true)
# - inactivityResetDays: Days without activity before reset (default: 7, range: 1-365)
# - autoResetIntervalHours: How often to check for inactive shows in hours (default: 24, range: 1-168)
# - enableProgressiveCleanup: Enable progressive cleanup of previous seasons (default: false)

# New User Defaults
newUserDefaultCanSync=true             # Default sync permission for new users
```