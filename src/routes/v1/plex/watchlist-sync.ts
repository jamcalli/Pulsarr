import { WATCHLIST_SYNC_STARTING_MESSAGE } from '@schemas/plex/self-watchlist-token.schema.js'
import {
  startWatchlistSyncSchema,
  watchlistSyncStatusSchema,
} from '@schemas/plex/watchlist-sync.schema.js'
import { logRouteError } from '@utils/route-errors.js'
import type { FastifyPluginAsyncZodOpenApi } from 'fastify-zod-openapi'

const plugin: FastifyPluginAsyncZodOpenApi = async (fastify) => {
  fastify.route({
    method: 'POST',
    url: '/watchlist-sync/:type/start',
    schema: startWatchlistSyncSchema,
    handler: async (request, reply) => {
      if (fastify.watchlistWorkflow.getStatus() === 'starting') {
        return reply.conflict(WATCHLIST_SYNC_STARTING_MESSAGE)
      }
      try {
        fastify.plexWatchlist.startSync(request.params.type)
        return reply.status(202).send({ message: 'Watchlist sync started' })
      } catch (error) {
        logRouteError(fastify.log, request, error, {
          message: 'Failed to start watchlist sync',
          type: request.params.type,
        })
        return reply.internalServerError('Unable to start the watchlist sync')
      }
    },
  })

  fastify.route({
    method: 'GET',
    url: '/watchlist-sync/:type/status',
    schema: watchlistSyncStatusSchema,
    handler: async (request) =>
      fastify.plexWatchlist.syncStatus(request.params.type),
  })
}

export default plugin
