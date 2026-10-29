import {
  type ConfigFull,
  MAINTAINERR_EXCLUSION_MODE_DEFAULT,
  NEW_EPISODE_THRESHOLD_MS,
  NOTIFY_DEFAULTS,
  QUEUE_WAIT_TIME_MS,
} from '@root/schemas/config/config.schema.js'
import { PLEX_EXISTENCE_SCOPE_DEFAULT } from '@root/schemas/plex/existence-scope.schema.js'
import {
  PLEX_LABEL_SYNC_DEFAULTS,
  type PlexLabelSyncConfig,
} from '@root/schemas/plex/label-sync-config.schema.js'
import { PLEX_SESSION_MONITORING_DEFAULTS } from '@root/schemas/session-monitoring/session-monitoring-config.schema.js'
import {
  MAX_DELETION_PREVENTION,
  PLEX_PROTECTION_PLAYLIST_DEFAULT,
} from '@root/schemas/shared/delete-sync-limits.js'
import { TAG_PREFIX_DEFAULTS } from '@root/schemas/shared/prefix-validation.schema.js'
import { QUOTA_DEFAULTS } from '@root/schemas/shared/quota-limits.js'
import type { Config, SecretColumn } from '@root/types/config.types.js'
import type { DatabaseService } from '@services/database.service.js'
import { parseJsonOr } from '@utils/json.js'

/** Parses the JSON columns and fills defaults for missing or malformed fields. */
export async function getConfig(
  this: DatabaseService,
): Promise<ConfigFull | undefined> {
  const config = await this.knex('configs').where({ id: 1 }).first()
  if (!config) return undefined

  return {
    ...config,
    plexTokens: parseJsonOr<string[]>(
      config.plexTokens,
      [],
      this.log,
      'config.plexTokens',
    ),
    plexSessionMonitoring: config.plexSessionMonitoring
      ? parseJsonOr(
          config.plexSessionMonitoring,
          PLEX_SESSION_MONITORING_DEFAULTS,
          this.log,
          'config.plexSessionMonitoring',
        )
      : undefined,
    publicContentNotifications: {
      enabled: false,
      discordWebhookUrls: '',
      discordWebhookUrlsMovies: '',
      discordWebhookUrlsShows: '',
      appriseUrls: '',
      appriseUrlsMovies: '',
      appriseUrlsShows: '',
      ...(config.publicContentNotifications
        ? parseJsonOr(
            config.publicContentNotifications,
            {},
            this.log,
            'config.publicContentNotifications',
          )
        : {}),
    },
    quotaSettings: (() => {
      const parsed = config.quotaSettings
        ? parseJsonOr<{
            cleanup?: { enabled?: boolean; retentionDays?: number }
            weeklyRolling?: { resetDays?: number }
            monthly?: {
              resetDay?: number
              handleMonthEnd?: 'last-day' | 'skip-month' | 'next-month'
            }
          }>(config.quotaSettings, {}, this.log, 'config.quotaSettings')
        : {}
      return {
        cleanup: {
          enabled: true,
          retentionDays: 90,
          ...(parsed.cleanup ?? {}),
        },
        weeklyRolling: {
          resetDays: 7,
          ...(parsed.weeklyRolling ?? {}),
        },
        monthly: {
          resetDay: 1,
          handleMonthEnd: 'last-day' as const,
          ...(parsed.monthly ?? {}),
        },
      }
    })(),
    approvalExpiration: {
      enabled: false,
      defaultExpirationHours: 72,
      expirationAction: 'expire' as const,
      autoApproveOnQuotaAvailable: false,
      cleanupExpiredDays: 30,
      ...(config.approvalExpiration
        ? parseJsonOr(
            config.approvalExpiration,
            {},
            this.log,
            'config.approvalExpiration',
          )
        : {}),
    },
    newUserDefaultCanSync: Boolean(config.newUserDefaultCanSync ?? true),
    newUserDefaultRequiresApproval: Boolean(
      config.newUserDefaultRequiresApproval ?? false,
    ),
    newUserDefaultMovieQuotaEnabled: Boolean(
      config.newUserDefaultMovieQuotaEnabled ?? false,
    ),
    newUserDefaultMovieQuotaType:
      config.newUserDefaultMovieQuotaType || QUOTA_DEFAULTS.quotaType,
    newUserDefaultMovieQuotaLimit:
      config.newUserDefaultMovieQuotaLimit ?? QUOTA_DEFAULTS.limit,
    newUserDefaultMovieBypassApproval: Boolean(
      config.newUserDefaultMovieBypassApproval ?? false,
    ),
    newUserDefaultMovieWatchlistCap:
      config.newUserDefaultMovieWatchlistCap ?? null,
    newUserDefaultShowQuotaEnabled: Boolean(
      config.newUserDefaultShowQuotaEnabled ?? false,
    ),
    newUserDefaultShowQuotaType:
      config.newUserDefaultShowQuotaType || QUOTA_DEFAULTS.quotaType,
    newUserDefaultShowQuotaLimit:
      config.newUserDefaultShowQuotaLimit ?? QUOTA_DEFAULTS.limit,
    newUserDefaultShowBypassApproval: Boolean(
      config.newUserDefaultShowBypassApproval ?? false,
    ),
    newUserDefaultShowWatchlistCap:
      config.newUserDefaultShowWatchlistCap ?? null,
    selfRss: config.selfRss || undefined,
    friendsRss: config.friendsRss || undefined,
    discordWebhookUrl: config.discordWebhookUrl || undefined,
    discordBotToken: config.discordBotToken || undefined,
    discordClientId: config.discordClientId || undefined,
    baseUrl: config.baseUrl || undefined,
    queueProcessDelaySeconds: config.queueProcessDelaySeconds ?? 60,
    queueWaitTime: config.queueWaitTime ?? QUEUE_WAIT_TIME_MS.default,
    newEpisodeThreshold:
      config.newEpisodeThreshold ?? NEW_EPISODE_THRESHOLD_MS.default,
    notifyOnUpdate: config.notifyOnUpdate || NOTIFY_DEFAULTS.notifyOnUpdate,
    notifyOnAvailability: Boolean(
      config.notifyOnAvailability ?? NOTIFY_DEFAULTS.notifyOnAvailability,
    ),
    pendingWebhookRetryInterval: config.pendingWebhookRetryInterval ?? 20,
    pendingWebhookMaxAge: config.pendingWebhookMaxAge ?? 10,
    pendingWebhookCleanupInterval: config.pendingWebhookCleanupInterval ?? 60,
    enableApprise: Boolean(config.enableApprise),
    appriseUrl: config.appriseUrl || '',
    systemAppriseUrl: config.systemAppriseUrl || undefined,
    appriseEmailSender: config.appriseEmailSender || undefined,
    plexMobileEnabled: Boolean(config.plexMobileEnabled),
    cookieSecured: Boolean(config.cookieSecured),
    skipFriendSync: Boolean(config.skipFriendSync),
    deleteMovie: Boolean(config.deleteMovie),
    deleteEndedShow: Boolean(config.deleteEndedShow),
    deleteContinuingShow: Boolean(config.deleteContinuingShow),
    deleteFiles: Boolean(config.deleteFiles),
    respectUserSyncSetting: Boolean(config.respectUserSyncSetting),
    deleteSyncNotify:
      config.deleteSyncNotify || NOTIFY_DEFAULTS.deleteSyncNotify,
    deleteSyncNotifyOnlyOnDeletion: Boolean(
      config.deleteSyncNotifyOnlyOnDeletion,
    ),
    deleteSyncTrackedOnly: Boolean(config.deleteSyncTrackedOnly ?? false),
    deleteSyncCleanupApprovals: Boolean(
      config.deleteSyncCleanupApprovals ?? false,
    ),
    deleteSyncRequiredTagRegex: config.deleteSyncRequiredTagRegex || '',
    approvalNotify: config.approvalNotify || NOTIFY_DEFAULTS.approvalNotify,
    watchlistCapNotify:
      config.watchlistCapNotify || NOTIFY_DEFAULTS.watchlistCapNotify,
    watchlistCapNotifyUser: Boolean(
      config.watchlistCapNotifyUser ?? NOTIFY_DEFAULTS.watchlistCapNotifyUser,
    ),
    watchlistAddNotify:
      config.watchlistAddNotify || NOTIFY_DEFAULTS.watchlistAddNotify,
    enablePlexPlaylistProtection: Boolean(config.enablePlexPlaylistProtection),
    plexProtectionPlaylistName:
      config.plexProtectionPlaylistName || PLEX_PROTECTION_PLAYLIST_DEFAULT,
    plexServerUrl: config.plexServerUrl || undefined,
    skipIfExistsOnPlex: Boolean(config.skipIfExistsOnPlex ?? false),
    plexExistenceScope:
      config.plexExistenceScope || PLEX_EXISTENCE_SCOPE_DEFAULT,
    plexLabelSync: (() => {
      const parsed = config.plexLabelSync
        ? parseJsonOr<Partial<PlexLabelSyncConfig>>(
            config.plexLabelSync,
            {},
            this.log,
            'config.plexLabelSync',
          )
        : {}
      return {
        ...PLEX_LABEL_SYNC_DEFAULTS,
        ...parsed,
        tagSync: {
          ...PLEX_LABEL_SYNC_DEFAULTS.tagSync,
          ...(parsed.tagSync ?? {}),
        },
      }
    })(),
    tagUsersInSonarr: Boolean(config.tagUsersInSonarr),
    tagUsersInRadarr: Boolean(config.tagUsersInRadarr),
    cleanupOrphanedTags: Boolean(config.cleanupOrphanedTags),
    // TODO: drop the dormant persistHistoricalTags column, replaced by removedTagMode
    tagPrefix: config.tagPrefix || TAG_PREFIX_DEFAULTS.tagPrefix,
    tagNamingSource: config.tagNamingSource || 'username',
    removedTagMode: config.removedTagMode || 'remove',
    removedTagPrefix:
      config.removedTagPrefix || TAG_PREFIX_DEFAULTS.removedTagPrefix,
    deletionMode: config.deletionMode || 'watchlist',
    tmdbRegion: config.tmdbRegion || 'US',
    maintainerrEnabled: Boolean(config.maintainerrEnabled),
    maintainerrUrl: config.maintainerrUrl || '',
    maintainerrExclusionMode:
      config.maintainerrExclusionMode || MAINTAINERR_EXCLUSION_MODE_DEFAULT,
    _isReady: Boolean(config._isReady),
  }
}

/** Throws when a config row already exists, since only row id 1 may exist. */
export async function createConfig(
  this: DatabaseService,
  config: Omit<Config, 'id' | 'created_at' | 'updated_at'>,
): Promise<number> {
  const exists = await this.knex('configs').count('* as c').first()
  if (Number(exists?.c) > 0) {
    throw new Error('Configuration already exists, use updateConfig instead')
  }

  const result = await this.knex('configs')
    .insert({
      id: 1,
      port: config.port,
      dbPath: config.dbPath,
      baseUrl: config.baseUrl,
      cookieSecret: config.cookieSecret,
      webhookSecret: config.webhookSecret,
      maintainerrWebhookSecret: config.maintainerrWebhookSecret,
      cookieName: config.cookieName,
      cookieSecured: config.cookieSecured,
      logLevel: config.logLevel,
      closeGraceDelay: config.closeGraceDelay,
      rateLimitMax: config.rateLimitMax,
      queueProcessDelaySeconds: config.queueProcessDelaySeconds ?? 60,
      queueWaitTime: config.queueWaitTime ?? QUEUE_WAIT_TIME_MS.default,
      newEpisodeThreshold:
        config.newEpisodeThreshold ?? NEW_EPISODE_THRESHOLD_MS.default,
      maintainerrEnabled: config.maintainerrEnabled ?? false,
      maintainerrUrl: config.maintainerrUrl ?? '',
      maintainerrExclusionMode:
        config.maintainerrExclusionMode ?? MAINTAINERR_EXCLUSION_MODE_DEFAULT,
      notifyOnUpdate: config.notifyOnUpdate ?? NOTIFY_DEFAULTS.notifyOnUpdate,
      notifyOnAvailability:
        config.notifyOnAvailability ?? NOTIFY_DEFAULTS.notifyOnAvailability,
      pendingWebhookRetryInterval: config.pendingWebhookRetryInterval ?? 20,
      pendingWebhookMaxAge: config.pendingWebhookMaxAge ?? 10,
      pendingWebhookCleanupInterval: config.pendingWebhookCleanupInterval ?? 60,
      enableApprise: config.enableApprise || false,
      appriseUrl: config.appriseUrl || '',
      systemAppriseUrl: config.systemAppriseUrl || undefined,
      appriseEmailSender: config.appriseEmailSender || undefined,
      plexMobileEnabled: config.plexMobileEnabled || false,
      plexTokens: JSON.stringify(config.plexTokens || []),
      skipFriendSync: config.skipFriendSync,
      deleteMovie: config.deleteMovie,
      deleteEndedShow: config.deleteEndedShow,
      deleteContinuingShow: config.deleteContinuingShow,
      deleteFiles: config.deleteFiles,
      respectUserSyncSetting: config.respectUserSyncSetting,
      deleteSyncNotify:
        config.deleteSyncNotify || NOTIFY_DEFAULTS.deleteSyncNotify,
      deleteSyncNotifyOnlyOnDeletion: config.deleteSyncNotifyOnlyOnDeletion,
      deleteSyncTrackedOnly: config.deleteSyncTrackedOnly ?? false,
      deleteSyncCleanupApprovals: config.deleteSyncCleanupApprovals ?? false,
      deleteSyncRequiredTagRegex: config.deleteSyncRequiredTagRegex || '',
      approvalNotify: config.approvalNotify || NOTIFY_DEFAULTS.approvalNotify,
      watchlistCapNotify:
        config.watchlistCapNotify || NOTIFY_DEFAULTS.watchlistCapNotify,
      watchlistCapNotifyUser:
        config.watchlistCapNotifyUser ?? NOTIFY_DEFAULTS.watchlistCapNotifyUser,
      watchlistAddNotify:
        config.watchlistAddNotify || NOTIFY_DEFAULTS.watchlistAddNotify,
      maxDeletionPrevention:
        config.maxDeletionPrevention ?? MAX_DELETION_PREVENTION.default,
      enablePlexPlaylistProtection:
        config.enablePlexPlaylistProtection || false,
      plexProtectionPlaylistName:
        config.plexProtectionPlaylistName || PLEX_PROTECTION_PLAYLIST_DEFAULT,
      plexServerUrl: config.plexServerUrl,
      skipIfExistsOnPlex: config.skipIfExistsOnPlex ?? false,
      plexExistenceScope:
        config.plexExistenceScope ?? PLEX_EXISTENCE_SCOPE_DEFAULT,
      selfRss: config.selfRss,
      friendsRss: config.friendsRss,
      discordWebhookUrl: config.discordWebhookUrl,
      discordBotToken: config.discordBotToken,
      discordClientId: config.discordClientId,
      tagUsersInSonarr: config.tagUsersInSonarr ?? false,
      tagUsersInRadarr: config.tagUsersInRadarr ?? false,
      cleanupOrphanedTags: config.cleanupOrphanedTags ?? true,
      tagPrefix: config.tagPrefix || TAG_PREFIX_DEFAULTS.tagPrefix,
      tagNamingSource: config.tagNamingSource || 'username',
      removedTagMode: config.removedTagMode || 'remove',
      removedTagPrefix:
        config.removedTagPrefix || TAG_PREFIX_DEFAULTS.removedTagPrefix,
      deletionMode: config.deletionMode || 'watchlist',
      plexLabelSync: config.plexLabelSync
        ? JSON.stringify({
            enabled: config.plexLabelSync.enabled,
            labelPrefix: config.plexLabelSync.labelPrefix,
            labelNamingSource: config.plexLabelSync.labelNamingSource,
            cleanupOrphanedLabels: config.plexLabelSync.cleanupOrphanedLabels,
            removedLabelMode: config.plexLabelSync.removedLabelMode,
            removedLabelPrefix: config.plexLabelSync.removedLabelPrefix,
            autoResetOnScheduledSync:
              config.plexLabelSync.autoResetOnScheduledSync,
            tagSync: config.plexLabelSync.tagSync,
          })
        : null,
      plexSessionMonitoring: config.plexSessionMonitoring
        ? JSON.stringify(config.plexSessionMonitoring)
        : null,
      publicContentNotifications: config.publicContentNotifications
        ? JSON.stringify(config.publicContentNotifications)
        : null,
      quotaSettings: config.quotaSettings
        ? JSON.stringify(config.quotaSettings)
        : null,
      approvalExpiration: config.approvalExpiration
        ? JSON.stringify(config.approvalExpiration)
        : null,
      newUserDefaultCanSync: config.newUserDefaultCanSync ?? true,
      newUserDefaultRequiresApproval:
        config.newUserDefaultRequiresApproval ?? false,
      newUserDefaultMovieQuotaEnabled:
        config.newUserDefaultMovieQuotaEnabled ?? false,
      newUserDefaultMovieQuotaType:
        config.newUserDefaultMovieQuotaType || QUOTA_DEFAULTS.quotaType,
      newUserDefaultMovieQuotaLimit:
        config.newUserDefaultMovieQuotaLimit ?? QUOTA_DEFAULTS.limit,
      newUserDefaultMovieBypassApproval:
        config.newUserDefaultMovieBypassApproval ?? false,
      newUserDefaultMovieWatchlistCap:
        config.newUserDefaultMovieWatchlistCap ?? null,
      newUserDefaultShowQuotaEnabled:
        config.newUserDefaultShowQuotaEnabled ?? false,
      newUserDefaultShowQuotaType:
        config.newUserDefaultShowQuotaType || QUOTA_DEFAULTS.quotaType,
      newUserDefaultShowQuotaLimit:
        config.newUserDefaultShowQuotaLimit ?? QUOTA_DEFAULTS.limit,
      newUserDefaultShowBypassApproval:
        config.newUserDefaultShowBypassApproval ?? false,
      newUserDefaultShowWatchlistCap:
        config.newUserDefaultShowWatchlistCap ?? null,
      tmdbRegion: config.tmdbRegion || 'US',
      _isReady: config._isReady || false,
      created_at: this.timestamp,
      updated_at: this.timestamp,
    })
    .returning('id')

  const id = this.extractId(result)
  this.log.debug(`Config created with ID: ${id}`)
  return id
}

// Secrets and lastNotifiedVersion are left out on purpose so the public config API can never write them
const ALLOWED_COLUMNS = new Set([
  'baseUrl',
  'port',
  '_isReady',

  'dbType',
  'dbPath',
  'dbHost',
  'dbPort',
  'dbName',
  'dbUser',
  'dbPassword',
  'dbConnectionString',

  'cookieSecured',
  'authenticationMethod',
  'allowIframes',

  'maintainerrEnabled',
  'maintainerrUrl',
  'maintainerrExclusionMode',

  'logLevel',
  'closeGraceDelay',
  'rateLimitMax',
  'queueProcessDelaySeconds',

  'discordWebhookUrl',
  'discordBotToken',
  'discordClientId',

  'enableApprise',
  'appriseUrl',
  'systemAppriseUrl',
  'appriseEmailSender',

  'publicContentNotifications',

  'plexMobileEnabled',

  'queueWaitTime',
  'newEpisodeThreshold',
  'notifyOnUpdate',
  'notifyOnAvailability',

  'pendingWebhookRetryInterval',
  'pendingWebhookMaxAge',
  'pendingWebhookCleanupInterval',

  'sonarrBaseUrl',
  'sonarrApiKey',
  'sonarrQualityProfile',
  'sonarrRootFolder',
  'sonarrBypassIgnored',
  'sonarrSeasonMonitoring',
  'sonarrMonitorNewItems',
  'sonarrTags',
  'sonarrCreateSeasonFolders',

  'radarrBaseUrl',
  'radarrApiKey',
  'radarrQualityProfile',
  'radarrRootFolder',
  'radarrBypassIgnored',
  'radarrTags',

  'plexTokens',
  'skipFriendSync',
  'plexServerUrl',
  'skipIfExistsOnPlex',
  'plexExistenceScope',
  'selfRss',
  'friendsRss',

  'deletionMode',
  'deleteMovie',
  'deleteEndedShow',
  'deleteContinuingShow',
  'deleteFiles',
  'respectUserSyncSetting',
  'deleteSyncNotify',
  'deleteSyncNotifyOnlyOnDeletion',
  'deleteSyncTrackedOnly',
  'deleteSyncCleanupApprovals',
  'deleteSyncRequiredTagRegex',
  'approvalNotify',
  'watchlistCapNotify',
  'watchlistCapNotifyUser',
  'watchlistAddNotify',
  'maxDeletionPrevention',
  'enablePlexPlaylistProtection',
  'plexProtectionPlaylistName',

  'tagUsersInSonarr',
  'tagUsersInRadarr',
  'cleanupOrphanedTags',
  'tagPrefix',
  'tagNamingSource',
  'removedTagMode',
  'removedTagPrefix',

  'plexLabelSync',

  'plexSessionMonitoring',

  'quotaSettings',

  'approvalExpiration',

  'newUserDefaultCanSync',
  'newUserDefaultRequiresApproval',
  'newUserDefaultMovieQuotaEnabled',
  'newUserDefaultMovieQuotaType',
  'newUserDefaultMovieQuotaLimit',
  'newUserDefaultMovieBypassApproval',
  'newUserDefaultMovieWatchlistCap',
  'newUserDefaultShowQuotaEnabled',
  'newUserDefaultShowQuotaType',
  'newUserDefaultShowQuotaLimit',
  'newUserDefaultShowBypassApproval',
  'newUserDefaultShowWatchlistCap',

  'tmdbRegion',
])

const JSON_COLUMNS = new Set([
  'publicContentNotifications',
  'plexTokens',
  'plexSessionMonitoring',
  'quotaSettings',
  'approvalExpiration',
  'plexLabelSync',
])

/** Silently drops keys outside ALLOWED_COLUMNS, and returns false only when the row is missing or the query fails. */
export async function updateConfig(
  this: DatabaseService,
  config: Partial<Config>,
): Promise<boolean> {
  try {
    const updateData: Record<string, unknown> = {
      updated_at: this.timestamp,
    }

    for (const [key, value] of Object.entries(config)) {
      if (value !== undefined && ALLOWED_COLUMNS.has(key)) {
        if (JSON_COLUMNS.has(key)) {
          updateData[key] = value !== null ? JSON.stringify(value) : null
        } else {
          updateData[key] = value
        }
      }
    }

    const updated = await this.knex('configs')
      .where({ id: 1 })
      .update(updateData)
    return updated > 0
  } catch (error) {
    this.log.error({ error }, 'Error updating config:')
    return false
  }
}

/** Returns null when no update notification was ever sent, the row is missing, or the read fails. */
export async function getLastNotifiedVersion(
  this: DatabaseService,
): Promise<string | null> {
  try {
    const row = await this.knex('configs')
      .where({ id: 1 })
      .first('lastNotifiedVersion')
    return (row?.lastNotifiedVersion as string | null) ?? null
  } catch (error) {
    this.log.error({ error }, 'Error reading lastNotifiedVersion')
    return null
  }
}

/** Bypasses ALLOWED_COLUMNS on purpose so the public config API cannot set this field. */
export async function setLastNotifiedVersion(
  this: DatabaseService,
  version: string,
): Promise<boolean> {
  try {
    const updated = await this.knex('configs').where({ id: 1 }).update({
      lastNotifiedVersion: version,
      updated_at: this.timestamp,
    })
    return updated > 0
  } catch (error) {
    this.log.error({ error, version }, 'Error setting lastNotifiedVersion')
    return false
  }
}

/** Throws so boot aborts instead of overwriting a stored secret, and each field is null when unset. */
export async function getSecrets(
  this: DatabaseService,
): Promise<Record<SecretColumn, string | null>> {
  const row = await this.knex('configs')
    .where({ id: 1 })
    .first('cookieSecret', 'webhookSecret', 'maintainerrWebhookSecret')
  return {
    cookieSecret: (row?.cookieSecret as string | null) ?? null,
    webhookSecret: (row?.webhookSecret as string | null) ?? null,
    maintainerrWebhookSecret:
      (row?.maintainerrWebhookSecret as string | null) ?? null,
  }
}

/** Bypasses ALLOWED_COLUMNS on purpose and throws when the config row is missing. */
export async function setSecret(
  this: DatabaseService,
  key: SecretColumn,
  value: string,
): Promise<void> {
  const updated = await this.knex('configs')
    .where({ id: 1 })
    .update({ [key]: value, updated_at: this.timestamp })
  if (updated === 0) {
    throw new Error(`Failed to persist ${key}: config row missing`)
  }
}
