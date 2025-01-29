import { z } from 'zod'
import type { Config } from '@root/types/config.types.js'

const LogLevelEnum = z.enum([
  'fatal',
  'error',
  'warn',
  'info',
  'debug',
  'trace',
  'silent',
])

export const ConfigSchema = z.object({
  port: z.number(),
  dbPath: z.string(),
  cookieSecret: z.string(),
  cookieName: z.string(),
  cookieSecured: z.boolean(),
  logLevel: LogLevelEnum,
  closeGraceDelay: z.number(),
  rateLimitMax: z.number(),
  syncIntervalSeconds: z.number(),
  // Sonarr Config
  sonarrBaseUrl: z.string(),
  sonarrApiKey: z.string(),
  sonarrQualityProfile: z.string(),
  sonarrRootFolder: z.string(),
  sonarrBypassIgnored: z.boolean(),
  sonarrSeasonMonitoring: z.string(),
  sonarrTags: z.array(z.string()),
  // Radarr Config
  radarrBaseUrl: z.string(),
  radarrApiKey: z.string(),
  radarrQualityProfile: z.string(),
  radarrRootFolder: z.string(),
  radarrBypassIgnored: z.boolean(),
  radarrTags: z.array(z.string()),
  // Plex Config
  plexTokens: z.array(z.string()),
  skipFriendSync: z.boolean(),
  // Delete Config
  deleteMovie: z.boolean(),
  deleteEndedShow: z.boolean(),
  deleteContinuingShow: z.boolean(),
  deleteIntervalDays: z.number(),
  deleteFiles: z.boolean(),
  // RSS Config
  selfRss: z.string().optional(),
  friendsRss: z.string().optional(),
  // Ready state
  _isReady: z.boolean(),
}) satisfies z.ZodType<Config>

export const ConfigResponseSchema = z.object({
  success: z.boolean(),
  config: ConfigSchema,
})

export const ConfigErrorSchema = z.object({
  statusCode: z.number(),
  error: z.string(),
  message: z.string(),
})

export type ConfigResponse = z.infer<typeof ConfigResponseSchema>
export type ConfigError = z.infer<typeof ConfigErrorSchema>