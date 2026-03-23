import {
  WatchlistGenresErrorSchema,
  WatchlistGenresResponseSchema,
} from '@schemas/plex/get-genres.schema.js'
import { logRouteError } from '@utils/route-errors.js'
import type { FastifyPluginAsyncZodOpenApi } from 'fastify-zod-openapi'

const plugin: FastifyPluginAsyncZodOpenApi = async (fastify) => {
  fastify.get(
    '/genres',
    {
      schema: {
        summary: 'Get watchlist genres',
        operationId: 'getWatchlistGenres',
        description: 'Retrieve all genres from watchlist items',
        response: {
          200: WatchlistGenresResponseSchema,
          500: WatchlistGenresErrorSchema,
        },
        tags: ['Plex'],
      },
    },
    async (request, reply) => {
      try {
        await fastify.db.syncGenresFromWatchlist()
        const genres = await fastify.db.getAllGenres()

        reply.status(200)
        return {
          success: true,
          genres: genres.map((genre) => genre.name),
        }
      } catch (error) {
        logRouteError(fastify.log, request, error, {
          message: 'Failed to fetch watchlist genres',
        })
        return reply.internalServerError('Unable to fetch watchlist genres')
      }
    },
  )
}

export default plugin
