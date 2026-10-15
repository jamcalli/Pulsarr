import { ErrorSchema } from '@root/schemas/common/error.schema.js'
import { z } from 'zod'

export const PlexPinResponseSchema = z
  .object({
    id: z.number(),
    code: z.string(),
    qr: z.string(),
    expiresAt: z.string(),
    clientId: z.string(),
  })
  .meta({
    id: 'PlexPin',
    description:
      'A PIN the admin approves at plex.tv/link to link a Plex account',
  })

// Schema for PIN poll path params
export const PlexPinPollParamsSchema = z.object({
  pinId: z.coerce.number(),
})

// Schema for PIN poll query params
export const PlexPinPollQuerySchema = z.object({
  clientId: z.string(),
})

export const PlexPinPollResponseSchema = z
  .object({
    authToken: z.string().nullable(),
    expiresIn: z.number(),
  })
  .meta({
    id: 'PlexPinPoll',
    description: 'The token once the PIN is approved, null until then',
  })

// Type exports
export type PlexPinResponse = z.infer<typeof PlexPinResponseSchema>
export type PlexPinPollParams = z.infer<typeof PlexPinPollParamsSchema>
export type PlexPinPollQuery = z.infer<typeof PlexPinPollQuerySchema>
export type PlexPinPollResponse = z.infer<typeof PlexPinPollResponseSchema>

// Re-export shared error schema with domain-specific alias
export { ErrorSchema as PlexPinErrorSchema }
export type PlexPinError = z.infer<typeof ErrorSchema>
