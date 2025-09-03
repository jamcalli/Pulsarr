/**
 * IMDB Plugin
 *
 * Provides IMDB ratings lookup functionality and scheduled updates
 */

import { ImdbService } from '@services/imdb.service.js'
import type { FastifyInstance } from 'fastify'
import fp from 'fastify-plugin'

declare module 'fastify' {
  interface FastifyInstance {
    imdb: ImdbService
  }
}

/**
 * Fastify plugin that provides IMDB ratings lookup functionality and manages scheduled updates of the IMDB ratings database.
 *
 * On initialization, decorates the Fastify instance with an `imdb` service, ensures a daily update schedule exists, registers a scheduled job to update the IMDB ratings database, and performs an immediate initial population if the database is empty. Logs all major actions and errors during setup and scheduled execution.
 */
async function imdbPlugin(fastify: FastifyInstance) {
  // Create IMDB service
  const imdbService = new ImdbService(fastify.db, fastify.log)

  // Register the service
  fastify.decorate('imdb', imdbService)

  // Register scheduled task for IMDB ratings database updates
  fastify.addHook('onReady', async () => {
    try {
      // Check if IMDB update schedule exists
      const existingSchedule = await fastify.db.getScheduleByName('imdb-update')

      if (!existingSchedule) {
        // Create the schedule - update daily at 2:30 AM
        const nextRun = new Date()

        // If it's already past 2:30 AM today, schedule for tomorrow
        if (
          nextRun.getHours() > 2 ||
          (nextRun.getHours() === 2 && nextRun.getMinutes() >= 30)
        ) {
          nextRun.setDate(nextRun.getDate() + 1)
        }

        nextRun.setHours(2, 30, 0, 0) // 2:30 AM daily

        await fastify.db.createSchedule({
          name: 'imdb-update',
          type: 'cron',
          config: { expression: '30 2 * * *' }, // Every day at 2:30 AM
          enabled: true,
          last_run: null,
          next_run: {
            time: nextRun.toISOString(),
            status: 'pending',
            estimated: true,
          },
        })

        fastify.log.debug('Created IMDB update schedule')
      }

      // Register the job handler with the scheduler
      await fastify.scheduler.scheduleJob('imdb-update', async (jobName) => {
        // Check if job is still enabled
        const currentSchedule = await fastify.db.getScheduleByName(jobName)
        if (!currentSchedule || !currentSchedule.enabled) {
          fastify.log.debug(`Job ${jobName} is disabled, skipping`)
          return
        }

        try {
          fastify.log.info('Starting scheduled IMDB ratings database update')
          const result = await imdbService.updateImdbDatabase()

          if (result.updated) {
            fastify.log.info(
              `IMDB ratings database updated: ${result.count} entries`,
            )
          } else {
            fastify.log.info(
              'IMDB ratings database update skipped - no changes',
            )
          }
        } catch (error) {
          fastify.log.error({ error }, 'Scheduled IMDB update failed:')
          throw error // Re-throw so scheduler can record the failure
        }
      })

      // Check if IMDB database is empty and populate in background if needed
      const imdbCount = await fastify.db.getImdbRatingCount()
      if (imdbCount === 0) {
        fastify.log.info(
          'IMDB ratings database is empty, running initial update in background...',
        )
        // Run initial population in background to avoid blocking server startup
        setImmediate(async () => {
          try {
            const result = await imdbService.updateImdbDatabase()
            if (result.updated) {
              fastify.log.info(
                `Initial IMDB ratings database populated: ${result.count} entries`,
              )
            } else {
              fastify.log.info(
                'Initial IMDB ratings database had no changes; nothing to populate',
              )
            }
          } catch (error) {
            fastify.log.error(
              { error },
              'Initial IMDB ratings database update failed:',
            )
          }
        })
      } else {
        fastify.log.info(
          `IMDB ratings database already contains ${imdbCount} entries`,
        )
      }

      fastify.log.debug('IMDB plugin initialized successfully')
    } catch (error) {
      fastify.log.error({ error }, 'Failed to initialize IMDB plugin:')
    }
  })
}

export default fp(imdbPlugin, {
  name: 'imdb',
  dependencies: ['database', 'scheduler'],
})
