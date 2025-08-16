import { QuotaService } from '@services/quota.service.js'
import type { FastifyPluginAsync } from 'fastify'
import fp from 'fastify-plugin'

/**
 * Plugin to register the quota management service
 */
const quotaPlugin: FastifyPluginAsync = async (fastify, _opts) => {
  // Create the quota service
  const quotaService = new QuotaService(fastify)

  fastify.decorate('quotaService', quotaService)

  // Register scheduled job on ready
  fastify.addHook('onReady', async () => {
    // Check if schedule exists, if not create with cron default
    const schedule = await fastify.db.getScheduleByName('quota-maintenance')
    if (!schedule) {
      // Create cron schedule for daily at 2 AM instead of interval default
      const nextRun = new Date()
      nextRun.setDate(nextRun.getDate() + 1)
      nextRun.setHours(2, 0, 0, 0)

      await fastify.db.createSchedule({
        name: 'quota-maintenance',
        type: 'cron',
        config: { expression: '0 2 * * *' },
        enabled: true,
        last_run: null,
        next_run: {
          time: nextRun.toISOString(),
          status: 'pending',
          estimated: true,
        },
      })

      fastify.log.info(
        'Created quota-maintenance schedule with cron default: daily at 2 AM',
      )
    }

    await fastify.scheduler.scheduleJob(
      'quota-maintenance',
      async (jobName) => {
        try {
          const currentSchedule =
            await fastify.db.getScheduleByName('quota-maintenance')
          if (!currentSchedule || !currentSchedule.enabled) {
            fastify.log.debug(`Skipping disabled job: ${jobName}`)
            return
          }

          fastify.log.info(`Running scheduled job: ${jobName}`)
          await quotaService.performAllQuotaMaintenance()
          fastify.log.info(`Completed scheduled job: ${jobName}`)
        } catch (error) {
          fastify.log.error(
            { error, jobName, schedule: 'quota-maintenance' },
            'Error in scheduled job',
          )
        }
      },
    )
  })
}

export default fp(quotaPlugin, {
  name: 'quota',
  dependencies: ['database', 'scheduler'],
})

// Add type definitions
declare module 'fastify' {
  interface FastifyInstance {
    quotaService: QuotaService
  }
}
