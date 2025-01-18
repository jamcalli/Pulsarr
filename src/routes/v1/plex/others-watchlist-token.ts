import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { othersWatchlistSchema } from '@schemas/plex/others-watchlist-token.schema.js'

export const othersWatchlistTokenRoute: FastifyPluginAsyncZod = async (
  fastify,
  _opts,
) => {
  fastify.route({
    method: 'GET',
    url: '/others-watchlist-token',
    schema: othersWatchlistSchema,
    handler: async (_request, reply) => {
      try {
        const response = await fastify.plexWatchlist.getOthersWatchlists()
        reply.send(response)
      } catch (err) {
        fastify.log.error(err)
        reply
          .code(500)
          .send({ error: "Unable to fetch others' watchlist items" })
      }
    },
  })
}
