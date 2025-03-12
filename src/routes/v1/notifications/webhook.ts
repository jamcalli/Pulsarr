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
} from '@root/utils/webhookQueue.js'

const plugin: FastifyPluginAsync = async (fastify) => {
  fastify.post<{
    Body: WebhookPayload
    Reply: WebhookResponse
    Querystring: WebhookQuery
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
        querystring: WebhookQuerySchema,
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
              baseUrl: instance?.baseUrl 
            }, 
            'Sonarr instance lookup result'
          )
        } else if (body.instanceName === 'Radarr') {
          instance = await fastify.db.getRadarrInstanceByIdentifier(instanceId)
          fastify.log.debug(
            { 
              instanceId, 
              foundInstance: !!instance,
              instanceName: instance?.name,
              baseUrl: instance?.baseUrl 
            }, 
            'Radarr instance lookup result'
          )
        }
      }

      try {
        if ('eventType' in body && body.eventType === 'Test') {
          fastify.log.debug('Received test webhook')
          return { success: true }
        }

        if (body.instanceName === 'Radarr' && 'movie' in body) {
          if (instance) {
            try {
              const tmdbGuid = `tmdb:${body.movie.tmdbId}`;
              const matchingItems = await fastify.db.getWatchlistItemsByGuid(tmdbGuid);
              
              for (const item of matchingItems) {
                const itemId = typeof item.id === 'string' ? parseInt(item.id, 10) : item.id;
                
                if (!Number.isNaN(itemId)) {
                  const isSyncing = await fastify.db.isRadarrItemSyncing(itemId, instance.id);
                  
                  if (isSyncing) {
                    fastify.log.info(
                      {
                        title: item.title,
                        instanceName: instance.name
                      },
                      'Suppressing notification for synced item'
                    );
                    
                    await fastify.db.updateWatchlistRadarrInstanceStatus(
                      itemId,
                      instance.id,
                      'grabbed',
                      null
                    );
                    
                    await fastify.db.updateRadarrSyncingStatus(
                      itemId,
                      instance.id,
                      false
                    );
                    
                    return { success: true };
                  }
                }
              }
            } catch (error) {
              fastify.log.debug(
                { error, tmdbId: body.movie.tmdbId, instanceId: instance.id },
                'Error checking sync status for Radarr webhook'
              );
            }
          }

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
          const episodeNumber = body.episodes[0].episodeNumber

          if ('episodeFile' in body && !('episodeFiles' in body)) {
            if (instance) {
              try {
                const tvdbGuid = `tvdb:${tvdbId}`;
                const matchingItems = await fastify.db.getWatchlistItemsByGuid(tvdbGuid);
                
                for (const item of matchingItems) {
                  const itemId = typeof item.id === 'string' ? parseInt(item.id, 10) : item.id;
                  
                  if (!Number.isNaN(itemId)) {
                    const isSyncing = await fastify.db.isSonarrItemSyncing(itemId, instance.id);
                    
                    if (isSyncing) {
                      fastify.log.info(
                        {
                          title: item.title,
                          instanceName: instance.name
                        },
                        'Suppressing notification for synced item'
                      );
                      
                      await fastify.db.updateWatchlistSonarrInstanceStatus(
                        itemId,
                        instance.id,
                        'grabbed',
                        null
                      );
                      
                      await fastify.db.updateSonarrSyncingStatus(
                        itemId,
                        instance.id,
                        false
                      );
                      
                      return { success: true };
                    }
                  }
                }
              } catch (error) {
                fastify.log.debug(
                  { error, tvdbId, instanceId: instance.id },
                  'Error checking sync status for Sonarr webhook'
                );
              }
            }

            await checkForUpgrade(
              tvdbId,
              seasonNumber,
              episodeNumber,
              body.isUpgrade === true,
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
              webhookQueue[tvdbId] = {
                seasons: {},
                title: body.series.title,
              }
            }

            const recentEpisodes = body.episodes.filter((ep) =>
              isRecentEpisode(ep.airDateUtc, fastify),
            )

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

              if (notificationResults.length > 0) {
                fastify.log.info(
                  {
                    title: body.series.title,
                    episodeCount: recentEpisodes.length,
                    recipientCount: notificationResults.length,
                  },
                  'Sending notifications for episodes'
                )
              }

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
              (ep) => !isRecentEpisode(ep.airDateUtc, fastify),
            )

            if (nonRecentEpisodes.length > 0) {
              if (!webhookQueue[tvdbId].seasons[seasonNumber]) {
                webhookQueue[tvdbId].seasons[seasonNumber] = {
                  episodes: [],
                  firstReceived: new Date(),
                  lastUpdated: new Date(),
                  notifiedSeasons: new Set(),
                  upgradeTracker: new Map(),
                  timeoutId: setTimeout(() => {
                    processQueuedWebhooks(tvdbId, seasonNumber, fastify)
                  }, fastify.config.queueWaitTime),
                }
              } else {
                clearTimeout(
                  webhookQueue[tvdbId].seasons[seasonNumber].timeoutId,
                )
                webhookQueue[tvdbId].seasons[seasonNumber].timeoutId =
                  setTimeout(() => {
                    processQueuedWebhooks(tvdbId, seasonNumber, fastify)
                  }, fastify.config.queueWaitTime)
              }

              webhookQueue[tvdbId].seasons[seasonNumber].episodes.push(
                ...nonRecentEpisodes,
              )
              webhookQueue[tvdbId].seasons[seasonNumber].lastUpdated =
                new Date()
            }

            return { success: true }
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