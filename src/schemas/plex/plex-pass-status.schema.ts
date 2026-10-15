import { ErrorSchema } from '@root/schemas/common/error.schema.js'
import { z } from 'zod'

export const PlexPassStatusResponseSchema = z
  .object({
    hasPlexPass: z.boolean(),
  })
  .meta({
    id: 'PlexPassStatus',
    description: 'Whether the linked Plex account has an active Plex Pass',
  })

export type PlexPassStatusResponse = z.infer<
  typeof PlexPassStatusResponseSchema
>

// Re-export shared error schema with domain-specific alias
export { ErrorSchema as PlexPassStatusErrorSchema }
export type PlexPassStatusError = z.infer<typeof ErrorSchema>
