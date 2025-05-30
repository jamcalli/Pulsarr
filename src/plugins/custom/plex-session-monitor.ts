/**
 * Plex Session Monitor Plugin
 *
 * Registers the PlexSessionMonitorService for monitoring Plex sessions
 * and triggering Sonarr searches based on viewing patterns
 */
import fp from 'fastify-plugin'
import type { FastifyInstance } from 'fastify'
import { PlexSessionMonitorService } from '@services/plex-session-monitor.service.js'

declare module 'fastify' {
  interface FastifyInstance {
    plexSessionMonitor: PlexSessionMonitorService
  }
}

export default fp(
  async function plexSessionMonitor(fastify: FastifyInstance) {
    const service = new PlexSessionMonitorService(
      fastify.log,
      fastify.config,
      fastify.plexServerService,
      fastify.sonarrManager,
      fastify.db,
    )

    fastify.decorate('plexSessionMonitor', service)

    // Register scheduled job if enabled
    if (fastify.config.plexSessionMonitoring?.enabled) {
      const intervalMinutes =
        fastify.config.plexSessionMonitoring.pollingIntervalMinutes || 15

      fastify.log.info(
        `Registering Plex session monitoring job to run every ${intervalMinutes} minutes`,
      )

      // Register the job with the scheduler after server is ready (consistent with other services)
      fastify.ready().then(async () => {
        await fastify.scheduler.scheduleJob(
          'plex-session-monitor',
          async () => {
            try {
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
              fastify.log.error('Plex session monitoring task failed:', error)
            }
          },
        )

        // Update the job schedule with the correct interval
        await fastify.scheduler.updateJobSchedule(
          'plex-session-monitor',
          { minutes: intervalMinutes },
          true,
        )
      })
    } else {
      fastify.log.info('Plex session monitoring is disabled in configuration')
    }
  },
  {
    name: 'plex-session-monitor',
    dependencies: [
      'config',
      'database',
      'plex-server',
      'sonarr-manager',
      'scheduler',
    ],
  },
)
