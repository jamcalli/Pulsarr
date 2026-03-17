import type { RollingMonitoredShow } from '@root/types/plex-session.types.js'
import {
  bulkManageRollingMonitoredSchema,
  deleteRollingMonitoredSchema,
  getInactiveRollingMonitoredSchema,
  getRollingMonitoredSchema,
  getSonarrShowsSchema,
  resetInactiveShowsSchema,
  resetRollingMonitoredSchema,
  runSessionMonitorSchema,
} from '@schemas/session-monitoring/session-monitoring.schema.js'
import type { PlexSessionMonitorService } from '@services/plex-session-monitor.service.js'
import { logRouteError } from '@utils/route-errors.js'
import type { FastifyPluginAsyncZodOpenApi } from 'fastify-zod-openapi'

/**
 * Resets a rolling monitored show's Sonarr state to match its monitoring type.
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
  } else if (show.monitoring_type === 'allSeasonPilotRolling') {
    await plexSessionMonitor.resetToAllSeasonPilots(
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
const sessionMonitoringRoutes: FastifyPluginAsyncZodOpenApi = async (
  fastify,
) => {
  // Get all rolling monitored shows
  fastify.get(
    '/rolling-monitored',
    {
      schema: getRollingMonitoredSchema,
    },
    async (request, reply) => {
      try {
        const shows = await fastify.db.getRollingMonitoredShows()

        return reply.send({
          success: true,
          shows,
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
    async (request, reply) => {
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
    async (request, reply) => {
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
    async (request, reply) => {
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
    async (request, reply) => {
      try {
        const inactivityDays = request.query.inactivityDays ?? 7

        const shows =
          await fastify.db.getInactiveRollingMonitoredShows(inactivityDays)

        return reply.send({
          success: true,
          shows,
          inactivityDays,
        })
      } catch (error) {
        logRouteError(request.log, request, error, {
          message: 'Failed to fetch inactive rolling monitored shows',
          inactivityDays: request.query.inactivityDays ?? 7,
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
    async (request, reply) => {
      try {
        const inactivityDays = request.body.inactivityDays ?? 7

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
          inactivityDays: request.body.inactivityDays ?? 7,
        })
        return reply.internalServerError(
          'Failed to reset inactive rolling monitored shows',
        )
      }
    },
  )

  // Get all Pulsarr-tracked Sonarr shows with their enrollment status
  fastify.get(
    '/sonarr-shows',
    {
      schema: getSonarrShowsSchema,
    },
    async (request, reply) => {
      try {
        const { instanceId } = request.query

        const rows =
          await fastify.db.getSonarrShowsWithEnrollmentStatus(instanceId)

        return reply.send({
          success: true,
          shows: rows.map((row) => ({
            watchlistId: row.watchlist_id,
            sonarrInstanceId: row.sonarr_instance_id,
            sonarrSeriesId: row.sonarr_series_id,
            title: row.title,
            guids: row.guids,
            rollingShowId: row.rolling_show_id,
            monitoringType: row.monitoring_type,
          })),
        })
      } catch (error) {
        logRouteError(request.log, request, error, {
          message: 'Failed to fetch Sonarr shows with enrollment status',
        })
        return reply.internalServerError(
          'Failed to fetch Sonarr shows with enrollment status',
        )
      }
    },
  )

  // Bulk enroll and/or modify rolling monitored shows
  fastify.post(
    '/rolling-monitored/bulk',
    {
      schema: bulkManageRollingMonitoredSchema,
    },
    async (request, reply) => {
      try {
        const { shows, monitoringType, resetMonitoring = false } = request.body

        if (shows.length === 0) {
          return reply.badRequest('No shows provided')
        }

        let enrolled = 0
        let modified = 0
        let skipped = 0

        for (const show of shows) {
          if (show.rollingShowId === null) {
            // Enroll: extract tvdbId from guids
            const tvdbGuid = show.guids.find((g) =>
              g.toLowerCase().startsWith('tvdb:'),
            )
            const tvdbId = tvdbGuid ? tvdbGuid.replace(/^tvdb:/i, '') : ''

            const newId =
              await fastify.plexSessionMonitor.createRollingMonitoredShow(
                show.sonarrSeriesId,
                show.sonarrInstanceId,
                tvdbId,
                show.title,
                monitoringType,
              )

            if (resetMonitoring) {
              const newShow =
                await fastify.db.getRollingMonitoredShowById(newId)
              if (newShow) {
                await resetShowMonitoring(newShow, fastify.plexSessionMonitor)
              }
            }

            // For allSeasonPilotRolling, seed E01 of every season
            if (monitoringType === 'allSeasonPilotRolling') {
              await fastify.plexSessionMonitor.monitorAllSeasonPilots(
                show.sonarrSeriesId,
                show.sonarrInstanceId,
              )
            }

            enrolled++
          } else {
            // Modify: check if type actually changed
            const existing = await fastify.db.getRollingMonitoredShowById(
              show.rollingShowId,
            )

            if (!existing) {
              skipped++
              continue
            }

            if (existing.monitoring_type === monitoringType) {
              skipped++
              continue
            }

            const initialSeason =
              monitoringType === 'allSeasonPilotRolling' ? 0 : 1

            await fastify.db.updateRollingShowMonitoringType(
              show.rollingShowId,
              monitoringType,
              initialSeason,
            )

            // Reset Sonarr state to match the new type
            const updatedShow = await fastify.db.getRollingMonitoredShowById(
              show.rollingShowId,
            )
            if (updatedShow) {
              await resetShowMonitoring(updatedShow, fastify.plexSessionMonitor)
            }

            // Reset master record progress and delete user entries
            await fastify.db.resetRollingMonitoredShowToOriginal(
              show.rollingShowId,
            )

            modified++
          }
        }

        const parts: string[] = []
        if (enrolled > 0) parts.push(`${enrolled} enrolled`)
        if (modified > 0) parts.push(`${modified} modified`)
        if (skipped > 0) parts.push(`${skipped} skipped`)

        return reply.send({
          success: true,
          message: `Bulk manage complete: ${parts.join(', ')}`,
          enrolled,
          modified,
          skipped,
        })
      } catch (error) {
        logRouteError(request.log, request, error, {
          message: 'Failed to bulk manage rolling monitored shows',
        })
        return reply.internalServerError(
          'Failed to bulk manage rolling monitored shows',
        )
      }
    },
  )
}

export default sessionMonitoringRoutes
