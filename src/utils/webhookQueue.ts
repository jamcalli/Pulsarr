import type { WebhookPayload } from '@root/schemas/notifications/webhook.schema.js'
import type { WebhookQueue } from '@root/types/webhook.types.js'
import { processContentNotifications } from '@root/utils/notification-processor.js'
import type { FastifyInstance } from 'fastify'

export const webhookQueue: WebhookQueue = {}

// Upgrade tracker uses config.upgradeBufferTime for TTL

/**
 * Determines whether a specific episode is already present in the webhook queue for a given TVDB ID and season.
 *
 * @param tvdbId - The TVDB identifier for the show.
 * @param seasonNumber - The season number of the episode.
 * @param episodeNumber - The episode number within the season.
 * @returns `true` if the episode is already queued; otherwise, `false`.
 */
export function isEpisodeAlreadyQueued(
  tvdbId: string,
  seasonNumber: number,
  episodeNumber: number,
): boolean {
  if (!webhookQueue[tvdbId]?.seasons[seasonNumber]?.episodes) {
    return false
  }

  return webhookQueue[tvdbId].seasons[seasonNumber].episodes.some(
    (episode) =>
      episode.seasonNumber === seasonNumber &&
      episode.episodeNumber === episodeNumber,
  )
}

/**
 * Queues a pending webhook in the database when no matching media items are found.
 *
 * Stores the webhook with an expiration time for later processing, ensuring that duplicate webhook resends are avoided even if database insertion fails.
 *
 * @param data - Metadata and payload for the webhook to be queued.
 */
export async function queuePendingWebhook(
  fastify: FastifyInstance,
  data: {
    instanceType: 'radarr' | 'sonarr'
    instanceId: number | null
    guid: string
    title: string
    mediaType: 'movie' | 'show'
    payload: WebhookPayload
  },
): Promise<void> {
  const cfgMaxAge = Number(fastify.pendingWebhooks?.config?.maxAge)
  const maxAgeMinutes =
    Number.isFinite(cfgMaxAge) && cfgMaxAge > 0 ? cfgMaxAge : 10
  const expires = new Date(Date.now() + maxAgeMinutes * 60_000)

  try {
    await fastify.db.createPendingWebhook({
      instance_type: data.instanceType,
      instance_id: data.instanceId,
      guid: data.guid,
      title: data.title,
      media_type: data.mediaType,
      payload: data.payload,
      expires_at: expires,
    })

    fastify.log.debug(
      {
        guid: data.guid,
        instanceType: data.instanceType,
        instanceId: data.instanceId,
        mediaType: data.mediaType,
        title: data.title,
        expiresAt: expires.toISOString(),
      },
      'Queued pending webhook (no matching items)',
    )
  } catch (error) {
    fastify.log.error(
      { error, guid: data.guid, title: data.title },
      `Failed to create pending webhook for ${data.mediaType}, but returning success to prevent resends`,
    )
    // Still return success to prevent webhook resends
  }
}

/**
 * Determines whether an episode's air date is within the configured recent threshold.
 *
 * Returns false if {@link airDateUtc} is missing or invalid.
 *
 * @param airDateUtc - The UTC air date of the episode as an ISO string.
 * @returns True if the episode aired within the recent threshold; otherwise, false.
 */
export function isRecentEpisode(
  airDateUtc: string,
  fastify: FastifyInstance,
): boolean {
  try {
    if (!airDateUtc) {
      fastify.log.warn('Missing airDateUtc in isRecentEpisode check')
      return false
    }

    const airDate = new Date(airDateUtc).getTime()
    const now = Date.now()
    const threshold = fastify.config.newEpisodeThreshold
    const age = now - airDate
    const isRecent = age <= threshold

    fastify.log.debug(
      {
        airDateUtc,
        airDateMs: airDate,
        nowMs: now,
        ageMs: age,
        thresholdMs: threshold,
        isRecent,
      },
      'Checking if episode is recent',
    )

    return isRecent
  } catch (error) {
    fastify.log.error(
      { error, airDateUtc },
      'Error checking if episode is recent',
    )
    return false
  }
}

/**
 * Determines if a recent upgrade event has occurred for a specific episode within a configured buffer time.
 *
 * Tracks webhook events for the given TVDB ID, season, and episode, recording upgrade status and cleaning up expired entries. Waits briefly to allow for concurrent webhook events before evaluating if any recent event indicates an upgrade.
 *
 * @param tvdbId - The TVDB ID of the show
 * @param seasonNumber - The season number of the episode
 * @param episodeNumber - The episode number to check
 * @param isUpgrade - Whether the current event is an upgrade
 * @param instanceId - The instance identifier, or null if not applicable
 * @returns `true` if an upgrade event was detected within the buffer time; otherwise, `false`
 */
export async function checkForUpgrade(
  tvdbId: string,
  seasonNumber: number,
  episodeNumber: number,
  isUpgrade: boolean,
  instanceId: number | null,
  fastify: FastifyInstance,
): Promise<boolean> {
  fastify.log.debug(
    { tvdbId, seasonNumber, episodeNumber, isUpgrade },
    'Checking for upgrade activity',
  )

  if (!webhookQueue[tvdbId]) {
    fastify.log.debug(
      { tvdbId, seasonNumber },
      'Initializing queue for upgrade check',
    )

    webhookQueue[tvdbId] = {
      seasons: {},
      title: '',
    }
  }

  if (!webhookQueue[tvdbId].seasons[seasonNumber]) {
    fastify.log.debug(
      { tvdbId, seasonNumber },
      'Initializing season for upgrade check',
    )

    webhookQueue[tvdbId].seasons[seasonNumber] = {
      episodes: [],
      firstReceived: new Date(),
      lastUpdated: new Date(),
      notifiedSeasons: new Set(),
      timeoutId: setTimeout(() => {
        fastify.log.debug(
          { tvdbId, seasonNumber },
          'Placeholder timeout in upgrade check',
        )
      }, 0),
      upgradeTracker: new Map(),
      instanceId: instanceId,
    }
  }

  const seasonQueue = webhookQueue[tvdbId].seasons[seasonNumber]
  const webhookKey = `${seasonNumber}-${episodeNumber}`

  const currentWebhook = {
    timestamp: Date.now(),
    isUpgrade,
  }

  const existingWebhooks = seasonQueue.upgradeTracker.get(webhookKey) || []
  seasonQueue.upgradeTracker.set(webhookKey, [
    ...existingWebhooks,
    currentWebhook,
  ])

  // Clean up expired entries (simple time-based expiry)
  const now = Date.now()
  let cleanedEntries = 0

  for (const [key, webhooks] of seasonQueue.upgradeTracker.entries()) {
    const filtered = webhooks.filter(
      (w) => now - w.timestamp < fastify.config.upgradeBufferTime,
    )

    if (filtered.length === 0) {
      seasonQueue.upgradeTracker.delete(key)
      cleanedEntries++
    } else {
      seasonQueue.upgradeTracker.set(key, filtered)
    }
  }

  if (cleanedEntries > 0) {
    fastify.log.debug(
      { cleanedEntries, tvdbId, seasonNumber },
      'Cleaned old entries from upgrade tracker',
    )
  }

  await new Promise((resolve) => setTimeout(resolve, 500))

  const recentWebhooks = seasonQueue.upgradeTracker.get(webhookKey) || []
  const hasUpgrade = recentWebhooks.some((w) => w.isUpgrade)

  fastify.log.debug(
    {
      tvdbId,
      seasonNumber,
      episodeNumber,
      recentWebhooksCount: recentWebhooks.length,
      hasUpgrade,
    },
    'Upgrade check result',
  )

  return hasUpgrade
}

/**
 * Processes and dispatches all queued webhook notifications for a specific TV show season.
 *
 * Validates the queue for the given TVDB ID and season, determines if notifications should be sent based on episode recency and prior notification status, and dispatches notifications using a centralized processor. If no watchlist matches are found, queues the webhook as pending for future processing. Cleans up the queue after processing.
 *
 * @param tvdbId - The TVDB ID of the show.
 * @param seasonNumber - The season number to process.
 */
export async function processQueuedWebhooks(
  tvdbId: string,
  seasonNumber: number,
  fastify: FastifyInstance,
) {
  const queue = webhookQueue[tvdbId]
  if (!queue?.seasons[seasonNumber]) {
    fastify.log.warn(
      { tvdbId, seasonNumber },
      'Attempted to process non-existent queue',
    )
    return
  }

  const seasonQueue = queue.seasons[seasonNumber]
  const episodes = seasonQueue.episodes

  if (episodes.length === 0) {
    fastify.log.warn(
      { tvdbId, seasonNumber },
      'Queue has no episodes to process',
    )
    delete queue.seasons[seasonNumber]

    if (Object.keys(queue.seasons).length === 0) {
      delete webhookQueue[tvdbId]
    }
    return
  }

  if (seasonQueue.timeoutId) {
    clearTimeout(seasonQueue.timeoutId)
  }

  const hasRecentEpisodes = episodes.some((ep) =>
    isRecentEpisode(ep.airDateUtc, fastify),
  )

  if (seasonQueue.notifiedSeasons.has(seasonNumber) && !hasRecentEpisodes) {
    fastify.log.info(
      { tvdbId, seasonNumber },
      'Season already notified and no recent episodes, clearing queue',
    )
    delete queue.seasons[seasonNumber]

    if (Object.keys(queue.seasons).length === 0) {
      delete webhookQueue[tvdbId]
    }
    return
  }

  seasonQueue.notifiedSeasons.add(seasonNumber)

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
      hasRecentEpisodes,
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
    // Process notifications (including public content) using centralized function
    // Tautulli notifications are now handled within the centralized processor
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

    // Check if we should queue as pending (only if no watchlist matches)
    if (matchedCount === 0) {
      // No matches found, queue to pending_webhooks
      const sonarrPayload: WebhookPayload = {
        eventType: 'Download',
        instanceName: 'Sonarr',
        series: {
          title: queue.title,
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

  delete queue.seasons[seasonNumber]

  if (Object.keys(queue.seasons).length === 0) {
    delete webhookQueue[tvdbId]
    fastify.log.debug({ tvdbId }, 'Removed empty queue')
  }
}
