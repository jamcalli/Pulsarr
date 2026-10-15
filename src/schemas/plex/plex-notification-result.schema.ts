import { z } from 'zod'

const PlexNotificationResultSchema = z
  .object({
    id: z.number(),
    name: z.string(),
    success: z.boolean(),
    message: z.string(),
  })
  .meta({
    id: 'PlexNotificationResult',
    description:
      'Whether one Radarr or Sonarr instance has the Plex Media Server connection, or the outcome of changing it',
  })

export const PlexNotificationResponseSchema = z
  .object({
    success: z.boolean(),
    message: z.string(),
    results: z.object({
      radarr: z.array(PlexNotificationResultSchema),
      sonarr: z.array(PlexNotificationResultSchema),
    }),
  })
  .meta({
    id: 'PlexNotificationResponse',
    description:
      'Per-instance Plex Media Server connection results for every Radarr and Sonarr',
  })

export type PlexNotificationResponse = z.infer<
  typeof PlexNotificationResponseSchema
>
