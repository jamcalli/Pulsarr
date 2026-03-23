import { ErrorSchema } from '@root/schemas/common/error.schema.js'
import { HttpUrlOptionalSchema } from '@root/schemas/common/url.schema.js'
import { PlexLabelSyncConfigSchema } from '@root/schemas/plex/label-sync-config.schema.js'
import {
  RemovedTagPrefixSchema,
  TagPrefixSchema,
} from '@root/schemas/shared/prefix-validation.schema.js'
import { isRegexPatternSafe } from '@root/schemas/shared/regex-validation.schema.js'
import { DISCORD_WEBHOOK_HOSTS } from '@root/types/discord.types.js'
import { z } from 'zod'

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

const NotifyOptionEnum = z.enum([
  'none',
  'all',
  'discord-only',
  'apprise-only',
  'webhook-only',
  'dm-only',
  'discord-webhook', // Same as webhook-only for backward compatibility
  'discord-message', // Same as dm-only for backward compatibility
  'discord-both',
])

// Legacy enum for backward compatibility
const DeleteSyncNotifyOptionEnum = z.enum([
  'none',
  'message', // Legacy option for DM
  'webhook', // Legacy option for webhook
  'both', // Legacy option for both webhook and DM
  'all',
  'discord-only',
  'apprise-only',
  'webhook-only',
  'dm-only',
  'discord-webhook', // Same as webhook-only for backward compatibility
  'discord-message', // Same as dm-only for backward compatibility
  'discord-both',
])

const DeletionModeEnum = z.enum(['watchlist', 'tag-based'])

const DeleteSyncTagRegexSchema = z
  .string()
  .max(1024, { message: 'Regex pattern too long (max 1024 characters)' })
  .refine((pattern) => isRegexPatternSafe(pattern), {
    message:
      'Invalid or unsafe regex pattern. Pattern must be valid regex syntax and not contain catastrophic backtracking patterns.',
  })

const TagMigrationEntrySchema = z.object({
  completed: z.boolean(),
  migratedAt: z.string(),
  tagsMigrated: z.number(),
  contentUpdated: z.number(),
})

const TagMigrationSchema = z
  .object({
    radarr: z.object({}).catchall(TagMigrationEntrySchema),
    sonarr: z.object({}).catchall(TagMigrationEntrySchema),
  })
  .optional()

export const ConfigFullSchema = z.object({
  id: z.number(),
  created_at: z.string(),
  updated_at: z.string(),
  baseUrl: z.string().optional(),
  port: z.number().int().min(1).max(65535).optional(),
  dbPath: z.string().optional(),
  cookieSecret: z.string().optional(),
  cookieName: z.string().optional(),
  cookieSecured: z.boolean(),
  logLevel: LogLevelEnum.optional(),
  closeGraceDelay: z.number().optional(),
  rateLimitMax: z.number().optional(),
  queueProcessDelaySeconds: z.number(),
  discordWebhookUrl: z.string().optional(),
  discordBotToken: z.string().optional(),
  discordClientId: z.string().optional(),
  enableApprise: z.boolean(),
  appriseUrl: z.string(),
  systemAppriseUrl: z.string().optional(),
  appriseEmailSender: z.string().optional(),
  publicContentNotifications: z.object({
    enabled: z.boolean(),
    discordWebhookUrls: z.string(),
    discordWebhookUrlsMovies: z.string(),
    discordWebhookUrlsShows: z.string(),
    appriseUrls: z.string(),
    appriseUrlsMovies: z.string(),
    appriseUrlsShows: z.string(),
  }),
  plexMobileEnabled: z.boolean(),
  deletionMode: DeletionModeEnum,
  // Stored in milliseconds
  queueWaitTime: z.number(),
  newEpisodeThreshold: z.number(),
  pendingWebhookRetryInterval: z.number(),
  pendingWebhookMaxAge: z.number(),
  pendingWebhookCleanupInterval: z.number(),
  // API key NOT returned for security
  tmdbRegion: z.string(),
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
  watchlistCapNotify: NotifyOptionEnum,
  watchlistCapNotifyUser: z.boolean(),
  deleteSyncNotifyOnlyOnDeletion: z.boolean(),
  maxDeletionPrevention: z.number().optional(),
  deleteSyncTrackedOnly: z.boolean(),
  deleteSyncCleanupApprovals: z.boolean(),
  deleteSyncRequiredTagRegex: z.string(),
  enablePlexPlaylistProtection: z.boolean(),
  plexProtectionPlaylistName: z.string(),
  plexLabelSync: PlexLabelSyncConfigSchema,
  selfRss: z.string().optional(),
  friendsRss: z.string().optional(),
  tagUsersInSonarr: z.boolean(),
  tagUsersInRadarr: z.boolean(),
  cleanupOrphanedTags: z.boolean(),
  // TODO: Remove dormant field in future migration (replaced by removedTagMode enum)
  // persistHistoricalTags: z.boolean(),
  tagPrefix: z.string(),
  removedTagMode: z.enum(['remove', 'keep', 'special-tag']),
  removedTagPrefix: z.string(),
  tagMigration: TagMigrationSchema,
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
  newUserDefaultCanSync: z.boolean(),
  newUserDefaultRequiresApproval: z.boolean(),
  newUserDefaultMovieQuotaEnabled: z.boolean(),
  newUserDefaultMovieQuotaType: z.enum(['daily', 'weekly_rolling', 'monthly']),
  newUserDefaultMovieQuotaLimit: z.number(),
  newUserDefaultMovieBypassApproval: z.boolean(),
  newUserDefaultMovieWatchlistCap: z.number().nullable(),
  newUserDefaultShowQuotaEnabled: z.boolean(),
  newUserDefaultShowQuotaType: z.enum(['daily', 'weekly_rolling', 'monthly']),
  newUserDefaultShowQuotaLimit: z.number(),
  newUserDefaultShowBypassApproval: z.boolean(),
  newUserDefaultShowWatchlistCap: z.number().nullable(),
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
  approvalExpiration: z.object({
    enabled: z.boolean(),
    defaultExpirationHours: z.number(),
    expirationAction: z.enum(['expire', 'auto_approve']),
    autoApproveOnQuotaAvailable: z.boolean(),
    quotaExceededExpirationHours: z.number().optional(),
    routerRuleExpirationHours: z.number().optional(),
    manualFlagExpirationHours: z.number().optional(),
    contentCriteriaExpirationHours: z.number().optional(),
    cleanupExpiredDays: z.number(),
  }),
  _isReady: z.boolean(),
})

export const ConfigUpdateSchema = z
  .object({
    baseUrl: HttpUrlOptionalSchema,
    port: z.number().int().min(1).max(65535).optional(),
    dbPath: z.string().optional(),
    cookieSecret: z.string().optional(),
    cookieName: z.string().optional(),
    cookieSecured: z.boolean().optional(),
    logLevel: LogLevelEnum.optional(),
    closeGraceDelay: z.number().optional(),
    rateLimitMax: z.number().optional(),
    queueProcessDelaySeconds: z.number().optional(),
    discordWebhookUrl: DiscordWebhookUrlSchema,
    discordBotToken: z.string().optional(),
    discordClientId: z.string().optional(),
    // enableApprise/appriseUrl are runtime-only, not writable via API
    systemAppriseUrl: AppriseUrlSchema,
    appriseEmailSender: AppriseUrlSchema,
    publicContentNotifications: z
      .object({
        enabled: z.boolean(),
        discordWebhookUrls: DiscordWebhookUrlSchema,
        discordWebhookUrlsMovies: DiscordWebhookUrlSchema,
        discordWebhookUrlsShows: DiscordWebhookUrlSchema,
        appriseUrls: AppriseUrlSchema,
        appriseUrlsMovies: AppriseUrlSchema,
        appriseUrlsShows: AppriseUrlSchema,
      })
      .optional(),
    plexMobileEnabled: z.boolean().optional(),
    // Stored in milliseconds
    queueWaitTime: z.coerce
      .number()
      .int()
      .min(0, { error: 'Queue wait time must be at least 0 milliseconds' })
      .max(QUEUE_WAIT_TIME_MAX_MS, {
        error: `Queue wait time cannot exceed ${QUEUE_WAIT_TIME_MAX_MS} milliseconds (30 minutes)`,
      })
      .optional(),
    newEpisodeThreshold: z.coerce
      .number()
      .int()
      .min(0, {
        error: 'New episode threshold must be at least 0 milliseconds',
      })
      .max(NEW_EPISODE_THRESHOLD_MAX_MS, {
        error: `New episode threshold cannot exceed ${NEW_EPISODE_THRESHOLD_MAX_MS} milliseconds (720 hours)`,
      })
      .optional(),
    pendingWebhookRetryInterval: z.number().optional(), // seconds
    pendingWebhookMaxAge: z.number().optional(), // minutes
    pendingWebhookCleanupInterval: z.number().optional(), // seconds
    plexTokens: z.array(z.string()).optional(),
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
    deleteSyncNotifyOnlyOnDeletion: z.boolean().optional(),
    maxDeletionPrevention: z.number().min(1).max(100).optional(),
    deletionMode: DeletionModeEnum.optional(),
    removedTagPrefix: RemovedTagPrefixSchema.optional(),
    // Content must have BOTH the removal tag AND a tag matching this regex to be deleted
    deleteSyncRequiredTagRegex: DeleteSyncTagRegexSchema.optional(),
    deleteSyncTrackedOnly: z.boolean().optional(),
    deleteSyncCleanupApprovals: z.boolean().optional(),
    removedTagMode: z.enum(['remove', 'keep', 'special-tag']).optional(),
    enablePlexPlaylistProtection: z.boolean().optional(),
    plexProtectionPlaylistName: z.string().optional(),
    plexServerUrl: HttpUrlOptionalSchema,
    // Primary token user checks ALL servers, friends check only owned
    skipIfExistsOnPlex: z.boolean().optional(),
    plexLabelSync: PlexLabelSyncConfigSchema.optional(),
    selfRss: z.string().optional(),
    friendsRss: z.string().optional(),
    _isReady: z.boolean().optional(),
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
        enableAutoReset: z.boolean().optional(),
        inactivityResetDays: z.number().min(1).max(365).optional(),
        autoResetIntervalHours: z.number().min(1).max(168).optional(),
        enableProgressiveCleanup: z.boolean().optional(),
      })
      .optional(),
    newUserDefaultCanSync: z.boolean().optional(),
    newUserDefaultRequiresApproval: z.boolean().optional(),
    newUserDefaultMovieQuotaEnabled: z.boolean().optional(),
    newUserDefaultMovieQuotaType: z
      .enum(['daily', 'weekly_rolling', 'monthly'])
      .optional(),
    newUserDefaultMovieQuotaLimit: z.number().min(1).max(1000).optional(),
    newUserDefaultMovieBypassApproval: z.boolean().optional(),
    newUserDefaultMovieWatchlistCap: z.number().min(1).nullable().optional(),
    newUserDefaultShowQuotaEnabled: z.boolean().optional(),
    newUserDefaultShowQuotaType: z
      .enum(['daily', 'weekly_rolling', 'monthly'])
      .optional(),
    newUserDefaultShowQuotaLimit: z.number().min(1).max(1000).optional(),
    newUserDefaultShowBypassApproval: z.boolean().optional(),
    newUserDefaultShowWatchlistCap: z.number().min(1).nullable().optional(),
    quotaSettings: z
      .object({
        cleanup: z
          .object({
            enabled: z.boolean().optional(),
            retentionDays: z.number().min(1).max(365).optional(),
          })
          .optional(),
        weeklyRolling: z
          .object({
            resetDays: z.number().min(1).max(365).optional(),
          })
          .optional(),
        monthly: z
          .object({
            resetDay: z.number().min(1).max(31).optional(),
            handleMonthEnd: z
              .enum(['last-day', 'skip-month', 'next-month'])
              .optional(),
          })
          .optional(),
      })
      .optional(),
    approvalExpiration: z
      .object({
        enabled: z.boolean().optional(),
        defaultExpirationHours: z.number().min(1).max(8760).optional(),
        expirationAction: z.enum(['expire', 'auto_approve']).optional(),
        autoApproveOnQuotaAvailable: z.boolean().optional(),
        quotaExceededExpirationHours: z.number().min(1).max(8760).optional(),
        routerRuleExpirationHours: z.number().min(1).max(8760).optional(),
        manualFlagExpirationHours: z.number().min(1).max(8760).optional(),
        contentCriteriaExpirationHours: z.number().min(1).max(8760).optional(),
        cleanupExpiredDays: z.number().min(1).max(365).optional(),
      })
      .optional(),
    tmdbRegion: z
      .string()
      .trim()
      .regex(/^[A-Za-z]{2}$/, {
        error: 'Region must be exactly 2 letters (A–Z)',
      })
      .transform((s) => s.toUpperCase())
      .optional(),
    tagUsersInSonarr: z.boolean().optional(),
    tagUsersInRadarr: z.boolean().optional(),
    cleanupOrphanedTags: z.boolean().optional(),
    tagPrefix: TagPrefixSchema.optional(),
    // Tracks Radarr v6/Sonarr tag format migration (colon -> hyphen)
    tagMigration: TagMigrationSchema,
  })
  .strict()

export const ConfigGetResponseSchema = z.object({
  success: z.literal(true),
  config: ConfigFullSchema,
})

export const ConfigUpdateResponseSchema = z.object({
  success: z.literal(true),
  config: ConfigFullSchema,
})

export type ConfigFull = z.infer<typeof ConfigFullSchema>
export type ConfigUpdate = z.infer<typeof ConfigUpdateSchema>
export type ConfigGetResponse = z.infer<typeof ConfigGetResponseSchema>
export type ConfigUpdateResponse = z.infer<typeof ConfigUpdateResponseSchema>

export type Config = ConfigUpdate
export type ConfigResponse = ConfigGetResponse

export { ErrorSchema as ConfigErrorSchema }
export type ConfigError = z.infer<typeof ErrorSchema>
