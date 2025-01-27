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

export const ConfigUpdateSchema = z.object({
  port: z.number().optional(),
  dbPath: z.string().optional(),
  cookieSecret: z.string().optional(),
  cookieName: z.string().optional(),
  cookieSecured: z.boolean().optional(),
  logLevel: LogLevelEnum.optional(),
  closeGraceDelay: z.number().optional(),
  rateLimitMax: z.number().optional(),
  syncIntervalSeconds: z.number().optional(),
  // Sonarr Config
  sonarrBaseUrl: z.string().optional(),
  sonarrApiKey: z.string().optional(),
  sonarrQualityProfile: z.string().optional(),
  sonarrRootFolder: z.string().optional(),
  sonarrBypassIgnored: z.boolean().optional(),
  sonarrSeasonMonitoring: z.string().optional(),
  sonarrTags: z.array(z.string()).optional(),
  // Radarr Config
  radarrBaseUrl: z.string().optional(),
  radarrApiKey: z.string().optional(),
  radarrQualityProfile: z.string().optional(),
  radarrRootFolder: z.string().optional(),
  radarrBypassIgnored: z.boolean().optional(),
  radarrTags: z.array(z.string()).optional(),
  // Plex Config
  plexTokens: z.array(z.string()).optional(),
  skipFriendSync: z.boolean().optional(),
  // Delete Config
  deleteMovie: z.boolean().optional(),
  deleteEndedShow: z.boolean().optional(),
  deleteContinuingShow: z.boolean().optional(),
  deleteIntervalDays: z.number().optional(),
  deleteFiles: z.boolean().optional(),
  // RSS Config
  selfRss: z.string().optional(),
  friendsRss: z.string().optional(),
  // Ready state
  _isReady: z.boolean().optional(),
}) satisfies z.ZodType<Partial<Config>>

export const ConfigUpdateResponseSchema = z.object({
  success: z.boolean(),
  config: z.object(ConfigUpdateSchema.shape),
})

export const ConfigUpdateErrorSchema = z.object({
  error: z.string(),
})

export type ConfigUpdate = z.infer<typeof ConfigUpdateSchema>
export type ConfigUpdateResponse = z.infer<typeof ConfigUpdateResponseSchema>
