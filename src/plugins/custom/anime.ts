/**
 * Anime Plugin
 *
 * Provides anime lookup functionality and scheduled updates
 */
import fp from 'fastify-plugin'
import type { FastifyInstance } from 'fastify'
import { AnimeService } from '@services/anime.service.js'

declare module 'fastify' {
  interface FastifyInstance {
    anime: AnimeService
  }
}

/**
 * Fastify plugin that provides anime lookup functionality and manages scheduled updates of the anime database.
 *
 * On initialization, decorates the Fastify instance with an `anime` service, ensures a weekly update schedule exists, registers a scheduled job to update the anime database, and performs an immediate initial population if the database is empty. Logs all major actions and errors during setup and scheduled execution.
 */
async function animePlugin(fastify: FastifyInstance) {
  // Create anime service
  const animeService = new AnimeService(fastify.db, fastify.log)

  // Register the service
  fastify.decorate('anime', animeService)

  // Register scheduled task for anime database updates
  fastify.addHook('onReady', async () => {
    try {
      // Check if anime update schedule exists
      const existingSchedule =
        await fastify.db.getScheduleByName('anime-update')

      if (!existingSchedule) {
        // Create the schedule - update weekly on Sundays at 3 AM
        const nextRun = new Date()
        const daysUntilSunday = (7 - nextRun.getDay()) % 7

        // If today is Sunday, check if it's already past 3 AM
        if (daysUntilSunday === 0) {
          const currentHour = nextRun.getHours()
          const currentMinute = nextRun.getMinutes()
          // If it's past 3 AM, schedule for next Sunday
          if (currentHour > 3 || (currentHour === 3 && currentMinute > 0)) {
            nextRun.setDate(nextRun.getDate() + 7)
          }
        } else {
          nextRun.setDate(nextRun.getDate() + daysUntilSunday)
        }

        nextRun.setHours(3, 0, 0, 0) // 3 AM

        await fastify.db.createSchedule({
          name: 'anime-update',
          type: 'cron',
          config: { expression: '0 3 * * 0' }, // Every Sunday at 3 AM
          enabled: true,
          last_run: null,
          next_run: {
            time: nextRun.toISOString(),
            status: 'pending',
            estimated: true,
          },
        })

        fastify.log.info('Created anime update schedule')
      }

      // Register the job handler with the scheduler
      await fastify.scheduler.scheduleJob('anime-update', async (jobName) => {
        try {
          // Check if job is still enabled
          const currentSchedule = await fastify.db.getScheduleByName(jobName)
          if (!currentSchedule || !currentSchedule.enabled) {
            fastify.log.debug(`Job ${jobName} is disabled, skipping`)
            return
          }

          fastify.log.info('Starting scheduled anime database update')
          const result = await animeService.updateAnimeDatabase()

          if (result.updated) {
            fastify.log.info(`Anime database updated: ${result.count} entries`)
          } else {
            fastify.log.info('Anime database update skipped - no changes')
          }
        } catch (error) {
          fastify.log.error({ error }, 'Scheduled anime update failed:')
          throw error // Re-throw so scheduler can record the failure
        }
      })

      // Check if anime database is empty and populate immediately if needed
      const animeCount = await fastify.db.getAnimeCount()
      if (animeCount === 0) {
        fastify.log.info('Anime database is empty, running initial update...')
        try {
          const result = await animeService.updateAnimeDatabase()
          if (result.updated) {
            fastify.log.info(
              `Initial anime database populated: ${result.count} entries`,
            )
          } else {
            fastify.log.warn(
              'Initial anime database update failed - no data populated',
            )
          }
        } catch (error) {
          fastify.log.error({ error }, 'Initial anime database update failed:')
          // Don't throw here - let the plugin continue to initialize
        }
      } else {
        fastify.log.info(
          `Anime database already contains ${animeCount} entries`,
        )
      }

      fastify.log.info('Anime plugin initialized successfully')
    } catch (error) {
      fastify.log.error({ error }, 'Failed to initialize anime plugin:')
    }
  })
}

export default fp(animePlugin, {
  name: 'anime',
  dependencies: ['database', 'scheduler'],
})
