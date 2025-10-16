import type { WebhookPayload } from '@root/schemas/notifications/webhook.schema.js'
import { processContentNotifications } from '@root/utils/notification-processor.js'
import type { FastifyInstance } from 'fastify'
import { isRecentEpisode } from './episode-checker.js'
import { queuePendingWebhook } from './pending-webhook.js'
import { webhookQueue } from './queue-state.js'

/**
 * Remove the season queue and clean up the show queue if empty
 */
function cleanupSeasonQueue(
  tvdbId: string,
  seasonNumber: number,
  fastify: FastifyInstance,
): void {
  const queue = webhookQueue[tvdbId]

  delete queue.seasons[seasonNumber]

  if (Object.keys(queue.seasons).length === 0) {
    delete webhookQueue[tvdbId]
    fastify.log.debug({ tvdbId }, 'Removed empty queue')
  }
}

/**
 * Validate that the queue exists and has episodes to process
 */
function validateQueue(
  tvdbId: string,
  seasonNumber: number,
  fastify: FastifyInstance,
): boolean {
  const queue = webhookQueue[tvdbId]

  if (!queue?.seasons[seasonNumber]) {
    fastify.log.warn(
      { tvdbId, seasonNumber },
      'Attempted to process non-existent queue',
    )
    return false
  }

  const seasonQueue = queue.seasons[seasonNumber]
  const episodes = seasonQueue.episodes

  if (episodes.length === 0) {
    fastify.log.warn(
      { tvdbId, seasonNumber },
      'Queue has no episodes to process',
    )
    cleanupSeasonQueue(tvdbId, seasonNumber, fastify)
    return false
  }

  // Clear any timeout for this season
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
  fastify: FastifyInstance,
): boolean {
  const queue = webhookQueue[tvdbId]
  const seasonQueue = queue.seasons[seasonNumber]
  const episodes = seasonQueue.episodes

  const hasRecentEpisodes = episodes.some((ep) =>
    isRecentEpisode(ep.airDateUtc, fastify),
  )

  if (seasonQueue.notifiedSeasons.has(seasonNumber) && !hasRecentEpisodes) {
    fastify.log.info(
      { tvdbId, seasonNumber },
      'Season already notified and no recent episodes, clearing queue',
    )
    cleanupSeasonQueue(tvdbId, seasonNumber, fastify)
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
 * Determines whether queued episodes for the given TVDB show/season should trigger notifications
 * (based on recency and prior notification state), invokes the centralized notification processor,
 * and if no watchlist matches are found, enqueues a pending webhook for later processing. Cleans up
 * the in-memory queue for the season (and removes the show entry when empty).
 *
 * @param tvdbId - TVDB identifier for the show.
 * @param seasonNumber - Season number to process.
 */
export async function processQueuedWebhooks(
  tvdbId: string,
  seasonNumber: number,
  fastify: FastifyInstance,
): Promise<void> {
  // Validate queue exists and has episodes
  if (!validateQueue(tvdbId, seasonNumber, fastify)) {
    return
  }

  // Check if season should be processed
  if (!shouldProcessSeason(tvdbId, seasonNumber, fastify)) {
    return
  }

  const queue = webhookQueue[tvdbId]
  const seasonQueue = queue.seasons[seasonNumber]
  const episodes = seasonQueue.episodes
  const isBulkRelease = episodes.length > 1

  fastify.log.info(
    `Processing queued webhooks: ${queue.title} S${seasonNumber} (${episodes.length} episodes)`,
  )
  fastify.log.debug(
    {
      tvdbId,
      seasonNumber,
      episodeCount: episodes.length,
      isBulkRelease,
      title: queue.title,
    },
    'Queued webhooks processing details',
  )

  const mediaInfo = {
    type: 'show' as const,
    guid: `tvdb:${tvdbId}`,
    title: queue.title,
    episodes: episodes,
  }

  try {
    // Process notifications using centralized function
    const { matchedCount } = await processContentNotifications(
      fastify,
      mediaInfo,
      isBulkRelease,
      {
        logger: fastify.log,
        instanceId: seasonQueue.instanceId ?? undefined,
        instanceType: 'sonarr',
      },
    )

    // Queue as pending if no watchlist matches
    if (matchedCount === 0) {
      const sonarrPayload = createSonarrPayload(tvdbId, queue.title, episodes)

      await queuePendingWebhook(fastify, {
        instanceType: 'sonarr',
        instanceId: seasonQueue.instanceId ?? null,
        guid: `tvdb:${tvdbId}`,
        title: queue.title,
        mediaType: 'show',
        payload: sonarrPayload,
      })

      fastify.log.info(
        { tvdbId, seasonNumber, episodeCount: episodes.length, matchedCount },
        'No watchlist matches found, queued to pending webhooks',
      )
    } else {
      fastify.log.debug(
        { tvdbId, seasonNumber, episodeCount: episodes.length, matchedCount },
        'Watchlist matches found, notifications processed',
      )
    }
  } catch (error) {
    fastify.log.error(
      { error, tvdbId, seasonNumber },
      'Error processing notifications from queue',
    )
  }

  // Clean up queue
  cleanupSeasonQueue(tvdbId, seasonNumber, fastify)
}
