/**
 * Queue Manager
 *
 * Manages the in-memory webhook queue state.
 */

import type { SonarrEpisode } from '@root/schemas/notifications/webhook.schema.js'
import type { WebhookQueue } from '@root/types/webhook.types.js'
import type { FastifyBaseLogger } from 'fastify'
import type { TimeoutManagerDeps } from './timeout-manager.js'
import {
  clearSeasonTimeout,
  createQueueTimeout,
  resetSeasonTimeout,
} from './timeout-manager.js'

export interface QueueManagerDeps {
  logger: FastifyBaseLogger
}

export interface EpisodeQueueDeps {
  logger: FastifyBaseLogger
  queue: WebhookQueue
  queueWaitTime: number
  processQueuedWebhooks: (tvdbId: string, seasonNumber: number) => Promise<void>
  fetchExpectedEpisodeCount: (
    tvdbId: string,
    seasonNumber: number,
  ) => Promise<number | null>
  isSeasonComplete: (tvdbId: string, seasonNumber: number) => boolean
}

/**
 * Determines whether a specific episode is already present in the webhook queue.
 */
export function isEpisodeAlreadyQueued(
  tvdbId: string,
  seasonNumber: number,
  episodeNumber: number,
  queue: WebhookQueue,
): boolean {
  if (!queue[tvdbId]?.seasons[seasonNumber]?.episodes) {
    return false
  }

  return queue[tvdbId].seasons[seasonNumber].episodes.some(
    (episode) =>
      episode.seasonNumber === seasonNumber &&
      episode.episodeNumber === episodeNumber,
  )
}

/**
 * Clear all pending timeouts in the queue
 */
export function clearAllTimeouts(
  queue: WebhookQueue,
  deps: QueueManagerDeps,
): void {
  const { logger } = deps

  for (const [tvdbId, show] of Object.entries(queue)) {
    for (const [seasonNumber, season] of Object.entries(show.seasons)) {
      if (season.timeoutId) {
        clearTimeout(season.timeoutId)
        logger.debug({ tvdbId, seasonNumber }, 'Cleared queue timeout')
      }
    }
  }
}

/**
 * Initialize show queue structure if it doesn't exist
 */
export function ensureShowQueue(
  tvdbId: string,
  title: string,
  queue: WebhookQueue,
  logger: FastifyBaseLogger,
): void {
  if (!queue[tvdbId]) {
    logger.debug({ tvdbId }, 'Initializing webhook queue for show')
    queue[tvdbId] = { seasons: {}, title }
  }
}

/**
 * Initialize season queue with timeout
 * Returns true if this is a new season
 */
export async function ensureSeasonQueue(
  tvdbId: string,
  seasonNumber: number,
  instanceId: number | null,
  deps: EpisodeQueueDeps,
): Promise<boolean> {
  const { logger, queue, fetchExpectedEpisodeCount } = deps
  const isNewSeason = !queue[tvdbId].seasons[seasonNumber]

  if (isNewSeason) {
    logger.debug({ tvdbId, seasonNumber }, 'Initializing season in queue')

    const timeoutDeps: TimeoutManagerDeps = {
      logger: deps.logger,
      queue: deps.queue,
      queueWaitTime: deps.queueWaitTime,
      processQueuedWebhooks: deps.processQueuedWebhooks,
    }

    queue[tvdbId].seasons[seasonNumber] = {
      episodes: [],
      firstReceived: new Date(),
      lastUpdated: new Date(),
      notifiedSeasons: new Set(),
      instanceId,
      timeoutId: createQueueTimeout(tvdbId, seasonNumber, timeoutDeps),
    }

    // Fetch expected episode count for completion detection
    await fetchExpectedEpisodeCount(tvdbId, seasonNumber).catch((error) => {
      logger.debug(
        { error, tvdbId, seasonNumber },
        'Failed to fetch expected episode count',
      )
    })
  }

  return isNewSeason
}

/**
 * Add a single episode to the queue with timeout management
 */
export async function addEpisodeToQueue(
  tvdbId: string,
  seasonNumber: number,
  episode: SonarrEpisode,
  instanceId: number | null,
  deps: EpisodeQueueDeps,
): Promise<void> {
  const { logger, queue, isSeasonComplete, processQueuedWebhooks } = deps

  const isNewSeason = await ensureSeasonQueue(
    tvdbId,
    seasonNumber,
    instanceId,
    deps,
  )

  // Check for duplicate
  if (
    isEpisodeAlreadyQueued(tvdbId, seasonNumber, episode.episodeNumber, queue)
  ) {
    logger.debug(
      { tvdbId, seasonNumber, episodeNumber: episode.episodeNumber },
      'Episode already queued, skipping duplicate',
    )
    return
  }

  // Add episode
  const seasonQueue = queue[tvdbId].seasons[seasonNumber]
  seasonQueue.episodes.push(episode)
  seasonQueue.lastUpdated = new Date()

  // Check season completion - process immediately if complete
  if (isSeasonComplete(tvdbId, seasonNumber)) {
    clearSeasonTimeout(tvdbId, seasonNumber, queue)
    logger.info(
      {
        tvdbId,
        seasonNumber,
        episodeCount: seasonQueue.episodes.length,
        series: queue[tvdbId].title,
      },
      'Season complete, processing immediately',
    )
    await processQueuedWebhooks(tvdbId, seasonNumber)
    return
  }

  // Extend timeout for existing seasons
  if (!isNewSeason) {
    const timeoutDeps: TimeoutManagerDeps = {
      logger: deps.logger,
      queue: deps.queue,
      queueWaitTime: deps.queueWaitTime,
      processQueuedWebhooks: deps.processQueuedWebhooks,
    }
    resetSeasonTimeout(tvdbId, seasonNumber, timeoutDeps)
  }

  logger.debug(
    {
      tvdbId,
      seasonNumber,
      episodeCount: seasonQueue.episodes.length,
      expectedCount: seasonQueue.expectedEpisodeCount,
    },
    'Added episode to queue',
  )
}

/**
 * Add multiple episodes to the queue
 */
export async function addEpisodesToQueue(
  tvdbId: string,
  seasonNumber: number,
  episodes: SonarrEpisode[],
  instanceId: number | null,
  deps: EpisodeQueueDeps,
): Promise<void> {
  const { logger, queue, isSeasonComplete, processQueuedWebhooks } = deps

  const isNewSeason = await ensureSeasonQueue(
    tvdbId,
    seasonNumber,
    instanceId,
    deps,
  )

  // Filter out duplicates
  const newEpisodes = episodes.filter(
    (episode) =>
      !isEpisodeAlreadyQueued(
        tvdbId,
        seasonNumber,
        episode.episodeNumber,
        queue,
      ),
  )

  if (newEpisodes.length === 0) {
    logger.debug(
      { tvdbId, seasonNumber, duplicatesSkipped: episodes.length },
      'All episodes already queued, skipping duplicates',
    )
    return
  }

  // Add episodes
  const seasonQueue = queue[tvdbId].seasons[seasonNumber]
  seasonQueue.episodes.push(...newEpisodes)
  seasonQueue.lastUpdated = new Date()

  // Check season completion - process immediately if complete
  if (isSeasonComplete(tvdbId, seasonNumber)) {
    clearSeasonTimeout(tvdbId, seasonNumber, queue)
    logger.info(
      {
        tvdbId,
        seasonNumber,
        episodeCount: seasonQueue.episodes.length,
        series: queue[tvdbId].title,
      },
      'Season complete, processing immediately',
    )
    await processQueuedWebhooks(tvdbId, seasonNumber)
    return
  }

  // Extend timeout for existing seasons
  if (!isNewSeason) {
    const timeoutDeps: TimeoutManagerDeps = {
      logger: deps.logger,
      queue: deps.queue,
      queueWaitTime: deps.queueWaitTime,
      processQueuedWebhooks: deps.processQueuedWebhooks,
    }
    resetSeasonTimeout(tvdbId, seasonNumber, timeoutDeps)
  }

  logger.debug(
    {
      tvdbId,
      seasonNumber,
      totalEpisodes: seasonQueue.episodes.length,
      expectedCount: seasonQueue.expectedEpisodeCount,
      justAdded: newEpisodes.length,
      duplicatesSkipped: episodes.length - newEpisodes.length,
      series: queue[tvdbId].title,
    },
    'Added episodes to queue',
  )
}
