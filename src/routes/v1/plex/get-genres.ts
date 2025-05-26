import type { FastifyPluginAsync } from 'fastify'
import type { z } from 'zod'
import {
  WatchlistGenresResponseSchema,
  WatchlistGenresErrorSchema,
} from '@schemas/plex/get-genres.schema.js'

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
        fastify.log.error('Error fetching watchlist genres:', err)
        return reply.internalServerError('Unable to fetch watchlist genres')
      }
    },
  )
}
