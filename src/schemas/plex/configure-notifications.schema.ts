import { z } from 'zod'

const PlexNotificationConfigSchema = z.object({
  plexToken: z.string().min(1, 'Plex token is required'),
  plexHost: z.string().min(1, 'Plex host is required'),
  plexPort: z.number().int().positive().default(32400),
  useSsl: z.boolean().default(false),
})

const PlexInstanceResultSchema = z.object({
  id: z.number(),
  name: z.string(),
  success: z.boolean(),
  message: z.string(),
})

const PlexNotificationResponseSchema = z.object({
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

export const plexConfigNotificationSchema = {
  summary: 'Configure Plex notifications',
  operationId: 'configurePlexNotifications',
  description:
    'Configure Plex webhook notifications for Radarr and Sonarr instances',
  tags: ['Plex'],
  body: PlexNotificationConfigSchema,
  response: {
    200: PlexNotificationResponseSchema,
    400: ErrorSchema,
    500: ErrorSchema,
  },
}

export type PlexNotificationConfig = z.infer<
  typeof PlexNotificationConfigSchema
>
export type PlexNotificationResponse = z.infer<
  typeof PlexNotificationResponseSchema
>
export type PlexInstanceResult = z.infer<typeof PlexInstanceResultSchema>
export type PlexConfigurationError = z.infer<typeof ErrorSchema>
