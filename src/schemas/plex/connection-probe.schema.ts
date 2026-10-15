import { z } from 'zod'

export const PlexProbeFailureSchema = z
  .enum([
    'dns',
    'refused',
    'unreachable',
    'reset',
    'tls',
    'timeout',
    'unauthorized',
    'http',
  ])
  .meta({
    id: 'PlexProbeFailure',
    description: 'Why Pulsarr could not reach a Plex server connection',
  })

export type PlexProbeFailure = z.infer<typeof PlexProbeFailureSchema>
