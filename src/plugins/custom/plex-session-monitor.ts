import { PLEX_SESSION_MONITORING_DEFAULTS } from '@root/schemas/session-monitoring/session-monitoring-config.schema.js'
import { sessionMonitorJobSchedules } from '@services/plex-session-monitor/job-schedules.js'
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
    const service = new PlexSessionMonitorService(fastify.log, fastify)

    fastify.decorate('plexSessionMonitor', service)

    fastify.addHook('onReady', async () => {
      try {
        let playingChain: Promise<void> = Promise.resolve()
        fastify.plexServerService.onSSE('playing', (notifications) => {
          if (!fastify.config.plexSessionMonitoring?.enabled) return
          playingChain = playingChain
            .then(() => service.handlePlayingEvent(notifications))
            .catch((error) => {
              fastify.log.error({ error }, 'SSE playing handler failed')
            })
        })

        // A disconnect may have dropped playing events, so poll once to bridge the gap
        fastify.plexServerService.onSSE('disconnected', () => {
          if (fastify.config.plexSessionMonitoring?.enabled) {
            void service.monitorSessions()
          }
        })

        const schedules = sessionMonitorJobSchedules(
          fastify.config.plexSessionMonitoring,
        )

        await fastify.scheduler.scheduleJob(
          'plex-session-monitor',
          async () => {
            if (!fastify.config.plexSessionMonitoring?.enabled) {
              fastify.log.debug(
                'Plex session monitoring is disabled, skipping task',
              )
              return
            }

            if (fastify.plexServerService.isSSEConnected()) {
              fastify.log.debug('SSE active, skipping session monitor poll')
              return
            }

            fastify.log.debug('Starting Plex session monitoring task')
            const result = await service.monitorSessions()

            if (result.errors.length > 0) {
              fastify.log.error(
                { errors: result.errors },
                `Session monitoring completed with ${result.errors.length} errors`,
              )
            } else if (result.triggeredSearches > 0) {
              fastify.log.info(
                `Session monitoring completed. Processed: ${result.processedSessions}, Triggered: ${result.triggeredSearches}`,
              )
            } else {
              fastify.log.debug(
                'Session monitoring completed. No active sessions to process.',
              )
            }
          },
          {
            schedule: {
              type: 'interval',
              ...schedules['plex-session-monitor'],
            },
          },
        )

        await fastify.scheduler.scheduleJob(
          'plex-rolling-auto-reset',
          async () => {
            const sessionConfig = fastify.config.plexSessionMonitoring
            if (!sessionConfig?.enabled || !sessionConfig?.enableAutoReset) {
              fastify.log.debug(
                'Plex session monitoring or auto reset is disabled, skipping auto reset task',
              )
              return
            }

            const inactivityDays =
              sessionConfig.inactivityResetDays ??
              PLEX_SESSION_MONITORING_DEFAULTS.inactivityResetDays

            fastify.log.debug(
              `Starting automatic reset of rolling shows inactive for ${inactivityDays} days`,
            )
            await service.resetInactiveRollingShows(inactivityDays)

            fastify.log.info(
              `Automatic reset task completed for shows inactive ${inactivityDays}+ days`,
            )
          },
          {
            schedule: {
              type: 'interval',
              ...schedules['plex-rolling-auto-reset'],
            },
          },
        )

        await fastify.scheduler.scheduleJob(
          'plex-rolling-pilot-sync',
          async () => {
            if (!fastify.config.plexSessionMonitoring?.enabled) {
              fastify.log.debug(
                'Plex session monitoring is disabled, skipping pilot sync task',
              )
              return
            }

            fastify.log.debug(
              'Starting new season pilot sync for allSeasonPilotRolling shows',
            )
            await service.syncNewSeasonPilots()

            fastify.log.info('New season pilot sync task completed')
          },
          {
            schedule: {
              type: 'interval',
              ...schedules['plex-rolling-pilot-sync'],
            },
          },
        )
      } catch (error) {
        fastify.log.error(
          { error },
          'Failed to initialize plex session monitor scheduled jobs',
        )
      }
    })
  },
  {
    name: 'plex-session-monitor',
    dependencies: [
      'config',
      'database',
      'plex-server',
      'scheduler',
      'sonarr-manager',
    ],
  },
)
