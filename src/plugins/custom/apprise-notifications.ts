import fp from 'fastify-plugin'
import type { FastifyInstance } from 'fastify'
import { AppriseNotificationService } from '@services/apprise-notifications.service.js'

declare module 'fastify' {
  interface FastifyInstance {
    apprise: AppriseNotificationService
  }
}

export default fp(
  async (fastify: FastifyInstance) => {
    fastify.log.info('Initializing Apprise notification plugin')

    // Create and register the Apprise notification service
    const appriseService = new AppriseNotificationService(fastify.log, fastify)
    fastify.decorate('apprise', appriseService)

    // Log if Apprise is configured
    if (appriseService.isEnabled()) {
      fastify.log.info('Apprise notification service is configured and enabled')
      fastify.log.info(
        `Using Apprise container at: ${fastify.config.appriseUrl || 'http://localhost:8000'}`,
      )
    } else {
      fastify.log.info(
        'Apprise notification service is disabled in configuration',
      )
    }

    fastify.log.info('Apprise notification plugin initialized successfully')
  },
  {
    name: 'apprise-notification-service',
    dependencies: ['config', 'database'],
  },
)
