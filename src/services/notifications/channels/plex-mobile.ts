import type {
  DeliveryResult,
  NotificationTestOutcome,
} from '@root/types/notification.types.js'
import { errorMessage } from '@utils/error-message.js'
import type { FastifyBaseLogger } from 'fastify'
import { TEST_NOTIFICATION } from '../templates/labels.js'

const PLEX_NOTIFICATIONS_URL =
  'https://notifications.plex.tv/api/v1/notifications'
const PLEX_NOTIFICATION_TIMEOUT = 15000

export interface PlexMobileNotificationDeps {
  logger: FastifyBaseLogger
  plexToken: string
  serverMachineId: string
  serverName: string
}

export interface PlexMobilePayload {
  type: 'movie' | 'episode' | 'season'
  title: string
  year?: string
  grandparentTitle?: string
  seasonNumber?: number
  episodeNumber?: number
  episodeCount?: number
  ratingKey: string
  userIds: number[]
}

function buildMetadata(payload: PlexMobilePayload): Record<string, string> {
  switch (payload.type) {
    case 'movie':
      return {
        type: 'movie',
        title: payload.title,
        ...(payload.year ? { year: payload.year } : {}),
      }
    case 'episode':
      return {
        type: 'episode',
        title: payload.title,
        ...(payload.grandparentTitle
          ? { grandparentTitle: payload.grandparentTitle }
          : {}),
        ...(payload.episodeNumber != null
          ? { index: String(payload.episodeNumber) }
          : {}),
        ...(payload.seasonNumber != null
          ? { parentIndex: String(payload.seasonNumber) }
          : {}),
      }
    case 'season':
      return {
        type: 'show',
        title: payload.grandparentTitle ?? payload.title,
      }
  }
}

interface PlexNotificationBody {
  group: 'media'
  identifier: 'tv.plex.notification.library.new'
  to: number[]
  data: {
    provider: { identifier: string; title: string }
    count?: number
  }
  metadata: Record<string, string>
  uri?: string
  play?: boolean
}

type PlexPostResult =
  | { ok: true }
  | { ok: false; reason: string; status?: number }

function libraryNewBody(
  userIds: number[],
  deps: PlexMobileNotificationDeps,
  metadata: Record<string, string>,
  count?: number,
): PlexNotificationBody {
  return {
    group: 'media',
    identifier: 'tv.plex.notification.library.new',
    to: userIds,
    data: {
      provider: {
        identifier: deps.serverMachineId,
        title: deps.serverName,
      },
      ...(count != null ? { count } : {}),
    },
    metadata,
  }
}

async function postNotification(
  body: PlexNotificationBody,
  deps: PlexMobileNotificationDeps,
): Promise<PlexPostResult> {
  try {
    const response = await fetch(PLEX_NOTIFICATIONS_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Plex-Token': deps.plexToken,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(PLEX_NOTIFICATION_TIMEOUT),
    })

    if (!response.ok) {
      let responseBody: string | undefined
      try {
        responseBody = await response.text()
      } catch {}
      deps.logger.debug(
        {
          status: response.status,
          statusText: response.statusText,
          body: responseBody,
        },
        'Plex mobile notification API returned non-OK status',
      )
      return {
        ok: false,
        reason: `${response.status} ${response.statusText}`,
        status: response.status,
      }
    }

    return { ok: true }
  } catch (error) {
    deps.logger.debug({ error }, 'Failed to send Plex mobile notification')
    return { ok: false, reason: errorMessage(error) }
  }
}

export async function sendPlexMobileNotification(
  payload: PlexMobilePayload,
  deps: PlexMobileNotificationDeps,
): Promise<DeliveryResult> {
  const body: PlexNotificationBody = {
    ...libraryNewBody(
      payload.userIds,
      deps,
      buildMetadata(payload),
      payload.type === 'season' ? payload.episodeCount : undefined,
    ),
    uri: `server://${deps.serverMachineId}/com.plexapp.plugins.library/library/metadata/${payload.ratingKey}`,
    play: false,
  }

  deps.logger.debug(
    { to: payload.userIds, type: payload.type, title: payload.title },
    'Sending Plex mobile notification',
  )

  const result = await postNotification(body, deps)
  if (!result.ok) return { ok: false, reason: result.reason }
  deps.logger.debug(
    { to: payload.userIds, title: payload.title },
    'Plex mobile notification sent',
  )
  return { ok: true }
}

/** Sends a library.new push with placeholder movie metadata and no link to open. */
export async function sendPlexMobileTestNotification(
  plexUserId: number,
  deps: PlexMobileNotificationDeps,
): Promise<NotificationTestOutcome> {
  const result = await postNotification(
    libraryNewBody([plexUserId], deps, {
      type: 'movie',
      title: TEST_NOTIFICATION.title,
    }),
    deps,
  )
  if (result.ok) return { success: true }
  if (result.status !== undefined) {
    return {
      success: false,
      statusCode: result.status,
      error: `Plex rejected the notification with HTTP ${result.status}.`,
    }
  }
  return {
    success: false,
    error: 'Pulsarr could not reach the Plex notification service.',
  }
}
