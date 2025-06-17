import type { DatabaseService } from '@services/database.service.js'
import type { Config } from '@root/types/config.types.js'

/**
 * Retrieves application configuration
 *
 * @returns Promise resolving to the configuration if found, undefined otherwise
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
    newUserDefaultCanSync: Boolean(config.newUserDefaultCanSync ?? true),
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
    // Plex playlist protection
    enablePlexPlaylistProtection: Boolean(config.enablePlexPlaylistProtection),
    plexProtectionPlaylistName:
      config.plexProtectionPlaylistName || 'Do Not Delete',
    plexServerUrl: config.plexServerUrl || undefined,
    // Tag configuration
    tagUsersInSonarr: Boolean(config.tagUsersInSonarr),
    tagUsersInRadarr: Boolean(config.tagUsersInRadarr),
    cleanupOrphanedTags: Boolean(config.cleanupOrphanedTags),
    tagPrefix: config.tagPrefix || 'pulsarr:user',
    removedTagMode: config.removedTagMode || 'remove',
    removedTagPrefix: config.removedTagPrefix || 'pulsarr:removed',
    deletionMode: config.deletionMode || 'watchlist',
    _isReady: Boolean(config._isReady),
  }
}

/**
 * Creates a new configuration entry in the database
 *
 * @param config - Configuration data excluding id and timestamps
 * @returns Promise resolving to the ID of the created configuration
 */
export async function createConfig(
  this: DatabaseService,
  config: Omit<Config, 'id' | 'created_at' | 'updated_at'>,
): Promise<number> {
  const result = await this.knex('configs')
    .insert({
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
      // Plex Session Monitoring
      plexSessionMonitoring: config.plexSessionMonitoring
        ? JSON.stringify(config.plexSessionMonitoring)
        : null,
      // Public Content Notifications
      publicContentNotifications: config.publicContentNotifications
        ? JSON.stringify(config.publicContentNotifications)
        : null,
      // New User Defaults
      newUserDefaultCanSync: config.newUserDefaultCanSync ?? true,
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

  // Plex session monitoring (JSON column)
  'plexSessionMonitoring',

  // New user defaults
  'newUserDefaultCanSync',
])

// JSON columns that need special serialization handling
const JSON_COLUMNS = new Set([
  'publicContentNotifications',
  'plexTokens',
  'plexSessionMonitoring',
])

/**
 * Updates the configuration entry
 *
 * @param config - Partial configuration data to update
 * @returns Promise resolving to true if the configuration was updated, false otherwise
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
