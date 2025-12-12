import { othersWatchlistSchema } from '@schemas/plex/others-watchlist-token.schema.js'
import { logRouteError } from '@utils/route-errors.js'
import type { FastifyPluginAsyncZodOpenApi } from 'fastify-zod-openapi'

const plugin: FastifyPluginAsyncZodOpenApi = async (fastify, _opts) => {
  fastify.route({
    method: 'GET',
    url: '/others-watchlist-token',
    schema: othersWatchlistSchema,
    handler: async (request, reply) => {
      try {
        const response = await fastify.plexWatchlist.getOthersWatchlists()
        return reply.send(response)
      } catch (err) {
        logRouteError(fastify.log, request, err, {
          message: 'Failed to fetch others watchlists',
        })
        return reply.internalServerError(
          "Unable to fetch others' watchlist items",
        )
      }
    },
  })
}

export default plugin
