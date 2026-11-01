import type { Knex } from 'knex'

export const SEED_CONFIG_SETTINGS = {
  port: 3004,
  baseUrl: 'http://localhost:3004',
  cookieSecret: 'test_cookie_secret_for_testing_only',
  logLevel: 'silent',
  queueWaitTime: 120000,
  newEpisodeThreshold: 172800000,
  enableApprise: false,
  appriseUrl: '',
  plexMobileEnabled: false,
  plexTokens: ['test_plex_token_1234567890'],
  skipFriendSync: false,
  plexServerUrl: '',
  enablePlexPlaylistProtection: false,
  plexProtectionPlaylistName: 'Do Not Delete',
  plexSessionMonitoring: {
    enabled: false,
    filterUsers: [],
    enableAutoReset: false,
    remainingEpisodes: 2,
    inactivityResetDays: 7,
    autoResetIntervalHours: 24,
    pollingIntervalMinutes: 15,
    enableProgressiveCleanup: false,
  },
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
  tagPrefix: 'pulsarr:user',
  removedTagMode: 'remove',
  removedTagPrefix: 'pulsarr:removed',
  deletionMode: 'watchlist',
  pendingWebhookRetryInterval: 20,
  pendingWebhookMaxAge: 10,
  pendingWebhookCleanupInterval: 60,
  newUserDefaultCanSync: true,
  _isReady: true,
  publicContentNotifications: {
    enabled: false,
    discordWebhookUrls: '',
    discordWebhookUrlsMovies: '',
    discordWebhookUrlsShows: '',
    appriseUrls: '',
    appriseUrlsMovies: '',
    appriseUrlsShows: '',
  },
  quotaSettings: {
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
  },
  approvalExpiration: {
    enabled: false,
    defaultExpirationHours: 72,
    expirationAction: 'expire',
    cleanupExpiredDays: 30,
  },
  approvalNotify: 'none',
  notifyOnUpdate: 'none',
  notifyOnAvailability: true,
  watchlistAddNotify: 'all',
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
  plexLabelSync: {
    enabled: false,
    labelPrefix: 'pulsarr',
    labelNamingSource: 'username',
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
  },
  deleteSyncTrackedOnly: false,
  deleteSyncCleanupApprovals: false,
}

export const SEED_CONFIGS = [
  {
    id: 1,
    settings: JSON.stringify(SEED_CONFIG_SETTINGS),
  },
]

export async function seedConfig(knex: Knex): Promise<void> {
  await knex('configs').insert(SEED_CONFIGS)

  const maxId = Math.max(...SEED_CONFIGS.map((c) => c.id))
  await knex.raw(
    `INSERT OR REPLACE INTO sqlite_sequence (name, seq) VALUES ('configs', ?)`,
    [maxId],
  )
}
