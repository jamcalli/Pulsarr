import type {
  ArrWebhookResults,
  ConfigFull,
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

export type DiscordWebhookKey =
  | 'discordWebhookUrls'
  | 'discordWebhookUrlsMovies'
  | 'discordWebhookUrlsShows'

export type AppriseUrlKey =
  | 'appriseUrls'
  | 'appriseUrlsMovies'
  | 'appriseUrlsShows'

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
  basePath: string
  baseUrl: string
  port: number
  listenPort: number
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
  allowedOrigins: string[]
  allowedHosts: string[]
  trustedProxies: string[]
  rateLimitMax: number
  maintainerrEnabled: boolean
  maintainerrUrl: string
  maintainerrWebhookSecret: string
  maintainerrExclusionMode: MaintainerrExclusionMode
  discordWebhookUrl: string
  discordBotToken: string
  discordClientId: string
  enableApprise: boolean
  appriseUrl: string
  systemAppriseUrl: string
  appriseEmailSender?: string
  publicContentNotifications?: {
    enabled: boolean
    /** Comma-separated. */
    discordWebhookUrls?: string
    /** Comma-separated. */
    discordWebhookUrlsMovies?: string
    /** Comma-separated. */
    discordWebhookUrlsShows?: string
    /** Comma-separated. */
    appriseUrls?: string
    /** Comma-separated. */
    appriseUrlsMovies?: string
    /** Comma-separated. */
    appriseUrlsShows?: string
  }
  plexMobileEnabled: boolean
  queueWaitTime: number
  newEpisodeThreshold: number
  notifyOnUpdate: UpdateNotifyOption
  notifyOnAvailability: boolean
  pendingWebhookRetryInterval: number
  pendingWebhookMaxAge: number
  pendingWebhookCleanupInterval: number
  sonarrBaseUrl: string
  sonarrApiKey: string
  sonarrQualityProfile: string
  sonarrRootFolder: string
  sonarrBypassIgnored: boolean
  sonarrSeasonMonitoring: string
  sonarrMonitorNewItems: 'all' | 'none'
  sonarrTags: string[]
  sonarrCreateSeasonFolders: boolean
  radarrBaseUrl: string
  radarrApiKey: string
  radarrQualityProfile: string
  radarrRootFolder: string
  radarrBypassIgnored: boolean
  radarrTags: string[]
  tmdbApiKey: string
  tmdbRegion: string
  plexTokens: string[]
  skipFriendSync: boolean
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
  deleteSyncTrackedOnly: boolean
  deleteSyncCleanupApprovals: boolean
  deleteSyncRequiredTagRegex?: string // Additional regex filter - content must have BOTH removal tag AND tag matching this regex to be deleted
  enablePlexPlaylistProtection: boolean
  plexProtectionPlaylistName: string
  plexServerUrl?: string // Optional: Only set this if automatic discovery fails, URL is auto-detected in most cases
  skipIfExistsOnPlex?: boolean // Skip downloading if content exists on accessible Plex servers (primary token only, requires reconciliation)
  plexExistenceScope: PlexExistenceScope
  plexLabelSync?: PlexLabelSyncConfig
  selfRss?: string
  friendsRss?: string
  tagUsersInSonarr: boolean
  tagUsersInRadarr: boolean
  cleanupOrphanedTags: boolean
  tagPrefix: string
  tagNamingSource: 'username' | 'alias'
  removedTagMode: RemovedTagMode
  removedTagPrefix: string
  plexSessionMonitoring?: {
    enabled: boolean
    pollingIntervalMinutes: number
    remainingEpisodes: number
    filterUsers?: string[]
    enableAutoReset?: boolean
    inactivityResetDays?: number
    autoResetIntervalHours?: number
    enableProgressiveCleanup?: boolean
  }
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
  quotaSettings?: {
    cleanup: {
      enabled: boolean
      retentionDays: number
    }
    weeklyRolling: {
      resetDays: number
    }
    monthly: {
      resetDay: number
      handleMonthEnd: 'last-day' | 'skip-month' | 'next-month'
    }
  }
  approvalExpiration?: {
    enabled?: boolean
    defaultExpirationHours?: number
    expirationAction?: 'expire' | 'auto_approve'
    autoApproveOnQuotaAvailable?: boolean
    quotaExceededExpirationHours?: number
    routerRuleExpirationHours?: number
    manualFlagExpirationHours?: number
    contentCriteriaExpirationHours?: number
    cleanupExpiredDays?: number
  }
  allowIframes: boolean
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

export type ConfigUpdateFailure =
  | 'plex_pass_required'
  | 'tag_prefix_blocked'
  | 'token_rejected'
  | 'token_unreachable'
  | 'webhook_unreachable'

export type ConfigUpdateResult =
  | { success: true; config: ConfigFull; webhooks?: ArrWebhookResults }
  | {
      success: false
      reason: ConfigUpdateFailure
      message: string
      webhooks?: ArrWebhookResults
    }
