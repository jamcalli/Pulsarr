import type {
  DELETE_SYNC_NOTIFY_OPTIONS,
  MAINTAINERR_EXCLUSION_MODES,
  NOTIFY_OPTIONS,
  UPDATE_NOTIFY_OPTIONS,
} from '@root/schemas/config/config.schema.js'
import type { PLEX_EXISTENCE_SCOPES } from '@root/schemas/plex/existence-scope.schema.js'
import type { PlexLabelSyncConfig } from '@root/schemas/plex/label-sync-config.schema.js'
import type { LogLevel } from '@root/types/logs.types.js'

export interface User {
  id: number
  name: string
  apprise: string | null
  alias: string | null
  discord_id: string | null
  notify_apprise: boolean
  notify_discord: boolean
  notify_discord_mention: boolean
  notify_plex_mobile: boolean
  can_sync: boolean
  requires_approval: boolean
  is_primary_token: boolean
  plex_uuid?: string | null
  avatar?: string | null
  display_name?: string | null
  friend_created_at?: string | null
  created_at: string
  updated_at: string
}

export type ConfigLogLevel = LogLevel | 'silent'

export type UpdateNotifyOption = (typeof UPDATE_NOTIFY_OPTIONS)[number]

export type NotifyOption = (typeof NOTIFY_OPTIONS)[number]

export type DeleteSyncNotifyOption = (typeof DELETE_SYNC_NOTIFY_OPTIONS)[number]

export type MaintainerrExclusionMode =
  (typeof MAINTAINERR_EXCLUSION_MODES)[number]

export type PlexExistenceScope = (typeof PLEX_EXISTENCE_SCOPES)[number]

export type RemovedTagMode = 'remove' | 'keep' | 'special-tag'

export type RemovedLabelMode = 'remove' | 'keep' | 'special-label'

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

export type SecretColumn =
  | 'cookieSecret'
  | 'webhookSecret'
  | 'maintainerrWebhookSecret'

export interface Config {
  id: number
  // System Config
  basePath: string
  baseUrl: string
  port: number
  listenPort: number
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
  webhookSecret: string
  logLevel: ConfigLogLevel
  closeGraceDelay: number
  authenticationMethod: 'required' | 'requiredExceptLocal' | 'disabled'
  rateLimitMax: number
  queueProcessDelaySeconds: number
  // Maintainerr Config
  maintainerrEnabled: boolean
  maintainerrUrl: string
  maintainerrWebhookSecret: string
  maintainerrExclusionMode: MaintainerrExclusionMode
  // Discord Config
  discordWebhookUrl: string
  discordBotToken: string
  discordClientId: string
  // Apprise Config
  enableApprise: boolean
  appriseUrl: string
  systemAppriseUrl: string
  appriseEmailSender?: string
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
  // Plex Mobile Config
  plexMobileEnabled: boolean
  // General Notifications
  queueWaitTime: number
  newEpisodeThreshold: number
  // Out-of-app update notifications
  notifyOnUpdate: UpdateNotifyOption
  notifyOnAvailability: boolean
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
  // TMDB Config
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
  watchlistCapNotify: NotifyOption
  watchlistCapNotifyUser: boolean
  watchlistAddNotify: NotifyOption
  deleteSyncNotifyOnlyOnDeletion: boolean
  maxDeletionPrevention: number
  deleteSyncTrackedOnly: boolean // Only delete content tracked in approval_requests
  deleteSyncCleanupApprovals: boolean // Clean up approval_requests for deleted content
  deleteSyncRequiredTagRegex?: string // Additional regex filter - content must have BOTH removal tag AND tag matching this regex to be deleted
  enablePlexPlaylistProtection: boolean
  plexProtectionPlaylistName: string
  plexServerUrl?: string // Optional: Only set this if automatic discovery fails, URL is auto-detected in most cases
  skipIfExistsOnPlex?: boolean // Skip downloading if content exists on accessible Plex servers (primary token only, requires reconciliation)
  plexExistenceScope: PlexExistenceScope
  // Plex Label Sync Configuration - nested object following complex config pattern
  plexLabelSync?: PlexLabelSyncConfig
  // RSS Config
  selfRss?: string
  friendsRss?: string
  // Tagging Config
  tagUsersInSonarr: boolean
  tagUsersInRadarr: boolean
  cleanupOrphanedTags: boolean
  tagPrefix: string
  tagNamingSource: 'username' | 'alias'
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
  newUserDefaultMovieWatchlistCap?: number | null
  newUserDefaultShowWatchlistCap?: number | null
  // Quota System Configuration
  quotaSettings?: {
    // Cleanup configuration
    cleanup: {
      enabled: boolean
      retentionDays: number
    }
    // Weekly rolling quota configuration
    weeklyRolling: {
      resetDays: number
    }
    // Monthly quota configuration
    monthly: {
      resetDay: number
      handleMonthEnd: 'last-day' | 'skip-month' | 'next-month'
    }
  }
  // Approval System Configuration
  approvalExpiration?: {
    enabled?: boolean
    // Default expiration time in hours for approval requests
    defaultExpirationHours?: number
    // What happens when approvals expire
    expirationAction?: 'expire' | 'auto_approve'
    // Auto-approve quota_exceeded requests when quota becomes available
    autoApproveOnQuotaAvailable?: boolean
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
            : K extends 'plexLabelSync'
              ? string
              : Config[K]
}
