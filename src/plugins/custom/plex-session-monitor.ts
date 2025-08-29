/**
 * Plex Session Monitor Plugin
 *
 * Registers the PlexSessionMonitorService for monitoring Plex sessions
 * and triggering Sonarr searches based on viewing patterns
 */

import { PlexSessionMonitorService } from '@services/plex-session-monitor.service.js'
import type { FastifyInstance } from 'fastify'
import fp from 'fastify-plugin'

declare module 'fastify' {
  interface FastifyInstance {
    plexSessionMonitor: PlexSessionMonitorService
  }
}

export default fp(
  async function plexSessionMonitor(fastify: FastifyInstance) {
    const service = new PlexSessionMonitorService(
      fastify.log,
      fastify,
      fastify.plexServerService,
      fastify.sonarrManager,
      fastify.db,
    )

    fastify.decorate('plexSessionMonitor', service)

    // Register scheduled jobs after server is ready
    fastify.addHook('onReady', async () => {
      try {
        await fastify.scheduler.scheduleJob(
          'plex-session-monitor',
          async () => {
            try {
              // Check if monitoring is enabled using cached config
              const config = fastify.config
              if (!config?.plexSessionMonitoring?.enabled) {
                fastify.log.debug(
                  'Plex session monitoring is disabled, skipping task',
                )
                return
              }

              fastify.log.debug('Starting Plex session monitoring task')
              const result = await service.monitorSessions()

              if (result.errors.length > 0) {
                fastify.log.error(
                  `Session monitoring completed with ${result.errors.length} errors`,
                  result.errors,
                )
              } else if (
                result.processedSessions > 0 ||
                result.triggeredSearches > 0
              ) {
                // Only log at INFO level if something actually happened
                fastify.log.info(
                  `Session monitoring completed. Processed: ${result.processedSessions}, Triggered: ${result.triggeredSearches}`,
                )
              } else {
                // Log at DEBUG level when nothing happened
                fastify.log.debug(
                  'Session monitoring completed. No active sessions to process.',
                )
              }
            } catch (error) {
              fastify.log.error(
                { error },
                'Plex session monitoring task failed:',
              )
            }
          },
        )

        // Get the schedule to see if it should be enabled
        const schedule = await fastify.db.getScheduleByName(
          'plex-session-monitor',
        )
        if (schedule?.enabled) {
          const config = fastify.config
          const intervalMinutes =
            config?.plexSessionMonitoring?.pollingIntervalMinutes || 15

          fastify.log.debug(
            `Scheduling Plex session monitoring to run every ${intervalMinutes} minutes`,
          )

          // Update the job schedule with the correct interval
          const updated = await fastify.scheduler.updateJobSchedule(
            'plex-session-monitor',
            { minutes: intervalMinutes },
            true,
          )
          if (!updated) {
            fastify.log.error('Failed to update plex-session-monitor schedule')
          }
        }

        // Register automatic reset job for rolling monitored shows
        await fastify.scheduler.scheduleJob(
          'plex-rolling-auto-reset',
          async () => {
            try {
              // Check if monitoring and auto reset are enabled using cached config
              const config = fastify.config
              const sessionConfig = config?.plexSessionMonitoring
              if (!sessionConfig?.enabled || !sessionConfig?.enableAutoReset) {
                fastify.log.debug(
                  'Plex session monitoring or auto reset is disabled, skipping auto reset task',
                )
                return
              }

              const inactivityDays = sessionConfig.inactivityResetDays || 7

              fastify.log.debug(
                `Starting automatic reset of rolling shows inactive for ${inactivityDays} days`,
              )
              await service.resetInactiveRollingShows(inactivityDays)

              fastify.log.info(
                `Automatic reset task completed for shows inactive ${inactivityDays}+ days`,
              )
            } catch (error) {
              fastify.log.error(
                { error },
                'Automatic rolling reset task failed:',
              )
            }
          },
        )

        // Check if auto reset should be enabled and configure its schedule
        const autoResetSchedule = await fastify.db.getScheduleByName(
          'plex-rolling-auto-reset',
        )
        if (autoResetSchedule?.enabled) {
          const config = fastify.config
          const sessionConfig = config?.plexSessionMonitoring
          const intervalHours = sessionConfig?.autoResetIntervalHours || 24

          fastify.log.debug(
            `Scheduling Plex rolling auto reset to run every ${intervalHours} hours`,
          )

          // Update the job schedule with the correct interval
          const updated = await fastify.scheduler.updateJobSchedule(
            'plex-rolling-auto-reset',
            { hours: intervalHours },
            true,
          )
          if (!updated) {
            fastify.log.error(
              'Failed to update plex-rolling-auto-reset schedule',
            )
          }
        }
      } catch (error) {
        fastify.log.error(
          'Failed to initialize plex session monitor scheduled jobs:',
          error,
        )
      }
    })
  },
  {
    name: 'plex-session-monitor',
    dependencies: ['database', 'plex-server', 'scheduler', 'sonarr-manager'],
  },
)
