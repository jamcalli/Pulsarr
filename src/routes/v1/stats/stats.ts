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
  InstanceContentBreakdownSchema,
} from '@schemas/stats/stats.schema.js'

const plugin: FastifyPluginAsync = async (fastify) => {
  // Get all dashboard stats combined
  fastify.get<{
    Querystring: z.infer<typeof LimitQuerySchema & typeof ActivityQuerySchema>
    Reply: z.infer<typeof DashboardStatsSchema>
  }>(
    '/all',
    {
      schema: {
        summary: 'Get all dashboard statistics',
        operationId: 'getAllDashboardStats',
        description:
          'Retrieve comprehensive dashboard statistics including genres, content, users, and activity',
        querystring: z.object({
          ...LimitQuerySchema.shape,
          ...ActivityQuerySchema.shape,
        }),
        response: {
          200: DashboardStatsSchema,
          500: ErrorSchema,
        },
        tags: ['Statistics'],
      },
    },
    async (request, reply) => {
      try {
        const { limit, days } = request.query
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
          instanceContentBreakdown,
        ] = await Promise.all([
          fastify.db.getTopGenres(limit),
          fastify.db.getMostWatchlistedShows(limit),
          fastify.db.getMostWatchlistedMovies(limit),
          fastify.db.getUsersWithMostWatchlistItems(limit),
          fastify.db.getWatchlistStatusDistribution(),
          fastify.db.getContentTypeDistribution(),
          fastify.db.getRecentActivityStats(days),
          fastify.db.getInstanceActivityStats(),
          fastify.db.getAverageTimeToAvailability(),
          fastify.db.getAverageTimeFromGrabbedToNotified(),
          fastify.db.getNotificationStats(days),
          fastify.db.getInstanceContentBreakdown(),
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
          instance_content_breakdown: instanceContentBreakdown.instances,
        }

        return response
      } catch (err) {
        fastify.log.error(
          { error: err },
          'Error fetching dashboard statistics:',
        )
        return reply.internalServerError('Unable to fetch dashboard statistics')
      }
    },
  )

  // Get instance breakdown
  fastify.get<{
    Reply: z.infer<typeof InstanceContentBreakdownSchema>
  }>(
    '/instance-content',
    {
      schema: {
        summary: 'Get instance content breakdown',
        operationId: 'getInstanceContentBreakdown',
        description: 'Retrieve content distribution across different instances',
        response: {
          200: InstanceContentBreakdownSchema,
          500: ErrorSchema,
        },
        tags: ['Statistics'],
      },
    },
    async (request, reply) => {
      try {
        const breakdown = await fastify.db.getInstanceContentBreakdown()
        return breakdown
      } catch (err) {
        fastify.log.error(
          { error: err },
          'Error fetching instance content breakdown:',
        )
        return reply.internalServerError(
          'Unable to fetch instance content breakdown',
        )
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
        summary: 'Get top genres',
        operationId: 'getTopGenres',
        description: 'Retrieve the most popular genres from watchlists',
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
        fastify.log.error({ error: err }, 'Error fetching genre statistics:')
        return reply.internalServerError('Unable to fetch genre statistics')
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
        summary: 'Get most watched shows',
        operationId: 'getMostWatchedShows',
        description: 'Retrieve the most watchlisted TV shows',
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
        fastify.log.error({ error: err }, 'Error fetching show statistics:')
        return reply.internalServerError('Unable to fetch show statistics')
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
        summary: 'Get most watched movies',
        operationId: 'getMostWatchedMovies',
        description: 'Retrieve the most watchlisted movies',
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
        fastify.log.error({ error: err }, 'Error fetching movie statistics:')
        return reply.internalServerError('Unable to fetch movie statistics')
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
        summary: 'Get top users',
        operationId: 'getTopUsers',
        description: 'Retrieve users with the most watchlist items',
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
        fastify.log.error({ error: err }, 'Error fetching user statistics:')
        return reply.internalServerError('Unable to fetch user statistics')
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
        summary: 'Get recent activity',
        operationId: 'getRecentActivity',
        description:
          'Retrieve recent activity statistics for a specified time period',
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
        fastify.log.error({ error: err }, 'Error fetching activity statistics:')
        return reply.internalServerError('Unable to fetch activity statistics')
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
        summary: 'Get availability time stats',
        operationId: 'getAvailabilityStats',
        description:
          'Retrieve average time from adding to availability statistics',
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
        fastify.log.error(
          { error: err },
          'Error fetching availability statistics:',
        )
        return reply.internalServerError(
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
        summary: 'Get grabbed to notified time stats',
        operationId: 'getGrabbedToNotifiedStats',
        description:
          'Retrieve average time from grabbed to notified statistics',
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
        fastify.log.error(
          { error: err },
          'Error fetching grabbed-to-notified statistics:',
        )
        return reply.internalServerError(
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
        summary: 'Get status transition metrics',
        operationId: 'getStatusTransitions',
        description: 'Retrieve detailed status transition time metrics',
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
        fastify.log.error(
          { error: err },
          'Error fetching status transition metrics:',
        )
        return reply.internalServerError(
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
        summary: 'Get status flow data',
        operationId: 'getStatusFlow',
        description: 'Retrieve status flow data for visualization',
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
        fastify.log.error({ error: err }, 'Error fetching status flow data:')
        return reply.internalServerError('Unable to fetch status flow data')
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
        summary: 'Get notification statistics',
        operationId: 'getNotificationStats',
        description:
          'Retrieve notification statistics for a specified time period',
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
        fastify.log.error(
          { error: err },
          'Error fetching notification statistics:',
        )
        return reply.internalServerError(
          'Unable to fetch notification statistics',
        )
      }
    },
  )
}

export default plugin
