import {
  ActivityQuerySchema,
  ActivityStatsSchema,
  AvailabilityTimeSchema,
  ContentStatSchema,
  ContentStatsQuerySchema,
  DashboardStatsSchema,
  ErrorSchema,
  GenreStatSchema,
  GrabbedToNotifiedTimeSchema,
  InstanceContentBreakdownSchema,
  LimitQuerySchema,
  NotificationStatsSchema,
  StatusFlowDataSchema,
  StatusTransitionTimeSchema,
  UserStatSchema,
} from '@schemas/stats/stats.schema.js'
import { logRouteError } from '@utils/route-errors.js'
import type { FastifyPluginAsyncZodOpenApi } from 'fastify-zod-openapi'
import { z } from 'zod'

const plugin: FastifyPluginAsyncZodOpenApi = async (fastify) => {
  // Get all dashboard stats combined
  fastify.get(
    '/all',
    {
      schema: {
        summary: 'Get all dashboard statistics',
        operationId: 'getAllDashboardStats',
        description:
          'Retrieve comprehensive dashboard statistics including genres, content, users, and activity',
        querystring: LimitQuerySchema.merge(ActivityQuerySchema),
        response: {
          200: DashboardStatsSchema,
          400: ErrorSchema,
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
          fastify.db.getMostWatchlistedShows({ limit, days }),
          fastify.db.getMostWatchlistedMovies({ limit, days }),
          fastify.db.getUsersWithMostWatchlistItems(limit),
          fastify.db.getWatchlistStatusDistribution(),
          fastify.db.getContentTypeDistribution(),
          fastify.db.getRecentActivityStats(days),
          fastify.db.getInstanceActivityStats(),
          fastify.db.getAverageTimeToAvailability(days),
          fastify.db.getAverageTimeFromGrabbedToNotified(days),
          fastify.db.getNotificationStats(days),
          fastify.db.getInstanceContentBreakdown(),
        ])

        let statusTransitions: z.infer<typeof StatusTransitionTimeSchema>[] = []
        let statusFlow: z.infer<typeof StatusFlowDataSchema>[] = []

        try {
          statusTransitions =
            await fastify.db.getDetailedStatusTransitionMetrics(days)
          statusFlow = await fastify.db.getStatusFlowData(days)
        } catch (err) {
          fastify.log.warn(
            { error: err },
            'Could not fetch advanced status metrics',
          )
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
          instance_content_breakdown: instanceContentBreakdown?.instances,
        }

        return response
      } catch (err) {
        logRouteError(fastify.log, request, err, {
          message: 'Failed to fetch dashboard statistics',
        })
        return reply.internalServerError('Unable to fetch dashboard statistics')
      }
    },
  )

  // Get instance breakdown
  fastify.get(
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
        logRouteError(fastify.log, request, err, {
          message: 'Failed to fetch instance content breakdown',
        })
        return reply.internalServerError(
          'Unable to fetch instance content breakdown',
        )
      }
    },
  )

  // Get top genres only
  fastify.get(
    '/genres',
    {
      schema: {
        summary: 'Get top genres',
        operationId: 'getTopGenres',
        description: 'Retrieve the most popular genres from watchlists',
        querystring: LimitQuerySchema,
        response: {
          200: z.array(GenreStatSchema),
          400: ErrorSchema,
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
        logRouteError(fastify.log, request, err, {
          message: 'Failed to fetch genre statistics',
        })
        return reply.internalServerError('Unable to fetch genre statistics')
      }
    },
  )

  // Get most watched shows
  fastify.get(
    '/shows',
    {
      schema: {
        summary: 'Get most watched shows',
        operationId: 'getMostWatchedShows',
        description:
          'Retrieve the most watchlisted TV shows with optional date filtering and pagination',
        querystring: ContentStatsQuerySchema,
        response: {
          200: z.array(ContentStatSchema),
          400: ErrorSchema,
          500: ErrorSchema,
        },
        tags: ['Statistics'],
      },
    },
    async (request, reply) => {
      try {
        const { limit, offset, days } = request.query
        const shows = await fastify.db.getMostWatchlistedShows({
          limit,
          offset,
          days,
        })
        return shows
      } catch (err) {
        logRouteError(fastify.log, request, err, {
          message: 'Failed to fetch show statistics',
        })
        return reply.internalServerError('Unable to fetch show statistics')
      }
    },
  )

  // Get most watched movies
  fastify.get(
    '/movies',
    {
      schema: {
        summary: 'Get most watched movies',
        operationId: 'getMostWatchedMovies',
        description:
          'Retrieve the most watchlisted movies with optional date filtering and pagination',
        querystring: ContentStatsQuerySchema,
        response: {
          200: z.array(ContentStatSchema),
          400: ErrorSchema,
          500: ErrorSchema,
        },
        tags: ['Statistics'],
      },
    },
    async (request, reply) => {
      try {
        const { limit, offset, days } = request.query
        const movies = await fastify.db.getMostWatchlistedMovies({
          limit,
          offset,
          days,
        })
        return movies
      } catch (err) {
        logRouteError(fastify.log, request, err, {
          message: 'Failed to fetch movie statistics',
        })
        return reply.internalServerError('Unable to fetch movie statistics')
      }
    },
  )

  // Get top users by watchlist count
  fastify.get(
    '/users',
    {
      schema: {
        summary: 'Get top users',
        operationId: 'getTopUsers',
        description: 'Retrieve users with the most watchlist items',
        querystring: LimitQuerySchema,
        response: {
          200: z.array(UserStatSchema),
          400: ErrorSchema,
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
        logRouteError(fastify.log, request, err, {
          message: 'Failed to fetch user statistics',
        })
        return reply.internalServerError('Unable to fetch user statistics')
      }
    },
  )

  // Get recent activity stats
  fastify.get(
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
          400: ErrorSchema,
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
        logRouteError(fastify.log, request, err, {
          message: 'Failed to fetch activity statistics',
        })
        return reply.internalServerError('Unable to fetch activity statistics')
      }
    },
  )

  // Get availability time stats
  fastify.get(
    '/availability',
    {
      schema: {
        summary: 'Get availability time stats',
        operationId: 'getAvailabilityStats',
        description:
          'Retrieve average time from adding to availability statistics',
        querystring: ActivityQuerySchema,
        response: {
          200: z.array(AvailabilityTimeSchema),
          400: ErrorSchema,
          500: ErrorSchema,
        },
        tags: ['Statistics'],
      },
    },
    async (request, reply) => {
      try {
        const { days } = request.query
        const availability = await fastify.db.getAverageTimeToAvailability(days)
        return availability
      } catch (err) {
        logRouteError(fastify.log, request, err, {
          message: 'Failed to fetch availability statistics',
        })
        return reply.internalServerError(
          'Unable to fetch availability statistics',
        )
      }
    },
  )

  // NEW ENDPOINT: Get grabbed to notified time stats
  fastify.get(
    '/grabbed-to-notified',
    {
      schema: {
        summary: 'Get grabbed to notified time stats',
        operationId: 'getGrabbedToNotifiedStats',
        description:
          'Retrieve average time from grabbed to notified statistics',
        querystring: ActivityQuerySchema,
        response: {
          200: z.array(GrabbedToNotifiedTimeSchema),
          400: ErrorSchema,
          500: ErrorSchema,
        },
        tags: ['Statistics'],
      },
    },
    async (request, reply) => {
      try {
        const { days } = request.query
        const times = await fastify.db.getAverageTimeFromGrabbedToNotified(days)
        return times
      } catch (err) {
        logRouteError(fastify.log, request, err, {
          message: 'Failed to fetch grabbed-to-notified statistics',
        })
        return reply.internalServerError(
          'Unable to fetch grabbed-to-notified statistics',
        )
      }
    },
  )

  // NEW ENDPOINT: Get detailed status transition metrics
  fastify.get(
    '/status-transitions',
    {
      schema: {
        summary: 'Get status transition metrics',
        operationId: 'getStatusTransitions',
        description: 'Retrieve detailed status transition time metrics',
        querystring: ActivityQuerySchema,
        response: {
          200: z.array(StatusTransitionTimeSchema),
          400: ErrorSchema,
          500: ErrorSchema,
        },
        tags: ['Statistics'],
      },
    },
    async (request, reply) => {
      try {
        const { days } = request.query
        const transitions =
          await fastify.db.getDetailedStatusTransitionMetrics(days)
        return transitions
      } catch (err) {
        logRouteError(fastify.log, request, err, {
          message: 'Failed to fetch status transition metrics',
        })
        return reply.internalServerError(
          'Unable to fetch status transition metrics',
        )
      }
    },
  )

  // NEW ENDPOINT: Get status flow data for visualization
  fastify.get(
    '/status-flow',
    {
      schema: {
        summary: 'Get status flow data',
        operationId: 'getStatusFlow',
        description: 'Retrieve status flow data for visualization',
        querystring: ActivityQuerySchema,
        response: {
          200: z.array(StatusFlowDataSchema),
          400: ErrorSchema,
          500: ErrorSchema,
        },
        tags: ['Statistics'],
      },
    },
    async (request, reply) => {
      try {
        const { days } = request.query
        const flowData = await fastify.db.getStatusFlowData(days)
        return flowData
      } catch (err) {
        logRouteError(fastify.log, request, err, {
          message: 'Failed to fetch status flow data',
        })
        return reply.internalServerError('Unable to fetch status flow data')
      }
    },
  )

  fastify.get(
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
          400: ErrorSchema,
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
        logRouteError(fastify.log, request, err, {
          message: 'Failed to fetch notification statistics',
        })
        return reply.internalServerError(
          'Unable to fetch notification statistics',
        )
      }
    },
  )
}

export default plugin
