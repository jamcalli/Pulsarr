import { z } from 'zod'

const PlexInstanceResultSchema = z.object({
  id: z.number(),
  name: z.string(),
  success: z.boolean(),
  message: z.string(),
})

const PlexRemoveNotificationResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  results: z.object({
    radarr: z.array(PlexInstanceResultSchema),
    sonarr: z.array(PlexInstanceResultSchema),
  }),
})

const ErrorSchema = z.object({
  error: z.string(),
})

export const plexRemoveNotificationSchema = {
  summary: 'Remove Plex notifications',
  operationId: 'removePlexNotifications',
  description:
    'Remove Plex webhook notifications from Radarr and Sonarr instances',
  tags: ['Plex'],
  response: {
    200: PlexRemoveNotificationResponseSchema,
    400: ErrorSchema,
    500: ErrorSchema,
  },
}

export type PlexRemoveNotificationResponse = z.infer<
  typeof PlexRemoveNotificationResponseSchema
>
export type PlexInstanceResult = z.infer<typeof PlexInstanceResultSchema>
export type Error = z.infer<typeof ErrorSchema>
