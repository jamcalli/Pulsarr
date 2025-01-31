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
  port: z.number().optional(),
  dbPath: z.string().optional(),
  cookieSecret: z.string().optional(),
  cookieName: z.string().optional(),
  cookieSecured: z.boolean().optional(),
  logLevel: LogLevelEnum.optional(),
  closeGraceDelay: z.number().optional(),
  rateLimitMax: z.number().optional(),
  syncIntervalSeconds: z.number().optional(),
  
  plexTokens: z.array(z.string()).optional(),
  skipFriendSync: z.boolean().optional(),
  
  deleteMovie: z.boolean().optional(),
  deleteEndedShow: z.boolean().optional(),
  deleteContinuingShow: z.boolean().optional(),
  deleteIntervalDays: z.number().optional(),
  deleteFiles: z.boolean().optional(),
  
  selfRss: z.string().optional(),
  friendsRss: z.string().optional(),
  
  _isReady: z.boolean().optional(),
}) satisfies z.ZodType<Partial<Config>>

export const ConfigResponseSchema = z.object({
  success: z.boolean(),
  config: z.object(ConfigSchema.shape),
})

export const ConfigErrorSchema = z.object({
  error: z.string(),
})

export type ConfigSchema = z.infer<typeof ConfigSchema>
export type ConfigResponse = z.infer<typeof ConfigResponseSchema>