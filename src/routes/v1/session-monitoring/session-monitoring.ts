import type { RollingMonitoredShow } from '@root/types/plex-session.types.js'
import {
  deleteRollingMonitoredSchema,
  getInactiveRollingMonitoredSchema,
  getRollingMonitoredSchema,
  resetInactiveShowsSchema,
  resetRollingMonitoredSchema,
  runSessionMonitorSchema,
} from '@schemas/session-monitoring/session-monitoring.schema.js'
import type { PlexSessionMonitorService } from '@services/plex-session-monitor.service.js'
import { serializeRollingShowDates } from '@utils/date-serializer.js'
import { logRouteError } from '@utils/route-errors.js'
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify'

/**
 * Resets a rolling monitored show's monitoring state to its original configuration based on its monitoring type.
 *
 * If the monitoring type is 'pilotRolling', the show is reset to monitor only the pilot episode. If 'firstSeasonRolling', it is reset to monitor only the first season.
 *
 * @param show - The rolling monitored show to reset.
 */
async function resetShowMonitoring(
  show: RollingMonitoredShow,
  plexSessionMonitor: PlexSessionMonitorService,
): Promise<void> {
  if (show.monitoring_type === 'pilotRolling') {
    await plexSessionMonitor.resetToPilotOnly(
      show.sonarr_series_id,
      show.sonarr_instance_id,
      show.show_title,
    )
  } else if (show.monitoring_type === 'firstSeasonRolling') {
    await plexSessionMonitor.resetToFirstSeasonOnly(
      show.sonarr_series_id,
      show.sonarr_instance_id,
      show.show_title,
    )
  }
}

/**
 * Registers Fastify routes for managing rolling monitored shows and Plex session monitoring.
 *
 * Provides endpoints to retrieve, delete, and reset rolling monitored shows, manually trigger the session monitor, and manage shows inactive for a specified number of days. All routes include request validation, error handling, and structured JSON responses.
 */
const sessionMonitoringRoutes: FastifyPluginAsync = async (fastify) => {
  // Get all rolling monitored shows
  fastify.get(
    '/rolling-monitored',
    {
      schema: getRollingMonitoredSchema,
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const shows = await fastify.db.getRollingMonitoredShows()

        return reply.send({
          success: true,
          shows: shows.map(serializeRollingShowDates),
        })
      } catch (error) {
        logRouteError(request.log, request, error, {
          message: 'Failed to fetch rolling monitored shows',
        })
        return reply.internalServerError(
          'Failed to fetch rolling monitored shows',
        )
      }
    },
  )

  // Manually run session monitor
  fastify.post(
    '/run',
    {
      schema: runSessionMonitorSchema,
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        if (!fastify.config.plexSessionMonitoring?.enabled) {
          return reply.badRequest('Session monitoring is not enabled')
        }

        request.log.info('Manually triggering session monitor')
        const result = await fastify.plexSessionMonitor.monitorSessions()

        return reply.send({
          success: true,
          result,
        })
      } catch (error) {
        logRouteError(request.log, request, error, {
          message: 'Failed to run session monitor',
        })
        return reply.internalServerError('Failed to run session monitor')
      }
    },
  )

  // Delete a rolling monitored show
  fastify.delete(
    '/rolling-monitored/:id',
    {
      schema: deleteRollingMonitoredSchema,
    },
    async (
      request: FastifyRequest<{
        Params: { id: string }
        Querystring: { reset?: string }
      }>,
      reply: FastifyReply,
    ) => {
      try {
        const { id } = request.params
        const showId = Number.parseInt(id, 10)

        if (Number.isNaN(showId)) {
          return reply.badRequest('Invalid show ID')
        }

        // Check if the show exists
        const existingShow =
          await fastify.db.getRollingMonitoredShowById(showId)

        if (!existingShow) {
          return reply.notFound('Rolling monitored show not found')
        }

        // Check if reset is requested (for backwards compatibility, default to true)
        const shouldReset = request.query.reset !== 'false'

        if (shouldReset) {
          // Reset the show to its original monitoring state and delete excess files
          await resetShowMonitoring(existingShow, fastify.plexSessionMonitor)
        }

        // Remove all user entries for this show from tracking
        const deletedCount =
          await fastify.db.deleteAllRollingMonitoredShowEntries(showId)

        request.log.info(
          `${shouldReset ? 'Completely removed and reset' : 'Completely removed'} rolling monitored show: ${existingShow.show_title} from all monitoring (${deletedCount} total entries deleted)`,
        )

        return reply.send({
          success: true,
          message: shouldReset
            ? `Successfully removed ${existingShow.show_title} from rolling monitoring entirely and reset to original monitoring state (deleted ${deletedCount} total ${deletedCount === 1 ? 'entry' : 'entries'})`
            : `Successfully removed ${existingShow.show_title} from rolling monitoring entirely (deleted ${deletedCount} total ${deletedCount === 1 ? 'entry' : 'entries'})`,
        })
      } catch (error) {
        logRouteError(request.log, request, error, {
          message: 'Failed to delete rolling monitored show',
          showId: request.params.id,
        })
        return reply.internalServerError(
          'Failed to delete rolling monitored show',
        )
      }
    },
  )

  // Reset a single rolling monitored show to its original monitoring state
  fastify.post(
    '/rolling-monitored/:id/reset',
    {
      schema: resetRollingMonitoredSchema,
    },
    async (
      request: FastifyRequest<{
        Params: { id: string }
      }>,
      reply: FastifyReply,
    ) => {
      try {
        const { id } = request.params
        const showId = Number.parseInt(id, 10)

        if (Number.isNaN(showId)) {
          return reply.badRequest('Invalid show ID')
        }

        // Check if the show exists
        const existingShow =
          await fastify.db.getRollingMonitoredShowById(showId)

        if (!existingShow) {
          return reply.notFound('Rolling monitored show not found')
        }

        // Reset the show based on its monitoring type
        await resetShowMonitoring(existingShow, fastify.plexSessionMonitor)

        // Remove all user entries and reset master record to original state
        const deletedUserEntries =
          await fastify.db.resetRollingMonitoredShowToOriginal(showId)

        request.log.info(
          `Manually reset rolling monitored show: ${existingShow.show_title} (removed ${deletedUserEntries} user entries)`,
        )

        return reply.send({
          success: true,
          message: `Successfully reset ${existingShow.show_title} to its original monitoring state${deletedUserEntries > 0 ? ` (removed ${deletedUserEntries} user ${deletedUserEntries === 1 ? 'entry' : 'entries'})` : ''}`,
        })
      } catch (error) {
        logRouteError(request.log, request, error, {
          message: 'Failed to reset rolling monitored show',
          showId: request.params.id,
        })
        return reply.internalServerError(
          'Failed to reset rolling monitored show',
        )
      }
    },
  )

  // Get inactive rolling monitored shows
  fastify.get(
    '/rolling-monitored/inactive',
    {
      schema: getInactiveRollingMonitoredSchema,
    },
    async (
      request: FastifyRequest<{
        Querystring: { inactivityDays?: number }
      }>,
      reply: FastifyReply,
    ) => {
      try {
        const inactivityDays = request.query.inactivityDays || 7

        const shows =
          await fastify.db.getInactiveRollingMonitoredShows(inactivityDays)

        return reply.send({
          success: true,
          shows: shows.map(serializeRollingShowDates),
          inactivityDays,
        })
      } catch (error) {
        logRouteError(request.log, request, error, {
          message: 'Failed to fetch inactive rolling monitored shows',
          inactivityDays: request.query.inactivityDays || 7,
        })
        return reply.internalServerError(
          'Failed to fetch inactive rolling monitored shows',
        )
      }
    },
  )

  // Reset all inactive rolling monitored shows
  fastify.post(
    '/rolling-monitored/reset-inactive',
    {
      schema: resetInactiveShowsSchema,
    },
    async (
      request: FastifyRequest<{
        Body: { inactivityDays?: number }
      }>,
      reply: FastifyReply,
    ) => {
      try {
        const inactivityDays = request.body.inactivityDays || 7

        if (inactivityDays < 1 || inactivityDays > 365) {
          return reply.badRequest('Inactivity days must be between 1 and 365')
        }

        // Get inactive shows before resetting to count them
        const inactiveShows =
          await fastify.db.getInactiveRollingMonitoredShows(inactivityDays)

        // Reset the inactive shows
        await fastify.plexSessionMonitor.resetInactiveRollingShows(
          inactivityDays,
        )

        request.log.info(
          `Manually reset ${inactiveShows.length} inactive rolling monitored shows`,
        )

        return reply.send({
          success: true,
          message: `Successfully reset ${inactiveShows.length} inactive rolling monitored shows`,
          resetCount: inactiveShows.length,
        })
      } catch (error) {
        logRouteError(request.log, request, error, {
          message: 'Failed to reset inactive rolling monitored shows',
          inactivityDays: request.body.inactivityDays || 7,
        })
        return reply.internalServerError(
          'Failed to reset inactive rolling monitored shows',
        )
      }
    },
  )
}

export default sessionMonitoringRoutes
