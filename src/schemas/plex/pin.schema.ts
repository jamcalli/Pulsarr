import { ErrorSchema } from '@root/schemas/common/error.schema.js'
import { z } from 'zod'

export const PlexPinResponseSchema = z.object({
  id: z.number(),
  code: z.string(),
  qr: z.string(),
  expiresAt: z.string(),
  clientId: z.string(),
})

export const PlexPinPollParamsSchema = z.object({
  pinId: z.coerce.number(),
})

export const PlexPinPollQuerySchema = z.object({
  clientId: z.string(),
})

export const PlexPinPollResponseSchema = z.object({
  authToken: z.string().nullable(),
  expiresIn: z.number(),
})

export type PlexPinResponse = z.infer<typeof PlexPinResponseSchema>
export type PlexPinPollParams = z.infer<typeof PlexPinPollParamsSchema>
export type PlexPinPollQuery = z.infer<typeof PlexPinPollQuerySchema>
export type PlexPinPollResponse = z.infer<typeof PlexPinPollResponseSchema>

export { ErrorSchema as PlexPinErrorSchema }
export type PlexPinError = z.infer<typeof ErrorSchema>
