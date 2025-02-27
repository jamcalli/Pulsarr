// File: src/routes/v1/stats/dashboard.ts
import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import {
  DashboardStatsSchema,
  GenreStatSchema,
  ContentStatSchema,
  UserStatSchema,
  StatusDistributionSchema,
  ContentTypeDistributionSchema,
  ActivityStatsSchema,
  InstanceStatSchema,
  AvailabilityTimeSchema,
  ErrorSchema,
  LimitQuerySchema,
  ActivityQuerySchema,
} from '@schemas/stats/stats.schema.js'

const plugin: FastifyPluginAsync = async (fastify) => {
  // Get all dashboard stats combined
  fastify.get<{
    Querystring: z.infer<typeof LimitQuerySchema>
    Reply: z.infer<typeof DashboardStatsSchema>
  }>(
    '/all',
    {
      schema: {
        querystring: LimitQuerySchema,
        response: {
          200: DashboardStatsSchema,
          500: ErrorSchema,
        },
        tags: ['Statistics'],
      },
    },
    async (request, reply) => {
      try {
        const { limit } = request.query

        const [
          topGenres,
          mostWatchedShows,
          mostWatchedMovies,
          topUsers,
          statusDistribution,
          contentTypeDistribution,
          recentActivity,
          instanceActivity,
          availabilityTimes,
        ] = await Promise.all([
          fastify.db.getTopGenres(limit),
          fastify.db.getMostWatchlistedShows(limit),
          fastify.db.getMostWatchlistedMovies(limit),
          fastify.db.getUsersWithMostWatchlistItems(limit),
          fastify.db.getWatchlistStatusDistribution(),
          fastify.db.getContentTypeDistribution(),
          fastify.db.getRecentActivityStats(),
          fastify.db.getInstanceActivityStats(),
          fastify.db.getAverageTimeToAvailability(),
        ])

        const response = {
          top_genres: topGenres,
          most_watched_shows: mostWatchedShows,
          most_watched_movies: mostWatchedMovies,
          top_users: topUsers,
          status_distribution: statusDistribution,
          content_type_distribution: contentTypeDistribution,
          recent_activity: recentActivity,
          instance_activity: instanceActivity,
          availability_times: availabilityTimes,
        }

        return response
      } catch (err) {
        fastify.log.error('Error fetching dashboard statistics:', err)
        throw reply.internalServerError('Unable to fetch dashboard statistics')
      }
    },
  )

  // Get top genres only
  fastify.get<{
    Querystring: z.infer<typeof LimitQuerySchema>
    Reply: z.infer<typeof GenreStatSchema>[]
  }>(
    '/genres',
    {
      schema: {
        querystring: LimitQuerySchema,
        response: {
          200: z.array(GenreStatSchema),
          500: ErrorSchema,
        },
        tags: ['Statistics'],
      },
    },
    async (request, reply) => {
      try {
        const { limit } = request.query
        const topGenres = await fastify.db.getTopGenres(limit)
        return topGenres
      } catch (err) {
        fastify.log.error('Error fetching genre statistics:', err)
        throw reply.internalServerError('Unable to fetch genre statistics')
      }
    },
  )

  // Get most watched shows
  fastify.get<{
    Querystring: z.infer<typeof LimitQuerySchema>
    Reply: z.infer<typeof ContentStatSchema>[]
  }>(
    '/shows',
    {
      schema: {
        querystring: LimitQuerySchema,
        response: {
          200: z.array(ContentStatSchema),
          500: ErrorSchema,
        },
        tags: ['Statistics'],
      },
    },
    async (request, reply) => {
      try {
        const { limit } = request.query
        const shows = await fastify.db.getMostWatchlistedShows(limit)
        return shows
      } catch (err) {
        fastify.log.error('Error fetching show statistics:', err)
        throw reply.internalServerError('Unable to fetch show statistics')
      }
    },
  )

  // Get most watched movies
  fastify.get<{
    Querystring: z.infer<typeof LimitQuerySchema>
    Reply: z.infer<typeof ContentStatSchema>[]
  }>(
    '/movies',
    {
      schema: {
        querystring: LimitQuerySchema,
        response: {
          200: z.array(ContentStatSchema),
          500: ErrorSchema,
        },
        tags: ['Statistics'],
      },
    },
    async (request, reply) => {
      try {
        const { limit } = request.query
        const movies = await fastify.db.getMostWatchlistedMovies(limit)
        return movies
      } catch (err) {
        fastify.log.error('Error fetching movie statistics:', err)
        throw reply.internalServerError('Unable to fetch movie statistics')
      }
    },
  )

  // Get top users by watchlist count
  fastify.get<{
    Querystring: z.infer<typeof LimitQuerySchema>
    Reply: z.infer<typeof UserStatSchema>[]
  }>(
    '/users',
    {
      schema: {
        querystring: LimitQuerySchema,
        response: {
          200: z.array(UserStatSchema),
          500: ErrorSchema,
        },
        tags: ['Statistics'],
      },
    },
    async (request, reply) => {
      try {
        const { limit } = request.query
        const topUsers = await fastify.db.getUsersWithMostWatchlistItems(limit)
        return topUsers
      } catch (err) {
        fastify.log.error('Error fetching user statistics:', err)
        throw reply.internalServerError('Unable to fetch user statistics')
      }
    },
  )

  // Get recent activity stats
  fastify.get<{
    Querystring: z.infer<typeof ActivityQuerySchema>
    Reply: z.infer<typeof ActivityStatsSchema>
  }>(
    '/activity',
    {
      schema: {
        querystring: ActivityQuerySchema,
        response: {
          200: ActivityStatsSchema,
          500: ErrorSchema,
        },
        tags: ['Statistics'],
      },
    },
    async (request, reply) => {
      try {
        const { days } = request.query
        const activity = await fastify.db.getRecentActivityStats(days)
        return activity
      } catch (err) {
        fastify.log.error('Error fetching activity statistics:', err)
        throw reply.internalServerError('Unable to fetch activity statistics')
      }
    },
  )

  // Get availability time stats
  fastify.get<{
    Reply: z.infer<typeof AvailabilityTimeSchema>[]
  }>(
    '/availability',
    {
      schema: {
        response: {
          200: z.array(AvailabilityTimeSchema),
          500: ErrorSchema,
        },
        tags: ['Statistics'],
      },
    },
    async (request, reply) => {
      try {
        const availability = await fastify.db.getAverageTimeToAvailability()
        return availability
      } catch (err) {
        fastify.log.error('Error fetching availability statistics:', err)
        throw reply.internalServerError(
          'Unable to fetch availability statistics',
        )
      }
    },
  )
}

export default plugin
