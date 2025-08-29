import { ApprovalService } from '@services/approval.service.js'
import type { FastifyPluginAsync } from 'fastify'
import fp from 'fastify-plugin'

/**
 * Plugin to register the approval workflow service
 */
const approvalPlugin: FastifyPluginAsync = async (fastify) => {
  // Create the approval service
  const approvalService = new ApprovalService(fastify)

  fastify.decorate('approvalService', approvalService)

  // Register scheduled job on ready
  fastify.addHook('onReady', async () => {
    // Check if schedule exists, if not create with cron default
    const schedule = await fastify.db.getScheduleByName('approval-maintenance')
    if (!schedule) {
      // Create cron schedule for every 4 hours
      const nextRun = new Date()
      nextRun.setHours(nextRun.getHours() + 4)

      await fastify.db.createSchedule({
        name: 'approval-maintenance',
        type: 'cron',
        config: { expression: '0 */4 * * *' },
        enabled: true,
        last_run: null,
        next_run: {
          time: nextRun.toISOString(),
          status: 'pending',
          estimated: true,
        },
      })

      fastify.log.debug(
        'Created approval-maintenance schedule with cron default: every 4 hours',
      )
    }

    await fastify.scheduler.scheduleJob(
      'approval-maintenance',
      async (jobName) => {
        const currentSchedule = await fastify.db.getScheduleByName(
          'approval-maintenance',
        )
        if (!currentSchedule || !currentSchedule.enabled) {
          return
        }

        fastify.log.info(`Running scheduled job: ${jobName}`)
        await approvalService.performMaintenance()
        fastify.log.info(`Completed scheduled job: ${jobName}`)
      },
    )
  })

  // Add shutdown hook to flush pending notifications
  fastify.addHook('onClose', async () => {
    fastify.log.debug('Flushing pending approval notifications on shutdown')
    await approvalService.flushPendingNotifications()
  })
}

export default fp(approvalPlugin, {
  name: 'approval',
  dependencies: ['database', 'quota', 'scheduler'],
})

// Add type definitions
declare module 'fastify' {
  interface FastifyInstance {
    approvalService: ApprovalService
  }
}
