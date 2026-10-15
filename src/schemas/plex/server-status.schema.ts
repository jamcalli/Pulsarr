import { ErrorSchema } from '@root/schemas/common/error.schema.js'
import { PlexProbeFailureSchema } from '@root/schemas/plex/connection-probe.schema.js'
import { z } from 'zod'

export const PlexServerStatusSchema = z
  .object({
    reachable: z.boolean(),
    url: z.string(),
    automatic: z.boolean(),
    latencyMs: z.number().int().nullable(),
    failure: PlexProbeFailureSchema.nullable(),
    serverName: z.string().nullable(),
  })
  .meta({
    id: 'PlexServerStatus',
    description:
      'Whether Pulsarr reaches the Plex server address it currently uses',
  })

export { ErrorSchema as PlexServerStatusErrorSchema }
