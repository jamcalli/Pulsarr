/**
 * Plex Label Sync Plugin
 *
 * Registers PlexLabelSyncService and PendingLabelSyncProcessorService
 * for label synchronization functionality
 */

import { PendingLabelSyncProcessorService } from '@services/pending-label-sync-processor.service.js'
import { PlexLabelSyncService } from '@services/plex-label-sync.service.js'
import type { FastifyInstance } from 'fastify'
import fp from 'fastify-plugin'

declare module 'fastify' {
  interface FastifyInstance {
    plexLabelSyncService: PlexLabelSyncService
    pendingLabelSyncProcessor: PendingLabelSyncProcessorService
  }
}

export default fp(
  async function plexLabelSync(fastify: FastifyInstance) {
    // Create the Plex label sync service
    const plexLabelSyncService = new PlexLabelSyncService(fastify.log, fastify)

    // Create the pending sync processor service
    const pendingLabelSyncProcessor = new PendingLabelSyncProcessorService(
      fastify.log,
      fastify,
    )

    // Decorate fastify instance with services
    fastify.decorate('plexLabelSyncService', plexLabelSyncService)
    fastify.decorate('pendingLabelSyncProcessor', pendingLabelSyncProcessor)

    // Register scheduled jobs on ready (following the same pattern as other plugins)
    fastify.addHook('onReady', async () => {
      try {
        // Register the pending label sync processor job
        await fastify.scheduler.scheduleJob(
          'pending-label-sync-processor',
          async (jobName) => {
            try {
              // Check if the schedule itself is enabled
              const schedule = await fastify.db.getScheduleByName(jobName)
              if (!schedule || !schedule.enabled) {
                return
              }

              // Check if the plex label sync feature is enabled using cached config
              if (!fastify.config?.plexLabelSync?.enabled) {
                return
              }

              await fastify.pendingLabelSyncProcessor.processPendingLabelSyncs()
            } catch (error) {
              fastify.log.error(
                { error },
                'pending-label-sync-processor job failed',
              )
            }
          },
        )

        // Update the schedule to run at configured interval (match pending webhook interval)
        await fastify.db.updateSchedule('pending-label-sync-processor', {
          type: 'interval',
          config: { seconds: 30 }, // Check every 30 seconds
          enabled: true,
        })

        // Register the cleanup job
        await fastify.scheduler.scheduleJob(
          'pending-label-sync-cleanup',
          async (jobName) => {
            try {
              // Check if the schedule itself is enabled
              const schedule = await fastify.db.getScheduleByName(jobName)
              if (!schedule || !schedule.enabled) {
                return
              }

              // Check if the plex label sync feature is enabled using cached config
              if (!fastify.config?.plexLabelSync?.enabled) {
                return
              }

              await fastify.pendingLabelSyncProcessor.cleanupExpired()
            } catch (error) {
              fastify.log.error(
                { error },
                'pending-label-sync-cleanup job failed',
              )
            }
          },
        )

        // Update the cleanup schedule to run at configured interval
        await fastify.db.updateSchedule('pending-label-sync-cleanup', {
          type: 'interval',
          config: { seconds: 60 },
          enabled: true,
        })

        // Check if plex label full sync schedule exists
        const existingFullSyncSchedule = await fastify.db.getScheduleByName(
          'plex-label-full-sync',
        )

        if (!existingFullSyncSchedule) {
          // Create the schedule - run weekly on Sundays at 2 AM
          const now = new Date()
          const nextRun = new Date(now)
          const daysUntilSunday = (7 - now.getDay()) % 7

          nextRun.setDate(now.getDate() + daysUntilSunday)
          nextRun.setHours(2, 0, 0, 0)

          if (nextRun <= now) {
            nextRun.setDate(nextRun.getDate() + 7)
          }

          await fastify.db.createSchedule({
            name: 'plex-label-full-sync',
            type: 'cron',
            config: { expression: '0 2 * * 0' }, // Every Sunday at 2 AM
            enabled: false, // Start disabled
            last_run: null,
            next_run: {
              time: nextRun.toISOString(),
              status: 'pending',
              estimated: true,
            },
          })

          fastify.log.debug('Created plex label full sync schedule')
        }

        // Register the full sync job handler
        await fastify.scheduler.scheduleJob(
          'plex-label-full-sync',
          async (jobName) => {
            try {
              const schedule = await fastify.db.getScheduleByName(jobName)
              if (!schedule || !schedule.enabled) {
                return
              }

              if (!fastify.config?.plexLabelSync?.enabled) {
                return
              }

              // Sync will automatically reset if autoResetOnScheduledSync is enabled in config
              await fastify.plexLabelSyncService.syncAllLabels()
            } catch (error) {
              fastify.log.error({ error }, 'plex-label-full-sync job failed')
            }
          },
        )

        fastify.log.debug(
          'Plex label sync scheduler jobs registered successfully',
        )
      } catch (error) {
        fastify.log.error(
          { error },
          'Error during Plex label sync scheduler registration',
        )
        // Don't throw - let server continue without label sync functionality
      }
    })
  },
  {
    name: 'plex-label-sync',
    dependencies: [
      'database',
      'config',
      'plex-server',
      'scheduler',
      'radarr-manager',
      'sonarr-manager',
      'progress',
    ],
  },
)
