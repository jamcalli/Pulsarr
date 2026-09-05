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
      const existingSchedule = await fastify.db.getScheduleByName(JOB_NAME)

      if (!existingSchedule) {
        const now = new Date()
        const nextRun = new Date(now)
        const daysUntilSunday = (7 - now.getDay()) % 7

        nextRun.setDate(now.getDate() + daysUntilSunday)
        nextRun.setHours(2, 0, 0, 0)

        if (nextRun <= now) {
          nextRun.setDate(nextRun.getDate() + 7)
        }

        await fastify.db.createSchedule({
          name: JOB_NAME,
          type: 'cron',
          config: { expression: '0 2 * * 0' }, // Every Sunday at 2 AM
          enabled: true,
          last_run: null,
          next_run: {
            time: nextRun.toISOString(),
            status: 'pending',
            estimated: true,
          },
        })

        fastify.log.debug('Created metadata refresh schedule')
      }

      await fastify.scheduler.scheduleJob(JOB_NAME, async (jobName) => {
        try {
          const currentSchedule = await fastify.db.getScheduleByName(jobName)
          if (!currentSchedule?.enabled) {
            fastify.log.debug(`Job ${jobName} is disabled, skipping`)
            return
          }

          await fastify.metadataRefresh.run()
        } catch (error) {
          fastify.log.error({ error }, `Error in scheduled job ${jobName}:`)
          throw error
        }
      })
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
  dependencies: ['scheduler', 'plex-watchlist', 'database', 'config'],
})
