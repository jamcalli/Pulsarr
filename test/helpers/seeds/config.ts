import type { Knex } from 'knex'

/**
 * Seed data for configs table
 * Minimal configuration needed for tests to run
 *
 * Schema reference:
 * - id: integer (primary key)
 * - port: integer
 * - dbPath: string
 * - baseUrl: string
 * - cookieSecret: string
 * - cookieName: string
 * - cookieSecured: boolean
 * - logLevel: enum
 * - closeGraceDelay: integer
 * - rateLimitMax: integer
 * - queueProcessDelaySeconds: integer (default: 60)
 * - discordWebhookUrl: string
 * - discordBotToken: string
 * - discordClientId: string
 * - queueWaitTime: integer (default: 120000)
 * - newEpisodeThreshold: integer (default: 172800000)
 * - upgradeBufferTime: integer (default: 2000)
 * - enableApprise: boolean (default: false)
 * - appriseUrl: string (default: '')
 * - systemAppriseUrl: string
 * - tautulliEnabled: boolean (default: false)
 * - tautulliUrl: string
 * - tautulliApiKey: string
 * - plexTokens: jsonb
 * - skipFriendSync: boolean
 * - plexServerUrl: string (default: 'http://localhost:32400')
 * - enablePlexPlaylistProtection: boolean (default: false)
 * - plexProtectionPlaylistName: string (default: 'Do Not Delete')
 * - plexSessionMonitoring: jsonb
 * - deleteMovie: boolean
 * - deleteEndedShow: boolean
 * - deleteContinuingShow: boolean
 * - deleteFiles: boolean
 * - respectUserSyncSetting: boolean (default: true)
 * - deleteSyncNotify: enum (default: 'none')
 * - deleteSyncNotifyOnlyOnDeletion: boolean (default: false)
 * - maxDeletionPrevention: integer (default: 10)
 * - tagUsersInSonarr: boolean (default: false)
 * - tagUsersInRadarr: boolean (default: false)
 * - cleanupOrphanedTags: boolean (default: true)
 * - persistHistoricalTags: boolean (default: false)
 * - tagPrefix: string (default: 'pulsarr:user')
 * - removedTagMode: enum (default: 'remove')
 * - removedTagPrefix: string (default: 'pulsarr:removed')
 * - deletionMode: enum (default: 'watchlist')
 * - pendingWebhookRetryInterval: integer (default: 20)
 * - pendingWebhookMaxAge: integer (default: 10)
 * - pendingWebhookCleanupInterval: integer (default: 60)
 * - newUserDefaultCanSync: boolean (default: true)
 * - selfRss: string
 * - friendsRss: string
 * - _isReady: boolean (default: false)
 * - created_at: timestamp
 * - updated_at: timestamp
 * - publicContentNotifications: json
 * - quotaSettings: json
 * - approvalExpiration: json
 * - approvalNotify: text (default: 'none')
 * - newUserDefaultRequiresApproval: boolean (default: false)
 * - newUserDefaultMovieQuotaEnabled: boolean (default: false)
 * - newUserDefaultMovieQuotaType: string (default: 'monthly')
 * - newUserDefaultMovieQuotaLimit: integer (default: 10)
 * - newUserDefaultMovieBypassApproval: boolean (default: false)
 * - newUserDefaultShowQuotaEnabled: boolean (default: false)
 * - newUserDefaultShowQuotaType: string (default: 'monthly')
 * - newUserDefaultShowQuotaLimit: integer (default: 10)
 * - newUserDefaultShowBypassApproval: boolean (default: false)
 * - tmdbRegion: string (default: 'US')
 * - plexLabelSync: json
 * - deleteSyncTrackedOnly: boolean (default: false)
 * - deleteSyncCleanupApprovals: boolean (default: false)
 */
export const SEED_CONFIGS = [
  {
    id: 1,
    port: 3004,
    dbPath: './.test-db.sqlite',
    baseUrl: 'http://localhost:3004',
    cookieSecret: 'test_cookie_secret_for_testing_only',
    cookieName: 'pulsarr-test',
    cookieSecured: false,
    logLevel: 'silent',
    closeGraceDelay: 10000,
    rateLimitMax: 500,
    queueProcessDelaySeconds: 60,
    discordWebhookUrl: null,
    discordBotToken: null,
    discordClientId: null,
    queueWaitTime: 120000,
    newEpisodeThreshold: 172800000,
    upgradeBufferTime: 2000,
    enableApprise: false,
    appriseUrl: '',
    systemAppriseUrl: null,
    tautulliEnabled: false,
    tautulliUrl: null,
    tautulliApiKey: null,
    // For SQLite compatibility: JSON must be stringified
    plexTokens: JSON.stringify(['test_plex_token_1234567890']),
    skipFriendSync: false,
    plexServerUrl: 'http://localhost:32400',
    enablePlexPlaylistProtection: false,
    plexProtectionPlaylistName: 'Do Not Delete',
    plexSessionMonitoring: JSON.stringify({
      enabled: false,
      filterUsers: [],
      enableAutoReset: false,
      remainingEpisodes: 2,
      inactivityResetDays: 7,
      autoResetIntervalHours: 24,
      pollingIntervalMinutes: 15,
      enableProgressiveCleanup: false,
    }),
    deleteMovie: false,
    deleteEndedShow: false,
    deleteContinuingShow: false,
    deleteFiles: false,
    respectUserSyncSetting: true,
    deleteSyncNotify: 'none',
    deleteSyncNotifyOnlyOnDeletion: false,
    maxDeletionPrevention: 10,
    tagUsersInSonarr: false,
    tagUsersInRadarr: false,
    cleanupOrphanedTags: true,
    persistHistoricalTags: false,
    tagPrefix: 'pulsarr:user',
    removedTagMode: 'remove',
    removedTagPrefix: 'pulsarr:removed',
    deletionMode: 'watchlist',
    pendingWebhookRetryInterval: 20,
    pendingWebhookMaxAge: 10,
    pendingWebhookCleanupInterval: 60,
    newUserDefaultCanSync: true,
    selfRss: null,
    friendsRss: null,
    _isReady: true,
    publicContentNotifications: JSON.stringify({
      enabled: false,
      discordWebhookUrls: '',
      discordWebhookUrlsMovies: '',
      discordWebhookUrlsShows: '',
      appriseUrls: '',
      appriseUrlsMovies: '',
      appriseUrlsShows: '',
    }),
    quotaSettings: JSON.stringify({
      cleanup: {
        enabled: false,
        retentionDays: 90,
      },
      weeklyRolling: {
        resetDays: 7,
      },
      monthly: {
        resetDay: 1,
        handleMonthEnd: 'last-day',
      },
    }),
    approvalExpiration: JSON.stringify({
      enabled: false,
      defaultExpirationHours: 72,
      expirationAction: 'expire',
      cleanupExpiredDays: 30,
    }),
    approvalNotify: 'none',
    newUserDefaultRequiresApproval: false,
    newUserDefaultMovieQuotaEnabled: false,
    newUserDefaultMovieQuotaType: 'monthly',
    newUserDefaultMovieQuotaLimit: 10,
    newUserDefaultMovieBypassApproval: false,
    newUserDefaultShowQuotaEnabled: false,
    newUserDefaultShowQuotaType: 'monthly',
    newUserDefaultShowQuotaLimit: 10,
    newUserDefaultShowBypassApproval: false,
    tmdbRegion: 'US',
    plexLabelSync: JSON.stringify({
      enabled: false,
      labelPrefix: 'pulsarr',
      concurrencyLimit: 5,
      cleanupOrphanedLabels: false,
      removedLabelMode: 'keep',
      removedLabelPrefix: 'pulsarr:removed',
      autoResetOnScheduledSync: false,
      scheduleTime: null,
      dayOfWeek: '*',
      tagSync: {
        enabled: false,
        syncRadarrTags: false,
        syncSonarrTags: false,
      },
    }),
    deleteSyncTrackedOnly: false,
    deleteSyncCleanupApprovals: false,
  },
]

/**
 * Seeds the configs table
 */
export async function seedConfig(knex: Knex): Promise<void> {
  await knex('configs').insert(SEED_CONFIGS)

  // Update sqlite_sequence for configs
  const maxId = Math.max(...SEED_CONFIGS.map((c) => c.id))
  await knex.raw(
    `INSERT OR REPLACE INTO sqlite_sequence (name, seq) VALUES ('configs', ?)`,
    [maxId],
  )
}
