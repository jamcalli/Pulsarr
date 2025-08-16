import { rssFeedsSchema } from '@schemas/plex/generate-rss-feeds.schema.js'
import { logRouteError } from '@utils/route-errors.js'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'

export const generateRssFeedsRoute: FastifyPluginAsyncZod = async (
  fastify,
  _opts,
) => {
  fastify.route({
    method: 'GET',
    url: '/generate-rss-feeds',
    schema: rssFeedsSchema,
    handler: async (request, reply) => {
      try {
        const response = await fastify.plexWatchlist.generateAndSaveRssFeeds()
        return reply.send(response)
      } catch (err) {
        logRouteError(fastify.log, request, err, {
          message: 'Failed to generate RSS feeds',
        })
        return reply.internalServerError('Unable to fetch watchlist URLs')
      }
    },
  })
}
