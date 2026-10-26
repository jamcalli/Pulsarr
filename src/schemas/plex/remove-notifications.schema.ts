import { ErrorSchema } from '@root/schemas/common/error.schema.js'
import { PlexNotificationResponseSchema } from '@root/schemas/plex/plex-notification-result.schema.js'

export const plexRemoveNotificationSchema = {
  summary: 'Remove Plex notifications',
  operationId: 'removePlexNotifications',
  description:
    'Remove Plex webhook notifications from Radarr and Sonarr instances',
  tags: ['Plex'],
  response: {
    200: PlexNotificationResponseSchema,
    400: ErrorSchema,
    500: ErrorSchema,
  },
}
