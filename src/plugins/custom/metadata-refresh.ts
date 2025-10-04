import type { FastifyPluginAsync } from 'fastify'
import fp from 'fastify-plugin'

/**
 * Metadata Refresh Plugin
 *
 * Registers a weekly scheduled job to refresh metadata for all watchlist items.
 * The job runs every Sunday at 2 AM to refresh posters, GUIDs, and genres from Plex API.
 */
const plugin: FastifyPluginAsync = async (fastify) => {
  const JOB_NAME = 'metadata-refresh'

  // Define the job handler
  const metadataRefreshHandler = async (jobName: string): Promise<void> => {
    try {
      fastify.log.info(`Starting scheduled metadata refresh job: ${jobName}`)

      // Refresh both watchlists with force refresh in parallel
      const [selfWatchlistResult, othersWatchlistResult] = await Promise.all([
        fastify.plexWatchlist.getSelfWatchlist(true),
        fastify.plexWatchlist.getOthersWatchlists(true),
      ])

      const totalSelfItems = selfWatchlistResult.total
      const totalOthersItems = othersWatchlistResult.total
      const totalItems = totalSelfItems + totalOthersItems

      fastify.log.info(
        `Scheduled metadata refresh completed successfully: ${totalItems} items refreshed (${totalSelfItems} self, ${totalOthersItems} others)`,
      )
    } catch (error) {
      fastify.log.error({ error, jobName }, 'Scheduled metadata refresh failed')
      throw error
    }
  }

  // Register the job handler with the scheduler using onReady hook
  fastify.addHook('onReady', async () => {
    try {
      // Check if metadata refresh schedule exists
      const existingSchedule = await fastify.db.getScheduleByName(JOB_NAME)

      if (!existingSchedule) {
        // Create the schedule - refresh weekly on Sundays at 2 AM
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

      // Register the job handler with the scheduler
      await fastify.scheduler.scheduleJob(JOB_NAME, async (jobName) => {
        try {
          // Check if job is still enabled
          const currentSchedule = await fastify.db.getScheduleByName(jobName)
          if (!currentSchedule || !currentSchedule.enabled) {
            fastify.log.debug(`Job ${jobName} is disabled, skipping`)
            return
          }

          await metadataRefreshHandler(jobName)
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
