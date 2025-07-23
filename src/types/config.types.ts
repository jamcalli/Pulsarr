export interface User {
  id: number
  name: string
  apprise: string | null
  alias: string | null
  discord_id: string | null
  notify_apprise: boolean
  notify_discord: boolean
  notify_tautulli: boolean
  tautulli_notifier_id: number | null
  can_sync: boolean
  requires_approval?: boolean
  is_primary_token?: boolean
  created_at?: string
  updated_at?: string
}

export type LogLevel =
  | 'fatal'
  | 'error'
  | 'warn'
  | 'info'
  | 'debug'
  | 'trace'
  | 'silent'

export type NotifyOption =
  | 'none' // No notifications
  | 'all' // All available notification channels
  | 'discord-only' // Only Discord (both webhook and DM if configured)
  | 'apprise-only' // Only Apprise
  | 'webhook-only' // Only Discord webhook (no DMs)
  | 'dm-only' // Only Discord DMs (no webhook)
  | 'discord-webhook' // Equivalent to webhook-only
  | 'discord-message' // Equivalent to dm-only
  | 'discord-both' // Both Discord webhook and DMs, no Apprise

export type DeleteSyncNotifyOption =
  | 'none' // No notifications
  | 'message' // Discord DM only (legacy)
  | 'webhook' // Discord webhook only (legacy)
  | 'both' // Both Discord webhook and DM (legacy)
  | 'all' // All available notification channels
  | 'discord-only' // Only Discord (both webhook and DM if configured)
  | 'apprise-only' // Only Apprise
  | 'webhook-only' // Only Discord webhook (no DMs)
  | 'dm-only' // Only Discord DMs (no webhook)
  | 'discord-webhook' // Equivalent to webhook-only
  | 'discord-message' // Equivalent to dm-only
  | 'discord-both' // Both Discord webhook and DMs, no Apprise

export type RemovedTagMode = 'remove' | 'keep' | 'special-tag'

export type DeletionMode = 'watchlist' | 'tag-based'

// Type-safe key definitions for public content notification config
export type DiscordWebhookKey =
  | 'discordWebhookUrls'
  | 'discordWebhookUrlsMovies'
  | 'discordWebhookUrlsShows'

export type AppriseUrlKey =
  | 'appriseUrls'
  | 'appriseUrlsMovies'
  | 'appriseUrlsShows'

// Type-safe lookup table structure for public content notification keys
export type PublicContentKeyMap = Record<
  'discord' | 'apprise',
  {
    generic: DiscordWebhookKey | AppriseUrlKey
    movies: DiscordWebhookKey | AppriseUrlKey
    shows: DiscordWebhookKey | AppriseUrlKey
  }
>

export interface Config {
  id: number
  // System Config
  baseUrl: string
  port: number
  // Database Config
  dbType: 'sqlite' | 'postgres'
  dbPath: string
  dbHost: string
  dbPort: number
  dbName: string
  dbUser: string
  dbPassword: string
  dbConnectionString: string
  cookieSecret: string
  cookieName: string
  cookieSecured: boolean
  logLevel: LogLevel
  closeGraceDelay: number
  authenticationMethod: 'required' | 'requiredExceptLocal' | 'disabled'
  rateLimitMax: number
  syncIntervalSeconds: number
  queueProcessDelaySeconds: number
  // Discord Config
  discordWebhookUrl: string
  discordBotToken: string
  discordClientId: string
  discordGuildId: string
  // Apprise Config
  enableApprise: boolean
  appriseUrl: string
  systemAppriseUrl: string
  // Public Content Notifications - broadcast ALL content availability to public channels/endpoints
  publicContentNotifications?: {
    enabled: boolean
    // Discord webhook URLs for public content announcements (comma-separated)
    discordWebhookUrls?: string
    // Movie-specific Discord webhook URLs (comma-separated)
    discordWebhookUrlsMovies?: string
    // Show-specific Discord webhook URLs (comma-separated)
    discordWebhookUrlsShows?: string
    // Apprise URLs for public content announcements (comma-separated)
    appriseUrls?: string
    // Movie-specific Apprise URLs (comma-separated)
    appriseUrlsMovies?: string
    // Show-specific Apprise URLs (comma-separated)
    appriseUrlsShows?: string
  }
  // Tautulli Config
  tautulliEnabled: boolean
  tautulliUrl: string
  tautulliApiKey: string
  // General Notifications
  queueWaitTime: number
  newEpisodeThreshold: number
  upgradeBufferTime: number
  // Pending Webhooks Config
  pendingWebhookRetryInterval: number
  pendingWebhookMaxAge: number
  pendingWebhookCleanupInterval: number
  // Sonarr Config
  sonarrBaseUrl: string
  sonarrApiKey: string
  sonarrQualityProfile: string
  sonarrRootFolder: string
  sonarrBypassIgnored: boolean
  sonarrSeasonMonitoring: string
  sonarrMonitorNewItems: 'all' | 'none'
  sonarrTags: string[]
  sonarrCreateSeasonFolders: boolean
  // Radarr Config
  radarrBaseUrl: string
  radarrApiKey: string
  radarrQualityProfile: string
  radarrRootFolder: string
  radarrBypassIgnored: boolean
  radarrTags: string[]
  // TMDB Config (API key from env, region from DB)
  tmdbApiKey: string
  tmdbRegion: string
  // Plex Config
  plexTokens: string[]
  skipFriendSync: boolean
  // Delete Config
  deletionMode: DeletionMode
  deleteMovie: boolean
  deleteEndedShow: boolean
  deleteContinuingShow: boolean
  deleteFiles: boolean
  respectUserSyncSetting: boolean
  deleteSyncNotify: DeleteSyncNotifyOption
  approvalNotify: NotifyOption
  deleteSyncNotifyOnlyOnDeletion: boolean
  maxDeletionPrevention: number
  enablePlexPlaylistProtection: boolean
  plexProtectionPlaylistName: string
  plexServerUrl?: string // Optional: Only set this if automatic discovery fails, URL is auto-detected in most cases
  // RSS Config
  selfRss?: string
  friendsRss?: string
  // Tagging Config
  tagUsersInSonarr: boolean
  tagUsersInRadarr: boolean
  cleanupOrphanedTags: boolean
  tagPrefix: string
  // Special tag for removed content
  removedTagMode: RemovedTagMode
  removedTagPrefix: string
  // Plex Session Monitoring
  plexSessionMonitoring?: {
    enabled: boolean
    pollingIntervalMinutes: number
    remainingEpisodes: number
    filterUsers?: string[]
    // Rolling monitoring reset settings
    enableAutoReset?: boolean
    inactivityResetDays?: number
    autoResetIntervalHours?: number
    // Progressive cleanup mode - cleans up previous seasons as user progresses
    enableProgressiveCleanup?: boolean
  }
  // New User Defaults
  newUserDefaultCanSync?: boolean
  newUserDefaultRequiresApproval?: boolean
  newUserDefaultMovieQuotaEnabled?: boolean
  newUserDefaultMovieQuotaType?: 'daily' | 'weekly_rolling' | 'monthly'
  newUserDefaultMovieQuotaLimit?: number
  newUserDefaultMovieBypassApproval?: boolean
  newUserDefaultShowQuotaEnabled?: boolean
  newUserDefaultShowQuotaType?: 'daily' | 'weekly_rolling' | 'monthly'
  newUserDefaultShowQuotaLimit?: number
  newUserDefaultShowBypassApproval?: boolean
  // Quota System Configuration
  quotaSettings?: {
    // Cleanup configuration
    cleanup?: {
      enabled?: boolean
      retentionDays?: number
    }
    // Weekly rolling quota configuration
    weeklyRolling?: {
      resetDays?: number
    }
    // Monthly quota configuration
    monthly?: {
      resetDay?: number
      handleMonthEnd?: 'last-day' | 'skip-month' | 'next-month'
    }
  }
  // Approval System Configuration
  approvalExpiration?: {
    enabled?: boolean
    // Default expiration time in hours for approval requests
    defaultExpirationHours?: number
    // What happens when approvals expire
    expirationAction?: 'expire' | 'auto_approve'
    // Per-trigger expiration overrides
    quotaExceededExpirationHours?: number
    routerRuleExpirationHours?: number
    manualFlagExpirationHours?: number
    contentCriteriaExpirationHours?: number
    // Maintenance settings
    cleanupExpiredDays?: number
  }
  // Security Config
  allowIframes: boolean
  // Ready state
  _isReady: boolean
}

export type RawConfig = {
  [K in keyof Config]: Config[K] extends string[]
    ? string
    : K extends 'plexSessionMonitoring'
      ? string
      : K extends 'publicContentNotifications'
        ? string
        : K extends 'quotaSettings'
          ? string
          : K extends 'approvalExpiration'
            ? string
            : Config[K]
}
