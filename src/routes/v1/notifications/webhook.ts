import type { FastifyPluginAsync } from 'fastify'
import {
  WebhookPayloadSchema,
  WebhookResponseSchema,
  WebhookQuerySchema,
  ErrorSchema,
  type WebhookPayload,
  type WebhookResponse,
  type WebhookQuery,
} from '@root/schemas/notifications/webhook.schema.js'
import {
  isRecentEpisode,
  processQueuedWebhooks,
  webhookQueue,
  checkForUpgrade,
  queuePendingWebhook,
  isEpisodeAlreadyQueued,
} from '@root/utils/webhookQueue.js'
import {
  processContentNotifications,
  isWebhookProcessable,
} from '@root/utils/notification-processor.js'

const plugin: FastifyPluginAsync = async (fastify) => {
  fastify.post<{
    Body: WebhookPayload
    Reply: WebhookResponse
    Querystring: WebhookQuery
  }>(
    '/webhook',
    {
      schema: {
        summary: 'Process media webhook',
        operationId: 'processMediaWebhook',
        description:
          'Process webhooks from Radarr (movies) or Sonarr (TV series) for media notifications',
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
        querystring: WebhookQuerySchema,
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
      const instanceId = request.query.instanceId
      let instance = null

      if (instanceId) {
        // Determine instance type based on payload structure
        if ('series' in body && 'episodes' in body) {
          instance = await fastify.db.getSonarrInstanceByIdentifier(instanceId)
          fastify.log.debug(
            {
              instanceId,
              foundInstance: !!instance,
              instanceName: instance?.name,
              baseUrl: instance?.baseUrl,
            },
            'Sonarr instance lookup result',
          )
        } else if ('movie' in body) {
          instance = await fastify.db.getRadarrInstanceByIdentifier(instanceId)
          fastify.log.debug(
            {
              instanceId,
              foundInstance: !!instance,
              instanceName: instance?.name,
              baseUrl: instance?.baseUrl,
            },
            'Radarr instance lookup result',
          )
        }
      }

      try {
        if ('eventType' in body && body.eventType === 'Test') {
          fastify.log.debug('Received test webhook')
          return { success: true }
        }

        // Apply webhook deduplication
        if (!isWebhookProcessable(body, fastify.log)) {
          fastify.log.debug(
            {
              instanceName: body.instanceName,
              eventType: 'eventType' in body ? body.eventType : 'unknown',
              isUpgrade: 'isUpgrade' in body ? body.isUpgrade : false,
            },
            'Webhook skipped by deduplication filter',
          )
          return { success: true }
        }

        fastify.log.info(
          {
            instanceName: body.instanceName,
            eventType: 'eventType' in body ? body.eventType : 'unknown',
            contentTitle:
              'movie' in body
                ? body.movie.title
                : 'series' in body
                  ? body.series.title
                  : 'unknown',
          },
          'Webhook passed deduplication and will be processed',
        )

        if ('movie' in body) {
          const tmdbGuid = `tmdb:${body.movie.tmdbId}`
          const matchingItems =
            await fastify.db.getWatchlistItemsByGuid(tmdbGuid)

          // If no matching items, queue webhook for later processing
          if (matchingItems.length === 0) {
            await queuePendingWebhook(fastify, {
              instanceType: 'radarr',
              instanceId: instance?.id ?? null,
              guid: tmdbGuid,
              title: body.movie.title,
              mediaType: 'movie',
              payload: body,
            })
            return { success: true }
          }

          if (instance) {
            try {
              for (const item of matchingItems) {
                const itemId =
                  typeof item.id === 'string'
                    ? Number.parseInt(item.id, 10)
                    : item.id

                if (!Number.isNaN(itemId)) {
                  const isSyncing = await fastify.db.isRadarrItemSyncing(
                    itemId,
                    instance.id,
                  )

                  if (isSyncing) {
                    fastify.log.info(
                      {
                        title: item.title,
                        instanceName: instance.name,
                      },
                      'Suppressing notification for synced item',
                    )

                    await fastify.db.updateWatchlistRadarrInstanceStatus(
                      itemId,
                      instance.id,
                      'grabbed',
                      null,
                    )

                    await fastify.db.updateRadarrSyncingStatus(
                      itemId,
                      instance.id,
                      false,
                    )

                    return { success: true }
                  }
                }
              }
            } catch (error) {
              fastify.log.debug(
                { error, tmdbId: body.movie.tmdbId, instanceId: instance.id },
                'Error checking sync status for Radarr webhook',
              )
            }
          }

          const mediaInfo = {
            type: 'movie' as const,
            guid: `tmdb:${body.movie.tmdbId}`,
            title: body.movie.title,
          }

          await processContentNotifications(fastify, mediaInfo, false, {
            sequential: true,
            instanceId: instance?.id,
            instanceType: 'radarr',
          })

          return { success: true }
        }

        if ('series' in body && 'episodes' in body && body.episodes) {
          const tvdbId = body.series.tvdbId.toString()
          const seasonNumber = body.episodes[0].seasonNumber
          const episodeNumber = body.episodes[0].episodeNumber

          fastify.log.info(
            {
              webhook: 'sonarr',
              tvdbId,
              season: seasonNumber,
              episode: episodeNumber,
              hasEpisodeFile: 'episodeFile' in body,
              hasEpisodeFiles: 'episodeFiles' in body,
              isUpgrade: body.isUpgrade === true,
              episodeCount: body.episodes.length,
              eventType: body.eventType,
            },
            'Received Sonarr webhook',
          )

          if ('episodeFile' in body && !('episodeFiles' in body)) {
            const isCompleteDownload =
              body.eventType === 'Download' &&
              body.episodeFile &&
              body.isUpgrade !== true

            if (isCompleteDownload) {
              fastify.log.info(
                { tvdbId, season: seasonNumber, episode: episodeNumber },
                'Processing individual episode completion',
              )

              if (!webhookQueue[tvdbId]) {
                webhookQueue[tvdbId] = {
                  seasons: {},
                  title: body.series.title,
                }
              }

              const isRecentEp = isRecentEpisode(
                body.episodes[0].airDateUtc,
                fastify,
              )

              if (isRecentEp) {
                const tvdbGuid = `tvdb:${tvdbId}`
                const matchingItems =
                  await fastify.db.getWatchlistItemsByGuid(tvdbGuid)

                // If no matching items, queue webhook for later processing
                if (matchingItems.length === 0) {
                  await queuePendingWebhook(fastify, {
                    instanceType: 'sonarr',
                    instanceId: instance?.id ?? null,
                    guid: tvdbGuid,
                    title: body.series.title,
                    mediaType: 'show',
                    payload: body,
                  })
                  return { success: true }
                }

                const mediaInfo = {
                  type: 'show' as const,
                  guid: `tvdb:${tvdbId}`,
                  title: body.series.title,
                  episodes: [body.episodes[0]],
                }

                await processContentNotifications(fastify, mediaInfo, false, {
                  sequential: true,
                  instanceId: instance?.id,
                  instanceType: 'sonarr',
                })
              } else {
                if (!webhookQueue[tvdbId].seasons[seasonNumber]) {
                  webhookQueue[tvdbId].seasons[seasonNumber] = {
                    episodes: [],
                    firstReceived: new Date(),
                    lastUpdated: new Date(),
                    notifiedSeasons: new Set(),
                    upgradeTracker: new Map(),
                    instanceId: instance?.id ?? null,
                    timeoutId: setTimeout(() => {
                      processQueuedWebhooks(tvdbId, seasonNumber, fastify)
                    }, fastify.config.queueWaitTime),
                  }
                }

                // Check for duplicate episode before adding
                if (
                  !isEpisodeAlreadyQueued(tvdbId, seasonNumber, episodeNumber)
                ) {
                  webhookQueue[tvdbId].seasons[seasonNumber].episodes.push(
                    body.episodes[0],
                  )
                  fastify.log.info(
                    {
                      tvdbId,
                      seasonNumber,
                      episodeCount:
                        webhookQueue[tvdbId].seasons[seasonNumber].episodes
                          .length,
                    },
                    'Added single episode to queue',
                  )
                } else {
                  fastify.log.debug(
                    {
                      tvdbId,
                      seasonNumber,
                      episodeNumber,
                    },
                    'Episode already queued, skipping duplicate',
                  )
                }
              }

              return { success: true }
            }

            await checkForUpgrade(
              tvdbId,
              seasonNumber,
              episodeNumber,
              body.isUpgrade === true,
              instance?.id ?? null,
              fastify,
            )
            fastify.log.debug('Skipping initial download webhook')
            return { success: true }
          }

          if ('episodeFiles' in body) {
            const isUpgradeInProgress = await checkForUpgrade(
              tvdbId,
              seasonNumber,
              episodeNumber,
              false,
              instance?.id ?? null,
              fastify,
            )

            if (isUpgradeInProgress) {
              fastify.log.debug(
                {
                  series: body.series.title,
                  episode: `S${seasonNumber}E${episodeNumber}`,
                  tvdbId,
                },
                'Skipping notification due to upgrade in progress',
              )
              return { success: true }
            }

            if (!webhookQueue[tvdbId]) {
              fastify.log.debug(`Initializing webhook queue for show ${tvdbId}`)
              webhookQueue[tvdbId] = {
                seasons: {},
                title: body.series.title,
              }
            }

            const recentEpisodes = body.episodes.filter((ep) =>
              isRecentEpisode(ep.airDateUtc, fastify),
            )

            if (recentEpisodes.length > 0) {
              fastify.log.info(
                { count: recentEpisodes.length, tvdbId },
                'Processing recent episodes for immediate notification',
              )

              const tvdbGuid = `tvdb:${tvdbId}`
              const matchingItems =
                await fastify.db.getWatchlistItemsByGuid(tvdbGuid)

              // If no matching items, queue webhook for later processing
              if (matchingItems.length === 0) {
                await queuePendingWebhook(fastify, {
                  instanceType: 'sonarr',
                  instanceId: instance?.id ?? null,
                  guid: tvdbGuid,
                  title: body.series.title,
                  mediaType: 'show',
                  payload: body,
                })
                return { success: true }
              }

              const mediaInfo = {
                type: 'show' as const,
                guid: `tvdb:${tvdbId}`,
                title: body.series.title,
                episodes: recentEpisodes,
              }

              await processContentNotifications(
                fastify,
                mediaInfo,
                recentEpisodes.length > 1,
                {
                  sequential: true,
                  instanceId: instance?.id,
                  instanceType: 'sonarr',
                },
              )
            }

            const nonRecentEpisodes = body.episodes.filter(
              (ep) => !isRecentEpisode(ep.airDateUtc, fastify),
            )

            if (nonRecentEpisodes.length > 0) {
              fastify.log.info(
                { count: nonRecentEpisodes.length, tvdbId, seasonNumber },
                'Adding non-recent episodes to queue',
              )

              if (!webhookQueue[tvdbId].seasons[seasonNumber]) {
                fastify.log.debug(
                  `Initializing season ${seasonNumber} in queue for ${tvdbId}`,
                )

                webhookQueue[tvdbId].seasons[seasonNumber] = {
                  episodes: [],
                  firstReceived: new Date(),
                  lastUpdated: new Date(),
                  notifiedSeasons: new Set(),
                  upgradeTracker: new Map(),
                  instanceId: instance?.id ?? null,
                  timeoutId: setTimeout(() => {
                    fastify.log.info(
                      { tvdbId, seasonNumber },
                      'Queue timeout reached, processing queued webhooks',
                    )
                    processQueuedWebhooks(tvdbId, seasonNumber, fastify)
                  }, fastify.config.queueWaitTime),
                }
              } else {
                fastify.log.debug(
                  { tvdbId, seasonNumber },
                  'Clearing existing timeout and setting a new one',
                )

                clearTimeout(
                  webhookQueue[tvdbId].seasons[seasonNumber].timeoutId,
                )
                webhookQueue[tvdbId].seasons[seasonNumber].timeoutId =
                  setTimeout(() => {
                    fastify.log.info(
                      { tvdbId, seasonNumber },
                      'Queue timeout reached, processing queued webhooks',
                    )
                    processQueuedWebhooks(tvdbId, seasonNumber, fastify)
                  }, fastify.config.queueWaitTime)
              }

              // Filter out episodes that are already queued to prevent duplicates
              const newEpisodes = nonRecentEpisodes.filter(
                (episode) =>
                  !isEpisodeAlreadyQueued(
                    tvdbId,
                    episode.seasonNumber,
                    episode.episodeNumber,
                  ),
              )

              if (newEpisodes.length > 0) {
                webhookQueue[tvdbId].seasons[seasonNumber].episodes.push(
                  ...newEpisodes,
                )

                fastify.log.info(
                  {
                    tvdbId,
                    seasonNumber,
                    totalEpisodes:
                      webhookQueue[tvdbId].seasons[seasonNumber].episodes
                        .length,
                    justAdded: newEpisodes.length,
                    duplicatesSkipped:
                      nonRecentEpisodes.length - newEpisodes.length,
                  },
                  'Added episodes to queue',
                )
              } else {
                fastify.log.debug(
                  {
                    tvdbId,
                    seasonNumber,
                    duplicatesSkipped: nonRecentEpisodes.length,
                  },
                  'All episodes already queued, skipping duplicates',
                )
              }

              webhookQueue[tvdbId].seasons[seasonNumber].lastUpdated =
                new Date()
            } else {
              fastify.log.debug(
                { tvdbId, seasonNumber },
                'No non-recent episodes to queue',
              )
            }

            return { success: true }
          }

          return { success: true }
        }

        throw new Error('Invalid webhook payload')
      } catch (error) {
        fastify.log.error({ error }, 'Error processing webhook')
        return reply.internalServerError('Error processing webhook')
      }
    },
  )
}

export default plugin
