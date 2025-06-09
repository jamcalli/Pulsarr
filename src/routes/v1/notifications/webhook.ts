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
} from '@root/utils/webhookQueue.js'
import { extractTmdbId, extractTvdbId } from '@root/utils/guid-handler.js'
import { processContentNotifications } from '@root/utils/notification-processor.js'

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
        if (body.instanceName === 'Sonarr') {
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
        } else if (body.instanceName === 'Radarr') {
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

        if (body.instanceName === 'Radarr' && 'movie' in body) {
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
            onUserNotification: async (result) => {
              // Queue Tautulli notifications
              if (
                result.user.notify_tautulli &&
                fastify.tautulli?.isEnabled()
              ) {
                try {
                  // Find the watchlist item for this user
                  const userItem = matchingItems.find(
                    (item) => item.user_id === result.user.id,
                  )

                  if (userItem) {
                    const itemId =
                      typeof userItem.id === 'string'
                        ? Number.parseInt(userItem.id, 10)
                        : userItem.id

                    const tmdbId = extractTmdbId(userItem.guids)
                    if (tmdbId > 0) {
                      await fastify.tautulli.queueNotification(
                        `tmdb:${tmdbId}`,
                        'movie',
                        [
                          {
                            userId: result.user.id,
                            username: result.user.name,
                            notifierId: result.user.tautulli_notifier_id || 0,
                          },
                        ],
                        {
                          title: body.movie.title,
                          watchlistItemId: itemId,
                          watchlistItemKey: userItem.key,
                        },
                      )
                    }
                  }
                } catch (error) {
                  fastify.log.error(
                    { error, userId: result.user.id, title: body.movie.title },
                    'Failed to queue Tautulli notification for movie',
                  )
                }
              }
            },
          })

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

                const notificationResults =
                  await fastify.db.processNotifications(mediaInfo, false)

                // If public content is enabled, also get public notification data
                if (fastify.config.publicContentNotifications?.enabled) {
                  const publicNotificationResults =
                    await fastify.db.processNotifications(
                      mediaInfo,
                      false,
                      true, // byGuid = true for public content
                    )
                  // Add public notifications to the existing user notifications
                  notificationResults.push(...publicNotificationResults)
                }

                for (const result of notificationResults) {
                  // Handle public content notifications specially
                  // Note: ID -1 is a virtual runtime identifier, actual database records use user_id: null
                  if (result.user.id === -1) {
                    // This is public content - route to global endpoints
                    if (result.user.notify_discord) {
                      try {
                        // Collect Discord IDs from all real users for @ mentions
                        const userDiscordIds = notificationResults
                          .filter((r) => r.user.id !== -1 && r.user.discord_id)
                          .map((r) => r.user.discord_id as string)
                        await fastify.discord.sendPublicNotification(
                          result.notification,
                          userDiscordIds,
                        )
                      } catch (error) {
                        fastify.log.error(
                          { error },
                          'Failed to send public Discord notification',
                        )
                      }
                    }
                    if (result.user.notify_apprise) {
                      try {
                        await fastify.apprise.sendPublicNotification(
                          result.notification,
                        )
                      } catch (error) {
                        fastify.log.error(
                          { error },
                          'Failed to send public Apprise notification',
                        )
                      }
                    }
                  } else {
                    // Regular user notifications (unchanged)
                    if (result.user.notify_discord && result.user.discord_id) {
                      await fastify.discord.sendDirectMessage(
                        result.user.discord_id,
                        result.notification,
                      )
                    }

                    if (result.user.notify_apprise) {
                      await fastify.apprise.sendMediaNotification(
                        result.user,
                        result.notification,
                      )
                    }
                  }

                  // Queue Tautulli notifications
                  if (
                    result.user.notify_tautulli &&
                    fastify.tautulli?.isEnabled()
                  ) {
                    try {
                      // Find the watchlist item for this user
                      const userItem = matchingItems.find(
                        (item) => item.user_id === result.user.id,
                      )

                      if (userItem) {
                        const itemId =
                          typeof userItem.id === 'string'
                            ? Number.parseInt(userItem.id, 10)
                            : userItem.id

                        const tvdbId = extractTvdbId(userItem.guids)
                        if (tvdbId > 0) {
                          await fastify.tautulli.queueNotification(
                            `tvdb:${tvdbId}`,
                            'episode',
                            [
                              {
                                userId: result.user.id,
                                username: result.user.name,
                                notifierId:
                                  result.user.tautulli_notifier_id || 0,
                              },
                            ],
                            {
                              title: body.series.title,
                              watchlistItemId: itemId,
                              watchlistItemKey: userItem.key,
                              seasonNumber: body.episodes[0].seasonNumber,
                              episodeNumber: body.episodes[0].episodeNumber,
                            },
                          )
                        }
                      }
                    } catch (error) {
                      fastify.log.error(
                        {
                          error,
                          userId: result.user.id,
                          title: body.series.title,
                          season: body.episodes[0].seasonNumber,
                          episode: body.episodes[0].episodeNumber,
                        },
                        'Failed to queue Tautulli notification for episode',
                      )
                    }
                  }
                }
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

              const notificationResults = await fastify.db.processNotifications(
                mediaInfo,
                recentEpisodes.length > 1,
              )

              // If public content is enabled, also get public notification data
              if (fastify.config.publicContentNotifications?.enabled) {
                const publicNotificationResults =
                  await fastify.db.processNotifications(
                    mediaInfo,
                    recentEpisodes.length > 1,
                    true, // byGuid = true for public content
                  )
                // Add public notifications to the existing user notifications
                notificationResults.push(...publicNotificationResults)
              }

              if (notificationResults.length > 0) {
                fastify.log.info(
                  {
                    title: body.series.title,
                    episodeCount: recentEpisodes.length,
                    recipientCount: notificationResults.length,
                  },
                  'Sending notifications for recent episodes',
                )
              }

              for (const result of notificationResults) {
                // Handle public content notifications specially
                // Note: ID -1 is a virtual runtime identifier, actual database records use user_id: null
                if (result.user.id === -1) {
                  // This is public content - route to global endpoints
                  if (result.user.notify_discord) {
                    try {
                      // Collect Discord IDs from all real users for @ mentions
                      const userDiscordIds = notificationResults
                        .filter((r) => r.user.id !== -1 && r.user.discord_id)
                        .map((r) => r.user.discord_id as string)
                      await fastify.discord.sendPublicNotification(
                        result.notification,
                        userDiscordIds,
                      )
                    } catch (error) {
                      fastify.log.error(
                        { error },
                        'Failed to send public Discord notification',
                      )
                    }
                  }
                  if (result.user.notify_apprise) {
                    try {
                      await fastify.apprise.sendPublicNotification(
                        result.notification,
                      )
                    } catch (error) {
                      fastify.log.error(
                        { error },
                        'Failed to send public Apprise notification',
                      )
                    }
                  }
                } else {
                  // Regular user notifications (unchanged)
                  if (result.user.notify_discord && result.user.discord_id) {
                    await fastify.discord.sendDirectMessage(
                      result.user.discord_id,
                      result.notification,
                    )
                  }

                  if (result.user.notify_apprise) {
                    await fastify.apprise.sendMediaNotification(
                      result.user,
                      result.notification,
                    )
                  }
                }

                // Queue Tautulli notifications
                if (
                  result.user.notify_tautulli &&
                  fastify.tautulli?.isEnabled()
                ) {
                  // Find the watchlist item for this user
                  const userItem = matchingItems.find(
                    (item) => item.user_id === result.user.id,
                  )

                  if (userItem) {
                    const itemId =
                      typeof userItem.id === 'string'
                        ? Number.parseInt(userItem.id, 10)
                        : userItem.id

                    const tvdbId = extractTvdbId(userItem.guids)
                    if (tvdbId > 0) {
                      // For multiple episodes, queue each one separately
                      for (const episode of recentEpisodes) {
                        try {
                          await fastify.tautulli.queueNotification(
                            `tvdb:${tvdbId}`,
                            'episode',
                            [
                              {
                                userId: result.user.id,
                                username: result.user.name,
                                notifierId:
                                  result.user.tautulli_notifier_id || 0,
                              },
                            ],
                            {
                              title: body.series.title,
                              watchlistItemId: itemId,
                              watchlistItemKey: userItem.key,
                              seasonNumber: episode.seasonNumber,
                              episodeNumber: episode.episodeNumber,
                            },
                          )
                        } catch (error) {
                          fastify.log.error(
                            {
                              error,
                              userId: result.user.id,
                              tvdbId,
                              season: episode.seasonNumber,
                              episode: episode.episodeNumber,
                            },
                            'Failed to queue Tautulli notification for episode',
                          )
                        }
                      }
                    }
                  }
                }
              }
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

              webhookQueue[tvdbId].seasons[seasonNumber].episodes.push(
                ...nonRecentEpisodes,
              )

              fastify.log.info(
                {
                  tvdbId,
                  seasonNumber,
                  totalEpisodes:
                    webhookQueue[tvdbId].seasons[seasonNumber].episodes.length,
                  justAdded: nonRecentEpisodes.length,
                },
                'Added episodes to queue',
              )

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
