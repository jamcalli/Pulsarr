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
    // Use default configuration for now (could be made configurable later)
    const config: Partial<PendingWebhooksConfig> = {
      retryInterval: 20,
      maxAge: 10,
      cleanupInterval: 60,
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
      await pendingWebhooksService.initialize()
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
