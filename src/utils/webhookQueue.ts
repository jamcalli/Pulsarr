import type { FastifyInstance } from 'fastify'
import type { WebhookQueue, RecentWebhook } from '@root/types/webhook.types.js'
import type { WebhookPayload } from '@root/schemas/notifications/webhook.schema.js'

export const webhookQueue: WebhookQueue = {}

/**
 * Helper function to queue a pending webhook when no matching items are found
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
  const maxAgeMinutes = fastify.pendingWebhooks?.config?.maxAge || 10
  const expires = new Date()
  expires.setMinutes(expires.getMinutes() + maxAgeMinutes)

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

    fastify.log.info(
      `No matching items found for ${data.guid}, queued webhook for later processing`,
    )
  } catch (error) {
    fastify.log.error(
      { error, guid: data.guid, title: data.title },
      `Failed to create pending webhook for ${data.mediaType}, but returning success to prevent resends`,
    )
    // Still return success to prevent webhook resends
  }
}

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

export async function checkForUpgrade(
  tvdbId: string,
  seasonNumber: number,
  episodeNumber: number,
  isUpgrade: boolean,
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
    {
      tvdbId,
      seasonNumber,
      episodeCount: episodes.length,
      isBulkRelease,
      hasRecentEpisodes,
      title: queue.title,
    },
    'Processing queued webhooks',
  )

  const mediaInfo = {
    type: 'show' as const,
    guid: `tvdb:${tvdbId}`,
    title: queue.title,
    episodes: episodes,
  }

  try {
    const notificationResults = await fastify.db.processNotifications(
      mediaInfo,
      isBulkRelease,
    )

    fastify.log.info(
      { tvdbId, seasonNumber, recipientCount: notificationResults.length },
      'Processed notifications from queue',
    )

    for (const result of notificationResults) {
      if (result.user.notify_discord && result.user.discord_id) {
        try {
          const sent = await fastify.discord.sendDirectMessage(
            result.user.discord_id,
            result.notification,
          )

          fastify.log.info(
            {
              userId: result.user.discord_id,
              username: result.user.name,
              success: sent,
            },
            'Sent Discord notification',
          )
        } catch (error) {
          fastify.log.error(
            { error, userId: result.user.discord_id },
            'Failed to send Discord notification',
          )
        }
      }

      if (result.user.notify_apprise) {
        try {
          const sent = await fastify.apprise.sendMediaNotification(
            result.user,
            result.notification,
          )

          fastify.log.info(
            {
              userId: result.user.id,
              username: result.user.name,
              success: sent,
            },
            'Sent Apprise notification',
          )
        } catch (error) {
          fastify.log.error(
            { error, userId: result.user.id },
            'Failed to send Apprise notification',
          )
        }
      }
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
