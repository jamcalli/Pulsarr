import type { FastifyPluginAsync, FastifyInstance } from 'fastify'
import {
  WebhookPayloadSchema,
  WebhookResponseSchema,
  ErrorSchema,
  type WebhookPayload,
  type WebhookResponse,
} from '@root/schemas/notifications/webhook.schema.js'
import {
  isRecentEpisode,
  processQueuedWebhooks,
  webhookQueue,
  QUEUE_WAIT_TIME,
} from '@root/utils/webhookQueue.js'

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
          const recentEpisodes = body.episodes.filter((ep) =>
            isRecentEpisode(ep.airDateUtc),
          )

          if (!webhookQueue[tvdbId]) {
            webhookQueue[tvdbId] = {
              seasons: {},
              title: body.series.title,
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
              recentEpisodes.length > 1,
            )

            for (const result of notificationResults) {
              if (result.user.notify_discord && result.user.discord_id) {
                await fastify.discord.sendDirectMessage(
                  result.user.discord_id,
                  result.notification,
                )
              }
            }
          }

          const nonRecentEpisodes = body.episodes.filter(
            (ep) => !isRecentEpisode(ep.airDateUtc),
          )
          if (nonRecentEpisodes.length > 0) {
            if (!webhookQueue[tvdbId].seasons[seasonNumber]) {
              webhookQueue[tvdbId].seasons[seasonNumber] = {
                episodes: [],
                firstReceived: new Date(),
                lastUpdated: new Date(),
                notifiedSeasons: new Set(),
                timeoutId: setTimeout(() => {
                  processQueuedWebhooks(tvdbId, seasonNumber, fastify)
                }, QUEUE_WAIT_TIME),
              }
            } else {
              clearTimeout(webhookQueue[tvdbId].seasons[seasonNumber].timeoutId)
              webhookQueue[tvdbId].seasons[seasonNumber].timeoutId = setTimeout(
                () => {
                  processQueuedWebhooks(tvdbId, seasonNumber, fastify)
                },
                QUEUE_WAIT_TIME,
              )
            }

            webhookQueue[tvdbId].seasons[seasonNumber].episodes.push(
              ...nonRecentEpisodes,
            )
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
