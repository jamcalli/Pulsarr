import { PlexConnectionFailureCodeSchema } from '@root/schemas/plex/connection-failure.schema.js'
import { z } from 'zod'

export const PlexTestConnectionResponseSchema = z
  .object({
    success: z.boolean(),
    message: z.string(),
    code: PlexConnectionFailureCodeSchema.nullable(),
    url: z.string(),
    automatic: z.boolean(),
  })
  .meta({
    id: 'PlexTestConnectionResponse',
    description:
      'Plex server connection test result for the address Pulsarr uses, code is null on success',
  })
