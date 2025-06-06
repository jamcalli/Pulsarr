import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify'
import {
  getRollingMonitoredSchema,
  runSessionMonitorSchema,
  deleteRollingMonitoredSchema,
  resetRollingMonitoredSchema,
  resetInactiveShowsSchema,
  getInactiveRollingMonitoredSchema,
} from '@schemas/session-monitoring/session-monitoring.schema.js'
import type { RollingMonitoredShow } from '@root/types/plex-session.types.js'
import type { PlexSessionMonitorService } from '@services/plex-session-monitor.service.js'
import { serializeRollingShowDates } from '@utils/date-serializer.js'

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
        request.log.error('Error fetching rolling monitored shows:', error)
        return reply.code(400).send({
          error: 'Failed to fetch rolling monitored shows',
        })
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
          return reply.code(400).send({
            error: 'Session monitoring is not enabled',
          })
        }

        request.log.info('Manually triggering session monitor')
        const result = await fastify.plexSessionMonitor.monitorSessions()

        return reply.send({
          success: true,
          result,
        })
      } catch (error) {
        request.log.error('Error running session monitor:', error)
        return reply.code(400).send({
          error: 'Failed to run session monitor',
        })
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
          return reply.code(400).send({
            error: 'Invalid show ID',
          })
        }

        // Check if the show exists
        const existingShow =
          await fastify.db.getRollingMonitoredShowById(showId)

        if (!existingShow) {
          return reply.code(404).send({
            error: 'Rolling monitored show not found',
          })
        }

        // Check if reset is requested (for backwards compatibility, default to true)
        const shouldReset = request.query.reset !== 'false'

        if (shouldReset) {
          // Reset the show to its original monitoring state and delete excess files
          await resetShowMonitoring(existingShow, fastify.plexSessionMonitor)
        }

        // Remove from tracking
        await fastify.db.deleteRollingMonitoredShow(showId)

        request.log.info(
          `${shouldReset ? 'Deleted and reset' : 'Removed'} rolling monitored show with ID ${showId}`,
        )

        return reply.send({
          success: true,
          message: shouldReset
            ? `Successfully deleted ${existingShow.show_title} and reset to original monitoring state`
            : `Successfully removed ${existingShow.show_title} from rolling monitoring`,
        })
      } catch (error) {
        request.log.error('Error deleting rolling monitored show:', error)
        return reply.code(400).send({
          error: 'Failed to delete rolling monitored show',
        })
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
          return reply.code(400).send({
            error: 'Invalid show ID',
          })
        }

        // Check if the show exists
        const existingShow =
          await fastify.db.getRollingMonitoredShowById(showId)

        if (!existingShow) {
          return reply.code(404).send({
            error: 'Rolling monitored show not found',
          })
        }

        // Reset the show based on its monitoring type
        await resetShowMonitoring(existingShow, fastify.plexSessionMonitor)

        // Update the database to reset the current monitored season
        await fastify.db.updateRollingShowMonitoredSeason(showId, 1)

        request.log.info(
          `Manually reset rolling monitored show: ${existingShow.show_title}`,
        )

        return reply.send({
          success: true,
          message: `Successfully reset ${existingShow.show_title} to its original monitoring state`,
        })
      } catch (error) {
        request.log.error('Error resetting rolling monitored show:', error)
        return reply.code(400).send({
          error: 'Failed to reset rolling monitored show',
        })
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
        request.log.error(
          'Error fetching inactive rolling monitored shows:',
          error,
        )
        return reply.code(400).send({
          error: 'Failed to fetch inactive rolling monitored shows',
        })
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
          return reply.code(400).send({
            error: 'Inactivity days must be between 1 and 365',
          })
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
        request.log.error(
          'Error resetting inactive rolling monitored shows:',
          error,
        )
        return reply.code(400).send({
          error: 'Failed to reset inactive rolling monitored shows',
        })
      }
    },
  )
}

export default sessionMonitoringRoutes
