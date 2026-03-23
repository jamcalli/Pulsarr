import { ErrorSchema } from '@root/schemas/common/error.schema.js'
import { z } from 'zod'

// Schema for PIN generation response
export const PlexPinResponseSchema = z.object({
  id: z.number(),
  code: z.string(),
  qr: z.string(),
  expiresAt: z.string(),
  clientId: z.string(),
})

// Schema for PIN poll path params
export const PlexPinPollParamsSchema = z.object({
  pinId: z.coerce.number(),
})

// Schema for PIN poll query params
export const PlexPinPollQuerySchema = z.object({
  clientId: z.string(),
})

// Schema for PIN poll response
export const PlexPinPollResponseSchema = z.object({
  authToken: z.string().nullable(),
  expiresIn: z.number(),
})

// Type exports
export type PlexPinResponse = z.infer<typeof PlexPinResponseSchema>
export type PlexPinPollParams = z.infer<typeof PlexPinPollParamsSchema>
export type PlexPinPollQuery = z.infer<typeof PlexPinPollQuerySchema>
export type PlexPinPollResponse = z.infer<typeof PlexPinPollResponseSchema>

// Re-export shared error schema with domain-specific alias
export { ErrorSchema as PlexPinErrorSchema }
export type PlexPinError = z.infer<typeof ErrorSchema>
