import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { selfWatchlistSchema } from '@schemas/plex/self-watchlist-token.schema.js'
import { logRouteError } from '@utils/route-errors.js'

export const selfWatchlistTokenRoute: FastifyPluginAsyncZod = async (
  fastify,
  _opts,
) => {
  fastify.route({
    method: 'GET',
    url: '/self-watchlist-token',
    schema: selfWatchlistSchema,
    handler: async (request, reply) => {
      try {
        const response = await fastify.plexWatchlist.getSelfWatchlist()
        return reply.send(response)
      } catch (err) {
        logRouteError(fastify.log, request, err, {
          message: 'Failed to fetch self watchlist',
        })
        reply.code(500).send({ error: 'Unable to fetch watchlist items' })
      }
    },
  })
}
