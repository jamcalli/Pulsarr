import type { FastifyInstance } from 'fastify'
import type {
  WebhookQueue,
  RecentWebhook,
  SeasonQueue,
} from '@root/types/webhook.types.js'

export const QUEUE_WAIT_TIME = 60 * 1000 // 1 minute
export const NEW_EPISODE_THRESHOLD = 48 * 60 * 60 * 1000 // 48 hours
export const UPGRADE_BUFFER_TIME = 2000 // 2 seconds buffer

export const webhookQueue: WebhookQueue = {}

export function isRecentEpisode(airDateUtc: string): boolean {
  const airDate = new Date(airDateUtc).getTime()
  const now = Date.now()
  return now - airDate <= NEW_EPISODE_THRESHOLD
}

export async function checkForUpgrade(
  tvdbId: string,
  seasonNumber: number,
  episodeNumber: number,
  isUpgrade: boolean,
  fastify: FastifyInstance,
): Promise<boolean> {
  const queue = webhookQueue[tvdbId]
  if (!queue?.seasons[seasonNumber]) {
    webhookQueue[tvdbId] = {
      seasons: {
        [seasonNumber]: {
          episodes: [],
          firstReceived: new Date(),
          lastUpdated: new Date(),
          notifiedSeasons: new Set(),
          timeoutId: setTimeout(() => {}, 0),
          upgradeTracker: new Map(),
        },
      },
      title: '',
    }
  }

  const seasonQueue = webhookQueue[tvdbId].seasons[seasonNumber]
  const webhookKey = `${seasonNumber}-${episodeNumber}`

  const currentWebhook: RecentWebhook = {
    timestamp: Date.now(),
    isUpgrade,
  }

  const existingWebhooks = seasonQueue.upgradeTracker.get(webhookKey) || []
  seasonQueue.upgradeTracker.set(webhookKey, [
    ...existingWebhooks,
    currentWebhook,
  ])

  const now = Date.now()
  for (const [key, webhooks] of seasonQueue.upgradeTracker.entries()) {
    const filtered = webhooks.filter(
      (w) => now - w.timestamp < UPGRADE_BUFFER_TIME,
    )
    if (filtered.length === 0) {
      seasonQueue.upgradeTracker.delete(key)
    } else {
      seasonQueue.upgradeTracker.set(key, filtered)
    }
  }

  await new Promise((resolve) => setTimeout(resolve, 500))

  const recentWebhooks = seasonQueue.upgradeTracker.get(webhookKey) || []
  return recentWebhooks.some((w) => w.isUpgrade)
}

export async function processQueuedWebhooks(
  tvdbId: string,
  seasonNumber: number,
  fastify: FastifyInstance,
) {
  const queue = webhookQueue[tvdbId]
  if (!queue?.seasons[seasonNumber]) return

  const seasonQueue = queue.seasons[seasonNumber]
  const episodes = seasonQueue.episodes

  clearTimeout(seasonQueue.timeoutId)

  const hasRecentEpisodes = episodes.some((ep) =>
    isRecentEpisode(ep.airDateUtc),
  )
  if (seasonQueue.notifiedSeasons.has(seasonNumber) && !hasRecentEpisodes) {
    delete queue.seasons[seasonNumber]
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
    },
    'Processing queued webhooks',
  )

  const mediaInfo = {
    type: 'show' as const,
    guid: `tvdb:${tvdbId}`,
    title: queue.title,
    episodes: episodes,
  }

  const notificationResults = await fastify.db.processNotifications(
    mediaInfo,
    isBulkRelease,
  )

  for (const result of notificationResults) {
    if (result.user.notify_discord && result.user.discord_id) {
      await fastify.discord.sendDirectMessage(
        result.user.discord_id,
        result.notification,
      )
    }
  }

  delete queue.seasons[seasonNumber]

  if (Object.keys(queue.seasons).length === 0) {
    delete webhookQueue[tvdbId]
  }
}
