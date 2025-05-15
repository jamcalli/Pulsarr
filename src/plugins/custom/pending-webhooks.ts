import fp from 'fastify-plugin'
import type { FastifyInstance } from 'fastify'
import { PendingWebhooksService } from '@services/pending-webhooks.service.js'
import type { PendingWebhooksConfig } from '@root/types/pending-webhooks.types.js'

declare module 'fastify' {
  interface FastifyInstance {
    pendingWebhooks: PendingWebhooksService
  }
}

export default fp(
  async (fastify: FastifyInstance) => {
    // Configuration values with defaults
    const config: Partial<PendingWebhooksConfig> = {
      retryInterval: fastify.config.pendingWebhookRetryInterval || 20, // seconds
      maxAge: fastify.config.pendingWebhookMaxAge || 10, // minutes
      cleanupInterval: fastify.config.pendingWebhookCleanupInterval || 60, // seconds
    }

    // Create service instance
    const pendingWebhooksService = new PendingWebhooksService(
      fastify.log.child({ plugin: 'pending-webhooks' }),
      fastify,
      config,
    )

    // Decorate the Fastify instance
    fastify.decorate('pendingWebhooks', pendingWebhooksService)

    // Initialize handler after server is ready
    fastify.addHook('onReady', async () => {
      try {
        await pendingWebhooksService.initialize()
        fastify.log.info('PendingWebhooksService initialized successfully')
      } catch (error) {
        fastify.log.error(
          { error },
          'Failed to initialize PendingWebhooksService',
        )
      }
    })
  },
  {
    name: 'pending-webhooks',
    dependencies: [
      'database',
      'scheduler',
      'discord-notification-service',
      'apprise-notification-service',
    ],
  },
)
