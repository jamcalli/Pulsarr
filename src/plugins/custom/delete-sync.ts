/**
 * Delete Sync Service Plugin
 *
 * This plugin registers the DeleteSyncService with the Fastify application
 * and connects it to the pre-existing scheduler job.
 */
import fp from 'fastify-plugin'
import type { FastifyInstance } from 'fastify'
import { DeleteSyncService } from '@services/delete-sync.service.js'

declare module 'fastify' {
  interface FastifyInstance {
    deleteSync: DeleteSyncService
  }
}

export default fp(
  async (fastify: FastifyInstance) => {
    fastify.log.info('Initializing delete sync plugin')
    // Create and register the delete sync service
    const service = new DeleteSyncService(fastify.log, fastify)
    fastify.decorate('deleteSync', service)

    // Register the job handler with the scheduler
    fastify.addHook('onReady', async () => {
      try {
        // Register the handler for the job
        await fastify.scheduler.scheduleJob('delete-sync', async (_jobName) => {
          // First check if the schedule itself is enabled
          const schedule = await fastify.db.getScheduleByName('delete-sync')
          if (!schedule || !schedule.enabled) {
            // Schedule is disabled - don't run
            return
          }

          // Then check if delete sync functionality is enabled
          const config = fastify.config
          const isDeleteFunctionEnabled =
            config.deleteMovie ||
            config.deleteEndedShow ||
            config.deleteContinuingShow

          if (isDeleteFunctionEnabled) {
            const result = await service.run()
            const totalProcessed = result.total.processed || 0
            const totalDeleted = result.total.deleted || 0

            // Only log if work was actually done
            if (totalProcessed > 0 || totalDeleted > 0) {
              fastify.log.info(
                `Delete sync completed: ${totalDeleted} items deleted, ${totalProcessed} total items processed`,
              )
            }
          }
        })
      } catch (error) {
        fastify.log.error(
          'Failed to initialize delete-sync scheduled job:',
          error,
        )
      }
    })
  },
  {
    name: 'delete-sync-service',
    dependencies: [
      'scheduler',
      'sonarr-manager',
      'radarr-manager',
      'database',
      'config',
      'discord-notification-service',
      'plex-watchlist',
    ],
  },
)
