import type { FastifyInstance } from 'fastify'
import { webhookQueue } from './queue-state.js'

interface UpgradeWebhookEvent {
  timestamp: number
  isUpgrade: boolean
}

/**
 * Initialize queue structure for a show if it doesn't exist
 */
function ensureShowQueue(tvdbId: string, fastify: FastifyInstance): void {
  if (!webhookQueue[tvdbId]) {
    fastify.log.debug(
      { tvdbId },
      'Initializing queue for upgrade check',
    )

    webhookQueue[tvdbId] = {
      seasons: {},
      title: '',
    }
  }
}

/**
 * Initialize season queue structure if it doesn't exist
 */
function ensureSeasonQueue(
  tvdbId: string,
  seasonNumber: number,
  instanceId: number | null,
  fastify: FastifyInstance,
): void {
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
}

/**
 * Record a webhook event in the upgrade tracker
 */
function recordWebhookEvent(
  tvdbId: string,
  seasonNumber: number,
  episodeNumber: number,
  isUpgrade: boolean,
): void {
  const seasonQueue = webhookQueue[tvdbId].seasons[seasonNumber]
  const webhookKey = `${seasonNumber}-${episodeNumber}`

  const currentWebhook: UpgradeWebhookEvent = {
    timestamp: Date.now(),
    isUpgrade,
  }

  const existingWebhooks = seasonQueue.upgradeTracker.get(webhookKey) || []
  seasonQueue.upgradeTracker.set(webhookKey, [
    ...existingWebhooks,
    currentWebhook,
  ])
}

/**
 * Clean up expired entries from the upgrade tracker
 */
function cleanExpiredEntries(
  tvdbId: string,
  seasonNumber: number,
  bufferTime: number,
  fastify: FastifyInstance,
): void {
  const seasonQueue = webhookQueue[tvdbId].seasons[seasonNumber]
  const now = Date.now()
  let cleanedEntries = 0

  for (const [key, webhooks] of seasonQueue.upgradeTracker.entries()) {
    const filtered = webhooks.filter(
      (w) => now - w.timestamp < bufferTime,
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
}

/**
 * Check if any recent webhooks indicate an upgrade
 */
function hasRecentUpgrade(
  tvdbId: string,
  seasonNumber: number,
  episodeNumber: number,
): boolean {
  const seasonQueue = webhookQueue[tvdbId].seasons[seasonNumber]
  const webhookKey = `${seasonNumber}-${episodeNumber}`
  const recentWebhooks = seasonQueue.upgradeTracker.get(webhookKey) || []

  return recentWebhooks.some((w) => w.isUpgrade)
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

  ensureShowQueue(tvdbId, fastify)
  ensureSeasonQueue(tvdbId, seasonNumber, instanceId, fastify)
  recordWebhookEvent(tvdbId, seasonNumber, episodeNumber, isUpgrade)
  cleanExpiredEntries(tvdbId, seasonNumber, fastify.config.upgradeBufferTime, fastify)

  // Wait briefly to allow for concurrent webhook events
  await new Promise((resolve) => setTimeout(resolve, 500))

  const hasUpgrade = hasRecentUpgrade(tvdbId, seasonNumber, episodeNumber)

  fastify.log.debug(
    {
      tvdbId,
      seasonNumber,
      episodeNumber,
      recentWebhooksCount: (webhookQueue[tvdbId].seasons[seasonNumber].upgradeTracker.get(`${seasonNumber}-${episodeNumber}`) || []).length,
      hasUpgrade,
    },
    'Upgrade check result',
  )

  return hasUpgrade
}
