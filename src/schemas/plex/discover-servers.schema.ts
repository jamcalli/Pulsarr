import { ErrorSchema } from '@root/schemas/common/error.schema.js'
import { PlexConnectionFailureCodeSchema } from '@root/schemas/plex/connection-failure.schema.js'
import { z } from 'zod'

export const PlexTokenSchema = z
  .object({
    plexToken: z.string().trim().min(1, { error: 'Plex token is required' }),
  })
  .meta({
    id: 'PlexServerDiscoveryPayload',
    description: 'The Plex token whose servers to list',
  })

export const PlexServerSchema = z
  .object({
    name: z.string(),
    host: z.string(),
    port: z.number(),
    useSsl: z.boolean(),
    local: z.boolean(),
    description: z.string().optional(),
    code: PlexConnectionFailureCodeSchema.nullable(),
  })
  .meta({
    id: 'PlexServer',
    description:
      'One connection to a Plex server the token owns, code is null when Pulsarr reached it',
  })

export const PlexServerResponseSchema = z
  .object({
    success: z.boolean(),
    message: z.string().optional(),
    servers: z.array(PlexServerSchema),
  })
  .meta({
    id: 'PlexServerDiscovery',
    description:
      'Every connection Plex offers for the token, ordered best first',
  })

// Type exports
export type PlexTokenRequest = z.infer<typeof PlexTokenSchema>
export type PlexServer = z.infer<typeof PlexServerSchema>
export type PlexServerResponse = z.infer<typeof PlexServerResponseSchema>

// Re-export shared error schema with domain-specific alias
export { ErrorSchema as PlexServerErrorSchema }
export type PlexServerError = z.infer<typeof ErrorSchema>
