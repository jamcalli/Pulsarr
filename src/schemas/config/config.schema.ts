import { ErrorSchema } from '@root/schemas/common/error.schema.js'
import { PlexLabelSyncConfigSchema } from '@root/schemas/plex/label-sync-config.schema.js'
import {
  RemovedTagPrefixSchema,
  TagPrefixSchema,
} from '@root/schemas/shared/prefix-validation.schema.js'
import { DISCORD_WEBHOOK_HOSTS } from '@root/types/discord.types.js'
import safeRegex from 'safe-regex2'
import { z } from 'zod'

// Max constants for validation
const QUEUE_WAIT_TIME_MAX_MS = 30 * 60 * 1000
const NEW_EPISODE_THRESHOLD_MAX_MS = 720 * 60 * 60 * 1000
const UPGRADE_BUFFER_TIME_MAX_MS = 10 * 1000

/**
 * Validates Discord webhook URL format (comma-separated).
 * Accepts empty strings and validates each URL in comma-separated list.
 * Must be https, discord.com/discordapp.com host, and /api/webhooks/ path.
 */
const DiscordWebhookUrlSchema = z
  .string()
  .refine(
    (val) => {
      if (!val || val.trim() === '') return true
      return val.split(',').every((url) => {
        const trimmed = url.trim()
        if (trimmed === '') return true
        // First check if it's a valid URL
        if (!z.url().safeParse(trimmed).success) return false
        // Then check Discord-specific requirements
        const parsed = new URL(trimmed)
        return (
          parsed.protocol === 'https:' &&
          DISCORD_WEBHOOK_HOSTS.some((host) => host === parsed.hostname) &&
          parsed.pathname.startsWith('/api/webhooks/')
        )
      })
    },
    { message: 'Must be valid Discord webhook URL(s) (comma-separated)' },
  )
  .optional()

/**
 * Validates Apprise URL format (comma-separated, flexible protocols).
 * Accepts empty strings and validates each URL in comma-separated list.
 */
const AppriseUrlSchema = z
  .string()
  .refine(
    (val) => {
      if (!val || val.trim() === '') return true
      return val.split(',').every((url) => {
        const trimmed = url.trim()
        if (trimmed === '') return true
        return z.url().safeParse(trimmed).success
      })
    },
    { message: 'Must be valid URL(s) (comma-separated)' },
  )
  .optional()

/**
 * Validates a single URL (any scheme). Accepts empty strings.
 * Used for services like Tautulli that may use various URL schemes.
 */
const HttpUrlSchema = z
  .union([z.url({ error: 'Must be a valid URL' }), z.literal('')])
  .optional()

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

/**
 * Schema for validating regex patterns used in delete sync tag matching.
 * Ensures the regex is safe (not catastrophic) and syntactically valid.
 * Enforces maximum length to prevent pathologically large patterns.
 */
const DeleteSyncTagRegexSchema = z
  .string()
  .max(1024, { message: 'Regex pattern too long (max 1024 characters)' })
  .refine(
    (pattern) => {
      const p = (pattern ?? '').trim()
      // Allow empty string (treated as not set)
      if (p.length === 0) return true
      // Check if the regex is safe using safe-regex2 library
      if (!safeRegex(p)) {
        return false
      }
      // Verify the regex syntax is valid in both standard and unicode mode
      try {
        new RegExp(p)
        new RegExp(p, 'u')
        return true
      } catch {
        return false
      }
    },
    {
      message:
        'Invalid or unsafe regex pattern. Pattern must be valid regex syntax and not contain catastrophic backtracking patterns.',
    },
  )

// Schema for complete config (GET responses) - matches exactly what getConfig() returns
export const ConfigFullSchema = z.object({
  // System identifiers and timestamps
  id: z.number(),
  created_at: z.string(), // ISO timestamp from database
  updated_at: z.string(), // ISO timestamp from database
  // System Config (from database)
  baseUrl: z.string().optional(),
  port: z.number().optional(),
  dbPath: z.string().optional(),
  cookieSecret: z.string().optional(),
  cookieName: z.string().optional(),
  cookieSecured: z.boolean(),
  // Logging & Performance
  logLevel: LogLevelEnum.optional(),
  closeGraceDelay: z.number().optional(),
  rateLimitMax: z.number().optional(),
  queueProcessDelaySeconds: z.number(),
  // Discord Config
  discordWebhookUrl: z.string().optional(),
  discordBotToken: z.string().optional(),
  discordClientId: z.string().optional(),
  discordGuildId: z.string().optional(),
  // Apprise Config (merged from runtime in route handler)
  enableApprise: z.boolean(),
  appriseUrl: z.string(),
  systemAppriseUrl: z.string().optional(),
  // Public Content Notifications - getConfig() always returns this with defaults
  publicContentNotifications: z.object({
    enabled: z.boolean(),
    discordWebhookUrls: z.string(),
    discordWebhookUrlsMovies: z.string(),
    discordWebhookUrlsShows: z.string(),
    appriseUrls: z.string(),
    appriseUrlsMovies: z.string(),
    appriseUrlsShows: z.string(),
  }),
  // Tautulli Config
  tautulliEnabled: z.boolean(),
  tautulliUrl: z.string(),
  tautulliApiKey: z.string(),
  // Delete Config
  deletionMode: DeletionModeEnum,
  // General Notifications (stored in milliseconds)
  queueWaitTime: z.number(),
  newEpisodeThreshold: z.number(),
  upgradeBufferTime: z.number(),
  // Pending Webhooks Config
  pendingWebhookRetryInterval: z.number(),
  pendingWebhookMaxAge: z.number(),
  pendingWebhookCleanupInterval: z.number(),
  // TMDB Config (region from DB, API key NOT returned for security)
  tmdbRegion: z.string(),
  // Plex Config
  plexTokens: z.array(z.string()),
  skipFriendSync: z.boolean(),
  plexServerUrl: z.string().optional(),
  skipIfExistsOnPlex: z.boolean(),
  deleteMovie: z.boolean(),
  deleteEndedShow: z.boolean(),
  deleteContinuingShow: z.boolean(),
  deleteFiles: z.boolean(),
  respectUserSyncSetting: z.boolean(),
  deleteSyncNotify: DeleteSyncNotifyOptionEnum,
  approvalNotify: NotifyOptionEnum,
  deleteSyncNotifyOnlyOnDeletion: z.boolean(),
  maxDeletionPrevention: z.number().optional(),
  deleteSyncTrackedOnly: z.boolean(),
  deleteSyncCleanupApprovals: z.boolean(),
  deleteSyncRequiredTagRegex: z.string(),
  enablePlexPlaylistProtection: z.boolean(),
  plexProtectionPlaylistName: z.string(),
  // Plex Label Sync Configuration - getConfig() always returns this with defaults
  plexLabelSync: PlexLabelSyncConfigSchema,
  // RSS Config
  selfRss: z.string().optional(),
  friendsRss: z.string().optional(),
  // Tagging Config
  tagUsersInSonarr: z.boolean(),
  tagUsersInRadarr: z.boolean(),
  cleanupOrphanedTags: z.boolean(),
  // TODO: Remove dormant field in future migration (replaced by removedTagMode enum)
  // persistHistoricalTags: z.boolean(),
  tagPrefix: z.string(),
  removedTagMode: z.enum(['remove', 'keep', 'special-tag']),
  removedTagPrefix: z.string(),
  // Tag Migration Configuration
  tagMigration: z
    .object({
      radarr: z.record(
        z.string(),
        z.object({
          completed: z.boolean(),
          migratedAt: z.string(),
          tagsMigrated: z.number(),
          contentUpdated: z.number(),
        }),
      ),
      sonarr: z.record(
        z.string(),
        z.object({
          completed: z.boolean(),
          migratedAt: z.string(),
          tagsMigrated: z.number(),
          contentUpdated: z.number(),
        }),
      ),
    })
    .optional(),
  // Plex Session Monitoring
  plexSessionMonitoring: z
    .object({
      enabled: z.boolean(),
      pollingIntervalMinutes: z.number(),
      remainingEpisodes: z.number(),
      filterUsers: z.array(z.string()).optional(),
      enableAutoReset: z.boolean().optional(),
      inactivityResetDays: z.number().optional(),
      autoResetIntervalHours: z.number().optional(),
      enableProgressiveCleanup: z.boolean().optional(),
    })
    .optional(),
  // New User Defaults - getConfig() applies defaults with Boolean() and || operators
  newUserDefaultCanSync: z.boolean(),
  newUserDefaultRequiresApproval: z.boolean(),
  newUserDefaultMovieQuotaEnabled: z.boolean(),
  newUserDefaultMovieQuotaType: z.enum(['daily', 'weekly_rolling', 'monthly']),
  newUserDefaultMovieQuotaLimit: z.number(),
  newUserDefaultMovieBypassApproval: z.boolean(),
  newUserDefaultShowQuotaEnabled: z.boolean(),
  newUserDefaultShowQuotaType: z.enum(['daily', 'weekly_rolling', 'monthly']),
  newUserDefaultShowQuotaLimit: z.number(),
  newUserDefaultShowBypassApproval: z.boolean(),
  // Quota System Configuration - getConfig() always returns this with defaults
  quotaSettings: z.object({
    cleanup: z.object({
      enabled: z.boolean(),
      retentionDays: z.number(),
    }),
    weeklyRolling: z.object({
      resetDays: z.number(),
    }),
    monthly: z.object({
      resetDay: z.number(),
      handleMonthEnd: z.enum(['last-day', 'skip-month', 'next-month']),
    }),
  }),
  // Approval System Configuration - getConfig() always returns this with defaults
  approvalExpiration: z.object({
    enabled: z.boolean(),
    defaultExpirationHours: z.number(),
    expirationAction: z.enum(['expire', 'auto_approve']),
    // Per-trigger expiration overrides (optional - only present if explicitly set)
    quotaExceededExpirationHours: z.number().optional(),
    routerRuleExpirationHours: z.number().optional(),
    manualFlagExpirationHours: z.number().optional(),
    contentCriteriaExpirationHours: z.number().optional(),
    cleanupExpiredDays: z.number(),
  }),
  // Ready state
  _isReady: z.boolean(),
})

// Schema for config updates (PUT) - all fields optional for partial updates
export const ConfigUpdateSchema = z.object({
  port: z.number().optional(),
  dbPath: z.string().optional(),
  cookieSecret: z.string().optional(),
  cookieName: z.string().optional(),
  cookieSecured: z.boolean().optional(),
  logLevel: LogLevelEnum.optional(),
  closeGraceDelay: z.number().optional(),
  rateLimitMax: z.number().optional(),
  queueProcessDelaySeconds: z.number().optional(),
  // Discord Config
  discordWebhookUrl: DiscordWebhookUrlSchema,
  discordBotToken: z.string().optional(),
  discordClientId: z.string().optional(),
  discordGuildId: z.string().optional(),
  // Apprise Config
  enableApprise: z.boolean().optional(),
  appriseUrl: AppriseUrlSchema,
  systemAppriseUrl: AppriseUrlSchema,
  // Public Content Notifications - broadcast ALL content availability to public channels/endpoints
  publicContentNotifications: z
    .object({
      enabled: z.boolean(),
      // Discord webhook URLs for public content announcements (comma-separated)
      discordWebhookUrls: DiscordWebhookUrlSchema,
      // Movie-specific Discord webhook URLs (comma-separated)
      discordWebhookUrlsMovies: DiscordWebhookUrlSchema,
      // Show-specific Discord webhook URLs (comma-separated)
      discordWebhookUrlsShows: DiscordWebhookUrlSchema,
      // Apprise URLs for public content announcements (comma-separated)
      appriseUrls: AppriseUrlSchema,
      // Movie-specific Apprise URLs (comma-separated)
      appriseUrlsMovies: AppriseUrlSchema,
      // Show-specific Apprise URLs (comma-separated)
      appriseUrlsShows: AppriseUrlSchema,
    })
    .optional(),
  // Tautulli Config
  tautulliEnabled: z.boolean().optional(),
  tautulliUrl: HttpUrlSchema,
  tautulliApiKey: z.string().optional(),
  // General Notifications (stored in milliseconds)
  queueWaitTime: z.coerce
    .number()
    .int()
    .min(0, { error: 'Queue wait time must be at least 0 milliseconds' })
    .max(QUEUE_WAIT_TIME_MAX_MS, {
      error: `Queue wait time cannot exceed ${QUEUE_WAIT_TIME_MAX_MS} milliseconds (30 minutes)`,
    })
    .optional(), // 0-30 minutes in ms
  newEpisodeThreshold: z.coerce
    .number()
    .int()
    .min(0, { error: 'New episode threshold must be at least 0 milliseconds' })
    .max(NEW_EPISODE_THRESHOLD_MAX_MS, {
      error: `New episode threshold cannot exceed ${NEW_EPISODE_THRESHOLD_MAX_MS} milliseconds (720 hours)`,
    })
    .optional(), // 0-720 hours in ms
  upgradeBufferTime: z.coerce
    .number()
    .int()
    .min(0, { error: 'Upgrade buffer time must be at least 0 milliseconds' })
    .max(UPGRADE_BUFFER_TIME_MAX_MS, {
      error: `Upgrade buffer time cannot exceed ${UPGRADE_BUFFER_TIME_MAX_MS} milliseconds (10 seconds)`,
    })
    .optional(), // 0-10 seconds in ms
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
  maxDeletionPrevention: z.number().min(1).max(100).optional(),
  // Deletion mode
  deletionMode: DeletionModeEnum.optional(),
  removedTagPrefix: RemovedTagPrefixSchema.optional(),
  // Additional regex filter for tag-based deletion - content must have BOTH the removal tag AND a tag matching this regex to be deleted
  deleteSyncRequiredTagRegex: DeleteSyncTagRegexSchema.optional(),
  // Tracked-only deletion - only delete content tracked by Pulsarr in approval_requests
  deleteSyncTrackedOnly: z.boolean().optional(),
  // Cleanup approval_requests when content is deleted
  deleteSyncCleanupApprovals: z.boolean().optional(),
  // Tag removal mode
  removedTagMode: z.enum(['remove', 'keep', 'special-tag']).optional(),
  // Plex Playlist Protection
  enablePlexPlaylistProtection: z.boolean().optional(),
  plexProtectionPlaylistName: z.string().optional(),
  plexServerUrl: z
    .union([
      z.url({ error: 'Must be a valid URL (http:// or https://)' }),
      z.literal(''),
    ])
    .optional(),
  // Plex Existence Check - skip downloading if content exists on Plex servers
  // Primary token user: checks ALL accessible servers (owned + shared)
  // Friend/other users: checks ONLY the owned server (no access tokens for shared)
  skipIfExistsOnPlex: z.boolean().optional(),
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
        .transform((val) => {
          // Always convert to array or return undefined
          if (!val) return undefined
          return Array.isArray(val) ? val : [val]
        })
        .optional(),
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
    .trim()
    .regex(/^[A-Za-z]{2}$/, { error: 'Region must be exactly 2 letters (A–Z)' })
    .transform((s) => s.toUpperCase())
    .optional(),
  // User Tags Configuration - flat properties following new pattern
  tagUsersInSonarr: z.boolean().optional(),
  tagUsersInRadarr: z.boolean().optional(),
  cleanupOrphanedTags: z.boolean().optional(),
  tagPrefix: TagPrefixSchema.optional(),
  // Note: removedTagMode and removedTagPrefix already exist above for delete sync compatibility
  // Tag Migration Configuration - tracks Radarr v6/Sonarr tag format migration (colon -> hyphen)
  tagMigration: z
    .object({
      radarr: z.record(
        z.string(),
        z.object({
          completed: z.boolean(),
          migratedAt: z.string(),
          tagsMigrated: z.number(),
          contentUpdated: z.number(),
        }),
      ),
      sonarr: z.record(
        z.string(),
        z.object({
          completed: z.boolean(),
          migratedAt: z.string(),
          tagsMigrated: z.number(),
          contentUpdated: z.number(),
        }),
      ),
    })
    .optional(),
})

// Response schemas - success is always true for 200 responses (errors use ConfigErrorSchema)
export const ConfigGetResponseSchema = z.object({
  success: z.literal(true),
  config: ConfigFullSchema,
})

export const ConfigUpdateResponseSchema = z.object({
  success: z.literal(true),
  config: ConfigFullSchema,
})

// Type exports
export type ConfigFull = z.infer<typeof ConfigFullSchema>
export type ConfigUpdate = z.infer<typeof ConfigUpdateSchema>
export type ConfigGetResponse = z.infer<typeof ConfigGetResponseSchema>
export type ConfigUpdateResponse = z.infer<typeof ConfigUpdateResponseSchema>

// Legacy export for backward compatibility - prefer ConfigUpdate for new code
export type Config = ConfigUpdate
export type ConfigResponse = ConfigGetResponse

// Re-export shared error schema with domain-specific alias
export { ErrorSchema as ConfigErrorSchema }
export type ConfigError = z.infer<typeof ErrorSchema>
