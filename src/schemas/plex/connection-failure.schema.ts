import { z } from 'zod'

export const PlexConnectionFailureCodeSchema = z
  .enum(['unreachable', 'certificate', 'auth', 'invalid'])
  .meta({
    id: 'PlexConnectionFailureCode',
    description: 'Why a Plex server connection check failed',
  })

export type PlexConnectionFailureCode = z.infer<
  typeof PlexConnectionFailureCodeSchema
>
