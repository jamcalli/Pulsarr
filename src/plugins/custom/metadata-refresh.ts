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

      // Refresh self watchlist with force refresh flag
      const selfWatchlistResult =
        await fastify.plexWatchlist.getSelfWatchlist(true)

      // Refresh others watchlist with force refresh flag
      const othersWatchlistResult =
        await fastify.plexWatchlist.getOthersWatchlists(true)

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
        const nextRun = new Date()
        const daysUntilSunday = (7 - nextRun.getDay()) % 7

        // If today is Sunday, check if it's already past 2 AM
        if (daysUntilSunday === 0) {
          const currentHour = nextRun.getHours()
          const currentMinute = nextRun.getMinutes()
          // If it's past 2 AM, schedule for next Sunday
          if (currentHour > 2 || (currentHour === 2 && currentMinute > 0)) {
            nextRun.setDate(nextRun.getDate() + 7)
          }
        } else {
          nextRun.setDate(nextRun.getDate() + daysUntilSunday)
        }

        nextRun.setHours(2, 0, 0, 0) // 2 AM

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

        fastify.log.info('Created metadata refresh schedule')
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
        'Failed to initialize metadata-refresh scheduled job:',
        error,
      )
    }
  })

  fastify.log.info('Metadata refresh plugin initialized')
}

export default fp(plugin, {
  name: 'metadata-refresh',
  dependencies: ['scheduler', 'plex-watchlist', 'database', 'config'],
})
