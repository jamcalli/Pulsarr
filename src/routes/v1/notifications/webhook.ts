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
    episodes: z.infer<typeof SonarrEpisodeSchema>[]
  }
  receivedAt: Date
}

interface WebhookQueue {
  [seriesId: string]: {
    episodes: QueuedWebhook[]
    timeoutId: NodeJS.Timeout
  }
}

const QUEUE_WAIT_TIME = 20 * 1000
const webhookQueue: WebhookQueue = {}

async function processQueuedWebhooks(tvdbId: string, fastify: FastifyInstance) {
  const queue = webhookQueue[tvdbId]
  if (!queue) return

  const episodes = queue.episodes
  delete webhookQueue[tvdbId]

  const isBulkRelease = episodes.length > 1

  fastify.log.info(
    {
      tvdbId,
      episodeCount: episodes.length,
      isBulkRelease,
    },
    'Processing queued webhooks',
  )

  const mediaInfo = episodes[0].mediaInfo
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
    if (result.user.notify_email) {
      // TODO: Implement email notification service
    }
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
        if (body.instanceName === 'Radarr') {
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

        const mediaInfo = {
          type: 'show' as const,
          guid: `tvdb:${body.series.tvdbId}`,
          title: body.series.title,
          episodes: body.episodes,
        }

        const tvdbId = body.series.tvdbId.toString()

        if (!webhookQueue[tvdbId]) {
          webhookQueue[tvdbId] = {
            episodes: [],
            timeoutId: setTimeout(() => {
              processQueuedWebhooks(tvdbId, fastify)
            }, QUEUE_WAIT_TIME),
          }
        }

        webhookQueue[tvdbId].episodes.push({
          mediaInfo,
          receivedAt: new Date(),
        })

        fastify.log.info(
          {
            tvdbId,
            episodeNumber: body.episodes[0].episodeNumber,
            queueLength: webhookQueue[tvdbId].episodes.length,
          },
          'Queued webhook for processing',
        )

        return { success: true }
      } catch (error) {
        fastify.log.error({ error }, 'Error processing webhook')
        throw reply.internalServerError('Error processing webhook')
      }
    },
  )
}

export default plugin
