/**
 * Queue Processor
 *
 * Processes queued webhooks and dispatches notifications.
 */

import type { WebhookPayload } from '@root/schemas/notifications/webhook.schema.js'
import type { WebhookQueue } from '@root/types/webhook.types.js'
import type { NotificationService } from '@services/notification.service.js'
import type { FastifyBaseLogger } from 'fastify'
import {
  type EpisodeCheckerDeps,
  isRecentEpisode,
} from '../detection/episode-checker.js'
import {
  type PendingStoreDeps,
  type PendingWebhookParams,
  queuePendingWebhook,
} from '../persistence/pending-store.js'

export interface QueueProcessorDeps {
  logger: FastifyBaseLogger
  queue: WebhookQueue
  notifications: NotificationService
  episodeCheckerDeps: EpisodeCheckerDeps
  pendingStoreDeps: PendingStoreDeps
}

/**
 * Remove the season queue and clean up the show queue if empty
 */
function cleanupSeasonQueue(
  tvdbId: string,
  seasonNumber: number,
  queue: WebhookQueue,
  logger: FastifyBaseLogger,
): void {
  const showQueue = queue[tvdbId]
  if (!showQueue) return

  delete showQueue.seasons[seasonNumber]

  if (Object.keys(showQueue.seasons).length === 0) {
    delete queue[tvdbId]
    logger.debug({ tvdbId }, 'Removed empty queue')
  }
}

/**
 * Validate that the queue exists and has episodes to process
 */
function validateQueue(
  tvdbId: string,
  seasonNumber: number,
  queue: WebhookQueue,
  logger: FastifyBaseLogger,
): boolean {
  const showQueue = queue[tvdbId]

  if (!showQueue?.seasons[seasonNumber]) {
    logger.warn(
      { tvdbId, seasonNumber },
      'Attempted to process non-existent queue',
    )
    return false
  }

  const seasonQueue = showQueue.seasons[seasonNumber]
  const episodes = seasonQueue.episodes

  if (episodes.length === 0) {
    logger.warn({ tvdbId, seasonNumber }, 'Queue has no episodes to process')
    cleanupSeasonQueue(tvdbId, seasonNumber, queue, logger)
    return false
  }

  if (seasonQueue.timeoutId) {
    clearTimeout(seasonQueue.timeoutId)
  }

  return true
}

/**
 * Check if the season should be processed based on recency and notification state
 */
function shouldProcessSeason(
  tvdbId: string,
  seasonNumber: number,
  queue: WebhookQueue,
  episodeCheckerDeps: EpisodeCheckerDeps,
  logger: FastifyBaseLogger,
): boolean {
  const showQueue = queue[tvdbId]
  const seasonQueue = showQueue.seasons[seasonNumber]
  const episodes = seasonQueue.episodes

  const hasRecentEpisodes = episodes.some((ep) =>
    isRecentEpisode(ep.airDateUtc, episodeCheckerDeps),
  )

  if (seasonQueue.notifiedSeasons.has(seasonNumber) && !hasRecentEpisodes) {
    logger.info(
      { tvdbId, seasonNumber },
      'Season already notified and no recent episodes, clearing queue',
    )
    cleanupSeasonQueue(tvdbId, seasonNumber, queue, logger)
    return false
  }

  seasonQueue.notifiedSeasons.add(seasonNumber)
  return true
}

/**
 * Create a Sonarr webhook payload for the pending webhook system
 */
function createSonarrPayload(
  tvdbId: string,
  title: string,
  episodes: Array<{
    episodeNumber: number
    seasonNumber: number
    title: string
    overview?: string
    airDateUtc: string
  }>,
): WebhookPayload {
  return {
    eventType: 'Download',
    instanceName: 'Sonarr',
    series: {
      title,
      tvdbId: Number(tvdbId),
    },
    episodes: episodes,
    episodeFiles: episodes.map((_, idx) => ({
      id: idx,
      relativePath: '',
      quality: '',
      qualityVersion: 1,
      size: 0,
    })),
    release: {
      releaseType: 'bulk',
    },
    fileCount: episodes.length,
  }
}

/**
 * Process and dispatch all queued webhooks for a given TV show season.
 *
 * Determines whether queued episodes should trigger notifications based on
 * recency and prior notification state. If no watchlist matches are found,
 * enqueues a pending webhook for later processing.
 */
export async function processQueuedWebhooks(
  tvdbId: string,
  seasonNumber: number,
  deps: QueueProcessorDeps,
): Promise<void> {
  const { logger, queue, notifications, episodeCheckerDeps, pendingStoreDeps } =
    deps

  if (!validateQueue(tvdbId, seasonNumber, queue, logger)) {
    return
  }

  if (
    !shouldProcessSeason(
      tvdbId,
      seasonNumber,
      queue,
      episodeCheckerDeps,
      logger,
    )
  ) {
    return
  }

  const showQueue = queue[tvdbId]
  const seasonQueue = showQueue.seasons[seasonNumber]
  const episodes = seasonQueue.episodes
  const isBulkRelease = episodes.length > 1

  logger.info(
    `Processing queued webhooks: ${showQueue.title} S${seasonNumber} (${episodes.length} episodes)`,
  )
  logger.debug(
    {
      tvdbId,
      seasonNumber,
      episodeCount: episodes.length,
      isBulkRelease,
      title: showQueue.title,
    },
    'Queued webhooks processing details',
  )

  const mediaInfo = {
    type: 'show' as const,
    guid: `tvdb:${tvdbId}`,
    title: showQueue.title,
    episodes: episodes,
  }

  try {
    const { matchedCount } = await notifications.sendMediaAvailable(mediaInfo, {
      isBulkRelease,
      instanceId: seasonQueue.instanceId ?? undefined,
      instanceType: 'sonarr',
    })

    if (matchedCount === 0) {
      const sonarrPayload = createSonarrPayload(
        tvdbId,
        showQueue.title,
        episodes,
      )
      const pendingParams: PendingWebhookParams = {
        instanceType: 'sonarr',
        instanceId: seasonQueue.instanceId ?? null,
        guid: `tvdb:${tvdbId}`,
        title: showQueue.title,
        mediaType: 'show',
        payload: sonarrPayload,
      }

      await queuePendingWebhook(pendingParams, pendingStoreDeps)

      logger.info(
        { tvdbId, seasonNumber, episodeCount: episodes.length, matchedCount },
        'No watchlist matches found, queued to pending webhooks',
      )
    } else {
      logger.debug(
        { tvdbId, seasonNumber, episodeCount: episodes.length, matchedCount },
        'Watchlist matches found, notifications processed',
      )
    }
  } catch (error) {
    logger.error(
      { error, tvdbId, seasonNumber },
      'Error processing notifications from queue',
    )
  }

  cleanupSeasonQueue(tvdbId, seasonNumber, queue, logger)
}
