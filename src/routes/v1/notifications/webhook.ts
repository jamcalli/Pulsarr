import {
  ErrorSchema,
  WebhookPayloadSchema,
  WebhookQuerySchema,
  WebhookResponseSchema,
} from '@root/schemas/notifications/webhook.schema.js'
import { isWebhookProcessable } from '@root/utils/notifications/index.js'
import { logRouteError } from '@utils/route-errors.js'
import type { FastifyPluginAsyncZodOpenApi } from 'fastify-zod-openapi'

const plugin: FastifyPluginAsyncZodOpenApi = async (fastify) => {
  fastify.post(
    '/webhook',
    {
      schema: {
        security: [],
        summary: 'Process media webhook',
        operationId: 'processMediaWebhook',
        description:
          'Process webhooks from Radarr (movies) or Sonarr (TV series) for media notifications',
        body: WebhookPayloadSchema,
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

        // Trigger Plex label sync for webhooks that pass deduplication
        if (fastify.config.plexLabelSync?.enabled) {
          const svc = fastify.plexLabelSyncService
          if (!svc) {
            fastify.log.warn(
              'plexLabelSync.enabled is true but plexLabelSyncService is not registered',
            )
          } else {
            setImmediate(() => {
              void svc.syncLabelsOnWebhook(body).catch((error: unknown) => {
                fastify.log.error(
                  { error, instanceName: body.instanceName },
                  'Plex label sync failed for webhook',
                )
              })
            })
          }
        }

        const contentTitle =
          'movie' in body
            ? body.movie.title
            : 'series' in body
              ? body.series.title
              : 'unknown'
        const contentId =
          'movie' in body
            ? body.movie.tmdbId
            : 'series' in body
              ? body.series.tvdbId
              : null
        const webhookType =
          'movie' in body ? 'radarr' : 'series' in body ? 'sonarr' : 'unknown'
        const contentGuid =
          'movie' in body
            ? `tmdb:${body.movie.tmdbId}`
            : 'series' in body
              ? `tvdb:${body.series.tvdbId}`
              : null
        const dedupPayload = {
          webhook: webhookType,
          instanceName: instance?.name ?? body.instanceName,
          eventType: 'eventType' in body ? body.eventType : 'unknown',
          contentTitle,
          contentId,
          contentGuid,
          instanceDbId: instance?.id ?? null,
          instanceIdentifier: instanceId ?? null,
          reqId: request.id,
        }
        fastify.log.debug(dedupPayload, 'Webhook passed deduplication')

        // Provide immediate user feedback that webhook was received
        fastify.log.info(
          {
            instanceName: body.instanceName,
            eventType: 'eventType' in body ? body.eventType : 'unknown',
            contentTitle,
            reqId: request.id,
          },
          'Webhook received and processing',
        )

        if ('movie' in body) {
          const tmdbGuid = `tmdb:${body.movie.tmdbId}`
          const matchingItems =
            await fastify.db.getWatchlistItemsByGuid(tmdbGuid)

          // If no matching items, queue webhook for later processing
          if (matchingItems.length === 0) {
            fastify.log.info(
              {
                title: body.movie.title,
                tmdbId: body.movie.tmdbId,
                instanceName: instance?.name ?? body.instanceName,
              },
              'Movie not in watchlist yet, queuing webhook for later processing',
            )
            await fastify.webhookQueue.queuePendingWebhook({
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

          fastify.log.info(
            {
              title: body.movie.title,
              tmdbId: body.movie.tmdbId,
              instanceName: instance?.name ?? body.instanceName,
            },
            'Processing movie download',
          )

          await fastify.notifications.sendMediaAvailable(mediaInfo, {
            isBulkRelease: false,
            sequential: true,
            instanceId: instance?.id,
            instanceType: 'radarr',
          })

          return { success: true }
        }

        if (
          'series' in body &&
          'episodes' in body &&
          Array.isArray(body.episodes) &&
          body.episodes.length > 0
        ) {
          const tvdbId = body.series.tvdbId.toString()
          const seasonNumber = body.episodes[0].seasonNumber
          const episodeNumber = body.episodes[0].episodeNumber

          fastify.log.debug(
            {
              webhook: 'sonarr',
              tvdbId,
              instanceName: instance?.name ?? body.instanceName,
              series: body.series.title,
              seasonNumber,
              episodeNumber,
              eventType: body.eventType,
              reqId: request.id,
            },
            'Received Sonarr webhook',
          )
          fastify.log.debug(
            {
              webhook: 'sonarr',
              tvdbId,
              instanceName: instance?.name ?? body.instanceName,
              seasonNumber,
              episodeNumber,
              hasEpisodeFile: 'episodeFile' in body,
              hasEpisodeFiles: 'episodeFiles' in body,
              isUpgrade: body.isUpgrade === true,
              episodeCount: body.episodes.length,
              eventType: body.eventType,
              reqId: request.id,
            },
            'Sonarr webhook details',
          )

          if ('episodeFile' in body && !('episodeFiles' in body)) {
            const isCompleteDownload =
              body.eventType === 'Download' &&
              body.episodeFile &&
              body.isUpgrade !== true

            if (isCompleteDownload) {
              fastify.log.debug(
                { tvdbId, season: seasonNumber, episode: episodeNumber },
                'Processing individual episode completion',
              )

              if (!fastify.webhookQueue.queue[tvdbId]) {
                fastify.webhookQueue.queue[tvdbId] = {
                  seasons: {},
                  title: body.series.title,
                }
              }

              const isRecentEp = fastify.webhookQueue.isRecentEpisode(
                body.episodes[0].airDateUtc,
              )

              if (isRecentEp) {
                const tvdbGuid = `tvdb:${tvdbId}`
                const matchingItems =
                  await fastify.db.getWatchlistItemsByGuid(tvdbGuid)

                // If no matching items, queue webhook for later processing
                if (matchingItems.length === 0) {
                  await fastify.webhookQueue.queuePendingWebhook({
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

                fastify.log.info(
                  {
                    series: body.series.title,
                    tvdbId,
                    season: seasonNumber,
                    episode: episodeNumber,
                    instanceName: instance?.name ?? body.instanceName,
                  },
                  'Processing recent episode download',
                )

                await fastify.notifications.sendMediaAvailable(mediaInfo, {
                  isBulkRelease: false,
                  sequential: true,
                  instanceId: instance?.id,
                  instanceType: 'sonarr',
                })
              } else {
                const isNewSeason =
                  !fastify.webhookQueue.queue[tvdbId].seasons[seasonNumber]

                if (isNewSeason) {
                  fastify.webhookQueue.queue[tvdbId].seasons[seasonNumber] = {
                    episodes: [],
                    firstReceived: new Date(),
                    lastUpdated: new Date(),
                    notifiedSeasons: new Set(),
                    upgradeTracker: new Map(),
                    instanceId: instance?.id ?? null,
                    timeoutId: setTimeout(() => {
                      void fastify.webhookQueue
                        .processQueuedWebhooks(tvdbId, seasonNumber)
                        .catch((error) => {
                          fastify.log.error(
                            { error, tvdbId, seasonNumber },
                            'Queue timeout processing failed',
                          )
                        })
                    }, fastify.config.queueWaitTime),
                  }

                  // Fetch expected episode count for season completion detection
                  void fastify.webhookQueue
                    .fetchExpectedEpisodeCount(tvdbId, seasonNumber)
                    .catch((error) => {
                      fastify.log.debug(
                        { error, tvdbId, seasonNumber },
                        'Failed to fetch expected episode count',
                      )
                    })
                }

                // Check for duplicate episode before adding
                if (
                  !fastify.webhookQueue.isEpisodeAlreadyQueued(
                    tvdbId,
                    seasonNumber,
                    episodeNumber,
                  )
                ) {
                  fastify.webhookQueue.queue[tvdbId].seasons[
                    seasonNumber
                  ].episodes.push(body.episodes[0])

                  // Keep queue metadata fresh
                  fastify.webhookQueue.queue[tvdbId].seasons[
                    seasonNumber
                  ].lastUpdated = new Date()

                  // Check if season is complete
                  if (
                    fastify.webhookQueue.isSeasonComplete(tvdbId, seasonNumber)
                  ) {
                    // Clear the timeout and process immediately
                    if (
                      fastify.webhookQueue.queue[tvdbId].seasons[seasonNumber]
                        .timeoutId
                    ) {
                      clearTimeout(
                        fastify.webhookQueue.queue[tvdbId].seasons[seasonNumber]
                          .timeoutId,
                      )
                    }
                    fastify.log.info(
                      {
                        tvdbId,
                        seasonNumber,
                        episodeCount:
                          fastify.webhookQueue.queue[tvdbId].seasons[
                            seasonNumber
                          ].episodes.length,
                        series: fastify.webhookQueue.queue[tvdbId]?.title,
                      },
                      'Season complete, processing immediately',
                    )
                    void fastify.webhookQueue
                      .processQueuedWebhooks(tvdbId, seasonNumber)
                      .catch((error) => {
                        fastify.log.error(
                          { error, tvdbId, seasonNumber },
                          'Season complete processing failed',
                        )
                      })
                  } else {
                    // Extend the timeout window
                    if (
                      fastify.webhookQueue.queue[tvdbId].seasons[seasonNumber]
                        .timeoutId
                    ) {
                      clearTimeout(
                        fastify.webhookQueue.queue[tvdbId].seasons[seasonNumber]
                          .timeoutId,
                      )
                    }
                    fastify.webhookQueue.queue[tvdbId].seasons[
                      seasonNumber
                    ].timeoutId = setTimeout(() => {
                      const queuedCount =
                        fastify.webhookQueue.queue[tvdbId]?.seasons?.[
                          seasonNumber
                        ]?.episodes?.length ?? 0
                      fastify.log.info(
                        {
                          tvdbId,
                          seasonNumber,
                          waitMs: fastify.config.queueWaitTime,
                          queuedCount,
                          series: fastify.webhookQueue.queue[tvdbId]?.title,
                        },
                        'Queue timeout reached, processing webhooks',
                      )
                      void fastify.webhookQueue
                        .processQueuedWebhooks(tvdbId, seasonNumber)
                        .catch((error) => {
                          fastify.log.error(
                            { error, tvdbId, seasonNumber },
                            'Queue timeout processing failed',
                          )
                        })
                    }, fastify.config.queueWaitTime)
                  }

                  fastify.log.debug(
                    {
                      tvdbId,
                      seasonNumber,
                      episodeCount:
                        fastify.webhookQueue.queue[tvdbId].seasons[seasonNumber]
                          .episodes.length,
                      expectedCount:
                        fastify.webhookQueue.queue[tvdbId].seasons[seasonNumber]
                          .expectedEpisodeCount,
                      instanceName: instance?.name ?? body.instanceName,
                      reqId: request.id,
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

            await fastify.webhookQueue.checkForUpgrade(
              tvdbId,
              seasonNumber,
              episodeNumber,
              body.isUpgrade === true,
              instance?.id ?? null,
            )
            fastify.log.debug('Skipping initial download webhook')
            return { success: true }
          }

          if ('episodeFiles' in body) {
            const isUpgradeInProgress =
              await fastify.webhookQueue.checkForUpgrade(
                tvdbId,
                seasonNumber,
                episodeNumber,
                false,
                instance?.id ?? null,
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

            if (!fastify.webhookQueue.queue[tvdbId]) {
              fastify.log.debug(`Initializing webhook queue for show ${tvdbId}`)
              fastify.webhookQueue.queue[tvdbId] = {
                seasons: {},
                title: body.series.title,
              }
            }

            const recentEpisodes = body.episodes.filter((ep) =>
              fastify.webhookQueue.isRecentEpisode(ep.airDateUtc),
            )

            if (recentEpisodes.length > 0) {
              fastify.log.debug(
                {
                  count: recentEpisodes.length,
                  tvdbId,
                  series: body.series.title,
                  instanceId: instance?.id ?? null,
                  reqId: request.id,
                },
                'Processing recent episodes for immediate notification',
              )

              const tvdbGuid = `tvdb:${tvdbId}`
              const matchingItems =
                await fastify.db.getWatchlistItemsByGuid(tvdbGuid)

              // If no matching items, queue webhook for later processing
              if (matchingItems.length === 0) {
                await fastify.webhookQueue.queuePendingWebhook({
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

              await fastify.notifications.sendMediaAvailable(mediaInfo, {
                isBulkRelease: recentEpisodes.length > 1,
                sequential: true,
                instanceId: instance?.id,
                instanceType: 'sonarr',
              })
            }

            const nonRecentEpisodes = body.episodes.filter(
              (ep) => !fastify.webhookQueue.isRecentEpisode(ep.airDateUtc),
            )

            if (nonRecentEpisodes.length > 0) {
              fastify.log.debug(
                {
                  count: nonRecentEpisodes.length,
                  tvdbId,
                  seasonNumber,
                  instanceName: instance?.name ?? body.instanceName,
                  series: body.series.title,
                  reqId: request.id,
                },
                'Adding non-recent episodes to queue',
              )

              const isNewSeason =
                !fastify.webhookQueue.queue[tvdbId].seasons[seasonNumber]

              if (isNewSeason) {
                fastify.log.debug(
                  `Initializing season ${seasonNumber} in queue for ${tvdbId}`,
                )

                fastify.webhookQueue.queue[tvdbId].seasons[seasonNumber] = {
                  episodes: [],
                  firstReceived: new Date(),
                  lastUpdated: new Date(),
                  notifiedSeasons: new Set(),
                  upgradeTracker: new Map(),
                  instanceId: instance?.id ?? null,
                  timeoutId: setTimeout(() => {
                    const queuedCount =
                      fastify.webhookQueue.queue[tvdbId]?.seasons?.[
                        seasonNumber
                      ]?.episodes?.length ?? 0
                    fastify.log.info(
                      {
                        tvdbId,
                        seasonNumber,
                        waitMs: fastify.config.queueWaitTime,
                        queuedCount,
                        series: fastify.webhookQueue.queue[tvdbId]?.title,
                      },
                      'Queue timeout reached, processing webhooks',
                    )
                    void fastify.webhookQueue
                      .processQueuedWebhooks(tvdbId, seasonNumber)
                      .catch((error) => {
                        fastify.log.error(
                          { error, tvdbId, seasonNumber },
                          'Queue timeout processing failed',
                        )
                      })
                  }, fastify.config.queueWaitTime),
                }

                // Fetch expected episode count for season completion detection
                void fastify.webhookQueue
                  .fetchExpectedEpisodeCount(tvdbId, seasonNumber)
                  .catch((error) => {
                    fastify.log.debug(
                      { error, tvdbId, seasonNumber },
                      'Failed to fetch expected episode count',
                    )
                  })
              }

              // Filter out episodes that are already queued to prevent duplicates
              const newEpisodes = nonRecentEpisodes.filter(
                (episode) =>
                  !fastify.webhookQueue.isEpisodeAlreadyQueued(
                    tvdbId,
                    episode.seasonNumber,
                    episode.episodeNumber,
                  ),
              )

              if (newEpisodes.length > 0) {
                fastify.webhookQueue.queue[tvdbId].seasons[
                  seasonNumber
                ].episodes.push(...newEpisodes)

                fastify.webhookQueue.queue[tvdbId].seasons[
                  seasonNumber
                ].lastUpdated = new Date()

                // Check if season is complete
                if (
                  fastify.webhookQueue.isSeasonComplete(tvdbId, seasonNumber)
                ) {
                  // Clear the timeout and process immediately
                  if (
                    fastify.webhookQueue.queue[tvdbId].seasons[seasonNumber]
                      .timeoutId
                  ) {
                    clearTimeout(
                      fastify.webhookQueue.queue[tvdbId].seasons[seasonNumber]
                        .timeoutId,
                    )
                  }
                  fastify.log.info(
                    {
                      tvdbId,
                      seasonNumber,
                      episodeCount:
                        fastify.webhookQueue.queue[tvdbId].seasons[seasonNumber]
                          .episodes.length,
                      series: fastify.webhookQueue.queue[tvdbId]?.title,
                    },
                    'Season complete, processing immediately',
                  )
                  void fastify.webhookQueue
                    .processQueuedWebhooks(tvdbId, seasonNumber)
                    .catch((error) => {
                      fastify.log.error(
                        { error, tvdbId, seasonNumber },
                        'Season complete processing failed',
                      )
                    })
                } else if (!isNewSeason) {
                  // Extend the timeout window for existing seasons
                  if (
                    fastify.webhookQueue.queue[tvdbId].seasons[seasonNumber]
                      .timeoutId
                  ) {
                    clearTimeout(
                      fastify.webhookQueue.queue[tvdbId].seasons[seasonNumber]
                        .timeoutId,
                    )
                  }
                  fastify.webhookQueue.queue[tvdbId].seasons[
                    seasonNumber
                  ].timeoutId = setTimeout(() => {
                    const queuedCount =
                      fastify.webhookQueue.queue[tvdbId]?.seasons?.[
                        seasonNumber
                      ]?.episodes?.length ?? 0
                    fastify.log.info(
                      {
                        tvdbId,
                        seasonNumber,
                        waitMs: fastify.config.queueWaitTime,
                        queuedCount,
                        series: fastify.webhookQueue.queue[tvdbId]?.title,
                      },
                      'Queue timeout reached, processing webhooks',
                    )
                    void fastify.webhookQueue
                      .processQueuedWebhooks(tvdbId, seasonNumber)
                      .catch((error) => {
                        fastify.log.error(
                          { error, tvdbId, seasonNumber },
                          'Queue timeout processing failed',
                        )
                      })
                  }, fastify.config.queueWaitTime)
                }

                fastify.log.debug(
                  {
                    tvdbId,
                    seasonNumber,
                    totalEpisodes:
                      fastify.webhookQueue.queue[tvdbId].seasons[seasonNumber]
                        .episodes.length,
                    expectedCount:
                      fastify.webhookQueue.queue[tvdbId].seasons[seasonNumber]
                        .expectedEpisodeCount,
                    justAdded: newEpisodes.length,
                    duplicatesSkipped:
                      nonRecentEpisodes.length - newEpisodes.length,
                    series:
                      fastify.webhookQueue.queue[tvdbId]?.title ??
                      body.series.title,
                    reqId: request.id,
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

        return reply.badRequest('Invalid webhook payload')
      } catch (error) {
        logRouteError(fastify.log, request, error, {
          message: 'Failed to process webhook',
          instanceName: body.instanceName,
        })
        return reply.internalServerError('Error processing webhook')
      }
    },
  )
}

export default plugin
