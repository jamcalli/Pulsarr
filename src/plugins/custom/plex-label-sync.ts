/**
 * Plex Label Sync Plugin
 *
 * Registers PlexLabelSyncService and PendingLabelSyncProcessorService
 * for label synchronization functionality
 */
import fp from 'fastify-plugin'
import type { FastifyInstance } from 'fastify'
import { PlexLabelSyncService } from '@services/plex-label-sync.service.js'
import { PendingLabelSyncProcessorService } from '@services/pending-label-sync-processor.service.js'

declare module 'fastify' {
  interface FastifyInstance {
    plexLabelSyncService: PlexLabelSyncService
    pendingLabelSyncProcessor: PendingLabelSyncProcessorService
  }
}

export default fp(
  async function plexLabelSync(fastify: FastifyInstance) {
    // Use the nested plexLabelSync configuration object
    const labelSyncConfig = fastify.config.plexLabelSync || {
      enabled: false,
      labelFormat: 'pulsarr:{username}',
      concurrencyLimit: 5, // Default concurrency limit
      removedLabelMode: 'remove' as const,
      removedLabelPrefix: 'pulsarr:removed',
    }

    // Create the Plex label sync service
    const plexLabelSyncService = new PlexLabelSyncService(
      fastify.log,
      fastify.plexServerService,
      fastify.db,
      labelSyncConfig,
    )

    // Create the pending sync processor service
    const pendingLabelSyncProcessor = new PendingLabelSyncProcessorService(
      fastify.log,
      fastify.db,
      plexLabelSyncService,
      fastify,
      fastify.config,
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
            // Check if the schedule itself is enabled
            const schedule = await fastify.db.getScheduleByName(jobName)
            if (!schedule || !schedule.enabled) {
              return
            }

            // Check if the plex label sync feature is enabled using cached config
            if (!fastify.config?.plexLabelSync?.enabled) {
              return
            }

            const processed =
              await fastify.pendingLabelSyncProcessor.processPendingLabelSyncs()
            // Only log completion if we actually processed something
            if (processed > 0) {
              fastify.log.info(`Processed ${processed} pending label syncs`)
            }
          },
        )

        // Update the schedule to run at configured interval
        await fastify.db.updateSchedule('pending-label-sync-processor', {
          type: 'interval',
          config: { seconds: 30 },
          enabled: true,
        })

        // Register the cleanup job
        await fastify.scheduler.scheduleJob(
          'pending-label-sync-cleanup',
          async (jobName) => {
            // Check if the schedule itself is enabled
            const schedule = await fastify.db.getScheduleByName(jobName)
            if (!schedule || !schedule.enabled) {
              return
            }

            // Check if the plex label sync feature is enabled using cached config
            if (!fastify.config?.plexLabelSync?.enabled) {
              return
            }

            const cleaned =
              await fastify.pendingLabelSyncProcessor.cleanupExpired()
            // Only log if we actually cleaned something
            if (cleaned > 0) {
              fastify.log.info(`Cleaned up ${cleaned} expired label syncs`)
            }
          },
        )

        // Update the cleanup schedule to run at configured interval
        await fastify.db.updateSchedule('pending-label-sync-cleanup', {
          type: 'interval',
          config: { seconds: 60 },
          enabled: true,
        })

        fastify.log.info(
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

    // Graceful shutdown on close
    fastify.addHook('onClose', async () => {
      try {
        // Unschedule the jobs from the scheduler
        await fastify.scheduler.unscheduleJob('pending-label-sync-processor')
        await fastify.scheduler.unscheduleJob('pending-label-sync-cleanup')
        fastify.log.info('Plex label sync scheduler jobs stopped gracefully')
      } catch (error) {
        fastify.log.error(
          { error },
          'Error during Plex label sync scheduler shutdown',
        )
      }
    })
  },
  {
    name: 'plex-label-sync',
    dependencies: ['database', 'config', 'plex-server', 'scheduler'],
  },
)
