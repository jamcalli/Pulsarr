import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { selfWatchlistSchema } from '@schemas/plex/self-watchlist-token.schema.js'

export const selfWatchlistTokenRoute: FastifyPluginAsyncZod = async (
  fastify,
  _opts,
) => {
  fastify.route({
    method: 'GET',
    url: '/self-watchlist-token',
    schema: selfWatchlistSchema,
    handler: async (_request, reply) => {
      try {
        const response = await fastify.plexWatchlist.getSelfWatchlist()
        return reply.send(response)
      } catch (err) {
        fastify.log.error(err)
        reply.code(500).send({ error: 'Unable to fetch watchlist items' })
      }
    },
  })
}
