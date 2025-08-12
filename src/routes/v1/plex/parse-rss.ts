import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { rssWatchlistSchema } from '@schemas/plex/parse-rss-feeds.schema.js'
import { logRouteError } from '@utils/route-errors.js'

export const rssWatchlistRoute: FastifyPluginAsyncZod = async (
  fastify,
  _opts,
) => {
  fastify.route({
    method: 'GET',
    url: '/rss-watchlist',
    schema: rssWatchlistSchema,
    handler: async (request, reply) => {
      try {
        const response = await fastify.plexWatchlist.processRssWatchlists()
        return reply.send(response)
      } catch (err) {
        logRouteError(fastify.log, request, err, {
          message: 'Failed to process RSS watchlists',
        })
        return reply.internalServerError('Unable to fetch RSS watchlist items')
      }
    },
  })
}
