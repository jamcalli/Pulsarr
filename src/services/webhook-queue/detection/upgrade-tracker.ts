/**
 * Upgrade Tracker
 *
 * Tracks webhook events to detect upgrade activity and prevent duplicate notifications.
 */

import type { WebhookQueue } from '@root/types/webhook.types.js'
import type { FastifyBaseLogger } from 'fastify'

export interface UpgradeTrackerDeps {
  logger: FastifyBaseLogger
  queue: WebhookQueue
  upgradeBufferTime: number
}

interface UpgradeWebhookEvent {
  timestamp: number
  isUpgrade: boolean
}

/**
 * Initialize queue structure for a show if it doesn't exist
 */
function ensureShowQueue(
  tvdbId: string,
  queue: WebhookQueue,
  logger: FastifyBaseLogger,
): void {
  if (!queue[tvdbId]) {
    logger.debug({ tvdbId }, 'Initializing queue for upgrade check')
    queue[tvdbId] = {
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
  queue: WebhookQueue,
  logger: FastifyBaseLogger,
): void {
  if (!queue[tvdbId].seasons[seasonNumber]) {
    logger.debug(
      { tvdbId, seasonNumber },
      'Initializing season for upgrade check',
    )
    queue[tvdbId].seasons[seasonNumber] = {
      episodes: [],
      firstReceived: new Date(),
      lastUpdated: new Date(),
      notifiedSeasons: new Set(),
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
  queue: WebhookQueue,
): void {
  const seasonQueue = queue[tvdbId].seasons[seasonNumber]
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
  queue: WebhookQueue,
  logger: FastifyBaseLogger,
): void {
  const seasonQueue = queue[tvdbId].seasons[seasonNumber]
  const now = Date.now()
  let cleanedEntries = 0

  for (const [key, webhooks] of seasonQueue.upgradeTracker.entries()) {
    const filtered = webhooks.filter((w) => now - w.timestamp < bufferTime)

    if (filtered.length === 0) {
      seasonQueue.upgradeTracker.delete(key)
      cleanedEntries++
    } else {
      seasonQueue.upgradeTracker.set(key, filtered)
    }
  }

  if (cleanedEntries > 0) {
    logger.debug(
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
  queue: WebhookQueue,
): boolean {
  const seasonQueue = queue[tvdbId].seasons[seasonNumber]
  const webhookKey = `${seasonNumber}-${episodeNumber}`
  const recentWebhooks = seasonQueue.upgradeTracker.get(webhookKey) || []

  return recentWebhooks.some((w) => w.isUpgrade)
}

/**
 * Determines if a recent upgrade event has occurred for a specific episode.
 *
 * Tracks webhook events for the given TVDB ID, season, and episode, recording
 * upgrade status and cleaning up expired entries. Waits briefly to allow for
 * concurrent webhook events before evaluating if any recent event indicates an upgrade.
 */
export async function checkForUpgrade(
  tvdbId: string,
  seasonNumber: number,
  episodeNumber: number,
  isUpgrade: boolean,
  instanceId: number | null,
  deps: UpgradeTrackerDeps,
): Promise<boolean> {
  const { logger, queue, upgradeBufferTime } = deps

  logger.debug(
    { tvdbId, seasonNumber, episodeNumber, isUpgrade },
    'Checking for upgrade activity',
  )

  ensureShowQueue(tvdbId, queue, logger)
  ensureSeasonQueue(tvdbId, seasonNumber, instanceId, queue, logger)
  recordWebhookEvent(tvdbId, seasonNumber, episodeNumber, isUpgrade, queue)
  cleanExpiredEntries(tvdbId, seasonNumber, upgradeBufferTime, queue, logger)

  // Webhook deduplication: Wait 500ms to collect near-simultaneous webhooks
  await new Promise((resolve) => setTimeout(resolve, 500))

  const hasUpgrade = hasRecentUpgrade(
    tvdbId,
    seasonNumber,
    episodeNumber,
    queue,
  )

  logger.debug(
    {
      tvdbId,
      seasonNumber,
      episodeNumber,
      recentWebhooksCount: (
        queue[tvdbId].seasons[seasonNumber].upgradeTracker.get(
          `${seasonNumber}-${episodeNumber}`,
        ) || []
      ).length,
      hasUpgrade,
    },
    'Upgrade check result',
  )

  return hasUpgrade
}
