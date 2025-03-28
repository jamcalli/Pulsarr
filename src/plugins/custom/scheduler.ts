import fp from 'fastify-plugin'
import type { FastifyInstance } from 'fastify'
import { SchedulerService } from '@services/scheduler.service.js'

/**
 * Fastify plugin for job scheduling
 *
 * This plugin integrates the SchedulerService into Fastify, making job scheduling
 * functionality available throughout the application.
 */
declare module 'fastify' {
  interface FastifyInstance {
    /**
     * The scheduler service instance
     */
    scheduler: SchedulerService
  }
}

export default fp(
  async (fastify: FastifyInstance) => {
    // Create the scheduler service
    const scheduler = new SchedulerService(fastify.log, fastify)

    // Decorate fastify with the scheduler service only
    fastify.decorate('scheduler', scheduler)

    // Initialize jobs from database on ready
    fastify.addHook('onReady', async () => {
      await scheduler.initializeJobsFromDatabase()
    })

    // Cleanup on close
    fastify.addHook('onClose', async () => {
      scheduler.stop()
    })
  },
  {
    name: 'scheduler',
    dependencies: ['database'],
  },
)
