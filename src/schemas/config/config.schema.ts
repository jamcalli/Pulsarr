import { PlexLabelSyncConfigSchema } from '@root/schemas/plex/label-sync-config.schema.js'
import {
  RemovedTagPrefixSchema,
  TagPrefixSchema,
} from '@root/schemas/shared/prefix-validation.schema.js'
import { z } from 'zod'

const LogLevelEnum = z.enum([
  'fatal',
  'error',
  'warn',
  'info',
  'debug',
  'trace',
  'silent',
])

const NotifyOptionEnum = z.enum([
  'none', // No notifications
  'all', // All available notification channels
  'discord-only', // Only Discord (both webhook and DM if configured)
  'apprise-only', // Only Apprise
  'webhook-only', // Only Discord webhook (no DMs)
  'dm-only', // Only Discord DMs (no webhook)
  'discord-webhook', // Same as webhook-only for backward compatibility
  'discord-message', // Same as dm-only for backward compatibility
  'discord-both', // Both Discord webhook and DMs but no Apprise
])

// Legacy enum for backward compatibility
const DeleteSyncNotifyOptionEnum = z.enum([
  'none', // No notifications
  'message', // Legacy option for DM
  'webhook', // Legacy option for webhook
  'both', // Legacy option for both webhook and DM
  'all', // All available notification channels
  'discord-only', // Only Discord (both webhook and DM if configured)
  'apprise-only', // Only Apprise
  'webhook-only', // Only Discord webhook (no DMs)
  'dm-only', // Only Discord DMs (no webhook)
  'discord-webhook', // Same as webhook-only for backward compatibility
  'discord-message', // Same as dm-only for backward compatibility
  'discord-both', // Both Discord webhook and DMs but no Apprise
])

const DeletionModeEnum = z.enum([
  'watchlist', // Remove content when it's no longer on any watchlist
  'tag-based', // Only remove content that has a specific tag
])

export const ConfigSchema = z.object({
  port: z.number().optional(),
  dbPath: z.string().optional(),
  cookieSecret: z.string().optional(),
  cookieName: z.string().optional(),
  cookieSecured: z.boolean().optional(),
  logLevel: LogLevelEnum.optional(),
  closeGraceDelay: z.number().optional(),
  rateLimitMax: z.number().optional(),
  syncIntervalSeconds: z.number().optional(),
  queueProcessDelaySeconds: z.number().optional(),
  // Discord Config
  discordWebhookUrl: z.string().optional(),
  discordBotToken: z.string().optional(),
  discordClientId: z.string().optional(),
  discordGuildId: z.string().optional(),
  // Apprise Config
  enableApprise: z.boolean().optional(),
  appriseUrl: z.string().optional(),
  systemAppriseUrl: z.string().optional(),
  // Public Content Notifications - broadcast ALL content availability to public channels/endpoints
  publicContentNotifications: z
    .object({
      enabled: z.boolean(),
      // Discord webhook URLs for public content announcements (comma-separated)
      discordWebhookUrls: z.string().optional(),
      // Movie-specific Discord webhook URLs (comma-separated)
      discordWebhookUrlsMovies: z.string().optional(),
      // Show-specific Discord webhook URLs (comma-separated)
      discordWebhookUrlsShows: z.string().optional(),
      // Apprise URLs for public content announcements (comma-separated)
      appriseUrls: z.string().optional(),
      // Movie-specific Apprise URLs (comma-separated)
      appriseUrlsMovies: z.string().optional(),
      // Show-specific Apprise URLs (comma-separated)
      appriseUrlsShows: z.string().optional(),
    })
    .optional(),
  // Tautulli Config
  tautulliEnabled: z.boolean().optional(),
  tautulliUrl: z.string().optional(),
  tautulliApiKey: z.string().optional(),
  // General Notifications
  queueWaitTime: z.number().optional(),
  newEpisodeThreshold: z.number().optional(),
  upgradeBufferTime: z.number().optional(),
  // Pending Webhooks Config
  // How often to retry processing pending webhooks (in seconds)
  pendingWebhookRetryInterval: z.number().optional(),
  // Maximum age of a pending webhook before it expires (in minutes)
  pendingWebhookMaxAge: z.number().optional(),
  // How often to clean up expired webhooks (in seconds)
  pendingWebhookCleanupInterval: z.number().optional(),
  // Other configs
  plexTokens: z.array(z.string()).optional(),
  skipFriendSync: z.boolean().optional(),
  deleteMovie: z.boolean().optional(),
  deleteEndedShow: z.boolean().optional(),
  deleteContinuingShow: z.boolean().optional(),
  deleteFiles: z.boolean().optional(),
  respectUserSyncSetting: z.boolean().optional(),
  deleteSyncNotify: DeleteSyncNotifyOptionEnum.optional(),
  approvalNotify: NotifyOptionEnum.optional(),
  deleteSyncNotifyOnlyOnDeletion: z.boolean().optional(),
  maxDeletionPrevention: z.number().optional(),
  // Deletion mode
  deletionMode: DeletionModeEnum.optional(),
  removedTagPrefix: RemovedTagPrefixSchema.optional(),
  // Tag removal mode
  removedTagMode: z.enum(['remove', 'keep', 'special-tag']).optional(),
  // Plex Playlist Protection
  enablePlexPlaylistProtection: z.boolean().optional(),
  plexProtectionPlaylistName: z.string().optional(),
  plexServerUrl: z.string().optional(),
  // Plex Label Sync Configuration - nested object following complex config pattern
  plexLabelSync: PlexLabelSyncConfigSchema.optional(),
  // RSS and other settings
  selfRss: z.string().optional(),
  friendsRss: z.string().optional(),
  _isReady: z.boolean().optional(),
  // Plex Session Monitoring
  plexSessionMonitoring: z
    .object({
      enabled: z.boolean(),
      pollingIntervalMinutes: z.number().min(1),
      remainingEpisodes: z.number().min(1),
      filterUsers: z
        .union([z.string(), z.array(z.string())])
        .optional()
        .transform((val) => {
          // Always convert to array
          if (!val) return undefined
          return Array.isArray(val) ? val : [val]
        }),
      // Rolling monitoring reset settings
      enableAutoReset: z.boolean().optional(),
      inactivityResetDays: z.number().min(1).max(365).optional(),
      autoResetIntervalHours: z.number().min(1).max(168).optional(),
      // Progressive cleanup mode - cleans up previous seasons as user progresses
      enableProgressiveCleanup: z.boolean().optional(),
    })
    .optional(),
  // New User Defaults
  newUserDefaultCanSync: z.boolean().optional(),
  newUserDefaultRequiresApproval: z.boolean().optional(),
  newUserDefaultMovieQuotaEnabled: z.boolean().optional(),
  newUserDefaultMovieQuotaType: z
    .enum(['daily', 'weekly_rolling', 'monthly'])
    .optional(),
  newUserDefaultMovieQuotaLimit: z.number().min(1).max(1000).optional(),
  newUserDefaultMovieBypassApproval: z.boolean().optional(),
  newUserDefaultShowQuotaEnabled: z.boolean().optional(),
  newUserDefaultShowQuotaType: z
    .enum(['daily', 'weekly_rolling', 'monthly'])
    .optional(),
  newUserDefaultShowQuotaLimit: z.number().min(1).max(1000).optional(),
  newUserDefaultShowBypassApproval: z.boolean().optional(),
  // Quota System Configuration
  quotaSettings: z
    .object({
      // Cleanup configuration
      cleanup: z
        .object({
          enabled: z.boolean().optional(),
          retentionDays: z.number().min(1).max(365).optional(), // 1 day to 1 year
        })
        .optional(),
      // Weekly rolling quota configuration
      weeklyRolling: z
        .object({
          resetDays: z.number().min(1).max(365).optional(), // 1 day to 1 year
        })
        .optional(),
      // Monthly quota configuration
      monthly: z
        .object({
          resetDay: z.number().min(1).max(31).optional(), // 1st to 31st
          handleMonthEnd: z
            .enum(['last-day', 'skip-month', 'next-month'])
            .optional(),
        })
        .optional(),
    })
    .optional(),
  // Approval System Configuration
  approvalExpiration: z
    .object({
      enabled: z.boolean().optional(),
      // Default expiration time in hours for approval requests
      defaultExpirationHours: z.number().min(1).max(8760).optional(), // 1 hour to 1 year
      // What happens when approvals expire
      expirationAction: z.enum(['expire', 'auto_approve']).optional(),
      // Per-trigger expiration overrides
      quotaExceededExpirationHours: z.number().min(1).max(8760).optional(),
      routerRuleExpirationHours: z.number().min(1).max(8760).optional(),
      manualFlagExpirationHours: z.number().min(1).max(8760).optional(),
      contentCriteriaExpirationHours: z.number().min(1).max(8760).optional(),
      // Maintenance settings
      cleanupExpiredDays: z.number().min(1).max(365).optional(),
    })
    .optional(),
  // TMDB Configuration
  tmdbRegion: z
    .string()
    .length(2, 'Region must be a 2-letter country code')
    .optional(),
  // User Tags Configuration - flat properties following new pattern
  tagUsersInSonarr: z.boolean().optional(),
  tagUsersInRadarr: z.boolean().optional(),
  cleanupOrphanedTags: z.boolean().optional(),
  tagPrefix: TagPrefixSchema.optional(),
  // Note: removedTagMode and removedTagPrefix already exist above for delete sync compatibility
})

export const ConfigResponseSchema = z.object({
  success: z.boolean(),
  config: ConfigSchema,
})

export const ConfigErrorSchema = z.object({
  error: z.string(),
})

export type Config = z.infer<typeof ConfigSchema>
export type ConfigResponse = z.infer<typeof ConfigResponseSchema>
export type ConfigError = z.infer<typeof ConfigErrorSchema>
