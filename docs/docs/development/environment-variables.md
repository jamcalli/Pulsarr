---
sidebar_position: 1
---

# Environment Variables Reference

Complete reference of all Pulsarr environment variables. Most users only need the [Configuration Guide](../installation/configuration) - this reference is for development and advanced deployments.

:::note For Developers
This includes internal variables for development and testing. Many are not needed for typical production use.
:::

## Core Application

| Variable | Description | Default |
|----------|-------------|---------|
| `baseUrl` | External address for webhook URLs (UI configurable) | `http://localhost` |
| `port` | External port for webhook URLs (UI configurable) | `3003` |
| `listenPort` | Internal port server binds to | `3003` |
| `TZ` | Timezone (e.g., America/Los_Angeles) | `UTC` |
| `basePath` | URL prefix for subfolder reverse proxy | `/` |

:::tip
The `baseUrl` and `port` settings are automatically configurable via the web UI when testing Sonarr/Radarr connections. You only need to set them in `.env` if you want to override UI settings or pre-configure before first run.
:::

## Logging

| Variable | Description | Default |
|----------|-------------|---------|
| `logLevel` | fatal, error, warn, info, debug, trace, silent | `info` |
| `enableConsoleOutput` | Show logs in terminal | `true` |
| `enableRequestLogging` | Log HTTP requests (sensitive params redacted) | `false` |

## Database

### SQLite (Default)

| Variable | Description | Default |
|----------|-------------|---------|
| `dbPath` | SQLite database location | `./data/db/pulsarr.db` |

### PostgreSQL

| Variable | Description | Default |
|----------|-------------|---------|
| `dbType` | Set to `postgres` to enable | `sqlite` |
| `dbHost` | PostgreSQL hostname | `localhost` |
| `dbPort` | PostgreSQL port | `5432` |
| `dbName` | Database name | `pulsarr` |
| `dbUser` | Username | `postgres` |
| `dbPassword` | Password | None |
| `dbConnectionString` | Full connection string (overrides above) | None |

## Security & Sessions

| Variable | Description | Default |
|----------|-------------|---------|
| `cookieSecret` | Secret key for cookies (min 16 chars) | Auto-generated |
| `cookieName` | Cookie name | `pulsarr` |
| `cookieSecured` | Require HTTPS for cookies | `false` |
| `webhookSecret` | Secret for Sonarr/Radarr webhook auth (min 16 chars) | Auto-generated |
| `allowIframes` | Allow embedding in Organizr, etc. | `false` |
| `authenticationMethod` | `required`, `requiredExceptLocal`, `disabled` | `required` |
| `rateLimitMax` | Max requests per time window | `500` |
| `closeGraceDelay` | Shutdown grace period (ms) | `10000` |

### Authentication Configuration Details {#authentication-configuration-details}

When using `authenticationMethod=requiredExceptLocal`, these IP ranges bypass auth:

- `127.0.0.0/8` - localhost
- `10.0.0.0/8` - Class A private
- `172.16.0.0/12` - Class B private
- `192.168.0.0/16` - Class C private
- `169.254.0.0/16` - Link-local
- `::1/128`, `fc00::/7`, `fe80::/10` - IPv6 equivalents

:::warning
Ensure your network is secure when using `requiredExceptLocal`.
:::

## Plex

| Variable | Description | Default |
|----------|-------------|---------|
| `plexTokens` | JSON array of Plex tokens | None |
| `plexServerUrl` | Plex server URL (optional, auto-detected) | None |
| `skipFriendSync` | Skip syncing Plex friends | `false` |
| `skipIfExistsOnPlex` | Skip if content exists on Plex | `false` |
| `enablePlexPlaylistProtection` | Enable playlist protection | `false` |
| `plexProtectionPlaylistName` | Protection playlist name | `Do Not Delete` |
| `selfRss` | Self RSS feed URL | None |
| `friendsRss` | Friends RSS feed URL | None |

## Notifications

### Discord

| Variable | Description | Default |
|----------|-------------|---------|
| `discordWebhookUrl` | Webhook URLs (comma-separated) | None |
| `discordBotToken` | Bot token | None |
| `discordClientId` | Client ID | None |

### Apprise

| Variable | Description | Default |
|----------|-------------|---------|
| `appriseUrl` | Apprise server URL | None |
| `enableApprise` | Auto-set based on server availability | `false` |
| `systemAppriseUrl` | Apprise URL for system notifications only | None |

### Plex Mobile

| Variable | Description | Default |
|----------|-------------|---------|
| `plexMobileEnabled` | Enable Plex mobile push notifications (requires Plex Pass) | `false` |

### Notification Queue

| Variable | Description | Default |
|----------|-------------|---------|
| `queueWaitTime` | Queue wait time (ms) | `120000` |
| `newEpisodeThreshold` | New episode threshold (ms) | `172800000` |
| `pendingWebhookRetryInterval` | Retry interval (seconds) | `20` |
| `pendingWebhookMaxAge` | Max age (minutes) | `10` |
| `pendingWebhookCleanupInterval` | Cleanup interval (minutes) | `60` |

## User Tagging

| Variable | Description | Default |
|----------|-------------|---------|
| `tagUsersInSonarr` | Enable user tagging in Sonarr | `false` |
| `tagUsersInRadarr` | Enable user tagging in Radarr | `false` |
| `tagPrefix` | Prefix for user tags | `pulsarr-user` |
| `cleanupOrphanedTags` | Remove tags for deleted users | `true` |
| `removedTagMode` | `remove`, `keep`, `special-tag` | `remove` |
| `removedTagPrefix` | Prefix for removal tags | `pulsarr-removed` |

## Delete Sync

| Variable | Description | Default |
|----------|-------------|---------|
| `deletionMode` | `watchlist` or `tag-based` | `watchlist` |
| `deleteMovie` | Auto-delete movies | `false` |
| `deleteEndedShow` | Auto-delete ended shows | `false` |
| `deleteContinuingShow` | Auto-delete continuing shows | `false` |
| `deleteFiles` | Delete files from disk | `true` |
| `respectUserSyncSetting` | Only delete from sync-enabled users | `true` |
| `deleteSyncNotify` | Notification type | `none` |
| `deleteSyncNotifyOnlyOnDeletion` | Only notify on actual deletion | `false` |
| `deleteSyncTrackedOnly` | Only delete approval-tracked content | `false` |
| `deleteSyncCleanupApprovals` | Cleanup approvals after deletion | `false` |
| `maxDeletionPrevention` | Max % of library to delete | `10` |

## New User Defaults

| Variable | Description | Default |
|----------|-------------|---------|
| `newUserDefaultCanSync` | Default sync permission | `true` |
| `newUserDefaultRequiresApproval` | Default approval requirement | `false` |
| `newUserDefaultMovieQuotaEnabled` | Enable movie quotas | `false` |
| `newUserDefaultMovieQuotaType` | `daily`, `weekly_rolling`, `monthly` | `monthly` |
| `newUserDefaultMovieQuotaLimit` | Movie quota limit | `10` |
| `newUserDefaultMovieBypassApproval` | Auto-approve when exceeded | `false` |
| `newUserDefaultShowQuotaEnabled` | Enable show quotas | `false` |
| `newUserDefaultShowQuotaType` | `daily`, `weekly_rolling`, `monthly` | `monthly` |
| `newUserDefaultShowQuotaLimit` | Show quota limit | `10` |
| `newUserDefaultShowBypassApproval` | Auto-approve when exceeded | `false` |

## JSON Configuration Variables

These variables accept JSON strings for complex configuration:

### Plex Session Monitoring

```env
plexSessionMonitoring='{"enabled":false,"pollingIntervalMinutes":15,"remainingEpisodes":2,"filterUsers":[],"enableAutoReset":true,"inactivityResetDays":7,"autoResetIntervalHours":24,"enableProgressiveCleanup":false}'
```

| Field | Description | Default |
|-------|-------------|---------|
| `enabled` | Enable session monitoring | `false` |
| `pollingIntervalMinutes` | Check interval (1-1440) | `15` |
| `remainingEpisodes` | Episodes before trigger (1-10) | `2` |
| `filterUsers` | Usernames to monitor (empty = all) | `[]` |
| `enableAutoReset` | Auto-reset inactive shows | `true` |
| `inactivityResetDays` | Days before reset (1-365) | `7` |
| `autoResetIntervalHours` | Reset check interval (1-168) | `24` |
| `enableProgressiveCleanup` | Progressive season cleanup | `false` |

### Quota Settings

```env
quotaSettings='{"cleanup":{"enabled":true,"retentionDays":90},"weeklyRolling":{"resetDays":7},"monthly":{"resetDay":1,"handleMonthEnd":"last-day"}}'
```

| Field | Description | Default |
|-------|-------------|---------|
| `cleanup.enabled` | Enable old record cleanup | `true` |
| `cleanup.retentionDays` | Days to keep history (1-3650) | `90` |
| `weeklyRolling.resetDays` | Days between resets (1-365) | `7` |
| `monthly.resetDay` | Day of month for reset (1-31) | `1` |
| `monthly.handleMonthEnd` | `last-day`, `skip-month`, `next-month` | `last-day` |

### Approval Expiration

```env
approvalExpiration='{"enabled":false,"defaultExpirationHours":72,"expirationAction":"expire","autoApproveOnQuotaAvailable":false,"cleanupExpiredDays":30}'
```

| Field | Description | Default |
|-------|-------------|---------|
| `enabled` | Enable auto-expiration | `false` |
| `defaultExpirationHours` | Hours before expiration (1-8760) | `72` |
| `expirationAction` | `expire` or `auto_approve` | `expire` |
| `autoApproveOnQuotaAvailable` | Auto-approve when quota resets | `false` |
| `cleanupExpiredDays` | Days to keep expired records (1-365) | `30` |

### Plex Label Sync

```env
plexLabelSync='{"enabled":false,"labelPrefix":"pulsarr","concurrencyLimit":5,"cleanupOrphanedLabels":false,"removedLabelMode":"remove","removedLabelPrefix":"pulsarr:removed","autoResetOnScheduledSync":false,"tagSync":{"enabled":false,"syncRadarrTags":true,"syncSonarrTags":true}}'
```

| Field | Description | Default |
|-------|-------------|---------|
| `enabled` | Enable label sync | `false` |
| `labelPrefix` | Prefix for user labels | `pulsarr` |
| `concurrencyLimit` | Max concurrent operations (1-20) | `5` |
| `cleanupOrphanedLabels` | Remove labels for deleted users | `false` |
| `removedLabelMode` | `remove`, `keep`, `special-label` | `remove` |
| `removedLabelPrefix` | Special removal label prefix | `pulsarr:removed` |
| `tagSync.enabled` | Sync Sonarr/Radarr tags to Plex | `false` |
| `tagSync.syncRadarrTags` | Sync Radarr tags | `true` |
| `tagSync.syncSonarrTags` | Sync Sonarr tags | `true` |

### Public Content Notifications

```env
publicContentNotifications='{"enabled":false,"discordWebhookUrls":"","discordWebhookUrlsMovies":"","discordWebhookUrlsShows":"","appriseUrls":"","appriseUrlsMovies":"","appriseUrlsShows":""}'
```

## TMDB API Configuration {#tmdb-api-configuration}

Required for TMDB metadata features when building from source:

1. Create account at [themoviedb.org](https://www.themoviedb.org/)
2. Get Read Access Token at [themoviedb.org/settings/api](https://www.themoviedb.org/settings/api)
3. Add to `.env`: `tmdbApiKey=your_read_access_token_here`

:::note
Use the **Read Access Token** (starts with `eyJ`), not the legacy API Key.
:::

## Development Only

:::warning
These variables are for development/testing only. Do not use in production.
:::

### Sonarr Instance Seeding

| Variable | Description |
|----------|-------------|
| `sonarrBaseUrl` | Sonarr instance URL |
| `sonarrApiKey` | API key |
| `sonarrQualityProfile` | Quality profile |
| `sonarrRootFolder` | Root folder path |
| `sonarrBypassIgnored` | Bypass ignored |
| `sonarrSeasonMonitoring` | Season monitoring |
| `sonarrMonitorNewItems` | Monitor new items |
| `sonarrTags` | Tags (JSON array) |

### Radarr Instance Seeding

| Variable | Description |
|----------|-------------|
| `radarrBaseUrl` | Radarr instance URL |
| `radarrApiKey` | API key |
| `radarrQualityProfile` | Quality profile |
| `radarrRootFolder` | Root folder path |
| `radarrBypassIgnored` | Bypass ignored |
| `radarrTags` | Tags (JSON array) |
