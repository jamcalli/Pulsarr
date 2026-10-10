import { ErrorSchema } from '@root/schemas/common/error.schema.js'
import { HttpUrlOptionalSchema } from '@root/schemas/common/url.schema.js'
import { UserNamingSourceSchema } from '@root/schemas/common/user-naming-source.schema.js'
import { PlexLabelSyncConfigSchema } from '@root/schemas/plex/label-sync-config.schema.js'
import {
  RemovedTagPrefixSchema,
  TagPrefixSchema,
} from '@root/schemas/shared/prefix-validation.schema.js'
import {
  QuotaLimitSchema,
  WatchlistCapSchema,
} from '@root/schemas/shared/quota-limits.js'
import { QuotaTypeSchema } from '@root/schemas/shared/quota-type.schema.js'
import { isRegexPatternSafe } from '@root/schemas/shared/regex-validation.schema.js'
import { DISCORD_WEBHOOK_HOSTS } from '@root/types/discord.types.js'
import {
  longestQuotaWindowDays,
  resolveQuotaWindowSettings,
} from '@root/utils/quota-window.js'
import { z } from 'zod'

// Max constants for validation
const QUEUE_WAIT_TIME_MAX_MS = 30 * 60 * 1000
const NEW_EPISODE_THRESHOLD_MAX_MS = 720 * 60 * 60 * 1000

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
 * Apprise URL schema - accepts any string.
 * Apprise URLs use custom URI schemes (tgram://, discord://, etc.) that don't
 * conform to WHATWG URL spec, so we skip client-side validation and let
 * Apprise handle validation when sending notifications.
 */
const AppriseUrlSchema = z.string().optional()

const LogLevelEnum = z.enum([
  'fatal',
  'error',
  'warn',
  'info',
  'debug',
  'trace',
  'silent',
])

export const APPROVAL_EXPIRATION_HOURS = { min: 1, max: 8760 } as const
export const EXPIRED_APPROVAL_CLEANUP_DAYS = { min: 1, max: 365 } as const
export const QUOTA_USAGE_RETENTION_DAYS = { min: 1, max: 365 } as const
export const QUOTA_WEEKLY_ROLLING_DAYS = { min: 1, max: 365 } as const
export const QUOTA_MONTHLY_RESET_DAY = { min: 1, max: 31 } as const

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

const UpdateNotifyEnum = z.enum([
  'none',
  'all',
  'discord-only',
  'apprise-only',
  'webhook-only',
  'dm-only',
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
  .refine((pattern) => isRegexPatternSafe(pattern), {
    message:
      'Invalid or unsafe regex pattern. Pattern must be valid regex syntax and not contain catastrophic backtracking patterns.',
  })

const TagMigrationEntrySchema = z
  .object({
    completed: z.boolean(),
    migratedAt: z.string(),
    tagsMigrated: z.number(),
    contentUpdated: z.number(),
  })
  .meta({
    id: 'TagMigrationEntry',
    description: 'Migration result for a single instance',
  })

const TagMigrationSchema = z
  .object({
    radarr: z.object({}).catchall(TagMigrationEntrySchema),
    sonarr: z.object({}).catchall(TagMigrationEntrySchema),
  })
  .meta({
    id: 'TagMigration',
    description: 'Tag format migration status per Radarr/Sonarr instance',
  })
  .optional()

const PlexTokensSchema = z
  .array(z.string())
  .meta({ description: 'Plex authentication tokens' })

const ApprovalExpirationActionSchema = z.enum(['expire', 'auto_approve']).meta({
  id: 'ApprovalExpirationAction',
  description: 'What happens to a pending approval request when it expires',
})

const MaintainerrExclusionModeSchema = z.enum(['watchlisters', 'global']).meta({
  id: 'MaintainerrExclusionMode',
  description:
    'Whether a Maintainerr exclusion applies to the watchlisting users or everyone',
})

const RemovedTagModeSchema = z.enum(['remove', 'keep', 'special-tag']).meta({
  id: 'RemovedTagMode',
  description: 'What happens to a user tag once that user drops the content',
})

const QuotaMonthEndSchema = z
  .enum(['last-day', 'skip-month', 'next-month'])
  .meta({
    id: 'QuotaMonthEnd',
    description:
      'How a monthly quota resets when its reset day is past the end of a short month',
  })

const ExpirationOverrideHoursSchema = z
  .number()
  .min(APPROVAL_EXPIRATION_HOURS.min)
  .max(APPROVAL_EXPIRATION_HOURS.max)

const ApprovalExpirationSchema = z
  .object({
    enabled: z.boolean(),
    defaultExpirationHours: z.number(),
    expirationAction: ApprovalExpirationActionSchema,
    autoApproveOnQuotaAvailable: z.boolean().meta({
      description:
        'Approve quota-exceeded requests once the user has quota again',
    }),
    quotaExceededExpirationHours: z
      .number()
      .meta({ description: 'Override for requests held by a quota' })
      .optional(),
    routerRuleExpirationHours: z
      .number()
      .meta({ description: 'Override for requests held by a router rule' })
      .optional(),
    manualFlagExpirationHours: z
      .number()
      .meta({ description: 'Override for users who always need approval' })
      .optional(),
    contentCriteriaExpirationHours: z
      .number()
      .meta({ description: 'Override for requests held by content criteria' })
      .optional(),
    cleanupExpiredDays: z.number(),
  })
  .meta({
    id: 'ApprovalExpiration',
    description:
      'Approval expiry and cleanup settings, always returned with defaults filled in. Per-trigger overrides are present only when set.',
  })

const ApprovalExpirationPayloadSchema = z
  .object({
    enabled: z.boolean().optional(),
    defaultExpirationHours: z
      .number({ error: 'Enter a number of hours.' })
      .min(APPROVAL_EXPIRATION_HOURS.min)
      .max(APPROVAL_EXPIRATION_HOURS.max)
      .optional(),
    expirationAction: ApprovalExpirationActionSchema.optional(),
    autoApproveOnQuotaAvailable: z.boolean().optional(),
    quotaExceededExpirationHours: ExpirationOverrideHoursSchema.optional(),
    routerRuleExpirationHours: ExpirationOverrideHoursSchema.optional(),
    manualFlagExpirationHours: ExpirationOverrideHoursSchema.optional(),
    contentCriteriaExpirationHours: ExpirationOverrideHoursSchema.optional(),
    cleanupExpiredDays: z
      .number({ error: 'Enter a number of days.' })
      .min(EXPIRED_APPROVAL_CLEANUP_DAYS.min)
      .max(EXPIRED_APPROVAL_CLEANUP_DAYS.max)
      .optional(),
  })
  .meta({
    id: 'ApprovalExpirationPayload',
    description:
      'Writable approval expiry and cleanup settings. Send the whole object, it replaces the stored one.',
  })

const QuotaSettingsSchema = z
  .object({
    cleanup: z.object({
      enabled: z.boolean(),
      retentionDays: z.number(),
    }),
    weeklyRolling: z.object({
      resetDays: z.number(),
    }),
    monthly: z.object({
      resetDay: z.number(),
      handleMonthEnd: QuotaMonthEndSchema,
    }),
  })
  .meta({
    id: 'QuotaSettings',
    description: 'Quota settings, always returned with defaults filled in',
  })

const QuotaSettingsPayloadSchema = z
  .object({
    cleanup: z.object({
      enabled: z.boolean(),
      retentionDays: z
        .number({ error: 'Enter a number of days.' })
        .min(QUOTA_USAGE_RETENTION_DAYS.min)
        .max(QUOTA_USAGE_RETENTION_DAYS.max),
    }),
    weeklyRolling: z.object({
      resetDays: z
        .number({ error: 'Enter a number of days.' })
        .min(QUOTA_WEEKLY_ROLLING_DAYS.min)
        .max(QUOTA_WEEKLY_ROLLING_DAYS.max),
    }),
    monthly: z.object({
      resetDay: z
        .number({ error: 'Enter a day of the month.' })
        .min(QUOTA_MONTHLY_RESET_DAY.min)
        .max(QUOTA_MONTHLY_RESET_DAY.max),
      handleMonthEnd: QuotaMonthEndSchema,
    }),
  })
  .superRefine((value, ctx) => {
    if (!value.cleanup.enabled) return
    const minimumDays = longestQuotaWindowDays(
      resolveQuotaWindowSettings(value),
    )
    if (value.cleanup.retentionDays < minimumDays) {
      ctx.addIssue({
        code: 'custom',
        message: `Usage history must be kept for at least ${minimumDays} days so cleanup never removes requests that still count toward a quota.`,
        path: ['cleanup', 'retentionDays'],
      })
    }
  })
  .meta({
    id: 'QuotaSettingsPayload',
    description:
      'Writable quota settings. Send the whole object, it replaces the stored one.',
  })

// Schema for complete config (GET responses) - matches exactly what getConfig() returns
export const ConfigFullSchema = z
  .object({
    // System identifiers and timestamps
    id: z.number(),
    created_at: z.string(), // ISO timestamp from database
    updated_at: z.string(), // ISO timestamp from database
    // System Config (from database)
    baseUrl: z.string().optional(),
    port: z.number().int().min(1).max(65535).optional(),
    dbPath: z.string().optional(),
    // cookieSecret, webhookSecret, and cookieName are server-internal
    cookieSecured: z.boolean(),
    // Logging & Performance
    logLevel: LogLevelEnum.optional(),
    closeGraceDelay: z
      .number()
      .meta({ description: 'Shutdown grace period in milliseconds' })
      .optional(),
    rateLimitMax: z.number().optional(),
    queueProcessDelaySeconds: z.number(),
    // Maintainerr Config (maintainerrWebhookSecret is server-internal)
    maintainerrEnabled: z.boolean(),
    maintainerrUrl: z.string().optional(),
    maintainerrExclusionMode: MaintainerrExclusionModeSchema.optional(),
    // Discord Config
    discordWebhookUrl: z.string().optional(),
    discordBotToken: z.string().optional(),
    discordClientId: z.string().optional(),
    // Apprise Config (merged from runtime in route handler)
    enableApprise: z.boolean(),
    appriseUrl: z.string(),
    systemAppriseUrl: z.string().optional(),
    appriseEmailSender: z.string().optional(),
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
    // Plex Mobile Config
    plexMobileEnabled: z.boolean(),
    // Delete Config
    deletionMode: DeletionModeEnum,
    // General Notifications
    queueWaitTime: z
      .number()
      .meta({ description: 'Notification queue wait time in milliseconds' }),
    newEpisodeThreshold: z.number().meta({
      description: 'New episode notification threshold in milliseconds',
    }),
    // Out-of-app notification channels for new Pulsarr releases
    notifyOnUpdate: UpdateNotifyEnum,
    notifyOnAvailability: z.boolean(),
    // Pending Webhooks Config
    pendingWebhookRetryInterval: z
      .number()
      .meta({ description: 'Pending webhook retry interval in seconds' }),
    pendingWebhookMaxAge: z
      .number()
      .meta({ description: 'Pending webhook expiry age in minutes' }),
    pendingWebhookCleanupInterval: z
      .number()
      .meta({ description: 'Expired webhook cleanup interval in seconds' }),
    // TMDB Config (region from DB, API key NOT returned for security)
    tmdbRegion: z.string(),
    // Plex Config
    plexTokens: PlexTokensSchema,
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
    watchlistCapNotify: NotifyOptionEnum,
    watchlistCapNotifyUser: z.boolean(),
    watchlistAddNotify: NotifyOptionEnum,
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
    tagNamingSource: UserNamingSourceSchema,
    removedTagMode: RemovedTagModeSchema,
    removedTagPrefix: z.string(),
    // Tag Migration Configuration
    tagMigration: TagMigrationSchema,
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
    newUserDefaultMovieQuotaType: QuotaTypeSchema,
    newUserDefaultMovieQuotaLimit: z.number(),
    newUserDefaultMovieBypassApproval: z.boolean(),
    newUserDefaultMovieWatchlistCap: z.number().nullable(),
    newUserDefaultShowQuotaEnabled: z.boolean(),
    newUserDefaultShowQuotaType: QuotaTypeSchema,
    newUserDefaultShowQuotaLimit: z.number(),
    newUserDefaultShowBypassApproval: z.boolean(),
    newUserDefaultShowWatchlistCap: z.number().nullable(),
    quotaSettings: QuotaSettingsSchema,
    approvalExpiration: ApprovalExpirationSchema,
    // Ready state
    _isReady: z.boolean().meta({
      description:
        'Auto-start the watchlist workflow on next boot; surfaced as the Auto-Start toggle',
    }),
  })
  .meta({
    id: 'Config',
    description:
      'Complete application configuration; server-internal secrets are never included',
  })

// Schema for config updates (PUT) - all fields optional for partial updates
export const ConfigUpdateSchema = z
  .object({
    baseUrl: HttpUrlOptionalSchema,
    port: z.number().int().min(1).max(65535).optional(),
    dbPath: z.string().optional(),
    // cookieSecret, webhookSecret, and cookieName are server-internal
    cookieSecured: z.boolean().optional(),
    logLevel: LogLevelEnum.optional(),
    closeGraceDelay: z.number().optional(),
    rateLimitMax: z.number().optional(),
    queueProcessDelaySeconds: z.number().optional(),
    // Maintainerr Config (maintainerrWebhookSecret is server-internal)
    maintainerrEnabled: z.boolean().optional(),
    maintainerrUrl: HttpUrlOptionalSchema,
    maintainerrExclusionMode: MaintainerrExclusionModeSchema.optional(),
    // Discord Config
    discordWebhookUrl: DiscordWebhookUrlSchema,
    discordBotToken: z.string().optional(),
    discordClientId: z.string().optional(),
    // Apprise Config (enableApprise/appriseUrl are runtime-only; not writable via API)
    systemAppriseUrl: AppriseUrlSchema,
    appriseEmailSender: AppriseUrlSchema,
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
    // Plex Mobile Config
    plexMobileEnabled: z.boolean().optional(),
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
      .min(0, {
        error: 'New episode threshold must be at least 0 milliseconds',
      })
      .max(NEW_EPISODE_THRESHOLD_MAX_MS, {
        error: `New episode threshold cannot exceed ${NEW_EPISODE_THRESHOLD_MAX_MS} milliseconds (720 hours)`,
      })
      .optional(), // 0-720 hours in ms
    // lastNotifiedVersion is internal-only; only the user-facing setting here.
    notifyOnUpdate: UpdateNotifyEnum.optional(),
    notifyOnAvailability: z.boolean().optional(),
    // Pending Webhooks Config
    // How often to retry processing pending webhooks (in seconds)
    pendingWebhookRetryInterval: z.number().optional(),
    // Maximum age of a pending webhook before it expires (in minutes)
    pendingWebhookMaxAge: z.number().optional(),
    // How often to clean up expired webhooks (in seconds)
    pendingWebhookCleanupInterval: z.number().optional(),
    // Other configs
    plexTokens: PlexTokensSchema.optional(),
    skipFriendSync: z.boolean().optional(),
    deleteMovie: z.boolean().optional(),
    deleteEndedShow: z.boolean().optional(),
    deleteContinuingShow: z.boolean().optional(),
    deleteFiles: z.boolean().optional(),
    respectUserSyncSetting: z.boolean().optional(),
    deleteSyncNotify: DeleteSyncNotifyOptionEnum.optional(),
    approvalNotify: NotifyOptionEnum.optional(),
    watchlistCapNotify: NotifyOptionEnum.optional(),
    watchlistCapNotifyUser: z.boolean().optional(),
    watchlistAddNotify: NotifyOptionEnum.optional(),
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
    removedTagMode: RemovedTagModeSchema.optional(),
    // Plex Playlist Protection
    enablePlexPlaylistProtection: z.boolean().optional(),
    plexProtectionPlaylistName: z.string().optional(),
    plexServerUrl: HttpUrlOptionalSchema,
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
        filterUsers: z.array(z.string()).optional(),
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
    newUserDefaultMovieQuotaType: QuotaTypeSchema.optional(),
    newUserDefaultMovieQuotaLimit: QuotaLimitSchema.optional(),
    newUserDefaultMovieBypassApproval: z.boolean().optional(),
    newUserDefaultMovieWatchlistCap: WatchlistCapSchema.nullable().optional(),
    newUserDefaultShowQuotaEnabled: z.boolean().optional(),
    newUserDefaultShowQuotaType: QuotaTypeSchema.optional(),
    newUserDefaultShowQuotaLimit: QuotaLimitSchema.optional(),
    newUserDefaultShowBypassApproval: z.boolean().optional(),
    newUserDefaultShowWatchlistCap: WatchlistCapSchema.nullable().optional(),
    quotaSettings: QuotaSettingsPayloadSchema.optional(),
    approvalExpiration: ApprovalExpirationPayloadSchema.optional(),
    // TMDB Configuration
    tmdbRegion: z
      .string()
      .trim()
      .regex(/^[A-Z]{2}$/, {
        error: 'Region must be exactly 2 uppercase letters (A-Z)',
      })
      .optional(),
    // User Tags Configuration - flat properties following new pattern
    tagUsersInSonarr: z.boolean().optional(),
    tagUsersInRadarr: z.boolean().optional(),
    cleanupOrphanedTags: z.boolean().optional(),
    tagPrefix: TagPrefixSchema.optional(),
    tagNamingSource: UserNamingSourceSchema.optional(),
    // Tag Migration Configuration - tracks Radarr v6/Sonarr tag format migration (colon -> hyphen)
    tagMigration: TagMigrationSchema,
  })
  .strict()
  .meta({
    id: 'ConfigUpdatePayload',
    description:
      'Writable configuration fields; server-internal settings are rejected',
  })

// Success is always true for 200 responses (errors use ConfigErrorSchema)
export const ConfigResponseSchema = z
  .object({
    success: z.literal(true),
    config: ConfigFullSchema,
  })
  .meta({
    id: 'ConfigResponse',
    description: 'Configuration response envelope',
  })

// Type exports
export type ConfigFull = z.infer<typeof ConfigFullSchema>
export type ConfigUpdate = z.infer<typeof ConfigUpdateSchema>
export type ConfigResponse = z.infer<typeof ConfigResponseSchema>

// Re-export shared error schema with domain-specific alias
export { ErrorSchema as ConfigErrorSchema }
export type ConfigError = z.infer<typeof ErrorSchema>
