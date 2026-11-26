import { DeleteSyncService } from '@services/delete-sync.service.js'
import type { FastifyInstance } from 'fastify'
import fp from 'fastify-plugin'

declare module 'fastify' {
  interface FastifyInstance {
    deleteSync: DeleteSyncService
  }
}

export default fp(
  async (fastify: FastifyInstance) => {
    fastify.log.debug('Initializing delete sync plugin')
    const service = new DeleteSyncService(fastify.log, fastify)
    fastify.decorate('deleteSync', service)

    fastify.addHook('onReady', async () => {
      try {
        await fastify.scheduler.scheduleJob('delete-sync', async () => {
          const config = fastify.config
          const isDeleteFunctionEnabled =
            config.deleteMovie ||
            config.deleteEndedShow ||
            config.deleteContinuingShow

          if (isDeleteFunctionEnabled) {
            const result = await service.run()
            const totalProcessed = result.total.processed || 0
            const totalDeleted = result.total.deleted || 0

            if (totalProcessed > 0 || totalDeleted > 0) {
              fastify.log.debug(
                `Delete sync completed: ${totalDeleted} items deleted, ${totalProcessed} total items processed`,
              )
            }
          }
        })
      } catch (error) {
        fastify.log.error(
          { error },
          'Failed to initialize delete-sync scheduled job',
        )
      }
    })
  },
  {
    name: 'delete-sync',
    dependencies: [
      'approval',
      'config',
      'database',
      'notifications',
      'plex-server',
      'plex-watchlist',
      'progress',
      'radarr-manager',
      'scheduler',
      'sonarr-manager',
      'user-tag',
    ],
  },
)
