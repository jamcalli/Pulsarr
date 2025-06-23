import type { FastifyPluginAsync } from 'fastify'
import fp from 'fastify-plugin'
import { ApprovalService } from '@services/approval.service.js'

/**
 * Plugin to register the approval workflow service
 */
const approvalPlugin: FastifyPluginAsync = async (fastify, opts) => {
  // Create the approval service
  const approvalService = new ApprovalService(fastify)

  fastify.decorate('approvalService', approvalService)

  // Register scheduled job on ready
  fastify.addHook('onReady', async () => {
    const config = fastify.config?.approvalExpiration

    // Only create schedule if approval expiration is enabled
    if (config?.enabled) {
      const cronExpression = config.maintenanceCronExpression || '0 */4 * * *' // Default every 4 hours
      const scheduleName = 'approval-maintenance'

      // Check if schedule exists, if not create with configurable cron
      const schedule = await fastify.db.getScheduleByName(scheduleName)
      if (!schedule) {
        // Create cron schedule based on configuration (default every 4 hours)
        const nextRun = new Date()
        nextRun.setHours(nextRun.getHours() + 4) // Estimate next run for default

        await fastify.db.createSchedule({
          name: scheduleName,
          type: 'cron',
          config: { expression: cronExpression },
          enabled: true,
          last_run: null,
          next_run: {
            time: nextRun.toISOString(),
            status: 'pending',
            estimated: true,
          },
        })

        fastify.log.info(
          `Created approval-maintenance schedule with cron expression: ${cronExpression} (configurable via approvalExpiration.maintenanceCronExpression)`,
        )
      }

      await fastify.scheduler.scheduleJob(scheduleName, async (jobName) => {
        const currentSchedule = await fastify.db.getScheduleByName(scheduleName)
        if (!currentSchedule || !currentSchedule.enabled) {
          return
        }

        fastify.log.info(`Running scheduled job: ${jobName}`)
        await approvalService.performMaintenance()
      })
    } else {
      fastify.log.info(
        'Approval expiration disabled, skipping maintenance scheduler',
      )
    }
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
