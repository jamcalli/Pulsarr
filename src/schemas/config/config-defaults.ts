import { USER_NAMING_SOURCE_DEFAULT } from '@root/schemas/common/user-naming-source.schema.js'
import {
  DEFAULT_LOG_LEVEL,
  DEFAULT_PULSARR_PORT,
  DELETION_MODE_DEFAULT,
  MAINTAINERR_EXCLUSION_MODE_DEFAULT,
  NEW_EPISODE_THRESHOLD_MS,
  NOTIFY_DEFAULTS,
  PENDING_WEBHOOK_DEFAULTS,
  QUEUE_WAIT_TIME_MS,
  REMOVED_TAG_MODE_DEFAULT,
  TMDB_REGION_DEFAULT,
} from '@root/schemas/config/config.schema.js'
import { PLEX_EXISTENCE_SCOPE_DEFAULT } from '@root/schemas/plex/existence-scope.schema.js'
import { PLEX_LABEL_SYNC_DEFAULTS } from '@root/schemas/plex/label-sync-config.schema.js'
import {
  MAX_DELETION_PREVENTION,
  PLEX_PROTECTION_PLAYLIST_DEFAULT,
} from '@root/schemas/shared/delete-sync-limits.js'
import { TAG_PREFIX_DEFAULTS } from '@root/schemas/shared/prefix-validation.schema.js'
import { QUOTA_DEFAULTS } from '@root/schemas/shared/quota-limits.js'
import type { Config, SecretColumn } from '@root/types/config.types.js'

export const DEFAULT_PUBLIC_CONTENT_NOTIFICATIONS = {
  enabled: false,
  discordWebhookUrls: '',
  discordWebhookUrlsMovies: '',
  discordWebhookUrlsShows: '',
  appriseUrls: '',
  appriseUrlsMovies: '',
  appriseUrlsShows: '',
}

export const DEFAULT_QUOTA_SETTINGS = {
  cleanup: {
    enabled: true,
    retentionDays: 90,
  },
  weeklyRolling: {
    resetDays: 7,
  },
  monthly: {
    resetDay: 1,
    handleMonthEnd: 'last-day' as const,
  },
}

export const DEFAULT_APPROVAL_EXPIRATION = {
  enabled: false,
  defaultExpirationHours: 72,
  expirationAction: 'expire' as const,
  autoApproveOnQuotaAvailable: false,
  cleanupExpiredDays: 30,
}

/** Every public key the config document stores, with the value a missing, null or empty stored value reads as. */
export const STORED_CONFIG_DEFAULTS = {
  port: DEFAULT_PULSARR_PORT,
  baseUrl: undefined,
  logLevel: DEFAULT_LOG_LEVEL,
  _isReady: false,
  discordWebhookUrl: undefined,
  discordBotToken: undefined,
  discordClientId: undefined,
  enableApprise: false,
  appriseUrl: '',
  systemAppriseUrl: undefined,
  appriseEmailSender: undefined,
  publicContentNotifications: DEFAULT_PUBLIC_CONTENT_NOTIFICATIONS,
  plexMobileEnabled: false,
  queueWaitTime: QUEUE_WAIT_TIME_MS.default,
  newEpisodeThreshold: NEW_EPISODE_THRESHOLD_MS.default,
  notifyOnUpdate: NOTIFY_DEFAULTS.notifyOnUpdate,
  notifyOnAvailability: NOTIFY_DEFAULTS.notifyOnAvailability,
  pendingWebhookRetryInterval: PENDING_WEBHOOK_DEFAULTS.retryIntervalSeconds,
  pendingWebhookMaxAge: PENDING_WEBHOOK_DEFAULTS.maxAgeMinutes,
  pendingWebhookCleanupInterval:
    PENDING_WEBHOOK_DEFAULTS.cleanupIntervalSeconds,
  plexTokens: [],
  skipFriendSync: false,
  plexServerUrl: undefined,
  skipIfExistsOnPlex: false,
  plexExistenceScope: PLEX_EXISTENCE_SCOPE_DEFAULT,
  enablePlexPlaylistProtection: false,
  plexProtectionPlaylistName: PLEX_PROTECTION_PLAYLIST_DEFAULT,
  plexLabelSync: PLEX_LABEL_SYNC_DEFAULTS,
  plexSessionMonitoring: undefined,
  selfRss: undefined,
  friendsRss: undefined,
  deletionMode: DELETION_MODE_DEFAULT,
  deleteMovie: false,
  deleteEndedShow: false,
  deleteContinuingShow: false,
  deleteFiles: false,
  respectUserSyncSetting: false,
  deleteSyncNotify: NOTIFY_DEFAULTS.deleteSyncNotify,
  deleteSyncNotifyOnlyOnDeletion:
    NOTIFY_DEFAULTS.deleteSyncNotifyOnlyOnDeletion,
  deleteSyncTrackedOnly: false,
  deleteSyncCleanupApprovals: false,
  deleteSyncRequiredTagRegex: '',
  maxDeletionPrevention: MAX_DELETION_PREVENTION.default,
  approvalNotify: NOTIFY_DEFAULTS.approvalNotify,
  watchlistCapNotify: NOTIFY_DEFAULTS.watchlistCapNotify,
  watchlistCapNotifyUser: NOTIFY_DEFAULTS.watchlistCapNotifyUser,
  watchlistAddNotify: NOTIFY_DEFAULTS.watchlistAddNotify,
  tagUsersInSonarr: false,
  tagUsersInRadarr: false,
  cleanupOrphanedTags: false,
  tagPrefix: TAG_PREFIX_DEFAULTS.tagPrefix,
  tagNamingSource: USER_NAMING_SOURCE_DEFAULT,
  removedTagMode: REMOVED_TAG_MODE_DEFAULT,
  removedTagPrefix: TAG_PREFIX_DEFAULTS.removedTagPrefix,
  newUserDefaultCanSync: true,
  newUserDefaultRequiresApproval: false,
  newUserDefaultMovieQuotaEnabled: false,
  newUserDefaultMovieQuotaType: QUOTA_DEFAULTS.quotaType,
  newUserDefaultMovieQuotaLimit: QUOTA_DEFAULTS.limit,
  newUserDefaultMovieBypassApproval: false,
  newUserDefaultMovieWatchlistCap: null,
  newUserDefaultShowQuotaEnabled: false,
  newUserDefaultShowQuotaType: QUOTA_DEFAULTS.quotaType,
  newUserDefaultShowQuotaLimit: QUOTA_DEFAULTS.limit,
  newUserDefaultShowBypassApproval: false,
  newUserDefaultShowWatchlistCap: null,
  quotaSettings: DEFAULT_QUOTA_SETTINGS,
  approvalExpiration: DEFAULT_APPROVAL_EXPIRATION,
  tmdbRegion: TMDB_REGION_DEFAULT,
  maintainerrEnabled: false,
  maintainerrUrl: '',
  maintainerrExclusionMode: MAINTAINERR_EXCLUSION_MODE_DEFAULT,
} satisfies Partial<Config>

export type StoredConfigKey = keyof typeof STORED_CONFIG_DEFAULTS

export type StoredConfig = Pick<Config, StoredConfigKey>

export type PublicConfigPatch = Partial<StoredConfig>

export type InternalConfigKey = SecretColumn | 'lastNotifiedVersion'

export const STORED_CONFIG_KEYS = Object.keys(
  STORED_CONFIG_DEFAULTS,
) as StoredConfigKey[]

export const SECRET_CONFIG_KEYS: readonly SecretColumn[] = [
  'cookieSecret',
  'webhookSecret',
  'maintainerrWebhookSecret',
]

export const INTERNAL_CONFIG_KEYS: readonly InternalConfigKey[] = [
  ...SECRET_CONFIG_KEYS,
  'lastNotifiedVersion',
]
