/**
 * Maintainerr Integration Plugin
 *
 * Registers the MaintainerrService and the maintainerr-sync scheduler job
 * that keeps the Maintainerr side provisioned (webhook config, rule group
 * connections).
 */

import { MaintainerrService } from '@services/maintainerr/maintainerr.service.js'
import type { FastifyInstance } from 'fastify'
import fp from 'fastify-plugin'

declare module 'fastify' {
  interface FastifyInstance {
    maintainerr: MaintainerrService
  }
}

export default fp(
  async (fastify: FastifyInstance) => {
    const service = new MaintainerrService(fastify.log, fastify)
    fastify.decorate('maintainerr', service)

    fastify.addHook('onReady', async () => {
      try {
        const existingSchedule =
          await fastify.db.getScheduleByName('maintainerr-sync')

        if (!existingSchedule) {
          // Hourly rather than the scheduler's 24h default so new rule
          // groups connect well before their first deletion cycle
          const nextRun = new Date()
          nextRun.setHours(nextRun.getHours() + 1)

          await fastify.db.createSchedule({
            name: 'maintainerr-sync',
            type: 'interval',
            config: { hours: 1 },
            enabled: true,
            last_run: null,
            next_run: {
              time: nextRun.toISOString(),
              status: 'pending',
              estimated: true,
            },
          })
        }

        await fastify.scheduler.scheduleJob(
          'maintainerr-sync',
          async (jobName) => {
            const schedule = await fastify.db.getScheduleByName(jobName)
            if (!schedule?.enabled) {
              return
            }

            if (!fastify.config.maintainerrUrl) {
              return
            }

            await service.reconcile()
          },
        )
      } catch (error) {
        fastify.log.error(
          { error },
          'Failed to initialize maintainerr-sync scheduled job',
        )
      }
    })
  },
  {
    name: 'maintainerr',
    dependencies: ['scheduler', 'database', 'config'],
  },
)
