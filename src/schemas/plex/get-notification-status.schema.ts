import { z } from 'zod'

const PlexInstanceResultSchema = z.object({
  id: z.number(),
  name: z.string(),
  success: z.boolean(),
  message: z.string(),
})

const PlexNotificationStatusResponseSchema = z.object({
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

export const plexGetNotificationStatusSchema = {
  tags: ['Plex'],
  response: {
    200: PlexNotificationStatusResponseSchema,
    400: ErrorSchema,
    500: ErrorSchema,
  },
}

export type PlexNotificationStatusResponse = z.infer<
  typeof PlexNotificationStatusResponseSchema
>
export type PlexInstanceResult = z.infer<typeof PlexInstanceResultSchema>
export type Error = z.infer<typeof ErrorSchema>
