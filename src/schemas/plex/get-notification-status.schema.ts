import { ErrorSchema } from '@root/schemas/common/error.schema.js'
import {
  type PlexNotificationResponse,
  PlexNotificationResponseSchema,
} from '@root/schemas/plex/plex-notification-result.schema.js'

export const plexGetNotificationStatusSchema = {
  summary: 'Get Plex notification status',
  operationId: 'getPlexNotificationStatus',
  description:
    'Check if Plex notifications are configured for Radarr and Sonarr instances',
  tags: ['Plex'],
  response: {
    200: PlexNotificationResponseSchema,
    400: ErrorSchema,
    500: ErrorSchema,
  },
}

export type PlexNotificationStatusResponse = PlexNotificationResponse
