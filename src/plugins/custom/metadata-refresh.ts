import { MetadataRefreshService } from '@services/metadata-refresh.service.js'
import type { FastifyPluginAsync } from 'fastify'
import fp from 'fastify-plugin'

declare module 'fastify' {
  interface FastifyInstance {
    metadataRefresh: MetadataRefreshService
  }
}

const plugin: FastifyPluginAsync = async (fastify) => {
  const JOB_NAME = 'metadata-refresh'

  fastify.decorate(
    'metadataRefresh',
    new MetadataRefreshService({
      plexWatchlist: fastify.plexWatchlist,
      log: fastify.log,
    }),
  )

  fastify.addHook('onReady', async () => {
    try {
      await fastify.scheduler.scheduleJob(
        JOB_NAME,
        () => fastify.metadataRefresh.run(),
        {
          defaultSchedule: {
            type: 'cron',
            config: { expression: '0 2 * * 0' },
          },
        },
      )
    } catch (error) {
      fastify.log.error(
        { error },
        'Failed to initialize metadata-refresh scheduled job',
      )
    }
  })

  fastify.log.debug('Metadata refresh plugin initialized')
}

export default fp(plugin, {
  name: 'metadata-refresh',
  dependencies: ['config', 'database', 'plex-watchlist', 'scheduler'],
})
