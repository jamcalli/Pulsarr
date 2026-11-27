import { QuotaService } from '@services/quota.service.js'
import type { FastifyPluginAsync } from 'fastify'
import fp from 'fastify-plugin'

const quotaPlugin: FastifyPluginAsync = async (fastify, _opts) => {
  const quotaService = new QuotaService(fastify.log, fastify)

  fastify.decorate('quotaService', quotaService)

  fastify.addHook('onReady', async () => {
    await fastify.scheduler.scheduleJob(
      'quota-maintenance',
      async (jobName) => {
        quotaService.logScheduledJob('start', jobName)
        await quotaService.performAllQuotaMaintenance()
        quotaService.logScheduledJob('complete', jobName)
      },
      {
        defaultSchedule: { type: 'cron', config: { expression: '0 2 * * *' } },
      },
    )
  })
}

export default fp(quotaPlugin, {
  name: 'quota',
  dependencies: ['config', 'database', 'notifications', 'scheduler'],
})

declare module 'fastify' {
  interface FastifyInstance {
    quotaService: QuotaService
  }
}
