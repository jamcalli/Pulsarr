import {
  selfWatchlistSchema,
  WATCHLIST_SYNC_STARTING_MESSAGE,
} from '@schemas/plex/self-watchlist-token.schema.js'
import { logRouteError } from '@utils/route-errors.js'
import type { FastifyPluginAsyncZodOpenApi } from 'fastify-zod-openapi'

const plugin: FastifyPluginAsyncZodOpenApi = async (fastify, _opts) => {
  fastify.route({
    method: 'POST',
    url: '/self-watchlist-token',
    schema: selfWatchlistSchema,
    handler: async (request, reply) => {
      if (fastify.watchlistWorkflow.getStatus() === 'starting') {
        return reply.conflict(WATCHLIST_SYNC_STARTING_MESSAGE)
      }
      try {
        const response = await fastify.plexWatchlist.getSelfWatchlist()
        return reply.send(response)
      } catch (error) {
        logRouteError(fastify.log, request, error, {
          message: 'Failed to fetch self watchlist',
        })
        return reply.internalServerError('Unable to fetch watchlist items')
      }
    },
  })
}

export default plugin
