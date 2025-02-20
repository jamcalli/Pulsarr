import type { z } from 'zod'
import type { FastifyPluginAsync, FastifyInstance } from 'fastify'
import {
  WebhookPayloadSchema,
  WebhookResponseSchema,
  ErrorSchema,
  type SonarrEpisodeSchema,
  type WebhookPayload,
  type WebhookResponse,
} from '@root/schemas/notifications/webhook.schema.js'

interface QueuedWebhook {
  mediaInfo: {
    type: 'show'
    guid: string
    title: string
    episodes: {
      seasonNumber: number
      episodeNumber: number
      title: string
      overview?: string
      airDateUtc: string
    }[]
  }
  receivedAt: Date
  lastUpdated: Date
}

interface SeasonQueue {
  episodes: QueuedWebhook['mediaInfo']['episodes']
  firstReceived: Date
  lastUpdated: Date
  timeoutId: NodeJS.Timeout
  notifiedSeasons: Set<number>
}

interface WebhookQueue {
  [seriesId: string]: {
    seasons: {
      [seasonNumber: number]: SeasonQueue
    }
    title: string
  }
}

const QUEUE_WAIT_TIME = 60 * 1000 // 1 minute
const NEW_EPISODE_THRESHOLD = 48 * 60 * 60 * 1000 // 48 hours in milliseconds
const webhookQueue: WebhookQueue = {}

function isRecentEpisode(airDateUtc: string): boolean {
  const airDate = new Date(airDateUtc).getTime()
  const now = Date.now()
  return (now - airDate) <= NEW_EPISODE_THRESHOLD
}

async function processQueuedWebhooks(tvdbId: string, seasonNumber: number, fastify: FastifyInstance) {
  const queue = webhookQueue[tvdbId]
  if (!queue?.seasons[seasonNumber]) return

  const seasonQueue = queue.seasons[seasonNumber]
  const episodes = seasonQueue.episodes

  clearTimeout(seasonQueue.timeoutId)

  const hasRecentEpisodes = episodes.some(ep => isRecentEpisode(ep.airDateUtc))
  if (seasonQueue.notifiedSeasons.has(seasonNumber) && !hasRecentEpisodes) {
    delete queue.seasons[seasonNumber]
    return
  }

  seasonQueue.notifiedSeasons.add(seasonNumber)

  const isBulkRelease = episodes.length > 1
  
  fastify.log.info({
    tvdbId,
    seasonNumber,
    episodeCount: episodes.length,
    isBulkRelease,
    hasRecentEpisodes
  }, 'Processing queued webhooks')

  const mediaInfo = {
    type: 'show' as const,
    guid: `tvdb:${tvdbId}`,
    title: queue.title,
    episodes: episodes,
  }

  const notificationResults = await fastify.db.processNotifications(
    mediaInfo,
    isBulkRelease
  )

  for (const result of notificationResults) {
    if (result.user.notify_discord && result.user.discord_id) {
      await fastify.discord.sendDirectMessage(
        result.user.discord_id,
        result.notification
      )
    }
  }

  delete queue.seasons[seasonNumber]

  if (Object.keys(queue.seasons).length === 0) {
    delete webhookQueue[tvdbId]
  }
}

const plugin: FastifyPluginAsync = async (fastify) => {
  fastify.post<{
    Body: WebhookPayload
    Reply: WebhookResponse
  }>(
    '/webhook',
    {
      schema: {
        body: {
          ...WebhookPayloadSchema,
          examples: [
            {
              instanceName: 'Radarr',
              movie: {
                id: 1,
                title: 'Example Movie',
                imdbId: 'tt1234567',
                tmdbId: 123456,
              },
            },
            {
              instanceName: 'Sonarr',
              series: {
                id: 1,
                title: 'Example Series',
                tvdbId: 123456,
                imdbId: 'tt1234567',
              },
              episodes: [
                {
                  episodeNumber: 1,
                  seasonNumber: 1,
                  title: 'Pilot',
                  overview: 'First episode of the series',
                  airDate: '2025-01-01',
                  airDateUtc: '2025-01-01T00:00:00Z',
                },
              ],
            },
          ],
        },
        description:
          'Process webhooks from Radarr (movies) or Sonarr (TV series)',
        response: {
          200: WebhookResponseSchema,
          400: ErrorSchema,
          500: ErrorSchema,
        },
        tags: ['Notifications'],
      },
    },
    async (request, reply) => {
      
      const { body } = request

      try {

        if ('eventType' in body && body.eventType === 'Test') {
          fastify.log.info('Received test webhook')
          return { success: true }
        }

        if (body.instanceName === 'Radarr' && 'movie' in body) {
          const mediaInfo = {
            type: 'movie' as const,
            guid: `tmdb:${body.movie.tmdbId}`,
            title: body.movie.title,
          }

          const notificationResults = await fastify.db.processNotifications(
            mediaInfo,
            false,
          )

          for (const result of notificationResults) {
            if (result.user.notify_discord && result.user.discord_id) {
              await fastify.discord.sendDirectMessage(
                result.user.discord_id,
                result.notification,
              )
            }
          }

          return { success: true }
        }

        if (
          body.instanceName === 'Sonarr' &&
          'series' in body &&
          'episodes' in body &&
          body.episodes
        ) {
          const tvdbId = body.series.tvdbId.toString()
          const seasonNumber = body.episodes[0].seasonNumber
          const recentEpisodes = body.episodes.filter(ep => isRecentEpisode(ep.airDateUtc))

          if (!webhookQueue[tvdbId]) {
            webhookQueue[tvdbId] = {
              seasons: {},
              title: body.series.title
            }
          }
        
          if (recentEpisodes.length > 0) {
            const mediaInfo = {
              type: 'show' as const,
              guid: `tvdb:${tvdbId}`,
              title: body.series.title,
              episodes: recentEpisodes,
            }
        
            const notificationResults = await fastify.db.processNotifications(
              mediaInfo,
              recentEpisodes.length > 1
            )
        
            for (const result of notificationResults) {
              if (result.user.notify_discord && result.user.discord_id) {
                await fastify.discord.sendDirectMessage(
                  result.user.discord_id,
                  result.notification
                )
              }
            }
          }
        
          const nonRecentEpisodes = body.episodes.filter(ep => !isRecentEpisode(ep.airDateUtc))
          if (nonRecentEpisodes.length > 0) {
            if (!webhookQueue[tvdbId].seasons[seasonNumber]) {
              webhookQueue[tvdbId].seasons[seasonNumber] = {
                episodes: [],
                firstReceived: new Date(),
                lastUpdated: new Date(),
                notifiedSeasons: new Set(),
                timeoutId: setTimeout(() => {
                  processQueuedWebhooks(tvdbId, seasonNumber, fastify)
                }, QUEUE_WAIT_TIME)
              }
            } else {
              clearTimeout(webhookQueue[tvdbId].seasons[seasonNumber].timeoutId)
              webhookQueue[tvdbId].seasons[seasonNumber].timeoutId = setTimeout(() => {
                processQueuedWebhooks(tvdbId, seasonNumber, fastify)
              }, QUEUE_WAIT_TIME)
            }
        
            webhookQueue[tvdbId].seasons[seasonNumber].episodes.push(...nonRecentEpisodes)
            webhookQueue[tvdbId].seasons[seasonNumber].lastUpdated = new Date()
          }
        
          return { success: true }
        }

        throw new Error('Invalid webhook payload')
      } catch (error) {
        fastify.log.error({ error }, 'Error processing webhook')
        throw reply.internalServerError('Error processing webhook')
      }
    },
  )
}

export default plugin
