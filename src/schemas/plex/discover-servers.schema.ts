import { ErrorSchema } from '@root/schemas/common/error.schema.js'
import { z } from 'zod'

// Schema for the token request
export const PlexTokenSchema = z.object({
  plexToken: z.string().trim().min(1, { error: 'Plex token is required' }),
})

// Schema for a single server in the response
export const PlexServerSchema = z.object({
  name: z.string(),
  host: z.string(),
  port: z.number(),
  useSsl: z.boolean(),
  local: z.boolean(),
  description: z.string().optional(),
})

// Schema for server discovery response
export const PlexServerResponseSchema = z.object({
  success: z.literal(true),
  message: z.string().optional(),
  servers: z.array(PlexServerSchema),
})

// Type exports
export type PlexTokenRequest = z.infer<typeof PlexTokenSchema>
export type PlexServer = z.infer<typeof PlexServerSchema>
export type PlexServerResponse = z.infer<typeof PlexServerResponseSchema>

// Re-export shared error schema with domain-specific alias
export { ErrorSchema as PlexServerErrorSchema }
export type PlexServerError = z.infer<typeof ErrorSchema>
