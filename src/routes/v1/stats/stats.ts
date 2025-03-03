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
  GrabbedToNotifiedTimeSchema,
  StatusTransitionTimeSchema,
  StatusFlowDataSchema,
  ErrorSchema,
  LimitQuerySchema,
  ActivityQuerySchema,
  NotificationStatsSchema,
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
          grabbedToNotifiedTimes,
          notificationStats,
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
          fastify.db.getAverageTimeFromGrabbedToNotified(),
          fastify.db.getNotificationStats(),
        ])

        let statusTransitions: z.infer<typeof StatusTransitionTimeSchema>[] = []
        let statusFlow: z.infer<typeof StatusFlowDataSchema>[] = []

        try {
          statusTransitions =
            await fastify.db.getDetailedStatusTransitionMetrics()
          statusFlow = await fastify.db.getStatusFlowData()
        } catch (err) {
          fastify.log.warn('Could not fetch advanced status metrics:', err)
        }

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
          grabbed_to_notified_times: grabbedToNotifiedTimes,
          status_transitions: statusTransitions,
          status_flow: statusFlow,
          notification_stats: notificationStats,
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

  // NEW ENDPOINT: Get grabbed to notified time stats
  fastify.get<{
    Reply: z.infer<typeof GrabbedToNotifiedTimeSchema>[]
  }>(
    '/grabbed-to-notified',
    {
      schema: {
        response: {
          200: z.array(GrabbedToNotifiedTimeSchema),
          500: ErrorSchema,
        },
        tags: ['Statistics'],
      },
    },
    async (request, reply) => {
      try {
        const times = await fastify.db.getAverageTimeFromGrabbedToNotified()
        return times
      } catch (err) {
        fastify.log.error('Error fetching grabbed-to-notified statistics:', err)
        throw reply.internalServerError(
          'Unable to fetch grabbed-to-notified statistics',
        )
      }
    },
  )

  // NEW ENDPOINT: Get detailed status transition metrics
  fastify.get<{
    Reply: z.infer<typeof StatusTransitionTimeSchema>[]
  }>(
    '/status-transitions',
    {
      schema: {
        response: {
          200: z.array(StatusTransitionTimeSchema),
          500: ErrorSchema,
        },
        tags: ['Statistics'],
      },
    },
    async (request, reply) => {
      try {
        const transitions =
          await fastify.db.getDetailedStatusTransitionMetrics()
        return transitions
      } catch (err) {
        fastify.log.error('Error fetching status transition metrics:', err)
        throw reply.internalServerError(
          'Unable to fetch status transition metrics',
        )
      }
    },
  )

  // NEW ENDPOINT: Get status flow data for visualization
  fastify.get<{
    Reply: z.infer<typeof StatusFlowDataSchema>[]
  }>(
    '/status-flow',
    {
      schema: {
        response: {
          200: z.array(StatusFlowDataSchema),
          500: ErrorSchema,
        },
        tags: ['Statistics'],
      },
    },
    async (request, reply) => {
      try {
        const flowData = await fastify.db.getStatusFlowData()
        return flowData
      } catch (err) {
        fastify.log.error('Error fetching status flow data:', err)
        throw reply.internalServerError('Unable to fetch status flow data')
      }
    },
  )

  fastify.get<{
    Querystring: z.infer<typeof ActivityQuerySchema>
    Reply: z.infer<typeof NotificationStatsSchema>
  }>(
    '/notifications',
    {
      schema: {
        querystring: ActivityQuerySchema,
        response: {
          200: NotificationStatsSchema,
          500: ErrorSchema,
        },
        tags: ['Statistics'],
      },
    },
    async (request, reply) => {
      try {
        const { days } = request.query
        const stats = await fastify.db.getNotificationStats(days)
        return stats
      } catch (err) {
        fastify.log.error('Error fetching notification statistics:', err)
        throw reply.internalServerError(
          'Unable to fetch notification statistics',
        )
      }
    },
  )
}

export default plugin
