/**
 * Plex Mobile Channel
 *
 * Pure function for sending push notifications via the Plex notification API.
 * No state, no class dependencies — just HTTP POST to notifications.plex.tv.
 */

import type { FastifyBaseLogger } from 'fastify'

const PLEX_NOTIFICATIONS_URL =
  'https://notifications.plex.tv/api/v1/notifications'
const PLEX_NOTIFICATION_TIMEOUT = 15000

export interface PlexMobileNotificationDeps {
  log: FastifyBaseLogger
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

export async function sendPlexMobileNotification(
  payload: PlexMobilePayload,
  deps: PlexMobileNotificationDeps,
): Promise<boolean> {
  try {
    const body: Record<string, unknown> = {
      group: 'media',
      identifier: 'tv.plex.notification.library.new',
      to: payload.userIds,
      data: {
        provider: {
          identifier: deps.serverMachineId,
          title: deps.serverName,
        },
        ...(payload.type === 'season' && payload.episodeCount != null
          ? { count: payload.episodeCount }
          : {}),
      },
      metadata: buildMetadata(payload),
      uri: `server://${deps.serverMachineId}/com.plexapp.plugins.library/library/metadata/${payload.ratingKey}`,
      play: false,
    }

    deps.log.debug(
      { to: payload.userIds, type: payload.type, title: payload.title },
      'Sending Plex mobile notification',
    )

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
      deps.log.warn(
        { status: response.status, statusText: response.statusText },
        'Plex mobile notification API returned non-OK status',
      )
      return false
    }

    deps.log.debug(
      { to: payload.userIds, title: payload.title },
      'Plex mobile notification sent successfully',
    )
    return true
  } catch (error) {
    deps.log.error({ error }, 'Failed to send Plex mobile notification')
    return false
  }
}
