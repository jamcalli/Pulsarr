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
    fastify.ready().then(async () => {
      // Register the handler for the job
      await fastify.scheduler.scheduleJob('delete-sync', async (jobName) => {
        // Run the service but don't return its result to conform to the JobHandler type
        await service.run()
        // The JobHandler expects void return
      })

      fastify.log.info('Delete sync job handler registered with scheduler')
    })

    fastify.log.info('Delete sync plugin initialized successfully')
  },
  {
    name: 'delete-sync-service',
    dependencies: [
      'scheduler',
      'sonarr-manager',
      'radarr-manager',
      'database',
      'config',
    ],
  },
)
