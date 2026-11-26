import { SchedulerService } from '@services/scheduler.service.js'
import type { FastifyInstance } from 'fastify'
import fp from 'fastify-plugin'

declare module 'fastify' {
  interface FastifyInstance {
    scheduler: SchedulerService
  }
}

export default fp(
  async (fastify: FastifyInstance) => {
    const scheduler = new SchedulerService(fastify.log, fastify)
    fastify.decorate('scheduler', scheduler)

    // onListen is the first point where every plugin's onReady has finished
    fastify.addHook('onListen', async () => {
      scheduler.runCatchUps()
      await scheduler.logReadiness()
    })

    fastify.addHook('onClose', () => {
      scheduler.stop()
    })
  },
  {
    name: 'scheduler',
    dependencies: ['database', 'progress'],
  },
)
