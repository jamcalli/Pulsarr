import { ApprovalService } from '@services/approval.service.js'
import type { FastifyPluginAsync } from 'fastify'
import fp from 'fastify-plugin'

const approvalPlugin: FastifyPluginAsync = async (fastify) => {
  const approvalService = new ApprovalService(fastify.log, fastify)

  fastify.decorate('approvalService', approvalService)

  fastify.addHook('onReady', async () => {
    await fastify.scheduler.scheduleJob(
      'approval-maintenance',
      async (jobName) => {
        approvalService.logScheduledJob('start', jobName)
        await approvalService.performMaintenance()
        approvalService.logScheduledJob('complete', jobName)
      },
      {
        defaultSchedule: {
          type: 'cron',
          config: { expression: '0 */4 * * *' },
        },
      },
    )
  })

  fastify.addHook('onClose', async () => {
    fastify.log.debug('Flushing pending approval notifications on shutdown')
    await approvalService.flushPendingNotifications()
  })
}

export default fp(approvalPlugin, {
  name: 'approval',
  dependencies: [
    'config',
    'database',
    'notifications',
    'progress',
    'quota',
    'radarr-manager',
    'scheduler',
    'sonarr-manager',
  ],
})

declare module 'fastify' {
  interface FastifyInstance {
    approvalService: ApprovalService
  }
}
