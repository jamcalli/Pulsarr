import type { FastifyInstance } from 'fastify'
import type { WebhookQueue } from '@root/types/webhook.types.js'

export const QUEUE_WAIT_TIME = 60 * 1000 // 1 minute
export const NEW_EPISODE_THRESHOLD = 48 * 60 * 60 * 1000 // 48 hours

export const webhookQueue: WebhookQueue = {}

export function isRecentEpisode(airDateUtc: string): boolean {
  const airDate = new Date(airDateUtc).getTime()
  const now = Date.now()
  return now - airDate <= NEW_EPISODE_THRESHOLD
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
