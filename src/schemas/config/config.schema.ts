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
  // General Notifications
  queueWaitTime: z.number().optional(),
  newEpisodeThreshold: z.number().optional(),
  upgradeBufferTime: z.number().optional(),
  // Other configs
  plexTokens: z.array(z.string()).optional(),
  skipFriendSync: z.boolean().optional(),
  deleteMovie: z.boolean().optional(),
  deleteEndedShow: z.boolean().optional(),
  deleteContinuingShow: z.boolean().optional(),
  deleteFiles: z.boolean().optional(),
  respectUserSyncSetting: z.boolean().optional(),
  deleteSyncNotify: DeleteSyncNotifyOptionEnum.optional(),
  maxDeletionPrevention: z.number().optional(),
  selfRss: z.string().optional(),
  friendsRss: z.string().optional(),
  _isReady: z.boolean().optional(),
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
