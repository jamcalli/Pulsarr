import type { DatabaseService } from '@services/database.service.js'
import type { Config } from '@root/types/config.types.js'

/**
 * Retrieves and normalizes the application configuration from the database.
 *
 * Fetches the configuration record with `id: 1` from the `configs` table. Safely parses all JSON fields with fallback defaults, normalizes optional and boolean fields, and applies default values for missing properties, including the `tmdbRegion` (defaulting to `'US'`). Returns a fully constructed `Config` object if found, or `undefined` if no configuration exists.
 *
 * @returns The normalized application configuration object if found, otherwise `undefined`.
 */
export async function getConfig(
  this: DatabaseService,
): Promise<Config | undefined> {
  const config = await this.knex('configs').where({ id: 1 }).first()
  if (!config) return undefined

  return {
    ...config,
    // Parse JSON fields with error handling
    plexTokens: this.safeJsonParse<string[]>(
      config.plexTokens,
      [],
      'config.plexTokens',
    ),
    plexSessionMonitoring: config.plexSessionMonitoring
      ? this.safeJsonParse(
          config.plexSessionMonitoring,
          {
            enabled: false,
            pollingIntervalMinutes: 15,
            remainingEpisodes: 2,
            filterUsers: [],
            enableAutoReset: true,
            inactivityResetDays: 7,
            autoResetIntervalHours: 24,
            enableProgressiveCleanup: false,
          },
          'config.plexSessionMonitoring',
        )
      : undefined,
    publicContentNotifications: config.publicContentNotifications
      ? this.safeJsonParse(
          config.publicContentNotifications,
          {
            enabled: false,
            discordWebhookUrls: '',
            discordWebhookUrlsMovies: '',
            discordWebhookUrlsShows: '',
            appriseUrls: '',
            appriseUrlsMovies: '',
            appriseUrlsShows: '',
          },
          'config.publicContentNotifications',
        )
      : {
          enabled: false,
          discordWebhookUrls: '',
          discordWebhookUrlsMovies: '',
          discordWebhookUrlsShows: '',
          appriseUrls: '',
          appriseUrlsMovies: '',
          appriseUrlsShows: '',
        },
    quotaSettings: config.quotaSettings
      ? this.safeJsonParse(
          config.quotaSettings,
          {
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
          },
          'config.quotaSettings',
        )
      : {
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
        },
    approvalExpiration: config.approvalExpiration
      ? this.safeJsonParse(
          config.approvalExpiration,
          {
            enabled: false,
            defaultExpirationHours: 72,
            expirationAction: 'expire' as const,
            maintenanceCronExpression: '0 */4 * * *',
            cleanupExpiredDays: 30,
          },
          'config.approvalExpiration',
        )
      : {
          enabled: false,
          defaultExpirationHours: 72,
          expirationAction: 'expire' as const,
          maintenanceCronExpression: '0 */4 * * *',
          cleanupExpiredDays: 30,
        },
    newUserDefaultCanSync: Boolean(config.newUserDefaultCanSync ?? true),
    newUserDefaultRequiresApproval: Boolean(
      config.newUserDefaultRequiresApproval ?? false,
    ),
    newUserDefaultMovieQuotaEnabled: Boolean(
      config.newUserDefaultMovieQuotaEnabled ?? false,
    ),
    newUserDefaultMovieQuotaType:
      config.newUserDefaultMovieQuotaType || 'monthly',
    newUserDefaultMovieQuotaLimit: config.newUserDefaultMovieQuotaLimit ?? 10,
    newUserDefaultMovieBypassApproval: Boolean(
      config.newUserDefaultMovieBypassApproval ?? false,
    ),
    newUserDefaultShowQuotaEnabled: Boolean(
      config.newUserDefaultShowQuotaEnabled ?? false,
    ),
    newUserDefaultShowQuotaType:
      config.newUserDefaultShowQuotaType || 'monthly',
    newUserDefaultShowQuotaLimit: config.newUserDefaultShowQuotaLimit ?? 10,
    newUserDefaultShowBypassApproval: Boolean(
      config.newUserDefaultShowBypassApproval ?? false,
    ),
    // Handle optional RSS fields
    selfRss: config.selfRss || undefined,
    friendsRss: config.friendsRss || undefined,
    // Handle optional Discord fields
    discordWebhookUrl: config.discordWebhookUrl || undefined,
    discordBotToken: config.discordBotToken || undefined,
    discordClientId: config.discordClientId || undefined,
    discordGuildId: config.discordGuildId || undefined,
    // Handle app configuration
    baseUrl: config.baseUrl || undefined,
    // Handle timing defaults
    syncIntervalSeconds: config.syncIntervalSeconds ?? 10,
    queueProcessDelaySeconds: config.queueProcessDelaySeconds ?? 60,
    // Handle notification timing defaults
    queueWaitTime: config.queueWaitTime ?? 120000,
    newEpisodeThreshold: config.newEpisodeThreshold ?? 172800000,
    upgradeBufferTime: config.upgradeBufferTime ?? 2000,
    // Handle pending webhook configuration
    pendingWebhookRetryInterval: config.pendingWebhookRetryInterval ?? 20,
    pendingWebhookMaxAge: config.pendingWebhookMaxAge ?? 10,
    pendingWebhookCleanupInterval: config.pendingWebhookCleanupInterval ?? 60,
    // Handle Apprise configuration
    enableApprise: Boolean(config.enableApprise),
    appriseUrl: config.appriseUrl || '',
    systemAppriseUrl: config.systemAppriseUrl || undefined,
    // Handle Tautulli configuration
    tautulliEnabled: Boolean(config.tautulliEnabled),
    tautulliUrl: config.tautulliUrl || '',
    tautulliApiKey: config.tautulliApiKey || '',
    // Convert boolean fields
    cookieSecured: Boolean(config.cookieSecured),
    skipFriendSync: Boolean(config.skipFriendSync),
    deleteMovie: Boolean(config.deleteMovie),
    deleteEndedShow: Boolean(config.deleteEndedShow),
    deleteContinuingShow: Boolean(config.deleteContinuingShow),
    deleteFiles: Boolean(config.deleteFiles),
    respectUserSyncSetting: Boolean(config.respectUserSyncSetting),
    deleteSyncNotifyOnlyOnDeletion: Boolean(
      config.deleteSyncNotifyOnlyOnDeletion,
    ),
    approvalNotify: config.approvalNotify || 'none',
    // Plex playlist protection
    enablePlexPlaylistProtection: Boolean(config.enablePlexPlaylistProtection),
    plexProtectionPlaylistName:
      config.plexProtectionPlaylistName || 'Do Not Delete',
    plexServerUrl: config.plexServerUrl || undefined,
    // Plex Label Sync configuration - nested object following complex config pattern
    plexLabelSync: config.plexLabelSync
      ? this.safeJsonParse(
          config.plexLabelSync,
          {
            enabled: false,
            labelFormat: 'pulsarr:{username}',
            concurrencyLimit: 5,
            removedLabelMode: 'remove' as const,
            removedLabelPrefix: 'pulsarr:removed',
          },
          'config.plexLabelSync',
        )
      : {
          enabled: false,
          labelFormat: 'pulsarr:{username}',
          concurrencyLimit: 5,
          removedLabelMode: 'remove' as const,
          removedLabelPrefix: 'pulsarr:removed',
        },
    // Tag configuration
    tagUsersInSonarr: Boolean(config.tagUsersInSonarr),
    tagUsersInRadarr: Boolean(config.tagUsersInRadarr),
    cleanupOrphanedTags: Boolean(config.cleanupOrphanedTags),
    tagPrefix: config.tagPrefix || 'pulsarr:user',
    removedTagMode: config.removedTagMode || 'remove',
    removedTagPrefix: config.removedTagPrefix || 'pulsarr:removed',
    deletionMode: config.deletionMode || 'watchlist',
    // TMDB configuration
    tmdbRegion: config.tmdbRegion || 'US',
    _isReady: Boolean(config._isReady),
  }
}

/**
 * Inserts a new configuration record into the database, enforcing that only one configuration entry exists.
 *
 * Throws an error if a configuration already exists. Serializes JSON fields and applies default values for optional properties, including TMDB region and new user defaults. Returns the ID of the newly created configuration.
 *
 * @param config - The configuration data to insert, excluding `id`, `created_at`, and `updated_at`
 * @returns The ID of the newly created configuration
 */
export async function createConfig(
  this: DatabaseService,
  config: Omit<Config, 'id' | 'created_at' | 'updated_at'>,
): Promise<number> {
  const exists = await this.knex('configs').count('* as c').first()
  if (Number(exists?.c) > 0) {
    throw new Error('Configuration already exists – use updateConfig instead')
  }

  const result = await this.knex('configs')
    .insert({
      // Enforce single config row with id: 1
      id: 1,
      // Basic fields
      port: config.port,
      dbPath: config.dbPath,
      baseUrl: config.baseUrl,
      cookieSecret: config.cookieSecret,
      cookieName: config.cookieName,
      cookieSecured: config.cookieSecured,
      logLevel: config.logLevel,
      closeGraceDelay: config.closeGraceDelay,
      rateLimitMax: config.rateLimitMax,
      // Timing fields
      syncIntervalSeconds: config.syncIntervalSeconds ?? 10,
      queueProcessDelaySeconds: config.queueProcessDelaySeconds ?? 60,
      // Notification timing fields
      queueWaitTime: config.queueWaitTime ?? 120000,
      newEpisodeThreshold: config.newEpisodeThreshold ?? 172800000,
      upgradeBufferTime: config.upgradeBufferTime ?? 2000,
      // Pending webhook configuration
      pendingWebhookRetryInterval: config.pendingWebhookRetryInterval ?? 20,
      pendingWebhookMaxAge: config.pendingWebhookMaxAge ?? 10,
      pendingWebhookCleanupInterval: config.pendingWebhookCleanupInterval ?? 60,
      // Apprise fields
      enableApprise: config.enableApprise || false,
      appriseUrl: config.appriseUrl || '',
      systemAppriseUrl: config.systemAppriseUrl || undefined,
      // Tautulli fields
      tautulliEnabled: config.tautulliEnabled || false,
      tautulliUrl: config.tautulliUrl || '',
      tautulliApiKey: config.tautulliApiKey || '',
      // Plex fields
      plexTokens: JSON.stringify(config.plexTokens || []),
      skipFriendSync: config.skipFriendSync,
      // Delete fields
      deleteMovie: config.deleteMovie,
      deleteEndedShow: config.deleteEndedShow,
      deleteContinuingShow: config.deleteContinuingShow,
      deleteFiles: config.deleteFiles,
      respectUserSyncSetting: config.respectUserSyncSetting,
      deleteSyncNotify: config.deleteSyncNotify,
      deleteSyncNotifyOnlyOnDeletion: config.deleteSyncNotifyOnlyOnDeletion,
      approvalNotify: config.approvalNotify || 'none',
      maxDeletionPrevention: config.maxDeletionPrevention ?? 10,
      // Plex playlist protection
      enablePlexPlaylistProtection:
        config.enablePlexPlaylistProtection || false,
      plexProtectionPlaylistName:
        config.plexProtectionPlaylistName || 'Do Not Delete',
      plexServerUrl: config.plexServerUrl,
      // RSS fields
      selfRss: config.selfRss,
      friendsRss: config.friendsRss,
      // Discord fields
      discordWebhookUrl: config.discordWebhookUrl,
      discordBotToken: config.discordBotToken,
      discordClientId: config.discordClientId,
      discordGuildId: config.discordGuildId,
      // User Tagging fields
      tagUsersInSonarr: config.tagUsersInSonarr ?? false,
      tagUsersInRadarr: config.tagUsersInRadarr ?? false,
      cleanupOrphanedTags: config.cleanupOrphanedTags ?? true,
      tagPrefix: config.tagPrefix || 'pulsarr:user',
      removedTagMode: config.removedTagMode || 'remove',
      removedTagPrefix: config.removedTagPrefix || 'pulsarr:removed',
      deletionMode: config.deletionMode || 'watchlist',
      // Plex Label Sync Configuration - only include actual schema fields
      plexLabelSync: config.plexLabelSync
        ? JSON.stringify({
            enabled: config.plexLabelSync.enabled ?? false,
            labelFormat:
              config.plexLabelSync.labelFormat || 'pulsarr:{username}',
            concurrencyLimit: config.plexLabelSync.concurrencyLimit ?? 5,
            removedLabelMode: config.plexLabelSync.removedLabelMode || 'remove',
            removedLabelPrefix:
              config.plexLabelSync.removedLabelPrefix || 'pulsarr:removed',
          })
        : null,
      // Plex Session Monitoring
      plexSessionMonitoring: config.plexSessionMonitoring
        ? JSON.stringify(config.plexSessionMonitoring)
        : null,
      // Public Content Notifications
      publicContentNotifications: config.publicContentNotifications
        ? JSON.stringify(config.publicContentNotifications)
        : null,
      // Quota Settings
      quotaSettings: config.quotaSettings
        ? JSON.stringify(config.quotaSettings)
        : null,
      // Approval Expiration
      approvalExpiration: config.approvalExpiration
        ? JSON.stringify(config.approvalExpiration)
        : null,
      // New User Defaults
      newUserDefaultCanSync: config.newUserDefaultCanSync ?? true,
      newUserDefaultRequiresApproval:
        config.newUserDefaultRequiresApproval ?? false,
      newUserDefaultMovieQuotaEnabled:
        config.newUserDefaultMovieQuotaEnabled ?? false,
      newUserDefaultMovieQuotaType:
        config.newUserDefaultMovieQuotaType || 'monthly',
      newUserDefaultMovieQuotaLimit: config.newUserDefaultMovieQuotaLimit ?? 10,
      newUserDefaultMovieBypassApproval:
        config.newUserDefaultMovieBypassApproval ?? false,
      newUserDefaultShowQuotaEnabled:
        config.newUserDefaultShowQuotaEnabled ?? false,
      newUserDefaultShowQuotaType:
        config.newUserDefaultShowQuotaType || 'monthly',
      newUserDefaultShowQuotaLimit: config.newUserDefaultShowQuotaLimit ?? 10,
      newUserDefaultShowBypassApproval:
        config.newUserDefaultShowBypassApproval ?? false,
      // TMDB configuration
      tmdbRegion: config.tmdbRegion || 'US',
      // Ready state
      _isReady: config._isReady || false,
      // Timestamps
      created_at: this.timestamp,
      updated_at: this.timestamp,
    })
    .returning('id')

  const id = this.extractId(result)
  this.log.info(`Config created with ID: ${id}`)
  return id
}

// Define allowed mutable columns to prevent accidental database corruption
const ALLOWED_COLUMNS = new Set([
  // Core system configuration
  'baseUrl',
  'port',
  '_isReady',

  // Database configuration
  'dbType',
  'dbPath',
  'dbHost',
  'dbPort',
  'dbName',
  'dbUser',
  'dbPassword',
  'dbConnectionString',

  // Security & authentication
  'cookieSecret',
  'cookieName',
  'cookieSecured',
  'authenticationMethod',
  'allowIframes',

  // Logging & performance
  'logLevel',
  'closeGraceDelay',
  'rateLimitMax',
  'syncIntervalSeconds',
  'queueProcessDelaySeconds',

  // Discord integration
  'discordWebhookUrl',
  'discordBotToken',
  'discordClientId',
  'discordGuildId',

  // Apprise notifications
  'enableApprise',
  'appriseUrl',
  'systemAppriseUrl',

  // Public content notifications (JSON column)
  'publicContentNotifications',

  // Tautulli integration
  'tautulliEnabled',
  'tautulliUrl',
  'tautulliApiKey',

  // Notification timing
  'queueWaitTime',
  'newEpisodeThreshold',
  'upgradeBufferTime',

  // Pending webhooks
  'pendingWebhookRetryInterval',
  'pendingWebhookMaxAge',
  'pendingWebhookCleanupInterval',

  // Sonarr configuration
  'sonarrBaseUrl',
  'sonarrApiKey',
  'sonarrQualityProfile',
  'sonarrRootFolder',
  'sonarrBypassIgnored',
  'sonarrSeasonMonitoring',
  'sonarrMonitorNewItems',
  'sonarrTags',
  'sonarrCreateSeasonFolders',

  // Radarr configuration
  'radarrBaseUrl',
  'radarrApiKey',
  'radarrQualityProfile',
  'radarrRootFolder',
  'radarrBypassIgnored',
  'radarrTags',

  // Plex configuration
  'plexTokens', // JSON column
  'skipFriendSync',
  'plexServerUrl',
  'selfRss',
  'friendsRss',

  // Content deletion settings
  'deletionMode',
  'deleteMovie',
  'deleteEndedShow',
  'deleteContinuingShow',
  'deleteFiles',
  'respectUserSyncSetting',
  'deleteSyncNotify',
  'deleteSyncNotifyOnlyOnDeletion',
  'approvalNotify',
  'maxDeletionPrevention',
  'enablePlexPlaylistProtection',
  'plexProtectionPlaylistName',

  // Tagging configuration
  'tagUsersInSonarr',
  'tagUsersInRadarr',
  'cleanupOrphanedTags',
  'tagPrefix',
  'removedTagMode',
  'removedTagPrefix',

  // Plex label sync configuration (JSON column)
  'plexLabelSync',

  // Plex session monitoring (JSON column)
  'plexSessionMonitoring',

  // Quota settings (JSON column)
  'quotaSettings',

  // Approval expiration (JSON column)
  'approvalExpiration',

  // New user defaults
  'newUserDefaultCanSync',
  'newUserDefaultRequiresApproval',
  'newUserDefaultMovieQuotaEnabled',
  'newUserDefaultMovieQuotaType',
  'newUserDefaultMovieQuotaLimit',
  'newUserDefaultMovieBypassApproval',
  'newUserDefaultShowQuotaEnabled',
  'newUserDefaultShowQuotaType',
  'newUserDefaultShowQuotaLimit',
  'newUserDefaultShowBypassApproval',

  // TMDB configuration
  'tmdbRegion',
])

// JSON columns that need special serialization handling
const JSON_COLUMNS = new Set([
  'publicContentNotifications',
  'plexTokens',
  'plexSessionMonitoring',
  'quotaSettings',
  'approvalExpiration',
  'plexLabelSync',
])

/**
 * Updates the application configuration with the provided partial data.
 *
 * Only fields included in the allowed columns set are updated. JSON fields are automatically serialized. Returns `true` if the configuration was successfully updated, or `false` if no changes were made or an error occurred.
 *
 * @param config - Partial configuration data to update
 * @returns `true` if the configuration was updated, `false` otherwise
 */
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
          updateData[key] =
            value !== undefined && value !== null ? JSON.stringify(value) : null
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
    this.log.error('Error updating config:', error)
    return false
  }
}
