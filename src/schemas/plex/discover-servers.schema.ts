import { z } from 'zod'

// Schema for the token request
export const PlexTokenSchema = z.object({
  plexToken: z.string().min(1, 'Plex token is required'),
})

// Schema for a single server in the response
export const PlexServerSchema = z.object({
  name: z.string(),
  host: z.string(),
  port: z.number(),
  useSsl: z.boolean(),
  local: z.boolean(),
  // Add additional fields for descriptive purposes if needed
  description: z.string().optional(),
})

// Schema for server discovery response
export const PlexServerResponseSchema = z.object({
  success: z.boolean(),
  message: z.string().optional(),
  servers: z.array(PlexServerSchema),
})

// Schema for error responses
export const PlexServerErrorSchema = z.object({
  error: z.string(),
})

// Type exports
export type PlexTokenRequest = z.infer<typeof PlexTokenSchema>
export type PlexServer = z.infer<typeof PlexServerSchema>
export type PlexServerResponse = z.infer<typeof PlexServerResponseSchema>
export type PlexServerError = z.infer<typeof PlexServerErrorSchema>
