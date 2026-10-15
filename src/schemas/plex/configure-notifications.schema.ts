import { ErrorSchema as CommonErrorSchema } from '@root/schemas/common/error.schema.js'
import { PlexNotificationResponseSchema } from '@root/schemas/plex/plex-notification-result.schema.js'
import { PORT_RANGE } from '@root/schemas/shared/port.js'
import { z } from 'zod'

export const PLEX_DEFAULT_PORT = 32400

const PlexNotificationConfigSchema = z
  .object({
    plexToken: z
      .string()
      .min(1, { error: 'Plex token is required' })
      .optional(),
    plexHost: z.string().min(1, { error: 'Plex host is required' }).optional(),
    plexPort: z
      .number()
      .int()
      .min(PORT_RANGE.min)
      .max(PORT_RANGE.max)
      .optional(),
    useSsl: z.boolean().optional(),
  })
  .meta({
    id: 'PlexNotificationConfigPayload',
    description:
      'Plex Media Server connection to add to every Radarr and Sonarr instance, left out to use the saved Plex server and linked token',
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
    400: CommonErrorSchema,
    500: CommonErrorSchema,
  },
}

export type { PlexNotificationResponse } from '@root/schemas/plex/plex-notification-result.schema.js'
// Export schema for client use
export { PlexNotificationConfigSchema }
