import { ErrorSchema } from '@root/schemas/common/error.schema.js'
import { z } from 'zod'

export const PlexTokenSchema = z.object({
  plexToken: z.string().trim().min(1, { error: 'Plex token is required' }),
})

export const PlexServerSchema = z.object({
  name: z.string(),
  host: z.string(),
  port: z.number(),
  useSsl: z.boolean(),
  local: z.boolean(),
  description: z.string().optional(),
})

export const PlexServerResponseSchema = z.object({
  success: z.boolean(),
  message: z.string().optional(),
  servers: z.array(PlexServerSchema),
})

export type PlexTokenRequest = z.infer<typeof PlexTokenSchema>
export type PlexServer = z.infer<typeof PlexServerSchema>
export type PlexServerResponse = z.infer<typeof PlexServerResponseSchema>

export { ErrorSchema as PlexServerErrorSchema }
export type PlexServerError = z.infer<typeof ErrorSchema>
