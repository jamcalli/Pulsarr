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
        await fastify.scheduler.scheduleJob(
          'maintainerr-sync',
          async () => {
            if (!service.isEnabled) {
              return
            }

            await service.reconcile()
          },
          {
            // Hourly so new rule groups connect well before their first deletion cycle
            defaultSchedule: {
              type: 'interval',
              config: { hours: 1 },
              enabled: service.isEnabled,
            },
          },
        )

        // The verification test webhook has to reach our own receiver, so the boot reconcile waits for listen
        const bootReconcile = () => {
          if (!service.isEnabled) {
            return
          }
          void service.reconcile().catch((error) => {
            fastify.log.error({ error }, 'Boot Maintainerr reconcile failed')
          })
        }
        if (fastify.server.listening) {
          bootReconcile()
        } else {
          fastify.server.prependOnceListener('listening', bootReconcile)
        }
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
    dependencies: ['config', 'database', 'scheduler'],
  },
)
