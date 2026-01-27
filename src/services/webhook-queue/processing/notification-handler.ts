/**
 * Notification Handler
 *
 * Handles notification decisions for webhook processing.
 */

import type { SonarrEpisode } from '@root/schemas/notifications/webhook.schema.js'
import type { RadarrInstance } from '@root/types/radarr.types.js'
import type { SonarrInstance } from '@root/types/sonarr.types.js'
import type { WatchlistStatus } from '@root/types/watchlist-status.types.js'
import type { FastifyBaseLogger } from 'fastify'
import type { PendingWebhookParams } from '../persistence/index.js'

export interface NotificationHandlerDeps {
  logger: FastifyBaseLogger
  getWatchlistItemsByGuid: (
    guid: string,
  ) => Promise<Array<{ id: number | string; title: string }>>
  sendMediaAvailable: (
    mediaInfo: {
      type: 'show'
      guid: string
      title: string
      episodes: SonarrEpisode[]
    },
    options: {
      isBulkRelease: boolean
      sequential: boolean
      instanceId?: number
      instanceType?: 'sonarr'
    },
  ) => Promise<{ matchedCount: number }>
  queuePendingWebhook: (params: PendingWebhookParams) => Promise<void>
}

export interface SyncSuppressionDeps {
  logger: FastifyBaseLogger
  isRadarrItemSyncing: (itemId: number, instanceId: number) => Promise<boolean>
  updateWatchlistRadarrInstanceStatus: (
    itemId: number,
    instanceId: number,
    status: WatchlistStatus,
    error: string | null,
  ) => Promise<void>
  updateRadarrSyncingStatus: (
    itemId: number,
    instanceId: number,
    syncing: boolean,
  ) => Promise<void>
}

/**
 * Send notification immediately or queue if no watchlist match
 */
export async function notifyOrQueueShow(
  tvdbId: string,
  title: string,
  episodes: SonarrEpisode[],
  instance: SonarrInstance | null,
  deps: NotificationHandlerDeps,
): Promise<void> {
  const {
    logger,
    getWatchlistItemsByGuid,
    sendMediaAvailable,
    queuePendingWebhook,
  } = deps
  const tvdbGuid = `tvdb:${tvdbId}`
  const matchingItems = await getWatchlistItemsByGuid(tvdbGuid)

  if (matchingItems.length === 0) {
    logger.info(
      { title, tvdbId, episodeCount: episodes.length },
      'Show not in watchlist yet, queuing webhook for later processing',
    )

    // Reconstruct Sonarr payload for pending webhook storage
    const sonarrPayload = {
      eventType: 'Download' as const,
      instanceName: instance?.name ?? 'Sonarr',
      series: { title, tvdbId: Number(tvdbId) },
      episodes,
      episodeFiles: episodes.map((_, idx) => ({
        id: idx,
        relativePath: '',
        quality: '',
        qualityVersion: 1,
        size: 0,
      })),
      release: { releaseType: 'bulk' },
      fileCount: episodes.length,
    }

    await queuePendingWebhook({
      instanceType: 'sonarr',
      instanceId: instance?.id ?? null,
      guid: tvdbGuid,
      title,
      mediaType: 'show',
      payload: sonarrPayload,
    })
    return
  }

  logger.info(
    {
      series: title,
      tvdbId,
      episodeCount: episodes.length,
      instanceName: instance?.name,
    },
    'Processing episode download',
  )

  await sendMediaAvailable(
    { type: 'show', guid: tvdbGuid, title, episodes },
    {
      isBulkRelease: episodes.length > 1,
      sequential: true,
      instanceId: instance?.id,
      instanceType: 'sonarr',
    },
  )
}

/**
 * Check if notification should be suppressed due to active sync status
 */
export async function shouldSuppressRadarrNotification(
  matchingItems: Array<{ id: number | string; title: string }>,
  instance: RadarrInstance,
  deps: SyncSuppressionDeps,
): Promise<boolean> {
  const {
    logger,
    isRadarrItemSyncing,
    updateWatchlistRadarrInstanceStatus,
    updateRadarrSyncingStatus,
  } = deps

  try {
    for (const item of matchingItems) {
      const itemId =
        typeof item.id === 'string' ? Number.parseInt(item.id, 10) : item.id

      if (Number.isNaN(itemId)) continue

      const isSyncing = await isRadarrItemSyncing(itemId, instance.id)

      if (isSyncing) {
        logger.info(
          { title: item.title, instanceName: instance.name },
          'Suppressing notification for synced item',
        )

        await updateWatchlistRadarrInstanceStatus(
          itemId,
          instance.id,
          'grabbed',
          null,
        )

        await updateRadarrSyncingStatus(itemId, instance.id, false)

        return true
      }
    }
  } catch (error) {
    logger.debug(
      { error, instanceId: instance.id },
      'Error checking sync status for Radarr webhook',
    )
  }
  return false
}
