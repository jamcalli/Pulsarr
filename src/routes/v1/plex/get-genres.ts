import {
  WatchlistGenresErrorSchema,
  WatchlistGenresResponseSchema,
} from '@schemas/plex/get-genres.schema.js'
import { logRouteError } from '@utils/route-errors.js'
import type { FastifyPluginAsync } from 'fastify'
import type { z } from 'zod'

export const getGenresRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get<{
    Reply: z.infer<typeof WatchlistGenresResponseSchema>
  }>(
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

        const response: z.infer<typeof WatchlistGenresResponseSchema> = {
          success: true,
          genres: genres.map((genre) => genre.name),
        }

        reply.status(200)
        return response
      } catch (err) {
        logRouteError(fastify.log, request, err, {
          message: 'Failed to fetch watchlist genres',
        })
        return reply.internalServerError('Unable to fetch watchlist genres')
      }
    },
  )
}
