import { z } from 'zod'

export const PlexTestConnectionResponseSchema = z
  .object({
    success: z.boolean(),
    message: z.string(),
    url: z.string(),
    automatic: z.boolean(),
  })
  .meta({
    id: 'PlexTestConnectionResponse',
    description:
      'Plex server connection test result for the address Pulsarr uses',
  })
